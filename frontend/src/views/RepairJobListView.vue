<script setup>
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import api, { uploadRepairJobImage, uploadRepairJobDatasheet } from "../services/api";
import { FilterMatchMode } from "@primevue/core/api";
import { useAuthStore } from "../stores/auth";
import { assetUrl, formatDate, fromIsoDate, toIsoDate } from "../utils/format";

import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import DatePicker from "primevue/datepicker";
import ConfirmDialog from "primevue/confirmdialog";
import { useConfirm } from "primevue/useconfirm";
import Toast from "primevue/toast";
import { useToast } from "primevue/usetoast";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import FileUpload from "primevue/fileupload";
import Dropdown from "primevue/dropdown";

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const confirm = useConfirm();

const jobs = ref([]);
const loading = ref(true);
const filters = ref({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS },
});
const dialogVisible = ref(false);
const selectedFile = ref(null);
const selectedDatasheetFile = ref(null);
const editingId = ref(null);
const isSaving = ref(false);

const emptyForm = {
  job_name: "",
  job_number: "",
  so_number: "",
  job_date: null, // Date object while editing; sent as YYYY-MM-DD
  customer: "",
  valve_type: "",
  material_number: "",
  serial_number: "",
  manufacturer: "",
  size_ng: null,
  weight: null,
  rated_flow: null,
  max_flow: null,
  max_pressure: null,
  command_type: "Voltage (0-10V)",
};

const commandTypeOptions = [
  "Voltage (0-10V)",
  "Voltage (±10V)",
  "Current (4-20mA)",
  "Current (0-20mA)",
  "Current (0-1300mA)",
];

const form = reactive({ ...emptyForm });
const errors = reactive({});

function validateForm() {
  Object.keys(errors).forEach((key) => delete errors[key]);
  if (!form.job_name?.trim()) errors.job_name = "Job Name is required";
  if (!form.job_number?.trim()) errors.job_number = "Job Number is required";
  if (!form.job_date) errors.job_date = "Date is required";
  if (!form.customer?.trim()) errors.customer = "Customer is required";
  if (form.max_pressure === null || form.max_pressure === undefined || form.max_pressure <= 0)
    errors.max_pressure = "Max Pressure is required";
  return Object.keys(errors).length === 0;
}

async function fetchJobs() {
  try {
    loading.value = true;
    const response = await api.get("/repair-jobs");
    jobs.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error("Failed to fetch repair jobs:", error);
    toast.add({ severity: "error", summary: "Error", detail: "Failed to load repair jobs.", life: 3000 });
  } finally {
    loading.value = false;
  }
}

function resetDialogState() {
  Object.keys(errors).forEach((key) => delete errors[key]);
  selectedFile.value = null;
  selectedDatasheetFile.value = null;
}

function openCreateDialog() {
  editingId.value = null;
  Object.assign(form, emptyForm, { job_date: new Date() });
  resetDialogState();
  dialogVisible.value = true;
}

function openEditDialog(job) {
  editingId.value = job.id;
  Object.assign(form, emptyForm);
  Object.keys(emptyForm).forEach((k) => {
    if (job[k] !== undefined) form[k] = job[k];
  });
  form.job_date = fromIsoDate(job.job_date);
  resetDialogState();
  dialogVisible.value = true;
}

function goToTest(job) {
  router.push({ name: "records", query: { job: job.id } });
}

function openDatasheet(job) {
  const url = assetUrl(job.datasheet_path);
  if (url) window.open(url, "_blank", "noopener");
}

