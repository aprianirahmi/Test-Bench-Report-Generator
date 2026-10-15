<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api, { uploadValveImage, uploadValveDatasheet } from '../services/api'
import { FilterMatchMode } from '@primevue/core/api'
import { useValveStore } from '../stores/valve'
import { useAuthStore } from '../stores/auth'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import FileUpload from 'primevue/fileupload'
import Dropdown from 'primevue/dropdown'

const router = useRouter()
const valveStore = useValveStore()
const authStore = useAuthStore()
const toast = useToast()
const confirm = useConfirm()

const valves = ref([])
const loading = ref(true)
const filters = ref({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})
const dialogVisible = ref(false)
const selectedFile = ref(null)
const selectedDatasheetFile = ref(null)
const editingId = ref(null)

const emptyForm = {
  manufacturer: '',
  part_number: '',
  component_series: '',
  valve_type: '',
  size_ng: null,
  weight: null,
  rated_flow: null,
  max_flow: null,
  command_type: 'Voltage (0-10V)',
  max_pressure: null
} 

const commandTypeOptions = [
  'Voltage (0-10V)',
  'Voltage (±10V)',
  'Current (4-20mA)',
  'Current (0-20mA)',
  'Current (0-1300mA)'
] 

const form = reactive({ ...emptyForm })
const errors = reactive({})

function validateForm() {
  Object.keys(errors).forEach(key => delete errors[key])

  if (!form.manufacturer?.trim()) errors.manufacturer = 'Manufacturer is required'
  if (!form.part_number?.trim()) errors.part_number = 'Part Number is required'
  if (!form.component_series?.trim()) errors.component_series = 'Series is required'
  if (!form.valve_type?.trim()) errors.valve_type = 'Type is required'
  if (form.size_ng === null || form.size_ng === undefined) errors.size_ng = 'Size NG is required'
  if (form.max_pressure === null || form.max_pressure === undefined) errors.max_pressure = 'Max Pressure is required'

  return Object.keys(errors).length === 0
}

async function fetchValves() {
  try {
    loading.value = true
    const response = await api.get('/valves')
    valves.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('Failed to fetch valve data:', error)
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  editingId.value = null
  Object.assign(form, emptyForm)
  Object.keys(errors).forEach(key => delete errors[key])
  selectedFile.value = null
  selectedDatasheetFile.value = null
  dialogVisible.value = true
}

function openEditDialog(valve) {
  editingId.value = valve.id
  Object.assign(form, valve)
  Object.keys(errors).forEach(key => delete errors[key])
  selectedFile.value = null
  selectedDatasheetFile.value = null
  dialogVisible.value = true
}

function viewDetail(valve) {
  valveStore.selectValve(valve)
  router.push({ name: 'valve-details', params: { id: valve.id } })
}

async function handleSubmit() {
  if (!validateForm()) {
    toast.add({ severity: 'warn', summary: 'Incomplete Form', detail: 'Please fill in all mandatory fields.', life: 3000 })
    return
  }

  try {
    let valveId = editingId.value
    if (editingId.value) {
      await api.put(`/valves/${editingId.value}`, form)
    } else {
      const response = await api.post('/valves', form)
      valveId = response.data.id
    }

    if (selectedFile.value) {
      await uploadValveImage(valveId, selectedFile.value)
    }
    if (selectedDatasheetFile.value) {
      await uploadValveDatasheet(valveId, selectedDatasheetFile.value)
    }

    toast.add({ severity: 'success', summary: 'Success', detail: 'Valve record saved successfully.', life: 3000 })
    dialogVisible.value = false
    await fetchValves()
  } catch (error) {
    console.error('Save error:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save valve.', life: 3000 })
  }
}

