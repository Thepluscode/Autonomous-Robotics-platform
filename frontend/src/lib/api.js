import axios from "axios";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { "Content-Type": "application/json" },
});

// ==================== TOKEN MANAGEMENT ====================
const TOKEN_KEY = "eco_access_token";
const REFRESH_KEY = "eco_refresh_token";

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ==================== INTERCEPTORS ====================

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercept 401s and attempt token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${API_BASE}/api/auth/refresh`, null, {
          headers: { "X-Refresh-Token": refreshToken },
        });
        const newToken = res.data.access_token;
        setTokens(newToken, null);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (err) {
        processQueue(err);
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ======================== AUTH ========================
export const authAPI = {
  login: (email, password) => api.post("/auth/login", { email, password }),
  register: (data) => api.post("/auth/register", data),
  logout: () => {
    clearTokens();
    return api.post("/auth/logout");
  },
  me: () => api.get("/auth/me"),
  refresh: () => {
    const refreshToken = getRefreshToken();
    return axios.post(`${API_BASE}/api/auth/refresh`, null, {
      headers: { "X-Refresh-Token": refreshToken },
    });
  },
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token, newPassword) => api.post("/auth/reset-password", { token, new_password: newPassword }),
  getUsers: () => api.get("/auth/users"),
  updateUserRole: (userId, role) => api.put(`/auth/users/${userId}/role?role=${role}`),
};

// ======================== DRONES ========================
export const droneAPI = {
  getAll: () => api.get("/drones"),
  getOne: (id) => api.get(`/drones/${id}`),
  create: (data) => api.post("/drones", data),
  update: (id, data) => api.put(`/drones/${id}`, data),
  delete: (id) => api.delete(`/drones/${id}`),
  deploy: (data) => api.post("/drones/deploy", data),
  getFeeds: () => api.get("/drones/feeds"),
};

// ======================== ZONES ========================
export const zoneAPI = {
  getAll: () => api.get("/zones"),
  getOne: (id) => api.get(`/zones/${id}`),
  create: (data) => api.post("/zones", data),
  update: (id, data) => api.put(`/zones/${id}`, data),
  delete: (id) => api.delete(`/zones/${id}`),
};

// ======================== SENSORS ========================
export const sensorAPI = {
  getAll: () => api.get("/sensors"),
  create: (data) => api.post("/sensors", data),
};

// ======================== ALERTS ========================
export const alertAPI = {
  getAll: (unreadOnly = false) => api.get(`/alerts?unread_only=${unreadOnly}`),
  create: (data) => api.post("/alerts", data),
  markRead: (id) => api.put(`/alerts/${id}/read`),
  markAllRead: () => api.put("/alerts/read-all"),
};

// ======================== PATROLS ========================
export const patrolAPI = {
  getAll: () => api.get("/patrols"),
  generate: (data) => api.post("/patrols/generate", data),
  update: (id, data) => api.put(`/patrols/${id}`, data),
  delete: (id) => api.delete(`/patrols/${id}`),
  complete: (id) => api.post(`/patrols/${id}/complete`),
  getReports: () => api.get("/patrols/reports"),
};

// ======================== AI ========================
export const aiAPI = {
  analyze: (data) => api.post("/ai/analyze", data),
  getHistory: () => api.get("/ai/history"),
};

// ======================== DASHBOARD ========================
export const dashboardAPI = {
  getStats: () => api.get("/dashboard/stats"),
  getTrends: () => api.get("/dashboard/trends"),
};

// ======================== WEATHER ========================
export const weatherAPI = {
  getAll: () => api.get("/weather"),
  getByZone: (zoneId) => api.get(`/weather/${zoneId}`),
};

// ======================== FORECASTS ========================
export const forecastAPI = {
  generate: (zoneId) => api.post(`/forecasts/generate/${zoneId}`),
  getAll: () => api.get("/forecasts"),
  getByZone: (zoneId) => api.get(`/forecasts/${zoneId}`),
};

// ======================== INTERVENTIONS ========================
export const interventionAPI = {
  getRules: () => api.get("/interventions/rules"),
  createRule: (data) => api.post("/interventions/rules", data),
  deleteRule: (id) => api.delete(`/interventions/rules/${id}`),
  check: () => api.post("/interventions/check"),
};

// ======================== GEOFENCES ========================
export const geofenceAPI = {
  getAll: () => api.get("/geofences"),
  create: (data) => api.post("/geofences", data),
  delete: (id) => api.delete(`/geofences/${id}`),
  check: () => api.post("/geofences/check"),
};

// ======================== TASKS ========================
export const taskAPI = {
  getAll: () => api.get("/tasks"),
  create: (data) => api.post("/tasks", data),
  update: (id, status) => api.put(`/tasks/${id}?status=${status}`),
  delete: (id) => api.delete(`/tasks/${id}`),
};

// ======================== COMMENTS ========================
export const commentAPI = {
  get: (entityType, entityId) => api.get(`/comments/${entityType}/${entityId}`),
  create: (entityType, entityId, content) =>
    api.post(`/comments?entity_type=${entityType}&entity_id=${entityId}&content=${encodeURIComponent(content)}`),
};

// ======================== REPORTS ========================
export const reportAPI = {
  export: (type, format = "json") => api.get(`/reports/export/${type}?format=${format}`),
  getSummary: () => api.get("/reports/summary"),
};

// ======================== SPECIES ========================
export const speciesAPI = {
  identify: (imageUrl, zoneId) =>
    api.post(`/species/identify?image_url=${encodeURIComponent(imageUrl)}${zoneId ? `&zone_id=${zoneId}` : ""}`),
  identifyUpload: (imageDataUrl, file, zoneId) =>
    api.post("/species/identify-upload", {
      image_data_url: imageDataUrl,
      zone_id: zoneId,
      image_filename: file?.name,
      image_content_type: file?.type,
    }),
  getHistory: () => api.get("/species/history"),
  getStats: () => api.get("/species/stats"),
};

// ======================== NOTIFICATIONS ========================
export const notificationAPI = {
  subscribe: (email, name) => api.post(`/notifications/subscribe?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`),
  getSubscriptions: () => api.get("/notifications/subscriptions"),
  getHistory: () => api.get("/notifications/history"),
};

// ======================== PUBLIC ========================
export const publicAPI = {
  getDashboard: () => api.get("/public/dashboard"),
};

// ======================== SEED ========================
export const seedAPI = {
  seed: () => api.post("/seed"),
};

export default api;
