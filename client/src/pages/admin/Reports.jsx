import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeIndianRupee,
  Clock3,
  CreditCard,
  Download,
  FileBarChart,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import {
  RechartsColumn,
  RechartsDonut,
  RechartsHorizontalBar,
} from "../../components/ui/RechartsReports";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency } from "../../utils/format";
import { downloadPdf } from "../../utils/pdfExport";
import { getTierTone, getTransactionStatusLabel } from "../../utils/ui";

const toNumber = (value) => Number(value || 0);

const formatCompactCurrency = (value) => {
  const num = toNumber(value);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: num >= 100000 ? "compact" : "standard",
  }).format(num);
  return formatted.replace(/INR|Rs\./g, "₹").trim();
};

const percentOf = (value, total) =>
  total > 0 ? Math.round((toNumber(value) / total) * 100) : 0;

const dateRangeOptions = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const exportSequenceFallback = new Map();

const getNextExportSequence = (exportName, fileType) => {
  const key = `adnate-report-export:${exportName}:${fileType}`;

  try {
    const currentValue = Number(window.localStorage.getItem(key) || 0);
    const nextValue = currentValue + 1;

    window.localStorage.setItem(key, String(nextValue));
    return String(nextValue).padStart(3, "0");
  } catch {
    const nextValue = (exportSequenceFallback.get(key) || 0) + 1;

    exportSequenceFallback.set(key, nextValue);
    return String(nextValue).padStart(3, "0");
  }
};

const formatReportDate = (value) => {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const formatStatus = (value) => getTransactionStatusLabel(value || "unknown");
const formatReportLabel = (value) =>
  String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getDateRangeBounds = ({ preset, startDate, endDate }) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start = null;

  if (preset === "today") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "7d") {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "30d") {
    start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "custom") {
    start = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const customEnd = endDate ? new Date(`${endDate}T23:59:59`) : null;

    return {
      start: start && !Number.isNaN(start.getTime()) ? start : null,
      end: customEnd && !Number.isNaN(customEnd.getTime()) ? customEnd : null,
    };
  }

  return { start, end: preset === "all" ? null : end };
};

const isWithinDateRange = (value, range) => {
  if (!range.start && !range.end) return true;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;

  return true;
};

const maskAccountNumber = (value) => {
  const accountNumber = String(value || "").trim();

  if (!accountNumber) return "Not available";
  return accountNumber.length <= 4
    ? accountNumber
    : `XXXX${accountNumber.slice(-4)}`;
};

const buildCsv = (rows) => {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    headers.map((header) => escapeCell(header)).join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\r\n");
};

const downloadFile = (filename, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadCsv = (filename, rows) => {
  const csv = buildCsv(rows);
  downloadFile(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8;");
};

const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
  exportLabel,
  exportName,
  exportRows,
  exportPdfRows,
  exportPdfOptions,
  className = "mb-5",
}) => {
  const toast = useToast();

  const handleCsvDownload = () => {
    try {
      const sequence = getNextExportSequence(exportName, "csv");

      downloadCsv(`${exportName}-${sequence}.csv`, exportRows);
      toast.success(`${exportLabel || title} CSV downloaded.`);
    } catch {
      toast.error("Unable to download CSV. Please try again.");
    }
  };

  const handlePdfDownload = () => {
    try {
      const sequence = getNextExportSequence(exportName, "pdf");

      downloadPdf(
        `${exportName}-${sequence}.pdf`,
        exportLabel || title,
        exportPdfRows || exportRows,
        {
          subtitle: `Generated on ${formatReportDate(new Date())}`,
          ...exportPdfOptions,
        }
      );
      toast.success(`${exportLabel || title} PDF downloaded.`);
    } catch {
      toast.error("Unable to download PDF. Please try again.");
    }
  };

  return (
    <div className={`${className} flex flex-wrap items-start justify-between gap-4`}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 rounded-lg bg-blue-50 p-2.5 text-blue-700">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>
        </div>
      </div>
      {exportRows && (
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm">
          <button
            type="button"
            onClick={handleCsvDownload}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-bank-surface"
          >
            <Download size={16} />
            CSV
          </button>
          <button
            type="button"
            onClick={handlePdfDownload}
            className="inline-flex items-center gap-2 border-l border-bank-card-border px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-bank-surface"
          >
            <Download size={16} />
            PDF
          </button>
          <span className="hidden border-l border-bank-card-border px-3 py-2 text-sm font-semibold text-slate-500 sm:inline">
            {exportLabel || "Export"}
          </span>
        </div>
      )}
    </div>
  );
};

const EmptyTableRow = ({ colSpan, message }) => (
  <tr>
    <td colSpan={colSpan} className="px-6 py-8 text-center text-sm font-semibold text-slate-500">
      {message}
    </td>
  </tr>
);

const StatusBadge = ({ status }) => {
  const normalized = String(status || "").toLowerCase();
  const label = formatReportLabel(getTransactionStatusLabel(status));
  const toneByStatus = {
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    failed: "bg-red-50 text-red-700 ring-1 ring-red-100",
    rejected: "bg-red-50 text-red-700 ring-1 ring-red-100",
    inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
    suspended: "bg-red-50 text-red-700 ring-1 ring-red-100",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${toneByStatus[normalized] || "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
      {label}
    </span>
  );
};

const HorizontalBarChart = ({ rows, valueFormatter = (value) => value }) => (
  <RechartsHorizontalBar
    rows={rows}
    valueFormatter={valueFormatter}
    emptyMessage="No transfer records to chart for this view."
  />
);

const ColumnChart = ({ rows, valueFormatter = (value) => value }) => {
  return (
    <RechartsColumn
      rows={rows}
      valueFormatter={valueFormatter}
      emptyMessage="No transfer split is available for this view."
    />
  );
};

const DonutChart = ({ rows }) => {
  return (
    <RechartsDonut
      rows={rows}
      emptyMessage="No approval records to chart for this view."
    />
  );
};

const getCustomerAccounts = (customer) =>
  customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean);

const ACCOUNT_TYPES = ["Savings", "Current", "Salary"];

const getTierAccountTypeRules = (tier) =>
  ACCOUNT_TYPES.map((accountType) => {
    const rule = (tier?.accountTypeOdRules || []).find(
      (item) => item.accountType === accountType
    );

    return {
      accountType,
      odLimit: toNumber(rule?.odLimit ?? tier?.maxODLimit),
      minOpeningBalance: toNumber(rule?.minOpeningBalance ?? tier?.minBalance),
      monthlyOdUses: toNumber(rule?.monthlyOdUses || 3),
    };
  });

const formatTierAccountTypeRules = (tier) =>
  getTierAccountTypeRules(tier)
    .map((rule) =>
      [
        `${rule.accountType}: limit ${formatCurrency(rule.odLimit)}`,
        `minimum opening ${formatCurrency(rule.minOpeningBalance)}`,
        `${rule.monthlyOdUses}/month`,
      ].join(", ")
    )
    .join(" | ");

const formatAccountTypeRule = (rule) =>
  [
    `${rule.accountType}: OD ${formatCurrency(rule.odLimit)}`,
    `opening ${formatCurrency(rule.minOpeningBalance)}`,
    `${rule.monthlyOdUses}/month`,
  ].join(", ");

