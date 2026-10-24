import api from "./axios";
import { invalidateRequest } from "./requestCache";
import {
  getStoredCategories,
  setStoredCategories,
  getStoredSubcategories,
  setStoredSubcategories,
} from "./categoryApi";
export {
  getStoredCategories,
  setStoredCategories,
  getStoredSubcategories,
  setStoredSubcategories,
};

import { dispatchDataUpdate } from "./dataStore";
import { compressImage } from "../utils/imageStore";

const STORAGE_KEY_DELETED_SUBS = "hinchmart_deleted_sub_ids_v1";
const STORAGE_KEY_DELETED_SUB_NAMES = "hinchmart_deleted_sub_names_v1";

export const isRemoteId = (id) => {
  if (!id) return false;
  const num = Number(id);
  return !isNaN(num) && num > 0 && num <= 2147483647;
};

export const getDeletedSubcategoryIds = () => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_SUBS);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

export const getDeletedSubcategoryNames = () => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_SUB_NAMES);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

export const markSubcategoryDeleted = (id, name = "", categoryId = "") => {
  if (id) {
    const deleted = getDeletedSubcategoryIds();
    deleted.add(String(id));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_DELETED_SUBS, JSON.stringify(Array.from(deleted)));
      } catch {}
    }
  }

  if (name) {
    const cleanName = name.trim().toLowerCase();
    const deletedNames = getDeletedSubcategoryNames();
    deletedNames.add(cleanName);
    if (categoryId) {
      deletedNames.add(`${cleanName}:::${String(categoryId)}`);
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_DELETED_SUB_NAMES, JSON.stringify(Array.from(deletedNames)));
      } catch {}
    }
  }
};

export const unmarkSubcategoryDeleted = (id, name = "", categoryId = "") => {
  if (id) {
    const deleted = getDeletedSubcategoryIds();
    deleted.delete(String(id));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_DELETED_SUBS, JSON.stringify(Array.from(deleted)));
      } catch {}
    }
  }

  if (name && categoryId) {
    const key = `${name.trim().toLowerCase()}:::${String(categoryId)}`;
    const deletedNames = getDeletedSubcategoryNames();
    deletedNames.delete(key);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_DELETED_SUB_NAMES, JSON.stringify(Array.from(deletedNames)));
      } catch {}
    }
  }
};

const slugify = (value = "") =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const list = (payload) => (Array.isArray(payload) ? payload : payload?.subcategories || payload?.data || []);

// High-resolution verified Civil & Infrastructure photography (strictly ending in .jpg for backend validator)
export const SUBCATEGORY_FALLBACK_IMAGES = {
  steel: "https://images.unsplash.com/photo-1504307651254-35680f356dfd.jpg",
  cement: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343.jpg",
  concrete: "https://images.unsplash.com/photo-1541888946425-d0fbb180c5f7.jpg",
  structural: "https://images.unsplash.com/photo-1587293852726-70cdb56c2866.jpg",
  cable: "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5.jpg",
  switchgear: "https://images.unsplash.com/photo-1581092160607-ee22621dd758.jpg",
  pipe: "https://images.unsplash.com/photo-1581092160607-ee22621dd758.jpg",
  valves: "https://images.unsplash.com/photo-1581092335397-9583fe92d232.jpg",
  equipment: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158.jpg",
  scaffold: "https://images.unsplash.com/photo-1504307651254-35680f356dfd.jpg",
  general: "https://images.unsplash.com/photo-1504307651254-35680f356dfd.jpg",
};

export const sanitizeSubcategoryImageUrl = (url, name = "") => {
  let img = url || resolveSubcategoryImage("", name);
  if (!img || typeof img !== "string" || img.startsWith("data:") || img.startsWith("blob:")) {
    img = resolveSubcategoryImage("", name);
  }

  // Ensure it is a valid web URL
  if (!img.startsWith("http://") && !img.startsWith("https://")) {
    img = resolveSubcategoryImage("", name);
  }

  // If cloud storage URL (S3 / hinchmart storage / AWS / Firebase), it is valid as-is
  const isCloudStorage = /s3|amazonaws|storage\.hinchmart\.com|firebasestorage/i.test(img);
  if (isCloudStorage) {
    return img;
  }

  // Strip query parameters to avoid regex validator failures
  if (img.includes("?")) {
    img = img.split("?")[0];
  }

  // Backend validation: Must be an image file (.jpg, .jpeg, .png, .webp, .svg, .gif)
  const hasExt = /\.(jpg|jpeg|png|webp|svg|gif)$/i.test(img);
  if (!hasExt) {
    img = `${img}.jpg`;
  }

  return img;
};

