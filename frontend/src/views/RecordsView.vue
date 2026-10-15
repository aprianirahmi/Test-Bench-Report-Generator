<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import api, { fetchSensorCatalog } from "../services/api";
import { storeToRefs } from "pinia";
import { useRecordingStore } from "../stores/recording";
import { useRepairJobStore } from "../stores/repairJob";
import { useTheme } from "../composables/useTheme";
import { DARK_CHART, LIGHT_CHART } from "../utils/chartTheme";
import {
  DEFAULT_CHARTS,
  TIME_KEY,
  axisOptions,
  discoverSensors,
  liveCatalog,
  sensorLabel,
  toNumberOrNull,
} from "../utils/sensors";
import { buildChartData, buildChartOptions, isTimeChart } from "../utils/chartBuild";
import { assetUrl, formatDate, formatDateTime, repairJobLabel, sessionFileName } from "../utils/format";

import AutoComplete from "primevue/autocomplete";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Dropdown from "primevue/dropdown";
import InputNumber from "primevue/inputnumber";
import SelectButton from "primevue/selectbutton";
import { useToast } from "primevue/usetoast";
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

const route = useRoute();
const jobStore = useRepairJobStore();
const toast = useToast();
const { isDark } = useTheme();
// Chart.js draws on canvas and cannot read CSS variables, so the axis and grid
// colours live in utils/chartTheme.js.
const chartTheme = computed(() => (isDark.value ? DARK_CHART : LIGHT_CHART));

// --- Test source: a repair job, or manual testing with no reference ---
const modeOptions = [
  { label: "Repair Job", value: "repair_job" },
  { label: "Manual Testing", value: "manual" },
];
const testMode = computed({
  get: () => jobStore.testMode,
  set: (v) => {
    if (v) jobStore.setMode(v);
  },
});
const job = computed(() => (testMode.value === "repair_job" ? jobStore.selectedJob : null));
const isManual = computed(() => testMode.value === "manual");
const canOperate = computed(() => isManual.value || !!job.value);

const allJobs = ref([]);
const query = ref("");
const suggestions = ref([]);
const pendingJob = ref(null);

// Live data, the recording and the finished session live in the recording
// store, so a recording keeps running while another page is open.
// plcStatus: "unknown" until the first poll answers, then "connected" or
// "disconnected" (taken from the OPC UA data request).
const rec = useRecordingStore();
const {
  plcStatus,
  isRecording,
  latest,
  liveBuffer,
  emptyStreak,
  manualCmd7,
  manualCmd8,
  selectedDuration,
  session,
  sessionDialog,
  sessionState,
  confirmDiscard,
  signalLost,
  signalLostKind,
  lostSeconds,
} = storeToRefs(rec);

// --- Sensors and chart layout ---
const customSensors = ref([]);
// Numeric fields of /api/opcua/data that no catalogue lists yet (a new
// backend channel, or a custom sensor added in Settings since the last
// catalogue refresh). They join the axis dropdowns on the next poll.
const discovered = ref([]);
const catalog = computed(() => liveCatalog(customSensors.value, discovered.value));
const xOptions = computed(() => axisOptions(catalog.value, { includeTime: true }));
const yOptions = computed(() => axisOptions(catalog.value));

const chartCountOptions = [1, 2, 3, 4].map((n) => ({ label: `${n} chart${n > 1 ? "s" : ""}`, value: n }));
const LAYOUT_KEY = "valvedax.records.chartLayout";
function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    if (saved && Array.isArray(saved.charts) && saved.charts.length === 4) {
      return { count: Math.min(4, Math.max(1, Number(saved.count) || 4)), charts: saved.charts };
    }
  } catch (e) {
    /* storage unavailable: use defaults */
  }
  return { count: 4, charts: DEFAULT_CHARTS.map((c) => ({ ...c })) };
}
const initialLayout = loadLayout();
const chartCount = ref(initialLayout.count);
const chartConfigs = ref(initialLayout.charts);
const visibleCharts = computed(() => chartConfigs.value.slice(0, chartCount.value));
watch(
  [chartCount, chartConfigs],
  () => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ count: chartCount.value, charts: chartConfigs.value }));
    } catch (e) {
      /* ignore */
    }
  },
  { deep: true },
);

// Manual command inputs. Command 7 / Command 8 (0-1300 mA) are typed in by the
// operator and are not read from OPC UA, so there is no feedback for them.
const MANUAL_MAX_MA = 1300;
const plotsCommand = (key) => visibleCharts.value.some((c) => c.x === key || c.y === key);

// --- Live data ---

const liveTiles = [
  { key: "pressure_1", label: "Pressure 1", unit: "bar" },
  { key: "pressure_2", label: "Pressure 2", unit: "bar" },
  { key: "flow_1", label: "Flow 1", unit: "L/min" },
  { key: "flow_2", label: "Flow 2", unit: "L/min" },
  { key: "oil_temp", label: "Oil Temp", unit: "\u00b0C" },
];
function tileValue(key) {
  const v = toNumberOrNull(latest.value[key]);
  return v === null ? "-" : v.toFixed(1);
}

