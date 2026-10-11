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

export function uploadRepairJobImage(id, file) {
  const formData = new FormData();
  formData.append("image", file);
  return api.post(`/repair-jobs/${id}/image`, formData, {
    headers: { "Content-Type": undefined },
  });
}

export function uploadRepairJobDatasheet(id, file) {
  const formData = new FormData();
  formData.append("datasheet", file);
  return api.post(`/repair-jobs/${id}/datasheet`, formData, {
    headers: { "Content-Type": undefined },
  });
}

// User-defined sensors (key, label, unit) from Settings, for any logged-in user.
export function fetchSensorCatalog() {
  return api.get("/opcua/sensors");
}

export function startOutput() {
  return api.post("/ctrlx/start");
}

export function stopOutput() {
  return api.post("/ctrlx/stop");
}

export function fetchOpcData() {
  return api.get("/opcua/data");
}

export default api;
