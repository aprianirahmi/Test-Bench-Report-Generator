<template>
  <div class="settings-page">
    <header class="page-header">
      <div class="header-title">
        <h2>System Settings</h2>
        <span class="subtitle">OPC UA connection parameters and 6-channel valve telemetry mapping</span>
      </div>
      <div class="header-actions">
        <div class="connection-status-pill" :class="{ connected: isConnected }">
          <span class="status-dot"></span>
          <span>{{ isConnected ? "Connected" : "Disconnected" }}</span>
        </div>
        <Button
          label="Save Settings"
          icon="pi pi-check"
          :loading="isSaving"
          class="save-btn"
          @click="saveSettings"
        />
      </div>
    </header>

    <div class="settings-grid">
      <!-- LEFT COLUMN: Server Connection & Hydraulic Transducers -->
      <div class="grid-column left-col">
        <!-- 1. OPC UA Server Connection -->
        <section class="panel-card">
          <div class="card-title">
            <i class="pi pi-link"></i>
            <span>OPC UA Connection (ctrlX CORE)</span>
          </div>

          <div class="form-row full">
            <div class="field">
              <label>Endpoint Address</label>
              <InputText
                v-model="settings.opc_endpoint"
                placeholder="opc.tcp://127.0.0.1:4840"
                class="p-inputtext-sm full-width"
              />
            </div>
          </div>

          <div class="form-row dual">
            <div class="field">
              <label>Username (Optional)</label>
              <InputText
                v-model="settings.opc_username"
                placeholder="Anonymous"
                class="p-inputtext-sm full-width"
              />
            </div>
            <div class="field">
              <label>Password</label>
              <Password
                v-model="settings.opc_password"
                placeholder="Update only"
                :feedback="false"
                toggleMask
                class="p-inputtext-sm full-width"
                inputClass="full-width"
              />
            </div>
          </div>

          <div class="form-row dual">
            <div class="field">
              <label>Security Policy</label>
              <Dropdown
                v-model="settings.security_policy"
                :options="['None', 'Basic256Sha256', 'Aes128_Sha256_RsaOaep']"
                class="p-inputtext-sm full-width"
              />
            </div>
            <div class="field">
              <label>Security Mode</label>
              <Dropdown
                v-model="settings.security_mode"
                :options="['None', 'Sign', 'SignAndEncrypt']"
                class="p-inputtext-sm full-width"
              />
            </div>
          </div>
        </section>

        <!-- 2. System Triggers & Hydraulic Transducers -->
        <section class="panel-card">
          <div class="card-title">
            <i class="pi pi-sliders-h"></i>
            <span>System Triggers & Hydraulic Transducers</span>
          </div>

          <!-- Output Trigger -->
          <div class="node-field-group">
            <div class="field-meta">
              <label>Output Trigger Node ID</label>
              <span class="live-dot" :class="{ ok: isLiveNode('output_trigger') }"></span>
            </div>
            <div class="node-input-row">
              <div class="live-pill">{{ liveValues.output_trigger ?? '-' }}</div>
              <InputText
                v-model="settings.output_trigger_node_id"
                placeholder="ns=2;s=plc/app/Application/sym/PLC_PRG/output"
                class="p-inputtext-sm node-input"
              />
            </div>
          </div>

          <!-- HPU Status -->
          <div class="node-field-group">
            <div class="field-meta">
              <label>HPU Status Node ID</label>
              <span class="live-dot" :class="{ ok: isLiveNode('hpu_status') }"></span>
            </div>
            <div class="node-input-row">
              <div class="live-pill">{{ liveValues.hpu_status ?? '-' }}</div>
              <InputText
                v-model="settings.hpu_status_node_id"
                placeholder="ns=2;s=plc/app/Application/sym/PLC_PRG/output"
                class="p-inputtext-sm node-input"
              />
            </div>
          </div>

          <!-- Pressure 1 & 2 -->
          <div class="form-row dual">
            <div class="node-field-group">
              <div class="field-meta">
                <label>Pressure Node 1</label>
                <span class="live-dot" :class="{ ok: isLiveNode('pressure_1') }"></span>
              </div>
              <div class="node-input-row">
                <div class="live-pill mini">{{ liveValues.pressure_1 ?? '-' }}</div>
                <InputText
                  v-model="settings.pressure_node_1"
                  placeholder="ns=2;s=testbench/sensors/pressure_1"
                  class="p-inputtext-sm node-input"
                />
              </div>
            </div>

            <div class="node-field-group">
              <div class="field-meta">
                <label>Pressure Node 2</label>
                <span class="live-dot" :class="{ ok: isLiveNode('pressure_2') }"></span>
              </div>
              <div class="node-input-row">
                <div class="live-pill mini">{{ liveValues.pressure_2 ?? '-' }}</div>
                <InputText
                  v-model="settings.pressure_node_2"
                  placeholder="ns=2;s=testbench/sensors/pressure_2"
                  class="p-inputtext-sm node-input"
                />
              </div>
            </div>
          </div>

          <!-- Flow 1 & 2 -->
          <div class="form-row dual">
            <div class="node-field-group">
              <div class="field-meta">
                <label>Flow Node 1</label>
                <span class="live-dot" :class="{ ok: isLiveNode('flow_1') }"></span>
              </div>
              <div class="node-input-row">
                <div class="live-pill mini">{{ liveValues.flow_1 ?? '-' }}</div>
                <InputText
                  v-model="settings.flow_node_1"
                  placeholder="ns=2;s=testbench/sensors/flow_1"
                  class="p-inputtext-sm node-input"
                />
              </div>
            </div>

            <div class="node-field-group">
              <div class="field-meta">
                <label>Flow Node 2</label>
                <span class="live-dot" :class="{ ok: isLiveNode('flow_2') }"></span>
              </div>
              <div class="node-input-row">
                <div class="live-pill mini">{{ liveValues.flow_2 ?? '-' }}</div>
                <InputText
                  v-model="settings.flow_node_2"
                  placeholder="ns=2;s=testbench/sensors/flow_2"
                  class="p-inputtext-sm node-input"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- RIGHT COLUMN: 6-Channel Command & Feedback Matrix -->
      <div class="grid-column right-col">
        <section class="panel-card channel-matrix-card">
          <div class="card-title">
            <i class="pi pi-th-large"></i>
            <span>Valve Actuation & Feedback Channels (1 – 6)</span>
          </div>

          <div class="channels-header">
            <span class="col-lbl ch-col">Ch</span>
            <span class="col-lbl node-col">Command Node ID (PLC Output)</span>
            <span class="col-lbl node-col">Feedback Node ID (Sensor Input)</span>
          </div>

          <div class="channels-list">
            <div v-for="ch in 6" :key="ch" class="channel-row">
              <span class="ch-badge">{{ ch }}</span>

              <!-- Command Channel with Live Pill -->
              <div class="channel-node-cell">
                <div class="live-pill mini">{{ liveValues[`command_${ch}`] ?? '-' }}</div>
                <InputText
                  v-model="settings[`command_node_${ch}`]"
                  :placeholder="`ns=2;s=testbench/valve/command_${ch}`"
                  class="p-inputtext-sm ch-input"
                />
              </div>

              <!-- Feedback Channel with Live Pill -->
              <div class="channel-node-cell">
                <div class="live-pill mini">{{ liveValues[`feedback_${ch}`] ?? '-' }}</div>
                <InputText
                  v-model="settings[`feedback_node_${ch}`]"
                  :placeholder="`ns=2;s=testbench/valve/feedback_${ch}`"
                  class="p-inputtext-sm ch-input"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from "vue"
