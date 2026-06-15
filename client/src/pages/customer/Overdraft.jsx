import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Wallet,
} from "lucide-react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { useToast } from "../../components/ui/useToast";
import { useAuth } from "../../context/useAuth";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency, maskAccountNumber } from "../../utils/format";
import { getCustomerAccounts, getCustomerOverdraftSummary } from "../../utils/overdraft";
import { getTierTone } from "../../utils/ui";

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

  if (amount <= 0 || rate <= 0) {
    return { interestAmount: 0, interestDays: amount > 0 ? getInterestDays(startedAt) : 0 };
  }

  const interestDays = getInterestDays(startedAt);

  return {
    interestAmount: Math.ceil(amount * rate * (interestDays / 30)),
    interestDays,
  };
};

const getAccountRule = (policy, accountType) =>
  (policy?.accountTypeOdRules || []).find((rule) => rule.accountType === accountType);

const Overdraft = () => {
  const toast = useToast();
  const { setSessionUser, user } = useAuth();
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
  const accountLimit = Number(odAccount?.overdraftLimit || accountRule?.odLimit || 0);
  const accountUsed = Number(odAccount?.overdraftUsed || 0);
  const accountAvailable = Math.max(0, accountLimit - accountUsed);
  const monthlyOdUses = Number(accountRule?.monthlyOdUses ?? odAccount?.odMonthlyUseLimit ?? 3);
  const interest = calculateInterest(accountUsed, interestRate, odAccount?.odStartedAt);
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

  const accountCards = accounts.map((account) => {
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

        <div className="stat-grid-4">
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

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                      isBlocked
                        ? "bg-red-50 text-red-700"
                        : account.used > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isBlocked ? "Blocked" : account.used > 0 ? "Active OD" : "Available"}
                  </span>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      account.percent >= 90
                        ? "bg-red-500"
                        : account.percent >= 70
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                    style={{
                      width:
                        account.percent > 0
                          ? `${Math.max(4, Math.min(100, account.percent))}%`
                          : "0%",
                    }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-500">Limit</p>
                    <p className="mt-1 font-bold">{formatCurrency(account.limit)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Used</p>
                    <p className="mt-1 font-bold">{formatCurrency(account.used)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Available</p>
                    <p className="mt-1 font-bold">{formatCurrency(account.available)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Uses</p>
                    <p className="mt-1 font-bold">
                      {account.odCountThisMonth || 0} / {account.monthlyOdUses}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="section-split">
          <SectionCard
            className="section-split-main"
            title={`${odAccount?.accountType || "Selected"} Account Payoff`}
            subtitle="Pay interest first, then reduce the selected account's OD principal"
            icon={CreditCard}
          >
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

            <div className="mt-6 rounded-xl border border-bank-card-border bg-bank-surface p-5">
              <label className="label-field">
                Pay From Account
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
                Payment Amount
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

          <SectionCard title="Policy Notes" subtitle="Account-specific overdraft rules" icon={AlertTriangle}>
            <div className="space-y-3 text-sm font-semibold text-slate-600">
              <p>
                The selected {odAccount?.accountType || "account"} account has its own OD limit,
                usage counter, blocked status, and payoff balance.
              </p>
              <p>
                Monthly OD usage resets at the start of each month. Interest is charged for at
                least 1 day whenever OD is used.
              </p>
              <p>
                Your other accounts keep their own separate OD availability and usage count.
              </p>
            </div>
          </SectionCard>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default Overdraft;
