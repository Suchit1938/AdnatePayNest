import {
  ArrowLeftRight,
  BadgeIndianRupee,
  Clock,
  CreditCard,
  ChevronRight,
  Landmark,
  ShieldCheck,
  Copy,
  Check,
  History,
  FileText,
  UserCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/axios";
import DashboardLayout from "../../layouts/DashboardLayout";
import StatsCard from "../../components/dashboard/StatsCard";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import { RechartsDonut } from "../../components/ui/RechartsReports";
import SectionCard from "../../components/ui/SectionCard";
import { useAuth } from "../../context/useAuth";
import { BANK_NAME, formatCurrency, maskAccountNumber } from "../../data/mockData";
import { getCustomerAccounts, getCustomerOverdraftSummary } from "../../utils/overdraft";
import { getTierTone } from "../../utils/ui";
import { useToast } from "../../components/ui/useToast";

const Dashboard = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [copied, setCopied] = useState(false);

  const accounts = getCustomerAccounts(user);
  const totalBalance = accounts.reduce(
    (sum, currentAccount) => sum + Number(currentAccount.balance || 0),
    0
  );
  const { overdraftLimit, overdraftUsed, availableOverdraft } =
    getCustomerOverdraftSummary(user);
  const pendingRequests = user?.pendingRequests || 0;
  
  const activeLoans = loans.filter((loan) => ["approved", "disbursed"].includes(loan.status));
  const pendingLoans = loans.filter((loan) => ["submitted", "under_review"].includes(loan.status));

  useEffect(() => {
    api
      .get("/loans")
      .then(({ data }) => setLoans(data.loans || []))
      .catch(() => setLoans([]));

    api
      .get("/transfers/transactions")
      .then(({ data }) => {
        const txns = data.transactions || [];
        const sorted = [...txns].sort(
          (left, right) => new Date(right.createdAt || right.date || 0) - new Date(left.createdAt || left.date || 0)
        );
        setRecentTxns(sorted.slice(0, 3));
      })
      .catch(() => setRecentTxns([]));
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good morning", icon: "☀️" };
    if (hour < 17) return { text: "Good afternoon", icon: "🌤️" };
    return { text: "Good evening", icon: "🌙" };
  };

  const greeting = getGreeting();

  const handleCopyAccount = (num) => {
    if (!num) return;
    navigator.clipboard.writeText(num);
    setCopied(true);
    toast.success("Account number copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const primaryAccount = accounts[0];
  const customerMasterColor = "oklch(0.32 0.17 287.7)";

  // Dynamic Tier Card Colors
  const tier = (user?.classification || "standard").toLowerCase();
  let tierLabel = "STANDARD TIER";
  
  if (tier === "platinum") {
    tierLabel = "PLATINUM TIER";
  } else if (tier === "gold") {
    tierLabel = "GOLD TIER";
  } else if (tier === "silver") {
    tierLabel = "SILVER TIER";
  }

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title={`${greeting.text}${user?.name ? `, ${user.name.split(" ")[0]}` : ""} ${greeting.icon}`}
          subtitle={`Review balances, transfers, overdraft health, and account details for ${BANK_NAME}.`}
        >
          <div
            onClick={() => navigate("/profile")}
            className="flex items-center gap-3 bg-white border border-bank-card-border p-2 pr-4 rounded-full shadow-sm hover:border-bank-accent/45 transition cursor-pointer"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bank-sidebar text-xs font-bold text-white shadow-sm">
              {user?.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-800 leading-tight">{user?.name}</p>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-none">{user?.email}</p>
            </div>
            <ChevronRight size={14} className="text-slate-400" />
          </div>
        </PageHeader>

        {/* Top Split Hero & Stats Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Virtual Card (Left) */}
          <div className="lg:col-span-1">
            <div
              className="relative flex h-60 w-full flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-6 text-white shadow-xl shadow-slate-950/25"
              style={{
                background: `linear-gradient(135deg, #1d2c4c 0%, #45659f 48%, ${customerMasterColor} 100%)`,
              }}
            >
              {/* Card Decorative background overlay */}
              <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/5 blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <div className="absolute left-0 bottom-0 h-32 w-32 rounded-full bg-white/5 blur-2xl -ml-16 -mb-16 pointer-events-none" />
              
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-extrabold tracking-widest text-white/60">{BANK_NAME.toUpperCase()}</p>
                  <p className="text-[9px] font-bold text-white/40 italic">Technology & Trust</p>
                </div>
                <span className="text-[10px] font-extrabold tracking-wider bg-white/10 px-2 py-0.5 rounded backdrop-blur">
                  {tierLabel}
                </span>
              </div>

              {/* Balance */}
              <div>
                <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Total Available Balance</p>
                <p className="text-3xl font-black text-white mt-1 select-all">{formatCurrency(totalBalance)}</p>
              </div>

              {/* Footer details */}
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[9px] font-semibold text-white/40 uppercase">Cardholder</p>
                  <p className="text-sm font-bold text-white tracking-wide truncate max-w-[150px]">{user?.name}</p>
                </div>
                {primaryAccount && (
                  <div className="text-right">
                    <p className="text-[9px] font-semibold text-white/40 uppercase">Account Number</p>
                    <div className="flex items-center gap-1.5 justify-end">
                      <p className="text-xs font-bold text-white tracking-wider">
                        {maskAccountNumber(primaryAccount.accountNumber)}
                      </p>
                      <button
                        onClick={() => handleCopyAccount(primaryAccount.accountNumber)}
                        className="rounded p-1 hover:bg-white/15 active:scale-95 text-white/65 hover:text-white transition cursor-pointer"
                        title="Copy Account Number"
                      >
                        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2x2 Stats Cards (Right) */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatsCard
              title="Pending Approvals"
              value={String(pendingRequests)}
              icon={Clock}
              accent="bg-amber-500"
              iconTone="bg-amber-50 text-amber-600"
              onClick={() => navigate("/transactions")}
              badge={
                pendingRequests > 0
                  ? { text: "Awaiting approval", tone: "warning" }
                  : { text: "All clear", tone: "success" }
              }
            />

            <StatsCard
              title="Available Overdraft"
              value={formatCurrency(availableOverdraft)}
              icon={Landmark}
              accent="bg-violet-500"
              iconTone="bg-violet-50 text-violet-600"
              onClick={() => navigate("/overdraft")}
              badge={{
                text: user?.classification
                  ? `${user.classification.charAt(0).toUpperCase() + user.classification.slice(1)} Tier`
                  : "Standard Tier",
                tone: "neutral",
              }}
            />

            <StatsCard
              title="Total Transfers"
              value={user?.totalTransfers || 0}
              icon={ArrowLeftRight}
              accent="bg-blue-500"
              iconTone="bg-blue-50 text-blue-600"
              onClick={() => navigate("/transactions")}
              badge={{ text: "All transactions", tone: "neutral" }}
            />

            <StatsCard
              title="Loan Applications"
              value={`Pending: ${pendingLoans.length} | Active: ${activeLoans.length}`}
              icon={BadgeIndianRupee}
              accent="bg-emerald-500"
              iconTone="bg-emerald-50 text-emerald-600"
              onClick={() => navigate("/loans")}
              badge={{
                text: `${pendingLoans.length} pending, ${activeLoans.length} active`,
                tone: pendingLoans.length > 0 ? "warning" : "neutral",
              }}
            />
          </div>
        </div>

        {/* Quick Actions Component */}
        <SectionCard title="Quick Actions" subtitle="Fast and secure shortcuts to standard operations">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <button
              onClick={() => navigate("/transfer")}
              className="flex flex-col items-center gap-3 rounded-xl border border-bank-card-border bg-white p-4 text-center transition hover:border-bank-accent/60 hover:bg-bank-surface hover:shadow-sm cursor-pointer"
            >
              <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
                <ArrowLeftRight size={20} />
              </div>
              <span className="text-xs font-bold text-slate-700">Send Money</span>
            </button>
            <button
              onClick={() => navigate("/loans")}
              className="flex flex-col items-center gap-3 rounded-xl border border-bank-card-border bg-white p-4 text-center transition hover:border-bank-accent/60 hover:bg-bank-surface hover:shadow-sm cursor-pointer"
            >
              <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
                <BadgeIndianRupee size={20} />
              </div>
              <span className="text-xs font-bold text-slate-700">Apply for Loan</span>
            </button>
            <button
              onClick={() => navigate("/overdraft")}
              className="flex flex-col items-center gap-3 rounded-xl border border-bank-card-border bg-white p-4 text-center transition hover:border-bank-accent/60 hover:bg-bank-surface hover:shadow-sm cursor-pointer"
            >
              <div className="rounded-lg bg-violet-50 p-3 text-violet-600">
                <Landmark size={20} />
              </div>
              <span className="text-xs font-bold text-slate-700">Manage Overdraft</span>
            </button>
            <button
              onClick={() => navigate("/statement")}
              className="flex flex-col items-center gap-3 rounded-xl border border-bank-card-border bg-white p-4 text-center transition hover:border-bank-accent/60 hover:bg-bank-surface hover:shadow-sm cursor-pointer"
            >
              <div className="rounded-lg bg-amber-50 p-3 text-amber-600">
                <FileText size={20} />
              </div>
              <span className="text-xs font-bold text-slate-700">View Statements</span>
            </button>
            <button
              onClick={() => navigate("/beneficiaries")}
              className="flex flex-col items-center gap-3 rounded-xl border border-bank-card-border bg-white p-4 text-center transition hover:border-bank-accent/60 hover:bg-bank-surface hover:shadow-sm cursor-pointer"
            >
              <div className="rounded-lg bg-sky-50 p-3 text-sky-600">
                <UserCheck size={20} />
              </div>
              <span className="text-xs font-bold text-slate-700">Manage Payees</span>
            </button>
          </div>
        </SectionCard>

        {/* Balance Overview & Overdraft Health Split */}
        <section className="section-split">
          <SectionCard
            className="section-split-main"
            title="Balance Overview"
            subtitle="Linked account balances and details"
            icon={CreditCard}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((account) => {
                const balance = Number(account.balance || 0);

                return (
                  <div
                    key={account.accountNumber || account.accountType}
                    className="group relative rounded-xl border border-bank-card-border p-4 bg-white hover:border-bank-accent/40 transition hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-extrabold text-slate-900 text-lg">
                          {account.accountType || "Savings"} Account
                        </p>
                        <p className="text-xs text-slate-500 font-semibold mt-1">
                          Account No: {maskAccountNumber(account.accountNumber)}
                        </p>
                        <p className="text-xs text-slate-400 font-semibold">
                          IFSC: {account.ifsc || "ADNT0000000"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Balance</p>
                        <p className="font-extrabold text-slate-950 text-xl mt-1">
                          {formatCurrency(balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {accounts.length === 0 && (
                <p className="rounded-xl bg-bank-surface p-4 text-sm font-semibold text-slate-500 text-center w-full col-span-2">
                  No linked account details available.
                </p>
              )}
            </div>
          </SectionCard>

          {/* Consolidated Overdraft Health Widget */}
          <SectionCard
            title="Overdraft Health"
            subtitle="Consolidated limit and outstanding dues"
            icon={ShieldCheck}
          >
            <div className="flex flex-col items-center justify-around gap-6 sm:flex-row">
              <div className="h-48 w-48 shrink-0">
                <RechartsDonut
                  rows={[
                    { label: "Used", value: overdraftUsed, color: "#f59e0b" },
                    { label: "Available", value: availableOverdraft, color: "#dbeafe" },
                  ]}
                  emptyMessage="No overdraft limit is available to chart."
                  height={190}
                />
              </div>

              {/* Consolidated Metrics */}
              <div className="flex-1 w-full space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-bank-card-border bg-slate-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Limit</p>
                    <p className="text-base font-bold text-slate-900">{formatCurrency(overdraftLimit)}</p>
                  </div>
                  <div className="rounded-lg border border-bank-card-border bg-slate-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available</p>
                    <p className="text-base font-bold text-emerald-600">{formatCurrency(availableOverdraft)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/80">Outstanding Due</p>
                    <p className={`text-lg font-extrabold ${overdraftUsed > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {formatCurrency(overdraftUsed)}
                    </p>
                  </div>
                  {overdraftUsed > 0 && (
                    <button
                      onClick={() => navigate("/overdraft")}
                      className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 cursor-pointer"
                    >
                      Pay Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </section>

        {/* Recent Activity Feed & Customer Details */}
        <section className="section-split">
          <SectionCard
            className="section-split-main"
            title="Recent Activity"
            subtitle="Your recent transaction overview"
            icon={History}
          >
            <div className="space-y-3">
              {recentTxns.map((txn) => {
                const isDebit = accounts.some(acc => acc.accountNumber === txn.fromAccountNumber);
                const status = String(txn.status || "").toLowerCase();
                const amount = Number(txn.amount || 0);

                let statusBadgeColor = "bg-slate-100 text-slate-600";
                if (status === "success" || status === "completed") statusBadgeColor = "bg-emerald-50 text-emerald-700";
                if (status === "pending") statusBadgeColor = "bg-amber-50 text-amber-700";
                if (status === "failed") statusBadgeColor = "bg-red-50 text-red-700";

                return (
                  <div key={txn.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-bank-card-border bg-white hover:bg-bank-surface/30 transition">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {txn.type === "overdraft-payoff"
                          ? "Overdraft Payoff"
                          : isDebit
                          ? `Transfer to ${txn.receiver || "Beneficiary"}`
                          : `Received from ${txn.sender || "Sender"}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' }) : txn.date || "Recent"} • Ref {txn.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeColor}`}>
                        {status === "success" || status === "completed" ? "Success" : status}
                      </span>
                      <p className={`font-bold text-sm ${isDebit ? "text-red-600" : "text-emerald-600"}`}>
                        {isDebit ? "-" : "+"}{formatCurrency(amount)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {recentTxns.length === 0 && (
                <p className="text-sm font-medium text-slate-500 py-4 text-center bg-bank-surface rounded-xl">
                  No recent transactions found.
                </p>
              )}
              {recentTxns.length > 0 && (
                <div className="text-right pt-1">
                  <button
                    onClick={() => navigate("/transactions")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-bank-accent hover:text-bank-accent-hover transition cursor-pointer"
                  >
                    View all transactions <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Customer Details"
            subtitle="Verified profile details"
            icon={ShieldCheck}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2.5 border-b border-bank-card-border">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer ID</span>
                <span className="text-sm font-bold text-slate-800">{user?.customerId || "Not assigned"}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-bank-card-border">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tier Classification</span>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${getTierTone(user?.classification).badge}`}>
                    {user?.classification || "Standard"}
                  </span>
                  <button
                    onClick={() => navigate("/overdraft#tier-policy")}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center cursor-pointer"
                  >
                    Details <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Status</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {user?.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : "Active"}
                </span>
              </div>
            </div>
          </SectionCard>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default Dashboard;
