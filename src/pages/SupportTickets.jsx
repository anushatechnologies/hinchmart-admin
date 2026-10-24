import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import {
  LifeBuoy,
  Search,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  User,
  Building2,
  ShoppingCart,
  Sparkles,
  Paperclip,
  Radio,
  X,
  Mail,
  Phone,
} from "lucide-react";
import {
  getTickets,
  getTicketDetails,
  replyToTicket,
  updateTicketStatus,
  saveStoredTickets,
  getStoredTickets,
} from "../api/ticketApi";
import { getBuyerById } from "../api/buyerApi";
import { getOrderById } from "../api/orderApi";
import { formatTimeAgo, parseTicketDate, formatTicketDate, formatTicketTime } from "../utils/dateUtils";
import { useToast } from "../components/ToastContext";
import "../styles/sellerTickets.css";

// Quick templates for fast support desk resolutions

const CANNED_RESPONSES = [
  {
    label: "Quality Team Reviewing",
    text: "We sincerely apologize for the quality issue. Our inspection desk has escalated this with the vendor. We are initiating a free exchange or refund immediately.",
  },
  {
    label: "Replacement Dispatched",
    text: "A replacement shipment has been generated and dispatched under expedited priority tracking. We will update you with the courier tracking ID shortly.",
  },
  {
    label: "Photos Requested",
    text: "Thank you for contacting HinchMart Support. Could you please share clear photos of the defect and the packaging barcode so we can process your claim quickly?",
  },
  {
    label: "Refund Approved",
    text: "Your refund request has been verified and processed back to your original payment method. The credit should reflect within 2 to 4 business days.",
  },
];

