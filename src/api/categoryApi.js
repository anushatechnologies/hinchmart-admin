import api from "./axios";
import { invalidateRequest } from "./requestCache";
import { dispatchDataUpdate } from "./dataStore";
import { compressImage } from "../utils/imageStore";

const STORAGE_KEY_CATEGORIES = "hinchmart_categories_data_v5";
const STORAGE_KEY_SUBCATEGORIES = "hinchmart_subcategories_data_v5";
const STORAGE_KEY_DELETED_CATS = "hinchmart_deleted_cat_ids_v1";
const STORAGE_KEY_DELETED_SUBS = "hinchmart_deleted_sub_ids_v1";
const STORAGE_KEY_DELETED_SUB_NAMES = "hinchmart_deleted_sub_names_v1";

const isRemoteId = (id) => {
  if (!id) return false;
  const num = Number(id);
  return !isNaN(num) && num > 0 && num <= 2147483647;
};

export const getDeletedCategoryIds = () => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_CATS);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
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

export const markCategoryDeleted = (id) => {
  const deleted = getDeletedCategoryIds();
  deleted.add(String(id));
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED_CATS, JSON.stringify(Array.from(deleted)));
    } catch {}
  }
};

export const unmarkCategoryDeleted = (id) => {
  if (!id) return;
  const deleted = getDeletedCategoryIds();
  deleted.delete(String(id));
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED_CATS, JSON.stringify(Array.from(deleted)));
    } catch {}
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

const list = (payload) => (Array.isArray(payload) ? payload : payload?.categories || payload?.data || []);

export const INITIAL_CATEGORIES = [];

// In-memory runtime store for guaranteed availability
let inMemoryCategories = null;
let inMemorySubcategories = null;

const safeSetItem = (key, data) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

export const getStoredCategories = () => {
  if (inMemoryCategories && inMemoryCategories.length > 0) {
    return inMemoryCategories;
  }
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const hasLive = parsed.some((c) => Number(c.categoryId || c.id) > 10);
        const cleaned = hasLive ? parsed.filter((c) => Number(c.categoryId || c.id) > 4) : parsed;
        inMemoryCategories = cleaned;
        return inMemoryCategories;
      }
    }
  } catch {}

  inMemoryCategories = [];
  safeSetItem(STORAGE_KEY_CATEGORIES, inMemoryCategories);
  return inMemoryCategories;
};

export const setStoredCategories = (categories) => {
  inMemoryCategories = categories;
  safeSetItem(STORAGE_KEY_CATEGORIES, categories);
};

const ensureNumericSubcategory = (sub) => {
  if (!sub || typeof sub !== "object") return sub;
  const rawId = sub.subcategoryId ?? sub.id;
  const numId = (rawId !== undefined && rawId !== null && rawId !== "" && !isNaN(Number(rawId)))
    ? Number(rawId)
    : rawId;
  const numCatId = (sub.categoryId !== undefined && sub.categoryId !== null && sub.categoryId !== "" && !isNaN(Number(sub.categoryId)))
    ? Number(sub.categoryId)
    : sub.categoryId;

  let img = sub.imageURL || sub.imageUrl || sub.image || "";
  if (img && typeof img === "string" && !img.startsWith("data:")) {
    const isCloud = /s3|amazonaws|storage\.hinchmart\.com|firebasestorage/i.test(img);
    if (!isCloud) {
      if (img.includes("?")) img = img.split("?")[0];
      if (!/\.(jpg|jpeg|png|webp|svg|gif)$/i.test(img)) {
        img = `${img}.jpg`;
      }
    }
  }

  return {
    ...sub,
    id: numId ?? sub.id,
    subcategoryId: numId ?? sub.subcategoryId,
    categoryId: numCatId ?? 1,
    imageURL: img || sub.imageURL || "",
    imageUrl: img || sub.imageUrl || "",
    image: img || sub.image || "",
    sortOrder: Number(sub.sortOrder || 0),
  };
};

const dedupeSubs = (list) => {
  const seenIds = new Set();
  const seenLocalNames = new Set();
  const res = [];
  for (const item of list || []) {
    if (!item) continue;
    const idKey = String(item.subcategoryId ?? item.id ?? item._id ?? "");
    if (idKey && seenIds.has(idKey)) continue;

    // For local drafts, also avoid duplicate drafts with identical name & category
    if (!isRemoteId(idKey)) {
      const nameKey = `${(item.name || "").trim().toLowerCase()}:::${String(item.categoryId || "")}`;
      if (seenLocalNames.has(nameKey)) continue;
      seenLocalNames.add(nameKey);
    }

    if (idKey) seenIds.add(idKey);
    res.push(item);
  }
  return res;
};

