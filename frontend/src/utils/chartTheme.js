// Chart.js draws onto a <canvas> from plain JS options and cannot read CSS
// variables, so the dark-mode colours are mirrored here. Rexroth palette
// only (see style.css `.p-dark` and theme/tfiPreset.js):
//   cyan #00C8F7, ice #91F0FF, steel #A3BAC8, slate #506E81, red #ED0007
// plus mixes of these with navy #002B49.
export const DARK_CHART = {
  axis: "#A3BAC8",
  grid: "rgba(163, 186, 200, 0.14)",
  card: "#0E3753", // slice separator on the doughnut = card colour
  // Live / recorded signals. Command is drawn dashed on the report chart,
  // so command vs feedback stay distinguishable with one hue family.
  signal: {
    command: "#91F0FF",
    feedback: "#00C8F7",
    pressure: "#00C8F7",
    flow: "#91F0FF",
    temperature: "#A3BAC8",
  },
  // Doughnut categories: the five Rexroth colours, then navy mixes
  series: ["#00C8F7", "#91F0FF", "#A3BAC8", "#506E81", "#ED0007", "#0089AD", "#6C8EA5"],
};

// Light mode: navy / slate / steel / cyan / red (+ white separators).
export const LIGHT_CHART = {
  axis: "#506E81",
  grid: "rgba(163, 186, 200, 0.45)",
  card: "#F4F7F8",
  // Every live/recorded signal is the same navy in light mode (by request);
  // on the report's Command vs Feedback chart the command line is told
  // apart by its dashes instead of a different colour.
  signal: {
    command: "#002B49",
    feedback: "#002B49",
    pressure: "#002B49",
    flow: "#002B49",
    temperature: "#002B49",
  },
  series: ["#002B49", "#00C8F7", "#506E81", "#A3BAC8", "#ED0007", "#91F0FF", "#007AA0"],
};

export function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
