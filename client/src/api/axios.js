import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adnate-token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.response?.data?.code === "SESSION_INVALIDATED") {
      localStorage.removeItem("adnate-token");
      localStorage.removeItem("adnate-user");
      window.dispatchEvent(new Event("adnate-auth-cleared"));
    }

    return Promise.reject(error);
  }
);

export default api;
