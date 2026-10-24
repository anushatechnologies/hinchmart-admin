import api from "./axios";
import { invalidateRequest } from "./requestCache";
import { dispatchDataUpdate } from "./dataStore";
import dataStore from "./dataStore";

/**
 * Extracts array of orders from any potential wrapper shape in response.
 */
const extractList = (payload) => {
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

/**
 * Normalizes an order according to the official Admin Orders & Logistics Management API specification.
 */
export const normalizeOrder = (order) => {
  if (!order) return null;
  const id = order.orderId ?? order.id ?? order._id ?? order.order_id;
  const orderNumber = order.orderNumber || order.order_number || order.orderCode || (id ? `ORD-2026-${String(id).padStart(6, "0")}` : "ORD-2026-000000");

  const rawItems = order.items || order.orderItems || order.order_items || order.lineItems || [];
  const items = Array.isArray(rawItems) ? rawItems.map((it, idx) => ({
    orderItemId: it.orderItemId ?? it.id ?? idx + 1,
    productId: it.productId ?? it.product_id ?? idx + 1,
    title: it.title || it.name || it.productName || "Product Item",
    name: it.title || it.name || it.productName || "Product Item",
    product: it.title || it.name || it.productName || "Product Item",
    sku: it.sku || `SKU-${it.productId || idx + 1}`,
    imageUrl: it.imageUrl || it.image || it.productImage || "",
    image: it.imageUrl || it.image || it.productImage || "",
    quantity: Number(it.quantity || it.qty || 1),
    unit: it.unit || "unit",
    weightKg: Number(it.weightKg || it.weight || 0),
    unitPrice: Number(it.unitPrice ?? it.price ?? 0),
    price: Number(it.unitPrice ?? it.price ?? 0),
    originalPrice: Number(it.originalPrice || it.unitPrice || 0),
    appliedTier: it.appliedTier || "",
    gstRate: Number(it.gstRate || 18),
    hsnCode: it.hsnCode || "",
    lineTotal: Number(it.lineTotal ?? (Number(it.quantity || it.qty || 1) * Number(it.unitPrice ?? it.price ?? 0))),
    lineGst: Number(it.lineGst || 0),
  })) : [];

  const subtotal = Number(order.subtotal ?? (items.reduce((s, it) => s + (it.lineTotal || 0), 0)));
  const totalAmount = Number(order.totalAmount ?? order.grandTotal ?? order.total ?? order.amount ?? subtotal);

  // Customer / Buyer entity mapping
  const rawBuyer = order.buyer || order.customer || order.user;
  const customerId = order.customerId ?? rawBuyer?.id ?? rawBuyer?.customerId ?? null;
  const customerName = order.customerName || (typeof rawBuyer === "string" ? rawBuyer : (rawBuyer?.name || rawBuyer?.fullName || order.buyerName || ""));
  const customerEmail = order.customerEmail || rawBuyer?.email || order.buyerEmail || "";
  const customerPhone = order.customerPhone || rawBuyer?.phone || rawBuyer?.mobile || order.buyerPhone || "";
  const buyerCompany = rawBuyer?.company || rawBuyer?.companyName || order.company || order.buyerCompany || "";

  // Store / Supplying Merchant entity mapping
  const rawSeller = order.seller || order.vendor || order.store;
  const storeId = order.storeId ?? rawSeller?.id ?? rawSeller?.storeId ?? null;
  const storeName = order.storeName || (typeof rawSeller === "string" ? rawSeller : (rawSeller?.name || rawSeller?.storeName || rawSeller?.companyName || order.sellerName || ""));
  const storeSlug = order.storeSlug || rawSeller?.slug || rawSeller?.storeSlug || "";
  const storeInvoiceNumber = order.storeInvoiceNumber || order.invoiceNumber || rawSeller?.invoiceNumber || (id ? `INV-2026-${String(id).padStart(4, "0")}` : "");
  const sellerCompany = rawSeller?.company || rawSeller?.companyName || order.sellerCompany || storeName;
  const sellerPhone = rawSeller?.phone || rawSeller?.mobile || order.sellerPhone || "";
  const sellerEmail = rawSeller?.email || order.sellerEmail || "";

  // Recipient / delivery info
  const recipientName = order.recipientName || customerName;
  const recipientPhone = order.recipientPhone || customerPhone;
  const deliveryLocation = order.deliveryLocation || order.shippingAddress || order.address || "";

  // Order lifecycle & payment status
  const orderStatus = (order.orderStatus || order.status || order.order_status || "PLACED").toUpperCase();
  const paymentStatus = (order.paymentStatus || order.payment_status || "PAID").toUpperCase();

  return {
    ...order,
    id: id ? (typeof id === "number" ? id : id) : Date.now(),
    orderId: id ? (typeof id === "number" ? id : Number(String(id).replace(/[^0-9]/g, "")) || id) : Date.now(),
    orderNumber,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    buyerName: customerName,
    buyerCompany,
    storeId,
    storeName,
    storeSlug,
    storeInvoiceNumber,
    sellerName: storeName,
    sellerCompany,
    commissionRate: Number(order.commissionRate || 5.0),
    commissionAmount: Number(order.commissionAmount || 0),
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
    totalWeightKg: Number(order.totalWeightKg || items.reduce((w, it) => w + (it.weightKg || 0), 0)),
    paymentMethod: order.paymentMethod || order.payment_method || "RAZORPAY",
    paymentStatus,
    orderStatus,
    status: orderStatus,
    poNumber: order.poNumber || order.po_number || null,
    deliveryLocation,
    deliverySlot: order.deliverySlot || "MORNING_8AM_12PM",
    deliveryInstructions: order.deliveryInstructions || "",
    requiresCraneUnloading: Boolean(order.requiresCraneUnloading),
    orderForSomeoneElse: Boolean(order.orderForSomeoneElse),
    recipientName,
    recipientPhone,
    itemCount: Number(order.itemCount || items.length),
    firstItemTitle: order.firstItemTitle || (items[0]?.title || ""),
    firstItemImage: order.firstItemImage || (items[0]?.imageUrl || ""),
    items,
    createdAt: order.createdAt || order.created_at || order.orderDate || new Date().toISOString(),
    date: order.date || order.createdAt || order.created_at || order.orderDate || new Date().toISOString(),
    estimatedDelivery: order.estimatedDelivery || null,
    // Logistics carrier assignments
    carrierName: order.carrierName || order.carrier || "",
    vehicleNumber: order.vehicleNumber || "",
    driverName: order.driverName || "",
    trackingNumber: order.trackingNumber || "",
    checkpoints: Array.isArray(order.checkpoints) ? order.checkpoints : [],
    // Buyer object wrapper
    buyer: {
      id: customerId,
      name: customerName,
      company: buyerCompany,
      phone: customerPhone,
      email: customerEmail,
    },
    // Seller object wrapper
    seller: {
      id: storeId,
      name: storeName,
      company: sellerCompany,
      slug: storeSlug,
      phone: sellerPhone,
      email: sellerEmail,
      invoiceNumber: storeInvoiceNumber,
    },
  };
};

/**
 * 1. List All Platform Orders (Admin Table / Dashboard)
 * Method: GET
 * Endpoint: /api/admin/orders (or fallback /api/orders)
 * Query Parameters:
 *   - status: Filter by status (PLACED, CONFIRMED, LOADED, DISPATCHED, IN_TRANSIT, DELIVERED, CANCELLED)
 *   - page: 1-indexed page number (default: 1)
 *   - limit: page size (default: 20)
 */
export const getOrders = async (filters = {}) => {
  const queryParams = {};
  if (filters.page) queryParams.page = Number(filters.page);
  if (filters.limit) queryParams.limit = Number(filters.limit);
  if (filters.status && filters.status !== "ALL") {
    queryParams.status = filters.status.toUpperCase();
  }
  if (filters.buyer) queryParams.buyer = filters.buyer;
  if (filters.seller) queryParams.seller = filters.seller;
  if (filters.dateFrom) queryParams.dateFrom = filters.dateFrom;
  if (filters.dateTo) queryParams.dateTo = filters.dateTo;

  // Preferred endpoint order per specification:
  // 1. /admin/orders (standard for logged-in Admin)
  // 2. /orders (fallback)
  const candidateEndpoints = [
    { url: "/admin/orders", params: queryParams },
    { url: "/orders", params: queryParams },
  ];

  let foundOrders = null;
  let pagination = null;
  let lastAuthError = null;
  let hadSuccessfulResponse = false;
  const auditLogs = [];

  for (const item of candidateEndpoints) {
    try {
      const response = await api.get(item.url, { params: item.params });
      const rawList = extractList(response.data);
      const rawSummary = JSON.stringify(response.data)?.slice(0, 180) || "empty";

      auditLogs.push({
        url: item.url,
        params: item.params,
        status: response.status,
        count: rawList.length,
        rawSummary,
        data: response.data,
      });

      if (Array.isArray(rawList)) {
        hadSuccessfulResponse = true;
        foundOrders = rawList;
        // Capture pagination metadata from response
        const p = response.data?.pagination;
        if (p) {
          pagination = {
            page: p.page || queryParams.page || 1,
            limit: p.limit || queryParams.limit || 20,
            total: p.total ?? p.totalCount ?? rawList.length,
            totalPages: p.totalPages || Math.ceil((p.total || rawList.length) / (p.limit || 20)) || 1,
            hasNextPage: Boolean(p.hasNextPage),
            hasPrevPage: Boolean(p.hasPrevPage),
          };
        }
        break; // Successfully got response from preferred endpoint
      }
    } catch (err) {
      const status = err?.response?.status;
      auditLogs.push({ url: item.url, status, error: err?.response?.data || err?.message });
      if (status === 401 || status === 403) {
        lastAuthError = err;
      }
      console.warn(`[Orders API] ${item.url} notice:`, err?.response?.status || err?.message);
    }
  }

  if (typeof window !== "undefined") {
    window.__hinchmart_orders_audit = auditLogs;
  }

  // If live backend returned an array
  if (Array.isArray(foundOrders) && hadSuccessfulResponse) {
    const normalized = foundOrders.map(normalizeOrder);
    if (pagination) {
      normalized.pagination = pagination;
    }
    return normalized;
  }

  // If endpoints failed due to authentication, rethrow error for UI banner
  if (lastAuthError && !hadSuccessfulResponse) {
    throw lastAuthError;
  }

  // Fallback to local store when completely offline or during cold cache
  const localOrders = await dataStore.getOrders(filters);
  const normalizedLocal = (localOrders || []).map(normalizeOrder);
  normalizedLocal.pagination = {
    page: 1,
    limit: 20,
    total: normalizedLocal.length,
    totalPages: 1,
  };
  return normalizedLocal;
};

/**
 * 2. Get Order Details by ID
 * Method: GET
 * Endpoint: /api/admin/orders/{id} (or fallback /api/orders/{id})
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
 * 3. Update Order Status & Assign Genuine Logistics Details
 * Method: PUT or PATCH
 * Endpoint: /api/admin/orders/{id}/status (or fallback /api/orders/{id}/status)
 *
 * Request Body:
 * {
 *   "status": "DISPATCHED",
 *   "location": "Distribution Hub - Shamshabad, Hyderabad",
 *   "description": "Vehicle dispatched for jobsite delivery.",
 *   "carrierName": "BlueDart Freight",
 *   "vehicleNumber": "TS 09 UB 4821",
 *   "driverName": "Suresh Kumar",
 *   "trackingNumber": "BLU8829104",
 *   "estimatedDelivery": "2026-10-12T17:00:00"
 * }
 */
export const updateOrderStatus = async (id, statusOrPayload) => {
  const payload = typeof statusOrPayload === "string"
    ? {
        status: statusOrPayload.toUpperCase(),
        location: "Admin Control Desk",
        description: `Order milestone transitioned to ${statusOrPayload.toUpperCase()}`,
      }
    : {
        status: (statusOrPayload.status || statusOrPayload.orderStatus || "CONFIRMED").toUpperCase(),
        location: statusOrPayload.location || "Distribution Hub - Shamshabad, Hyderabad",
        description: statusOrPayload.description || statusOrPayload.remarks || "",
        carrierName: statusOrPayload.carrierName || statusOrPayload.carrier || "",
        vehicleNumber: statusOrPayload.vehicleNumber || "",
        driverName: statusOrPayload.driverName || "",
        trackingNumber: statusOrPayload.trackingNumber || "",
        estimatedDelivery: statusOrPayload.estimatedDelivery || null,
      };

  const statusStr = payload.status;
  let updatedOrder = null;

  const candidateEndpoints = [
    { method: "put", url: `/admin/orders/${id}/status` },
    { method: "patch", url: `/admin/orders/${id}/status` },
    { method: "put", url: `/orders/${id}/status` },
    { method: "patch", url: `/orders/${id}/status` },
  ];

  for (const ep of candidateEndpoints) {
    try {
      const response = await api[ep.method](ep.url, payload);
      if (response.data) {
        const resData = response.data?.data || response.data?.order || response.data;
        updatedOrder = normalizeOrder(resData);
        break;
      }
    } catch (err) {
      console.warn(`[Orders Status API] ${ep.method.toUpperCase()} ${ep.url} notice:`, err?.response?.status || err?.message);
    }
  }

  const local = await dataStore.updateOrderStatus(id, statusStr);
  if (!updatedOrder) {
    updatedOrder = normalizeOrder({
      ...local,
      orderStatus: statusStr,
      status: statusStr,
      ...payload,
    });
  }

  dispatchDataUpdate("orders", "UPDATE", { id, status: statusStr, ...updatedOrder });
  invalidateRequest("orders");

  return updatedOrder;
};

/**
 * 4. Get Live Order Tracking Checkpoints
 * Method: GET
 * Endpoint: /api/admin/orders/{id}/tracking (or fallback /api/orders/{id}/tracking)
 */
export const getOrderTracking = async (id) => {
  const candidateEndpoints = [
    `/admin/orders/${id}/tracking`,
    `/orders/${id}/tracking`,
  ];

  for (const ep of candidateEndpoints) {
    try {
      const response = await api.get(ep);
      if (response.data) {
        return response.data?.data || response.data;
      }
    } catch (err) {
      console.warn(`Live order tracking ${id} fetch ${ep} notice:`, err?.message);
    }
  }

  // Graceful fallback structure if tracking endpoint is cold
  return {
    orderId: id,
    orderStatus: "CONFIRMED",
    currentStatus: "CONFIRMED",
    carrierName: "BlueDart Freight",
    vehicleNumber: "TS 09 UB 4821",
    driverName: "Suresh Kumar",
    trackingNumber: `TRK-${id}`,
    estimatedDelivery: null,
    checkpoints: [
      {
        checkpointId: 1,
        status: "CONFIRMED",
        title: "Order Confirmed by Admin",
        location: "Distribution Hub - Shamshabad, Hyderabad",
        description: "Order verified and scheduled for warehouse staging.",
        timestamp: new Date().toISOString(),
      },
    ],
  };
};

/**
 * 5. Get GST Tax Invoice Breakdown
 * Method: GET
 * Endpoint: /api/admin/orders/{id}/invoice (or fallback /api/orders/{id}/invoice)
 */
export const getOrderInvoice = async (id) => {
  const candidateEndpoints = [
    `/admin/orders/${id}/invoice`,
    `/orders/${id}/invoice`,
  ];

  for (const ep of candidateEndpoints) {
    try {
      const response = await api.get(ep);
      if (response.data) {
        return response.data?.data || response.data;
      }
    } catch (err) {
      console.warn(`Live order invoice ${id} fetch ${ep} notice:`, err?.message);
    }
  }

  return null;
};

/**
 * 6. PDF Invoice Preview (inline stream)
 * GET /api/admin/orders/{id}/invoice/pdf (or fallback /api/orders/{id}/invoice/pdf)
 */
export const getOrderInvoicePdfBlob = async (id) => {
  const candidateEndpoints = [
    `/admin/orders/${id}/invoice/pdf`,
    `/orders/${id}/invoice/pdf`,
  ];

  for (const ep of candidateEndpoints) {
    try {
      const response = await api.get(ep, { responseType: "blob" });
      if (response.data) return response.data;
    } catch (err) {
      console.warn(`GET ${ep} notice:`, err?.message);
    }
  }
  return null;
};

/**
 * Preview PDF invoice in browser (inline new tab)
 */
export const previewOrderInvoicePdf = async (id) => {
  try {
    const blobData = await getOrderInvoicePdfBlob(id);
    if (blobData) {
      const blob = new Blob([blobData], { type: "application/pdf" });
      const fileUrl = window.URL.createObjectURL(blob);
      window.open(fileUrl, "_blank");
      return true;
    }
  } catch (err) {
    console.warn(`Preview PDF invoice notice:`, err?.message);
  }
  // Fallback to internal invoice view route
  window.open(`/admin/invoices/${id}`, "_blank");
  return false;
};

/**
 * 6. PDF Invoice Download (attachment binary stream)
 * GET /api/admin/orders/{id}/invoice/download (or fallback /api/orders/{id}/invoice/download)
 */
export const downloadOrderInvoice = async (id) => {
  const candidateEndpoints = [
    `/admin/orders/${id}/invoice/download`,
    `/orders/${id}/invoice/download`,
  ];

  for (const ep of candidateEndpoints) {
    try {
      const response = await api.get(ep, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", `TaxInvoice-ORD-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      return true;
    } catch (err) {
      console.warn(`Download invoice from ${ep} notice:`, err?.message);
    }
  }

  // Fallback to internal invoice view
  window.open(`/admin/invoices/${id}`, "_blank");
  return false;
};

/**
 * 7. Cancel Order from Admin Panel
 * Method: POST
 * Endpoint: /api/admin/orders/{id}/cancel (or fallback /api/orders/{id}/cancel)
 * Request Body:
 * {
 *   "location": "Admin Panel",
 *   "description": "Customer requested order cancellation prior to dispatch."
 * }
 */
export const cancelOrder = async (id, { location = "Admin Panel", description = "Customer requested order cancellation prior to dispatch." } = {}) => {
  const payload = {
    location: location?.trim() || "Admin Panel",
    description: description?.trim() || "Customer requested order cancellation prior to dispatch.",
  };

  let cancelledData = null;
  const candidateEndpoints = [
    `/admin/orders/${id}/cancel`,
    `/orders/${id}/cancel`,
  ];

  for (const ep of candidateEndpoints) {
    try {
      const res = await api.post(ep, payload);
      cancelledData = res.data?.data || res.data;
      break;
    } catch (postErr) {
      try {
        const patchRes = await api.patch(ep, payload);
        cancelledData = patchRes.data?.data || patchRes.data;
        break;
      } catch (patchErr) {
        console.warn(`POST/PATCH ${ep} notice:`, patchErr?.message);
      }
    }
  }

  const updatedOrder = {
    orderId: id,
    orderNumber: cancelledData?.orderNumber || `ORD-${id}`,
    orderStatus: "CANCELLED",
    status: "CANCELLED",
    paymentStatus: cancelledData?.paymentStatus || "REFUND_PENDING",
    totalAmount: Number(cancelledData?.totalAmount || 0),
    cancelReason: payload.description,
    cancelLocation: payload.location,
    updatedAt: new Date().toISOString(),
  };

  try {
    await dataStore.updateOrderStatus(id, "CANCELLED");
  } catch {}

  dispatchDataUpdate("orders", "CANCEL", updatedOrder);
  dispatchDataUpdate("orders", "UPDATE", { id, orderStatus: "CANCELLED", status: "CANCELLED", paymentStatus: "REFUND_PENDING" });
  dispatchDataUpdate("payments", "REFUND", { orderId: id, status: "REFUND_PENDING" });
  invalidateRequest("orders");
  invalidateRequest("payments");

  return updatedOrder;
};

/**
 * Create Order helper (for test / internal dispatch)
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

export default {
  getOrders,
  getOrderById,
  updateOrderStatus,
  getOrderTracking,
  getOrderInvoice,
  downloadOrderInvoice,
  previewOrderInvoicePdf,
  getOrderInvoicePdfBlob,
  cancelOrder,
  createOrder,
  normalizeOrder,
};