// --- Recording timer & dialogs ---
// The timer is optional. 0 = no timer: the recording runs until Stop is pressed.
const recordConfigDialog = ref(false);
const durationOptions = [
  { label: "No timer (until Stop)", value: 0 },
  { label: "1 Minute", value: 60 },
  { label: "5 Minutes", value: 300 },
  { label: "10 Minutes", value: 600 },
  { label: "30 Minutes", value: 1800 },
  { label: "60 Minutes", value: 3600 },
];
// Clock: counts down with a timer, up without one (kept in the recording store).
const formattedCountdown = computed(() => rec.formattedClock);
const timerButtonLabel = computed(() => {
  if (isRecording.value) return formattedCountdown.value;
  return selectedDuration.value ? `${selectedDuration.value / 60} min` : "Timer";
});
const timerButtonTitle = computed(() =>
  selectedDuration.value
    ? `Recording timer: ${selectedDuration.value / 60} min`
    : "Recording timer: off (recording ends when Stop is pressed)",
);

// The finished session waits here until the operator decides what to do with
// it: save it as an official record, download the raw PDF/CSV, or discard it.
// session: { samples, charts, catalog, job, mode, startedAt, endedAt, reason, timer, withData }

const sessionDuration = computed(() => {
  if (!session.value) return 0;
  return Math.max(0, Math.round((session.value.endedAt - session.value.startedAt) / 1000));
});
const formatTime = (iso) => new Date(iso).toLocaleTimeString("en-GB");
const sessionHandled = computed(() => sessionState.value.saved || sessionState.value.pdf || sessionState.value.csv);

function openTimerDialog() {
  if (isRecording.value || sessionDialog.value) return;
  recordConfigDialog.value = true;
}

function startRecording() {
  if (!canOperate.value || isRecording.value || sessionDialog.value) return;
  recordConfigDialog.value = false;
  rec.setContext({ charts: visibleCharts.value, catalog: catalog.value });
  rec.start({ job: job.value, mode: testMode.value });
  warnedNoData = false;
  if (noSensorData.value) warnNoData();
  toast.add({
    severity: "success",
    summary: "Recording Started",
    detail: rec.activeDuration
      ? `Logging session for ${rec.activeDuration / 60} minute(s). It keeps running if you open another page.`
      : "Logging until Stop is pressed. It keeps running if you open another page.",
    life: 3500,
  });
}

// reason: "manual" (Stop button), "timer" (duration reached), "limit" (4 h cap without a timer)
function stopRecordingSession(reason) {
  rec.stop(reason);
  showNotice();
}

// Messages raised by the store (also while this page was closed).
function showNotice() {
  const n = rec.takeNotice();
  if (n) toast.add({ ...n, life: 6000 });
}

// No sensor value at all for a few seconds although the PLC answers: the
// Node IDs in Settings are most likely wrong (e.g. missing "ns=2;s=").
const noSensorData = computed(() => plcStatus.value === "connected" && emptyStreak.value >= 3);
let warnedNoData = false;
function warnNoData() {
  if (warnedNoData) return;
  warnedNoData = true;
  toast.add({
    severity: "warn",
    summary: "No Sensor Data",
    detail: "Recording, but no sensor values are being received. Check the OPC UA Node IDs in Settings.",
    life: 8000,
  });
}
watch(noSensorData, (v) => {
  if (v && isRecording.value) warnNoData();
});

async function saveSessionAsRecord() {
  const s = session.value;
  if (!s || sessionState.value.saved || sessionState.value.saving) return;
  sessionState.value.saving = true;
  const meta = {
    version: 2,
    started_at: s.startedAt.toISOString(),
    ended_at: s.endedAt.toISOString(),
    sample_interval_ms: 1000,
    charts: s.charts,
    sensors: s.catalog,
    // Periods in which no sensor value was received (PLC lost). The samples
    // of these periods are empty; the report notes them.
    gaps: s.gaps || [],
    signal_lost_seconds: s.lostSeconds || 0,
  };
  const body = {
    test_mode: s.mode,
    data_payload: JSON.stringify(s.samples),
    meta: JSON.stringify(meta),
  };
  if (s.mode === "repair_job" && s.job) body.repair_job_id = s.job.id;

  try {
    await api.post("/records", body);
    sessionState.value.saved = true;
    rec.clearDraft();
    toast.add({
      severity: "success",
      summary: "Record Saved",
      detail: `${s.samples.length} samples saved. Available in Generate Report.`,
      life: 3500,
    });
  } catch (error) {
    const msg = error.response?.data?.error || "Could not save telemetry to database.";
    toast.add({ severity: "error", summary: "Save Failed", detail: msg, life: 4500 });
  } finally {
    sessionState.value.saving = false;
  }
}

// jsPDF is loaded only when a raw PDF is requested, to keep the main bundle small.
async function downloadSessionPdf() {
  const s = session.value;
  if (!s) return;
  try {
    const { downloadRawDataPdf } = await import("../utils/rawDataPdf");
    const name = downloadRawDataPdf({
      samples: s.samples,
      charts: s.charts,
      catalog: s.catalog,
      job: s.job,
      startedAt: s.startedAt,
    });
    sessionState.value.pdf = true;
    toast.add({ severity: "info", summary: "Raw PDF", detail: name, life: 3000 });
  } catch (error) {
    console.error("PDF export failed:", error);
    toast.add({ severity: "error", summary: "PDF Failed", detail: "Could not build the raw data PDF.", life: 4000 });
  }
}