async function handleSubmit() {
  if (!validateForm()) {
    toast.add({ severity: "warn", summary: "Incomplete Form", detail: "Please fill in all mandatory fields.", life: 3000 });
    return;
  }

  const payload = { ...form, job_date: toIsoDate(form.job_date) };
  isSaving.value = true;
  try {
    let jobId = editingId.value;
    if (editingId.value) {
      await api.put(`/repair-jobs/${editingId.value}`, payload);
    } else {
      const response = await api.post("/repair-jobs", payload);
      jobId = response.data.id;
    }

    if (selectedFile.value) await uploadRepairJobImage(jobId, selectedFile.value);
    if (selectedDatasheetFile.value) await uploadRepairJobDatasheet(jobId, selectedDatasheetFile.value);

    toast.add({ severity: "success", summary: "Success", detail: "Repair job saved.", life: 3000 });
    dialogVisible.value = false;
    await fetchJobs();
  } catch (error) {
    console.error("Save error:", error);
    const msg = error.response?.data?.error || "Failed to save repair job.";
    toast.add({ severity: "error", summary: "Error", detail: msg, life: 4000 });
  } finally {
    isSaving.value = false;
  }
}

function confirmDelete(job) {
  confirm.require({
    message: `Delete repair job "${job.job_number} — ${job.job_name}"? This cannot be undone.`,
    header: "Confirm Deletion",
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Delete",
    rejectLabel: "Cancel",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await api.delete(`/repair-jobs/${job.id}`);
        toast.add({ severity: "success", summary: "Deleted", detail: "Repair job removed.", life: 3000 });
        await fetchJobs();
      } catch (error) {
        // 409: the job already has test records and is kept.
        const msg = error.response?.data?.error || "Failed to delete repair job.";
        toast.add({ severity: "error", summary: "Not Deleted", detail: msg, life: 5000 });
      }
    },
  });
}

onMounted(fetchJobs);
</script>

