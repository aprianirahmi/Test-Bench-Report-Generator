<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue";
import api, { fetchSensorCatalog } from "../services/api";
import InputText from "primevue/inputtext";
import Dropdown from "primevue/dropdown";
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import rexrothLogo from "../assets/Bosch_Rexroth-Logo.wine.svg";
import { BASE_SENSORS, LEGACY_SENSORS, TIME_KEY, axisOptions, normaliseCustom, sensorLabel, toNumberOrNull } from "../utils/sensors";
import { buildChartData, buildChartOptions, chartTitle, findSensor, isTimeChart } from "../utils/chartBuild";
import { LIGHT_CHART } from "../utils/chartTheme";
import { formatDate, formatDateTime, repairJobLabel } from "../utils/format";

import { Line, Scatter } from "vue-chartjs";
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

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, Filler);

const toast = useToast();

// --- Form & history state ---
const historicalRecords = ref([]);
const repairJobs = ref([]);
const selectedSource = ref(null); // repair job id, MANUAL or LEGACY
const selectedRecord = ref(null);
const docNumber = ref("");
const operatorName = ref("");
const selectedStatus = ref("OK");
const statusOptions = [
  { label: "OK (Passed)", value: "OK" },
  { label: "NOK (Failed)", value: "NOK" },
  { label: "Requires Calibration", value: "CALIBRATION" },
];

const MANUAL = "__manual";
const LEGACY = "__legacy";

function recordSource(r) {
  if (r.test_mode === "repair_job" || r.repair_job_id) return r.repair_job_id;
  if (r.test_mode === "manual") return MANUAL;
  return LEGACY;
}

