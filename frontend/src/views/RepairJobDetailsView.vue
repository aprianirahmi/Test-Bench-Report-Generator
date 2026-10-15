<script setup>
import { ref, computed, onMounted, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import api from "../services/api"
import { assetUrl, formatDate, formatDateTime } from "../utils/format"
import AutoComplete from "primevue/autocomplete"
import Button from "primevue/button"
import Tabs from "primevue/tabs"
import TabList from "primevue/tablist"
import Tab from "primevue/tab"
import TabPanels from "primevue/tabpanels"
import TabPanel from "primevue/tabpanel"
import Dialog from "primevue/dialog"
import ConfirmDialog from "primevue/confirmdialog"
import { useConfirm } from "primevue/useconfirm"
import { useToast } from "primevue/usetoast"
import { useAuthStore } from "../stores/auth"
import { confirmDeleteRecord } from "../utils/recordDelete"

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const authStore = useAuthStore()

const jobs = ref([])
const job = ref(null)
const records = ref([])
const query = ref("")
const suggestions = ref([])
const pending = ref(null)

async function loadJobs() {
  const res = await api.get("/repair-jobs")
  jobs.value = Array.isArray(res.data) ? res.data : []
}
async function loadJob(id) {
  const found = jobs.value.find((j) => String(j.id) === String(id))
  job.value = found || (await api.get(`/repair-jobs/${id}`)).data
  const res = await api.get("/records")
  records.value = (Array.isArray(res.data) ? res.data : []).filter((r) => r.repair_job_id === job.value.id)
}
function search(e) {
  const q = String(e.query || "").trim().toLowerCase()
  suggestions.value = jobs.value.filter((j) =>
    [j.job_number, j.job_name, j.serial_number, j.customer, j.valve_type].some((v) => v && String(v).toLowerCase().includes(q)),
  )
}
function confirmShow() {
  if (pending.value) router.replace({ name: "repair-job-details", params: { id: pending.value.id } })
}

const imageUrl = computed(() => assetUrl(job.value?.image_path))
const datasheetUrl = computed(() => assetUrl(job.value?.datasheet_path))
const isPdf = computed(() => /\.pdf$/i.test(job.value?.datasheet_path || ""))
const sampleCount = (r) => { try { return JSON.parse(r.data_payload).length } catch { return "-" } }
const dash = (v) => (v === null || v === undefined || v === "" || v === 0 ? "-" : v)

// The datasheet opens in an in-app viewer. window.open() does not work in the
// desktop app: the new window is not served by the app, so the URL lands on
// whatever web server runs on the PC (IIS showed 404). The viewer's own toolbar
// still offers zoom, print and save.
const pdfViewer = ref(false)
function openDatasheet() { if (datasheetUrl.value) pdfViewer.value = true }
function deleteRecord(r) {
  confirmDeleteRecord({
    confirm,
    toast,
    record: r,
    label: formatDateTime(r.created_at),
    onDeleted: () => { records.value = records.value.filter((x) => x.id !== r.id) },
  })
}
function openReport(r) { router.push({ name: "generate-report", query: { job: job.value.id, record: r.id } }) }
function openRecords() { router.push({ name: "records", query: { job: job.value.id } }) }

onMounted(async () => {
  await loadJobs()
  if (route.params.id) await loadJob(route.params.id)
})
watch(() => route.params.id, (id) => { if (id) loadJob(id) })
</script>

<template>
  <div class="jd-page">
    <ConfirmDialog />
    <header class="jd-toolbar">
      <div class="jd-search">
        <AutoComplete
          v-model="query"
          :suggestions="suggestions"
          optionLabel="job_number"
          placeholder="Search Job No., Serial No., Customer, or Valve Type..."
          class="jd-ac"
          @complete="search"
          @item-select="(e) => (pending = e.value)"
        >
          <template #option="{ option }">
            <div class="opt">
              <strong>{{ option.job_number }}</strong>
              <small>{{ option.job_name }} · {{ option.serial_number || "-" }} · {{ option.customer || "-" }}</small>
            </div>
          </template>
        </AutoComplete>
        <Button label="Show Job" icon="pi pi-search" :disabled="!pending" @click="confirmShow" />
      </div>
      <div v-if="job" class="jd-actions">
        <Button label="Open in Records" icon="pi pi-chart-line" severity="secondary" size="small" @click="openRecords" />
        <Button label="Back to List" icon="pi pi-list" text size="small" @click="router.push({ name: 'repair-jobs' })" />
      </div>
    </header>

    <div v-if="!job" class="jd-empty">
      <i class="pi pi-wrench"></i>
      <h3>No Repair Job Selected</h3>
      <p>Search a job above, or open one from the Repair Job List.</p>
    </div>

    <div v-else class="jd-grid">
      <section class="jd-overview">
        <div class="image-box">
          <img v-if="imageUrl" :src="imageUrl" :alt="job.valve_type" />
          <div v-else class="ph"><i class="pi pi-image"></i><span>No Image Uploaded</span></div>
        </div>
        <div>
          <div class="jobno">{{ job.job_number }}</div>
          <div class="jobname">{{ job.job_name }}</div>
          <div class="tags">
            <span class="badge badge-brand">{{ job.manufacturer || "-" }}</span>
            <span class="badge">{{ job.valve_type || "Type -" }}</span>
            <span class="badge">NG {{ dash(job.size_ng) }}</span>
          </div>
        </div>
        <div class="ov-actions">
          <Button label="Open PDF Datasheet" icon="pi pi-file-pdf" severity="secondary" class="w100" :disabled="!datasheetUrl" @click="openDatasheet" />
        </div>
      </section>

      <main class="jd-main">
        <div class="cards">
          <article class="spec-card">
            <header class="spec-header"><div class="ht"><i class="pi pi-briefcase"></i><h3>Job Information</h3></div></header>
            <div class="spec-table">
              <div class="spec-item"><span class="label">Customer</span><span class="value plain">{{ dash(job.customer) }}</span></div>
              <div class="spec-item"><span class="label">Job Date</span><span class="value">{{ formatDate(job.job_date) }}</span></div>
              <div class="spec-item"><span class="label">SO Number</span><span class="value">{{ dash(job.so_number) }}</span></div>
              <div class="spec-item"><span class="label">Serial Number</span><span class="value">{{ dash(job.serial_number) }}</span></div>
              <div class="spec-item"><span class="label">Material Number</span><span class="value">{{ dash(job.material_number) }}</span></div>
            </div>
          </article>
          <article class="spec-card">
            <header class="spec-header"><div class="ht"><i class="pi pi-sliders-h"></i><h3>Valve Specification</h3></div></header>
            <div class="spec-table">
              <div class="spec-item"><span class="label">Max Pressure</span><span class="value">{{ dash(job.max_pressure) }} <small>bar</small></span></div>
              <div class="spec-item"><span class="label">Rated Flow</span><span class="value">{{ dash(job.rated_flow) }} <small>L/min</small></span></div>
              <div class="spec-item"><span class="label">Max Flow</span><span class="value">{{ dash(job.max_flow) }} <small>L/min</small></span></div>
              <div class="spec-item"><span class="label">Weight</span><span class="value">{{ dash(job.weight) }} <small>kg</small></span></div>
              <div class="spec-item"><span class="label">Command Type</span><span class="value plain">{{ dash(job.command_type) }}</span></div>
            </div>
          </article>
        </div>

        <section class="tabs-card">
          <Tabs value="ds">
            <TabList>
              <Tab value="ds"><i class="pi pi-file-pdf"></i>&nbsp; Datasheet</Tab>
              <Tab value="rec"><i class="pi pi-database"></i>&nbsp; Test Records ({{ records.length }})</Tab>
            </TabList>
            <TabPanels>
              <TabPanel value="ds">
                <div v-if="datasheetUrl" class="ds-frame">
                  <iframe v-if="isPdf" :src="datasheetUrl + '#toolbar=0&view=FitH'" title="Datasheet"></iframe>
                  <img v-else :src="datasheetUrl" alt="Datasheet preview" />
                </div>
                <div v-else class="ds-none"><i class="pi pi-file-pdf"></i><span>No datasheet uploaded for this job. Add one from Edit on the Repair Job List.</span></div>
              </TabPanel>
              <TabPanel value="rec">
                <table class="rec-table" v-if="records.length">
                  <thead><tr><th>Recorded</th><th>Recorded by</th><th>Mode</th><th class="r">Samples</th><th>Report</th><th class="r">Action</th></tr></thead>
                  <tbody>
                    <tr v-for="r in records" :key="r.id">
                      <td>{{ formatDateTime(r.created_at) }}</td>
                      <td>{{ r.recorded_by || "-" }}</td>
                      <td>{{ r.test_mode === "repair_job" ? "Repair Job" : r.test_mode || "-" }}</td>
                      <td class="r mono">{{ sampleCount(r) }}</td>
                      <td>
                        <span v-if="r.report_status" class="rep-badge" :class="r.report_status" :title="`${r.report_doc_number} · ${r.report_operator}`">{{ r.report_status }}</span>
                        <span v-else class="rep-none">Not generated</span>
                      </td>
                      <td class="r">
                        <Button label="Generate Report" icon="pi pi-file-pdf" size="small" text @click="openReport(r)" />
                        <Button v-if="authStore.isAdmin" icon="pi pi-trash" size="small" severity="danger" text title="Delete record" @click="deleteRecord(r)" />
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-else class="ds-none"><i class="pi pi-database"></i><span>No test records yet for this job.</span></div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </section>
      </main>
    </div>

    <Dialog
      v-model:visible="pdfViewer"
      modal
      maximizable
      :header="job ? `Datasheet — ${job.job_number}` : 'Datasheet'"
      :style="{ width: '92vw', height: '90vh' }"
      :contentStyle="{ padding: 0, height: '100%' }"
      class="pdf-viewer-dialog"
    >
      <iframe v-if="pdfViewer && isPdf" :src="datasheetUrl + '#view=FitH'" class="pdf-viewer-frame" title="Datasheet viewer"></iframe>
      <img v-else-if="pdfViewer" :src="datasheetUrl" class="pdf-viewer-img" alt="Datasheet" />
    </Dialog>
  </div>
</template>

<style scoped>
.pdf-viewer-frame { display: block; width: 100%; height: 100%; min-height: 70vh; border: 0; }
.pdf-viewer-img { display: block; max-width: 100%; margin: 0 auto; }
.jd-page { height: 100%; display: flex; flex-direction: column; gap: 1rem; overflow: hidden; }
.jd-toolbar { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.6rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-shrink: 0; flex-wrap: wrap; }
.jd-search { display: flex; gap: 0.75rem; flex: 1 1 380px; max-width: 560px; }
.jd-ac { flex: 1; min-width: 0; }
.jd-ac :deep(.p-inputtext) { width: 100%; }
.jd-actions { display: flex; gap: 0.4rem; }
.opt { display: flex; flex-direction: column; gap: 0.15rem; }
.opt small { color: var(--text-muted); }
.jd-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dashed var(--border-color); border-radius: 8px; padding: 3rem; text-align: center; }
.jd-empty i { font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem; }
.jd-empty h3 { margin: 0 0 0.5rem; color: var(--text-color); }
.jd-empty p { margin: 0; color: var(--text-muted); }
.jd-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 1rem; }
.jd-overview { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 1.1rem; display: flex; flex-direction: column; gap: 1rem; min-height: 0; overflow-y: auto; }
.image-box { width: 100%; height: 200px; flex-shrink: 0; background: rgba(0,0,0,0.06); border: 1px solid var(--border-color); border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 0.6rem; }
.image-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
.ph { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; color: var(--text-muted); font-size: 0.85rem; }
.ph i { font-size: 2.2rem; }
.jobno { font-family: Consolas, Monaco, monospace; font-weight: 700; font-size: 1.3rem; color: var(--text-color); }
.jobname { margin: 0.25rem 0 0.6rem; color: var(--text-muted); font-size: 0.9rem; }
.tags { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.badge { background: rgba(148,163,184,0.15); color: var(--text-color); font-size: 0.72rem; font-weight: 600; padding: 0.25rem 0.55rem; border-radius: 4px; }
.badge-brand { background: var(--primary-color); color: #fff; }
.ov-actions { margin-top: auto; }
.w100 { width: 100%; justify-content: center; }
.jd-main { display: flex; flex-direction: column; gap: 1rem; min-height: 0; min-width: 0; overflow-y: auto; padding-right: 0.25rem; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; flex-shrink: 0; }
.spec-card, .tabs-card { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; }
.spec-header { display: flex; align-items: center; padding: 0.55rem 1rem; background: rgba(148,163,184,0.08); border-bottom: 1px solid var(--border-color); }
.ht { display: flex; align-items: center; gap: 0.5rem; color: var(--primary-color); }
.ht h3 { margin: 0; font-size: 0.92rem; font-weight: 600; color: var(--text-color); }
.spec-table { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0.75rem 1rem; gap: 0.8rem 1.2rem; }
.spec-item { display: flex; flex-direction: column; gap: 0.2rem; border-bottom: 1px solid rgba(148,163,184,0.15); padding-bottom: 0.4rem; min-width: 0; }
.spec-item .label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.spec-item .value { font-size: 0.98rem; font-weight: 600; color: var(--text-color); font-family: Consolas, Monaco, monospace; overflow-wrap: anywhere; }
.spec-item .value.plain { font-family: inherit; font-size: 0.92rem; }
.spec-item .value small { font-size: 0.72rem; color: var(--text-muted); font-weight: normal; }
.tabs-card { flex: 1; min-height: 320px; display: flex; flex-direction: column; }
.tabs-card :deep(.p-tabs) { display: flex; flex-direction: column; flex: 1; min-height: 0; background: transparent; }
.tabs-card :deep(.p-tabpanels) { flex: 1; min-height: 0; padding: 0.75rem; background: transparent; }
.tabs-card :deep(.p-tabpanel) { height: 100%; }
.ds-frame { height: 100%; min-height: 260px; border: 1px solid var(--border-color); border-radius: 4px; overflow: auto; background: #e9edf1; display: flex; justify-content: center; }
.ds-frame iframe { width: 100%; height: 100%; border: 0; min-height: 260px; }
.ds-frame img { width: 100%; height: auto; align-self: flex-start; }
.ds-none { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2.5rem 1rem; color: var(--text-muted); text-align: center; font-size: 0.88rem; }
.ds-none i { font-size: 2rem; }
.rec-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.rec-table th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted); padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--border-color); }
.rec-table td { padding: 0.5rem 0.6rem; border-bottom: 1px solid rgba(148,163,184,0.15); }
.rec-table .r { text-align: right; white-space: nowrap; }
.rep-badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 700; color: #fff; background: #64748b; }
.rep-badge.OK { background: #16a34a; }
.rep-badge.NOK { background: #dc2626; }
.rep-badge.CALIBRATION { background: #d97706; }
.rep-none { font-size: 0.75rem; color: var(--text-muted); }
.mono { font-family: Consolas, Monaco, monospace; }
@media (max-width: 900px) {
  .jd-grid { grid-template-columns: 240px minmax(0, 1fr); }
  .cards { grid-template-columns: minmax(0, 1fr); }
  .image-box { height: 150px; }
  .jobno { font-size: 1.1rem; }
}
@media (max-width: 700px) {
  .jd-grid { grid-template-columns: 1fr; overflow-y: auto; }
  .jd-main { overflow-y: visible; }
}
</style>