const AccountTypeOdRulesTable = ({ tier }) => (
  <div className="overflow-hidden rounded-lg border border-slate-100">
    <div className="hidden grid-cols-[1fr_1.15fr_1.15fr_0.8fr] gap-0 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 sm:grid">
      <span>Account</span>
      <span>OD Limit</span>
      <span>Opening Balance</span>
      <span>Uses</span>
    </div>
    <div className="divide-y divide-slate-100">
      {getTierAccountTypeRules(tier).map((rule) => (
        <div
          key={rule.accountType}
          className="grid grid-cols-2 gap-3 px-3 py-3 text-sm sm:grid-cols-[1fr_1.15fr_1.15fr_0.8fr] sm:gap-0"
        >
          <span className="min-w-0 font-bold text-slate-900">
            <span className="block text-xs font-bold uppercase text-slate-400 sm:hidden">
              Account
            </span>
            {rule.accountType}
          </span>
          <span className="min-w-0 break-words font-semibold text-slate-700">
            <span className="block text-xs font-bold uppercase text-slate-400 sm:hidden">
              OD Limit
            </span>
            {formatCurrency(rule.odLimit)}
          </span>
          <span className="min-w-0 break-words font-semibold text-slate-700">
            <span className="block text-xs font-bold uppercase text-slate-400 sm:hidden">
              Opening
            </span>
            {formatCurrency(rule.minOpeningBalance)}
          </span>
          <span className="min-w-0 font-semibold text-slate-700">
            <span className="block text-xs font-bold uppercase text-slate-400 sm:hidden">
              Uses
            </span>
            {rule.monthlyOdUses}/mo
          </span>
        </div>
      ))}
    </div>
  </div>
);

const PolicyMetric = ({ label, value }) => (
  <div className="rounded-lg bg-bank-surface px-4 py-3">
    <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
      {label}
    </p>
    <p className="mt-1 break-words font-bold text-slate-950">{value}</p>
  </div>
);

const getAccountDisplay = (accountNumber, accountByNumber) => {
  const normalizedAccountNumber = normalizeIdentifier(accountNumber);
  const account = accountByNumber.get(normalizedAccountNumber);
  const accountType = account?.accountType || "Account";

  return accountNumber
    ? `${accountType} / ${maskAccountNumber(accountNumber)}`
    : "Not available";
};

const formatAccountOdBreakdown = (accounts = []) =>
  accounts.length
    ? accounts
        .map((account) => {
          const used = toNumber(account.overdraftUsed);
          const limit = toNumber(account.overdraftLimit);
          const uses = toNumber(account.odCountThisMonth);
          const status = account.odBlocked ? "blocked" : limit > 0 ? "available" : "not enabled";

          return [
            account.accountType || "Account",
            `${formatCurrency(used)} used of ${formatCurrency(limit)}`,
            `${uses}/3 uses`,
            status,
          ].join(", ");
        })
        .join(" | ")
    : "No account OD data";

const normalizeIdentifier = (value) => String(value || "").trim().toLowerCase();

const defaultLoanAnalytics = {
  summary: {
    totalLoans: 0,
    activeLoans: 0,
    disbursedLoans: 0,
    outstandingBalance: 0,
    repaymentCount: 0,
    delinquentAccounts: 0,
    delinquentAmount: 0,
    expectedEmiAmount: 0,
    collectedAmount: 0,
    collectionRate: 0,
  },
  loanRows: [],
  repaymentRows: [],
  emiRows: [],
  delinquentRows: [],
  distributionRows: [],
  statusRows: [],
  emiTrendRows: [],
};

const loanChartColors = ["#2563eb", "#0891b2", "#10b981", "#f59e0b", "#ef4444", "#7c3aed"];