// Test source dropdown: every repair job, then Manual Testing, then records
// saved by older versions (linked to a Valve List entry) when there are any.
const sourceOptions = computed(() => {
  const counts = new Map();
  for (const r of historicalRecords.value) {
    const k = recordSource(r);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const opts = repairJobs.value.map((j) => ({
    label: `${repairJobLabel(j)} (${counts.get(j.id) || 0})`,
    value: j.id,
    group: "Repair Jobs",
  }));
  opts.push({ label: `Manual Testing (${counts.get(MANUAL) || 0})`, value: MANUAL, group: "Other" });
  if (counts.get(LEGACY)) opts.push({ label: `Valve List records, older version (${counts.get(LEGACY)})`, value: LEGACY, group: "Other" });
  return opts;
});

const recordOptions = computed(() => {
  if (selectedSource.value === null) return [];
  return historicalRecords.value
    .filter((r) => recordSource(r) === selectedSource.value)
    .map((r) => {
      let n = 0;
      try {
        n = JSON.parse(r.data_payload || "[]").length;
      } catch (e) {
        n = 0;
      }
      const v = r.valve || r.Valve;
      const prefix = selectedSource.value === LEGACY ? `${v?.part_number || "Unknown"} — ` : "";
      return { label: `${prefix}${formatDateTime(r.created_at)} — ${n} samples`, value: r };
    });
});

watch(selectedSource, () => {
  // Newest record of the chosen source, so the preview fills immediately.
  selectedRecord.value = recordOptions.value[0]?.value || null;
});

// --- Selected record ---
const recordJob = computed(() => {
  const r = selectedRecord.value;
  if (!r?.repair_job_id) return null;
  return r.repair_job || repairJobs.value.find((j) => j.id === r.repair_job_id) || null;
});
const recordValve = computed(() => selectedRecord.value?.valve || selectedRecord.value?.Valve || null);
const isManualRecord = computed(() => !!selectedRecord.value && !recordJob.value && !recordValve.value);
// Specification the test is verified against: the repair job, or the valve
// for older records. Manual tests have none.
const reference = computed(() => recordJob.value || recordValve.value || null);

const reportDate = computed(() => (selectedRecord.value ? formatDateTime(selectedRecord.value.created_at) : "-"));
const testModeText = computed(() => {
  if (!selectedRecord.value) return "-";
  if (recordJob.value) return "Repair Job";
  if (recordValve.value) return "Valve List";
  return "Manual Testing";
});

const parsedTelemetry = computed(() => {
  if (!selectedRecord.value?.data_payload) return [];
  try {
    const d = JSON.parse(selectedRecord.value.data_payload);
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
});

const recordMeta = computed(() => {
  try {
    return JSON.parse(selectedRecord.value?.meta || "{}") || {};
  } catch (e) {
    return {};
  }
});

function hasData(key) {
  return parsedTelemetry.value.some((d) => toNumberOrNull(d[key]) !== null);
}

// Sensors in this record: fixed channels, the custom sensors as they were
// named when recorded, and the generic fields of older records. Only those
// with at least one value are offered.
const currentCustom = ref([]);
const recordCatalog = computed(() => {
  const custom = normaliseCustom(recordMeta.value.sensors);
  // A custom sensor missing from the record's own list falls back to its
  // current name in Settings, then to its key.
  const known = new Set(custom.map((c) => c.key));
  for (const c of normaliseCustom(currentCustom.value)) {
    if (!known.has(c.key)) {
      custom.push(c);
      known.add(c.key);
    }
  }
  const keys = new Set(parsedTelemetry.value.flatMap((d) => Object.keys(d)));
  for (const k of keys) {
    if (/^custom_\d+$/.test(k) && !known.has(k)) custom.push({ key: k, label: k, unit: "", group: "Custom" });
  }
  return [...BASE_SENSORS, ...custom, ...LEGACY_SENSORS].filter((s) => hasData(s.key));
});

// --- Verification channels ---
const pressureChannelOptions = computed(() =>
  recordCatalog.value.filter((s) => s.unit === "bar" && ["pressure_1", "pressure_2", "pressure"].includes(s.key)).map((s) => ({ label: s.label, value: s.key })),
);
const flowChannelOptions = computed(() =>
  recordCatalog.value.filter((s) => ["flow_1", "flow_2", "flow"].includes(s.key)).map((s) => ({ label: s.label, value: s.key })),
);
const pressureChannel = ref(null);
const flowChannel = ref(null);

// --- Report charts ---
const chartCountOptions = [1, 2, 3, 4].map((n) => ({ label: `${n} chart${n > 1 ? "s" : ""}`, value: n }));
const chartCount = ref(3);
const chartConfigs = ref([]);
const xOptions = computed(() => axisOptions(recordCatalog.value, { includeTime: true }));
const yOptions = computed(() => axisOptions(recordCatalog.value));

function firstAvailable(keys) {
  return keys.find((k) => hasData(k)) || null;
}

function defaultChartsFor() {
  const fromMeta = Array.isArray(recordMeta.value.charts) ? recordMeta.value.charts : [];
  const valid = fromMeta.filter((c) => c && (c.x === TIME_KEY || hasData(c.x)) && hasData(c.y)).slice(0, 4);
  if (valid.length) return valid.map((c) => ({ x: c.x, y: c.y }));
  // Older records: pressure, flow and command over time.
  const p = firstAvailable(["pressure", "pressure_1"]);
  const f = firstAvailable(["flow", "flow_1"]);
  const c = firstAvailable(["command", "command_1"]);
  const out = [p, f, c].filter(Boolean).map((y) => ({ x: TIME_KEY, y }));
  return out.length ? out : [];
}

watch(selectedRecord, () => {
  const defaults = defaultChartsFor();
  // Keep 4 slots so raising the chart count has something sensible to show:
  // spare slots plot sensors not used yet, over time.
  const used = new Set(defaults.map((c) => c.y));
  const spare = recordCatalog.value.map((s) => s.key).filter((k) => !used.has(k));
  const slots = [...defaults];
  while (slots.length < 4) slots.push({ x: TIME_KEY, y: spare.shift() || defaults[0]?.y || recordCatalog.value[0]?.key || "pressure_1" });
  chartConfigs.value = slots;
  chartCount.value = Math.max(1, defaults.length);
  pressureChannel.value = pressureChannelOptions.value[0]?.value || null;
  flowChannel.value = flowChannelOptions.value[0]?.value || null;
});

const reportCharts = computed(() =>
  chartConfigs.value.slice(0, chartCount.value).map((cfg, i) => ({
    cfg,
    title: chartTitle(cfg, recordCatalog.value),
    component: isTimeChart(cfg) ? Line : Scatter,
    data: buildChartData(parsedTelemetry.value, cfg, recordCatalog.value, { index: i }),
    options: buildChartOptions(cfg, recordCatalog.value, LIGHT_CHART, { compact: true }),
  })),
);

// --- Peak values & verification (±10% acceptance band) ---
const TOLERANCE_PCT = 0.1;

function peak(key) {
  if (!key) return null;
  const vals = parsedTelemetry.value.map((d) => toNumberOrNull(d[key])).filter((v) => v !== null);
  return vals.length ? Math.max(...vals) : null;
}
const peakPressure = computed(() => peak(pressureChannel.value));
const peakFlow = computed(() => peak(flowChannel.value));
const fmt1 = (v) => (v === null || v === undefined ? "-" : Number(v).toFixed(1));

function band(refVal, unit) {
  if (!refVal) return { min: 0, max: 0, str: "-" };
  const min = (refVal * (1 - TOLERANCE_PCT)).toFixed(1);
  const max = (refVal * (1 + TOLERANCE_PCT)).toFixed(1);
  return { min: Number(min), max: Number(max), str: `${min} - ${max} ${unit}` };
}
const pressureRange = computed(() => band(Number(reference.value?.max_pressure || 0), "bar"));
const flowRange = computed(() => band(Number(reference.value?.max_flow || 0), "L/min"));

function verify(peakVal, refVal, noSignalText, missingRefText) {
  if (!reference.value || !parsedTelemetry.value.length) return "No Data";
  if (!refVal || refVal <= 0) return missingRefText;
  if (peakVal === null) return "No Channel Data";
  if (peakVal <= 0.5) return noSignalText;
  if (peakVal > refVal * (1 + TOLERANCE_PCT)) return "Exceeded Limits";
  if (peakVal < refVal * (1 - TOLERANCE_PCT)) return "Below Tolerance";
  return "Within Tolerance";
}
const pressureVerification = computed(() =>
  verify(peakPressure.value, Number(reference.value?.max_pressure || 0), "No Pressure (Failed)", "Invalid Ref"),
);
const flowVerification = computed(() => verify(peakFlow.value, Number(reference.value?.max_flow || 0), "No Flow (Failed)", "Not Configured"));

const pressureChannelLabel = computed(() => findSensor(recordCatalog.value, pressureChannel.value || "").label);
const flowChannelLabel = computed(() => findSensor(recordCatalog.value, flowChannel.value || "").label);

// Manual command inputs (Command 7 / 8, mA). One value if it never changed,
// else the min-max range. Records without them show "-".
function manualCommandText(key) {
  const vals = parsedTelemetry.value.map((d) => toNumberOrNull(d[key])).filter((v) => v !== null);
  if (!vals.length) return "-";
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return lo === hi ? `${lo} mA` : `${lo} – ${hi} mA`;
}
const manualCmd7Text = computed(() => manualCommandText("command_7"));
const manualCmd8Text = computed(() => manualCommandText("command_8"));

// Peaks of every recorded pressure/flow channel, for manual tests.
const recordedPeaks = computed(() =>
  recordCatalog.value
    .filter((s) => s.group === "Hydraulic" || s.group === "Custom" || s.group === "Recorded selection")
    .filter((s) => !s.key.startsWith("command") && !s.key.startsWith("feedback"))
    .map((s) => ({ label: sensorLabel(s), value: fmt1(peak(s.key)), unit: s.unit })),
);

async function loadHistory() {
  try {
    const [rec, jobs] = await Promise.all([api.get("/records"), api.get("/repair-jobs")]);
    historicalRecords.value = Array.isArray(rec.data) ? rec.data : [];
    repairJobs.value = Array.isArray(jobs.data) ? jobs.data : [];
  } catch (error) {
    toast.add({ severity: "error", summary: "Error", detail: "Failed to load test history.", life: 3000 });
  }
  try {
    const res = await fetchSensorCatalog();
    currentCustom.value = Array.isArray(res.data?.custom) ? res.data.custom : [];
  } catch (error) {
    currentCustom.value = [];
  }
}

async function generatePDF() {
  if (!selectedRecord.value) {
    toast.add({ severity: "error", summary: "Missing Data", detail: "Please select a test record.", life: 3000 });
    return;
  }
  if (!docNumber.value.trim()) {
    docNumber.value = `DOC-${Date.now().toString().slice(-6)}`;
  }
  await nextTick();
  window.print();
}

onMounted(loadHistory);
</script>

<template>
  <div class="report-generator-page">
    <!-- LEFT: Controls (Hidden on Print) -->
    <aside class="control-panel no-print">
      <header class="panel-header">
        <h2>Report Configuration</h2>
        <p>Choose a repair job and its test record, then generate the PDF.</p>
      </header>

      <div class="form-grid">
        <div class="field">
          <label for="report-source">Repair Job / Test Source</label>
          <Dropdown
            v-model="selectedSource"
            inputId="report-source"
            :options="sourceOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select repair job (job number)"
            class="w-full"
            filter
            filterPlaceholder="Job number, name, customer..."
          />
        </div>

        <div class="field">
          <label for="report-record">Test Record</label>
          <Dropdown
            v-model="selectedRecord"
            inputId="report-record"
            :options="recordOptions"
            optionLabel="label"
            optionValue="value"
            :placeholder="selectedSource === null ? 'Select a source first' : recordOptions.length ? 'Select test record' : 'No records for this source'"
            :disabled="!recordOptions.length"
            class="w-full"
          />
        </div>

        <div class="field">
          <label>Document Number (Optional)</label>
          <InputText v-model="docNumber" placeholder="Leave empty to auto-generate" />
        </div>

        <div class="field">
          <label>Operator Name</label>
          <InputText v-model="operatorName" placeholder="Enter operator name" />
        </div>

        <div class="field">
          <label>Final Test Status</label>
          <Dropdown v-model="selectedStatus" :options="statusOptions" optionLabel="label" optionValue="value" class="w-full" />
        </div>

        <template v-if="selectedRecord && reference">
          <div class="config-heading">Verification Channels</div>
          <div class="field-pair">
            <div class="field">
              <label for="ref-pressure">Max Pressure from</label>
              <Dropdown
                v-model="pressureChannel"
                inputId="ref-pressure"
                :options="pressureChannelOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="No pressure data"
                class="w-full"
              />
            </div>
            <div class="field">
              <label for="ref-flow">Max Flow from</label>
              <Dropdown
                v-model="flowChannel"
                inputId="ref-flow"
                :options="flowChannelOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="No flow data"
                class="w-full"
              />
            </div>
          </div>
        </template>

        <template v-if="selectedRecord && recordCatalog.length">
          <div class="config-heading">
            Report Charts
            <Dropdown
              v-model="chartCount"
              :options="chartCountOptions"
              optionLabel="label"
              optionValue="value"
              class="count-dropdown"
              inputId="report-chart-count"
            />
          </div>
          <div v-for="(c, i) in chartConfigs.slice(0, chartCount)" :key="i" class="chart-config-row">
            <span class="chart-no">{{ i + 1 }}</span>
            <div class="field">
              <label :for="`rep-${i}-y`">Y</label>
              <Dropdown v-model="chartConfigs[i].y" :inputId="`rep-${i}-y`" :options="yOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
            <div class="field">
              <label :for="`rep-${i}-x`">X</label>
              <Dropdown v-model="chartConfigs[i].x" :inputId="`rep-${i}-x`" :options="xOptions" optionLabel="label" optionValue="value" class="w-full" />
            </div>
          </div>
        </template>

        <div v-if="parsedTelemetry.length > 0" class="valve-summary-card">
          <strong>{{ parsedTelemetry.length }} Data Points Loaded</strong>
          <span>Ready for rendering.</span>
        </div>
      </div>

      <div class="action-footer">
        <Button label="Generate PDF Report" icon="pi pi-file-pdf" size="large" class="w-full" @click="generatePDF" />
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
            <span class="doc-id">{{ docNumber || "Please input doc number" }}</span>
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
              <span class="label">Test Mode:</span>
              <span class="value">{{ testModeText }} &middot; ValveDAX</span>
            </div>
          </div>
          <div class="info-column status-column">
            <div class="info-row">
              <span class="label">Overall Status:</span>
              <span class="status-badge" :class="selectedStatus">{{ selectedStatus }}</span>
            </div>
          </div>
        </section>

        <!-- 1. Component / Job Specification -->
        <section class="spec-section">
          <h3>1. {{ recordJob ? "Repair Job & Component" : "Component Specifications" }}</h3>
          <table v-if="recordJob" class="spec-table">
            <tbody>
              <tr>
                <th width="20%">Job Number</th>
                <td width="30%"><strong>{{ recordJob.job_number }}</strong></td>
                <th width="20%">Job Name</th>
                <td width="30%">{{ recordJob.job_name }}</td>
              </tr>
              <tr>
                <th>SO Number</th>
                <td>{{ recordJob.so_number || "-" }}</td>
                <th>Job Date</th>
                <td>{{ formatDate(recordJob.job_date) }}</td>
              </tr>
              <tr>
                <th>Customer</th>
                <td>{{ recordJob.customer || "-" }}</td>
                <th>Serial Number</th>
                <td>{{ recordJob.serial_number || "-" }}</td>
              </tr>
              <tr>
                <th>Valve Type</th>
                <td>{{ recordJob.valve_type || "-" }}</td>
                <th>Material Number</th>
                <td>{{ recordJob.material_number || "-" }}</td>
              </tr>
              <tr>
                <th>Manufacturer</th>
                <td>{{ recordJob.manufacturer || "-" }}</td>
                <th>Size NG / Weight</th>
                <td>NG {{ recordJob.size_ng || "-" }} / {{ recordJob.weight || "-" }} kg</td>
              </tr>
              <tr>
                <th>Manual Command 7</th>
                <td>{{ manualCmd7Text }}</td>
                <th>Manual Command 8</th>
                <td>{{ manualCmd8Text }}</td>
              </tr>
            </tbody>
          </table>
          <table v-else-if="recordValve" class="spec-table">
            <tbody>
              <tr>
                <th width="20%">Manufacturer</th>
                <td width="30%">{{ recordValve.manufacturer }}</td>
                <th width="20%">Part Number</th>
                <td width="30%"><strong>{{ recordValve.part_number }}</strong></td>
              </tr>
              <tr>
                <th>Series</th>
                <td>{{ recordValve.component_series }}</td>
                <th>Valve Type</th>
                <td>{{ recordValve.valve_type }}</td>
              </tr>
              <tr>
                <th>Size NG</th>
                <td>{{ recordValve.size_ng }}</td>
                <th>Unit Weight</th>
                <td>{{ recordValve.weight }} kg</td>
              </tr>
              <tr>
                <th>Manual Command 7</th>
                <td>{{ manualCmd7Text }}</td>
                <th>Manual Command 8</th>
                <td>{{ manualCmd8Text }}</td>
              </tr>
            </tbody>
          </table>
          <table v-else-if="isManualRecord" class="spec-table">
            <tbody>
              <tr>
                <th width="20%">Reference</th>
                <td colspan="3">Manual testing, no reference component or repair job</td>
              </tr>
              <tr>
                <th>Manual Command 7</th>
                <td width="30%">{{ manualCmd7Text }}</td>
                <th width="20%">Manual Command 8</th>
                <td width="30%">{{ manualCmd8Text }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-state">No test record selected.</div>
        </section>

        <!-- 2. Reference vs Tested -->
        <section v-if="reference" class="spec-section">
          <h3>2. Parameter Verification</h3>
          <table class="spec-table verification-table">
            <thead>
              <tr>
                <th width="22%">Parameter</th>
                <th width="20%">Nominal</th>
                <th width="22%">Acceptable Band (±10%)</th>
                <th width="18%">Peak Recorded Value</th>
                <th width="18%">Verification Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Max Pressure <small class="channel-tag">{{ pressureChannelLabel }}</small></td>
                <td>{{ reference.max_pressure }} bar</td>
                <td>{{ pressureRange.str }}</td>
                <td><strong>{{ fmt1(peakPressure) }} bar</strong></td>
                <td :class="pressureVerification === 'Within Tolerance' ? 'text-ok' : 'text-fail'">{{ pressureVerification }}</td>
              </tr>
              <tr>
                <td>Max Flow <small class="channel-tag">{{ flowChannelLabel }}</small></td>
                <td>{{ reference.max_flow || "-" }} L/min</td>
                <td>{{ flowRange.str }}</td>
                <td><strong>{{ fmt1(peakFlow) }} L/min</strong></td>
                <td
                  :class="
                    flowVerification === 'Within Tolerance' ? 'text-ok' : flowVerification === 'Not Configured' ? '' : 'text-fail'
                  "
                >
                  {{ flowVerification }}
                </td>
              </tr>
              <tr>
                <td>Command Input Type</td>
                <td>{{ reference.command_type || "Voltage (0-10V)" }}</td>
                <td>Match Database Type</td>
                <td>{{ reference.command_type || "Voltage (0-10V)" }}</td>
                <td class="text-ok">Matched</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section v-else-if="isManualRecord" class="spec-section">
          <h3>2. Recorded Peak Values</h3>
          <table class="spec-table">
            <thead>
              <tr>
                <th width="50%">Signal</th>
                <th width="50%">Peak Recorded Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in recordedPeaks" :key="p.label">
                <td>{{ p.label }}</td>
                <td><strong>{{ p.value }} {{ p.unit }}</strong></td>
              </tr>
              <tr v-if="!recordedPeaks.length">
                <td colspan="2">No pressure or flow data in this record.</td>
              </tr>
            </tbody>
          </table>
          <p class="manual-note">No reference specification: Pass/Fail verification does not apply to manual tests.</p>
        </section>

        <!-- 3. Charts -->
        <section v-if="parsedTelemetry.length > 0 && reportCharts.length" class="graphs-section">
          <h3>3. Dynamic Test Telemetry</h3>
          <div class="graphs-grid" :class="`count-${reportCharts.length}`">
            <div v-for="(c, i) in reportCharts" :key="i" class="graph-box">
              <h4>{{ c.title }}</h4>
              <div class="chart-wrapper">
                <component :is="c.component" :data="c.data" :options="c.options" />
              </div>
            </div>
          </div>
        </section>
        <div v-else class="empty-state">Graphs will render automatically when a test record is loaded.</div>

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
  width: 400px;
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

.config-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.25rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border-color);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-color);
}
.count-dropdown {
  width: 130px;
}
.field-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
.chart-config-row {
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.5rem;
  align-items: end;
}
.chart-no {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary-color);
  padding-bottom: 0.55rem;
}
.chart-config-row :deep(.p-select-label) {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.8rem;
  padding: 0.45rem 0.6rem;
}
.chart-config-row .field {
  gap: 0.2rem;
  min-width: 0;
}
.chart-config-row .field label {
  font-size: 0.7rem;
}

.valve-summary-card {
  background: rgba(0, 200, 247, 0.08);
  border: 1px solid #00c8f7;
  padding: 0.75rem;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.valve-summary-card strong {
  color: var(--text-color);
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

/* 1 chart: full width; 2: side by side; 3: one row of three; 4: 2 x 2.
   Heights are sized so the signature block still fits on one A4 page. */
.graphs-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
.graph-box {
  min-width: 0;
}
.graphs-grid.count-1 {
  grid-template-columns: minmax(0, 1fr);
}
.graphs-grid.count-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.graphs-grid.count-1 .chart-wrapper {
  height: 250px;
}
.graphs-grid.count-2 .chart-wrapper {
  height: 210px;
}
.graphs-grid.count-3 .chart-wrapper {
  height: 190px;
}
.graphs-grid.count-4 {
  row-gap: 0.5rem;
}
.graphs-grid.count-4 .chart-wrapper {
  height: 150px;
}
.channel-tag {
  display: block;
  font-size: 0.65rem;
  color: #64748b;
}
.manual-note {
  margin: 0.3rem 0 0;
  font-size: 0.7rem;
  color: #64748b;
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
