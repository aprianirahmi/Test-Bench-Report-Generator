package controllers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"valve_database/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// findRepairJob loads the job named by the :id route parameter. The ID is
// parsed as a number first: passing the raw string to db.First would let
// GORM treat it as an SQL condition.
func findRepairJob(db *gorm.DB, c *gin.Context, j *models.RepairJob) bool {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repair job id"})
		return false
	}
	if err := db.First(j, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "repair job not found"})
		return false
	}
	return true
}

// validateRepairJob checks the fields the form marks as mandatory. The
// frontend validates too; this keeps the API honest for other callers.
func validateRepairJob(j *models.RepairJob) string {
	j.JobName = strings.TrimSpace(j.JobName)
	j.JobNumber = strings.TrimSpace(j.JobNumber)
	j.Customer = strings.TrimSpace(j.Customer)
	j.JobDate = strings.TrimSpace(j.JobDate)
	switch {
	case j.JobName == "":
		return "job name is required"
	case j.JobNumber == "":
		return "job number is required"
	case j.JobDate == "":
		return "date is required"
	case j.Customer == "":
		return "customer is required"
	case j.MaxPressure <= 0:
		return "max pressure is required"
	}
	if _, err := time.Parse("2006-01-02", j.JobDate); err != nil {
		return "date must be in YYYY-MM-DD format"
	}
	return ""
}

func GetRepairJobs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var jobs []models.RepairJob
		if err := db.Order("job_date desc, id desc").Find(&jobs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, jobs)
	}
}

func GetRepairJobByID(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var j models.RepairJob
		if !findRepairJob(db, c, &j) {
			return
		}
		c.JSON(http.StatusOK, j)
	}
}

func CreateRepairJob(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var j models.RepairJob
		if err := c.ShouldBindJSON(&j); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		j.ID = 0
		j.ImagePath = ""
		j.DatasheetPath = ""
		if msg := validateRepairJob(&j); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		if err := db.Create(&j).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, j)
	}
}

func UpdateRepairJob(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var j models.RepairJob
		if !findRepairJob(db, c, &j) {
			return
		}

		var in models.RepairJob
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if msg := validateRepairJob(&in); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}

		// Copy editable fields only; ID, file paths and timestamps stay.
		j.JobName = in.JobName
		j.JobNumber = in.JobNumber
		j.SONumber = in.SONumber
		j.JobDate = in.JobDate
		j.Customer = in.Customer
		j.ValveType = in.ValveType
		j.MaterialNumber = in.MaterialNumber
		j.SerialNumber = in.SerialNumber
		j.Manufacturer = in.Manufacturer
		j.Size_NG = in.Size_NG
		j.Weight = in.Weight
		j.RatedFlow = in.RatedFlow
		j.MaxFlow = in.MaxFlow
		j.MaxPressure = in.MaxPressure
		j.CommandType = in.CommandType

		if err := db.Save(&j).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, j)
	}
}

// DeleteRepairJob refuses to delete a job that already has test records, so
// an official record is never lost by deleting its job.
func DeleteRepairJob(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var j models.RepairJob
		if !findRepairJob(db, c, &j) {
			return
		}

		var count int64
		if err := db.Model(&models.TestRecord{}).Where("repair_job_id = ?", j.ID).Count(&count).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{
				"error": fmt.Sprintf("repair job has %d test record(s) and cannot be deleted", count),
			})
			return
		}

		if err := db.Delete(&j).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if j.ImagePath != "" {
			os.Remove(strings.TrimPrefix(j.ImagePath, "/"))
		}
		if j.DatasheetPath != "" {
			os.Remove(strings.TrimPrefix(j.DatasheetPath, "/"))
		}
		c.JSON(http.StatusOK, gin.H{"message": "repair job deleted"})
	}
}

func UploadRepairJobImage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var j models.RepairJob
		if !findRepairJob(db, c, &j) {
			return
		}

		name, data, err := readUpload(c, "image", maxImageBytes)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ext := strings.ToLower(filepath.Ext(name))
		allowedExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
		if !allowedExts[ext] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file type not allowed, use JPG, PNG or WEBP"})
			return
		}
		mimeType := sniffBytes(data)
		if mimeType != "image/jpeg" && mimeType != "image/png" && mimeType != "image/webp" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("invalid image: the file content is %s, not JPG, PNG or WEBP", describeContent(mimeType, len(data))),
			})
			return
		}

		newFileName := fmt.Sprintf("job_%d_%d%s", j.ID, time.Now().UnixNano(), ext)
		newPath, err := saveUpload("images", newFileName, data)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
			return
		}

		oldPath := j.ImagePath
		j.ImagePath = "/images/" + newFileName
		if err := db.Save(&j).Error; err != nil {
			os.Remove(newPath)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if oldPath != "" && oldPath != j.ImagePath {
			os.Remove(strings.TrimPrefix(oldPath, "/"))
		}
		c.JSON(http.StatusOK, j)
	}
}

func UploadRepairJobDatasheet(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var j models.RepairJob
		if !findRepairJob(db, c, &j) {
			return
		}

		name, data, err := readUpload(c, "datasheet", maxDatasheetBytes)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.ToLower(filepath.Ext(name)) != ".pdf" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file must be a PDF"})
			return
		}
		mimeType := sniffBytes(data)
		if mimeType != "application/pdf" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("file is not a valid PDF: the file content is %s", describeContent(mimeType, len(data))),
			})
			return
		}

		newFileName := fmt.Sprintf("job_%d_%d.pdf", j.ID, time.Now().UnixNano())
		newPath, err := saveUpload("datasheets", newFileName, data)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
			return
		}

		oldPath := j.DatasheetPath
		j.DatasheetPath = "/datasheets/" + newFileName
		if err := db.Save(&j).Error; err != nil {
			os.Remove(newPath)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if oldPath != "" && oldPath != j.DatasheetPath {
			os.Remove(strings.TrimPrefix(oldPath, "/"))
		}
		c.JSON(http.StatusOK, j)
	}
}
