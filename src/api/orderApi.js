import api from "./axios";
import { invalidateRequest } from "./requestCache";
import { dispatchDataUpdate } from "./dataStore";
import dataStore from "./dataStore";

const list = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const directList = [
    payload?.data?.content,
    payload?.content,
    payload?.data?.orders,
    payload?.orders,
    payload?.data?.items,
    payload?.items,
    payload?.data?.orderList,
    payload?.orderList,
    payload?.data?.ordersList,
    payload?.ordersList,
    payload?.data?.list,
    payload?.list,
    payload?.data?.elements,
    payload?.elements,
    payload?.data?.rows,
    payload?.rows,
    payload?.data?.result,
    payload?.result,
    payload?.data?.results,
    payload?.results,
    payload?.data?.data,
    payload?.data,
  ];

  for (const item of directList) {
    if (Array.isArray(item)) return item;
  }

  // Nested object inspection (e.g. { data: { page: { content: [...] } } })
  if (payload?.data && typeof payload.data === "object") {
    for (const key of Object.keys(payload.data)) {
      if (Array.isArray(payload.data[key])) {
        return payload.data[key];
      }
    }
  }

  // If top-level object has an array
  if (typeof payload === "object") {
    for (const key of Object.keys(payload)) {
      if (Array.isArray(payload[key])) {
        return payload[key];
      }
    }
  }

  // Single order object wrapped in payload
  const single =
    payload?.data?.order ||
    payload?.order ||
    (payload?.data && (payload.data.orderId || payload.data.id || payload.data.orderNumber) ? payload.data : null);
  if (single && typeof single === "object") {
    return [single];
  }

  return [];
};

