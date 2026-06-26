import { useEffect, useState } from "react";
import {
  BadgeIndianRupee,
  Edit3,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
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
  penaltyAmount: "",
  interestRate: "",
  eligibility: "",
  reviewNotes: "",
  accountTypeOdRules: [
    { accountType: "Savings", odLimit: "", minOpeningBalance: "" },
    { accountType: "Salary", odLimit: "", minOpeningBalance: "" },
    { accountType: "Current", odLimit: "", minOpeningBalance: "" },
  ],
};

const GRACE_PERIOD_DAYS = 3;
const REVIEW_CYCLE = "Monthly";
const ACCOUNT_TYPES = ["Savings", "Salary", "Current"];

const RequiredMark = () => <span className="ml-1 text-sm font-black text-red-600">*</span>;

const normalizeAccountTypeOdRules = (rules = [], fallbackOdLimit = "") =>
  ACCOUNT_TYPES.map((accountType) => {
    const rule = rules.find((item) => item.accountType === accountType) || {};

    return {
      accountType,
      odLimit: rule.odLimit === undefined ? fallbackOdLimit : rule.odLimit,
      minOpeningBalance: rule.minOpeningBalance ?? "",
    };
  });

const getDerivedMaxOdLimit = (form) =>
  Math.max(
    0,
    ...normalizeAccountTypeOdRules(form.accountTypeOdRules, form.maxODLimit)
      .map((rule) => Number(rule.odLimit || 0))
  );

const getDerivedMinBalance = (form) => {
  const balances = normalizeAccountTypeOdRules(form.accountTypeOdRules, form.maxODLimit)
    .map((rule) => Number(rule.minOpeningBalance || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return balances.length > 0 ? Math.min(...balances) : 0;
};

const getAccountRule = (tier, accountType) =>
  normalizeAccountTypeOdRules(tier.accountTypeOdRules, tier.maxODLimit).find(
    (rule) => rule.accountType === accountType
  );

const parseMonthlyInterestPercent = (value) => {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)/);

  return match ? match[1] : "";
};

const formatPercentNumber = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "";

  return numericValue.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
};

const formatMonthlyInterestRate = (value) => {
  const percent = parseMonthlyInterestPercent(value);
  const displayValue = formatPercentNumber(percent);

  return displayValue ? `${displayValue}% monthly` : "";
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
    "interestRate",
  ];
  const numericFields = [
    "perTxnLimit",
    "dailyLimit",
    "monthlyLimit",
    "penaltyAmount",
  ];

  requiredTextFields.forEach((field) => {
    if (!String(form[field] || "").trim()) {
      errors[field] = "This field is required.";
    }
  });

  if (
    form.interestRate !== "" &&
    (!Number.isFinite(Number(parseMonthlyInterestPercent(form.interestRate))) ||
      Number(parseMonthlyInterestPercent(form.interestRate)) <= 0)
  ) {
    errors.interestRate = "Enter monthly OD interest as a percentage above 0.";
  }

  numericFields.forEach((field) => {
    const value = Number(form[field]);

    if (form[field] === "" || !Number.isFinite(value) || value < 0) {
      errors[field] = "Enter a valid amount.";
    }
  });

  normalizeAccountTypeOdRules(form.accountTypeOdRules, form.maxODLimit).forEach((rule) => {
    if (
      (!Number.isFinite(Number(rule.odLimit)) || Number(rule.odLimit) < 0)
    ) {
      errors[`accountTypeOdRules.${rule.accountType}.odLimit`] = "Enter a valid OD limit.";
    }

    if (
      !Number.isFinite(Number(rule.minOpeningBalance)) ||
      Number(rule.minOpeningBalance) < 0
    ) {
      errors[`accountTypeOdRules.${rule.accountType}.minOpeningBalance`] =
        "Enter a valid minimum balance.";
    }
  });

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