function exportSessionCSV() {
  const s = session.value;
  if (!s) return;
  const cols = s.catalog;
  const esc = (v) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const header = ["Time", "Timestamp", ...cols.map((c) => sensorLabel(c))].map(esc).join(",");
  const rows = s.samples.map((r) =>
    [r.time, r.ts, ...cols.map((c) => (r[c.key] === null || r[c.key] === undefined ? "" : r[c.key]))].map(esc).join(","),
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", sessionFileName(s.startedAt, s.job, "csv"));
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  sessionState.value.csv = true;
}

function closeSessionDialog() {
  if (!sessionHandled.value && !confirmDiscard.value) {
    confirmDiscard.value = true;
    return;
  }
  // Saved or exported: the autosave is no longer needed.
  if (sessionHandled.value) rec.clearDraft();
  sessionDialog.value = false;
  confirmDiscard.value = false;
}

function discardSession() {
  rec.clearDraft();
  session.value = null;
  sessionDialog.value = false;
  confirmDiscard.value = false;
  toast.add({ severity: "warn", summary: "Session Discarded", detail: "The recorded samples were not kept.", life: 3000 });
}

function reopenSession() {
  if (session.value) {
    confirmDiscard.value = false;
    sessionDialog.value = true;
  }
}

// --- Repair job selection ---
async function loadJobs() {
  try {
    const response = await api.get("/repair-jobs");
    allJobs.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    allJobs.value = [];
  }
}

// Keeps the axis dropdowns in step with what the backend actually sends.
// New fields are added at once; fields that disappear (a custom sensor
// removed in Settings) are dropped. A new custom_N key also triggers a
// catalogue refresh so it shows its Settings name instead of "Custom N".
function trackSensors(d) {
  const present = discovered.value.filter((s) => s.key in d);
  const fresh = discoverSensors([d], liveCatalog(customSensors.value, present));
  if (fresh.length || present.length !== discovered.value.length) discovered.value = [...present, ...fresh];
  const knownCustom = new Set(customSensors.value.map((c) => c.key));
  const customKeys = Object.keys(d).filter((k) => /^custom_\d+$/.test(k));
  const changed = customKeys.some((k) => !knownCustom.has(k)) || [...knownCustom].some((k) => !(k in d));
  if (changed) refreshCustomSensors();
}

let lastCatalogRefresh = 0;
function refreshCustomSensors(force = false) {
  const now = Date.now();
  if (!force && now - lastCatalogRefresh < 5000) return;
  lastCatalogRefresh = now;
  loadCustomSensors();
}
// Renames made in Settings (also from another PC) arrive within this period.
const CATALOG_REFRESH_MS = 15000;
let catalogInterval = null;
const onWindowFocus = () => refreshCustomSensors(true);

async function loadCustomSensors() {
  try {
    const res = await fetchSensorCatalog();
    customSensors.value = Array.isArray(res.data?.custom) ? res.data.custom : [];
  } catch (error) {
    /* keep the last known names; a later refresh will retry */
  }
}

function search(event) {
  const q = String(event.query || "").trim().toLowerCase();
  suggestions.value = allJobs.value.filter((j) =>
    [j.job_number, j.job_name, j.customer, j.serial_number, j.so_number, j.material_number]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q)),
  );
}

function onSelect(event) {
  pendingJob.value = event.value;
}

function confirmLoadJob() {
  if (!pendingJob.value) return;
  jobStore.selectJob(pendingJob.value);
  toast.add({
    severity: "info",
    summary: "Repair Job Loaded",
    detail: `${pendingJob.value.job_number} — ${pendingJob.value.job_name}`,
    life: 2500,
  });
}

// Publish the chart layout and sensor list to the store: every sample and the
// finished session use them, also when the recording ends on another page.
watch(
  [visibleCharts, catalog],
  () => rec.setContext({ charts: visibleCharts.value, catalog: catalog.value }),
  { immediate: true, deep: true },
);
watch(() => rec.notice, (n) => n && showNotice());

// Live chart bindings, one per visible chart
const liveCharts = computed(() =>
  visibleCharts.value.map((cfg, i) => ({
    cfg,
    component: isTimeChart(cfg) ? Line : Scatter,
    data: buildChartData(liveBuffer.value, cfg, catalog.value, { index: i }),
    options: buildChartOptions(cfg, catalog.value, chartTheme.value),
  })),
);

function swapAxes(i) {
  const c = chartConfigs.value[i];
  if (c.x === TIME_KEY) return;
  chartConfigs.value[i] = { x: c.y, y: c.x };
}

function resetLayout() {
  chartCount.value = 4;
  chartConfigs.value = DEFAULT_CHARTS.map((c) => ({ ...c }));
}

const imageUrl = computed(() => assetUrl(job.value?.image_path));

let offData = null;
onMounted(async () => {
  await Promise.all([loadJobs(), loadCustomSensors()]);
  const targetId = Number(route.query.job);
  if (targetId) {
    const found = allJobs.value.find((j) => j.id === targetId);
    if (found) {
      jobStore.selectJob(found);
      pendingJob.value = found;
    }
  }
  if (jobStore.selectedJob) query.value = jobStore.selectedJob;
  offData = rec.onData(trackSensors);
  rec.attach();
  showNotice();
  lastCatalogRefresh = Date.now();
  catalogInterval = setInterval(() => refreshCustomSensors(true), CATALOG_REFRESH_MS);
  window.addEventListener("focus", onWindowFocus);
});

onBeforeUnmount(() => {
  rec.detach();
  if (offData) offData();
  if (catalogInterval) clearInterval(catalogInterval);
  window.removeEventListener("focus", onWindowFocus);
});
</script>

