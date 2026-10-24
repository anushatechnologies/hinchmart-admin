import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LifeBuoy,
  Search,
  RefreshCw,
  Send,
  Paperclip,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  MessageSquare,
  User,
  Building2,
  ShoppingCart,
  Sparkles,
  Plus,
  X,
  Package,
  ShieldCheck,
} from "lucide-react";
import {
  getAdminCustomerTickets,
  getAdminCustomerTicketById,
  replyToCustomerTicket,
  updateCustomerTicketStatus,
  createCustomerTicket,
} from "../api/customerTicketApi";
import { getAdminSellerTickets } from "../api/sellerTicketApi";
import { getBuyers } from "../api/buyerApi";
import { useToast } from "../components/ToastContext";
import { formatTimeAgo, parseTicketDate } from "../utils/dateUtils";
import "../styles/sellerTickets.css";

const CUSTOMER_CATEGORIES = [
  { value: "ALL", label: "All Categories" },
  { value: "PRODUCT_QUALITY", label: "Product Poor Quality" },
  { value: "DAMAGED_ITEM", label: "Damaged / Defective Item" },
  { value: "ORDER_DISPUTE", label: "Order Dispute" },
  { value: "DELIVERY_ISSUE", label: "Delivery & Shipment" },
  { value: "REFUND_REQUEST", label: "Refund / Return Request" },
  { value: "GENERAL", label: "General Support" },
];

