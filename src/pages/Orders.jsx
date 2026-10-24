import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Eye,
  Filter,
  RotateCcw,
  Calendar,
  CreditCard,
  ShoppingBag,
  User,
  Store,
  Clock,
  CheckCircle2,
  Truck,
  Package,
  XCircle,
  AlertCircle,
  Download,
  Lock,
  ExternalLink,
  GitCommit,
  ShieldCheck,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Navigation,
  Printer,
} from "lucide-react";
import {
  getOrders,
  updateOrderStatus,
  cancelOrder,
  downloadOrderInvoice,
  previewOrderInvoicePdf,
} from "../api/orderApi";
import { subscribeDataUpdate } from "../api/dataStore";
import { useToast } from "../components/ToastContext";
import "../styles/pages.css";
import "../styles/products.css";

const STATUS_OPTIONS = [
  { id: "ALL", label: "All Orders" },
  { id: "PLACED", label: "Placed" },
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "LOADED", label: "Loaded" },
  { id: "DISPATCHED", label: "Dispatched" },
  { id: "IN_TRANSIT", label: "In Transit" },
  { id: "DELIVERED", label: "Delivered" },
  { id: "CANCELLED", label: "Cancelled" },
];

const CARRIER_PRESETS = [
  "BlueDart Freight",
  "SafeXpress Logistics",
  "VRL Logistics",
  "Delhivery Express",
  "DTDC Freight",
  "TCI Freight",
  "Gati KWE",
  "Internal Fleet Transport",
];

