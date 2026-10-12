import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  RotateCcw,
  Package,
  Layers,
  Tag,
  FolderTree,
  Upload,
  Check,
  X,
  SlidersHorizontal,
  Image as ImageIcon,
  ShieldCheck,
  Loader2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Download,
  Globe,
  Eye,
  EyeOff,
  Smartphone,
  AlertTriangle,
} from "lucide-react";
import { getCategories, getStoredCategories } from "../api/categoryApi";
import {
  getSubcategories,
  getStoredSubcategories,
  normalizeSubcategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  toggleSubcategoryWebsiteVisibility,
  resolveSubcategoryImage,
  isRemoteId,
  syncLocalSubcategoryToBackend,
  purgeAllLocalSubcategoryDrafts,
} from "../api/subcategoryApi";
import { useToast } from "../components/ToastContext";
import { subscribeDataUpdate } from "../api/dataStore";
import { validateImageFile } from "../utils/imageValidation";
import { compressImage, compressImageToFile } from "../utils/imageStore";
import { uploadSubcategoryImage } from "../api/imageApi";
import "../styles/pages.css";
import "../styles/categories.css";
import "../styles/products.css";

const slugify = (value = "") =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const EMPTY_SUBCATEGORY_FORM = {
  categoryId: "",
  name: "",
  slug: "",
  sortOrder: 0,
  imageURL: "",
  imageUrl: "",
  image: null,
  active: true,
  visibleOnWebsite: true,
};

