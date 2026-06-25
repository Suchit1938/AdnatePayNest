import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Landmark,
  Percent,
  PiggyBank,
  Plus,
  Search,
  X,
} from "lucide-react";

import api from "../api/axios";
import StatsCard from "../components/dashboard/StatsCard";
import EmptyState from "../components/ui/EmptyState";
import PageContent from "../components/ui/PageContent";
import PageHeader from "../components/ui/PageHeader";
import SectionCard from "../components/ui/SectionCard";
import TablePagination from "../components/ui/TablePagination";
import { useToast } from "../components/ui/useToast";
import usePaginatedRows from "../components/ui/usePaginatedRows";
import { useAuth } from "../context/useAuth";
import DashboardLayout from "../layouts/DashboardLayout";
import { formatCurrency } from "../utils/format";

const initialForm = {
  customerId: "",
  bankName: "Adnate Bank",
  depositAmount: "100000",
  interestRate: "",
  tenureMonths: "12",
  startDate: new Date().toISOString().slice(0, 10),
  linkedAccountNumber: "",
  nomineeName: "",
  notes: "",
};

const fdTenureOptions = [
  { label: "1 Year", value: "12" },
  { label: "2 Years", value: "24" },
  { label: "5 Years", value: "60" },
];

const PREMATURE_WITHDRAWAL_PENALTY_RATE = 0.01;

const depositRateTemplates = [
  { productType: "fd", label: "FD 1 Year", minTenureMonths: 12, maxTenureMonths: 12, annualInterestRate: 7, minAmount: 1000 },
  { productType: "fd", label: "FD 2 Years", minTenureMonths: 24, maxTenureMonths: 24, annualInterestRate: 7.25, minAmount: 1000 },
  { productType: "fd", label: "FD 5 Years", minTenureMonths: 60, maxTenureMonths: 60, annualInterestRate: 7.75, minAmount: 1000 },
  { productType: "rd", label: "RD 6 Months", minTenureMonths: 6, maxTenureMonths: 6, annualInterestRate: 6.25, minAmount: 500 },
  { productType: "rd", label: "RD 1 Year", minTenureMonths: 12, maxTenureMonths: 12, annualInterestRate: 6.75, minAmount: 500 },
  { productType: "rd", label: "RD 2 Years", minTenureMonths: 24, maxTenureMonths: 24, annualInterestRate: 7.25, minAmount: 500 },
];

const normalizeAllowedRateCards = (cards = []) =>
  depositRateTemplates.map((template) => {
    const existing = cards.find(
      (card) =>
        card.productType === template.productType &&
        Number(card.minTenureMonths) === template.minTenureMonths
    );

    return {
      ...template,
      annualInterestRate: existing?.annualInterestRate ?? template.annualInterestRate,
      minAmount: existing?.minAmount ?? template.minAmount,
    };
  });

const statusStyles = {
  active: "bg-emerald-50 text-emerald-700",
  matured: "bg-blue-50 text-blue-700",
  closed: "bg-slate-100 text-slate-700",
  renewed: "bg-violet-50 text-violet-700",
};

const statusLabel = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

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

const calculatePreview = (form) => {
  const principal = Number(form.depositAmount || 0);
  const annualRate = Number(form.interestRate || 0) / 100;
  const tenureMonths = Math.max(1, Number(form.tenureMonths || 1));
  const years = tenureMonths / 12;
  const compoundingFrequency = 4;
  const maturityAmount = Math.round(
    principal * (1 + annualRate / compoundingFrequency) ** (compoundingFrequency * years)
  );

  return {
    maturityDate: addMonths(form.startDate, tenureMonths),
    maturityAmount,
    interestEarned: Math.max(0, maturityAmount - principal),
  };
};

const getApplicableRate = (rateCards, productType, tenureMonths) =>
  (rateCards || []).find(
    (rule) =>
      rule.productType === productType &&
      Number(tenureMonths || 0) >= Number(rule.minTenureMonths || 0) &&
      Number(tenureMonths || 0) <= Number(rule.maxTenureMonths || 0)
  );

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

const getHeldPeriodFdRate = (rateCards, heldMonths) =>
  normalizeAllowedRateCards(rateCards)
    .filter((rule) => rule.productType === "fd" && heldMonths >= Number(rule.minTenureMonths || 0))
    .sort((left, right) => Number(right.minTenureMonths || 0) - Number(left.minTenureMonths || 0))[0] || null;

