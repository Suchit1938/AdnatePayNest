import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeIndianRupee,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  Landmark,
  ReceiptText,
  Upload,
  Send,
  WalletCards,
} from "lucide-react";

import api from "../../api/axios";
import EmptyState from "../../components/ui/EmptyState";
import MetricTile from "../../components/ui/MetricTile";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TablePagination from "../../components/ui/TablePagination";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import { useToast } from "../../components/ui/useToast";
import DashboardLayout from "../../layouts/DashboardLayout";
import { useAuth } from "../../context/useAuth";
import { formatCurrency } from "../../utils/format";
import { getTierTone } from "../../utils/ui";

const statusStyles = {
  submitted: "bg-blue-50 text-blue-700",
  under_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  disbursed: "bg-violet-50 text-violet-700",
  closed: "bg-slate-100 text-slate-700",
};

const statusLabel = (status) =>
  String(status || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const detailLabel = (value) =>
  String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());

const customerFactorLabels = {
  incomeStrength: "Income",
  liabilities: "Active Loans",
  classification: "Customer Profile",
  employmentStability: "Employment Stability",
  accountHistory: "Account History",
  overdraftUsage: "Overdraft Usage",
};

const loanStageSteps = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Review" },
  { key: "approved", label: "Approved" },
  { key: "disbursed", label: "Disbursed" },
  { key: "closed", label: "Closed" },
];

const getCustomerFactorStatus = (score, maxScore = 0) => {
  const numericScore = Number(score || 0);
  const numericMaxScore = Number(maxScore || 0);
  const ratio = numericMaxScore > 0 ? numericScore / numericMaxScore : 0;

  if (numericScore <= 0) {
    return {
      label: "Needs confirmation",
      tone: "border-amber-100 bg-amber-50 text-amber-800",
    };
  }

  if (ratio >= 0.75) {
    return {
      label: "Looks good",
      tone: "border-emerald-100 bg-emerald-50 text-emerald-800",
    };
  }

  if (ratio >= 0.5) {
    return {
      label: "Acceptable",
      tone: "border-blue-100 bg-blue-50 text-blue-800",
    };
  }

  return {
    label: "Needs review",
    tone: "border-amber-100 bg-amber-50 text-amber-800",
  };
};

const RequiredMark = () => (
  <span className="ml-1 text-sm font-black text-red-600" aria-label="required">
    *
  </span>
);

const loanMetricToneStyles = {
  blue: {
    accent: "bg-blue-500",
    icon: "bg-blue-50 text-blue-600",
  },
  amber: {
    accent: "bg-amber-500",
    icon: "bg-amber-50 text-amber-600",
  },
  emerald: {
    accent: "bg-emerald-500",
    icon: "bg-emerald-50 text-emerald-600",
  },
  red: {
    accent: "bg-red-500",
    icon: "bg-red-50 text-red-600",
  },
  slate: {
    accent: "bg-slate-500",
    icon: "bg-slate-50 text-slate-600",
  },
};

