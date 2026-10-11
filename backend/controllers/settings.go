package controllers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"valve_database/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var customKeyPattern = regexp.MustCompile(`^custom_[0-9]{1,4}$`)

// parseCustomNodes decodes Settings.CustomNodes. Entries with an invalid or
// duplicate key are dropped, so a bad value can never reach the OPC UA reader
// or collide with the fixed telemetry keys (pressure_1, command_3, ...).
func parseCustomNodes(raw string) []models.CustomNode {
	out := []models.CustomNode{}
	if strings.TrimSpace(raw) == "" {
		return out
	}
	var nodes []models.CustomNode
	if err := json.Unmarshal([]byte(raw), &nodes); err != nil {
		return out
	}
	seen := map[string]bool{}
	for _, n := range nodes {
		n.Key = strings.TrimSpace(n.Key)
		if !customKeyPattern.MatchString(n.Key) || seen[n.Key] {
			continue
		}
		seen[n.Key] = true
		n.Label = strings.TrimSpace(n.Label)
		if n.Label == "" {
			n.Label = n.Key
		}
		n.Unit = strings.TrimSpace(n.Unit)
		n.NodeID = strings.TrimSpace(n.NodeID)
		out = append(out, n)
	}
	return out
}

func GetSettings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var s models.Settings
		db.FirstOrCreate(&s, models.Settings{ID: 1})
		c.JSON(http.StatusOK, s)
	}
}

func UpdateSettings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var existing models.Settings
		if err := db.FirstOrCreate(&existing, models.Settings{ID: 1}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings: " + err.Error()})
			return
		}

		var input models.Settings
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Keep existing password if empty
		if input.OpcUaPassword == "" {
			input.OpcUaPassword = existing.OpcUaPassword
		}

		// Custom sensor list: keep the stored one when the client does not send
		// the field (an older Settings page would otherwise erase it), reject
		// invalid JSON, and store a normalised copy.
		if strings.TrimSpace(input.CustomNodes) == "" {
			input.CustomNodes = existing.CustomNodes
		} else {
			var probe []models.CustomNode
			if err := json.Unmarshal([]byte(input.CustomNodes), &probe); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "custom_nodes must be a JSON array: " + err.Error()})
				return
			}
			cleaned, _ := json.Marshal(parseCustomNodes(input.CustomNodes))
			input.CustomNodes = string(cleaned)
		}

		input.ID = 1
		if err := db.Save(&input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings: " + err.Error()})
			return
		}

		ResetOpcConnection()
		c.JSON(http.StatusOK, input)
	}
}

// GetSensorCatalog lists the user-defined sensors (key, label, unit) for any
// logged-in user. The Records and Report pages need the labels, but the full
// settings endpoint is admin-only, so this exposes only what they need.
func GetSensorCatalog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var s models.Settings
		db.First(&s, 1)
		type entry struct {
			Key   string `json:"key"`
			Label string `json:"label"`
			Unit  string `json:"unit"`
		}
		out := []entry{}
		for _, n := range parseCustomNodes(s.CustomNodes) {
			out = append(out, entry{Key: n.Key, Label: n.Label, Unit: n.Unit})
		}
		c.JSON(http.StatusOK, gin.H{"custom": out})
	}
}
