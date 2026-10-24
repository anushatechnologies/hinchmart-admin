/**
 * Robust date and relative time utilities for tickets, orders, and messages
 * Handles UTC vs local timezone mismatches, missing timezone suffixes (e.g. from MySQL),
 * and epoch timestamp extraction from ticket identifiers (e.g. STKT-1792126191499).
 */

export const parseTicketDate = (dateVal, fallbackId = null) => {
  // If dateVal is missing or null, attempt to extract epoch ms from fallbackId
  if (!dateVal && fallbackId) {
    const numericPart = String(fallbackId).replace(/\D/g, "");
    if (numericPart.length >= 12 && Number(numericPart) > 1600000000000) {
      return new Date(Number(numericPart));
    }
  }

  if (!dateVal) return new Date();

  // If already a number or numeric epoch string
  if (typeof dateVal === "number" || /^\d{12,14}$/.test(String(dateVal).trim())) {
    return new Date(Number(dateVal));
  }

  let str = String(dateVal).trim();
  // Standardize "YYYY-MM-DD HH:mm:ss" to ISO "YYYY-MM-DDTHH:mm:ss"
  str = str.replace(" ", "T");

  // If missing timezone indicator (Z or +/-), treat as UTC timestamp
  if (
    !str.includes("Z") &&
    !str.includes("+") &&
    !/-\d{2}:\d{2}$/.test(str) &&
    !/-\d{4}$/.test(str)
  ) {
    str += "Z";
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // Fallback to ID timestamp if date parsing failed
  if (fallbackId) {
    const numericPart = String(fallbackId).replace(/\D/g, "");
    if (numericPart.length >= 12 && Number(numericPart) > 1600000000000) {
      return new Date(Number(numericPart));
    }
  }

  return new Date();
};

/**
 * Formats relative time ("6h ago", "18h ago", "2d ago", "Just now")
 * Handles negative diffs (future / clock skew) gracefully so it never shows "Just now" for old tickets.
 */
export const formatTimeAgo = (dateVal, fallbackId = null) => {
  if (!dateVal && !fallbackId) return "Just now";
  try {
    const d = parseTicketDate(dateVal, fallbackId);
    const timeMs = d.getTime();
    if (isNaN(timeMs)) return "Just now";

    const now = Date.now();
    const diff = now - timeMs;

    // Small clock skew within 2 minutes
    if (diff >= -120000 && diff < 60000) return "Just now";

    // If future by more than 2 minutes (e.g. server timezone ahead), format as clean time/date
    if (diff < -120000) {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "Just now";
  }
};

export const formatTicketDate = (dateVal, fallbackId = null) => {
  try {
    const d = parseTicketDate(dateVal, fallbackId);
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
};

export const formatTicketTime = (dateVal, fallbackId = null) => {
  try {
    const d = parseTicketDate(dateVal, fallbackId);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};
