package models

import "time"

type Valve struct {
	ID              uint    `json:"id" gorm:"primarykey"`
	Manufacturer    string  `json:"manufacturer"`
	PartNumber      string  `json:"part_number" gorm:"unique;not null"`
	ComponentSeries string  `json:"component_series" gorm:"not null"`
	ValveType       string  `json:"valve_type" gorm:"not null"`
	Size_NG         int     `json:"size_ng"`
	Weight          float64 `json:"weight"`
	RatedFlow       float64 `json:"rated_flow"`
	MaxFlow         float64 `json:"max_flow"`
	CommandValue    float64 `json:"command_value"`
	CommandType     string  `json:"command_type"`
	MaxPressure     float64 `json:"max_pressure"`
	ImagePath       string  `json:"image_path"`
	DatasheetPath   string  `json:"datasheet_path"`
}

// RepairJob is one valve brought in for repair and testing. Job Number is
// deliberately not unique: one job can cover several valves, told apart by
// Serial Number.
type RepairJob struct {
	ID             uint      `json:"id" gorm:"primarykey"`
	JobName        string    `json:"job_name" gorm:"not null"`
	JobNumber      string    `json:"job_number" gorm:"index;not null"`
	SONumber       string    `json:"so_number"`
	JobDate        string    `json:"job_date"` // YYYY-MM-DD
	Customer       string    `json:"customer"`
	ValveType      string    `json:"valve_type"`
	MaterialNumber string    `json:"material_number"`
	SerialNumber   string    `json:"serial_number"`
	Manufacturer   string    `json:"manufacturer"`
	Size_NG        int       `json:"size_ng"`
	Weight         float64   `json:"weight"`
	RatedFlow      float64   `json:"rated_flow"`
	MaxFlow        float64   `json:"max_flow"`
	MaxPressure    float64   `json:"max_pressure"`
	CommandType    string    `json:"command_type"`
	ImagePath      string    `json:"image_path"`
	DatasheetPath  string    `json:"datasheet_path"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// Test modes stored on TestRecord.TestMode. Records saved before repair jobs
// existed have an empty TestMode and a ValveID.
const (
	TestModeRepairJob = "repair_job"
	TestModeManual    = "manual"
)

// TestRecord is one recorded session. A record belongs to a repair job, to
// nothing (manual testing), or, for records saved by older versions, to a
// valve. Meta holds a JSON object describing the session (chart layout and
// sensor labels at recording time).
type TestRecord struct {
	ID          uint       `json:"id" gorm:"primarykey"`
	ValveID     *uint      `json:"valve_id"`
	Valve       *Valve     `json:"valve,omitempty" gorm:"foreignKey:ValveID;constraint:OnDelete:CASCADE;"`
	RepairJobID *uint      `json:"repair_job_id" gorm:"index"`
	RepairJob   *RepairJob `json:"repair_job,omitempty" gorm:"foreignKey:RepairJobID;constraint:OnDelete:RESTRICT;"`
	TestMode    string     `json:"test_mode"`
	CreatedAt   time.Time  `json:"created_at"`
	DataPayload string     `json:"data_payload"`
	Meta        string     `json:"meta"`
}