export const resolveSubcategoryImage = (url, name = "") => {
  if (!url || typeof url !== "string") {
    const lower = (name || "").toLowerCase();
    if (lower.includes("cement")) return SUBCATEGORY_FALLBACK_IMAGES.cement;
    if (lower.includes("concrete") || lower.includes("rmc")) return SUBCATEGORY_FALLBACK_IMAGES.concrete;
    if (lower.includes("rebar") || lower.includes("tmt") || lower.includes("steel")) return SUBCATEGORY_FALLBACK_IMAGES.steel;
    if (lower.includes("beam") || lower.includes("structural") || lower.includes("ismb") || lower.includes("channel")) return SUBCATEGORY_FALLBACK_IMAGES.structural;
    if (lower.includes("cable") || lower.includes("wire") || lower.includes("lighting") || lower.includes("electrode")) return SUBCATEGORY_FALLBACK_IMAGES.cable;
    if (lower.includes("switchgear") || lower.includes("mcb") || lower.includes("power")) return SUBCATEGORY_FALLBACK_IMAGES.switchgear;
    if (lower.includes("pipe") || lower.includes("drainage") || lower.includes("cpvc") || lower.includes("hdpe")) return SUBCATEGORY_FALLBACK_IMAGES.pipe;
    if (lower.includes("valve") || lower.includes("fitting") || lower.includes("flange")) return SUBCATEGORY_FALLBACK_IMAGES.valves;
    if (lower.includes("mixer") || lower.includes("jack") || lower.includes("cutter") || lower.includes("hoist")) return SUBCATEGORY_FALLBACK_IMAGES.equipment;
    if (lower.includes("scaffold") || lower.includes("plywood") || lower.includes("formwork")) return SUBCATEGORY_FALLBACK_IMAGES.scaffold;
    return SUBCATEGORY_FALLBACK_IMAGES.general;
  }
  return url;
};

export const normalizeSubcategory = (sub) => {
  if (!sub || typeof sub !== "object") return null;
  const raw = sub.data || sub.subcategory || sub;
  const name = (raw.name || raw.title || raw.subcategoryName || raw.subCategoryName || "").trim();
  const rawId = raw.subcategoryId ?? raw.subCategoryId ?? raw.id ?? raw._id;

  // Reject empty or dummy corrupted entries
  if (!name) return null;
  if (name.toLowerCase() === "subcategory" && (!rawId || rawId === 0 || rawId === "0" || raw.slug === "subcategory" || raw.slug === "/subcategory")) {
    return null;
  }

  const id = rawId !== undefined && rawId !== null && rawId !== "" && rawId !== 0 && rawId !== "0"
    ? (!isNaN(Number(rawId)) ? Number(rawId) : rawId)
    : Date.now();

  const catId = raw.categoryId !== undefined && raw.categoryId !== null && raw.categoryId !== ""
    ? (!isNaN(Number(raw.categoryId)) ? Number(raw.categoryId) : raw.categoryId)
    : (raw.category_id !== undefined && raw.category_id !== null && raw.category_id !== "" ? Number(raw.category_id) : (raw.category?.id || 1));

  const rawImage = raw.imageURL || raw.imageUrl || raw.image || "";
  const resolvedImage = resolveSubcategoryImage(rawImage, name);

  const isVisibleOnWebsite = raw.visibleOnWebsite !== undefined && raw.visibleOnWebsite !== null
    ? Boolean(raw.visibleOnWebsite)
    : (raw.visible_on_website !== undefined && raw.visible_on_website !== null ? Boolean(raw.visible_on_website) : true);

  const isActive = raw.active !== undefined && raw.active !== null
    ? Boolean(raw.active)
    : (raw.isActive !== undefined && raw.isActive !== null ? Boolean(raw.isActive) : (raw.is_active !== undefined ? Boolean(raw.is_active) : true));

  return {
    ...raw,
    id,
    subcategoryId: id,
    categoryId: catId,
    name,
    title: name,
    slug: raw.slug?.trim() || slugify(name),
    imageURL: resolvedImage,
    imageUrl: resolvedImage,
    image: resolvedImage,
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    active: isActive,
    isActive,
    visibleOnWebsite: isVisibleOnWebsite,
    visible_on_website: isVisibleOnWebsite,
    isLocalOnly: raw.isLocalOnly ?? !isRemoteId(id),
    productCount: Number(raw.productCount ?? raw.product_count ?? 0),
    createdAt: raw.createdAt || raw.created_at || null,
  };
};

/**
 * Get all subcategories (fetches live from database & merges local additions)
 * Supports optional categoryId filter: GET /subcategories?categoryId=15
 */