<template>
  <div class="records-page">
    <div class="search-toolbar">
      <div class="search-section">
        <SelectButton
          v-model="testMode"
          :options="modeOptions"
          optionLabel="label"
          optionValue="value"
          :allowEmpty="false"
          :disabled="isRecording"
          class="mode-switch"
        />
        <template v-if="!isManual">
          <AutoComplete
            v-model="query"
            :suggestions="suggestions"
            :optionLabel="repairJobLabel"
            placeholder="Select Repair Job for Testing..."
            class="valve-search"
            :disabled="isRecording"
            @complete="search"
            @item-select="onSelect"
          >
            <template #option="slotProps">
              <div class="option-row">
                <strong>{{ slotProps.option.job_number }} — {{ slotProps.option.job_name }}</strong>
                <small>{{ slotProps.option.customer || "-" }} · SN {{ slotProps.option.serial_number || "-" }} · {{ formatDate(slotProps.option.job_date) }}</small>
              </div>
            </template>
          </AutoComplete>
          <Button label="Load" icon="pi pi-check" :disabled="!pendingJob || isRecording" @click="confirmLoadJob" />
        </template>
        <span v-else class="manual-note">
          <i class="pi pi-info-circle"></i>
          No reference job. Records are saved as manual tests.
        </span>
      </div>

      <!-- Real-time Status & Telemetry Bar -->
      <div class="live-values-section">
        <div v-if="isRecording" class="recording-badge pulse">
          <i class="pi pi-circle-fill"></i>
          <span>REC: {{ formattedCountdown }}</span>
        </div>

        <div
          v-if="isRecording && signalLost"
          class="signal-lost-badge"
          title="The recording continues, but no sensor values are received. The gap is noted in the record."
        >
          <i class="pi pi-exclamation-circle"></i>
          <span>{{ signalLostKind === "plc_offline" ? "PLC LOST" : "NO SIGNAL" }} &middot; {{ lostSeconds }} s empty</span>
        </div>
        <router-link
          v-if="noSensorData && !signalLost"
          to="/settings"
          class="data-warn-badge"
          title="The PLC answers but no sensor value is received. Check the OPC UA Node IDs in Settings (they must start with ns=2;s=)."
        >
          <i class="pi pi-exclamation-triangle"></i>
          <span>NO SENSOR DATA</span>
        </router-link>
        <div class="plc-badge" :class="plcStatus" title="OPC UA connection to the PLC">
          <span class="pulse-dot"></span>
          <span>PLC: {{ plcStatus.toUpperCase() }}</span>
        </div>
        <div v-for="t in liveTiles" :key="t.key" class="live-value-item">
          <span class="label">{{ t.label }}</span>
          <span class="value">{{ tileValue(t.key) }} <small>{{ t.unit }}</small></span>
        </div>
      </div>
    </div>

    <div class="wireframe-grid">
      <!-- Left Controls Column -->
      <div class="sidebar-column">
        <section class="panel control-panel">
          <Button
            label="Start"
            icon="pi pi-play"
            severity="success"
            class="ctrl-btn start-btn"
            :disabled="!canOperate || isRecording || sessionDialog"
            @click="startRecording"
          />
          <Button
            label="Stop"
            icon="pi pi-stop"
            severity="danger"
            class="ctrl-btn"
            :disabled="!isRecording"
            @click="stopRecordingSession('manual')"
          />
          <Button
            :label="timerButtonLabel"
            icon="pi pi-clock"
            :severity="isRecording ? 'warn' : 'secondary'"
            class="ctrl-btn timer-btn"
            :title="timerButtonTitle"
            :disabled="sessionDialog"
            @click="openTimerDialog"
          />
        </section>

        <!-- Manual Command Input: typed in by the operator, not read from OPC UA -->
        <section class="panel manual-panel">
          <header class="panel-header manual-header">
            <h3>Manual Command Input</h3>
            <span class="manual-range">0&ndash;{{ MANUAL_MAX_MA }} mA</span>
          </header>
          <div class="manual-body">
            <div class="manual-field" :class="{ active: plotsCommand('command_7') }">
              <label for="manual-cmd7" class="info-label">Command 7</label>
              <InputNumber
                v-model="manualCmd7"
                inputId="manual-cmd7"
                :min="0"
                :max="MANUAL_MAX_MA"
                :maxFractionDigits="1"
                :useGrouping="false"
                suffix=" mA"
                placeholder="0&ndash;1300 mA"
                fluid
              />
            </div>
            <div class="manual-field" :class="{ active: plotsCommand('command_8') }">
              <label for="manual-cmd8" class="info-label">Command 8</label>
              <InputNumber
                v-model="manualCmd8"
                inputId="manual-cmd8"
                :min="0"
                :max="MANUAL_MAX_MA"
                :maxFractionDigits="1"
                :useGrouping="false"
                suffix=" mA"
                placeholder="0&ndash;1300 mA"
                fluid
              />
            </div>
          </div>
        </section>

        <!-- Valve Preview -->
        <section class="panel picture-panel">
          <header class="panel-header">
            <h3>Valve Preview</h3>
          </header>
          <div class="picture-content">
            <img v-if="imageUrl" :src="imageUrl" class="valve-image" alt="Valve Preview" />
            <div v-else class="image-placeholder">
              <i class="pi pi-image"></i>
              <span>{{ isManual ? "Manual Testing" : job ? "No Image Uploaded" : "No Repair Job Loaded" }}</span>
            </div>
          </div>
        </section>

        <!-- Job Sheet -->
        <section class="panel info-panel">
          <template v-if="!isManual">
            <div class="info-row">
              <span class="info-label">Job Number</span>
              <span class="info-val">{{ job?.job_number || "-" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Customer</span>
              <span class="info-val">{{ job?.customer || "-" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Valve / Serial</span>
              <span class="info-val">{{ job?.valve_type || "-" }} / {{ job?.serial_number || "-" }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Rated / Max Flow</span>
              <span class="info-val">{{ job?.rated_flow ?? "-" }} / {{ job?.max_flow ?? "-" }} L/min</span>
            </div>
            <div class="info-row">
              <span class="info-label">Max Pressure</span>
              <span class="info-val">{{ job?.max_pressure ?? "-" }} bar</span>
            </div>
          </template>
          <div v-else class="manual-info">
            <i class="pi pi-sliders-v"></i>
            <span>Manual testing: no reference specification. The report shows recorded peaks without Pass/Fail verification.</span>
          </div>
          <div v-if="session && !sessionDialog && !isRecording" class="export-block">
            <Button
              label="Last Session Actions"
              icon="pi pi-folder-open"
              severity="help"
              class="export-btn"
              @click="reopenSession"
            />
          </div>
        </section>
      </div>

      <!-- Charts: 1 to 4, each with its own X and Y signal -->
      <div class="charts-area">
        <div class="charts-toolbar panel">
          <span class="toolbar-label">Trend Layout</span>
          <Dropdown
            v-model="chartCount"
            :options="chartCountOptions"
            optionLabel="label"
            optionValue="value"
            class="header-dropdown count-dropdown"
            inputId="chart-count"
          />
          <Button label="Reset" icon="pi pi-refresh" text size="small" class="reset-btn" @click="resetLayout" />
          <span class="toolbar-hint">All signals are recorded. The layout only changes what is shown.</span>
        </div>

        <div class="charts-grid" :class="`count-${chartCount}`">
          <section v-for="(c, i) in liveCharts" :key="i" class="panel graph-panel" :class="`chart-${i + 1}`">
            <header class="panel-header chart-header">
              <h3>Chart {{ i + 1 }}</h3>
              <div class="axis-pickers">
                <label class="axis-label" :for="`chart-${i}-y`">Y</label>
                <Dropdown
                  v-model="chartConfigs[i].y"
                  :options="yOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="header-dropdown axis-dropdown"
                  :inputId="`chart-${i}-y`"
                  filter
                />
                <label class="axis-label" :for="`chart-${i}-x`">X</label>
                <Dropdown
                  v-model="chartConfigs[i].x"
                  :options="xOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="header-dropdown axis-dropdown"
                  :inputId="`chart-${i}-x`"
                  filter
                />
                <Button
                  icon="pi pi-arrow-right-arrow-left"
                  text
                  rounded
                  size="small"
                  class="swap-btn"
                  title="Swap X and Y"
                  :disabled="c.cfg.x === TIME_KEY"
                  @click="swapAxes(i)"
                />
              </div>
            </header>
            <div class="chart-container">
              <component :is="c.component" :data="c.data" :options="c.options" />
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- MODAL 1: Recording timer (optional) -->
    <Dialog
      :visible="recordConfigDialog"
      @update:visible="recordConfigDialog = $event"
      header="Recording Timer"
      :modal="true"
      :style="{ width: '26rem' }"
    >
      <div class="rec-config-body">
        <div class="field">
          <label>Recording Duration</label>
          <Dropdown
            v-model="selectedDuration"
            :options="durationOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
          <small class="timer-hint">
            {{
              selectedDuration
                ? "Recording stops automatically when the timer ends. Stop ends it earlier."
                : "No timer: recording runs until Stop is pressed (stops by itself after 4 h)."
            }}
          </small>
        </div>
      </div>
      <template #footer>
        <Button label="OK" icon="pi pi-check" @click="recordConfigDialog = false" />
      </template>
    </Dialog>

    <!-- MODAL 2: Recording finished, choose what to keep -->
    <Dialog
      :visible="sessionDialog"
      :header="session?.reason === 'recovered' ? 'Recording Recovered' : 'Recording Finished'"
      :modal="true"
      :closable="false"
      :style="{ width: '32rem' }"
    >
      <div v-if="session" class="session-body">
        <div class="session-summary">
          <i class="pi pi-check-circle success-icon"></i>
          <div>
            <h4>{{ session.samples.length }} samples captured</h4>
            <p>
              {{ formatDateTime(session.startedAt) }} &middot; {{ sessionDuration }} s
              <template v-if="session.reason === 'limit'"> &middot; stopped at the 4 h limit</template>
              <template v-else-if="session.reason === 'manual' && session.timer"> &middot; stopped early</template>
              <template v-else-if="session.reason === 'recovered'"> &middot; app was closed during recording, data up to the last autosave</template>
            </p>
            <p class="session-ref">
              {{ session.job ? `${session.job.job_number} — ${session.job.job_name}` : "Manual testing (no reference)" }}
            </p>
            <p v-if="session.gaps && session.gaps.length && session.withData > 0" class="session-warn">
              <i class="pi pi-exclamation-triangle"></i>
              Signal lost {{ session.gaps.length }}x, {{ session.lostSeconds }} s without sensor values
              ({{ session.gaps.map((g) => formatTime(g.from)).join(", ") }}). These samples are empty; the report will note it.
            </p>
            <p v-if="session.withData === 0" class="session-warn">
              <i class="pi pi-exclamation-triangle"></i>
              No sensor values were received during this recording, so charts and verification will be empty.
              Check the OPC UA Node IDs in Settings, then record again.
            </p>
          </div>
        </div>

        <div class="session-actions">
          <button
            type="button"
            class="session-option"
            :class="{ done: sessionState.saved }"
            :disabled="sessionState.saved || sessionState.saving"
            @click="saveSessionAsRecord"
          >
            <i :class="sessionState.saving ? 'pi pi-spin pi-spinner' : sessionState.saved ? 'pi pi-check' : 'pi pi-database'"></i>
            <span class="opt-text">
              <strong>{{ sessionState.saved ? "Saved as Record" : "Save as Record" }}</strong>
              <small>Official record, selectable in Generate Report.</small>
            </span>
          </button>
          <button type="button" class="session-option" :class="{ done: sessionState.pdf }" @click="downloadSessionPdf">
            <i :class="sessionState.pdf ? 'pi pi-check' : 'pi pi-file-pdf'"></i>
            <span class="opt-text">
              <strong>Download Raw Data PDF</strong>
              <small>Session info, charts and every sample. Not stored in the database.</small>
            </span>
          </button>
          <button type="button" class="session-option" :class="{ done: sessionState.csv }" @click="exportSessionCSV">
            <i :class="sessionState.csv ? 'pi pi-check' : 'pi pi-download'"></i>
            <span class="opt-text">
              <strong>Export CSV</strong>
              <small>All signals, one row per second.</small>
            </span>
          </button>
        </div>

        <div v-if="confirmDiscard" class="discard-warning">
          <i class="pi pi-exclamation-triangle"></i>
          <span>Nothing has been saved or downloaded. Closing now discards this session. It cannot be recovered.</span>
        </div>
      </div>
      <template #footer>
        <Button
          v-if="confirmDiscard"
          label="Discard Session"
          icon="pi pi-trash"
          severity="danger"
          @click="discardSession"
        />
        <Button v-else label="Discard" icon="pi pi-trash" severity="danger" text @click="confirmDiscard = true" />
        <Button
          :label="confirmDiscard ? 'Back' : 'Done'"
          :icon="confirmDiscard ? 'pi pi-arrow-left' : 'pi pi-check'"
          @click="confirmDiscard ? (confirmDiscard = false) : closeSessionDialog()"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.records-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  overflow: hidden;
}
.search-toolbar {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.85rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  gap: 1rem;
}
.search-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 680px;
  flex: 1;
  min-width: 0;
}
.mode-switch {
  flex-shrink: 0;
}
.mode-switch :deep(.p-togglebutton) {
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
}
.manual-note {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.option-row {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.option-row small {
  color: var(--text-muted);
}
.valve-search {
  flex: 1;
}
.valve-search :deep(.p-inputtext) {
  width: 100%;
}
.live-values-section {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.recording-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: Consolas, Monaco, monospace;
  background: rgba(237, 0, 7, 0.14);
  color: #ed0007;
  border: 1px solid #ed0007;
}
.recording-badge.pulse i {
  animation: pulse 1s infinite alternate;
}
@keyframes pulse {
  from { opacity: 0.2; }
  to { opacity: 1; }
}
.signal-lost-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  background: #b45309;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  animation: signal-pulse 0.8s infinite alternate;
}
@keyframes signal-pulse {
  from { opacity: 1; }
  to { opacity: 0.6; }
}
.data-warn-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: Consolas, Monaco, monospace;
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
  text-decoration: none;
  white-space: nowrap;
}
.p-dark .data-warn-badge {
  background: rgba(245, 158, 11, 0.22);
  color: #fcd34d;
}
.session-warn {
  margin-top: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
  font-size: 0.8rem;
  line-height: 1.35;
}
.p-dark .session-warn {
  color: #fcd34d;
}
.plc-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: Consolas, Monaco, monospace;
}
/* Status badges: Rexroth palette. Cyan/teal = connected, red = disconnected */
.plc-badge.connected {
  background: rgba(0, 200, 247, 0.16);
  color: #007aa0;
}
.plc-badge.disconnected {
  background: rgba(237, 0, 7, 0.1);
  color: #be090f;
}
.plc-badge.unknown {
  background: rgba(0, 43, 73, 0.08);
  color: var(--text-muted);
}
.p-dark .plc-badge.connected {
  background: rgba(0, 200, 247, 0.18);
  color: #91f0ff;
}
.p-dark .plc-badge.disconnected {
  background: rgba(237, 0, 7, 0.22);
  color: #ff6a6e;
}
.p-dark .plc-badge.unknown {
  background: rgba(255, 255, 255, 0.08);
}

/* Start is the only green button in the app. Every other button
   follows the Rexroth palette (see theme/tfiPreset.js). */
.start-btn {
  --p-button-success-background: #10b981;
  --p-button-success-hover-background: #059669;
  --p-button-success-active-background: #047857;
  --p-button-success-border-color: #10b981;
  --p-button-success-hover-border-color: #059669;
  --p-button-success-active-border-color: #047857;
  --p-button-success-color: #ffffff;
  --p-button-success-hover-color: #ffffff;
  --p-button-success-active-color: #ffffff;
  --p-button-success-focus-ring-color: #10b981;
}
.p-dark .start-btn {
  --p-button-success-background: #34d399;
  --p-button-success-hover-background: #6ee7b7;
  --p-button-success-active-background: #6ee7b7;
  --p-button-success-border-color: #34d399;
  --p-button-success-hover-border-color: #6ee7b7;
  --p-button-success-active-border-color: #6ee7b7;
  --p-button-success-color: #002b49;
  --p-button-success-hover-color: #002b49;
  --p-button-success-active-color: #002b49;
  --p-button-success-focus-ring-color: #34d399;
}
.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.live-value-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 4.5rem;
}
.live-value-item .label {
  font-size: 0.65rem;
  font-weight: 700;
  /* navy in light mode, white in dark mode */
  color: var(--text-color);
  text-transform: uppercase;
}
.live-value-item .value {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--primary-color);
  font-family: Consolas, Monaco, monospace;
  font-variant-numeric: tabular-nums;
}

