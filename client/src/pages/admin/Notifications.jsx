import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  UserPlus,
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
  "customer.created": UserPlus,
  "overdraft.third_attempt": Clock3,
};

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

const AdminNotifications = () => {
  const [notifications, setNotifications] = useState([]);

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
          notification.action === "overdraft.third_attempt"
      ).length,
      managerDecisions: notifications.filter((notification) =>
        ["approval.approved", "approval.rejected"].includes(notification.action)
      ).length,
      newCustomers: notifications.filter(
        (notification) => notification.action === "customer.created"
      ).length,
    }),
    [notifications]
  );
  const notificationPagination = usePaginatedRows(notifications);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Notifications"
          title="Notifications"
          subtitle="Track OD escalations, manager decisions, and customer registration events."
        />

        <div className="stat-grid-4">
          <StatsCard
            title="Total Alerts"
            value={summary.total}
            icon={Bell}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
          />
          <StatsCard
            title="Escalations"
            value={summary.escalations}
            icon={AlertTriangle}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
          />
          <StatsCard
            title="Manager Decisions"
            value={summary.managerDecisions}
            icon={ShieldCheck}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
          />
          <StatsCard
            title="New Customers"
            value={summary.newCustomers}
            icon={UserPlus}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
          />
        </div>

        <section className="table-shell">
          <div className="border-b border-bank-card-border p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
                <Bell size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-950">Admin Alert Stream</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Recent notification events from transfer approvals, overdraft monitoring, and user onboarding.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {notifications.length === 0 ? (
              <EmptyState message="No admin notifications yet. OD escalations, manager decisions, and new customer registrations will appear here." />
            ) : (
              <div className="space-y-4">
                {notificationPagination.pageRows.map((notification) => {
                  const Icon = iconByAction[notification.action] || Bell;

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
                                {actionLabels[notification.action] || "System"}
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
