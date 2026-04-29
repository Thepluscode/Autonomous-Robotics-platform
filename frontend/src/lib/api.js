import axios from "axios";

export const API_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001").replace(/\/+$/, "");

// `withCredentials: true` makes axios send the httpOnly access_token /
// refresh_token cookies on every request. Tokens never touch JS-readable
// storage, which closes the XSS-grabs-token attack surface that came with
// the previous localStorage-based design.
const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ==================== INTERCEPTORS ====================

// 401 handler — relies on the refresh_token cookie. The backend's
// /api/auth/refresh reads it directly, sets a new access_token cookie, and
// the retry of the original request picks it up. No JS-side token plumbing.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    // Don't try to refresh on the refresh endpoint itself (would loop).
    const isRefreshCall = originalRequest?.url?.endsWith("/auth/refresh");
    const skipAuthRefresh = originalRequest?.skipAuthRefresh;
    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall && !skipAuthRefresh) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: () => resolve(api(originalRequest)),
            reject,
          });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(`${API_BASE}/api/auth/refresh`, null, { withCredentials: true });
        processQueue(null);
        return api(originalRequest);
      } catch (err) {
        processQueue(err);
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
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
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me", { skipAuthRefresh: true }),
  refresh: () => axios.post(`${API_BASE}/api/auth/refresh`, null, { withCredentials: true }),
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

// ======================== MISSIONS ========================
export const missionAPI = {
  generate: (data) => api.post("/missions/generate", data),
  getAll: () => api.get("/missions"),
  getOne: (id) => api.get(`/missions/${id}`),
  authorize: (id) => api.post(`/missions/${id}/authorize`),
  abort: (id, reason = "Operator aborted mission from Mission Control.") => api.post(`/missions/${id}/abort`, { reason }),
  complete: (id) => api.post(`/missions/${id}/complete`),
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
