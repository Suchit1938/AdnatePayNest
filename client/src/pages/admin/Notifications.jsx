import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Filter,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";

const toneClassNames = {
  info: "border-blue-100 bg-blue-50/70",
  success: "border-emerald-100 bg-emerald-50/80",
  warning: "border-amber-100 bg-amber-50/80",
  danger: "border-red-100 bg-red-50/80",
};

const iconByAction = {
  "approval.created": AlertTriangle,
  "approval.approved": ShieldCheck,
  "approval.rejected": AlertTriangle,
  "customer.created": Bell,
  "overdraft.third_attempt": Clock3,
};

const getIconByAction = (action) =>
  String(action || "").startsWith("deposit.")
    ? Clock3
    : iconByAction[action] || Bell;

const iconToneByType = {
  info: "bg-blue-100 text-blue-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
};

const actionLabels = {
  "approval.created": "Approval Escalation",
  "approval.approved": "Manager Decision",
  "approval.rejected": "Manager Decision",
  "customer.created": "Customer",
  "overdraft.third_attempt": "Overdraft",
};

const getActionLabel = (action) =>
  String(action || "").startsWith("deposit.")
    ? "Deposit Approval"
    : actionLabels[action] || "System";

const priorityLabels = {
  danger: "Critical",
  warning: "Warning",
  success: "Completed",
  info: "Information",
};

const AdminNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [typeFilterDraft, setTypeFilterDraft] = useState("all");

  useEffect(() => {
    api
      .get("/notifications")
      .then(({ data }) => setNotifications(data.notifications || []))
      .catch(() => setNotifications([]));
  }, []);

  const summary = useMemo(
    () => ({
      total: notifications.length,
      escalations: notifications.filter(
        (notification) =>
          notification.action === "approval.created" ||
          notification.action === "overdraft.third_attempt" ||
          String(notification.action || "").includes(".requested.admin")
      ).length,
      managerDecisions: notifications.filter((notification) =>
        ["approval.approved", "approval.rejected"].includes(notification.action) ||
        /^deposit\..*\.(approved|rejected)\.admin$/.test(notification.action || "")
      ).length,
      odAlerts: notifications.filter(
        (notification) => notification.action === "overdraft.third_attempt"
      ).length,
    }),
    [notifications]
  );
  const typeFilterOptions = useMemo(
    () => [...new Set(notifications.map((notification) => notification.type).filter(Boolean))],
    [notifications]
  );
  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (typeFilter !== "all" && notification.type !== typeFilter) return false;

        return true;
      }),
    [notifications, typeFilter]
  );
  const notificationPagination = usePaginatedRows(filteredNotifications);
  const applyEventFilter = () => setTypeFilter(typeFilterDraft);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Notifications"
          title="Notifications"
          subtitle="Track overdraft escalations, approval requests, and manager decisions."
        />

        <div className="stat-grid">
          <StatsCard
            title="Action Required"
            value={summary.escalations}
            icon={AlertTriangle}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
          />
          <StatsCard
            title="Overdraft Risk Alerts"
            value={summary.odAlerts}
            icon={Clock3}
            accent="bg-red-500"
            iconTone="bg-red-50 text-red-600"
          />
        </div>

        <section className="table-shell">
          <div className="border-b border-bank-card-border p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
                <Bell size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-950">Admin Event Stream</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Recent notification events from transfer approvals, overdraft monitoring, and manager actions.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <label className="w-full sm:w-72">
                <span className="text-sm font-semibold text-slate-700">Priority</span>
                <select
                  value={typeFilterDraft}
                  onChange={(event) => setTypeFilterDraft(event.target.value)}
                  className="input-field mt-2 bg-white"
                >
                  <option value="all">All priorities</option>
                  {typeFilterOptions.map((type) => (
                    <option key={type} value={type}>
                      {priorityLabels[type] || type}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={applyEventFilter}
                className="btn-primary px-4 py-2"
              >
                <Filter size={16} />
                Apply Filter
              </button>
            </div>

            {notifications.length === 0 ? (
              <EmptyState message="No admin notifications yet. Overdraft escalations, approval requests, and manager decisions will appear here." />
            ) : filteredNotifications.length === 0 ? (
              <EmptyState message="No system events match the selected filters." />
            ) : (
              <div className="space-y-4">
                {notificationPagination.pageRows.map((notification) => {
                  const Icon = getIconByAction(notification.action);

                  return (
                    <article
                      key={notification.id}
                      className={`rounded-xl border p-4 ${toneClassNames[notification.type] || "border-slate-100 bg-white"}`}
                    >
                      <div className="flex gap-4">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconToneByType[notification.type] || "bg-slate-100 text-slate-600"}`}
                        >
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase text-slate-500">
                                {getActionLabel(notification.action)}
                              </p>
                              <h3 className="mt-1 text-lg font-bold text-slate-950">
                                {notification.title}
                              </h3>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">
                              {notification.time}
                            </span>
                          </div>
                          <p className="mt-2 leading-6 text-slate-700">
                            {notification.message}
                          </p>
                          {notification.entityId && (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                              <CheckCircle2 size={14} />
                              {notification.entityType}: {notification.entityId}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
                <TablePagination {...notificationPagination} />
              </div>
            )}
          </div>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default AdminNotifications;