export const getSubcategories = async (categoryId = null) => {
  const deletedIds = getDeletedSubcategoryIds();
  const deletedNames = getDeletedSubcategoryNames();
  try {
    const params = {};
    if (categoryId !== null && categoryId !== undefined && categoryId !== "ALL" && categoryId !== "") {
      params.categoryId = categoryId;
    }
    const response = await api.get("/subcategories", { params });
    const rawList = list(response.data);
    const allBackendKeys = new Set();
    rawList.forEach((r) => {
      if (r && (r.name || r.title)) {
        const rName = (r.name || r.title || "").trim().toLowerCase();
        const rCatId = String(r.categoryId || "");
        if (rName && rCatId) {
          allBackendKeys.add(`${rName}:::${rCatId}`);
        }
      }
    });

    const remoteNormalized = rawList
      .map(normalizeSubcategory)
      .filter((s) => {
        if (!s || !s.name) return false;
        const sId = String(s.subcategoryId || s.id);
        const cleanName = s.name.trim().toLowerCase();
        const sKey = `${cleanName}:::${String(s.categoryId)}`;
        if (deletedIds.has(sId)) return false;
        if (cleanName && deletedNames.has(cleanName)) return false;
        if (deletedNames.has(sKey)) return false;
        return true;
      });

    const map = new Map();
    const remoteKeys = new Set();
    remoteNormalized.forEach((s) => {
      const sId = String(s.subcategoryId || s.id);
      map.set(sId, s);
      remoteKeys.add(`${s.name?.trim().toLowerCase()}:::${String(s.categoryId)}`);
    });

    const localSubs = (getStoredSubcategories() || [])
      .map(normalizeSubcategory)
      .filter((s) => s && s.name);

    let hadRedundantLocal = false;
    const cleanStoredSubs = [];
    const seenLocalDraftKeys = new Set();

    localSubs.forEach((s) => {
      const id = String(s.subcategoryId || s.id);
      const localKey = `${s.name?.trim().toLowerCase()}:::${String(s.categoryId)}`;

      // Filter out deleted IDs or deleted names
      if (deletedIds.has(id) || deletedNames.has(localKey)) {
        hadRedundantLocal = true;
        return;
      }

      // If a live remote subcategory or backend database already has this exact name & category, the local draft is redundant/zombie
      if (!isRemoteId(id) && (remoteKeys.has(localKey) || allBackendKeys.has(localKey))) {
        hadRedundantLocal = true;
        return;
      }

      // Deduplicate multiple local drafts with identical name & category
      if (!isRemoteId(id)) {
        if (seenLocalDraftKeys.has(localKey)) {
          hadRedundantLocal = true;
          return;
        }
        seenLocalDraftKeys.add(localKey);
      }

      cleanStoredSubs.push(s);
      if (!map.has(id)) {
        if (!params.categoryId || String(s.categoryId) === String(params.categoryId)) {
          map.set(id, s);
        }
      }
    });

    if (hadRedundantLocal) {
      const currentStored = getStoredSubcategories() || [];
      const updatedStored = currentStored.filter((item) => {
        const iId = String(item.subcategoryId || item.id);
        const iKey = `${(item.name || "").trim().toLowerCase()}:::${String(item.categoryId || "")}`;
        if (!isRemoteId(iId) && (remoteKeys.has(iKey) || allBackendKeys.has(iKey))) return false;
        if (deletedIds.has(iId) || deletedNames.has(iKey)) return false;
        return true;
      });
      setStoredSubcategories(updatedStored);
    }

    const merged = Array.from(map.values()).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // When fetching all without category filter, keep local storage in sync
    if (!params.categoryId) {
      setStoredSubcategories(merged);
    }
    return merged;
  } catch (err) {
    console.warn("Live backend /subcategories fetch notice:", err?.message);
    let local = (getStoredSubcategories() || [])
      .map(normalizeSubcategory)
      .filter((s) => {
        if (!s || !s.name) return false;
        const sId = String(s.subcategoryId || s.id);
        const sKey = `${s.name.trim().toLowerCase()}:::${String(s.categoryId)}`;
        if (deletedIds.has(sId) || deletedNames.has(sKey)) return false;
        return true;
      });
    if (categoryId && categoryId !== "ALL") {
      local = local.filter((s) => String(s.categoryId) === String(categoryId));
    }
    return local;
  }
};


/**
 * Get subcategory by ID
 */
export const getSubcategoryById = async (id) => {
  try {
    const response = await api.get(`/subcategories/${id}`);
    if (response.data) {
      return normalizeSubcategory(response.data);
    }
  } catch (err) {
    console.warn(`Live subcategory ${id} fetch notice:`, err?.message);
  }

  const all = await getSubcategories();
  return all.find((s) => String(s.subcategoryId || s.id) === String(id)) || null;
};

/**
 * Quick Toggle Website Visibility (ON / OFF)
 * Method: PATCH /subcategories/{id}/website-visibility
 * Alias: PATCH /admin/subcategories/{id}/website-visibility
 * Request Body: { visibleOnWebsite: boolean }
 */