import InputText from "primevue/inputtext"
import Password from "primevue/password"
import Dropdown from "primevue/dropdown"
import Button from "primevue/button"
import { useToast } from "primevue/usetoast"
import api, { fetchOpcData } from "../services/api"

const toast = useToast()
const isSaving = ref(false)
const isConnected = ref(false)
let pollingTimer = null

const liveValues = reactive({
  output_trigger: "-",
  hpu_status: "-",
  pressure_1: "-",
  pressure_2: "-",
  flow_1: "-",
  flow_2: "-",
  command_1: "-", feedback_1: "-",
  command_2: "-", feedback_2: "-",
  command_3: "-", feedback_3: "-",
  command_4: "-", feedback_4: "-",
  command_5: "-", feedback_5: "-",
  command_6: "-", feedback_6: "-",
})

const settings = reactive({
  opc_endpoint: "opc.tcp://127.0.0.1:4840",
  opc_username: "",
  opc_password: "",
  security_policy: "None",
  security_mode: "None",
  output_trigger_node_id: "ns=2;s=plc/app/Application/sym/PLC_PRG/output",
  hpu_status_node_id: "ns=2;s=plc/app/Application/sym/PLC_PRG/output",
  pressure_node_1: "ns=2;s=testbench/sensors/pressure",
  pressure_node_2: "",
  flow_node_1: "ns=2;s=testbench/sensors/flow",
  flow_node_2: "",
  command_node_1: "ns=2;s=testbench/sensors/command",
  feedback_node_1: "ns=2;s=testbench/sensors/feedback",
  command_node_2: "", feedback_node_2: "",
  command_node_3: "", feedback_node_3: "",
  command_node_4: "", feedback_node_4: "",
  command_node_5: "", feedback_node_5: "",
  command_node_6: "", feedback_node_6: "",
})

