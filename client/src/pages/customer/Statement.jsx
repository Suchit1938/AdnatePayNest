import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  Mail,
} from "lucide-react";
import api from "../../api/axios";
import brandLogo from "../../assets/brand/logo.png";
import EmptyState from "../../components/ui/EmptyState";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { BANK_NAME, formatCurrency, maskAccountNumber } from "../../data/mockData";
import { useAuth } from "../../context/useAuth";
import { getCustomerAccounts } from "../../utils/overdraft";
import { downloadPdf as downloadPdfFile } from "../../utils/pdfExport";
import { getTransactionStatusLabel } from "../../utils/ui";

const toDateInputValue = (date) => date.toISOString().slice(0, 10);

const toMonthInputValue = (date) => date.toISOString().slice(0, 7);

const getMonthStart = (monthValue) => `${monthValue}-01`;

const getMonthEnd = (monthValue) => {
  const [year, month] = monthValue.split("-").map(Number);
  return toDateInputValue(new Date(year, month, 0));
};

const formatDisplayDate = (value) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

const formatTimestamp = (date) => {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
};

const buildStatementReference = (type, periodEndDate, customerId) => {
  if (type === "monthly") {
    return `APS-${periodEndDate.slice(0, 7)}-${customerId}`;
  }

  return `APS-CUR-${periodEndDate}-${customerId}`;
};

const buildStatementFilename = (statementReference, extension) =>
  `${statementReference}_${formatTimestamp(new Date())}.${extension}`;

const getAccountTrail = (transaction, accountNumber) => {
  const parts = [];

  if (transaction.fromAccountNumber) {
    parts.push(`From ${maskAccountNumber(transaction.fromAccountNumber)}`);
  }

  if (transaction.toAccountNumber) {
    parts.push(`To ${maskAccountNumber(transaction.toAccountNumber)}`);
  }

  if (!parts.length && accountNumber) {
    parts.push(maskAccountNumber(accountNumber));
  }

  return parts.join(" | ");
};

const formatLinkedAccounts = (accounts) =>
  accounts.length
    ? accounts
        .map(
          (account) =>
            `${account.accountType || "Account"} ${maskAccountNumber(account.accountNumber)}`
        )
        .join(", ")
    : "No linked account";

const isPostedTransaction = (status) =>
  ["success", "completed"].includes(String(status || "").toLowerCase());

const statusBadgeClass = (status) => {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "success" || normalized === "completed") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (normalized === "pending") {
    return "bg-amber-50 text-amber-700";
  }

  if (normalized === "failed" || normalized === "rejected") {
    return "bg-red-50 text-red-700";
  }

  return "bg-slate-100 text-slate-600";
};

const formatTransactionType = (type) =>
  String(type || "bank-transfer").replaceAll("-", " ").toUpperCase();

const isOverdraftPayoff = (transaction) => transaction.type === "overdraft-payoff";

const getApprovalBadge = (transaction) => {
  if (transaction.approvalStatus === "approved") return "Manager Approved";
  if (transaction.approvalStatus === "rejected") return "Manager Rejected";
  return "";
};

const getRejectionNarrative = (statement) => {
  const requestId = statement.approvalId || statement.id;
  const reason = String(statement.failureReason || "").trim();
  const normalizedReason = reason.endsWith(".") ? reason : `${reason}.`;

  return `Transfer request ${requestId} for ${formatCurrency(statement.amount)} was rejected because ${normalizedReason}`;
};