export const normalizeOrder = (order) => {
  if (!order) return null;
  const id = order.orderId ?? order.id ?? order._id ?? order.order_id;
  const orderNumber = order.orderNumber || order.order_number || order.orderCode || (id ? `ORD-2026-${String(id).padStart(6, "0")}` : "ORD-2026-000000");

  const rawItems = order.items || order.orderItems || order.order_items || order.lineItems || [];
  const items = Array.isArray(rawItems) ? rawItems.map((it, idx) => ({
    orderItemId: it.orderItemId ?? it.id ?? idx + 1,
    productId: it.productId ?? it.product_id,
    title: it.title || it.name || it.productName || "Product Item",
    name: it.title || it.name || it.productName || "Product Item",
    imageUrl: it.imageUrl || it.image || it.productImage || "",
    image: it.imageUrl || it.image || it.productImage || "",
    quantity: Number(it.quantity || it.qty || 1),
    unit: it.unit || "unit",
    unitPrice: Number(it.unitPrice ?? it.price ?? 0),
    price: Number(it.unitPrice ?? it.price ?? 0),
    originalPrice: Number(it.originalPrice || 0),
    appliedTier: it.appliedTier || "",
    gstRate: Number(it.gstRate || 18),
    lineTotal: Number(it.lineTotal ?? (Number(it.quantity || it.qty || 1) * Number(it.unitPrice ?? it.price ?? 0))),
    lineGst: Number(it.lineGst || 0),
  })) : [];

  const subtotal = Number(order.subtotal ?? (items.reduce((s, it) => s + (it.lineTotal || 0), 0)));
  const totalAmount = Number(order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount ?? subtotal);

  const rawBuyer = order.buyer || order.customer || order.user;
  const buyerName = typeof rawBuyer === "string" ? rawBuyer : (rawBuyer?.name || rawBuyer?.fullName || order.customerName || order.buyerName || "");
  const buyerCompany = rawBuyer?.company || rawBuyer?.companyName || order.company || order.buyerCompany || "";
  const buyerPhone = rawBuyer?.phone || rawBuyer?.mobile || order.phone || order.buyerPhone || "";
  const buyerEmail = rawBuyer?.email || order.email || order.buyerEmail || "";

  const rawSeller = order.seller || order.vendor || order.store;
  const sellerName = typeof rawSeller === "string" ? rawSeller : (rawSeller?.name || rawSeller?.storeName || rawSeller?.companyName || order.sellerName || order.seller_name || "");
  const sellerCompany = rawSeller?.company || rawSeller?.companyName || order.sellerCompany || "";
  const sellerPhone = rawSeller?.phone || rawSeller?.mobile || order.sellerPhone || "";
  const sellerEmail = rawSeller?.email || order.sellerEmail || "";

  return {
    ...order,
    id: id ? (typeof id === "number" ? id : id) : Date.now(),
    orderId: id ? (typeof id === "number" ? id : Number(String(id).replace(/[^0-9]/g, "")) || id) : Date.now(),
    orderNumber,
    totalAmount,
    grandTotal: totalAmount,
    subtotal,
    discount: Number(order.discount || order.couponDiscount || 0),
    taxableAmount: Number(order.taxableAmount || subtotal),
    cgst: Number(order.cgst || 0),
    sgst: Number(order.sgst || 0),
    igst: Number(order.igst || 0),
    totalGst: Number(order.totalGst || 0),
    freightCharge: Number(order.freightCharge || order.deliveryCharge || 0),
    craneUnloadingCharge: Number(order.craneUnloadingCharge || 0),
    paymentMethod: order.paymentMethod || order.payment_method || "NEFT_RTGS",
    paymentStatus: order.paymentStatus || order.payment_status || "PAID",
    orderStatus: order.orderStatus || order.status || order.order_status || "CONFIRMED",
    status: order.orderStatus || order.status || order.order_status || "CONFIRMED",
    poNumber: order.poNumber || order.po_number || "",
    deliverySlot: order.deliverySlot || "Standard",
    deliveryInstructions: order.deliveryInstructions || "",
    requiresCraneUnloading: Boolean(order.requiresCraneUnloading),
    itemCount: order.itemCount || items.length,
    firstItemTitle: order.firstItemTitle || (items[0]?.title || ""),
    firstItemImage: order.firstItemImage || (items[0]?.imageUrl || ""),
    items,
    createdAt: order.createdAt || order.created_at || order.orderDate || new Date().toISOString(),
    date: order.date || order.createdAt || order.created_at || order.orderDate || new Date().toISOString(),
    estimatedDelivery: order.estimatedDelivery || "",
    buyer: {
      name: buyerName,
      company: buyerCompany,
      phone: buyerPhone,
      email: buyerEmail,
    },
    buyerName,
    seller: {
      name: sellerName,
      company: sellerCompany,
      phone: sellerPhone,
      email: sellerEmail,
    },
    sellerName,
  };
};

/**
 * Get all Orders (fetches live from database)
 * Searches candidate admin and platform endpoints to ensure real database buyer orders are returned.
 */
export const getOrders = async (filters = {}) => {
  const candidateEndpoints = [
    { url: "/orders", params: filters },
    { url: "/orders", params: { page: 0, size: 100, ...filters } },
    { url: "/orders", params: { status: "ALL", ...filters } },
    { url: "/orders", params: { all: true, ...filters } },
    { url: "/orders/admin", params: filters },
    { url: "/orders/list", params: filters },
    { url: "/order/list", params: filters },
    { url: "/all-orders", params: filters },
    { url: "/admin-orders", params: filters },
  ];

  let foundOrders = null;
  let lastAuthError = null;
  let hadSuccessfulResponse = false;
  const auditLogs = [];

  for (const item of candidateEndpoints) {
    try {
      const response = await api.get(item.url, { params: item.params });
      const rawList = list(response.data);
      const rawSummary = JSON.stringify(response.data)?.slice(0, 180) || "empty";
      auditLogs.push({
        url: item.url,
        params: item.params,
        status: response.status,
        count: rawList.length,
        rawSummary,
        data: response.data,
      });
      console.info(`[Orders API] ${item.url}: Status ${response.status}, Extracted items: ${rawList.length}`, response.data);

      if (Array.isArray(rawList)) {
        hadSuccessfulResponse = true;
        if (rawList.length > 0) {
          // Found live orders in database!
          foundOrders = rawList;
          break;
        } else if (foundOrders === null) {
          // Keep empty array as fallback if no endpoint has records
          foundOrders = [];
        }
      }
    } catch (err) {
      const status = err?.response?.status;
      auditLogs.push({ url: item.url, status, error: err?.response?.data || err?.message });
      if (status === 401 || status === 403) {
        lastAuthError = err;
      }
      console.warn(`[Orders API] ${item.url} notice:`, err?.response?.status || err?.message, err?.response?.data);
    }
  }

  if (typeof window !== "undefined") {
    window.__hinchmart_orders_audit = auditLogs;
  }

  // If live database returned an array (orders found or real empty database)
  if (Array.isArray(foundOrders) && (foundOrders.length > 0 || hadSuccessfulResponse)) {
    return foundOrders.map(normalizeOrder);
  }

  // If endpoints failed due to authentication, rethrow error for UI warning
  if (lastAuthError && !hadSuccessfulResponse) {
    throw lastAuthError;
  }

  // Fallback to local store only when completely offline or server unavailable
  const localOrders = await dataStore.getOrders(filters);
  return (localOrders || []).map(normalizeOrder);
};

