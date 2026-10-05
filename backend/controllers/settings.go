package controllers

import (
	"net/http"
	"valve_database/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

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

		input.ID = 1
		if err := db.Save(&input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings: " + err.Error()})
			return
		}

		ResetOpcConnection()
		c.JSON(http.StatusOK, input)
	}
}