<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import api, { startOutput, stopOutput, fetchOpcData, fetchSensorCatalog } from "../services/api";
import { useRepairJobStore } from "../stores/repairJob";
import { useTheme } from "../composables/useTheme";
import { DARK_CHART, LIGHT_CHART } from "../utils/chartTheme";
import {
  DEFAULT_CHARTS,
  TIME_KEY,
  axisOptions,
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

const STEPS = 40; // samples shown in the live charts (1 sample per second)
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

const controlStatus = ref("stopped");
const isRecording = ref(false);
const isStarting = ref(false);
const isStopping = ref(false);
const recordedSession = ref([]);
const recordingStartedAt = ref(null);

// --- Sensors and chart layout ---
const customSensors = ref([]);
const catalog = computed(() => liveCatalog(customSensors.value));
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
const manualCmd7 = ref(null);
const manualCmd8 = ref(null);
const plotsCommand = (key) => visibleCharts.value.some((c) => c.x === key || c.y === key);

// --- Live data ---
let liveDataInterval = null;
const liveBuffer = ref([]);
const latest = ref({});

const liveTiles = [
  { key: "pressure_1", label: "Pressure 1", unit: "bar" },
  { key: "pressure_2", label: "Pressure 2", unit: "bar" },
  { key: "flow_1", label: "Flow 1", unit: "L/min" },
  { key: "flow_2", label: "Flow 2", unit: "L/min" },
];
function tileValue(key) {
  const v = toNumberOrNull(latest.value[key]);
  return v === null ? "-" : v.toFixed(1);
}

// --- Recording timer & dialogs ---
const recordConfigDialog = ref(false);
const durationOptions = [
  { label: "1 Minute", value: 60 },
  { label: "5 Minutes", value: 300 },
  { label: "10 Minutes", value: 600 },
  { label: "30 Minutes", value: 1800 },
  { label: "60 Minutes", value: 3600 },
];
const selectedDuration = ref(60);
const remainingSeconds = ref(0);
let countdownInterval = null;

const formattedCountdown = computed(() => {
  const m = Math.floor(remainingSeconds.value / 60);
  const s = remainingSeconds.value % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
});

// The finished session waits here until the operator decides what to do with
// it: save it as an official record, download the raw PDF/CSV, or discard it.
const session = ref(null); // { samples, charts, catalog, job, mode, startedAt, endedAt, reason }
const sessionDialog = ref(false);
const sessionState = ref({ saved: false, pdf: false, csv: false, saving: false });
const confirmDiscard = ref(false);

const sessionDuration = computed(() => {
  if (!session.value) return 0;
  return Math.max(0, Math.round((session.value.endedAt - session.value.startedAt) / 1000));
});
const sessionHandled = computed(() => sessionState.value.saved || sessionState.value.pdf || sessionState.value.csv);

const sliderTrackRef = ref(null);
const slideOffset = ref(0);
const isDragging = ref(false);
let startX = 0;
let maxSlide = 0;

function handleRecButtonClick() {
  if (isRecording.value) {
    stopRecordingSession("manual");
  } else {
    resetSlider();
    recordConfigDialog.value = true;
  }
}

function resetSlider() {
  slideOffset.value = 0;
  isDragging.value = false;
}

function onSlideStart(e) {
  if (!sliderTrackRef.value) return;
  isDragging.value = true;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  startX = clientX - slideOffset.value;
  maxSlide = sliderTrackRef.value.clientWidth - 52;
}

function onSlideMove(e) {
  if (!isDragging.value) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  let currentOffset = clientX - startX;
  if (currentOffset < 0) currentOffset = 0;
  if (currentOffset > maxSlide) currentOffset = maxSlide;
  slideOffset.value = currentOffset;

  if (maxSlide > 0 && currentOffset >= maxSlide * 0.9) {
    isDragging.value = false;
    slideOffset.value = maxSlide;
    triggerStartRecord();
  }
}

function onSlideEnd() {
  if (!isDragging.value) return;
  isDragging.value = false;
  if (slideOffset.value < maxSlide * 0.9) slideOffset.value = 0;
}

function triggerStartRecord() {
  if (sessionDialog.value) return;
  recordConfigDialog.value = false;
  isRecording.value = true;
  recordedSession.value = [];
  recordingStartedAt.value = new Date();
  remainingSeconds.value = selectedDuration.value;

  toast.add({
    severity: "success",
    summary: "Recording Started",
    detail: `Logging session for ${selectedDuration.value / 60} minute(s).`,
    life: 3000,
  });

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remainingSeconds.value--;
    if (remainingSeconds.value <= 0) {
      clearInterval(countdownInterval);
      stopRecordingSession("timer");
    }
  }, 1000);
}

