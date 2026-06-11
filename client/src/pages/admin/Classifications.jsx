import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeIndianRupee,
  CalendarClock,
  CreditCard,
  Edit3,
  Plus,
  ShieldCheck,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/ToastContext";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import api from "../../api/axios";
import { formatCurrency } from "../../data/mockData";
import { getTierTone } from "../../utils/ui";

const defaultTierForm = {
  label: "",
  perTxnLimit: "",
  dailyLimit: "",
  monthlyLimit: "",
  maxODLimit: "",
  minBalance: "",
  payoffDays: "",
  penaltyAmount: "",
  reviewCycle: "Monthly",
  lateFeeRate: "",
  settlementWindow: "",
  eligibility: "",
  reviewNotes: "",
};

const slugifyTierName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const validateTierForm = (form, existingTiers = [], currentKey = "") => {
  const errors = {};
  const requiredTextFields = [
    "label",
    "lateFeeRate",
    "settlementWindow",
    "eligibility",
    "reviewNotes",
  ];
  const numericFields = [
    "perTxnLimit",
    "dailyLimit",
    "monthlyLimit",
    "maxODLimit",
    "minBalance",
    "payoffDays",
    "penaltyAmount",
  ];

  requiredTextFields.forEach((field) => {
    if (!String(form[field] || "").trim()) {
      errors[field] = "This field is required.";
    }
  });

  if (!form.reviewCycle) {
    errors.reviewCycle = "Choose a review cycle.";
  }

  numericFields.forEach((field) => {
    const value = Number(form[field]);

    if (form[field] === "" || !Number.isFinite(value) || value < 0) {
      errors[field] = "Enter a valid amount.";
    }
  });

  if (Number(form.payoffDays) <= 0) {
    errors.payoffDays = "Payoff days must be greater than 0.";
  }

  if (
    form.perTxnLimit !== "" &&
    form.dailyLimit !== "" &&
    Number(form.perTxnLimit) > Number(form.dailyLimit)
  ) {
    errors.perTxnLimit = "Transaction limit cannot exceed daily limit.";
  }

  if (
    form.dailyLimit !== "" &&
    form.monthlyLimit !== "" &&
    Number(form.dailyLimit) > Number(form.monthlyLimit)
  ) {
    errors.dailyLimit = "Daily limit cannot exceed monthly limit.";
  }

  const nextLabel = String(form.label || "").trim().toLowerCase();
  const nextKey = slugifyTierName(form.label);
  const duplicateTier = existingTiers.find((tier) => {
    if (currentKey && tier.key === currentKey) return false;

    return (
      String(tier.label || "").trim().toLowerCase() === nextLabel ||
      String(tier.key || "").trim().toLowerCase() === nextKey
    );
  });

  if (nextLabel && duplicateTier) {
    errors.label = "This classification name already exists.";
  }

  return errors;
};

const FieldError = ({ message }) =>
  message ? <p className="mt-1 text-sm font-semibold text-red-600">{message}</p> : null;

