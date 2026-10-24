import api from "./axios";

const STORAGE_KEY_TICKETS = "hinchmart_support_tickets_v1";

/**
 * Local cache fallback helpers for support tickets
 */
export const getStoredTickets = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TICKETS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveStoredTickets = (tickets) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_TICKETS, JSON.stringify(tickets));
  } catch {}
};

/**
 * Normalizes a ticket message object for UI rendering
 */
export const normalizeTicketMessage = (msg = {}, fallbackTicketId = null) => {
  const role = (
    msg.senderRole ||
    msg.sender_role ||
    msg.senderType ||
    msg.sender_type ||
    "USER"
  ).toUpperCase();

  const isAdmin =
    role === "ADMIN" ||
    role === "SUPPORT" ||
    role === "SUPPORT_AGENT" ||
    role === "STAFF";

  return {
    id: msg.id ?? msg.messageId ?? Date.now(),
    messageId: msg.messageId ?? msg.id ?? Date.now(),
    ticketId: msg.ticketId ?? fallbackTicketId,
    senderId: msg.senderId ?? msg.sender_id ?? msg.userId ?? null,
    senderRole: isAdmin ? "ADMIN" : "USER",
    senderType: isAdmin ? "ADMIN" : "CUSTOMER",
    senderName:
      msg.senderName ||
      msg.sender_name ||
      (isAdmin ? "HinchMart Support Desk" : msg.userName || "Customer"),
    content: msg.content || msg.message || "",
    attachmentUrl: msg.attachmentUrl || msg.attachment_url || null,
    createdAt:
      msg.createdAt ||
      msg.created_at ||
      msg.timestamp ||
      new Date().toISOString(),
  };
};

/**
 * Normalizes a support ticket object for uniform usage
 */
export const normalizeTicket = (ticket = {}) => {
  const id = ticket.ticketId ?? ticket.id;
  const messagesRaw = Array.isArray(ticket.messages)
    ? ticket.messages
    : Array.isArray(ticket.thread)
    ? ticket.thread
    : [];

  const rawTicketNum =
    ticket.ticketNumber ||
    ticket.ticket_number ||
    (id ? `TKT-${id}` : "TKT-—");

  const uId = ticket.userId ?? ticket.user_id ?? ticket.customerId ?? ticket.customer_id ?? null;
  const oId = ticket.orderId ?? ticket.order_id ?? null;
  
  // Try to enrich from locally cached customer records or orders if backend didn't join tables
  let cachedCust = null;
  if (typeof window !== "undefined") {
    try {
      // 1. Check cached customer list
      const rawB = localStorage.getItem("hinchmart_cached_customers") || localStorage.getItem("hinchmart_buyers");
      if (rawB) {
        const list = JSON.parse(rawB);
        if (Array.isArray(list)) {
          cachedCust = list.find(
            (b) =>
              (uId && String(b.id || b.userId || b.customerId) === String(uId)) ||
              (b.email && (b.email === ticket.userEmail || b.email === ticket.customerEmail))
          );
        }
      }

      // 2. If phone/email still missing, check cached orders by orderId
      if (oId && (!cachedCust || !cachedCust.email || !cachedCust.phone)) {
        const rawO = localStorage.getItem("hinchmart_orders");
        if (rawO) {
          const orders = JSON.parse(rawO);
          if (Array.isArray(orders)) {
            const matchedOrder = orders.find(
              (o) => String(o.id || o.orderId || o.orderNumber) === String(oId)
            );
            if (matchedOrder) {
              if (!cachedCust) cachedCust = {};
              cachedCust.name = cachedCust.name || matchedOrder.customerName || matchedOrder.buyer?.name;
              cachedCust.email = cachedCust.email || matchedOrder.customerEmail || matchedOrder.buyer?.email;
              cachedCust.phone =
                cachedCust.phone ||
                matchedOrder.customerPhone ||
                matchedOrder.recipientPhone ||
                matchedOrder.buyer?.phone;
            }
          }
        }
      }
    } catch {}
  }

  const resolvedName =
    ticket.userName ||
    ticket.user_name ||
    ticket.user?.fullName ||
    ticket.user?.name ||
    ticket.customerName ||
    ticket.customer_name ||
    ticket.customer?.fullName ||
    ticket.customer?.name ||
    ticket.buyer?.fullName ||
    ticket.buyer?.name ||
    ticket.buyerName ||
    cachedCust?.fullName ||
    cachedCust?.name ||
    ticket.name ||
    (uId ? `Customer #${uId}` : "Customer");

  const resolvedEmail =
    ticket.userEmail ||
    ticket.user_email ||
    ticket.user?.email ||
    ticket.customerEmail ||
    ticket.customer_email ||
    ticket.customer?.email ||
    ticket.buyer?.email ||
    cachedCust?.email ||
    ticket.email ||
    "";

  const resolvedPhone =
    ticket.userPhone ||
    ticket.user_phone ||
    ticket.user?.phone ||
    ticket.customerPhone ||
    ticket.customer_phone ||
    ticket.customer?.phone ||
    ticket.buyer?.phone ||
    cachedCust?.phone ||
    cachedCust?.mobile ||
    ticket.phone ||
    "";

  return {
    ticketId: id,
    id,
    ticketNumber: rawTicketNum,
    userId: uId,
    userName: resolvedName,
    userEmail: resolvedEmail,
    userPhone: resolvedPhone,
    subject: ticket.subject || "Customer Support Request",
    category: (ticket.category || ticket.issueType || "GENERAL").toUpperCase(),
    priority: (ticket.priority || "MEDIUM").toUpperCase(),
    status: (ticket.status || "OPEN").toUpperCase(),
    orderId: ticket.orderId ?? ticket.order_id ?? null,
    productId: ticket.productId ?? ticket.product_id ?? null,
    lastMessage:
      ticket.lastMessage ||
      ticket.last_message ||
      (messagesRaw.length > 0 ? messagesRaw[messagesRaw.length - 1].content || messagesRaw[messagesRaw.length - 1].message : ""),
    lastMessageAt:
      ticket.lastMessageAt ||
      ticket.last_message_at ||
      ticket.updatedAt ||
      ticket.createdAt,
    unreadByAdmin: Boolean(ticket.unreadByAdmin ?? ticket.unread),
    createdAt: (() => {
      const raw = ticket.createdAt || ticket.created_at;
      if (raw) return raw;
      const num = String(id).replace(/\D/g, "");
      return num.length >= 12 && Number(num) > 1600000000000
        ? new Date(Number(num)).toISOString()
        : new Date().toISOString();
    })(),
    updatedAt: (() => {
      const raw = ticket.updatedAt || ticket.updated_at || ticket.createdAt || ticket.created_at;
      if (raw) return raw;
      const num = String(id).replace(/\D/g, "");
      return num.length >= 12 && Number(num) > 1600000000000
        ? new Date(Number(num)).toISOString()
        : new Date().toISOString();
    })(),
    messages: messagesRaw.map((m) => normalizeTicketMessage(m, id)),
  };
};

