import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import EmptyState from "../../components/ui/EmptyState";
import {
  BarChart3,
  Bell,
  Check,
  CircleDollarSign,
  CreditCard,
  Edit3,
  Gauge,
  IdCard,
  ListChecks,
  LogOut,
  Mail,
  MapPin,
  Phone,
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
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
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

function ManagerDashboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const { section = "dashboard" } = useParams();
  const { logout, user, setSessionUser } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [rejectionReview, setRejectionReview] = useState(null);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [profilePhone, setProfilePhone] = useState(user?.phone || "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [odCustomerFilter, setOdCustomerFilter] = useState("attention");
  const [odCustomerSearch, setOdCustomerSearch] = useState("");
  const [odMonitoringTab, setOdMonitoringTab] = useState("cases");
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

    return api.get("/approvals").then(({ data }) => {
      setApprovals(data.approvals || []);
    });
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const pendingApprovals = approvals.filter(
    (approval) => approval.status === "pending"
  );
  const approvalHistory = approvals.filter((approval) =>
    ["approved", "rejected"].includes(approval.status)
  );
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
  const recentOverdraftActivity = dashboardData.recentOverdraftActivity || [];
  const overdraftPayoffTransactions = dashboardData.overdraftPayoffTransactions || [];
  const escalations = dashboardData.escalations || [];
  const transactions = dashboardData.transactions;
  const notifications = dashboardData.notifications || [];
  const managerProfile = dashboardData.profile;
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

  const visibleApprovalQueue = pendingApprovals;
  const approvalPagination = usePaginatedRows(visibleApprovalQueue);
  const approvalHistoryPagination = usePaginatedRows(approvalHistory);
  const overdraftCustomerPagination = usePaginatedRows(filteredOverdraftCustomers);
  const overdraftPayoffPagination = usePaginatedRows(overdraftPayoffTransactions);
  const transactionPagination = usePaginatedRows(transactions);
  const recentOverdraftActivityPagination = usePaginatedRows(recentOverdraftActivity);
  const escalationPagination = usePaginatedRows(displayedEscalations);
  const notificationPagination = usePaginatedRows(notifications);
  const pageTitle = {
    dashboard: "Manager Dashboard",
    approvals: "Approval Queue",
    "approval-history": "Approval History",
    overdraft: "Overdraft Monitoring",
    escalations: "Escalations",
    transactions: "Transaction Monitoring",
    notifications: "Notifications",
    profile: "Manager Profile",
  }[section] ?? "Manager Dashboard";

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
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <div>
          <h2 className="text-xl font-bold">Pending Approvals</h2>
          <p className="text-sm text-slate-500">
            Review transfer and beneficiary requests before release.
          </p>
        </div>
        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
          {pendingApprovals.length} pending
        </span>
      </div>

      <div className="overflow-x-auto">
        {approvalMessage && <div className="alert-success mx-6 mt-6">{approvalMessage}</div>}
        {approvalError && <div className="alert-error mx-6 mt-6">{approvalError}</div>}
        <table className="w-full min-w-[860px] text-left">
          <thead className="table-head">
            <tr>
              <th className="px-6 py-4">Request ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Account No.</th>
              <th className="px-6 py-4">Requested On</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleApprovalQueue.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8">
                  <EmptyState message="No transfer requests are waiting for your decision." />
                </td>
              </tr>
            )}
            {approvalPagination.pageRows.map((approval) => (
              <Fragment key={approval.id}>
                <tr className="table-row">
                  <td className="px-6 py-4 font-semibold">{approval.id}</td>
                  <td className="px-6 py-4">{approval.customer}</td>
                  <td className="px-6 py-4">{approval.type}</td>
                  <td className="px-6 py-4 font-semibold">
                    {formatCurrency(approval.amount)}
                  </td>
                  <td className="px-6 py-4">{maskAccountNumber(approval.account)}</td>
                  <td className="px-6 py-4">{approval.requestedOn}</td>
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateApproval(approval.id, "approved")}
                        disabled={approval.status !== "pending"}
                        className="rounded-lg border border-emerald-200 p-2 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Approve ${approval.id}`}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openRejectReview(approval)}
                        disabled={approval.status !== "pending"}
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Reject ${approval.id}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {rejectionReview?.id === approval.id && (
                  <tr className="border-b border-red-100 bg-red-50/50">
                    <td colSpan={8} className="px-6 py-5">
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
    <section className="table-shell">
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <div>
          <h2 className="text-xl font-bold">Approval History</h2>
          <p className="text-sm text-slate-500">
            Completed approval decisions for transfers reviewed by managers.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
          {approvalHistory.length} reviewed
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left">
          <thead className="table-head">
            <tr>
              <th className="px-6 py-4">Request ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Account No.</th>
              <th className="px-6 py-4">Reviewed On</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Reason</th>
            </tr>
          </thead>
          <tbody>
            {approvalHistory.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8">
                  <EmptyState message="No reviewed approval requests are available." />
                </td>
              </tr>
            )}
            {approvalHistoryPagination.pageRows.map((approval) => (
              <tr key={approval.id} className="table-row">
                <td className="px-6 py-4 font-semibold">{approval.id}</td>
                <td className="px-6 py-4">{approval.customer}</td>
                <td className="px-6 py-4">{approval.type}</td>
                <td className="px-6 py-4 font-semibold">
                  {formatCurrency(approval.amount)}
                </td>
                <td className="px-6 py-4">{maskAccountNumber(approval.account)}</td>
                <td className="px-6 py-4">{approval.reviewedAt || approval.updatedAt}</td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${statusStyles[approval.status]}`}
                  >
                    {approval.status}
                  </span>
                </td>
                <td className="max-w-xs px-6 py-4 text-sm text-slate-600">
                  {approval.rejectionReason || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination {...approvalHistoryPagination} />
      </div>
    </section>
  );

  const maxOdUsed = Math.max(...odUtilizers.map((item) => Number(item.used || 0)), 1);
  const maxExposure = Math.max(
    ...overdraftExposureByType.map((item) => Number(item.value || 0)),
    1
  );
  const totalRiskCount = Math.max(
    overdraftRisk.reduce((sum, item) => sum + Number(item.value || 0), 0),
    1
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
        <div className="flex justify-center">
          <div
            className="grid h-48 w-48 place-items-center rounded-full shadow-inner"
            style={{
              background: `conic-gradient(#2563eb 0 ${clampPercent(
                odPercent
              )}%, #e2e8f0 ${clampPercent(odPercent)}% 100%)`,
            }}
          >
            <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-sm">
              <div>
                <p className="text-3xl font-bold text-slate-950">{odPercent}%</p>
                <p className="text-xs font-semibold uppercase text-slate-500">Used</p>
              </div>
            </div>
          </div>
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
      <div className="space-y-4">
        {odUtilizers.length === 0 && (
        <EmptyState message="No active overdraft usage is recorded right now." />
        )}
        {odUtilizers.map((item) => {
          const risk = odRiskStyles[item.risk] || odRiskStyles.active;
          const width = Math.max(6, Math.round((Number(item.used || 0) / maxOdUsed) * 100));

          return (
            <div key={`${item.customer}-${item.used}`} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{item.customer}</p>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(item.used)} of {formatCurrency(item.limit)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${risk.badge}`}>
                  {item.utilization}% {risk.label}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${risk.bar}`}
                  style={{ width: item.used > 0 ? `${width}%` : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );

  const odRiskCard = (
    <SectionCard title="Risk Distribution" subtitle="Customers grouped by OD utilization">
      <div className="space-y-4">
        {overdraftRisk.length === 0 && (
          <EmptyState message="No overdraft utilization groups are available right now." />
        )}
        {overdraftRisk.map((item) => {
          const risk = odRiskStyles[item.label] || odRiskStyles.unused;
          const width = Math.max(4, Math.round((Number(item.value || 0) / totalRiskCount) * 100));

          return (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${risk.soft}`}>
                  {risk.label}
                </span>
                <span className="text-sm font-bold text-slate-900">{item.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${risk.bar}`}
                  style={{ width: Number(item.value || 0) > 0 ? `${width}%` : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );

  const odExposureCard = (
    <SectionCard title="Exposure By Account Type" subtitle="Active OD amount by primary account">
      <div className="space-y-4">
        {overdraftExposureByType.length === 0 && (
          <EmptyState message="No active overdraft exposure is linked to account types." />
        )}
        {overdraftExposureByType.map((item) => {
          const width = Math.max(6, Math.round((Number(item.value || 0) / maxExposure) * 100));

          return (
            <div key={item.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{item.label}</p>
                <p className="text-sm font-bold text-slate-900">{formatCurrency(item.value)}</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: Number(item.value || 0) > 0 ? `${width}%` : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );

  const tierPolicyDetails = (
    <SectionCard
      title="Tier Policy Details"
      subtitle={
        canEditAnyTierField
          ? "Admin has allowed selected policy fields for manager edits."
          : "Admin-defined limits used while monitoring account-level OD exposure."
      }
      icon={ShieldCheck}
    >
      {tierPolicies.length === 0 && (
        <EmptyState message="No tier policies are available for manager review." />
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {tierPolicies.map((tier) => (
          <div key={tier.key} className="rounded-xl border border-bank-card-border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${getTierTone(tier.key).badge}`}>
                  {tier.label}
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-500">
                  Txn {formatCurrency(tier.perTxnLimit)} / Daily {formatCurrency(tier.dailyLimit)}
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {tier.interestRate || "No interest"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openTierEdit(tier)}
              disabled={!canEditAnyTierField}
              className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
                canEditAnyTierField
                  ? "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <Edit3 size={15} />
              {canEditAnyTierField ? "Edit allowed fields" : "Edit locked by admin"}
            </button>
            <div className="mt-4 grid grid-cols-1 gap-2">
              {(tier.accountTypeOdRules || []).map((rule) => (
                <div
                  key={`${tier.key}-${rule.accountType}`}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{rule.accountType}</p>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                      Account rule
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="font-semibold text-slate-500">OD Limit</p>
                      <p className="font-bold text-slate-900">
                        {formatCurrency(rule.odLimit || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-500">Uses</p>
                      <p className="font-bold text-slate-900">
                        3/month
                      </p>
                    </div>
                    <div className="col-span-2">
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
              <div className="rounded-lg bg-blue-50 p-3 text-blue-800">
                <p className="font-semibold">Penalty</p>
                <p className="font-bold">{formatCurrency(tier.penaltyAmount)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
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
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${risk.bar}`}
                  style={{
                    width: usagePercent > 0 ? `${Math.max(4, usagePercent)}%` : "0%",
                  }}
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
    { key: "policies", label: "Tier Policies", count: tierPolicies.length },
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
    policies: tierPolicyDetails,
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
    <section className="table-shell">
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <div>
          <h2 className="text-xl font-bold">Transaction Monitoring</h2>
          <p className="text-sm text-slate-500">
            All customer transactions, including overdraft payoff payments.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
          {transactions.length} transactions
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left">
          <thead className="table-head">
            <tr>
              <th className="px-6 py-4">Txn ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Receiver</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Account</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8">
                  <EmptyState message="No customer transactions are available for review." />
                </td>
              </tr>
            )}
            {transactionPagination.pageRows.map((transaction) => (
              <tr key={transaction.id} className="table-row">
                <td className="px-6 py-4 font-semibold">{transaction.id}</td>
                <td className="px-6 py-4">
                  <p className="font-semibold text-slate-900">{transaction.customer}</p>
                  <p className="text-xs text-slate-500">{transaction.customerId || "Customer"}</p>
                </td>
                <td className="px-6 py-4">{transaction.receiver}</td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      transaction.type === "overdraft-payoff"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                    }`}
                  >
                    {transactionTypeLabels[transaction.type] || transaction.type}
                  </span>
                  {transaction.remarks && (
                    <p className="mt-2 max-w-52 text-xs text-slate-500">{transaction.remarks}</p>
                  )}
                </td>
                <td className="px-6 py-4 font-semibold">{formatCurrency(transaction.amount)}</td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  <p>From {maskAccountNumber(transaction.fromAccountNumber)}</p>
                  <p>To {maskAccountNumber(transaction.toAccountNumber)}</p>
                </td>
                <td className="px-6 py-4">
                  {transaction.createdAt
                    ? new Date(transaction.createdAt).toLocaleString()
                    : "Recently"}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      transactionStatusStyles[transaction.status] || transactionStatusStyles.pending
                    }`}
                  >
                    {getTransactionStatusLabel(transaction.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination {...transactionPagination} />
      </div>
    </section>
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
            <MetricTile label="Reviewed" value={approvalHistory.length} tone="accent" />
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

  const contentBySection = {
    dashboard: (
      <>
        {approvalTable}
        {escalationSection}
      </>
    ),
    approvals: approvalTable,
    "approval-history": approvalHistoryTable,
    overdraft: odSection,
    escalations: escalationSection,
    transactions: transactionsSection,
    notifications: notificationsSection,
    profile: profileSection,
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow={section === "dashboard" ? "Manager Control Panel" : undefined}
          title={section === "dashboard" ? "Branch Operations" : pageTitle}
          subtitle="Monitor approvals, overdraft risk, customer activity, and branch alerts."
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

        {!["approval-history", "overdraft", "profile"].includes(section) && (
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

        {contentBySection[section] ?? contentBySection.dashboard}

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