const AccountTypeRulesEditor = ({ form, errors, onChange }) => {
  const rules = normalizeAccountTypeOdRules(form.accountTypeOdRules, form.maxODLimit);

  return (
    <div className="md:col-span-2">
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-600">
          Account Type Rules
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Set separate OD limits and minimum opening balances. Monthly OD usage is fixed at 3 across all account types.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {rules.map((rule) => (
          <div
            key={rule.accountType}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-slate-900">{rule.accountType}</p>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                Account rule
              </span>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase text-slate-500">
                OD Limit (₹)<RequiredMark />
              </span>
              <input
                type="number"
                min="0"
                value={rule.odLimit}
                onChange={(event) =>
                  onChange(rule.accountType, "odLimit", event.target.value)
                }
                className="input-field mt-1"
              />
              <FieldError
                message={errors[`accountTypeOdRules.${rule.accountType}.odLimit`]}
              />
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase text-slate-500">
                Minimum Opening Balance (₹)<RequiredMark />
              </span>
              <input
                type="number"
                min="0"
                value={rule.minOpeningBalance}
                onChange={(event) =>
                  onChange(rule.accountType, "minOpeningBalance", event.target.value)
                }
                className="input-field mt-1"
              />
              <FieldError
                message={errors[`accountTypeOdRules.${rule.accountType}.minOpeningBalance`]}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

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
      interestRate: parseMonthlyInterestPercent(tier.interestRate || tier.lateFeeRate),
      eligibility: tier.eligibility,
      reviewNotes: tier.reviewNotes,
      accountTypeOdRules: normalizeAccountTypeOdRules(
        tier.accountTypeOdRules,
        tier.maxODLimit
      ),
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

  const updateEditAccountRule = (accountType, field, value) => {
    const nextRules = normalizeAccountTypeOdRules(
      editForm.accountTypeOdRules,
      editForm.maxODLimit
    ).map((rule) =>
      rule.accountType === accountType ? { ...rule, [field]: value } : rule
    );
    const nextForm = { ...editForm, accountTypeOdRules: nextRules };

    setEditForm(nextForm);
    setEditErrors(validateTierForm(nextForm, classificationRows, editingTier?.key));
  };

  const updateCreateAccountRule = (accountType, field, value) => {
    const nextRules = normalizeAccountTypeOdRules(
      createForm.accountTypeOdRules,
      createForm.maxODLimit
    ).map((rule) =>
      rule.accountType === accountType ? { ...rule, [field]: value } : rule
    );
    const nextForm = { ...createForm, accountTypeOdRules: nextRules };

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
      interestRate: formatMonthlyInterestRate(createForm.interestRate),
      maxODLimit: getDerivedMaxOdLimit(createForm),
      minBalance: getDerivedMinBalance(createForm),
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

    const { data: updateData } = await api.patch(`/tiers/${editingTier.key}`, {
      ...editForm,
      interestRate: formatMonthlyInterestRate(editForm.interestRate),
      maxODLimit: getDerivedMaxOdLimit(editForm),
      minBalance: getDerivedMinBalance(editForm),
    });
    const { data } = await api.get("/tiers");
    setClassificationRows(data.tiers);
    const email = updateData.email;
    const emailMessage =
      email && email.totalRecipients > 0
        ? ` Email sent to ${email.sent}/${email.totalRecipients} assigned customer(s).`
        : "";
    const toastMessage = `${editingTier.label} tier updated.${emailMessage}`;

    toast[email?.failed ? "warning" : "success"](toastMessage);
    setMessage(`${editingTier.label} tier updated. Assigned customer overdraft limits were refreshed.${emailMessage}`);
    closeEditModal();
  };

  const formatAssignedCustomerMessage = (tier) =>
    `Cannot delete ${tier.label}. ${tier.customerCount} customer(s) are assigned to this classification. Reassign them to another tier before deleting.`;

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
            ? formatAssignedCustomerMessage({ ...tier, customerCount: assignedCustomerCount })
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
          ? formatAssignedCustomerMessage({ ...tier, customerCount: assignedCustomerCount })
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
          subtitle="Maintain customer tier rules, overdraft limits, interest rates, penalties, and assigned exposure."
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
                    {tier.customerCount} customers
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
                  <p className="font-semibold">Per Transfer Limit (₹)</p>
                  <p className="mt-1">{formatCurrency(tier.perTxnLimit)}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Penalty (₹)</p>
                  <p className="mt-1">{formatCurrency(tier.penaltyAmount)}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Daily Limit (₹)</p>
                  <p className="mt-1">{formatCurrency(tier.dailyLimit)}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Monthly Limit (₹)</p>
                  <p className="mt-1">{formatCurrency(tier.monthlyLimit)}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Customers</p>
                  <p className="mt-1">{tier.customerCount}</p>
                </div>
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="font-semibold">Overdraft Blocked</p>
                  <p className="mt-1">{tier.odBlockedAccounts}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {ACCOUNT_TYPES.map((accountType) => {
                  const rule = getAccountRule(tier, accountType);

                  return (
                    <div key={accountType} className="rounded-lg bg-white/80 p-3 text-sm">
                      <p className="font-bold">{accountType}</p>
                      <p className="mt-1 text-slate-700">
                        OD {formatCurrency(rule?.odLimit || 0)}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Min opening {formatCurrency(rule?.minOpeningBalance || 0)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="card-padded">
          <div className="flex items-center gap-3">
            <BadgeIndianRupee className="text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-bold">Tier Policy Details</h2>
              <p className="text-sm text-slate-500">
                Values used while assigning customer tiers and overdraft facilities.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-semibold text-blue-800">
            Global overdraft policy: minimum 1-day interest, clear before month-end,{" "}
            {GRACE_PERIOD_DAYS}-day grace window, {REVIEW_CYCLE.toLowerCase()} review.
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {classificationPagination.pageRows.map((tier) => (
              <div key={tier.key} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${getTierTone(tier.key).badge}`}>
                      {tier.label}
                    </span>
                    <p className="mt-2 text-sm text-slate-500">{tier.eligibility || "No eligibility notes"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(tier)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      aria-label={`Edit ${tier.label} tier`}
                      title={`Edit ${tier.label} tier`}
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteClassification(tier)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 hover:bg-red-50"
                      aria-label={`Delete ${tier.label} tier`}
                      title={`Delete ${tier.label} tier`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Per Txn</p>
                    <p className="mt-1 font-bold">{formatCurrency(tier.perTxnLimit)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Daily</p>
                    <p className="mt-1 font-bold">{formatCurrency(tier.dailyLimit)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Penalty (₹)</p>
                    <p className="mt-1 font-bold">{formatCurrency(tier.penaltyAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Interest (% monthly)</p>
                    <p className="mt-1 font-bold">
                      {formatMonthlyInterestRate(tier.interestRate || tier.lateFeeRate)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <TablePagination {...classificationPagination} />
          </div>
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
                  Classification Name<RequiredMark />
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
                  Per Transfer Limit (₹)<RequiredMark />
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
                  Daily Limit (₹)<RequiredMark />
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
                  Monthly Limit (₹)<RequiredMark />
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
                  Penalty Amount (₹)<RequiredMark />
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

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Monthly OD Interest (%)<RequiredMark />
                </span>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={createForm.interestRate}
                  onChange={(event) =>
                    updateCreateForm("interestRate", event.target.value)
                  }
                  className="input-field"
                  placeholder="1.5"
                />
                {createForm.interestRate && (
                  <p className="mt-2 text-xs font-semibold text-blue-700">
                    Saved as {formatMonthlyInterestRate(createForm.interestRate)}
                  </p>
                )}
                <FieldError message={createErrors.interestRate} />
              </label>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800 md:col-span-2">
                Fixed overdraft policy: minimum 1-day interest, clear before month-end,{" "}
                {GRACE_PERIOD_DAYS}-day grace window, {REVIEW_CYCLE.toLowerCase()} review.
              </div>

              <AccountTypeRulesEditor
                form={createForm}
                errors={createErrors}
                onChange={updateCreateAccountRule}
              />

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Eligibility
                </span>
                <textarea
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
                  Classification Name<RequiredMark />
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
                  Per Transfer Limit (₹)<RequiredMark />
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
                  Daily Limit (₹)<RequiredMark />
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
                  Monthly Limit (₹)<RequiredMark />
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
                  Penalty Amount (₹)<RequiredMark />
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

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Monthly OD Interest (%)<RequiredMark />
                </span>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={editForm.interestRate}
                  onChange={(event) =>
                    updateEditForm("interestRate", event.target.value)
                  }
                  className="input-field"
                  placeholder="1.5"
                />
                {editForm.interestRate && (
                  <p className="mt-2 text-xs font-semibold text-blue-700">
                    Saved as {formatMonthlyInterestRate(editForm.interestRate)}
                  </p>
                )}
                <FieldError message={editErrors.interestRate} />
              </label>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800 md:col-span-2">
                Fixed overdraft policy: minimum 1-day interest, clear before month-end,{" "}
                {GRACE_PERIOD_DAYS}-day grace window, {REVIEW_CYCLE.toLowerCase()} review.
              </div>

              <AccountTypeRulesEditor
                form={editForm}
                errors={editErrors}
                onChange={updateEditAccountRule}
              />

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-600">
                  Eligibility
                </span>
                <textarea
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