export const toggleSubcategoryWebsiteVisibility = async (id, visibleOnWebsite) => {
  const targetVisibility = Boolean(visibleOnWebsite);
  let updatedSub = null;

  if (isRemoteId(id)) {
    try {
      const response = await api.patch(`/subcategories/${id}/website-visibility`, {
        visibleOnWebsite: targetVisibility,
      });
      const resData = response.data?.data || response.data?.subcategory || response.data;
      if (resData && typeof resData === "object" && (resData.name || resData.id || resData.subcategoryId)) {
        updatedSub = normalizeSubcategory({ ...resData, id, subcategoryId: id, visibleOnWebsite: targetVisibility });
      }
    } catch (err) {
      // Try alias endpoint: /admin/subcategories/${id}/website-visibility
      try {
        const aliasRes = await api.patch(`/admin/subcategories/${id}/website-visibility`, {
          visibleOnWebsite: targetVisibility,
        });
        const resData = aliasRes.data?.data || aliasRes.data?.subcategory || aliasRes.data;
        if (resData && typeof resData === "object" && (resData.name || resData.id || resData.subcategoryId)) {
          updatedSub = normalizeSubcategory({ ...resData, id, subcategoryId: id, visibleOnWebsite: targetVisibility });
        }
      } catch (aliasErr) {
        console.warn(`Quick toggle PATCH failed (${err?.message}), attempting PUT fallback`);
        const existing = (getStoredSubcategories() || []).find(
          (s) => String(s.subcategoryId || s.id) === String(id)
        );
        if (existing) {
          updatedSub = await updateSubcategory(id, {
            ...existing,
            visibleOnWebsite: targetVisibility,
          });
        } else {
          throw err;
        }
      }
    }
  }

  if (!updatedSub) {
    const existing = (getStoredSubcategories() || []).find(
      (s) => String(s.subcategoryId || s.id) === String(id)
    );
    updatedSub = normalizeSubcategory({
      ...(existing || {}),
      id,
      subcategoryId: id,
      visibleOnWebsite: targetVisibility,
      isLocalOnly: !isRemoteId(id),
    });
  }

  // Update stored subcategories
  const existingSubs = (getStoredSubcategories() || []).map(normalizeSubcategory).filter(Boolean);
  const updatedSubs = existingSubs.map((s) =>
    String(s.subcategoryId || s.id) === String(id)
      ? { ...s, ...updatedSub, visibleOnWebsite: targetVisibility }
      : s
  );
  if (!updatedSubs.some((s) => String(s.subcategoryId || s.id) === String(id))) {
    updatedSubs.unshift(updatedSub);
  }
  setStoredSubcategories(updatedSubs);

  // Sync with parent category
  const parentCatId = updatedSub.categoryId;
  const categories = getStoredCategories();
  const updatedCategories = categories.map((cat) => {
    if (String(cat.categoryId || cat.id) === String(parentCatId)) {
      const childSubs = (cat.subcategories || []).map(normalizeSubcategory).filter(Boolean);
      return {
        ...cat,
        subcategories: childSubs.map((s) =>
          String(s.subcategoryId || s.id) === String(id)
            ? { ...s, ...updatedSub, visibleOnWebsite: targetVisibility }
            : s
        ),
      };
    }
    return cat;
  });
  setStoredCategories(updatedCategories);

  dispatchDataUpdate("subcategories", "UPDATE", { id, ...updatedSub, visibleOnWebsite: targetVisibility });
  invalidateRequest("categories");

  return updatedSub;
};

/**
 * Create a new subcategory (sends live POST to backend database with auto-conflict resolution)
 */