// reason: "manual" (Rec button), "hpu" (Stop button), "timer" (duration reached)
function stopRecordingSession(reason) {
  if (!isRecording.value) return;
  isRecording.value = false;
  if (countdownInterval) clearInterval(countdownInterval);

  const samples = recordedSession.value.slice();
  if (!samples.length) {
    toast.add({ severity: "warn", summary: "Recording Stopped", detail: "No samples were captured.", life: 3000 });
    return;
  }

  session.value = {
    samples,
    charts: visibleCharts.value.map((c) => ({ ...c })),
    catalog: catalog.value.map((s) => ({ key: s.key, label: s.label, unit: s.unit, group: s.group })),
    job: job.value ? { ...job.value } : null,
    mode: testMode.value,
    startedAt: recordingStartedAt.value || new Date(),
    endedAt: new Date(),
    reason,
  };
  sessionState.value = { saved: false, pdf: false, csv: false, saving: false };
  confirmDiscard.value = false;
  sessionDialog.value = true;
}

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
  sessionDialog.value = false;
  confirmDiscard.value = false;
}

function discardSession() {
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

async function loadCustomSensors() {
  try {
    const res = await fetchSensorCatalog();
    customSensors.value = Array.isArray(res.data?.custom) ? res.data.custom : [];
  } catch (error) {
    customSensors.value = [];
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

async function startValve() {
  if (!canOperate.value || isStarting.value) return;
  isStarting.value = true;
  try {
    await startOutput();
    controlStatus.value = "active";
    toast.add({ severity: "success", summary: "HPU Active", detail: "Output signal engaged.", life: 3000 });
  } catch (error) {
    toast.add({ severity: "error", summary: "Start Failed", detail: "Failed to engage HPU.", life: 4000 });
  } finally {
    isStarting.value = false;
  }
}

async function stopValve() {
  if (isStopping.value) return;
  isStopping.value = true;
  try {
    await stopOutput();
    controlStatus.value = "stopped";
    if (isRecording.value) stopRecordingSession("hpu");
    toast.add({ severity: "warn", summary: "HPU Stopped", detail: "Output signal disengaged.", life: 3000 });
  } catch (error) {
    toast.add({ severity: "error", summary: "Stop Failed", detail: "Failed to disengage HPU.", life: 4000 });
  } finally {
    isStopping.value = false;
  }
}

async function pollLiveData() {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  let d = {};
  try {
    const res = await fetchOpcData();
    d = res.data || {};
  } catch (e) {}

  // One sample holds every sensor, so any X/Y pair can be drawn now or later
  // in the report. Unconfigured nodes come back as null and stay null.
  const sample = { time: timeStr, ts: now.toISOString() };
  for (const s of catalog.value) {
    if (s.key === "command_7" || s.key === "command_8") continue;
    sample[s.key] = toNumberOrNull(d[s.key]);
  }
  sample.command_7 = toNumberOrNull(manualCmd7.value);
  sample.command_8 = toNumberOrNull(manualCmd8.value);

  latest.value = sample;
  const buf = liveBuffer.value.slice(-(STEPS - 1));
  buf.push(sample);
  liveBuffer.value = buf;

  if (isRecording.value) recordedSession.value.push(sample);
}

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
  liveDataInterval = setInterval(pollLiveData, 1000);
  window.addEventListener("mousemove", onSlideMove);
  window.addEventListener("mouseup", onSlideEnd);
  window.addEventListener("touchmove", onSlideMove);
  window.addEventListener("touchend", onSlideEnd);
});

onBeforeUnmount(() => {
  if (liveDataInterval) clearInterval(liveDataInterval);
  if (countdownInterval) clearInterval(countdownInterval);
  window.removeEventListener("mousemove", onSlideMove);
  window.removeEventListener("mouseup", onSlideEnd);
  window.removeEventListener("touchmove", onSlideMove);
  window.removeEventListener("touchend", onSlideEnd);
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

        <div class="hpu-badge" :class="controlStatus">
          <span class="pulse-dot"></span>
          <span>HPU: {{ controlStatus.toUpperCase() }}</span>
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
            :loading="isStarting"
            :disabled="!canOperate || isStarting || controlStatus === 'active'"
            @click="startValve"
          />
          <Button
            label="Stop"
            icon="pi pi-power-off"
            severity="danger"
            class="ctrl-btn"
            :loading="isStopping"
            :disabled="isStopping || controlStatus === 'stopped'"
            @click="stopValve"
          />
          <Button
            :label="isRecording ? formattedCountdown : 'Rec'"
            :icon="isRecording ? 'pi pi-stop-circle' : 'pi pi-circle-fill'"
            :severity="isRecording ? 'warn' : 'secondary'"
            class="ctrl-btn"
            :disabled="!canOperate || sessionDialog"
            @click="handleRecButtonClick"
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

    <!-- MODAL 1: Recording Duration & Slide to Confirm -->
    <Dialog
      :visible="recordConfigDialog"
      @update:visible="recordConfigDialog = $event"
      header="Configure Recording Timer"
      :modal="true"
      :style="{ width: '28rem' }"
    >
      <div class="rec-config-body">
        <div class="field">
          <label>Target Duration</label>
          <Dropdown
            v-model="selectedDuration"
            :options="durationOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>

        <div class="slide-confirm-container">
          <div ref="sliderTrackRef" class="slider-track">
            <div class="slider-fill" :style="{ width: `${slideOffset + 26}px` }"></div>
            <span class="slider-text">Slide to Start Recording &rarr;</span>
            <div
              class="slider-thumb"
              :style="{ transform: `translateX(${slideOffset}px)` }"
              @mousedown="onSlideStart"
              @touchstart="onSlideStart"
            >
              <i class="pi pi-angle-double-right"></i>
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- MODAL 2: Recording finished, choose what to keep -->
    <Dialog
      :visible="sessionDialog"
      header="Recording Finished"
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
              <template v-if="session.reason === 'hpu'"> &middot; stopped by HPU Stop</template>
              <template v-else-if="session.reason === 'manual'"> &middot; stopped early</template>
            </p>
            <p class="session-ref">
              {{ session.job ? `${session.job.job_number} — ${session.job.job_name}` : "Manual testing (no reference)" }}
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
.hpu-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: Consolas, Monaco, monospace;
}
/* Status badges: Rexroth palette. Cyan/teal = running, red = stopped */
.hpu-badge.active {
  background: rgba(0, 200, 247, 0.16);
  color: #007aa0;
}
.hpu-badge.stopped {
  background: rgba(237, 0, 7, 0.1);
  color: #be090f;
}
.p-dark .hpu-badge.active {
  background: rgba(0, 200, 247, 0.18);
  color: #91f0ff;
}
.p-dark .hpu-badge.stopped {
  background: rgba(237, 0, 7, 0.22);
  color: #ff6a6e;
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
  color: var(--text-muted);
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

/* Slide to Confirm Styles */
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
.slide-confirm-container {
  margin-top: 0.5rem;
}
.slider-track {
  position: relative;
  width: 100%;
  height: 52px;
  background: rgba(0, 43, 73, 0.08);
  border: 1px solid var(--border-color);
  border-radius: 30px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}
.p-dark .slider-track {
  background: rgba(255, 255, 255, 0.05);
}
.slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 204, 255, 0.25);
  pointer-events: none;
}
.slider-text {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  pointer-events: none;
  z-index: 1;
}
.slider-thumb {
  position: absolute;
  left: 0;
  top: 0;
  width: 52px;
  height: 50px;
  background: var(--primary-color);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: transform 0.05s ease-out;
}
.slider-thumb:active {
  cursor: grabbing;
}
.slider-thumb i {
  font-size: 1.1rem;
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
</style>