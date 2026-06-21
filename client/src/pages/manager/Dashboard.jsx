import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import EmptyState from "../../components/ui/EmptyState";
import {
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock,
  CreditCard,
  Edit3,
  FileBarChart,
  FileText,
  Gauge,
  IdCard,
  ListChecks,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import StatsCard from "../../components/dashboard/StatsCard";
import ChartTooltip from "../../components/ui/ChartTooltip";
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import {
  RechartsDonut,
  RechartsHorizontalBar,
} from "../../components/ui/RechartsReports";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";
import { formatCurrency, maskAccountNumber } from "../../utils/format";
import { getTierTone, getTransactionStatusLabel } from "../../utils/ui";

const statusStyles = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  updated: "bg-blue-50 text-blue-700",
  under_review: "bg-blue-50 text-blue-700",
  disbursed: "bg-violet-50 text-violet-700",
};

const decisionCategoryStyles = {
  transfer: "bg-blue-50 text-blue-700",
  loan: "bg-emerald-50 text-emerald-700",
  policy: "bg-violet-50 text-violet-700",
};

const loanStatusStyles = {
  submitted: "bg-blue-50 text-blue-700",
  under_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  disbursed: "bg-violet-50 text-violet-700",
  closed: "bg-slate-100 text-slate-700",
};

const documentReviewStyles = {
  pending: "bg-slate-100 text-slate-700",
  verified: "bg-emerald-50 text-emerald-700",
  mismatch: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  additional_info_required: "bg-blue-50 text-blue-700",
};

const formatStatusLabel = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDetailLabel = (value) =>
  String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());

const getUploadUrl = (fileUrl = "") =>
  fileUrl ? `${api.defaults.baseURL.replace(/\/api$/, "")}${fileUrl}` : "";

const loanScoreLabels = {
  incomeStrength: "Income Strength",
  liabilities: "Active Loans",
  classification: "Classification",
  employmentStability: "Employment Stability",
  accountHistory: "Account History",
  overdraftUsage: "Overdraft Usage",
};

const defaultLoanScoreWeights = {
  incomeStrength: 20,
  liabilities: 30,
  classification: 20,
  employmentStability: 15,
  accountHistory: 10,
  overdraftUsage: 5,
};

const getScoreReason = (loan) => {
  const scores = loan.eligibilityDetails?.componentScores || {};
  const weights = loan.eligibilityDetails?.scoreWeights || defaultLoanScoreWeights;
  const weakest = Object.entries(scores)
    .map(([key, value]) => ({
      key,
      value: Number(value || 0),
      max: Number(weights[key] || defaultLoanScoreWeights[key] || 0),
    }))
    .filter((item) => item.max > 0)
    .sort((left, right) => left.value / left.max - right.value / right.max)[0];

  if (!weakest) return "Score is based on income, active loans, classification, employment, account history, and overdraft usage.";

  return `Main score reducer: ${loanScoreLabels[weakest.key] || weakest.key} at ${weakest.value}/${weakest.max}.`;
};

const getLoanScoreTone = (score) => {
  const value = Number(score || 0);

  if (value >= 80) {
    return {
      label: "Strong",
      ring: "ring-emerald-200",
      text: "text-emerald-700",
      bg: "bg-emerald-50",
      bar: "bg-emerald-500",
    };
  }

  if (value >= 65) {
    return {
      label: "Eligible",
      ring: "ring-blue-200",
      text: "text-blue-700",
      bg: "bg-blue-50",
      bar: "bg-blue-500",
    };
  }

  if (value >= 50) {
    return {
      label: "Review",
      ring: "ring-amber-200",
      text: "text-amber-700",
      bg: "bg-amber-50",
      bar: "bg-amber-500",
    };
  }

  return {
    label: "Weak",
    ring: "ring-red-200",
    text: "text-red-700",
    bg: "bg-red-50",
    bar: "bg-red-500",
  };
};

const odRiskStyles = {
  critical: {
    label: "Critical",
    badge: "bg-red-50 text-red-700 ring-1 ring-red-100",
    bar: "bg-red-500",
    soft: "bg-red-50 text-red-700",
  },
  high: {
    label: "High",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    bar: "bg-amber-500",
    soft: "bg-amber-50 text-amber-700",
  },
  active: {
    label: "Active",
    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    bar: "bg-blue-500",
    soft: "bg-blue-50 text-blue-700",
  },
  unused: {
    label: "Unused",
    badge: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    bar: "bg-slate-400",
    soft: "bg-slate-100 text-slate-700",
  },
};

const notificationToneStyles = {
  success: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
  danger: "border-red-200 bg-red-50/80 text-red-700",
  warning: "border-amber-200 bg-amber-50/80 text-amber-700",
  info: "border-blue-200 bg-blue-50/80 text-blue-700",
};

const transactionStatusStyles = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  failed: "bg-red-50 text-red-700 ring-1 ring-red-100",
};

const transactionTypeLabels = {
  "bank-transfer": "Bank Transfer",
  "own-account": "Own Account",
  "overdraft-payoff": "OD Payoff",
};

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value || 0)));
const delinquentEmiStatuses = new Set(["missed", "overdue"]);
const openEmiStatuses = new Set(["pending", "missed", "overdue", "part_paid"]);

const getLoanOutstandingExposure = (loan) =>
  Number(loan.outstandingPrincipal || 0) +
  Number(loan.foreclosureQuote?.accruedInterest || loan.accruedInterest || 0) +
  Number(loan.foreclosureQuote?.unpaidPenalties || loan.accruedPenalty || 0);

const getLoanDelinquentRows = (loan) =>
  (loan.amortizationSchedule || []).filter((row) => delinquentEmiStatuses.has(row.status));

const getLoanNextOpenEmi = (loan) =>
  (loan.amortizationSchedule || []).find((row) => openEmiStatuses.has(row.status));

const tierPermissionDefaults = {
  perTxnLimit: false,
  dailyLimit: false,
  monthlyLimit: false,
  accountTypeOdRules: false,
  penaltyAmount: false,
  interestRate: false,
};

const parseMonthlyInterestPercent = (value) => {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);

  return match ? match[1] : "";
};

const formatMonthlyInterestRate = (value) => {
  const percent = parseMonthlyInterestPercent(value);
  const numericValue = Number(percent);

  if (!Number.isFinite(numericValue)) return "";

  return `${numericValue.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}% monthly`;
};

const normalizeTierRules = (rules = []) =>
  ["Savings", "Current", "Salary"].map((accountType) => {
    const rule = rules.find((item) => item.accountType === accountType) || {};

    return {
      accountType,
      odLimit: rule.odLimit ?? "",
      minOpeningBalance: rule.minOpeningBalance ?? "",
    };
  });

const getDefaultRejectionReason = (approval) =>
  `Transfer request ${approval.id} for ${formatCurrency(
    approval.amount
  )} was rejected because it does not meet the approval policy requirements.`;

const formatDateTime = (value) => {
  if (!value) return "Recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleString();
};

function ManagerDashboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const { section = "dashboard" } = useParams();
  const { logout, user, setSessionUser } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [loans, setLoans] = useState([]);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [rejectionReview, setRejectionReview] = useState(null);
  const [loanReview, setLoanReview] = useState(null);
  const [loanDocumentReview, setLoanDocumentReview] = useState(null);
  const [expandedLoanId, setExpandedLoanId] = useState("");
  const [loanMessage, setLoanMessage] = useState("");
  const [loanError, setLoanError] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [profilePhone, setProfilePhone] = useState(user?.phone || "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [odCustomerFilter, setOdCustomerFilter] = useState("attention");
  const [odCustomerSearch, setOdCustomerSearch] = useState("");
  const [odMonitoringTab, setOdMonitoringTab] = useState("cases");
  const [loanPortfolioFilter, setLoanPortfolioFilter] = useState("all");
  const [loanPortfolioSearch, setLoanPortfolioSearch] = useState("");
  const [expandedPortfolioLoanId, setExpandedPortfolioLoanId] = useState("");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [businessRules, setBusinessRules] = useState({
    managerTierPermissions: tierPermissionDefaults,
  });
  const [tierEditReview, setTierEditReview] = useState(null);
  const [tierEditForm, setTierEditForm] = useState(null);
  const [isSavingTierEdit, setIsSavingTierEdit] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    stats: {
      pendingApprovals: 0,
      highValueTransactions: 0,
      odCases: 0,
      transactionsToday: 0,
      odPercent: 0,
      totalOdLimit: 0,
      utilizedOd: 0,
      notificationCount: 0,
    },
    profile: {},
    odUtilizers: [],
    overdraftCustomers: [],
    overdraftRisk: [],
    overdraftExposureByType: [],
    tierPolicies: [],
    recentOverdraftActivity: [],
    overdraftPayoffTransactions: [],
    escalations: [],
    transactions: [],
    notifications: [],
    tierDecisionHistory: [],
  });

  const loadDashboard = useCallback(() => {
    api
      .get("/dashboard/manager")
      .then(({ data }) => setDashboardData(data))
      .catch(() => {
        // Approval queue should still update when dashboard summary APIs are unavailable.
      });

    api
      .get("/business-rules")
      .then(({ data }) => {
        setBusinessRules({
          managerTierPermissions: {
            ...tierPermissionDefaults,
            ...(data.config?.managerTierPermissions || {}),
          },
        });
      })
      .catch(() => {
        setBusinessRules({ managerTierPermissions: tierPermissionDefaults });
      });

    return Promise.all([
      api.get("/approvals"),
      api.get("/loans"),
    ]).then(([approvalsResult, loansResult]) => {
      setApprovals(approvalsResult.data.approvals || []);
      setLoans(loansResult.data.loans || []);
    });
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const pendingApprovals = approvals.filter(
    (approval) => approval.status === "pending"
  );
  const pendingApprovalsByAmount = [...pendingApprovals].sort(
    (left, right) => Number(right.amount || 0) - Number(left.amount || 0)
  );
  const topPendingApprovals = pendingApprovalsByAmount.slice(0, 3);
  const pendingApprovalValue = pendingApprovals.reduce(
    (sum, approval) => sum + Number(approval.amount || 0),
    0
  );
  const approvalHistory = approvals.filter((approval) =>
    ["approved", "rejected"].includes(approval.status)
  );
  const pendingLoanReviews = loans.filter((loan) =>
    ["submitted", "under_review"].includes(loan.status)
  );
  const approvedLoans = loans.filter((loan) => loan.status === "approved");
  const disbursedLoans = loans.filter((loan) => loan.status === "disbursed");
  const loanPortfolioLoans = loans.filter((loan) =>
    ["approved", "disbursed", "closed", "rejected"].includes(loan.status)
  );
  const loanPortfolioHealth = useMemo(() => {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const operationalLoans = loanPortfolioLoans.filter((loan) =>
      ["approved", "disbursed"].includes(loan.status)
    );
    const repaymentRows = loanPortfolioLoans.flatMap((loan) =>
      (loan.repaymentHistory || []).map((entry) => ({ ...entry, loan }))
    );
    const successfulRepayments = repaymentRows.filter((entry) => entry.status === "success");
    const collectedAmount = successfulRepayments.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0
    );
    const dueSoonRows = operationalLoans.flatMap((loan) =>
      (loan.amortizationSchedule || [])
        .filter((row) => {
          const dueDate = row.dueDate ? new Date(row.dueDate) : null;

          return (
            row.status === "pending" &&
            dueDate &&
            !Number.isNaN(dueDate.getTime()) &&
            dueDate <= nextWeek
          );
        })
        .map((row) => ({ ...row, loan }))
    );
    const delinquentLoans = operationalLoans
      .map((loan) => {
        const delinquentRows = getLoanDelinquentRows(loan);
        const delinquentAmount = delinquentRows.reduce(
          (sum, row) => sum + Number(row.emiAmount || 0) + Number(row.penaltyAmount || 0),
          0
        );
        const nextOpenEmi = getLoanNextOpenEmi(loan);

        return {
          ...loan,
          delinquentRows,
          delinquentAmount,
          outstandingExposure: getLoanOutstandingExposure(loan),
          nextOpenEmi,
        };
      })
      .filter((loan) => loan.delinquentRows.length > 0)
      .sort(
        (left, right) =>
          right.delinquentRows.length - left.delinquentRows.length ||
          right.delinquentAmount - left.delinquentAmount ||
          right.outstandingExposure - left.outstandingExposure
      );
    const delinquentAmount = delinquentLoans.reduce(
      (sum, loan) => sum + loan.delinquentAmount,
      0
    );
    const collectionBase = collectedAmount + delinquentAmount;
    const byType = ["personal", "home", "vehicle", "education"].map((loanType) => {
      const rows = operationalLoans.filter((loan) => loan.loanType === loanType);

      return {
        label: formatStatusLabel(loanType),
        count: rows.length,
        exposure: rows.reduce((sum, loan) => sum + getLoanOutstandingExposure(loan), 0),
      };
    });
    const maxExposure = Math.max(...byType.map((row) => row.exposure), 1);

    return {
      activeCount: operationalLoans.length,
      outstandingExposure: operationalLoans.reduce(
        (sum, loan) => sum + getLoanOutstandingExposure(loan),
        0
      ),
      collectedAmount,
      collectionRate: collectionBase > 0 ? Math.round((collectedAmount / collectionBase) * 100) : 100,
      dueSoonCount: dueSoonRows.length,
      dueSoonAmount: dueSoonRows.reduce((sum, row) => sum + Number(row.emiAmount || 0), 0),
      delinquentLoans,
      delinquentAmount,
      byType: byType.map((row) => ({
        ...row,
        width: `${Math.max(8, Math.round((row.exposure / maxExposure) * 100))}%`,
      })),
      followUpLoans: delinquentLoans.slice(0, 5),
    };
  }, [loanPortfolioLoans]);
  const filteredLoanPortfolioLoans = useMemo(() => {
    const query = loanPortfolioSearch.trim().toLowerCase();

    return loanPortfolioLoans.filter((loan) => {
      const matchesStatus =
        loanPortfolioFilter === "all" || loan.status === loanPortfolioFilter;

      if (!matchesStatus) return false;
      if (!query) return true;

      return [
        loan.id,
        loan.customerName,
        loan.customerCode,
        loan.loanTypeLabel,
        loan.disbursementAccountNumber,
        loan.sanctionLetter?.status,
        loan.loanAgreement?.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [loanPortfolioFilter, loanPortfolioLoans, loanPortfolioSearch]);
  const tierDecisionHistory = useMemo(
    () => dashboardData.tierDecisionHistory || [],
    [dashboardData.tierDecisionHistory]
  );
  const decisionHistory = useMemo(() => {
    const approvalRows = approvalHistory.map((approval) => ({
      id: `approval-${approval.id}`,
      displayId: approval.id,
      subject: approval.customer || "Customer",
      type: approval.type,
      amount: formatCurrency(approval.amount),
      amountValue: Number(approval.amount || 0),
      entity: maskAccountNumber(approval.account),
      reviewedAt: approval.reviewedAt || approval.updatedAt,
      status: approval.status,
      category: "transfer",
      detail: approval.rejectionReason || "Transfer request approved.",
    }));
    const loanRows = loans.flatMap((loan) => {
      const rows = [];

      if (loan.reviewedAt && ["approved", "rejected"].includes(loan.status)) {
        rows.push({
          id: `loan-review-${loan.id}`,
          displayId: loan.id,
          subject: loan.customerName || "Customer",
          type: `${loan.loanTypeLabel || "Loan"} review`,
          amount: formatCurrency(loan.amount),
          amountValue: Number(loan.amount || 0),
          entity: loan.customerCode || loan.customerClassification || "Loan",
          reviewedAt: loan.reviewedAt,
          status: loan.status,
          category: "loan",
          detail:
            loan.status === "rejected"
              ? loan.rejectionReason || loan.managerNote || "Loan application rejected."
              : loan.managerNote || "Loan application approved.",
        });
      }

      if (loan.reviewedAt && loan.status === "under_review" && loan.additionalInfoRequested) {
        rows.push({
          id: `loan-info-${loan.id}`,
          displayId: loan.id,
          subject: loan.customerName || "Customer",
          type: `${loan.loanTypeLabel || "Loan"} information request`,
          amount: formatCurrency(loan.amount),
          amountValue: Number(loan.amount || 0),
          entity: loan.customerCode || loan.customerClassification || "Loan",
          reviewedAt: loan.reviewedAt,
          status: "under_review",
          category: "loan",
          detail: loan.managerNote || "Additional information requested from customer.",
        });
      }

      if (loan.reviewedAt && loan.status === "disbursed") {
        rows.push({
          id: `loan-review-${loan.id}`,
          displayId: loan.id,
          subject: loan.customerName || "Customer",
          type: `${loan.loanTypeLabel || "Loan"} review`,
          amount: formatCurrency(loan.amount),
          amountValue: Number(loan.amount || 0),
          entity: loan.customerCode || loan.customerClassification || "Loan",
          reviewedAt: loan.reviewedAt,
          status: "approved",
          category: "loan",
          detail: loan.managerNote || "Loan application approved.",
        });
      }

      if (loan.disbursedAt) {
        rows.push({
          id: `loan-disbursed-${loan.id}`,
          displayId: loan.id,
          subject: loan.customerName || "Customer",
          type: `${loan.loanTypeLabel || "Loan"} disbursal`,
          amount: formatCurrency(loan.amount),
          amountValue: Number(loan.amount || 0),
          entity: loan.disbursementAccountNumber
            ? maskAccountNumber(loan.disbursementAccountNumber)
            : "Customer account",
          reviewedAt: loan.disbursedAt,
          status: "disbursed",
          category: "loan",
          detail: `${formatCurrency(loan.amount)} disbursed to customer account.`,
        });
      }

      return rows;
    });
    const tierRows = tierDecisionHistory.map((decision) => {
      const changes = Array.isArray(decision.changes) ? decision.changes : [];
      const changeSummary =
        changes.length > 0
          ? changes
              .slice(0, 3)
              .map((change) => `${change.label || change.field}: ${change.from} to ${change.to}`)
              .join("; ")
          : decision.message;
      const extraCount = Math.max(0, changes.length - 3);

      return {
        id: `tier-${decision.id}`,
        displayId: decision.tierName || decision.id,
        subject: `${decision.tierLabel || "Tier"} Policy`,
        type: "Tier policy edit",
        amount: `${decision.customerCount || 0} affected customer(s)`,
        amountValue: 0,
        entity: "Tier",
        reviewedAt: decision.createdAt,
        status: "updated",
        category: "policy",
        detail: extraCount > 0 ? `${changeSummary}; ${extraCount} more change(s).` : changeSummary,
      };
    });

    return [...approvalRows, ...loanRows, ...tierRows].sort(
      (left, right) => new Date(right.reviewedAt || 0) - new Date(left.reviewedAt || 0)
    );
  }, [approvalHistory, loans, tierDecisionHistory]);
  const totalOdLimit = dashboardData.stats.totalOdLimit;
  const utilizedOd = dashboardData.stats.utilizedOd;
  const odPercent = dashboardData.stats.odPercent;
  const odUtilizers = dashboardData.odUtilizers;
  const overdraftCustomers = useMemo(
    () => dashboardData.overdraftCustomers || [],
    [dashboardData.overdraftCustomers]
  );
  const overdraftRisk = dashboardData.overdraftRisk || [];
  const overdraftExposureByType = dashboardData.overdraftExposureByType || [];
  const tierPolicies = dashboardData.tierPolicies || [];
  const managerTierPermissions = {
    ...tierPermissionDefaults,
    ...(businessRules.managerTierPermissions || {}),
  };
  const canEditAnyTierField = Object.values(managerTierPermissions).some(Boolean);
  const tierPermissionLabels = [
    ["perTxnLimit", "Per transfer"],
    ["dailyLimit", "Daily"],
    ["monthlyLimit", "Monthly"],
    ["accountTypeOdRules", "Account OD rules"],
    ["penaltyAmount", "Penalty"],
    ["interestRate", "Interest"],
  ];
  const editableTierFieldCount = tierPermissionLabels.filter(
    ([field]) => managerTierPermissions[field]
  ).length;
  const recentOverdraftActivity = dashboardData.recentOverdraftActivity || [];
  const overdraftPayoffTransactions = dashboardData.overdraftPayoffTransactions || [];
  const escalations = dashboardData.escalations || [];
  const transactions = dashboardData.transactions;
  const transactionSummary = useMemo(() => {
    const successful = transactions.filter((transaction) =>
      ["success", "completed"].includes(String(transaction.status).toLowerCase())
    );
    const pending = transactions.filter(
      (transaction) => String(transaction.status).toLowerCase() === "pending"
    );
    const failed = transactions.filter(
      (transaction) => String(transaction.status).toLowerCase() === "failed"
    );
    const payoff = transactions.filter((transaction) => transaction.type === "overdraft-payoff");

    return {
      totalValue: transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      successfulCount: successful.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      payoffCount: payoff.length,
    };
  }, [transactions]);
  const transactionStatusRows = useMemo(
    () => [
      {
        key: "success",
        label: "Successful",
        value: transactionSummary.successfulCount,
        bar: "bg-emerald-500",
        tone: "text-emerald-700 bg-emerald-50",
      },
      {
        key: "pending",
        label: "Pending",
        value: transactionSummary.pendingCount,
        bar: "bg-amber-500",
        tone: "text-amber-700 bg-amber-50",
      },
      {
        key: "failed",
        label: "Failed",
        value: transactionSummary.failedCount,
        bar: "bg-red-500",
        tone: "text-red-700 bg-red-50",
      },
    ],
    [transactionSummary.failedCount, transactionSummary.pendingCount, transactionSummary.successfulCount]
  );
  const transactionTypeRows = useMemo(() => {
    const totals = transactions.reduce((map, transaction) => {
      const key = transaction.type || "bank-transfer";
      const current = map.get(key) || { key, count: 0, amount: 0 };

      current.count += 1;
      current.amount += Number(transaction.amount || 0);
      map.set(key, current);
      return map;
    }, new Map());

    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount);
  }, [transactions]);
  const recentTransactions = transactions.slice(0, 4);
  const filteredTransactions = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const status = String(transaction.status || "").toLowerCase();
      const matchesStatus =
        transactionStatusFilter === "all" ||
        status === transactionStatusFilter ||
        (transactionStatusFilter === "success" && status === "completed");

      if (!matchesStatus) return false;
      if (!query) return true;

      return [
        transaction.id,
        transaction.customer,
        transaction.customerId,
        transaction.receiver,
        transaction.fromAccountNumber,
        transaction.toAccountNumber,
        transaction.type,
        transaction.remarks,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [transactionSearch, transactionStatusFilter, transactions]);
  const notifications = dashboardData.notifications || [];
  const managerProfile = dashboardData.profile;
  const todayKey = new Date().toDateString();
  const decisionsToday = decisionHistory.filter((decision) => {
    const decisionDate = new Date(decision.reviewedAt || 0);

    return !Number.isNaN(decisionDate.getTime()) && decisionDate.toDateString() === todayKey;
  }).length;
  const decisionSummary = useMemo(
    () => ({
      total: decisionHistory.length,
      loans: decisionHistory.filter((decision) => decision.category === "loan").length,
      transfers: decisionHistory.filter((decision) => decision.category === "transfer").length,
      policies: decisionHistory.filter((decision) => decision.category === "policy").length,
      today: decisionsToday,
    }),
    [decisionHistory, decisionsToday]
  );
  const recentDecisions = decisionHistory.slice(0, 4);
  const approvalEscalations = pendingApprovals.map((approval) => ({
    id: `approval-${approval.id}`,
    title: `${approval.customer || "Customer"} transfer needs manager approval`,
    amount: approval.amount,
    severity: approval.risk === "high" ? "danger" : "warning",
    time: approval.requestedOn,
    metadata: {
      approvalId: approval.id,
      accountNumber: approval.account,
      odCountThisMonth: null,
    },
  }));
  const displayedEscalations = [...approvalEscalations, ...escalations];
  const odCustomerSummary = useMemo(() => {
    const active = overdraftCustomers.filter((customer) => Number(customer.used || 0) > 0);
    const blocked = overdraftCustomers.filter((customer) => customer.isBlocked);
    const critical = overdraftCustomers.filter((customer) => customer.risk === "critical");
    const high = overdraftCustomers.filter((customer) => customer.risk === "high");
    const nearLimit = overdraftCustomers.filter(
      (customer) => Number(customer.utilization || 0) >= 70
    );

    return {
      activeCount: active.length,
      blockedCount: blocked.length,
      criticalCount: critical.length,
      highCount: high.length,
      nearLimitCount: nearLimit.length,
      attentionCount: new Set([...blocked, ...critical, ...high, ...nearLimit]).size,
    };
  }, [overdraftCustomers]);
  const filteredOverdraftCustomers = useMemo(() => {
    const query = odCustomerSearch.trim().toLowerCase();

    return overdraftCustomers.filter((customer) => {
      const matchesFilter =
        odCustomerFilter === "all" ||
        (odCustomerFilter === "attention" &&
          (customer.isBlocked ||
            ["critical", "high"].includes(customer.risk) ||
            Number(customer.utilization || 0) >= 70)) ||
        (odCustomerFilter === "active" && Number(customer.used || 0) > 0) ||
        (odCustomerFilter === "blocked" && customer.isBlocked);

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        customer.customer,
        customer.customerId,
        customer.account,
        customer.accountType,
        customer.classification,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [odCustomerFilter, odCustomerSearch, overdraftCustomers]);

  const visibleApprovalQueue = pendingApprovalsByAmount;
  const approvalPagination = usePaginatedRows(visibleApprovalQueue);
  const decisionHistoryPagination = usePaginatedRows(decisionHistory);
  const overdraftCustomerPagination = usePaginatedRows(filteredOverdraftCustomers);
  const overdraftPayoffPagination = usePaginatedRows(overdraftPayoffTransactions);
  const transactionPagination = usePaginatedRows(filteredTransactions);
  const recentOverdraftActivityPagination = usePaginatedRows(recentOverdraftActivity);
  const escalationPagination = usePaginatedRows(displayedEscalations);
  const notificationPagination = usePaginatedRows(notifications);
  const loanReviewPagination = usePaginatedRows(pendingLoanReviews);
  const approvedLoanPagination = usePaginatedRows(approvedLoans);
  const loanPortfolioPagination = usePaginatedRows(filteredLoanPortfolioLoans);
  const activeSection = section === "loan" ? "loans" : section;
  const pageTitle = {
    dashboard: "Manager Dashboard",
    approvals: "Approval Queue",
    loans: "Loan Reviews",
    "loan-portfolio": "Loan Portfolio",
    "approval-history": "Decision History",
    overdraft: "Overdraft Monitoring",
    policies: "Tier Policies",
    escalations: "Escalations",
    transactions: "Transaction Monitoring",
    notifications: "Notifications",
    profile: "Manager Profile",
  }[activeSection] ?? "Manager Dashboard";

  const updateApproval = async (id, status, rejectionReason = "") => {
    setApprovalMessage("");
    setApprovalError("");

    try {
      const { data } = await api.patch(`/approvals/${id}`, {
        status,
        ...(status === "rejected" ? { rejectionReason } : {}),
      });
      setApprovals((current) =>
        current.map((approval) =>
          approval.id === id ? { ...approval, ...data.approval } : approval
        )
      );
      setRejectionReview(null);
      setApprovalMessage(data.message || "Approval request updated.");
      toast.success(data.message || "Approval request updated.");
      await loadDashboard();
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || "Unable to update approval request.";
      setApprovalError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const openRejectReview = (approval) => {
    setApprovalMessage("");
    setApprovalError("");
    setRejectionReview({
      id: approval.id,
      reason: approval.rejectionReason || getDefaultRejectionReason(approval),
    });
  };

  const updateRejectionReason = (reason) => {
    setRejectionReview((current) => (current ? { ...current, reason } : current));
  };

  const confirmRejection = (approvalId) => {
    const reason = rejectionReview?.reason?.trim();

    if (!reason) {
      setApprovalError("Rejection reason is required.");
      toast.warning("Rejection reason is required.");
      return;
    }

    updateApproval(approvalId, "rejected", reason);
  };

  const savePhoneNumber = async () => {
    setProfileMessage("");
    setProfileError("");

    try {
      const { data } = await api.patch("/users/me", { phone: profilePhone });
      setSessionUser(data.user);
      setIsEditingPhone(false);
      setProfileMessage("Phone number updated successfully.");
      toast.success("Phone number updated successfully.");
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || "Unable to update phone number.";
      setProfileError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const updateLoanReviewNote = (value) => {
    setLoanReview((current) => (current ? { ...current, note: value } : current));
  };

  const updateLoanDocumentReviewNote = (value) => {
    setLoanDocumentReview((current) => (current ? { ...current, note: value } : current));
  };

  const submitLoanReview = async (loanId, action, note = "") => {
    setLoanMessage("");
    setLoanError("");

    try {
      const { data } = await api.patch(`/loans/${loanId}/review`, {
        action,
        note,
      });

      setLoans((current) =>
        current.map((loan) => (loan.id === loanId ? { ...loan, ...data.loan } : loan))
      );
      setLoanReview(null);
      setLoanMessage(data.message || "Loan review updated.");
      toast.success(data.message || "Loan review updated.");
      await loadDashboard();
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Unable to update loan review.";
      setLoanError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const openLoanNote = (loan, action) => {
    setLoanMessage("");
    setLoanError("");
    setExpandedLoanId(loan.id);
    setLoanDocumentReview(null);
    setLoanReview({
      id: loan.id,
      action,
      note:
        action === "reject"
          ? loan.rejectionReason || "Application does not meet the current loan review requirements."
          : loan.managerNote || "",
    });
  };

  const openLoanDocumentNote = (loan, document, reviewStatus) => {
    setLoanMessage("");
    setLoanError("");
    setExpandedLoanId(loan.id);
    setLoanReview(null);
    setLoanDocumentReview({
      loanId: loan.id,
      documentId: document.id,
      documentType: document.documentType,
      reviewStatus,
      note: document.managerNote || "",
    });
  };

  const confirmLoanDocumentNoteAction = () => {
    const note = loanDocumentReview?.note?.trim();

    if (!note) {
      setLoanError("Manager note is required for this document status.");
      toast.warning("Manager note is required for this document status.");
      return;
    }

    updateLoanDocument(
      loanDocumentReview.loanId,
      loanDocumentReview.documentId,
      loanDocumentReview.reviewStatus,
      note
    );
  };

  const confirmLoanNoteAction = () => {
    const note = loanReview?.note?.trim();

    if (!note) {
      setLoanError("Manager note is required.");
      toast.warning("Manager note is required.");
      return;
    }

    submitLoanReview(loanReview.id, loanReview.action, note);
  };

  const disburseLoan = async (loanId) => {
    setLoanMessage("");
    setLoanError("");

    try {
      const { data } = await api.patch(`/loans/${loanId}/disburse`);
      setLoans((current) =>
        current.map((loan) => (loan.id === loanId ? { ...loan, ...data.loan } : loan))
      );
      setLoanMessage(data.message || "Loan disbursed.");
      toast.success(data.message || "Loan disbursed.");
      await loadDashboard();
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Unable to disburse loan.";
      setLoanError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const updateLoanDocument = async (loanId, documentId, reviewStatus, managerNote = "") => {
    setLoanMessage("");
    setLoanError("");

    try {
      const { data } = await api.patch(`/loans/${loanId}/documents/${documentId}`, {
        reviewStatus,
        managerNote,
      });

      setLoans((current) =>
        current.map((loan) => (loan.id === loanId ? { ...loan, ...data.loan } : loan))
      );
      setLoanDocumentReview(null);
      setLoanMessage(data.message || "Document review updated.");
      toast.success(data.message || "Document review updated.");
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Unable to update document review.";
      setLoanError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const openTierEdit = (tier) => {
    if (!canEditAnyTierField) {
      toast.warning("Admin has not allowed manager tier edits yet.");
      return;
    }

    setTierEditReview(tier);
    setTierEditForm({
      perTxnLimit: tier.perTxnLimit,
      dailyLimit: tier.dailyLimit,
      monthlyLimit: tier.monthlyLimit,
      penaltyAmount: tier.penaltyAmount,
      interestRate: parseMonthlyInterestPercent(tier.interestRate || tier.lateFeeRate),
      accountTypeOdRules: normalizeTierRules(tier.accountTypeOdRules),
    });
  };

  const closeTierEdit = () => {
    setTierEditReview(null);
    setTierEditForm(null);
    setIsSavingTierEdit(false);
  };

  const updateTierEditForm = (field, value) => {
    setTierEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateTierEditRule = (accountType, field, value) => {
    setTierEditForm((current) => ({
      ...current,
      accountTypeOdRules: normalizeTierRules(current.accountTypeOdRules).map((rule) =>
        rule.accountType === accountType ? { ...rule, [field]: value } : rule
      ),
    }));
  };

  const saveTierEdit = async (event) => {
    event.preventDefault();

    if (!tierEditReview || !tierEditForm) return;

    const payload = {};

    if (managerTierPermissions.perTxnLimit) {
      payload.perTxnLimit = tierEditForm.perTxnLimit;
    }
    if (managerTierPermissions.dailyLimit) {
      payload.dailyLimit = tierEditForm.dailyLimit;
    }
    if (managerTierPermissions.monthlyLimit) {
      payload.monthlyLimit = tierEditForm.monthlyLimit;
    }
    if (managerTierPermissions.penaltyAmount) {
      payload.penaltyAmount = tierEditForm.penaltyAmount;
    }
    if (managerTierPermissions.interestRate) {
      payload.interestRate = formatMonthlyInterestRate(tierEditForm.interestRate);
    }
    if (managerTierPermissions.accountTypeOdRules) {
      payload.accountTypeOdRules = normalizeTierRules(tierEditForm.accountTypeOdRules);
      payload.maxODLimit = Math.max(
        0,
        ...payload.accountTypeOdRules.map((rule) => Number(rule.odLimit || 0))
      );
    }

    if (Object.keys(payload).length === 0) {
      toast.warning("No permitted fields are available to save.");
      return;
    }

    setIsSavingTierEdit(true);

    try {
      await api.patch(`/tiers/${tierEditReview.key}`, payload);
      toast.success(`${tierEditReview.label} policy updated.`);
      closeTierEdit();
      await loadDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update tier policy.");
      setIsSavingTierEdit(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const approvalTable = (
    <section className="table-shell">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">Pending Approvals</h2>
          <p className="text-sm text-slate-500">
            Highest value requests appear first so urgent transfer decisions are easy to find.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
            {pendingApprovals.length} pending
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            {formatCurrency(pendingApprovalValue)} waiting
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        {approvalMessage && <div className="alert-success mx-6 mt-6">{approvalMessage}</div>}
        {approvalError && <div className="alert-error mx-6 mt-6">{approvalError}</div>}
        <table className="w-full min-w-[1040px] table-fixed text-left">
          <thead className="table-head">
            <tr>
              <th className="w-[17%] px-6 py-4">Request</th>
              <th className="w-[22%] px-6 py-4">Customer</th>
              <th className="w-[18%] px-6 py-4">Account</th>
              <th className="w-[15%] px-6 py-4">Amount</th>
              <th className="w-[12%] px-6 py-4">Status</th>
              <th className="w-[16%] px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleApprovalQueue.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8">
                  <EmptyState message="No transfer requests are waiting for your decision." />
                </td>
              </tr>
            )}
            {approvalPagination.pageRows.map((approval) => (
              <Fragment key={approval.id}>
                <tr className="table-row align-top">
                  <td className="px-6 py-4">
                    <p className="break-words font-bold text-slate-950">{approval.id}</p>
                    <p className="mt-1 text-xs font-semibold uppercase text-slate-400">
                      {transactionTypeLabels[approval.type] || approval.type || "Transfer"}
                    </p>
                    <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">
                      Requested {formatDateTime(approval.requestedOn)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="break-words font-semibold text-slate-900">
                      {approval.customer || "Customer"}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Waiting for manager decision
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="rounded-lg bg-bank-surface px-3 py-2">
                      <p className="text-xs font-bold uppercase text-slate-500">From</p>
                      <p className="mt-1 break-words font-semibold text-slate-900">
                        {maskAccountNumber(approval.account)}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="break-words text-lg font-bold text-slate-950">
                      {formatCurrency(approval.amount)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${statusStyles[approval.status]}`}
                    >
                      {approval.status}
                    </span>
                    {approval.rejectionReason && (
                      <p className="mt-2 max-w-56 text-xs text-slate-500">
                        {approval.rejectionReason}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="grid gap-2">
                      <button
                        type="button"
                        onClick={() => updateApproval(approval.id, "approved")}
                        disabled={approval.status !== "pending"}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Approve ${approval.id}`}
                      >
                        <Check size={16} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openRejectReview(approval)}
                        disabled={approval.status !== "pending"}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Reject ${approval.id}`}
                      >
                        <X size={16} />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
                {rejectionReview?.id === approval.id && (
                  <tr className="border-b border-red-100 bg-red-50/50">
                    <td colSpan={6} className="px-6 py-5">
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                        <label className="label-field">
                          Rejection Reason
                          <textarea
                            value={rejectionReview.reason}
                            onChange={(event) => updateRejectionReason(event.target.value)}
                            className="input-field mt-2 min-h-24 resize-y"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => confirmRejection(approval.id)}
                            className="btn-danger-soft"
                          >
                            Confirm Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectionReview(null)}
                            className="btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <TablePagination {...approvalPagination} />
      </div>
    </section>
  );

  const approvalHistoryTable = (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Total Decisions" value={decisionSummary.total} tone="accent" />
        <MetricTile label="Loan Decisions" value={decisionSummary.loans} tone="success" />
        <MetricTile label="Transfer Decisions" value={decisionSummary.transfers} tone="default" />
        <MetricTile label="Today" value={decisionSummary.today} tone="warning" />
      </div>

      <SectionCard
        title="Decision History"
        subtitle="Completed transfer approvals, loan outcomes, disbursals, and tier policy edits."
        icon={ShieldCheck}
      >
        {decisionHistory.length === 0 ? (
          <EmptyState message="No manager decisions are available yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-left">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-4">Subject</th>
                  <th className="px-5 py-4">Category</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Decision Type</th>
                  <th className="px-5 py-4">Amount / Impact</th>
                  <th className="px-5 py-4">Entity</th>
                  <th className="px-5 py-4">Reviewed On</th>
                  <th className="px-5 py-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {decisionHistoryPagination.pageRows.map((decision) => (
                  <tr key={decision.id} className="table-row align-top">
                    <td className="w-56 px-5 py-5">
                      <p className="max-w-56 break-words font-bold leading-6 text-slate-950">
                        {decision.subject}
                      </p>
                      <p className="mt-1 max-w-56 break-words text-xs font-semibold text-slate-500">
                        {decision.displayId}
                      </p>
                    </td>
                    <td className="w-28 px-5 py-5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                          decisionCategoryStyles[decision.category] || decisionCategoryStyles.transfer
                        }`}
                      >
                        {decision.category}
                      </span>
                    </td>
                    <td className="w-32 px-5 py-5">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                          statusStyles[decision.status] || statusStyles.updated
                        }`}
                      >
                        {formatStatusLabel(decision.status)}
                      </span>
                    </td>
                    <td className="w-48 px-5 py-5">
                      <p className="max-w-48 break-words text-sm font-semibold leading-6 text-slate-600">
                        {decision.type}
                      </p>
                    </td>
                    <td className="w-40 px-5 py-5 font-bold leading-6 text-slate-950">
                      {decision.amount}
                    </td>
                    <td className="w-40 px-5 py-5 break-words font-semibold leading-6 text-slate-700">
                      {decision.entity}
                    </td>
                    <td className="w-44 px-5 py-5 font-semibold leading-6 text-slate-950">
                      {formatDateTime(decision.reviewedAt)}
                    </td>
                    <td className="min-w-80 px-5 py-5">
                      <p className="max-w-96 whitespace-normal break-words text-sm font-semibold leading-6 text-slate-600">
                        {decision.detail || "-"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination {...decisionHistoryPagination} />
          </div>
        )}
      </SectionCard>
    </section>
  );

  const odOverview = (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Active OD Customers"
        value={dashboardData.stats.odCases}
        icon={Users}
        accent="bg-blue-500"
        iconTone="bg-blue-50 text-blue-600"
        badge={{
          text:
            dashboardData.stats.criticalOdCustomers > 0
              ? `${dashboardData.stats.criticalOdCustomers} high risk`
              : "No high risk",
          tone: dashboardData.stats.criticalOdCustomers > 0 ? "warning" : "success",
        }}
      />
      <StatsCard
        title="Utilized OD"
        value={formatCurrency(utilizedOd)}
        icon={CircleDollarSign}
        accent="bg-amber-500"
        iconTone="bg-amber-50 text-amber-600"
        footer={{ text: `${odPercent}% of sanctioned OD` }}
      />
      <StatsCard
        title="Available OD"
        value={formatCurrency(dashboardData.stats.availableOd ?? totalOdLimit - utilizedOd)}
        icon={CreditCard}
        accent="bg-emerald-500"
        iconTone="bg-emerald-50 text-emerald-600"
        badge={{ text: "Across customers", tone: "neutral" }}
      />
      <StatsCard
        title="High Risk Customers"
        value={dashboardData.stats.criticalOdCustomers || 0}
        icon={ShieldAlert}
        accent="bg-red-500"
        iconTone="bg-red-50 text-red-600"
        badge={{
          text:
            dashboardData.stats.criticalOdCustomers > 0
              ? "Review needed"
              : "No high risk",
          tone: dashboardData.stats.criticalOdCustomers > 0 ? "warning" : "success",
        }}
      />
    </section>
  );

  const odOperationsStrip = (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-xl border border-bank-card-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-bank-eyebrow">
              Manager Focus
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {odCustomerSummary.attentionCount > 0
                ? `${odCustomerSummary.attentionCount} OD account cases need attention`
                : "OD exposure is currently steady"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Prioritize blocked accounts, high utilization, and customers close to exhausting
              monthly OD usage before reviewing routine activity.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              odCustomerSummary.attentionCount > 0
                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
            }`}
          >
            {odCustomerSummary.attentionCount > 0 ? "Review queue" : "All clear"}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricTile
            label="Critical"
            value={odCustomerSummary.criticalCount}
            tone={odCustomerSummary.criticalCount > 0 ? "danger" : "success"}
          />
          <MetricTile
            label="Blocked"
            value={odCustomerSummary.blockedCount}
            tone={odCustomerSummary.blockedCount > 0 ? "danger" : "success"}
          />
          <MetricTile
            label="Near Limit"
            value={odCustomerSummary.nearLimitCount}
            tone={odCustomerSummary.nearLimitCount > 0 ? "warning" : "success"}
          />
          <MetricTile
            label="Active OD"
            value={odCustomerSummary.activeCount}
            tone={odCustomerSummary.activeCount > 0 ? "accent" : "default"}
          />
        </div>
      </div>
      <div className="rounded-xl border border-bank-card-border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Review Workflow</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Start with attention cases, confirm payoff movement, then check whether tier rules
              still match account-level exposure.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          {[
            "Check blocked and 70%+ utilization accounts",
            "Review recent payoff transactions",
            "Compare exposure with tier and account type rules",
          ].map((step, index) => (
            <div key={step} className="flex items-center gap-3 rounded-lg bg-bank-surface p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-bank-eyebrow shadow-sm">
                {index + 1}
              </span>
              <span className="font-semibold text-slate-700">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const odUtilizationCard = (
    <SectionCard title="OD Utilization" subtitle="Sanctioned limit versus active usage" icon={Gauge}>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
        <div>
          <RechartsDonut
            rows={[
              { label: "Used", value: utilizedOd, color: "#2563eb" },
              { label: "Available", value: Math.max(0, totalOdLimit - utilizedOd), color: "#e2e8f0" },
            ]}
            emptyMessage="No overdraft limits are available to chart."
            height={220}
          />
        </div>
        <div className="metric-grid">
          <MetricTile label="Total OD Limit" value={formatCurrency(totalOdLimit)} />
          <MetricTile label="Current OD Used" value={formatCurrency(utilizedOd)} tone="warning" />
          <MetricTile
            label="Remaining OD"
            value={formatCurrency(dashboardData.stats.availableOd ?? totalOdLimit - utilizedOd)}
            tone="success"
          />
        </div>
      </div>
    </SectionCard>
  );

  const odTopUtilizersCard = (
    <SectionCard title="Top Customer Utilization" subtitle="Highest active overdraft balances" icon={BarChart3}>
      <RechartsHorizontalBar
        rows={odUtilizers.map((item) => {
          const risk = odRiskStyles[item.risk] || odRiskStyles.active;

          return {
            label: item.customer,
            value: item.used,
            color:
              risk.label === "Critical"
                ? "#ef4444"
                : risk.label === "High"
                  ? "#f59e0b"
                  : "#2563eb",
          };
        })}
        valueFormatter={formatCurrency}
        emptyMessage="No active overdraft usage is recorded right now."
      />
    </SectionCard>
  );

  const odRiskCard = (
    <SectionCard title="Risk Distribution" subtitle="Customers grouped by OD utilization">
      <RechartsDonut
        rows={overdraftRisk.map((item) => {
          const risk = odRiskStyles[item.label] || odRiskStyles.unused;

          return {
            label: risk.label,
            value: item.value,
            color:
              risk.label === "Critical"
                ? "#ef4444"
                : risk.label === "High"
                  ? "#f59e0b"
                  : risk.label === "Active"
                    ? "#2563eb"
                    : "#94a3b8",
          };
        })}
        emptyMessage="No overdraft utilization groups are available right now."
      />
    </SectionCard>
  );

  const odExposureCard = (
    <SectionCard title="Exposure By Account Type" subtitle="Active OD amount by primary account">
      <RechartsHorizontalBar
        rows={overdraftExposureByType.map((item, index) => ({
          ...item,
          color: ["#0891b2", "#2563eb", "#10b981"][index % 3],
        }))}
        valueFormatter={formatCurrency}
        emptyMessage="No active overdraft exposure is linked to account types."
      />
    </SectionCard>
  );

  const tierPolicyDetails = (
    <SectionCard
      title="Tier Policies"
      subtitle={
        canEditAnyTierField
          ? "Review policy limits and update only the fields enabled by admin."
          : "Review admin-defined tier limits. Editing is currently locked for managers."
      }
      icon={ShieldCheck}
    >
      <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-950">
                {editableTierFieldCount} of {tierPermissionLabels.length} fields editable
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Admin controls these permissions from Business Rules.
              </p>
            </div>
            <span
              className={`inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
                canEditAnyTierField
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
              }`}
            >
              <SlidersHorizontal size={16} />
              {canEditAnyTierField ? "Manager edits enabled" : "Manager edits locked"}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tierPermissionLabels.map(([field, label]) => {
              const isAllowed = managerTierPermissions[field];

              return (
                <span
                  key={field}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    isAllowed
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                      : "bg-white text-slate-500 ring-1 ring-slate-200"
                  }`}
                >
                  {isAllowed ? <Check size={13} /> : <X size={13} />}
                  {label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-bank-card-border bg-white p-4 xl:min-w-52">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Policies
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{tierPolicies.length}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Available for review</p>
        </div>
      </div>

      {tierPolicies.length === 0 && (
        <EmptyState message="No tier policies are available for manager review." />
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {tierPolicies.map((tier) => (
          <div
            key={tier.key}
            className={`rounded-xl border bg-white p-5 shadow-sm ${getTierTone(tier.key).card}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${getTierTone(tier.key).badge}`}>
                  {tier.label} Tier
                </span>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Transaction, overdraft, penalty, and account-opening rules for this tier.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openTierEdit(tier)}
                disabled={!canEditAnyTierField}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
                  canEditAnyTierField
                    ? "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                <Edit3 size={15} />
                Edit
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                ["Per transfer", formatCurrency(tier.perTxnLimit)],
                ["Daily limit", formatCurrency(tier.dailyLimit)],
                ["Monthly limit", formatCurrency(tier.monthlyLimit)],
                ["Interest", tier.interestRate || "No interest"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-white/80 p-3">
                  <p className="font-semibold text-slate-500">{label}</p>
                  <p className="mt-1 break-words font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {(tier.accountTypeOdRules || []).map((rule) => (
                <div
                  key={`${tier.key}-${rule.accountType}`}
                  className="rounded-lg border border-slate-100 bg-white/80 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{rule.accountType}</p>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      3 uses/month
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="font-semibold text-slate-500">OD Limit</p>
                      <p className="font-bold text-slate-900">
                        {formatCurrency(rule.odLimit || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-500">Minimum Opening Balance</p>
                      <p className="font-bold text-slate-900">
                        {formatCurrency(rule.minOpeningBalance || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800">
                <p className="font-semibold">Penalty</p>
                <p className="font-bold">{formatCurrency(tier.penaltyAmount)}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/80 p-3 text-slate-700">
                <p className="font-semibold">Updated</p>
                <p className="font-bold">
                  {tier.updatedAt ? new Date(tier.updatedAt).toLocaleDateString() : "-"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );

  const odCustomerTable = (
    <SectionCard title="Customer Overdraft Accounts" subtitle="Each row below is one account-level OD case">
      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="text-sm font-bold text-slate-900">
            {filteredOverdraftCustomers.length} of {overdraftCustomers.length} account cases shown
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Salary, Current, and Savings accounts are tracked independently.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { key: "attention", label: "Needs attention", count: odCustomerSummary.attentionCount },
              { key: "active", label: "Active OD", count: odCustomerSummary.activeCount },
              { key: "blocked", label: "Blocked", count: odCustomerSummary.blockedCount },
              { key: "all", label: "All cases", count: overdraftCustomers.length },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setOdCustomerFilter(filter.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  odCustomerFilter === filter.key
                    ? "bg-bank-accent text-white shadow-sm"
                    : "border border-bank-card-border bg-white text-slate-600 hover:bg-bank-surface"
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    odCustomerFilter === filter.key
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        </div>
        <label className="relative block min-w-full xl:min-w-80">
          <span className="sr-only">Search overdraft accounts</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={odCustomerSearch}
            onChange={(event) => setOdCustomerSearch(event.target.value)}
            className="w-full rounded-lg border border-bank-card-border bg-white py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-bank-accent focus:ring-4 focus:ring-bank-accent/15"
            placeholder="Search customer, account, tier"
          />
        </label>
      </div>
      {overdraftCustomers.length === 0 && (
        <EmptyState message="No customer accounts are currently using overdraft." />
      )}
      {overdraftCustomers.length > 0 && filteredOverdraftCustomers.length === 0 && (
        <EmptyState message="No overdraft accounts match this filter." />
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {overdraftCustomerPagination.pageRows.map((customer) => {
          const risk = odRiskStyles[customer.risk] || odRiskStyles.unused;
          const usagePercent = clampPercent(customer.utilization);

          return (
            <div
              key={customer.id || `${customer.customerId}-${customer.account}`}
              className={`rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                customer.isBlocked || customer.risk === "critical"
                  ? "border-red-200"
                  : customer.risk === "high" || usagePercent >= 70
                    ? "border-amber-200"
                    : "border-bank-card-border"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{customer.customer}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getTierTone(customer.classification).badge}`}>
                      {customer.classification}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${risk.badge}`}>
                      {risk.label}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase text-slate-500">{customer.accountType}</p>
                  <p className="mt-1 font-bold text-slate-900">{maskAccountNumber(customer.account)}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-600">Limit usage</span>
                <span className="font-bold text-slate-950">{usagePercent}%</span>
              </div>
              <div className="group relative mt-2 rounded-full outline-none" tabIndex={0}>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${risk.bar}`}
                  style={{
                    width: usagePercent > 0 ? `${Math.max(4, usagePercent)}%` : "0%",
                  }}
                />
              </div>
              <ChartTooltip
                label={`${customer.customer} Limit Usage`}
                value={`${usagePercent}% used`}
                detail={`${formatCurrency(customer.used)} used of ${formatCurrency(customer.limit)} limit | ${customer.odAttempts || 0} uses`}
                className="bottom-full right-0 mb-2 hidden group-hover:block group-focus:block"
              />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricTile label="Limit" value={formatCurrency(customer.limit)} />
                <MetricTile label="Used" value={formatCurrency(customer.used)} tone={customer.used > 0 ? "warning" : "success"} />
                <MetricTile label="Available" value={formatCurrency(customer.available)} tone="success" />
                <MetricTile
                  label="Uses"
                  value={`${customer.odAttempts || 0} / ${customer.monthlyOdUses ?? 3}`}
                  tone={customer.isBlocked ? "danger" : "accent"}
                />
              </div>
              <div className="mt-4 rounded-lg bg-bank-surface p-3 text-sm font-semibold text-slate-600">
                {customer.isBlocked
                  ? "OD blocked for this account until monthly reset."
                  : usagePercent >= 70
                    ? "High utilization. Review before additional exposure."
                    : Number(customer.used || 0) > 0
                      ? "Active OD. Monitor repayment and monthly usage."
                      : "OD available. No active balance."}
              </div>
            </div>
          );
        })}
      </div>
      <TablePagination {...overdraftCustomerPagination} />
    </SectionCard>
  );

  const odRecentActivity = (
    <SectionCard title="Recent OD Activity" subtitle="Latest overdraft payoff and OD alerts">
      <div className="space-y-3">
        {recentOverdraftActivity.length === 0 && (
          <EmptyState message="No recent overdraft activity is available." />
        )}
        {recentOverdraftActivityPagination.pageRows.map((activity) => (
          <div key={activity.id} className="activity-item items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900">{activity.customer}</p>
              <p className="text-sm text-slate-500">
                {activity.type} - {activity.status}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900">{formatCurrency(activity.amount)}</p>
              <p className="text-xs text-slate-500">
                {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : "Recently"}
              </p>
            </div>
          </div>
        ))}
      </div>
      <TablePagination {...recentOverdraftActivityPagination} />
    </SectionCard>
  );

  const odPayoffTransactionsTable = (
    <section className="table-shell">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-6">
        <div>
          <h2 className="text-xl font-bold">Overdraft Payoff Transactions</h2>
          <p className="text-sm text-slate-500">
            Customer payments made to reduce or close active overdraft dues.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {overdraftPayoffTransactions.length} payoff transactions
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
            Latest first
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="table-head">
            <tr>
              <th className="px-6 py-4">Txn ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Account</th>
              <th className="px-6 py-4">Paid Amount</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {overdraftPayoffTransactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8">
                  <EmptyState message="No overdraft payoff transactions are available." />
                </td>
              </tr>
            )}
            {overdraftPayoffPagination.pageRows.map((transaction) => (
              <tr key={transaction.id} className="table-row">
                <td className="px-6 py-4 font-semibold">{transaction.id}</td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-slate-900">{transaction.customer}</p>
                  <p className="text-xs text-slate-500">
                    {transaction.customerId || transaction.email || "Customer"}
                  </p>
                </td>
                <td className="px-6 py-4">{maskAccountNumber(transaction.fromAccountNumber)}</td>
                <td className="px-6 py-4 font-semibold text-emerald-700">
                  {formatCurrency(transaction.amount)}
                </td>
                <td className="px-6 py-4">
                  {transaction.createdAt
                    ? new Date(transaction.createdAt).toLocaleString()
                    : "Recently"}
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-700 ring-1 ring-emerald-100">
                    {getTransactionStatusLabel(transaction.status)}
                  </span>
                </td>
                <td className="max-w-xs px-6 py-4 text-sm text-slate-600">
                  {transaction.remarks || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination {...overdraftPayoffPagination} />
      </div>
    </section>
  );

  const odMonitoringTabs = [
    { key: "cases", label: "Customer Cases", count: filteredOverdraftCustomers.length },
    { key: "overview", label: "Risk Overview", count: overdraftRisk.length + overdraftExposureByType.length },
    { key: "payoffs", label: "Payoffs", count: overdraftPayoffTransactions.length },
    { key: "activity", label: "Recent Activity", count: recentOverdraftActivity.length },
  ];

  const odTabContent = {
    cases: odCustomerTable,
    overview: (
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          {odUtilizationCard}
          {odTopUtilizersCard}
        </section>
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {odRiskCard}
          {odExposureCard}
        </section>
      </div>
    ),
    payoffs: odPayoffTransactionsTable,
    activity: odRecentActivity,
  };

  const odSection = (
    <div className="space-y-6">
      {odOverview}
      {odOperationsStrip}
      <section className="sticky top-0 z-10 -mx-1 overflow-x-auto border-y border-bank-card-border bg-bank-surface/95 px-1 py-3 backdrop-blur">
        <div className="flex min-w-max gap-2">
          {odMonitoringTabs.map((tab) => {
            const isActive = odMonitoringTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setOdMonitoringTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
                  isActive
                    ? "bg-bank-accent text-white shadow-sm"
                    : "border border-bank-card-border bg-white text-slate-600 hover:bg-white hover:text-bank-eyebrow"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {odTabContent[odMonitoringTab] ?? odCustomerTable}
    </div>
  );

  const escalationSection = (
    <SectionCard title="Escalations" subtitle="Action items that need manager review">
      <div className="mb-4 flex flex-wrap gap-3">
        <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">
          {approvalEscalations.length} pending approval{approvalEscalations.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-100">
          {displayedEscalations.filter((item) => item.metadata?.odCountThisMonth).length} OD limit alert{displayedEscalations.filter((item) => item.metadata?.odCountThisMonth).length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-3">
        {displayedEscalations.length === 0 && (
          <EmptyState message="No manager escalations require attention." />
        )}
        {escalationPagination.pageRows.map((item) => (
          <div
            key={item.id}
            className={`activity-item items-center justify-between ${
              item.severity === "danger"
                ? "border-red-200/80 bg-red-50/60"
                : "border-amber-200/80 bg-amber-50/60"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`rounded-full p-2 ${
                  item.severity === "danger"
                    ? "bg-red-50 text-red-600"
                    : item.severity === "warning"
                      ? "bg-amber-50 text-amber-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                <ShieldAlert size={18} />
              </div>
              <div>
                <p className="font-semibold">{item.title}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-600">
                  <span>{formatCurrency(item.amount)}</span>
                  {item.metadata?.approvalId && <span>Approval {item.metadata.approvalId}</span>}
                  {item.metadata?.odCountThisMonth && (
                    <span>OD uses this month: {item.metadata.odCountThisMonth}</span>
                  )}
                  {item.metadata?.accountNumber && (
                    <span>{maskAccountNumber(item.metadata.accountNumber)}</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-500">{item.time}</p>
          </div>
        ))}
      </div>
      <TablePagination {...escalationPagination} />
    </SectionCard>
  );

  const transactionsSection = (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Transaction Value"
          value={formatCurrency(transactionSummary.totalValue)}
          icon={ReceiptText}
          accent="bg-blue-500"
          iconTone="bg-blue-50 text-blue-600"
          footer={{ text: `${transactions.length} total transaction${transactions.length === 1 ? "" : "s"}` }}
        />
        <StatsCard
          title="Successful"
          value={transactionSummary.successfulCount}
          icon={Check}
          accent="bg-emerald-500"
          iconTone="bg-emerald-50 text-emerald-600"
          badge={{ text: "Completed", tone: "success" }}
        />
        <StatsCard
          title="Pending"
          value={transactionSummary.pendingCount}
          icon={Clock}
          accent="bg-amber-500"
          iconTone="bg-amber-50 text-amber-600"
          badge={{
            text: transactionSummary.pendingCount > 0 ? "Needs tracking" : "Clear",
            tone: transactionSummary.pendingCount > 0 ? "warning" : "success",
          }}
        />
        <StatsCard
          title="OD Payoffs"
          value={transactionSummary.payoffCount}
          icon={CircleDollarSign}
          accent="bg-violet-500"
          iconTone="bg-violet-50 text-violet-600"
          badge={{ text: `${transactionSummary.failedCount} failed`, tone: transactionSummary.failedCount > 0 ? "warning" : "success" }}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard
          title="Transaction Health"
          subtitle="Status split for the latest customer transaction register."
          icon={BarChart3}
        >
          <RechartsHorizontalBar
            rows={transactionStatusRows.map((row) => ({
              label: row.label,
              value: row.value,
              color:
                row.key === "success"
                  ? "#10b981"
                  : row.key === "failed"
                    ? "#ef4444"
                    : "#f59e0b",
            }))}
            valueFormatter={(value) => `${value}`}
            emptyMessage="No transaction status records are available yet."
          />
        </SectionCard>

        <SectionCard
          title="Transfer Mix"
          subtitle="Value and count by transaction type for quick reconciliation."
          icon={ReceiptText}
        >
          {transactionTypeRows.length === 0 ? (
            <EmptyState message="No transaction mix is available yet." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {transactionTypeRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-bank-card-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-950">
                        {transactionTypeLabels[row.key] || row.key}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {row.count} transaction{row.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="rounded-full bg-bank-surface px-3 py-1 text-xs font-bold text-bank-eyebrow">
                      Type
                    </span>
                  </div>
                  <p className="mt-4 break-words text-xl font-bold text-slate-950">
                    {formatCurrency(row.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      <SectionCard
        title="Latest Transaction Activity"
        subtitle="Most recent customer movements before filtering the register below."
        icon={Clock}
      >
        {recentTransactions.length === 0 ? (
          <EmptyState message="No recent transaction activity is available." />
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-col gap-3 rounded-xl border border-bank-card-border bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-bold text-slate-950">{transaction.id}</p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-600">
                    {transaction.customer || "Customer"} to {transaction.receiver || "Receiver"}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {formatDateTime(transaction.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="font-bold text-slate-950">{formatCurrency(transaction.amount)}</p>
                  <span
                    className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                      transactionStatusStyles[transaction.status] || transactionStatusStyles.pending
                    }`}
                  >
                    {getTransactionStatusLabel(transaction.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <section className="table-shell">
        <div className="border-b border-slate-100 p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-bold">Transaction Register</h2>
              <p className="text-sm text-slate-500">
                Search, filter, and review customer money movement with account route and outcome notes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "All", count: transactions.length },
                { key: "success", label: "Successful", count: transactionSummary.successfulCount },
                { key: "pending", label: "Pending", count: transactionSummary.pendingCount },
                { key: "failed", label: "Failed", count: transactionSummary.failedCount },
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setTransactionStatusFilter(filter.key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                    transactionStatusFilter === filter.key
                      ? "bg-bank-accent text-white shadow-sm"
                      : "border border-bank-card-border bg-white text-slate-600 hover:bg-bank-surface"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      transactionStatusFilter === filter.key
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <label className="relative block">
              <span className="sr-only">Search transactions</span>
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={transactionSearch}
                onChange={(event) => setTransactionSearch(event.target.value)}
                placeholder="Search by transaction ID, customer, account, receiver, or remarks"
                className="input-field pl-10"
              />
            </label>
            <span className="rounded-full bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
              {filteredTransactions.length} shown
            </span>
          </div>
        </div>

        <div className="overflow-hidden">
          <table className="w-full table-fixed text-left">
            <thead className="table-head">
              <tr>
                <th className="w-[26%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 lg:px-8">Transfer</th>
                <th className="w-[31%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 lg:px-8">Route</th>
                <th className="w-[16%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 lg:px-8">Amount</th>
                <th className="w-[14%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 lg:px-8">Status</th>
                <th className="w-[13%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 lg:px-8">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8">
                    <EmptyState message="No customer transactions match this view." />
                  </td>
                </tr>
              )}
              {transactionPagination.pageRows.map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100 align-middle last:border-b-0">
                  <td className="px-3 py-8 sm:px-5 lg:px-8">
                    <p className="break-words text-lg font-bold text-slate-950">
                      {transaction.id}
                    </p>
                    <p className="mt-3 break-words text-xs font-bold uppercase tracking-[0.04em] text-slate-400">
                      {String(transaction.type || "transfer").toUpperCase()}
                    </p>
                    {transaction.remarks && (
                      <p className="mt-3 break-words text-xs font-semibold leading-5 text-slate-500">
                        {transaction.remarks}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-8 sm:px-5 lg:px-8">
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                          From
                        </p>
                        <p className="mt-1 break-words text-lg font-bold text-slate-950">
                          {transaction.customer || "Customer"}
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                          Account / {maskAccountNumber(transaction.fromAccountNumber)}
                        </p>
                      </div>
                      <div className="w-fit max-w-full rounded-lg bg-blue-50 px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
                          To
                        </p>
                        <p className="mt-1 break-words text-lg font-bold text-slate-950">
                          {transaction.receiver || "Receiver"}
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                          Account / {maskAccountNumber(transaction.toAccountNumber)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-8 sm:px-5 lg:px-8">
                    <p className="break-words text-lg font-bold text-slate-950">
                      {formatCurrency(transaction.amount)}
                    </p>
                  </td>
                  <td className="px-3 py-8 sm:px-5 lg:px-8">
                    <span
                      className={`inline-flex rounded-full px-4 py-2 text-sm font-bold capitalize ${
                        transactionStatusStyles[transaction.status] || transactionStatusStyles.pending
                      }`}
                    >
                      {getTransactionStatusLabel(transaction.status)}
                    </span>
                    {transaction.failureReason && (
                      <p className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                        Reason: {transaction.failureReason}
                      </p>
                    )}
                    {!transaction.failureReason && transaction.status === "pending" && (
                      <p className="mt-3 break-words rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-700">
                        Waiting for approval or processing.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-8 sm:px-5 lg:px-8">
                    <p className="break-words text-lg font-semibold text-slate-950">
                      {transaction.createdAt
                        ? new Date(transaction.createdAt).toISOString().slice(0, 10)
                        : "Recently"}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination {...transactionPagination} />
        </div>
      </section>
    </div>
  );

  const notificationsSection = (
    <SectionCard title="Notifications" subtitle="Outcome updates and general branch activity">
      <div className="space-y-3">
        {notifications.length === 0 && (
          <EmptyState message="No notifications yet. Updates will appear here." />
        )}
        {notificationPagination.pageRows.map((notification) => (
          <div
            key={notification.id || notification.message}
            className={`activity-item items-start justify-between ${
              notificationToneStyles[notification.type] || notificationToneStyles.info
            }`}
          >
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 rounded-full bg-white/80 p-2 shadow-sm">
                <Bell size={16} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{notification.title}</p>
                <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                {notification.amount > 0 && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Amount: {formatCurrency(notification.amount)}
                  </p>
                )}
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-500">
              {notification.time}
            </span>
          </div>
        ))}
      </div>
      <TablePagination {...notificationPagination} />
    </SectionCard>
  );

  const profileSection = (
    <div className="space-y-6">
      <section className="card-padded overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-bank-accent text-2xl font-bold text-white shadow-md">
              {(user?.name || "M")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight text-slate-950">
                  {user?.name || managerProfile.name || "Manager"}
                </h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-700 ring-1 ring-emerald-100">
                  {user?.status || "active"}
                </span>
              </div>
              <p className="mt-2 text-slate-500">
                {managerProfile.role || "Manager"} for Jaipur
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricTile label="Pending" value={pendingApprovals.length} tone={pendingApprovals.length > 0 ? "warning" : "success"} />
            <MetricTile label="OD Alerts" value={displayedEscalations.filter((item) => item.metadata?.odCountThisMonth).length} tone="warning" />
            <MetricTile label="Decisions" value={decisionHistory.length} tone="accent" />
          </div>
        </div>
      </section>

      <section>
        <SectionCard title="Profile Details" subtitle="Manager identity and branch assignment" icon={UserCircle}>
          {profileMessage && <div className="alert-success mb-4">{profileMessage}</div>}
          {profileError && <div className="alert-error mb-4">{profileError}</div>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { icon: IdCard, label: "Employee ID", value: managerProfile.employeeId || user?.employeeId || "Not assigned" },
              { icon: ShieldCheck, label: "Manager Level", value: "Branch Manager" },
              { icon: Mail, label: "Email", value: user?.email || "Not available" },
              { icon: MapPin, label: "Branch", value: "Jaipur" },
              { icon: IdCard, label: "IFSC Code", value: user?.account?.ifsc || user?.accounts?.[0]?.ifsc || "ADNT0281237" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl border border-bank-card-border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-bank-surface p-2 text-bank-eyebrow">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-bank-card-border bg-white p-4 md:col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="rounded-lg bg-bank-surface p-2 text-bank-eyebrow">
                    <Phone size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Phone
                    </p>
                    {isEditingPhone ? (
                      <input
                        value={profilePhone}
                        onChange={(event) => setProfilePhone(event.target.value)}
                        className="input-field mt-2 max-w-sm"
                        inputMode="numeric"
                        maxLength={10}
                      />
                    ) : (
                      <p className="mt-1 break-words font-semibold text-slate-900">
                        {user?.phone || "Not available"}
                      </p>
                    )}
                  </div>
                </div>
                {isEditingPhone ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={savePhoneNumber} className="btn-primary">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePhone(user?.phone || "");
                        setIsEditingPhone(false);
                        setProfileError("");
                        setProfileMessage("");
                      }}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePhone(user?.phone || "");
                      setIsEditingPhone(true);
                      setProfileError("");
                      setProfileMessage("");
                    }}
                    className="btn-secondary"
                  >
                    Edit Phone
                  </button>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      </section>
    </div>
  );

  const loanReviewsSection = (
    <div className="space-y-6">
      {loanMessage && <div className="alert-success">{loanMessage}</div>}
      {loanError && <div className="alert-error">{loanError}</div>}

      <div className="stat-grid">
        <StatsCard
          title="Pending Loan Reviews"
          value={pendingLoanReviews.length}
          icon={BadgeIndianRupee}
          accent="bg-amber-500"
          iconTone="bg-amber-50 text-amber-600"
          badge={
            pendingLoanReviews.length > 0
              ? { text: "Needs review", tone: "warning" }
              : { text: "Queue clear", tone: "success" }
          }
        />
        <StatsCard
          title="Approved For Disbursal"
          value={approvedLoans.length}
          icon={Check}
          accent="bg-emerald-500"
          iconTone="bg-emerald-50 text-emerald-600"
          footer={{ text: "Awaiting release to customer account" }}
        />
        <StatsCard
          title="Disbursed Loan Value"
          value={formatCurrency(disbursedLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0))}
          icon={CircleDollarSign}
          accent="bg-violet-500"
          iconTone="bg-violet-50 text-violet-600"
          footer={{ text: `${disbursedLoans.length} active loan(s)` }}
        />
      </div>

      <SectionCard
        title="Loan Review Queue"
        subtitle="Review income, liabilities, EMI impact, and score recommendation before making a manager decision."
        icon={BadgeIndianRupee}
      >
        {pendingLoanReviews.length === 0 ? (
          <EmptyState message="No loan applications are waiting for manager review." />
        ) : (
          <div className="space-y-4">
            {loanReviewPagination.pageRows.map((loan) => {
              const scoreTone = getLoanScoreTone(loan.eligibilityScore);
              const isExpanded = expandedLoanId === loan.id;

              return (
              <article key={loan.id} className="overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm">
                <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.25fr)_0.75fr_0.65fr_0.7fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-slate-950">
                        {loan.customerName || "Customer"}
                      </h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${loanStatusStyles[loan.status] || loanStatusStyles.submitted}`}>
                        {formatStatusLabel(loan.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {loan.customerCode || "Customer ID pending"} / {loan.id}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Loan Type</p>
                    <p className="mt-1 truncate font-bold text-slate-950">{loan.loanTypeLabel}</p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Amount</p>
                    <p className="mt-1 font-bold text-slate-950">{formatCurrency(loan.amount)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Score</p>
                    <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${scoreTone.bg} ${scoreTone.text} ${scoreTone.ring}`}>
                      {scoreTone.label} / {loan.eligibilityScore}
                    </span>
                  </div>

                  <div className="flex lg:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedLoanId(isExpanded ? "" : loan.id);
                        setLoanReview(null);
                        setLoanDocumentReview(null);
                      }}
                      className="btn-secondary w-full justify-center whitespace-nowrap px-4 py-2 lg:w-auto"
                    >
                      {isExpanded ? "Hide Details" : "Review Details"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-bank-card-border bg-slate-50/70 p-4">
                    <div className="grid gap-5 xl:grid-cols-[1fr_1.05fr] xl:items-start">
                      <div className="space-y-3">
                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-500">Monthly EMI</p>
                              <p className="mt-1 font-bold text-blue-700">{formatCurrency(loan.emiAmount)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-500">Tenure</p>
                              <p className="mt-1 font-bold text-slate-950">{loan.tenureMonths} months</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-500">Rate</p>
                              <p className="mt-1 font-bold text-slate-950">{loan.annualInterestRate}%</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-500">Recommendation</p>
                              <p className="mt-1 font-bold text-slate-950">{loan.eligibilityRecommendation}</p>
                            </div>
                          </div>
                        </div>

                        {loan.eligibilityDetails?.classificationBenefit && (
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold leading-6 text-emerald-800">
                            {loan.customerClassification || "Classification"} benefit: {loan.eligibilityDetails.classificationBenefit.interestDiscount}% rate discount, max amount {formatCurrency(loan.eligibilityDetails.classificationBenefit.maxAmount)}.
                          </div>
                        )}

                        {loan.purpose && (
                          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold leading-6 text-blue-800">
                            {loan.purpose}
                          </p>
                        )}

                        {Object.entries(loan.supportingDetails || {}).filter(([, value]) => value).length > 0 && (
                          <div className="rounded-xl border border-bank-card-border bg-white p-4">
                            <p className="font-bold text-slate-950">Supporting Details</p>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {Object.entries(loan.supportingDetails || {})
                                .filter(([, value]) => value)
                                .map(([key, value]) => (
                                  <div key={key} className="rounded-lg bg-bank-surface px-3 py-2">
                                    <p className="text-xs font-bold uppercase text-slate-500">
                                      {formatDetailLabel(key)}
                                    </p>
                                    <p className="mt-1 break-words text-sm font-bold text-slate-800">
                                      {value}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
                          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                            <p className="text-xs font-bold uppercase text-slate-500">FOIR Inputs</p>
                            <p className="mt-1 font-semibold text-slate-700">
                              Income {formatCurrency(loan.monthlyIncome)} / Liabilities {formatCurrency(loan.existingMonthlyLiabilities)} / EMI {formatCurrency(loan.emiAmount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                            <p className="text-xs font-bold uppercase text-slate-500">Active Loans</p>
                            <p className="mt-1 font-semibold text-slate-700">
                              {loan.activeLoanCount ?? loan.eligibilityDetails?.activeLoanCount ?? 0} active loan(s)
                            </p>
                          </div>
                          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                            <p className="text-xs font-bold uppercase text-slate-500">Employment</p>
                            <p className="mt-1 font-semibold text-slate-700">
                              {loan.employmentType || "Not specified"} / {loan.employmentDurationMonths || 0} months
                            </p>
                          </div>
                          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                            <p className="text-xs font-bold uppercase text-slate-500">Account / OD</p>
                            <p className="mt-1 font-semibold text-slate-700">
                              {loan.eligibilityDetails?.accountAgeMonths ?? 0} months history / OD {loan.eligibilityDetails?.odUsage ?? "No data"}%
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-950">Submitted Documents</p>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                Review uploaded proofs before taking a decision.
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                              {loan.documents?.length || 0} file(s)
                            </span>
                          </div>
                          <div className="mt-4 space-y-3">
                            {(loan.documents || []).length === 0 && (
                              <EmptyState message="No documents were uploaded with this application." />
                            )}
                            {(loan.documents || []).map((document) => (
                              <div
                                key={document.id}
                                className="rounded-lg border border-slate-200 bg-bank-surface p-3"
                              >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <FileText size={16} className="text-slate-500" />
                                      <p className="font-bold text-slate-950">{document.documentType}</p>
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${documentReviewStyles[document.reviewStatus] || documentReviewStyles.pending}`}>
                                        {formatStatusLabel(document.reviewStatus || "pending")}
                                      </span>
                                    </div>
                                    <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                                      {document.fileName}
                                    </p>
                                    {document.managerNote && (
                                      <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                        {document.managerNote}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2 lg:justify-end">
                                    <a
                                      href={
                                        document.fileUrl
                                          ? `${api.defaults.baseURL.replace(/\/api$/, "")}${document.fileUrl}`
                                          : document.dataUrl
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                      className="btn-secondary px-3 py-2 text-xs"
                                    >
                                      View
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => updateLoanDocument(loan.id, document.id, "verified")}
                                      className="btn-primary bg-emerald-600 px-3 py-2 text-xs hover:bg-emerald-700"
                                    >
                                      Verify
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openLoanDocumentNote(loan, document, "mismatch")}
                                      className="btn-secondary px-3 py-2 text-xs"
                                    >
                                      Mismatch
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openLoanDocumentNote(loan, document, "additional_info_required")}
                                      className="btn-secondary px-3 py-2 text-xs"
                                    >
                                      Request Info
                                    </button>
                                  </div>
                                </div>
                                {loanDocumentReview?.loanId === loan.id &&
                                  loanDocumentReview?.documentId === document.id && (
                                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/80 p-3">
                                      <label className="label-field text-xs">
                                        {loanDocumentReview.reviewStatus === "mismatch"
                                          ? "Mismatch Reason"
                                          : "Information Needed"}
                                        <textarea
                                          value={loanDocumentReview.note}
                                          onChange={(event) =>
                                            updateLoanDocumentReviewNote(event.target.value)
                                          }
                                          className="input-field mt-2 min-h-20 resize-y bg-white text-sm"
                                          placeholder={
                                            loanDocumentReview.reviewStatus === "mismatch"
                                              ? "Describe what does not match the application."
                                              : "Describe what the customer needs to provide."
                                          }
                                        />
                                      </label>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={confirmLoanDocumentNoteAction}
                                          className="btn-primary px-3 py-2 text-xs"
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setLoanDocumentReview(null)}
                                          className="btn-secondary px-3 py-2 text-xs"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">Score Breakdown</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                            {getScoreReason(loan)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                          {loan.eligibilityScore}/100
                        </span>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
                        <div
                          className={`h-full rounded-full ${scoreTone.bar}`}
                          style={{ width: `${Math.max(4, Math.min(100, Number(loan.eligibilityScore || 0)))}%` }}
                        />
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {Object.entries(loan.eligibilityDetails?.componentScores || {}).map(([key, value]) => {
                          const maxScore =
                            loan.eligibilityDetails?.scoreWeights?.[key] ||
                            defaultLoanScoreWeights[key] ||
                            0;
                          const percent = maxScore > 0 ? Math.round((Number(value || 0) / maxScore) * 100) : 0;

                          return (
                            <div key={key} className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-bold uppercase text-slate-500">
                                  {loanScoreLabels[key] || key}
                                </p>
                                <p className="shrink-0 text-sm font-bold text-slate-950">
                                  {value}/{maxScore}
                                </p>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    percent >= 75
                                      ? "bg-emerald-500"
                                      : percent >= 50
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => submitLoanReview(loan.id, "approve")}
                        className="btn-primary justify-center bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Check size={16} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => openLoanNote(loan, "request_info")}
                        className="btn-secondary justify-center"
                      >
                        Request Info
                      </button>
                      <button
                        type="button"
                        onClick={() => openLoanNote(loan, "reject")}
                        className="btn-danger-soft justify-center"
                      >
                        <X size={16} />
                        Reject
                      </button>
                    </div>
                  </div>
                )}
                {loanReview?.id === loan.id && (
                  <div className="border-t border-amber-100 bg-amber-50/70 p-4">
                    <label className="label-field">
                      Manager Note
                      <textarea
                        value={loanReview.note}
                        onChange={(event) => updateLoanReviewNote(event.target.value)}
                        className="input-field mt-2 min-h-24 resize-y bg-white"
                        placeholder="Write the reason or information needed from the customer."
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={confirmLoanNoteAction} className="btn-primary">
                        Confirm
                      </button>
                      <button type="button" onClick={() => setLoanReview(null)} className="btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
              );
            })}
            <TablePagination {...loanReviewPagination} />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Approved Loans"
        subtitle="Disbursal credits the customer's primary account and starts the EMI schedule."
        icon={CircleDollarSign}
      >
        {approvedLoans.length === 0 ? (
          <EmptyState message="No approved loans are waiting for disbursal." />
        ) : (
          <div className="space-y-3">
            {approvedLoanPagination.pageRows.map((loan) => (
              <div key={loan.id} className="flex flex-col gap-3 rounded-xl border border-bank-card-border bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-slate-950">{loan.customerName} / {loan.loanTypeLabel}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {loan.id} / {formatCurrency(loan.amount)} / EMI {formatCurrency(loan.emiAmount)}
                  </p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    Sanction: {formatStatusLabel(loan.sanctionLetter?.status || "pending")}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    Agreement: {formatStatusLabel(loan.loanAgreement?.status || "pending")}
                  </p>
                  {(loan.sanctionLetter?.status !== "accepted" ||
                    loan.loanAgreement?.status !== "accepted") && (
                    <p className="mt-1 text-xs font-semibold text-amber-700">
                      Waiting for customer sanction and agreement acceptance before disbursal.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                  {loan.sanctionLetter?.fileUrl && (
                    <a
                      href={getUploadUrl(loan.sanctionLetter.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary justify-center px-4 py-2 text-sm"
                    >
                      <FileText size={16} />
                      Sanction PDF
                    </a>
                  )}
                  {loan.loanAgreement?.fileUrl && (
                    <a
                      href={getUploadUrl(loan.loanAgreement.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary justify-center px-4 py-2 text-sm"
                    >
                      <FileText size={16} />
                      Agreement PDF
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => disburseLoan(loan.id)}
                    disabled={
                      loan.sanctionLetter?.status !== "accepted" ||
                      loan.loanAgreement?.status !== "accepted"
                    }
                    className="btn-primary justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Disburse
                  </button>
                </div>
              </div>
            ))}
            <TablePagination {...approvedLoanPagination} />
          </div>
        )}
      </SectionCard>
    </div>
  );

  const loanPortfolioSection = (
    <div className="space-y-6">
      <SectionCard
        title="Loan Portfolio"
        subtitle="Read-only audit view for approved, rejected, disbursed, and closed loans."
        icon={FileBarChart}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={loanPortfolioSearch}
              onChange={(event) => setLoanPortfolioSearch(event.target.value)}
              className="input-field pl-10"
              placeholder="Search by loan, customer, account, sanction status"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["all", "approved", "disbursed", "closed", "rejected"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setLoanPortfolioFilter(status)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  loanPortfolioFilter === status
                    ? "bg-bank-accent text-white"
                    : "bg-white text-slate-600 ring-1 ring-bank-card-border hover:bg-bank-surface"
                }`}
              >
                {status === "all" ? "All" : formatStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Portfolio Health"
        subtitle="Collection signals for active loans and customer follow-up."
        icon={Gauge}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricTile
            label="Active Loans"
            value={loanPortfolioHealth.activeCount}
            tone="accent"
          />
          <MetricTile
            label="Outstanding Exposure"
            value={formatCurrency(loanPortfolioHealth.outstandingExposure)}
            tone="warning"
          />
          <MetricTile
            label="Due In 7 Days"
            value={loanPortfolioHealth.dueSoonCount}
            tone={loanPortfolioHealth.dueSoonCount > 0 ? "warning" : "success"}
          />
          <MetricTile
            label="Collection Rate"
            value={`${loanPortfolioHealth.collectionRate}%`}
            tone={loanPortfolioHealth.collectionRate >= 90 ? "success" : "danger"}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">Loan Distribution</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Outstanding exposure by product type.
                </p>
              </div>
              <BarChart3 className="shrink-0 text-blue-600" size={22} />
            </div>
            <RechartsHorizontalBar
              rows={loanPortfolioHealth.byType.map((row, index) => ({
                label: `${row.label} / ${row.count}`,
                value: row.exposure,
                color: ["#2563eb", "#0891b2", "#10b981", "#f59e0b"][index % 4],
              }))}
              valueFormatter={formatCurrency}
              emptyMessage="No active loan exposure is available to chart."
              height={240}
            />
          </div>

          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">Collection Focus</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Loans with missed or overdue EMI items appear first.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  loanPortfolioHealth.delinquentLoans.length > 0
                    ? "bg-red-50 text-red-700 ring-1 ring-red-100"
                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                }`}
              >
                {loanPortfolioHealth.delinquentLoans.length} delinquent
              </span>
            </div>

            {loanPortfolioHealth.followUpLoans.length === 0 ? (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm font-semibold text-emerald-800">
                No missed or overdue EMI items are currently recorded.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {loanPortfolioHealth.followUpLoans.map((loan) => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => setExpandedPortfolioLoanId(loan.id)}
                    className="w-full rounded-lg border border-red-100 bg-red-50/70 px-4 py-3 text-left transition hover:bg-red-50"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-bold text-slate-950">
                          {loan.customerName || "Customer"} / {loan.id}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                          {loan.delinquentRows.length} missed or overdue EMI item(s)
                        </p>
                      </div>
                      <div className="shrink-0 sm:text-right">
                        <p className="font-bold text-red-700">
                          {formatCurrency(loan.delinquentAmount)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Next due {loan.nextOpenEmi?.dueDate ? new Date(loan.nextOpenEmi.dueDate).toLocaleDateString() : "not set"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricTile label="Approved" value={loans.filter((loan) => loan.status === "approved").length} tone="warning" />
        <MetricTile label="Disbursed" value={loans.filter((loan) => loan.status === "disbursed").length} tone="success" />
        <MetricTile label="Closed" value={loans.filter((loan) => loan.status === "closed").length} tone="accent" />
        <MetricTile label="Rejected" value={loans.filter((loan) => loan.status === "rejected").length} tone="danger" />
      </section>

      <SectionCard
        title="Portfolio Records"
        subtitle="Open any loan to inspect documents, sanction letter, repayment schedule, and history."
        icon={BadgeIndianRupee}
      >
        {filteredLoanPortfolioLoans.length === 0 ? (
          <EmptyState message="No loans match the selected portfolio filters." />
        ) : (
          <div className="space-y-3">
            {loanPortfolioPagination.pageRows.map((loan) => {
              const isExpanded = expandedPortfolioLoanId === loan.id;
              const sanction = loan.sanctionLetter || {};
              const agreement = loan.loanAgreement || {};
              const repaymentSchedule = loan.repaymentScheduleDocument || {};
              const documentCount = loan.documents?.length || 0;

              return (
                <article
                  key={loan.id}
                  className="overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm"
                >
                  <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[1.2fr_1fr_1fr_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-lg font-black text-slate-950">
                          {loan.customerName || "Customer"}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${loanStatusStyles[loan.status] || loanStatusStyles.submitted}`}>
                          {formatStatusLabel(loan.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {loan.customerCode || "Customer ID pending"} / {loan.id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Loan Terms</p>
                      <p className="mt-1 font-bold text-slate-950">
                        {loan.loanTypeLabel} / {formatCurrency(loan.amount)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        EMI {formatCurrency(loan.emiAmount)} / {loan.annualInterestRate}% p.a.
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Sanction</p>
                      <p className="mt-1 font-bold text-slate-950">
                        {formatStatusLabel(sanction.status || "pending")}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {documentCount} document(s)
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedPortfolioLoanId(isExpanded ? "" : loan.id)}
                      className="btn-secondary justify-center whitespace-nowrap px-4 py-2"
                    >
                      {isExpanded ? "Hide Details" : "View Details"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-bank-card-border bg-slate-50/70 p-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Loan Details</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <p><span className="font-bold text-slate-500">Type:</span> {loan.loanTypeLabel}</p>
                            <p><span className="font-bold text-slate-500">Amount:</span> {formatCurrency(loan.amount)}</p>
                            <p><span className="font-bold text-slate-500">Tenure:</span> {loan.tenureMonths} months</p>
                            <p><span className="font-bold text-slate-500">EMI:</span> {formatCurrency(loan.emiAmount)}</p>
                            <p><span className="font-bold text-slate-500">Total Repayment:</span> {formatCurrency(loan.totalRepayment)}</p>
                            <p><span className="font-bold text-slate-500">Outstanding:</span> {formatCurrency(loan.outstandingPrincipal ?? 0)}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Lifecycle</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <p><span className="font-bold text-slate-500">Reviewed By:</span> {loan.reviewedBy || "Not recorded"}</p>
                            <p><span className="font-bold text-slate-500">Reviewed:</span> {formatDateTime(loan.reviewedAt)}</p>
                            <p><span className="font-bold text-slate-500">Disbursed:</span> {loan.disbursedAt ? formatDateTime(loan.disbursedAt) : "Not disbursed"}</p>
                            <p><span className="font-bold text-slate-500">Closed:</span> {loan.closedAt ? formatDateTime(loan.closedAt) : "Not closed"}</p>
                            <p><span className="font-bold text-slate-500">Score:</span> {loan.eligibilityScore}/100</p>
                            <p><span className="font-bold text-slate-500">Recommendation:</span> {loan.eligibilityRecommendation || "Not recorded"}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Sanction Letter</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <p><span className="font-bold text-slate-500">Status:</span> {formatStatusLabel(sanction.status || "pending")}</p>
                            <p><span className="font-bold text-slate-500">Generated:</span> {sanction.generatedAt ? formatDateTime(sanction.generatedAt) : "Not generated"}</p>
                            <p><span className="font-bold text-slate-500">Accepted:</span> {sanction.acceptedAt ? formatDateTime(sanction.acceptedAt) : "Not accepted"}</p>
                          </div>
                          {sanction.fileUrl && (
                            <a
                              href={getUploadUrl(sanction.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary mt-4 justify-center px-4 py-2 text-sm"
                            >
                              <FileText size={16} />
                              View Sanction PDF
                            </a>
                          )}
                        </div>

                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Loan Agreement</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <p><span className="font-bold text-slate-500">Status:</span> {formatStatusLabel(agreement.status || "pending")}</p>
                            <p><span className="font-bold text-slate-500">Generated:</span> {agreement.generatedAt ? formatDateTime(agreement.generatedAt) : "Not generated"}</p>
                            <p><span className="font-bold text-slate-500">Accepted:</span> {agreement.acceptedAt ? formatDateTime(agreement.acceptedAt) : "Not accepted"}</p>
                          </div>
                          {agreement.fileUrl && (
                            <a
                              href={getUploadUrl(agreement.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary mt-4 justify-center px-4 py-2 text-sm"
                            >
                              <FileText size={16} />
                              View Agreement PDF
                            </a>
                          )}
                        </div>

                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Repayment Schedule</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <p><span className="font-bold text-slate-500">Status:</span> {formatStatusLabel(repaymentSchedule.status || "pending")}</p>
                            <p><span className="font-bold text-slate-500">Generated:</span> {repaymentSchedule.generatedAt ? formatDateTime(repaymentSchedule.generatedAt) : "Not generated"}</p>
                            <p><span className="font-bold text-slate-500">Email:</span> {repaymentSchedule.emailStatus || "Not sent"}</p>
                          </div>
                          {repaymentSchedule.fileUrl && (
                            <a
                              href={getUploadUrl(repaymentSchedule.fileUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary mt-4 justify-center px-4 py-2 text-sm"
                            >
                              <FileText size={16} />
                              View Schedule PDF
                            </a>
                          )}
                        </div>
                      </div>

                      {(loan.purpose || loan.rejectionReason || loan.managerNote) && (
                        <div className="mt-4 rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Notes</p>
                          {loan.purpose && (
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                              Purpose: {loan.purpose}
                            </p>
                          )}
                          {(loan.rejectionReason || loan.managerNote) && (
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                              Manager note: {loan.rejectionReason || loan.managerNote}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="font-bold text-slate-950">Submitted Documents</p>
                            <span className="rounded-full bg-bank-surface px-3 py-1 text-xs font-bold text-slate-600">
                              {documentCount} file(s)
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {documentCount === 0 ? (
                              <p className="text-sm font-semibold text-slate-500">No documents were attached.</p>
                            ) : (
                              loan.documents.map((document) => (
                                <div
                                  key={document.id}
                                  className="flex flex-col gap-2 rounded-lg bg-bank-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="min-w-0">
                                    <p className="break-words text-sm font-bold text-slate-950">
                                      {document.documentType}
                                    </p>
                                    <p className="break-words text-xs font-semibold text-slate-500">
                                      {document.fileName} / {formatStatusLabel(document.reviewStatus || "pending")}
                                    </p>
                                  </div>
                                  <a
                                    href={
                                      document.fileUrl
                                        ? getUploadUrl(document.fileUrl)
                                        : document.dataUrl
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-secondary justify-center px-3 py-2 text-xs"
                                  >
                                    View
                                  </a>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-bank-card-border bg-white p-4">
                          <p className="font-bold text-slate-950">Repayment History</p>
                          <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-100">
                            <table className="w-full min-w-[560px] text-left text-sm">
                              <thead className="table-head">
                                <tr>
                                  <th className="px-3 py-2">Date</th>
                                  <th className="px-3 py-2">Type</th>
                                  <th className="px-3 py-2">Amount</th>
                                  <th className="px-3 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(loan.repaymentHistory || []).length === 0 ? (
                                  <tr className="table-row">
                                    <td colSpan={4} className="px-3 py-3 text-sm font-semibold text-slate-500">
                                      No repayment activity yet.
                                    </td>
                                  </tr>
                                ) : (
                                  loan.repaymentHistory.map((entry, index) => (
                                    <tr key={`${entry.transactionId || entry.paymentType}-${index}`} className="table-row">
                                      <td className="px-3 py-2">{entry.paidAt ? formatDateTime(entry.paidAt) : "Not set"}</td>
                                      <td className="px-3 py-2 font-bold">{formatStatusLabel(entry.paymentType)}</td>
                                      <td className="px-3 py-2">{formatCurrency(entry.amount)}</td>
                                      <td className="px-3 py-2">{formatStatusLabel(entry.status)}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-bank-card-border bg-white p-4">
                        <p className="font-bold text-slate-950">Amortization Schedule</p>
                        <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-100">
                          <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="table-head">
                              <tr>
                                <th className="px-3 py-2">EMI</th>
                                <th className="px-3 py-2">Due Date</th>
                                <th className="px-3 py-2">Amount</th>
                                <th className="px-3 py-2">Principal</th>
                                <th className="px-3 py-2">Interest</th>
                                <th className="px-3 py-2">Penalty</th>
                                <th className="px-3 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(loan.amortizationSchedule || []).length === 0 ? (
                                <tr className="table-row">
                                  <td colSpan={7} className="px-3 py-3 text-sm font-semibold text-slate-500">
                                    No amortization schedule available.
                                  </td>
                                </tr>
                              ) : (
                                loan.amortizationSchedule.map((row) => (
                                  <tr key={row.emiNumber} className="table-row">
                                    <td className="px-3 py-2 font-bold">{row.emiNumber}</td>
                                    <td className="px-3 py-2">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "Not set"}</td>
                                    <td className="px-3 py-2">{formatCurrency(row.emiAmount)}</td>
                                    <td className="px-3 py-2">{formatCurrency(row.principalComponent)}</td>
                                    <td className="px-3 py-2">{formatCurrency(row.interestComponent)}</td>
                                    <td className="px-3 py-2">{formatCurrency(row.penaltyAmount || 0)}</td>
                                    <td className="px-3 py-2">{formatStatusLabel(row.status)}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            <TablePagination {...loanPortfolioPagination} />
          </div>
        )}
      </SectionCard>
    </div>
  );

  const dashboardWorkbench = (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Pending Decisions"
          value={pendingApprovals.length}
          icon={ListChecks}
          accent="bg-violet-500"
          iconTone="bg-violet-50 text-violet-600"
          badge={{
            text: pendingApprovals.length > 0 ? "Needs review" : "Queue clear",
            tone: pendingApprovals.length > 0 ? "warning" : "success",
          }}
          footer={{ text: `${formatCurrency(pendingApprovalValue)} total waiting` }}
        />
        <StatsCard
          title="Transactions Today"
          value={dashboardData.stats.transactionsToday || 0}
          icon={ReceiptText}
          accent="bg-blue-500"
          iconTone="bg-blue-50 text-blue-600"
          badge={{ text: "Live activity", tone: "neutral" }}
        />
        <StatsCard
          title="OD Attention"
          value={odCustomerSummary.attentionCount}
          icon={CircleDollarSign}
          accent="bg-amber-500"
          iconTone="bg-amber-50 text-amber-600"
          footer={{ text: `${formatCurrency(utilizedOd)} utilized OD` }}
        />
        <StatsCard
          title="Decisions Today"
          value={decisionsToday}
          icon={CalendarClock}
          accent="bg-emerald-500"
          iconTone="bg-emerald-50 text-emerald-600"
          badge={{ text: "Recorded actions", tone: "success" }}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="Priority Approval Queue"
          subtitle="Review the largest pending transfers first, then continue to the full queue."
          icon={ListChecks}
        >
          {approvalMessage && <div className="alert-success mb-4">{approvalMessage}</div>}
          {approvalError && <div className="alert-error mb-4">{approvalError}</div>}
          {topPendingApprovals.length === 0 ? (
            <EmptyState message="No transfer approvals are waiting right now." />
          ) : (
            <div className="space-y-3">
              {topPendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                          Pending
                        </span>
                        <span className="break-words text-sm font-bold text-slate-500">
                          {approval.id}
                        </span>
                      </div>
                      <p className="mt-3 break-words text-lg font-bold text-slate-950">
                        {approval.customer || "Customer"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {transactionTypeLabels[approval.type] || approval.type || "Transfer"} from{" "}
                        {maskAccountNumber(approval.account)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        Requested {formatDateTime(approval.requestedOn)}
                      </p>
                    </div>
                    <div className="shrink-0 lg:text-right">
                      <p className="text-2xl font-bold text-slate-950">
                        {formatCurrency(approval.amount)}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateApproval(approval.id, "approved")}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                        >
                          <Check size={16} />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => openRejectReview(approval)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                        >
                          <X size={16} />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                  {rejectionReview?.id === approval.id && (
                    <div className="mt-4 rounded-xl border border-red-100 bg-red-50/70 p-4">
                      <label className="label-field">
                        Rejection Reason
                        <textarea
                          value={rejectionReview.reason}
                          onChange={(event) => updateRejectionReason(event.target.value)}
                          className="input-field mt-2 min-h-24 resize-y bg-white"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => confirmRejection(approval.id)}
                          className="btn-danger-soft"
                        >
                          Confirm Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectionReview(null)}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => navigate("/manager/approvals")}
                className="btn-secondary mt-2 justify-center"
              >
                View Full Approval Queue
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Operations Watch"
          subtitle="A quick view of items that usually need same-day follow-up."
          icon={Gauge}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricTile label="Active OD Accounts" value={odCustomerSummary.activeCount} tone="accent" />
            <MetricTile label="Loan Reviews" value={pendingLoanReviews.length} tone={pendingLoanReviews.length > 0 ? "warning" : "success"} />
            <MetricTile label="Blocked OD" value={odCustomerSummary.blockedCount} tone={odCustomerSummary.blockedCount > 0 ? "danger" : "success"} />
            <MetricTile label="Alerts" value={notifications.length} tone={notifications.length > 0 ? "warning" : "success"} />
          </div>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => navigate("/manager/loans")}
              className="inline-flex items-center justify-between rounded-lg border border-bank-card-border bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-bank-surface"
            >
              Review loan applications
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/manager/overdraft")}
              className="inline-flex items-center justify-between rounded-lg border border-bank-card-border bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-bank-surface"
            >
              Review overdraft accounts
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/manager/policies")}
              className="inline-flex items-center justify-between rounded-lg border border-bank-card-border bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-bank-surface"
            >
              Check tier policies
              <ArrowRight size={17} />
            </button>
          </div>
        </SectionCard>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard
          title="Recent Decisions"
          subtitle="Latest transfer, loan, disbursal, and policy decisions completed by the manager."
          icon={ShieldCheck}
        >
          {recentDecisions.length === 0 ? (
            <EmptyState message="No completed decisions are available yet." />
          ) : (
            <div className="space-y-3">
              {recentDecisions.map((decision) => (
                <div
                  key={decision.id}
                  className="flex flex-col gap-3 rounded-xl border border-bank-card-border bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words font-bold text-slate-950">{decision.subject}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{decision.type}</p>
                    <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">
                      {decision.detail}
                    </p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${
                        statusStyles[decision.status] || statusStyles.updated
                      }`}
                    >
                      {decision.status}
                    </span>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {formatDateTime(decision.reviewedAt)}
                    </p>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => navigate("/manager/approval-history")}
                className="btn-secondary mt-2 justify-center"
              >
                Open Decision History
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Latest Alerts"
          subtitle="Recent account and operational notifications for the manager."
          icon={Bell}
        >
          {notifications.length === 0 ? (
            <EmptyState message="No alerts are available right now." />
          ) : (
            <div className="space-y-3">
              {notifications.slice(0, 4).map((notification) => (
                <div
                  key={notification.id || notification.message}
                  className={`rounded-xl border p-4 ${
                    notificationToneStyles[notification.type] || notificationToneStyles.info
                  }`}
                >
                  <p className="break-words font-bold text-slate-950">{notification.title}</p>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-600">
                    {notification.message}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    {notification.time}
                  </p>
                </div>
              ))}
              <button
                type="button"
                onClick={() => navigate("/manager/notifications")}
                className="btn-secondary mt-2 justify-center"
              >
                View All Alerts
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </SectionCard>
      </section>
    </div>
  );

  const contentBySection = {
    dashboard: dashboardWorkbench,
    approvals: approvalTable,
    loans: loanReviewsSection,
    "loan-portfolio": loanPortfolioSection,
    "approval-history": approvalHistoryTable,
    overdraft: odSection,
    policies: tierPolicyDetails,
    escalations: escalationSection,
    transactions: transactionsSection,
    notifications: notificationsSection,
    profile: profileSection,
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow={activeSection === "dashboard" ? "Manager Control Panel" : undefined}
          title={activeSection === "dashboard" ? "Manager Operations" : pageTitle}
          subtitle="Monitor approvals, overdraft activity, customer activity, and alerts."
        >
          <div className="stat-chip flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate("/manager/notifications")}
              className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              aria-label="Open manager alerts"
              title="Open manager alerts"
            >
              <Bell size={20} />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <UserCircle size={28} className="shrink-0 text-slate-600" />
              <span className="max-w-44 truncate font-semibold text-slate-950">
                {user?.name || "Manager"}
              </span>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="btn-danger-soft">
            <LogOut size={18} />
            Logout
          </button>
        </PageHeader>

        {![
          "dashboard",
          "approval-history",
          "overdraft",
          "policies",
          "profile",
          "loan",
          "loans",
          "loan-portfolio",
        ].includes(section) && (
          <div className="stat-grid">
            <StatsCard
              title="Pending Approvals"
              value={pendingApprovals.length}
              icon={ListChecks}
              accent="bg-violet-500"
              iconTone="bg-violet-50 text-violet-600"
              badge={
                pendingApprovals.length > 0
                  ? { text: "Requires action", tone: "warning" }
                : { text: "Queue clear", tone: "success" }
              }
            />
          </div>
        )}

        {contentBySection[activeSection] ?? contentBySection.dashboard}

        {tierEditReview && tierEditForm && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center">
            <form
              onSubmit={saveTierEdit}
              className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="shrink-0 border-b border-slate-100 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                      Manager Policy Edit
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      {tierEditReview.label} Tier
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Locked fields are controlled by admin business-rule permissions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeTierEdit}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                    aria-label="Close tier edit modal"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    ["perTxnLimit", "Per Transfer Limit"],
                    ["dailyLimit", "Daily Limit"],
                    ["monthlyLimit", "Monthly Limit"],
                    ["penaltyAmount", "Penalty Amount"],
                  ].map(([field, label]) => (
                    <label key={field} className="label-field">
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        value={tierEditForm[field]}
                        disabled={!managerTierPermissions[field]}
                        onChange={(event) => updateTierEditForm(field, event.target.value)}
                        className="input-field disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </label>
                  ))}
                  <label className="label-field sm:col-span-2">
                    <span>Monthly OD Interest (%)</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={tierEditForm.interestRate}
                      disabled={!managerTierPermissions.interestRate}
                      onChange={(event) => updateTierEditForm("interestRate", event.target.value)}
                      className="input-field disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    {tierEditForm.interestRate && (
                      <p className="mt-2 text-xs font-semibold text-blue-700">
                        Saved as {formatMonthlyInterestRate(tierEditForm.interestRate)}
                      </p>
                    )}
                  </label>
                </div>

                <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-950">Account-wise OD Rules</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        OD limit and minimum opening balance by account type.
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        managerTierPermissions.accountTypeOdRules
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {managerTierPermissions.accountTypeOdRules ? "Editable" : "Locked"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {normalizeTierRules(tierEditForm.accountTypeOdRules).map((rule) => (
                      <div key={rule.accountType} className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="font-bold text-slate-950">{rule.accountType}</p>
                        <label className="mt-3 block">
                          <span className="text-xs font-bold uppercase text-slate-500">
                            OD Limit
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={rule.odLimit}
                            disabled={!managerTierPermissions.accountTypeOdRules}
                            onChange={(event) =>
                              updateTierEditRule(rule.accountType, "odLimit", event.target.value)
                            }
                            className="input-field mt-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </label>
                        <label className="mt-3 block">
                          <span className="text-xs font-bold uppercase text-slate-500">
                            Minimum Opening
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={rule.minOpeningBalance}
                            disabled={!managerTierPermissions.accountTypeOdRules}
                            onChange={(event) =>
                              updateTierEditRule(rule.accountType, "minOpeningBalance", event.target.value)
                            }
                            className="input-field mt-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeTierEdit}
                    disabled={isSavingTierEdit}
                    className="btn-secondary justify-center px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTierEdit}
                    className="btn-primary justify-center px-4 py-2"
                  >
                    <Check size={17} />
                    {isSavingTierEdit ? "Saving..." : "Save Allowed Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}

export default ManagerDashboard;
