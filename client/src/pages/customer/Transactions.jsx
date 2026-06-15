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
import { BANK_NAME, formatCurrency } from "../../data/mockData";
import { getTransactionStatusLabel } from "../../utils/ui";

const statusBadge = (status) => {
  const normalized = String(status).toLowerCase();
  if (normalized === "completed" || normalized === "success") {
    return "badge-pill bg-emerald-50 text-emerald-700";
  }
  if (normalized === "pending") {
    return "badge-pill bg-amber-50 text-amber-700";
  }
  return "badge-pill bg-slate-100 text-slate-600";
};

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);

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
  const transactionPagination = usePaginatedRows(transactions);

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
          title="Transaction History"
          subtitle={`All ${BANK_NAME} transfers linked to your account`}
        >
          {transactions.length === 0 ? (
            <EmptyState message="No transactions are available for this account." />
          ) : (
            <div className="table-shell">
              <table className="w-full text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Transaction ID</th>
                    <th className="px-6 py-4">Sender</th>
                    <th className="px-6 py-4">Receiver</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionPagination.pageRows.map((transaction) => (
                    <tr key={transaction.id} className="table-row">
                      <td className="px-6 py-4 font-semibold text-slate-900">{transaction.id}</td>
                      <td className="px-6 py-4 text-slate-700">{transaction.sender}</td>
                      <td className="px-6 py-4 text-slate-700">{transaction.receiver}</td>
                      <td className="px-6 py-4">
                        <span className={statusBadge(transaction.status)}>
                          {getTransactionStatusLabel(transaction.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {formatCurrency(transaction.amount)}
                      </td>
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
