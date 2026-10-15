package controllers

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// Upload size limits for repair job files.
const (
	maxImageBytes     = 10 << 20 // 10 MB
	maxDatasheetBytes = 25 << 20 // 25 MB
)

// readUpload returns the name and content of an uploaded file.
//
// Two request formats are accepted:
//
//   - JSON {"filename": "...", "data": "<base64>"}: used by the frontend.
//     In the desktop app the Gin router runs inside Wails as the AssetServer
//     handler, and WebView2 does not hand the file bytes of a multipart
//     request to that handler: the part arrives empty. Plain JSON text
//     arrives intact, so the file is sent as base64.
//   - multipart/form-data with the file in `field`: kept for the plain
//     browser/HTTP server and for older clients.
func readUpload(c *gin.Context, field string, maxBytes int64) (string, []byte, error) {
	if strings.HasPrefix(c.ContentType(), "application/json") {
		var in struct {
			Filename string `json:"filename"`
			Data     string `json:"data"`
		}
		if err := c.ShouldBindJSON(&in); err != nil {
			return "", nil, fmt.Errorf("invalid upload request")
		}
		if strings.TrimSpace(in.Filename) == "" || in.Data == "" {
			return "", nil, fmt.Errorf("%s file not found", field)
		}
		raw := in.Data
		if strings.HasPrefix(raw, "data:") {
			if i := strings.Index(raw, ","); i >= 0 {
				raw = raw[i+1:]
			}
		}
		data, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			return "", nil, fmt.Errorf("the %s data could not be decoded", field)
		}
		if int64(len(data)) > maxBytes {
			return "", nil, fmt.Errorf("the %s is too large (max %d MB)", field, maxBytes>>20)
		}
		return filepath.Base(in.Filename), data, nil
	}

	fh, err := c.FormFile(field)
	if err != nil {
		return "", nil, fmt.Errorf("%s file not found", field)
	}
	if fh.Size > maxBytes {
		return "", nil, fmt.Errorf("the %s is too large (max %d MB)", field, maxBytes>>20)
	}
	f, err := fh.Open()
	if err != nil {
		return "", nil, fmt.Errorf("the %s file could not be read", field)
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxBytes+1))
	if err != nil {
		return "", nil, fmt.Errorf("the %s file could not be read", field)
	}
	return fh.Filename, data, nil
}

// sniffBytes detects the content type from the first 512 bytes, the same
// rule http.DetectContentType uses.
func sniffBytes(data []byte) string {
	n := len(data)
	if n > 512 {
		n = 512
	}
	return http.DetectContentType(data[:n])
}

// describeContent turns a sniffed content type into words for an error
// message, and says so plainly when the file arrived empty.
func describeContent(mimeType string, size int) string {
	if size == 0 {
		return "empty (0 bytes received)"
	}
	if mimeType == "" || strings.HasPrefix(mimeType, "text/plain") || mimeType == "application/octet-stream" {
		return fmt.Sprintf("not a recognised image or document (%d bytes received)", size)
	}
	if i := strings.Index(mimeType, ";"); i >= 0 {
		mimeType = mimeType[:i]
	}
	return mimeType
}

// saveUpload writes data to dir/name, creating dir when needed.
func saveUpload(dir, name string, data []byte) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, data, 0o644); err != nil {
		return "", err
	}
	return p, nil
}