export const getStoredSubcategories = () => {
  const deletedSubs = getDeletedSubcategoryIds();
  const deletedNames = getDeletedSubcategoryNames();

  const isDeleted = (s) => {
    if (!s) return true;
    const sId = String(s.subcategoryId || s.id || "");
    const cleanName = (s.name || "").trim().toLowerCase();
    const sKey = `${cleanName}:::${String(s.categoryId || "")}`;
    if (sId && deletedSubs.has(sId)) return true;
    if (cleanName && deletedNames.has(cleanName)) return true;
    if (deletedNames.has(sKey)) return true;
    return false;
  };

  if (inMemorySubcategories && inMemorySubcategories.length > 0) {
    const valid = dedupeSubs(
      inMemorySubcategories
        .map(ensureNumericSubcategory)
        .filter(
          (s) =>
            s &&
            s.name &&
            s.name.trim() &&
            !isDeleted(s) &&
            !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0" || s.slug === "subcategory" || s.slug === "/subcategory"))
        )
    );
    inMemorySubcategories = valid;
    return inMemorySubcategories;
  }
  if (typeof window === "undefined") {
    return dedupeSubs(
      INITIAL_CATEGORIES.flatMap((c) => (c.subcategories || []).map(ensureNumericSubcategory)).filter(
        (s) => s && !isDeleted(s)
      )
    );
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUBCATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = dedupeSubs(
          parsed
            .map(ensureNumericSubcategory)
            .filter(
              (s) =>
                s &&
                s.name &&
                s.name.trim() &&
                !isDeleted(s) &&
                !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0" || s.slug === "subcategory" || s.slug === "/subcategory"))
            )
        );
        inMemorySubcategories = valid;
        safeSetItem(STORAGE_KEY_SUBCATEGORIES, valid);
        return inMemorySubcategories;
      }
    }
  } catch {}

  const categories = getStoredCategories();
  const allSubs = [];
  categories.forEach((cat) => {
    (cat.subcategories || []).forEach((sub) => {
      if (sub && sub.name && sub.name.trim() && !(sub.name === "Subcategory" && (!sub.id || sub.id === 0 || sub.id === "0"))) {
        const rawCatId = cat.categoryId || cat.id;
        const numCatId = (!isNaN(Number(rawCatId)) && rawCatId !== "" && rawCatId !== null) ? Number(rawCatId) : rawCatId;
        const subObj = ensureNumericSubcategory({
          ...sub,
          categoryId: numCatId,
        });
        if (!isDeleted(subObj)) {
          allSubs.push(subObj);
        }
      }
    });
  });
  const dedupedAll = dedupeSubs(allSubs);
  inMemorySubcategories = dedupedAll;
  safeSetItem(STORAGE_KEY_SUBCATEGORIES, dedupedAll);
  return dedupedAll;
};

export const setStoredSubcategories = (subs) => {
  const deletedSubs = getDeletedSubcategoryIds();
  const deletedNames = getDeletedSubcategoryNames();
  const isDeleted = (s) => {
    if (!s) return true;
    const sId = String(s.subcategoryId || s.id || "");
    const cleanName = (s.name || "").trim().toLowerCase();
    const sKey = `${cleanName}:::${String(s.categoryId || "")}`;
    if (sId && deletedSubs.has(sId)) return true;
    if (cleanName && deletedNames.has(cleanName)) return true;
    if (deletedNames.has(sKey)) return true;
    return false;
  };

  const valid = dedupeSubs(
    (subs || [])
      .map(ensureNumericSubcategory)
      .filter(
        (s) =>
          s &&
          s.name &&
          s.name.trim() &&
          !isDeleted(s) &&
          !(s.name === "Subcategory" && (!s.id || s.id === 0 || s.id === "0" || s.slug === "subcategory" || s.slug === "/subcategory"))
      )
  );
  inMemorySubcategories = valid;
  safeSetItem(STORAGE_KEY_SUBCATEGORIES, valid);
};


const STORAGE_KEY_CUSTOM_IMAGES = "hinchmart_custom_category_images_v1";

