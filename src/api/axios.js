import axios from "axios";
import { auth } from "../firebase/firebaseConfig";

const configuredBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "https://api.hinchmart.com";

// If an absolute URL is provided (e.g. https://api.hinchmart.com or http://localhost:8080),
// connect directly from the browser to avoid Node.js dev-proxy TLS renegotiation / ECONNRESET errors.
const isExplicitProxy =
  typeof configuredBaseUrl === "string" &&
  (configuredBaseUrl.startsWith("/") || configuredBaseUrl === "");

export const apiBaseUrl = isExplicitProxy
  ? configuredBaseUrl || "/api"
  : `${configuredBaseUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 35000,
});

/**
 * Returns the active HinchMart backend JWT accessToken.
 * Falls back to legacy keys for compatibility.
 */
export const getActiveAccessToken = () => {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("adminToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    null
  );
};

/**
 * Waits briefly for Firebase Auth to finish rehydrating currentUser after page reload.
 */
const waitForFirebaseUser = () => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 2000);

    const unsubscribe = auth.onAuthStateChanged((user) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
};

/**
 * Resolves the token to use for outgoing API requests.
 * 1. Prefers the stored HinchMart backend JWT accessToken.
 * 2. Falls back to fresh Firebase ID token if backend token is not yet established.
 */
const resolveRequestToken = async () => {
  const backendToken = getActiveAccessToken();
  if (backendToken) return backendToken;

  let currentUser = auth.currentUser;
  if (!currentUser) {
    currentUser = await waitForFirebaseUser();
  }

  if (currentUser) {
    try {
      const idToken = await currentUser.getIdToken();
      if (typeof window !== "undefined" && idToken) {
        localStorage.setItem("firebaseToken", idToken);
      }
      return idToken;
    } catch (err) {
      console.warn("Failed to retrieve Firebase ID token fallback:", err?.message);
    }
  }

  return null;
};

// ==========================================
// Request Interceptor: Attach Bearer Token
// ==========================================
api.interceptors.request.use(
  async (config) => {
    // If data is FormData, remove manual Content-Type so browser sets boundary correctly
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      if (config.headers) {
        if (typeof config.headers.delete === "function") {
          config.headers.delete("Content-Type");
          config.headers.delete("content-type");
        }
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    } else if (config.data !== undefined && config.headers && !config.headers["Content-Type"]) {
      config.headers["Content-Type"] = "application/json";
    }

    // Skip attaching Authorization header for public /auth/sync if none exists yet
    const url = config.url || "";
    const isAuthSync = url.includes("/auth/sync");

    try {
      const token = await resolveRequestToken();
      if (token && config.headers) {
        if (typeof config.headers.set === "function") {
          config.headers.set("Authorization", `Bearer ${token}`);
        }
        config.headers.Authorization = `Bearer ${token}`;
        config.headers["Authorization"] = `Bearer ${token}`;
      } else if (!isAuthSync) {
        // If no token exists and not public sync, still allow proceeding; backend will return 401 if protected
      }
    } catch (err) {
      console.warn("Failed to attach authorization header:", err);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// Response Interceptor: 401 Token Refresh & 403 Forbidden
// ==========================================
let isRefreshing = false;
let failedQueue = [];

const processFailedQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

let isRedirectingToLogin = false;

const purgeSessionAndRedirect = () => {
  if (!isRedirectingToLogin && typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
    isRedirectingToLogin = true;
    localStorage.removeItem("adminToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("authToken");
    localStorage.removeItem("firebaseToken");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("userRole");
    setTimeout(() => {
      window.location.href = "/login";
    }, 300);
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;

    // ----------------------------------------------------
    // HTTP 403: Forbidden - Access Denied (Non-Admin / Unauthorized Role)
    // ----------------------------------------------------
    if (status === 403) {
      console.warn("403 Forbidden: Insufficient permissions for administrative endpoint:", originalRequest?.url);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("auth:forbidden", {
            detail: {
              url: originalRequest?.url,
              message: error.response?.data?.message || "Access denied: Insufficient permissions for this resource.",
            },
          })
        );
      }
      return Promise.reject(error);
    }

    // ----------------------------------------------------
    // HTTP 401: Unauthorized - Hybrid Token Exchange Silent Refresh
    // ----------------------------------------------------
    if (status === 401 && originalRequest && !originalRequest._retried) {
      const requestUrl = originalRequest.url || "";

      // If the failing request was itself /auth/sync or /auth/logout, fail directly without re-attempting
      if (requestUrl.includes("/auth/sync") || requestUrl.includes("/auth/logout")) {
        purgeSessionAndRedirect();
        return Promise.reject(error);
      }

      // If already in the process of refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newAccessToken) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retried = true;
      isRefreshing = true;

      try {
        // Step 1: Retrieve a fresh Firebase ID Token silently from the identity provider session
        let currentUser = auth.currentUser;
        if (!currentUser) {
          currentUser = await waitForFirebaseUser();
        }

        if (!currentUser) {
          throw new Error("No active Firebase session found to re-exchange token.");
        }

        const freshFirebaseToken = await currentUser.getIdToken(true);
        if (!freshFirebaseToken) {
          throw new Error("Unable to obtain fresh Firebase ID token.");
        }

        // Step 2: Call POST /api/auth/sync with the new Firebase ID token to obtain a fresh accessToken
        const syncUrl = `${apiBaseUrl}/auth/sync`;
        const syncResponse = await axios.post(
          syncUrl,
          {
            firebaseIdToken: freshFirebaseToken,
            name: currentUser.displayName || undefined,
            email: currentUser.email || undefined,
            phone: currentUser.phoneNumber || undefined,
            role: "ADMIN",
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${freshFirebaseToken}`,
            },
            timeout: 15000,
          }
        );

        const responseData = syncResponse.data?.data || syncResponse.data;
        const newAccessToken = responseData?.accessToken;

        if (!newAccessToken) {
          throw new Error("Backend did not return a valid accessToken on /api/auth/sync.");
        }

        // Store new HinchMart JWT accessToken
        if (typeof window !== "undefined") {
          localStorage.setItem("adminToken", newAccessToken);
          localStorage.setItem("accessToken", newAccessToken);
          localStorage.setItem("authToken", newAccessToken);
          localStorage.setItem("firebaseToken", freshFirebaseToken);
        }

        processFailedQueue(null, newAccessToken);

        // Step 3: Retry original failed request with the new accessToken
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        console.warn("Silent token exchange failed on 401:", refreshErr?.message);
        processFailedQueue(refreshErr, null);
        // Step 4: If silent refresh fails, purge saved session and redirect to Login screen
        purgeSessionAndRedirect();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
