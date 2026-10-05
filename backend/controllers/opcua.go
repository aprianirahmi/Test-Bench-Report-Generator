package controllers

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"valve_database/models"

	"github.com/gin-gonic/gin"
	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/ua"
	"gorm.io/gorm"
)

var (
	opcClient *opcua.Client
	opcMutex  sync.Mutex
)

// ResetOpcConnection terminates the current persistent connection with a strict timeout
func ResetOpcConnection() {
	opcMutex.Lock()
	defer opcMutex.Unlock()
	if opcClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()
		_ = opcClient.Close(ctx)
		opcClient = nil
	}
}

func ensureClientCert() ([]byte, *rsa.PrivateKey, error) {
	certFile := os.Getenv("OPCUA_CERT_PATH")
	keyFile := os.Getenv("OPCUA_KEY_PATH")

	if certFile == "" {
		certFile = "./client_cert.pem"
	}
	if keyFile == "" {
		keyFile = "./client_key.pem"
	}

	certPEM, err1 := os.ReadFile(certFile)
	keyPEM, err2 := os.ReadFile(keyFile)
	if err1 == nil && err2 == nil {
		certBlock, _ := pem.Decode(certPEM)
		keyBlock, _ := pem.Decode(keyPEM)
		if certBlock != nil && keyBlock != nil {
			privKey, _ := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
			return certBlock.Bytes, privKey, nil
		}
	}

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}

	uri, _ := url.Parse("urn:TestBenchApp:GoClient")

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName:   "TestBench Go Client",
			Organization: []string{"Bosch Rexroth Test Bench"},
		},
		URIs:                  []*url.URL{uri},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageContentCommitment | x509.KeyUsageKeyEncipherment | x509.KeyUsageDataEncipherment | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}

	_ = os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes}), 0600)
	_ = os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)}), 0600)

	return derBytes, priv, nil
}

func getPersistentClient(ctx context.Context, s models.Settings) (*opcua.Client, error) {
	opcMutex.Lock()
	defer opcMutex.Unlock()

	// Use existing persistent connection if healthy
	if opcClient != nil {
		if isClientHealthy(ctx, opcClient) {
			return opcClient, nil
		}
		_ = opcClient.Close(ctx)
		opcClient = nil
	}

	if s.OpcUaAddress == "" {
		return nil, fmt.Errorf("OPC UA Address is not configured")
	}

	mode := ua.MessageSecurityModeNone
	switch s.OpcUaSecurityMode {
	case "Sign":
		mode = ua.MessageSecurityModeSign
	case "SignAndEncrypt":
		mode = ua.MessageSecurityModeSignAndEncrypt
	}

	policyURI := "http://opcfoundation.org/UA/SecurityPolicy#" + s.OpcUaSecurityPolicy
	if s.OpcUaSecurityPolicy == "None" || s.OpcUaSecurityPolicy == "" {
		policyURI = "http://opcfoundation.org/UA/SecurityPolicy#None"
	}

	endpoints, err := opcua.GetEndpoints(ctx, s.OpcUaAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to get endpoints: %w", err)
	}

	ep, err := opcua.SelectEndpoint(endpoints, policyURI, mode)
	if err != nil || ep == nil {
		return nil, fmt.Errorf("failed to find suitable endpoint for policy %s and mode %v", policyURI, mode)
	}

	ep.EndpointURL = s.OpcUaAddress

	opts := []opcua.Option{
		opcua.ApplicationURI("urn:TestBenchApp:GoClient"),
	}

	if mode != ua.MessageSecurityModeNone {
		cert, privKey, err := ensureClientCert()
		if err != nil {
			return nil, fmt.Errorf("failed to load/generate client cert: %w", err)
		}
		opts = append(opts, opcua.Certificate(cert), opcua.PrivateKey(privKey))
	}

	if s.OpcUaUsername != "" {
		opts = append(opts, opcua.SecurityFromEndpoint(ep, ua.UserTokenTypeUserName))
		opts = append(opts, opcua.AuthUsername(s.OpcUaUsername, s.OpcUaPassword))
	} else {
		opts = append(opts, opcua.SecurityFromEndpoint(ep, ua.UserTokenTypeAnonymous))
		opts = append(opts, opcua.AuthAnonymous())
	}

	client, err := opcua.NewClient(ep.EndpointURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create client: %w", err)
	}

	if err := client.Connect(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect client: %w", err)
	}

	opcClient = client
	return opcClient, nil
}