export const getCustomCategoryImages = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_IMAGES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setCustomCategoryImage = (id, imageUrl) => {
  if (typeof window === "undefined" || !id) return;
  try {
    const current = getCustomCategoryImages();
    if (imageUrl) {
      current[String(id)] = imageUrl;
    } else {
      delete current[String(id)];
    }
    localStorage.setItem(STORAGE_KEY_CUSTOM_IMAGES, JSON.stringify(current));
  } catch {}
};

export const normalizeCategory = (cat) => {
  if (!cat) return null;
  const id = cat.categoryId ?? cat.id ?? cat._id;
  const customImages = getCustomCategoryImages();
  const customImg = id ? customImages[String(id)] : null;
  let image = customImg || cat.imageURL || cat.imageUrl || cat.image || "";
  if (!image || typeof image !== "string") {
    image = "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80";
  }
  const name = cat.name || cat.title || "Category";
  const description = cat.description || cat.categoryDescription || cat.desc || cat.details || "";

  return {
    ...cat,
    id: id ? (typeof id === "number" ? id : id) : Date.now(),
    categoryId: id ? (typeof id === "number" ? id : Number(String(id).replace(/[^0-9]/g, "")) || id) : Date.now(),
    name,
    title: name,
    slug: cat.slug || slugify(name),
    description,
    desc: description,
    categoryDescription: description,
    imageURL: image,
    imageUrl: image,
    image,
    sortOrder: Number(cat.sortOrder ?? cat.displayOrder ?? 0),
    displayOrder: Number(cat.displayOrder ?? cat.sortOrder ?? 0),
    active: cat.active !== false && cat.isActive !== false,
    subcategories: Array.isArray(cat.subcategories)
      ? cat.subcategories
          .filter((s) => {
            if (!s) return false;
            const sName = (typeof s === "string" ? s : s.name || s.title || "").trim();
            if (!sName) return false;
            const sId = typeof s === "string" ? null : s.subcategoryId ?? s.id;
            const sSlug = typeof s === "string" ? "" : s.slug;
            if (sName.toLowerCase() === "subcategory" && (!sId || sId === 0 || sId === "0" || sSlug === "subcategory" || sSlug === "/subcategory")) {
              return false;
            }
            return true;
          })
          .map((s) => ({
            ...s,
            id: s.subcategoryId ?? s.id,
            subcategoryId: s.subcategoryId ?? s.id,
            categoryId: id,
            name: typeof s === "string" ? s : s.name,
            slug: typeof s === "string" ? slugify(s) : s.slug || slugify(s.name),
            imageURL: s.imageURL || s.imageUrl || s.image || "",
            imageUrl: s.imageURL || s.imageUrl || s.image || "",
            image: s.imageURL || s.imageUrl || s.image || "",
            active: typeof s === "string" ? true : s.active !== false,
          }))
      : [],
  };
};

/**
 * Get all Categories (fetches live from database, falls back to local only if offline)
 */
export const getCategories = async () => {
  const deletedIds = getDeletedCategoryIds();
  const customImages = getCustomCategoryImages();
  try {
    const response = await api.get("/categories");
    const rawList = list(response.data);
    const remoteNormalized = rawList
      .map(normalizeCategory)
      .filter((c) => !deletedIds.has(String(c.categoryId || c.id)));

    const map = new Map();
    remoteNormalized.forEach((c) => {
      const idStr = String(c.categoryId || c.id);
      if (!deletedIds.has(idStr)) {
        if (customImages[idStr]) {
          c.imageUrl = customImages[idStr];
          c.imageURL = customImages[idStr];
          c.image = customImages[idStr];
        }
        map.set(idStr, c);
      }
    });

    const dummyIds = new Set(["1", "2", "3", "4"]);
    const hasRemoteCategories = remoteNormalized.length > 0;
    const localCats = getStoredCategories().map(normalizeCategory);
    localCats.forEach((c) => {
      const id = String(c.categoryId || c.id);
      if (!deletedIds.has(id)) {
        if (hasRemoteCategories && dummyIds.has(id)) {
          // Do not merge mock dummy categories (1, 2, 3, 4) if live remote categories exist
          return;
        }
        if (!map.has(id)) {
          if (customImages[id]) {
            c.imageUrl = customImages[id];
            c.imageURL = customImages[id];
            c.image = customImages[id];
          }
          map.set(id, c);
        } else if (customImages[id]) {
          const existing = map.get(id);
          existing.imageUrl = customImages[id];
          existing.imageURL = customImages[id];
          existing.image = customImages[id];
        }
      }
    });

    const merged = Array.from(map.values()).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    setStoredCategories(merged);
    return merged;
  } catch (err) {
    console.warn("Live backend /categories fetch notice:", err?.message);
    const local = getStoredCategories()
      .map(normalizeCategory)
      .filter((c) => !deletedIds.has(String(c.categoryId || c.id)));
    local.forEach((c) => {
      const id = String(c.categoryId || c.id);
      if (customImages[id]) {
        c.imageUrl = customImages[id];
        c.imageURL = customImages[id];
        c.image = customImages[id];
      }
    });
    return local;
  }
};