function confirmDelete(valve) {
  confirm.require({
    message: `Are you sure you want to delete valve "${valve.part_number}"?`,
    header: 'Confirm Deletion',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.delete(`/valves/${valve.id}`)
        toast.add({ severity: 'success', summary: 'Deleted', detail: 'Valve removed.', life: 3000 })
        await fetchValves()
      } catch (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete valve.', life: 3000 })
      }
    }
  })
}

onMounted(fetchValves)
</script>

<template>
  <div class="valve-list-page">
    <ConfirmDialog />

    <header class="list-toolbar">
      <div class="toolbar-left">
        <IconField class="search-field">
          <InputIcon class="pi pi-search" />
          <InputText v-model="filters.global.value" placeholder="Search Part Number, Series, or Type..." />
        </IconField>
      </div>
      <div class="toolbar-right">
        <Button v-if="authStore.isAdmin" label="Add New Valve" icon="pi pi-plus" class="btn-primary" @click="openCreateDialog" />
      </div>
    </header>

    <div class="table-container">
      <DataTable
        :value="valves"
        :loading="loading"
        stripedRows
        :filters="filters"
        @update:filters="filters = $event"
        :globalFilterFields="['manufacturer', 'part_number', 'component_series', 'valve_type']"
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 20, 50]"
        sortMode="multiple"
        scrollable
        scrollHeight="flex"
        class="valve-table"
      >
        <Column field="part_number" header="Part Number" sortable style="min-width: 140px">
          <template #body="{ data }">
            <span class="mono-bold">{{ data.part_number }}</span>
          </template>
        </Column>
        <Column field="manufacturer" header="Manufacturer" sortable />
        <Column field="component_series" header="Series" sortable style="width: 90px" />
        <Column field="valve_type" header="Type" sortable style="width: 100px" />
        <Column field="size_ng" header="NG" sortable style="width: 80px">
          <template #body="{ data }">
            <span>NG {{ data.size_ng }}</span>
          </template>
        </Column>
        <Column field="max_pressure" header="Max Pressure" sortable style="min-width: 120px">
          <template #body="{ data }">
            <span class="mono-val">{{ data.max_pressure }} <small>bar</small></span>
          </template>
        </Column>
        <Column field="rated_flow" header="Rated Flow" sortable style="min-width: 110px">
          <template #body="{ data }">
            <span class="mono-val">{{ data.rated_flow }} <small>L/min</small></span>
          </template>
        </Column>
        <Column field="command_type" header="Command Interface" sortable style="min-width: 140px">
          <template #body="{ data }">
            <span>{{ data.command_type || 'Voltage' }}</span>
          </template>
        </Column>
        <Column header="Actions" :exportable="false" frozen alignFrozen="right" style="min-width: 140px; text-align: right">
          <template #body="{ data }">
            <div class="action-buttons">
              <Button icon="pi pi-eye" severity="secondary" text title="View Details" @click="viewDetail(data)" />
              <Button v-if="authStore.isAdmin" icon="pi pi-pencil" severity="secondary" text title="Edit" @click="openEditDialog(data)" />
              <Button v-if="authStore.isAdmin" icon="pi pi-trash" severity="danger" text title="Delete" @click="confirmDelete(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- 2-Column Responsive Form Dialog -->
    <Dialog :visible="dialogVisible" :header="editingId ? 'Edit Valve Specification' : 'Add Valve to Database'" :modal="true" :style="{ width: '52rem' }" @update:visible="dialogVisible = $event">
      <div class="dialog-grid">
        <!-- Col 1: Identification & Hydraulic -->
        <fieldset class="form-section">
          <legend>Identification & Hydraulics</legend>
          <div class="field">
            <label>Manufacturer *</label>
            <InputText v-model="form.manufacturer" :invalid="!!errors.manufacturer" />
          </div>
          <div class="field">
            <label>Part Number *</label>
            <InputText v-model="form.part_number" :invalid="!!errors.part_number" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Series *</label>
              <InputText v-model="form.component_series" :invalid="!!errors.component_series" />
            </div>
            <div class="field">
              <label>Valve Type *</label>
              <InputText v-model="form.valve_type" :invalid="!!errors.valve_type" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Size NG *</label>
              <InputNumber v-model="form.size_ng" :invalid="!!errors.size_ng" />
            </div>
            <div class="field">
              <label>Weight (kg)</label>
              <InputNumber v-model="form.weight" :maxFractionDigits="2" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Rated Flow (L/min)</label>
              <InputNumber v-model="form.rated_flow" :maxFractionDigits="2" />
            </div>
            <div class="field">
              <label>Max Pressure (bar) *</label>
              <InputNumber v-model="form.max_pressure" :invalid="!!errors.max_pressure" :maxFractionDigits="2" />
            </div>
          </div>
        </fieldset>

