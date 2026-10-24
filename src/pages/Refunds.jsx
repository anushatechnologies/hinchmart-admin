import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw,
  RefreshCw,
  AlertOctagon,
  Clock,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  CreditCard,
  Building,
} from "lucide-react";
import {
  getPendingRefunds,
  retryRefund,
  reconcileStaleRefunds,
} from "../api/refundApi";
import { useToast } from "../components/ToastContext";
import "../styles/refunds.css";
import "../styles/pages.css";

export default function Refunds() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState([]);
  const [retryingId, setRetryingId] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMinutes, setReconcileMinutes] = useState(15);
  const [reconcileResult, setReconcileResult] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const loadRefunds = async () => {
    try {
      setLoading(true);
      const data = await getPendingRefunds();
      setRefunds(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load pending refunds.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRefunds();
  }, []);

  // Retry Refund handler
  const handleRetry = async (paymentId) => {
    try {
      setRetryingId(paymentId);
      const res = await retryRefund(paymentId);
      toast.success(`Refund for payment #${paymentId} dispatched to gateway! Status: ${res.status}`);
      await loadRefunds();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to retry refund.");
    } finally {
      setRetryingId(null);
    }
  };

  // Reconcile Stale handler
  const handleReconcile = async () => {
    try {
      setReconciling(true);
      const res = await reconcileStaleRefunds(reconcileMinutes);
      const count = res.reconciledCount ?? 0;
      setReconcileResult(count);
      toast.success(`Reconciled ${count} stale refund(s) older than ${reconcileMinutes} minutes.`);
      await loadRefunds();
    } catch (err) {
      toast.error("Failed to reconcile stale refunds.");
    } finally {
      setReconciling(false);
    }
  };

  // Filtered rows
  const filteredRefunds = useMemo(() => {
    return refunds.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(r.paymentId).includes(q) ||
        (r.orderNumber || "").toLowerCase().includes(q) ||
        (r.customerName || "").toLowerCase().includes(q) ||
        (r.customerEmail || "").toLowerCase().includes(q) ||
        (r.errorCode || "").toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "ALL" || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [refunds, search, statusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const pendingCount = refunds.filter((r) => r.status === "REFUND_PENDING").length;
    const inProgressCount = refunds.filter((r) => r.status === "REFUND_IN_PROGRESS").length;
    const failedCount = refunds.filter((r) => r.status === "REFUND_FAILED").length;
    const refundedCount = refunds.filter((r) => r.status === "REFUNDED").length;
    const pendingAmount = refunds
      .filter((r) => r.status !== "REFUNDED")
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    return { pendingCount, inProgressCount, failedCount, refundedCount, pendingAmount };
  }, [refunds]);

  return (
    <div className="refunds-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Payment Refunds & Gateway Reconciliation</h1>
          <p>
            Monitor pending and failed gateway refunds. Gateway refunds no longer fall back to wallet credit—admins review and retry transactions directly.
          </p>
        </div>

        <div className="refunds-header-actions">
          <div className="reconcile-box">
            <span>Stale &gt;</span>
            <input
              type="number"
              min="1"
              max="1440"
              className="reconcile-input"
              value={reconcileMinutes}
              onChange={(e) => setReconcileMinutes(Math.max(1, Number(e.target.value) || 15))}
              title="Minutes cutoff for stale refunds"
            />
            <span>mins</span>
            <button
              className="btn-retry"
              onClick={handleReconcile}
              disabled={reconciling}
              style={{ padding: "4px 10px", fontSize: "11.5px" }}
            >
              <RefreshCw size={12} className={reconciling ? "spin" : ""} />
              <span>{reconciling ? "Reconciling..." : "Reconcile Stale"}</span>
            </button>
          </div>

          <button className="btn-secondary" onClick={loadRefunds}>
            <RotateCcw size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Reconcile notice alert if recently executed */}
      {reconcileResult !== null && (
        <div className="warning-banner" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", borderLeftColor: "#059669" }}>
          <CheckCircle2 size={20} color="#059669" className="warning-banner-icon" />
          <div className="warning-banner-content">
            <h4 style={{ color: "#065f46" }}>Reconciliation Complete</h4>
            <p style={{ color: "#047857" }}>
              Successfully evaluated stale refund transactions older than {reconcileMinutes} minutes. Reconciled {reconcileResult} pending transaction(s).
            </p>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="refund-stats-grid">
        <div className="refund-stat-card">
          <div className="refund-stat-info">
            <h5>Pending Gateway Action</h5>
            <strong>{metrics.pendingCount} Refunds</strong>
          </div>
          <div className="refund-stat-icon amber">
            <Clock size={22} />
          </div>
        </div>

        <div className="refund-stat-card">
          <div className="refund-stat-info">
            <h5>In Progress (Processing)</h5>
            <strong>{metrics.inProgressCount} Refunds</strong>
          </div>
          <div className="refund-stat-icon blue">
            <RefreshCw size={22} />
          </div>
        </div>

        <div className="refund-stat-card">
          <div className="refund-stat-info">
            <h5>Failed / Manual Action</h5>
            <strong>{metrics.failedCount} Refunds</strong>
          </div>
          <div className="refund-stat-icon red">
            <AlertOctagon size={22} />
          </div>
        </div>

        <div className="refund-stat-card">
          <div className="refund-stat-info">
            <h5>Total At Risk Value</h5>
            <strong>₹{metrics.pendingAmount.toLocaleString()}</strong>
          </div>
          <div className="refund-stat-icon green">
            <IndianRupee size={22} />
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="vendor-stock-filters">
        <div className="filter-search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by Payment ID, Order #, Customer, or Error Code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Refund States</option>
          <option value="REFUND_PENDING">Pending (Action Required)</option>
          <option value="REFUND_IN_PROGRESS">In Progress (Claimed)</option>
          <option value="REFUND_FAILED">Hard Failed (Manual Contact)</option>
          <option value="REFUNDED">Refunded (Settled)</option>
        </select>
      </div>

      {/* Table Card */}
      <div className="stock-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            Loading refund queue from payment service...
          </div>
        ) : filteredRefunds.length === 0 ? (
          <div style={{ padding: "50px", textAlign: "center", color: "#64748b" }}>
            <CheckCircle2 size={44} color="#10b981" style={{ margin: "0 auto 12px auto", opacity: 0.6 }} />
            <h3>No Pending Refunds in Queue</h3>
            <p style={{ fontSize: "13px" }}>
              All customer gateway refunds are settled or reconciled.
            </p>
          </div>
        ) : (
          <table className="stock-table">
            <thead>
              <tr>
                <th>Payment / Order Ref</th>
                <th>Customer / Buyer</th>
                <th>Refund Amount</th>
                <th>Status</th>
                <th>Gateway Error Code &amp; Diagnostic</th>
                <th>Retry Count</th>
                <th>Last Attempt</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRefunds.map((refund) => {
                const isRetrying = retryingId === refund.paymentId;
                const canRetry = refund.status === "REFUND_PENDING" || refund.status === "REFUND_FAILED";

                return (
                  <tr key={refund.paymentId}>
                    <td>
                      <div className="product-cell">
                        <strong>Payment #{refund.paymentId}</strong>
                        <span>Order: {refund.orderNumber}</span>
                      </div>
                    </td>
                    <td>
                      <div className="store-cell">
                        <strong>{refund.customerName}</strong>
                        <span>{refund.customerEmail || "No email provided"}</span>
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                        ₹{Number(refund.amount || 0).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`refund-badge ${
                          refund.status === "REFUND_PENDING"
                            ? "pending"
                            : refund.status === "REFUND_IN_PROGRESS"
                            ? "in-progress"
                            : refund.status === "REFUND_FAILED"
                            ? "failed"
                            : "refunded"
                        }`}
                      >
                        {refund.status === "REFUND_PENDING" && <Clock size={11} />}
                        {refund.status === "REFUND_IN_PROGRESS" && <RefreshCw size={11} className="spin" />}
                        {refund.status === "REFUND_FAILED" && <XCircle size={11} />}
                        {refund.status === "REFUNDED" && <CheckCircle2 size={11} />}
                        {refund.status.replace("REFUND_", "")}
                      </span>
                    </td>
                    <td>
                      <div className="error-desc-cell">
                        <code>{refund.errorCode}</code>
                        <div>{refund.errorDescription}</div>
                      </div>
                    </td>
                    <td>
                      <span className="qty-pill total" style={{ fontSize: "11px" }}>
                        {refund.retryCount || 0} Retries
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "#64748b" }}>
                      {new Date(refund.updatedAt || refund.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {canRetry ? (
                        <button
                          className="btn-retry"
                          onClick={() => handleRetry(refund.paymentId)}
                          disabled={isRetrying}
                        >
                          <RefreshCw size={13} className={isRetrying ? "spin" : ""} />
                          <span>{isRetrying ? "Retrying..." : "Retry Refund"}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>
                          {refund.status === "REFUNDED" ? "Completed" : "Running"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
