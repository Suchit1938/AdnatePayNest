export const BANK_NAME = "Adnate Bank";

export const formatCurrency = (amount) =>
  `INR ${Number(amount || 0).toLocaleString("en-IN")}`;

export const maskAccountNumber = (accountNumber) => {
  const value = String(accountNumber || "");
  return value ? `XXXX XXXX ${value.slice(-4)}` : "Not assigned";
};
