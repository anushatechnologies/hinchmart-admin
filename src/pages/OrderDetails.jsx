import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ShoppingBag,
  User,
  Store,
  CreditCard,
  Truck,
  CheckCircle2,
  Clock,
  Package,
  XCircle,
  FileText,
  IndianRupee,
  MapPin,
  Mail,
  Phone,
  Building2,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Lock,
  ExternalLink,
  ArrowRight,
  GitCommit,
  Download,
  Printer,
  RefreshCw,
  Navigation,
  Check,
  Plus,
} from "lucide-react";
import {
  getOrderById,
  updateOrderStatus,
  getOrderTracking,
  getOrderInvoice,
  downloadOrderInvoice,
  previewOrderInvoicePdf,
  cancelOrder,
} from "../api/orderApi";
import { refundOrderPayment, getOrderPaymentStatus } from "../api/paymentApi";
import dataStore from "../api/dataStore";
import { useToast } from "../components/ToastContext";
import "../styles/pages.css";

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

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const routeOrder = location.state?.order;
  const localOrder = dataStore.getOrderById(id);
  const cachedOrder = routeOrder || localOrder;

  const [order, setOrder] = useState(() => cachedOrder || null);
  const [loading, setLoading] = useState(!cachedOrder);
  const [error, setError] = useState("");

  // Live Tracking Checkpoints State (Endpoint #4)
  const [trackingData, setTrackingData] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);

  // Live GST Tax Invoice Breakdown State (Endpoint #5)
  const [invoiceData, setInvoiceData] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Status & Logistics Assignment Modal State (Endpoint #3)
  const [showLogisticsModal, setShowLogisticsModal] = useState(false);
  const [logisticsUpdating, setLogisticsUpdating] = useState(false);
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

  // Cancellation Modal State (Endpoint #7)
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelForm, setCancelForm] = useState({
    location: "Admin Panel",
    description: "Customer requested order cancellation prior to dispatch.",
  });
  const [cancelling, setCancelling] = useState(false);

  // Payment Verification & Refund State
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [orderPaymentTelemetry, setOrderPaymentTelemetry] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  // Load Order (Endpoint #2: GET /api/admin/orders/{id})
  const loadOrder = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError("");
      const data = await getOrderById(id);
      if (!data) {
        setError("Order record not found or unavailable.");
      } else {
        setOrder(data);
      }
    } catch (err) {
      console.error(err);
      if (err?.response?.status === 403) {
        setError("You do not have permission to view this order.");
      } else if (err?.response?.status === 404) {
        setError("Order not found (404).");
      } else {
        setError(err?.response?.data?.message || "Unable to load order details from backend.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load Live Tracking Checkpoints (Endpoint #4: GET /api/admin/orders/{id}/tracking)
  const loadTracking = async () => {
    try {
      setLoadingTracking(true);
      const res = await getOrderTracking(id);
      if (res) {
        setTrackingData(res);
      }
    } catch (err) {
      console.warn("Tracking checkpoints load notice:", err?.message);
    } finally {
      setLoadingTracking(false);
    }
  };

  // Load GST Tax Invoice Breakdown (Endpoint #5: GET /api/admin/orders/{id}/invoice)
  const loadInvoice = async () => {
    try {
      setLoadingInvoice(true);
      const res = await getOrderInvoice(id);
      if (res) {
        setInvoiceData(res);
      }
    } catch (err) {
      console.warn("Tax invoice breakdown load notice:", err?.message);
    } finally {
      setLoadingInvoice(false);
    }
  };

  useEffect(() => {
    if (routeOrder) {
      setOrder(routeOrder);
      setLoading(false);
      loadOrder(false);
    } else if (id && !order) {
      loadOrder(true);
    }
    if (id) {
      loadTracking();
      loadInvoice();
    }
  }, [id, routeOrder]);

  // Sync logistics form whenever order updates
  useEffect(() => {
    if (order) {
      const cur = (order.orderStatus || order.status || "PLACED").toUpperCase();
      let next = "CONFIRMED";
      if (cur === "PLACED") next = "CONFIRMED";
      else if (cur === "CONFIRMED") next = "LOADED";
      else if (cur === "LOADED") next = "DISPATCHED";
      else if (cur === "DISPATCHED") next = "IN_TRANSIT";
      else if (cur === "IN_TRANSIT") next = "DELIVERED";
      else next = cur;

      setLogisticsForm({
        status: next,
        carrierName: order.carrierName || trackingData?.carrierName || "",
        vehicleNumber: order.vehicleNumber || trackingData?.vehicleNumber || "",
        driverName: order.driverName || trackingData?.driverName || "",
        trackingNumber: order.trackingNumber || trackingData?.trackingNumber || (order.orderNumber ? `TRK-${order.orderNumber}` : ""),
        location: order.deliveryLocation || "",
        description: `Order milestone progressed to ${next}`,
        estimatedDelivery: order.estimatedDelivery ? order.estimatedDelivery.slice(0, 16) : "",
      });
    }
  }, [order, trackingData]);

  // Submit Logistics Update (Endpoint #3: PUT /api/admin/orders/{id}/status)
  const handleUpdateLogistics = async (e) => {
    e?.preventDefault();
    try {
      setLogisticsUpdating(true);
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

      const updated = await updateOrderStatus(id, payload);
      toast.success(`Order status updated to ${logisticsForm.status} with genuine logistics details!`);
      setShowLogisticsModal(false);
      setOrder((prev) => ({
        ...prev,
        ...updated,
        orderStatus: logisticsForm.status,
        status: logisticsForm.status,
      }));
      await loadOrder(false);
      await loadTracking();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to update order status and logistics.");
    } finally {
      setLogisticsUpdating(false);
    }
  };

  // Order Cancellation (Endpoint #7: POST /api/admin/orders/{id}/cancel)
  const handleConfirmCancelOrder = async (e) => {
    e?.preventDefault();
    try {
      setCancelling(true);
      await cancelOrder(id, {
        location: cancelForm.location,
        description: cancelForm.description,
      });
      toast.success(`Order #${id} cancelled. Auto-refund pipeline initiated!`);
      setShowCancelModal(false);
      setOrder((prev) => ({
        ...prev,
        status: "CANCELLED",
        orderStatus: "CANCELLED",
        paymentStatus: "REFUND_PENDING",
      }));
      await loadOrder(false);
      await loadTracking();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to cancel order.");
    } finally {
      setCancelling(false);
    }
  };

  // Verify Latest Order Payment Status
  const handleVerifyPaymentStatus = async () => {
    try {
      setVerifyingPayment(true);
      const res = await getOrderPaymentStatus(id);
      setOrderPaymentTelemetry(res);
      if (res?.status) {
        setOrder((prev) => ({
          ...prev,
          paymentStatus: res.status,
          paymentMethod: res.paymentMethod || prev.paymentMethod,
        }));
      }
      toast.success(`Latest payment status verified: ${res?.status || "CAPTURED"}`);
    } catch (err) {
      toast.error("Failed to query order payment status from gateway.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Trigger Direct Gateway Refund
  const handleTriggerRefund = async () => {
    const confirmed = window.confirm(
      `Trigger gateway refund for Order #${id} via Razorpay API?\n\nThis marks payment status as REFUNDED and claws back seller payouts.`
    );
    if (!confirmed) return;

    try {
      setRefunding(true);
      await refundOrderPayment(id);
      toast.success("Order refund processed successfully via gateway!");
      setOrder((prev) => ({ ...prev, paymentStatus: "REFUNDED" }));
      await loadOrder(false);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to process order refund.");
    } finally {
      setRefunding(false);
    }
  };

  // PDF Tax Invoice Actions (Endpoint #6)
  const handlePreviewPdfInvoice = async () => {
    await previewOrderInvoicePdf(id);
  };

  const handleDownloadPdfInvoice = async () => {
    try {
      setDownloadingInvoice(true);
      await downloadOrderInvoice(id);
      toast.success("Tax Invoice PDF downloaded successfully!");
    } catch (err) {
      toast.error("Failed to download PDF invoice.");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const getStatus = (o) => (o?.orderStatus || o?.status || "PLACED").toUpperCase();
  const getPaymentStatus = (o) => (o?.paymentStatus || o?.payment || "PAID").toUpperCase();

  if (loading) {
    return (
      <div className="content-card detail-loading-shell">
        <div className="spinner"></div>
        <h2>Opening order dossier</h2>
        <p>Checking live platform order data from backend API...</p>
        <button className="btn-secondary" onClick={() => navigate("/admin/orders")}>
          <ArrowLeft size={16} /> Back to Orders
        </button>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="content-card" style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} style={{ color: "#ef4444", margin: "0 auto 16px" }} />
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>{error || "Order Not Found"}</h2>
        <p style={{ color: "#64748b", marginBottom: 20 }}>
          The requested order details could not be retrieved from the backend.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="btn-secondary" onClick={() => navigate("/admin/orders")}>
            <ArrowLeft size={16} /> Back to Orders
          </button>
          <button className="primary-button" onClick={() => loadOrder(true)}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const currentStatus = getStatus(order);
  const currentPaymentStatus = getPaymentStatus(order);

  // Line items
  const items = Array.isArray(order.items) ? order.items : [];

  const subtotal = Number(order.subtotal || invoiceData?.subtotal || items.reduce((s, it) => s + (Number(it.unitPrice || it.price || 0) * (it.quantity || 1)), 0));
  const cgst = Number(order.cgst || invoiceData?.cgst || (subtotal * 0.09));
  const sgst = Number(order.sgst || invoiceData?.sgst || (subtotal * 0.09));
  const igst = Number(order.igst || invoiceData?.igst || 0);
  const totalGst = Number(order.totalGst || invoiceData?.totalGst || (cgst + sgst + igst));
  const freight = Number(order.freightCharge || invoiceData?.freightCharge || 0);
  const craneCharge = Number(order.craneUnloadingCharge || invoiceData?.craneUnloadingCharge || 0);
  const grandTotal = Number(order.totalAmount || invoiceData?.grandTotal || (subtotal + totalGst + freight + craneCharge));

  const checkpoints = trackingData?.checkpoints || order.checkpoints || [];

  return (
    <div className="order-details-container">
      {/* Top Header & Navigation */}
      <div className="review-top-bar">
        <button className="btn-back" onClick={() => navigate("/admin/orders")}>
          <ArrowLeft size={17} /> Back to Orders
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Action: Update Logistics & Status */}
          <button
            className="primary-button"
            onClick={() => setShowLogisticsModal(true)}
            style={{ padding: "7px 14px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "#ffffff" }}
          >
            <Truck size={15} /> Update Status & Logistics
          </button>

          {/* Tax Invoice PDF Actions (Endpoint #6) */}
          <button
            className="btn-secondary"
            onClick={handlePreviewPdfInvoice}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12.5 }}
          >
            <Printer size={15} /> Preview PDF
          </button>

          <button
            className="btn-secondary"
            onClick={handleDownloadPdfInvoice}
            disabled={downloadingInvoice}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12.5 }}
          >
            <Download size={15} /> {downloadingInvoice ? "Downloading..." : "Download Invoice PDF"}
          </button>

          <div className="review-header-badge">
            <span className={`status-badge-glow status-${currentStatus.toLowerCase()}`}>
              <span className="status-dot"></span>
              {currentStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Main Order Header Banner */}
      <div className="content-card order-summary-banner">
        <div className="order-summary-header-left">
          <div className="order-number-title">
            <ShoppingBag size={22} className="text-amber" />
            <h2>Order #{order.orderNumber || `ORD-${id}`}</h2>
          </div>
          <div className="order-meta-row">
            <span>Placed on: <strong>{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Today"}</strong></span>
            <span>•</span>
            <span>Items: <strong>{items.length} Product(s)</strong></span>
            {order.totalWeightKg > 0 && (
              <>
                <span>•</span>
                <span>Total Weight: <strong>{(order.totalWeightKg / 1000).toFixed(2)} Ton ({order.totalWeightKg} kg)</strong></span>
              </>
            )}
            {order.requiresCraneUnloading && (
              <>
                <span>•</span>
                <span style={{ color: "#d97706", fontWeight: 800 }}>🏗️ Requires Crane Unloading</span>
              </>
            )}
          </div>
        </div>

        <div className="order-summary-header-right">
          <span className="total-amount-label">Grand Total (Incl. Statutory GST)</span>
          <strong className="total-amount-display font-mono">
            ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </strong>
        </div>
      </div>

      {/* 2-Column: Customer & Supplying Store Info */}
      <div className="order-info-two-col">
        {/* Customer / Buyer Information */}
        <div className="content-card order-party-card">
          <div className="card-section-title">
            <User size={18} />
            <h3>Customer & Buyer Information</h3>
          </div>
          <div className="party-details-body">
            <div className="party-row">
              <span className="party-label">Customer Name</span>
              <strong className="party-val">{order.customerName || order.buyerName || "—"}</strong>
            </div>
            <div className="party-row">
              <span className="party-label">Email Address</span>
              <span className="party-val">{order.customerEmail || order.buyer?.email || "—"}</span>
            </div>
            <div className="party-row">
              <span className="party-label">Phone Contact</span>
              <span className="party-val">{order.customerPhone || order.buyer?.phone || "—"}</span>
            </div>
            <div className="party-row">
              <span className="party-label">Delivery Destination</span>
              <span className="party-val" style={{ maxWidth: 320, textAlign: "right" }}>
                {order.deliveryLocation || "—"}
              </span>
            </div>
            <div className="party-row">
              <span className="party-label">Delivery Slot</span>
              <span className="party-val font-mono">{order.deliverySlot || "—"}</span>
            </div>
            {order.deliveryInstructions && (
              <div className="party-row">
                <span className="party-label">Site Instructions</span>
                <span className="party-val" style={{ color: "#b45309" }}>{order.deliveryInstructions}</span>
              </div>
            )}
            {order.orderForSomeoneElse && (
              <div className="party-row" style={{ background: "#fffbeb", padding: "6px 10px", borderRadius: 6 }}>
                <span className="party-label" style={{ color: "#92400e", fontWeight: 700 }}>Recipient (On-Site)</span>
                <strong className="party-val" style={{ color: "#92400e" }}>
                  {order.recipientName} ({order.recipientPhone})
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Supplying Store Information */}
        <div className="content-card order-party-card">
          <div className="card-section-title">
            <Store size={18} />
            <h3>Supplying Merchant / Store</h3>
          </div>
          <div className="party-details-body">
            <div className="party-row">
              <span className="party-label">Store Legal Name</span>
              <strong className="party-val">{order.storeName || order.sellerName || "—"}</strong>
            </div>
            <div className="party-row">
              <span className="party-label">Store Slug</span>
              <span className="party-val font-mono">{order.storeSlug || "—"}</span>
            </div>
            <div className="party-row">
              <span className="party-label">Store Tax Invoice No.</span>
              <strong className="party-val font-mono" style={{ color: "#2563eb" }}>
                {order.storeInvoiceNumber || "—"}
              </strong>
            </div>
            <div className="party-row">
              <span className="party-label">Platform Commission Rate</span>
              <span className="party-val font-mono" style={{ color: "#d97706", fontWeight: 700 }}>
                {order.commissionRate || 5.0}%
              </span>
            </div>
            <div className="party-row">
              <span className="party-label">Commission Fee Retained</span>
              <span className="party-val font-mono" style={{ color: "#d97706", fontWeight: 700 }}>
                ₹{Number(order.commissionAmount || (subtotal * 0.05)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Carrier Logistics & Tracking Checkpoints Card (Endpoint #4) */}
      <div className="content-card order-party-card" style={{ border: "1.5px solid #0284c7" }}>
        <div className="card-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Truck size={18} style={{ color: "#0284c7" }} />
            <h3>Live Carrier Logistics & Milestones (Endpoint #4)</h3>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={loadTracking}
              disabled={loadingTracking}
              style={{ padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            >
              <RefreshCw size={12} /> {loadingTracking ? "Checking..." : "Refresh Tracking"}
            </button>
            <button
              className="primary-button"
              onClick={() => setShowLogisticsModal(true)}
              style={{ padding: "4px 12px", fontSize: 12, background: "#0284c7" }}
            >
              Update Logistics
            </button>
          </div>
        </div>

        <div className="party-details-body">
          {/* Logistics Summary Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, background: "#f8fafc", padding: "12px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            <div>
              <span style={{ fontSize: 10.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>CARRIER</span>
              <strong style={{ display: "block", fontSize: 13, color: "#0f172a", marginTop: 2 }}>
                {trackingData?.carrierName || order.carrierName || "BlueDart Freight"}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 10.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>VEHICLE NUMBER</span>
              <strong className="font-mono" style={{ display: "block", fontSize: 13, color: "#0f172a", marginTop: 2 }}>
                {trackingData?.vehicleNumber || order.vehicleNumber || "TS 09 UB 4821"}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 10.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>DRIVER NAME</span>
              <strong style={{ display: "block", fontSize: 13, color: "#0f172a", marginTop: 2 }}>
                {trackingData?.driverName || order.driverName || "Suresh Kumar"}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: 10.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>TRACKING / LR NO.</span>
              <strong className="font-mono" style={{ display: "block", fontSize: 13, color: "#0284c7", marginTop: 2 }}>
                {trackingData?.trackingNumber || order.trackingNumber || "BLU8829104"}
              </strong>
            </div>
          </div>

          {/* Checkpoints Timeline */}
          <div style={{ marginTop: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
              Tracking Checkpoints Timeline ({checkpoints.length} events logged)
            </span>

            {checkpoints.length === 0 ? (
              <div style={{ padding: "14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No carrier checkpoints recorded yet. Click "Update Logistics" to log milestones.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {checkpoints.map((cp, idx) => (
                  <div
                    key={cp.checkpointId || idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 14px",
                      background: idx === checkpoints.length - 1 ? "#f0fdf4" : "#ffffff",
                      border: "1px solid",
                      borderColor: idx === checkpoints.length - 1 ? "#bbf7d0" : "#e2e8f0",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ marginTop: 2 }}>
                      <span className={`status-badge-glow status-${(cp.status || "CONFIRMED").toLowerCase()}`} style={{ fontSize: 10.5 }}>
                        <span className="status-dot"></span>
                        {cp.status}
                      </span>
                    </div>

                    <div style={{ flex: 1 }}>
                      <strong style={{ display: "block", fontSize: 13, color: "#0f172a" }}>
                        {cp.title || `Status updated to ${cp.status}`}
                      </strong>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, fontSize: 12, color: "#64748b" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <MapPin size={12} /> {cp.location || "Distribution Hub"}
                        </span>
                        {cp.description && <span>• {cp.description}</span>}
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                      {cp.timestamp ? new Date(cp.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "Recent"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="content-card order-items-card">
        <div className="card-section-title" style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <Package size={18} />
          <h3>Order Line Items & Tax Breakdown</h3>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Product Description</th>
                <th>HSN</th>
                <th>Qty & Unit</th>
                <th>Weight (Kg)</th>
                <th style={{ textAlign: "right" }}>Unit Price</th>
                <th style={{ textAlign: "right" }}>GST Rate</th>
                <th style={{ textAlign: "right" }}>Line GST</th>
                <th style={{ textAlign: "right" }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.orderItemId || item.id || idx}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid #e2e8f0" }}
                        />
                      )}
                      <div>
                        <strong style={{ display: "block", fontSize: 13 }}>{item.title || item.name}</strong>
                        <span className="sku-tag font-mono">{item.sku || `SKU-${item.productId}`}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono text-muted">{item.hsnCode || "721420"}</span>
                  </td>
                  <td>
                    <strong>{item.quantity}</strong> {item.unit || "TON"}
                  </td>
                  <td>
                    <span>{item.weightKg ? `${item.weightKg} kg` : "—"}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="font-mono">₹{Number(item.unitPrice || item.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="font-mono">{item.gstRate || 18}%</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span className="font-mono">₹{Number(item.lineGst || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong className="font-mono">
                      ₹{Number(item.lineTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statutory GST Tax Invoice Breakdown Card (Endpoint #5) */}
      <div className="order-info-two-col">
        {/* Tax Invoice Breakdown */}
        <div className="content-card order-party-card">
          <div className="card-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileText size={18} />
              <h3>GST Tax Invoice Breakdown (Endpoint #5)</h3>
            </div>
            <button
              className="btn-secondary"
              onClick={handlePreviewPdfInvoice}
              style={{ padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            >
              <Printer size={12} /> View PDF
            </button>
          </div>

          <div className="party-details-body">
            <div className="party-row">
              <span className="party-label">Tax Invoice Number</span>
              <strong className="party-val font-mono" style={{ color: "#2563eb" }}>
                {invoiceData?.invoiceNumber || order.storeInvoiceNumber || "—"}
              </strong>
            </div>
            <div className="party-row">
              <span className="party-label">Place of Supply</span>
              <span className="party-val">{invoiceData?.placeOfSupply || "—"}</span>
            </div>
            <div className="party-row">
              <span className="party-label">Seller GSTIN</span>
              <span className="party-val font-mono">{invoiceData?.sellerGstin || order.seller?.gstin || "—"}</span>
            </div>
            <div className="party-row">
              <span className="party-label">Taxable Subtotal</span>
              <span className="party-val font-mono">₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="party-row">
              <span className="party-label">CGST (9%)</span>
              <span className="party-val font-mono">₹{cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="party-row">
              <span className="party-label">SGST (9%)</span>
              <span className="party-val font-mono">₹{sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {igst > 0 && (
              <div className="party-row">
                <span className="party-label">IGST (18%)</span>
                <span className="party-val font-mono">₹{igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="party-row">
              <span className="party-label">Total GST</span>
              <strong className="party-val font-mono" style={{ color: "#d97706" }}>
                ₹{totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </strong>
            </div>
            <div className="dropdown-divider" style={{ margin: "10px 0" }}></div>
            <div className="party-row" style={{ fontSize: 16 }}>
              <strong style={{ color: "#0f172a" }}>Grand Total (INR)</strong>
              <strong className="amount-highlight font-mono">
                ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>
        </div>

        {/* Payment & Refund Controls */}
        <div className="content-card order-party-card">
          <div className="card-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CreditCard size={18} />
              <h3>Payment Status & Gateway Telemetry</h3>
            </div>
            <button
              className="btn-secondary"
              onClick={handleVerifyPaymentStatus}
              disabled={verifyingPayment}
              style={{ padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
            >
              <RefreshCw size={12} /> {verifyingPayment ? "Checking..." : "Verify Gateway"}
            </button>
          </div>

          <div className="party-details-body">
            <div className="party-row">
              <span className="party-label">Payment Method</span>
              <span className="party-val">{order.paymentMethod || "RAZORPAY"}</span>
            </div>
            <div className="party-row">
              <span className="party-label">Payment Status</span>
              <span
                className={`status-badge-glow ${
                  currentPaymentStatus === "PAID" || currentPaymentStatus === "SUCCESS"
                    ? "status-delivered"
                    : currentPaymentStatus === "REFUND_PENDING"
                    ? "status-pending"
                    : currentPaymentStatus === "REFUNDED"
                    ? "status-inactive"
                    : "status-blocked"
                }`}
              >
                <span className="status-dot"></span>
                {currentPaymentStatus}
              </span>
            </div>

            {orderPaymentTelemetry && (
              <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Gateway Verification</span>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Status: <strong style={{ color: "#059669" }}>{orderPaymentTelemetry.status}</strong> • Amount: <strong className="font-mono">₹{Number(orderPaymentTelemetry.amount || grandTotal).toLocaleString("en-IN")}</strong>
                </div>
              </div>
            )}

            {/* Direct Gateway Refund Button */}
            {(currentPaymentStatus === "PAID" || currentPaymentStatus === "CAPTURED") && (
              <div style={{ marginTop: 16 }}>
                <button
                  className="btn-secondary"
                  style={{ borderColor: "#fecaca", color: "#b91c1c", background: "#fef2f2", width: "100%", justifyContent: "center" }}
                  onClick={handleTriggerRefund}
                  disabled={refunding}
                >
                  <RotateCcw size={14} /> {refunding ? "Processing Refund..." : "Execute Gateway Refund"}
                </button>
              </div>
            )}

            {currentStatus !== "CANCELLED" && currentStatus !== "DELIVERED" && (
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn-secondary"
                  style={{ borderColor: "#fecaca", color: "#b91c1c", width: "100%", justifyContent: "center" }}
                  onClick={() => setShowCancelModal(true)}
                >
                  <XCircle size={14} /> Cancel Order via Admin Desk
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          LOGISTICS & STATUS TRANSITION MODAL (ENDPOINT #3: PUT /api/admin/orders/{id}/status)
          ========================================================================= */}
      {showLogisticsModal && (
        <div className="modal-overlay" onClick={() => setShowLogisticsModal(false)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 740 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="luxury-modal-header">
              <div className="header-title-wrap">
                <div className="header-icon-box" style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)" }}>
                  <Truck size={20} style={{ color: "#ffffff" }} />
                </div>
                <div className="header-texts">
                  <h2>Update Order #{order.orderNumber || id} Status & Logistics</h2>
                  <p>PUT /api/admin/orders/:id/status • Attach genuine carrier, vehicle & driver tracking</p>
                </div>
              </div>
              <button className="header-close-btn" onClick={() => setShowLogisticsModal(false)}>×</button>
            </div>

            <form onSubmit={handleUpdateLogistics}>
              <div className="luxury-modal-body">
                <div className="luxury-form-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  <div className="input-field-wrap">
                    <label>Lifecycle Status *</label>
                    <select
                      value={logisticsForm.status}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, status: e.target.value })}
                      required
                      style={{ fontWeight: 700 }}
                    >
                      <option value="CONFIRMED">CONFIRMED (Order verified by Admin)</option>
                      <option value="LOADED">LOADED (Goods loaded on vehicle)</option>
                      <option value="DISPATCHED">DISPATCHED (Vehicle dispatched from facility)</option>
                      <option value="IN_TRANSIT">IN_TRANSIT (Linehaul transit active)</option>
                      <option value="DELIVERED">DELIVERED (Delivered at jobsite)</option>
                    </select>
                  </div>

                  <div className="input-field-wrap">
                    <label>Carrier Company</label>
                    <input
                      list="detailCarrierList"
                      value={logisticsForm.carrierName}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, carrierName: e.target.value })}
                      placeholder="e.g. BlueDart Freight"
                    />
                    <datalist id="detailCarrierList">
                      {CARRIER_PRESETS.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div className="input-field-wrap">
                    <label>Vehicle Registration Number</label>
                    <input
                      value={logisticsForm.vehicleNumber}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, vehicleNumber: e.target.value })}
                      placeholder="e.g. TS 09 UB 4821"
                    />
                  </div>

                  <div className="input-field-wrap">
                    <label>Driver Full Name</label>
                    <input
                      value={logisticsForm.driverName}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, driverName: e.target.value })}
                      placeholder="e.g. Suresh Kumar"
                    />
                  </div>

                  <div className="input-field-wrap">
                    <label>Tracking / AWB / LR Number</label>
                    <input
                      value={logisticsForm.trackingNumber}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, trackingNumber: e.target.value })}
                      placeholder="e.g. BLU8829104"
                    />
                  </div>

                  <div className="input-field-wrap">
                    <label>Estimated Delivery Time</label>
                    <input
                      type="datetime-local"
                      value={logisticsForm.estimatedDelivery}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, estimatedDelivery: e.target.value })}
                    />
                  </div>

                  <div className="input-field-wrap" style={{ gridColumn: "span 2" }}>
                    <label>Milestone Location</label>
                    <input
                      value={logisticsForm.location}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, location: e.target.value })}
                      placeholder="e.g. Distribution Hub - Shamshabad, Hyderabad"
                    />
                  </div>

                  <div className="input-field-wrap" style={{ gridColumn: "span 2" }}>
                    <label>Status Remarks / Description</label>
                    <input
                      value={logisticsForm.description}
                      onChange={(e) => setLogisticsForm({ ...logisticsForm, description: e.target.value })}
                      placeholder="e.g. Vehicle dispatched for jobsite delivery."
                    />
                  </div>
                </div>
              </div>

              <div className="luxury-modal-footer">
                <button
                  type="button"
                  className="btn-luxury-cancel"
                  onClick={() => setShowLogisticsModal(false)}
                >
                  Close
                </button>

                <button
                  type="submit"
                  className="btn-luxury-submit"
                  disabled={logisticsUpdating}
                  style={{ background: "#0284c7" }}
                >
                  <Truck size={14} /> {logisticsUpdating ? "Updating..." : "Save Logistics & Advance Status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          ORDER CANCELLATION MODAL (ENDPOINT #7: POST /api/admin/orders/{id}/cancel)
          ========================================================================= */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div
            className="product-form-modal-luxury modal-animated"
            style={{ maxWidth: 620 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="luxury-modal-header">
              <div className="header-title-wrap">
                <div className="header-icon-box" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
                  <XCircle size={20} style={{ color: "#ffffff" }} />
                </div>
                <div className="header-texts">
                  <h2>Cancel Order #{order.orderNumber || id}</h2>
                  <p>POST /api/admin/orders/:id/cancel • Refund Pipeline & Payout Clawback</p>
                </div>
              </div>
              <button className="header-close-btn" onClick={() => setShowCancelModal(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmCancelOrder}>
              <div className="luxury-modal-body">
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "12px 16px", borderRadius: 8, marginBottom: 16 }}>
                  <strong style={{ display: "block", color: "#991b1b", fontSize: 13 }}>
                    Automated Cancellation Pipeline Notice:
                  </strong>
                  <p style={{ color: "#b91c1c", fontSize: 12.5, margin: "4px 0 0 0" }}>
                    Cancelling this order marks payment as <strong>REFUND_PENDING</strong>, halts carrier linehaul dispatch, and reverses merchant commission ledgers.
                  </p>
                </div>

                <div className="luxury-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <div className="input-field-wrap">
                    <label>Admin Station / Location</label>
                    <input
                      type="text"
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
                  <XCircle size={14} /> {cancelling ? "Executing Pipeline..." : "Confirm & Cancel Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
