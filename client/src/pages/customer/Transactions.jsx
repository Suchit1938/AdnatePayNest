import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CheckCircle2, Clock } from "lucide-react";
import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";
import { BANK_NAME, formatCurrency, maskAccountNumber } from "../../data/mockData";
import { getCustomerAccounts } from "../../utils/overdraft";
import { getTransactionStatusLabel } from "../../utils/ui";

const statusBadge = (status) => {
  const normalized = String(status).toLowerCase();
  if (normalized === "completed" || normalized === "success") {
    return "badge-pill bg-emerald-50 text-emerald-700";
  }
  if (normalized === "pending") {
    return "badge-pill bg-amber-50 text-amber-700";
  }
  if (normalized === "failed") {
    return "badge-pill bg-red-50 text-red-700";
  }
  return "badge-pill bg-slate-100 text-slate-600";
};

const formatAccount = (accountNumber) =>
  accountNumber ? maskAccountNumber(accountNumber) : "Not available";

const formatTransactionType = (type) =>
  String(type || "bank-transfer").replaceAll("-", " ").toUpperCase();

const isOverdraftPayoff = (transaction) => transaction.type === "overdraft-payoff";

const getApprovalBadge = (transaction) => {
  if (transaction.approvalStatus === "approved") return "Manager Approved";
  if (transaction.approvalStatus === "rejected") return "Manager Rejected";
  return "";
};