/**
 * 1. Fetch support tickets with query params & pagination
 */
export const getTickets = async (params = {}) => {
  try {
    const cleanParams = {};
    if (params.status && params.status !== "ALL") cleanParams.status = params.status;
    if (params.priority && params.priority !== "ALL") cleanParams.priority = params.priority;
    if (params.search) cleanParams.search = params.search;
    if (params.page !== undefined) cleanParams.page = params.page;
    if (params.size !== undefined) cleanParams.size = params.size;
    if (params.limit !== undefined) {
      cleanParams.limit = params.limit;
      cleanParams.size = params.limit;
    }
    if (params.sort) cleanParams.sort = params.sort;

    // Calls admin endpoint; falls back to /help/tickets if admin route is not separated
    const response = await api
      .get("/admin/help/tickets", { params: cleanParams })
      .catch(() => api.get("/help/tickets", { params: cleanParams }));

    const resData = response.data;
    let list = [];

    if (Array.isArray(resData)) {
      list = resData;
    } else if (Array.isArray(resData?.content)) {
      list = resData.content;
    } else if (Array.isArray(resData?.data?.content)) {
      list = resData.data.content;
    } else if (Array.isArray(resData?.data)) {
      list = resData.data;
    } else if (Array.isArray(resData?.tickets)) {
      list = resData.tickets;
    }

    const normalized = list.map(normalizeTicket);

    // Save to local cache
    if (normalized.length > 0) {
      const stored = getStoredTickets();
      const mergedMap = new Map();
      stored.forEach((t) => mergedMap.set(String(t.ticketId || t.ticketNumber), t));
      normalized.forEach((t) => mergedMap.set(String(t.ticketId || t.ticketNumber), t));
      saveStoredTickets(Array.from(mergedMap.values()));
    }

    const total =
      resData?.totalElements ??
      resData?.data?.totalElements ??
      resData?.total ??
      normalized.length;

    const totalPages =
      resData?.totalPages ??
      resData?.data?.totalPages ??
      Math.max(1, Math.ceil(total / (cleanParams.size || 20)));

    return {
      success: true,
      data: normalized,
      totalElements: total,
      totalPages,
      page: cleanParams.page || 0,
    };
  } catch (err) {
    console.error("Error fetching support tickets:", err);

    // Graceful fallback to cached tickets
    const stored = getStoredTickets().map(normalizeTicket);
    let filtered = stored;

    if (params.status && params.status !== "ALL") {
      filtered = filtered.filter((t) => t.status === params.status);
    }
    if (params.priority && params.priority !== "ALL") {
      filtered = filtered.filter((t) => t.priority === params.priority);
    }
    if (params.search) {
      const q = params.search.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          (t.ticketNumber || "").toLowerCase().includes(q) ||
          (t.subject || "").toLowerCase().includes(q) ||
          (t.userName || "").toLowerCase().includes(q) ||
          (t.userEmail || "").toLowerCase().includes(q) ||
          String(t.orderId || "").includes(q)
      );
    }

    return {
      success: false,
      data: filtered,
      totalElements: filtered.length,
      totalPages: 1,
      page: 0,
      isFallback: true,
    };
  }
};

