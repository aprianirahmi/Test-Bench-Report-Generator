// Sensor catalogue shared by Records (live charts, raw PDF) and Generate
// Report. Every key here is a field of /api/opcua/data and of each recorded
// sample. Custom sensors (custom_1, custom_2, ...) are defined in Settings and
// fetched from /api/opcua/sensors at runtime. Any other numeric field that
// shows up in /api/opcua/data is picked up automatically (discoverSensors).
//
// Feedback 7/8 are intentionally absent: Command 7/8 are typed in manually by
// the operator and have no feedback signal.

export const TIME_KEY = "time";

export const BASE_SENSORS = [
  { key: "pressure_1", label: "Pressure 1", unit: "bar", group: "Hydraulic" },
  { key: "pressure_2", label: "Pressure 2", unit: "bar", group: "Hydraulic" },
  { key: "flow_1", label: "Flow 1", unit: "L/min", group: "Hydraulic" },
  { key: "flow_2", label: "Flow 2", unit: "L/min", group: "Hydraulic" },
  { key: "oil_temp", label: "Oil Temperature", unit: "\u00b0C", group: "Hydraulic" },
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
  oil_temp: "#ef4444",
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

// Full catalogue for live use: fixed sensors, current custom ones, then any
// discovered extras. The first entry for a key wins, so a discovered key gets
// its proper name as soon as the Settings catalogue knows it.
export function liveCatalog(custom = [], discovered = []) {
  const out = [];
  const seen = new Set();
  for (const s of [...BASE_SENSORS, ...normaliseCustom(custom), ...discovered]) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  return out;
}

// Fields of /api/opcua/data (or of a sample) that are not sensors: sample
// time, HPU/output state, and the old aliases of Pressure 1 / Flow 1 /
// Command 1 / Feedback 1.
export const NON_SENSOR_KEYS = new Set(["time", "ts", "error", "output", "hpu_active", "pressure", "flow", "command", "feedback"]);

// "tank_level_2" -> "Tank Level 2"
export function prettifyKey(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Sensors present in the data but missing from the catalogue. Numbers and
// booleans count; custom_N counts even while its node returns no value.
export function discoverSensors(rows, known, exclude = NON_SENSOR_KEYS) {
  const have = new Set(known.map((s) => s.key));
  const out = [];
  for (const r of rows) {
    for (const [k, v] of Object.entries(r || {})) {
      if (have.has(k) || exclude.has(k)) continue;
      const isCustom = /^custom_\d+$/.test(k);
      if (typeof v === "number" || typeof v === "boolean" || (isCustom && v === null)) {
        have.add(k);
        out.push({ key: k, label: prettifyKey(k), unit: "", group: isCustom ? "Custom" : "Other" });
      }
    }
  }
  return out;
}

export function sensorLabel(s) {
  if (!s) return "-";
  return s.unit ? `${s.label} (${s.unit})` : s.label;
}

// Dropdown options. X also offers Time; Y does not.
// A custom sensor named like a fixed one (e.g. an "Oil Temperature" custom
// sensor next to the fixed Oil Temperature channel) gets its key appended so
// the two can be told apart.
export function axisOptions(catalog, { includeTime = false } = {}) {
  const fixed = new Set(BASE_SENSORS.map((s) => s.key));
  const count = {};
  for (const s of catalog) count[s.label] = (count[s.label] || 0) + 1;
  const opts = catalog.map((s) => {
    const dup = count[s.label] > 1 && !fixed.has(s.key);
    const named = dup ? { ...s, label: `${s.label} \u00b7 ${prettifyKey(s.key)}` } : s;
    return { label: sensorLabel(named), value: s.key, group: s.group };
  });
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
