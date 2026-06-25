import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Landmark,
  Percent,
  PiggyBank,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet,
  X,
} from "lucide-react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import { useAuth } from "../../context/useAuth";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency } from "../../utils/format";
import { getCustomerAccounts } from "../../utils/overdraft";

const initialForm = {
  monthlyInstallmentAmount: "1000",
  tenureMonths: "12",
  startDate: new Date().toISOString().slice(0, 10),
  linkedAccountNumber: "",
};

const rdTenureOptions = [
  { label: "6 Months", value: "6" },
  { label: "1 Year", value: "12" },
  { label: "2 Years", value: "24" },
];

const installmentOptions = ["500", "1000", "5000"];
const PREMATURE_WITHDRAWAL_PENALTY_RATE = 0.01;

const statusStyles = {
  active: "bg-emerald-50 text-emerald-700",
  matured: "bg-blue-50 text-blue-700",
  closed: "bg-slate-100 text-slate-700",
  renewed: "bg-violet-50 text-violet-700",
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not set";

const addMonths = (dateValue, months) => {
  const date = new Date(dateValue || new Date());
  date.setMonth(date.getMonth() + Number(months || 0));
  return date;
};

const statusLabel = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getApplicableRate = (rateCards, tenureMonths) =>
  (rateCards || []).find(
    (rule) =>
      rule.productType === "rd" &&
      Number(tenureMonths || 0) >= Number(rule.minTenureMonths || 0) &&
      Number(tenureMonths || 0) <= Number(rule.maxTenureMonths || 0)
  );

const calculatePreview = (form, interestRate) => {
  const installment = Number(form.monthlyInstallmentAmount || 0);
  const months = Math.max(1, Number(form.tenureMonths || 1));
  const monthlyRate = Number(interestRate || 0) / 1200;
  const totalInvestment = installment * months;
  const maturityAmount =
    monthlyRate > 0
      ? Math.round(installment * (((1 + monthlyRate) ** months - 1) / monthlyRate))
      : totalInvestment;

  return {
    totalInvestment,
    maturityAmount,
    interestEarned: Math.max(0, maturityAmount - totalInvestment),
    maturityDate: addMonths(form.startDate, months),
  };
};

const PreviewMetric = ({ label, value, tone = "default" }) => {
  const toneStyles = {
    default: "border-slate-200 bg-white text-slate-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneStyles[tone] || toneStyles.default}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-base font-extrabold leading-snug">{value}</p>
    </div>
  );
};

const buildRdWithdrawalPreview = (rd) => {
  const accumulatedAmount = Number(
    rd.accumulatedValue ||
      Number(rd.monthlyInstallmentAmount || 0) * Number(rd.installmentsPaid || 0)
  );
  const prematurePenalty = Math.round(accumulatedAmount * PREMATURE_WITHDRAWAL_PENALTY_RATE);
  const accruedPenalty = Number(rd.penaltyAccrued || 0);

  return {
    rd,
    accumulatedAmount,
    prematurePenalty,
    accruedPenalty,
    totalPenalty: prematurePenalty + accruedPenalty,
    payoutAmount: Math.max(0, accumulatedAmount - prematurePenalty - accruedPenalty),
  };
};

const RecurringDeposits = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [recurringDeposits, setRecurringDeposits] = useState([]);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [calculatedPreview, setCalculatedPreview] = useState(null);
  const [withdrawalPreview, setWithdrawalPreview] = useState(null);

  const customerAccounts = getCustomerAccounts(user);
  const defaultAccountNumber = customerAccounts[0]?.accountNumber || "";
  const selectedLinkedAccountNumber = form.linkedAccountNumber || defaultAccountNumber;

  const loadRecurringDeposits = useCallback(() =>
    api
      .get("/recurring-deposits")
      .then(({ data }) => setRecurringDeposits(data.recurringDeposits || []))
      .catch(() => toast.error("Unable to load recurring deposits.")), [toast]);

  const loadApprovalRequests = useCallback(() =>
    api
      .get("/deposit-approvals")
      .then(({ data }) =>
        setApprovalRequests((data.requests || []).filter((request) => request.productType === "rd"))
      )
      .catch(() => setApprovalRequests([])), []);

  useEffect(() => {
    loadRecurringDeposits();
    loadApprovalRequests();
    api
      .get("/fixed-deposits/rates")
      .then(({ data }) => setRateCards(data.rateCards || []))
      .catch(() => toast.error("Unable to load deposit rates."));
  }, [loadApprovalRequests, loadRecurringDeposits, toast]);

  const applicableRate = useMemo(
    () => getApplicableRate(rateCards, form.tenureMonths),
    [rateCards, form.tenureMonths]
  );
  const minimumInstallmentAmount = Number(applicableRate?.minAmount || 500);
  const availableInstallmentOptions = useMemo(
    () =>
      [...new Set([String(minimumInstallmentAmount), form.monthlyInstallmentAmount, ...installmentOptions])]
        .map((amount) => Number(amount))
        .filter((amount) => amount > 0)
        .sort((left, right) => left - right),
    [form.monthlyInstallmentAmount, minimumInstallmentAmount]
  );
  const preview = useMemo(
    () => calculatePreview(form, applicableRate?.annualInterestRate),
    [applicableRate?.annualInterestRate, form]
  );
  const selectedTenureLabel =
    rdTenureOptions.find((option) => option.value === form.tenureMonths)?.label || `${form.tenureMonths} months`;

  const activeRds = recurringDeposits.filter((rd) => rd.status === "active");
  const monthlyCommitment = activeRds.reduce(
    (sum, rd) => sum + Number(rd.monthlyInstallmentAmount || 0),
    0
  );
  const totalInvested = recurringDeposits.reduce(
    (sum, rd) => sum + Number(rd.monthlyInstallmentAmount || 0) * Number(rd.installmentsPaid || 0),
    0
  );
  const accumulatedValue = recurringDeposits.reduce(
    (sum, rd) => sum + Number(rd.accumulatedValue || 0),
    0
  );
  const missedInstallments = recurringDeposits.reduce(
    (sum, rd) => sum + Number(rd.missedInstallments || 0),
    0
  );

  const filteredRecurringDeposits = useMemo(() => {
    const searchText = query.trim().toLowerCase();

    return recurringDeposits.filter((rd) => {
      const matchesSearch = !searchText ||
        [rd.rdNumber, rd.bankName, rd.linkedAccountNumber]
          .join(" ")
          .toLowerCase()
          .includes(searchText);
      const matchesStatus = !statusFilter || rd.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [recurringDeposits, query, statusFilter]);
  const pagination = usePaginatedRows(filteredRecurringDeposits);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setCalculatedPreview(null);
  };

  const calculateRecurringDepositPreview = () => {
    if (Number(form.monthlyInstallmentAmount || 0) < minimumInstallmentAmount) {
      toast.warning(`Minimum RD installment is Rs. ${minimumInstallmentAmount.toLocaleString("en-IN")}.`);
      return;
    }

    setCalculatedPreview(preview);
    toast.success("RD maturity calculated.");
  };

  const createRecurringDeposit = async (event) => {
    event.preventDefault();

    if (Number(form.monthlyInstallmentAmount || 0) < minimumInstallmentAmount) {
      toast.warning(`Minimum RD installment is Rs. ${minimumInstallmentAmount.toLocaleString("en-IN")}.`);
      return;
    }

    if (!calculatedPreview) {
      toast.warning("Calculate RD maturity before creating the deposit.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/recurring-deposits", {
        ...form,
        linkedAccountNumber: selectedLinkedAccountNumber,
      });
      toast.success("RD request submitted for manager approval.");
      setForm((current) => ({
        ...initialForm,
        linkedAccountNumber: current.linkedAccountNumber || defaultAccountNumber,
      }));
      setCalculatedPreview(null);
      await loadRecurringDeposits();
      await loadApprovalRequests();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to create RD.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const runRdAction = async (rd, path, successMessage) => {
    setWorkingId(`${rd.id}:${path}`);
    try {
      const { data } = await api.post(`/recurring-deposits/${rd.id}/${path}`);
      toast.success(path === "premature-withdrawal" ? "RD withdrawal request submitted for manager approval." : data.message || successMessage);
      await loadRecurringDeposits();
      await loadApprovalRequests();
      if (path === "premature-withdrawal") {
        setWithdrawalPreview(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || successMessage || "Unable to update RD.");
    } finally {
      setWorkingId("");
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Customer / Recurring Deposits"
          title="My Recurring Deposits"
          subtitle="Create RDs, track monthly auto-debits, installment progress, maturity value, and closure actions."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <StatsCard
            title="Monthly Commitment"
            value={formatCurrency(monthlyCommitment)}
            icon={Wallet}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: `${activeRds.length} active`, tone: "success" }}
          />
          <StatsCard
            title="Total Invested"
            value={formatCurrency(totalInvested)}
            icon={PiggyBank}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
          />
          <StatsCard
            title="Accumulated Value"
            value={formatCurrency(accumulatedValue)}
            icon={Percent}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
          />
          <StatsCard
            title="Missed Installments"
            value={missedInstallments}
            icon={CalendarClock}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: "Penalty is recorded when auto-debit fails" }}
          />
        </div>

        {approvalRequests.filter((request) => request.status === "pending").length > 0 && (
          <SectionCard
            title="Pending RD Approvals"
            subtitle="These requests are waiting for manager review. The first installment is debited only after approval."
            icon={CalendarClock}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {approvalRequests
                .filter((request) => request.status === "pending")
                .map((request) => (
                  <div key={request.id} className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">{request.id}</p>
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                          {statusLabel(request.actionType)}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700">
                        Pending
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      {request.actionType === "create"
                        ? `${formatCurrency(request.amount)} monthly for ${request.payload?.tenureMonths || "-"} months`
                        : `${request.depositNumber} payout ${formatCurrency(request.amount)}`}
                    </p>
                  </div>
                ))}
            </div>
          </SectionCard>
        )}

        <section className="grid grid-cols-1 gap-6 min-[1900px]:grid-cols-[minmax(520px,0.9fr)_minmax(680px,1.1fr)]">
          <SectionCard
            title="Create Recurring Deposit"
            subtitle="Select monthly installment and tenure, then review maturity details before saving."
            icon={PiggyBank}
          >
            <form onSubmit={createRecurringDeposit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="label-field">
                <span>Monthly Installment (₹)</span>
                <select
                  value={form.monthlyInstallmentAmount}
                  onChange={(event) => updateForm("monthlyInstallmentAmount", event.target.value)}
                  className="input-field"
                >
                  {availableInstallmentOptions.map((amount) => (
                    <option key={amount} value={amount}>
                      {formatCurrency(amount)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="label-field">
                <span>Tenure</span>
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-bank-card-border bg-bank-surface p-1">
                  {rdTenureOptions.map((option) => {
                    const isSelected = option.value === form.tenureMonths;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateForm("tenureMonths", option.value)}
                        className={`min-h-10 rounded-md px-2 text-sm font-bold transition ${
                          isSelected
                            ? "bg-white text-bank-eyebrow shadow-sm"
                            : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="label-field">
                <span>Linked Account</span>
                <select
                  value={selectedLinkedAccountNumber}
                  onChange={(event) => updateForm("linkedAccountNumber", event.target.value)}
                  className="input-field"
                >
                  {customerAccounts.length === 0 && <option value="">Default account</option>}
                  {customerAccounts.map((account) => (
                    <option key={account.accountNumber} value={account.accountNumber}>
                      {account.accountType || "Account"} / {account.accountNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label-field">
                <span>Start Date</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => updateForm("startDate", event.target.value)}
                  className="input-field"
                />
              </label>

              <label className="label-field md:col-span-2">
                <span>Applicable Interest Rate (% p.a.)</span>
                <input
                  type="number"
                  value={applicableRate?.annualInterestRate ?? ""}
                  disabled
                  className="input-field disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                />
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {applicableRate
                    ? `${applicableRate.label} from configured RD rates`
                    : "No configured RD rate matched this tenure."}
                </p>
              </label>

              <div className="md:col-span-2 rounded-lg border border-bank-card-border bg-bank-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-bank-eyebrow">Current RD terms</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {selectedTenureLabel} at {applicableRate?.annualInterestRate ?? "0"}% p.a. | Minimum {formatCurrency(minimumInstallmentAmount)}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    calculatedPreview ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500"
                  }`}>
                    {calculatedPreview ? "Calculated" : "Calculation pending"}
                  </span>
                </div>
              </div>

              <div className={`md:col-span-2 rounded-lg border p-4 ${
                calculatedPreview
                  ? "border-blue-100 bg-blue-50"
                  : "border-dashed border-slate-300 bg-slate-50"
              }`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-950">Maturity Preview</p>
                    <p className="text-xs font-semibold text-slate-500">Installment total, interest, and maturity date</p>
                  </div>
                  <Calculator size={18} className={calculatedPreview ? "text-bank-eyebrow" : "text-slate-400"} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PreviewMetric
                    label="Total Investment"
                    value={calculatedPreview ? formatCurrency(calculatedPreview.totalInvestment) : "Calculate first"}
                    tone="info"
                  />
                  <PreviewMetric
                    label="Maturity Amount"
                    value={calculatedPreview ? formatCurrency(calculatedPreview.maturityAmount) : "Calculate first"}
                    tone="success"
                  />
                  <PreviewMetric
                    label="Interest Earned"
                    value={calculatedPreview ? formatCurrency(calculatedPreview.interestEarned) : "Calculate first"}
                  />
                  <PreviewMetric
                    label="Maturity Date"
                    value={calculatedPreview ? formatDate(calculatedPreview.maturityDate) : "Calculate first"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:col-span-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={calculateRecurringDepositPreview}
                  className="btn-secondary justify-center"
                >
                  <Calculator size={18} />
                  Calculate RD
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !calculatedPreview}
                  className="btn-primary justify-center"
                >
                  <CheckCircle2 size={18} />
                  {isSubmitting ? "Creating..." : "Create RD"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="RD Portfolio"
            subtitle="Review RD progress, accumulated value, maturity status, and available actions."
            icon={Landmark}
          >
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="input-field pl-10"
                  placeholder="Search RD or linked account"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="input-field"
              >
                <option value="">All status</option>
                <option value="active">Active</option>
                <option value="matured">Matured</option>
                <option value="closed">Closed</option>
                <option value="renewed">Renewed</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-bank-card-border bg-white">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">RD</th>
                    <th className="px-4 py-3">Installment (₹)</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Value (₹)</th>
                    <th className="px-4 py-3">Maturity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageRows.map((rd) => {
                    const progressPercent = rd.tenureMonths
                      ? Math.round((Number(rd.installmentsPaid || 0) / Number(rd.tenureMonths)) * 100)
                      : 0;

                    return (
                      <tr key={rd.id} className="table-row">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{rd.rdNumber}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {rd.bankName} / {rd.linkedAccountNumber || "Linked account"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{formatCurrency(rd.monthlyInstallmentAmount)}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{rd.interestRate}% p.a.</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {rd.installmentsPaid || 0}/{rd.tenureMonths} paid
                          </p>
                          <div className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-bank-accent"
                              style={{ width: `${Math.min(100, progressPercent)}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs font-semibold text-amber-700">
                            {rd.missedInstallments || 0} missed
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{formatCurrency(rd.accumulatedValue)}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Penalty {formatCurrency(rd.penaltyAccrued)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{formatDate(rd.maturityDate)}</p>
                          <p className="mt-1 text-xs font-semibold text-emerald-700">
                            {formatCurrency(rd.maturityAmount)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[rd.status] || statusStyles.active}`}>
                            {statusLabel(rd.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {rd.status === "active" && (
                              <>
                                <button
                                  type="button"
                                  disabled={workingId === `${rd.id}:installments/auto-debit`}
                                  onClick={() => runRdAction(rd, "installments/auto-debit", "Installment updated")}
                                  className="btn-secondary px-3 py-2 text-xs"
                                >
                                  <CreditCard size={14} />
                                  Auto-Debit
                                </button>
                                <button
                                  type="button"
                                  disabled={workingId === `${rd.id}:premature-withdrawal`}
                                  onClick={() => setWithdrawalPreview(buildRdWithdrawalPreview(rd))}
                                  className="btn-danger-soft px-3 py-2 text-xs"
                                >
                                  <RotateCcw size={14} />
                                  Withdraw
                                </button>
                              </>
                            )}
                            {rd.status === "matured" && (
                              <>
                                <button
                                  type="button"
                                  disabled={workingId === `${rd.id}:renew`}
                                  onClick={() => runRdAction(rd, "renew", "RD Renewed")}
                                  className="btn-secondary px-3 py-2 text-xs"
                                >
                                  <RefreshCw size={14} />
                                  Renew
                                </button>
                                <button
                                  type="button"
                                  disabled={workingId === `${rd.id}:payout`}
                                  onClick={() => runRdAction(rd, "payout", "Maturity Amount Credited")}
                                  className="btn-primary px-3 py-2 text-xs"
                                >
                                  <CheckCircle2 size={14} />
                                  Payout
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRecurringDeposits.length === 0 && (
              <div className="mt-4">
                <EmptyState message="No recurring deposits found for the current filters." />
              </div>
            )}
            <TablePagination {...pagination} />
          </SectionCard>
        </section>

        {withdrawalPreview && (
          <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center sm:p-4">
            <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)]">
              <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">Premature RD Withdrawal</h3>
                    <p className="mt-1 text-sm font-semibold text-amber-800">
                      Penalties will be deducted before the accumulated value is paid out.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWithdrawalPreview(null)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-800"
                  aria-label="Close withdrawal warning"
                >
                  <X size={18} />
                </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                <div className="rounded-lg border border-bank-card-border bg-bank-surface px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-bank-eyebrow">
                    {withdrawalPreview.rd.rdNumber}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {withdrawalPreview.rd.installmentsPaid || 0}/{withdrawalPreview.rd.tenureMonths} installments paid.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <PreviewMetric
                    label="Accumulated Value"
                    value={formatCurrency(withdrawalPreview.accumulatedAmount)}
                    tone="info"
                  />
                  <PreviewMetric
                    label="Premature Penalty"
                    value={`- ${formatCurrency(withdrawalPreview.prematurePenalty)}`}
                  />
                  <PreviewMetric
                    label="Existing Penalties"
                    value={`- ${formatCurrency(withdrawalPreview.accruedPenalty)}`}
                  />
                  <PreviewMetric
                    label="Estimated Payout"
                    value={formatCurrency(withdrawalPreview.payoutAmount)}
                    tone="success"
                  />
                </div>

                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  This will close the RD immediately. Missed-installment penalties and premature withdrawal penalty are deducted from the payout.
                </p>
              </div>

              <div className="shrink-0 border-t border-bank-card-border bg-white p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setWithdrawalPreview(null)}
                    className="btn-secondary justify-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={workingId === `${withdrawalPreview.rd.id}:premature-withdrawal`}
                    onClick={() => runRdAction(withdrawalPreview.rd, "premature-withdrawal", "RD withdrawn")}
                    className="btn-danger-soft justify-center"
                  >
                    <AlertTriangle size={18} />
                    Confirm Withdrawal
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default RecurringDeposits;