const STATUS_TABS = [
  { key: "ALL", label: "All Tickets" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
];

const PRIORITIES = [
  { value: "ALL", label: "All Priorities" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export default function SupportTickets() {
  const toast = useToast();
  const { id: routeTicketId } = useParams();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  // Polling State
  const [pollCountdown, setPollCountdown] = useState(10);
  const [isPollingActive, setIsPollingActive] = useState(true);

  // Reply Composer
  const [replyContent, setReplyContent] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [autoResolveOnSend, setAutoResolveOnSend] = useState(false);

  // Status Change Dialog / Note
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const threadScrollRef = useRef(null);

  // Clear any legacy dummy mock cache on mount
  useEffect(() => {
    try {
      const stored = getStoredTickets();
      // Remove any dummy tickets that were seeded locally
      const cleaned = stored.filter(
        (t) => !(t.ticketNumber === "TKT-1792128600970" && t.userEmail === "sravan@example.com" && t._isSeed)
      );
      saveStoredTickets(cleaned);
    } catch {}
  }, []);

  // Fetch ticket list from backend API
  const fetchTicketList = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const params = {
        status: statusFilter,
        priority: priorityFilter,
        search: searchQuery.trim() || undefined,
        page,
        size: 50,
      };

      const res = await getTickets(params);
      const list = res?.data || [];
      setTickets(list);

      // Select initial ticket if none selected
      setSelectedTicketId((prev) => {
        if (routeTicketId) {
          const match = list.find(
            (t) => String(t.ticketId) === String(routeTicketId) || t.ticketNumber === routeTicketId
          );
          if (match) return match.ticketId;
        }
        if (prev && list.some((t) => String(t.ticketId) === String(prev))) {
          return prev;
        }
        return list.length > 0 ? list[0].ticketId : null;
      });
    } catch (err) {
      console.error("Failed to load tickets:", err);
      if (!silent) toast.error("Failed to fetch tickets from server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, priorityFilter, searchQuery, page, routeTicketId, toast]);

  // Load selected ticket details
  const loadActiveTicketDetail = useCallback(async (ticketId, silent = false) => {
    if (!ticketId) return;
    try {
      if (!silent) setLoadingDetail(true);
      const detail = await getTicketDetails(ticketId);
      if (detail && detail.messages && detail.messages.length > 0) {
        setSelectedTicket(detail);
      } else {
        const fallback =
          tickets.find((t) => String(t.ticketId) === String(ticketId) || t.ticketNumber === ticketId) ||
          getStoredTickets().find((t) => String(t.ticketId) === String(ticketId) || t.ticketNumber === ticketId);
        if (fallback) setSelectedTicket(fallback);
      }
    } catch (err) {
      console.warn("Notice loading ticket details:", err);
      const fallback =
        tickets.find((t) => String(t.ticketId) === String(ticketId) || t.ticketNumber === ticketId) ||
        getStoredTickets().find((t) => String(t.ticketId) === String(ticketId) || t.ticketNumber === ticketId);
      if (fallback) setSelectedTicket(fallback);
    } finally {
      setLoadingDetail(false);
    }
  }, [tickets]);

  // Initial load
  useEffect(() => {
    fetchTicketList(false);
  }, [fetchTicketList]);

  // Load details whenever selectedTicketId changes
  useEffect(() => {
    if (selectedTicketId) {
      const match =
        tickets.find((t) => String(t.ticketId) === String(selectedTicketId) || t.ticketNumber === selectedTicketId) ||
        getStoredTickets().find((t) => String(t.ticketId) === String(selectedTicketId) || t.ticketNumber === selectedTicketId);

      if (match) {
        setSelectedTicket(match);
      }
      loadActiveTicketDetail(selectedTicketId, !!match);
    } else {
      setSelectedTicket(null);
    }
  }, [selectedTicketId]);

  // Enrich customer contact details (email/phone) from live Buyer or Order APIs if missing from HelpTickets DTO
  useEffect(() => {
    if (!selectedTicket) return;
    const hasEmail = Boolean(selectedTicket.userEmail && selectedTicket.userEmail.includes("@"));
    const hasPhone = Boolean(selectedTicket.userPhone && selectedTicket.userPhone.length >= 6);

    // If both are already present, no need to enrich
    if (hasEmail && hasPhone) return;

    let isCancelled = false;

    const enrichCustomerInfo = async () => {
      let enrichedName = selectedTicket.userName;
      let enrichedEmail = selectedTicket.userEmail;
      let enrichedPhone = selectedTicket.userPhone;

      // 1. Try querying Customer profile if userId is available
      if (selectedTicket.userId) {
        try {
          const buyer = await getBuyerById(selectedTicket.userId);
          if (buyer && !isCancelled) {
            if (!enrichedName || enrichedName.startsWith("Customer #")) {
              enrichedName = buyer.name || buyer.fullName || buyer.customerName || enrichedName;
            }
            if (!enrichedEmail) {
              enrichedEmail = buyer.email || buyer.userEmail || buyer.customerEmail || "";
            }
            if (!enrichedPhone) {
              enrichedPhone =
                buyer.phone ||
                buyer.phoneNumber ||
                buyer.mobile ||
                buyer.mobileNumber ||
                buyer.contactNumber ||
                "";
            }
          }
        } catch (err) {
          console.warn("Could not enrich customer profile via buyer API:", err?.message);
        }
      }

      // 2. Try querying Order details if orderId is available and contact info is still missing
      if ((!enrichedEmail || !enrichedPhone) && selectedTicket.orderId) {
        try {
          const order = await getOrderById(selectedTicket.orderId);
          if (order && !isCancelled) {
            if (!enrichedName || enrichedName.startsWith("Customer #")) {
              enrichedName =
                order.customerName ||
                order.buyerName ||
                order.buyer?.name ||
                order.recipientName ||
                enrichedName;
            }
            if (!enrichedEmail) {
              enrichedEmail =
                order.customerEmail ||
                order.buyerEmail ||
                order.buyer?.email ||
                "";
            }
            if (!enrichedPhone) {
              enrichedPhone =
                order.customerPhone ||
                order.recipientPhone ||
                order.buyerPhone ||
                order.buyer?.phone ||
                "";
            }
          }
        } catch (err) {
          console.warn("Could not enrich customer contact via order API:", err?.message);
        }
      }

      if (isCancelled) return;

      // If we found any new info, update both selectedTicket and the ticket list
      if (
        enrichedEmail !== selectedTicket.userEmail ||
        enrichedPhone !== selectedTicket.userPhone ||
        enrichedName !== selectedTicket.userName
      ) {
        setSelectedTicket((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            userName: enrichedName || prev.userName,
            userEmail: enrichedEmail || prev.userEmail,
            userPhone: enrichedPhone || prev.userPhone,
          };
        });

        setTickets((prevList) =>
          prevList.map((t) => {
            if (String(t.ticketId) === String(selectedTicket.ticketId)) {
              return {
                ...t,
                userName: enrichedName || t.userName,
                userEmail: enrichedEmail || t.userEmail,
                userPhone: enrichedPhone || t.userPhone,
              };
            }
            return t;
          })
        );
      }
    };

    enrichCustomerInfo();

    return () => {
      isCancelled = true;
    };
  }, [selectedTicket?.ticketId, selectedTicket?.userId, selectedTicket?.orderId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (threadScrollRef.current) {
      threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
    }
  }, [selectedTicket?.messages]);

  // 10-Second Auto-Polling for active conversation and ticket updates
  useEffect(() => {
    if (!isPollingActive) return;

    const interval = setInterval(() => {
      setPollCountdown((prev) => {
        if (prev <= 1) {
          fetchTicketList(true);
          if (selectedTicketId) {
            loadActiveTicketDetail(selectedTicketId, true);
          }
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPollingActive, fetchTicketList, selectedTicketId, loadActiveTicketDetail]);

  // Frontend filter for search responsiveness
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (t.ticketNumber || "").toLowerCase();
        const user = (t.userName || "").toLowerCase();
        const email = (t.userEmail || "").toLowerCase();
        const subj = (t.subject || "").toLowerCase();
        const ord = String(t.orderId || "");
        const lastMsg = (t.lastMessage || "").toLowerCase();

        return (
          num.includes(q) ||
          user.includes(q) ||
          email.includes(q) ||
          subj.includes(q) ||
          ord.includes(q) ||
          lastMsg.includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, searchQuery]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "OPEN").length;
    const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
    const resolved = tickets.filter(
      (t) => t.status === "RESOLVED" || t.status === "CLOSED"
    ).length;
    return { total, open, inProgress, resolved };
  }, [tickets]);

  // Send admin reply
  const handleSendReply = async (e) => {
    e?.preventDefault();
    if (!selectedTicket || !replyContent.trim()) {
      toast.error("Please enter a reply message before sending.");
      return;
    }

    try {
      setSendingReply(true);
      const newMsg = await replyToTicket(selectedTicket.ticketId, replyContent.trim());

      setSelectedTicket((prev) => ({
        ...prev,
        status: prev.status === "OPEN" ? "IN_PROGRESS" : prev.status,
        lastMessage: replyContent.trim(),
        lastMessageAt: new Date().toISOString(),
        messages: [...(prev?.messages || []), newMsg],
      }));

      // Update in ticket list
      setTickets((prev) =>
        prev.map((t) =>
          String(t.ticketId) === String(selectedTicket.ticketId)
            ? {
                ...t,
                status: t.status === "OPEN" ? "IN_PROGRESS" : t.status,
                lastMessage: replyContent.trim(),
                lastMessageAt: new Date().toISOString(),
                messages: [...(t?.messages || []), newMsg],
              }
            : t
        )
      );

      // Auto resolve if toggled
      if (autoResolveOnSend && selectedTicket.status !== "RESOLVED") {
        await updateTicketStatus(selectedTicket.ticketId, "RESOLVED", "Auto-resolved upon admin reply.");
        setSelectedTicket((prev) => ({ ...prev, status: "RESOLVED" }));
        setTickets((prev) =>
          prev.map((t) =>
            String(t.ticketId) === String(selectedTicket.ticketId)
              ? { ...t, status: "RESOLVED" }
              : t
          )
        );
      }

      setReplyContent("");
      toast.success("Reply dispatched to customer as HinchMart Support Desk.");

      setTimeout(() => {
        if (threadScrollRef.current) {
          threadScrollRef.current.scrollTop = threadScrollRef.current.scrollHeight;
        }
      }, 50);
    } catch (err) {
      toast.error(err?.message || "Failed to dispatch reply.");
    } finally {
      setSendingReply(false);
    }
  };

  // Open modal for status update with optional resolution note
  const promptStatusChange = (newStatus) => {
    if (!selectedTicket) return;
    setTargetStatus(newStatus);
    if (newStatus === "RESOLVED" || newStatus === "CLOSED") {
      setShowStatusModal(true);
    } else {
      executeStatusUpdate(newStatus, "");
    }
  };

  const executeStatusUpdate = async (status, note) => {
    if (!selectedTicket) return;
    try {
      setUpdatingStatus(true);
      await updateTicketStatus(selectedTicket.ticketId, status, note);

      setSelectedTicket((prev) => ({ ...prev, status, resolutionNote: note }));
      setTickets((prev) =>
        prev.map((t) =>
          String(t.ticketId) === String(selectedTicket.ticketId)
            ? { ...t, status, resolutionNote: note }
            : t
        )
      );

      setShowStatusModal(false);
      setResolutionNote("");
      toast.success(`Ticket marked as ${status}`);
    } catch (err) {
      toast.error(err?.message || "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="page-content tickets-container">
      {/* 1. Support Desk Switcher (Seller vs Customer) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "4px" }}>
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
          </Link>

          <div className="desk-switch-tab customer active" title="Currently viewing Customer Support Desk">
            <div className="desk-switch-icon-box customer">
              <User size={16} />
            </div>
            <div className="desk-switch-text">
              <span className="desk-switch-title">Customer Support Desk</span>
              <span className="desk-switch-sub">Buyer Orders & Quality</span>
            </div>
            <span className="desk-switch-badge customer">{tickets.length}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              fontSize: "12px",
              fontWeight: 600,
              color: "#475569",
            }}
          >
            <Radio
              size={14}
              style={{ color: isPollingActive ? "#10b981" : "#94a3b8" }}
            />
            <span>Auto-poll: {pollCountdown}s</span>
            <button
              onClick={() => setIsPollingActive(!isPollingActive)}
              style={{ fontSize: "11px", color: "#2563eb", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", marginLeft: "4px" }}
            >
              {isPollingActive ? "Pause" : "Resume"}
            </button>
          </div>

          <button
            onClick={() => fetchTicketList(false)}
            className="btn-icon-refresh"
            title="Refresh tickets"
            disabled={loading || refreshing}
          >
            <RefreshCw size={17} className={refreshing ? "spin-icon" : ""} />
          </button>
        </div>
      </div>

      {/* 2. Top Header Title */}
      <div className="tickets-header-wrap" style={{ marginTop: "4px" }}>
        <div className="tickets-title-group">
          <h1>
            <LifeBuoy size={28} style={{ color: "#2563eb" }} />
            Customer Support Tickets
          </h1>
          <p>
            Review buyer tickets, inspect customer orders, and reply as official HinchMart Support Desk.
          </p>
        </div>
      </div>

      {/* 3. Summary Metric Cards */}
      <div className="tickets-stat-grid">
        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>Total Tickets</h3>
            <div className="stat-number">{metrics.total}</div>
          </div>
          <div className="ticket-stat-icon total">
            <LifeBuoy size={22} />
          </div>
        </div>

        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>Open Tickets</h3>
            <div className="stat-number text-amber-600">{metrics.open}</div>
          </div>
          <div className="ticket-stat-icon open">
            <Clock size={22} />
          </div>
        </div>

        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>In Progress</h3>
            <div className="stat-number text-purple-600">{metrics.inProgress}</div>
          </div>
          <div className="ticket-stat-icon progress">
            <AlertCircle size={22} />
          </div>
        </div>

        <div className="ticket-stat-card">
          <div className="ticket-stat-info">
            <h3>Resolved</h3>
            <div className="stat-number text-emerald-600">{metrics.resolved}</div>
          </div>
          <div className="ticket-stat-icon resolved">
            <CheckCircle2 size={22} />
          </div>
        </div>
      </div>

      {/* 4. Filter and Search Bar */}
      <div className="tickets-filter-card">
        {/* Status Tabs */}
        <div className="status-tabs-row">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.key === "ALL"
                ? tickets.length
                : tickets.filter((t) => t.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`status-tab-btn ${statusFilter === tab.key ? "active" : ""}`}
              >
                <span>{tab.label}</span>
                <span className="status-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Priority Controls */}
        <div className="filter-controls-row">
          <div className="search-input-wrap">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by Ticket #, Subject, Customer Name, Email, or Order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="dropdown-filters-group">
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
          </div>
        </div>
      </div>

      {/* 5. Split-Screen Workspace */}
      <div className="tickets-split-workspace">
        {/* Left Panel: Ticket List */}
        <div className="tickets-list-panel">
          <div className="ticket-list-header">
            <span>Customer Inquiries ({filteredTickets.length})</span>
            {refreshing && <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>Updating...</span>}
          </div>

          <div className="ticket-cards-scroll">
            {loading && tickets.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                <RefreshCw size={24} className="spin-icon" style={{ margin: "0 auto 8px", color: "#2563eb" }} />
                <p>Loading tickets...</p>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                <LifeBuoy size={32} style={{ margin: "0 auto 8px", color: "#cbd5e1" }} />
                <p style={{ fontWeight: 600, color: "#475569" }}>No tickets found</p>
                <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>Try adjusting your filters or search query.</p>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected =
                  String(ticket.ticketId) === String(selectedTicketId) ||
                  ticket.ticketNumber === selectedTicketId;

                const statusClass = (ticket.status || "OPEN").toLowerCase().replace("-", "_");
                const priorityClass = (ticket.priority || "MEDIUM").toLowerCase();
                const msgCount = (ticket.messages || []).length || 1;

                return (
                  <div
                    key={ticket.ticketId || ticket.ticketNumber}
                    onClick={() => setSelectedTicketId(ticket.ticketId)}
                    className={`ticket-card-item ${isSelected ? "selected" : ""}`}
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
                      <span style={{ fontWeight: 600 }}>{ticket.userName}</span>
                      {ticket.orderId && (
                        <span className="badge-order" style={{ marginLeft: "4px" }}>
                          <ShoppingCart size={11} /> #{ticket.orderId}
                        </span>
                      )}
                    </div>

                    {(ticket.userEmail || ticket.userPhone) && (
                      <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticket.userEmail && <span>{ticket.userEmail}</span>}
                        {ticket.userEmail && ticket.userPhone && <span style={{ color: "#cbd5e1" }}>•</span>}
                        {ticket.userPhone && <span>{ticket.userPhone}</span>}
                      </div>
                    )}

                    {ticket.lastMessage && (
                      <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        "{ticket.lastMessage}"
                      </div>
                    )}

                    <div className="ticket-badges-row">
                      <span className={`badge-status ${statusClass}`}>{ticket.status}</span>
                      <span className={`badge-priority ${priorityClass}`}>{ticket.priority}</span>
                      {ticket.category && (
                        <span className="badge-category">{ticket.category}</span>
                      )}
                      <span className="badge-msg-count" style={{ marginLeft: "auto" }}>
                        <MessageSquare size={12} />
                        {msgCount}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Selected Ticket Conversation & Resolution */}
        <div className="ticket-detail-panel">
          {!selectedTicket ? (
            <div className="ticket-detail-empty">
              <LifeBuoy size={48} style={{ color: "#cbd5e1" }} />
              <h3>No Ticket Selected</h3>
              <p>Select a customer ticket from the list to review the thread and send official replies.</p>
            </div>
          ) : (
            <>
              {/* Detail Top Bar */}
              <div className="ticket-detail-topbar">
                <div className="topbar-header-row">
                  <div className="topbar-title-wrap">
                    <h2>{selectedTicket.subject}</h2>
                    <div className="topbar-meta-chips">
                      <span className="font-mono text-xs font-bold" style={{ background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: "6px" }}>
                        {selectedTicket.ticketNumber}
                      </span>
                      <span
                        className={`badge-status ${(selectedTicket.status || "OPEN")
                          .toLowerCase()
                          .replace("-", "_")}`}
                      >
                        {selectedTicket.status}
                      </span>
                      <span
                        className={`badge-priority ${(selectedTicket.priority || "MEDIUM").toLowerCase()}`}
                      >
                        {selectedTicket.priority} Priority
                      </span>
                      {selectedTicket.category && (
                        <span className="badge-category">{selectedTicket.category}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions / Status Dropdown */}
                  <div className="topbar-actions-wrap">
                    <div className="status-change-dropdown">
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Status:</span>
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => promptStatusChange(e.target.value)}
                        disabled={updatingStatus}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer & Order Metadata Strip */}
              <div className="seller-info-strip">
                <div className="seller-profile-mini">
                  <div className="seller-avatar-badge" style={{ background: "#2563eb" }}>
                    {(selectedTicket.userName || "C").charAt(0).toUpperCase()}
                  </div>
                  <div className="seller-details-text">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <strong>{selectedTicket.userName}</strong>
                      {selectedTicket.userId && (
                        <span style={{ background: "#e2e8f0", color: "#475569", fontSize: "11px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px" }}>
                          ID: #{selectedTicket.userId}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "2px", fontSize: "12px" }}>
                      {selectedTicket.userEmail ? (
                        <a
                          href={`mailto:${selectedTicket.userEmail}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            color: "#2563eb",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                          title="Click to email customer"
                        >
                          <Mail size={13} />
                          <span>{selectedTicket.userEmail}</span>
                        </a>
                      ) : (
                        <span style={{ color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Mail size={13} />
                          <span>No email recorded</span>
                        </span>
                      )}

                      <span style={{ color: "#cbd5e1" }}>•</span>

                      {selectedTicket.userPhone ? (
                        <a
                          href={`tel:${selectedTicket.userPhone}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            color: "#16a34a",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                          title="Click to call customer"
                        >
                          <Phone size={13} />
                          <span>{selectedTicket.userPhone}</span>
                        </a>
                      ) : (
                        <span style={{ color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Phone size={13} />
                          <span>No phone recorded</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {selectedTicket.orderId && (
                    <Link
                      to={`/admin/orders/${selectedTicket.orderId}`}
                      className="order-link-btn"
                    >
                      <ShoppingCart size={13} />
                      <span>View Order #{selectedTicket.orderId}</span>
                      <ExternalLink size={11} />
                    </Link>
                  )}

                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Raised: {formatTicketDate(selectedTicket.createdAt, selectedTicket.ticketId)} {formatTicketTime(selectedTicket.createdAt, selectedTicket.ticketId)}
                  </span>
                </div>
              </div>

              {/* Conversation Thread Timeline */}
              <div className="ticket-thread-scroll" ref={threadScrollRef}>
                {(!selectedTicket.messages || selectedTicket.messages.length === 0) && loadingDetail ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    <RefreshCw size={24} className="spin-icon" style={{ margin: "0 auto 8px", color: "#2563eb" }} />
                    <p>Loading conversation history...</p>
                  </div>
                ) : !selectedTicket.messages || selectedTicket.messages.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    <MessageSquare size={32} style={{ margin: "0 auto 8px", color: "#cbd5e1" }} />
                    <p style={{ fontWeight: 600, color: "#475569" }}>No messages in this ticket yet</p>
                    <p style={{ fontSize: "12px", color: "#94a3b8" }}>Send an initial message below to reach out to the customer.</p>
                  </div>
                ) : (
                  selectedTicket.messages.map((msg, idx) => {
                    const isAdmin =
                      msg.senderRole === "ADMIN" ||
                      msg.senderType === "ADMIN" ||
                      msg.senderRole === "SUPPORT" ||
                      msg.senderRole === "SUPPORT_AGENT";

                    return (
                      <div
                        key={msg.id || msg.messageId || idx}
                        className={`message-bubble-row ${isAdmin ? "agent-msg" : "seller-msg"}`}
                      >
                        <div className="message-meta-header">
                          <span
                            className={`sender-role-pill ${isAdmin ? "agent" : "seller"}`}
                            style={!isAdmin ? { background: "#dbeafe", color: "#1d4ed8" } : {}}
                          >
                            {isAdmin ? "HinchMart Support Desk" : "Customer"}
                          </span>
                          <span className="sender-name-text">
                            {isAdmin ? "Official Support" : msg.senderName || selectedTicket.userName}
                          </span>
                          <span className="message-time-text">
                            {formatTicketDate(msg.createdAt, msg.id || msg.messageId)} {formatTicketTime(msg.createdAt, msg.id || msg.messageId)}
                          </span>
                        </div>

                        <div className="message-bubble-card">
                          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{msg.content}</p>
                          {msg.attachmentUrl && (
                            <div className="message-attachment-box">
                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer">
                                View Attachment <ExternalLink size={12} />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Composer Box */}
              <form onSubmit={handleSendReply} className="ticket-reply-composer">
                {/* Quick Canned Responses */}
                <div className="canned-templates-bar">
                  <span>Quick Responses:</span>
                  {CANNED_RESPONSES.map((cr, idx) => (
                    <button
                      key={idx}
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
                    rows={4}
                    placeholder="Type an official reply to the customer as HinchMart Support Desk..."
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    disabled={sendingReply}
                  />
                </div>

                <div className="reply-bottom-controls">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#64748b", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={autoResolveOnSend}
                      onChange={(e) => setAutoResolveOnSend(e.target.checked)}
                    />
                    Mark ticket as RESOLVED upon sending reply
                  </label>

                  <button
                    type="submit"
                    className="btn-send-reply"
                    disabled={sendingReply || !replyContent.trim()}
                  >
                    <Send size={15} />
                    <span>{sendingReply ? "Sending..." : "Send Official Reply"}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Resolution Note Modal */}
      {showStatusModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "16px" }}>
          <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "460px", width: "100%", padding: "24px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
                Mark Ticket as {targetStatus}
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "12px" }}>
              Add an optional resolution note or closing remark for the internal support record:
            </p>

            <textarea
              rows={3}
              style={{ width: "100%", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "10px", fontSize: "13px", marginBottom: "16px", resize: "vertical" }}
              placeholder="e.g. Replacement order initiated with vendor or refund settled to customer wallet..."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: "8px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => executeStatusUpdate(targetStatus, resolutionNote)}
                disabled={updatingStatus}
                className="btn-send-reply"
                style={{ background: "#059669" }}
              >
                {updatingStatus ? "Saving..." : `Confirm ${targetStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