.wireframe-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  grid-template-areas: "sidebar charts";
  gap: 0.85rem;
}
.sidebar-column {
  grid-area: sidebar;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 0;
}
.control-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
  padding: 0.6rem;
}
.ctrl-btn {
  width: 100%;
  padding: 0.45rem 0;
}
.picture-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 180px;
}
.picture-content {
  flex: 1;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.valve-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}
.image-placeholder i {
  font-size: 2rem;
}
.info-panel {
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.info-row {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  padding-bottom: 0.3rem;
}
.info-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.info-val {
  font-size: 0.85rem;
  font-weight: 600;
  font-family: Consolas, Monaco, monospace;
}
.export-block {
  margin-top: 0.4rem;
}
.export-btn {
  width: 100%;
}
/* Charts area: toolbar + 1-4 charts */
.charts-area {
  grid-area: charts;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
  min-width: 0;
}
.charts-toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0.75rem;
  flex-shrink: 0;
}
.toolbar-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-color);
}
.toolbar-hint {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-muted);
}
.count-dropdown {
  min-width: 110px;
}
.charts-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 0.85rem;
}
.charts-grid.count-1 {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}
.charts-grid.count-2 {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(2, minmax(0, 1fr));
}
.charts-grid.count-3,
.charts-grid.count-4 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
}
.charts-grid.count-3 .chart-3 {
  grid-column: 1 / span 2;
}
.chart-header {
  gap: 0.5rem;
  flex-wrap: wrap;
}
.axis-pickers {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.axis-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
  margin-left: 0.2rem;
}
.axis-dropdown {
  min-width: 0;
  width: 150px;
}
.swap-btn {
  width: 26px;
  height: 26px;
  padding: 0;
}
.graph-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chart-container {
  flex: 1;
  min-height: 0;
  padding: 0.4rem 0.6rem 0.1rem;
}
.panel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

