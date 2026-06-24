import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CheckCircle2,
  Clock3,
  Filter,
  Landmark,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";

const priorityMeta = {
  danger: {
    label: "Urgent",
    row: "border-red-100 bg-red-50/70",
    icon: "bg-red-100 text-red-700",
    badge: "bg-red-100 text-red-800",
  },
  warning: {
    label: "Needs Review",
    row: "border-amber-100 bg-amber-50/70",
    icon: "bg-amber-100 text-amber-700",
    badge: "bg-amber-100 text-amber-800",
  },
  success: {
    label: "Completed",
    row: "border-emerald-100 bg-emerald-50/70",
    icon: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800",
  },
  info: {
    label: "Information",
    row: "border-blue-100 bg-blue-50/70",
    icon: "bg-blue-100 text-blue-700",
    badge: "bg-blue-100 text-blue-800",
  },
};

const categoryMeta = {
  "approval.created": {
    label: "Approval Pending",
    group: "approvals",
    icon: Clock3,
    nextStep: "Manager review is in progress.",
  },
  "approval.approved": {
    label: "Approval Completed",
    group: "approvals",
    icon: ShieldCheck,
    nextStep: "No customer action is required.",
  },
  "approval.rejected": {
    label: "Approval Decision",
    group: "approvals",
    icon: AlertTriangle,
    nextStep: "Review the reason before retrying the transfer.",
  },
  "approval.rejected.customer": {
    label: "Transfer Rejected",
    group: "approvals",
    icon: AlertTriangle,
    nextStep: "Review the manager reason before creating a new request.",
  },
  "transfer.completed": {
    label: "Transfer Completed",
    group: "transfers",
    icon: ArrowLeftRight,
    nextStep: "The amount has been posted to the account.",
  },
  "transfer.own_account.completed": {
    label: "Own Transfer",
    group: "transfers",
    icon: ArrowLeftRight,
    nextStep: "The transfer is complete between your linked accounts.",
  },
  "overdraft.third_attempt": {
    label: "Overdraft Limit",
    group: "overdraft",
    icon: Landmark,
    nextStep: "Overdraft usage may be blocked until the next cycle.",
  },
  "overdraft.payoff.completed": {
    label: "Overdraft Paid",
    group: "overdraft",
    icon: Landmark,
    nextStep: "Your overdraft has been paid off. Keep this confirmation for records.",
  },
  "overdraft.payoff.partial": {
    label: "Overdraft Payoff",
    group: "overdraft",
    icon: Landmark,
    nextStep: "Review the remaining overdraft balance and plan the next payoff.",
  },
  "overdraft.used": {
    label: "Overdraft Used",
    group: "overdraft",
    icon: Landmark,
    nextStep: "Review the overdraft page for repayment and interest details.",
  },
  "tier.policy.updated.customer": {
    label: "Tier Policy",
    group: "account",
    icon: ShieldCheck,
    nextStep: "Review your latest tier and overdraft limits.",
  },
  "manual.message": {
    label: "Bank Message",
    group: "account",
    icon: MessageSquareText,
    nextStep: "Read the message and follow any instruction from the bank.",
  },
};

const filterOptions = [
  { value: "all", label: "All Alerts" },
  { value: "approvals", label: "Approvals" },
  { value: "transfers", label: "Transfers" },
  { value: "overdraft", label: "Overdraft" },
  { value: "account", label: "Account" },
];

const getPriorityMeta = (type) => priorityMeta[type] || priorityMeta.info;

const getCategoryMeta = (action) =>
  categoryMeta[action] || {
    label: "Account Update",
    group: "account",
    icon: Bell,
    nextStep: "Keep this update for your records.",
  };

const formatDateTime = (value) => {
  if (!value) return "Recently";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const getReferenceText = (notification) => {
  if (notification.entityType && notification.entityId) {
    return `${notification.entityType}: ${notification.entityId}`;
  }

  const metadata = notification.metadata || {};
  if (metadata.transactionId) return `Transaction: ${metadata.transactionId}`;
  if (metadata.approvalId) return `Approval: ${metadata.approvalId}`;
  if (metadata.accountNumber) return `Account: XXXX ${String(metadata.accountNumber).slice(-4)}`;

  return "";
};

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api
      .get("/notifications")
      .then(({ data }) => setNotifications(data.notifications || []))
      .catch(() => setNotifications([]));
  }, []);

  const summary = useMemo(() => {
    const needsReview = notifications.filter((notification) =>
      ["warning", "danger"].includes(notification.type)
    ).length;
    const completed = notifications.filter((notification) => notification.type === "success").length;
    const approvalAlerts = notifications.filter(
      (notification) => getCategoryMeta(notification.action).group === "approvals"
    ).length;

    return {
      total: notifications.length,
      needsReview,
      completed,
      approvalAlerts,
    };
  }, [notifications]);

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (filter === "all") return true;
        return getCategoryMeta(notification.action).group === filter;
      }),
    [filter, notifications]
  );

  const notificationPagination = usePaginatedRows(filteredNotifications);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Alerts"
          subtitle="Review transfer decisions, overdraft notices, and account messages from the bank."
        />

        <div className="stat-grid">
          <StatsCard
            title="Needs Review"
            value={summary.needsReview}
            icon={AlertTriangle}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            badge={{
              text: summary.needsReview > 0 ? "Check now" : "All clear",
              tone: summary.needsReview > 0 ? "warning" : "success",
            }}
          />
          <StatsCard
            title="Approval Updates"
            value={summary.approvalAlerts}
            icon={ShieldCheck}
            accent="bg-sky-500"
            iconTone="bg-sky-50 text-sky-600"
            badge={{ text: "Manager decisions", tone: "neutral" }}
          />
        </div>

        <SectionCard
          title="Alert Center"
          subtitle="Use filters to focus on the alerts that matter right now."
        >
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
              <Filter size={16} />
              Filter
            </span>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={filter === option.value ? "tab-pill-active" : "tab-pill-inactive"}
              >
                {option.label}
              </button>
            ))}
          </div>

          {notifications.length === 0 ? (
            <EmptyState message="No alerts yet. Transfer decisions, overdraft notices, and bank messages will appear here." />
          ) : filteredNotifications.length === 0 ? (
            <EmptyState message="No alerts match this filter." />
          ) : (
            <div className="space-y-3">
              {notificationPagination.pageRows.map((notification) => {
                const priority = getPriorityMeta(notification.type);
                const category = getCategoryMeta(notification.action);
                const Icon = category.icon;
                const reference = getReferenceText(notification);

                return (
                  <article
                    key={notification.id}
                    className={`rounded-xl border p-4 ${priority.row}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${priority.icon}`}
                      >
                        <Icon size={20} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-bold ${priority.badge}`}>
                                {priority.label}
                              </span>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                {category.label}
                              </span>
                            </div>
                            <h2 className="mt-3 text-lg font-bold leading-6 text-slate-950">
                              {notification.title}
                            </h2>
                          </div>

                          <div className="shrink-0 text-left sm:text-right">
                            <p className="text-sm font-bold text-slate-700">{notification.time}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {formatDateTime(notification.createdAt)}
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-700">
                          {notification.message}
                        </p>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,auto)]">
                          <div className="rounded-lg bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-white/70">
                            {category.nextStep}
                          </div>
                          {reference && (
                            <div className="rounded-lg bg-white/80 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-white/70 md:text-right">
                              {reference}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              <TablePagination {...notificationPagination} />
            </div>
          )}
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default Notifications;
