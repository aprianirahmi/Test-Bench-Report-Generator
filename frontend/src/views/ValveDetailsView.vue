<script setup>
import { ref, computed, onMounted, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import api from "../services/api"
import { useValveStore } from "../stores/valve"
import AutoComplete from "primevue/autocomplete"
import Button from "primevue/button"

const route = useRoute()
const router = useRouter()
const valveStore = useValveStore()
const valve = computed(() => valveStore.selectedValve)

const allValves = ref([])
const query = ref("")
const suggestions = ref([])
const pendingValve = ref(null)

async function loadValves() {
  try {
    const res = await api.get("/valves")
    allValves.value = Array.isArray(res.data) ? res.data : []
  } catch (error) {
    console.error("Failed to load valve list:", error)
  }
}

async function fetchValveById(id) {
  if (!id) return
  try {
    const res = await api.get(`/valves/${id}`)
    valveStore.selectValve(res.data)
  } catch (error) {
    console.error("Failed to get valve details:", error)
  }
}

function search(event) {
  const q = String(event.query || "").trim().toLowerCase()
  suggestions.value = allValves.value.filter((v) =>
    (v.part_number && v.part_number.toLowerCase().includes(q)) ||
    (v.manufacturer && v.manufacturer.toLowerCase().includes(q))
  )
}

function onSelect(event) {
  pendingValve.value = event.value
}

function confirmShow() {
  if (pendingValve.value) {
    valveStore.selectValve(pendingValve.value)
    router.replace({ name: 'valve-details', params: { id: pendingValve.value.id } })
  }
}

function openDatasheet() {
  if (!datasheetUrl.value) return
  window.open(datasheetUrl.value, "_blank", "noopener")
}

function goToRecords() {
  if (valve.value) {
    router.push({ name: 'records', params: { id: valve.value.id } })
  }
}

const imageUrl = computed(() => {
  if (!valve.value?.image_path) return null
  if (valve.value.image_path.startsWith("http")) return valve.value.image_path
  const base = import.meta.env.VITE_API_URL || ""
  return `${base}${valve.value.image_path}`
})

const datasheetUrl = computed(() => {
  if (!valve.value?.datasheet_path) return null
  if (valve.value.datasheet_path.startsWith("http")) return valve.value.datasheet_path
  const base = import.meta.env.VITE_API_URL || ""
  return `${base}${valve.value.datasheet_path}`
})


const formattedCommandRange = computed(() => {
  if (valve.value?.command_value == null) return "-"
  
  const valStr = String(valve.value.command_value)
  const type = String(valve.value.command_type || "").toLowerCase()

  if (type.includes("current") || type.includes("ma")) {
    return valStr.includes("mA") ? valStr : `${valStr} mA`
  }
  if (type.includes("volt") || type.includes("v")) {
    return valStr.includes("V") ? valStr : `${valStr} V`
  }
  return valStr
})

onMounted(() => {
  loadValves()
  if (route.params.id) {
    fetchValveById(route.params.id)
  }
})

watch(
  () => route.params.id,
  (newId) => {
    if (newId) fetchValveById(newId)
  }
)
</script>

<template>
  <div class="valve-details-page">
    <!-- Top Search Toolbar -->
    <header class="search-toolbar">
      <div class="search-input-group">
        <AutoComplete
          v-model="query"
          :suggestions="suggestions"
          optionLabel="part_number"
          placeholder="Search by Part Number or Manufacturer..."
          class="valve-search"
          @complete="search"
          @item-select="onSelect"
        >
          <template #option="slotProps">
            <div class="option-row">
              <strong>{{ slotProps.option.part_number }}</strong>
              <small>{{ slotProps.option.manufacturer || "-" }} · {{ slotProps.option.valve_type || "-" }}</small>
            </div>
          </template>
        </AutoComplete>
        <Button
          label="Show Valve"
          icon="pi pi-search"
          :disabled="!pendingValve"
          @click="confirmShow"
        />
      </div>
      <div v-if="valve" class="quick-status-chip">
        <span class="status-indicator"></span>
        <span>Active Specification</span>
      </div>
    </header>

    <!-- Empty State -->
    <div v-if="!valve" class="empty-state">
      <i class="pi pi-box"></i>
      <h3>No Valve Selected</h3>
      <p>Select a part number from the search bar above to view complete engineering parameters.</p>
    </div>

    <!-- Active Valve Content Layout -->
    <div v-else class="details-content-grid">
      <!-- Left Column: Visual Card -->
      <section class="overview-panel">
        <div class="image-box">
          <img v-if="imageUrl" :src="imageUrl" :alt="valve.part_number" class="valve-img" />
          <div v-else class="image-placeholder">
            <i class="pi pi-image"></i>
            <span>No Image Uploaded</span>
          </div>
        </div>

        <div class="valve-identity">
          <h2>{{ valve.part_number }}</h2>
          <div class="tags-row">
            <span class="badge badge-brand">{{ valve.manufacturer || "Bosch Rexroth" }}</span>
            <span class="badge">{{ valve.component_series || "Series -" }}</span>
            <span class="badge">{{ valve.valve_type || "Type -" }}</span>
          </div>
        </div>

        <div class="overview-actions">
          <Button
            label="View PDF Datasheet"
            icon="pi pi-file-pdf"
            severity="secondary"
            class="action-btn"
            :disabled="!datasheetUrl"
            @click="openDatasheet"
          />
          <Button
            label="Open in Test Workspace"
            icon="pi pi-chart-line"
            class="action-btn"
            @click="goToRecords"
          />
        </div>
      </section>

      <!-- Right Column: Structured Specification Grids -->
      <main class="specifications-panel">
        <!-- Hydraulic Parameters -->
        <article class="spec-card">
          <header class="spec-header">
            <div class="header-title">
              <i class="pi pi-sliders-h"></i>
              <h3>Hydraulic Parameters</h3>
            </div>
            <span class="spec-meta">Nominal & Maximum Ratings</span>
          </header>

          <div class="spec-table">
            <div class="spec-item">
              <span class="label">Max Operating Pressure</span>
              <span class="value">{{ valve.max_pressure != null ? valve.max_pressure : "-" }} <small>bar</small></span>
            </div>
            <div class="spec-item">
              <span class="label">Rated Flow</span>
              <span class="value">{{ valve.rated_flow != null ? valve.rated_flow : "-" }} <small>L/min</small></span>
            </div>
            <div class="spec-item">
              <span class="label">Maximum Flow</span>
              <span class="value">{{ valve.max_flow != null ? valve.max_flow : "-" }} <small>L/min</small></span>
            </div>
            <div class="spec-item">
              <span class="label">Size NG</span>
              <span class="value">NG {{ valve.size_ng != null ? valve.size_ng : "-" }}</span>
            </div>
            <div class="spec-item">
              <span class="label">Unit Weight</span>
              <span class="value">{{ valve.weight != null ? valve.weight : "-" }} <small>kg</small></span>
            </div>
          </div>
        </article>

        <!-- Electrical & Control Parameters -->
        <article class="spec-card">
          <header class="spec-header">
            <div class="header-title">
              <i class="pi pi-bolt"></i>
              <h3>Electrical & Actuation</h3>
            </div>
            <span class="spec-meta">Control Signal & Supply</span>
          </header>

          <div class="spec-table">
            <div class="spec-item">
              <span class="label">Supply / Operating Voltage</span>
              <span class="value">{{ valve.supply_voltage || "24" }} <small>V DC</small></span>
            </div>
            <div class="spec-item">
              <span class="label">Analog Command Type</span>
              <span class="value">{{ valve.command_type || "Voltage" }}</span>
            </div>
            <div class="spec-item">
              <span class="label">Command Range / Value</span>
              <span class="value">{{ formattedCommandRange }}</span>
            </div>
            <div class="spec-item">
              <span class="label">Permissible Ripple</span>
              <span class="value">&le; 2 <small>Vpp</small></span>
            </div>
            <div class="spec-item">
              <span class="label">Protection Class</span>
              <span class="value">IP 65</span>
            </div>
          </div>
        </article>
      </main>
    </div>
  </div>
</template>

<style scoped>
.valve-details-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
}