const Transactions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const accounts = useMemo(() => getCustomerAccounts(user), [user]);
  const accountByNumber = useMemo(
    () =>
      accounts.reduce((map, account) => {
        if (account.accountNumber) {
          map.set(String(account.accountNumber), account);
        }

        return map;
      }, new Map()),
    [accounts]
  );

  useEffect(() => {
    api
      .get("/transfers/transactions")
      .then(({ data }) => setTransactions(data.transactions))
      .catch(() => setTransactions([]));
  }, []);

  const completedCount = useMemo(
    () =>
      transactions.filter((transaction) => {
        const status = String(transaction.status).toLowerCase();
        return status === "completed" || status === "success";
      }).length,
    [transactions]
  );
  const pendingCount = useMemo(
    () =>
      transactions.filter(
        (transaction) => String(transaction.status).toLowerCase() === "pending"
      ).length,
    [transactions]
  );
  const statementRows = useMemo(() => {
    const customerAccounts = new Set(accounts.map((account) => String(account.accountNumber)));
    const runningBalances = accounts.reduce((map, account) => {
      if (account.accountNumber) {
        map.set(String(account.accountNumber), Number(account.balance || 0));
      }

      return map;
    }, new Map());
    const sortedTransactions = [...transactions].sort(
      (left, right) => new Date(right.createdAt || right.date || 0) - new Date(left.createdAt || left.date || 0)
    );

    return sortedTransactions.map((transaction) => {
      const fromAccount = String(transaction.fromAccountNumber || "");
      const toAccount = String(transaction.toAccountNumber || "");
      const fromIsCustomer = customerAccounts.has(fromAccount);
      const toIsCustomer = customerAccounts.has(toAccount);
      const isSuccessful = ["success", "completed"].includes(String(transaction.status).toLowerCase());
      const isPayoff = isOverdraftPayoff(transaction);
      const isOwnTransfer = fromIsCustomer && toIsCustomer && !isPayoff;
      const isDebit = fromIsCustomer;
      const isCredit = !isOwnTransfer && toIsCustomer;
      const balanceAccount = isDebit ? fromAccount : isCredit ? toAccount : "";
      const balanceAfter =
        isSuccessful && balanceAccount && runningBalances.has(balanceAccount)
          ? runningBalances.get(balanceAccount)
          : null;
      const accountType =
        accountByNumber.get(balanceAccount)?.accountType ||
        accountByNumber.get(fromAccount)?.accountType ||
        accountByNumber.get(toAccount)?.accountType ||
        "Account";

      if (isSuccessful && balanceAccount && runningBalances.has(balanceAccount)) {
        const currentBalance = runningBalances.get(balanceAccount);
        runningBalances.set(
          balanceAccount,
          isDebit ? currentBalance + Number(transaction.amount || 0) : currentBalance - Number(transaction.amount || 0)
        );
      }

      return {
        ...transaction,
        dateDisplay: transaction.createdAt
          ? new Date(transaction.createdAt).toISOString().slice(0, 10)
          : transaction.date || "Recently",
        title: isPayoff
          ? "Overdraft payoff"
          : isOwnTransfer
          ? "Own account transfer"
          : isDebit
            ? `Transfer to ${transaction.receiver || "Receiver"}`
            : `Transfer from ${transaction.sender || "Sender"}`,
        accountType,
        debit: isDebit && !isCredit && isSuccessful ? Number(transaction.amount || 0) : 0,
        credit: isCredit && isSuccessful ? Number(transaction.amount || 0) : 0,
        balanceAfter: balanceAfter === null ? null : Math.max(0, balanceAfter),
        isPosted: isSuccessful,
        approvalBadge: getApprovalBadge(transaction),
      };
    });
  }, [accountByNumber, accounts, transactions]);
  const transactionPagination = usePaginatedRows(statementRows);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Transactions"
          subtitle={`Recent ${BANK_NAME} transaction activity.`}
        />

        <div className="stat-grid">
          <StatsCard
            title="Total Transactions"
            value={transactions.length}
            icon={ArrowLeftRight}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: "All activity", tone: "neutral" }}
          />
          <StatsCard
            title="Completed"
            value={completedCount}
            icon={CheckCircle2}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            badge={{ text: "Successful", tone: "success" }}
          />
          <StatsCard
            title="Pending"
            value={pendingCount}
            icon={Clock}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            badge={{
              text: pendingCount > 0 ? "In progress" : "All clear",
              tone: pendingCount > 0 ? "warning" : "success",
            }}
          />
        </div>

        <SectionCard
          title="Transaction Activity"
          subtitle={`Statement-style view of ${BANK_NAME} transfers linked to your account`}
        >
          {transactions.length === 0 ? (
            <EmptyState message="No transactions are available for this account." />
          ) : (
            <div className="table-shell">
              <table className="w-full table-fixed text-left">
                <thead className="table-head">
                  <tr>
                    <th className="w-[14%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                      Date
                    </th>
                    <th className="w-[38%] px-3 py-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                      Details
                    </th>
                    <th className="w-[16%] px-3 py-4 text-right text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                      Debit
                    </th>
                    <th className="w-[16%] px-3 py-4 text-right text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                      Credit
                    </th>
                    <th className="w-[16%] px-3 py-4 text-right text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactionPagination.pageRows.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-slate-100 align-middle last:border-b-0">
                      <td className="px-3 py-7 align-middle sm:px-5">
                        <p className="break-words text-base font-semibold leading-6 text-slate-700">
                          {transaction.dateDisplay}
                        </p>
                      </td>
                      <td className="px-3 py-7 sm:px-5">
                        <p className="break-words text-base font-bold text-slate-950">
                          {transaction.title}
                        </p>
                        <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">
                          {transaction.accountType} account | From{" "}
                          {formatAccount(transaction.fromAccountNumber)} | To{" "}
                          {formatAccount(transaction.toAccountNumber)} | Ref {transaction.id}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={statusBadge(transaction.status)}>
                            {getTransactionStatusLabel(transaction.status)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-500">
                            {formatTransactionType(transaction.type)}
                          </span>
                          {transaction.approvalBadge && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                transaction.approvalStatus === "approved"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {transaction.approvalBadge}
                            </span>
                          )}
                        </div>
                        {transaction.approvalStatus === "approved" && (
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            Approved by {transaction.approvalReviewedBy || "manager"}
                            {transaction.approvalId ? ` | Approval ${transaction.approvalId}` : ""}
                          </p>
                        )}
                      </td>
                      {transaction.failureReason ? (
                        <td colSpan={3} className="px-3 py-7 align-middle sm:px-5">
                          <div className="ml-auto max-w-xl rounded-lg bg-red-50 px-4 py-3 text-left">
                            <span className="mb-1 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-700 ring-1 ring-red-100">
                              Manager Reason
                            </span>
                            <p className="text-sm font-semibold leading-6 text-red-700">
                              {transaction.failureReason}
                            </p>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-7 text-right align-middle sm:px-5">
                            {transaction.debit > 0 ? (
                              <p className="whitespace-nowrap text-base font-bold text-red-700">
                                {formatCurrency(transaction.debit)}
                              </p>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-7 text-right align-middle sm:px-5">
                            {transaction.credit > 0 ? (
                              <p className="whitespace-nowrap text-base font-bold text-emerald-700">
                                {formatCurrency(transaction.credit)}
                              </p>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-7 text-right align-middle sm:px-5">
                            {transaction.balanceAfter !== null ? (
                              <p className="whitespace-nowrap text-base font-bold text-slate-950">
                                {formatCurrency(transaction.balanceAfter)}
                              </p>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination {...transactionPagination} />
            </div>
          )}
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default Transactions;