export default function Subcategories() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subcategories, setSubcategories] = useState(() => (getStoredSubcategories() || []).map(normalizeSubcategory).filter(Boolean));
  const [categories, setCategories] = useState(() => (getStoredCategories() || []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(() => searchParams.get("categoryId") || "ALL");
  const [selectedVisibilityFilter, setSelectedVisibilityFilter] = useState("ALL"); // ALL | VISIBLE_WEB | HIDDEN_WEB | APP_ACTIVE | APP_INACTIVE
  const [showModal, setShowModal] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [form, setForm] = useState(EMPTY_SUBCATEGORY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [imageError, setImageError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [togglingWebsiteId, setTogglingWebsiteId] = useState(null);
  const [togglingActiveId, setTogglingActiveId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const uploadAbortRef = useRef(null);
  const selfTriggeredRef = useRef(false);

  const handleSyncSubcategory = async (sub) => {
    const id = sub.subcategoryId || sub.id;
    try {
      setSyncingId(id);
      const res = await syncLocalSubcategoryToBackend(sub);
      if (res && isRemoteId(res.subcategoryId || res.id)) {
        toast.success(`Subcategory "${sub.name}" synced to database successfully!`);
        await loadData(false);
      } else {
        toast.error(`Database sync failed: ${res?.syncError || "Check connection or re-login"}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Sync to database failed");
    } finally {
      setSyncingId(null);
    }
  };

  const loadData = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      setError("");
      const [catData, subData] = await Promise.all([
        getCategories(),
        getSubcategories(),
      ]);

      const catList = Array.isArray(catData) ? catData : catData?.categories || catData?.data || [];
      const subList = Array.isArray(subData) ? subData : subData?.subcategories || subData?.data || [];

      setCategories(catList);
      setSubcategories(subList.map(normalizeSubcategory).filter(Boolean));
    } catch (err) {
      console.error(err);
      setError("Unable to load subcategories from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeDataUpdate((event) => {
      if (event.entity === "categories" || event.entity === "subcategories") {
        // Skip refetch if this component itself triggered the update
        if (selfTriggeredRef.current) {
          selfTriggeredRef.current = false;
          return;
        }
        loadData(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle URL query parameters (e.g. ?categoryId=36, ?openAdd=true, ?search=...)
  useEffect(() => {
    const openAddParam = searchParams.get("openAdd");
    const catIdParam = searchParams.get("categoryId");
    const searchParam = searchParams.get("search");

    if (searchParam !== null) {
      setSearch(searchParam);
    }
    if (catIdParam !== null && catIdParam !== "") {
      setSelectedCategoryFilter(catIdParam);
    }
    if (openAddParam === "true") {
      setEditingSubcategory(null);
      setForm({
        ...EMPTY_SUBCATEGORY_FORM,
        categoryId: catIdParam || "",
        active: true,
        visibleOnWebsite: true,
      });
      setImageError("");
      setShowModal(true);
      // Remove openAdd from URL so modal doesn't re-open on refresh
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("openAdd");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams]);

  const openAddModal = (defaultCatId = null) => {
    setEditingSubcategory(null);
    let targetCatId = defaultCatId || (selectedCategoryFilter !== "ALL" ? String(selectedCategoryFilter) : "");
    if (targetCatId && !validCategories.some((c) => String(c.categoryId || c.id) === String(targetCatId))) {
      targetCatId = validCategories.length > 0 ? String(validCategories[0].categoryId || validCategories[0].id) : "";
    } else if (!targetCatId && validCategories.length > 0) {
      targetCatId = String(validCategories[0].categoryId || validCategories[0].id);
    }
    setForm({
      ...EMPTY_SUBCATEGORY_FORM,
      categoryId: targetCatId,
      active: true,
      visibleOnWebsite: true,
    });
    setImageError("");
    setShowModal(true);
  };

  const openEditModal = (sub) => {
    setEditingSubcategory(sub);
    const subName = sub.name || sub.title || "";
    const currentImg = sub.imageURL || sub.imageUrl || sub.image || "";
    setForm({
      categoryId: String(sub.categoryId || ""),
      name: subName,
      slug: sub.slug || slugify(subName),
      sortOrder: sub.sortOrder ?? 0,
      imageURL: currentImg,
      imageUrl: currentImg,
      image: currentImg,
      active: sub.active !== false && sub.isActive !== false,
      visibleOnWebsite: sub.visibleOnWebsite !== false,
    });
    setImageError("");
    setShowModal(true);
  };

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setForm((prev) => {
      const prevAutoSlug = slugify(prev.name || "");
      const shouldAutoUpdateSlug = !prev.slug || prev.slug === prevAutoSlug;
      return {
        ...prev,
        name: newName,
        slug: shouldAutoUpdateSlug ? slugify(newName) : prev.slug,
      };
    });
  };

  const [imageUploadStatus, setImageUploadStatus] = useState("idle"); // 'idle' | 's3' | 'local'

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const err = await validateImageFile(file);
    if (err) {
      setImageError(err);
      setImageUploadStatus("idle");
      e.target.value = "";
      return;
    }
    setImageError("");
    setUploadingImage(true);
    setImageUploadStatus("idle");

    // Cancel any previous in-flight upload
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
    }
    const abortController = new AbortController();
    uploadAbortRef.current = abortController;

    try {
      // 1. Immediately compress locally (< 30ms) for instant artwork preview
      const compressed = await compressImage(file, 600, 0.82);
      setForm((prev) => ({
        ...prev,
        image: compressed,
        imageUrl: compressed,
        imageURL: compressed,
      }));

      // 2. Pre-compress to ultra-lightweight File (< 50KB) so S3 upload finishes in < 1 second
      const optimizedFile = await compressImageToFile(file, 600, 0.82);

      // 3. Fast upload to S3 backend endpoint (5s fast-fail timeout instead of 30s)
      const uploadedUrl = await uploadSubcategoryImage(optimizedFile || file, {
        abortController,
        timeout: 5000,
      });

      if (uploadedUrl) {
        setForm((prev) => ({
          ...prev,
          imageURL: uploadedUrl,
          image: uploadedUrl,
          imageUrl: uploadedUrl,
        }));
        setImageUploadStatus("s3");
        setImageError("");
        toast.success("Subcategory artwork uploaded to cloud storage!");
      } else {
        setImageUploadStatus("local");
      }
    } catch (errUpload) {
      // Don't show error if user intentionally cancelled
      if (errUpload?.name === "CanceledError" || abortController.signal.aborted) {
        return;
      }
      console.warn("Subcategory image upload notice (using instant artwork):", errUpload?.message || errUpload);
      setImageUploadStatus("local");
      setImageError("");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
      uploadAbortRef.current = null;
    }
  };


  const handleToggleActivate = async (sub) => {
    const id = sub.subcategoryId || sub.id || sub._id;
    const currentActive = sub.active !== false && sub.isActive !== false;
    const targetActive = !currentActive;
    try {
      setTogglingActiveId(id);
      // Optimistic update
      setSubcategories((current) =>
        current.map((item) =>
          (item.subcategoryId || item.id || item._id) === id
            ? { ...item, active: targetActive, isActive: targetActive }
            : item
        )
      );

      await updateSubcategory(id, {
        ...sub,
        active: targetActive,
      });

      if (targetActive) {
        toast.success(`Subcategory "${sub.name}" activated in App & Catalog.`);
      } else {
        toast.warning(`Subcategory "${sub.name}" deactivated in App & Catalog.`);
      }
    } catch (err) {
      // Revert on error
      setSubcategories((current) =>
        current.map((item) =>
          (item.subcategoryId || item.id || item._id) === id
            ? { ...item, active: currentActive, isActive: currentActive }
            : item
        )
      );
      toast.error(err?.response?.data?.message || "Failed to toggle subcategory status.");
    } finally {
      setTogglingActiveId(null);
    }
  };

  /**
   * Quick Toggle Website Visibility (ON / OFF)
   * Method: PATCH /subcategories/{id}/website-visibility
   */
  const handleToggleWebsiteVisibility = async (sub) => {
    const id = sub.subcategoryId || sub.id || sub._id;
    const currentVisibility = sub.visibleOnWebsite !== false;
    const targetVisibility = !currentVisibility;

    try {
      setTogglingWebsiteId(id);
      // Optimistic update
      setSubcategories((current) =>
        current.map((item) =>
          (item.subcategoryId || item.id || item._id) === id
            ? { ...item, visibleOnWebsite: targetVisibility, visible_on_website: targetVisibility }
            : item
        )
      );

      await toggleSubcategoryWebsiteVisibility(id, targetVisibility);

      if (targetVisibility) {
        toast.success(`Subcategory "${sub.name}" is now VISIBLE on website.`);
      } else {
        toast.warning(`Subcategory "${sub.name}" is now HIDDEN on website.`);
      }
    } catch (err) {
      // Revert on failure
      setSubcategories((current) =>
        current.map((item) =>
          (item.subcategoryId || item.id || item._id) === id
            ? { ...item, visibleOnWebsite: currentVisibility, visible_on_website: currentVisibility }
            : item
        )
      );
      toast.error(err?.response?.data?.message || err?.message || "Failed to update website visibility.");
    } finally {
      setTogglingWebsiteId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploadingImage) {
      toast.info("Artwork upload is still processing, please wait a moment...");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Please enter a subcategory name.");
      return;
    }
    if (!form.categoryId) {
      toast.error("Please select a parent category.");
      return;
    }
    const finalSlug = form.slug?.trim() || slugify(form.name);
    if (!finalSlug) {
      toast.error("Please enter a URL Slug.");
      return;
    }

    try {
      setSubmitting(true);
      selfTriggeredRef.current = true;
      const finalImage = form.imageURL || form.imageUrl || form.image || "";
      const catIdNum = !isNaN(Number(form.categoryId)) ? Number(form.categoryId) : form.categoryId;
      const submitData = {
        ...form,
        categoryId: catIdNum,
        slug: finalSlug,
        imageURL: finalImage,
        imageUrl: finalImage,
        image: finalImage,
        active: Boolean(form.active),
        visibleOnWebsite: Boolean(form.visibleOnWebsite),
      };

      if (editingSubcategory) {
        const id = editingSubcategory.subcategoryId || editingSubcategory.id || editingSubcategory._id;
        const updated = await updateSubcategory(id, submitData);
        setSubcategories((prev) =>
          prev.map((s) => ((s.subcategoryId || s.id || s._id) === id ? { ...s, ...updated } : s))
        );
        if (updated?.isLocalOnly && updated.syncError) {
          toast.warning(`Subcategory updated locally in browser: ${updated.syncError}`);
        } else {
          toast.success(`Subcategory "${form.name}" updated successfully.`);
        }
      } else {
        const created = await createSubcategory(submitData);
        setSubcategories((prev) => [
          created,
          ...prev.filter((s) => String(s.subcategoryId || s.id) !== String(created.subcategoryId || created.id)),
        ]);
        // Reset category filter, search & visibility so user immediately sees newly added subcategory at the top of the table!
        setSelectedCategoryFilter("ALL");
        setSearch("");
        setSelectedVisibilityFilter("ALL");
        // Clear URL search params so page refresh does not filter out or re-open modal
        setSearchParams({}, { replace: true });
        if (created?.isLocalOnly && created.syncError) {
          toast.error(
            `Database notice: ${created.syncError}. Subcategory saved in browser only.`
          );
        } else {
          toast.success(`Subcategory "${form.name}" created and saved to database!`);
        }
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Subcategory operation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (sub) => {
    setDeleteTarget(sub);
  };

  const confirmSingleDelete = async () => {
    if (!deleteTarget) return;
    const sub = deleteTarget;
    const id = sub.subcategoryId || sub.id || sub._id;
    const subName = sub.name || "";
    const catId = sub.categoryId;

    try {
      setIsDeleting(true);
      selfTriggeredRef.current = true;

      // Optimistically remove from UI immediately (including any local duplicates with same name)
      setSubcategories((prev) =>
        prev.filter((item) => {
          const itemId = item.subcategoryId || item.id || item._id;
          if (String(itemId) === String(id)) return false;
          if (
            !isRemoteId(itemId) &&
            item.name?.trim().toLowerCase() === subName.trim().toLowerCase() &&
            String(item.categoryId) === String(catId)
          ) {
            return false;
          }
          return true;
        })
      );
      setSelectedIds((prev) => prev.filter((i) => String(i) !== String(id)));

      await deleteSubcategory(id, catId, subName);
      toast.info(`Subcategory "${subName}" deleted successfully.`);
      setDeleteTarget(null);
      await loadData(false);
    } catch (err) {
      const serverMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Unable to delete subcategory.";
      toast.error(`Delete notice: ${serverMsg}`);
      setDeleteTarget(null);
      await loadData(false);
    } finally {
      setIsDeleting(false);
      selfTriggeredRef.current = false;
    }
  };

  const validCategories = useMemo(() => {
    const hasLive = categories.some((c) => Number(c.categoryId || c.id) > 10);
    return categories.filter((cat) => {
      const cId = Number(cat.categoryId || cat.id);
      if (hasLive && cId >= 1 && cId <= 4) return false;
      return true;
    });
  }, [categories]);

  const getParentCategoryName = (categoryId) => {
    const found = validCategories.find(
      (c) => String(c.categoryId || c.id || c._id) === String(categoryId)
    );
    return found ? found.name : "—";
  };

  const filteredSubcategories = useMemo(() => {
    const seen = new Set();
    return subcategories.filter((sub) => {
      const idKey = String(sub.subcategoryId || sub.id || sub._id || "");
      if (idKey && seen.has(idKey)) return false;
      if (idKey) seen.add(idKey);

      const matchesSearch =
        (sub.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (sub.slug || "").toLowerCase().includes(search.toLowerCase()) ||
        getParentCategoryName(sub.categoryId).toLowerCase().includes(search.toLowerCase());

      const matchesCat =
        selectedCategoryFilter === "ALL" ||
        String(sub.categoryId) === String(selectedCategoryFilter);

      const isWebVis = sub.visibleOnWebsite !== false;
      const isAppAct = sub.active !== false && sub.isActive !== false;

      let matchesVisibility = true;
      if (selectedVisibilityFilter === "VISIBLE_WEB") {
        matchesVisibility = isWebVis;
      } else if (selectedVisibilityFilter === "HIDDEN_WEB") {
        matchesVisibility = !isWebVis;
      } else if (selectedVisibilityFilter === "APP_ACTIVE") {
        matchesVisibility = isAppAct;
      } else if (selectedVisibilityFilter === "APP_INACTIVE") {
        matchesVisibility = !isAppAct;
      }

      return matchesSearch && matchesCat && matchesVisibility;
    });
  }, [subcategories, search, selectedCategoryFilter, selectedVisibilityFilter, validCategories]);

  const activeCount = subcategories.filter((s) => s.active !== false && s.isActive !== false).length;
  const visibleWebCount = subcategories.filter((s) => s.visibleOnWebsite !== false).length;
  const hiddenWebCount = subcategories.filter((s) => s.visibleOnWebsite === false).length;
  const localDraftsCount = useMemo(() => {
    return subcategories.filter((s) => !isRemoteId(s.subcategoryId || s.id)).length;
  }, [subcategories]);

  // Bulk Selection Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredSubcategories.map((s) => s.subcategoryId || s.id || s._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkActivate = async () => {
    if (!selectedIds.length) return;
    try {
      for (const id of selectedIds) {
        const sub = subcategories.find((s) => (s.subcategoryId || s.id || s._id) === id);
        if (sub) {
          await updateSubcategory(id, { ...sub, active: true });
        }
      }
      setSubcategories((prev) =>
        prev.map((item) =>
          selectedIds.includes(item.subcategoryId || item.id || item._id)
            ? { ...item, active: true, isActive: true }
            : item
        )
      );
      toast.success(`Activated ${selectedIds.length} subcategories in App & Catalog.`);
      setSelectedIds([]);
      await loadData(false);
    } catch (err) {
      toast.error("Failed to activate selected subcategories.");
    }
  };

  const handleBulkDeactivate = async () => {
    if (!selectedIds.length) return;
    try {
      for (const id of selectedIds) {
        const sub = subcategories.find((s) => (s.subcategoryId || s.id || s._id) === id);
        if (sub) {
          await updateSubcategory(id, { ...sub, active: false });
        }
      }
      setSubcategories((prev) =>
        prev.map((item) =>
          selectedIds.includes(item.subcategoryId || item.id || item._id)
            ? { ...item, active: false, isActive: false }
            : item
        )
      );
      toast.warning(`Deactivated ${selectedIds.length} subcategories in App & Catalog.`);
      setSelectedIds([]);
      await loadData(false);
    } catch (err) {
      toast.error("Failed to deactivate selected subcategories.");
    }
  };

  const handleBulkSetWebsiteVisibility = async (visible) => {
    if (!selectedIds.length) return;
    try {
      for (const id of selectedIds) {
        await toggleSubcategoryWebsiteVisibility(id, visible);
      }
      setSubcategories((prev) =>
        prev.map((item) =>
          selectedIds.includes(item.subcategoryId || item.id || item._id)
            ? { ...item, visibleOnWebsite: visible, visible_on_website: visible }
            : item
        )
      );
      toast.success(
        `${visible ? "Showed" : "Hidden"} ${selectedIds.length} subcategories on website.`
      );
      setSelectedIds([]);
      await loadData(false);
    } catch (err) {
      toast.error("Failed to update website visibility for selected subcategories.");
    }
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    setIsBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!selectedIds.length) return;

    try {
      setIsDeleting(true);
      selfTriggeredRef.current = true;
      const idsToDelete = [...selectedIds];
      const itemsToDelete = subcategories.filter((s) => idsToDelete.includes(s.subcategoryId || s.id || s._id));

      // Optimistically remove from UI immediately (including any duplicate local drafts)
      setSubcategories((prev) =>
        prev.filter((item) => {
          const itemId = item.subcategoryId || item.id || item._id;
          if (idsToDelete.includes(itemId)) return false;
          const isMatchedLocal = itemsToDelete.some(
            (del) =>
              !isRemoteId(itemId) &&
              item.name?.trim().toLowerCase() === del.name?.trim().toLowerCase() &&
              String(item.categoryId) === String(del.categoryId)
          );
          return !isMatchedLocal;
        })
      );
      setSelectedIds([]);

      let successCount = 0;
      for (const item of itemsToDelete) {
        const id = item.subcategoryId || item.id || item._id;
        try {
          await deleteSubcategory(id, item.categoryId, item.name);
          successCount++;
        } catch (err) {
          console.warn(`Bulk delete item ${id} notice:`, err?.message);
        }
      }

      toast.success(`Successfully deleted ${successCount} subcategories.`);
      setIsBulkDeleteModalOpen(false);
      await loadData(false);
    } catch (err) {
      toast.error("Failed to delete some subcategories.");
      setIsBulkDeleteModalOpen(false);
      await loadData(false);
    } finally {
      setIsDeleting(false);
      selfTriggeredRef.current = false;
    }
  };

  const handlePurgeAllLocalDrafts = () => {
    selfTriggeredRef.current = true;
    const localItems = subcategories.filter((s) => !isRemoteId(s.subcategoryId || s.id));
    if (!localItems.length) return;

    // Immediately remove local drafts from UI
    setSubcategories((prev) => prev.filter((s) => isRemoteId(s.subcategoryId || s.id)));
    setSelectedIds((prev) =>
      prev.filter((id) => !localItems.some((l) => String(l.subcategoryId || l.id) === String(id)))
    );

    const purged = purgeAllLocalSubcategoryDrafts();
    toast.success(`Purged ${purged || localItems.length} local storage draft(s).`);
    loadData(false);
  };

  const handleExportCSV = () => {
    const exportList = selectedIds.length > 0
      ? subcategories.filter((s) => selectedIds.includes(s.subcategoryId || s.id || s._id))
      : filteredSubcategories;

    const headers = ["Subcategory ID,Subcategory Name,Parent Category,Slug,Sort Order,App Active,Visible on Website,Product Count"];
    const rows = exportList.map((s) => [
      `"${s.subcategoryId || s.id || s._id}"`,
      `"${s.name || ""}"`,
      `"${getParentCategoryName(s.categoryId)}"`,
      `"${s.slug || ""}"`,
      `"${s.sortOrder ?? 0}"`,
      `"${(s.active !== false && s.isActive !== false) ? "Active" : "Inactive"}"`,
      `"${(s.visibleOnWebsite !== false) ? "Visible" : "Hidden"}"`,
      `"${s.productCount ?? 0}"`,
    ].join(","));

    const blob = new Blob([[...headers, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hinchmart_subcategories_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportList.length} subcategories to CSV.`);
  };

  return (
    <div className="categories-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="header-eyebrow">
            <Layers size={14} />
            <span>SUB-TAXONOMY & NESTED CLASSIFICATION</span>
          </div>
          <h1>Subcategories Catalog</h1>
          <p>Manage and map granular product types to parent marketplace categories</p>
        </div>

        <div className="page-header-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {localDraftsCount > 0 && (
            <button
              type="button"
              onClick={handlePurgeAllLocalDrafts}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 15px",
                borderRadius: "8px",
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Purge unsynced local drafts from browser"
            >
              <Trash2 size={15} />
              <span>Purge {localDraftsCount} Local Draft{localDraftsCount > 1 ? "s" : ""}</span>
            </button>
          )}
          <button className="primary-button" onClick={openAddModal}>
            <Plus size={18} />
            <span>Add Subcategory</span>
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="header-stats-strip">
        <div
          className={`stat-pill clickable ${selectedVisibilityFilter === "ALL" && selectedCategoryFilter === "ALL" ? "stat-pill-selected" : ""}`}
          onClick={() => {
            setSelectedVisibilityFilter("ALL");
            setSelectedCategoryFilter("ALL");
          }}
          title="Show all subcategories"
        >
          <span className="stat-pill-label">Total Subcategories</span>
          <strong className="stat-pill-value">{subcategories.length}</strong>
        </div>
        <div
          className={`stat-pill active clickable ${selectedVisibilityFilter === "APP_ACTIVE" ? "stat-pill-selected" : ""}`}
          onClick={() => setSelectedVisibilityFilter(selectedVisibilityFilter === "APP_ACTIVE" ? "ALL" : "APP_ACTIVE")}
          title="Filter to App & Catalog active subcategories"
        >
          <span className="pulse-dot green"></span>
          <span className="stat-pill-label">App Active</span>
          <strong className="stat-pill-value">{activeCount}</strong>
        </div>
        <div
          className={`stat-pill clickable ${selectedVisibilityFilter === "VISIBLE_WEB" ? "stat-pill-selected-blue" : ""}`}
          style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}
          onClick={() => setSelectedVisibilityFilter(selectedVisibilityFilter === "VISIBLE_WEB" ? "ALL" : "VISIBLE_WEB")}
          title="Filter to subcategories visible on website"
        >
          <Globe size={13} style={{ color: "#2563eb" }} />
          <span className="stat-pill-label" style={{ color: "#1d4ed8" }}>Visible on Web</span>
          <strong className="stat-pill-value" style={{ color: "#1e40af" }}>{visibleWebCount}</strong>
        </div>
        <div
          className={`stat-pill clickable ${selectedVisibilityFilter === "HIDDEN_WEB" ? "stat-pill-selected-amber" : ""}`}
          style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}
          onClick={() => setSelectedVisibilityFilter(selectedVisibilityFilter === "HIDDEN_WEB" ? "ALL" : "HIDDEN_WEB")}
          title="Filter to subcategories hidden from website"
        >
          <EyeOff size={13} style={{ color: "#64748b" }} />
          <span className="stat-pill-label">Hidden on Web</span>
          <strong className="stat-pill-value">{hiddenWebCount}</strong>
        </div>
        <div className="stat-pill">
          <span className="stat-pill-label">Parent Categories</span>
          <strong className="stat-pill-value">{categories.length}</strong>
        </div>
      </div>

      {/* 4-Tier Hierarchy Breadcrumb Navigator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          marginBottom: "16px",
          fontSize: "12px",
          color: "#64748b",
        }}
      >
        <span style={{ fontWeight: 700, color: "#0f172a" }}>Hierarchy Flow:</span>
        <span
          style={{ cursor: "pointer", color: "#d97706", fontWeight: 600 }}
          onClick={() => navigate("/admin/categories")}
        >
          1. Categories ({categories.length})
        </span>
        <ChevronRight size={14} />
        <span
          style={{
            background: "#fef3c7",
            color: "#92400e",
            padding: "2px 8px",
            borderRadius: "6px",
            fontWeight: 800,
          }}
        >
          2. Subcategories ({subcategories.length}) [Active View]
        </span>
        <ChevronRight size={14} />
        <span
          style={{ cursor: "pointer", color: "#d97706", fontWeight: 600 }}
          onClick={() => navigate("/admin/brands")}
        >
          3. Brands
        </span>
        <ChevronRight size={14} />
        <span
          style={{ cursor: "pointer", color: "#64748b", fontWeight: 600 }}
          onClick={() => navigate("/admin/products")}
        >
          4. Products
        </span>
      </div>

      {error && (
        <div className="error-box">
          <span>{error}</span>
          <button onClick={() => loadData(true)}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Main Content Card */}
      <div className="content-card">
        {/* Table Toolbar */}
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by subcategory or parent category..."
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>
                ×
              </button>
            )}
          </div>

          <div className="category-view-options" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {/* Parent Category Filter */}
            <select
              className="btn-text-action"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              style={{ cursor: "pointer", fontWeight: 700 }}
            >
              <option value="ALL">All Parent Categories ({validCategories.length})</option>
              {validCategories.map((cat) => {
                const catId = cat.categoryId || cat.id || cat._id;
                return (
                  <option key={catId} value={catId}>
                    {cat.name}
                  </option>
                );
              })}
            </select>

            {/* Visibility Channel Filter */}
            <select
              className="btn-text-action"
              value={selectedVisibilityFilter}
              onChange={(e) => setSelectedVisibilityFilter(e.target.value)}
              style={{ cursor: "pointer", fontWeight: 700 }}
            >
              <option value="ALL">All Visibility Channels</option>
              <option value="VISIBLE_WEB">🌐 Visible on Website ({visibleWebCount})</option>
              <option value="HIDDEN_WEB">🔒 Hidden on Website ({hiddenWebCount})</option>
              <option value="APP_ACTIVE">📱 App Active ({activeCount})</option>
              <option value="APP_INACTIVE">⏸ App Inactive ({subcategories.length - activeCount})</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Strip */}
        {selectedIds.length > 0 && (
          <div className="bulk-actions-bar">
            <div className="bulk-left">
              <strong>{selectedIds.length}</strong> {selectedIds.length === 1 ? "subcategory" : "subcategories"} selected
            </div>
            <div className="bulk-right" style={{ flexWrap: "wrap" }}>
              <button
                className="btn-bulk-action"
                style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                onClick={() => handleBulkSetWebsiteVisibility(true)}
                title="Make selected visible on website"
              >
                <Globe size={15} /> Show on Web
              </button>
              <button
                className="btn-bulk-action"
                style={{ background: "#f8fafc", color: "#475569", border: "1px solid #cbd5e1" }}
                onClick={() => handleBulkSetWebsiteVisibility(false)}
                title="Hide selected from website"
              >
                <EyeOff size={15} /> Hide from Web
              </button>
              <button
                className="btn-bulk-action success"
                onClick={handleBulkActivate}
                title="Activate selected subcategories for app & catalog"
              >
                <CheckCircle2 size={15} /> App Active
              </button>
              <button
                className="btn-bulk-action warning"
                onClick={handleBulkDeactivate}
                title="Deactivate selected subcategories in app & catalog"
              >
                <XCircle size={15} /> App Disable
              </button>
              <button
                className="btn-bulk-action danger"
                onClick={handleBulkDelete}
                title="Delete selected subcategories"
              >
                <Trash2 size={15} /> Delete
              </button>
              <button
                className="btn-bulk-action"
                style={{ background: "#2563eb", color: "#ffffff" }}
                onClick={handleExportCSV}
                title="Export selected subcategories as CSV"
              >
                <Download size={15} /> Export CSV
              </button>
              <button
                className="btn-bulk-cancel"
                onClick={() => setSelectedIds([])}
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-state-container">
            <div className="spinner"></div>
            <p>Loading subcategories from backend...</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      className="custom-checkbox"
                      checked={
                        filteredSubcategories.length > 0 &&
                        selectedIds.length === filteredSubcategories.length
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th style={{ width: 75, textAlign: "center" }}>Thumbnail</th>
                  <th style={{ minWidth: 180 }}>Subcategory Name</th>
                  <th style={{ minWidth: 160 }}>Parent Category</th>
                  <th style={{ width: 100, textAlign: "center" }}>Products</th>
                  <th style={{ width: 95, textAlign: "center" }}>Sort Order</th>
                  <th style={{ width: 120, textAlign: "center" }}>App Status</th>
                  <th style={{ width: 150, textAlign: "center" }}>Website Visibility</th>
                  <th style={{ width: 95, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubcategories.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-table">
                      <div className="empty-table-content">
                        <Package size={40} className="empty-icon" />
                        <h3>No subcategories found</h3>
                        <p>
                          {search
                            ? `No subcategories matching "${search}"`
                            : "Click Add Subcategory to create a new one."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSubcategories.map((sub, index) => {
                    const id = sub.subcategoryId || sub.id || sub._id;
                    const isActive = sub.active !== false && sub.isActive !== false;
                    const isVisibleWeb = sub.visibleOnWebsite !== false;
                    const parentName = getParentCategoryName(sub.categoryId);
                    const isSelected = selectedIds.includes(id);

                    return (
                      <tr key={id || index} className={isSelected ? "row-selected" : ""}>
                        {/* Row Checkbox */}
                        <td style={{ width: 44, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            className="custom-checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(id)}
                          />
                        </td>

                        {/* Thumbnail */}
                        <td style={{ width: 75, textAlign: "center" }}>
                          <div className="category-img-box">
                            {(() => {
                              const thumb = resolveSubcategoryImage(sub.imageUrl || sub.image, sub.name);
                              return thumb ? (
                                <img
                                  className="category-image"
                                  src={thumb}
                                  alt={sub.name}
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                    if (e.target.nextSibling) {
                                      e.target.nextSibling.style.display = "flex";
                                    }
                                  }}
                                />
                              ) : null;
                            })()}
                            <div
                              className="category-placeholder"
                              style={{ display: sub.imageUrl || sub.image ? "none" : "flex" }}
                            >
                              {(sub.name || "S")[0].toUpperCase()}
                            </div>
                          </div>
                        </td>

                        {/* Name & Slug */}
                        <td>
                          <div className="category-name-cell">
                            <strong>{sub.name}</strong>
                            <span className="category-slug-text">
                              /{sub.slug || sub.name.toLowerCase().replace(/\s+/g, "-")}
                            </span>
                            {!isRemoteId(id) && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  color: "#b45309",
                                  background: "#fef3c7",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontWeight: 600,
                                  marginTop: 3,
                                  width: "fit-content",
                                }}
                                title={sub.syncError || "Saved in Local Storage. Click Sync button anytime to push to live database."}
                              >
                                💾 Local Storage
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Parent Category */}
                        <td>
                          <span className="subcategory-chip" style={{ fontSize: 12 }}>
                            <FolderTree size={12} />
                            {parentName}
                          </span>
                        </td>

                        {/* Products Count */}
                        <td style={{ textAlign: "center" }}>
                          <span className="badge-product-count" title={`${sub.productCount ?? 0} mapped products`}>
                            <Package size={12} />
                            {sub.productCount ?? 0}
                          </span>
                        </td>

                        {/* Sort Order */}
                        <td style={{ textAlign: "center" }}>
                          <span className="order-number">#{sub.sortOrder ?? 0}</span>
                        </td>

                        {/* App Status & Toggle */}
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                            <span
                              className={`status-badge-glow ${
                                isActive ? "status-active" : "status-inactive"
                              }`}
                            >
                              <span className="status-dot"></span>
                              {isActive ? "App Active" : "Disabled"}
                            </span>
                            <div className="toggle-container" style={{ justifyContent: "center" }}>
                              <label className="switch" title="Toggle Mobile App & Catalog Active">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  disabled={togglingActiveId === id}
                                  onChange={() => handleToggleActivate(sub)}
                                />
                                <span className="slider round"></span>
                              </label>
                            </div>
                          </div>
                        </td>

                        {/* Quick Toggle Website Visibility (ON / OFF) */}
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                            <span className={`website-vis-badge ${isVisibleWeb ? "vis-on" : "vis-off"}`}>
                              {isVisibleWeb ? <Globe size={11} /> : <EyeOff size={11} />}
                              {isVisibleWeb ? "Visible" : "Hidden"}
                            </span>
                            <div className="toggle-container" style={{ justifyContent: "center" }}>
                              <label className="switch switch-website" title="Quick Toggle Website Visibility (ON / OFF)">
                                <input
                                  type="checkbox"
                                  checked={isVisibleWeb}
                                  disabled={togglingWebsiteId === id}
                                  onChange={() => handleToggleWebsiteVisibility(sub)}
                                />
                                <span className="slider slider-blue round"></span>
                              </label>
                            </div>
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="action-buttons" style={{ justifyContent: "flex-end" }}>
                            {!isRemoteId(id) && (
                              <button
                                className="icon-action"
                                style={{ color: "#d97706" }}
                                onClick={() => handleSyncSubcategory(sub)}
                                title="Sync to Database"
                                disabled={syncingId === id}
                              >
                                <RotateCcw size={16} className={syncingId === id ? "spin" : ""} />
                              </button>
                            )}
                            <button
                              className="icon-action"
                              onClick={() => openEditModal(sub)}
                              title="Edit Subcategory"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              className="icon-action danger"
                              onClick={() => handleDelete(sub)}
                              title="Delete Subcategory"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subcategory Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="luxury-modal-header">
              <div className="header-title-wrap">
                <div
                  className="header-icon-box"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
                >
                  <Layers size={20} style={{ color: "#111827" }} />
                </div>
                <div className="header-texts">
                  <h2>{editingSubcategory ? "Edit Subcategory" : "Add Subcategory"}</h2>
                  <p>Define subcategory classification mapped to a parent catalog</p>
                </div>
              </div>
              <button className="header-close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="luxury-modal-body">
                <div className="form-section-card">
                  <div className="section-card-title">
                    <Tag size={13} /> Subcategory Details
                  </div>
                  <div className="luxury-form-grid">
                    <div className="input-field-wrap full-width">
                      <label>
                        Parent Category <span className="required-star">*</span>
                      </label>
                      <select
                        value={String(form.categoryId || "")}
                        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                        required
                      >
                        <option value="" disabled>Select parent category</option>
                        {validCategories.map((cat) => {
                          const catId = cat.categoryId || cat.id || cat._id;
                          return (
                            <option key={catId} value={catId}>
                              {cat.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="input-field-wrap full-width">
                      <label>
                        Subcategory Name <span className="required-star">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={handleNameChange}
                        placeholder="e.g. Wall Art & Canvas Paintings"
                        required
                      />
                    </div>

                    <div className="input-field-wrap">
                      <label>
                        URL Slug <span className="required-star">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.slug}
                        onChange={(e) => setForm({ ...form, slug: e.target.value })}
                        placeholder="e.g. wall-art-and-paintings"
                        required
                      />
                      <small className="field-hint">Auto-generated from name, customizable SEO slug</small>
                    </div>

                    <div className="input-field-wrap">
                      <label>Sort Order</label>
                      <input
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section-card">
                  <div className="section-card-title">
                    <ImageIcon size={13} /> Subcategory Artwork
                  </div>
                  <div className="image-upload-flex">
                    <div className="image-preview-large">
                      {form.imageUrl || form.image ? (
                        <img src={form.imageUrl || form.image} alt="Preview" />
                      ) : (
                        <div className="image-empty-placeholder">
                          <ImageIcon size={28} />
                          <span>No Image</span>
                        </div>
                      )}
                    </div>
                    <div className="image-controls-right">
                      <p className="image-guideline-text">
                        Upload subcategory icon or artwork. Any format or resolution supported.
                      </p>
                      <label className={`upload-file-btn ${uploadingImage ? "disabled" : ""}`} style={{ pointerEvents: uploadingImage ? "none" : "auto" }}>
                        {uploadingImage ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Uploading image...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            <span>{form.imageUrl || form.image ? "Change Image" : "Choose Image"}</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          disabled={uploadingImage}
                          style={{ display: "none" }}
                        />
                      </label>
                      {imageError && <span className="image-validation-error">{imageError}</span>}
                      {(form.imageUrl || form.image) && !uploadingImage && (
                        <button
                          type="button"
                          className="btn-remove-image"
                          onClick={() => {
                            setForm({ ...form, image: null, imageUrl: "", imageURL: "" });
                            setImageUploadStatus("idle");
                            setImageError("");
                          }}
                        >
                          Remove Image
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subcategory Visibility & Multi-Channel Status */}
                <div className="form-section-card">
                  <div className="section-card-title">
                    <ShieldCheck size={13} /> Subcategory Channel Visibility & Activation
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {/* Channel 1: Mobile App & Catalog Active */}
                    <label className={`visibility-control-card ${form.active ? "selected" : ""}`}>
                      <div className="vis-card-top">
                        <input
                          type="checkbox"
                          checked={form.active ?? true}
                          onChange={(e) => setForm({ ...form, active: e.target.checked })}
                        />
                        <div className="vis-card-title-group">
                          <strong><Smartphone size={14} /> Mobile App Catalog</strong>
                          <span className={`badge-pill ${form.active ? "active-pill" : "inactive-pill"}`}>
                            {form.active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>
                      </div>
                      <p className="vis-card-desc">
                        DB <code>is_active</code> flag. Controls whether existing mobile app shoppers and catalog queries include this subcategory.
                      </p>
                    </label>

                    {/* Channel 2: Visible on Website */}
                    <label className={`visibility-control-card ${form.visibleOnWebsite ? "selected-blue" : ""}`}>
                      <div className="vis-card-top">
                        <input
                          type="checkbox"
                          checked={form.visibleOnWebsite ?? true}
                          onChange={(e) => setForm({ ...form, visibleOnWebsite: e.target.checked })}
                        />
                        <div className="vis-card-title-group">
                          <strong><Globe size={14} /> Visible on Website</strong>
                          <span className={`badge-pill ${form.visibleOnWebsite ? "web-pill" : "hidden-pill"}`}>
                            {form.visibleOnWebsite ? "SHOWN" : "HIDDEN"}
                          </span>
                        </div>
                      </div>
                      <p className="vis-card-desc">
                        DB <code>visible_on_website</code> flag. Toggle OFF to hide on new website storefront while keeping visible in the mobile app.
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <div className="luxury-modal-footer">
                <button
                  type="button"
                  className="btn-luxury-cancel"
                  onClick={() => setShowModal(false)}
                  disabled={submitting || uploadingImage}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-luxury-submit" disabled={submitting || uploadingImage}>
                  {uploadingImage ? "Uploading Artwork..." : submitting ? "Saving..." : editingSubcategory ? "Save Changes" : "Create Subcategory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal (In-App Luxury Modal, no window.confirm) */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteTarget(null)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 480, borderRadius: 16, overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="luxury-modal-header" style={{ borderBottom: "1px solid #fee2e2" }}>
              <div className="header-title-wrap">
                <div
                  className="header-icon-box"
                  style={{
                    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                    color: "#ffffff",
                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)",
                  }}
                >
                  <Trash2 size={20} />
                </div>
                <div className="header-texts">
                  <h2 style={{ color: "#991b1b" }}>Delete Subcategory</h2>
                  <p>Permanent removal confirmation</p>
                </div>
              </div>
              <button
                className="header-close-btn"
                onClick={() => !isDeleting && setDeleteTarget(null)}
                disabled={isDeleting}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "24px 28px" }}>
              <p style={{ fontSize: 15, color: "#1f2937", lineHeight: 1.6, margin: 0 }}>
                Are you sure you want to permanently delete subcategory{" "}
                <strong style={{ color: "#111827", fontWeight: 700 }}>
                  "{deleteTarget.name}"
                </strong>
                ?
              </p>

              {deleteTarget.productCount > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    marginTop: 18,
                    padding: "12px 16px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    color: "#991b1b",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: "#dc2626" }} />
                  <div>
                    <strong style={{ fontWeight: 700 }}>Database Notice:</strong> This subcategory currently has{" "}
                    <strong>{deleteTarget.productCount}</strong> mapped products. Deleting it will detach them.
                  </div>
                </div>
              )}

              {!isRemoteId(deleteTarget.subcategoryId || deleteTarget.id) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    marginTop: 18,
                    padding: "12px 16px",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 10,
                    color: "#92400e",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontSize: 16 }}>💾</span>
                  <div>
                    This subcategory is saved in <strong style={{ fontWeight: 700 }}>Local Storage</strong>. It will be immediately and completely purged from your browser.
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                padding: "16px 28px",
                borderTop: "1px solid #f1f5f9",
                background: "#f8fafc",
              }}
            >
              <button
                type="button"
                className="btn-luxury-cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSingleDelete}
                disabled={isDeleting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)",
                }}
              >
                {isDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                <span>{isDeleting ? "Deleting..." : "Delete Permanently"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal (In-App Luxury Modal) */}
      {isBulkDeleteModalOpen && (
        <div className="modal-overlay" onClick={() => !isDeleting && setIsBulkDeleteModalOpen(false)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 480, borderRadius: 16, overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="luxury-modal-header" style={{ borderBottom: "1px solid #fee2e2" }}>
              <div className="header-title-wrap">
                <div
                  className="header-icon-box"
                  style={{
                    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                    color: "#ffffff",
                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)",
                  }}
                >
                  <Trash2 size={20} />
                </div>
                <div className="header-texts">
                  <h2 style={{ color: "#991b1b" }}>Delete Selected Subcategories</h2>
                  <p>Bulk permanent deletion confirmation</p>
                </div>
              </div>
              <button
                className="header-close-btn"
                onClick={() => !isDeleting && setIsBulkDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "24px 28px" }}>
              <p style={{ fontSize: 15, color: "#1f2937", lineHeight: 1.6, margin: 0 }}>
                Are you sure you want to permanently delete{" "}
                <strong style={{ color: "#dc2626", fontWeight: 700 }}>
                  {selectedIds.length}
                </strong>{" "}
                selected subcategories?
              </p>
              <p style={{ fontSize: 13, color: "#64748b", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
                This will remove each selected item from both the live server and local caches, and purge any matching local drafts.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                padding: "16px 28px",
                borderTop: "1px solid #f1f5f9",
                background: "#f8fafc",
              }}
            >
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isDeleting}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                disabled={isDeleting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)",
                }}
              >
                {isDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                <span>{isDeleting ? "Deleting..." : `Delete All ${selectedIds.length}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