/* Toolbar */
.search-toolbar {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.6rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.search-input-group {
  display: flex;
  gap: 0.75rem;
  width: 100%;
  max-width: 520px;
}

.valve-search {
  flex: 1;
}

.valve-search :deep(.p-inputtext) {
  width: 100%;
}

.option-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.option-row small {
  color: var(--text-muted);
}

.quick-status-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rexroth-6);
  box-shadow: 0 0 8px rgba(0, 200, 247, 0.45);
}

/* Empty State */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  padding: 3rem;
  text-align: center;
}

.empty-state i {
  font-size: 3rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.empty-state h3 {
  margin: 0 0 0.5rem 0;
  color: var(--text-color);
}

.empty-state p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}

/* 2-Column Content Layout */
.details-content-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 1rem;
}

/* Left Overview Panel */
.overview-panel {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
}

.image-box {
  width: 100%;
  height: 220px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 0.75rem;
}

.p-dark .image-box {
  background: rgba(0, 0, 0, 0.25);
}

.valve-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.image-placeholder i {
  font-size: 2.2rem;
}

.valve-identity h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.4rem;
  color: var(--text-color);
  letter-spacing: -0.01em;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.badge {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-color);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 4px;
}

.badge-brand {
  background: var(--primary-color);
  color: #fff;
}

.p-dark .badge-brand {
  color: var(--rexroth-3);
}

.overview-actions {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-top: auto;
}

.action-btn {
  width: 100%;
  justify-content: center;
}

/* Right Specifications Panel */
.specifications-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  min-height: 0;
  padding-right: 0.25rem;
}

.spec-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.spec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.65rem 1rem;
  background: rgba(148, 163, 184, 0.08);
  border-bottom: 1px solid var(--border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--primary-color);
}

.header-title i {
  font-size: 1rem;
}

.header-title h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
}

.spec-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Specification Item Grid */
.spec-table {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  padding: 0.85rem 1rem;
  gap: 1.15rem 1.5rem;
}

.spec-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  padding-bottom: 0.5rem;
}

.spec-item .label {
  font-size: 0.74rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.spec-item .value {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-color);
  font-family: Consolas, Monaco, monospace;
}

.spec-item .value small {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: normal;
  margin-left: 0.15rem;
}

@media (max-width: 900px) {
  .details-content-grid {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .specifications-panel {
    overflow-y: visible;
  }
}
</style>