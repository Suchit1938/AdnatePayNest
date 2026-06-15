import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  CreditCard,
  Percent,
  Wallet,
} from "lucide-react";
import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import { useAuth } from "../../context/useAuth";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency, maskAccountNumber } from "../../data/mockData";
import { getCustomerAccounts } from "../../utils/overdraft";
import { getTransactionStatusLabel } from "../../utils/ui";

const Accounts = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const activeUser = user;
  const sourceAccounts = getCustomerAccounts(activeUser);

  const customerAccounts = sourceAccounts.map((sourceAccount) => ({
    key: sourceAccount.accountNumber || sourceAccount.accountType,
    label: `${sourceAccount.accountType || "Savings"} Account`,
    typeLabel: sourceAccount.accountType || "Savings",
    number: sourceAccount.accountNumber,
    bankName: sourceAccount.bankName,
    ifsc: sourceAccount.ifsc,
    balance: sourceAccount.balance || 0,
    availableBalance: sourceAccount.availableBalance ?? sourceAccount.balance ?? 0,
    transferLimit: sourceAccount.transferLimit || 0,
    overdraftLimit: sourceAccount.overdraftLimit || 0,
    overdraftUsed: sourceAccount.overdraftUsed || 0,
    odCountThisMonth: sourceAccount.odCountThisMonth || 0,
    odMonthlyUseLimit: sourceAccount.odMonthlyUseLimit ?? 3,
    odBlocked: sourceAccount.odBlocked || false,
    status: sourceAccount.accountStatus || sourceAccount.status || activeUser?.status || "active",
  }));

  const [selectedType, setSelectedType] = useState(customerAccounts[0]?.key || "");
  const activeAccountKey = selectedType || customerAccounts[0]?.key || "";
  const account =
    customerAccounts.find(({ key }) => key === activeAccountKey) || customerAccounts[0];

  const totalBalance = customerAccounts.reduce(
    (sum, currentAccount) => sum + Number(currentAccount.balance || 0),
    0
  );
  const totalOverdraftUsed = customerAccounts.reduce(
    (sum, currentAccount) => sum + Number(currentAccount.overdraftUsed || 0),
    0
  );
  const accountOdLimit = Number(account?.overdraftLimit || 0);
  const accountOdUsed = Number(account?.overdraftUsed || 0);
  const accountOdAvailable = Math.max(0, accountOdLimit - accountOdUsed);
  const accountOdPercent =
    accountOdLimit > 0 ? Math.round((accountOdUsed / accountOdLimit) * 100) : 0;

  useEffect(() => {
    api
      .get("/transfers/transactions")
      .then(({ data }) => setTransactions(data.transactions || []))
      .catch(() => setTransactions([]));
  }, []);

  const accountNumbers = customerAccounts.map((item) => item.number).filter(Boolean);
  const visibleAccountNumber = account?.number;
  const recentActivity = transactions
    .filter(
      (transaction) =>
        !visibleAccountNumber ||
        transaction.fromAccountNumber === visibleAccountNumber ||
        transaction.toAccountNumber === visibleAccountNumber
    )
    .map((transaction) => {
      const isDebit =
        transaction.sender === activeUser?.name ||
        accountNumbers.includes(transaction.fromAccountNumber);
      const isSelfTransaction = transaction.sender === transaction.receiver;
      const label = transaction.type === "overdraft-payoff" ? "Overdraft payoff" : "Transfer";
      const counterparty = isSelfTransaction
        ? maskAccountNumber(transaction.fromAccountNumber || account?.number)
        : isDebit
          ? transaction.receiver
          : transaction.sender;

      return {
        id: transaction.id,
        title: isSelfTransaction
          ? label
          : isDebit
            ? `${label} to ${counterparty}`
            : `${label} from ${counterparty}`,
        detail:
          transaction.remarks ||
          [
            transaction.fromAccountNumber &&
              `From ${maskAccountNumber(transaction.fromAccountNumber)}`,
            transaction.toAccountNumber &&
              `To ${maskAccountNumber(transaction.toAccountNumber)}`,
          ]
            .filter(Boolean)
            .join(" - "),
        amount: transaction.amount,
        date: transaction.date,
        type: isDebit ? "debit" : "credit",
        status: getTransactionStatusLabel(transaction.status),
      };
    });
  const recentActivityPagination = usePaginatedRows(recentActivity);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Accounts"
          subtitle={`View your current, salary, and saving accounts${account?.bankName ? ` at ${account.bankName}` : ""}.`}
        />

        <div className="stat-grid">
          <StatsCard
            title="Total Balance"
            value={formatCurrency(totalBalance)}
            icon={Wallet}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{
              text: `${customerAccounts.length} account${customerAccounts.length === 1 ? "" : "s"}`,
              tone: "neutral",
            }}
          />
          <StatsCard
            title="Active Account"
            value={formatCurrency(account?.balance || 0)}
            icon={CreditCard}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            footer={{ text: account?.typeLabel || "Account" }}
          />
          <StatsCard
            title="Per Transfer Limit"
            value={formatCurrency(account?.transferLimit || 0)}
            icon={Percent}
            accent="bg-violet-500"
            iconTone="bg-violet-50 text-violet-600"
            footer={{ text: "Based on your active account policy" }}
            badge={{ text: account?.status || "active", tone: "success" }}
          />
          <StatsCard
            title="OD Used"
            value={formatCurrency(totalOverdraftUsed)}
            icon={Wallet}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: "Across all accounts" }}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {customerAccounts.map((type) => (
            <button
              key={type.key}
              type="button"
              onClick={() => setSelectedType(type.key)}
              className={
                activeAccountKey === type.key ? "tab-pill-active" : "tab-pill-inactive"
              }
            >
              {type.typeLabel}
            </button>
          ))}
        </div>

        <section>
          <SectionCard>
            <span className="badge-pill bg-emerald-50 text-emerald-700 capitalize">
              {account?.status}
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {account?.label || "Account"}
            </h2>
            <p className="mt-2 text-slate-500">
              {account?.bankName || "Bank account"} - {maskAccountNumber(account?.number)} - IFSC {account?.ifsc}
            </p>

            <div className="metric-grid-3 mt-8">
              <MetricTile
                label="Available Balance"
                value={formatCurrency(account?.availableBalance || account?.balance || 0)}
                tone="accent"
              />
              <MetricTile
                label="Per Transfer Limit"
                value={formatCurrency(account?.transferLimit || 0)}
              />
              <MetricTile label="Account Type" value={account?.typeLabel || "Savings"} />
              <MetricTile
                label="OD Limit"
                value={formatCurrency(accountOdLimit)}
                tone="accent"
              />
              <MetricTile
                label="OD Used"
                value={formatCurrency(accountOdUsed)}
                tone={accountOdUsed > 0 ? "warning" : "success"}
              />
              <MetricTile
                label="OD Available"
                value={formatCurrency(accountOdAvailable)}
                tone={account?.odBlocked ? "danger" : "success"}
              />
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Account-level overdraft status
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Usage count: {account?.odCountThisMonth || 0} / {account?.odMonthlyUseLimit ?? 3} this month
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    account?.odBlocked
                      ? "bg-red-50 text-red-700"
                      : accountOdUsed > 0
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {account?.odBlocked ? "OD blocked" : accountOdUsed > 0 ? "OD active" : "OD available"}
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full ${
                    accountOdPercent >= 90
                      ? "bg-red-500"
                      : accountOdPercent >= 70
                        ? "bg-amber-500"
                        : "bg-blue-500"
                  }`}
                  style={{
                    width:
                      accountOdPercent > 0
                        ? `${Math.max(4, Math.min(100, accountOdPercent))}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          </SectionCard>
        </section>

        <section>
          <SectionCard
            title="Recent Activity"
            subtitle="Recent transfers and overdraft repayments for the selected account"
            icon={Clock3}
          >
            <div className="space-y-3">
              {recentActivityPagination.pageRows.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div
                    className={`rounded-lg p-2 ${
                      activity.type === "credit"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {activity.type === "credit" ? (
                      <ArrowDownLeft size={16} />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{activity.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[activity.date, activity.status, activity.detail]
                        .filter(Boolean)
                        .join(" - ")}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 font-bold ${
                      activity.type === "credit" ? "text-emerald-700" : "text-slate-900"
                    }`}
                  >
                    {activity.type === "credit" ? "+" : "-"}
                    {formatCurrency(activity.amount)}
                  </p>
                </div>
              ))}

              {recentActivity.length === 0 && (
                <EmptyState message="No recent activity yet. Transfers will appear here." />
              )}
            </div>
            <TablePagination {...recentActivityPagination} />
          </SectionCard>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default Accounts;