function isLiveNode(key) {
  const val = liveValues[key]
  return val !== null && val !== undefined && val !== "-"
}

async function pollLiveTelemetry() {
  try {
    const res = await fetchOpcData()
    if (res.data) {
      const d = res.data
      liveValues.pressure_1 = d.pressure != null ? Number(d.pressure).toFixed(1) : "-"
      liveValues.pressure_2 = d.pressure_2 != null ? Number(d.pressure_2).toFixed(1) : "-"
      liveValues.flow_1 = d.flow != null ? Number(d.flow).toFixed(1) : "-"
      liveValues.flow_2 = d.flow_2 != null ? Number(d.flow_2).toFixed(1) : "-"

      liveValues.command_1 = d.command != null ? Number(d.command).toFixed(1) : "-"
      liveValues.feedback_1 = d.feedback != null ? Number(d.feedback).toFixed(1) : "-"

      for (let ch = 2; ch <= 6; ch++) {
        liveValues[`command_${ch}`] = d[`command_${ch}`] != null ? Number(d[`command_${ch}`]).toFixed(1) : "-"
        liveValues[`feedback_${ch}`] = d[`feedback_${ch}`] != null ? Number(d[`feedback_${ch}`]).toFixed(1) : "-"
      }

      liveValues.output_trigger = d.output != null ? (d.output ? "TRUE" : "FALSE") : "-"
      liveValues.hpu_status = d.hpu_active != null ? (d.hpu_active ? "ACTIVE" : "OFF") : "-"
    }
  } catch (e) {}
}

async function fetchSettings() {
  try {
    const res = await api.get("/settings")
    if (res.data) {
      Object.assign(settings, res.data)
      if (!settings.pressure_node_1 && res.data.pressure_node_id) {
        settings.pressure_node_1 = res.data.pressure_node_id
      }
      if (!settings.flow_node_1 && res.data.flow_node_id) {
        settings.flow_node_1 = res.data.flow_node_id
      }
      if (!settings.command_node_1 && res.data.command_node_id) {
        settings.command_node_1 = res.data.command_node_id
      }
      if (!settings.feedback_node_1 && res.data.feedback_node_id) {
        settings.feedback_node_1 = res.data.feedback_node_id
      }
    }
    const statusRes = await api.get("/opcua/status")
    isConnected.value = statusRes.data?.connected || false
  } catch (err) {
    console.error("Failed to load settings:", err)
  }
}