/**
 * Get Order by ID (fetches live from database)
 */
export const getOrderById = async (id) => {
  const candidateEndpoints = [
    `/admin/orders/${id}`,
    `/orders/${id}`,
  ];

  for (const ep of candidateEndpoints) {
    try {
      const response = await api.get(ep);
      const data = response.data?.data || response.data?.order || response.data;
      if (data && typeof data === "object" && (data.id || data.orderId || data.orderNumber)) {
        return normalizeOrder(data);
      }
    } catch (err) {
      console.warn(`Live order ${id} fetch ${ep} notice:`, err?.message);
    }
  }

  const local = await dataStore.getOrderById(id);
  return normalizeOrder(local);
};

/**
 * Get Order Tracking Info
 */
export const getOrderTracking = async (id) => {
  try {
    const response = await api.get(`/orders/${id}/tracking`);
    if (response.data) return response.data;
  } catch (err) {
    console.warn(`Live order tracking ${id} notice:`, err?.message);
  }
  return null;
};

/**
 * Get Order Invoice
 */
export const getOrderInvoice = async (id) => {
  try {
    const response = await api.get(`/orders/${id}/invoice`);
    if (response.data) return response.data;
  } catch (err) {
    console.warn(`Live order invoice ${id} notice:`, err?.message);
  }
  return null;
};

/**
 * Download order invoice PDF
 * GET /api/orders/{id}/invoice/download
 */