const Statement = () => {
  const { user } = useAuth();
  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const todayValue = toDateInputValue(today);
  const currentMonth = toMonthInputValue(today);
  const [filter, setFilter] = useState("All");
  const [statementType, setStatementType] = useState("interim");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [interimEndDate, setInterimEndDate] = useState(todayValue);
  const [statementEntries, setStatementEntries] = useState([]);
  const [emailSending, setEmailSending] = useState(false);
  const accounts = useMemo(() => getCustomerAccounts(user), [user]);
  const accountNumbers = useMemo(
    () => new Set(accounts.map((account) => account.accountNumber).filter(Boolean)),
    [accounts]
  );
  const primaryAccount = accounts[0] || user?.account || null;
  const userName = user?.name;
  const userAccountNumber = primaryAccount?.accountNumber || "";
  const userAccountType = primaryAccount?.accountType || user?.accountType || "Account";
  const linkedAccountLabel = formatLinkedAccounts(accounts);

  useEffect(() => {
    api
      .get("/transfers/transactions")
      .then(({ data }) => {
        setStatementEntries(
          (data.transactions || []).map((transaction) => {
            const payoff = isOverdraftPayoff(transaction);
            const fromLinkedAccount = accountNumbers.has(transaction.fromAccountNumber);
            const toLinkedAccount = accountNumbers.has(transaction.toAccountNumber);
            const isOwnLinkedTransfer = fromLinkedAccount && toLinkedAccount;
            const entryType = isOwnLinkedTransfer
              ? "Transfer"
              : payoff || fromLinkedAccount || transaction.sender === userName
                ? "Debit"
                : "Credit";

            return {
              id: transaction.id,
              date: transaction.date,
              detail: payoff
                ? "Overdraft payoff"
                : isOwnLinkedTransfer
                  ? `Own account transfer to ${maskAccountNumber(transaction.toAccountNumber)}`
                : transaction.sender === userName
                  ? `Transfer to ${transaction.receiver}`
                  : `Transfer from ${transaction.sender}`,
              accountDetail: getAccountTrail(transaction, userAccountNumber),
              accountType: transaction.accountType || userAccountType || "Savings",
              type: entryType,
              amount: Number(transaction.amount || 0),
              status: transaction.status,
              transactionType: transaction.type || "bank-transfer",
              isPosted: isPostedTransaction(transaction.status),
              failureReason: transaction.failureReason || "",
              approvalStatus: transaction.approvalStatus || "",
              approvalId: transaction.approvalId || "",
              approvalReviewedBy: transaction.approvalReviewedBy || "",
              approvalBadge: getApprovalBadge(transaction),
            };
          })
        );
      })
      .catch(() => setStatementEntries([]));
  }, [accountNumbers, userAccountNumber, userAccountType, userName]);

  const monthStart = getMonthStart(selectedMonth);
  const monthEnd = getMonthEnd(selectedMonth);
  const defaultInterimEndDate = selectedMonth === currentMonth ? todayValue : monthEnd;
  const safeInterimEndDate =
    interimEndDate >= monthStart && interimEndDate <= monthEnd
      ? interimEndDate
      : defaultInterimEndDate;
  const statementEndDate = statementType === "monthly" ? monthEnd : safeInterimEndDate;
  const statementLabel =
    statementType === "monthly" ? "Monthly Statement" : "Current Statement";
  const periodLabel = `${formatDisplayDate(monthStart)} - ${formatDisplayDate(statementEndDate)}`;
  const generatedOn = formatDisplayDate(todayValue);
  const bankName = user?.bankName || BANK_NAME;
  const customerReference = user?.customerId || "CUSTOMER";
  const statementReference = buildStatementReference(
    statementType,
    statementEndDate,
    customerReference
  );

  const handleMonthChange = (monthValue) => {
    setSelectedMonth(monthValue);
    setInterimEndDate(monthValue === currentMonth ? todayValue : getMonthEnd(monthValue));
  };

  const periodEntries = useMemo(
    () =>
      statementEntries.filter(
        (entry) => entry.date >= monthStart && entry.date <= statementEndDate
      ),
    [monthStart, statementEndDate, statementEntries]
  );

  const totalCredits = useMemo(
    () =>
      periodEntries
        .filter((entry) => entry.type === "Credit" && entry.isPosted)
        .reduce((sum, entry) => sum + entry.amount, 0),
    [periodEntries]
  );
  const totalDebits = useMemo(
    () =>
      periodEntries
        .filter((entry) => entry.type === "Debit" && entry.isPosted)
        .reduce((sum, entry) => sum + entry.amount, 0),
    [periodEntries]
  );
  const liveBalance = accounts.reduce(
    (sum, account) => sum + Number(account.balance ?? account.availableBalance ?? 0),
    0
  );
  const netMovement = totalCredits - totalDebits;
  const openingBalance = liveBalance > 0 ? Math.max(0, liveBalance - netMovement) : 0;
  const closingBalance = Math.max(0, openingBalance + netMovement);
  const creditCount = periodEntries.filter(
    (entry) => entry.type === "Credit" && entry.isPosted
  ).length;
  const debitCount = periodEntries.filter(
    (entry) => entry.type === "Debit" && entry.isPosted
  ).length;
  const statementStatus =
    statementType === "monthly" && statementEndDate > todayValue ? "Scheduled" : "Ready";
  const balanceRows = [
    ["Opening Balance", formatCurrency(openingBalance)],
    ["Credit Entries", creditCount],
    ["Debit Entries", debitCount],
    ["Total Credits", formatCurrency(totalCredits)],
    ["Total Debits", formatCurrency(totalDebits)],
    [statementType === "monthly" ? "Closing Balance" : "Current Balance", formatCurrency(closingBalance)],
  ];
  const accountInfoRows = [
    ["Customer Name", user?.name || "Customer"],
    ["Customer ID", user?.customerId || "Not available"],
    ["Statement Scope", "All linked accounts"],
    ["Linked Accounts", linkedAccountLabel],
    ["IFSC", primaryAccount?.ifsc || user?.ifsc || "ADNT0000001"],
    ["Branch", user?.branch || "Digital Banking Branch"],
  ];

  const ledgerEntries = useMemo(() => {
    const sortedEntries = [...periodEntries].sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        String(first.id).localeCompare(String(second.id))
    );

    return sortedEntries.reduce(
      (accumulator, entry) => {
        const rawBalance = entry.isPosted
          ? accumulator.balance +
            (entry.type === "Credit" ? entry.amount : entry.type === "Debit" ? -entry.amount : 0)
          : accumulator.balance;
        const balance = Math.max(0, rawBalance);
        const ledgerEntry = {
          ...entry,
          balance,
          managerReview:
            entry.approvalStatus === "approved"
              ? `Approved by ${entry.approvalReviewedBy || "manager"}${
                  entry.approvalId ? ` | Approval ${entry.approvalId}` : ""
                }`
              : entry.approvalStatus === "rejected"
                ? `Rejected by ${entry.approvalReviewedBy || "manager"}${
                    entry.approvalId ? ` | Approval ${entry.approvalId}` : ""
                  }`
                : "",
          ledgerDetail: [
            entry.detail,
            `${entry.accountType} account`,
            entry.accountDetail,
            `Ref ${entry.id}`,
            entry.approvalBadge,
            entry.approvalStatus === "approved" || entry.approvalStatus === "rejected"
              ? `${entry.approvalStatus === "approved" ? "Approved" : "Rejected"} by ${
                  entry.approvalReviewedBy || "manager"
                }`
              : "",
            entry.approvalId ? `Approval ${entry.approvalId}` : "",
            entry.failureReason ? `Manager reason: ${entry.failureReason}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        };

        return {
          balance,
          rows: [...accumulator.rows, ledgerEntry],
        };
      },
      { balance: openingBalance, rows: [] }
    ).rows;
  }, [openingBalance, periodEntries]);

  const filteredLedgerEntries = useMemo(() => {
    if (filter === "All") {
      return ledgerEntries;
    }

    return ledgerEntries.filter((statement) => statement.type === filter);
  }, [filter, ledgerEntries]);

  const statementRows = filteredLedgerEntries.map((statement) => ({
    Date: statement.date,
    Details: statement.ledgerDetail,
    Status: getTransactionStatusLabel(statement.status),
    "Manager Review": statement.managerReview || "",
    "Rejection Reason": statement.failureReason || "",
    Debit: statement.failureReason
      ? "Manager Reason"
      : statement.type === "Debit" && statement.isPosted
        ? formatCurrency(statement.amount)
        : "",
    Credit: statement.failureReason
      ? getRejectionNarrative(statement)
      : statement.type === "Credit" && statement.isPosted
        ? formatCurrency(statement.amount)
        : statement.type === "Transfer" && statement.isPosted
          ? "Internal transfer"
        : "",
    Balance: statement.failureReason
      ? "Not posted"
      : statement.isPosted
        ? formatCurrency(statement.balance)
        : "",
  }));
  const statementPagination = usePaginatedRows(filteredLedgerEntries);

  const summaryRows = [
    {
      Date: monthStart,
      Details: "Opening balance",
      Debit: "",
      Credit: "",
      Balance: formatCurrency(openingBalance),
    },
    {
      Date: statementEndDate,
      Details: "Total credits during period",
      Debit: "",
      Credit: formatCurrency(totalCredits),
      Balance: `${creditCount} entries`,
    },
    {
      Date: statementEndDate,
      Details: "Total debits during period",
      Debit: formatCurrency(totalDebits),
      Credit: "",
      Balance: `${debitCount} entries`,
    },
    {
      Date: statementEndDate,
      Details: statementType === "monthly" ? "Closing balance" : "Current balance",
      Debit: "",
      Credit: "",
      Balance: formatCurrency(closingBalance),
    },
  ];
  const accountRows = accountInfoRows.map(([label, value]) => ({
    Date: "",
    Details: label,
    Debit: "",
    Credit: "",
    Balance: value,
  }));

  const downloadCsv = () => {
    try {
      const headers = [
        "Date",
        "Details",
        "Status",
        "Manager Review",
        "Rejection Reason",
        "Debit",
        "Credit",
        "Balance",
      ];
      const escapeCell = (value) => {
        const text = String(value ?? "");
        return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const csv = [
        `Statement Ref,${escapeCell(statementReference)}`,
        `Statement Type,${escapeCell(statementLabel)}`,
        `Bank,${escapeCell(bankName)}`,
        `Customer,${escapeCell(user?.name || "Customer")}`,
        `Account Scope,${escapeCell(linkedAccountLabel)}`,
        `Period,${escapeCell(periodLabel)}`,
        `Generated On,${escapeCell(generatedOn)}`,
        "",
        headers.join(","),
        ...accountRows.map((row) =>
          headers.map((header) => escapeCell(row[header])).join(",")
        ),
        ...summaryRows.map((row) =>
          headers.map((header) => escapeCell(row[header])).join(",")
        ),
        ...statementRows.map((row) =>
          headers.map((header) => escapeCell(row[header])).join(",")
        ),
      ].join("\n");
      const file = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");

      link.href = url;
      link.download = buildStatementFilename(statementReference, "csv");
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${statementLabel} CSV downloaded.`);
    } catch {
      toast.error("Unable to download statement CSV. Please try again.");
    }
  };

  const downloadPdf = () => {
    try {
      downloadPdfFile(
        buildStatementFilename(statementReference, "pdf"),
        `${bankName} - ${statementLabel}`,
        [...accountRows, ...summaryRows, ...statementRows],
        {
          headers: ["Date", "Details", "Status", "Debit", "Credit", "Balance"],
          subtitle: `${statementReference} | ${periodLabel} | Generated ${generatedOn} | Filter: ${filter}`,
        }
      );
      toast.success(`${statementLabel} PDF downloaded.`);
    } catch {
      toast.error("Unable to download statement PDF. Please try again.");
    }
  };

  const emailCurrentStatement = async () => {
    setEmailSending(true);

    try {
      const { data } = await api.post("/transfers/statement/email", {
        statementReference,
        statementLabel,
        periodLabel,
        generatedOn,
        filter,
        bankName,
        rows: [...accountRows, ...summaryRows, ...statementRows],
      });

      toast.success(data.message || "Statement sent to your registered email.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to send statement email.");
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          title="Account Statement"
          subtitle="Download a current statement for any date or a full monthly statement."
        >
          <div className="flex flex-wrap overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm">
            <button
              type="button"
              onClick={emailCurrentStatement}
              disabled={emailSending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Mail size={16} />
              {emailSending ? "Sending..." : "Email"}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 border-l border-bank-card-border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-bank-surface"
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

        <SectionCard
          title="Statement Setup"
          subtitle="Choose the statement type and period before downloading."
          icon={CalendarDays}
        >
          <div className="mb-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setStatementType("interim");
                handleMonthChange(currentMonth);
              }}
              className={statementType === "interim" ? "tab-pill-active" : "tab-pill-inactive"}
            >
              Current Statement
            </button>
            <button
              type="button"
              onClick={() => setStatementType("monthly")}
              className={statementType === "monthly" ? "tab-pill-active" : "tab-pill-inactive"}
            >
              Full Month
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="label-field">
              Statement Month
              <input
                type="month"
                value={selectedMonth}
                max={currentMonth}
                onChange={(event) => handleMonthChange(event.target.value)}
                className="input-field"
              />
            </label>

            <label className="label-field">
              End Date
              <input
                type="date"
                value={statementEndDate}
                min={monthStart}
                max={selectedMonth === currentMonth ? todayValue : monthEnd}
                disabled={statementType === "monthly"}
                onChange={(event) => setInterimEndDate(event.target.value)}
                className="input-field"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="overflow-hidden rounded-lg border border-bank-card-border bg-white">
            <div className="border-b border-bank-card-border bg-bank-surface px-6 py-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                  <img
                    src={brandLogo}
                    alt="AdnatePayNest logo"
                    className="h-14 w-14 shrink-0 rounded-full bg-white object-cover shadow-sm ring-1 ring-bank-card-border"
                  />
                  <div>
                    <p className="text-2xl font-bold tracking-tight text-slate-950">{bankName}</p>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      Digital Banking Branch | IFSC {primaryAccount?.ifsc || user?.ifsc || "ADNT0000001"}
                    </p>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-bank-eyebrow">
                    Account Statement
                  </p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{statementLabel}</p>
                  <p className="mt-1 text-sm font-medium text-slate-600">Generated on {generatedOn}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 border-b border-bank-card-border lg:grid-cols-2">
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Account Holder
                </p>
                <p className="mt-2 text-xl font-bold text-slate-950">
                  {user?.name || "Customer"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {accounts.length} linked account{accounts.length === 1 ? "" : "s"} | {customerReference}
                </p>
              </div>
              <div className="border-t border-bank-card-border p-6 lg:border-l lg:border-t-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Statement Period
                </p>
                <p className="mt-2 text-xl font-bold text-slate-950">{periodLabel}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Status: <span className="font-semibold text-emerald-700">{statementStatus}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="border-b border-bank-card-border p-6 lg:border-b-0 lg:border-r">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Customer Details
                </p>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {accountInfoRows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-bold text-slate-900">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="p-6">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Statement Totals
                </p>
                <div className="overflow-hidden rounded-lg border border-bank-card-border">
                  {balanceRows.map(([label, value], index) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between gap-4 px-4 py-3 ${
                        index === balanceRows.length - 1
                          ? "bg-bank-surface font-bold"
                          : "border-b border-bank-card-border"
                      }`}
                    >
                      <span className="text-sm text-slate-600">{label}</span>
                      <span className="text-right text-sm text-slate-950">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Statement Summary"
          subtitle={`Statement period: ${periodLabel}`}
        >
          <div className="metric-grid-3">
            <div className="metric-tile border-bank-card-border bg-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Net Movement
              </p>
              <p
                className={`mt-2 text-2xl font-bold ${
                  netMovement >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {formatCurrency(netMovement)}
              </p>
            </div>
            <div className="metric-tile border-bank-card-border bg-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Entries
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {periodEntries.length}
              </p>
            </div>
            <div className="metric-tile border-bank-card-border bg-white">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Account
              </p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {accounts.length} linked account{accounts.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </SectionCard>

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

        <SectionCard
          title="Statement Activity"
          subtitle={`${statementLabel} entries for ${periodLabel}`}
        >
          {filteredLedgerEntries.length === 0 ? (
            <EmptyState message="No statement entries for this period and filter." />
          ) : (
            <div className="table-shell">
              <table className="w-full table-fixed text-left">
                <thead className="table-head">
                  <tr>
                    <th className="w-[13%] px-3 py-4 sm:px-5">Date</th>
                    <th className="w-[36%] px-3 py-4 sm:px-5">Details</th>
                    <th className="w-[11%] px-3 py-4 text-right sm:px-5">Debit</th>
                    <th className="w-[18%] px-3 py-4 text-right sm:px-5">Credit</th>
                    <th className="w-[22%] px-3 py-4 text-right sm:px-5">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementPagination.pageRows.map((statement) => (
                    <tr key={statement.id} className="border-b border-slate-100 align-middle last:border-b-0">
                      <td className="px-3 py-7 align-middle sm:px-5">
                        <p className="break-words text-xl font-medium leading-8 text-slate-700">
                          {statement.date}
                        </p>
                      </td>
                      <td className="px-3 py-7 align-middle sm:px-5">
                        <p className="break-words text-lg font-bold leading-7 text-slate-950">
                          {statement.detail}
                        </p>
                        <p className="mt-2 break-words text-sm leading-7 text-slate-500">
                          {[`${statement.accountType} account`, statement.accountDetail, `Ref ${statement.id}`]
                            .filter(Boolean)
                            .join(" | ")}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(
                              statement.status
                            )}`}
                          >
                            {getTransactionStatusLabel(statement.status)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                            {formatTransactionType(statement.transactionType)}
                          </span>
                          {statement.approvalBadge && statement.approvalStatus !== "rejected" && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                statement.approvalStatus === "approved"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {statement.approvalBadge}
                            </span>
                          )}
                        </div>
                        {statement.approvalStatus === "rejected" && (
                          <div className="mt-3">
                            <span className="inline-flex rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-700">
                              Manager Rejected
                            </span>
                          </div>
                        )}
                        {statement.managerReview && statement.approvalStatus !== "rejected" && (
                          <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">
                            {statement.managerReview}
                          </p>
                        )}
                      </td>
                      {statement.failureReason ? (
                        <td colSpan={3} className="px-3 py-7 align-middle sm:px-5">
                          <div className="rounded-lg bg-red-50 px-5 py-5 text-left ring-1 ring-red-100">
                            <span className="mb-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-red-700 ring-1 ring-red-100">
                              Manager Reason
                            </span>
                            <p className="max-w-full break-words text-base font-bold leading-8 text-red-700">
                              {getRejectionNarrative(statement)}
                            </p>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-7 text-right align-middle sm:px-5">
                            {statement.type === "Debit" && statement.isPosted ? (
                              <p className="whitespace-nowrap text-lg font-bold leading-7 text-red-700">
                                {formatCurrency(statement.amount)}
                              </p>
                            ) : statement.type === "Transfer" && statement.isPosted ? (
                              <p className="whitespace-nowrap text-lg font-bold leading-7 text-slate-500">
                                {formatCurrency(statement.amount)}
                              </p>
                            ) : (
                              <span className="text-xl font-bold text-red-700">-</span>
                            )}
                          </td>
                          <td className="px-3 py-7 text-right align-middle sm:px-5">
                            {statement.type === "Credit" && statement.isPosted ? (
                              <p className="whitespace-nowrap text-lg font-bold leading-7 text-emerald-700">
                                {formatCurrency(statement.amount)}
                              </p>
                            ) : statement.type === "Transfer" && statement.isPosted ? (
                              <p className="whitespace-nowrap text-lg font-bold leading-7 text-emerald-700">
                                {formatCurrency(statement.amount)}
                              </p>
                            ) : (
                              <span className="text-xl font-bold text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-7 text-right align-middle sm:px-5">
                            {statement.isPosted ? (
                              <p className="whitespace-nowrap text-lg font-bold leading-7 text-slate-950">
                                {formatCurrency(statement.balance)}
                              </p>
                            ) : (
                              <span className="text-sm font-semibold leading-5 text-slate-400">
                                Not posted
                              </span>
                            )}
                          </td>
                        </>
                      )}
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
