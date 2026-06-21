import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeIndianRupee,
  CircleDollarSign,
  FileBarChart,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import StatsCard from "../dashboard/StatsCard";
import EmptyState from "../ui/EmptyState";
import PageContent from "../ui/PageContent";
import PageHeader from "../ui/PageHeader";
import { RechartsColumn, RechartsHorizontalBar } from "../ui/RechartsReports";
import SectionCard from "../ui/SectionCard";
import TablePagination from "../ui/TablePagination";
import usePaginatedRows from "../ui/usePaginatedRows";
import { formatCurrency, maskAccountNumber } from "../../utils/format";
import { getTransactionStatusLabel } from "../../utils/ui";

const defaultSettlementReport = {
  settlement: {
    account: {
      accountName: "Adnate Bank Settlement Account",
      accountNumber: "BANK-SETTLEMENT-0001",
      balance: 0,
      openingBalance: 0,
      minimumReserve: 0,
      availableForDisbursement: 0,
    },
    totals: {
      totalLoanDisbursed: 0,
      totalLoanCollected: 0,
      totalOdRecovered: 0,
      settlementTransactionCount: 0,
    },
  },
  rows: [],
  monthlyRows: [],
  typeRows: [],
};

const toNumber = (value) => Number(value || 0);

const formatCompactCurrency = (value) => {
  const num = toNumber(value);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: num >= 100000 ? "compact" : "standard",
  }).format(num);
  return formatted.replace(/INR|Rs\./g, "₹").trim();
};

const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "Not available";

const formatType = (value) =>
  String(value || "settlement")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatAccount = (value) => (value ? maskAccountNumber(value) : "");

const statusClass = (status) => {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "success" || normalized === "completed") return "bg-emerald-50 text-emerald-700";
  if (normalized === "failed") return "bg-red-50 text-red-700";
  if (normalized === "pending") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
};

const SettlementReportView = ({ mode = "admin", embedded = false }) => {
  const [report, setReport] = useState(defaultSettlementReport);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    api
      .get("/dashboard/settlement-report")
      .then(({ data }) => {
        if (isMounted) setReport({ ...defaultSettlementReport, ...data });
      })
      .catch(() => {
        if (isMounted) setReport(defaultSettlementReport);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const account = report.settlement.account;
  const totals = report.settlement.totals;
  const totalRecovered = toNumber(totals.totalLoanCollected) + toNumber(totals.totalOdRecovered);
  const monthlyNetRows = useMemo(
    () =>
      report.monthlyRows.map((row) => ({
        label: row.label,
        value: row.net,
        color: row.net >= 0 ? "#10b981" : "#ef4444",
      })),
    [report.monthlyRows]
  );
  const typeRows = useMemo(
    () =>
      report.typeRows.map((row, index) => ({
        label: formatType(row.label),
        value: row.amount,
        color: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"][index % 5],
      })),
    [report.typeRows]
  );
  const ledgerPagination = usePaginatedRows(report.rows);

  const content = (
    <>
      {!embedded && (
        <PageHeader
          eyebrow={mode === "admin" ? "Admin / Treasury" : "Manager / Treasury"}
          title="Settlement Account Report"
          subtitle="Bank-side liquidity, loan disbursal, EMI collection, OD recovery, and settlement ledger history."
        />
      )}

      <div className="stat-grid">
        <StatsCard
          title="Settlement Balance"
          value={formatCurrency(account.balance)}
          icon={ShieldCheck}
          accent="bg-blue-500"
          iconTone="bg-blue-50 text-blue-600"
          footer={{ text: account.accountNumber }}
        />
        <StatsCard
          title="Available Lending Funds"
          value={formatCurrency(account.availableForDisbursement)}
          icon={Landmark}
          accent="bg-emerald-500"
          iconTone="bg-emerald-50 text-emerald-600"
          footer={{ text: `${formatCurrency(account.minimumReserve)} reserved` }}
        />
        <StatsCard
          title="Loan Disbursed"
          value={formatCurrency(totals.totalLoanDisbursed)}
          icon={ArrowUpRight}
          accent="bg-red-500"
          iconTone="bg-red-50 text-red-600"
          footer={{ text: `${totals.loanDisbursementCount || 0} disbursal entries` }}
        />
        <StatsCard
          title="Recovered Collections"
          value={formatCurrency(totalRecovered)}
          icon={ArrowDownLeft}
          accent="bg-violet-500"
          iconTone="bg-violet-50 text-violet-600"
          footer={{ text: `${totals.settlementTransactionCount || 0} settlement entries` }}
        />
      </div>

      <SectionCard
        title="Settlement Account"
        subtitle="Opening balance, reserve rule, and current internal liquidity position."
        icon={CircleDollarSign}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Account Name</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{account.accountName}</p>
          </div>
          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Opening Balance</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{formatCurrency(account.openingBalance)}</p>
          </div>
          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Loan EMI / Closure</p>
            <p className="mt-2 text-sm font-bold text-emerald-700">{formatCurrency(totals.totalLoanCollected)}</p>
          </div>
          <div className="rounded-xl border border-bank-card-border bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">OD Recovery</p>
            <p className="mt-2 text-sm font-bold text-emerald-700">{formatCurrency(totals.totalOdRecovered)}</p>
          </div>
        </div>
      </SectionCard>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="Monthly Net Movement" subtitle="Collections minus disbursals by month." icon={FileBarChart}>
          <RechartsColumn
            rows={monthlyNetRows}
            valueFormatter={formatCompactCurrency}
            emptyMessage="No settlement movement is available yet."
          />
        </SectionCard>
        <SectionCard title="Movement Breakdown" subtitle="Settlement ledger amount grouped by business movement." icon={BadgeIndianRupee}>
          <RechartsHorizontalBar
            rows={typeRows}
            valueFormatter={formatCompactCurrency}
            emptyMessage="No settlement movement is available yet."
          />
        </SectionCard>
      </section>

      <SectionCard title="Settlement Ledger History" subtitle="All bank-side loan and overdraft settlement entries.">
        {isLoading ? (
          <p className="rounded-xl bg-bank-surface p-4 text-sm font-semibold text-slate-500">
            Loading settlement history...
          </p>
        ) : report.rows.length === 0 ? (
          <EmptyState message="No settlement ledger entries are available yet." />
        ) : (
          <div className="table-shell">
            <table className="w-full min-w-[980px] text-left">
              <thead className="table-head">
                <tr>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Movement</th>
                  <th className="px-5 py-4">Customer / Ref</th>
                  <th className="px-5 py-4 text-right">Bank Debit</th>
                  <th className="px-5 py-4 text-right">Bank Credit</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledgerPagination.pageRows.map((row) => (
                  <tr key={row.id} className="table-row align-top">
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{row.title}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {formatType(row.type)} / {row.subtitle || "Settlement movement"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      <p className="font-bold text-slate-900">{row.customerName || "Bank"}</p>
                      <p className="mt-1 text-xs">
                        {[row.businessRefId, formatAccount(row.fromAccountNumber), formatAccount(row.toAccountNumber)]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-red-700">
                      {row.bankDebit > 0 ? formatCurrency(row.bankDebit) : "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-700">
                      {row.bankCredit > 0 ? formatCurrency(row.bankCredit) : "-"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(row.status)}`}>
                        {getTransactionStatusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination {...ledgerPagination} />
          </div>
        )}
      </SectionCard>
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{content}</div>;
  }

  return <PageContent>{content}</PageContent>;
};

export default SettlementReportView;