const PRIORITIES = [
  { value: "ALL", label: "All Priorities" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const STATUS_TABS = [
  { key: "ALL", label: "All Tickets" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

const CANNED_CUSTOMER_RESPONSES = [
  {
    label: "Quality Team Reviewing",
    text: "We sincerely apologize for the product quality issue you experienced. Our quality assurance team has escalated this with the vendor. We are initiating an exchange or refund for your order immediately.",
  },
  {
    label: "Refund Credited",
    text: "Your refund request has been verified and approved. The settlement has been processed back to your original payment method. Please allow 2-4 business days for the credit to reflect in your account.",
  },
  {
    label: "Delivery Expedited",
    text: "We have contacted our logistics courier team regarding your delivery status. Your consignment is marked high-priority and is scheduled for rapid delivery.",
  },
  {
    label: "Photos Requested",
    text: "Thank you for reaching out. To expedite your claim, could you please reply with clear photos of the damaged item and the shipping barcode label?",
  },
];

export default function CustomerTickets() {
  const toast = useToast();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [customerFilter, setCustomerFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [sellerTicketsCount, setSellerTicketsCount] = useState(0);

  // Reply Composer
  const [replyContent, setReplyContent] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [autoResolveOnSend, setAutoResolveOnSend] = useState(false);

  // Create Ticket Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    customerName: "",
    customerEmail: "",
    subject: "",
    category: "PRODUCT_QUALITY",
    priority: "HIGH",
    orderId: "",
    message: "",
  });

  // Buyers list for filter & modal
  const [buyersList, setBuyersList] = useState([]);

  // Auto-scroll thread ref
  const threadScrollRef = useRef(null);

  // Fetch tickets
  const fetchTickets = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const params = {
        status: statusFilter,
        page,
        limit: 20,
      };
      if (categoryFilter !== "ALL") params.category = categoryFilter;
      if (customerFilter !== "ALL") params.customerId = customerFilter;

      // Fetch customer tickets and seller tickets count in parallel
      const [res, sellerRes] = await Promise.allSettled([
        getAdminCustomerTickets(params),
        getAdminSellerTickets({ limit: 1 }),
      ]);

      if (sellerRes.status === "fulfilled") {
        const sTotal = sellerRes.value?.pagination?.total ?? sellerRes.value?.data?.length ?? 0;
        setSellerTicketsCount(sTotal);
      }

      if (res.status === "fulfilled") {
        const list = res.value?.data || [];
        setTickets(list);
        setPagination(res.value?.pagination || { page: 1, limit: 20, total: list.length, totalPages: 1 });

        if (selectedTicketId) {
          loadTicketDetail(selectedTicketId, false);
        } else if (list.length > 0 && typeof window !== "undefined" && window.innerWidth > 1100) {
          setSelectedTicketId(list[0].ticketId);
          setSelectedTicket(list[0]);
        }
      } else {
        throw res.reason;
      }
    } catch (err) {
      console.warn("Error fetching customer tickets:", err?.message);
      if (err?.response?.status === 401) {
        toast.error("Session expired. Please log in again.");
      } else if (err?.response?.status !== 404 && err?.response?.status !== 400) {
        toast.error(err?.response?.data?.message || err?.message || "Failed to load customer tickets");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load ticket details & full message thread
  const loadTicketDetail = async (id, showSpinner = true) => {
    if (!id) return;
    try {
      if (showSpinner) setLoadingDetail(true);
      const detail = await getAdminCustomerTicketById(id);
      if (detail) {
        setSelectedTicket(detail);
      } else {
        const fallback = tickets.find((t) => t.ticketId === id);
        if (fallback) setSelectedTicket(fallback);
      }
    } catch (err) {
      console.warn(`Error loading customer ticket #${id} details:`, err?.message);
      const fallback = tickets.find((t) => t.ticketId === id);
      if (fallback) setSelectedTicket(fallback);
    } finally {
      if (showSpinner) setLoadingDetail(false);
    }
  };

  // Load buyers for dropdown
  useEffect(() => {
    getBuyers()
      .then((data) => {
        if (Array.isArray(data)) setBuyersList(data);
      })
      .catch(() => {});
  }, []);

  // Fetch on filter or page change
  useEffect(() => {
    fetchTickets();
  }, [statusFilter, categoryFilter, customerFilter, page]);

  // When selectedTicketId changes, fetch details
  useEffect(() => {
    if (selectedTicketId) {
      loadTicketDetail(selectedTicketId);
    } else {
      setSelectedTicket(null);
    }
  }, [selectedTicketId]);

  // Auto-polling every 10 seconds to refresh open conversations
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchTickets(true);
      if (selectedTicketId) {
        loadTicketDetail(selectedTicketId, false);
      }
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [selectedTicketId, statusFilter, categoryFilter, customerFilter, page]);

  // Scroll to bottom of message thread
  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [selectedTicket?.messages]);

  // Filtered tickets on frontend (search, priority)
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (t.ticketNumber || "").toLowerCase();
        const cust = (t.customerName || "").toLowerCase();
        const email = (t.customerEmail || "").toLowerCase();
        const subj = (t.subject || "").toLowerCase();
        const ord = String(t.orderId || "");
        const prod = (t.productTitle || "").toLowerCase();
        if (
          !num.includes(q) &&
          !cust.includes(q) &&
          !email.includes(q) &&
          !subj.includes(q) &&
          !ord.includes(q) &&
          !prod.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, priorityFilter, searchQuery]);

  // Stats computation
  const stats = useMemo(() => {
    const total = pagination.total || tickets.length;
    const open = tickets.filter((t) => t.status === "OPEN").length;
    const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
    const resolved = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;
    return { total, open, inProgress, resolved };
  }, [tickets, pagination]);

  // Handle status update
  const handleStatusChange = async (newStatus) => {
    if (!selectedTicket) return;
    try {
      await updateCustomerTicketStatus(selectedTicket.ticketId, {
        status: newStatus,
      });
      setSelectedTicket((prev) => ({ ...prev, status: newStatus }));
      setTickets((prev) =>
        prev.map((t) => (t.ticketId === selectedTicket.ticketId ? { ...t, status: newStatus } : t))
      );
      toast.success(`Ticket #${selectedTicket.ticketNumber} marked as ${newStatus}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to update status");
    }
  };

  // Handle priority update
  const handlePriorityChange = async (newPriority) => {
    if (!selectedTicket) return;
    try {
      await updateCustomerTicketStatus(selectedTicket.ticketId, {
        status: selectedTicket.status,
        priority: newPriority,
      });
      setSelectedTicket((prev) => ({ ...prev, priority: newPriority }));
      setTickets((prev) =>
        prev.map((t) => (t.ticketId === selectedTicket.ticketId ? { ...t, priority: newPriority } : t))
      );
      toast.success(`Priority updated to ${newPriority}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to update priority");
    }
  };

  // Handle Reply Submit
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!selectedTicket || !replyContent.trim()) {
      toast.error("Please enter a reply message before sending");
      return;
    }

    try {
      setSendingReply(true);
      const newMsg = await replyToCustomerTicket(selectedTicket.ticketId, {
        content: replyContent.trim(),
        attachmentUrl: attachmentUrl.trim() || null,
      });

      setSelectedTicket((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), newMsg],
      }));

      // Also update ticket in left queue list
      setTickets((prev) =>
        prev.map((t) =>
          t.ticketId === selectedTicket.ticketId
            ? { ...t, messages: [...(t.messages || []), newMsg], updatedAt: new Date().toISOString() }
            : t
        )
      );

      // Auto-scroll timeline to bottom
      setTimeout(() => {
        if (threadScrollRef.current) {
          threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
        }
      }, 50);

      if (autoResolveOnSend && selectedTicket.status !== "RESOLVED") {
        await handleStatusChange("RESOLVED");
      }

      setReplyContent("");
      setAttachmentUrl("");
      toast.success("Reply sent to customer as Support Agent");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  // Handle Create Ticket Submit
  const handleCreateTicketSubmit = async (e) => {
    e?.preventDefault();
    if (!createForm.subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!createForm.message.trim()) {
      toast.error("Initial message is required");
      return;
    }

    try {
      setCreatingTicket(true);
      const selectedBuyer = buyersList.find((b) => String(b.id || b.buyerId) === String(createForm.customerId));

      const newTicket = await createCustomerTicket({
        customerId: createForm.customerId || undefined,
        customerName: selectedBuyer?.name || createForm.customerName || "Customer",
        customerEmail: selectedBuyer?.email || createForm.customerEmail || "",
        subject: createForm.subject.trim(),
        category: createForm.category,
        priority: createForm.priority,
        orderId: createForm.orderId ? Number(createForm.orderId) : undefined,
        message: createForm.message.trim(),
      });

      toast.success(`Customer Support Ticket #${newTicket.ticketNumber || newTicket.ticketId} created successfully!`);
      setShowCreateModal(false);
      setCreateForm({
        customerId: "",
        customerName: "",
        customerEmail: "",
        subject: "",
        category: "PRODUCT_QUALITY",
        priority: "HIGH",
        orderId: "",
        message: "",
      });
      fetchTickets(true);
      if (newTicket.ticketId) {
        setSelectedTicketId(newTicket.ticketId);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to create customer ticket");
    } finally {
      setCreatingTicket(false);
    }
  };

  return (
    <div className="page-content tickets-container">
      {/* Support Desk Switcher (Seller vs Customer) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div className="support-desk-switcher">
          <Link
            to="/admin/seller-tickets"
            className="desk-switch-tab seller"
            title="Switch to Seller Support Desk"
          >
            <div className="desk-switch-icon-box seller">
              <Building2 size={16} />
            </div>
            <div className="desk-switch-text">
              <span className="desk-switch-title">Seller Support Desk</span>
              <span className="desk-switch-sub">Merchants & Payouts</span>
            </div>
            {sellerTicketsCount > 0 ? (
              <span className="desk-switch-badge seller">{sellerTicketsCount}</span>
            ) : null}
          </Link>

          <div className="desk-switch-tab customer active" title="Currently viewing Customer Support Desk">
            <div className="desk-switch-icon-box customer">
              <User size={16} />
            </div>
            <div className="desk-switch-text">
              <span className="desk-switch-title">Customer Support Desk</span>
              <span className="desk-switch-sub">Buyer Orders & Quality</span>
            </div>
            <span className="desk-switch-badge customer">{stats.total}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="btn-send-reply"
            style={{ padding: "8px 16px", borderRadius: "10px", background: "#2563eb" }}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} /> New Customer Ticket
          </button>

          <button
            className="btn-icon-refresh"
            onClick={() => fetchTickets(true)}
            disabled={refreshing}
            title="Refresh tickets"
          >
            <RefreshCw size={17} className={refreshing ? "spin-icon" : ""} />
          </button>
        </div>
      </div>

      {/* 1. Header & Title */}
      <div className="tickets-header-wrap" style={{ marginTop: "4px" }}>
        <div className="tickets-title-group">
          <h1>
            <LifeBuoy size={28} style={{ color: "#2563eb" }} />
            Customer Support Tickets
          </h1>
          <p>
            Track buyer disputes, product poor quality complaints, order delivery delays, and refund / return requests.
          </p>
        </div>
      </div>

      {/* 2. Stat Cards */}
      <div className="tickets-stat-grid">
        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>Total Tickets</h3>
            <div className="stat-number">{stats.total}</div>
          </div>
          <div className="ticket-stat-icon total">
            <MessageSquare size={22} />
          </div>
        </div>

        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>Open Tickets</h3>
            <div className="stat-number">{stats.open}</div>
          </div>
          <div className="ticket-stat-icon open">
            <AlertCircle size={22} />
          </div>
        </div>

        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>In Progress</h3>
            <div className="stat-number">{stats.inProgress}</div>
          </div>
          <div className="ticket-stat-icon progress">
            <Clock size={22} />
          </div>
        </div>

        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>Resolved / Closed</h3>
            <div className="stat-number">{stats.resolved}</div>
          </div>
          <div className="ticket-stat-icon resolved">
            <CheckCircle2 size={22} />
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="tickets-filter-card">
        {/* Status Tabs */}
        <div className="status-tabs-row">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`status-tab-btn ${statusFilter === tab.key ? "active" : ""}`}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
            >
              {tab.label}
              {tab.key !== "ALL" && (
                <span className="status-tab-count">
                  {tickets.filter((t) => t.status === tab.key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search & Dropdown Filters */}
        <div className="filter-controls-row">
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by ticket #, customer name, email, subject, product, or order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="dropdown-filters-group">
            {/* Category Filter */}
            <div className="select-filter-wrap">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
              >
                {CUSTOMER_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Filter */}
            <div className="select-filter-wrap">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Filter */}
            <div className="select-filter-wrap">
              <select
                value={customerFilter}
                onChange={(e) => {
                  setCustomerFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Customers</option>
                {buyersList.map((b) => (
                  <option key={b.id || b.buyerId} value={b.id || b.buyerId}>
                    {b.name || `Customer #${b.id || b.buyerId}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Split Two-Panel Workspace */}
      <div className="tickets-split-workspace">
        {/* Left Column: Ticket List */}
        <div className="tickets-list-panel">
          <div className="ticket-list-header">
            <span>CUSTOMER TICKETS QUEUE ({filteredTickets.length})</span>
            {loading && <span style={{ fontSize: "12px", color: "#64748b" }}>Loading...</span>}
          </div>

          <div className="ticket-cards-scroll">
            {filteredTickets.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
                <MessageSquare size={36} style={{ margin: "0 auto 10px", opacity: 0.5 }} />
                <p style={{ fontWeight: 600 }}>No customer support tickets found</p>
                <p style={{ fontSize: "12px", marginBottom: "14px" }}>
                  When buyers raise tickets for product quality or order issues, they will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    background: "#2563eb",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  <Plus size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                  Create Customer Ticket
                </button>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = selectedTicketId === ticket.ticketId;
                const statusClass = (ticket.status || "open").toLowerCase();
                const priorityClass = (ticket.priority || "medium").toLowerCase();
                const msgCount = ticket.messages?.length || 1;
                const isQualityIssue =
                  ticket.category === "PRODUCT_QUALITY" || ticket.category === "DAMAGED_ITEM";

                return (
                  <div
                    key={ticket.ticketId}
                    className={`ticket-card-item ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedTicketId(ticket.ticketId)}
                  >
                    <div className="ticket-card-top-row">
                      <span className="ticket-code-tag" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                        {ticket.ticketNumber}
                      </span>
                      <span className="ticket-time-ago">
                        {formatTimeAgo(ticket.updatedAt || ticket.createdAt, ticket.ticketId || ticket.ticketNumber)}
                      </span>
                    </div>

                    <div className="ticket-subject-title">{ticket.subject}</div>

                    <div className="ticket-seller-row">
                      <User size={13} style={{ color: "#2563eb" }} />
                      <span style={{ fontWeight: 600 }}>{ticket.customerName}</span>
                      {ticket.customerEmail && (
                        <span style={{ color: "#94a3b8", fontSize: "11px", marginLeft: "6px" }}>
                          ({ticket.customerEmail})
                        </span>
                      )}
                    </div>

                    <div className="ticket-badges-row">
                      <span className={`badge-status ${statusClass}`}>{ticket.status}</span>
                      <span className={`badge-priority ${priorityClass}`}>{ticket.priority}</span>
                      {isQualityIssue ? (
                        <span className="badge-customer-quality">{ticket.category}</span>
                      ) : (
                        <span className="badge-category">{ticket.category}</span>
                      )}
                      {ticket.orderId && (
                        <span className="badge-order">
                          <ShoppingCart size={11} />
                          #{ticket.orderId}
                        </span>
                      )}
                      {ticket.productTitle && (
                        <span className="badge-category" title={ticket.productTitle} style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Package size={11} /> {ticket.productTitle}
                        </span>
                      )}
                      <span className="badge-msg-count">
                        <MessageSquare size={12} />
                        {msgCount}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {pagination.totalPages > 1 && (
            <div className="tickets-pagination-bar">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="pagination-nav-btns">
                <button
                  className="page-btn"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="page-btn"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Ticket Conversation Workspace */}
        <div className="ticket-detail-panel">
          {!selectedTicket ? (
            <div className="ticket-detail-empty">
              <LifeBuoy size={48} style={{ color: "#cbd5e1" }} />
              <h3>Select a customer ticket from the queue</h3>
              <p>
                Click any ticket on the left to view customer complaint history, order details, poor quality dispute notes, and reply as Support Agent.
              </p>
            </div>
          ) : (
            <>
              {/* Detail Top Bar */}
              <div className="ticket-detail-topbar">
                <div className="topbar-header-row">
                  <div className="topbar-title-wrap">
                    <h2>{selectedTicket.subject}</h2>
                    <div className="topbar-meta-chips">
                      <span className="ticket-code-tag" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                        {selectedTicket.ticketNumber}
                      </span>
                      <span className={`badge-status ${(selectedTicket.status || "").toLowerCase()}`}>
                        {selectedTicket.status}
                      </span>
                      <span className={`badge-priority ${(selectedTicket.priority || "").toLowerCase()}`}>
                        {selectedTicket.priority}
                      </span>
                      <span className="badge-category">{selectedTicket.category}</span>
                    </div>
                  </div>

                  <div className="topbar-actions-wrap">
                    {/* Status Changer */}
                    <div className="status-change-dropdown">
                      <span>Status:</span>
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>

                    {/* Priority Changer */}
                    <div className="status-change-dropdown priority-change-dropdown">
                      <span>Priority:</span>
                      <select
                        value={selectedTicket.priority}
                        onChange={(e) => handlePriorityChange(e.target.value)}
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="URGENT">URGENT</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Profile & Linked Details Strip */}
              <div className="seller-info-strip" style={{ background: "#f8fafc" }}>
                <div className="seller-profile-mini">
                  <div className="seller-avatar-badge" style={{ background: "#2563eb", color: "#ffffff" }}>
                    {(selectedTicket.customerName || "C").charAt(0).toUpperCase()}
                  </div>
                  <div className="seller-details-text">
                    <strong>{selectedTicket.customerName}</strong>
                    <span>
                      Customer ID: #{selectedTicket.customerId || "—"}
                      {selectedTicket.customerEmail && ` • ${selectedTicket.customerEmail}`}
                      {selectedTicket.customerPhone && ` • ${selectedTicket.customerPhone}`}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  {selectedTicket.orderId && (
                    <a
                      href={`/admin/orders/${selectedTicket.orderId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="order-link-btn"
                    >
                      <ShoppingCart size={13} />
                      Order #{selectedTicket.orderId}
                      <ExternalLink size={12} />
                    </a>
                  )}

                  {selectedTicket.productId && (
                    <div
                      className="order-link-btn"
                      style={{ background: "#fee2e2", color: "#b91c1c", borderColor: "#fecaca" }}
                    >
                      <Package size={13} />
                      Product #{selectedTicket.productId}
                    </div>
                  )}
                </div>
              </div>

              {/* Thread Timeline */}
              <div className="ticket-thread-scroll" ref={threadScrollRef}>
                {loadingDetail ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    Loading customer conversation thread...
                  </div>
                ) : (selectedTicket.messages || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    No messages in this ticket yet.
                  </div>
                ) : (
                  (selectedTicket.messages || []).map((msg, idx) => {
                    const isAgent = msg.senderRole === "SUPPORT_AGENT" || msg.senderRole === "ADMIN";
                    return (
                      <div
                        key={msg.messageId || idx}
                        className={`message-bubble-row ${isAgent ? "agent-msg" : "seller-msg"}`}
                      >
                        <div className="message-meta-header">
                          <span
                            className={`sender-role-pill ${isAgent ? "agent" : "seller"}`}
                            style={!isAgent ? { background: "#dbeafe", color: "#1d4ed8" } : {}}
                          >
                            {isAgent ? "Support Agent" : "Customer"}
                          </span>
                          <span className="sender-name-text">{msg.senderName}</span>
                          <span className="message-time-text">
                            {parseTicketDate(msg.timestamp, msg.messageId).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <div className="message-bubble-card">
                          <div>{msg.content}</div>

                          {msg.attachmentUrl && (
                            <div className="message-attachment-box">
                              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Paperclip size={14} /> Attachment
                              </span>
                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer">
                                View File <ExternalLink size={12} />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Composer */}
              <form className="ticket-reply-composer" onSubmit={handleSendReply}>
                {/* Canned Quick Customer Templates */}
                <div className="canned-templates-bar">
                  <span>Quick Responses:</span>
                  {CANNED_CUSTOMER_RESPONSES.map((cr, i) => (
                    <button
                      key={i}
                      type="button"
                      className="canned-chip-btn"
                      onClick={() => setReplyContent(cr.text)}
                    >
                      <Sparkles size={11} /> {cr.label}
                    </button>
                  ))}
                </div>

                <div className="reply-textarea-wrap">
                  <textarea
                    placeholder="Type your official response to this customer as HinchMart Support Agent..."
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="reply-bottom-controls">
                  <div className="attachment-input-pill">
                    <Paperclip size={15} style={{ color: "#64748b" }} />
                    <input
                      type="url"
                      placeholder="Attachment URL (Image proof, return invoice, inspection doc)..."
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                    />
                  </div>

                  <div className="reply-action-buttons">
                    <label className="quick-resolve-checkbox">
                      <input
                        type="checkbox"
                        checked={autoResolveOnSend}
                        onChange={(e) => setAutoResolveOnSend(e.target.checked)}
                      />
                      <span>Mark ticket as RESOLVED after reply</span>
                    </label>

                    <button
                      type="submit"
                      className="btn-send-reply"
                      style={{ background: "#2563eb" }}
                      disabled={sendingReply || !replyContent.trim()}
                    >
                      {sendingReply ? (
                        <>
                          <RefreshCw size={15} className="spin-icon" /> Sending...
                        </>
                      ) : (
                        <>
                          <Send size={15} /> Send Reply to Customer
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* 5. Create Customer Ticket Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "560px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fcfcfd",
              }}
            >
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <LifeBuoy size={20} color="#2563eb" /> Create Customer Support Ticket
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: "transparent", color: "#64748b", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                  Customer / Buyer
                </label>
                <select
                  value={createForm.customerId}
                  onChange={(e) => setCreateForm({ ...createForm, customerId: e.target.value })}
                  style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                >
                  <option value="">Select an existing customer (or enter name below)...</option>
                  {buyersList.map((b) => (
                    <option key={b.id || b.buyerId} value={b.id || b.buyerId}>
                      {b.name || `Customer #${b.id || b.buyerId}`} {b.email ? `(${b.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {!createForm.customerId && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                      Customer Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={createForm.customerName}
                      onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                      style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                      Customer Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. customer@example.com"
                      value={createForm.customerEmail}
                      onChange={(e) => setCreateForm({ ...createForm, customerEmail: e.target.value })}
                      style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                  Subject / Complaint Summary *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received poor quality fabric & color mismatch"
                  value={createForm.subject}
                  onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                  style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                    Category
                  </label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  >
                    {CUSTOMER_CATEGORIES.filter((c) => c.value !== "ALL").map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                    Priority
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                    style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                  >
                    {PRIORITIES.filter((p) => p.value !== "ALL").map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                  Related Order ID (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 10452"
                  value={createForm.orderId}
                  onChange={(e) => setCreateForm({ ...createForm, orderId: e.target.value })}
                  style={{ width: "100%", height: "40px", padding: "0 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "6px" }}>
                  Issue Description *
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed description of the customer issue or poor quality complaint..."
                  value={createForm.message}
                  onChange={(e) => setCreateForm({ ...createForm, message: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", resize: "vertical" }}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", fontWeight: 600, fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="btn-send-reply"
                  style={{ padding: "9px 20px", borderRadius: "8px", background: "#2563eb" }}
                >
                  {creatingTicket ? "Creating..." : "Submit Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
