import {
  BadgeIndianRupee,
  Bell,
  Mail,
  MessageSquareText,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";

const permissionFields = [
  {
    key: "perTxnLimit",
    label: "Per Transfer Limit",
    description: "Allow manager to change the per-transfer cap.",
  },
  {
    key: "dailyLimit",
    label: "Daily Limit",
    description: "Allow manager to change the daily transfer cap.",
  },
  {
    key: "monthlyLimit",
    label: "Monthly Limit",
    description: "Allow manager to change the monthly transfer cap.",
  },
  {
    key: "accountTypeOdRules",
    label: "Account-wise OD Rules",
    description: "Allow manager to edit OD limits and opening balances by account type.",
  },
  {
    key: "penaltyAmount",
    label: "Penalty Amount",
    description: "Allow manager to change the penalty charged after grace.",
  },
  {
    key: "interestRate",
    label: "Monthly OD Interest",
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
  classificationBenefits: {
    silver: {
      classificationScoreRatio: 0.5,
      interestDiscount: 0,
      maxAmountMultiplier: 1,
    },
    gold: {
      classificationScoreRatio: 0.75,
      interestDiscount: 0.5,
      maxAmountMultiplier: 1.25,
    },
    platinum: {
      classificationScoreRatio: 1,
      interestDiscount: 1,
      maxAmountMultiplier: 1.5,
    },
  },
};

const BusinessRules = () => {
  const toast = useToast();
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [loanRules, setLoanRules] = useState(defaultLoanRules);
  const [updatedAt, setUpdatedAt] = useState("");
  const [customers, setCustomers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [messageForm, setMessageForm] = useState(initialMessageForm);
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
            classificationBenefits: {
              ...defaultLoanRules.classificationBenefits,
              ...(config.loanRules?.classificationBenefits || {}),
            },
          });
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

  const updatePermission = (key, value) => {
    setPermissions((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const savePermissions = async () => {
    setIsSavingPermissions(true);

    try {
      const { data } = await api.patch("/business-rules", {
        managerTierPermissions: permissions,
        loanRules,
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
        classificationBenefits: {
          ...defaultLoanRules.classificationBenefits,
          ...(data.config.loanRules?.classificationBenefits || {}),
        },
      });
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

  const updateClassificationBenefit = (classification, field, value) => {
    setLoanRules((current) => ({
      ...current,
      classificationBenefits: {
        ...current.classificationBenefits,
        [classification]: {
          ...(current.classificationBenefits?.[classification] || {}),
          [field]: value,
        },
      },
    }));
  };

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

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="card-padded">
            <ShieldCheck className="text-blue-600" size={24} />
            <p className="mt-3 text-sm font-bold uppercase text-slate-500">
              Manager Permissions
            </p>
            <p className="mt-1 text-3xl font-bold text-slate-950">
              {permissionCount}/{permissionFields.length}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Tier fields currently open for manager edits.
            </p>
          </div>
          <div className="card-padded">
            <UserRound className="text-emerald-600" size={24} />
            <p className="mt-3 text-sm font-bold uppercase text-slate-500">
              Active Manager
            </p>
            <p className="mt-1 truncate text-2xl font-bold text-slate-950">
              {activeManager?.name || "Not assigned"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {activeManager?.email || "No manager account found"}
            </p>
          </div>
          <div className="card-padded">
            <Bell className="text-amber-600" size={24} />
            <p className="mt-3 text-sm font-bold uppercase text-slate-500">
              Last Updated
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-950">
              {updatedAt ? new Date(updatedAt).toLocaleDateString() : "Not updated"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Saved permissions apply to manager tier policy edits.
            </p>
          </div>
        </section>

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
              disabled={isSavingPermissions}
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
              disabled={isSavingPermissions}
              className="btn-primary"
            >
              <Save size={17} />
              {isSavingPermissions ? "Saving..." : "Save Loan Rules"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {(loanRules.loanTypes || []).map((rule) => (
              <article key={rule.key} className="rounded-xl border border-bank-card-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-950">{rule.label}</h3>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {rule.key}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="label-field">
                    Annual Interest (%)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rule.annualInterestRate}
                      onChange={(event) => updateLoanTypeRule(rule.key, "annualInterestRate", event.target.value)}
                      className="input-field"
                    />
                  </label>
                  <label className="label-field">
                    Minimum Amount
                    <input
                      type="number"
                      min="0"
                      value={rule.minAmount}
                      onChange={(event) => updateLoanTypeRule(rule.key, "minAmount", event.target.value)}
                      className="input-field"
                    />
                  </label>
                  <label className="label-field">
                    Maximum Amount
                    <input
                      type="number"
                      min="0"
                      value={rule.maxAmount}
                      onChange={(event) => updateLoanTypeRule(rule.key, "maxAmount", event.target.value)}
                      className="input-field"
                    />
                  </label>
                  <label className="label-field">
                    Tenure Range
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="1"
                        value={rule.minTenureMonths}
                        onChange={(event) => updateLoanTypeRule(rule.key, "minTenureMonths", event.target.value)}
                        className="input-field"
                        aria-label={`${rule.label} minimum tenure`}
                      />
                      <input
                        type="number"
                        min="1"
                        value={rule.maxTenureMonths}
                        onChange={(event) => updateLoanTypeRule(rule.key, "maxTenureMonths", event.target.value)}
                        className="input-field"
                        aria-label={`${rule.label} maximum tenure`}
                      />
                    </div>
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4">
            <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
              <h3 className="font-bold text-slate-950">Eligibility Score Weights</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(loanRules.scoreWeights || {}).map(([field, value]) => (
                  <label key={field} className="label-field">
                    {field.replace(/([A-Z])/g, " $1")}
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
                    {label}
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
          </div>

          <div className="mt-5 rounded-xl border border-bank-card-border bg-white p-4">
            <h3 className="font-bold text-slate-950">Classification Loan Benefits</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              These values are applied automatically from the customer classification assigned during customer creation.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {[
                ["silver", "Silver"],
                ["gold", "Gold"],
                ["platinum", "Platinum"],
              ].map(([classification, label]) => {
                const benefit = loanRules.classificationBenefits?.[classification] || {};

                return (
                  <article key={classification} className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <h4 className="font-bold text-slate-950">{label}</h4>
                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <label className="label-field">
                        Score Ratio
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={benefit.classificationScoreRatio ?? ""}
                          onChange={(event) =>
                            updateClassificationBenefit(
                              classification,
                              "classificationScoreRatio",
                              event.target.value
                            )
                          }
                          className="input-field bg-white"
                        />
                      </label>
                      <label className="label-field">
                        Interest Discount (%)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={benefit.interestDiscount ?? ""}
                          onChange={(event) =>
                            updateClassificationBenefit(
                              classification,
                              "interestDiscount",
                              event.target.value
                            )
                          }
                          className="input-field bg-white"
                        />
                      </label>
                      <label className="label-field">
                        Max Amount Multiplier
                        <input
                          type="number"
                          min="0.1"
                          step="0.05"
                          value={benefit.maxAmountMultiplier ?? ""}
                          onChange={(event) =>
                            updateClassificationBenefit(
                              classification,
                              "maxAmountMultiplier",
                              event.target.value
                            )
                          }
                          className="input-field bg-white"
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

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
      </PageContent>
    </DashboardLayout>
  );
};

export default BusinessRules;
