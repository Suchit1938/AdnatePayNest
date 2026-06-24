import {
  AlertTriangle,
  BadgeCheck,
  Clock3,
  CreditCard,
  LogOut,
  ShieldCheck,
  Users,
  ChevronRight,
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
import { useToast } from "../../components/ui/useToast";
import { getTierTone } from "../../utils/ui";

const isToday = (value) => {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

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
  const toast = useToast();
  const [dashboardUsers, setDashboardUsers] = useState({
    customers: [],
    managers: [],
  });
  const [tiers, setTiers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [settlement, setSettlement] = useState({
    account: {
      accountName: "Adnate Bank Settlement Account",
      accountNumber: "BANK-SETTLEMENT-0001",
      balance: 0,
      openingBalance: 0,
      minimumReserve: 0,
      availableForDisbursement: 0,
    },
    totals: {
      totalLoanDisbursed: 0,
      totalLoanCollected: 0,
      totalOdRecovered: 0,
      settlementTransactionCount: 0,
    },
  });

  useEffect(() => {
    Promise.allSettled([
      api.get("/users"),
      api.get("/tiers"),
      api.get("/approvals"),
      api.get("/transfers/transactions"),
      api.get("/dashboard/admin/logs"),
      api.get("/dashboard/admin/settlement"),
    ]).then(([usersResult, tiersResult, approvalsResult, transactionsResult, logsResult, settlementResult]) => {
      if (usersResult.status !== "fulfilled") toast.error("Failed to load users");
      if (tiersResult.status !== "fulfilled") toast.error("Failed to load tiers");
      if (approvalsResult.status !== "fulfilled") toast.error("Failed to load approvals");
      if (transactionsResult.status !== "fulfilled") toast.error("Failed to load transactions");
      if (logsResult.status !== "fulfilled") toast.error("Failed to load recent logs");
      if (settlementResult.status !== "fulfilled") toast.error("Failed to load settlement data");

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
      const settlementData =
        settlementResult.status === "fulfilled" ? settlementResult.value.data : {};
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
      setSettlement((current) => settlementData.settlement || current);
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
          <div
            onClick={() => navigate("/admin/profile")}
            className="flex items-center gap-3 bg-white border border-bank-card-border p-2 pr-4 rounded-full shadow-sm hover:border-bank-accent/45 transition cursor-pointer"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bank-sidebar text-xs font-bold text-white shadow-sm">
              {user?.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "AD"}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 leading-tight">{user?.name || "System Admin"}</p>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-none">{user?.email || "admin@adnatebank.com"}</p>
            </div>
            <ChevronRight size={14} className="text-slate-400" />
          </div>
          <button type="button" onClick={handleLogout} className="btn-danger-soft cursor-pointer" aria-label="Logout">
            <LogOut size={16} />
            <span className="hidden md:inline">Logout</span>
          </button>
        </PageHeader>

        {/* Settlement & Liquidity Section (Split Layout) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Settlement Balance Hero Card (1 Column) */}
          <div
            onClick={() => navigate("/admin/settlement")}
            className="relative flex h-64 w-full flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-xl shadow-blue-950/15 cursor-pointer transition hover:-translate-y-0.5 hover:shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #0b192c 0%, #1e3e62 50%, #002244 100%)",
            }}
          >
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/5 blur-3xl -mr-16 -mt-16 pointer-events-none" />
            
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-extrabold tracking-widest text-blue-200/60 uppercase">Settlement Account</p>
                <p className="text-[9px] font-bold text-blue-200/40 italic">Internal Liquidity Pool</p>
              </div>
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-200 backdrop-blur ring-1 ring-blue-400/30">
                {settlement.account.accountNumber}
              </span>
            </div>

            <div>
              <p className="text-[11px] font-bold text-blue-200/50 uppercase tracking-wider">Settlement Balance</p>
              <p className="text-3xl font-black text-white mt-1 select-all">
                {formatCurrency(settlement.account.balance)}
              </p>
            </div>

            <div className="flex justify-between items-end border-t border-white/10 pt-4">
              <div>
                <p className="text-[9px] font-semibold text-blue-200/40 uppercase">Lendable Funds</p>
                <p className="text-sm font-bold text-emerald-400">
                  {formatCurrency(settlement.account.availableForDisbursement)}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-blue-300">
                <span>Ledger Details</span>
                <ChevronRight size={14} />
              </div>
            </div>
          </div>

          {/* 2x2 Stats Cards (Right - 2 Columns) */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatsCard
              title="Total Customers"
              value={totalCustomers}
              icon={BadgeCheck}
              accent="bg-emerald-500"
              iconTone="bg-emerald-50 text-emerald-600"
              footer={{ text: "Manage customers", icon: ChevronRight, iconClassName: "text-emerald-500" }}
              onClick={() => navigate("/admin/customers")}
            />
            <StatsCard
              title="Total System Balance"
              value={formatCurrency(totalSystemBalance)}
              icon={CreditCard}
              accent="bg-violet-500"
              iconTone="bg-violet-50 text-violet-600"
              footer={{ text: "View customer reports", icon: ChevronRight, iconClassName: "text-violet-500" }}
              onClick={() => navigate("/admin/reports#customers")}
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
              footer={{ text: "Audit transactions", icon: ChevronRight, iconClassName: "text-amber-500" }}
              onClick={() => navigate("/admin/reports#transactions")}
            />
            <StatsCard
              title="Pending Approvals"
              value={pendingApprovals.length}
              icon={AlertTriangle}
              accent="bg-red-500"
              iconTone="bg-red-50 text-red-600"
              footer={{
                icon: ChevronRight,
                iconClassName: "text-red-500",
                text:
                  pendingApprovals.length > 0
                    ? "Needs review"
                    : "Queue clear · View history",
              }}
              onClick={() => navigate("/admin/reports#approvals")}
            />
          </div>
        </div>

        {/* Bank Settlement Ledger Card */}
        <div className="rounded-2xl border border-bank-card-border bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Bank Settlement Ledger</h3>
            <p className="text-xs text-slate-500 mt-1">
              Internal tracking of loan payouts, principal collections, penalty/overdraft recoveries, and reserves.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening Bal</p>
              <p className="mt-2 text-lg font-extrabold text-slate-800">
                {formatCurrency(settlement.account.openingBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Min Reserve</p>
              <p className="mt-2 text-lg font-extrabold text-slate-800">
                {formatCurrency(settlement.account.minimumReserve)}
              </p>
            </div>
            <div className="rounded-xl border border-red-50 bg-red-50/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-500/70">Loan Disbursed</p>
              <p className="mt-2 text-lg font-extrabold text-red-600">
                {formatCurrency(settlement.totals.totalLoanDisbursed)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-50 bg-emerald-50/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/70">Recovered</p>
              <p className="mt-2 text-lg font-extrabold text-emerald-600">
                {formatCurrency(settlement.totals.totalLoanCollected + settlement.totals.totalOdRecovered)}
              </p>
            </div>
          </div>
        </div>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="card-padded">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Transaction Status</h2>
                <p className="text-sm text-slate-500">Volume and value by outcome.</p>
              </div>
              <button
                onClick={() => navigate("/admin/reports#transactions")}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-bank-sidebar hover:bg-bank-surface transition cursor-pointer"
              >
                <span>Analytics</span>
                <ChevronRight size={14} />
              </button>
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
              <button
                onClick={() => navigate("/admin/reports#classifications")}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-bank-sidebar hover:bg-bank-surface transition cursor-pointer"
              >
                <span>Tiers</span>
                <ChevronRight size={14} />
              </button>
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
              <button
                onClick={() => navigate("/admin/reports#overdraft")}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-bank-sidebar hover:bg-bank-surface transition cursor-pointer"
              >
                <span>Exposure</span>
                <ChevronRight size={14} />
              </button>
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
              <button
                onClick={() => navigate("/admin/reports#approvals")}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-bank-sidebar hover:bg-bank-surface transition cursor-pointer"
              >
                <span>Pipeline</span>
                <ChevronRight size={14} />
              </button>
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
                <div key={log.id || `${log.action}-${log.createdAt}`} className="activity-item cursor-pointer transition-transform hover:scale-105" onClick={() => console.log('Log clicked', log.id)}>
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
                        {log.severity?.charAt(0).toUpperCase() + log.severity?.slice(1) || "Info"}
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
