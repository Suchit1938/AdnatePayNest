import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  Landmark,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import { RechartsHorizontalBar } from "../../components/ui/RechartsReports";
import SectionCard from "../../components/ui/SectionCard";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency, maskAccountNumber } from "../../utils/format";
import { getCustomerAccounts, getCustomerOverdraftSummary } from "../../utils/overdraft";
import { getTierTone } from "../../utils/ui";

const RequiredMark = () => <span className="ml-1 text-sm font-black text-red-600">*</span>;

const parseMonthlyInterestRate = (value) => {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);

  return match ? Number(match[1]) / 100 : 0;
};

const getInterestDays = (startedAt) => {
  if (!startedAt) return 1;

  const startedTime = new Date(startedAt).getTime();

  if (!Number.isFinite(startedTime)) return 1;

  return Math.max(1, Math.ceil((Date.now() - startedTime) / (24 * 60 * 60 * 1000)));
};

const calculateInterest = (principal, interestRate, startedAt) => {
  const amount = Math.max(0, Number(principal || 0));
  const rate = parseMonthlyInterestRate(interestRate);
  const drawdownEntries = [];

  if (amount <= 0 || rate <= 0) {
    return {
      interestAmount: 0,
      interestDays: amount > 0 ? getInterestDays(startedAt) : 0,
      drawdowns: drawdownEntries,
    };
  }

  const interestDays = getInterestDays(startedAt);

  return {
    interestAmount: Math.ceil(amount * rate * (interestDays / 30)),
    interestDays,
    drawdowns: [
      {
        amount,
        usedAt: startedAt,
        interestDays,
        interestAmount: Math.ceil(amount * rate * (interestDays / 30)),
      },
    ],
  };
};

const normalizeDrawdowns = (drawdowns, principal, startedAt) => {
  const entries = (drawdowns || [])
    .map((entry) => ({
      amount: Math.max(0, Number(entry.amount || 0)),
      usedAt: entry.usedAt || startedAt,
    }))
    .filter((entry) => entry.amount > 0);
  const entryTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const currentPrincipal = Math.max(0, Number(principal || 0));

  if (entryTotal === currentPrincipal) return entries;

  if (entryTotal > currentPrincipal) {
    let remaining = currentPrincipal;

    return entries
      .map((entry) => {
        const amount = Math.min(entry.amount, remaining);
        remaining -= amount;
        return { ...entry, amount };
      })
      .filter((entry) => entry.amount > 0);
  }

  if (currentPrincipal > entryTotal) {
    return [
      ...entries,
      {
        amount: currentPrincipal - entryTotal,
        usedAt: startedAt,
      },
    ];
  }

  return entries;
};

const calculateDrawdownInterest = (principal, interestRate, startedAt, drawdowns) => {
  const entries = normalizeDrawdowns(drawdowns, principal, startedAt);
  const rate = parseMonthlyInterestRate(interestRate);

  if (entries.length === 0 || rate <= 0) {
    return {
      interestAmount: 0,
      interestDays: entries.length
        ? Math.max(...entries.map((entry) => getInterestDays(entry.usedAt)))
        : 0,
      drawdowns: entries.map((entry) => ({
        ...entry,
        interestDays: getInterestDays(entry.usedAt),
        interestAmount: 0,
      })),
    };
  }

  const interestRows = entries.map((entry) => {
    const interestDays = getInterestDays(entry.usedAt);

    return {
      ...entry,
      interestDays,
      interestAmount: Math.ceil(entry.amount * rate * (interestDays / 30)),
    };
  });

  return {
    interestAmount: interestRows.reduce((sum, entry) => sum + entry.interestAmount, 0),
    interestDays: Math.max(...interestRows.map((entry) => entry.interestDays)),
    drawdowns: interestRows,
  };
};

const getAccountRule = (policy, accountType) =>
  (policy?.accountTypeOdRules || []).find((rule) => rule.accountType === accountType);

const overdraftTabs = [
  { key: "overview", label: "Overview" },
  { key: "usage", label: "Repay OD" },
  { key: "activity", label: "Activity" },
];

