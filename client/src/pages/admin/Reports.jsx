import {
  AlertTriangle,
  ArrowLeftRight,
  Clock3,
  CreditCard,
  Download,
  FileBarChart,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../api/axios";
import StatsCard from "../../components/dashboard/StatsCard";
import ChartTooltip from "../../components/ui/ChartTooltip";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { formatCurrency } from "../../utils/format";
import { downloadPdf } from "../../utils/pdfExport";
import { getTierTone, getTransactionStatusLabel } from "../../utils/ui";

const toNumber = (value) => Number(value || 0);

const formatCompactCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: toNumber(value) >= 100000 ? "compact" : "standard",
  }).format(toNumber(value));

const percentOf = (value, total) =>
  total > 0 ? Math.round((toNumber(value) / total) * 100) : 0;

const formatHours = (hours) => {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
};

const buildCsv = (rows) => {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
};

const downloadFile = (filename, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadCsv = (filename, rows) => {
  const csv = buildCsv(rows);
  downloadFile(filename, csv, "text/csv;charset=utf-8;");
};

const ChartEmptyState = ({ message }) => (
  <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-bank-card-border bg-bank-surface text-sm font-semibold text-slate-500">
    {message}
  </div>
);

const SectionHeader = ({ icon: Icon, title, subtitle, exportLabel, exportName, exportRows, className = "mb-5" }) => (
  <div className={`${className} flex flex-wrap items-start justify-between gap-4`}>
    <div className="flex min-w-0 items-start gap-3">
      <div className="shrink-0 rounded-lg bg-blue-50 p-2.5 text-blue-700">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
    </div>
    {exportRows && (
      <div className="flex shrink-0 overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => downloadCsv(`${exportName}.csv`, exportRows)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-bank-surface"
        >
          <Download size={16} />
          CSV
        </button>
        <button
          type="button"
          onClick={() =>
            downloadPdf(
              `${exportName}.pdf`,
              exportName.replaceAll("-", " "),
              exportRows,
              { subtitle: exportLabel || "Export" }
            )
          }
          className="border-l border-bank-card-border px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-bank-surface"
        >
          PDF
        </button>
        <span className="hidden border-l border-bank-card-border px-3 py-2 text-sm font-semibold text-slate-500 sm:inline">
          {exportLabel || "Export"}
        </span>
      </div>
    )}
  </div>
);

const EmptyTableRow = ({ colSpan, message }) => (
  <tr>
    <td colSpan={colSpan} className="px-6 py-8 text-center text-sm font-semibold text-slate-500">
      {message}
    </td>
  </tr>
);

const StatusBadge = ({ status }) => {
  const toneByStatus = {
    success: "bg-emerald-50 text-emerald-700",
    approved: "bg-emerald-50 text-emerald-700",
    active: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-700",
    rejected: "bg-red-50 text-red-700",
    inactive: "bg-slate-100 text-slate-600",
    suspended: "bg-red-50 text-red-700",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${toneByStatus[status] || "bg-slate-100 text-slate-600"}`}>
      {getTransactionStatusLabel(status)}
    </span>
  );
};

const HorizontalBarChart = ({ rows, valueFormatter = (value) => value, detailFormatter }) => {
  const maxValue = Math.max(...rows.map((row) => toNumber(row.value)), 0);

  if (maxValue === 0) {
    return <ChartEmptyState message="No chart data available yet." />;
  }

  return (
    <div className="flex min-h-60 flex-col justify-center space-y-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className="group relative rounded-lg outline-none"
          tabIndex={0}
        >
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-700">{row.label}</span>
            <span className="shrink-0 font-bold text-slate-950">
              {valueFormatter(row.value)}
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 ring-1 ring-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(7, percentOf(row.value, maxValue))}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
          <ChartTooltip
            label={row.label}
            value={valueFormatter(row.value)}
            detail={detailFormatter?.(row)}
            className="bottom-full right-0 mb-2 hidden group-hover:block group-focus:block"
          />
          {detailFormatter && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              {detailFormatter(row)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

const ColumnChart = ({ rows, valueFormatter = (value) => value }) => {
  const maxValue = Math.max(...rows.map((row) => toNumber(row.value)), 0);

  if (maxValue === 0) {
    return <ChartEmptyState message="No chart data available yet." />;
  }

  return (
    <div className="flex h-64 items-stretch gap-3 border-b border-l border-slate-200 px-3 pt-5 sm:gap-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className="group relative flex min-w-0 flex-1 flex-col items-center gap-2 outline-none"
          tabIndex={0}
        >
          <span className="text-xs font-bold text-slate-700">
            {valueFormatter(row.value)}
          </span>
          <div className="flex min-h-0 w-full flex-1 items-end">
            <div
              className="w-full rounded-t-lg shadow-sm"
              style={{
                height: `${Math.max(14, percentOf(row.value, maxValue))}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
          <ChartTooltip
            label={row.label}
            value={valueFormatter(row.value)}
            detail="Transactions recorded"
            percent={percentOf(row.value, maxValue)}
            className="bottom-9 left-1/2 hidden -translate-x-1/2 group-hover:block group-focus:block"
          />
          <span className="w-full truncate text-center text-xs font-semibold text-slate-500" title={row.label}>
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
};

const DonutChart = ({ rows }) => {
  const total = rows.reduce((sum, row) => sum + toNumber(row.value), 0);
  const [activeRow, setActiveRow] = useState(null);

  if (total === 0) {
    return <ChartEmptyState message="No chart data available yet." />;
  }

  const segments = rows.reduce((items, row) => {
    const segment = (toNumber(row.value) / total) * 100;
    const offset =
      items.length === 0 ? 25 : items[items.length - 1].offset - items[items.length - 1].segment;

    return [...items, { ...row, segment, offset, dash: `${segment} ${100 - segment}` }];
  }, []);

  return (
    <div className="grid min-h-60 items-center gap-5 sm:grid-cols-[180px_1fr]">
      <div className="relative">
      <svg viewBox="0 0 42 42" className="mx-auto h-44 w-44 -rotate-90">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
        {segments.map((row) => (
          <circle
            key={row.label}
            cx="21"
            cy="21"
            r="15.915"
            fill="transparent"
            stroke={row.color}
            strokeDasharray={row.dash}
            strokeDashoffset={row.offset}
            strokeWidth="6"
            className="cursor-pointer transition-opacity hover:opacity-80 focus:opacity-80"
            onMouseEnter={() => setActiveRow(row)}
            onMouseLeave={() => setActiveRow(null)}
            onFocus={() => setActiveRow(row)}
            onBlur={() => setActiveRow(null)}
            tabIndex={0}
          />
        ))}
      </svg>
      {activeRow && (
        <ChartTooltip
          label={activeRow.label}
          value={activeRow.value}
          percent={percentOf(activeRow.value, total)}
          detail={`${total} total records`}
          className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      )}
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="truncate text-sm font-semibold text-slate-700">{row.label}</span>
            </div>
            <span className="shrink-0 text-sm font-bold text-slate-950">
              {row.value} ({percentOf(row.value, total)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const getCustomerAccounts = (customer) =>
  customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean);

const AdminReports = () => {
  const [users, setUsers] = useState({ customers: [] });
  const [tiers, setTiers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    Promise.allSettled([
      api.get("/users"),
      api.get("/tiers"),
      api.get("/approvals"),
      api.get("/transfers/transactions"),
    ]).then(([usersResult, tiersResult, approvalsResult, transactionsResult]) => {
      const usersData = usersResult.status === "fulfilled" ? usersResult.value.data : {};

      setUsers({
        customers: usersData.customers || [],
      });
      setTiers(tiersResult.status === "fulfilled" ? tiersResult.value.data.tiers || [] : []);
      setApprovals(approvalsResult.status === "fulfilled" ? approvalsResult.value.data.approvals || [] : []);
      setTransactions(
        transactionsResult.status === "fulfilled"
          ? transactionsResult.value.data.transactions || []
          : []
      );
    });
  }, []);

  const reportData = useMemo(() => {
    const totalTransferValue = transactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.amount),
      0
    );
    const highValueTransfers = [...transactions]
      .sort((a, b) => toNumber(b.amount) - toNumber(a.amount));
    const volumeByDate = transactions.reduce((map, transaction) => {
      const date = transaction.date || String(transaction.createdAt || "").slice(0, 10) || "Unknown";
      map.set(date, (map.get(date) || 0) + 1);
      return map;
    }, new Map());
    const transferVolumeRows = [...volumeByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([label, value], index) => ({
        label,
        value,
        color: ["#2563eb", "#0891b2", "#059669", "#7c3aed"][index % 4],
      }));
    const ownTransfers = transactions.filter(
      (transaction) =>
        transaction.sender === transaction.receiver ||
        transaction.fromAccountNumber === transaction.toAccountNumber
    );
    const beneficiaryTransfers = transactions.filter(
      (transaction) => !ownTransfers.includes(transaction)
    );
    const splitRows = [
      { label: "Beneficiary", value: beneficiaryTransfers.length, color: "#2563eb" },
      { label: "Own Account", value: ownTransfers.length, color: "#14b8a6" },
    ];

    const customerRows = users.customers.map((customer) => {
      const accounts = getCustomerAccounts(customer);
      const balance = accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
      const overdraftUsed = Math.max(
        toNumber(customer.account?.overdraftUsed),
        ...accounts.map((account) => toNumber(account.overdraftUsed))
      );
      const overdraftLimit = Math.max(
        toNumber(customer.account?.overdraftLimit),
        ...accounts.map((account) => toNumber(account.overdraftLimit))
      );

      return {
        ...customer,
        accountCount: accounts.length,
        balance,
        overdraftUsed,
        overdraftLimit,
        odUsage: percentOf(overdraftUsed, overdraftLimit),
      };
    });
    const nearOdLimitRows = customerRows
      .filter((customer) => customer.overdraftLimit > 0)
      .sort((a, b) => b.odUsage - a.odUsage);
    const odAttemptsUsed = customerRows.filter(
      (customer) =>
        getCustomerAccounts(customer).some((account) => toNumber(account.odCountThisMonth) >= 3)
    ).length;
    const odBlocked = customerRows.filter(
      (customer) => getCustomerAccounts(customer).some((account) => account.odBlocked)
    ).length;
    const odByTierRows = tiers.map((tier, index) => {
      const tierCustomers = customerRows.filter(
        (customer) => customer.classification === tier.key
      );
      const used = tierCustomers.reduce((sum, customer) => sum + customer.overdraftUsed, 0);
      const limit = tierCustomers.reduce((sum, customer) => sum + customer.overdraftLimit, 0);

      return {
        label: tier.label,
        value: used,
        limit,
        color: getTierTone(tier.key).dot,
      };
    });

    const resolvedApprovals = approvals.filter((approval) =>
      ["approved", "rejected"].includes(approval.status)
    );
    const avgResolutionHours =
      resolvedApprovals.reduce((sum, approval) => {
        const start = new Date(approval.requestedOn || approval.createdAt).getTime();
        const end = new Date(approval.reviewedAt || approval.updatedAt || approval.requestedOn).getTime();
        return sum + Math.max(0, (end - start) / 36e5);
      }, 0) / Math.max(resolvedApprovals.length, 1);
    const approvalStatusRows = [
      { label: "Pending", value: approvals.filter((item) => item.status === "pending").length, color: "#f59e0b" },
      { label: "Approved", value: approvals.filter((item) => item.status === "approved").length, color: "#10b981" },
      { label: "Rejected", value: approvals.filter((item) => item.status === "rejected").length, color: "#ef4444" },
    ];
    const tierDistributionRows = tiers.map((tier, index) => ({
      label: tier.label,
      value: customerRows.filter((customer) => customer.classification === tier.key).length,
      color: getTierTone(tier.key).dot,
    }));
    return {
      totalTransferValue,
      highValueTransfers,
      transferVolumeRows,
      splitRows,
      customerRows,
      nearOdLimitRows,
      odAttemptsUsed,
      odBlocked,
      odByTierRows,
      avgResolutionHours,
      approvalStatusRows,
      tierDistributionRows,
    };
  }, [approvals, tiers, transactions, users]);

  const highValueCsvRows = reportData.highValueTransfers.map((transaction) => ({
    id: transaction.id,
    sender: transaction.sender,
    receiver: transaction.receiver,
    fromAccount: transaction.fromAccountNumber,
    toAccount: transaction.toAccountNumber,
    amount: transaction.amount,
    status: transaction.status,
    date: transaction.date,
  }));
  const odCsvRows = reportData.nearOdLimitRows.map((customer) => ({
    customerId: customer.customerId,
    name: customer.name,
    tier: customer.classification,
    overdraftUsed: customer.overdraftUsed,
    overdraftLimit: customer.overdraftLimit,
    usagePercent: customer.odUsage,
  }));
  const approvalCsvRows = reportData.approvalStatusRows.map((status) => ({
    status: status.label,
    approvals: status.value,
  }));
  const customerCsvRows = reportData.customerRows.map((customer) => ({
    customerId: customer.customerId,
    name: customer.name,
    email: customer.email,
    tier: customer.classification,
    accountCount: customer.accountCount,
    balance: customer.balance,
    overdraftUsed: customer.overdraftUsed,
    status: customer.status,
  }));
  const highValuePagination = usePaginatedRows(reportData.highValueTransfers);
  const nearOdPagination = usePaginatedRows(reportData.nearOdLimitRows);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Admin / Reports"
          title="Reports & Analytics"
          subtitle="Operational reporting for transfers, overdraft risk, approval workflow, and customer accounts."
        />

        <div className="flex flex-wrap gap-2 rounded-2xl border border-bank-card-border bg-white p-3 shadow-sm">
          {[
            ["Transactions", "#transactions"],
            ["Overdraft", "#overdraft"],
            ["Approvals", "#approvals"],
            ["Customers", "#customers"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-bank-surface hover:text-bank-eyebrow"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatsCard
            title="Transfer Value"
            value={formatCompactCurrency(reportData.totalTransferValue)}
            icon={CreditCard}
            accent="bg-blue-500"
            iconTone="bg-blue-50 text-blue-600"
          />
          <StatsCard
            title="OD Watchlist"
            value={reportData.nearOdLimitRows.length}
            icon={Wallet}
            accent="bg-amber-500"
            iconTone="bg-amber-50 text-amber-600"
            footer={{ text: `${reportData.odBlocked} blocked accounts` }}
          />
          <StatsCard
            title="Avg Approval Time"
            value={formatHours(reportData.avgResolutionHours)}
            icon={Clock3}
            accent="bg-emerald-500"
            iconTone="bg-emerald-50 text-emerald-600"
          />
        </div>

        <section id="transactions" className="grid scroll-mt-8 grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="card-padded min-h-[360px]">
            <SectionHeader
              icon={ArrowLeftRight}
              title="Transaction Volume Chart"
              subtitle="Transfer volume, beneficiary exposure, and high-value transactions."
              exportLabel="Export Transactions"
              exportName="transaction-report"
              exportRows={highValueCsvRows}
            />
            <ColumnChart rows={reportData.transferVolumeRows} valueFormatter={(value) => `${value}`} />
          </div>

          <div className="card-padded min-h-[360px]">
            <SectionHeader
              icon={ShieldCheck}
              title="Transfer Split"
              subtitle="Beneficiary ratio matters because OD applies to beneficiary transfers."
            />
            <DonutChart rows={reportData.splitRows} />
          </div>
        </section>

        <section className="table-shell">
          <div className="border-b border-bank-card-border p-5 sm:p-6">
            <SectionHeader
              icon={AlertTriangle}
              title="High-Value Transfer Table"
              subtitle="Large transfers tied directly to approval and risk review."
              exportLabel="Export Transfers"
              exportName="high-value-transfers"
              exportRows={highValueCsvRows}
              className="mb-0"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="table-head">
                <tr>
                  <th className="px-6 py-4">Transfer</th>
                  <th className="px-6 py-4">Route</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {highValuePagination.pageRows.map((transaction) => (
                  <tr key={transaction.id} className="table-row">
                    <td className="px-6 py-4 font-semibold">{transaction.id}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">{transaction.sender}</p>
                      <p className="text-sm text-slate-500">to {transaction.receiver}</p>
                    </td>
                    <td className="px-6 py-4 font-bold">{formatCurrency(transaction.amount)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={transaction.status} />
                    </td>
                    <td className="px-6 py-4">{transaction.date || "Recently"}</td>
                  </tr>
                ))}
                {reportData.highValueTransfers.length === 0 && (
                  <EmptyTableRow colSpan={5} message="No high-value transfers available yet." />
                )}
              </tbody>
            </table>
            <TablePagination {...highValuePagination} />
          </div>
        </section>

        <section id="overdraft" className="grid scroll-mt-8 grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="card-padded min-h-[370px]">
            <SectionHeader
              icon={Wallet}
              title="OD Reports"
              subtitle="Tier-based OD usage with 3-attempt monitoring."
              exportLabel="Export OD"
              exportName="od-report"
              exportRows={odCsvRows}
            />
            <HorizontalBarChart
              rows={reportData.odByTierRows}
              valueFormatter={formatCompactCurrency}
              detailFormatter={(row) =>
                `${percentOf(row.value, row.limit)}% of ${formatCompactCurrency(row.limit)} assigned`
              }
            />
            <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {reportData.odAttemptsUsed} customers have reached the 3-attempt OD threshold this month.
            </div>
          </div>

          <div className="table-shell">
            <div className="border-b border-bank-card-border p-5 sm:p-6">
              <SectionHeader
                icon={AlertTriangle}
                title="Customers Near OD Limit"
                subtitle="Early warning list for managers before accounts become risky."
                exportLabel="Export OD List"
                exportName="customers-near-od-limit"
                exportRows={odCsvRows}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead className="table-head">
                  <tr>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Tier</th>
                    <th className="px-6 py-4">OD Used</th>
                    <th className="px-6 py-4">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {nearOdPagination.pageRows.map((customer) => (
                    <tr key={customer.customerId} className="table-row">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">{customer.name}</p>
                        <p className="text-sm text-slate-500">{customer.customerId}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${getTierTone(customer.classification).badge}`}>
                          {customer.classification}
                        </span>
                      </td>
                      <td className="px-6 py-4">{formatCurrency(customer.overdraftUsed)}</td>
                      <td className="px-6 py-4 font-bold">{customer.odUsage}%</td>
                    </tr>
                  ))}
                  {reportData.nearOdLimitRows.length === 0 && (
                    <EmptyTableRow colSpan={4} message="No customers are near their OD limit." />
                  )}
                </tbody>
              </table>
              <TablePagination {...nearOdPagination} />
            </div>
          </div>
        </section>

        <section id="approvals" className="scroll-mt-8">
          <div className="card-padded min-h-[360px]">
            <SectionHeader
              icon={Clock3}
              title="Approval Reports"
              subtitle="Approval health, resolution time, and bottleneck visibility."
              exportLabel="Export Approvals"
              exportName="approval-report"
              exportRows={approvalCsvRows}
            />
            <DonutChart rows={reportData.approvalStatusRows} />
          </div>
        </section>

        <section id="customers" className="scroll-mt-8">
          <div className="card-padded min-h-[390px]">
            <SectionHeader
              icon={FileBarChart}
              title="Customers By Tier"
              subtitle="Customer classification distribution across the active tier setup."
              exportLabel="Export Customers"
              exportName="customer-tier-report"
              exportRows={customerCsvRows}
            />
            <DonutChart rows={reportData.tierDistributionRows} />
          </div>
        </section>
      </PageContent>
    </DashboardLayout>
  );
};

export default AdminReports;
