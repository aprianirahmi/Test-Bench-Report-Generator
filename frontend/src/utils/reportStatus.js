// Final test status chosen when a report is generated. There is no default:
// the operator has to choose one.
export const STATUS_OPTIONS = [
  { label: "OK (Passed)", value: "OK" },
  { label: "NOK (Failed)", value: "NOK" },
  { label: "Requires Calibration", value: "CALIBRATION" },
];

export function statusLabel(value) {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label || "";
}