async function saveSettings() {
  isSaving.value = true
  try {
    await api.put("/settings", settings)
    toast.add({
      severity: "success",
      summary: "Settings Saved",
      detail: "OPC UA connection and node mapping updated.",
      life: 2500,
    })
  } catch (err) {
    toast.add({
      severity: "error",
      summary: "Save Failed",
      detail: "Could not persist system settings.",
      life: 3000,
    })
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  fetchSettings()
  pollingTimer = setInterval(pollLiveTelemetry, 1000)
})

onBeforeUnmount(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})
</script>

<style scoped>
.settings-page {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem;
  overflow-y: auto;
  gap: 0.75rem;
  box-sizing: border-box;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
}

.header-title h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-color);
  letter-spacing: -0.01em;
}

.subtitle {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.connection-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #ef4444;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.connection-status-pill.connected {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #10b981;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.save-btn {
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
}

/* Master Grid */
.settings-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  align-items: start; /* Prevents awkward stretching */
}

.grid-column {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

/* Panel Cards */
.panel-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.75rem 0.95rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--primary-color);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.35rem;
  margin-bottom: 0.1rem;
}

.card-title i {
  font-size: 0.85rem;
}

.form-row {
  display: flex;
  gap: 0.6rem;
  width: 100%;
}

.form-row.full .field {
  width: 100%;
}

.form-row.dual .field,
.form-row.dual .node-field-group {
  flex: 1;
  min-width: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.field label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
}


.full-width {
  width: 100% !important;
  box-sizing: border-box;
}

:deep(.p-password) {
  display: flex;
  width: 100%;
}

:deep(.p-password-input) {
  width: 100% !important;
  font-size: 0.76rem !important;
  padding: 0.3rem 0.5rem !important;
}

:deep(.p-dropdown) {
  width: 100%;
  font-size: 0.76rem;
}

/* Live Telemetry Node Fields */
.node-field-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.field-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-meta label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}

.live-dot.ok {
  background: #10b981;
}

.node-input-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
}

.live-pill {
  min-width: 44px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-family: Consolas, monospace;
  font-weight: 600;
  color: var(--primary-color);
  background: rgba(0, 204, 255, 0.05);
  flex-shrink: 0;
  padding: 0 0.3rem;
}

.live-pill.mini {
  min-width: 34px;
  height: 26px;
  font-size: 0.68rem;
}

.node-input {
  flex: 1;
  min-width: 0;
  font-family: Consolas, monospace;
  font-size: 0.74rem !important;
  padding: 0.28rem 0.45rem !important;
}

/* 6-Channel Matrix */
.channel-matrix-card {
  height: auto;
}

.channels-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.15rem 0.25rem;
}

.col-lbl {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
}

.ch-col {
  width: 22px;
  text-align: center;
}

.node-col {
  flex: 1;
  min-width: 0;
}

.channels-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.channel-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.ch-badge {
  width: 22px;
  height: 26px;
  border-radius: 4px;
  background: rgba(0, 43, 73, 0.2);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--primary-color);
  font-family: Consolas, monospace;
  flex-shrink: 0;
}

.channel-node-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.ch-input {
  flex: 1;
  min-width: 0;
  font-family: Consolas, monospace;
  font-size: 0.73rem !important;
  padding: 0.28rem 0.45rem !important;
}

:deep(.p-inputtext-sm) {
  font-size: 0.75rem;
  padding: 0.3rem 0.45rem;
}

/* ============================================================
   RESPONSIVE: iPad & Tablet Portrait (< 1120px)
   ============================================================ */
@media (max-width: 1120px) {
  .settings-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .settings-page {
    overflow-y: auto;
  }

  .form-row.dual {
    flex-direction: row;
  }
}

@media (max-width: 640px) {
  .form-row.dual {
    flex-direction: column;
  }
}
</style>