const AdminReports = () => {
  const [activeHash, setActiveHash] = useState(window.location.hash || "#transactions");
  const [users, setUsers] = useState({ customers: [] });
  const [tiers, setTiers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loanAnalytics, setLoanAnalytics] = useState(defaultLoanAnalytics);
  const [dateFilter, setDateFilter] = useState({
    preset: "30d",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    const handleHashChange = () => {
      setActiveHash(window.location.hash || "#transactions");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.get("/users"),
      api.get("/tiers"),
      api.get("/approvals"),
      api.get("/transfers/transactions"),
      api.get("/dashboard/admin/loan-analytics"),
    ]).then(([usersResult, tiersResult, approvalsResult, transactionsResult, loansResult]) => {
      const usersData = usersResult.status === "fulfilled" ? usersResult.value.data : {};

      setUsers({
        customers: usersData.customers || [],
      });
      setTiers(tiersResult.status === "fulfilled" ? tiersResult.value.data.tiers || [] : []);
      setApprovals(approvalsResult.status === "fulfilled" ? approvalsResult.value.data.approvals || [] : []);
      setTransactions(
        transactionsResult.status === "fulfilled"
          ? transactionsResult.value.data.transactions || []
          : []
      );
      setLoanAnalytics(
        loansResult.status === "fulfilled"
          ? { ...defaultLoanAnalytics, ...loansResult.value.data }
          : defaultLoanAnalytics
      );
    });
  }, []);

  const reportData = useMemo(() => {
    const dateRange = getDateRangeBounds(dateFilter);
    const filteredTransactions = transactions.filter((transaction) =>
      isWithinDateRange(transaction.date || transaction.createdAt, dateRange)
    );
    const filteredApprovals = approvals.filter((approval) =>
      isWithinDateRange(approval.updatedAt || approval.requestedOn, dateRange)
    );
    const accountByNumber = users.customers.reduce((map, customer) => {
      getCustomerAccounts(customer).forEach((account) => {
        const key = normalizeIdentifier(account.accountNumber);

        if (key) {
          map.set(key, {
            ...account,
            customerName: customer.name,
            customerId: customer.customerId,
          });
        }
      });

      return map;
    }, new Map());
    const totalTransferValue = filteredTransactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.amount),
      0
    );
    const highValueTransfers = [...filteredTransactions]
      .sort((a, b) => toNumber(b.amount) - toNumber(a.amount))
      .map((transaction) => ({
        ...transaction,
        fromAccountDisplay: getAccountDisplay(transaction.fromAccountNumber, accountByNumber),
        toAccountDisplay: getAccountDisplay(transaction.toAccountNumber, accountByNumber),
      }));
    const volumeByDate = filteredTransactions.reduce((map, transaction) => {
      const date = transaction.date || String(transaction.createdAt || "").slice(0, 10) || "Unknown";
      map.set(date, (map.get(date) || 0) + 1);
      return map;
    }, new Map());
    const transferVolumeRows = [...volumeByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([label, value], index) => ({
        label,
        value,
        color: ["#2563eb", "#0891b2", "#059669", "#7c3aed"][index % 4],
      }));
    const ownTransfers = filteredTransactions.filter(
      (transaction) =>
        transaction.sender === transaction.receiver ||
        transaction.fromAccountNumber === transaction.toAccountNumber
    );
    const beneficiaryTransfers = filteredTransactions.filter(
      (transaction) => !ownTransfers.includes(transaction)
    );
    const splitRows = [
      { label: "Beneficiary", value: beneficiaryTransfers.length, color: "#2563eb" },
      { label: "Own Account", value: ownTransfers.length, color: "#14b8a6" },
    ];

    const transactionUsageByCustomer = filteredTransactions.reduce((map, transaction) => {
      const amount = toNumber(transaction.amount);
      const accountKeys = [
        transaction.fromAccountNumber,
        transaction.senderAccount,
        transaction.accountNumber,
      ]
        .map(normalizeIdentifier)
        .filter(Boolean);
      const nameKey = normalizeIdentifier(transaction.sender);

      users.customers.forEach((customer) => {
        const accounts = getCustomerAccounts(customer);
        const customerKeys = [
          customer.customerId,
          customer.name,
          customer.email,
          customer.account?.accountNumber,
          ...accounts.map((account) => account.accountNumber),
        ]
          .map(normalizeIdentifier)
          .filter(Boolean);
        const isCustomerTransaction =
          customerKeys.some((key) => accountKeys.includes(key)) ||
          (nameKey && customerKeys.includes(nameKey));

        if (!isCustomerTransaction) return;

        const current = map.get(customer.customerId) || { count: 0, amount: 0 };
        map.set(customer.customerId, {
          count: current.count + 1,
          amount: current.amount + amount,
        });
      });

      return map;
    }, new Map());

    const customerRows = users.customers.map((customer) => {
      const accounts = getCustomerAccounts(customer);
      const balance = accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
      const transactionUsage = transactionUsageByCustomer.get(customer.customerId) || {
        count: 0,
        amount: 0,
      };
      const overdraftUsed = Math.max(
        toNumber(customer.account?.overdraftUsed),
        ...accounts.map((account) => toNumber(account.overdraftUsed))
      );
      const overdraftLimit = Math.max(
        toNumber(customer.account?.overdraftLimit),
        ...accounts.map((account) => toNumber(account.overdraftLimit))
      );
      const odUsesThisMonth = Math.max(
        toNumber(customer.account?.odCountThisMonth),
        ...accounts.map((account) => toNumber(account.odCountThisMonth))
      );
      const odBlockedThisMonth =
        customer.account?.odBlocked || accounts.some((account) => account.odBlocked);
      const hasOutstandingExposure =
        balance > 0 || overdraftUsed > 0 || odBlockedThisMonth || odUsesThisMonth > 0;
      const isActiveCustomer = customer.status === "active";

      return {
        ...customer,
        isActiveCustomer,
        hasOutstandingExposure,
        accountCount: accounts.length,
        accountOdBreakdown: formatAccountOdBreakdown(accounts),
        balance,
        overdraftUsed,
        overdraftLimit,
        odUsesThisMonth,
        odBlockedThisMonth,
        hasReachedMonthlyOdLimit: odUsesThisMonth >= 3 || odBlockedThisMonth,
        transactionCount: transactionUsage.count,
        transactionAmount: transactionUsage.amount,
        odUsage: percentOf(overdraftUsed, overdraftLimit),
      };
    });
    const operationalCustomerRows = customerRows.filter(
      (customer) => customer.isActiveCustomer || customer.hasOutstandingExposure
    );
    const activeCustomerRows = customerRows.filter((customer) => customer.isActiveCustomer);
    const nearOdLimitRows = customerRows
      .filter(
        (customer) =>
          customer.overdraftLimit > 0 &&
          (customer.isActiveCustomer || customer.hasOutstandingExposure) &&
          (customer.hasReachedMonthlyOdLimit || customer.odUsesThisMonth >= 2 || customer.odUsage >= 70)
      )
      .sort(
        (a, b) =>
          Number(b.hasReachedMonthlyOdLimit) - Number(a.hasReachedMonthlyOdLimit) ||
          b.odUsesThisMonth - a.odUsesThisMonth ||
          b.overdraftUsed - a.overdraftUsed ||
          b.odUsage - a.odUsage ||
          b.transactionAmount - a.transactionAmount ||
          b.transactionCount - a.transactionCount
      );
    const odAttemptsUsed = customerRows.filter(
      (customer) =>
        (customer.isActiveCustomer || customer.hasOutstandingExposure) &&
        getCustomerAccounts(customer).some((account) => toNumber(account.odCountThisMonth) >= 3)
    ).length;
    const odBlocked = customerRows.filter(
      (customer) =>
        (customer.isActiveCustomer || customer.hasOutstandingExposure) &&
        getCustomerAccounts(customer).some((account) => account.odBlocked)
    ).length;
    const odByTierRows = tiers.map((tier) => {
      const tierCustomers = operationalCustomerRows.filter(
        (customer) => customer.classification === tier.key
      );
      const used = tierCustomers.reduce((sum, customer) => sum + customer.overdraftUsed, 0);
      const limit = tierCustomers.reduce((sum, customer) => sum + customer.overdraftLimit, 0);

      return {
        label: tier.label,
        value: used,
        limit,
        color: getTierTone(tier.key).dot,
      };
    });

    const approvalStatusRows = [
      { label: "Pending", value: filteredApprovals.filter((item) => item.status === "pending").length, color: "#f59e0b" },
      { label: "Approved", value: filteredApprovals.filter((item) => item.status === "approved").length, color: "#10b981" },
      { label: "Rejected", value: filteredApprovals.filter((item) => item.status === "rejected").length, color: "#ef4444" },
    ];
    const approvalDetailRows = [...filteredApprovals]
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.requestedOn || 0).getTime() -
          new Date(a.updatedAt || a.requestedOn || 0).getTime()
      )
      .map((approval) => ({
        ...approval,
        fromAccountDisplay: getAccountDisplay(approval.account, accountByNumber),
        toAccountDisplay: getAccountDisplay(approval.toAccount, accountByNumber),
      }));
    const tierDistributionRows = tiers.map((tier) => ({
      label: tier.label,
      value: activeCustomerRows.filter((customer) => customer.classification === tier.key).length,
      color: getTierTone(tier.key).dot,
    }));
    return {
      totalTransferValue,
      highValueTransfers,
      transferVolumeRows,
      splitRows,
      customerRows,
      nearOdLimitRows,
      odAttemptsUsed,
      odBlocked,
      odByTierRows,
      approvalStatusRows,
      approvalDetailRows,
      tierDistributionRows,
      accountByNumber,
      dateRange,
    };
  }, [approvals, dateFilter, tiers, transactions, users]);

  const transferRegisterRows = reportData.highValueTransfers.map((transaction) => ({
    "Transfer ID": transaction.id || "Not available",
    "Sender": transaction.sender || "Not available",
    "Receiver": transaction.receiver || "Not available",
    "From Account": transaction.fromAccountDisplay || transaction.fromAccountNumber || "Not available",
    "To Account": transaction.toAccountDisplay || transaction.toAccountNumber || "Not available",
    "Amount": formatCurrency(transaction.amount || 0),
    "Status": formatStatus(transaction.status),
    "Transfer Date": formatReportDate(transaction.date || transaction.createdAt),
  }));
  const transferStatusSummary = reportData.highValueTransfers.reduce((summary, transaction) => {
    const status = formatStatus(transaction.status);
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {});
  const transferPdfRows = [
    {
      Date: "",
      Details: "Report scope",
      "From Account": "All recorded transfers",
      "To Account": "",
      Amount: "",
    },
    {
      Date: "",
      Details: "Total transfer value",
      "From Account": `${reportData.highValueTransfers.length} transfers`,
      "To Account": "",
      Amount: formatCurrency(reportData.totalTransferValue),
    },
    {
      Date: "",
      Details: "Status summary",
      "From Account": Object.entries(transferStatusSummary)
        .map(([status, count]) => `${status}: ${count}`)
        .join(" | ") || "No transfers",
      "To Account": "",
      Amount: "",
    },
    ...reportData.highValueTransfers.map((transaction) => ({
      Date: formatReportDate(transaction.date || transaction.createdAt),
      Details: [
        `Transfer ${transaction.id || "Not available"}`,
        `${transaction.sender || "Not available"} to ${transaction.receiver || "Not available"}`,
        `Status: ${formatStatus(transaction.status)}`,
      ].join(" | "),
      "From Account": transaction.fromAccountDisplay || transaction.fromAccountNumber || "Not available",
      "To Account": transaction.toAccountDisplay || transaction.toAccountNumber || "Not available",
      Amount: formatCurrency(transaction.amount || 0),
    })),
  ];
  const odCsvRows = reportData.nearOdLimitRows.map((customer) => ({
    "Customer ID": customer.customerId,
    "Customer Name": customer.name,
    "Tier": customer.classification,
    "Account Level OD": customer.accountOdBreakdown,
    "Overdraft Used": formatCurrency(customer.overdraftUsed),
    "Overdraft Limit": formatCurrency(customer.overdraftLimit),
    "Limit Used": `${customer.odUsage}%`,
    "Monthly Overdraft Uses": `${customer.odUsesThisMonth}/3`,
    "Monthly Overdraft Status": customer.hasReachedMonthlyOdLimit ? "3/3 used - blocked this month" : `${customer.odUsesThisMonth}/3 used`,
    "Transfer Count": customer.transactionCount,
    "Transfer Value": formatCurrency(customer.transactionAmount),
    "Customer Status": customer.status,
    "Report Scope": customer.isActiveCustomer
      ? "Active"
      : "Inactive - outstanding exposure",
  }));
  const overdraftReportPdfRows = [
    {
      Category: "Watchlist Customers",
      Details: "Customers near or at overdraft attention threshold",
      Used: `${reportData.nearOdLimitRows.length}`,
      Limit: "",
      Status: "Review",
    },
    {
      Category: "Monthly Attempt Limit",
      Details: "Customers with all 3 monthly overdraft attempts used",
      Used: `${reportData.odAttemptsUsed}`,
      Limit: "3 attempts",
      Status: reportData.odAttemptsUsed > 0 ? "Action needed" : "Clear",
    },
    {
      Category: "Blocked Accounts",
      Details: "Accounts blocked after monthly overdraft attempt limit",
      Used: `${reportData.odBlocked}`,
      Limit: "",
      Status: reportData.odBlocked > 0 ? "Blocked" : "Clear",
    },
    ...reportData.odByTierRows.map((tier) => ({
      Category: tier.label,
      Details: "Tier overdraft usage",
      Used: formatCurrency(tier.value),
      Limit: formatCurrency(tier.limit),
      Status: `${percentOf(tier.value, tier.limit)}% used`,
    })),
  ];
  const nearOdPdfRows = [
    {
      Customer: "Report scope",
      "OD Used": "Customers near limit, 2+ monthly uses, or 3/3 blocked",
      "OD Limit": "",
      "Monthly Use": "",
      Status: "",
    },
    ...reportData.nearOdLimitRows.map((customer) => ({
      Customer: `${customer.name} (${customer.customerId})`,
      "Account OD": customer.accountOdBreakdown,
      "OD Used": formatCurrency(customer.overdraftUsed),
      "OD Limit": formatCurrency(customer.overdraftLimit),
      "Monthly Use": customer.hasReachedMonthlyOdLimit
        ? `${customer.odUsesThisMonth}/3 blocked`
        : `${customer.odUsesThisMonth}/3 used`,
      Status: customer.isActiveCustomer ? "Active" : "Inactive exposure",
    })),
  ];
  const approvalCsvRows = reportData.approvalDetailRows.map((approval) => ({
    "Approval ID": approval.id || "Not available",
    "Customer": approval.customer || "Not available",
    "Manager": approval.manager || "Unassigned",
    "From Account": approval.fromAccountDisplay || approval.account || "Not available",
    "To Account": approval.toAccountDisplay || approval.toAccount || "Not available",
    "Type": approval.type || "bank-transfer",
    "Amount": formatCurrency(approval.amount || 0),
    "Status": formatStatus(approval.status),
    "Requested On": formatReportDate(approval.requestedOn),
    "Reviewed On": approval.reviewedAt ? formatReportDate(approval.reviewedAt) : "Not reviewed",
    "Rejection Reason": approval.rejectionReason || "",
  }));
  const approvalPdfRows = [
    {
      "Approval ID": "Report scope",
      Customer: `${reportData.approvalDetailRows.length} approval request(s)`,
      Manager: Object.entries(
        reportData.approvalDetailRows.reduce((summary, approval) => {
          const status = formatStatus(approval.status);
          summary[status] = (summary[status] || 0) + 1;
          return summary;
        }, {})
      )
        .map(([status, count]) => `${status}: ${count}`)
        .join(" | ") || "No approvals",
      Route: "Customer, manager, account route, status, and decision details",
      Amount: "",
      Status: "",
      Reason: "",
    },
    ...reportData.approvalDetailRows.map((approval) => ({
      "Approval ID": approval.id || "Not available",
      Customer: approval.customer || "Not available",
      Manager: approval.manager || "Unassigned",
      Route: [
        `From ${approval.fromAccountDisplay || approval.account || "Not available"}`,
        `To ${approval.toAccountDisplay || approval.toAccount || "Not available"}`,
      ]
        .filter(Boolean)
        .join(" | "),
      Amount: formatCurrency(approval.amount || 0),
      Status: formatStatus(approval.status),
      Reason: approval.rejectionReason || "",
    })),
  ];
  const customerCsvRows = reportData.customerRows.map((customer) => ({
    "Customer ID": customer.customerId,
    "Customer Name": customer.name,
    "Email": customer.email,
    "Tier": customer.classification,
    "Account Count": customer.accountCount,
    "Account Level OD": customer.accountOdBreakdown,
    "Total Balance": formatCurrency(customer.balance),
    "Overdraft Used": formatCurrency(customer.overdraftUsed),
    "Monthly Overdraft Uses": `${customer.odUsesThisMonth}/3`,
    "Transfer Count": customer.transactionCount,
    "Transfer Value": formatCurrency(customer.transactionAmount),
    "Status": customer.status,
    "Report Scope": customer.isActiveCustomer
      ? "Active"
      : customer.hasOutstandingExposure
        ? "Inactive - outstanding exposure"
        : "Inactive - history only",
  }));
  const classificationCsvRows = tiers.map((tier) => ({
    "Classification": tier.label,
    "Key": tier.key,
    "Assigned Customers": tier.customerCount,
    "Per Transfer Limit": formatCurrency(tier.perTxnLimit),
    "Daily Limit": formatCurrency(tier.dailyLimit),
    "Monthly Limit": formatCurrency(tier.monthlyLimit),
    "Overdraft Limit": formatCurrency(tier.maxODLimit),
    "Savings OD Rule": formatAccountTypeRule(
      getTierAccountTypeRules(tier).find((rule) => rule.accountType === "Savings")
    ),
    "Current OD Rule": formatAccountTypeRule(
      getTierAccountTypeRules(tier).find((rule) => rule.accountType === "Current")
    ),
    "Salary OD Rule": formatAccountTypeRule(
      getTierAccountTypeRules(tier).find((rule) => rule.accountType === "Salary")
    ),
    "Penalty Amount": formatCurrency(tier.penaltyAmount),
    "Interest Rate": tier.interestRate || tier.lateFeeRate,
    "Overdraft Blocked Accounts": tier.odBlockedAccounts,
    "Monthly Overdraft Attempt Limit": 3,
    "Settlement Rule": "Clear before month-end",
  }));
  const classificationPdfRows = [
    {
      Classification: "Report scope",
      Customers: `${reportData.customerRows.length} customers`,
      "Transfer Limits": "Per transfer, daily, and monthly policy limits",
      "Account-wise OD": "OD limit, opening balance, and monthly usage by account type",
      Charges: "Interest and penalty",
    },
    ...tiers.map((tier) => ({
      Classification: tier.label,
      Customers: `${tier.customerCount} assigned`,
      "Transfer Limits": [
        `Per transfer ${formatCurrency(tier.perTxnLimit)}`,
        `Daily ${formatCurrency(tier.dailyLimit)}`,
        `Monthly ${formatCurrency(tier.monthlyLimit)}`,
      ].join(" | "),
      "Account-wise OD": formatTierAccountTypeRules(tier),
      Charges: [
        `Penalty ${formatCurrency(tier.penaltyAmount)}`,
        `Interest ${tier.interestRate || tier.lateFeeRate || "Not set"}`,
        "Settle before month-end",
      ].join(" | "),
    })),
  ];
  const filteredRepaymentRows = loanAnalytics.repaymentRows.filter((entry) =>
    isWithinDateRange(entry.paidAt, reportData.dateRange)
  );
  const loanDistributionRows = loanAnalytics.distributionRows.map((row, index) => ({
    ...row,
    color: loanChartColors[index % loanChartColors.length],
  }));
  const loanStatusRows = loanAnalytics.statusRows.map((row, index) => ({
    ...row,
    label: formatReportLabel(row.label),
    color: loanChartColors[index % loanChartColors.length],
  }));
  const emiDueTrendRows = loanAnalytics.emiTrendRows.map((row, index) => ({
    label: row.label,
    value: row.due,
    color: loanChartColors[index % loanChartColors.length],
  }));
  const repaymentTypeRows = ["emi", "auto_emi", "part_payment", "foreclosure", "failed_emi"].map(
    (paymentType, index) => ({
      label: formatReportLabel(paymentType),
      value: filteredRepaymentRows.filter((entry) => entry.paymentType === paymentType).length,
      amount: filteredRepaymentRows
        .filter((entry) => entry.paymentType === paymentType && entry.status === "success")
        .reduce((sum, entry) => sum + toNumber(entry.amount), 0),
      color: loanChartColors[index % loanChartColors.length],
    })
  );
  const loanPortfolioCsvRows = loanAnalytics.loanRows.map((loan) => ({
    "Loan ID": loan.id,
    "Customer": loan.customerName,
    "Customer ID": loan.customerCode,
    "Loan Type": loan.loanTypeLabel,
    "Status": formatReportLabel(loan.status),
    "Sanctioned Amount": formatCurrency(loan.amount),
    "Monthly EMI": formatCurrency(loan.emiAmount),
    "Outstanding Balance": formatCurrency(loan.outstandingBalance),
    "Paid Amount": formatCurrency(loan.paidAmount),
    "Delinquent EMIs": loan.delinquentEmiCount,
    "Delinquent Amount": formatCurrency(loan.delinquentAmount),
  }));
  const repaymentCsvRows = filteredRepaymentRows.map((entry) => ({
    "Loan ID": entry.loanId,
    "Customer": entry.customerName,
    "Customer ID": entry.customerCode,
    "Payment Type": formatReportLabel(entry.paymentType),
    "Amount": formatCurrency(entry.amount),
    "Principal": formatCurrency(entry.principalPaid),
    "Interest": formatCurrency(entry.interestPaid),
    "Penalty": formatCurrency(entry.penaltyPaid),
    "Part-Payment Charge": formatCurrency(entry.partPaymentCharge),
    "Total Debited": formatCurrency(entry.totalDebited || entry.amount),
    "Repayment Impact": formatReportLabel(entry.repaymentImpact),
    "Foreclosure Fee": formatCurrency(entry.foreclosureFeePaid),
    "Status": formatReportLabel(entry.status),
    "Transaction ID": entry.transactionId,
    "Paid On": formatReportDate(entry.paidAt),
  }));
  const delinquentLoanCsvRows = loanAnalytics.delinquentRows.map((loan) => ({
    "Loan ID": loan.id,
    "Customer": loan.customerName,
    "Customer ID": loan.customerCode,
    "Loan Type": loan.loanTypeLabel,
    "Outstanding Balance": formatCurrency(loan.outstandingBalance),
    "Delinquent EMIs": loan.delinquentEmiCount,
    "Delinquent Amount": formatCurrency(loan.delinquentAmount),
    "Next Due Date": formatReportDate(loan.nextDueDate),
    "Status": formatReportLabel(loan.status),
  }));
  const loanAnalyticsPdfRows = [
    {
      Metric: "Active loans",
      Value: loanAnalytics.summary.activeLoans,
      Details: `${loanAnalytics.summary.disbursedLoans} disbursed loan(s)`,
    },
    {
      Metric: "Outstanding balances",
      Value: formatCurrency(loanAnalytics.summary.outstandingBalance),
      Details: "Principal, accrued interest, and penalties on active loans",
    },
    {
      Metric: "Repayment history",
      Value: filteredRepaymentRows.length,
      Details: "Repayments matching the selected report period",
    },
    {
      Metric: "Delinquent accounts",
      Value: loanAnalytics.summary.delinquentAccounts,
      Details: formatCurrency(loanAnalytics.summary.delinquentAmount),
    },
    {
      Metric: "Collection performance",
      Value: `${loanAnalytics.summary.collectionRate}%`,
      Details: `${formatCurrency(loanAnalytics.summary.collectedAmount)} collected of ${formatCurrency(loanAnalytics.summary.expectedEmiAmount)} scheduled`,
    },
  ];
  const highValuePagination = usePaginatedRows(reportData.highValueTransfers);
  const loanPortfolioPagination = usePaginatedRows(loanAnalytics.loanRows);
  const repaymentPagination = usePaginatedRows(filteredRepaymentRows);
  const delinquentLoanPagination = usePaginatedRows(loanAnalytics.delinquentRows);
  const nearOdPagination = usePaginatedRows(reportData.nearOdLimitRows);
  const approvalPagination = usePaginatedRows(reportData.approvalDetailRows);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Reports"
          title="Reports & Analytics"
          subtitle="Operational reporting for transfers, overdraft monitoring, approval workflow, and customer accounts."
        />
        <div className="flex flex-wrap gap-2 rounded-2xl border border-bank-card-border bg-white p-3 shadow-sm">
          {[
            ["Transactions", "#transactions"],
            ["Loans", "#loans"],
            ["Overdraft", "#overdraft"],
            ["Approvals", "#approvals"],
            ["Customers", "#customers"],
            ["Classifications", "#classifications"],
          ].map(([label, href]) => {
            const isActive = activeHash === href;
            return (
              <a
                key={label}
                href={href}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-bank-sidebar text-white shadow-sm hover:bg-bank-sidebar-hover"
                    : "text-slate-600 hover:bg-bank-surface hover:text-bank-eyebrow"
                }`}
              >
                {label}
              </a>
            );
          })}
        </div>

        <section className="rounded-2xl border border-bank-card-border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <label className="label-field">
              <span>Report Date Range</span>
              <select
                value={dateFilter.preset}
                onChange={(event) =>
                  setDateFilter((current) => ({
                    ...current,
                    preset: event.target.value,
                  }))
                }
                className="input-field"
              >
                {dateRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {dateFilter.preset === "custom" && (
              <>
                <label className="label-field">
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={dateFilter.startDate}
                    onChange={(event) =>
                      setDateFilter((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                    className="input-field"
                  />
                </label>
                <label className="label-field">
                  <span>End Date</span>
                  <input
                    type="date"
                    value={dateFilter.endDate}
                    onChange={(event) =>
                      setDateFilter((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                    className="input-field"
                  />
                </label>
              </>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Showing records for{" "}
            {dateFilter.preset === "all"
              ? "all available dates"
              : dateFilter.preset === "custom"
                ? `${dateFilter.startDate || "start"} to ${dateFilter.endDate || "end"}`
                : dateRangeOptions.find((option) => option.value === dateFilter.preset)?.label.toLowerCase()}
            .
          </p>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatsCard
            title="Transfer Value"
            value={formatCompactCurrency(reportData.totalTransferValue)}
            icon={CreditCard}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
          />
          <StatsCard
            title="Overdraft Watchlist"
            value={reportData.nearOdLimitRows.length}
            icon={Wallet}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: `${reportData.odBlocked} blocked accounts` }}
          />
        </div>

        <section id="loans" className="scroll-mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatsCard
              title="Active Loans"
              value={loanAnalytics.summary.activeLoans}
              icon={BadgeIndianRupee}
              accent="bg-emerald-500"
              iconTone="bg-emerald-50 text-emerald-600"
              footer={{ text: `${loanAnalytics.summary.disbursedLoans} disbursed` }}
            />
            <StatsCard
              title="Outstanding Balances"
              value={formatCompactCurrency(loanAnalytics.summary.outstandingBalance)}
              icon={FileBarChart}
              accent="bg-violet-500"
              iconTone="bg-violet-50 text-violet-600"
              footer={{ text: `${loanAnalytics.summary.collectionRate}% collection performance` }}
            />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="card-padded min-h-[380px]">
              <SectionHeader
                icon={BadgeIndianRupee}
                title="Loan Analytics"
                subtitle="Active loans, outstanding balances, delinquency, and collection performance."
                exportLabel="Export Loan Analytics"
                exportName="loan-analytics"
                exportRows={loanPortfolioCsvRows}
                exportPdfRows={loanAnalyticsPdfRows}
                exportPdfOptions={{
                  headers: ["Metric", "Value", "Details"],
                  subtitle: `Loan Analytics | Generated on ${formatReportDate(new Date())}`,
                }}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PolicyMetric label="Active Loans" value={loanAnalytics.summary.activeLoans} />
                <PolicyMetric label="Outstanding" value={formatCurrency(loanAnalytics.summary.outstandingBalance)} />
                <PolicyMetric label="Repayments" value={filteredRepaymentRows.length} />
                <PolicyMetric label="Delinquent Accounts" value={loanAnalytics.summary.delinquentAccounts} />
              </div>
              <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {formatCurrency(loanAnalytics.summary.collectedAmount)} collected against {formatCurrency(loanAnalytics.summary.expectedEmiAmount)} scheduled EMI value.
              </div>
              {loanAnalytics.summary.delinquentAccounts > 0 && (
                <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {loanAnalytics.summary.delinquentAccounts} account(s) have missed or overdue EMI items worth {formatCurrency(loanAnalytics.summary.delinquentAmount)}.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="card-padded min-h-[360px]">
                <SectionHeader
                  icon={FileBarChart}
                  title="Loan Distribution"
                  subtitle="Loan count split by product type."
                />
                <DonutChart rows={loanDistributionRows} />
              </div>
              <div className="card-padded min-h-[360px]">
                <SectionHeader
                  icon={ShieldCheck}
                  title="Loan Status Mix"
                  subtitle="Current portfolio status across the loan lifecycle."
                />
                <DonutChart rows={loanStatusRows} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="card-padded min-h-[360px]">
              <SectionHeader
                icon={Clock3}
                title="EMI Trends"
                subtitle="Scheduled EMI value by due month."
              />
              <ColumnChart rows={emiDueTrendRows} valueFormatter={formatCompactCurrency} />
            </div>
            <div className="card-padded min-h-[360px]">
              <SectionHeader
                icon={FileBarChart}
                title="Repayment Analytics"
                subtitle="Repayment activity by payment type for the selected period."
              />
              <HorizontalBarChart
                rows={repaymentTypeRows}
                valueFormatter={(value) => `${value} records`}
                detailFormatter={(row) => `${formatCompactCurrency(row.amount)} collected`}
              />
            </div>
          </div>

          <div className="table-shell">
            <div className="border-b border-bank-card-border p-5 sm:p-6">
              <SectionHeader
                icon={AlertTriangle}
                title="Delinquent Accounts"
                subtitle="Loans with missed or overdue EMI rows, sorted by delinquent exposure."
                exportLabel="Export Delinquencies"
                exportName="loan-delinquent-accounts"
                exportRows={delinquentLoanCsvRows}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Loan</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Outstanding</th>
                    <th className="px-6 py-4">Delinquency</th>
                    <th className="px-6 py-4">Next Due</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {delinquentLoanPagination.pageRows.map((loan) => (
                    <tr key={loan.id} className="table-row bg-red-50/40">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-950">{loan.id}</p>
                        <p className="text-sm font-semibold text-slate-500">{loan.loanTypeLabel}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{loan.customerName}</p>
                        <p className="text-sm text-slate-500">{loan.customerCode}</p>
                      </td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(loan.outstandingBalance)}</td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-red-700">{loan.delinquentEmiCount} EMI item(s)</p>
                        <p className="text-sm font-semibold text-slate-500">{formatCurrency(loan.delinquentAmount)}</p>
                      </td>
                      <td className="px-6 py-4">{formatReportDate(loan.nextDueDate)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={loan.status} />
                      </td>
                    </tr>
                  ))}
                  {loanAnalytics.delinquentRows.length === 0 && (
                    <EmptyTableRow colSpan={6} message="No delinquent loan accounts are currently recorded." />
                  )}
                </tbody>
              </table>
              <TablePagination {...delinquentLoanPagination} />
            </div>
          </div>

          <div className="table-shell">
            <div className="border-b border-bank-card-border p-5 sm:p-6">
              <SectionHeader
                icon={FileBarChart}
                title="Loan Portfolio Register"
                subtitle="Active and historical loan records with outstanding balances and payment progress."
                exportLabel="Export Loan Portfolio"
                exportName="loan-portfolio-register"
                exportRows={loanPortfolioCsvRows}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Loan</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Outstanding</th>
                    <th className="px-6 py-4">Paid</th>
                    <th className="px-6 py-4">EMI</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loanPortfolioPagination.pageRows.map((loan) => (
                    <tr key={loan.id} className="table-row">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-950">{loan.id}</p>
                        <p className="text-sm font-semibold text-slate-500">{loan.loanTypeLabel}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{loan.customerName}</p>
                        <p className="text-sm text-slate-500">{loan.customerCode}</p>
                      </td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(loan.amount)}</td>
                      <td className="px-6 py-4">{formatCurrency(loan.outstandingBalance)}</td>
                      <td className="px-6 py-4">{formatCurrency(loan.paidAmount)}</td>
                      <td className="px-6 py-4">
                        <p className="font-bold">{formatCurrency(loan.emiAmount)}</p>
                        <p className="text-xs font-semibold text-slate-500">{loan.tenureMonths} months</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={loan.status} />
                      </td>
                    </tr>
                  ))}
                  {loanAnalytics.loanRows.length === 0 && (
                    <EmptyTableRow colSpan={7} message="No loan records are available for reporting." />
                  )}
                </tbody>
              </table>
              <TablePagination {...loanPortfolioPagination} />
            </div>
          </div>

          <div className="table-shell">
            <div className="border-b border-bank-card-border p-5 sm:p-6">
              <SectionHeader
                icon={Clock3}
                title="Repayment History"
                subtitle="EMI, auto EMI, part-payment, foreclosure, and failed EMI records for the selected period."
                exportLabel="Export Repayments"
                exportName="loan-repayment-history"
                exportRows={repaymentCsvRows}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1380px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Loan</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Payment</th>
                    <th className="px-6 py-4">Principal</th>
                    <th className="px-6 py-4">Interest</th>
                    <th className="px-6 py-4">Penalty</th>
                    <th className="px-6 py-4">Charge</th>
                    <th className="px-6 py-4">Impact</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {repaymentPagination.pageRows.map((entry) => (
                    <tr key={entry.id} className="table-row">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-950">{entry.loanId}</p>
                        <p className="text-sm font-semibold text-slate-500">{entry.transactionId || "No transaction ID"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{entry.customerName}</p>
                        <p className="text-sm text-slate-500">{entry.customerCode}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold">{formatCurrency(entry.amount)}</p>
                        <p className="text-xs font-semibold text-slate-500">{formatReportLabel(entry.paymentType)}</p>
                      </td>
                      <td className="px-6 py-4">{formatCurrency(entry.principalPaid)}</td>
                      <td className="px-6 py-4">{formatCurrency(entry.interestPaid)}</td>
                      <td className="px-6 py-4">{formatCurrency(entry.penaltyPaid)}</td>
                      <td className="px-6 py-4">{formatCurrency(entry.partPaymentCharge)}</td>
                      <td className="px-6 py-4">
                        {entry.repaymentImpact ? formatReportLabel(entry.repaymentImpact) : "-"}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="px-6 py-4">{formatReportDate(entry.paidAt)}</td>
                    </tr>
                  ))}
                  {filteredRepaymentRows.length === 0 && (
                    <EmptyTableRow colSpan={10} message="No repayment records match the selected period." />
                  )}
                </tbody>
              </table>
              <TablePagination {...repaymentPagination} />
            </div>
          </div>
        </section>

        <section id="transactions" className="grid scroll-mt-8 grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="card-padded min-h-[360px]">
            <SectionHeader
              icon={ArrowLeftRight}
              title="Transaction Volume Chart"
              subtitle="Daily transfer count for the last 7 recorded transaction dates."
            />
            <ColumnChart rows={reportData.transferVolumeRows} valueFormatter={(value) => `${value}`} />
          </div>

          <div className="card-padded min-h-[360px]">
            <SectionHeader
              icon={ShieldCheck}
              title="Transfer Split"
              subtitle="Beneficiary ratio matters because overdraft applies to beneficiary transfers."
            />
            <DonutChart rows={reportData.splitRows} />
          </div>
        </section>

        <section className="table-shell">
          <div className="border-b border-bank-card-border p-5 sm:p-6">
            <SectionHeader
              icon={AlertTriangle}
              title="Transfer Review Register"
              subtitle="All transfer records sorted by amount for audit and approval review."
              exportLabel="Export Transfer Register"
              exportName="transfer-review-register"
              exportRows={transferRegisterRows}
              exportPdfRows={transferPdfRows}
              exportPdfOptions={{
                headers: ["Date", "Details", "From Account", "To Account", "Amount"],
                subtitle: `Transfer Review Register | Generated on ${formatReportDate(new Date())}`,
              }}
              className="mb-0"
            />
          </div>
          <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Transfer</th>
                    <th className="px-6 py-4">Route</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {highValuePagination.pageRows.map((transaction) => (
                    <tr key={transaction.id} className="table-row">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{transaction.id}</p>
                        <p className="mt-1 text-xs font-semibold uppercase text-slate-400">
                          {transaction.type || "transfer"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-bold uppercase text-slate-500">From</p>
                            <p className="font-semibold text-slate-900">{transaction.sender}</p>
                            <p className="text-sm text-slate-500">
                              {transaction.fromAccountDisplay}
                            </p>
                          </div>
                          <div className="rounded-lg bg-bank-surface px-3 py-2">
                            <p className="text-xs font-bold uppercase text-slate-500">To</p>
                            <p className="mt-1 font-semibold text-slate-900">{transaction.receiver}</p>
                            <p className="text-sm text-slate-500">
                              {transaction.toAccountDisplay}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(transaction.amount)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={transaction.status} />
                      </td>
                      <td className="px-6 py-4">{transaction.date || "Recently"}</td>
                    </tr>
                  ))}
                  {reportData.highValueTransfers.length === 0 && (
                    <EmptyTableRow colSpan={5} message="No transfer records match the selected period." />
                  )}
                </tbody>
              </table>
              <TablePagination {...highValuePagination} />
            </div>
          </section>

        <section id="overdraft" className="scroll-mt-8 space-y-6">
          <div className="card-padded min-h-[370px]">
            <SectionHeader
              icon={Wallet}
              title="Overdraft Reports"
              subtitle="Tier-based overdraft usage with 3-attempt monitoring."
              exportLabel="Export Overdraft"
              exportName="od-report"
              exportRows={odCsvRows}
              exportPdfRows={overdraftReportPdfRows}
              exportPdfOptions={{
                headers: ["Category", "Details", "Used", "Limit", "Status"],
                subtitle: `Overdraft Reports | Generated on ${formatReportDate(new Date())}`,
              }}
            />
            <HorizontalBarChart
              rows={reportData.odByTierRows}
              valueFormatter={formatCompactCurrency}
              detailFormatter={(row) =>
                `${percentOf(row.value, row.limit)}% of ${formatCompactCurrency(row.limit)} assigned`
              }
            />
            <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {reportData.odAttemptsUsed} customers have used all 3 monthly overdraft attempts and should be handled first.
            </div>
          </div>

          <div className="table-shell">
            <div className="border-b border-bank-card-border p-5 sm:p-6">
              <SectionHeader
                icon={AlertTriangle}
                title="Customers Near Overdraft Limit"
                subtitle="3/3 monthly overdraft users appear first, followed by customers with 2 uses or high overdraft exposure."
                exportLabel="Export Overdraft List"
                exportName="customers-near-od-limit"
                exportRows={odCsvRows}
                exportPdfRows={nearOdPdfRows}
                exportPdfOptions={{
                  headers: ["Customer", "Account OD", "OD Used", "OD Limit", "Monthly Use", "Status"],
                  subtitle: `Customers Near Overdraft Limit | Generated on ${formatReportDate(new Date())}`,
                }}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Tier</th>
                    <th className="px-6 py-4">Account OD Rules</th>
                    <th className="px-6 py-4">Monthly Overdraft Uses</th>
                    <th className="px-6 py-4">Overdraft Exposure</th>
                    <th className="px-6 py-4">Transfer Activity</th>
                    <th className="px-6 py-4">Limit Use</th>
                  </tr>
                </thead>
                <tbody>
                  {nearOdPagination.pageRows.map((customer) => (
                    <tr
                      key={customer.customerId}
                      className={`table-row ${customer.hasReachedMonthlyOdLimit ? "bg-red-50/60" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{customer.name}</p>
                        <p className="text-sm text-slate-500">{customer.customerId}</p>
                        {!customer.isActiveCustomer && (
                          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                            Inactive - outstanding exposure
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${getTierTone(customer.classification).badge}`}>
                          {customer.classification}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="max-w-xs text-sm font-semibold leading-6 text-slate-600">
                          {customer.accountOdBreakdown}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            customer.hasReachedMonthlyOdLimit
                              ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                              : customer.odUsesThisMonth >= 2
                                ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                                : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                          }`}
                        >
                          {customer.odUsesThisMonth}/3 used
                        </span>
                        {customer.hasReachedMonthlyOdLimit && (
                          <p className="mt-2 text-xs font-bold text-red-700">
                            Monthly overdraft blocked
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{formatCurrency(customer.overdraftUsed)}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          of {formatCurrency(customer.overdraftLimit)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{customer.transactionCount} transfers</p>
                        <p className="text-xs font-semibold text-slate-500">
                          {formatCurrency(customer.transactionAmount)}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-bold">{customer.odUsage}%</td>
                    </tr>
                  ))}
                  {reportData.nearOdLimitRows.length === 0 && (
                    <EmptyTableRow colSpan={7} message="No customers are above the overdraft watch threshold." />
                  )}
                </tbody>
              </table>
              <TablePagination {...nearOdPagination} />
            </div>
          </div>
        </section>

        <section id="approvals" className="scroll-mt-8">
          <div className="space-y-6">
            <div className="card-padded min-h-[360px]">
              <SectionHeader
                icon={Clock3}
                title="Approval Reports"
                subtitle="Approval status overview for pending, approved, and rejected requests."
                exportLabel="Export Approvals"
                exportName="approval-report"
                exportRows={approvalCsvRows}
                exportPdfRows={approvalPdfRows}
                exportPdfOptions={{
                  headers: ["Approval ID", "Customer", "Manager", "Route", "Amount", "Status", "Reason"],
                  subtitle: `Approval Report | Generated on ${formatReportDate(new Date())}`,
                }}
              />
              <DonutChart rows={reportData.approvalStatusRows} />
            </div>

            <div className="table-shell">
              <div className="border-b border-bank-card-border p-5 sm:p-6">
                <SectionHeader
                  icon={FileBarChart}
                  title="Approval Detail Register"
                  subtitle="Request-level approval details with customer, manager, account route, status, and decision notes."
                  className="mb-0"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1240px] table-fixed text-left">
                  <thead className="table-head">
                    <tr>
                      <th className="w-[14%] px-5 py-4">Request</th>
                      <th className="w-[20%] px-5 py-4">Customer & Manager</th>
                      <th className="w-[25%] px-5 py-4">Account Route</th>
                      <th className="w-[13%] px-5 py-4">Amount</th>
                      <th className="w-[14%] px-5 py-4">Decision</th>
                      <th className="w-[14%] px-5 py-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalPagination.pageRows.map((approval) => (
                      <tr key={approval.id} className="table-row align-top">
                        <td className="px-5 py-4">
                          <p className="break-words font-bold text-slate-950">{approval.id}</p>
                          <p className="mt-1 text-xs font-semibold uppercase text-slate-400">
                            {approval.type || "bank-transfer"}
                          </p>
                          <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">
                            Requested {formatReportDate(approval.requestedOn)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="break-words font-semibold text-slate-900">
                            {approval.customer || "Customer not available"}
                          </p>
                          <p className="mt-2 break-words text-sm leading-5 text-slate-500">
                            Manager: {approval.manager || "Unassigned"}
                          </p>
                          {approval.managerEmployeeId && (
                            <p className="mt-1 break-words text-xs font-semibold text-slate-400">
                              {approval.managerEmployeeId}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-2 text-sm">
                            <div className="rounded-lg bg-bank-surface px-3 py-2">
                              <p className="text-xs font-bold uppercase text-slate-500">From</p>
                              <p className="mt-1 break-words font-semibold text-slate-900">
                                {approval.fromAccountDisplay || approval.account || "Not available"}
                              </p>
                            </div>
                            <div className="rounded-lg bg-bank-surface px-3 py-2">
                              <p className="text-xs font-bold uppercase text-slate-500">To</p>
                              <p className="mt-1 break-words font-semibold text-slate-900">
                                {approval.toAccountDisplay || approval.toAccount || "Not available"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="break-words text-lg font-bold text-slate-950">
                            {formatCurrency(approval.amount || 0)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={approval.status} />
                          <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">
                            {approval.reviewedAt
                              ? `Reviewed ${formatReportDate(approval.reviewedAt)}`
                              : "Not reviewed yet"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p
                            className={`break-words rounded-lg px-3 py-2 text-xs font-semibold leading-5 ${
                              approval.rejectionReason
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-50 text-slate-500"
                            }`}
                          >
                            {approval.rejectionReason || "No rejection reason"}
                          </p>
                        </td>
                      </tr>
                    ))}
                    {reportData.approvalDetailRows.length === 0 && (
                      <EmptyTableRow colSpan={6} message="No approval records match the selected period." />
                    )}
                  </tbody>
                </table>
                <TablePagination {...approvalPagination} />
              </div>
            </div>
          </div>
        </section>

        <section id="customers" className="scroll-mt-8">
          <div className="card-padded min-h-[390px]">
            <SectionHeader
              icon={FileBarChart}
              title="Customers By Tier"
              subtitle="Customer classification distribution across the active tier setup."
              exportLabel="Export Customers"
              exportName="customer-tier-report"
              exportRows={customerCsvRows}
            />
            <DonutChart rows={reportData.tierDistributionRows} />
          </div>
        </section>

        <section id="classifications" className="scroll-mt-8">
          <div className="table-shell">
            <div className="border-b border-bank-card-border p-5 sm:p-6">
              <SectionHeader
                icon={BadgeIndianRupee}
                title="Classification Policy Report"
                subtitle="Active tier rules for customer limits, overdraft access, and charges."
                exportLabel="Export Classifications"
                exportName="classification-policy-report"
                exportRows={classificationCsvRows}
                exportPdfRows={classificationPdfRows}
                exportPdfOptions={{
                  headers: ["Classification", "Customers", "Transfer Limits", "Account-wise OD", "Charges"],
                  subtitle: `Classification Policy Report | Generated on ${formatReportDate(new Date())}`,
                }}
                className="mb-0"
              />
            </div>
            <div className="p-5 sm:p-6">
              {tiers.length === 0 ? (
                <div className="empty-state">No classification policies are available for reporting.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {tiers.map((tier) => (
                    <article
                      key={tier.key}
                      className="rounded-xl border border-bank-card-border bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${getTierTone(tier.key).badge}`}>
                            {tier.label}
                          </span>
                          <p className="mt-2 text-sm font-semibold text-slate-500">
                            {tier.customerCount} assigned customer{tier.customerCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="min-w-0 text-left sm:text-right">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                            Highest OD Limit
                          </p>
                          <p className="mt-1 text-xl font-bold text-slate-950">
                            {formatCurrency(tier.maxODLimit)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <PolicyMetric label="Per Transfer" value={formatCurrency(tier.perTxnLimit)} />
                        <PolicyMetric label="Daily" value={formatCurrency(tier.dailyLimit)} />
                        <PolicyMetric label="Monthly" value={formatCurrency(tier.monthlyLimit)} />
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <PolicyMetric label="Monthly OD Interest" value={tier.interestRate || tier.lateFeeRate || "Not set"} />
                        <PolicyMetric label="Penalty" value={formatCurrency(tier.penaltyAmount)} />
                      </div>

                      <div className="mt-4 rounded-lg border border-slate-100 px-4 py-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-700">
                            Account-wise OD policy
                          </p>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                            3 uses monthly
                          </span>
                        </div>
                        <AccountTypeOdRulesTable tier={tier} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-100">
                          3 overdraft uses monthly
                        </span>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-100">
                          Clear before month-end
                        </span>
                        {tier.odBlockedAccounts > 0 && (
                          <span className="rounded-full bg-red-50 px-3 py-1 text-red-700 ring-1 ring-red-100">
                            {tier.odBlockedAccounts} blocked
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default AdminReports;
