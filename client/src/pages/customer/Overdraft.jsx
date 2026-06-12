import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
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
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";
import { formatCurrency } from "../../utils/format";
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

const Overdraft = () => {
  const GRACE_PERIOD_DAYS = 3;
  const OVERDRAFT_DUE_RULE = "Due before month-end";
  const toast = useToast();
  const { setSessionUser, user } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [payoffAmount, setPayoffAmount] = useState("");
  const [tierPolicy, setTierPolicy] = useState(null);
  const { overdraftLimit, overdraftUsed, availableOverdraft, odUsageCount } =
    getCustomerOverdraftSummary(user);
  const usedPercentage =
    overdraftLimit > 0 ? Math.round((overdraftUsed / overdraftLimit) * 100) : 0;
  const hasUsedOverdraft = overdraftUsed > 0;

  const accounts = getCustomerAccounts(user);
  const [payoffAccountNumber, setPayoffAccountNumber] = useState(
    accounts[0]?.accountNumber || ""
  );

  useEffect(() => {
    api.get("/tiers/policy").then(({ data }) => {
      setTierPolicy(data.tier);
    });
  }, []);

  const policy = tierPolicy || {
    label: user?.classification || "Standard",
    maxODLimit: overdraftLimit,
    gracePeriodDays: GRACE_PERIOD_DAYS,
    overdraftDueRule: OVERDRAFT_DUE_RULE,
    penaltyAmount: 0,
    interestRate: "",
  };

  const selectedPayoffAccountNumber =
    payoffAccountNumber || accounts[0]?.accountNumber || "";
  const selectedPayoffAccount = accounts.find(
    (account) => account.accountNumber === selectedPayoffAccountNumber
  );
  const selectedAccountBalance = Number(selectedPayoffAccount?.balance || 0);
  const activeOdStartedAt =
    accounts.find((account) => Number(account.overdraftUsed || 0) > 0 && account.odStartedAt)?.odStartedAt ||
    accounts.find((account) => account.odStartedAt)?.odStartedAt ||
    user?.account?.odStartedAt;
  const estimatedInterest = calculateInterest(
    overdraftUsed,
    policy.interestRate || policy.lateFeeRate,
    activeOdStartedAt
  );
  const totalDueNow = overdraftUsed + estimatedInterest.interestAmount;
  const effectivePayoffAmount = Number(payoffAmount || totalDueNow);
  const maxPayableAmount = Math.min(totalDueNow, selectedAccountBalance);
  const interestPaidEstimate = Math.min(effectivePayoffAmount, estimatedInterest.interestAmount);
  const principalPaidEstimate = Math.max(0, effectivePayoffAmount - interestPaidEstimate);
  const remainingAfterPayment = Math.max(0, overdraftUsed - principalPaidEstimate);
  const balanceAfterPayment = Math.max(0, selectedAccountBalance - effectivePayoffAmount);
  const hasInvalidPayoffAmount =
    effectivePayoffAmount < 1 ||
    effectivePayoffAmount > totalDueNow ||
    effectivePayoffAmount > selectedAccountBalance;

  const setQuickPayoffAmount = (amount) => {
    setMessage("");
    setError("");
    setPayoffAmount(String(Math.max(0, Math.round(amount))));
  };

  const handlePayOffOverdraft = async () => {
    setMessage("");
    setError("");

    if (overdraftUsed <= 0) {
      const errorMessage = "No overdraft amount is currently due.";
      setError(errorMessage);
      toast.info(errorMessage);
      return;
    }

    if (!effectivePayoffAmount || effectivePayoffAmount < 1) {
      const errorMessage = "Enter a payoff amount greater than zero.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    if (effectivePayoffAmount > totalDueNow) {
      const errorMessage = "Payoff amount cannot be greater than the overdraft due with interest.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    if (effectivePayoffAmount > selectedAccountBalance) {
      const errorMessage = "Selected account does not have enough balance for this payment.";
      setError(errorMessage);
      toast.warning(errorMessage);
      return;
    }

    try {
      setIsPaying(true);

      const { data } = await api.post("/overdraft/payoff", {
        accountNumber: selectedPayoffAccountNumber,
        amount: effectivePayoffAmount,
      });

      setSessionUser({
        ...user,
        account: data.account,
        accounts: data.accounts,
      });
      const successMessage = `${formatCurrency(data.paidAmount)} paid toward overdraft, including ${formatCurrency(data.interestPaid || 0)} interest.`;
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

  const eligibilityStatus = useMemo(() => {
    if (availableOverdraft <= 0) {
      return {
        label: "Limit Exhausted",
        className: "badge-pill bg-red-50 text-red-700",
      };
    }

    return {
      label: "Eligible",
      className: "badge-pill bg-emerald-50 text-emerald-700",
    };
  }, [availableOverdraft]);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Overdraft"
          subtitle="Your overdraft limit is assigned by admin based on customer classification."
        >
          <span className={`badge-pill capitalize ${getTierTone(policy.label).badge}`}>
            {policy.label} tier
          </span>
          <span className={eligibilityStatus.className}>{eligibilityStatus.label}</span>
        </PageHeader>

        {message && <div className="alert-success">{message}</div>}
        {error && <div className="alert-error">{error}</div>}

        <div className="stat-grid-4">
          <StatsCard
            title="Initial Overdraft"
            value={formatCurrency(overdraftLimit)}
            icon={Landmark}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: `${policy.label} tier`, tone: "neutral" }}
          />
          <StatsCard
            title="Used Overdraft"
            value={formatCurrency(overdraftUsed)}
            icon={CircleDollarSign}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            badge={{
              text: `${usedPercentage}% utilized`,
              tone: usedPercentage > 75 ? "danger" : usedPercentage > 0 ? "warning" : "success",
            }}
          />
          <StatsCard
            title="Available Overdraft"
            value={formatCurrency(availableOverdraft)}
            icon={Wallet}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            badge={{
              text: eligibilityStatus.label,
              tone: availableOverdraft > 0 ? "success" : "danger",
            }}
          />
          <StatsCard
            title="Grace Window"
            value={`${policy.gracePeriodDays || GRACE_PERIOD_DAYS} days`}
            icon={AlertTriangle}
            accent="bg-red-500"
            iconTone="bg-red-50 text-red-600"
            footer={{ text: `${formatCurrency(policy.penaltyAmount || 0)} penalty after grace` }}
          />
        </div>

        <section className="section-split">
          <SectionCard
            className="section-split-main"
            title="Overdraft Utilization"
            subtitle={`${policy.label} customer - limit assigned from your classification tier`}
            icon={CircleDollarSign}
          >
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
              <div
                className="h-full rounded-full bg-bank-accent transition-all"
                style={{ width: `${Math.min(usedPercentage, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {usedPercentage}% of {formatCurrency(overdraftLimit)} used
            </p>

            <div className="metric-grid mt-6">
              <MetricTile label="Due Rule" value={policy.overdraftDueRule || OVERDRAFT_DUE_RULE} />
              <MetricTile
                label="Interest Rate"
                value={policy.interestRate || policy.lateFeeRate || "Not set"}
                tone="accent"
              />
              <MetricTile
                label="Outstanding Due"
                value={formatCurrency(totalDueNow)}
                tone={hasUsedOverdraft ? "warning" : "success"}
              />
              <MetricTile
                label="Interest Due"
                value={formatCurrency(estimatedInterest.interestAmount)}
                tone={hasUsedOverdraft ? "warning" : "default"}
              />
              <MetricTile
                label="Penalty After Grace"
                value={formatCurrency(policy.penaltyAmount || 0)}
                tone={hasUsedOverdraft ? "danger" : "default"}
              />
              <MetricTile
                label="Selected Account Balance"
                value={formatCurrency(selectedPayoffAccount?.balance || 0)}
                tone="accent"
              />
            </div>

            <div className="mt-6 rounded-xl border border-bank-card-border bg-bank-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Amount due now</p>
                  <p className="mt-1 text-3xl font-bold text-slate-900">
                    {formatCurrency(totalDueNow)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Principal {formatCurrency(overdraftUsed)} + interest{" "}
                    {formatCurrency(estimatedInterest.interestAmount)} for minimum{" "}
                    {estimatedInterest.interestDays} day{estimatedInterest.interestDays === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="badge-pill bg-white text-bank-eyebrow ring-1 ring-bank-card-border">
                  Clear before month-end
                </span>
              </div>

              <label className="label-field mt-5">
                Pay From Account
                <select
                  value={selectedPayoffAccountNumber}
                  onChange={(event) => {
                    setPayoffAccountNumber(event.target.value);
                    setMessage("");
                    setError("");
                  }}
                  className="input-field"
                  disabled={isPaying || overdraftUsed <= 0}
                >
                  {accounts.map((accountItem) => (
                    <option key={accountItem.accountNumber} value={accountItem.accountNumber}>
                      {accountItem.accountType} - {accountItem.accountNumber} -{" "}
                      {formatCurrency(accountItem.balance || 0)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label-field mt-5">
                Payment Amount Including Interest
                <input
                  type="number"
                  min="1"
                  max={totalDueNow || 0}
                  step="1"
                  value={payoffAmount}
                  onChange={(event) => {
                    setPayoffAmount(event.target.value);
                    setMessage("");
                    setError("");
                  }}
                  placeholder={totalDueNow > 0 ? String(totalDueNow) : "0"}
                  className="input-field"
                  disabled={isPaying || overdraftUsed <= 0}
                />
              </label>

              {hasUsedOverdraft && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => setQuickPayoffAmount(totalDueNow)}
                    disabled={isPaying}
                  >
                    Full Due
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => setQuickPayoffAmount(totalDueNow / 2)}
                    disabled={isPaying}
                  >
                    Half Due
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-4 py-2"
                    onClick={() => setQuickPayoffAmount(maxPayableAmount)}
                    disabled={isPaying || maxPayableAmount <= 0}
                  >
                    Max From Account
                  </button>
                </div>
              )}

              <div className="metric-grid mt-5">
                <MetricTile
                  label="Remaining Principal After Payment"
                  value={formatCurrency(remainingAfterPayment)}
                  tone={remainingAfterPayment > 0 ? "warning" : "success"}
                />
                <MetricTile
                  label="Account Balance After"
                  value={formatCurrency(balanceAfterPayment)}
                  tone={effectivePayoffAmount > selectedAccountBalance ? "danger" : "accent"}
                />
              </div>

              {effectivePayoffAmount > selectedAccountBalance && (
                <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  This account can pay up to {formatCurrency(maxPayableAmount)} right now.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handlePayOffOverdraft}
              disabled={
                overdraftUsed <= 0 ||
                isPaying ||
                !selectedPayoffAccountNumber ||
                hasInvalidPayoffAmount
              }
              className="btn-primary mt-6"
            >
              {isPaying ? "Paying..." : `Pay ${formatCurrency(effectivePayoffAmount || 0)}`}
            </button>
          </SectionCard>

          <SectionCard title="Overdraft Timeline" subtitle="Avoid penalties by clearing before month-end" icon={AlertTriangle}>
            <div className="metric-grid">
              <MetricTile
                label="Grace Window"
                value={`${policy.gracePeriodDays || GRACE_PERIOD_DAYS} days`}
                tone="accent"
              />
              <MetricTile
                label="OD Usage Count"
                value={`${odUsageCount} / 3`}
                tone={odUsageCount >= 3 ? "danger" : odUsageCount > 0 ? "warning" : "success"}
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Monthly overdraft usage resets at the start of each month.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              OD interest is charged for a minimum of 1 day on every usage. Used overdraft should be cleared before month-end. The fixed grace window starts after month-end.
            </p>
            <div
              className={`mt-4 rounded-xl border p-5 ${
                hasUsedOverdraft
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <p className="text-sm font-semibold">
                {hasUsedOverdraft ? "Penalty After Grace" : "No Active Overdraft Due"}
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(policy.penaltyAmount || 0)}
              </p>
              <p className="mt-1 text-sm opacity-90">
                {hasUsedOverdraft
                  ? "Penalty applies only if used overdraft remains unpaid after month-end and the grace window."
                  : "Penalty applies only after month-end plus grace when overdraft remains unpaid."}
              </p>
            </div>
          </SectionCard>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default Overdraft;