/**
 * Create a new Category (sends live POST to backend database)
 */
export const createCategory = async (data) => {
  const name = (data.name || data.title || "").trim();
  const slug = data.slug?.trim() || slugify(name);
  const description = (data.description || data.desc || data.categoryDescription || "").trim();

  let finalImage = data.imageURL || data.imageUrl || data.image || "";
  // Image is already uploaded to S3 by the UI before form submission — no need to re-compress

  const payload = {
    name,
    title: name,
    slug,
    description,
    desc: description,
    categoryDescription: description,
    imageURL: finalImage,
    imageUrl: finalImage,
    image: finalImage,
    sortOrder: Number(data.sortOrder || 0),
    active: data.active !== false,
  };

  let savedCategory = null;
  try {
    const response = await api.post("/categories", payload);
    const resData = response.data?.data || response.data?.category || response.data;
    if (resData) {
      savedCategory = normalizeCategory(resData);
    }
  } catch (err) {
    if (err?.response?.status === 409) {
      try {
        const uniqueSlug = `${slug}-${Date.now().toString().slice(-4)}`;
        const retryRes = await api.post("/categories", { ...payload, slug: uniqueSlug });
        const resData = retryRes.data?.data || retryRes.data?.category || retryRes.data;
        if (resData) {
          savedCategory = normalizeCategory(resData);
        }
      } catch {}
    }
    console.warn("Live backend POST /categories notice (handled with offline persistence):", err?.message);
  }

  if (!savedCategory) {
    const newId = Date.now();
    savedCategory = normalizeCategory({
      ...payload,
      description,
      desc: description,
      imageURL: finalImage,
      imageUrl: finalImage,
      image: finalImage,
      categoryId: newId,
      id: newId,
    });
  }

  unmarkCategoryDeleted(savedCategory.categoryId || savedCategory.id);
  if (finalImage) {
    setCustomCategoryImage(savedCategory.categoryId || savedCategory.id, finalImage);
  }

  const existing = getStoredCategories();
  const updated = [savedCategory, ...existing.filter((c) => String(c.categoryId || c.id) !== String(savedCategory.categoryId || savedCategory.id))];
  setStoredCategories(updated);

  dispatchDataUpdate("categories", "CREATE", savedCategory);
  invalidateRequest("categories");

  return savedCategory;
};

/**
 * Update an existing Category (sends live PUT to backend database)
 */
export const updateCategory = async (id, data) => {
  let finalImage = data.imageURL || data.imageUrl || data.image || "";
  // Image is already uploaded to S3 by the UI before form submission — no need to re-compress

  const name = data.name ? data.name.trim() : "";
  const description = (data.description !== undefined ? data.description : (data.desc !== undefined ? data.desc : "")).trim();
  const payload = {
    name,
    title: name,
    slug: data.slug?.trim() || slugify(name),
    description,
    desc: description,
    categoryDescription: description,
    imageURL: finalImage,
    imageUrl: finalImage,
    image: finalImage,
    sortOrder: Number(data.sortOrder || 0),
    active: data.active !== false,
  };

  // Permanently record custom image mapping so it never disappears on refresh
  if (finalImage !== undefined) {
    setCustomCategoryImage(id, finalImage);
  }



  let updatedCategory = null;
  if (isRemoteId(id)) {
    try {
      const response = await api.put(`/categories/${id}`, payload);
      const resData = response.data?.data || response.data?.category || response.data;
      if (resData) {
        updatedCategory = normalizeCategory(resData);
      }
    } catch (err) {
      console.warn(`Live backend PUT /categories/${id} notice:`, err?.message);
    }
  } else {
    try {
      const response = await api.post("/categories", payload);
      const resData = response.data?.data || response.data?.category || response.data;
      if (resData) {
        updatedCategory = normalizeCategory(resData);
      }
    } catch (err) {
      console.warn(`Local category ${id} backend sync notice:`, err?.message);
    }
  }

  if (!updatedCategory) {
    updatedCategory = normalizeCategory({
      ...payload,
      imageUrl: finalImage || payload.imageUrl,
      image: finalImage || payload.image,
      categoryId: id,
      id,
    });
  }

  const existing = getStoredCategories();
  const updated = existing.map((cat) =>
    String(cat.categoryId || cat.id) === String(id) ? { ...cat, ...updatedCategory } : cat
  );
  setStoredCategories(updated);

  dispatchDataUpdate("categories", "UPDATE", { id, ...updatedCategory });
  invalidateRequest("categories");

  return updatedCategory;
};

