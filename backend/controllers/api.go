package controllers

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"valve_database/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func Ping(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "ping"})
}

func CreateValve(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var newValve models.Valve
		if err := c.ShouldBindJSON(&newValve); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if result := db.Create(&newValve); result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		c.JSON(http.StatusCreated, newValve)
	}
}

func GetValves(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var valves []models.Valve
		if result := db.Find(&valves); result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		c.JSON(http.StatusOK, valves)
	}
}

func GetValveByID(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var v models.Valve
		result := db.First(&v, id)
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "valve tidak ditemukan"})
			return
		} else if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
			return
		}
		c.JSON(http.StatusOK, v)
	}
}

func UpdateValve(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var valve models.Valve
		if result := db.First(&valve, id); result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "valve tidak ditemukan"})
			return
		}

		var updatedValve models.Valve
		if err := c.ShouldBindJSON(&updatedValve); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		valve.Manufacturer = updatedValve.Manufacturer
		valve.PartNumber = updatedValve.PartNumber
		valve.ComponentSeries = updatedValve.ComponentSeries
		valve.ValveType = updatedValve.ValveType
		valve.Size_NG = updatedValve.Size_NG
		valve.Weight = updatedValve.Weight
		valve.RatedFlow = updatedValve.RatedFlow
		valve.MaxFlow = updatedValve.MaxFlow
		valve.CommandValue = updatedValve.CommandValue
		valve.CommandType = updatedValve.CommandType
		valve.MaxPressure = updatedValve.MaxPressure

		db.Save(&valve)
		c.JSON(http.StatusOK, valve)
	}
}

func DeleteValve(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var valve models.Valve
		if result := db.First(&valve, id); result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "valve tidak ditemukan"})
			return
		}

		if valve.ImagePath != "" {
			os.Remove(strings.TrimPrefix(valve.ImagePath, "/"))
		}
		if valve.DatasheetPath != "" {
			os.Remove(strings.TrimPrefix(valve.DatasheetPath, "/"))
		}

		db.Delete(&valve)
		c.JSON(http.StatusOK, gin.H{"message": "valve berhasil dihapus"})
	}
}

func UploadValveImage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var valve models.Valve
		if result := db.First(&valve, id); result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "valve tidak ditemukan"})
			return
		}

		file, err := c.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file gambar tidak ditemukan"})
			return
		}

		ext := strings.ToLower(filepath.Ext(file.Filename))
		allowedExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

		if !allowedExts[ext] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "format file tidak diizinkan. Gunakan JPG, PNG, atau WEBP."})
			return
		}

		mimeType, err := detectMimeType(file)
		if err != nil || (mimeType != "image/jpeg" && mimeType != "image/png" && mimeType != "image/webp") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "MIME type tidak valid"})
			return
		}

		if valve.ImagePath != "" {
			os.Remove(strings.TrimPrefix(valve.ImagePath, "/"))
		}

		newFileName := fmt.Sprintf("%s_%d%s", id, time.Now().Unix(), ext)
		savePath := filepath.Join("images", newFileName)

		if err := c.SaveUploadedFile(file, savePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan file"})
			return
		}

		valve.ImagePath = "/images/" + newFileName
		db.Save(&valve)
		c.JSON(http.StatusOK, valve)
	}
}

func UploadValveDatasheet(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var valve models.Valve
		if result := db.First(&valve, id); result.Error != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "valve tidak ditemukan"})
			return
		}

		file, err := c.FormFile("datasheet")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file datasheet tidak ditemukan"})
			return
		}

		ext := strings.ToLower(filepath.Ext(file.Filename))
		if ext != ".pdf" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file harus berformat PDF"})
			return
		}

		mimeType, err := detectMimeType(file)
		if err != nil || mimeType != "application/pdf" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file bukan PDF valid"})
			return
		}

		if valve.DatasheetPath != "" {
			os.Remove(strings.TrimPrefix(valve.DatasheetPath, "/"))
		}

		newFileName := fmt.Sprintf("%s_%d%s", id, time.Now().Unix(), ext)
		savePath := filepath.Join("datasheets", newFileName)

		if err := c.SaveUploadedFile(file, savePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "gagal menyimpan file"})
			return
		}

		valve.DatasheetPath = "/datasheets/" + newFileName
		db.Save(&valve)
		c.JSON(http.StatusOK, valve)
	}
}

func detectMimeType(fileHeader *multipart.FileHeader) (string, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()

	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", err
	}

	// Sniff only the bytes that were read, so a short file is not judged by
	// trailing zeros. An empty file comes back as text/plain and is rejected.
	return http.DetectContentType(buffer[:n]), nil
}

// SaveTestRecord stores one recorded session. New clients send either
// test_mode "repair_job" with repair_job_id, or test_mode "manual" with no
// reference. A bare valve_id (older clients) is still accepted.
func SaveTestRecord(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var record models.TestRecord
		if err := c.ShouldBindJSON(&record); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		record.ID = 0
		record.Valve = nil
		record.RepairJob = nil
		record.RecordedBy = c.GetString("username")
		// Report fields are written by SaveRecordReport only.
		record.ReportStatus = ""
		record.ReportOperator = ""
		record.ReportDocNumber = ""
		record.ReportedBy = ""
		record.ReportedAt = nil

		switch record.TestMode {
		case models.TestModeRepairJob:
			if record.RepairJobID == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "repair_job_id is required for a repair job test"})
				return
			}
			var job models.RepairJob
			if err := db.First(&job, *record.RepairJobID).Error; err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusBadRequest, gin.H{"error": "repair job not found"})
				return
			} else if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			record.ValveID = nil
		case models.TestModeManual:
			record.ValveID = nil
			record.RepairJobID = nil
		case "":
			// Older clients: a record linked to a Valve List entry.
			if record.ValveID == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "test_mode is required"})
				return
			}
			var v models.Valve
			if err := db.First(&v, *record.ValveID).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "valve not found"})
				return
			}
			record.RepairJobID = nil
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown test_mode"})
			return
		}

		if strings.TrimSpace(record.DataPayload) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data_payload is empty"})
			return
		}

		if err := db.Create(&record).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, record)
	}
}

func GetTestRecords(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var records []models.TestRecord
		if err := db.Preload("Valve").Preload("RepairJob").Order("created_at desc").Find(&records).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, records)
	}
}
