package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"valve_database/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Report statuses an operator can choose. The report has no default: the
// operator must pick one.
var validReportStatuses = map[string]bool{
	"OK":          true,
	"NOK":         true,
	"CALIBRATION": true,
}

// currentUserID reads the user id the JWT middleware stored. It comes from
// the token's JSON claims, so it is normally a float64, not a uint.
func currentUserID(c *gin.Context) uint {
	v, ok := c.Get("user_id")
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return uint(n)
	case uint:
		return n
	case int:
		return uint(n)
	}
	return 0
}

func parseRecordID(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid record id"})
		return 0, false
	}
	return uint(id), true
}

// DeleteTestRecord removes one test record for good (admin only, see the
// route). The record's recorded data goes with it; the repair job, the valve
// and the job's images are not touched.
func DeleteTestRecord(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := parseRecordID(c)
		if !ok {
			return
		}
		res := db.Delete(&models.TestRecord{}, id)
		if res.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": res.Error.Error()})
			return
		}
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "record deleted"})
	}
}

type reportInput struct {
	Status    string `json:"status"`
	Operator  string `json:"operator"`
	DocNumber string `json:"doc_number"`
}

// SaveRecordReport stores the outcome of a report on its record: final
// status, operator name and a document number that stays the same every time
// the report is opened or printed again. Any logged-in user can do this.
func SaveRecordReport(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := parseRecordID(c)
		if !ok {
			return
		}
		var in reportInput
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
		in.Operator = strings.TrimSpace(in.Operator)
		in.DocNumber = strings.TrimSpace(in.DocNumber)
		if !validReportStatuses[in.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "status must be OK, NOK or CALIBRATION"})
			return
		}
		if in.Operator == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "operator name is required"})
			return
		}

		var record models.TestRecord
		if err := db.First(&record, id).Error; err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
			return
		} else if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Keep an existing number unless the user typed another one. A new
		// number is built from the record's own date and id, so it is unique
		// and the same on every machine.
		doc := in.DocNumber
		if doc == "" {
			doc = record.ReportDocNumber
		}
		if doc == "" {
			doc = fmt.Sprintf("TR-%s-%04d", record.CreatedAt.Format("060102"), record.ID)
		}

		now := time.Now()
		updates := map[string]interface{}{
			"report_status":     in.Status,
			"report_operator":   in.Operator,
			"report_doc_number": doc,
			"reported_by":       c.GetString("username"),
			"reported_at":       now,
		}
		if err := db.Model(&models.TestRecord{}).Where("id = ?", record.ID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		record.ReportStatus = in.Status
		record.ReportOperator = in.Operator
		record.ReportDocNumber = doc
		record.ReportedBy = c.GetString("username")
		record.ReportedAt = &now
		c.JSON(http.StatusOK, record)
	}
}

type draftInput struct {
	Payload string `json:"payload"`
}

// GetRecordingDraft returns the unsaved recording of the logged-in user, if
// the app was closed (or crashed) before it was saved as a test record.
func GetRecordingDraft(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var draft models.RecordingDraft
		err := db.Where("user_id = ?", currentUserID(c)).First(&draft).Error
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{"exists": false})
			return
		} else if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"exists": true, "payload": draft.Payload, "updated_at": draft.UpdatedAt})
	}
}

// SaveRecordingDraft replaces the logged-in user's draft. There is one draft
// per user; the recorder sends the whole session every few seconds.
func SaveRecordingDraft(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in draftInput
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(in.Payload) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "payload is empty"})
			return
		}
		userID := currentUserID(c)
		var draft models.RecordingDraft
		err := db.Where("user_id = ?", userID).First(&draft).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		draft.UserID = userID
		draft.Payload = in.Payload
		draft.UpdatedAt = time.Now()
		if err := db.Save(&draft).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"updated_at": draft.UpdatedAt})
	}
}

// DeleteRecordingDraft discards the logged-in user's draft: after the session
// was saved as a record, or the user chose to throw it away.
func DeleteRecordingDraft(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := db.Where("user_id = ?", currentUserID(c)).Delete(&models.RecordingDraft{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "draft discarded"})
	}
}
