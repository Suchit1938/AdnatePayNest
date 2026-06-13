import { useEffect, useState } from "react";
import { Bell, Flag } from "lucide-react";
import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";

const toneClassNames = {
  success: "border-emerald-200/80 bg-emerald-50/80",
  warning: "border-amber-200/80 bg-amber-50/80",
  danger: "border-red-200/80 bg-red-50/80",
  error: "border-red-200/80 bg-red-50/80",
};

const badgeClassNames = {
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
};

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api
      .get("/notifications")
      .then(({ data }) => setNotifications(data.notifications || []))
      .catch(() => setNotifications([]));
  }, []);

  const unreadCount = notifications.filter(
    (notification) => notification.type === "warning" || notification.type === "danger"
  ).length;
  const notificationPagination = usePaginatedRows(notifications);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader title="Notifications" subtitle="Track your latest banking alerts." />

        <div className="stat-grid">
          <StatsCard
            title="Total Alerts"
            value={notifications.length}
            icon={Bell}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: "From database", tone: "neutral" }}
          />
          <StatsCard
            title="Action Required"
            value={unreadCount}
            icon={Flag}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            badge={{
              text: unreadCount > 0 ? `${unreadCount} open` : "All clear",
              tone: unreadCount > 0 ? "warning" : "success",
            }}
          />
        </div>

        <SectionCard title="All Alerts" subtitle="Your latest banking notifications">
          {notifications.length === 0 ? (
            <EmptyState message="No notifications yet. Activity will appear here as it happens." />
          ) : (
            <div className="space-y-4">
              {notificationPagination.pageRows.map((notification) => (
                <div
                  key={notification.id}
                  className={`activity-item ${
                    toneClassNames[notification.type] ?? "border-slate-200"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
                    <Bell size={18} className="text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2 className="text-lg font-bold text-slate-900">{notification.title}</h2>
                      <span
                        className={`badge-pill shrink-0 ${
                          badgeClassNames[notification.type] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {notification.time}
                      </span>
                    </div>
                    <p className="mt-2 text-slate-600">{notification.message}</p>
                  </div>
                </div>
              ))}
              <TablePagination {...notificationPagination} />
            </div>
          )}
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default Notifications;
