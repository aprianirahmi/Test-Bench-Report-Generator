package models

type Settings struct {
	ID                  uint   `json:"id" gorm:"primaryKey"`
	OpcUaAddress        string `json:"opc_endpoint"`
	OpcUaUsername       string `json:"opc_username"`
	OpcUaPassword       string `json:"opc_password,omitempty"`
	OpcUaSecurityPolicy string `json:"security_policy"`
	OpcUaSecurityMode   string `json:"security_mode"`

	// Legacy: the app no longer writes an output trigger or reads an HPU status.
	// The columns stay so existing databases and saved settings keep working.
	OutputTriggerNodeID string `json:"output_trigger_node_id"`
	HpuStatusNodeID     string `json:"hpu_status_node_id"`

	// Hydraulic Transducers
	PressureNode1 string `json:"pressure_node_1"`
	PressureNode2 string `json:"pressure_node_2"`
	FlowNode1     string `json:"flow_node_1"`
	FlowNode2     string `json:"flow_node_2"`

	// Oil temperature (tank or return line), shown as "Oil Temp" on Records
	OilTempNodeID string `json:"oil_temp_node_id"`

	// Valve Actuation & Feedback Channels 1 - 6
	CommandNode1  string `json:"command_node_1"`
	FeedbackNode1 string `json:"feedback_node_1"`
	CommandNode2  string `json:"command_node_2"`
	FeedbackNode2 string `json:"feedback_node_2"`
	CommandNode3  string `json:"command_node_3"`
	FeedbackNode3 string `json:"feedback_node_3"`
	CommandNode4  string `json:"command_node_4"`
	FeedbackNode4 string `json:"feedback_node_4"`
	CommandNode5  string `json:"command_node_5"`
	FeedbackNode5 string `json:"feedback_node_5"`
	CommandNode6  string `json:"command_node_6"`
	FeedbackNode6 string `json:"feedback_node_6"`

	// User-defined extra sensors/variables, edited from the Settings page.
	// Stored as a JSON array of CustomNode so a sensor can be added, renamed
	// or removed without a schema change.
	CustomNodes string `json:"custom_nodes" gorm:"type:text"`
}

// CustomNode is one user-defined sensor. Key is assigned once ("custom_1",
// "custom_2", ...) and never changes, so recorded data stays attached to the
// sensor when its Label is renamed.
type CustomNode struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Unit   string `json:"unit"`
	NodeID string `json:"node_id"`
}