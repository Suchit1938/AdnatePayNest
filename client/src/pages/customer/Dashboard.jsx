import {
  ArrowLeftRight,
  Clock,
  CreditCard,
  ExternalLink,
  Landmark,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import DashboardLayout from "../../layouts/DashboardLayout";
import StatsCard from "../../components/dashboard/StatsCard";
import ChartTooltip from "../../components/ui/ChartTooltip";
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { useAuth } from "../../context/useAuth";
import { BANK_NAME, formatCurrency, maskAccountNumber } from "../../data/mockData";
import { getCustomerAccounts, getCustomerOverdraftSummary } from "../../utils/overdraft";
import { getTierTone } from "../../utils/ui";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accounts = getCustomerAccounts(user);
  const totalBalance = accounts.reduce(
    (sum, currentAccount) => sum + Number(currentAccount.balance || 0),
    0
  );
  const { overdraftLimit, overdraftUsed, availableOverdraft } =
    getCustomerOverdraftSummary(user);
  const pendingRequests = user?.pendingRequests || 0;
  const highestBalance = Math.max(
    ...accounts.map((account) => Number(account.balance || 0)),
    1
  );
  const overdraftPercent =
    overdraftLimit > 0 ? Math.round((overdraftUsed / overdraftLimit) * 100) : 0;

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title={`Account Overview${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
          subtitle={`Review balances, transfers, overdraft health, and account details for ${BANK_NAME}.`}
        >
          <div className="stat-chip">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Customer ID
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {user?.customerId || "Not assigned"}
              <span className="font-normal text-slate-400">
                {" "}
                - {accounts.length} account{accounts.length === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </PageHeader>

        <div className="stat-grid-4">
          <StatsCard
            title="Available Balance"
            value={formatCurrency(totalBalance)}
            icon={Wallet}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{
              text: `${accounts.length} linked account${accounts.length === 1 ? "" : "s"}`,
              tone: "success",
            }}
          />

          <StatsCard
            title="Pending Requests"
            value={String(pendingRequests).padStart(2, "0")}
            icon={Clock}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            badge={
              pendingRequests > 0
                ? { text: "Awaiting approval", tone: "warning" }
                : { text: "No pending items", tone: "success" }
            }
          />

          <StatsCard
            title="Total Transfers"
            value={user?.totalTransfers || 0}
            icon={ArrowLeftRight}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            badge={{ text: "Lifetime count", tone: "neutral" }}
          />

          <StatsCard
            title="Available Overdraft"
            value={formatCurrency(availableOverdraft)}
            icon={Landmark}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
            badge={{
              text: user?.classification
                ? `${user.classification} tier`
                : "Standard tier",
              tone: "neutral",
            }}
          />
        </div>

        <section className="section-split">
          <SectionCard
            className="section-split-main"
            title="Balance Overview"
            subtitle="Linked account balances and overdraft usage"
            icon={CreditCard}
          >
            <div className="space-y-4">
              {accounts.map((account) => {
                const balance = Number(account.balance || 0);
                const width =
                  balance > 0 ? Math.max(6, Math.round((balance / highestBalance) * 100)) : 0;

                return (
                  <div
                    key={account.accountNumber || account.accountType}
                    className="group relative rounded-lg outline-none"
                    tabIndex={0}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {account.accountType || "Savings"} Account
                        </p>
                        <p className="text-xs text-slate-500">
                          {maskAccountNumber(account.accountNumber)}
                        </p>
                      </div>
                      <p className="shrink-0 font-bold text-slate-900">
                        {formatCurrency(balance)}
                      </p>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-bank-accent"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <ChartTooltip
                      label={`${account.accountType || "Savings"} Account`}
                      value={formatCurrency(balance)}
                      detail={`${maskAccountNumber(account.accountNumber)} | ${width}% of highest linked balance`}
                      className="bottom-full right-0 mb-2 hidden group-hover:block group-focus:block"
                    />
                  </div>
                );
              })}

              {accounts.length === 0 && (
                <p className="rounded-xl bg-bank-surface p-4 text-sm font-semibold text-slate-500">
                  No linked account details available.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Overdraft Health"
            subtitle="Current tier based facility"
            icon={ShieldCheck}
          >
            <div className="group relative mx-auto h-44 w-44 rounded-full outline-none" tabIndex={0}>
              <div
                className="grid h-full w-full place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#f59e0b 0 ${overdraftPercent}%, #e0eef9 ${overdraftPercent}% 100%)`,
                }}
              >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center">
                <div>
                  <p className="text-3xl font-bold text-slate-900">{overdraftPercent}%</p>
                  <p className="text-xs font-semibold uppercase text-slate-500">Used</p>
                </div>
              </div>
              </div>
              <ChartTooltip
                label="Overdraft Health"
                value={`${overdraftPercent}% used`}
                detail={`${formatCurrency(overdraftUsed)} used of ${formatCurrency(overdraftLimit)} limit`}
                className="left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 group-hover:block group-focus:block"
              />
            </div>

            <div className="mt-6 space-y-3">
              <MetricTile label="Limit" value={formatCurrency(overdraftLimit)} />
              <MetricTile
                label="Due Now"
                value={formatCurrency(overdraftUsed)}
                tone={overdraftUsed > 0 ? "warning" : "success"}
              />
            </div>
          </SectionCard>
        </section>

        <SectionCard title="Customer Details" subtitle="Verified profile and account summary">
          <div className="metric-grid-3">
            <MetricTile label="Customer ID" value={user?.customerId || "Not assigned"} />
            <div className="metric-tile border-bank-card-border bg-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Tier
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold capitalize ${getTierTone(user?.classification).badge}`}>
                  {user?.classification || "Standard"}
                </span>
                <button
                  type="button"
                  onClick={() => navigate("/overdraft#tier-policy")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                >
                  View tier details
                  <ExternalLink size={13} />
                </button>
              </div>
            </div>
            <MetricTile label="Status" value={user?.status || "active"} tone="success" />
          </div>
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default Dashboard;
