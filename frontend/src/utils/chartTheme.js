// Chart.js draws onto a <canvas> from plain JS options and cannot read CSS
// variables, so the dark-mode colours are mirrored here. Rexroth palette
// only (see style.css `.p-dark` and theme/tfiPreset.js):
//   cyan #00C8F7, ice #91F0FF, steel #A3BAC8, slate #506E81, red #ED0007
// plus mixes of these with navy #002B49.
export const DARK_CHART = {
  axis: "#A3BAC8",
  grid: "rgba(163, 186, 200, 0.14)",
  card: "#0E3753", // slice separator on the doughnut = card colour
  // Doughnut categories: the five Rexroth colours, then navy mixes
  series: ["#00C8F7", "#91F0FF", "#A3BAC8", "#506E81", "#ED0007", "#0089AD", "#6C8EA5"],
};

// Light mode: navy / slate / steel / cyan / red (+ white separators).
export const LIGHT_CHART = {
  axis: "#506E81",
  grid: "rgba(163, 186, 200, 0.45)",
  card: "#F4F7F8",
  series: ["#002B49", "#00C8F7", "#506E81", "#A3BAC8", "#ED0007", "#91F0FF", "#007AA0"],
};

