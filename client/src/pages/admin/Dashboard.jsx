import {
  AlertTriangle,
  BadgeCheck,
  Clock3,
  CreditCard,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import {
  RechartsDonut,
  RechartsHorizontalBar,
} from "../../components/ui/RechartsReports";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";
import { formatCurrency } from "../../data/mockData";
import { getTierTone } from "../../utils/ui";

const isToday = (value) => {
  if (!value) return false;

  const datePart = String(value).slice(0, 10);
  const today = new Date();
  const todayPart = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return datePart === todayPart;
};

const toNumber = (value) => Number(value || 0);

const formatCompactCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: toNumber(value) >= 100000 ? "compact" : "standard",
  }).format(toNumber(value));

const percentOf = (value, total) =>
  total > 0 ? Math.round((toNumber(value) / total) * 100) : 0;

const buildCountRows = (items, key, labels) =>
  labels.map(({ label, value, color }) => ({
    label,
    sourceValue: value,
    value: items.filter((item) => item[key] === value).length,
    color,
  }));

const activityToneClasses = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
  info: "bg-blue-50 text-blue-700 ring-blue-100",
};

const formatActivityTime = (value) => {
  if (!value) return "Recently";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const maskAccountNumber = (value) => {
  const account = String(value || "").trim();

  if (!account) return "";

  return account.length > 4 ? `A/C ...${account.slice(-4)}` : `A/C ${account}`;
};

const activityActionLabels = {
  "approval.created": "approval escalation created",
  "approval.approved": "approval approved",
  "approval.rejected": "approval rejected",
  "approval.rejected.customer": "transfer rejection notified",
  "customer.created": "registered as a customer",
  "transfer.completed": "completed a beneficiary transfer",
  "transfer.own_account.completed": "completed an own-account transfer",
  "overdraft.third_attempt": "reached the monthly overdraft attempt limit",
};

const extractCustomerFromMessage = (message) => {
  const match = String(message || "").match(
    /(?:New customer|for|from)\s+([A-Za-z][A-Za-z ]+?)(?:\s+(?:registered|to|has|of|above)|$)/
  );

  return match?.[1]?.trim() || "";
};

const buildActivityDisplay = (log) => {
  const metadata = log.metadata || {};
  const customerName =
    log.customerName ||
    metadata.customerName ||
    metadata.customer ||
    extractCustomerFromMessage(log.message) ||
    log.actor ||
    "Customer";
  const action =
    activityActionLabels[log.action] ||
    log.action?.replaceAll(".", " ") ||
    "activity";
  const amount = toNumber(log.amount || metadata.amount);
  const transactionId = log.transactionId || metadata.transactionId || log.entityId;
  const fromAccount = maskAccountNumber(log.fromAccountNumber || metadata.fromAccountNumber);
  const toAccount = maskAccountNumber(log.toAccountNumber || metadata.toAccountNumber);
  const detailParts = [
    amount > 0 ? formatCurrency(amount) : "",
    transactionId && log.entityType === "Transaction" ? transactionId : "",
    fromAccount && toAccount ? `${fromAccount} to ${toAccount}` : fromAccount || toAccount,
    metadata.receiverName ? `Receiver: ${metadata.receiverName}` : "",
    metadata.assignedManager ? `Manager: ${metadata.assignedManager}` : "",
    metadata.customerId ? `Customer ID: ${metadata.customerId}` : "",
    log.actor && log.actor !== customerName ? `By ${log.actor}` : "",
  ].filter(Boolean);

  return {
    customerName,
    action,
    detail: detailParts.join(" / "),
  };
};

const HorizontalBarChart = ({ rows, valueFormatter = (value) => value, detailFormatter }) => {
  return (
    <RechartsHorizontalBar
      rows={rows.map((row) => ({
        ...row,
        detail: detailFormatter?.(row),
      }))}
      valueFormatter={valueFormatter}
      emptyMessage="No customer balance records to chart."
      height={240}
    />
  );
};

const DonutChart = ({ rows }) => {
  return (
    <RechartsDonut
      rows={rows}
      emptyMessage="No tier distribution records to chart."
      height={240}
    />
  );
};

function AdminDashboard() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [dashboardUsers, setDashboardUsers] = useState({
    customers: [],
    managers: [],
  });
  const [tiers, setTiers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    Promise.allSettled([
      api.get("/users"),
      api.get("/tiers"),
      api.get("/approvals"),
      api.get("/transfers/transactions"),
      api.get("/dashboard/admin/logs"),
    ]).then(([usersResult, tiersResult, approvalsResult, transactionsResult, logsResult]) => {
      const usersData =
        usersResult.status === "fulfilled" ? usersResult.value.data : {};
      const tiersData =
        tiersResult.status === "fulfilled" ? tiersResult.value.data : {};
      const approvalsData =
        approvalsResult.status === "fulfilled" ? approvalsResult.value.data : {};
      const transactionsData =
        transactionsResult.status === "fulfilled" ? transactionsResult.value.data : {};
      const logsData =
        logsResult.status === "fulfilled" ? logsResult.value.data : {};
      const nextUsers = {
        customers: usersData.customers || [],
        managers: usersData.managers || [],
      };
      const nextTiers = tiersData.tiers || [];
      const nextApprovals = approvalsData.approvals || [];
      const nextTransactions = transactionsData.transactions || [];

      setDashboardUsers(nextUsers);
      setTiers(nextTiers);
      setApprovals(nextApprovals);
      setTransactions(nextTransactions);
      setRecentLogs(logsData.logs || []);
    });
  }, []);

  const totalSystemBalance = dashboardUsers.customers.reduce((sum, customer) => {
    const accounts = customer.accounts?.length
      ? customer.accounts
      : [customer.account].filter(Boolean);

    return (
      sum +
      accounts.reduce((accountSum, account) => accountSum + toNumber(account.balance), 0)
    );
  }, 0);
  const totalCustomers = dashboardUsers.customers.length;
  const transactionsToday = transactions.filter((transaction) =>
    isToday(transaction.date)
  );
  const failedTransactionsToday = transactionsToday.filter(
    (transaction) => transaction.status === "failed"
  ).length;
  const pendingApprovals = approvals.filter(
    (approval) => approval.status === "pending"
  );
  const transactionStatusRows = buildCountRows(transactions, "status", [
    { label: "Success", value: "success", color: "#10b981" },
    { label: "Pending", value: "pending", color: "#f59e0b" },
    { label: "Rejected", value: "failed", color: "#ef4444" },
  ]).map((row) => ({
    ...row,
    amount: transactions
      .filter((transaction) => transaction.status === row.sourceValue)
      .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0),
  }));
  const tierCustomerRows = tiers.map((tier) => ({
    label: tier.label,
    value: tier.customerCount,
    color: getTierTone(tier.key).dot,
  }));
  const overdraftByTierRows = tiers.map((tier) => {
    const tierCustomers = dashboardUsers.customers.filter(
      (customer) => customer.classification === tier.key
    );
    const used = tierCustomers.reduce(
      (sum, customer) => sum + toNumber(customer.account?.overdraftUsed),
      0
    );
    const limit = tierCustomers.reduce(
      (sum, customer) => sum + toNumber(customer.account?.overdraftLimit),
      0
    );

    return {
      label: tier.label,
      value: used,
      limit,
      color: getTierTone(tier.key).dot,
    };
  });
  const approvalStatusRows = buildCountRows(approvals, "status", [
    { label: "Pending", value: "pending", color: "#f59e0b" },
    { label: "Approved", value: "approved", color: "#10b981" },
    { label: "Rejected", value: "rejected", color: "#ef4444" },
  ]);
  const recentLogPagination = usePaginatedRows(recentLogs);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin Control Panel"
          title="Admin Dashboard"
          subtitle="Full system visibility across users, tiers, transactions, and approvals."
        >
          <div className="stat-chip">
            <p className="text-sm font-semibold text-slate-500">Access Level</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{user?.name || "Admin"}</p>
          </div>
          <button type="button" onClick={handleLogout} className="btn-danger-soft">
            <LogOut size={18} />
            Logout
          </button>
        </PageHeader>

        <div className="stat-grid">
          <StatsCard
            title="Total Customers"
            value={totalCustomers}
            icon={BadgeCheck}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            footer={{ text: "Registered customers" }}
          />
          <StatsCard
            title="Total System Balance"
            value={formatCurrency(totalSystemBalance)}
            icon={CreditCard}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
            footer={{ text: `Across ${totalCustomers} customers` }}
          />
          <StatsCard
            title="Today's Transactions"
            value={transactionsToday.length}
            icon={CreditCard}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            badge={
              failedTransactionsToday > 0
                ? {
                    text: `${failedTransactionsToday} rejected`,
                    tone: "danger",
                  }
                : {
                    text: "All successful",
                    tone: "success",
                  }
            }
          />
          <StatsCard
            title="Pending Approvals"
            value={pendingApprovals.length}
            icon={AlertTriangle}
            accent="bg-red-500"
            iconTone="bg-red-50 text-red-600"
            footer={{
              icon: Clock3,
              text:
                pendingApprovals.length > 0
                  ? "Needs review"
                  : "Queue clear",
            }}
          />
        </div>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="card-padded">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Transaction Status</h2>
                <p className="text-sm text-slate-500">Volume and value by outcome.</p>
              </div>
              <CreditCard className="shrink-0 text-blue-600" size={24} />
            </div>
            <HorizontalBarChart
              rows={transactionStatusRows}
              valueFormatter={(value) => `${value} transfers`}
              detailFormatter={(row) => `${formatCompactCurrency(row.amount)} total value`}
            />
          </div>

          <div className="card-padded">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Customers By Tier</h2>
                <p className="text-sm text-slate-500">Customer classification distribution.</p>
              </div>
              <Users className="shrink-0 text-blue-600" size={24} />
            </div>
            <HorizontalBarChart
              rows={tierCustomerRows}
              valueFormatter={(value) => `${value}`}
            />
          </div>

          <div className="card-padded">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Overdraft Exposure</h2>
                <p className="text-sm text-slate-500">Used overdraft grouped by tier.</p>
              </div>
              <ShieldCheck className="shrink-0 text-blue-600" size={24} />
            </div>
            <HorizontalBarChart
              rows={overdraftByTierRows}
              valueFormatter={formatCompactCurrency}
              detailFormatter={(row) =>
                `${percentOf(row.value, row.limit)}% of ${formatCompactCurrency(row.limit)} assigned`
              }
            />
          </div>

          <div className="card-padded">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Approval Pipeline</h2>
                <p className="text-sm text-slate-500">Review status by approval outcome.</p>
              </div>
              <AlertTriangle className="shrink-0 text-blue-600" size={24} />
            </div>
            <DonutChart rows={approvalStatusRows} />
          </div>
        </section>

        <section className="card-padded">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Recent Activity</h2>
              <p className="text-sm text-slate-500">
                Customer-level activity with action, value, account, and time.
              </p>
            </div>
            <Clock3 className="shrink-0 text-blue-600" size={24} />
          </div>

          <div className="space-y-3">
            {recentLogPagination.pageRows.map((log) => {
              const toneClass =
                activityToneClasses[log.severity] || activityToneClasses.info;
              const activity = buildActivityDisplay(log);

              return (
                <div key={log.id || `${log.action}-${log.createdAt}`} className="activity-item">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">
                          {activity.customerName}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {activity.action}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ${toneClass}`}
                      >
                        {log.severity || "info"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {[activity.detail, formatActivityTime(log.createdAt)]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                    <p className="hidden">
                      {[log.actor, log.entityType, log.action].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              );
            })}

            {recentLogs.length === 0 && (
              <div className="rounded-xl border border-dashed border-bank-card-border bg-bank-surface px-4 py-8 text-center text-sm font-semibold text-slate-500">
                No recent system activity is available.
              </div>
            )}
          </div>
          <TablePagination {...recentLogPagination} />
        </section>
      </PageContent>
    </DashboardLayout>
  );
}

export default AdminDashboard;