const buildFdWithdrawalPreview = (fd, rateCards) => {
  const depositAmount = Number(fd.depositAmount || 0);
  const tenureMonths = Number(fd.tenureMonths || 0);
  const startDate = new Date(fd.startDate || new Date());
  const elapsedMonths = Math.max(
    1,
    Math.floor((Date.now() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000))
  );
  const heldMonths = Math.min(elapsedMonths, tenureMonths || elapsedMonths);
  const heldRate = getHeldPeriodFdRate(rateCards, heldMonths);
  const applicableRate = Number(heldRate?.annualInterestRate || 0);
  const penaltyRate = PREMATURE_WITHDRAWAL_PENALTY_RATE * 100;
  const elapsedYears = heldMonths / 12;
  const valueBeforePenalty = Math.round(depositAmount * (1 + (applicableRate / 100) * elapsedYears));
  const penaltyAmount = Math.round(depositAmount * PREMATURE_WITHDRAWAL_PENALTY_RATE);

  return {
    fd,
    elapsedMonths,
    heldMonths,
    applicableRate,
    penaltyRate,
    valueBeforePenalty,
    penaltyAmount,
    payoutAmount: Math.max(0, valueBeforePenalty - penaltyAmount),
  };
};

const FixedDeposits = ({ adminMode = false }) => {
  const toast = useToast();
  const { user } = useAuth();
  const [fixedDeposits, setFixedDeposits] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [calculatedPreview, setCalculatedPreview] = useState(null);
  const [withdrawalPreview, setWithdrawalPreview] = useState(null);
  const customerAccounts = user?.accounts?.length
    ? user.accounts
    : [user?.account].filter(Boolean);

  const loadFixedDeposits = useCallback(() =>
    api
      .get("/fixed-deposits")
      .then(({ data }) => setFixedDeposits(data.fixedDeposits || []))
      .catch(() => toast.error("Unable to load fixed deposits.")), [toast]);

  useEffect(() => {
    loadFixedDeposits();
    api
      .get("/fixed-deposits/rates")
      .then(({ data }) => setRateCards(normalizeAllowedRateCards(data.rateCards || [])))
      .catch(() => toast.error("Unable to load deposit rates."));

  }, [loadFixedDeposits, toast]);

  const applicableFdRate = useMemo(
    () => getApplicableRate(rateCards, "fd", form.tenureMonths),
    [rateCards, form.tenureMonths]
  );
  const minimumFdAmount = Number(applicableFdRate?.minAmount || 1000);
  const formWithRate = useMemo(
    () => ({
      ...form,
      interestRate: applicableFdRate?.annualInterestRate ?? form.interestRate,
    }),
    [applicableFdRate?.annualInterestRate, form]
  );
  const preview = useMemo(() => calculatePreview(formWithRate), [formWithRate]);
  const selectedTenureLabel =
    fdTenureOptions.find((option) => option.value === form.tenureMonths)?.label || `${form.tenureMonths} months`;
  const activeFds = fixedDeposits.filter((fd) => fd.status === "active");
  const totalDeposit = activeFds.reduce((sum, fd) => sum + Number(fd.depositAmount || 0), 0);
  const totalMaturity = activeFds.reduce((sum, fd) => sum + Number(fd.maturityAmount || 0), 0);
  const totalInterest = activeFds.reduce((sum, fd) => sum + Number(fd.interestEarned || 0), 0);
  const upcomingMaturities = activeFds.filter((fd) => {
    const maturityDate = new Date(fd.maturityDate);
    const today = new Date();
    const next90Days = new Date();
    next90Days.setDate(today.getDate() + 90);
    return maturityDate >= today && maturityDate <= next90Days;
  }).length;

  const filteredFixedDeposits = useMemo(() => {
    const searchText = query.trim().toLowerCase();

    return fixedDeposits.filter((fd) => {
      const matchesSearch = !searchText ||
        [
          fd.fdNumber,
          fd.customerName,
          fd.customerId,
          fd.bankName,
          fd.nomineeName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchText);
      const matchesStatus = !statusFilter || fd.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [fixedDeposits, query, statusFilter]);
  const pagination = usePaginatedRows(filteredFixedDeposits);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setCalculatedPreview(null);
  };

  const calculateFixedDepositPreview = () => {
    if (Number(form.depositAmount || 0) < minimumFdAmount) {
      toast.warning(`Minimum FD amount is Rs. ${minimumFdAmount.toLocaleString("en-IN")}.`);
      return;
    }

    setCalculatedPreview(preview);
    toast.success("FD maturity calculated.");
  };

  const createFixedDeposit = async (event) => {
    event.preventDefault();

    if (Number(form.depositAmount || 0) < minimumFdAmount) {
      toast.warning(`Minimum FD amount is Rs. ${minimumFdAmount.toLocaleString("en-IN")}.`);
      return;
    }

    if (!calculatedPreview) {
      toast.warning("Calculate FD maturity before creating the deposit.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/fixed-deposits", formWithRate);
      toast.success("Fixed deposit created.");
      setForm({
        ...initialForm,
        interestRate: "",
        customerId: "",
      });
      setCalculatedPreview(null);
      await loadFixedDeposits();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to create fixed deposit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const runFdAction = async (fd, action, successMessage) => {
    setUpdatingId(`${fd.id}:${action}`);
    try {
      await api.post(`/fixed-deposits/${fd.id}/${action}`);
      toast.success(successMessage);
      await loadFixedDeposits();
      if (action === "premature-withdrawal") {
        setWithdrawalPreview(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update FD.");
    } finally {
      setUpdatingId("");
    }
  };

  const updateStatus = async (fd, status) => {
    setUpdatingId(fd.id);
    try {
      await api.patch(`/fixed-deposits/${fd.id}/status`, { status });
      toast.success(`FD marked ${statusLabel(status)}.`);
      await loadFixedDeposits();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update FD status.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow={adminMode ? "Admin / Fixed Deposits" : "Customer / Fixed Deposits"}
          title={adminMode ? "Fixed Deposits" : "My Fixed Deposits"}
          subtitle={
            adminMode
              ? "Monitor customer FDs, maturity values, and closure status."
              : "Track your active FDs, interest earned, maturity date, and total maturity amount."
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <StatsCard
            title="Active FD Amount"
            value={formatCurrency(totalDeposit)}
            icon={PiggyBank}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: `${activeFds.length} active`, tone: "success" }}
          />
          <StatsCard
            title="Maturity Value"
            value={formatCurrency(totalMaturity)}
            icon={Banknote}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            footer={{ text: "Principal plus estimated interest" }}
          />
          <StatsCard
            title="Interest Earned"
            value={formatCurrency(totalInterest)}
            icon={Percent}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
          />
          <StatsCard
            title="Maturing Soon"
            value={upcomingMaturities}
            icon={CalendarClock}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: "Next 90 days" }}
          />
        </div>

        <section className={adminMode ? "" : "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"}>
          {!adminMode && (
            <SectionCard
              title="Create Fixed Deposit"
              subtitle="Enter deposit terms and review the cumulative maturity preview before saving."
              icon={Plus}
            >
              <form onSubmit={createFixedDeposit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="label-field">
                <span>Bank Name</span>
                <input
                  value={form.bankName}
                  onChange={(event) => updateForm("bankName", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Deposit Amount (₹)</span>
                <input
                  type="number"
                  min={minimumFdAmount}
                  value={form.depositAmount}
                  onChange={(event) => updateForm("depositAmount", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Applicable Interest Rate (% p.a.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formWithRate.interestRate}
                  onChange={(event) => updateForm("interestRate", event.target.value)}
                  className="input-field disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                  disabled={Boolean(applicableFdRate)}
                />
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {applicableFdRate
                    ? `${applicableFdRate.label} from configured FD rates`
                    : "No configured FD rate matched this tenure."}
                </p>
              </label>
              <div className="label-field">
                <span>Tenure</span>
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-bank-card-border bg-bank-surface p-1">
                  {fdTenureOptions.map((option) => {
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
                <span>Start Date</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => updateForm("startDate", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Linked Account</span>
                <select
                  value={form.linkedAccountNumber}
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
                <span>Nominee</span>
                <input
                  value={form.nomineeName}
                  onChange={(event) => updateForm("nomineeName", event.target.value)}
                  className="input-field"
                  placeholder="Optional"
                />
              </label>
              <label className="label-field sm:col-span-2">
                <span>Notes</span>
                <input
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  className="input-field"
                  placeholder="Renewal instruction or internal note"
                />
              </label>

              <div className="sm:col-span-2 rounded-lg border border-bank-card-border bg-bank-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-bank-eyebrow">Current FD terms</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {selectedTenureLabel} at {formWithRate.interestRate || "0"}% p.a. | Minimum {formatCurrency(minimumFdAmount)}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                    calculatedPreview ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500"
                  }`}>
                    {calculatedPreview ? "Calculated" : "Calculation pending"}
                  </span>
                </div>
              </div>

              <div className={`sm:col-span-2 rounded-lg border p-4 ${
                calculatedPreview
                  ? "border-blue-100 bg-blue-50"
                  : "border-dashed border-slate-300 bg-slate-50"
              }`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-950">Maturity Preview</p>
                    <p className="text-xs font-semibold text-slate-500">Cumulative payout at maturity</p>
                  </div>
                  <Calculator size={18} className={calculatedPreview ? "text-bank-eyebrow" : "text-slate-400"} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <PreviewMetric
                    label="Maturity Date"
                    value={calculatedPreview ? formatDate(calculatedPreview.maturityDate) : "Calculate first"}
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
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={calculateFixedDepositPreview}
                  className="btn-secondary justify-center"
                >
                  <Calculator size={18} />
                  Calculate FD
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !calculatedPreview}
                  className="btn-primary justify-center"
                >
                  <CheckCircle2 size={18} />
                  {isSubmitting ? "Creating..." : "Create FD"}
                </button>
              </div>
            </form>
          </SectionCard>
          )}

          <SectionCard
            title={adminMode ? "FD Register" : "FD Portfolio"}
            subtitle="Review FD numbers, maturity dates, total maturity value, and current status."
            icon={Landmark}
          >
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="input-field pl-10"
                  placeholder={adminMode ? "Search FD, customer, bank" : "Search FD, bank, nominee"}
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
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">FD</th>
                    {adminMode && <th className="px-4 py-3">Customer</th>}
                    <th className="px-4 py-3">Deposit (₹)</th>
                    <th className="px-4 py-3">Rate (% p.a.)</th>
                    <th className="px-4 py-3">Maturity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageRows.map((fd) => {
                    const hasMatured = new Date(fd.maturityDate) <= new Date();

                    return (
                    <tr key={fd.id} className="table-row">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{fd.fdNumber}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {fd.bankName} / {formatDate(fd.startDate)}
                        </p>
                      </td>
                      {adminMode && (
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900">{fd.customerName}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {fd.customerId || "Customer"}
                          </p>
                        </td>
                      )}
                      <td className="px-4 py-3">{formatCurrency(fd.depositAmount)}</td>
                      <td className="px-4 py-3">{fd.interestRate}%</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{formatDate(fd.maturityDate)}</p>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          {formatCurrency(fd.maturityAmount)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[fd.status] || statusStyles.active}`}>
                          {statusLabel(fd.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {adminMode ? (
                          <select
                            value={fd.status}
                            disabled={updatingId === fd.id}
                            onChange={(event) => updateStatus(fd, event.target.value)}
                            className="input-field min-w-32 bg-white py-2 text-xs"
                          >
                            <option value="active">Active</option>
                            <option value="matured">Matured</option>
                            <option value="closed">Closed</option>
                            <option value="renewed">Renewed</option>
                          </select>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {fd.status === "active" && !hasMatured && (
                              <button
                                type="button"
                                disabled={updatingId === `${fd.id}:premature-withdrawal`}
                                onClick={() => setWithdrawalPreview(buildFdWithdrawalPreview(fd, rateCards))}
                                className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                              >
                                Withdraw
                              </button>
                            )}
                            {["active", "matured"].includes(fd.status) && hasMatured && (
                              <>
                                <button
                                  type="button"
                                  disabled={updatingId === `${fd.id}:payout`}
                                  onClick={() => runFdAction(fd, "payout", "Maturity Amount Credited")}
                                  className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                >
                                  Payout
                                </button>
                                <button
                                  type="button"
                                  disabled={updatingId === `${fd.id}:renew`}
                                  onClick={() => runFdAction(fd, "renew", "FD Renewed")}
                                  className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                                >
                                  Renew
                                </button>
                              </>
                            )}
                            {!["active", "matured"].includes(fd.status) && (
                              <span className="text-xs font-semibold text-slate-400">No action</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredFixedDeposits.length === 0 && (
              <div className="mt-4">
                <EmptyState message="No fixed deposits found for the current filters." />
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
                    <h3 className="text-lg font-extrabold text-slate-950">Premature FD Withdrawal</h3>
                    <p className="mt-1 text-sm font-semibold text-amber-800">
                      Interest is recalculated for the held period, then a fixed 1% penalty is deducted.
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
                    {withdrawalPreview.fd.fdNumber}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    Original {withdrawalPreview.fd.tenureMonths / 12}-year FD rate was {withdrawalPreview.fd.interestRate}% p.a.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <PreviewMetric label="Held Period" value={`${withdrawalPreview.heldMonths} months`} />
                  <PreviewMetric label="Held-Period Rate" value={`${withdrawalPreview.applicableRate}% p.a.`} tone="info" />
                  <PreviewMetric label="Fixed Penalty Rate" value={`${withdrawalPreview.penaltyRate}% of deposit`} />
                  <PreviewMetric label="Value Before Penalty" value={formatCurrency(withdrawalPreview.valueBeforePenalty)} />
                  <PreviewMetric label="Penalty Deduction" value={`- ${formatCurrency(withdrawalPreview.penaltyAmount)}`} />
                  <PreviewMetric label="Estimated Payout" value={formatCurrency(withdrawalPreview.payoutAmount)} tone="success" />
                </div>

                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  This will close the FD immediately. The original full-tenure rate will not apply because the deposit is being withdrawn before maturity.
                </p>

                {withdrawalPreview.applicableRate === 0 && (
                  <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                    No FD interest slab applies yet because this deposit has been held for less than 12 months. The fixed 1% premature withdrawal penalty still applies.
                  </p>
                )}
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
                  disabled={updatingId === `${withdrawalPreview.fd.id}:premature-withdrawal`}
                  onClick={() => runFdAction(withdrawalPreview.fd, "premature-withdrawal", "FD withdrawn")}
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

export default FixedDeposits;