/**
 * 2. Get Ticket Details by ID or Ticket Number
 */
export const getTicketDetails = async (ticketId) => {
  const cleanId = String(ticketId).replace(/^#/, "");
  try {
    const response = await api
      .get(`/admin/help/tickets/${cleanId}`, { timeout: 2500 })
      .catch(() => api.get(`/help/tickets/${cleanId}`, { timeout: 2500 }));

    const raw = response?.data?.data || response?.data?.ticket || response?.data;
    if (raw) {
      const normalized = normalizeTicket(raw);
      // Update cache
      const stored = getStoredTickets();
      const updated = [
        normalized,
        ...stored.filter((t) => String(t.ticketId) !== String(cleanId) && t.ticketNumber !== cleanId),
      ];
      saveStoredTickets(updated);
      return normalized;
    }
  } catch (err) {
    console.warn(`Error fetching ticket details for #${cleanId}:`, err);
  }

  // Fallback to local cache
  const stored = getStoredTickets();
  const found = stored.find(
    (t) => String(t.ticketId) === String(cleanId) || t.ticketNumber === cleanId
  );
  return found ? normalizeTicket(found) : null;
};

/**
 * 3. Reply to Ticket as ADMIN
 */
export const replyToTicket = async (ticketId, messageContent) => {
  const cleanId = String(ticketId).replace(/^#/, "");
  const payload = {
    content: messageContent,
    message: messageContent,
    senderRole: "ADMIN",
    senderType: "ADMIN",
    senderName: "HinchMart Support Desk",
  };

  let raw = null;
  try {
    const response = await api
      .post(`/help/tickets/${cleanId}/messages`, payload)
      .catch(() => api.post(`/admin/help/tickets/${cleanId}/messages`, payload));

    raw = response.data?.data || response.data?.message || response.data;
  } catch (err) {
    console.warn(`API reply failed, saving locally:`, err);
  }

  const normalizedMessage = normalizeTicketMessage(
    raw || {
      id: Date.now(),
      ticketId: cleanId,
      senderRole: "ADMIN",
      senderType: "ADMIN",
      senderName: "HinchMart Support Desk",
      content: messageContent,
      createdAt: new Date().toISOString(),
    },
    cleanId
  );

  // Update in local cache
  const stored = getStoredTickets();
  const ticket = stored.find(
    (t) => String(t.ticketId) === String(cleanId) || t.ticketNumber === cleanId
  );
  if (ticket) {
    ticket.messages = [...(ticket.messages || []), normalizedMessage];
    ticket.lastMessage = messageContent;
    ticket.lastMessageAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();
    if (ticket.status === "OPEN") {
      ticket.status = "IN_PROGRESS";
    }
    saveStoredTickets(stored);
  } else {
    const newEntry = {
      ticketId: cleanId,
      id: cleanId,
      ticketNumber: cleanId.startsWith("TKT-") ? cleanId : `TKT-${cleanId}`,
      messages: [normalizedMessage],
      lastMessage: messageContent,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "IN_PROGRESS",
    };
    saveStoredTickets([newEntry, ...stored]);
  }

  return normalizedMessage;
};

/**
 * 4. Update Ticket Status & Resolution Note
 */
export const updateTicketStatus = async (ticketId, newStatus, resolutionNote = "") => {
  const cleanId = String(ticketId).replace(/^#/, "");
  const payload = {
    status: newStatus,
    ...(resolutionNote ? { resolutionNote } : {}),
  };

  let updated = null;
  try {
    const response = await api
      .patch(`/admin/help/tickets/${cleanId}/status`, payload)
      .catch(() =>
        api
          .patch(`/help/tickets/${cleanId}/status`, payload)
          .catch(() => api.put(`/help/tickets/${cleanId}`, payload))
      );

    updated = response.data?.data || response.data;
  } catch (err) {
    console.warn(`API status update failed, applying locally:`, err);
  }

  // Update in cache
  const stored = getStoredTickets();
  const ticket = stored.find(
    (t) => String(t.ticketId) === String(cleanId) || t.ticketNumber === cleanId
  );
  if (ticket) {
    ticket.status = newStatus;
    if (resolutionNote) ticket.resolutionNote = resolutionNote;
    ticket.updatedAt = new Date().toISOString();
    saveStoredTickets(stored);
    return normalizeTicket(ticket);
  }

  return {
    ticketId: cleanId,
    status: newStatus,
    resolutionNote,
  };
};
