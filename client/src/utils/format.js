export const BANK_NAME = "Adnate Bank";

export const formatCurrency = (amount) =>
  `₹ ${Number(amount || 0).toLocaleString("en-IN")}`;

export const formatCompactCurrency = (value) => {
  const num = Number(value || 0);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: num >= 100000 ? "compact" : "standard",
  }).format(num);
  return formatted.replace(/INR|Rs\./g, "₹").trim();
};

export const maskAccountNumber = (accountNumber) => {
  const value = String(accountNumber || "");
  return value ? `XXXX XXXX ${value.slice(-4)}` : "Not assigned";
};
