import axios from "axios";
import { useAuthStore } from "../stores/auth";

// VITE_EMBEDDED=true is set by backend/build-frontend.* when the build is
// embedded into the Go binary (plain server or Wails). The page and the API
// then share one origin, so a relative "/api" is correct. Otherwise keep the
// development behaviour: VITE_API_URL if given, else http://localhost:8080.
const API_BASE = import.meta.env.VITE_EMBEDDED === 'true'
  ? '/api'
  : import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : 'http://localhost:8080/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const authStore = useAuthStore();
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/login");

    if (error.response?.status === 401 && !isLoginRequest) {
      const authStore = useAuthStore();
      authStore.logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export function uploadValveImage(id, file) {
  const formData = new FormData();
  formData.append("image", file);

  return api.post(`/valves/${id}/image`, formData, {
    headers: { "Content-Type": undefined },
  });
}

export function uploadValveDatasheet(id, file) {
  const formData = new FormData();
  formData.append("datasheet", file);

  return api.post(`/valves/${id}/datasheet`, formData, {
    headers: { "Content-Type": undefined },
  });
}

// Repair job files are sent as base64 inside a JSON body. In the desktop app
// the Gin router runs inside Wails (WebView2), and WebView2 does not pass the
// file bytes of a multipart/form-data request to that handler: the file part
// arrives empty. A JSON text body arrives intact, in the desktop app and in a
// normal browser alike.
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function uploadRepairJobImage(id, file) {
  return api.post(`/repair-jobs/${id}/image`, { filename: file.name, data: await fileToBase64(file) });
}

export async function uploadRepairJobDatasheet(id, file) {
  return api.post(`/repair-jobs/${id}/datasheet`, { filename: file.name, data: await fileToBase64(file) });
}

// User-defined sensors (key, label, unit) from Settings, for any logged-in user.
export function fetchSensorCatalog() {
  return api.get("/opcua/sensors");
}

export function fetchOpcData() {
  return api.get("/opcua/data");
}

// Test records: delete (admin only) and the report outcome of a record.
export function deleteTestRecord(id) {
  return api.delete(`/records/${id}`);
}

export function saveRecordReport(id, { status, operator, docNumber }) {
  return api.put(`/records/${id}/report`, { status, operator, doc_number: docNumber || "" });
}

// Unsaved recording of the logged-in user (autosave while recording).
export function getRecordingDraft() {
  return api.get("/recording-draft");
}

export function saveRecordingDraft(payload) {
  return api.put("/recording-draft", { payload });
}

export function deleteRecordingDraft() {
  return api.delete("/recording-draft");
}

export default api;
