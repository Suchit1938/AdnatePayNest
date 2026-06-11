export const tierColorClasses = {
  platinum: {
    badge: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    card: "border-indigo-200 bg-indigo-50 text-indigo-800",
    dot: "#4f46e5",
  },
  gold: {
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    card: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "#d97706",
  },
  silver: {
    badge: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    card: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "#64748b",
  },
};

export const getTierTone = (tier) =>
  tierColorClasses[String(tier || "").toLowerCase()] || {
    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    card: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "#2563eb",
  };

export const transactionStatusLabels = {
  failed: "Rejected",
  rejected: "Rejected",
  success: "Completed",
  completed: "Completed",
  pending: "Pending",
  approved: "Approved",
};

export const getTransactionStatusLabel = (status) =>
  transactionStatusLabels[String(status || "").toLowerCase()] || status || "Unknown";
