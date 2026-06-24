import {
  BadgeIndianRupee,
  Bell,
  Mail,
  MessageSquareText,
  PiggyBank,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";

const permissionFields = [
  {
    key: "perTxnLimit",
    label: "Per Transfer Limit (₹)",
    description: "Allow manager to change the per-transfer cap.",
  },
  {
    key: "dailyLimit",
    label: "Daily Limit (₹)",
    description: "Allow manager to change the daily transfer cap.",
  },
  {
    key: "monthlyLimit",
    label: "Monthly Limit (₹)",
    description: "Allow manager to change the monthly transfer cap.",
  },
  {
    key: "accountTypeOdRules",
    label: "Account-wise OD Rules",
    description: "Allow manager to edit OD limits and opening balances by account type.",
  },
  {
    key: "penaltyAmount",
    label: "Penalty Amount (₹)",
    description: "Allow manager to change the penalty charged after grace.",
  },
  {
    key: "interestRate",
    label: "Monthly OD Interest (%)",
    description: "Allow manager to change the monthly overdraft interest.",
  },
];

const defaultPermissions = permissionFields.reduce(
  (permissions, field) => ({ ...permissions, [field.key]: false }),
  {}
);

const initialMessageForm = {
  targetType: "manager",
  targetUserId: "",
  targetTier: "",
  title: "",
  body: "",
  sendEmail: false,
};

const defaultLoanRules = {
  loanTypes: [],
  scoreWeights: {
    incomeStrength: 20,
    liabilities: 30,
    classification: 20,
    employmentStability: 15,
    accountHistory: 10,
    overdraftUsage: 5,
  },
  decisionBands: {
    highlyEligible: 80,
    eligible: 65,
    review: 50,
  },
  partPaymentPolicy: {
    enabled: true,
    minimumAmount: 1000,
    minimumPrincipalPercentage: 1,
    lockInMonths: 0,
    chargePercentage: 0,
  },
};

const scoreModelFactors = [
  ["incomeStrength", "Income Strength", "Compares requested amount with declared monthly income."],
  ["liabilities", "Active Loans", "Reduces score as active loan obligations increase."],
  ["classification", "Classification", "Uses customer tier as a policy confidence signal."],
  ["employmentStability", "Employment Stability", "Rewards longer declared employment history."],
  ["accountHistory", "Account History", "Rewards longer banking relationship with the bank."],
  ["overdraftUsage", "Overdraft Usage", "Penalizes high OD usage, blocked OD, or repeated monthly OD attempts."],
];

const ruleTabs = [
  { key: "permissions", label: "Permissions" },
  { key: "loans", label: "Loans" },
  { key: "deposits", label: "Deposits" },
  { key: "messaging", label: "Messaging" },
  { key: "audit", label: "Audit" },
];

const defaultDepositRules = {
  rateCards: [
    {
      productType: "fd",
      label: "FD 1 year",
      minTenureMonths: 12,
      maxTenureMonths: 12,
      annualInterestRate: 7,
      minAmount: 1000,
    },
    {
      productType: "fd",
      label: "FD 2 years",
      minTenureMonths: 24,
      maxTenureMonths: 24,
      annualInterestRate: 7.25,
      minAmount: 1000,
    },
    {
      productType: "fd",
      label: "FD 5 years",
      minTenureMonths: 60,
      maxTenureMonths: 60,
      annualInterestRate: 7.75,
      minAmount: 1000,
    },
    {
      productType: "rd",
      label: "RD 6 months",
      minTenureMonths: 6,
      maxTenureMonths: 6,
      annualInterestRate: 6.25,
      minAmount: 500,
    },
    {
      productType: "rd",
      label: "RD 1 year",
      minTenureMonths: 12,
      maxTenureMonths: 12,
      annualInterestRate: 6.75,
      minAmount: 500,
    },
    {
      productType: "rd",
      label: "RD 2 years",
      minTenureMonths: 24,
      maxTenureMonths: 24,
      annualInterestRate: 7.25,
      minAmount: 500,
    },
  ],
};

const normalizeDepositRules = (rules = {}) => ({
  rateCards: (rules.rateCards?.length ? rules.rateCards : defaultDepositRules.rateCards).map((rule) => ({
    ...rule,
    productType: rule.productType === "rd" ? "rd" : "fd",
    annualInterestRate: rule.annualInterestRate ?? 0,
    minAmount: rule.minAmount ?? 0,
  })),
});

const tenureLabel = (minTenureMonths, maxTenureMonths) => {
  const minMonths = Number(minTenureMonths || 0);
  const maxMonths = Number(maxTenureMonths || minTenureMonths || 0);
  const format = (months) => (months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`);

  return minMonths === maxMonths ? format(minMonths) : `${format(minMonths)} to ${format(maxMonths)}`;
};

const summarizeDepositCards = (cards) => {
  if (!cards.length) return "No products configured";

  const rates = cards.map((card) => Number(card.annualInterestRate || 0));
  const minimums = cards.map((card) => Number(card.minAmount || 0));
  const averageRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const lowestMinimum = Math.min(...minimums);

  return `${cards.length} tenures / avg ${averageRate.toFixed(2)}% / min Rs. ${lowestMinimum.toLocaleString("en-IN")}`;
};

const BusinessRules = () => {
  const toast = useToast();
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [loanRules, setLoanRules] = useState(defaultLoanRules);
  const [depositRules, setDepositRules] = useState(defaultDepositRules);
  const [activeRuleTab, setActiveRuleTab] = useState("permissions");
  const [updatedAt, setUpdatedAt] = useState("");
  const [customers, setCustomers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [messageForm, setMessageForm] = useState(initialMessageForm);
  const [selectedLoanTypeKey, setSelectedLoanTypeKey] = useState("");
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  useEffect(() => {
    Promise.allSettled([api.get("/business-rules"), api.get("/users"), api.get("/tiers")]).then(
      ([rulesResult, usersResult, tiersResult]) => {
        if (rulesResult.status === "fulfilled") {
          const config = rulesResult.value.data.config;
          setPermissions({
            ...defaultPermissions,
            ...(config.managerTierPermissions || {}),
          });
          setUpdatedAt(config.updatedAt || "");
          setLoanRules({
            ...defaultLoanRules,
            ...(config.loanRules || {}),
            scoreWeights: {
              ...defaultLoanRules.scoreWeights,
              ...(config.loanRules?.scoreWeights || {}),
            },
            decisionBands: {
              ...defaultLoanRules.decisionBands,
              ...(config.loanRules?.decisionBands || {}),
            },
          });
          setDepositRules(normalizeDepositRules(config.depositRules));
          setAuditLogs(rulesResult.value.data.auditLogs || []);
        }

        if (usersResult.status === "fulfilled") {
          setCustomers(usersResult.value.data.customers || []);
          setManagers(usersResult.value.data.managers || []);
        }

        if (tiersResult.status === "fulfilled") {
          setTiers(tiersResult.value.data.tiers || []);
        }
      }
    );
  }, []);

  const activeManager = useMemo(
    () => managers.find((manager) => manager.status === "active") || managers[0],
    [managers]
  );
  const selectedCustomer = customers.find(
    (customer) => customer.id === messageForm.targetUserId
  );
  const selectedTier = tiers.find((tier) => tier.key === messageForm.targetTier);
  const permissionCount = Object.values(permissions).filter(Boolean).length;
  const selectedLoanTypeRule =
    (loanRules.loanTypes || []).find((rule) => rule.key === selectedLoanTypeKey) ||
    (loanRules.loanTypes || [])[0];
  const scoreWeightTotal = Object.values(loanRules.scoreWeights || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
  const formattedScoreWeightTotal = Number.isInteger(scoreWeightTotal)
    ? scoreWeightTotal
    : scoreWeightTotal.toFixed(2);
  const scoreWeightsAreValid = Math.abs(scoreWeightTotal - 100) < 0.001;

  const updatePermission = (key, value) => {
    setPermissions((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const savePermissions = async () => {
    if (!scoreWeightsAreValid) {
      toast.warning("Eligibility score weights must total 100% before saving.");
      return;
    }

    setIsSavingPermissions(true);

    try {
      const { data } = await api.patch("/business-rules", {
        managerTierPermissions: permissions,
        loanRules,
        depositRules,
      });

      setPermissions({
        ...defaultPermissions,
        ...(data.config.managerTierPermissions || {}),
      });
      setLoanRules({
        ...defaultLoanRules,
        ...(data.config.loanRules || {}),
        scoreWeights: {
          ...defaultLoanRules.scoreWeights,
          ...(data.config.loanRules?.scoreWeights || {}),
        },
        decisionBands: {
          ...defaultLoanRules.decisionBands,
          ...(data.config.loanRules?.decisionBands || {}),
        },
      });
      setDepositRules(normalizeDepositRules(data.config.depositRules));
      setUpdatedAt(data.config.updatedAt || "");
      toast.success("Business rules updated.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update business rules.");
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const updateMessageForm = (field, value) => {
    setMessageForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "targetType" ? { targetUserId: "", targetTier: "" } : {}),
    }));
  };

  const updateLoanTypeRule = (key, field, value) => {
    setLoanRules((current) => ({
      ...current,
      loanTypes: (current.loanTypes || []).map((rule) =>
        rule.key === key ? { ...rule, [field]: value } : rule
      ),
    }));
  };

  const updateLoanScoreWeight = (field, value) => {
    setLoanRules((current) => ({
      ...current,
      scoreWeights: {
        ...current.scoreWeights,
        [field]: value,
      },
    }));
  };

  const updateDecisionBand = (field, value) => {
    setLoanRules((current) => ({
      ...current,
      decisionBands: {
        ...current.decisionBands,
        [field]: value,
      },
    }));
  };

  const updatePartPaymentPolicy = (field, value) => {
    setLoanRules((current) => ({
      ...current,
      partPaymentPolicy: {
        ...current.partPaymentPolicy,
        [field]: value,
      },
    }));
  };

  const updateDepositRateCard = (index, field, value) => {
    setDepositRules((current) => ({
      ...current,
      rateCards: (current.rateCards || []).map((rule, currentIndex) =>
        currentIndex === index ? { ...rule, [field]: value } : rule
      ),
    }));
  };

  const fdRateCards = (depositRules.rateCards || []).filter((rule) => rule.productType === "fd");
  const rdRateCards = (depositRules.rateCards || []).filter((rule) => rule.productType === "rd");
  const findDepositRuleIndex = (targetRule) =>
    (depositRules.rateCards || []).findIndex(
      (rule) =>
        rule.productType === targetRule.productType &&
        rule.minTenureMonths === targetRule.minTenureMonths
    );

  const sendMessage = async (event) => {
    event.preventDefault();

    if (!messageForm.title.trim() || !messageForm.body.trim()) {
      toast.warning("Add a title and message before sending.");
      return;
    }

    if (messageForm.targetType === "customer" && !messageForm.targetUserId) {
      toast.warning("Select a customer before sending.");
      return;
    }

    if (messageForm.targetType === "customersByTier" && !messageForm.targetTier) {
      toast.warning("Select a classification before sending.");
      return;
    }

    setIsSendingMessage(true);

    try {
      const { data } = await api.post("/business-rules/messages", messageForm);
      const emailText = messageForm.sendEmail
        ? ` Email sent to ${data.email.sent}/${data.email.totalRecipients}.`
        : "";

      toast.success(`${data.message}${emailText}`);
      setMessageForm(initialMessageForm);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to send message.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Business Rules"
          title="Manage Business Rules"
          subtitle="Control manager tier-edit permissions and send operational messages from one place."
        />

        <div className="stat-grid">
          <StatsCard
            title="Manager Permissions"
            value={`${permissionCount}/${permissionFields.length}`}
            icon={ShieldCheck}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            footer={{ text: "Tier fields open for manager edits" }}
          />
          <StatsCard
            title="Active Manager"
            value={activeManager?.name ? activeManager.name.split(" ")[0] : "None"}
            icon={UserRound}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            footer={{ text: activeManager?.email || "No manager assigned" }}
          />
          <StatsCard
            title="Last Updated"
            value={updatedAt ? new Date(updatedAt).toLocaleDateString() : "Not updated"}
            icon={Bell}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: "Applies to manager policy edits" }}
          />
        </div>

        <div className="app-scrollbar flex gap-2 overflow-x-auto rounded-xl border border-bank-card-border bg-white p-2">
          {ruleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveRuleTab(tab.key)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeRuleTab === tab.key
                  ? "bg-bank-accent text-white shadow-sm"
                  : "text-slate-600 hover:bg-bank-surface hover:text-bank-eyebrow"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeRuleTab === "permissions" && (
        <section className="card-padded">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
                <SlidersHorizontal size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-950">
                  Manager Tier Edit Permissions
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Admin-only fields stay locked: classification name, eligibility, review notes,
                  create classification, and delete classification.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={savePermissions}
              disabled={isSavingPermissions || !scoreWeightsAreValid}
              className="btn-primary"
            >
              <Save size={17} />
              {isSavingPermissions ? "Saving..." : "Save Permissions"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {permissionFields.map((field) => (
              <label
                key={field.key}
                className="flex items-start justify-between gap-4 rounded-xl border border-bank-card-border bg-white p-4"
              >
                <span className="min-w-0">
                  <span className="block font-bold text-slate-950">{field.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500">
                    {field.description}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={permissions[field.key] === true}
                  onChange={(event) => updatePermission(field.key, event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                />
              </label>
            ))}
          </div>
        </section>
        )}

        {activeRuleTab === "loans" && (
        <section className="card-padded">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700">
                <BadgeIndianRupee size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-950">Loan Policy Rules</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Configure loan products and the score model used for manager recommendations.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={savePermissions}
              disabled={isSavingPermissions || !scoreWeightsAreValid}
              className="btn-primary"
            >
              <Save size={17} />
              {isSavingPermissions ? "Saving..." : "Save Loan Rules"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
              <label className="label-field">
                <span>Loan Type</span>
                <select
                  value={selectedLoanTypeRule?.key || ""}
                  onChange={(event) => setSelectedLoanTypeKey(event.target.value)}
                  className="input-field bg-white"
                >
                  {(loanRules.loanTypes || []).map((rule) => (
                    <option key={rule.key} value={rule.key}>
                      {rule.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedLoanTypeRule && (
                <div className="mt-4 rounded-lg bg-white p-3 text-sm font-semibold leading-6 text-slate-600">
                  <p className="font-bold text-slate-950">{selectedLoanTypeRule.label}</p>
                  <p>Rate: {selectedLoanTypeRule.annualInterestRate}% p.a.</p>
                  <p>
                    Amount: ₹{Number(selectedLoanTypeRule.minAmount || 0).toLocaleString("en-IN")} to ₹
                    {Number(selectedLoanTypeRule.maxAmount || 0).toLocaleString("en-IN")}
                  </p>
                  <p>
                    Tenure: {selectedLoanTypeRule.minTenureMonths} to {selectedLoanTypeRule.maxTenureMonths} months
                  </p>
                </div>
              )}
            </div>

            {selectedLoanTypeRule ? (
              <article className="rounded-xl border border-bank-card-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-950">{selectedLoanTypeRule.label} Details</h3>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {selectedLoanTypeRule.key}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="label-field">
                    Annual Interest (%)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={selectedLoanTypeRule.annualInterestRate}
                      onChange={(event) =>
                        updateLoanTypeRule(selectedLoanTypeRule.key, "annualInterestRate", event.target.value)
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="label-field">
                    Minimum Amount (₹)
                    <input
                      type="number"
                      min="0"
                      value={selectedLoanTypeRule.minAmount}
                      onChange={(event) =>
                        updateLoanTypeRule(selectedLoanTypeRule.key, "minAmount", event.target.value)
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="label-field">
                    Maximum Amount (₹)
                    <input
                      type="number"
                      min="0"
                      value={selectedLoanTypeRule.maxAmount}
                      onChange={(event) =>
                        updateLoanTypeRule(selectedLoanTypeRule.key, "maxAmount", event.target.value)
                      }
                      className="input-field"
                    />
                  </label>
                  <label className="label-field">
                    Tenure Range (Months)
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="1"
                        value={selectedLoanTypeRule.minTenureMonths}
                        onChange={(event) =>
                          updateLoanTypeRule(selectedLoanTypeRule.key, "minTenureMonths", event.target.value)
                        }
                        className="input-field"
                        aria-label={`${selectedLoanTypeRule.label} minimum tenure`}
                      />
                      <input
                        type="number"
                        min="1"
                        value={selectedLoanTypeRule.maxTenureMonths}
                        onChange={(event) =>
                          updateLoanTypeRule(selectedLoanTypeRule.key, "maxTenureMonths", event.target.value)
                        }
                        className="input-field"
                        aria-label={`${selectedLoanTypeRule.label} maximum tenure`}
                      />
                    </div>
                  </label>
                </div>
              </article>
            ) : (
              <div className="rounded-xl border border-bank-card-border bg-white p-4 text-sm font-semibold text-slate-500">
                No loan type rules are configured.
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4">
            <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">Customer Part-Payment Rules</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Bank-level limits shown to customers before they reduce loan principal.
                  </p>
                </div>
                <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
                  Allow Part-Payment
                  <input
                    type="checkbox"
                    checked={loanRules.partPaymentPolicy?.enabled !== false}
                    onChange={(event) => updatePartPaymentPolicy("enabled", event.target.checked)}
                    className="h-5 w-5 accent-blue-600"
                  />
                </label>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="label-field">
                  Minimum Payment Amount (₹)
                  <input
                    type="number"
                    min="0"
                    value={loanRules.partPaymentPolicy?.minimumAmount ?? 0}
                    onChange={(event) => updatePartPaymentPolicy("minimumAmount", event.target.value)}
                    className="input-field bg-white"
                  />
                </label>
                <label className="label-field">
                  Minimum Principal Share (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={loanRules.partPaymentPolicy?.minimumPrincipalPercentage ?? 0}
                    onChange={(event) => updatePartPaymentPolicy("minimumPrincipalPercentage", event.target.value)}
                    className="input-field bg-white"
                  />
                </label>
                <label className="label-field">
                  Part-Payment Allowed After (Months)
                  <input
                    type="number"
                    min="0"
                    value={loanRules.partPaymentPolicy?.lockInMonths ?? 0}
                    onChange={(event) => updatePartPaymentPolicy("lockInMonths", event.target.value)}
                    className="input-field bg-white"
                  />
                </label>
                <label className="label-field">
                  Processing Charge (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={loanRules.partPaymentPolicy?.chargePercentage ?? 0}
                    onChange={(event) => updatePartPaymentPolicy("chargePercentage", event.target.value)}
                    className="input-field bg-white"
                  />
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">Eligibility Score Weights</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    All weights together must equal 100%.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    scoreWeightsAreValid
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  Total: {formattedScoreWeightTotal}%
                </span>
              </div>
              {!scoreWeightsAreValid && (
                <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  Score weights must total 100%. Adjust the percentages before saving.
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(loanRules.scoreWeights || {}).map(([field, value]) => (
                  <label key={field} className="label-field">
                    {field.replace(/([A-Z])/g, " $1")} (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={value}
                      onChange={(event) => updateLoanScoreWeight(field, event.target.value)}
                      className="input-field bg-white"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
              <h3 className="font-bold text-slate-950">Decision Bands</h3>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {[
                  ["highlyEligible", "Highly Eligible"],
                  ["eligible", "Eligible"],
                  ["review", "Manager Review"],
                ].map(([field, label]) => (
                  <label key={field} className="label-field">
                    {label} (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={loanRules.decisionBands?.[field] ?? ""}
                      onChange={(event) => updateDecisionBand(field, event.target.value)}
                      className="input-field bg-white"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">How Eligibility Score Runs</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Managers see this as an explainable recommendation during loan review.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-bank-card-border">
                  Total model: {formattedScoreWeightTotal}%
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {scoreModelFactors.map(([key, label, description]) => {
                  const weight = Number(loanRules.scoreWeights?.[key] || 0);

                  return (
                    <div key={key} className="rounded-lg border border-bank-card-border bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-slate-950">{label}</p>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                          {weight} pts
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{description}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-800">
                Decision bands classify the final score: highly eligible at {loanRules.decisionBands?.highlyEligible ?? 80}%, eligible at {loanRules.decisionBands?.eligible ?? 65}%, and manager review at {loanRules.decisionBands?.review ?? 50}%.
              </div>
            </div>
          </div>

        </section>
        )}

        {activeRuleTab === "deposits" && (
        <section className="card-padded">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-lg bg-cyan-50 p-2.5 text-cyan-700">
                <PiggyBank size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-950">FD / RD Product Rules</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Configure customer-facing deposit rates and minimum opening amounts from Business Rules.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={savePermissions}
              disabled={isSavingPermissions || !scoreWeightsAreValid}
              className="btn-primary"
            >
              <Save size={17} />
              {isSavingPermissions ? "Saving..." : "Save Deposit Rules"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {[
              ["Fixed Deposits", "fd", fdRateCards],
              ["Recurring Deposits", "rd", rdRateCards],
            ].map(([title, productType, cards]) => (
              <details
                key={productType}
                className="group rounded-xl border border-bank-card-border bg-bank-surface p-4"
                open={productType === "fd"}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-950">{title}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {summarizeDepositCards(cards)}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-bank-card-border">
                    <span className="group-open:hidden">Open</span>
                    <span className="hidden group-open:inline">Close</span>
                  </span>
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {cards.map((rule) => {
                    const ruleIndex = findDepositRuleIndex(rule);

                    return (
                      <article key={`${rule.productType}-${rule.minTenureMonths}`} className="rounded-xl border border-bank-card-border bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-950">{rule.label}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                              {tenureLabel(rule.minTenureMonths, rule.maxTenureMonths)}
                            </p>
                          </div>
                          <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase text-cyan-700">
                            {rule.productType}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3">
                          <label className="label-field">
                            Annual Interest (%)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={rule.annualInterestRate}
                              onChange={(event) =>
                                updateDepositRateCard(ruleIndex, "annualInterestRate", event.target.value)
                              }
                              className="input-field"
                            />
                          </label>
                          <label className="label-field">
                            Minimum Amount (₹)
                            <input
                              type="number"
                              min="0"
                              value={rule.minAmount}
                              onChange={(event) =>
                                updateDepositRateCard(ruleIndex, "minAmount", event.target.value)
                              }
                              className="input-field"
                            />
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>
        )}

        {activeRuleTab === "messaging" && (
        <section className="card-padded">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700">
              <MessageSquareText size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-950">Manual Message Center</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Send an in-app notification to the manager, one customer, customers by tier, or all active customers.
              </p>
            </div>
          </div>

          <form onSubmit={sendMessage} className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="label-field">
              <span>Send To</span>
              <select
                value={messageForm.targetType}
                onChange={(event) => updateMessageForm("targetType", event.target.value)}
                className="input-field"
              >
                <option value="manager">Active manager</option>
                <option value="customer">Particular customer</option>
                <option value="customersByTier">Customers by classification</option>
                <option value="allCustomers">All active customers</option>
              </select>
            </label>

            {messageForm.targetType === "customer" ? (
              <label className="label-field">
                <span>Customer</span>
                <select
                  value={messageForm.targetUserId}
                  onChange={(event) => updateMessageForm("targetUserId", event.target.value)}
                  className="input-field"
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} - {customer.customerId}
                    </option>
                  ))}
                </select>
              </label>
            ) : messageForm.targetType === "customersByTier" ? (
              <label className="label-field">
                <span>Classification</span>
                <select
                  value={messageForm.targetTier}
                  onChange={(event) => updateMessageForm("targetTier", event.target.value)}
                  className="input-field"
                >
                  <option value="">Select classification</option>
                  {tiers.map((tier) => (
                    <option key={tier.key} value={tier.key}>
                      {tier.label} - {tier.customerCount || 0} customer(s)
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 text-blue-600" size={18} />
                  <div>
                    <p className="font-bold text-slate-950">
                      {messageForm.targetType === "manager" && (activeManager?.name || "Active manager")}
                      {messageForm.targetType === "allCustomers" && `${customers.length} customer(s)`}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Recipients are checked when the message is sent.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {messageForm.targetType === "customer" && selectedCustomer && (
              <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4 lg:col-span-2">
                <p className="font-bold text-slate-950">{selectedCustomer.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCustomer.customerId} / {selectedCustomer.email}
                </p>
              </div>
            )}

            {messageForm.targetType === "customersByTier" && selectedTier && (
              <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4 lg:col-span-2">
                <p className="font-bold text-slate-950">{selectedTier.label} customers</p>
                <p className="mt-1 text-sm text-slate-500">
                  Message will go to active customers assigned to this classification.
                </p>
              </div>
            )}

            <label className="label-field lg:col-span-2">
              <span>Message Title</span>
              <input
                value={messageForm.title}
                onChange={(event) => updateMessageForm("title", event.target.value)}
                className="input-field"
                placeholder="Example: Gold tier policy update"
              />
            </label>

            <label className="label-field lg:col-span-2">
              <span>Message Body</span>
              <textarea
                rows={5}
                value={messageForm.body}
                onChange={(event) => updateMessageForm("body", event.target.value)}
                className="input-field"
                placeholder="Write the message that should appear in notifications."
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bank-card-border bg-white p-4 lg:col-span-2">
              <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={messageForm.sendEmail}
                  onChange={(event) => updateMessageForm("sendEmail", event.target.checked)}
                  className="h-5 w-5 accent-blue-600"
                />
                <Mail size={17} />
                Send email also
              </label>
              <button
                type="submit"
                disabled={isSendingMessage}
                className="btn-primary"
              >
                <Send size={17} />
                {isSendingMessage ? "Sending..." : "Send Message"}
              </button>
            </div>
          </form>
        </section>
        )}

        {activeRuleTab === "audit" && (
        <section className="card-padded">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700">
              <Bell size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-950">Business Rule Audit Trail</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Recent permission changes, admin messages, and manager policy edits.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {auditLogs.length === 0 && (
              <div className="empty-state">No business rule changes have been recorded.</div>
            )}
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-bank-card-border bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-950">{log.message}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {log.actorName || "System"} / {log.action}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : "Recently"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default BusinessRules;
