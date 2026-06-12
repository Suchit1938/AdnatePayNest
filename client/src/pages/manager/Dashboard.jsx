import { Fragment, useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import EmptyState from "../../components/ui/EmptyState";
import {
  BarChart3,
  Bell,
  Check,
  CircleDollarSign,
  CreditCard,
  Gauge,
  IdCard,
  ListChecks,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
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
  const overdraftCustomers = dashboardData.overdraftCustomers || [];
  const overdraftRisk = dashboardData.overdraftRisk || [];
  const overdraftExposureByType = dashboardData.overdraftExposureByType || [];
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

  const visibleApprovalQueue = pendingApprovals;
  const approvalPagination = usePaginatedRows(visibleApprovalQueue);
  const approvalHistoryPagination = usePaginatedRows(approvalHistory);
  const overdraftCustomerPagination = usePaginatedRows(overdraftCustomers);
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
                  <EmptyState message="No pending approval requests in the database yet." />
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
                  <EmptyState message="No approved or rejected approvals yet." />
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
          <EmptyState message="No overdraft utilization records found." />
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
                <div className={`h-full rounded-full ${risk.bar}`} style={{ width: `${width}%` }} />
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
                <div className={`h-full rounded-full ${risk.bar}`} style={{ width: `${width}%` }} />
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
          <EmptyState message="No overdraft exposure by account type yet." />
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
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );

  const odCustomerTable = (
    <section className="table-shell">
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <div>
          <h2 className="text-xl font-bold">Customer Overdraft Accounts</h2>
          <p className="text-sm text-slate-500">
            Customer-level OD limits, usage, remaining balance, and current risk.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
          {overdraftCustomers.length} customers
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left">
          <thead className="table-head">
            <tr>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Customer ID</th>
              <th className="px-6 py-4">Account</th>
              <th className="px-6 py-4">OD Limit</th>
              <th className="px-6 py-4">Used</th>
              <th className="px-6 py-4">Available</th>
              <th className="px-6 py-4">Utilization</th>
              <th className="px-6 py-4">Risk</th>
            </tr>
          </thead>
          <tbody>
            {overdraftCustomers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8">
                  <EmptyState message="No customer overdraft accounts found." />
                </td>
              </tr>
            )}
            {overdraftCustomerPagination.pageRows.map((customer) => {
              const risk = odRiskStyles[customer.risk] || odRiskStyles.unused;

              return (
                <tr key={customer.id || customer.customerId} className="table-row">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{customer.customer}</p>
                    <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getTierTone(customer.classification).badge}`}>
                      {customer.classification}
                    </span>
                  </td>
                  <td className="px-6 py-4">{customer.customerId}</td>
                  <td className="px-6 py-4">
                    <p>{maskAccountNumber(customer.account)}</p>
                    <p className="text-xs text-slate-500">
                      {customer.accountType} - {customer.accountCount} account{customer.accountCount === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-6 py-4 font-semibold">{formatCurrency(customer.limit)}</td>
                  <td className="px-6 py-4 font-semibold text-amber-700">
                    {formatCurrency(customer.used)}
                  </td>
                  <td className="px-6 py-4">{formatCurrency(customer.available)}</td>
                  <td className="px-6 py-4">
                    <div className="flex min-w-36 items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${risk.bar}`}
                          style={{ width: `${Math.max(4, clampPercent(customer.utilization))}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-bold">
                        {customer.utilization}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${risk.badge}`}>
                      {risk.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <TablePagination {...overdraftCustomerPagination} />
      </div>
    </section>
  );

  const odRecentActivity = (
    <SectionCard title="Recent OD Activity" subtitle="Latest overdraft payoff and OD alerts">
      <div className="space-y-3">
        {recentOverdraftActivity.length === 0 && (
          <EmptyState message="No recent overdraft activity yet." />
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
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <div>
          <h2 className="text-xl font-bold">Overdraft Payoff Transactions</h2>
          <p className="text-sm text-slate-500">
            Customer payments made to reduce or close active overdraft dues.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
          {overdraftPayoffTransactions.length} payoff transactions
        </span>
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
                  <EmptyState message="No overdraft payoff transactions found yet." />
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

  const odSection = (
    <div className="space-y-6">
      {odOverview}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {odUtilizationCard}
        {odTopUtilizersCard}
      </section>
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {odRiskCard}
        {odExposureCard}
      </section>
      {odCustomerTable}
      {odPayoffTransactionsTable}
      {odRecentActivity}
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
          <EmptyState message="No escalations requiring attention." />
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
                  <EmptyState message="No customer transactions found yet." />
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
          <div className="stat-chip flex items-center gap-4">
            <div className="relative">
              <Bell size={22} className="text-slate-600" />
              {dashboardData.stats.notificationCount > 0 && (
                <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                  {dashboardData.stats.notificationCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UserCircle size={28} className="text-slate-600" />
              <span className="font-semibold">{user?.name || "Manager"}</span>
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
      </PageContent>
    </DashboardLayout>
  );
}

export default ManagerDashboard;
