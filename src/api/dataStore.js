// Dynamic Hybrid Data Store for HinchMart Admin
// Provides real-time reactive state, localStorage persistence, realistic seed data,
// and automatic sync with backend API or offline fallback.

const EVENT_NAME = "hinchmart_data_updated";

export const dispatchDataUpdate = (entity, action, data) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { entity, action, data } })
    );
  }
};

export const subscribeDataUpdate = (callback) => {
  if (typeof window !== "undefined") {
    const handler = (e) => callback(e.detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }
  return () => {};
};

// Initial Seed Data
const initialBuyers = [];

const initialSellers = [];

const initialCategories = [];

const initialBanners = [];

const initialProducts = [];

const initialOrders = [];

const initialPayments = [];

const initialInvoices = [];

const initialShipments = [];

const initialRFQs = [];

// LocalStorage helpers
const getStorageItem = (key, fallback) => {
  try {
    const item = localStorage.getItem(`hinchmart_${key}`);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const setStorageItem = (key, value) => {
  try {
    localStorage.setItem(`hinchmart_${key}`, JSON.stringify(value));
  } catch (err) {
    console.error("Storage error", err);
  }
};

// Data Store Class
class DynamicDataStore {
  constructor() {
    this.init();
  }

  init() {
    // Purge legacy mock data
    const purgeDummy = (key, isDummyFn) => {
      try {
        const items = getStorageItem(key, []);
        if (Array.isArray(items)) {
          const cleaned = items.filter((item) => !isDummyFn(item));
          setStorageItem(key, cleaned);
        }
      } catch {}
    };

    purgeDummy("buyers", (b) => String(b.id || "").startsWith("buy_10"));
    purgeDummy("sellers", (s) => String(s.id || "").startsWith("sel_20") || s.businessName === "Sri Sai Steel" || s.businessName === "Apex Industrial Tools");
    purgeDummy("categories", (c) => String(c.id || "").startsWith("cat_"));
    purgeDummy("banners", (b) => String(b.id || "").startsWith("bnr_") || b.bannerId === 26 || b.bannerId === 27);
    purgeDummy("orders", (o) => String(o.id || "").startsWith("ord_10") || String(o.orderNumber || "").startsWith("HM26081"));
    purgeDummy("payments", (p) => String(p.id || "").startsWith("TXN-882910"));
    purgeDummy("invoices", (i) => String(i.id || "").startsWith("INV-2026-00"));
    purgeDummy("shipments", (s) => String(s.id || "").startsWith("TRK-"));
    purgeDummy("rfqs", (r) => String(r.id || "").startsWith("RFQ-2026-0819"));

    if (!localStorage.getItem("hinchmart_buyers")) setStorageItem("buyers", []);
    if (!localStorage.getItem("hinchmart_sellers")) setStorageItem("sellers", []);
    if (!localStorage.getItem("hinchmart_categories")) setStorageItem("categories", []);
    if (!localStorage.getItem("hinchmart_banners")) setStorageItem("banners", []);
    if (!localStorage.getItem("hinchmart_products")) {
      setStorageItem("products", []);
    } else {
      // Purge legacy dummy mock products
      try {
        const storedProds = getStorageItem("products", []);
        const cleaned = (storedProds || []).filter(
          (p) =>
            !String(p.id || "").startsWith("prod_pending_") &&
            p.id !== "prod_1" &&
            p.sku !== "TATA-550-12" &&
            p.sku !== "JIN-550D-16" &&
            p.sku !== "MOT-3PH-750"
        );
        setStorageItem("products", cleaned);
      } catch {}
    }
    if (!localStorage.getItem("hinchmart_orders")) setStorageItem("orders", []);
    if (!localStorage.getItem("hinchmart_payments")) setStorageItem("payments", []);
    if (!localStorage.getItem("hinchmart_invoices")) setStorageItem("invoices", []);
    if (!localStorage.getItem("hinchmart_shipments")) setStorageItem("shipments", []);
    if (!localStorage.getItem("hinchmart_rfqs")) setStorageItem("rfqs", []);
  }

  // BUYERS
  getBuyers() {
    return getStorageItem("buyers", initialBuyers);
  }
  getBuyerById(id) {
    return this.getBuyers().find((b) => (b.id || b._id) === id);
  }
  addBuyer(buyerData) {
    const buyers = this.getBuyers();
    const newBuyer = {
      id: `buy_${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      status: "ACTIVE",
      totalOrders: 0,
      totalSpent: 0,
      ...buyerData,
    };
    buyers.unshift(newBuyer);
    setStorageItem("buyers", buyers);
    dispatchDataUpdate("buyers", "create", newBuyer);
    return newBuyer;
  }
  updateBuyer(id, updates) {
    const buyers = this.getBuyers();
    const idx = buyers.findIndex((b) => (b.id || b._id) === id);
    if (idx !== -1) {
      buyers[idx] = { ...buyers[idx], ...updates, updatedAt: new Date().toISOString() };
      setStorageItem("buyers", buyers);
      dispatchDataUpdate("buyers", "update", buyers[idx]);
      return buyers[idx];
    }
    return null;
  }
  setBuyerStatus(id, newStatus) {
    return this.updateBuyer(id, { status: newStatus });
  }
  deleteBuyer(id) {
    const buyers = this.getBuyers().filter((b) => (b.id || b._id) !== id);
    setStorageItem("buyers", buyers);
    dispatchDataUpdate("buyers", "delete", { id });
    return true;
  }

  // SELLERS
  getSellers() {
    return getStorageItem("sellers", initialSellers);
  }
  getSellerById(id) {
    return this.getSellers().find((s) => (s.id || s._id) === id);
  }
  addSeller(sellerData) {
    const sellers = this.getSellers();
    const newSeller = {
      id: `sel_${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: sellerData.status || "ACTIVE",
      approvalStatus: sellerData.approvalStatus || (sellerData.status === "ACTIVE" ? "APPROVED" : "PENDING"),
      productsCount: 0,
      totalRevenue: 0,
      rating: sellerData.rating !== undefined && sellerData.rating !== null ? Number(sellerData.rating) : 0,
      ...sellerData,
    };
    sellers.unshift(newSeller);
    setStorageItem("sellers", sellers);
    dispatchDataUpdate("sellers", "create", newSeller);
    return newSeller;
  }
  updateSeller(id, updates) {
    const sellers = this.getSellers();
    const idx = sellers.findIndex((s) => (s.id || s._id) === id);
    if (idx !== -1) {
      sellers[idx] = { ...sellers[idx], ...updates, updatedAt: new Date().toISOString() };
      setStorageItem("sellers", sellers);
      dispatchDataUpdate("sellers", "update", sellers[idx]);
      return sellers[idx];
    }
    return null;
  }
  setSellerStatus(id, newStatus) {
    const updates = { status: newStatus };
    if (newStatus === "ACTIVE" || newStatus === "APPROVED") {
      updates.approvalStatus = "APPROVED";
      updates.status = "ACTIVE";
    } else if (newStatus === "REJECTED" || newStatus === "BLOCKED") {
      updates.status = newStatus;
    }
    return this.updateSeller(id, updates);
  }
  approveSeller(id) {
    return this.updateSeller(id, {
      status: "ACTIVE",
      approvalStatus: "APPROVED",
      approvedAt: new Date().toISOString(),
    });
  }
  rejectSeller(id, reason = "") {
    return this.updateSeller(id, {
      status: "REJECTED",
      approvalStatus: "REJECTED",
      rejectionReason: reason,
      rejectedAt: new Date().toISOString(),
    });
  }
  deleteSeller(id) {
    const sellers = this.getSellers().filter((s) => (s.id || s._id) !== id);
    setStorageItem("sellers", sellers);
    dispatchDataUpdate("sellers", "delete", { id });
    return true;
  }

  // CATEGORIES
  getCategories() {
    return getStorageItem("categories", initialCategories);
  }
  addCategory(categoryData) {
    const categories = this.getCategories();
    const newCategory = {
      id: `cat_${Date.now()}`,
      displayOrder: categories.length + 1,
      active: true,
      productsCount: 0,
      ...categoryData,
    };
    categories.push(newCategory);
    setStorageItem("categories", categories);
    dispatchDataUpdate("categories", "create", newCategory);
    return newCategory;
  }
  updateCategory(id, updates) {
    const categories = this.getCategories();
    const idx = categories.findIndex((c) => (c.id || c._id) === id);
    if (idx !== -1) {
      categories[idx] = { ...categories[idx], ...updates };
      setStorageItem("categories", categories);
      dispatchDataUpdate("categories", "update", categories[idx]);
      return categories[idx];
    }
    return null;
  }
  toggleCategoryActive(id) {
    const cat = this.getCategories().find((c) => (c.id || c._id) === id);
    if (cat) {
      const currentActive = cat.active ?? cat.isActive ?? true;
      return this.updateCategory(id, { active: !currentActive, isActive: !currentActive });
    }
    return null;
  }
  deleteCategory(id) {
    const categories = this.getCategories().filter((c) => (c.id || c._id) !== id);
    setStorageItem("categories", categories);
    dispatchDataUpdate("categories", "delete", { id });
    return true;
  }

  // BANNERS
  getBanners() {
    return getStorageItem("banners", initialBanners);
  }
  addBanner(bannerData) {
    const banners = this.getBanners();
    const newBanner = { id: `bnr_${Date.now()}`, status: "DRAFT", ...bannerData };
    banners.unshift(newBanner);
    setStorageItem("banners", banners);
    dispatchDataUpdate("banners", "create", newBanner);
    return newBanner;
  }
  updateBanner(id, updates) {
    const banners = this.getBanners();
    const idx = banners.findIndex((banner) => (banner.id || banner._id) === id);
    if (idx !== -1) {
      banners[idx] = { ...banners[idx], ...updates, updatedAt: new Date().toISOString() };
      setStorageItem("banners", banners);
      dispatchDataUpdate("banners", "update", banners[idx]);
      return banners[idx];
    }
    return null;
  }
  toggleBannerActive(id) {
    const banner = this.getBanners().find((item) => (item.id || item._id) === id);
    if (banner) return this.updateBanner(id, { status: banner.status === "LIVE" ? "PAUSED" : "LIVE" });
    return null;
  }
  deleteBanner(id) {
    const banners = this.getBanners().filter((banner) => (banner.id || banner._id) !== id);
    setStorageItem("banners", banners);
    dispatchDataUpdate("banners", "delete", { id });
    return true;
  }

  // PRODUCTS
  getProducts() {
    return getStorageItem("products", initialProducts);
  }
  getProductById(id) {
    return this.getProducts().find((p) => (p.id || p._id) === id);
  }
  getPendingProducts() {
    return this.getProducts().filter(
      (p) => (p.approvalStatus || p.status || "").toUpperCase() === "PENDING"
    );
  }
  addProduct(productData) {
    const products = this.getProducts();
    const newProduct = {
      id: `prod_${Date.now()}`,
      sku: productData.sku || `SKU-${Date.now().toString().slice(-6)}`,
      status: productData.status || "APPROVED",
      approvalStatus: productData.approvalStatus || "APPROVED",
      active: productData.active !== undefined ? productData.active : true,
      price: Number(productData.price || productData.sellingPrice || 0),
      sellingPrice: Number(productData.price || productData.sellingPrice || 0),
      mrp: Number(productData.mrp || productData.price || 0),
      moq: productData.moq || "1 Unit",
      stock: productData.stock || "10 Units",
      images: productData.images || (productData.image ? [productData.image] : []),
      submittedAt: "Today",
      createdAt: new Date().toISOString(),
      ...productData,
    };
    products.unshift(newProduct);
    setStorageItem("products", products);
    dispatchDataUpdate("products", "create", newProduct);
    return newProduct;
  }
  updateProduct(id, updates) {
    const products = this.getProducts();
    const idx = products.findIndex((p) => (p.id || p._id) === id);
    if (idx !== -1) {
      const current = products[idx];
      const isSellerProd = Boolean(current.sellerId || current.seller || current.vendorId || current.isSellerProduct);
      const isCurrentlyRejected = (current.approvalStatus || current.status || "").toUpperCase() === "REJECTED";

      // If a rejected seller product is updated without explicit admin status overrides, reset to PENDING
      let lifecycleReset = {};
      if (isCurrentlyRejected && isSellerProd && !updates.approvalStatus && !updates.status) {
        lifecycleReset = {
          approvalStatus: "PENDING",
          status: "PENDING",
          rejectionReason: null,
          active: false,
        };
      }

      products[idx] = { ...products[idx], ...lifecycleReset, ...updates, updatedAt: new Date().toISOString() };
      setStorageItem("products", products);
      dispatchDataUpdate("products", "update", products[idx]);
      return products[idx];
    }
    return null;
  }
  toggleProductActive(id) {
    const prod = this.getProductById(id);
    if (prod) {
      const current = prod.active !== undefined ? prod.active : (prod.status === "APPROVED" || prod.status === "ACTIVE");
      const nextActive = !current;
      return this.updateProduct(id, {
        active: nextActive,
        status: nextActive ? "APPROVED" : "INACTIVE",
        approvalStatus: nextActive ? "APPROVED" : prod.approvalStatus,
      });
    }
    return null;
  }
  approveProduct(id) {
    return this.updateProduct(id, {
      status: "APPROVED",
      approvalStatus: "APPROVED",
      active: true,
      approvedAt: new Date().toISOString(),
    });
  }
  rejectProduct(id, reason = "") {
    return this.updateProduct(id, {
      status: "REJECTED",
      approvalStatus: "REJECTED",
      active: false,
      rejectionReason: reason,
      rejectedAt: new Date().toISOString(),
    });
  }
  deleteProduct(id) {
    const products = this.getProducts().filter((p) => (p.id || p._id) !== id);
    setStorageItem("products", products);
    dispatchDataUpdate("products", "delete", { id });
    return true;
  }

  // ORDERS
  getOrders(filters = {}) {
    let orders = getStorageItem("orders", initialOrders);
    if (filters.status && filters.status !== "ALL") {
      orders = orders.filter((o) => (o.status || o.orderStatus || "").toUpperCase() === filters.status.toUpperCase());
    }
    if (filters.paymentStatus && filters.paymentStatus !== "ALL") {
      orders = orders.filter((o) => (o.paymentStatus || "").toUpperCase() === filters.paymentStatus.toUpperCase());
    }
    if (filters.buyer) {
      const bq = filters.buyer.toLowerCase();
      orders = orders.filter((o) => (o.buyer?.name || o.buyerName || "").toLowerCase().includes(bq));
    }
    if (filters.seller) {
      const sq = filters.seller.toLowerCase();
      orders = orders.filter((o) => (o.seller?.name || o.sellerName || "").toLowerCase().includes(sq));
    }
    if (filters.dateFrom) {
      orders = orders.filter((o) => new Date(o.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      orders = orders.filter((o) => new Date(o.createdAt) <= new Date(filters.dateTo));
    }
    return orders;
  }
  getOrderById(id) {
    return this.getOrders().find((o) => (o.id || o._id) === id || o.orderNumber === id);
  }
  updateOrderStatus(id, newStatus) {
    const orders = this.getOrders();
    const idx = orders.findIndex((o) => (o.id || o._id) === id || o.orderNumber === id);
    if (idx !== -1) {
      orders[idx] = {
        ...orders[idx],
        status: newStatus,
        orderStatus: newStatus,
        updatedAt: new Date().toISOString(),
      };
      setStorageItem("orders", orders);
      dispatchDataUpdate("orders", "update", orders[idx]);
      return orders[idx];
    }
    return null;
  }

  // PAYMENTS (MEMBER 5)
  getPayments(filters = {}) {
    let payments = getStorageItem("payments", initialPayments);
    if (filters.status && filters.status !== "ALL") {
      payments = payments.filter((p) => (p.paymentStatus || "").toUpperCase() === filters.status.toUpperCase());
    }
    if (filters.method && filters.method !== "ALL") {
      payments = payments.filter((p) => (p.method || "").toLowerCase().includes(filters.method.toLowerCase()));
    }
    if (filters.buyer) {
      const bq = filters.buyer.toLowerCase();
      payments = payments.filter((p) => (p.buyer?.name || p.buyerName || "").toLowerCase().includes(bq));
    }
    if (filters.seller) {
      const sq = filters.seller.toLowerCase();
      payments = payments.filter((p) => (p.seller?.name || p.sellerName || "").toLowerCase().includes(sq));
    }
    if (filters.dateFrom) {
      payments = payments.filter((p) => new Date(p.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      payments = payments.filter((p) => new Date(p.createdAt) <= new Date(filters.dateTo));
    }
    return payments;
  }
  getPaymentById(id) {
    return this.getPayments().find((p) => p.id === id || p.transactionId === id || p.orderNumber === id);
  }

  // INVOICES (MEMBER 5)
  getInvoices(filters = {}) {
    let invoices = getStorageItem("invoices", initialInvoices);
    if (filters.status && filters.status !== "ALL") {
      invoices = invoices.filter((i) => (i.status || "").toUpperCase() === filters.status.toUpperCase());
    }
    if (filters.buyer) {
      const bq = filters.buyer.toLowerCase();
      invoices = invoices.filter((i) => (i.buyer?.name || i.buyerName || "").toLowerCase().includes(bq));
    }
    if (filters.seller) {
      const sq = filters.seller.toLowerCase();
      invoices = invoices.filter((i) => (i.seller?.name || i.sellerName || "").toLowerCase().includes(sq));
    }
    if (filters.dateFrom) {
      invoices = invoices.filter((i) => new Date(i.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      invoices = invoices.filter((i) => new Date(i.createdAt) <= new Date(filters.dateTo));
    }
    return invoices;
  }
  getInvoiceById(id) {
    return this.getInvoices().find((i) => i.id === id || i.invoiceNumber === id || i.orderNumber === id);
  }

  // SHIPMENTS (MEMBER 5)
  getShipments(filters = {}) {
    let shipments = getStorageItem("shipments", initialShipments);
    if (filters.status && filters.status !== "ALL") {
      shipments = shipments.filter((s) => (s.status || "").toUpperCase() === filters.status.toUpperCase());
    }
    if (filters.partner && filters.partner !== "ALL") {
      shipments = shipments.filter((s) => (s.transportPartner || "").toLowerCase().includes(filters.partner.toLowerCase()));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      shipments = shipments.filter((s) =>
        `${s.shipmentId} ${s.orderNumber} ${s.trackingNumber} ${s.buyerName} ${s.sellerName}`.toLowerCase().includes(q)
      );
    }
    return shipments;
  }
  getShipmentById(id) {
    return this.getShipments().find((s) => s.id === id || s.shipmentId === id || s.trackingNumber === id || s.orderNumber === id);
  }
  updateShipmentStatus(id, newStatus) {
    const shipments = this.getShipments();
    const idx = shipments.findIndex((s) => s.id === id || s.shipmentId === id);
    if (idx !== -1) {
      shipments[idx] = {
        ...shipments[idx],
        status: newStatus,
        updatedAt: new Date().toISOString(),
      };
      setStorageItem("shipments", shipments);
      dispatchDataUpdate("shipments", "update", shipments[idx]);
      return shipments[idx];
    }
    return null;
  }

  // RFQS
  getRFQs() {
    return getStorageItem("rfqs", initialRFQs);
  }
  closeRFQ(id) {
    const rfqs = this.getRFQs();
    const idx = rfqs.findIndex((r) => (r.id || r._id) === id);
    if (idx !== -1) {
      rfqs[idx] = { ...rfqs[idx], status: "CLOSED", closedAt: new Date().toISOString() };
      setStorageItem("rfqs", rfqs);
      dispatchDataUpdate("rfqs", "update", rfqs[idx]);
      return rfqs[idx];
    }
    return null;
  }

  // DASHBOARD STATS (MEMBER 5 BUSINESS VISIBILITY)
  getDashboardStats() {
    const buyers = this.getBuyers();
    const sellers = this.getSellers();
    const products = this.getProducts();
    const orders = this.getOrders();
    const payments = this.getPayments();
    const shipments = this.getShipments();
    const rfqs = this.getRFQs();

    const pendingSellers = sellers.filter(
      (s) => (s.approvalStatus || s.status || "").toUpperCase() === "PENDING"
    ).length;

    const pendingProducts = products.filter(
      (p) => (p.approvalStatus || p.status || "").toUpperCase() === "PENDING"
    ).length;

    const activeProducts = products.filter(
      (p) => (p.active ?? true) && (p.approvalStatus || p.status || "").toUpperCase() === "APPROVED"
    ).length;

    const openRFQs = rfqs.filter((r) => (r.status || "").toUpperCase() === "OPEN").length;

    const successfulPayments = payments.filter((p) => (p.paymentStatus || "").toUpperCase() === "SUCCESS").length;
    const pendingPayments = payments.filter((p) => (p.paymentStatus || "").toUpperCase() === "PENDING").length;

    const shipmentsInTransit = shipments.filter(
      (s) => (s.status || "").toUpperCase() === "IN TRANSIT" || (s.status || "").toUpperCase() === "PICKED UP"
    ).length;

    const isToday = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const now = new Date();
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    };

    const ordersToday = orders.filter((o) =>
      isToday(o.createdAt || o.created_at || o.orderDate || o.order_date || o.date)
    );

    const deliveredToday = shipments.filter(
      (s) =>
        (s.status || "").toUpperCase() === "DELIVERED" &&
        isToday(s.deliveredAt || s.delivered_at || s.updatedAt || s.updated_at || s.date)
    ).length;

    const totalDelivered = shipments.filter(
      (s) => (s.status || "").toUpperCase() === "DELIVERED"
    ).length;

    const todaysGMV = ordersToday.reduce(
      (sum, o) => sum + Number(o.totalAmount || o.total || o.amount || 0),
      0
    );

    const totalGMV = orders.reduce(
      (sum, o) => sum + Number(o.totalAmount || o.total || o.amount || 0),
      0
    );

    return {
      todaysGMV,
      totalGMV,
      totalBuyers: buyers.length,
      totalSellers: sellers.length,
      pendingSellers,
      activeProducts,
      openRFQs,
      totalOrders: orders.length,
      todaysOrders: ordersToday.length,
      successfulPayments,
      pendingPayments,
      shipmentsInTransit,
      deliveredToday,
      totalDelivered,
      pendingProducts,
    };
  }

  // ANALYTICS & REPORTS AGGREGATIONS (MEMBER 5)
  getReportData() {
    const orders = this.getOrders();
    const payments = this.getPayments();
    const categories = this.getCategories();
    const products = this.getProducts();
    const buyers = this.getBuyers();
    const sellers = this.getSellers();
    const rfqs = this.getRFQs();

    // Sales by Date computed from actual orders
    const salesByDateMap = {};
    orders.forEach((o) => {
      const d = o.date || (o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Recent");
      if (!salesByDateMap[d]) salesByDateMap[d] = { date: d, orders: 0, gmv: 0 };
      salesByDateMap[d].orders += 1;
      salesByDateMap[d].gmv += Number(o.totalAmount || o.amount || 0);
    });
    const salesByDate = Object.values(salesByDateMap);

    // Sales by Category
    const salesByCategory = categories.map((cat) => {
      const catOrders = orders.filter((o) => o.categoryName === cat.name || o.categoryId === cat.id);
      return {
        category: cat.name,
        gmv: catOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
        ordersCount: catOrders.length,
      };
    });

    // Sales by Seller
    const salesBySeller = sellers.map((sel) => {
      const selOrders = orders.filter((o) => String(o.sellerId || o.seller?.id) === String(sel.id || sel.sellerId));
      return {
        seller: sel.businessName || sel.name || "Seller",
        gmv: selOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
        ordersCount: selOrders.length,
        rating: sel.rating || 5.0,
      };
    });

    // Top Products from live products/orders
    const topProducts = products.slice(0, 5).map((p) => ({
      name: p.name || p.title || "Product",
      sku: p.sku || "—",
      volume: `${p.stockQty || 0} ${p.unit || "units"}`,
      revenue: Number(p.price || 0) * Number(p.salesCount || 0),
    }));

    // Top Buyers
    const topBuyers = buyers.map((buy) => ({
      name: buy.name,
      company: buy.company,
      ordersCount: Number(buy.totalOrders || 0),
      totalSpent: Number(buy.totalSpent || 0),
    })).sort((a, b) => b.totalSpent - a.totalSpent);

    // Order Status Distribution
    const orderStatusSummary = {
      Processing: orders.filter((o) => (o.status || o.orderStatus) === "Processing").length,
      Confirmed: orders.filter((o) => (o.status || o.orderStatus) === "Confirmed").length,
      Shipped: orders.filter((o) => (o.status || o.orderStatus) === "Shipped").length,
      Delivered: orders.filter((o) => (o.status || o.orderStatus) === "Delivered").length,
      Cancelled: orders.filter((o) => (o.status || o.orderStatus) === "Cancelled").length,
    };

    // Payment Summary
    const paymentSummary = {
      Success: payments.filter((p) => (p.paymentStatus || "").toUpperCase() === "SUCCESS").length,
      Pending: payments.filter((p) => (p.paymentStatus || "").toUpperCase() === "PENDING").length,
      Failed: payments.filter((p) => (p.paymentStatus || "").toUpperCase() === "FAILED").length,
      Refunded: payments.filter((p) => (p.paymentStatus || "").toUpperCase() === "REFUNDED").length,
      TotalCollected: payments.filter((p) => p.paymentStatus === "Success").reduce((s, p) => s + p.amount, 0),
    };

    return {
      salesByDate,
      salesByCategory,
      salesBySeller,
      topProducts,
      topBuyers,
      openRFQs: rfqs,
      orderStatusSummary,
      paymentSummary,
    };
  }
}

export const dataStore = new DynamicDataStore();
export default dataStore;
