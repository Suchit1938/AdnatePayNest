import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarClock, PiggyBank } from "lucide-react";

import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import DashboardLayout from "../../layouts/DashboardLayout";
import FixedDeposits from "../FixedDeposits";
import RecurringDeposits from "./RecurringDeposits";

const depositTabs = [
  { key: "fixed", label: "Fixed Deposits", icon: PiggyBank },
  { key: "recurring", label: "Recurring Deposits", icon: CalendarClock },
];

const getInitialTab = (location, defaultTab = "fixed") => {
  const tab = new URLSearchParams(location.search).get("tab");

  if (tab === "rd" || tab === "recurring") return "recurring";
  if (tab === "fd" || tab === "fixed") return "fixed";
  return defaultTab;
};

const Deposits = ({ defaultTab = "fixed" }) => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => getInitialTab(location, defaultTab));
  const activeLabel = useMemo(
    () => depositTabs.find((tab) => tab.key === activeTab)?.label || "Deposits",
    [activeTab]
  );

  useEffect(() => {
    setActiveTab(getInitialTab(location, defaultTab));
  }, [defaultTab, location]);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Customer / Deposits"
          title="Deposits"
          subtitle="Create and manage fixed deposits and recurring deposits from one place."
        />

        <div className="flex flex-wrap gap-2 rounded-2xl border border-bank-card-border bg-white p-3 shadow-sm">
            {depositTabs.map(({ key, label, icon: Icon }) => {
              const isActive = activeTab === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-bank-sidebar text-white shadow-sm hover:bg-bank-sidebar-hover"
                      : "text-slate-600 hover:bg-bank-surface hover:text-bank-eyebrow"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </button>
              );
            })}
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
          Viewing {activeLabel}. Switch tabs to manage the other deposit product.
        </div>

        {activeTab === "fixed" ? <FixedDeposits embedded /> : <RecurringDeposits embedded />}
      </PageContent>
    </DashboardLayout>
  );
};

export default Deposits;
