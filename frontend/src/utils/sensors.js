// Sensor catalogue shared by Records (live charts, raw PDF) and Generate
// Report. Every key here is a field of /api/opcua/data and of each recorded
// sample. Custom sensors (custom_1, custom_2, ...) are defined in Settings and
// fetched from /api/opcua/sensors at runtime.
//
// Feedback 7/8 are intentionally absent: Command 7/8 are typed in manually by
// the operator and have no feedback signal.

export const TIME_KEY = "time";

export const BASE_SENSORS = [
  { key: "pressure_1", label: "Pressure 1", unit: "bar", group: "Hydraulic" },
  { key: "pressure_2", label: "Pressure 2", unit: "bar", group: "Hydraulic" },
  { key: "flow_1", label: "Flow 1", unit: "L/min", group: "Hydraulic" },
  { key: "flow_2", label: "Flow 2", unit: "L/min", group: "Hydraulic" },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `command_${n}`, label: `Command ${n}`, unit: "", group: "Command" })),
  { key: "command_7", label: "Manual Command 7", unit: "mA", group: "Command", manual: true },
  { key: "command_8", label: "Manual Command 8", unit: "mA", group: "Command", manual: true },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `feedback_${n}`, label: `Feedback ${n}`, unit: "", group: "Feedback" })),
];

// Generic fields written by versions before the axis picker. They hold
// whichever channel was selected in the old Pressure/Flow/Channel dropdowns.
export const LEGACY_SENSORS = [
  { key: "pressure", label: "Pressure (recorded selection)", unit: "bar", group: "Recorded selection" },
  { key: "flow", label: "Flow (recorded selection)", unit: "L/min", group: "Recorded selection" },
  { key: "command", label: "Command (recorded selection)", unit: "", group: "Recorded selection" },
  { key: "feedback", label: "Feedback (recorded selection)", unit: "", group: "Recorded selection" },
];

export const TIME_OPTION = { key: TIME_KEY, label: "Time", unit: "", group: "Time" };

// Fixed per-signal line colours (same family as the original design).
const PALETTE = ["#00CCFF", "#10b981", "#f59e0b", "#8b5cf6", "#f97316", "#ec4899", "#14b8a6", "#64748b"];
const FIXED_COLOURS = {
  pressure_1: "#00CCFF",
  pressure_2: "#0284c7",
  flow_1: "#10b981",
  flow_2: "#059669",
  pressure: "#00CCFF",
  flow: "#10b981",
  command: "#f59e0b",
  feedback: "#8b5cf6",
};

export function sensorColour(key, index = 0) {
  if (FIXED_COLOURS[key]) return FIXED_COLOURS[key];
  if (key.startsWith("command_")) return "#f59e0b";
  if (key.startsWith("feedback_")) return "#8b5cf6";
  return PALETTE[index % PALETTE.length];
}

export function withAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function normaliseCustom(list) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && /^custom_\d+$/.test(c.key))
    .map((c) => ({ key: c.key, label: c.label || c.key, unit: c.unit || "", group: "Custom" }));
}

// Full catalogue for live use: fixed sensors plus current custom ones.
export function liveCatalog(custom = []) {
  return [...BASE_SENSORS, ...normaliseCustom(custom)];
}

export function sensorLabel(s) {
  if (!s) return "-";
  return s.unit ? `${s.label} (${s.unit})` : s.label;
}

// Dropdown options. X also offers Time; Y does not.
export function axisOptions(catalog, { includeTime = false } = {}) {
  const opts = catalog.map((s) => ({ label: sensorLabel(s), value: s.key, group: s.group }));
  return includeTime ? [{ label: "Time", value: TIME_KEY, group: "Time" }, ...opts] : opts;
}

export const DEFAULT_CHARTS = [
  { x: TIME_KEY, y: "pressure_1" },
  { x: TIME_KEY, y: "flow_1" },
  { x: "command_1", y: "feedback_1" },
  { x: "command_1", y: "flow_1" },
];

export function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