const LoanMetricCard = ({
  label,
  value,
  helper,
  icon: Icon,
  tone = "blue",
  className = "",
}) => {
  const styles = loanMetricToneStyles[tone] || loanMetricToneStyles.blue;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-bank-card-border bg-white p-5 shadow-sm ${className}`.trim()}
    >
      <div className={`absolute inset-x-0 top-0 h-1.5 ${styles.accent}`} />
      <div className="flex min-w-0 items-start gap-4 pt-3">
        {Icon && (
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl shadow-sm ring-1 ring-black/5 ${styles.icon}`}>
            <Icon size={26} strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          <p className="break-words text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 break-words text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
            {value}
          </p>
          {helper && (
            <p className="mt-4 break-words text-sm font-semibold leading-6 text-slate-500">
              {helper}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const initialForm = {
  loanType: "personal",
  amount: "100000",
  tenureMonths: "24",
  monthlyIncome: "",
  existingMonthlyLiabilities: "0",
  employmentType: "salaried",
  employmentDurationMonths: "",
  disbursementAccountNumber: "",
  purpose: "",
};

const initialCalculator = {
  loanType: "personal",
  amount: "100000",
  tenureMonths: "24",
};

const initialSupportingDetails = {
  personal: {
    expenseCategory: "",
    requestedFor: "",
  },
  home: {
    propertyLocation: "",
    propertyType: "",
    builderOrSeller: "",
  },
  vehicle: {
    vehicleType: "",
    vehicleModel: "",
    dealerName: "",
  },
  education: {
    instituteName: "",
    courseName: "",
    admissionStatus: "",
    academicYear: "",
  },
};

const documentOptionsByLoanType = {
  personal: ["Income Proof", "Bank Statement", "Employment Proof"],
  home: ["Income Proof", "Bank Statement", "Property Document", "Property Valuation"],
  vehicle: ["Income Proof", "Bank Statement", "Vehicle Quotation", "Dealer Invoice"],
  education: ["Admission Letter", "Fee Structure", "Bank Statement", "Student ID/Entrance Result", "Co-applicant Income Proof"],
};

const admissionStatusOptions = ["Confirmed", "Provisional", "Awaiting Result"];
const allowedDocumentExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
const allowedDocumentMimeTypes = ["application/pdf", "image/png", "image/jpeg"];
const emptyRows = [];
const educationRequiredDetailFields = ["instituteName", "courseName", "admissionStatus", "academicYear"];
const getUploadUrl = (fileUrl = "") =>
  fileUrl ? `${api.defaults.baseURL.replace(/\/api$/, "")}${fileUrl}` : "";
const createLoanIdempotencyKey = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `loan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const isEmiPayableNow = (row) => {
  if (!row || ["paid", "foreclosed"].includes(row.status)) return false;
  if (["missed", "overdue"].includes(row.status)) return true;

  const dueDate = row.dueDate ? new Date(row.dueDate) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) return false;

  const dueDay = new Date(dueDate);
  const today = new Date();
  dueDay.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return dueDay <= today;
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN") : "Not scheduled";

const supportingDetailFieldsByLoanType = {
  personal: [
    { key: "expenseCategory", label: "Expense Category", placeholder: "Medical, travel, wedding, renovation" },
    { key: "requestedFor", label: "Requested For", placeholder: "Brief beneficiary or expense detail" },
  ],
  home: [
    { key: "propertyLocation", label: "Property Location", placeholder: "City, area, or project name" },
    { key: "propertyType", label: "Property Type", placeholder: "Apartment, plot, villa" },
    { key: "builderOrSeller", label: "Builder / Seller", placeholder: "Builder or seller name" },
  ],
  vehicle: [
    { key: "vehicleType", label: "Vehicle Type", placeholder: "Car, bike, commercial vehicle" },
    { key: "vehicleModel", label: "Vehicle Model", placeholder: "Model and variant" },
    { key: "dealerName", label: "Dealer Name", placeholder: "Dealer or showroom name" },
  ],
  education: [
    { key: "instituteName", label: "Institute Name", placeholder: "University or college name" },
    { key: "courseName", label: "Course Name", placeholder: "Program or degree name" },
    { key: "admissionStatus", label: "Admission Status", type: "select", options: admissionStatusOptions },
    { key: "academicYear", label: "Academic Year", placeholder: "2026-27" },
  ],
};

const Loans = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loanRules, setLoanRules] = useState({ loanTypes: [] });
  const [form, setForm] = useState(initialForm);
  const [calculator, setCalculator] = useState(initialCalculator);
  const [isCalculatorAppliedToForm, setIsCalculatorAppliedToForm] = useState(false);
  const [supportingDetails, setSupportingDetails] = useState(initialSupportingDetails);
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [touchedFields, setTouchedFields] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingEmiNumber, setPayingEmiNumber] = useState(null);
  const [partPaymentAmount, setPartPaymentAmount] = useState("");
  const [partPaymentImpact, setPartPaymentImpact] = useState("reduce_emi");
  const [isPostingPartPayment, setIsPostingPartPayment] = useState(false);
  const [isForeclosing, setIsForeclosing] = useState(false);
  const [selectedLoanTab, setSelectedLoanTab] = useState("overview");
  const [activeLoanPageTab, setActiveLoanPageTab] = useState("apply");
  const [selectedPaymentAccountNumber, setSelectedPaymentAccountNumber] = useState("");
  const loanActionLocks = useRef({
    emi: false,
    partPayment: false,
    foreclosure: false,
  });
  const loanActionIdempotencyKeys = useRef({
    application: createLoanIdempotencyKey(),
    emi: createLoanIdempotencyKey(),
    partPayment: createLoanIdempotencyKey(),
    foreclosure: createLoanIdempotencyKey(),
  });

  const customerAccounts = useMemo(
    () => (user?.accounts?.length ? user.accounts : [user?.account].filter(Boolean)),
    [user]
  );
  const hasMultipleCustomerAccounts = customerAccounts.length > 1;
  const loadLoans = useCallback(() =>
    api.get("/loans").then(({ data }) => {
      setLoans(data.loans || []);
      setLoanRules(data.loanRules || { loanTypes: [] });
      const firstRule = data.loanRules?.loanTypes?.[0];

      if (firstRule) {
        setForm((current) => ({
          ...current,
          loanType: current.loanType || firstRule.key,
          disbursementAccountNumber:
            current.disbursementAccountNumber ||
            (customerAccounts.length === 1 ? customerAccounts[0]?.accountNumber || "" : ""),
        }));
        setCalculator((current) => ({
          ...current,
          loanType: current.loanType || firstRule.key,
        }));
      }
    }), [customerAccounts]);

  useEffect(() => {
    loadLoans().catch(() => toast.error("Unable to load loan details."));
  }, [loadLoans, toast]);

  const selectedRule =
    loanRules.loanTypes?.find((rule) => rule.key === form.loanType) ||
    loanRules.loanTypes?.[0];
  const calculatorRule =
    loanRules.loanTypes?.find((rule) => rule.key === calculator.loanType) ||
    loanRules.loanTypes?.[0];
  const calculatorInterestRate = Math.max(0, Number(calculatorRule?.annualInterestRate || 0));
  const calculatorMaxAmount = Math.round(Number(calculatorRule?.maxAmount || 0));
  const calculatorAmount = Number(calculator.amount || 0);
  const calculatorTenureMonths = Number(calculator.tenureMonths || 0);
  const normalizedCalculatorTenureMonths = Math.max(1, calculatorTenureMonths || 1);
  const calculatorMonthlyRate = calculatorInterestRate / 12 / 100;
  const calculatorEmi = useMemo(() => {
    if (calculatorAmount <= 0) return 0;
    if (calculatorMonthlyRate <= 0) {
      return Math.round(calculatorAmount / normalizedCalculatorTenureMonths);
    }

    const factor = (1 + calculatorMonthlyRate) ** normalizedCalculatorTenureMonths;
    return Math.round((calculatorAmount * calculatorMonthlyRate * factor) / (factor - 1));
  }, [calculatorAmount, calculatorMonthlyRate, normalizedCalculatorTenureMonths]);
  const calculatorTotalRepayment = calculatorEmi * normalizedCalculatorTenureMonths;
  const calculatorTotalInterest = Math.max(0, calculatorTotalRepayment - calculatorAmount);
  const effectiveInterestRate = Math.max(
    0,
    Number(selectedRule?.annualInterestRate || 0)
  );
  const effectiveMaxAmount = Math.round(Number(selectedRule?.maxAmount || 0));
  const amount = Number(form.amount || 0);
  const tenureMonths = Math.max(1, Number(form.tenureMonths || 1));
  const monthlyRate = effectiveInterestRate / 12 / 100;
  const emiPreview = useMemo(() => {
    if (amount <= 0) return 0;
    if (monthlyRate <= 0) return Math.round(amount / tenureMonths);
    const factor = (1 + monthlyRate) ** tenureMonths;
    return Math.round((amount * monthlyRate * factor) / (factor - 1));
  }, [amount, monthlyRate, tenureMonths]);
  const totalRepayment = emiPreview * tenureMonths;
  const totalInterest = Math.max(0, totalRepayment - amount);
  const activeLoans = loans.filter((loan) => ["approved", "disbursed"].includes(loan.status));
  const pendingLoans = loans.filter((loan) => ["submitted", "under_review"].includes(loan.status));
  const selectedLoan = loans.find((loan) => loan.id === selectedLoanId);
  const effectivePaymentAccountNumber =
    selectedPaymentAccountNumber ||
    selectedLoan?.disbursementAccountNumber ||
    customerAccounts[0]?.accountNumber ||
    "";
  const selectedPaymentAccount =
    customerAccounts.find((account) => account.accountNumber === effectivePaymentAccountNumber) ||
    customerAccounts[0];
  const summaryLoan = selectedLoan || activeLoans[0] || loans[0];
  const selectedSupportingFields = supportingDetailFieldsByLoanType[form.loanType] || [];
  const isEducationLoan = form.loanType === "education";
  const isStudentEducationLoan = isEducationLoan && form.employmentType === "student";
  const incomeFieldLabel = isStudentEducationLoan ? "Co-applicant Monthly Income" : "Monthly Income";
  const liabilitiesFieldLabel = isStudentEducationLoan
    ? "Co-applicant Monthly Liabilities"
    : "Existing Monthly Liabilities";
  const nextEmi =
    summaryLoan?.amortizationSchedule?.find((row) =>
      ["pending", "missed", "overdue"].includes(row.status)
    ) ||
    summaryLoan?.amortizationSchedule?.[0];
  const selectedLoanNextScheduledEmi = selectedLoan?.amortizationSchedule?.find(
    (row) => !["paid", "foreclosed"].includes(row.status)
  );
  const selectedLoanNextPayableEmi = isEmiPayableNow(selectedLoanNextScheduledEmi)
    ? selectedLoanNextScheduledEmi
    : null;
  const selectedLoanForeclosureQuote = selectedLoan?.foreclosureQuote || {};
  const selectedLoanDocuments = selectedLoan
    ? [
        {
          key: "sanction",
          title: "Sanction Letter",
          fileName: selectedLoan.sanctionLetter?.fileName || "Loan sanction letter",
          fileUrl: selectedLoan.sanctionLetter?.fileUrl,
          status: selectedLoan.sanctionLetter?.status || "generated",
          generatedAt: selectedLoan.sanctionLetter?.generatedAt,
          fallbackDate: "approval",
        },
        {
          key: "agreement",
          title: "Loan Agreement",
          fileName: selectedLoan.loanAgreement?.fileName || "Loan agreement",
          fileUrl: selectedLoan.loanAgreement?.fileUrl,
          status: selectedLoan.loanAgreement?.status || "generated",
          generatedAt: selectedLoan.loanAgreement?.generatedAt,
          fallbackDate: "sanction",
        },
        {
          key: "repayment",
          title: "Repayment Schedule",
          fileName: selectedLoan.repaymentScheduleDocument?.fileName || "Repayment schedule",
          fileUrl: selectedLoan.repaymentScheduleDocument?.fileUrl,
          status: selectedLoan.repaymentScheduleDocument?.status || "generated",
          generatedAt: selectedLoan.repaymentScheduleDocument?.generatedAt,
          fallbackDate: "disbursal",
        },
      ].filter((document) => document.fileUrl)
    : [];
  const selectedLoanAmortizationRows = selectedLoan?.amortizationSchedule || emptyRows;
  const amortizationPagination = usePaginatedRows(selectedLoanAmortizationRows);
  const canManageRepayment = selectedLoan?.status === "disbursed";
  const isApprovedAwaitingDisbursal = selectedLoan?.status === "approved";
  const selectedLoanStageIndex =
    selectedLoan?.status === "rejected"
      ? -1
      : Math.max(
          0,
          loanStageSteps.findIndex((step) => step.key === selectedLoan?.status)
        );
  const selectedLoanNextStep = selectedLoan
    ? selectedLoan.additionalInfoRequested
      ? selectedLoan.managerNote || "Manager requested more information."
      : selectedLoan.status === "rejected"
        ? selectedLoan.rejectionReason || "Application was rejected after review."
        : selectedLoan.status === "submitted"
          ? "Next step: manager review will begin."
          : selectedLoan.status === "under_review"
            ? "Next step: manager decision is pending."
            : selectedLoan.status === "approved"
              ? "Next step: manager disbursal is pending."
              : selectedLoan.status === "disbursed" && selectedLoanNextPayableEmi
                ? `Next step: pay EMI ${selectedLoanNextPayableEmi.emiNumber} for ${formatCurrency(selectedLoanNextPayableEmi.emiAmount)}.`
                : selectedLoan.status === "disbursed" && selectedLoanNextScheduledEmi
                  ? `Next EMI ${selectedLoanNextScheduledEmi.emiNumber} is scheduled for ${formatDate(selectedLoanNextScheduledEmi.dueDate)}.`
                : selectedLoan.status === "closed"
                  ? "Loan is closed. No further customer action is required."
                  : "Track the latest status and documents here."
    : "";
  const selectedLoanTabs = selectedLoan
    ? [
        { key: "overview", label: "Overview" },
        ...(selectedLoanDocuments.length > 0
          ? [{ key: "documents", label: `Documents (${selectedLoanDocuments.length})` }]
          : []),
        ...(["approved", "disbursed", "closed"].includes(selectedLoan.status)
          ? [{ key: "repayment", label: "Repayment" }]
          : []),
        ...(["approved", "disbursed", "closed"].includes(selectedLoan.status) &&
        selectedLoanAmortizationRows.length > 0
          ? [{ key: "schedule", label: "Schedule" }]
          : []),
      ]
    : [];
  const loanPageTabs = [
    { key: "apply", label: "Apply Loan", count: pendingLoans.length },
    { key: "calculator", label: "EMI Calculator" },
    { key: "loans", label: "My Loans", count: loans.length },
  ];
  const partPaymentPolicy = loanRules.partPaymentPolicy || {
    enabled: true,
    minimumAmount: 1000,
    minimumPrincipalPercentage: 1,
    lockInMonths: 0,
    chargePercentage: 0,
  };
  const selectedOutstandingPrincipal = Number(
    selectedLoan?.outstandingPrincipal ?? selectedLoan?.amount ?? 0
  );
  const minimumPartPayment = Math.max(
    Number(partPaymentPolicy.minimumAmount || 0),
    Math.ceil(
      selectedOutstandingPrincipal *
        Number(partPaymentPolicy.minimumPrincipalPercentage || 0) /
        100
    )
  );
  const partPaymentPreviewAmount = Number(partPaymentAmount || 0);
  const maxPartPaymentBeforeForeclosure = Math.floor(selectedOutstandingPrincipal * 0.9) - 1;
  const partPaymentCharge = Math.round(
    partPaymentPreviewAmount * Number(partPaymentPolicy.chargePercentage || 0) / 100
  );
  const partPaymentTotalDebit = partPaymentPreviewAmount + partPaymentCharge;
  const partPaymentLockEndsAt = selectedLoan?.disbursedAt
    ? new Date(new Date(selectedLoan.disbursedAt).setMonth(
      new Date(selectedLoan.disbursedAt).getMonth() + Number(partPaymentPolicy.lockInMonths || 0)
    ))
    : null;
  const isPartPaymentLocked = Boolean(
    partPaymentLockEndsAt && partPaymentLockEndsAt > new Date()
  );

  const validateLoanCalculator = () => {
    const errors = {};
    const numericAmount = Number(calculator.amount || 0);
    const numericTenure = Number(calculator.tenureMonths || 0);
    const minimumAmount = Number(calculatorRule?.minAmount || 1);
    const minimumTenure = Number(calculatorRule?.minTenureMonths || 1);
    const maximumTenure = Number(calculatorRule?.maxTenureMonths || 0);

    if (!calculatorRule) {
      errors.loanType = "Select a valid loan type.";
    }

    if (!Number.isFinite(numericAmount) || numericAmount < minimumAmount) {
      errors.amount = `Minimum amount is ${formatCurrency(minimumAmount)}.`;
    } else if (calculatorMaxAmount && numericAmount > calculatorMaxAmount) {
      errors.amount = `Maximum amount is ${formatCurrency(calculatorMaxAmount)} for your classification.`;
    }

    if (!Number.isFinite(numericTenure) || numericTenure < minimumTenure) {
      errors.tenureMonths = `Minimum tenure is ${minimumTenure} months.`;
    } else if (maximumTenure && numericTenure > maximumTenure) {
      errors.tenureMonths = `Maximum tenure is ${calculatorRule?.maxTenureMonths} months.`;
    }

    return errors;
  };

  const calculatorValidationErrors = validateLoanCalculator();
  const hasCalculatorValidationErrors = Object.keys(calculatorValidationErrors).length > 0;

  const validateLoanForm = () => {
    const errors = {};
    const numericAmount = Number(form.amount || 0);
    const numericTenure = Number(form.tenureMonths || 0);
    const numericMonthlyIncome = Number(form.monthlyIncome || 0);
    const numericLiabilities = Number(form.existingMonthlyLiabilities || 0);
    const numericEmploymentDuration = Number(form.employmentDurationMonths || 0);
    const purpose = form.purpose.trim();
    const selectedAccount = hasMultipleCustomerAccounts
      ? form.disbursementAccountNumber
      : form.disbursementAccountNumber || customerAccounts[0]?.accountNumber || "";
    const minimumEmploymentDurationByType = {
      salaried: 6,
      "self-employed": 12,
      business: 12,
    };
    const requiredEmploymentDuration =
      minimumEmploymentDurationByType[form.employmentType] || 0;

    if (!selectedRule) {
      errors.loanType = "Select a valid loan type.";
    }

    if (form.loanType === "education" && form.employmentType !== "student") {
      errors.employmentType = "Education loans are available only under the Student category.";
    }

    if (numericAmount < Number(selectedRule?.minAmount || 1)) {
      errors.amount = `Minimum amount is ${formatCurrency(selectedRule?.minAmount || 1)}.`;
    } else if (effectiveMaxAmount && numericAmount > effectiveMaxAmount) {
      errors.amount = `Maximum amount is ${formatCurrency(effectiveMaxAmount)} for your classification.`;
    }

    if (numericTenure < Number(selectedRule?.minTenureMonths || 1)) {
      errors.tenureMonths = `Minimum tenure is ${selectedRule?.minTenureMonths || 1} months.`;
    } else if (numericTenure > Number(selectedRule?.maxTenureMonths || 0)) {
      errors.tenureMonths = `Maximum tenure is ${selectedRule?.maxTenureMonths} months.`;
    }

    if (numericMonthlyIncome <= 0) {
      errors.monthlyIncome = `${incomeFieldLabel} must be greater than zero.`;
    }

    if (numericLiabilities < 0) {
      errors.existingMonthlyLiabilities = "Existing liabilities cannot be negative.";
    }

    if (requiredEmploymentDuration > 0 && numericEmploymentDuration <= 0) {
      errors.employmentDurationMonths = "Employment duration is required for this employment type.";
    } else if (
      requiredEmploymentDuration > 0 &&
      numericEmploymentDuration < requiredEmploymentDuration
    ) {
      errors.employmentDurationMonths = `Minimum employment duration is ${requiredEmploymentDuration} months.`;
    }

    if (numericMonthlyIncome > 0 && emiPreview > numericMonthlyIncome * 0.5) {
      const emiRatio = Math.round((emiPreview / numericMonthlyIncome) * 100);
      errors.emiPreview = `Estimated EMI is ${emiRatio}% of ${incomeFieldLabel.toLowerCase()}; the allowed maximum is 50%.`;
    }

    if (
      numericMonthlyIncome > 0 &&
      numericLiabilities >= 0 &&
      numericLiabilities + emiPreview > numericMonthlyIncome * 0.6
    ) {
      const obligationRatio = Math.round(((numericLiabilities + emiPreview) / numericMonthlyIncome) * 100);
      errors.totalObligations = `Total monthly obligations are ${obligationRatio}% of ${incomeFieldLabel.toLowerCase()}; the allowed maximum is 60%.`;
    }

    if (!selectedAccount) {
      errors.disbursementAccountNumber = "Select the account where the loan amount should be credited.";
    }

    if (purpose.length < 20) {
      errors.purpose = "Purpose must be at least 20 characters.";
    }

    if (form.loanType === "education") {
      const admissionStatus = supportingDetails.education?.admissionStatus || "";

      educationRequiredDetailFields.forEach((field) => {
        if (!String(supportingDetails.education?.[field] || "").trim()) {
          errors[`supportingDetails.${field}`] = "This education detail is required.";
        }
      });

      if (admissionStatus && !admissionStatusOptions.includes(admissionStatus)) {
        errors["supportingDetails.admissionStatus"] = "Select a valid admission status.";
      }
    }

    if (!documents.some((document) => document.documentType === "Bank Statement")) {
      errors.documents = "Bank Statement is mandatory for loan review.";
    } else if (
      form.employmentType === "student" &&
      !documents.some((document) => document.documentType === "Co-applicant Income Proof")
    ) {
      errors.documents = "Co-applicant income proof is required when employment type is Student.";
    }

    return errors;
  };

  const validationErrors = validateLoanForm();
  const visibleErrors = Object.fromEntries(
    Object.entries(validationErrors).filter(
      ([field]) =>
        submitAttempted ||
        touchedFields[field] ||
        (field === "documents" && form.employmentType === "student") ||
        (field === "disbursementAccountNumber" && customerAccounts.length === 0) ||
        (field === "emiPreview" &&
          (touchedFields.amount || touchedFields.tenureMonths || touchedFields.monthlyIncome)) ||
        (field === "totalObligations" &&
          (touchedFields.amount ||
            touchedFields.tenureMonths ||
            touchedFields.monthlyIncome ||
            touchedFields.existingMonthlyLiabilities))
    )
  );

  const updateForm = (field, value) => {
    setForm((current) => {
      if (field === "loanType") {
        const nextForm = { ...current, loanType: value };

        if (value === "education") {
          nextForm.employmentType = "student";
          nextForm.employmentDurationMonths = "";
        } else if (current.loanType === "education" && current.employmentType === "student") {
          nextForm.employmentType = "salaried";
        }

        return nextForm;
      }

      return { ...current, [field]: value };
    });
    setTouchedFields((current) => ({
      ...current,
      [field]: true,
      ...(field === "amount" || field === "tenureMonths" || field === "monthlyIncome"
        ? { emiPreview: true }
        : {}),
      ...(field === "amount" ||
      field === "tenureMonths" ||
      field === "monthlyIncome" ||
      field === "existingMonthlyLiabilities"
        ? { totalObligations: true }
        : {}),
      ...(field === "employmentType" ? { documents: true } : {}),
    }));

    if (field === "loanType") {
      setDocuments([]);
      setSubmitAttempted(false);
      setTouchedFields({ loanType: true });
    }
  };

  const updateSupportingDetail = (field, value) => {
    setSupportingDetails((current) => ({
      ...current,
      [form.loanType]: {
        ...(current[form.loanType] || {}),
        [field]: value,
      },
    }));
    setTouchedFields((current) => ({ ...current, [`supportingDetails.${field}`]: true }));
  };

  const updateCalculator = (field, value) => {
    setCalculator((current) => ({ ...current, [field]: value }));
  };

  const applyCalculatorToApplication = () => {
    if (hasCalculatorValidationErrors) {
      toast.warning(Object.values(calculatorValidationErrors)[0]);
      return;
    }

    const loanTypeChanged = form.loanType !== calculator.loanType;

    setForm((current) => ({
      ...current,
      loanType: calculator.loanType,
      amount: calculator.amount,
      tenureMonths: calculator.tenureMonths,
      ...(calculator.loanType === "education"
        ? { employmentType: "student", employmentDurationMonths: "" }
        : current.loanType === "education" && current.employmentType === "student"
          ? { employmentType: "salaried" }
          : {}),
    }));
    setIsCalculatorAppliedToForm(true);
    setTouchedFields((current) => ({
      ...current,
      loanType: true,
      amount: true,
      tenureMonths: true,
      emiPreview: true,
      totalObligations: true,
    }));
    setActiveLoanPageTab("apply");

    if (loanTypeChanged) {
      setDocuments([]);
      setSubmitAttempted(false);
    }
  };

  const addDocument = (documentType, file) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const hasAllowedExtension = allowedDocumentExtensions.some((extension) =>
      lowerName.endsWith(extension)
    );

    if (!allowedDocumentMimeTypes.includes(file.type) && !hasAllowedExtension) {
      toast.warning("Upload only PDF, PNG, JPG, or JPEG files.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.warning("Upload files up to 2 MB for this version.");
      return;
    }

    setDocuments((current) => [
      ...current.filter((document) => document.documentType !== documentType),
      {
        documentType,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        file,
      },
    ]);
    setTouchedFields((current) => ({ ...current, documents: true }));
  };

  const removeDocument = (documentType) => {
    setDocuments((current) =>
      current.filter((document) => document.documentType !== documentType)
    );
    setTouchedFields((current) => ({ ...current, documents: true }));
  };

  const submitLoan = async (event) => {
    event.preventDefault();
    setSubmitAttempted(true);
    const validationErrors = validateLoanForm();

    if (Object.keys(validationErrors).length > 0) {
      toast.warning("Please fix the highlighted loan application details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = new FormData();

      Object.entries({
        ...form,
        amount: Number(form.amount),
        tenureMonths: Number(form.tenureMonths),
        monthlyIncome: Number(form.monthlyIncome),
        existingMonthlyLiabilities: Number(form.existingMonthlyLiabilities),
        employmentDurationMonths: Number(form.employmentDurationMonths),
        idempotencyKey: loanActionIdempotencyKeys.current.application,
        disbursementAccountNumber:
          form.disbursementAccountNumber || customerAccounts[0]?.accountNumber,
        supportingDetails: JSON.stringify(supportingDetails[form.loanType] || {}),
      }).forEach(([key, value]) => {
        payload.append(key, value ?? "");
      });

      payload.append(
        "documentTypes",
        JSON.stringify(documents.map((document) => document.documentType))
      );
      documents.forEach((document) => {
        payload.append("documents", document.file);
      });

      const { data } = await api.post("/loans", payload);

      toast.success(data.message || "Loan application submitted.");
      setForm(initialForm);
      setIsCalculatorAppliedToForm(false);
      setSupportingDetails(initialSupportingDetails);
      setDocuments([]);
      setTouchedFields({});
      setSubmitAttempted(false);
      loanActionIdempotencyKeys.current.application = createLoanIdempotencyKey();
      await loadLoans();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Unable to reach the banking service. Please try again shortly."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const payNextEmi = async () => {
    if (!selectedLoan || !selectedLoanNextPayableEmi) {
      toast.warning("The next scheduled EMI is not due yet.");
      return;
    }
    if (loanActionLocks.current.emi) return;

    loanActionLocks.current.emi = true;
    setPayingEmiNumber(selectedLoanNextPayableEmi.emiNumber);

    try {
      const { data } = await api.patch(
        `/loans/${selectedLoan.id}/emis/${selectedLoanNextPayableEmi.emiNumber}/pay`,
        {
          paymentAccountNumber:
            selectedPaymentAccount?.accountNumber || selectedLoan.disbursementAccountNumber,
          idempotencyKey: loanActionIdempotencyKeys.current.emi,
        }
      );

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      loanActionIdempotencyKeys.current.emi = createLoanIdempotencyKey();
      toast.success(data.message || "EMI paid successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to pay EMI.");
    } finally {
      loanActionLocks.current.emi = false;
      setPayingEmiNumber(null);
    }
  };

  const postPartPayment = async () => {
    if (!selectedLoan) return;
    if (loanActionLocks.current.partPayment) return;
    const amount = Number(partPaymentAmount || 0);

    if (amount <= 0) {
      toast.warning("Enter a valid part-payment amount.");
      return;
    }
    if (partPaymentPolicy.enabled === false) {
      toast.warning("Part-payment is currently disabled by bank policy.");
      return;
    }
    if (isPartPaymentLocked) {
      toast.warning(`Part-payment is available after ${partPaymentLockEndsAt.toLocaleDateString()}.`);
      return;
    }
    if (amount < minimumPartPayment) {
      toast.warning(`Minimum part-payment is ${formatCurrency(minimumPartPayment)}.`);
      return;
    }
    if (amount >= selectedOutstandingPrincipal) {
      toast.warning("Use foreclosure to clear the full outstanding principal.");
      return;
    }
    if (amount > maxPartPaymentBeforeForeclosure) {
      toast.warning(
        `Use foreclosure when paying ${formatCurrency(Math.ceil(selectedOutstandingPrincipal * 0.9))} or more toward principal.`
      );
      return;
    }

    loanActionLocks.current.partPayment = true;
    setIsPostingPartPayment(true);

    try {
      const { data } = await api.post(`/loans/${selectedLoan.id}/part-payments`, {
        amount,
        repaymentImpact: partPaymentImpact,
        paymentAccountNumber:
          selectedPaymentAccount?.accountNumber || selectedLoan.disbursementAccountNumber,
        idempotencyKey: loanActionIdempotencyKeys.current.partPayment,
      });

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      setPartPaymentAmount("");
      loanActionIdempotencyKeys.current.partPayment = createLoanIdempotencyKey();
      toast.success(data.message || "Part-payment posted successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to post part-payment.");
    } finally {
      loanActionLocks.current.partPayment = false;
      setIsPostingPartPayment(false);
    }
  };

  const forecloseSelectedLoan = async () => {
    if (!selectedLoan) return;
    if (loanActionLocks.current.foreclosure) return;

    loanActionLocks.current.foreclosure = true;
    setIsForeclosing(true);

    try {
      const { data } = await api.post(`/loans/${selectedLoan.id}/foreclose`, {
        paymentAccountNumber:
          selectedPaymentAccount?.accountNumber || selectedLoan.disbursementAccountNumber,
        idempotencyKey: loanActionIdempotencyKeys.current.foreclosure,
      });

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      loanActionIdempotencyKeys.current.foreclosure = createLoanIdempotencyKey();
      toast.success(data.message || "Loan foreclosed successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to foreclose loan.");
    } finally {
      loanActionLocks.current.foreclosure = false;
      setIsForeclosing(false);
    }
  };

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow="Loan Management"
          title="Loans"
          subtitle="Apply for a loan, review affordability, and track application and EMI status."
        >
          <span className={`badge-pill capitalize ${getTierTone(user?.classification).badge}`}>
            {user?.classification || "Customer"} classification
          </span>
        </PageHeader>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2">
          <LoanMetricCard
            label="Active Loans"
            value={activeLoans.length}
            helper="Approved or disbursed loans"
            icon={Landmark}
            tone="blue"
          />
          <LoanMetricCard
            label="Pending Applications"
            value={pendingLoans.length}
            helper="Awaiting manager review"
            icon={ClipboardList}
            tone={pendingLoans.length ? "amber" : "emerald"}
          />
          <LoanMetricCard
            label="Outstanding Balance"
            value={formatCurrency(
              activeLoans.reduce(
                (sum, loan) => sum + Number(loan.outstandingPrincipal ?? loan.amount ?? 0),
                0
              )
            )}
            helper="Live active principal"
            icon={WalletCards}
            tone="emerald"
          />
          <LoanMetricCard
            label="Next EMI"
            value={nextEmi ? formatCurrency(nextEmi.emiAmount) : "Not scheduled"}
            helper={nextEmi ? "Next pending installment" : "No EMI currently due"}
            icon={ReceiptText}
            tone={nextEmi ? "red" : "slate"}
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-bank-card-border bg-white p-3 shadow-sm">
          <div className="flex min-w-max gap-2">
            {loanPageTabs.map((tab) => {
              const isActive = activeLoanPageTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveLoanPageTab(tab.key)}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-bank-sidebar text-white shadow-sm hover:bg-bank-sidebar-hover"
                      : "text-slate-600 hover:bg-bank-surface hover:text-bank-eyebrow"
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                        isActive ? "bg-white/20 text-white" : "bg-bank-surface text-slate-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <section className="grid grid-cols-1 gap-6">
          {activeLoanPageTab === "calculator" && (
          <SectionCard
            title="EMI Calculator"
            subtitle="Estimate repayment before starting a loan application."
            icon={Calculator}
          >
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-bank-card-border bg-white p-5 shadow-sm sm:grid-cols-2">
                <label className="label-field sm:col-span-2">
                  <span>Loan Type</span>
                  <select
                    value={calculator.loanType}
                    onChange={(event) => updateCalculator("loanType", event.target.value)}
                    className="input-field"
                  >
                    {(loanRules.loanTypes || []).map((rule) => (
                      <option key={rule.key} value={rule.key}>
                        {rule.label}
                      </option>
                    ))}
                  </select>
                  {calculatorValidationErrors.loanType && (
                    <span className="mt-1 text-xs font-semibold text-red-600">
                      {calculatorValidationErrors.loanType}
                    </span>
                  )}
                </label>
                <label className="label-field">
                  <span>Loan Amount</span>
                  <input
                    type="number"
                    min={calculatorRule?.minAmount || 1}
                    max={calculatorMaxAmount || calculatorRule?.maxAmount || undefined}
                    value={calculator.amount}
                    onChange={(event) => updateCalculator("amount", event.target.value)}
                    className="input-field"
                  />
                  <span className="mt-1 text-xs font-semibold text-slate-500">
                    {formatCurrency(calculatorRule?.minAmount || 0)} to{" "}
                    {formatCurrency(calculatorMaxAmount || calculatorRule?.maxAmount || 0)}
                  </span>
                  {calculatorValidationErrors.amount && (
                    <span className="mt-1 text-xs font-semibold text-red-600">
                      {calculatorValidationErrors.amount}
                    </span>
                  )}
                </label>
                <label className="label-field">
                  <span>Tenure</span>
                  <input
                    type="number"
                    min={calculatorRule?.minTenureMonths || 1}
                    max={calculatorRule?.maxTenureMonths || 240}
                    value={calculator.tenureMonths}
                    onChange={(event) => updateCalculator("tenureMonths", event.target.value)}
                    className="input-field"
                  />
                  <span className="mt-1 text-xs font-semibold text-slate-500">
                    {calculatorRule?.minTenureMonths || 1} to{" "}
                    {calculatorRule?.maxTenureMonths || 240} months
                  </span>
                  {calculatorValidationErrors.tenureMonths && (
                    <span className="mt-1 text-xs font-semibold text-red-600">
                      {calculatorValidationErrors.tenureMonths}
                    </span>
                  )}
                </label>
              </div>

              <div className="overflow-hidden rounded-xl border border-bank-card-border bg-white shadow-sm">
                <div className="border-b border-bank-card-border bg-bank-surface px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    Estimated Monthly EMI
                  </p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">
                    {formatCurrency(calculatorEmi)}
                  </p>
                  <span className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                    {calculatorInterestRate}% p.a.
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Total Interest</p>
                    <p className="mt-1 font-bold text-slate-950">
                      {formatCurrency(calculatorTotalInterest)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Total Repayment</p>
                    <p className="mt-1 font-bold text-slate-950">
                      {formatCurrency(calculatorTotalRepayment)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={applyCalculatorToApplication}
                    disabled={hasCalculatorValidationErrors}
                    className="btn-primary justify-center sm:col-span-2 xl:col-span-1"
                  >
                    <Send size={17} />
                    Apply With These Details
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
          )}

          {activeLoanPageTab === "apply" && (
          <SectionCard
            title="Apply For Loan"
            subtitle="The system calculates EMI and a provisional eligibility score before manager review."
            icon={BadgeIndianRupee}
          >
            <form onSubmit={submitLoan} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="label-field">
                <span>Loan Type<RequiredMark /></span>
                <select
                  value={form.loanType}
                  onChange={(event) => updateForm("loanType", event.target.value)}
                  disabled={isCalculatorAppliedToForm}
                  className="input-field"
                >
                  {(loanRules.loanTypes || []).map((rule) => (
                    <option key={rule.key} value={rule.key}>
                      {rule.label}
                    </option>
                  ))}
                </select>
                {visibleErrors.loanType && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.loanType}</span>}
              </label>
              <label className="label-field">
                <span>Amount<RequiredMark /></span>
                <input
                  type="number"
                  min={selectedRule?.minAmount || 1}
                  max={effectiveMaxAmount || selectedRule?.maxAmount || undefined}
                  value={form.amount}
                  onChange={(event) => updateForm("amount", event.target.value)}
                  disabled={isCalculatorAppliedToForm}
                  className="input-field"
                  required
                />
                {visibleErrors.amount && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.amount}</span>}
              </label>
              <label className="label-field">
                <span>Tenure<RequiredMark /></span>
                <input
                  type="number"
                  min={selectedRule?.minTenureMonths || 1}
                  max={selectedRule?.maxTenureMonths || 240}
                  value={form.tenureMonths}
                  onChange={(event) => updateForm("tenureMonths", event.target.value)}
                  disabled={isCalculatorAppliedToForm}
                  className="input-field"
                  required
                />
                <span className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedRule?.minTenureMonths || 1} to{" "}
                  {selectedRule?.maxTenureMonths || 240} months
                </span>
                {visibleErrors.tenureMonths && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.tenureMonths}</span>}
              </label>
              <label className="label-field">
                <span>{incomeFieldLabel}<RequiredMark /></span>
                <input
                  type="number"
                  min="1"
                  value={form.monthlyIncome}
                  onChange={(event) => updateForm("monthlyIncome", event.target.value)}
                  className="input-field"
                  required
                />
                {visibleErrors.monthlyIncome && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.monthlyIncome}</span>}
              </label>
              <label className="label-field">
                {liabilitiesFieldLabel}
                <input
                  type="number"
                  min="0"
                  value={form.existingMonthlyLiabilities}
                  onChange={(event) => updateForm("existingMonthlyLiabilities", event.target.value)}
                  className="input-field"
                />
                {visibleErrors.existingMonthlyLiabilities && (
                  <span className="mt-1 text-xs font-semibold text-red-600">
                    {visibleErrors.existingMonthlyLiabilities}
                  </span>
                )}
              </label>
              <label className="label-field">
                <span>Employment Type<RequiredMark /></span>
                {isEducationLoan ? (
                  <div className="input-field bg-slate-100 font-semibold text-slate-600">Student</div>
                ) : (
                  <select
                    value={form.employmentType}
                    onChange={(event) => updateForm("employmentType", event.target.value)}
                    className="input-field"
                  >
                    <option value="salaried">Salaried</option>
                    <option value="self-employed">Self-employed</option>
                    <option value="student">Student</option>
                    <option value="business">Business</option>
                  </select>
                )}
                {visibleErrors.employmentType && (
                  <span className="mt-1 text-xs font-semibold text-red-600">
                    {visibleErrors.employmentType}
                  </span>
                )}
              </label>
              <label className="label-field">
                <span>
                  Employment Duration
                  {["salaried", "self-employed", "business"].includes(form.employmentType) && <RequiredMark />}
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.employmentDurationMonths}
                  onChange={(event) => updateForm("employmentDurationMonths", event.target.value)}
                  className="input-field"
                  placeholder="Months"
                />
                {visibleErrors.employmentDurationMonths && (
                  <span className="mt-1 text-xs font-semibold text-red-600">
                    {visibleErrors.employmentDurationMonths}
                  </span>
                )}
              </label>
              <label className="label-field md:col-span-2 xl:col-span-3">
                <span>Receive Loan Amount In<RequiredMark /></span>
                {hasMultipleCustomerAccounts ? (
                  <select
                    value={form.disbursementAccountNumber}
                    onChange={(event) => updateForm("disbursementAccountNumber", event.target.value)}
                    className="input-field"
                  >
                    <option value="">Select credit account</option>
                    {customerAccounts.map((account) => (
                      <option key={account.accountNumber} value={account.accountNumber}>
                        {account.accountType || "Account"} - {account.accountNumber} - {formatCurrency(account.balance || 0)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="input-field bg-slate-100 font-semibold text-slate-600">
                    {customerAccounts[0]
                      ? `${customerAccounts[0].accountType || "Account"} - ${customerAccounts[0].accountNumber} - ${formatCurrency(customerAccounts[0].balance || 0)}`
                      : "No active account"}
                  </div>
                )}
                {visibleErrors.disbursementAccountNumber && (
                  <span className="mt-1 text-xs font-semibold text-red-600">
                    {visibleErrors.disbursementAccountNumber}
                  </span>
                )}
              </label>
              {selectedSupportingFields.length > 0 && (
                <div className="rounded-xl border border-bank-card-border bg-white p-4 md:col-span-2 xl:col-span-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">Supporting Details</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                        Provide details relevant to this loan type for faster manager review.
                      </p>
                    </div>
                    <span className="rounded-full bg-bank-surface px-3 py-1 text-xs font-bold text-slate-600">
                      {selectedRule?.label || "Loan"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {selectedSupportingFields.map((field) => (
                      <label key={field.key} className="label-field">
                        <span>
                          {field.label}
                          {form.loanType === "education" &&
                            educationRequiredDetailFields.includes(field.key) && <RequiredMark />}
                        </span>
                        {field.type === "select" ? (
                          <select
                            value={supportingDetails[form.loanType]?.[field.key] || ""}
                            onChange={(event) => updateSupportingDetail(field.key, event.target.value)}
                            className="input-field"
                          >
                            <option value="">Select status</option>
                            {field.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={supportingDetails[form.loanType]?.[field.key] || ""}
                            onChange={(event) => updateSupportingDetail(field.key, event.target.value)}
                            className="input-field"
                            placeholder={field.placeholder}
                          />
                        )}
                        {visibleErrors[`supportingDetails.${field.key}`] && (
                          <span className="mt-1 text-xs font-semibold text-red-600">
                            {visibleErrors[`supportingDetails.${field.key}`]}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4 md:col-span-2 xl:col-span-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">Supporting Documents</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                      Attach only the documents relevant to the selected loan type.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                    {documents.length} uploaded
                  </span>
                </div>
                {visibleErrors.documents && (
                  <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {visibleErrors.documents}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {(documentOptionsByLoanType[form.loanType] || []).map((documentType) => {
                    const document = documents.find((item) => item.documentType === documentType);
                    const isMandatoryDocument =
                      documentType === "Bank Statement" ||
                      (form.employmentType === "student" &&
                        documentType === "Co-applicant Income Proof");

                    return (
                      <div key={documentType} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-slate-950">
                                {documentType}
                                {isMandatoryDocument && <RequiredMark />}
                              </p>
                              {isMandatoryDocument && (
                                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                              {document?.fileName || "No file selected"}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">
                              PDF, PNG, JPG/JPEG up to 2 MB
                            </p>
                          </div>
                          <FileText size={18} className="shrink-0 text-slate-500" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label className="btn-secondary cursor-pointer px-3 py-2 text-xs">
                            <Upload size={14} />
                            Upload
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              className="sr-only"
                              onChange={(event) => addDocument(documentType, event.target.files?.[0])}
                            />
                          </label>
                          {document && (
                            <button
                              type="button"
                              onClick={() => removeDocument(documentType)}
                              className="btn-danger-soft px-3 py-2 text-xs"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <label className="label-field md:col-span-2 xl:col-span-3">
                <span>Purpose<RequiredMark /></span>
                <textarea
                  rows={3}
                  value={form.purpose}
                  onChange={(event) => updateForm("purpose", event.target.value)}
                  className="input-field"
                  placeholder="Brief purpose for manager review"
                />
                {visibleErrors.purpose && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.purpose}</span>}
              </label>
              <div className="overflow-hidden rounded-xl border border-bank-card-border bg-white md:col-span-2 xl:col-span-3">
                <div className="border-b border-bank-card-border bg-bank-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        EMI Preview
                      </p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatCurrency(emiPreview)}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                      {effectiveInterestRate}% p.a.
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
                  {visibleErrors.emiPreview && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800 sm:col-span-3">
                      {visibleErrors.emiPreview}
                    </div>
                  )}
                  {visibleErrors.totalObligations && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800 sm:col-span-3">
                      {visibleErrors.totalObligations}
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Total Interest</p>
                    <p className="mt-1 font-bold text-slate-950">{formatCurrency(totalInterest)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase text-slate-500">Total Repayment</p>
                    <p className="mt-1 font-bold text-slate-950">{formatCurrency(totalRepayment)}</p>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary md:col-span-2 xl:col-span-3">
                <Send size={17} />
                {isSubmitting ? "Submitting..." : "Submit To Manager"}
              </button>
            </form>
          </SectionCard>
          )}

          {activeLoanPageTab === "loans" && (
          <SectionCard
            title="Application Tracking"
            subtitle="Select an application to view loan-specific details and next actions."
            icon={ClipboardList}
          >
            {loans.length === 0 ? (
              <EmptyState message="No loan applications have been submitted yet." />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {loans.map((loan) => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => {
                      setSelectedLoanId(loan.id);
                      setSelectedLoanTab("overview");
                    }}
                    className={`relative overflow-hidden rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      selectedLoan?.id === loan.id
                        ? "border-blue-200 bg-blue-50/60"
                        : "border-bank-card-border bg-white"
                    }`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1.5 ${
                      loan.status === "rejected"
                        ? "bg-red-500"
                        : loan.status === "approved" || loan.status === "disbursed" || loan.status === "closed"
                          ? "bg-emerald-500"
                          : "bg-blue-500"
                    }`} />

                    <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-[1.4fr_1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="break-words text-lg font-black text-slate-950">
                          {loan.loanTypeLabel}
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                          {loan.id}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                          Requested Amount
                        </p>
                        <p className="mt-1 break-words text-base font-black text-slate-950">
                          {formatCurrency(loan.amount)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[loan.status] || statusStyles.submitted}`}>
                          {statusLabel(loan.status)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-bank-accent ring-1 ring-bank-card-border">
                          {selectedLoan?.id === loan.id ? "Details shown" : "View details"}
                        </span>
                      </div>
                    </div>

                    {selectedLoan?.id === loan.id && (loan.additionalInfoRequested || loan.rejectionReason) && (
                      <div className="mt-4">
                        {loan.additionalInfoRequested && (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                            {loan.managerNote || "Manager requested more information."}
                          </p>
                        )}
                        {loan.rejectionReason && (
                          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                            {loan.rejectionReason}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
          )}
        </section>

        {activeLoanPageTab === "loans" && selectedLoan && (
          <section className="grid grid-cols-1 gap-6">
            <SectionCard title="Selected Loan Details" icon={Gauge}>
              <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black text-slate-950">
                        {selectedLoan.loanTypeLabel}
                      </p>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[selectedLoan.status] || statusStyles.submitted}`}>
                        {statusLabel(selectedLoan.status)}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                      {selectedLoan.id} / {formatCurrency(selectedLoan.amount)}
                    </p>
                    <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold leading-6 text-blue-800">
                      {selectedLoanNextStep}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:min-w-[360px]">
                    <div className="rounded-lg bg-bank-surface px-3 py-2">
                      <p className="text-xs font-bold uppercase text-slate-500">EMI</p>
                      <p className="mt-1 font-black text-slate-950">
                        {formatCurrency(selectedLoan.emiAmount || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-bank-surface px-3 py-2">
                      <p className="text-xs font-bold uppercase text-slate-500">Rate</p>
                      <p className="mt-1 font-black text-slate-950">
                        {selectedLoan.annualInterestRate}% p.a.
                      </p>
                    </div>
                    <div className="rounded-lg bg-bank-surface px-3 py-2">
                      <p className="text-xs font-bold uppercase text-slate-500">Tenure</p>
                      <p className="mt-1 font-black text-slate-950">
                        {selectedLoan.tenureMonths || selectedLoan.remainingTenureMonths || 0} mo
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-5">
                  {loanStageSteps.map((step, index) => {
                    const isComplete = selectedLoanStageIndex >= index;
                    const isCurrent = selectedLoan?.status === step.key;

                    return (
                      <div
                        key={step.key}
                        className={`rounded-lg border px-3 py-2 ${
                          isCurrent
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : isComplete
                              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                              : "border-bank-card-border bg-white text-slate-500"
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-[0.12em]">
                          {step.label}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 overflow-x-auto border-t border-bank-card-border pt-4">
                  <div className="flex min-w-max gap-2">
                    {selectedLoanTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setSelectedLoanTab(tab.key)}
                        className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                          selectedLoanTab === tab.key
                            ? "bg-bank-accent text-white shadow-sm"
                            : "bg-bank-surface text-slate-600 hover:bg-white hover:text-bank-accent"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {selectedLoanTab === "overview" && (
                <>
              <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      {selectedLoan.loanTypeLabel}
                    </p>
                    <h3 className="mt-1 text-2xl font-bold text-slate-950">
                      Requested amount {formatCurrency(selectedLoan.amount)}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Final eligibility is confirmed after document verification and manager approval.
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[selectedLoan.status] || statusStyles.submitted}`}>
                    {statusLabel(selectedLoan.status)}
                  </span>
                </div>
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-800">
                  Based on your current profile, this application is{" "}
                  {String(selectedLoan.eligibilityRecommendation || "under review").toLowerCase()}.
                  The estimated interest rate is {selectedLoan.annualInterestRate}% per year.
                </div>
              </div>

              <div className="metric-grid mt-4">
                <MetricTile
                  label="Estimated Rate"
                  value={`${selectedLoan.annualInterestRate}% p.a.`}
                  tone="success"
                />
                <MetricTile label="Monthly EMI" value={formatCurrency(selectedLoan.emiAmount)} tone="accent" />
                <MetricTile
                  label="Requested Amount"
                  value={formatCurrency(selectedLoan.amount)}
                />
                <MetricTile
                  label="Total Interest"
                  value={formatCurrency(selectedLoan.totalInterest)}
                  tone="warning"
                />
                <MetricTile
                  label="Total Repayment"
                  value={formatCurrency(selectedLoan.totalRepayment)}
                />
                <MetricTile
                  label="Profile Status"
                  value={selectedLoan.eligibilityRecommendation || "Under review"}
                  tone={selectedLoan.eligibilityScore >= 65 ? "success" : "warning"}
                />
              </div>
              {Object.entries(selectedLoan.supportingDetails || {}).filter(([, value]) => value).length > 0 && (
                <div className="mt-4 rounded-xl border border-bank-card-border bg-white p-4">
                  <p className="font-bold text-slate-950">Supporting Details</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(selectedLoan.supportingDetails || {})
                      .filter(([, value]) => value)
                      .map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-bank-surface px-3 py-2">
                          <p className="text-xs font-bold uppercase text-slate-500">
                            {detailLabel(key)}
                          </p>
                          <p className="mt-1 break-words text-sm font-bold text-slate-800">
                            {value}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(selectedLoan.eligibilityDetails?.componentScores || {}).map(([key, value]) => {
                  const status = getCustomerFactorStatus(
                    value,
                    selectedLoan.eligibilityDetails?.scoreWeights?.[key]
                  );

                  return (
                  <div key={key} className={`rounded-lg border p-3 ${status.tone}`}>
                    <p className="text-xs font-bold uppercase text-slate-500">
                      {customerFactorLabels[key] || detailLabel(key)}
                    </p>
                    <p className="mt-1 text-lg font-bold">{status.label}</p>
                  </div>
                  );
                })}
              </div>
                </>
              )}
            </SectionCard>

            {selectedLoanTab === "documents" && selectedLoanDocuments.length > 0 && (
              <SectionCard
                title="Loan Documents"
                subtitle="Sanction, agreement, and repayment schedule PDFs appear here when generated."
                icon={FileText}
              >
                <div className="grid grid-cols-1 gap-3">
                  {selectedLoanDocuments.map((document) => (
                    <div
                      key={document.key}
                      className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-black text-slate-950">
                              {document.title}
                            </p>
                            <span className="rounded-full bg-bank-surface px-3 py-1 text-xs font-bold text-slate-600">
                              {statusLabel(document.status)}
                            </span>
                          </div>
                          <p className="mt-1 break-words text-sm font-bold text-slate-700">
                            {document.fileName}
                          </p>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                            Generated on{" "}
                            {document.generatedAt
                              ? new Date(document.generatedAt).toLocaleDateString()
                              : document.fallbackDate}
                            .
                          </p>
                        </div>
                        <a
                          href={getUploadUrl(document.fileUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary justify-center px-4 py-2 text-sm"
                        >
                          <FileText size={16} />
                          View PDF
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {selectedLoanTab === "repayment" &&
              ["approved", "disbursed", "closed"].includes(selectedLoan.status) && (
              <SectionCard
                title="Repayment Management"
                subtitle="Track live loan balance, penalties, part-payments, and foreclosure amount."
                icon={ReceiptText}
              >
              <div className="metric-grid">
                <MetricTile
                  label="Outstanding Principal"
                  value={formatCurrency(selectedLoan.outstandingPrincipal ?? selectedLoan.amount)}
                  tone="accent"
                />
                <MetricTile
                  label="Current EMI"
                  value={formatCurrency(selectedLoan.emiAmount || 0)}
                  tone="success"
                />
                <MetricTile
                  label="EMIs Remaining"
                  value={String(selectedLoan.remainingTenureMonths || 0)}
                />
                <MetricTile
                  label="Accrued Interest"
                  value={formatCurrency(selectedLoanForeclosureQuote.accruedInterest || 0)}
                  tone="warning"
                />
                <MetricTile
                  label="Unpaid Penalties"
                  value={formatCurrency(selectedLoanForeclosureQuote.unpaidPenalties || 0)}
                  tone={selectedLoanForeclosureQuote.unpaidPenalties > 0 ? "danger" : "success"}
                />
                <MetricTile
                  label="Foreclosure Fee"
                  value={formatCurrency(selectedLoanForeclosureQuote.foreclosureFee || 0)}
                />
              </div>

              {(canManageRepayment || isApprovedAwaitingDisbursal) && (
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
                  {canManageRepayment && (
                    <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm xl:col-span-2">
                      <label className="label-field">
                        <span>Payment Source Account</span>
                        <select
                          value={effectivePaymentAccountNumber}
                          onChange={(event) => setSelectedPaymentAccountNumber(event.target.value)}
                          className="input-field"
                        >
                          {customerAccounts.map((account) => (
                            <option key={account.accountNumber} value={account.accountNumber}>
                              {account.accountType || "Account"} - {account.accountNumber} - {formatCurrency(account.walletBalance ?? account.balance ?? 0)}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 text-xs font-semibold text-slate-500">
                          EMI, part-payment, and foreclosure will debit this account.
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Part-Payment
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {canManageRepayment
                        ? "Choose whether the recalculation lowers future EMIs or keeps the EMI and finishes the loan sooner."
                        : "Part-payment starts after the manager disburses the approved loan."}
                    </p>
                    <div className="mt-4 grid grid-cols-2 rounded-lg border border-bank-card-border bg-bank-surface p-1">
                      <button
                        type="button"
                        onClick={() => setPartPaymentImpact("reduce_emi")}
                        disabled={!canManageRepayment}
                        className={`min-h-10 rounded-md px-3 text-sm font-bold transition ${
                          partPaymentImpact === "reduce_emi"
                            ? "bg-white text-bank-accent shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Lower EMI
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartPaymentImpact("reduce_tenure")}
                        disabled={!canManageRepayment}
                        className={`min-h-10 rounded-md px-3 text-sm font-bold transition ${
                          partPaymentImpact === "reduce_tenure"
                            ? "bg-white text-bank-accent shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Shorter Tenure
                      </button>
                    </div>
                    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold leading-6 text-blue-800">
                      <p>Minimum: {formatCurrency(minimumPartPayment)}</p>
                      <p>Part-payment limit: up to {formatCurrency(Math.max(0, maxPartPaymentBeforeForeclosure))}</p>
                      <p>Charge: {Number(partPaymentPolicy.chargePercentage || 0)}%</p>
                      {isPartPaymentLocked && (
                        <p>Available after {partPaymentLockEndsAt.toLocaleDateString()}.</p>
                      )}
                      {partPaymentPreviewAmount > 0 && (
                        <p className="mt-1 font-bold text-blue-950">
                          Principal {formatCurrency(partPaymentPreviewAmount)} + charge {formatCurrency(partPaymentCharge)} = debit {formatCurrency(partPaymentTotalDebit)}
                        </p>
                      )}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        type="number"
                        min={minimumPartPayment || 1}
                        value={partPaymentAmount}
                        onChange={(event) => setPartPaymentAmount(event.target.value)}
                        className="input-field"
                        placeholder="Amount"
                        disabled={!canManageRepayment || partPaymentPolicy.enabled === false || isPartPaymentLocked}
                      />
                      <button
                        type="button"
                        onClick={postPartPayment}
                        disabled={
                          !canManageRepayment ||
                          partPaymentPolicy.enabled === false ||
                          isPartPaymentLocked ||
                          isPostingPartPayment
                        }
                        className="btn-primary justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <BadgeIndianRupee size={16} />
                        {isPostingPartPayment ? "Posting..." : "Part-Pay"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
                      Foreclosure Quote
                    </p>
                    <p className="mt-2 text-2xl font-black text-emerald-950">
                      {formatCurrency(selectedLoanForeclosureQuote.totalPayable || 0)}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-emerald-800">
                      {canManageRepayment
                        ? "Principal + accrued interest + unpaid penalties + foreclosure fee."
                        : "Foreclosure becomes payable after loan disbursal."}
                    </p>
                    <button
                      type="button"
                      onClick={forecloseSelectedLoan}
                      disabled={!canManageRepayment || isForeclosing}
                      className="btn-primary mt-4 justify-center bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <CheckCircle2 size={16} />
                      {isForeclosing ? "Closing..." : "Foreclose Loan"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 overflow-x-auto rounded-xl border border-bank-card-border bg-white">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Principal</th>
                      <th className="px-4 py-3">Interest</th>
                      <th className="px-4 py-3">Fees / Penalty</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedLoan.repaymentHistory || []).length === 0 ? (
                      <tr className="table-row">
                        <td className="px-4 py-4 text-sm font-semibold text-slate-500" colSpan={8}>
                          No repayment activity recorded yet.
                        </td>
                      </tr>
                    ) : (
                      (selectedLoan.repaymentHistory || []).map((entry, index) => (
                        <tr key={`${entry.transactionId || entry.paymentType}-${index}`} className="table-row">
                          <td className="px-4 py-3">
                            {entry.paidAt ? new Date(entry.paidAt).toLocaleDateString() : "Not set"}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {statusLabel(entry.paymentType)}
                            {entry.paymentType === "part_payment" && entry.repaymentImpact && (
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                {entry.repaymentImpact === "reduce_tenure"
                                  ? `${entry.previousRemainingTenure} to ${entry.revisedRemainingTenure} EMIs`
                                  : `${formatCurrency(entry.previousEmiAmount)} to ${formatCurrency(entry.revisedEmiAmount)}`}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">{formatCurrency(entry.amount)}</td>
                          <td className="px-4 py-3">{formatCurrency(entry.principalPaid)}</td>
                          <td className="px-4 py-3">{formatCurrency(entry.interestPaid)}</td>
                          <td className="px-4 py-3">
                            {formatCurrency(Number(entry.penaltyPaid || 0) + Number(entry.partPaymentCharge || 0))}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              entry.status === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}>
                              {statusLabel(entry.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {entry.receiptFileUrl ? (
                              <a
                                href={getUploadUrl(entry.receiptFileUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary justify-center px-3 py-2 text-xs"
                              >
                                <FileText size={14} />
                                View
                              </a>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </SectionCard>
            )}

            {selectedLoanTab === "schedule" &&
              ["approved", "disbursed", "closed"].includes(selectedLoan.status) &&
              (selectedLoan.amortizationSchedule || []).length > 0 && (
                <SectionCard
                  title="Amortization Schedule"
                  subtitle="Repayment schedule for the approved loan."
                  icon={CalendarClock}
                >
              {selectedLoan.status === "disbursed" && selectedLoanNextScheduledEmi && (
                <div className={`mb-4 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  selectedLoanNextPayableEmi
                    ? "border-emerald-100 bg-emerald-50"
                    : "border-blue-100 bg-blue-50"
                }`}>
                  <div>
                    <p className={`text-sm font-bold ${
                      selectedLoanNextPayableEmi ? "text-emerald-900" : "text-blue-900"
                    }`}>
                      Next EMI: {formatCurrency(selectedLoanNextScheduledEmi.emiAmount)}
                    </p>
                    <p className={`mt-1 text-xs font-semibold ${
                      selectedLoanNextPayableEmi ? "text-emerald-700" : "text-blue-700"
                    }`}>
                      EMI {selectedLoanNextScheduledEmi.emiNumber} is due on {formatDate(selectedLoanNextScheduledEmi.dueDate)}.
                      {selectedLoanNextPayableEmi
                        ? " Choose the repayment account before paying."
                        : " It will become payable on the due date. Use part-payment for extra principal payment."}
                    </p>
                    {selectedLoanNextPayableEmi && customerAccounts.length > 0 && (
                      <label className="mt-3 block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                          Payment Source
                        </span>
                        <select
                          value={effectivePaymentAccountNumber}
                          onChange={(event) => setSelectedPaymentAccountNumber(event.target.value)}
                          className="input-field mt-1"
                        >
                          {customerAccounts.map((account) => (
                            <option key={account.accountNumber} value={account.accountNumber}>
                              {account.accountType || "Account"} - {account.accountNumber} - {formatCurrency(account.walletBalance ?? account.balance ?? 0)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  {selectedLoanNextPayableEmi ? (
                    <button
                      type="button"
                      onClick={payNextEmi}
                      disabled={payingEmiNumber === selectedLoanNextPayableEmi.emiNumber}
                      className="btn-primary justify-center bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <CheckCircle2 size={16} />
                      {payingEmiNumber === selectedLoanNextPayableEmi.emiNumber
                        ? "Paying..."
                        : "Pay Next EMI"}
                    </button>
                  ) : (
                    <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700">
                      Upcoming
                    </span>
                  )}
                </div>
              )}
              {selectedLoan.status === "closed" && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  This loan is closed. All scheduled EMIs are paid.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-3">EMI</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3">Principal</th>
                      <th className="px-4 py-3">Interest</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amortizationPagination.pageRows.map((row) => (
                      <tr key={row.emiNumber} className="table-row">
                        <td className="px-4 py-3 font-bold">{row.emiNumber}</td>
                        <td className="px-4 py-3">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "Not set"}</td>
                        <td className="px-4 py-3">{formatCurrency(row.principalComponent)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.interestComponent)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.outstandingBalance)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            <CheckCircle2 size={13} />
                            {statusLabel(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePagination
                  page={amortizationPagination.page}
                  pageSize={amortizationPagination.pageSize}
                  setPage={amortizationPagination.setPage}
                  totalItems={amortizationPagination.totalItems}
                  totalPages={amortizationPagination.totalPages}
                />
              </div>
                </SectionCard>
              )}
          </section>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default Loans;
