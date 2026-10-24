import { useState, useEffect, useMemo } from "react";
import {
  Boxes,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Store,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  Edit2,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import {
  getConsignmentInventory,
  createOrUpdateConsignmentRow,
  updateConsignmentRowStatus,
} from "../api/consignmentApi";
import { getProducts, getStoredProducts } from "../api/productApi";
import { getStores } from "../api/storeApi";
import { useToast } from "../components/ToastContext";
import "../styles/vendorStock.css";
import "../styles/pages.css";

export default function VendorStock() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalCount: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedProductFilter, setSelectedProductFilter] = useState("ALL");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState("ALL");
  const [selectedActiveFilter, setSelectedActiveFilter] = useState("ALL");

  // Metadata catalogs
  const [hinchStoreProducts, setHinchStoreProducts] = useState([]);
  const [vendorStores, setVendorStores] = useState([]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [modalForm, setModalForm] = useState({
    productId: "",
    vendorStoreId: "",
    qty: "",
    isActive: true,
  });
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Load Inventory & Reference Catalogs
  const loadData = async (targetPage = page) => {
    try {
      setLoading(true);
      const [invRes, prodRes, storeRes] = await Promise.allSettled([
        getConsignmentInventory({
          page: targetPage,
          limit,
          productId: selectedProductFilter,
          vendorStoreId: selectedStoreFilter,
          isActive: selectedActiveFilter,
        }),
        getProducts({ limit: 500 }),
        getStores(),
      ]);

      if (invRes.status === "fulfilled" && invRes.value) {
        setInventoryRows(invRes.value.rows || []);
        if (invRes.value.pagination) {
          setPagination(invRes.value.pagination);
        }
      }

      // Filter HinchStore platform products (store 1 or admin/platform in-house items)
      if (prodRes.status === "fulfilled" && prodRes.value) {
        const allProds = Array.isArray(prodRes.value?.products)
          ? prodRes.value.products
          : (Array.isArray(prodRes.value) ? prodRes.value : getStoredProducts());
        const platformItems = (allProds || []).filter(
          (p) => !p.sellerId || Number(p.sellerId) === 1 || Number(p.storeId) === 1 || p.isSellerAdded === false || !p.isSellerAdded
        );
        setHinchStoreProducts(platformItems);
      }

      // Filter Vendor Stores (non-platform stores, i.e. storeId !== 1)
      if (storeRes.status === "fulfilled" && storeRes.value) {
        const rawStores = Array.isArray(storeRes.value?.stores)
          ? storeRes.value.stores
          : (Array.isArray(storeRes.value) ? storeRes.value : []);
        const nonPlatform = (rawStores || []).filter((s) => Number(s.id || s.storeId) !== 1);
        setVendorStores(nonPlatform);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load consignment inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(page);
  }, [page, limit, selectedProductFilter, selectedStoreFilter, selectedActiveFilter]);

  // Warning List: HinchStore products with NO active vendor rows
  const unallocatedHinchProducts = useMemo(() => {
    return hinchStoreProducts.filter((product) => {
      const pid = product.productId || product.id;
      const hasActiveRow = inventoryRows.some(
        (r) => Number(r.productId) === Number(pid) && r.isActive === true && Number(r.availableQty || r.qty) > 0
      );
      return !hasActiveRow;
    });
  }, [hinchStoreProducts, inventoryRows]);

  // Search filtered rows
  const displayedRows = useMemo(() => {
    if (!search.trim()) return inventoryRows;
    const q = search.trim().toLowerCase();
    return inventoryRows.filter((r) =>
      (r.productTitle || "").toLowerCase().includes(q) ||
      (r.vendorStoreName || "").toLowerCase().includes(q) ||
      (r.vendorSellerName || "").toLowerCase().includes(q)
    );
  }, [inventoryRows, search]);

  // Metrics
  const metrics = useMemo(() => {
    const totalQty = inventoryRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    const reservedQty = inventoryRows.reduce((sum, r) => sum + (Number(r.reservedQty) || 0), 0);
    const availableQty = inventoryRows.reduce((sum, r) => sum + (Number(r.availableQty) || 0), 0);
    const activeRows = inventoryRows.filter((r) => r.isActive).length;
    return { totalQty, reservedQty, availableQty, activeRows };
  }, [inventoryRows]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingRow(null);
    setModalForm({
      productId: hinchStoreProducts[0]?.productId || hinchStoreProducts[0]?.id || "",
      vendorStoreId: vendorStores[0]?.id || "",
      qty: "",
      isActive: true,
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (row) => {
    setEditingRow(row);
    setModalForm({
      productId: row.productId,
      vendorStoreId: row.vendorStoreId,
      qty: String(row.qty),
      isActive: row.isActive,
    });
    setShowModal(true);
  };

  // Toggle active status
  const handleToggleStatus = async (row) => {
    const nextStatus = !row.isActive;
    try {
      await updateConsignmentRowStatus(row.id, nextStatus);
      setInventoryRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isActive: nextStatus } : r))
      );
      toast.success(`Consignment row ${nextStatus ? "activated" : "deactivated"}.`);
    } catch {
      toast.error("Failed to update status.");
    }
  };

  // Submit Modal
  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!modalForm.productId || !modalForm.vendorStoreId) {
      toast.warning("Please select both a HinchStore product and a vendor store.");
      return;
    }
    if (Number(modalForm.vendorStoreId) === 1) {
      toast.error("Vendor store cannot be the platform store (Store 1).");
      return;
    }

    try {
      setModalSubmitting(true);
      const matchedProd = hinchStoreProducts.find((p) => Number(p.productId || p.id) === Number(modalForm.productId));
      const matchedStore = vendorStores.find((s) => Number(s.id || s.storeId) === Number(modalForm.vendorStoreId));

      await createOrUpdateConsignmentRow({
        productId: modalForm.productId,
        vendorStoreId: modalForm.vendorStoreId,
        qty: modalForm.qty,
        isActive: modalForm.isActive,
        productTitle: matchedProd?.title || matchedProd?.name || "",
        vendorStoreName: matchedStore?.name || "",
      });

      toast.success("Vendor consignment stock updated successfully!");
      setShowModal(false);
      await loadData(page);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update vendor stock.");
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <div className="vendor-stock-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Vendor Consignment Stock (HinchStore)</h1>
          <p>
            Manage vendor store physical allocation for platform HinchStore products. Customers purchase only from active vendor stock.
          </p>
        </div>

        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => loadData(page)}>
            <RotateCcw size={16} />
            <span>Refresh</span>
          </button>
          <button className="primary-button" onClick={handleOpenAdd}>
            <Plus size={16} />
            <span>Allocate Vendor Stock</span>
          </button>
        </div>
      </div>

      {/* Critical Warning Banner if products have 0 active vendor stock */}
      {unallocatedHinchProducts.length > 0 && (
        <div className="warning-banner">
          <AlertTriangle size={24} className="warning-banner-icon" />
          <div className="warning-banner-content">
            <h4>{unallocatedHinchProducts.length} HinchStore Products Unavailable to Customers</h4>
            <p>
              The following products are held in the platform catalog but have <strong>no active vendor consignment rows</strong>. Customers will see these items as out of stock on the storefront until you allocate units to a vendor store:
            </p>
            <div className="warning-products-chips">
              {unallocatedHinchProducts.slice(0, 6).map((p) => (
                <span key={p.productId || p.id} className="warning-product-chip">
                  <Package size={12} />
                  {p.title || p.name} (SKU: {p.sku || "N/A"})
                </span>
              ))}
              {unallocatedHinchProducts.length > 6 && (
                <span className="warning-product-chip">
                  +{unallocatedHinchProducts.length - 6} more items
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="stock-stats-grid">
        <div className="stock-stat-card">
          <div className="stock-stat-info">
            <h5>Total Allocated</h5>
            <strong>{metrics.totalQty.toLocaleString()} units</strong>
          </div>
          <div className="stock-stat-icon blue">
            <Boxes size={22} />
          </div>
        </div>

        <div className="stock-stat-card">
          <div className="stock-stat-info">
            <h5>Available for Sale</h5>
            <strong>{metrics.availableQty.toLocaleString()} units</strong>
          </div>
          <div className="stock-stat-icon green">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="stock-stat-card">
          <div className="stock-stat-info">
            <h5>Order Reserved</h5>
            <strong>{metrics.reservedQty.toLocaleString()} units</strong>
          </div>
          <div className="stock-stat-icon amber">
            <Layers size={22} />
          </div>
        </div>

        <div className="stock-stat-card">
          <div className="stock-stat-info">
            <h5>Active Vendor Links</h5>
            <strong>{metrics.activeRows} Stores</strong>
          </div>
          <div className="stock-stat-icon purple">
            <Store size={22} />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="vendor-stock-filters">
        <div className="filter-search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by product, vendor store, or seller..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={selectedProductFilter}
          onChange={(e) => {
            setSelectedProductFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Products</option>
          {hinchStoreProducts.map((p) => (
            <option key={p.productId || p.id} value={p.productId || p.id}>
              {p.title || p.name}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={selectedStoreFilter}
          onChange={(e) => {
            setSelectedStoreFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Vendor Stores</option>
          {vendorStores.map((s) => (
            <option key={s.id || s.storeId} value={s.id || s.storeId}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={selectedActiveFilter}
          onChange={(e) => {
            setSelectedActiveFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Statuses</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>
      </div>

      {/* Table Card */}
      <div className="stock-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            Loading vendor consignment inventory...
          </div>
        ) : displayedRows.length === 0 ? (
          <div style={{ padding: "50px", textAlign: "center", color: "#64748b" }}>
            <Boxes size={44} style={{ margin: "0 auto 12px auto", opacity: 0.4 }} />
            <h3>No Consignment Stock Records Found</h3>
            <p style={{ fontSize: "13px" }}>
              Click <strong>Allocate Vendor Stock</strong> above to link HinchStore items to vendor warehouses.
            </p>
          </div>
        ) : (
          <table className="stock-table">
            <thead>
              <tr>
                <th>Product Information</th>
                <th>Physical Vendor Store</th>
                <th>Total Stock</th>
                <th>Order Reserved</th>
                <th>Sellable Available</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="product-cell">
                      <strong>{row.productTitle}</strong>
                      <span>Product ID: #{row.productId}</span>
                    </div>
                  </td>
                  <td>
                    <div className="store-cell">
                      <strong>{row.vendorStoreName}</strong>
                      <span>Merchant: {row.vendorSellerName} (Store #{row.vendorStoreId})</span>
                    </div>
                  </td>
                  <td>
                    <span className="qty-pill total">{row.qty}</span>
                  </td>
                  <td>
                    <span className="qty-pill reserved">{row.reservedQty}</span>
                  </td>
                  <td>
                    <span className="qty-pill available">{row.availableQty}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${row.isActive ? "active" : "inactive"}`}>
                      {row.isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ fontSize: "12px", color: "#64748b" }}>
                    {new Date(row.updatedAt || row.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "8px" }}>
                      <button
                        className="toggle-btn"
                        title={row.isActive ? "Deactivate allocation" : "Activate allocation"}
                        onClick={() => handleToggleStatus(row)}
                      >
                        {row.isActive ? <XCircle size={16} color="#ef4444" /> : <CheckCircle2 size={16} color="#10b981" />}
                      </button>
                      <button
                        className="toggle-btn"
                        title="Edit allocation"
                        onClick={() => handleOpenEdit(row)}
                      >
                        <Edit2 size={15} color="#475569" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination Toolbar */}
        <div className="products-pagination-toolbar" style={{ borderTop: "1px solid #e2e8f0" }}>
          <div className="pagination-left-section">
            <span style={{ fontSize: "12.5px", color: "#64748b" }}>
              Showing {displayedRows.length} of {pagination.totalCount || displayedRows.length} consignment allocations
            </span>
          </div>

          <div className="pagination-right-section">
            <button
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
              <span>Prev</span>
            </button>
            <span style={{ fontSize: "12px", fontWeight: 700, padding: "0 8px" }}>
              Page {page} of {pagination.totalPages}
            </span>
            <button
              className="pagination-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Consignment Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !modalSubmitting && setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRow ? "Edit Consignment Allocation" : "Allocate HinchStore Stock to Vendor"}</h3>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveModal}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
                    HinchStore Product (Platform Store 1)
                  </label>
                  <select
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={modalForm.productId}
                    disabled={Boolean(editingRow)}
                    onChange={(e) => setModalForm({ ...modalForm, productId: e.target.value })}
                    required
                  >
                    {hinchStoreProducts.map((p) => (
                      <option key={p.productId || p.id} value={p.productId || p.id}>
                        {p.title || p.name} (ID: #{p.productId || p.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Holding Vendor Store (Physical Warehouse)
                  </label>
                  <select
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={modalForm.vendorStoreId}
                    disabled={Boolean(editingRow)}
                    onChange={(e) => setModalForm({ ...modalForm, vendorStoreId: e.target.value })}
                    required
                  >
                    {vendorStores.map((s) => (
                      <option key={s.id || s.storeId} value={s.id || s.storeId}>
                        {s.name} ({s.city || "Vendor Warehouse"})
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>
                    Platform store (Store 1) is excluded. Units must be assigned to an approved merchant store.
                  </span>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Physical Units Allocated (Quantity)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="filter-select"
                    style={{ width: "100%" }}
                    value={modalForm.qty}
                    onChange={(e) => setModalForm({ ...modalForm, qty: e.target.value })}
                    required
                  />
                  <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>
                    Customer sellable quantity will be calculated as (Units Allocated minus Order Reserved).
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="consignmentIsActive"
                    checked={modalForm.isActive}
                    onChange={(e) => setModalForm({ ...modalForm, isActive: e.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  <label htmlFor="consignmentIsActive" style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", cursor: "pointer" }}>
                    Active Allocation (Sellable on marketplace storefront)
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 20px" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)} disabled={modalSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={modalSubmitting}>
                  {modalSubmitting ? "Saving..." : (editingRow ? "Update Stock" : "Allocate Stock")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
