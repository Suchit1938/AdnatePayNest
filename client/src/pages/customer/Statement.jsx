import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, FileText } from "lucide-react";
import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency } from "../../data/mockData";
import { useAuth } from "../../context/useAuth";
import { downloadPdf as downloadPdfFile } from "../../utils/pdfExport";
import { getTransactionStatusLabel } from "../../utils/ui";

const Statement = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState("All");
  const [statementEntries, setStatementEntries] = useState([]);

  useEffect(() => {
    api.get("/transfers/transactions").then(({ data }) => {
      setStatementEntries(
        data.transactions.map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          detail:
            transaction.sender === user?.name
              ? `Transfer to ${transaction.receiver}`
              : `Transfer from ${transaction.sender}`,
          type: transaction.sender === user?.name ? "Debit" : "Credit",
          amount: transaction.amount,
          status: transaction.status,
        }))
      );
    });
  }, [user?.name]);

  const filteredStatements = useMemo(() => {
    if (filter === "All") {
      return statementEntries;
    }

    return statementEntries.filter((statement) => statement.type === filter);
  }, [filter, statementEntries]);

  const creditCount = useMemo(
    () => statementEntries.filter((entry) => entry.type === "Credit").length,
    [statementEntries]
  );
  const debitCount = useMemo(
    () => statementEntries.filter((entry) => entry.type === "Debit").length,
    [statementEntries]
  );

  const statementRows = filteredStatements.map((statement) => ({
    Date: statement.date,
    Details: statement.detail,
    Type: statement.type,
    Amount: formatCurrency(statement.amount),
    Status: getTransactionStatusLabel(statement.status),
  }));
  const statementPagination = usePaginatedRows(filteredStatements);

  const downloadCsv = () => {
    try {
      const headers = ["Date", "Details", "Type", "Amount", "Status"];
      const escapeCell = (value) => {
        const text = String(value ?? "");
        return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const csv = [
        headers.join(","),
        ...statementRows.map((row) =>
          headers.map((header) => escapeCell(row[header])).join(",")
        ),
      ].join("\n");
      const file = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");

      link.href = url;
      link.download = `statement-${filter.toLowerCase()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Statement CSV downloaded.");
    } catch {
      toast.error("Unable to download statement CSV. Please try again.");
    }
  };

  const downloadPdf = () => {
    try {
      downloadPdfFile(`statement-${filter.toLowerCase()}.pdf`, "Account Statement", statementRows, {
        headers: ["Date", "Details", "Type", "Status", "Amount"],
        subtitle: `Filter: ${filter}`,
      });
      toast.success("Statement PDF downloaded.");
    } catch {
      toast.error("Unable to download statement PDF. Please try again.");
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader title="Statement" subtitle="Review credits and debits from your account.">
          <div className="flex overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm">
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-bank-surface"
            >
              <Download size={16} />
              CSV
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              className="inline-flex items-center gap-2 border-l border-bank-card-border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-bank-surface"
            >
              <Download size={16} />
              PDF
            </button>
          </div>
        </PageHeader>

        <div className="stat-grid">
          <StatsCard
            title="Total Entries"
            value={statementEntries.length}
            icon={FileText}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
            badge={{ text: filter === "All" ? "All types" : filter, tone: "neutral" }}
          />
          <StatsCard
            title="Credits"
            value={creditCount}
            icon={ArrowDownLeft}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
            badge={{ text: "Incoming", tone: "success" }}
          />
          <StatsCard
            title="Debits"
            value={debitCount}
            icon={ArrowUpRight}
            accent="bg-red-500"
            iconTone="bg-red-50 text-red-600"
            badge={{ text: "Outgoing", tone: "neutral" }}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {["All", "Credit", "Debit"].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={filter === type ? "tab-pill-active" : "tab-pill-inactive"}
            >
              {type}
            </button>
          ))}
        </div>

        <SectionCard title="Account Statement" subtitle="Filtered transaction entries">
          {filteredStatements.length === 0 ? (
            <EmptyState message="No statement entries for this filter." />
          ) : (
            <div className="table-shell">
              <table className="w-full text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Details</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statementPagination.pageRows.map((statement) => (
                    <tr key={statement.id} className="table-row">
                      <td className="px-6 py-4 text-slate-600">{statement.date}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{statement.detail}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`badge-pill ${
                            statement.type === "Credit"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {statement.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 capitalize text-slate-600">
                        {getTransactionStatusLabel(statement.status)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {formatCurrency(statement.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination {...statementPagination} />
            </div>
          )}
        </SectionCard>
      </PageContent>
    </DashboardLayout>
  );
};

export default Statement;
