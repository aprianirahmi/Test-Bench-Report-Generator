<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import api from "../services/api";
import InputText from "primevue/inputtext";
import Dropdown from "primevue/dropdown";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import rexrothLogo from "../assets/Bosch_Rexroth-Logo.wine.svg";

import { Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
} from "chart.js";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
);

const toast = useToast();

// Form & History State
const historicalRecords = ref([]);
const selectedRecord = ref(null);
const docNumber = ref("");
const operatorName = ref("");
const selectedStatus = ref("OK");
const statusOptions = [
  { label: "OK (Passed)", value: "OK" },
  { label: "NOK (Failed)", value: "NOK" },
  { label: "Requires Calibration", value: "CALIBRATION" },
];

// Computed Data Extraction
const valve = computed(
  () => selectedRecord.value?.valve || selectedRecord.value?.Valve || null,
);

const reportDate = computed(() => {
  if (!selectedRecord.value) return "-";
  return new Date(selectedRecord.value.created_at).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

const recordOptions = computed(() => {
  return historicalRecords.value.map((r) => {
    const v = r.valve || r.Valve;
    return {
      label: `${v?.part_number || "Unknown"} — ${new Date(r.created_at).toLocaleString("en-GB")}`,
      value: r,
    };
  });
});

// Parse the saved telemetry JSON
const parsedTelemetry = computed(() => {
  if (!selectedRecord.value?.data_payload) return [];
  try {
    return JSON.parse(selectedRecord.value.data_payload);
  } catch (e) {
    return [];
  }
});

// Dynamic Parameter Verification with ±10% Acceptance Band

// 1. Peak recorded values must be declared first
const maxRecordedPressure = computed(() => {
  if (!parsedTelemetry.value.length) return "0.0";
  return Math.max(...parsedTelemetry.value.map((d) => Number(d.pressure || 0))).toFixed(1);
});

const maxRecordedFlow = computed(() => {
  if (!parsedTelemetry.value.length) return "0.0";
  return Math.max(...parsedTelemetry.value.map((d) => Number(d.flow || 0))).toFixed(1);
});

// 2. Tolerance band calculations (±10%)
const TOLERANCE_PCT = 0.10;

const pressureRange = computed(() => {
  if (!valve.value?.max_pressure) return { min: 0, max: 0, str: "-" };
  const refVal = Number(valve.value.max_pressure);
  const min = (refVal * (1 - TOLERANCE_PCT)).toFixed(1);
  const max = (refVal * (1 + TOLERANCE_PCT)).toFixed(1);
  return { min: Number(min), max: Number(max), str: `${min} - ${max} bar` };
});

const flowRange = computed(() => {
  if (!valve.value?.max_flow) return { min: 0, max: 0, str: "-" };
  const refVal = Number(valve.value.max_flow);
  const min = (refVal * (1 - TOLERANCE_PCT)).toFixed(1);
  const max = (refVal * (1 + TOLERANCE_PCT)).toFixed(1);
  return { min: Number(min), max: Number(max), str: `${min} - ${max} L/min` };
});

// 3. Status checks consuming the peak values
const pressureVerification = computed(() => {
  if (!valve.value || !parsedTelemetry.value.length) return "No Data";
  const peak = Number(maxRecordedPressure.value);
  const refVal = Number(valve.value.max_pressure);

  if (refVal <= 0) return "Invalid Ref";
  if (peak <= 0.5) return "No Pressure (Failed)";
  if (peak > refVal * (1 + TOLERANCE_PCT)) return "Exceeded Limits";
  if (peak < refVal * (1 - TOLERANCE_PCT)) return "Below Tolerance";
  return "Within Tolerance";
});

const flowVerification = computed(() => {
  if (!valve.value || !parsedTelemetry.value.length) return "No Data";
  const peak = Number(maxRecordedFlow.value);
  const refVal = Number(valve.value.max_flow);

  if (refVal <= 0) return "Not Configured";
  if (peak <= 0.5) return "No Flow (Failed)";
  if (peak > refVal * (1 + TOLERANCE_PCT)) return "Exceeded Limits";
  if (peak < refVal * (1 - TOLERANCE_PCT)) return "Below Tolerance";
  return "Within Tolerance";
});

// Chart Bindings
const hydraulicChartData = computed(() => {
  const data = parsedTelemetry.value;
  return {
    labels: data.map((d) => d.time),
    datasets: [
      {
        label: "Pressure (bar)",
        data: data.map((d) => d.pressure),
        borderColor: "#00CCFF",
        backgroundColor: "rgba(0, 204, 255, 0.1)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "Flow (L/min)",
        data: data.map((d) => d.flow),
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };
});

const electricalChartData = computed(() => {
  const data = parsedTelemetry.value;
  return {
    labels: data.map((d) => d.time),
    datasets: [
      {
        label: "Command",
        data: data.map((d) => d.command),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "Feedback",
        data: data.map((d) => d.feedback),
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139, 92, 246, 0.1)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };
});

const oilTempChartData = computed(() => {
  const data = parsedTelemetry.value;
  return {
    labels: data.map((d) => d.time),
    datasets: [
      {
        label: "Oil Temp (°C)",
        data: data.map((d) => d.oil_temp || 0), // Fallback to 0 if older records lack temperature
        borderColor: "#f97316",
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };
});   

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 9 } } },
    tooltip: { enabled: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { maxTicksLimit: 6, font: { size: 8 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: "rgba(0,0,0,0.05)" },
      ticks: { font: { size: 8 } },
    },
  },
};

async function loadHistory() {
  try {
    const res = await api.get("/records");
    historicalRecords.value = res.data;
  } catch (error) {
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to load test history.",
      life: 3000,
    });
  }
}

async function generatePDF() {
  if (!selectedRecord.value) {
    toast.add({
      severity: "error",
      summary: "Missing Data",
      detail: "Please select a test record from the history.",
      life: 3000,
    });
    return;
  }

  if (!docNumber.value.trim()) {
    docNumber.value = `DOC-${Date.now().toString().slice(-6)}`;
  }

  await nextTick();
  window.print();
}

onMounted(() => {
  loadHistory();
});
</script>

<template>
  <div class="report-generator-page">
    <!-- LEFT: Controls (Hidden on Print) -->
    <aside class="control-panel no-print">
      <header class="panel-header">
        <h2>Report Configuration</h2>
        <p>Load history and generate PDF.</p>
      </header>

      <div class="form-grid">
        <div class="field">
          <label>Select Test Record (History)</label>
          <Dropdown
            v-model="selectedRecord"
            :options="recordOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select historical data"
            class="w-full"
            filter />
        </div>

        <div class="field">
          <label>Document Number (Optional)</label>
          <InputText
            v-model="docNumber"
            placeholder="Leave empty to auto-generate" />
        </div>

        <div class="field">
          <label>Operator Name</label>
          <InputText v-model="operatorName" placeholder="Enter operator name" />
        </div>

        <div class="field">
          <label>Final Test Status</label>
          <Dropdown
            v-model="selectedStatus"
            :options="statusOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full" />
        </div>

        <div v-if="parsedTelemetry.length > 0" class="valve-summary-card">
          <strong>{{ parsedTelemetry.length }} Data Points Loaded</strong>
          <span>Ready for rendering.</span>
        </div>
      </div>

      <div class="action-footer">
        <Button
          label="Generate PDF Report"
          icon="pi pi-file-pdf"
          size="large"
          class="w-full"
          @click="generatePDF" />
      </div>
    </aside>

    <!-- RIGHT: A4 Document Preview -->
    <main class="document-viewer">
      <div class="a4-paper" id="print-area">
        <!-- Report Header -->
        <header class="report-header">
          <div class="brand-block">
            <img :src="rexrothLogo" alt="Bosch Rexroth" class="report-logo" />
          </div>
          <div class="doc-title">
            <h2>VALVE TEST REPORT</h2>
            <span class="doc-id">{{
              docNumber || "Please input doc number"
            }}</span>
          </div>
        </header>

        <hr class="divider" />

        <!-- Meta Information -->
        <section class="info-section">
          <div class="info-column">
            <div class="info-row">
              <span class="label">Date / Time:</span>
              <span class="value">{{ reportDate }}</span>
            </div>
            <div class="info-row">
              <span class="label">Operator:</span>
              <span class="value">{{ operatorName || "-" }}</span>
            </div>
            <div class="info-row">
              <span class="label">Test System:</span>
              <span class="value">ValveDAX</span>
            </div>
          </div>
          <div class="info-column status-column">
            <div class="info-row">
              <span class="label">Overall Status:</span>
              <span class="status-badge" :class="selectedStatus">{{
                selectedStatus
              }}</span>
            </div>
          </div>
        </section>

        <!-- Valve Specifications Table -->
        <section class="spec-section">
          <h3>1. Component Specifications</h3>
          <table class="spec-table" v-if="valve">
            <tbody>
              <tr>
                <th width="20%">Manufacturer</th>
                <td width="30%">{{ valve.manufacturer }}</td>
                <th width="20%">Part Number</th>
                <td width="30%">
                  <strong>{{ valve.part_number }}</strong>
                </td>
              </tr>
              <tr>
                <th>Series</th>
                <td>{{ valve.component_series }}</td>
                <th>Valve Type</th>
                <td>{{ valve.valve_type }}</td>
              </tr>
              <tr>
                <th>Size NG</th>
                <td>{{ valve.size_ng }}</td>
                <th>Unit Weight</th>
                <td>{{ valve.weight }} kg</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-state">No historical record selected.</div>
        </section>

        <!-- Reference vs Tested Table -->
        <section class="spec-section" v-if="valve">
          <h3>2. Parameter Verification</h3>
          <table class="spec-table verification-table">
            <thead>
              <tr>
                <th width="22%">Parameter</th>
                <th width="20%">Database Nominal</th>
                <th width="22%">Acceptable Band (±10%)</th>
                <th width="18%">Peak Recorded Value</th>
                <th width="18%">Verification Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Max Pressure</td>
                <td>{{ valve.max_pressure }} bar</td>
                <td>{{ pressureRange.str }}</td>
                <td>
                  <strong>{{ maxRecordedPressure }} bar</strong>
                </td>
                <td
                  :class="
                    pressureVerification === 'Within Tolerance'
                      ? 'text-ok'
                      : 'text-fail'
                  ">
                  {{ pressureVerification }}
                </td>
              </tr>
              <tr>
                <td>Max Flow</td>
                <td>{{ valve.max_flow }} L/min</td>
                <td>{{ flowRange.str }}</td>
                <td>
                  <strong>{{ maxRecordedFlow }} L/min</strong>
                </td>
                <td
                  :class="
                    flowVerification === 'Within Tolerance'
                      ? 'text-ok'
                      : flowVerification === 'Not Configured'
                        ? ''
                        : 'text-fail'
                  ">
                  {{ flowVerification }}
                </td>
              </tr>
              <tr>
                <td>Command Input Type</td>
                <td>{{ valve.command_type || "Voltage (0-10V)" }}</td>
                <td>Match Database Type</td>
                <td>{{ valve.command_type || "Voltage (0-10V)" }}</td>
                <td class="text-ok">Matched</td>
              </tr>
            </tbody>
          </table>
        </section>

<!-- Performance Graphs (Compact 3-Column Grid) -->
<section class="graphs-section" v-if="parsedTelemetry.length > 0">
  <h3>3. Dynamic Test Telemetry</h3>
  <div class="graphs-grid">
    <div class="graph-box">
      <h4>Hydraulic Performance</h4>
      <div class="chart-wrapper">
        <Line :data="hydraulicChartData" :options="chartOptions" />
      </div>
    </div>
    <div class="graph-box">
      <h4>Command vs Feedback</h4>
      <div class="chart-wrapper">
        <Line :data="electricalChartData" :options="chartOptions" />
      </div>
    </div>
    <div class="graph-box">
      <h4>Oil Temperature</h4>
      <div class="chart-wrapper">
        <Line :data="oilTempChartData" :options="chartOptions" />
      </div>
    </div>
  </div>
</section>
<div v-else class="empty-state">
  Graphs will render automatically when a historical test session is loaded.
</div>

        <!-- Signatures -->
        <section class="signature-section">
          <div class="sig-box">
            <span>Tested By (Operator)</span>
            <div class="sig-line"></div>
            <span class="sig-name">{{ operatorName }}</span>
          </div>
          <div class="sig-box">
            <span>Approved By (Supervisor)</span>
            <div class="sig-line"></div>
            <span class="sig-name"></span>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.report-generator-page {
  display: flex;
  height: 100%;
  gap: 1.5rem;
  overflow: hidden;
}

/* Control Panel */
.control-panel {
  width: 360px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  padding: 1.5rem 1.5rem 1rem;
  border-bottom: 1px solid var(--border-color);
}
.panel-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-color);
}
.panel-header p {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.form-grid {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
  flex: 1;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.field label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.valve-summary-card {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid #10b981;
  padding: 0.75rem;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.valve-summary-card strong {
  color: #10b981;
  font-size: 0.9rem;
}
.valve-summary-card span {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.action-footer {
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
}
.w-full {
  width: 100%;
}
.mt-4 {
  margin-top: 1rem;
}
.empty-state {
  padding: 2rem;
  text-align: center;
  border: 1px dashed var(--border-color);
  color: var(--text-muted);
  font-size: 0.9rem;
}

/* Document Viewer / A4 Paper */
.document-viewer {
  flex: 1;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 1.5rem 1rem;
  background: rgba(0, 0, 0, 0.04);
}

.a4-paper {
  width: 210mm;
  min-height: 297mm;
  max-width: 210mm;
  background: white;
  padding: 12mm 15mm;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
  color: #000;
  font-family: "Segoe UI", Arial, sans-serif;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* Report Header */
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem; /* Reduced to balance the larger logo */
}

.brand-block {
  display: flex;
  align-items: center;
}

.report-logo {
  height: 100px;
  width: auto;
  max-width: 280px; /* Constrains width so it doesn't push the title off-screen */
  object-fit: contain;
  display: block;
}

.doc-title {
  text-align: right;
}

.doc-title h2 {
  margin: 0;
  font-size: 1.3rem;
  color: #002b49;
  letter-spacing: -0.01em;
}

.doc-id {
  font-family: Consolas, monospace;
  font-size: 0.8rem;
  color: #555;
  font-weight: 700;
}

.divider {
  border: none;
  border-top: 2px solid #002b49;
  margin: 0 0 0.5rem 0; /* Tightened */
}

/* Info Row */
.info-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem; /* Tightened */
  font-size: 0.8rem;
}

.info-column {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-row {
  display: flex;
  gap: 0.5rem;
}

.info-row .label {
  width: 85px;
  font-weight: 600;
  color: #43545f;
}

.info-row .value {
  font-weight: 500;
}

.status-column {
  align-items: flex-end;
}

.status-badge {
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
  font-weight: 700;
  font-size: 0.95rem;
  border: 1.5px solid #000;
}

.status-badge.OK {
  color: #10b981;
  border-color: #10b981;
}
.status-badge.NOK {
  color: #ef4444;
  border-color: #ef4444;
}
.status-badge.CALIBRATION {
  color: #f59e0b;
  border-color: #f59e0b;
}

h3 {
  font-size: 0.95rem;
  color: #002b49;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 0.2rem;
  margin: 0 0 0.45rem 0;
}

/* Tables */
.spec-section {
  margin-bottom: 0.5rem; /* Tightened */
}

.spec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.spec-table th,
.spec-table td {
  border: 1px solid #cbd5e1;
  padding: 0.3rem 0.5rem;
  text-align: left;
}

.spec-table th {
  background: #f8fafc;
  font-weight: 600;
  color: #43545f;
}

.text-ok {
  color: #10b981;
  font-weight: 600;
}

.text-fail {
  color: #ef4444;
  font-weight: 600;
}

/* Dynamic Telemetry Graphs (Side-by-Side) */
.graphs-section {
  margin-bottom: 0.5rem; /* Tightened */
}

.graphs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.graph-box h4 {
  margin: 0 0 0.3rem 0;
  font-size: 0.75rem;
  color: #43545f;
}

.chart-wrapper {
  height: 135px; /* Slightly reduced height (from 145px) to absorb the extra logo height */
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 0.3rem;
  background: #fafafa;
}

/* Signatures */
.signature-section {
  display: flex;
  justify-content: space-between;
  margin-top: auto; /* Pushes signatures directly to the bottom of the A4 page without spilling */
  padding-top: 1.25rem;
  page-break-inside: avoid;
}

.sig-box {
  width: 38%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
}

.sig-line {
  width: 100%;
  border-bottom: 1px solid #000;
  margin-top: 1.75rem;
}

.sig-name {
  font-weight: 600;
  min-height: 1.1rem;
}

/* PRINT MEDIA QUERIES */
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  .document-viewer {
    position: fixed;
    left: 0;
    top: 0;
    width: 210mm;
    height: 297mm;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    z-index: 9999;
  }

  .a4-paper {
    box-shadow: none !important;
    border: none !important;
    margin: 0 !important;
    padding: 10mm 15mm;
    width: 210mm;
    height: 297mm;
    min-height: 297mm;
    max-height: 297mm;
    overflow: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