export const toggleCategoryActive = async (id, category) => {
  const currentActive = category.active ?? true;
  return updateCategory(id, { ...category, active: !currentActive });
};

/**
 * Delete a Category (sends live DELETE to backend database)
 */
export const deleteCategory = async (id) => {
  markCategoryDeleted(id);
  setCustomCategoryImage(id, null);

  if (isRemoteId(id)) {
    try {
      await api.delete(`/categories/${id}`);
    } catch (err) {
      if (err?.response?.status !== 404) {
        console.warn(`Live backend DELETE /categories/${id} notice:`, err?.response?.data?.message || err?.message);
      }
    }
  }

  const existing = getStoredCategories();
  const filtered = existing.filter((c) => String(c.categoryId || c.id) !== String(id));
  setStoredCategories(filtered);

  dispatchDataUpdate("categories", "DELETE", { id });
  invalidateRequest("categories");

  return { success: true, id };
};

/**
 * 2.4 Category Requests Moderation (Submitted by Sellers)
 * Controller: CategoryRequestController.java
 * GET /api/admin/category-requests
 * GET /api/seller/category-requests
 */
export const getCategoryRequests = async (params = { status: "PENDING" }) => {
  try {
    const response = await api.get("/admin/category-requests", { params });
    const raw = list(response.data);
    if (raw && raw.length > 0) return raw;
  } catch (err) {
    try {
      const response = await api.get("/seller/category-requests", { params });
      return list(response.data);
    } catch (fallbackErr) {
      console.warn("Backend /admin/category-requests notice:", fallbackErr?.message);
    }
  }
  return [];
};

/**
 * Approve Category Request
 * Primary: POST /api/admin/category-requests/{id}/approve
 * Fallback: PATCH /api/admin/category-requests/{id}/approve
 */
export const approveCategoryRequest = async (id) => {
  try {
    const response = await api.post(`/admin/category-requests/${id}/approve`);
    dispatchDataUpdate("category_requests", "APPROVE", { id });
    return response.data?.data || response.data;
  } catch (err) {
    try {
      const response = await api.patch(`/admin/category-requests/${id}/approve`);
      dispatchDataUpdate("category_requests", "APPROVE", { id });
      return response.data?.data || response.data;
    } catch (fallbackErr) {
      console.warn(`Backend /admin/category-requests/${id}/approve notice:`, fallbackErr?.message);
      throw fallbackErr;
    }
  }
};

/**
 * Reject Category Request with reason
 * Primary: POST /api/admin/category-requests/{id}/reject
 * Fallback: PATCH /api/admin/category-requests/{id}/reject
 * body: { reason: "Already exists as subcategory" }
 */
export const rejectCategoryRequest = async (id, reasonOrRemarks = "Rejected by admin") => {
  const reason = typeof reasonOrRemarks === "string" ? reasonOrRemarks : reasonOrRemarks?.reason || "Rejected by admin";
  const body = { reason, remarks: reason };

  try {
    const response = await api.post(`/admin/category-requests/${id}/reject`, body);
    dispatchDataUpdate("category_requests", "REJECT", { id, reason });
    return response.data?.data || response.data;
  } catch (err) {
    try {
      const response = await api.patch(`/admin/category-requests/${id}/reject`, body);
      dispatchDataUpdate("category_requests", "REJECT", { id, reason });
      return response.data?.data || response.data;
    } catch (fallbackErr) {
      console.warn(`Backend /admin/category-requests/${id}/reject notice:`, fallbackErr?.message);
      throw fallbackErr;
    }
  }
};


