// Small display helpers shared across views.

const pad = (n) => String(n).padStart(2, "0");

// "2026-10-11" or a Date/ISO timestamp -> "11.10.2026"
export function formatDate(value) {
  if (!value) return "-";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

// Date/ISO timestamp -> "11.10.2026 14:05:09"
export function formatDateTime(value) {
  if (!value) return "-";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return `${formatDate(dt)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

// Date -> "2026-10-11" (local date, no timezone shift)
export function toIsoDate(dt) {
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// "2026-10-11" -> Date at local midnight
export function fromIsoDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Upload paths are relative ("/images/x.png"). In development the API runs
// on another origin, so prefix VITE_API_URL when it is set.
export function assetUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base = import.meta.env.VITE_EMBEDDED === "true" ? "" : import.meta.env.VITE_API_URL || "";
  return `${base}${path}`;
}

// File name for an exported session, e.g. 261011_RawData_RJ-2610-014_140509.pdf
export function sessionFileName(startedAt, job, ext) {
  const d = startedAt instanceof Date ? startedAt : new Date();
  const yymmdd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hhmmss = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const ref = job ? safe(job.job_number) || "Job" : "Manual";
  return `${yymmdd}_RawData_${ref}_${hhmmss}.${ext}`;
}

// Label used in dropdowns for one repair job.
export function repairJobLabel(j) {
  if (!j) return "";
  const parts = [j.job_number, j.job_name, j.customer].filter(Boolean);
  const sn = j.serial_number ? ` · SN ${j.serial_number}` : "";
  return `${parts.join(" — ")}${sn}`;
}
