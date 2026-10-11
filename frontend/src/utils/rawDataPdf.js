// Raw-data PDF for one recorded session: session info, the selected charts
// drawn over the whole session, and a table of every sample. Built in the
// browser with jsPDF so it downloads directly (no print dialog).
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  Chart,
  LineController,
  ScatterController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Legend,
  Tooltip,
} from "chart.js";
import { buildChartData, buildChartOptions, chartTitle, isTimeChart } from "./chartBuild";
import { LIGHT_CHART } from "./chartTheme";
import { sensorLabel, toNumberOrNull } from "./sensors";
import { formatDate, formatDateTime, sessionFileName } from "./format";

Chart.register(LineController, ScatterController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Tooltip);

// Draws one chart on an off-screen canvas and returns it as a PNG data URL.
function renderChartImage(samples, cfg, catalog, index, widthPx, heightPx) {
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const options = buildChartOptions(cfg, catalog, LIGHT_CHART, { compact: false });
  options.responsive = false;
  options.devicePixelRatio = 1;
  const whiteBackground = {
    id: "whiteBackground",
    beforeDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    },
  };
  const chart = new Chart(canvas.getContext("2d"), {
    type: isTimeChart(cfg) ? "line" : "scatter",
    data: buildChartData(samples, cfg, catalog, { index }),
    options,
    plugins: [whiteBackground],
  });
  const url = canvas.toDataURL("image/png");
  chart.destroy();
  return url;
}


/**
 * @param {object} p
 * @param {Array} p.samples   recorded samples
 * @param {Array} p.charts    [{x, y}] chart layout shown when recording
 * @param {Array} p.catalog   sensor catalogue (fixed + custom)
 * @param {object|null} p.job repair job, null for manual testing
 * @param {Date} p.startedAt  recording start time
 */
export function downloadRawDataPdf({ samples, charts, catalog, job, startedAt }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 43, 73);
  doc.text("RAW TEST DATA", margin, margin + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 110, 129);
  doc.text("ValveDAX Test Workspace", margin, margin + 9);
  doc.text(`Generated ${formatDateTime(new Date())}`, pageW - margin, margin + 4, { align: "right" });

  // Session info, four columns of label/value pairs
  const first = samples[0]?.ts ? new Date(samples[0].ts) : startedAt;
  const last = samples[samples.length - 1]?.ts ? new Date(samples[samples.length - 1].ts) : null;
  const durationS = first && last ? Math.round((last - first) / 1000) : samples.length;
  const info = job
    ? [
        ["Test Mode", "Repair Job", "Job Number", job.job_number || "-"],
        ["Job Name", job.job_name || "-", "SO Number", job.so_number || "-"],
        ["Customer", job.customer || "-", "Job Date", formatDate(job.job_date)],
        ["Valve Type", job.valve_type || "-", "Serial Number", job.serial_number || "-"],
        ["Material Number", job.material_number || "-", "Manufacturer", job.manufacturer || "-"],
        ["Recorded At", formatDateTime(first), "Duration / Samples", `${durationS} s / ${samples.length}`],
      ]
    : [
        ["Test Mode", "Manual Testing (no reference)", "Recorded At", formatDateTime(first)],
        ["Duration", `${durationS} s`, "Samples", String(samples.length)],
      ];

  autoTable(doc, {
    startY: margin + 13,
    body: info,
    theme: "plain",
    styles: { fontSize: 7.5, cellPadding: 0.9, textColor: [20, 30, 40] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [80, 110, 129], cellWidth: 32 },
      1: { cellWidth: 100 },
      2: { fontStyle: "bold", textColor: [80, 110, 129], cellWidth: 32 },
    },
    margin: { left: margin, right: margin },
  });

  // Charts, 2 x 2 grid below the info block
  let y = doc.lastAutoTable.finalY + 4;
  const n = Math.min(charts.length, 4);
  if (n > 0) {
    const cols = n === 1 ? 1 : 2;
    const rows = Math.ceil(n / cols);
    const gap = 5;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const avail = pageH - margin - y - 4;
    const cellH = Math.min((avail - gap * (rows - 1)) / rows, cols === 1 ? 110 : 62);
    charts.slice(0, n).forEach((cfg, i) => {
      const cx = margin + (i % cols) * (cellW + gap);
      const cy = y + Math.floor(i / cols) * (cellH + gap);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 43, 73);
      doc.text(`Chart ${i + 1}: ${chartTitle(cfg, catalog)}`, cx, cy + 3);
      const img = renderChartImage(samples, cfg, catalog, i, Math.round(cellW * 6), Math.round((cellH - 5) * 6));
      doc.addImage(img, "PNG", cx, cy + 4.5, cellW, cellH - 5);
    });
  }

  // Data table: every sensor that has at least one value in this session
  const cols = catalog.filter((s) => samples.some((r) => toNumberOrNull(r[s.key]) !== null));
  doc.addPage();
  autoTable(doc, {
    startY: margin,
    head: [["#", "Time", ...cols.map((s) => sensorLabel(s))]],
    body: samples.map((r, i) => [
      i + 1,
      r.time ?? "",
      ...cols.map((s) => {
        const v = toNumberOrNull(r[s.key]);
        return v === null ? "" : Number(v.toFixed(3)).toString();
      }),
    ]),
    theme: "grid",
    styles: { fontSize: cols.length > 18 ? 5.5 : 6.5, cellPadding: 0.6, halign: "right", overflow: "linebreak" },
    headStyles: { fillColor: [0, 43, 73], textColor: 255, halign: "center", valign: "middle" },
    columnStyles: { 0: { halign: "right", cellWidth: 8 }, 1: { halign: "left", cellWidth: 14 } },
    alternateRowStyles: { fillColor: [241, 245, 248] },
    margin: { left: margin, right: margin, top: margin, bottom: margin },
  });

  // Footer on every page
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 140);
    const ref = job ? `${job.job_number || ""} ${job.job_name || ""}`.trim() : "Manual Testing";
    doc.text(ref, margin, pageH - 5);
    doc.text(`Page ${p} of ${total}`, pageW - margin, pageH - 5, { align: "right" });
  }

  const fileName = sessionFileName(first || new Date(), job, "pdf");
  doc.save(fileName);
  return fileName;
}