<template>
  <div class="job-list-page">
    <Toast />
    <ConfirmDialog />

    <header class="list-toolbar">
      <div class="toolbar-left">
        <IconField class="search-field">
          <InputIcon class="pi pi-search" />
          <InputText v-model="filters.global.value" placeholder="Search Job No., Name, SO, Customer, Serial..." />
        </IconField>
      </div>
      <div class="toolbar-right">
        <Button label="Add Repair Job" icon="pi pi-plus" class="btn-primary" @click="openCreateDialog" />
      </div>
    </header>

    <div class="table-container">
      <DataTable
        :value="jobs"
        :loading="loading"
        stripedRows
        :filters="filters"
        @update:filters="filters = $event"
        :globalFilterFields="['job_number', 'job_name', 'so_number', 'customer', 'serial_number', 'material_number', 'valve_type', 'manufacturer']"
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 20, 50]"
        sortMode="multiple"
        scrollable
        scrollHeight="flex"
        class="job-table"
      >
        <template #empty>
          <div class="empty-row">No repair jobs yet. Use "Add Repair Job" to create one.</div>
        </template>
        <Column header="Image" style="width: 65px">
          <template #body="{ data }">
            <div class="thumb-box">
              <img v-if="data.image_path" :src="assetUrl(data.image_path)" class="thumb-img" alt="valve" />
              <i v-else class="pi pi-image thumb-icon"></i>
            </div>
          </template>
        </Column>
        <Column field="job_number" header="Job Number" sortable style="min-width: 120px">
          <template #body="{ data }">
            <span class="mono-bold">{{ data.job_number }}</span>
          </template>
        </Column>
        <Column field="job_name" header="Job Name" sortable style="min-width: 150px" />
        <Column field="so_number" header="SO Number" sortable style="min-width: 110px" />
        <Column field="job_date" header="Date" sortable style="min-width: 100px">
          <template #body="{ data }">
            <span>{{ formatDate(data.job_date) }}</span>
          </template>
        </Column>
        <Column field="customer" header="Customer" sortable style="min-width: 140px" />
        <Column field="valve_type" header="Valve Type" sortable style="min-width: 110px" />
        <Column field="serial_number" header="Serial Number" sortable style="min-width: 120px">
          <template #body="{ data }">
            <span class="mono-val">{{ data.serial_number || "-" }}</span>
          </template>
        </Column>
        <Column field="max_pressure" header="Max Pressure" sortable style="min-width: 110px">
          <template #body="{ data }">
            <span class="mono-val">{{ data.max_pressure }} <small>bar</small></span>
          </template>
        </Column>
        <Column header="Actions" :exportable="false" style="min-width: 160px; text-align: right">
          <template #body="{ data }">
            <div class="action-buttons">
              <Button icon="pi pi-chart-line" severity="info" text title="Test in Workspace" @click="goToTest(data)" />
              <Button
                icon="pi pi-file-pdf"
                severity="secondary"
                text
                title="View Datasheet"
                :disabled="!data.datasheet_path"
                @click="openDatasheet(data)"
              />
              <Button icon="pi pi-pencil" severity="secondary" text title="Edit" @click="openEditDialog(data)" />
              <Button v-if="authStore.isAdmin" icon="pi pi-trash" severity="danger" text title="Delete" @click="confirmDelete(data)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      :visible="dialogVisible"
      :header="editingId ? 'Edit Repair Job' : 'Add Repair Job'"
      :modal="true"
      :style="{ width: '56rem' }"
      @update:visible="dialogVisible = $event"
    >
      <div class="dialog-grid">
        <!-- Col 1: Identification & Hydraulics -->
        <fieldset class="form-section">
          <legend>Identification & Hydraulics</legend>
          <div class="field">
            <label>Job Name *</label>
            <InputText v-model="form.job_name" :invalid="!!errors.job_name" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Job Number *</label>
              <InputText v-model="form.job_number" :invalid="!!errors.job_number" />
            </div>
            <div class="field">
              <label>SO Number</label>
              <InputText v-model="form.so_number" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Date *</label>
              <DatePicker
                v-model="form.job_date"
                dateFormat="dd.mm.yy"
                showIcon
                iconDisplay="input"
                :invalid="!!errors.job_date"
                fluid
              />
            </div>
            <div class="field">
              <label>Customer *</label>
              <InputText v-model="form.customer" :invalid="!!errors.customer" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Valve Type</label>
              <InputText v-model="form.valve_type" />
            </div>
            <div class="field">
              <label>Material Number</label>
              <InputText v-model="form.material_number" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Serial Number</label>
              <InputText v-model="form.serial_number" />
            </div>
            <div class="field">
              <label>Manufacturer</label>
              <InputText v-model="form.manufacturer" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Size NG</label>
              <InputNumber v-model="form.size_ng" :useGrouping="false" />
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
              <label>Max Flow (L/min)</label>
              <InputNumber v-model="form.max_flow" :maxFractionDigits="2" />
            </div>
          </div>
          <div class="field-row">
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

          <div class="field upload-field">
            <label>Valve Image (PNG/JPG)</label>
            <FileUpload
              mode="basic"
              accept="image/*"
              :maxFileSize="2000000"
              chooseLabel="Select Photo"
              :auto="false"
              customUpload
              @select="(e) => (selectedFile = e.files[0])"
            />
          </div>

          <div class="field upload-field">
            <label>Datasheet Document (PDF)</label>
            <FileUpload
              mode="basic"
              accept="application/pdf"
              :maxFileSize="5000000"
              chooseLabel="Select PDF"
              :auto="false"
              customUpload
              @select="(e) => (selectedDatasheetFile = e.files[0])"
            />
          </div>
        </fieldset>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
        <Button label="Save Repair Job" icon="pi pi-check" :loading="isSaving" @click="handleSubmit" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.job-list-page {
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
  width: 360px;
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
.empty-row {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted);
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
  grid-template-columns: 1.25fr 1fr;
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
.field-row :deep(.p-inputnumber),
.field-row :deep(.p-inputnumber-input),
.field :deep(.p-inputtext) {
  width: 100%;
}
.upload-field {
  margin-top: 0.25rem;
}
.w-full {
  width: 100%;
}
</style>