func GetOpcData(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var s models.Settings
		db.First(&s, 1)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		client, err := getPersistentClient(ctx, s)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to connect: " + err.Error()})
			return
		}

		readNode := func(nodeID string) interface{} {
			if nodeID == "" {
				return nil
			}
			id, err := ua.ParseNodeID(nodeID)
			if err != nil {
				return nil
			}
			req := &ua.ReadRequest{
				MaxAge:      2000,
				NodesToRead: []*ua.ReadValueID{{NodeID: id, AttributeID: ua.AttributeIDValue}},
			}
			res, err := client.Read(ctx, req)
			if err != nil || len(res.Results) == 0 || res.Results[0].Status != ua.StatusOK {
				return nil
			}
			return res.Results[0].Value.Value()
		}

		p1 := readNode(s.PressureNode1)
		p2 := readNode(s.PressureNode2)
		f1 := readNode(s.FlowNode1)
		f2 := readNode(s.FlowNode2)

		cmd1 := readNode(s.CommandNode1)
		fb1 := readNode(s.FeedbackNode1)
		cmd2 := readNode(s.CommandNode2)
		fb2 := readNode(s.FeedbackNode2)
		cmd3 := readNode(s.CommandNode3)
		fb3 := readNode(s.FeedbackNode3)
		cmd4 := readNode(s.CommandNode4)
		fb4 := readNode(s.FeedbackNode4)
		cmd5 := readNode(s.CommandNode5)
		fb5 := readNode(s.FeedbackNode5)
		cmd6 := readNode(s.CommandNode6)
		fb6 := readNode(s.FeedbackNode6)

		out := readNode(s.OutputTriggerNodeID)
		hpu := readNode(s.HpuStatusNodeID)

		c.JSON(http.StatusOK, gin.H{
			// Primary channel aliases
			"pressure": p1,
			"flow":     f1,
			"command":  cmd1,
			"feedback": fb1,

			// Full Transducer Mapping
			"pressure_1": p1,
			"pressure_2": p2,
			"flow_1":     f1,
			"flow_2":     f2,

			// Channels 1 - 6
			"command_1": cmd1, "feedback_1": fb1,
			"command_2": cmd2, "feedback_2": fb2,
			"command_3": cmd3, "feedback_3": fb3,
			"command_4": cmd4, "feedback_4": fb4,
			"command_5": cmd5, "feedback_5": fb5,
			"command_6": cmd6, "feedback_6": fb6,

			"output":     out,
			"hpu_active": hpu,
		})
	}
}

func writeBoolNode(db *gorm.DB, value bool) error {
	var s models.Settings
	db.First(&s, 1)

	if s.OutputTriggerNodeID == "" {
		return fmt.Errorf("output Node ID is not configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	client, err := getPersistentClient(ctx, s)
	if err != nil {
		return err
	}

	id, err := ua.ParseNodeID(s.OutputTriggerNodeID)
	if err != nil {
		return fmt.Errorf("invalid Output Node ID format")
	}

	v, _ := ua.NewVariant(value)
	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      id,
				AttributeID: ua.AttributeIDValue,
				Value: &ua.DataValue{
					EncodingMask: ua.DataValueValue,
					Value:        v,
				},
			},
		},
	}

	res, err := client.Write(ctx, req)
	if err != nil {
		return err
	}
	if len(res.Results) == 0 || res.Results[0] != ua.StatusOK {
		return fmt.Errorf("OPC UA write failed with status: %v", res.Results[0])
	}
	return nil
}

func StartOutput(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := writeBoolNode(db, true); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "active"})
	}
}

func StopOutput(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := writeBoolNode(db, false); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "stopped"})
	}
}

func GetOpcStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var s models.Settings
		db.First(&s, 1)

		status := gin.H{
			"server":   false,
			"command":  gin.H{"connected": false, "value": "-"},
			"feedback": gin.H{"connected": false, "value": "-"},
			"pressure": gin.H{"connected": false, "value": "-"},
			"flow":     gin.H{"connected": false, "value": "-"},
			"output":   gin.H{"connected": false, "value": "-"},
		}

		if s.OpcUaAddress == "" {
			c.JSON(http.StatusOK, status)
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		client, err := getPersistentClient(ctx, s)
		if err != nil {
			log.Printf("OPC UA Connection Failed: %v\n", err)
			c.JSON(http.StatusOK, status)
			return
		}

		status["server"] = true

		checkNode := func(nodeID string) gin.H {
			if nodeID == "" {
				return gin.H{"connected": false, "value": "-"}
			}
			id, err := ua.ParseNodeID(nodeID)
			if err != nil {
				return gin.H{"connected": false, "value": "-"}
			}
			req := &ua.ReadRequest{
				MaxAge:      2000,
				NodesToRead: []*ua.ReadValueID{{NodeID: id, AttributeID: ua.AttributeIDValue}},
			}
			res, err := client.Read(ctx, req)
			if err != nil || len(res.Results) == 0 || res.Results[0].Status != ua.StatusOK {
				return gin.H{"connected": false, "value": "-"}
			}
			val := "-"
			if res.Results[0].Value != nil {
				val = fmt.Sprintf("%v", res.Results[0].Value.Value())
			}
			return gin.H{"connected": true, "value": val}
		}

		status["command"] = checkNode(s.CommandNode1)
		status["feedback"] = checkNode(s.FeedbackNode1)
		status["pressure"] = checkNode(s.PressureNode1)
		status["flow"] = checkNode(s.FlowNode1)
		status["output"] = checkNode(s.OutputTriggerNodeID)

		c.JSON(http.StatusOK, status)
	}
}

func isClientHealthy(ctx context.Context, client *opcua.Client) bool {
	if client == nil {
		return false
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{
				NodeID:      ua.NewNumericNodeID(0, 2258),
				AttributeID: ua.AttributeIDValue,
			},
		},
	}

	resp, err := client.Read(ctx, req)
	if err != nil || len(resp.Results) == 0 {
		return false
	}

	return resp.Results[0].Status == ua.StatusOK
}