export default function Orders() {
  const navigate = useNavigate();
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [paginationInfo, setPaginationInfo] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  // Filters State
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Dynamic View / Logistics Modal State
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelForm, setCancelForm] = useState({
    location: "Admin Panel",
    description: "Customer requested order cancellation prior to dispatch.",
  });
  const [cancelling, setCancelling] = useState(false);

  // Logistics Assignment Form in Modal
  const [logisticsForm, setLogisticsForm] = useState({
    status: "CONFIRMED",
    carrierName: "BlueDart Freight",
    vehicleNumber: "",
    driverName: "",
    trackingNumber: "",
    location: "Distribution Hub - Shamshabad, Hyderabad",
    description: "Vehicle dispatched for jobsite delivery.",
    estimatedDelivery: "",
  });

  const [auditLogs, setAuditLogs] = useState([]);

  // Sync logistics form whenever selectedOrder opens
  useEffect(() => {
    if (selectedOrder) {
      const curStatus = (selectedOrder.orderStatus || selectedOrder.status || "PLACED").toUpperCase();
      let nextStatus = "CONFIRMED";
      if (curStatus === "PLACED") nextStatus = "CONFIRMED";
      else if (curStatus === "CONFIRMED") nextStatus = "LOADED";
      else if (curStatus === "LOADED") nextStatus = "DISPATCHED";
      else if (curStatus === "DISPATCHED") nextStatus = "IN_TRANSIT";
      else if (curStatus === "IN_TRANSIT") nextStatus = "DELIVERED";
      else nextStatus = curStatus;

      setLogisticsForm({
        status: nextStatus,
        carrierName: selectedOrder.carrierName || "",
        vehicleNumber: selectedOrder.vehicleNumber || "",
        driverName: selectedOrder.driverName || "",
        trackingNumber: selectedOrder.trackingNumber || (selectedOrder.orderNumber ? `TRK-${selectedOrder.orderNumber}` : ""),
        location: selectedOrder.deliveryLocation || "",
        description: `Order progressed to ${nextStatus}`,
        estimatedDelivery: selectedOrder.estimatedDelivery ? selectedOrder.estimatedDelivery.slice(0, 16) : "",
      });
    }
  }, [selectedOrder]);

  const loadOrders = async (targetPage = page) => {
    try {
      setLoading(true);
      setError("");
      const params = {
        page: targetPage,
        limit,
      };
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (paymentFilter !== "ALL") params.paymentStatus = paymentFilter;
      if (buyerFilter) params.buyer = buyerFilter;
      if (sellerFilter) params.seller = sellerFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const data = await getOrders(params);
      const list = Array.isArray(data) ? data : data.orders || data.data || [];
      setOrders(list);

      if (data?.pagination) {
        setPaginationInfo(data.pagination);
      } else {
        setPaginationInfo({
          page: targetPage,
          limit,
          total: list.length,
          totalPages: Math.max(1, Math.ceil(list.length / limit)),
        });
      }

      if (typeof window !== "undefined" && window.__hinchmart_orders_audit) {
        setAuditLogs([...window.__hinchmart_orders_audit]);
      }
    } catch (err) {
      console.error("Orders load failed:", err);
      if (err?.response?.status === 401) {
        setError("Authentication session expired (401 Unauthorized). Please log in again to load live orders.");
      } else if (err?.response?.status === 403) {
        setError("Access denied (403 Forbidden): Admin role privileges are required to view orders.");
      } else {
        setError(err?.response?.data?.message || err?.message || "Unable to load live orders from backend.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(page);
    const unsub = subscribeDataUpdate((detail) => {
      if (detail.entity === "orders") {
        loadOrders(page);
      }
    });
    return unsub;
  }, [page, statusFilter]);

  const handleApplyFilters = () => {
    setPage(1);
    loadOrders(1);
    toast.info("Filters applied");
  };

  const handleClearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("ALL");
    setPaymentFilter("ALL");
    setBuyerFilter("");
    setSellerFilter("");
    setPage(1);
    setTimeout(() => {
      getOrders({ page: 1, limit }).then((data) => {
        const list = Array.isArray(data) ? data : data.orders || data.data || [];
        setOrders(list);
        if (data?.pagination) setPaginationInfo(data.pagination);
      });
    }, 50);
    toast.info("Filters cleared");
  };

  // Submit Logistics & Status Update (Endpoint #3: PUT /api/admin/orders/{id}/status)
  const handleUpdateLogisticsSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedOrder) return;
    const orderId = selectedOrder.id || selectedOrder.orderId || selectedOrder.orderNumber;

    try {
      // Backend Rule: DELIVERED is allowed ONLY from DISPATCHED or IN_TRANSIT
      const currentMilestone = (selectedOrder.orderStatus || selectedOrder.status || "").toUpperCase();
      if (logisticsForm.status.toUpperCase() === "DELIVERED") {
        if (currentMilestone !== "DISPATCHED" && currentMilestone !== "IN_TRANSIT" && currentMilestone !== "OUT_FOR_DELIVERY") {
          toast.warning("DELIVERED status is allowed only from DISPATCHED or IN_TRANSIT.");
          return;
        }
        const confirmDelivery = window.confirm(
          "Confirmation Required: Marking this order as DELIVERED starts the seller payout timer (7 days). Proceed?"
        );
        if (!confirmDelivery) return;
      }

      setStatusUpdating(true);
      const payload = {
        status: logisticsForm.status,
        location: logisticsForm.location || "",
        description: logisticsForm.description || `Status updated to ${logisticsForm.status}`,
        carrierName: logisticsForm.carrierName || "",
        vehicleNumber: logisticsForm.vehicleNumber || "",
        driverName: logisticsForm.driverName || "",
        trackingNumber: logisticsForm.trackingNumber || "",
        estimatedDelivery: logisticsForm.estimatedDelivery ? new Date(logisticsForm.estimatedDelivery).toISOString().slice(0, 19) : null,
      };

      const updated = await updateOrderStatus(orderId, payload);
      toast.success(`Order status updated to ${logisticsForm.status} with carrier tracking details!`);
      await loadOrders(page);

      setSelectedOrder((prev) => ({
        ...prev,
        ...updated,
        orderStatus: logisticsForm.status,
        status: logisticsForm.status,
        carrierName: payload.carrierName,
        vehicleNumber: payload.vehicleNumber,
        driverName: payload.driverName,
        trackingNumber: payload.trackingNumber,
        estimatedDelivery: payload.estimatedDelivery,
      }));
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to update order logistics status.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // Quick direct status transition
  const handleQuickStatusChange = async (orderId, newStatus) => {
    if (newStatus.toUpperCase() === "CANCELLED") {
      setShowCancelModal(true);
      return;
    }

    if (newStatus.toUpperCase() === "DELIVERED") {
      const curStatus = (selectedOrder?.orderStatus || selectedOrder?.status || "").toUpperCase();
      if (curStatus !== "DISPATCHED" && curStatus !== "IN_TRANSIT" && curStatus !== "OUT_FOR_DELIVERY") {
        toast.warning("DELIVERED status is allowed only from DISPATCHED or IN_TRANSIT.");
        return;
      }
      if (!window.confirm("Confirmation Required: Marking this order as DELIVERED starts the seller payout timer (7 days). Proceed?")) return;
    } else {
      if (!window.confirm(`Update order status to "${newStatus}"?`)) return;
    }

    try {
      setStatusUpdating(true);
      const updated = await updateOrderStatus(orderId, {
        status: newStatus,
        location: "Admin Control Desk",
        description: `Order milestone transitioned to ${newStatus}`,
      });
      toast.success(`Order status updated to ${newStatus}`);
      await loadOrders(page);
      if (selectedOrder && (selectedOrder.id === orderId || selectedOrder.orderNumber === orderId)) {
        setSelectedOrder((prev) => ({
          ...prev,
          ...updated,
          status: newStatus,
          orderStatus: newStatus,
        }));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update order status.");
    } finally {
      setStatusUpdating(false);
    }
  };

  // Order Cancellation (Endpoint #7: POST /api/admin/orders/{id}/cancel)
  const handleConfirmCancelOrder = async (e) => {
    e?.preventDefault();
    if (!selectedOrder) return;
    const orderId = selectedOrder.id || selectedOrder.orderId || selectedOrder.orderNumber;

    try {
      setCancelling(true);
      await cancelOrder(orderId, {
        location: cancelForm.location,
        description: cancelForm.description,
      });
      toast.success(`Order #${orderId} cancelled. Refund pipeline initiated!`);
      setShowCancelModal(false);
      setSelectedOrder((prev) => ({
        ...prev,
        status: "CANCELLED",
        orderStatus: "CANCELLED",
        paymentStatus: "REFUND_PENDING",
      }));
      await loadOrders(page);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  };

  // Tax Invoice Actions (Endpoint #6)
  const handlePreviewInvoice = async (orderId) => {
    await previewOrderInvoicePdf(orderId);
  };

  const handleDownloadInvoice = async (orderId) => {
    try {
      toast.info("Downloading official Tax Invoice PDF...");
      await downloadOrderInvoice(orderId);
      toast.success("Tax Invoice PDF downloaded successfully!");
    } catch (err) {
      toast.error("Failed to download PDF invoice.");
    }
  };

  const getOrderStatus = (o) => (o.orderStatus || o.status || "PLACED").toUpperCase();
  const getPaymentStatus = (o) => (o.paymentStatus || o.payment || "PAID").toUpperCase();

  // Client-side search & filtering refinement
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderNo = order.orderNumber || order.number || order.id || "";
      const buyerName = order.customerName || order.buyer?.name || order.buyerName || "";
      const storeName = order.storeName || order.seller?.name || order.sellerName || "";
      const text = `${orderNo} ${buyerName} ${storeName}`.toLowerCase();
      const matchesSearch = text.includes(search.toLowerCase());

      const status = getOrderStatus(order);
      const matchesStatus = statusFilter === "ALL" || status === statusFilter.toUpperCase();

      const payment = getPaymentStatus(order);
      const matchesPayment = paymentFilter === "ALL" || payment === paymentFilter.toUpperCase();

      const matchesBuyer = !buyerFilter || buyerName.toLowerCase().includes(buyerFilter.toLowerCase());
      const matchesSeller = !sellerFilter || storeName.toLowerCase().includes(sellerFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesPayment && matchesBuyer && matchesSeller;
    });
  }, [orders, search, statusFilter, paymentFilter, buyerFilter, sellerFilter]);

  const counts = useMemo(() => {
    return {
      total: orders.length,
      placed: orders.filter((o) => getOrderStatus(o) === "PLACED").length,
      confirmed: orders.filter((o) => getOrderStatus(o) === "CONFIRMED").length,
      loaded: orders.filter((o) => getOrderStatus(o) === "LOADED").length,
      dispatched: orders.filter((o) => getOrderStatus(o) === "DISPATCHED").length,
      inTransit: orders.filter((o) => getOrderStatus(o) === "IN_TRANSIT").length,
      delivered: orders.filter((o) => getOrderStatus(o) === "DELIVERED").length,
      cancelled: orders.filter((o) => getOrderStatus(o) === "CANCELLED").length,
    };
  }, [orders]);

  const handleExportCSV = () => {
    const headers = ["Order No,Store Name,Customer,Amount,Payment,Order Status,Date"];
    const rows = filteredOrders.map((o) =>
      [
        `"${o.orderNumber || o.id}"`,
        `"${o.storeName || o.sellerName || ""}"`,
        `"${o.customerName || o.buyerName || ""}"`,
        o.totalAmount || 0,
        `"${getPaymentStatus(o)}"`,
        `"${getOrderStatus(o)}"`,
        `"${o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN") : ""}"`,
      ].join(",")
    );
    const blob = new Blob([[...headers, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hinchmart_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Orders export downloaded!");
  };

  const hasActiveFilters =
    dateFrom || dateTo || statusFilter !== "ALL" || paymentFilter !== "ALL" || buyerFilter || sellerFilter;

  return (
    <div className="orders-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Admin Orders & Logistics Management</h1>
          <p>Real-time platform orders, carrier logistics assignment, live status transitions & statutory GST tax invoicing</p>
        </div>

        <div className="page-header-actions">
          <button
            className={`btn-secondary ${showFilters ? "active-filter-btn" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            <span>Filters {hasActiveFilters && "•"}</span>
          </button>

          <button className="btn-secondary" onClick={handleExportCSV}>
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Lifecycle Status Filter Strip */}
      <div className="header-stats-strip" style={{ overflowX: "auto", flexWrap: "nowrap", paddingBottom: 6 }}>
        {STATUS_OPTIONS.map((opt) => {
          const isActive = statusFilter === opt.id;
          const count =
            opt.id === "ALL" ? counts.total :
            opt.id === "PLACED" ? counts.placed :
            opt.id === "CONFIRMED" ? counts.confirmed :
            opt.id === "LOADED" ? counts.loaded :
            opt.id === "DISPATCHED" ? counts.dispatched :
            opt.id === "IN_TRANSIT" ? counts.inTransit :
            opt.id === "DELIVERED" ? counts.delivered :
            opt.id === "CANCELLED" ? counts.cancelled : 0;

          return (
            <div
              key={opt.id}
              className={`stat-pill ${isActive ? "active-pill" : ""}`}
              onClick={() => {
                setStatusFilter(opt.id);
                setPage(1);
              }}
              style={{ cursor: "pointer", whiteSpace: "nowrap" }}
            >
              <span className="stat-pill-label">{opt.label}</span>
              <strong className="stat-pill-value">{count}</strong>
            </div>
          );
        })}
      </div>

      {/* Advanced Filter Drawer */}
      {showFilters && (
        <div className="content-card filter-drawer-card">
          <div className="filter-drawer-header">
            <h3>Advanced Order Filters</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>Filter orders by Date, Status, Payment Status, Buyer & Seller</span>
          </div>

          <div className="filter-form-grid">
            <div className="filter-field">
              <label>Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="filter-field">
              <label>Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="filter-field">
              <label>Order Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label>Payment Status</label>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="PAID">Paid</option>
                <option value="REFUND_PENDING">Refund Pending</option>
                <option value="REFUNDED">Refunded</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            <div className="filter-field">
              <label>Filter Buyer Name / Company</label>
              <input
                placeholder="e.g. Ramesh Patel"
                value={buyerFilter}
                onChange={(e) => setBuyerFilter(e.target.value)}
              />
            </div>

            <div className="filter-field">
              <label>Filter Supplying Store Name</label>
              <input
                placeholder="e.g. Sri Balaji Steel Traders"
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-actions-bar">
            <button className="btn-secondary" onClick={handleClearFilters}>
              Clear Filters
            </button>
            <button className="primary-button" onClick={handleApplyFilters}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 8, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", color: "#ef4444", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={18} />
            <span style={{ fontWeight: 500, fontSize: 13 }}>{error}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(error.includes("401") || error.includes("expired") || error.includes("log in")) && (
              <button
                className="primary-button"
                style={{ padding: "6px 14px", fontSize: 12, height: "auto" }}
                onClick={() => navigate("/login")}
              >
                Log In Again
              </button>
            )}
            <button
              className="btn-secondary"
              style={{ padding: "6px 12px", fontSize: 12, height: "auto", display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => loadOrders(page)}
            >
              <RotateCcw size={13} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Orders Table Card */}
      <div className="content-card">
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={18} />
            <input
              placeholder="Search by Order No., Buyer, Store Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>
                ×
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-state-container">
            <div className="spinner"></div>
            <p>Loading real platform orders from backend...</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Customer / Buyer</th>
                  <th>Supplying Store</th>
                  <th>Items & Details</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-table">
                      <div className="empty-table-content">
                        <ShoppingBag size={42} style={{ color: "#94a3b8" }} />
                        <h3>No orders found.</h3>
                        <p>{hasActiveFilters || search ? "Try clearing active search or date filters." : "No orders matching criteria in backend database."}</p>
                        <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center" }}>
                          <button
                            className="primary-button"
                            style={{ padding: "8px 16px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
                            onClick={() => loadOrders(page)}
                          >
                            <RotateCcw size={14} /> Refresh Orders
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const id = order.id || order.orderId || order.orderNumber;
                    const orderNo = order.orderNumber || `ORD-${id}`;
                    const customerName = order.customerName || order.buyerName || "—";
                    const storeName = order.storeName || order.sellerName || "—";
                    const storeInv = order.storeInvoiceNumber || "—";
                    const totalAmount = Number(order.totalAmount ?? order.amount ?? 0);
                    const payment = getPaymentStatus(order);
                    const orderStatus = getOrderStatus(order);
                    const dateDisplay = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

                    return (
                      <tr key={id}>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span
                              className="order-number font-mono"
                              style={{ cursor: "pointer", color: "#2563eb", fontWeight: 700 }}
                              onClick={() => setSelectedOrder(order)}
                            >
                              <ShoppingBag size={13} />
                              {orderNo}
                            </span>
                            {order.requiresCraneUnloading && (
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: "#d97706", background: "#fffbeb", padding: "1px 5px", borderRadius: 4, width: "fit-content" }}>
                                🏗️ Crane Required
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="user-subtext">
                            <User size={13} />
                            <strong>{customerName}</strong>
                            {order.customerPhone && (
                              <small className="text-muted" style={{ display: "block", fontSize: 11 }}>
                                {order.customerPhone}
                              </small>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="seller-subtext">
                            <Store size={13} />
                            <span>{storeName}</span>
                            {storeInv !== "—" && (
                              <small className="font-mono text-muted" style={{ display: "block", fontSize: 10.5 }}>
                                {storeInv}
                              </small>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {order.firstItemImage && (
                              <img
                                src={order.firstItemImage}
                                alt=""
                                style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0" }}
                              />
                            )}
                            <div>
                              <strong style={{ fontSize: 12.5, display: "block", color: "#0f172a" }}>
                                {order.firstItemTitle || `${order.itemCount || 1} Item(s)`}
                              </strong>
                              <span style={{ fontSize: 11, color: "#64748b" }}>
                                {order.itemCount || 1} item{order.itemCount > 1 ? "s" : ""}
                                {order.totalWeightKg ? ` • ${(order.totalWeightKg / 1000).toFixed(1)} Ton (${order.totalWeightKg} kg)` : ""}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <strong className="amount-cell font-mono">
                            ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`status-badge-glow ${
                              payment === "PAID" ? "status-delivered" :
                              payment === "REFUND_PENDING" ? "status-pending" :
                              payment === "REFUNDED" ? "status-inactive" : "status-blocked"
                            }`}
                          >
                            <span className="status-dot"></span>
                            {payment}
                          </span>
                        </td>

                        <td>
                          <span className={`status-badge-glow status-${orderStatus.toLowerCase()}`}>
                            <span className="status-dot"></span>
                            {orderStatus}
                          </span>
                        </td>

                        <td className="date-cell">
                          <span>{dateDisplay}</span>
                        </td>

                        <td>
                          <div className="action-buttons" style={{ justifyContent: "flex-end", gap: 6 }}>
                            <button
                              className="btn-table-action view"
                              title="Assign Logistics & Update Status"
                              onClick={() => setSelectedOrder(order)}
                            >
                              <Truck size={13} /> LOGISTICS
                            </button>
                            <button
                              className="btn-table-action"
                              title="Full Order Dossier"
                              style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                              onClick={() => navigate(`/admin/orders/${id}`, { state: { order } })}
                            >
                              <Eye size={13} />
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

        {/* Server Pagination Toolbar */}
        {!loading && filteredOrders.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
            <span style={{ fontSize: 12.5, color: "#64748b" }}>
              Showing Page <strong>{paginationInfo.page || page}</strong> of <strong>{paginationInfo.totalPages || 1}</strong> &nbsp;({paginationInfo.total || filteredOrders.length} Total Orders)
            </span>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                className="btn-secondary"
                disabled={page >= (paginationInfo.totalPages || 1)}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          DYNAMIC POPUP MODAL: ORDERS & LOGISTICS MANAGEMENT (ENDPOINTS #2, #3, #6, #7)
          ========================================================================= */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 840 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="luxury-modal-header">
              <div className="header-title-wrap">
                <div className="header-icon-box" style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)" }}>
                  <Truck size={20} style={{ color: "#ffffff" }} />
                </div>
                <div className="header-texts">
                  <h2>Order #{selectedOrder.orderNumber || selectedOrder.id} — Logistics & Lifecycle</h2>
                  <p>
                    Placed on {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleDateString("en-IN") : "Today"} • Store: <strong>{selectedOrder.storeName || selectedOrder.sellerName}</strong>
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`status-badge-glow status-${getOrderStatus(selectedOrder).toLowerCase()}`}>
                  <span className="status-dot"></span>
                  {getOrderStatus(selectedOrder)}
                </span>
                <button className="header-close-btn" onClick={() => setSelectedOrder(null)}>×</button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="luxury-modal-body">
              {/* Grand Total & Statutory Valuation */}
              <div className="form-section-card" style={{ background: "#fffdf5", borderColor: "#fde68a" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "#92400e", textTransform: "uppercase" }}>Total Order Valuation</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span className="font-mono" style={{ fontSize: 12, color: "#475569" }}>
                        Subtotal: ₹{Number(selectedOrder.subtotal || 0).toLocaleString("en-IN")} • GST: ₹{Number(selectedOrder.totalGst || 0).toLocaleString("en-IN")}
                      </span>
                      {selectedOrder.totalWeightKg > 0 && (
                        <span style={{ fontSize: 11, color: "#b45309", fontWeight: 700 }}>
                          • Weight: {selectedOrder.totalWeightKg} kg
                        </span>
                      )}
                    </div>
                  </div>

                  <strong className="font-mono" style={{ fontSize: 26, color: "#0f172a" }}>
                    ₹{Number(selectedOrder.totalAmount ?? selectedOrder.amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {/* 2-Column: Buyer Details & Delivery Location */}
              <div className="form-section-card">
                <div className="section-card-title">
                  <User size={13} /> Customer & Jobsite Delivery Details
                </div>
                <div className="luxury-form-grid">
                  <div className="input-field-wrap">
                    <label>Customer Name & Phone</label>
                    <div style={{ padding: "9px 13px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9 }}>
                      <strong style={{ display: "block", fontSize: 13, color: "#0f172a" }}>
                        {selectedOrder.customerName || selectedOrder.buyerName}
                      </strong>
                      <span style={{ fontSize: 11.5, color: "#64748b" }}>
                        {selectedOrder.customerPhone || "—"} {selectedOrder.customerEmail ? `• ${selectedOrder.customerEmail}` : ""}
                      </span>
                      {selectedOrder.orderForSomeoneElse && (
                        <div style={{ marginTop: 4, color: "#d97706", fontSize: 11 }}>
                          Recipient: <strong>{selectedOrder.recipientName}</strong> ({selectedOrder.recipientPhone})
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="input-field-wrap">
                    <label>Delivery Site Location</label>
                    <div style={{ padding: "9px 13px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9 }}>
                      <strong style={{ display: "block", fontSize: 12.5, color: "#0f172a" }}>
                        {selectedOrder.deliveryLocation || "Standard Jobsite Delivery"}
                      </strong>
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        Slot: {selectedOrder.deliverySlot || "MORNING_8AM_12PM"}
                        {selectedOrder.deliveryInstructions ? ` • ${selectedOrder.deliveryInstructions}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form: Update Order Status & Assign Genuine Logistics Details (Endpoint #3) */}
              <div className="form-section-card" style={{ border: "1.5px solid #38bdf8", background: "#f0f9ff" }}>
                <div className="section-card-title" style={{ color: "#0369a1", marginBottom: 10 }}>
                  <Truck size={14} /> Update Order Status & Assign Carrier Logistics Details (Endpoint #3)
                </div>

                <form onSubmit={handleUpdateLogisticsSubmit}>
                  <div className="luxury-form-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                    <div className="input-field-wrap">
                      <label style={{ color: "#0369a1" }}>New Milestone Status *</label>
                      <select
                        value={logisticsForm.status}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, status: e.target.value })}
                        required
                        style={{ background: "#ffffff", borderColor: "#bae6fd", fontWeight: 700 }}
                      >
                        <option value="CONFIRMED">CONFIRMED (Order verified by Admin)</option>
                        <option value="LOADED">LOADED (Cargo loaded at facility)</option>
                        <option value="DISPATCHED">DISPATCHED (Vehicle out of gate)</option>
                        <option value="IN_TRANSIT">IN_TRANSIT (Linehaul on the way)</option>
                        <option
                          value="DELIVERED"
                          disabled={
                            (selectedOrder?.orderStatus || selectedOrder?.status || "").toUpperCase() !== "DISPATCHED" &&
                            (selectedOrder?.orderStatus || selectedOrder?.status || "").toUpperCase() !== "IN_TRANSIT"
                          }
                        >
                          DELIVERED (Signed - Starts 7-day seller payout timer)
                        </option>
                      </select>
                    </div>

                    <div className="input-field-wrap">
                      <label style={{ color: "#0369a1" }}>Carrier / Transport Company</label>
                      <input
                        list="carrierList"
                        value={logisticsForm.carrierName}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, carrierName: e.target.value })}
                        placeholder="e.g. BlueDart Freight"
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                      <datalist id="carrierList">
                        {CARRIER_PRESETS.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>

                    <div className="input-field-wrap">
                      <label style={{ color: "#0369a1" }}>Vehicle Registration Number</label>
                      <input
                        value={logisticsForm.vehicleNumber}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, vehicleNumber: e.target.value })}
                        placeholder="e.g. TS 09 UB 4821"
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                    </div>

                    <div className="input-field-wrap">
                      <label style={{ color: "#0369a1" }}>Driver Full Name</label>
                      <input
                        value={logisticsForm.driverName}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, driverName: e.target.value })}
                        placeholder="e.g. Suresh Kumar"
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                    </div>

                    <div className="input-field-wrap">
                      <label style={{ color: "#0369a1" }}>Tracking / Consignment #</label>
                      <input
                        value={logisticsForm.trackingNumber}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, trackingNumber: e.target.value })}
                        placeholder="e.g. BLU8829104"
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                    </div>

                    <div className="input-field-wrap">
                      <label style={{ color: "#0369a1" }}>Estimated Delivery Time</label>
                      <input
                        type="datetime-local"
                        value={logisticsForm.estimatedDelivery}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, estimatedDelivery: e.target.value })}
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                    </div>

                    <div className="input-field-wrap" style={{ gridColumn: "span 2" }}>
                      <label style={{ color: "#0369a1" }}>Milestone Location Note</label>
                      <input
                        value={logisticsForm.location}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, location: e.target.value })}
                        placeholder="e.g. Distribution Hub - Shamshabad, Hyderabad"
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                    </div>

                    <div className="input-field-wrap" style={{ gridColumn: "span 2" }}>
                      <label style={{ color: "#0369a1" }}>Logistics Remarks / Description</label>
                      <input
                        value={logisticsForm.description}
                        onChange={(e) => setLogisticsForm({ ...logisticsForm, description: e.target.value })}
                        placeholder="e.g. Vehicle dispatched for jobsite delivery."
                        style={{ background: "#ffffff", borderColor: "#bae6fd" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={statusUpdating}
                      style={{ padding: "9px 18px", fontSize: 13, background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "#ffffff" }}
                    >
                      <Truck size={14} /> {statusUpdating ? "Updating Logistics..." : "Update Status & Save Logistics Details"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Statutory Tax Invoice & Cancellation Actions */}
              <div className="form-section-card">
                <div className="section-card-title">
                  <FileText size={13} /> Statutory GST Tax Invoice (Endpoints #5 & #6)
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 12, color: "#475569" }}>
                      Store Tax Invoice Ref: <strong className="font-mono">{selectedOrder.storeInvoiceNumber || "—"}</strong>
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => handlePreviewInvoice(selectedOrder.id || selectedOrder.orderId || selectedOrder.orderNumber)}
                      style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <Printer size={13} /> Preview PDF
                    </button>

                    <button
                      className="btn-secondary"
                      onClick={() => handleDownloadInvoice(selectedOrder.id || selectedOrder.orderId || selectedOrder.orderNumber)}
                      style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <Download size={13} /> Download PDF
                    </button>

                    {getOrderStatus(selectedOrder) !== "CANCELLED" && getOrderStatus(selectedOrder) !== "DELIVERED" && (
                      <button
                        className="btn-secondary"
                        onClick={() => setShowCancelModal(true)}
                        style={{ padding: "6px 12px", fontSize: 12, borderColor: "#fecaca", color: "#dc2626", background: "#fef2f2" }}
                      >
                        <XCircle size={13} /> Cancel Order
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="luxury-modal-footer">
              <button
                className="btn-luxury-cancel"
                onClick={() => {
                  navigate(`/admin/orders/${selectedOrder.id || selectedOrder.orderId || selectedOrder.orderNumber}`, { state: { order: selectedOrder } });
                  setSelectedOrder(null);
                }}
              >
                <ExternalLink size={13} /> Full Page Dossier
              </button>

              <button className="btn-luxury-submit" onClick={() => setSelectedOrder(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ORDER CANCELLATION MODAL (ENDPOINT #7: POST /api/admin/orders/{id}/cancel)
          ========================================================================= */}
      {showCancelModal && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 580 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="luxury-modal-header">
              <div className="header-title-wrap">
                <div className="header-icon-box" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
                  <XCircle size={20} style={{ color: "#ffffff" }} />
                </div>
                <div className="header-texts">
                  <h2>Cancel Order #{selectedOrder.orderNumber || selectedOrder.id}</h2>
                  <p>POST /api/admin/orders/:id/cancel • Refund Pipeline & Payout Clawback</p>
                </div>
              </div>
              <button className="header-close-btn" onClick={() => setShowCancelModal(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmCancelOrder}>
              <div className="luxury-modal-body">
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 14px", borderRadius: 8, marginBottom: 14 }}>
                  <strong style={{ color: "#991b1b", fontSize: 12.5, display: "block" }}>
                    Automated Cancellation Pipeline Notice:
                  </strong>
                  <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0 0" }}>
                    Cancelling this order will mark payment status as <strong>REFUND_PENDING</strong>, notify carrier dispatch to halt consignment, and reverse merchant commission ledger.
                  </p>
                </div>

                <div className="luxury-form-grid" style={{ gridTemplateColumns: "1fr", gap: 12 }}>
                  <div className="input-field-wrap">
                    <label>Admin Station / Location</label>
                    <input
                      value={cancelForm.location}
                      onChange={(e) => setCancelForm({ ...cancelForm, location: e.target.value })}
                      required
                    />
                  </div>

                  <div className="input-field-wrap">
                    <label>Cancellation Reason / Description</label>
                    <textarea
                      rows={3}
                      value={cancelForm.description}
                      onChange={(e) => setCancelForm({ ...cancelForm, description: e.target.value })}
                      required
                      style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              <div className="luxury-modal-footer">
                <button
                  type="button"
                  className="btn-luxury-cancel"
                  onClick={() => setShowCancelModal(false)}
                >
                  Close
                </button>

                <button
                  type="submit"
                  className="btn-luxury-submit"
                  disabled={cancelling}
                  style={{ background: "#dc2626" }}
                >
                  <XCircle size={14} /> {cancelling ? "Cancelling..." : "Confirm & Cancel Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
