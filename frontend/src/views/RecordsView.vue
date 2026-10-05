<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import api, { startOutput, stopOutput, fetchOpcData } from "../services/api";
import { useValveStore } from "../stores/valve";

import AutoComplete from "primevue/autocomplete";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Dropdown from "primevue/dropdown";
import { useToast } from "primevue/usetoast";
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

const STEPS = 40;
const route = useRoute();
const valveStore = useValveStore();
const toast = useToast();

const valve = computed(() => valveStore.selectedValve);

const allValves = ref([]);
const query = ref("");
const suggestions = ref([]);
const pendingValve = ref(null);

const controlStatus = ref("stopped");
const isRecording = ref(false);
const isStarting = ref(false);
const isStopping = ref(false);
const recordedSession = ref([]);

// --- Telemetry Selection State ---
const pressureOptions = [
  { label: "Pressure 1", value: "pressure_1" },
  { label: "Pressure 2", value: "pressure_2" },
];
const selectedPressure = ref("pressure_1");

const flowOptions = [
  { label: "Flow 1", value: "flow_1" },
  { label: "Flow 2", value: "flow_2" },
];
const selectedFlow = ref("flow_1");

const channelOptions = [
  { label: "Channel 1", value: 1 },
  { label: "Channel 2", value: 2 },
  { label: "Channel 3", value: 3 },
  { label: "Channel 4", value: 4 },
  { label: "Channel 5", value: 5 },
  { label: "Channel 6", value: 6 },
];
const selectedChannel = ref(1);

// --- Telemetry Graph Buffers ---
let liveDataInterval = null;
const liveLabels = ref(Array(STEPS).fill(""));
const livePressure = ref(Array(STEPS).fill(0));
const liveFlow = ref(Array(STEPS).fill(0));
const liveCommand = ref(Array(STEPS).fill(0));
const liveFeedback = ref(Array(STEPS).fill(0));
const liveOilTemp = ref(Array(STEPS).fill(0));

const currentValues = ref({
  pressure: "0.0",
  flow: "0.0",
  command: "0.0",
  feedback: "0.0",
  oil_temp: "0.0",
});

// --- Timed Recording & Modal State ---
const recordConfigDialog = ref(false);
const recordFinishedDialog = ref(false);
const finishedSampleCount = ref(0);

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

const sliderTrackRef = ref(null);
const slideOffset = ref(0);
const isDragging = ref(false);
let startX = 0;
let maxSlide = 0;

function handleRecButtonClick() {
  if (isRecording.value) {
    stopRecordingSession(true);
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
  const trackWidth = sliderTrackRef.value.clientWidth;
  maxSlide = trackWidth - 52;
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
  if (slideOffset.value < maxSlide * 0.9) {
    slideOffset.value = 0;
  }
}

function triggerStartRecord() {
  recordConfigDialog.value = false;
  isRecording.value = true;
  recordedSession.value = [];
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
      stopRecordingSession(false);
    }
  }, 1000);
}

async function stopRecordingSession(manual = false) {
  isRecording.value = false;
  if (countdownInterval) clearInterval(countdownInterval);

  if (recordedSession.value.length > 0) {
    try {
      await api.post("/records", {
        valve_id: valve.value.id,
        data_payload: JSON.stringify(recordedSession.value),
      });
      finishedSampleCount.value = recordedSession.value.length;
    } catch (error) {
      toast.add({
        severity: "error",
        summary: "Save Failed",
        detail: "Could not save telemetry to database.",
        life: 3500,
      });
    }
  }

  if (manual) {
    toast.add({
      severity: "warn",
      summary: "Recording Halted",
      detail: `Stopped early. Persisted ${recordedSession.value.length} samples.`,
      life: 3000,
    });
  } else {
    recordFinishedDialog.value = true;
  }
}

