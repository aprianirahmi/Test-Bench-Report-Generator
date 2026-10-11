// Builds Chart.js data/options for one "X vs Y" chart from a list of
// samples. Used by the live Records charts, the Generate Report charts and
// the raw-data PDF, so all three draw a given X/Y pair the same way.
//
// X = Time  -> line chart over the sample timestamps
// X = other -> X-Y chart (scatter with the points joined in time order),
//              e.g. Command 1 vs Feedback 1 shows the valve characteristic.
import { TIME_KEY, TIME_OPTION, sensorColour, sensorLabel, toNumberOrNull, withAlpha } from "./sensors";

export function findSensor(catalog, key) {
  if (key === TIME_KEY) return TIME_OPTION;
  return catalog.find((s) => s.key === key) || { key, label: key, unit: "" };
}

export function chartTitle(cfg, catalog) {
  const y = findSensor(catalog, cfg.y);
  const x = findSensor(catalog, cfg.x);
  return cfg.x === TIME_KEY ? y.label : `${y.label} vs ${x.label}`;
}

export function isTimeChart(cfg) {
  return cfg.x === TIME_KEY;
}

export function buildChartData(samples, cfg, catalog, { index = 0, fill = true } = {}) {
  const ySensor = findSensor(catalog, cfg.y);
  const colour = sensorColour(cfg.y, index);
  const base = {
    label: sensorLabel(ySensor),
    borderColor: colour,
    backgroundColor: withAlpha(colour, 0.1),
    borderWidth: 2,
  };

  if (isTimeChart(cfg)) {
    return {
      labels: samples.map((s) => s.time ?? ""),
      datasets: [
        {
          ...base,
          data: samples.map((s) => toNumberOrNull(s[cfg.y])),
          fill,
          tension: 0.35,
          pointRadius: 0,
          spanGaps: true,
        },
      ],
    };
  }

  const points = [];
  for (const s of samples) {
    const x = toNumberOrNull(s[cfg.x]);
    const y = toNumberOrNull(s[cfg.y]);
    if (x !== null && y !== null) points.push({ x, y });
  }
  return {
    datasets: [
      {
        ...base,
        data: points,
        showLine: true,
        fill: false,
        tension: 0,
        pointRadius: 1.5,
        pointHoverRadius: 3,
        borderWidth: 1.5,
      },
    ],
  };
}

// theme: { axis, grid } colours. compact: smaller fonts for the A4 report.
export function buildChartOptions(cfg, catalog, theme, { compact = false, animate = false, legend = true } = {}) {
  const axisColor = theme.axis;
  const fontSize = compact ? 8 : 9;
  const xSensor = findSensor(catalog, cfg.x);
  const ySensor = findSensor(catalog, cfg.y);
  const time = isTimeChart(cfg);

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: animate ? undefined : false,
    interaction: time ? { intersect: false, mode: "index" } : { intersect: false, mode: "nearest" },
    plugins: {
      legend: {
        display: legend,
        position: "bottom",
        labels: { color: axisColor, boxWidth: 10, boxHeight: 3, usePointStyle: true, padding: 6, font: { size: fontSize } },
      },
      tooltip: { enabled: !compact },
    },
    scales: {
      x: time
        ? {
            type: "category",
            grid: { display: false },
            ticks: { color: axisColor, font: { size: fontSize }, maxTicksLimit: 6, autoSkip: true, maxRotation: 0 },
          }
        : {
            type: "linear",
            grid: { color: theme.grid },
            ticks: { color: axisColor, font: { size: fontSize }, maxTicksLimit: 6 },
            title: { display: true, text: sensorLabel(xSensor), color: axisColor, font: { size: fontSize } },
          },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: theme.grid },
        ticks: { color: axisColor, font: { size: fontSize } },
        title: time ? { display: false } : { display: true, text: sensorLabel(ySensor), color: axisColor, font: { size: fontSize } },
      },
    },
  };
}