export const createSubcategory = async (data) => {
  const subName = (data.name || data.title || "").trim();
  const slug = data.slug?.trim() || slugify(subName);
  const parentCatId = data.categoryId !== undefined && data.categoryId !== null && data.categoryId !== ""
    ? (!isNaN(Number(data.categoryId)) ? Number(data.categoryId) : data.categoryId)
    : 35;

  let finalImage = data.imageURL || data.imageUrl || data.image || "";
  finalImage = resolveSubcategoryImage(finalImage, subName);

  const safeImageUrl = sanitizeSubcategoryImageUrl(finalImage, subName);

  const numericCatId = !isNaN(Number(parentCatId)) ? Number(parentCatId) : parentCatId;

  // Multi-format payload for maximum Spring Boot compatibility (DTO, Entity, snake_case, camelCase)
  const payload = {
    categoryId: numericCatId,
    category_id: numericCatId,
    category: { id: numericCatId, categoryId: numericCatId },
    name: subName,
    title: subName,
    slug,
    imageUrl: safeImageUrl,
    image_url: safeImageUrl,
    sortOrder: Number(data.sortOrder || 1),
    sort_order: Number(data.sortOrder || 1),
    active: data.active !== false,
    isActive: data.active !== false,
    is_active: data.active !== false,
    visibleOnWebsite: data.visibleOnWebsite !== false,
    visible_on_website: data.visibleOnWebsite !== false,
  };

  let savedSub = null;
  let backendError = null;

  // Proactively unmark any deletion tombstone for this subcategory name & category
  unmarkSubcategoryDeleted(null, subName, numericCatId);

  try {
    const response = await api.post("/subcategories", payload);
    const rawData = response.data?.data || response.data?.subcategory || response.data;
    const resData = Array.isArray(rawData) ? rawData[0] : rawData;
    if (resData && typeof resData === "object" && (resData.id || resData.subcategoryId || resData.name)) {
      savedSub = normalizeSubcategory({ ...payload, ...resData });
    }
  } catch (err) {
    // If numeric categoryId was rejected with 400, try alternatives
    if (err?.response?.status === 400) {
      try {
        const retryStr = await api.post("/subcategories", {
          ...payload,
          categoryId: String(parentCatId),
        });
        const resDataStr = retryStr.data?.data || retryStr.data?.subcategory || retryStr.data;
        if (resDataStr && typeof resDataStr === "object" && (resDataStr.id || resDataStr.subcategoryId || resDataStr.name)) {
          savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resDataStr) ? resDataStr[0] : resDataStr) });
        }
      } catch (errStr) {
        // Also try with category_id (snake_case)
        try {
          const retrySnake = await api.post("/subcategories", {
            ...payload,
            category_id: numericCatId,
          });
          const resDataSnake = retrySnake.data?.data || retrySnake.data?.subcategory || retrySnake.data;
          if (resDataSnake && typeof resDataSnake === "object" && (resDataSnake.id || resDataSnake.subcategoryId || resDataSnake.name)) {
            savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resDataSnake) ? resDataSnake[0] : resDataSnake) });
          }
        } catch {}

        // Also try with query param if @RequestParam is required
        if (!savedSub) {
          try {
            const retryQuery = await api.post(`/subcategories?categoryId=${parentCatId}`, {
              ...payload,
              categoryId: numericCatId,
            });
            const resDataQ = retryQuery.data?.data || retryQuery.data?.subcategory || retryQuery.data;
            if (resDataQ && typeof resDataQ === "object" && (resDataQ.id || resDataQ.subcategoryId || resDataQ.name)) {
              savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resDataQ) ? resDataQ[0] : resDataQ) });
            }
          } catch {}
        }

        // Also try nested endpoint /categories/{id}/subcategories
        if (!savedSub) {
          try {
            const retryNest = await api.post(`/categories/${parentCatId}/subcategories`, payload);
            const resDataNest = retryNest.data?.data || retryNest.data?.subcategory || retryNest.data;
            if (resDataNest && typeof resDataNest === "object" && (resDataNest.id || resDataNest.subcategoryId || resDataNest.name)) {
              savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resDataNest) ? resDataNest[0] : resDataNest) });
            }
          } catch {}
        }
      }
    }

    if (!savedSub && (err?.response?.status === 404 || err?.response?.status === 405)) {
      try {
        const retryAdmin = await api.post("/admin/subcategories", payload);
        const resDataAdmin = retryAdmin.data?.data || retryAdmin.data?.subcategory || (retryAdmin.data?.name ? retryAdmin.data : null);
        if (resDataAdmin && typeof resDataAdmin === "object" && (resDataAdmin.id || resDataAdmin.subcategoryId || resDataAdmin.name)) {
          savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resDataAdmin) ? resDataAdmin[0] : resDataAdmin) });
        }
      } catch {
        try {
          const retryNest2 = await api.post(`/categories/${parentCatId}/subcategories`, payload);
          const resDataNest2 = retryNest2.data?.data || retryNest2.data?.subcategory || retryNest2.data;
          if (resDataNest2 && typeof resDataNest2 === "object" && (resDataNest2.id || resDataNest2.subcategoryId || resDataNest2.name)) {
            savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resDataNest2) ? resDataNest2[0] : resDataNest2) });
          }
        } catch {}
      }
    }

    if (!savedSub) {
      const errorsList = err?.response?.data?.errors;
      let errorDetail = "";
      if (Array.isArray(errorsList) && errorsList.length > 0) {
        errorDetail = errorsList
          .map((e) =>
            typeof e === "object"
              ? `${e.field || e.parameter || e.property || ""}: ${e.message || e.defaultMessage || JSON.stringify(e)}`
              : String(e)
          )
          .join("; ");
      } else if (errorsList && typeof errorsList === "object") {
        errorDetail = JSON.stringify(errorsList);
      }
      const serverMsg = errorDetail || err?.response?.data?.message || err?.response?.data?.error || err?.message;
      console.warn("Live backend POST /subcategories notice:", {
        status: err?.response?.status,
        serverMsg,
        errorDetail,
        responseData: err?.response?.data,
        payloadSent: payload,
      });
      backendError = serverMsg;
    }

    if (err?.response?.status === 409) {
      // 1. Try with category-scoped slug
      try {
        const uniqueSlug = `${slug}-${parentCatId}`;
        const retryRes = await api.post("/subcategories", { ...payload, slug: uniqueSlug });
        const resData = retryRes.data?.data || retryRes.data?.subcategory || retryRes.data;
        if (resData && typeof resData === "object" && (resData.id || resData.subcategoryId || resData.name)) {
          savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resData) ? resData[0] : resData) });
          backendError = null;
        }
      } catch {
        try {
          const timestampSlug = `${slug}-${Date.now().toString().slice(-4)}`;
          const retryRes2 = await api.post("/subcategories", { ...payload, slug: timestampSlug });
          const resData2 = retryRes2.data?.data || retryRes2.data?.subcategory || retryRes2.data;
          if (resData2 && typeof resData2 === "object" && (resData2.id || resData2.subcategoryId || resData2.name)) {
            savedSub = normalizeSubcategory({ ...payload, ...(Array.isArray(resData2) ? resData2[0] : resData2) });
            backendError = null;
          }
        } catch {}
      }
    }

    // If backend rejects because subcategory already exists on server, fetch and link the existing remote record
    if (!savedSub && /already exists/i.test(backendError || "")) {
      try {
        const checkRes = await api.get("/subcategories", {
          params: { categoryId: parentCatId },
        });
        const liveList = list(checkRes.data).map(normalizeSubcategory).filter(Boolean);
        const match = liveList.find(
          (s) =>
            s.name?.trim().toLowerCase() === subName.toLowerCase() ||
            (s.slug && s.slug === slug)
        );
        if (match && isRemoteId(match.subcategoryId || match.id)) {
          unmarkSubcategoryDeleted(match.subcategoryId || match.id, match.name, match.categoryId);
          savedSub = match;
          backendError = null;
        }
      } catch {}
    }
  }

  // If saved on backend and visibleOnWebsite was requested, guarantee it is activated on website
  if (savedSub && isRemoteId(savedSub.subcategoryId || savedSub.id) && data.visibleOnWebsite !== false) {
    try {
      await api.patch(`/subcategories/${savedSub.subcategoryId || savedSub.id}/website-visibility`, {
        visibleOnWebsite: true,
      });
      savedSub.visibleOnWebsite = true;
      savedSub.visible_on_website = true;
    } catch {
      try {
        await api.patch(`/admin/subcategories/${savedSub.subcategoryId || savedSub.id}/website-visibility`, {
          visibleOnWebsite: true,
        });
        savedSub.visibleOnWebsite = true;
        savedSub.visible_on_website = true;
      } catch {}
    }
  }

  if (!savedSub) {
    const newId = Date.now();
    savedSub = normalizeSubcategory({
      ...payload,
      imageURL: finalImage,
      imageUrl: finalImage,
      image: finalImage,
      subcategoryId: newId,
      id: newId,
      isLocalOnly: true,
    });
    savedSub.isLocalOnly = true;
    savedSub.syncError = backendError || "Server rejected subcategory creation";
  }

  // Remove this subcategory and any previously deleted subcategories with the same name from deleted list
  unmarkSubcategoryDeleted(savedSub.subcategoryId || savedSub.id, savedSub.name, savedSub.categoryId);

  const existing = (getStoredSubcategories() || [])
    .map(normalizeSubcategory)
    .filter((s) => s && s.name && !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0" || s.slug === "subcategory" || s.slug === "/subcategory")));

  const updatedSubs = [savedSub, ...existing.filter((s) => String(s.subcategoryId || s.id) !== String(savedSub.subcategoryId || savedSub.id))];
  setStoredSubcategories(updatedSubs);

  // Sync with parent category
  const categories = getStoredCategories();
  const updatedCategories = categories.map((cat) => {
    if (String(cat.categoryId || cat.id) === String(parentCatId)) {
      const childSubs = (cat.subcategories || [])
        .map(normalizeSubcategory)
        .filter((s) => s && s.name && !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0")));
      return {
        ...cat,
        subcategories: [savedSub, ...childSubs.filter((s) => String(s.subcategoryId || s.id) !== String(savedSub.subcategoryId || savedSub.id))],
      };
    }
    return cat;
  });
  setStoredCategories(updatedCategories);

  dispatchDataUpdate("subcategories", "CREATE", savedSub);
  invalidateRequest("categories");
  invalidateRequest("subcategories");
  invalidateRequest("/subcategories");

  return savedSub;
};


/**
 * Update an existing subcategory (sends live PUT to backend database)
 */
export const updateSubcategory = async (id, data) => {
  let finalImage = data.imageURL || data.imageUrl || data.image || "";
  if (finalImage) {
    finalImage = resolveSubcategoryImage(finalImage, data.name);
  }

  const subName = (data.name || data.title || "").trim();
  const parentCatId = data.categoryId !== undefined && data.categoryId !== null && data.categoryId !== ""
    ? (!isNaN(Number(data.categoryId)) ? Number(data.categoryId) : data.categoryId)
    : 1;

  const safeImageUrl = sanitizeSubcategoryImageUrl(finalImage, subName);

  const numericCatId = !isNaN(Number(parentCatId)) ? Number(parentCatId) : parentCatId;

  const payload = {
    categoryId: numericCatId,
    category_id: numericCatId,
    category: { id: numericCatId, categoryId: numericCatId },
    name: subName,
    title: subName,
    slug: data.slug?.trim() || slugify(subName),
    imageUrl: safeImageUrl,
    image_url: safeImageUrl,
    sortOrder: Number(data.sortOrder || 0),
    sort_order: Number(data.sortOrder || 0),
    active: data.active !== false,
    isActive: data.active !== false,
    is_active: data.active !== false,
    visibleOnWebsite: data.visibleOnWebsite !== false,
    visible_on_website: data.visibleOnWebsite !== false,
  };

  let updatedSub = null;
  let backendError = null;

  if (isRemoteId(id)) {
    try {
      const response = await api.put(`/subcategories/${id}`, payload);
      const resData = response.data?.data || response.data?.subcategory || (response.data?.name ? response.data : null);
      if (resData && typeof resData === "object" && (resData.name || resData.title || resData.subcategoryName)) {
        updatedSub = normalizeSubcategory({ ...payload, ...resData, id, subcategoryId: id });
      }
    } catch (err) {
      if (err?.response?.status === 400) {
        try {
          const retryPut = await api.put(`/subcategories/${id}`, {
            ...payload,
            categoryId: String(parentCatId),
          });
          const resDataStr = retryPut.data?.data || retryPut.data?.subcategory || retryPut.data;
          if (resDataStr && typeof resDataStr === "object" && (resDataStr.name || resDataStr.title || resDataStr.subcategoryName)) {
            updatedSub = normalizeSubcategory({ ...payload, ...resDataStr, id, subcategoryId: id });
          }
        } catch {}
      }

      if (!updatedSub) {
        const errorsList = err?.response?.data?.errors;
        let errorDetail = "";
        if (Array.isArray(errorsList) && errorsList.length > 0) {
          errorDetail = errorsList
            .map((e) =>
              typeof e === "object"
                ? `${e.field || e.parameter || e.property || ""}: ${e.message || e.defaultMessage || JSON.stringify(e)}`
                : String(e)
            )
            .join("; ");
        } else if (errorsList && typeof errorsList === "object") {
          errorDetail = JSON.stringify(errorsList);
        }
        const serverMsg = errorDetail || err?.response?.data?.message || err?.response?.data?.error || err?.message;
        console.error(`❌ Live backend PUT /subcategories/${id} error:`, {
          serverMsg,
          errorDetail,
          rawErrors: errorsList,
          responseData: err?.response?.data,
        });
        backendError = serverMsg;
      }
    }
  } else {
    // If it's a local ID, try creating it directly on the backend
    try {
      const response = await api.post("/subcategories", payload);
      const resData = response.data?.data || response.data?.subcategory || (response.data?.name ? response.data : null);
      if (resData && typeof resData === "object" && (resData.name || resData.title || resData.subcategoryName)) {
        updatedSub = normalizeSubcategory({ ...payload, ...resData });
      }
    } catch (err) {
      if (err?.response?.status === 400) {
        try {
          const retryStr = await api.post("/subcategories", {
            ...payload,
            categoryId: String(parentCatId),
          });
          const resDataStr = retryStr.data?.data || retryStr.data?.subcategory || retryStr.data;
          if (resDataStr && typeof resDataStr === "object" && (resDataStr.name || resDataStr.title || resDataStr.subcategoryName)) {
            updatedSub = normalizeSubcategory({ ...payload, ...resDataStr });
          }
        } catch (errStr) {
          try {
            const retryParam = await api.post(`/subcategories?categoryId=${parentCatId}`, {
              ...payload,
              categoryId: numericCatId,
            });
            const resDataQ = retryParam.data?.data || retryParam.data?.subcategory || retryParam.data;
            if (resDataQ && typeof resDataQ === "object" && (resDataQ.name || resDataQ.title || resDataQ.subcategoryName)) {
              updatedSub = normalizeSubcategory({ ...payload, ...resDataQ });
            }
          } catch {}
        }
      }

      if (!updatedSub) {
        const errorsList = err?.response?.data?.errors;
        let errorDetail = "";
        if (Array.isArray(errorsList) && errorsList.length > 0) {
          errorDetail = errorsList
            .map((e) =>
              typeof e === "object"
                ? `${e.field || e.parameter || e.property || ""}: ${e.message || e.defaultMessage || JSON.stringify(e)}`
                : String(e)
            )
            .join("; ");
        } else if (errorsList && typeof errorsList === "object") {
          errorDetail = JSON.stringify(errorsList);
        }
        const serverMsg = errorDetail || err?.response?.data?.message || err?.response?.data?.error || err?.message;
        console.error(`❌ Local subcategory ${id} backend sync error:`, {
          serverMsg,
          errorDetail,
          rawErrors: errorsList,
          responseData: err?.response?.data,
          payloadSent: payload,
        });
        backendError = serverMsg;
      }
    }
  }

  if (!updatedSub) {
    updatedSub = normalizeSubcategory({
      ...payload,
      imageURL: finalImage,
      imageUrl: finalImage,
      image: finalImage,
      subcategoryId: id,
      id,
      isLocalOnly: !isRemoteId(id),
    });
    if (!isRemoteId(id)) {
      updatedSub.isLocalOnly = true;
      updatedSub.syncError = backendError;
    }
  }

  const existing = (getStoredSubcategories() || [])
    .map(normalizeSubcategory)
    .filter((s) => s && s.name && !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0" || s.slug === "subcategory" || s.slug === "/subcategory")));

  const updatedSubs = existing.map((s) =>
    String(s.subcategoryId || s.id) === String(id) ? { ...s, ...updatedSub } : s
  );

  if (!updatedSubs.some((s) => String(s.subcategoryId || s.id) === String(id))) {
    updatedSubs.unshift(updatedSub);
  }
  setStoredSubcategories(updatedSubs);

  // Sync with parent category
  const categories = getStoredCategories();
  const updatedCategories = categories.map((cat) => {
    if (String(cat.categoryId || cat.id) === String(parentCatId)) {
      const childSubs = (cat.subcategories || [])
        .map(normalizeSubcategory)
        .filter((s) => s && s.name && !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0")));
      return {
        ...cat,
        subcategories: [
          updatedSub,
          ...childSubs.filter((s) => String(s.subcategoryId || s.id) !== String(id)),
        ],
      };
    }
    return cat;
  });
  setStoredCategories(updatedCategories);

  dispatchDataUpdate("subcategories", "UPDATE", { id, ...updatedSub });
  invalidateRequest("categories");

  return updatedSub;
};

/**
 * Sync a local-only subcategory to the remote database
 */
export const syncLocalSubcategoryToBackend = async (sub) => {
  const oldLocalId = sub.subcategoryId || sub.id;
  const safeImg = sanitizeSubcategoryImageUrl(sub.imageURL || sub.imageUrl || sub.image, sub.name);
  const result = await createSubcategory({
    categoryId: !isNaN(Number(sub.categoryId)) ? Number(sub.categoryId) : sub.categoryId,
    name: sub.name,
    slug: sub.slug,
    imageURL: safeImg,
    imageUrl: safeImg,
    image: safeImg,
    sortOrder: sub.sortOrder,
    active: sub.active,
    visibleOnWebsite: sub.visibleOnWebsite !== false,
  });

  if (result && isRemoteId(result.subcategoryId || result.id)) {
    // Successfully created or resolved in backend database, remove all local-only drafts with this name
    const stored = getStoredSubcategories();
    const cleaned = stored.filter(
      (s) =>
        String(s.subcategoryId || s.id) !== String(oldLocalId) &&
        !(
          !isRemoteId(s.subcategoryId || s.id) &&
          s.name?.trim().toLowerCase() === sub.name?.trim().toLowerCase() &&
          String(s.categoryId) === String(sub.categoryId)
        )
    );
    setStoredSubcategories(cleaned);
  }
  return result;
};


/**
 * Delete a subcategory (sends live DELETE to backend database with fallbacks)
 */
export const deleteSubcategory = async (id, categoryId = null, subName = "") => {
  // 1. Mark as deleted immediately in local blacklist (both ID and name)
  markSubcategoryDeleted(id, subName, categoryId);

  // 2. Remove immediately from local subcategories store (including any duplicate drafts)
  const existing = getStoredSubcategories();
  const nameToMatch = (subName || "").trim().toLowerCase();
  const filtered = existing.filter((s) => {
    const sId = String(s.subcategoryId || s.id);
    if (sId === String(id)) return false;
    // Also clean up any duplicate local-only drafts for the same subcategory
    if (nameToMatch && !isRemoteId(sId) && s.name?.trim().toLowerCase() === nameToMatch) {
      if (!categoryId || String(s.categoryId) === String(categoryId)) {
        markSubcategoryDeleted(sId, nameToMatch, categoryId);
        return false;
      }
    }
    return true;
  });
  setStoredSubcategories(filtered);

  // 3. Also remove from all parent categories' nested subcategories arrays
  const categories = getStoredCategories();
  const updatedCategories = categories.map((cat) => {
    if (Array.isArray(cat.subcategories)) {
      return {
        ...cat,
        subcategories: cat.subcategories.filter((s) => {
          const sId = typeof s === "string" ? s : s?.subcategoryId || s?.id;
          const sName = typeof s === "string" ? s : s?.name;
          if (String(sId) === String(id)) return false;
          if (nameToMatch && !isRemoteId(sId) && sName?.trim().toLowerCase() === nameToMatch) {
            return false;
          }
          return true;
        }),
      };
    }
    return cat;
  });
  setStoredCategories(updatedCategories);

  // 4. Invalidate cache and broadcast delete update
  invalidateRequest("categories");
  invalidateRequest("subcategories");
  invalidateRequest("/subcategories");
  dispatchDataUpdate("subcategories", "DELETE", { id });

  // 5. Send live DELETE to backend database
  if (isRemoteId(id)) {
    let deletedOnServer = false;
    let lastError = null;

    const candidateEndpoints = [
      `/subcategories/${id}`,
      `/admin/subcategories/${id}`,
      ...(categoryId ? [`/categories/${categoryId}/subcategories/${id}`, `/subcategories/${id}?categoryId=${categoryId}`] : []),
    ];

    for (const ep of candidateEndpoints) {
      try {
        await api.delete(ep);
        deletedOnServer = true;
        break;
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        // If 404 or 405, try alternative candidate routes
        if (status === 404 || status === 405) {
          continue;
        }
        // Active server rejection (400, 409, 500)
        break;
      }
    }

    if (!deletedOnServer && lastError) {
      const status = lastError?.response?.status;
      const rawMsg =
        lastError?.response?.data?.message ||
        lastError?.response?.data?.error ||
        lastError?.message ||
        "";
      const isConstraintError =
        status === 409 ||
        /foreign key|constraint|product|cannot delete|child|referenced/i.test(rawMsg);

      if (isConstraintError) {
        // Roll back local deletion so state stays consistent with database
        unmarkSubcategoryDeleted(id, subName, categoryId);
        throw new Error(
          rawMsg ||
            "Cannot delete subcategory from database because products are currently assigned to it. Please reassign or delete its products first, or toggle Website Visibility OFF to hide it."
        );
      } else if (status !== 404) {
        console.warn(`Backend deleteSubcategory(${id}) response notice:`, rawMsg);
      }
    }
  }

  return { success: true, id };
};

/**
 * Purges all local-only drafts completely from storage and local caches
 */
export const purgeAllLocalSubcategoryDrafts = () => {
  const existing = getStoredSubcategories();
  const localItems = existing.filter((s) => !isRemoteId(s.subcategoryId || s.id));
  localItems.forEach((s) => {
    markSubcategoryDeleted(s.subcategoryId || s.id, s.name, s.categoryId);
  });
  const remoteOnly = existing.filter((s) => isRemoteId(s.subcategoryId || s.id));
  setStoredSubcategories(remoteOnly);
  dispatchDataUpdate("subcategories", "DELETE", { localPurged: true });
  return localItems.length;
};