/* Panel Header modified to accept flex dropdown controls */
.panel-header {
  padding: 0.35rem 0.75rem;
  background: rgba(148, 163, 184, 0.05);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-header h3 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
}
.header-dropdown {
  height: 28px;
  display: flex;
  align-items: center;
  min-width: 120px;
}
.header-dropdown :deep(.p-select-label),
.header-dropdown :deep(.p-dropdown-label) {
  padding: 0 0.5rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
}
.header-dropdown :deep(.p-select-dropdown),
.header-dropdown :deep(.p-dropdown-trigger) {
  width: 28px;
}
.w-full {
  width: 100%;
}

/* Recording timer dialog */
.rec-config-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0.5rem 0 1rem;
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
.timer-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Completion Dialog Styles */
.success-icon {
  font-size: 3.2rem;
  color: #00c8f7;
  margin-bottom: 0.5rem;
}

.manual-panel {
  flex-shrink: 0;
}
.manual-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.manual-range {
  font-size: 0.72rem;
  color: var(--text-muted);
}
.manual-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem 0.7rem;
}
.manual-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.25rem 0.35rem;
  border-radius: 4px;
  border: 1px solid transparent;
}
/* A manual command that is plotted in one of the visible charts */
.manual-field.active {
  border-color: var(--rexroth-6);
  background: rgba(0, 200, 247, 0.08);
}
.manual-field :deep(.p-inputnumber-input) {
  width: 100%;
  padding: 0.3rem 0.5rem;
  font-size: 0.82rem;
}

