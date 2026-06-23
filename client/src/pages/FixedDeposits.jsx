import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Edit3,
  Landmark,
  Percent,
  PiggyBank,
  Plus,
  Save,
  Search,
  Trash2,
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
import DashboardLayout from "../layouts/DashboardLayout";
import { formatCurrency } from "../utils/format";

const initialForm = {
  customerId: "",
  bankName: "Adnate Bank",
  depositAmount: "100000",
  interestRate: "",
  tenureMonths: "12",
  startDate: new Date().toISOString().slice(0, 10),
  payoutType: "on_maturity",
  nomineeName: "",
  notes: "",
};

const initialRateForm = {
  productType: "fd",
  label: "",
  minTenureMonths: "12",
  maxTenureMonths: "23",
  annualInterestRate: "7",
  minAmount: "1000",
};

const payoutLabels = {
  on_maturity: "On maturity",
  monthly: "Monthly payout",
  quarterly: "Quarterly payout",
  yearly: "Yearly payout",
};

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
  const frequency = form.payoutType === "monthly" ? 12 : form.payoutType === "yearly" ? 1 : 4;
  const maturityAmount =
    form.payoutType === "on_maturity"
      ? Math.round(principal * (1 + annualRate / frequency) ** (frequency * years))
      : Math.round(principal + principal * annualRate * years);

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