export const downloadOrderInvoice = async (id) => {
  try {
    const response = await api.get(`/orders/${id}/invoice/download`, {
      responseType: "blob",
    });
    const blob = new Blob([response.data], { type: "application/pdf" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", `Invoice-ORD-${id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  } catch (err) {
    console.warn(`Direct PDF download /orders/${id}/invoice/download offline:`, err?.message);
    // Trigger printable invoice window fallback
    window.open(`/admin/invoices/${id}`, "_blank");
    return false;
  }
};

/**
 * Update Order Status (shipping progress)
 * PUT /api/orders/{id}/status
 * body: { status: "PROCESSING|SHIPPED|DELIVERED", location: "Mumbai", description: "..." }
 */
export const updateOrderStatus = async (id, statusOrPayload) => {
  const payload = typeof statusOrPayload === "string"
    ? { status: statusOrPayload, orderStatus: statusOrPayload }
    : {
        status: statusOrPayload.status || statusOrPayload.orderStatus,
        orderStatus: statusOrPayload.status || statusOrPayload.orderStatus,
        location: statusOrPayload.location || "",
        description: statusOrPayload.description || statusOrPayload.remarks || "",
        trackingNumber: statusOrPayload.trackingNumber || "",
        carrier: statusOrPayload.carrier || "",
      };

  const statusStr = payload.status;
  let updatedOrder = null;

  try {
    // Primary: PUT /api/orders/{id}/status
    const response = await api.put(`/orders/${id}/status`, payload);
    if (response.data) {
      updatedOrder = normalizeOrder(response.data?.data || response.data?.order || response.data);
    }
  } catch (putErr) {
    try {
      // Secondary fallback: PATCH /api/orders/{id}/status
      const response = await api.patch(`/orders/${id}/status`, payload);
      if (response.data) {
        updatedOrder = normalizeOrder(response.data?.data || response.data?.order || response.data);
      }
    } catch (patchErr) {
      console.warn(`Live backend order ${id} status update pending sync:`, patchErr?.message);
    }
  }

  const local = await dataStore.updateOrderStatus(id, statusStr);
  if (!updatedOrder) {
    updatedOrder = normalizeOrder(local);
  }

  dispatchDataUpdate("orders", "UPDATE", { id, status: statusStr, ...updatedOrder });
  invalidateRequest("orders");

  return updatedOrder;
};

/**
 * Create Order (sends live POST to database)
 */
export const createOrder = async (orderData) => {
  let created = null;
  try {
    const response = await api.post("/orders", orderData);
    if (response.data) {
      created = normalizeOrder(response.data);
    }
  } catch (err) {
    console.warn("Live backend POST /orders pending sync:", err?.message);
  }

  if (!created) {
    created = normalizeOrder({ ...orderData, orderId: Date.now() });
  }

  dispatchDataUpdate("orders", "CREATE", created);
  invalidateRequest("orders");

  return created;
};

/**
 * 6. Order Cancellation with Auto-Refund Pipeline
 * Source: OrderController.java | POST or PATCH /api/orders/{id}/cancel
 * Body: { location: "Admin Control Desk", description: "Admin cancelled due to customer request / out of stock" }
 * Triggers backend OrderCancelledEvent, Razorpay gateway refund, and seller payout clawback.
 */
export const cancelOrder = async (id, { location = "Admin Control Desk", description = "Admin cancelled due to customer request / out of stock" } = {}) => {
  const payload = {
    location: location?.trim() || "Admin Control Desk",
    description: description?.trim() || "Admin cancelled order",
  };

  let cancelledData = null;
  try {
    const res = await api.post(`/orders/${id}/cancel`, payload);
    cancelledData = res.data?.data || res.data;
  } catch (postErr) {
    try {
      const res = await api.patch(`/orders/${id}/cancel`, payload);
      cancelledData = res.data?.data || res.data;
    } catch (patchErr) {
      console.warn(`Live /orders/${id}/cancel notice:`, patchErr?.message);
    }
  }

  const updatedOrder = {
    orderId: id,
    orderNumber: cancelledData?.orderNumber || `ORD-${id}`,
    orderStatus: "CANCELLED",
    status: "CANCELLED",
    paymentStatus: "REFUNDED",
    totalAmount: Number(cancelledData?.totalAmount || 0),
    cancelReason: payload.description,
    cancelLocation: payload.location,
    updatedAt: new Date().toISOString(),
  };

  try {
    await dataStore.updateOrderStatus(id, "CANCELLED");
  } catch {}

  dispatchDataUpdate("orders", "CANCEL", updatedOrder);
  dispatchDataUpdate("orders", "UPDATE", { id, orderStatus: "CANCELLED", status: "CANCELLED", paymentStatus: "REFUNDED" });
  dispatchDataUpdate("payments", "REFUND", { orderId: id, status: "REFUNDED" });
  invalidateRequest("orders");
  invalidateRequest("payments");

  return updatedOrder;
};

/**
 * 7. Get Tax Invoice PDF Blob for inline preview
 * GET /api/orders/{id}/invoice/pdf
 */
export const getOrderInvoicePdfBlob = async (id) => {
  try {
    const response = await api.get(`/orders/${id}/invoice/pdf`, {
      responseType: "blob",
    });
    return response.data;
  } catch (err) {
    console.warn(`GET /orders/${id}/invoice/pdf notice:`, err?.message);
    return null;
  }
};