async function loadValves() {
  try {
    const response = await api.get("/valves");
    allValves.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {}
}

async function fetchValveById(id) {
  if (!id) return;
  try {
    const response = await api.get(`/valves/${id}`);
    valveStore.selectValve(response.data);
  } catch (error) {}
}

function search(event) {
  const q = String(event.query || "").trim().toLowerCase();
  suggestions.value = allValves.value.filter(
    (item) =>
      (item.part_number && item.part_number.toLowerCase().includes(q)) ||
      (item.manufacturer && item.manufacturer.toLowerCase().includes(q)),
  );
}

function onSelect(event) {
  pendingValve.value = event.value;
}

function confirmShow() {
  if (!pendingValve.value) return;
  valveStore.selectValve(pendingValve.value);
  toast.add({
    severity: "info",
    summary: "Valve Configured",
    detail: `${pendingValve.value.part_number} loaded into test bench.`,
    life: 2500,
  });
}

async function startValve() {
  if (!valve.value || isStarting.value) return;
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
  if (!valve.value || isStopping.value) return;
  isStopping.value = true;
  try {
    await stopOutput();
    controlStatus.value = "stopped";
    if (isRecording.value) stopRecordingSession(true);
    toast.add({ severity: "warn", summary: "HPU Stopped", detail: "Output signal disengaged.", life: 3000 });
  } catch (error) {
    toast.add({ severity: "error", summary: "Stop Failed", detail: "Failed to disengage HPU.", life: 4000 });
  } finally {
    isStopping.value = false;
  }
}

function exportRecordedCSV() {
  if (!recordedSession.value.length) return;
  
  // Headers prioritize the primary recorded generic values mapping to the dropdown selection
  const headers = "Timestamp,Selected_Pressure,Selected_Flow,Selected_Command,Selected_Feedback,Oil_Temp,P1,P2,F1,F2,Cmd1,Fb1,Cmd2,Fb2,Cmd3,Fb3,Cmd4,Fb4,Cmd5,Fb5,Cmd6,Fb6\n";
  const rows = recordedSession.value
    .map((r) => `${r.time},${r.pressure},${r.flow},${r.command},${r.feedback},${r.oil_temp},${r.pressure_1},${r.pressure_2},${r.flow_1},${r.flow_2},${r.command_1},${r.feedback_1},${r.command_2},${r.feedback_2},${r.command_3},${r.feedback_3},${r.command_4},${r.feedback_4},${r.command_5},${r.feedback_5},${r.command_6},${r.feedback_6}`)
    .join("\n");

  const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ValveDAX_${valve.value?.part_number || "Valve"}_${Date.now()}.csv`);
  link.click();
}

async function pollLiveData() {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  let d = {};
  try {
    const res = await fetchOpcData();
    d = res.data || {};
  } catch (e) {}

  // Determine which channels the user wants to view and record based on dropdowns
  const pKey = selectedPressure.value;
  const fKey = selectedFlow.value;
  const ch = selectedChannel.value;

  const pSelected = Number(d[pKey] ?? d.pressure ?? 0);
  const fSelected = Number(d[fKey] ?? d.flow ?? 0);
  const cmdSelected = Number(d[`command_${ch}`] ?? d.command ?? 0);
  const fbSelected = Number(d[`feedback_${ch}`] ?? d.feedback ?? 0);
  const temp = Number(d.oil_temp ?? d.temperature ?? 0);

  // Update UI textual values
  currentValues.value.pressure = pSelected.toFixed(1);
  currentValues.value.flow = fSelected.toFixed(1);
  currentValues.value.command = cmdSelected.toFixed(1);
  currentValues.value.feedback = fbSelected.toFixed(1);
  currentValues.value.oil_temp = temp.toFixed(1);

  // Buffer for graphs
  liveLabels.value.shift();
  liveLabels.value.push(timeStr);
  livePressure.value.shift();
  livePressure.value.push(pSelected);
  liveFlow.value.shift();
  liveFlow.value.push(fSelected);
  liveCommand.value.shift();
  liveCommand.value.push(cmdSelected);
  liveFeedback.value.shift();
  liveFeedback.value.push(fbSelected);
  liveOilTemp.value.shift();
  liveOilTemp.value.push(temp);

  // If recording, log the explicitly selected channels into the generic fields 
  // (so the report automatically reads the selected channels). Full mapping is also kept.
  if (isRecording.value) {
    recordedSession.value.push({
      time: timeStr,
      pressure: pSelected, 
      flow: fSelected,
      command: cmdSelected,
      feedback: fbSelected,
      oil_temp: temp,
      pressure_1: Number(d.pressure_1 ?? 0),
      pressure_2: Number(d.pressure_2 ?? 0),
      flow_1: Number(d.flow_1 ?? 0),
      flow_2: Number(d.flow_2 ?? 0),
      command_1: Number(d.command_1 ?? 0), feedback_1: Number(d.feedback_1 ?? 0),
      command_2: Number(d.command_2 ?? 0), feedback_2: Number(d.feedback_2 ?? 0),
      command_3: Number(d.command_3 ?? 0), feedback_3: Number(d.feedback_3 ?? 0),
      command_4: Number(d.command_4 ?? 0), feedback_4: Number(d.feedback_4 ?? 0),
      command_5: Number(d.command_5 ?? 0), feedback_5: Number(d.feedback_5 ?? 0),
      command_6: Number(d.command_6 ?? 0), feedback_6: Number(d.feedback_6 ?? 0),
    });
  }
}

const pressureChartData = computed(() => ({
  labels: [...liveLabels.value],
  datasets: [
    {
      label: "Pressure (bar)",
      data: [...livePressure.value],
      borderColor: "#00CCFF",
      backgroundColor: "rgba(0, 204, 255, 0.12)",
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    },
  ],
}));

const flowChartData = computed(() => ({
  labels: [...liveLabels.value],
  datasets: [
    {
      label: "Flow (L/min)",
      data: [...liveFlow.value],
      borderColor: "#10b981",
      backgroundColor: "rgba(16, 185, 129, 0.08)",
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    },
  ],
}));

const commandFeedbackChartData = computed(() => ({
  labels: [...liveLabels.value],
  datasets: [
    {
      label: "Command",
      data: [...liveCommand.value],
      borderColor: "#f59e0b",
      backgroundColor: "rgba(245, 158, 11, 0.08)",
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    },
    {
      label: "Feedback",
      data: [...liveFeedback.value],
      borderColor: "#8b5cf6",
      backgroundColor: "rgba(139, 92, 246, 0.08)",
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    },
  ],
}));

const oilTempChartData = computed(() => ({
  labels: [...liveLabels.value],
  datasets: [
    {
      label: "Oil Temp (°C)",
      data: [...liveOilTemp.value],
      borderColor: "#f97316",
      backgroundColor: "rgba(249, 115, 22, 0.12)",
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 0 },
  interaction: { intersect: false, mode: "index" },
  plugins: {
    legend: {
      display: true,
      position: "bottom",
      labels: { boxWidth: 8, usePointStyle: true, padding: 6, font: { size: 9 } },
    },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      display: true,
      type: "category",
      grid: { display: false },
      ticks: { color: "#64748b", font: { size: 9 }, maxTicksLimit: 6 },
    },
    y: {
      beginAtZero: true,
      border: { display: false },
      grid: { color: "rgba(148, 163, 184, 0.12)" },
      ticks: { color: "#64748b", font: { size: 9 } },
    },
  },
};

const imageUrl = computed(() => {
  if (!valve.value?.image_path) return null;
  if (valve.value.image_path.startsWith("http")) return valve.value.image_path;
  const base = import.meta.env.VITE_API_URL || "";
  return `${base}${valve.value.image_path}`;
});

onMounted(async () => {
  await loadValves();
  const targetId = route.params.id || route.query.id;
  if (targetId) await fetchValveById(targetId);
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
        <AutoComplete
          v-model="query"
          :suggestions="suggestions"
          optionLabel="part_number"
          placeholder="Select Valve for Testing..."
          class="valve-search"
          @complete="search"
          @item-select="onSelect"
        />
        <Button
          label="Load"
          icon="pi pi-check"
          :disabled="!pendingValve"
          @click="confirmShow"
        />
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
        <div class="live-value-item">
          <span class="label">Command</span>
          <span class="value">{{ currentValues.command }}</span>
        </div>
        <div class="live-value-item">
          <span class="label">Feedback</span>
          <span class="value">{{ currentValues.feedback }}</span>
        </div>
        <div class="live-value-item">
          <span class="label">Pressure</span>
          <span class="value">{{ currentValues.pressure }} <small>bar</small></span>
        </div>
        <div class="live-value-item">
          <span class="label">Flow</span>
          <span class="value">{{ currentValues.flow }} <small>L/min</small></span>
        </div>
        <div class="live-value-item">
          <span class="label">Oil Temp</span>
          <span class="value">{{ currentValues.oil_temp }} <small>°C</small></span>
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
            class="ctrl-btn"
            :loading="isStarting"
            :disabled="!valve || isStarting || controlStatus === 'active'"
            @click="startValve"
          />
          <Button
            label="Stop"
            icon="pi pi-power-off"
            severity="danger"
            class="ctrl-btn"
            :loading="isStopping"
            :disabled="!valve || isStopping || controlStatus === 'stopped'"
            @click="stopValve"
          />
          <Button
            :label="isRecording ? formattedCountdown : 'Rec'"
            :icon="isRecording ? 'pi pi-stop-circle' : 'pi pi-circle-fill'"
            :severity="isRecording ? 'warn' : 'secondary'"
            class="ctrl-btn"
            :disabled="!valve"
            @click="handleRecButtonClick"
          />
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
              <span>{{ valve ? "No Image Uploaded" : "No Valve Loaded" }}</span>
            </div>
          </div>
        </section>

        <!-- Rating Spec Sheet -->
        <section class="panel info-panel">
          <div class="info-row">
            <span class="info-label">Part Number</span>
            <span class="info-val">{{ valve?.part_number || "-" }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Series / Type</span>
            <span class="info-val">{{ valve?.component_series || "-" }} / {{ valve?.valve_type || "-" }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Rated Flow</span>
            <span class="info-val">{{ valve?.rated_flow ?? "-" }} L/min</span>
          </div>
          <div class="info-row">
            <span class="info-label">Max Pressure</span>
            <span class="info-val">{{ valve?.max_pressure ?? "-" }} bar</span>
          </div>
          <div v-if="recordedSession.length > 0 && !isRecording" class="export-block">
            <Button
              label="Export CSV"
              icon="pi pi-download"
              severity="help"
              class="export-btn"
              @click="exportRecordedCSV"
            />
          </div>
        </section>
      </div>

      <!-- 1. Top-Center: Pressure -->
      <section class="panel graph-panel pressure-graph">
        <header class="panel-header">
          <h3>Pressure</h3>
          <Dropdown v-model="selectedPressure" :options="pressureOptions" optionLabel="label" optionValue="value" class="header-dropdown" />
        </header>
        <div class="chart-container">
          <Line :data="pressureChartData" :options="chartOptions" />
        </div>
      </section>

      <!-- 2. Top-Right: Flow -->
      <section class="panel graph-panel flow-graph">
        <header class="panel-header">
          <h3>Flow</h3>
          <Dropdown v-model="selectedFlow" :options="flowOptions" optionLabel="label" optionValue="value" class="header-dropdown" />
        </header>
        <div class="chart-container">
          <Line :data="flowChartData" :options="chartOptions" />
        </div>
      </section>

      <!-- 3. Bottom-Center: Command vs Feedback -->
      <section class="panel graph-panel command-graph">
        <header class="panel-header">
          <h3>Command vs Feedback</h3>
          <Dropdown v-model="selectedChannel" :options="channelOptions" optionLabel="label" optionValue="value" class="header-dropdown" />
        </header>
        <div class="chart-container">
          <Line :data="commandFeedbackChartData" :options="chartOptions" />
        </div>
      </section>

      <!-- 4. Bottom-Right: Oil Temperature -->
      <section class="panel graph-panel temp-graph">
        <header class="panel-header">
          <h3>Oil Temperature</h3>
        </header>
        <div class="chart-container">
          <Line :data="oilTempChartData" :options="chartOptions" />
        </div>
      </section>
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

    <!-- MODAL 2: Persistent Recording Finished Popup -->
    <Dialog
      :visible="recordFinishedDialog"
      @update:visible="recordFinishedDialog = $event"
      header="Recording Session Completed"
      :modal="true"
      :closable="false"
      :style="{ width: '26rem' }"
    >
      <div class="finished-modal-content">
        <i class="pi pi-check-circle success-icon"></i>
        <h4>Telemetry Logging Complete</h4>
        <p>
          Successfully captured and persisted
          <strong>{{ finishedSampleCount }} samples</strong> to the database.
        </p>
      </div>
      <template #footer>
        <Button
          label="OK"
          icon="pi pi-check"
          class="w-full"
          @click="recordFinishedDialog = false"
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
  max-width: 440px;
  flex: 1;
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
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
  border: 1px solid #ef4444;
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
.hpu-badge.active {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.hpu-badge.stopped {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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
  grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    "sidebar pressure flow"
    "sidebar command temp";
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
.pressure-graph { grid-area: pressure; }
.flow-graph { grid-area: flow; }
.command-graph { grid-area: command; }
.temp-graph { grid-area: temp; }
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
.header-dropdown :deep(.p-dropdown-label) {
  padding: 0 0.5rem;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
}
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
.finished-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 0 1rem;
  gap: 0.5rem;
}
.success-icon {
  font-size: 3.2rem;
  color: #10b981;
  margin-bottom: 0.5rem;
}
.finished-modal-content h4 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text-color);
}
.finished-modal-content p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.88rem;
}
</style>