.manual-info {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.35;
}
.manual-info i {
  margin-top: 0.15rem;
  color: var(--primary-color);
}
.live-value-item .value small {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: normal;
}

/* Recording finished dialog */
.session-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}
.session-summary {
  display: flex;
  gap: 0.85rem;
  align-items: center;
}
.session-summary .success-icon {
  font-size: 2.4rem;
  margin: 0;
}
.session-summary h4 {
  margin: 0 0 0.2rem;
  font-size: 1.05rem;
  color: var(--text-color);
}
.session-summary p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.session-summary .session-ref {
  margin-top: 0.15rem;
  font-weight: 600;
  color: var(--text-color);
}
.session-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.session-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.8rem;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.session-option:hover:not(:disabled) {
  border-color: var(--primary-color);
  background: rgba(0, 200, 247, 0.06);
}
.session-option:disabled {
  cursor: default;
}
.session-option i {
  font-size: 1.2rem;
  color: var(--primary-color);
  width: 1.4rem;
  text-align: center;
}
.session-option.done {
  border-color: #00c8f7;
}
.session-option.done i {
  color: #00a3c8;
}
.opt-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.opt-text strong {
  font-size: 0.86rem;
}
.opt-text small {
  font-size: 0.74rem;
  color: var(--text-muted);
}
.discard-warning {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: rgba(237, 0, 7, 0.08);
  border: 1px solid rgba(237, 0, 7, 0.4);
  color: #be090f;
  font-size: 0.8rem;
}
.p-dark .discard-warning {
  color: #ff8a8d;
}
/* ------------------------------------------------------------------
   Layout for industrial PCs (1024x768 and similar). Rules here keep every
   control inside its card and the left column free of scrolling.
   ------------------------------------------------------------------ */