const getTabFromLocation = (location) => {
  const tab = new URLSearchParams(location.search).get("tab");
  const validTabs = overdraftTabs.map((item) => item.key);

  if (validTabs.includes(tab)) return tab;
  if (tab === "rules" || location.hash === "#tier-policy" || location.hash === "#rules") {
    return "overview";
  }

  return "overview";
};

const Overdraft = () => {
  const toast = useToast();
  const location = useLocation();
  const { setSessionUser, user } = useAuth();
  const [activeTab, setActiveTab] = useState(() => getTabFromLocation(location));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [payoffAmount, setPayoffAmount] = useState("");
  const [tierPolicy, setTierPolicy] = useState(null);
  const accounts = getCustomerAccounts(user);
  const activeOdAccount =
    accounts.find((account) => Number(account.overdraftUsed || 0) > 0) || accounts[0];
  const [odAccountNumber, setOdAccountNumber] = useState(activeOdAccount?.accountNumber || "");
  const [paymentAccountNumber, setPaymentAccountNumber] = useState(
    activeOdAccount?.accountNumber || accounts[0]?.accountNumber || ""
  );

  useEffect(() => {
    api.get("/tiers/policy").then(({ data }) => {
      setTierPolicy(data.tier);
    });
  }, []);

  useEffect(() => {
    setActiveTab(getTabFromLocation(location));
  }, [location]);

  const summary = getCustomerOverdraftSummary(user);
  const effectiveOdAccountNumber = odAccountNumber || activeOdAccount?.accountNumber || "";
  const odAccount =
    accounts.find((account) => account.accountNumber === effectiveOdAccountNumber) || activeOdAccount;
  const effectivePaymentAccountNumber =
    paymentAccountNumber || odAccount?.accountNumber || accounts[0]?.accountNumber || "";
  const paymentAccount =
    accounts.find((account) => account.accountNumber === effectivePaymentAccountNumber) || odAccount;
  const accountRule = getAccountRule(tierPolicy, odAccount?.accountType);
  const interestRate = tierPolicy?.interestRate || tierPolicy?.lateFeeRate || "";
  const tierRules = tierPolicy?.accountTypeOdRules || [];
  const accountLimit = Number(odAccount?.overdraftLimit || accountRule?.odLimit || 0);
  const selectedOpeningBalance = Number(accountRule?.minOpeningBalance || tierPolicy?.minBalance || 0);
  const accountUsed = Number(odAccount?.overdraftUsed || 0);
  const accountAvailable = Math.max(0, accountLimit - accountUsed);
  const monthlyOdUses = Number(accountRule?.monthlyOdUses ?? odAccount?.odMonthlyUseLimit ?? 3);
  const interest = odAccount?.odDrawdowns?.length
    ? calculateDrawdownInterest(
      accountUsed,
      interestRate,
      odAccount?.odStartedAt,
      odAccount.odDrawdowns
    )
    : calculateInterest(accountUsed, interestRate, odAccount?.odStartedAt);
  const totalDueNow = accountUsed + interest.interestAmount;
  const effectivePayoffAmount = Number(payoffAmount || totalDueNow);
  const paymentBalance = Number(paymentAccount?.balance || 0);
  const maxPayableAmount = Math.min(totalDueNow, paymentBalance);
  const interestPaidEstimate = Math.min(effectivePayoffAmount, interest.interestAmount);
  const principalPaidEstimate = Math.max(0, effectivePayoffAmount - interestPaidEstimate);
  const remainingAfterPayment = Math.max(0, accountUsed - principalPaidEstimate);
  const hasInvalidPayoffAmount =
    effectivePayoffAmount < 1 ||
    effectivePayoffAmount > totalDueNow ||
    effectivePayoffAmount > paymentBalance;

  const accountCards = accounts
    .map((account) => {
      const limit = Number(account.overdraftLimit || 0);
      const used = Number(account.overdraftUsed || 0);
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;
      const rule = getAccountRule(tierPolicy, account.accountType);

      return {
        ...account,
        limit,
        used,
        available: Math.max(0, limit - used),
        percent,
        monthlyOdUses: Number(rule?.monthlyOdUses ?? account.odMonthlyUseLimit ?? 3),
      };
    })
    .sort((left, right) => {
      const rightActive = Number(right.used || 0) > 0 ? 1 : 0;
      const leftActive = Number(left.used || 0) > 0 ? 1 : 0;

      if (rightActive !== leftActive) return rightActive - leftActive;
      return Number(right.used || 0) - Number(left.used || 0);
    });

  const handlePayOffOverdraft = async () => {
    setMessage("");
    setError("");

    if (accountUsed <= 0) {
      const errorMessage = "No overdraft is due for the selected account.";
      setError(errorMessage);
      toast.info(errorMessage);
      return;
    }

    if (hasInvalidPayoffAmount) {
      const errorMessage = "Enter an amount within the due amount and selected account balance.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    try {
      setIsPaying(true);
      const { data } = await api.post("/overdraft/payoff", {
        odAccountNumber: odAccount.accountNumber,
        paymentAccountNumber: paymentAccount.accountNumber,
        amount: effectivePayoffAmount,
      });

      setSessionUser({
        ...user,
        account: data.account,
        accounts: data.accounts,
      });
      const successMessage = `${formatCurrency(data.paidAmount)} paid toward ${odAccount.accountType} account OD.`;
      setMessage(successMessage);
      toast.success(successMessage);
      setPayoffAmount(data.remainingOverdraft > 0 ? String(data.remainingOverdraft) : "");
    } catch (payoffError) {
      const errorMessage =
        payoffError.response?.data?.message || "Unable to pay off overdraft.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Overdraft"
          subtitle="Track and repay overdraft separately for each account."
        >
          <span className={`badge-pill capitalize ${getTierTone(tierPolicy?.label || user?.classification).badge}`}>
            {tierPolicy?.label || user?.classification || "Standard"} tier
          </span>
        </PageHeader>

        {message && <div className="alert-success">{message}</div>}
        {error && <div className="alert-error">{error}</div>}

        <div className="flex flex-wrap gap-2 rounded-2xl border border-bank-card-border bg-white p-3 shadow-sm">
            {overdraftTabs.map((tab) => {
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-bank-sidebar text-white shadow-sm hover:bg-bank-sidebar-hover"
                      : "text-slate-600 hover:bg-bank-surface hover:text-bank-eyebrow"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
        </div>

        {activeTab === "overview" && (
          <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <StatsCard
            title="Total OD Limit"
            value={formatCurrency(summary.overdraftLimit)}
            icon={Landmark}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
          />
          <StatsCard
            title="Total OD Used"
            value={formatCurrency(summary.overdraftUsed)}
            icon={CircleDollarSign}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
          />
          <StatsCard
            title="Total OD Available"
            value={formatCurrency(summary.availableOverdraft)}
            icon={Wallet}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
          />
          <StatsCard
            title="Selected Account Due"
            value={formatCurrency(totalDueNow)}
            icon={AlertTriangle}
            accent="bg-red-500"
            iconTone="bg-red-50 text-red-600"
            footer={{ text: `${interestRate || "No interest"} policy` }}
          />
        </div>

        <SectionCard
          title="Overdraft Due"
          subtitle="Select an account below, then repay the overdraft for that account."
          icon={CreditCard}
        >
          <div className="flex flex-col gap-4 rounded-xl border border-bank-card-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                {odAccount?.accountType || "Selected"} account due
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {formatCurrency(totalDueNow)}
              </p>
              <p className="mt-1 text-sm font-bold text-bank-accent">
                Selected: {odAccount?.accountType || "Account"} / {maskAccountNumber(odAccount?.accountNumber)}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Principal {formatCurrency(accountUsed)} + interest {formatCurrency(interest.interestAmount)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("usage")}
              disabled={accountUsed <= 0}
              className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              {accountUsed > 0 ? "Pay OD" : "No OD Due"}
            </button>
          </div>
        </SectionCard>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            Active OD accounts are shown first. Select an account card to update the due amount and repayment form.
          </div>
          {accountCards.map((account) => {
            const isSelected = account.accountNumber === odAccount?.accountNumber;
            const isBlocked = account.odBlocked;

            return (
              <button
                key={account.accountNumber}
                type="button"
                onClick={() => {
                  setOdAccountNumber(account.accountNumber);
                  setPaymentAccountNumber(account.accountNumber);
                  setPayoffAmount("");
                  setMessage("");
                  setError("");
                }}
                className={`rounded-xl border bg-white p-5 text-left shadow-sm transition ${
                  isSelected
                    ? "border-blue-300 ring-2 ring-blue-100"
                    : "border-slate-200 hover:border-blue-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">
                      {account.accountType} account
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">
                      {maskAccountNumber(account.accountNumber)}
                    </h2>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : isBlocked
                        ? "bg-red-50 text-red-700"
                        : account.used > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isSelected ? "Selected" : isBlocked ? "Blocked" : account.used > 0 ? "Active OD" : "Available"}
                  </span>
                </div>
                <div className="mt-5">
                  <RechartsHorizontalBar
                    rows={[
                      {
                        label: "OD Used",
                        value: account.used,
                        color:
                          account.percent >= 90
                            ? "#ef4444"
                            : account.percent >= 70
                              ? "#f59e0b"
                              : "#2563eb",
                      },
                      {
                        label: "Available",
                        value: account.available,
                        color: "#10b981",
                      },
                    ]}
                    valueFormatter={formatCurrency}
                    emptyMessage="No overdraft limit is available for this account."
                    height={120}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-500">Limit (₹)</p>
                    <p className="mt-1 font-bold">{formatCurrency(account.limit)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Used (₹)</p>
                    <p className="mt-1 font-bold">{formatCurrency(account.used)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Available (₹)</p>
                    <p className="mt-1 font-bold">{formatCurrency(account.available)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Uses (/month)</p>
                    <p className="mt-1 font-bold">
                      {account.odCountThisMonth || 0} / {account.monthlyOdUses}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
          </>
        )}

        {activeTab === "overview" && (
        <SectionCard
          id="tier-policy"
          title="Tier & Charges"
          subtitle="Current overdraft limits, usage allowance, interest, and penalty for the selected account."
          icon={ShieldCheck}
        >
          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold capitalize ${getTierTone(tierPolicy?.label || user?.classification).badge}`}>
                  {tierPolicy?.label || user?.classification || "Standard"} tier
                </span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  {odAccount?.accountType || "Selected"} account
                </span>
              </div>
              <p className="text-sm font-bold text-slate-950">
                OD {formatCurrency(accountLimit)}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              {[
                ["Per Transfer", formatCurrency(tierPolicy?.perTxnLimit || 0)],
                ["Daily", formatCurrency(tierPolicy?.dailyLimit || 0)],
                ["Monthly", formatCurrency(tierPolicy?.monthlyLimit || 0)],
                ["Uses", `${monthlyOdUses}/month`],
                ["Opening", formatCurrency(selectedOpeningBalance)],
                ["Interest", interestRate || "No interest"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-bank-surface p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-950">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
              {tierRules.map((rule) => {
                const isCurrentAccountType = rule.accountType === odAccount?.accountType;

                return (
                  <div
                    key={rule.accountType}
                    className={`rounded-lg border px-3 py-2 ${
                      isCurrentAccountType
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-950">{rule.accountType}</p>
                      {isCurrentAccountType && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-blue-700">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      OD {formatCurrency(rule.odLimit || 0)} | Opening{" "}
                      {formatCurrency(rule.minOpeningBalance || 0)} | {rule.monthlyOdUses || 3} uses/month
                    </p>
                  </div>
                );
              })}

              {tierRules.length === 0 && (
                <p className="rounded-lg bg-bank-surface p-3 text-sm font-semibold text-slate-500">
                  Tier policy rules are not available yet.
                </p>
              )}
            </div>

            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              Penalty: {formatCurrency(tierPolicy?.penaltyAmount || 0)}. Interest is estimated
              while overdraft is active.
            </p>
          </div>
        </SectionCard>
        )}

        {activeTab === "usage" && (
        <section>
          <SectionCard
            title={`${odAccount?.accountType || "Selected"} Account Payoff`}
            subtitle="Pay interest first, then reduce the selected account's OD principal"
            icon={CreditCard}
          >
            <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-800">
              You are repaying overdraft for{" "}
              <span className="font-black">
                {odAccount?.accountType || "Account"} / {maskAccountNumber(odAccount?.accountNumber)}
              </span>
              . Go back to Overview to choose a different OD account.
            </div>
            <div className="metric-grid">
              <MetricTile label="OD Limit" value={formatCurrency(accountLimit)} />
              <MetricTile
                label="OD Used"
                value={formatCurrency(accountUsed)}
                tone={accountUsed > 0 ? "warning" : "success"}
              />
              <MetricTile
                label="Available OD"
                value={formatCurrency(accountAvailable)}
                tone="success"
              />
              <MetricTile
                label="Usage Count"
                value={`${odAccount?.odCountThisMonth || 0} / ${monthlyOdUses}`}
                tone={(odAccount?.odCountThisMonth || 0) >= monthlyOdUses ? "danger" : "accent"}
              />
              <MetricTile
                label="Interest Due"
                value={formatCurrency(interest.interestAmount)}
                tone={accountUsed > 0 ? "warning" : "default"}
              />
              <MetricTile
                label="Total Due"
                value={formatCurrency(totalDueNow)}
                tone={accountUsed > 0 ? "danger" : "success"}
              />
            </div>

            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase text-blue-700">
                    Payoff Calculation
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Total payable = OD used + accrued interest
                  </p>
                </div>
                <div className="rounded-lg bg-white px-4 py-3 text-right shadow-sm ring-1 ring-blue-100">
                  <p className="text-xs font-bold uppercase text-slate-500">Total Due Today</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">
                    {formatCurrency(totalDueNow)}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-white p-4 ring-1 ring-blue-100">
                  <p className="text-xs font-bold uppercase text-slate-500">OD Principal</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {formatCurrency(accountUsed)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-4 ring-1 ring-blue-100">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Accrued Interest
                  </p>
                  <p className="mt-1 text-lg font-bold text-amber-700">
                    {formatCurrency(interest.interestAmount)}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-4 ring-1 ring-blue-100">
                  <p className="text-xs font-bold uppercase text-slate-500">Active Days</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">
                    {interest.interestDays} day{interest.interestDays === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-white p-4 text-sm font-semibold leading-6 text-slate-600 ring-1 ring-blue-100">
                Interest is calculated for each OD use separately. Same-day OD still counts as
                1 day. Payments clear interest first, then reduce OD principal.
              </div>

              {interest.drawdowns.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-lg bg-white ring-1 ring-blue-100">
                  {interest.drawdowns.map((entry, index) => (
                    <div
                      key={`${entry.usedAt || "od"}-${index}`}
                      className={`grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-4 ${
                        index === interest.drawdowns.length - 1
                          ? ""
                          : "border-b border-blue-100"
                      }`}
                    >
                      <span className="font-bold text-slate-950">
                        {formatCurrency(entry.amount)}
                      </span>
                      <span className="font-semibold text-slate-600">
                        {entry.interestDays} day{entry.interestDays === 1 ? "" : "s"}
                      </span>
                      <span className="font-semibold text-slate-600">
                        {interestRate || "monthly rate"} x {entry.interestDays}/30
                      </span>
                      <span className="font-bold text-amber-700 md:text-right">
                        {formatCurrency(entry.interestAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-bank-card-border bg-bank-surface p-5">
              <label className="label-field">
                <span>Pay From Account<RequiredMark /></span>
                <select
                  value={paymentAccount?.accountNumber || ""}
                  onChange={(event) => {
                    setPaymentAccountNumber(event.target.value);
                    setMessage("");
                    setError("");
                  }}
                  className="input-field"
                  disabled={isPaying || accountUsed <= 0}
                >
                  {accounts.map((account) => (
                    <option key={account.accountNumber} value={account.accountNumber}>
                      {account.accountType} - {maskAccountNumber(account.accountNumber)} -{" "}
                      {formatCurrency(account.balance || 0)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label-field mt-5">
                <span>Payment Amount<RequiredMark /></span>
                <input
                  type="number"
                  min="1"
                  max={totalDueNow || 0}
                  value={payoffAmount}
                  onChange={(event) => {
                    setPayoffAmount(event.target.value);
                    setMessage("");
                    setError("");
                  }}
                  placeholder={totalDueNow > 0 ? String(totalDueNow) : "0"}
                  className="input-field"
                  disabled={isPaying || accountUsed <= 0}
                />
              </label>

              {accountUsed > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => setPayoffAmount(String(totalDueNow))}
                    disabled={isPaying}
                  >
                    Full Due
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => setPayoffAmount(String(Math.round(totalDueNow / 2)))}
                    disabled={isPaying}
                  >
                    Half Due
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => setPayoffAmount(String(maxPayableAmount))}
                    disabled={isPaying || maxPayableAmount <= 0}
                  >
                    Max From Account
                  </button>
                </div>
              )}
            </div>

            <div className="metric-grid mt-5">
              <MetricTile
                label="Payment Clears Interest"
                value={formatCurrency(interestPaidEstimate)}
                tone={interestPaidEstimate > 0 ? "warning" : "default"}
              />
              <MetricTile
                label="Payment Reduces OD"
                value={formatCurrency(principalPaidEstimate)}
                tone={principalPaidEstimate > 0 ? "success" : "default"}
              />
              <MetricTile
                label="Remaining OD After Payment"
                value={formatCurrency(remainingAfterPayment)}
                tone={remainingAfterPayment > 0 ? "warning" : "success"}
              />
              <MetricTile
                label="Payment Account Balance"
                value={formatCurrency(paymentBalance)}
                tone="accent"
              />
            </div>

            <button
              type="button"
              onClick={handlePayOffOverdraft}
              disabled={accountUsed <= 0 || isPaying || !paymentAccount || hasInvalidPayoffAmount}
              className="btn-primary mt-6"
            >
              {isPaying ? "Paying..." : `Pay ${formatCurrency(effectivePayoffAmount || 0)}`}
            </button>
          </SectionCard>
        </section>
        )}

        {activeTab === "activity" && (
          <SectionCard
            title="Overdraft Activity"
            subtitle="Review selected-account OD drawdowns and account-level OD status."
            icon={AlertTriangle}
          >
            {interest.drawdowns.length === 0 ? (
              <div className="empty-state">
                No active overdraft drawdowns are recorded for the selected account.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-bank-card-border bg-white">
                {interest.drawdowns.map((entry, index) => (
                  <div
                    key={`${entry.usedAt || "od"}-${index}`}
                    className={`grid grid-cols-1 gap-3 px-4 py-4 text-sm md:grid-cols-4 ${
                      index === interest.drawdowns.length - 1
                        ? ""
                        : "border-b border-bank-card-border"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Drawdown</p>
                      <p className="mt-1 font-black text-slate-950">
                        {formatCurrency(entry.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Started</p>
                      <p className="mt-1 font-bold text-slate-700">
                        {entry.usedAt ? new Date(entry.usedAt).toLocaleDateString() : "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Active Days</p>
                      <p className="mt-1 font-bold text-slate-700">
                        {entry.interestDays} day{entry.interestDays === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Interest</p>
                      <p className="mt-1 font-black text-amber-700">
                        {formatCurrency(entry.interestAmount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {accountCards.map((account) => (
                <div
                  key={account.accountNumber}
                  className="rounded-xl border border-bank-card-border bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">
                        {account.accountType}
                      </p>
                      <p className="mt-1 font-black text-slate-950">
                        {maskAccountNumber(account.accountNumber)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        account.odBlocked
                          ? "bg-red-50 text-red-700"
                          : account.used > 0
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {account.odBlocked ? "Blocked" : account.used > 0 ? "Active OD" : "Clear"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <MetricTile label="Used" value={formatCurrency(account.used)} tone={account.used > 0 ? "warning" : "success"} />
                    <MetricTile label="Available" value={formatCurrency(account.available)} tone="success" />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default Overdraft;