function Classifications() {
  const toast = useToast();
  const [classificationRows, setClassificationRows] = useState([]);
  const [editingTier, setEditingTier] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [isCreatingTier, setIsCreatingTier] = useState(false);
  const [createForm, setCreateForm] = useState(defaultTierForm);
  const [createErrors, setCreateErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [message, setMessage] = useState("");
  const classificationPagination = usePaginatedRows(classificationRows);

  useEffect(() => {
    api.get("/tiers").then(({ data }) => {
      setClassificationRows(data.tiers);
    });
  }, []);

  const openEditModal = (tier) => {
    setEditingTier(tier);
    setEditErrors({});
    setEditForm({
      label: tier.label,
      perTxnLimit: tier.perTxnLimit,
      dailyLimit: tier.dailyLimit,
      monthlyLimit: tier.monthlyLimit,
      maxODLimit: tier.maxODLimit,
      penaltyAmount: tier.penaltyAmount,
      payoffDays: tier.payoffDays,
      minBalance: tier.minBalance,
      lateFeeRate: tier.lateFeeRate,
      reviewCycle: tier.reviewCycle,
      eligibility: tier.eligibility,
      settlementWindow: tier.settlementWindow,
      reviewNotes: tier.reviewNotes,
    });
  };

  const closeEditModal = () => {
    setEditingTier(null);
    setEditForm(null);
    setEditErrors({});
  };

  const openCreateModal = () => {
    setCreateForm(defaultTierForm);
    setCreateErrors({});
    setIsCreatingTier(true);
  };

  const closeCreateModal = () => {
    setIsCreatingTier(false);
    setCreateForm(defaultTierForm);
    setCreateErrors({});
  };

  const updateEditForm = (field, value) => {
    const nextForm = {
      ...editForm,
      [field]: value,
    };

    setEditForm(nextForm);
    setEditErrors(validateTierForm(nextForm, classificationRows, editingTier?.key));
  };

  const updateCreateForm = (field, value) => {
    const nextForm = {
      ...createForm,
      [field]: value,
    };

    setCreateForm(nextForm);
    setCreateErrors(validateTierForm(nextForm, classificationRows));
  };

  const saveNewTier = async (event) => {
    event.preventDefault();

    const nextErrors = validateTierForm(createForm, classificationRows);
    setCreateErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.warning("Please fix the highlighted classification fields.");
      return;
    }

    await api.post("/tiers", {
      ...createForm,
      name: createForm.label,
    });
    const { data } = await api.get("/tiers");
    setClassificationRows(data.tiers);
    toast.success(`${createForm.label} classification added.`);
    setMessage(`${createForm.label} classification added.`);
    closeCreateModal();
  };

  const saveTierChanges = async (event) => {
    event.preventDefault();

    const nextErrors = validateTierForm(editForm, classificationRows, editingTier.key);
    setEditErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      toast.warning("Please fix the highlighted tier fields.");
      return;
    }

    await api.patch(`/tiers/${editingTier.key}`, editForm);
    const { data } = await api.get("/tiers");
    setClassificationRows(data.tiers);
    toast.success(`${editingTier.label} tier updated.`);
    setMessage(`${editingTier.label} tier updated. Assigned customer OD limits were refreshed.`);
    closeEditModal();
  };

  const formatAssignedCustomerMessage = (tier, assignedCustomers = []) => {
    const customerNames = assignedCustomers
      .map((customer) => customer.name || customer.email || customer.customerId)
      .filter(Boolean)
      .join(", ");

    return customerNames
      ? `Cannot delete ${tier.label}. Assigned customers: ${customerNames}.`
      : `Cannot delete ${tier.label}. ${tier.customerCount} customer(s) are assigned to this classification.`;
  };

  const deleteClassification = async (tier) => {
    if (tier.customerCount > 0) {
      try {
        await api.delete(`/tiers/${tier.key}`);
        const { data } = await api.get("/tiers");
        setClassificationRows(data.tiers);
        toast.success(`${tier.label} classification deleted.`);
        setMessage(`${tier.label} classification deleted.`);
      } catch (error) {
        const responseData = error.response?.data;
        const assignedCustomerCount =
          responseData?.assignedCustomerCount || tier.customerCount;
        const errorMessage =
          assignedCustomerCount > 0
            ? formatAssignedCustomerMessage(
                { ...tier, customerCount: assignedCustomerCount },
                responseData?.assignedCustomers
              )
            : responseData?.message || `Could not delete ${tier.label} classification.`;
        toast.error(errorMessage);
        setMessage(errorMessage);
      }
      return;
    }

    const confirmed = window.confirm(
      `Delete ${tier.label} classification? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await api.delete(`/tiers/${tier.key}`);
      const { data } = await api.get("/tiers");
      setClassificationRows(data.tiers);
      toast.success(`${tier.label} classification deleted.`);
      setMessage(`${tier.label} classification deleted.`);
    } catch (error) {
      const responseData = error.response?.data;
      const assignedCustomerCount =
        responseData?.assignedCustomerCount || tier.customerCount;
      const errorMessage =
        assignedCustomerCount > 0
          ? formatAssignedCustomerMessage(
              { ...tier, customerCount: assignedCustomerCount },
              responseData?.assignedCustomers
            )
          :
          responseData?.message ||
          `Could not delete ${tier.label} classification.`;
      toast.error(errorMessage);
      setMessage(errorMessage);
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Tier Policies"
          title="Tier Policy Management"
          subtitle="Maintain customer tier rules, overdraft limits, payoff windows, and assigned exposure."
        >
          <button
            type="button"
            onClick={openCreateModal}
            className="btn-primary"
          >
            <Plus size={18} />
            Add Tier Policy
          </button>
        </PageHeader>

        {message && <div className="alert-info">{message}</div>}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {classificationRows.map((tier) => (
            <div
              key={tier.key}
              className={`card p-5 ${getTierTone(tier.key).card}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    {tier.label} Tier
                  </p>
                  <h2 className="mt-2 text-3xl font-bold">
                    {formatCurrency(tier.maxODLimit)}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={28} />
                  <button
                    type="button"
                    onClick={() => openEditModal(tier)}
                    className="rounded-lg bg-white/80 p-2 hover:bg-white"
                    aria-label={`Edit ${tier.label} tier`}
                  >
                    <Edit3 size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteClassification(tier)}
                    className="rounded-lg bg-white/80 p-2 text-red-600 hover:bg-red-50"
                    aria-label={`Delete ${tier.label} tier`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Transaction Limit</p>
                  <p className="mt-1">{formatCurrency(tier.perTxnLimit)}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Penalty</p>
                  <p className="mt-1">{formatCurrency(tier.penaltyAmount)}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Payoff</p>
                  <p className="mt-1">{tier.payoffDays} days</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Review</p>
                  <p className="mt-1">{tier.reviewCycle}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Customers</p>
                  <p className="mt-1">{tier.customerCount}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">OD Blocked</p>
                  <p className="mt-1">{tier.odBlockedAccounts}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="table-shell">
          <div className="flex items-center gap-3 border-b border-slate-100 p-6">
            <BadgeIndianRupee className="text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-bold">Tier Policy Details</h2>
              <p className="text-sm text-slate-500">
                Values used while assigning customer tiers and overdraft facilities.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="table-head">
                <tr>
                  <th className="px-6 py-4">Tier</th>
                  <th className="px-6 py-4">Transaction Limit</th>
                  <th className="px-6 py-4">Overdraft</th>
                  <th className="px-6 py-4">Penalty</th>
                  <th className="px-6 py-4">Payoff</th>
                  <th className="px-6 py-4">Minimum Balance</th>
                  <th className="px-6 py-4">Review</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {classificationPagination.pageRows.map((tier) => (
                  <tr key={tier.key} className="table-row">
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${getTierTone(tier.key).badge}`}>
                        {tier.label}
                      </span>
                      <p className="text-sm text-slate-500">{tier.eligibility}</p>
                    </td>
                    <td className="px-6 py-4 font-semibold">
                      {formatCurrency(tier.perTxnLimit)}
                    </td>
                    <td className="px-6 py-4 font-semibold">
                      {formatCurrency(tier.maxODLimit)}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold">
                        {formatCurrency(tier.penaltyAmount)}
                      </p>
                      <p className="text-sm text-slate-500">{tier.lateFeeRate}</p>
                    </td>
                    <td className="px-6 py-4">{tier.payoffDays} days</td>
                    <td className="px-6 py-4">
                      {formatCurrency(tier.minBalance)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                        {tier.reviewCycle}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(tier)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <Edit3 size={15} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteClassification(tier)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination {...classificationPagination} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {classificationRows.map((tier) => (
            <div
              key={`${tier.key}-rules`}
              className="card-padded"
            >
              <div className="flex items-center gap-3">
                {tier.key === "gold" ? (
                  <TrendingUp className="text-blue-600" size={22} />
                ) : tier.key === "platinum" ? (
                  <CreditCard className="text-blue-600" size={22} />
                ) : (
                  <CalendarClock className="text-blue-600" size={22} />
                )}
                <h3 className="text-lg font-bold">{tier.label} Rules</h3>
              </div>
              <p className="mt-3 text-sm text-slate-500">{tier.reviewNotes}</p>
              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
                  <p className="text-sm text-slate-600">
                    Settlement window: {tier.settlementWindow}. Penalty applies
                    when overdraft is not cleared inside the payoff period.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
      </PageContent>

      {isCreatingTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={saveNewTier}
            className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  New Classification
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Add Customer Classification
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close add classification modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Classification Name
                </span>
                <input
                  required
                  value={createForm.label}
                  onChange={(event) => updateCreateForm("label", event.target.value)}
                  className="input-field"
                  placeholder="Example: Diamond"
                />
                <FieldError message={createErrors.label} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Transaction Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={createForm.perTxnLimit}
                  onChange={(event) =>
                    updateCreateForm("perTxnLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.perTxnLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Daily Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={createForm.dailyLimit}
                  onChange={(event) =>
                    updateCreateForm("dailyLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.dailyLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Monthly Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={createForm.monthlyLimit}
                  onChange={(event) =>
                    updateCreateForm("monthlyLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.monthlyLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Overdraft Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={createForm.maxODLimit}
                  onChange={(event) =>
                    updateCreateForm("maxODLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.maxODLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Penalty Amount
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={createForm.penaltyAmount}
                  onChange={(event) =>
                    updateCreateForm("penaltyAmount", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.penaltyAmount} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Payoff Days
                </span>
                <input
                  required
                  min="1"
                  type="number"
                  value={createForm.payoffDays}
                  onChange={(event) =>
                    updateCreateForm("payoffDays", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.payoffDays} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Minimum Balance
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={createForm.minBalance}
                  onChange={(event) =>
                    updateCreateForm("minBalance", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.minBalance} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Late Fee Rate
                </span>
                <input
                  required
                  value={createForm.lateFeeRate}
                  onChange={(event) =>
                    updateCreateForm("lateFeeRate", event.target.value)
                  }
                  className="input-field"
                  placeholder="2.0% monthly"
                />
                <FieldError message={createErrors.lateFeeRate} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Review Cycle
                </span>
                <select
                  value={createForm.reviewCycle}
                  onChange={(event) =>
                    updateCreateForm("reviewCycle", event.target.value)
                  }
                  className="input-field"
                >
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Half-Yearly</option>
                  <option>Yearly</option>
                </select>
                <FieldError message={createErrors.reviewCycle} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Settlement Window
                </span>
                <input
                  required
                  value={createForm.settlementWindow}
                  onChange={(event) =>
                    updateCreateForm("settlementWindow", event.target.value)
                  }
                  className="input-field"
                  placeholder="T+1 working day"
                />
                <FieldError message={createErrors.settlementWindow} />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Eligibility
                </span>
                <textarea
                  required
                  rows={3}
                  value={createForm.eligibility}
                  onChange={(event) =>
                    updateCreateForm("eligibility", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.eligibility} />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Review Notes
                </span>
                <textarea
                  required
                  rows={3}
                  value={createForm.reviewNotes}
                  onChange={(event) =>
                    updateCreateForm("reviewNotes", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={createErrors.reviewNotes} />
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 p-6">
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Add Classification
              </button>
            </div>
          </form>
        </div>
      )}

      {editingTier && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={saveTierChanges}
            className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                  Classification Editor
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Edit {editingTier.label} Tier
                </h2>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Close edit modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Classification Name
                </span>
                <input
                  required
                  value={editForm.label}
                  onChange={(event) => updateEditForm("label", event.target.value)}
                  className="input-field"
                />
                <FieldError message={editErrors.label} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Transaction Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.perTxnLimit}
                  onChange={(event) =>
                    updateEditForm("perTxnLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.perTxnLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Daily Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.dailyLimit}
                  onChange={(event) =>
                    updateEditForm("dailyLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.dailyLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Monthly Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.monthlyLimit}
                  onChange={(event) =>
                    updateEditForm("monthlyLimit", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.monthlyLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Overdraft Limit
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.maxODLimit}
                  onChange={(event) => updateEditForm("maxODLimit", event.target.value)}
                  className="input-field"
                />
                <FieldError message={editErrors.maxODLimit} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Penalty Amount
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.penaltyAmount}
                  onChange={(event) =>
                    updateEditForm("penaltyAmount", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.penaltyAmount} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Payoff Days
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.payoffDays}
                  onChange={(event) =>
                    updateEditForm("payoffDays", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.payoffDays} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Minimum Balance
                </span>
                <input
                  required
                  min="0"
                  type="number"
                  value={editForm.minBalance}
                  onChange={(event) =>
                    updateEditForm("minBalance", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.minBalance} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Late Fee Rate
                </span>
                <input
                  required
                  value={editForm.lateFeeRate}
                  onChange={(event) =>
                    updateEditForm("lateFeeRate", event.target.value)
                  }
                  className="input-field"
                  placeholder="2.0% monthly"
                />
                <FieldError message={editErrors.lateFeeRate} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Review Cycle
                </span>
                <select
                  value={editForm.reviewCycle}
                  onChange={(event) =>
                    updateEditForm("reviewCycle", event.target.value)
                  }
                  className="input-field"
                >
                  <option>Monthly</option>
                  <option>Quarterly</option>
                  <option>Half-Yearly</option>
                  <option>Yearly</option>
                </select>
                <FieldError message={editErrors.reviewCycle} />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Settlement Window
                </span>
                <input
                  required
                  value={editForm.settlementWindow}
                  onChange={(event) =>
                    updateEditForm("settlementWindow", event.target.value)
                  }
                  className="input-field"
                  placeholder="T+1 working day"
                />
                <FieldError message={editErrors.settlementWindow} />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Eligibility
                </span>
                <textarea
                  required
                  rows={3}
                  value={editForm.eligibility}
                  onChange={(event) =>
                    updateEditForm("eligibility", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.eligibility} />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Review Notes
                </span>
                <textarea
                  required
                  rows={3}
                  value={editForm.reviewNotes}
                  onChange={(event) =>
                    updateEditForm("reviewNotes", event.target.value)
                  }
                  className="input-field"
                />
                <FieldError message={editErrors.reviewNotes} />
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 p-6">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}

export default Classifications;