/* The grid row is capped to the space that is left, so the left column can
   never push the page taller than the window. */
.wireframe-grid {
  grid-template-rows: minmax(0, 1fr);
}
.sidebar-column > .panel {
  flex-shrink: 0;
}
.picture-panel {
  flex: 1 1 0;
}

/* Each chart card measures its own width, so the axis pickers adapt to the
   card (which depends on window size, sidebar state and the 1-4 layout). */
.graph-panel {
  container-type: inline-size;
  container-name: chartcard;
}
.chart-header .axis-pickers {
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: nowrap;
}
.chart-header .axis-dropdown.header-dropdown {
  flex: 1 1 0;
  min-width: 0;
  max-width: 200px;
  width: auto;
}
.axis-dropdown :deep(.p-select-label) {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 26px;
}
.chart-header .swap-btn {
  flex-shrink: 0;
}

/* Medium card: title on its own line, Y and X side by side below it. */
@container chartcard (max-width: 470px) {
  .chart-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.2rem;
    padding: 0.3rem 0.6rem;
  }
  .axis-pickers {
    width: 100%;
    justify-content: space-between;
    gap: 0.25rem;
  }
  .chart-header .axis-dropdown.header-dropdown {
    max-width: none;
  }
  .axis-label {
    margin-left: 0;
  }
}

/* Narrow card: Y above X, swap button beside them. */
@container chartcard (max-width: 420px) {
  .axis-pickers {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: 0.3rem;
    row-gap: 0.2rem;
    align-items: center;
  }
  .axis-pickers > :nth-child(1) { grid-column: 1; grid-row: 1; }
  .axis-pickers > :nth-child(2) { grid-column: 2; grid-row: 1; }
  .axis-pickers > :nth-child(3) { grid-column: 1; grid-row: 2; }
  .axis-pickers > :nth-child(4) { grid-column: 2; grid-row: 2; }
  .axis-pickers > :nth-child(5) { grid-column: 3; grid-row: 1 / span 2; align-self: center; }
}

@media (max-width: 1180px) {
  .search-toolbar {
    flex-wrap: wrap;
    row-gap: 0.4rem;
    padding: 0.4rem 0.7rem;
  }
  .search-section {
    max-width: none;
    flex: 1 1 100%;
  }
  .live-values-section {
    flex: 1 1 100%;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .live-value-item {
    min-width: 0;
  }
  .wireframe-grid {
    grid-template-columns: 250px minmax(0, 1fr);
  }
  .info-row {
    gap: 0.5rem;
  }
  .info-label {
    flex-shrink: 0;
  }
  .info-val {
    min-width: 0;
    text-align: right;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
  }
}
@media (max-width: 900px) {
  .wireframe-grid {
    grid-template-columns: 230px minmax(0, 1fr);
  }
  .charts-toolbar {
    flex-wrap: wrap;
    row-gap: 0.3rem;
  }
  .toolbar-hint {
    flex: 1 1 100%;
    margin-left: 0;
  }
}

/* Short screens: tighter spacing so the left column fits without scrolling
   (the Valve Preview takes whatever height is left over). */
@media (max-height: 800px) {
  .records-page,
  .wireframe-grid,
  .sidebar-column,
  .charts-area,
  .charts-grid {
    gap: 0.55rem;
  }
  .control-panel {
    padding: 0.4rem;
  }
  .ctrl-btn {
    padding: 0.3rem 0;
  }
  .manual-header {
    padding: 0.25rem 0.65rem;
  }
  .manual-body {
    padding: 0.35rem 0.6rem 0.45rem;
    gap: 0.4rem;
  }
  .manual-field {
    padding: 0.1rem 0.2rem;
    gap: 0.1rem;
  }
  .manual-field :deep(.p-inputnumber-input) {
    padding: 0.2rem 0.4rem;
  }
  .picture-panel {
    min-height: 64px;
  }
  .picture-content {
    padding: 0.3rem;
  }
  .info-panel {
    padding: 0.5rem 0.7rem;
    gap: 0.3rem;
  }
  .info-row {
    padding-bottom: 0.15rem;
  }
  .info-label {
    font-size: 0.7rem;
  }
  .info-val {
    font-size: 0.78rem;
  }
  .panel-header {
    padding: 0.25rem 0.65rem;
  }
  .search-toolbar {
    padding: 0.3rem 0.6rem;
  }
  .charts-toolbar {
    padding: 0.2rem 0.6rem;
  }
  .chart-container {
    padding: 0.2rem 0.4rem 0;
  }
}
@media (max-height: 680px) {
  .picture-panel {
    min-height: 44px;
  }
  .image-placeholder i {
    display: none;
  }
  .manual-range {
    display: none;
  }
}
</style>