const FixedDeposits = ({ adminMode = false }) => {
  const toast = useToast();
  const [fixedDeposits, setFixedDeposits] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [rateForm, setRateForm] = useState(initialRateForm);
  const [form, setForm] = useState(initialForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  const loadFixedDeposits = () =>
    api
      .get("/fixed-deposits")
      .then(({ data }) => setFixedDeposits(data.fixedDeposits || []))
      .catch(() => toast.error("Unable to load fixed deposits."));

  useEffect(() => {
    loadFixedDeposits();
    api
      .get("/fixed-deposits/rates")
      .then(({ data }) => setRateCards(data.rateCards || []))
      .catch(() => toast.error("Unable to load deposit rates."));

    if (adminMode) {
      api
        .get("/fixed-deposits/customers")
        .then(({ data }) => {
          const customerRows = data.customers || [];
          setCustomers(customerRows);
          setForm((current) => ({
            ...current,
            customerId: current.customerId || customerRows[0]?.id || "",
          }));
        })
        .catch(() => toast.error("Unable to load customer list."));
    }
  }, [adminMode]);

  const applicableFdRate = useMemo(
    () => getApplicableRate(rateCards, "fd", form.tenureMonths),
    [rateCards, form.tenureMonths]
  );
  const formWithRate = {
    ...form,
    interestRate: applicableFdRate?.annualInterestRate ?? form.interestRate,
  };
  const preview = useMemo(() => calculatePreview(formWithRate), [formWithRate]);
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
  };

  const updateRateForm = (field, value) => {
    setRateForm((current) => ({ ...current, [field]: value }));
  };

  const addRateCard = () => {
    const productLabel = rateForm.productType === "rd" ? "RD" : "FD";
    const nextRate = {
      productType: rateForm.productType,
      label:
        rateForm.label.trim() ||
        `${productLabel} ${rateForm.minTenureMonths}-${rateForm.maxTenureMonths} months`,
      minTenureMonths: Math.max(1, Math.round(Number(rateForm.minTenureMonths || 1))),
      maxTenureMonths: Math.max(1, Math.round(Number(rateForm.maxTenureMonths || 1))),
      annualInterestRate: Math.max(0, Number(rateForm.annualInterestRate || 0)),
      minAmount: Math.max(0, Math.round(Number(rateForm.minAmount || 0))),
    };

    if (nextRate.maxTenureMonths < nextRate.minTenureMonths) {
      toast.warning("Maximum tenure must be greater than or equal to minimum tenure.");
      return;
    }

    if (nextRate.annualInterestRate <= 0) {
      toast.warning("Interest rate must be greater than zero.");
      return;
    }

    setRateCards((current) => [...current, nextRate]);
    setRateForm((current) => ({
      ...initialRateForm,
      productType: current.productType,
    }));
  };

  const removeRateCard = (index) => {
    setRateCards((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateRateCard = (index, field, value) => {
    setRateCards((current) =>
      current.map((rule, currentIndex) =>
        currentIndex === index ? { ...rule, [field]: value } : rule
      )
    );
  };

  const saveRateCards = async () => {
    setIsSavingRates(true);
    try {
      const { data } = await api.patch("/fixed-deposits/rates", { rateCards });
      setRateCards(data.rateCards || []);
      toast.success("Deposit rates updated.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update deposit rates.");
    } finally {
      setIsSavingRates(false);
    }
  };

  const createFixedDeposit = async (event) => {
    event.preventDefault();

    if (adminMode && !form.customerId) {
      toast.warning("Select a customer for this FD.");
      return;
    }

    if (Number(form.depositAmount || 0) < 1000) {
      toast.warning("Minimum FD amount is Rs. 1,000.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/fixed-deposits", formWithRate);
      toast.success("Fixed deposit created.");
      setForm((current) => ({
        ...initialForm,
        interestRate: "",
        customerId: adminMode ? current.customerId : "",
      }));
      await loadFixedDeposits();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to create fixed deposit.");
    } finally {
      setIsSubmitting(false);
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
              ? "Create and monitor customer FDs, maturity values, and closure status."
              : "Track your active FDs, interest earned, maturity date, and payout mode."
          }
        />

        <div className="stat-grid">
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

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <SectionCard
            title={adminMode ? "Create Customer FD" : "Create Fixed Deposit"}
            subtitle="Enter deposit terms and review the maturity preview before saving."
            icon={Plus}
          >
            <form onSubmit={createFixedDeposit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {adminMode && (
                <label className="label-field sm:col-span-2">
                  <span>Customer</span>
                  <select
                    value={form.customerId}
                    onChange={(event) => updateForm("customerId", event.target.value)}
                    className="input-field"
                  >
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} / {customer.customerId || customer.email}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="label-field">
                <span>Bank Name</span>
                <input
                  value={form.bankName}
                  onChange={(event) => updateForm("bankName", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Deposit Amount</span>
                <input
                  type="number"
                  min="1000"
                  value={form.depositAmount}
                  onChange={(event) => updateForm("depositAmount", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Applicable Interest Rate %</span>
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
              <label className="label-field">
                <span>Tenure Months</span>
                <input
                  type="number"
                  min="1"
                  value={form.tenureMonths}
                  onChange={(event) => updateForm("tenureMonths", event.target.value)}
                  className="input-field"
                />
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
              <label className="label-field">
                <span>Payout Type</span>
                <select
                  value={form.payoutType}
                  onChange={(event) => updateForm("payoutType", event.target.value)}
                  className="input-field"
                >
                  {Object.entries(payoutLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
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

              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-800 sm:col-span-2">
                <p>Maturity date: {formatDate(preview.maturityDate)}</p>
                <p>Maturity amount: {formatCurrency(preview.maturityAmount)}</p>
                <p>Interest earned: {formatCurrency(preview.interestEarned)}</p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary justify-center sm:col-span-2"
              >
                <CheckCircle2 size={18} />
                {isSubmitting ? "Creating..." : "Create FD"}
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title={adminMode ? "FD Register" : "FD Portfolio"}
            subtitle="Review FD numbers, maturity dates, payout type, and current status."
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
                    <th className="px-4 py-3">Deposit</th>
                    <th className="px-4 py-3">Rate</th>
                    <th className="px-4 py-3">Maturity</th>
                    <th className="px-4 py-3">Payout</th>
                    <th className="px-4 py-3">Status</th>
                    {adminMode && <th className="px-4 py-3">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageRows.map((fd) => (
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
                      <td className="px-4 py-3">{payoutLabels[fd.payoutType] || statusLabel(fd.payoutType)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[fd.status] || statusStyles.active}`}>
                          {statusLabel(fd.status)}
                        </span>
                      </td>
                      {adminMode && (
                        <td className="px-4 py-3">
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
                        </td>
                      )}
                    </tr>
                  ))}
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

        {adminMode && (
          <SectionCard
            title="FD / RD Rate Configuration"
            subtitle="Maintain tenure-wise rates used for customer deposit maturity calculations."
            icon={Edit3}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
              <label className="label-field">
                <span>Product</span>
                <select
                  value={rateForm.productType}
                  onChange={(event) => updateRateForm("productType", event.target.value)}
                  className="input-field"
                >
                  <option value="fd">FD</option>
                  <option value="rd">RD</option>
                </select>
              </label>
              <label className="label-field">
                <span>Min Tenure</span>
                <input
                  type="number"
                  min="1"
                  value={rateForm.minTenureMonths}
                  onChange={(event) => updateRateForm("minTenureMonths", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Max Tenure</span>
                <input
                  type="number"
                  min="1"
                  value={rateForm.maxTenureMonths}
                  onChange={(event) => updateRateForm("maxTenureMonths", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Rate %</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateForm.annualInterestRate}
                  onChange={(event) => updateRateForm("annualInterestRate", event.target.value)}
                  className="input-field"
                />
              </label>
              <label className="label-field">
                <span>Min Amount</span>
                <input
                  type="number"
                  min="0"
                  value={rateForm.minAmount}
                  onChange={(event) => updateRateForm("minAmount", event.target.value)}
                  className="input-field"
                />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={addRateCard} className="btn-primary w-full justify-center">
                  <Plus size={18} />
                  Add
                </button>
              </div>
              <label className="label-field lg:col-span-6">
                <span>Label</span>
                <input
                  value={rateForm.label}
                  onChange={(event) => updateRateForm("label", event.target.value)}
                  className="input-field"
                  placeholder="Example: FD 12 to 23 months"
                />
              </label>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-bank-card-border bg-white">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Tenure Range</th>
                    <th className="px-4 py-3">Rate</th>
                    <th className="px-4 py-3">Min Amount</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rateCards.map((rule, index) => (
                    <tr key={`${rule.productType}-${rule.minTenureMonths}-${rule.maxTenureMonths}-${index}`} className="table-row">
                      <td className="px-4 py-3">
                        <select
                          value={rule.productType}
                          onChange={(event) => updateRateCard(index, "productType", event.target.value)}
                          className="input-field min-w-24 bg-white py-2 text-xs"
                        >
                          <option value="fd">FD</option>
                          <option value="rd">RD</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={rule.label}
                          onChange={(event) => updateRateCard(index, "label", event.target.value)}
                          className="input-field min-w-52 bg-white py-2 text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={rule.minTenureMonths}
                            onChange={(event) => updateRateCard(index, "minTenureMonths", event.target.value)}
                            className="input-field w-24 bg-white py-2 text-xs"
                          />
                          <span className="text-slate-400">to</span>
                          <input
                            type="number"
                            min="1"
                            value={rule.maxTenureMonths}
                            onChange={(event) => updateRateCard(index, "maxTenureMonths", event.target.value)}
                            className="input-field w-24 bg-white py-2 text-xs"
                          />
                          <span className="text-xs font-semibold text-slate-500">months</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rule.annualInterestRate}
                          onChange={(event) => updateRateCard(index, "annualInterestRate", event.target.value)}
                          className="input-field w-24 bg-white py-2 text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          value={rule.minAmount}
                          onChange={(event) => updateRateCard(index, "minAmount", event.target.value)}
                          className="input-field w-32 bg-white py-2 text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => removeRateCard(index)}
                          className="btn-danger-soft px-3 py-2 text-xs"
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={saveRateCards}
                disabled={isSavingRates}
                className="btn-primary justify-center px-4 py-2"
              >
                <Save size={18} />
                {isSavingRates ? "Saving..." : "Save Deposit Rates"}
              </button>
            </div>
          </SectionCard>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default FixedDeposits;