<!-- Col 2: Electrical & Documents -->
<fieldset class="form-section">
  <legend>Electrical & Documents</legend>
  
  <div class="field">
    <label>Command Type</label>
    <Dropdown
      v-model="form.command_type"
      :options="commandTypeOptions"
      placeholder="Select Command Interface"
      class="w-full"
    />
  </div>

  <div v-if="authStore.isAdmin" class="field upload-field">
    <label>Valve Image (PNG/JPG)</label>
    <FileUpload
      mode="basic"
      accept="image/*"
      :maxFileSize="2000000"
      chooseLabel="Select Photo"
      :auto="false"
      customUpload
      @select="(e) => selectedFile = e.files[0]"
    />
  </div>

  <div v-if="authStore.isAdmin" class="field upload-field">
    <label>Datasheet Document (PDF)</label>
    <FileUpload
      mode="basic"
      accept="application/pdf"
      :maxFileSize="5000000"
      chooseLabel="Select PDF"
      :auto="false"
      customUpload
      @select="(e) => selectedDatasheetFile = e.files[0]"
    />
  </div>
</fieldset>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
        <Button label="Save Valve" icon="pi pi-check" @click="handleSubmit" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.valve-list-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0.75rem;
  overflow: hidden;
}
.list-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.6rem 0.85rem;
}
.search-field {
  width: 320px;
}
.search-field :deep(input) {
  width: 100%;
}
.table-container {
  flex: 1;
  min-height: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}
.thumb-box {
  width: 38px;
  height: 38px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-icon {
  font-size: 1.1rem;
  color: var(--text-muted);
}
.mono-bold {
  font-family: Consolas, Monaco, monospace;
  font-weight: 700;
  color: var(--text-color);
}
.mono-val {
  font-family: Consolas, Monaco, monospace;
  font-weight: 600;
}
.mono-val small {
  color: var(--text-muted);
  font-weight: normal;
}
.action-buttons {
  display: flex;
  gap: 0.2rem;
  justify-content: flex-end;
}
.dialog-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  padding: 0.5rem 0;
}
.form-section {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
}
.form-section legend {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary-color);
  padding: 0 0.4rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.field label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.upload-field {
  margin-top: 0.25rem;
}
.w-full {
  width: 100%;
} 
@media (max-width: 1180px) {
  .valve-table :deep(.p-datatable-thead > tr > th),
  .valve-table :deep(.p-datatable-tbody > tr > td) {
    padding: 0.5rem 0.5rem;
  }
  .valve-table :deep(th:not(.p-datatable-column-sorted) .p-datatable-sort-icon) {
    display: none;
  }
}

/* ~820 CSS px (1024x768 at 125% Windows scaling): smaller type so more of the
   row fits before the table starts scrolling sideways. */
@media (max-width: 900px) {
  .valve-table :deep(.p-datatable-thead > tr > th),
  .valve-table :deep(.p-datatable-tbody > tr > td) {
    font-size: 0.78rem;
    padding: 0.4rem 0.35rem;
  }
  .valve-table :deep(.mono-bold),
  .valve-table :deep(.mono-val) {
    font-size: 0.76rem;
  }
}
</style>
