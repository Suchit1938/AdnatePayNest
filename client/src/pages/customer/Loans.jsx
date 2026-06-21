import { useCallback, useEffect, useMemo, useState } from "react";
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
const getUploadUrl = (fileUrl = "") =>
  fileUrl ? `${api.defaults.baseURL.replace(/\/api$/, "")}${fileUrl}` : "";

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
  const [supportingDetails, setSupportingDetails] = useState(initialSupportingDetails);
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [touchedFields, setTouchedFields] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payingEmiNumber, setPayingEmiNumber] = useState(null);
  const [partPaymentAmount, setPartPaymentAmount] = useState("");
  const [isPostingPartPayment, setIsPostingPartPayment] = useState(false);
  const [isForeclosing, setIsForeclosing] = useState(false);
  const [acceptingSanctionId, setAcceptingSanctionId] = useState("");
  const [acceptingAgreementId, setAcceptingAgreementId] = useState("");

  const customerAccounts = useMemo(
    () => (user?.accounts?.length ? user.accounts : [user?.account].filter(Boolean)),
    [user]
  );
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
            current.disbursementAccountNumber || customerAccounts[0]?.accountNumber || "",
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
  const classificationKey = String(user?.classification || "").toLowerCase();
  const classificationBenefit = loanRules.classificationBenefits?.[classificationKey] || {
    interestDiscount: 0,
    maxAmountMultiplier: 1,
  };
  const calculatorRule =
    loanRules.loanTypes?.find((rule) => rule.key === calculator.loanType) ||
    loanRules.loanTypes?.[0];
  const calculatorInterestRate = Math.max(
    0,
    Number(calculatorRule?.annualInterestRate || 0) -
      Number(classificationBenefit.interestDiscount || 0)
  );
  const calculatorMaxAmount = Math.round(
    Number(calculatorRule?.maxAmount || 0) *
      Number(classificationBenefit.maxAmountMultiplier || 1)
  );
  const calculatorAmount = Number(calculator.amount || 0);
  const calculatorTenureMonths = Math.max(1, Number(calculator.tenureMonths || 1));
  const calculatorMonthlyRate = calculatorInterestRate / 12 / 100;
  const calculatorEmi = useMemo(() => {
    if (calculatorAmount <= 0) return 0;
    if (calculatorMonthlyRate <= 0) {
      return Math.round(calculatorAmount / calculatorTenureMonths);
    }

    const factor = (1 + calculatorMonthlyRate) ** calculatorTenureMonths;
    return Math.round((calculatorAmount * calculatorMonthlyRate * factor) / (factor - 1));
  }, [calculatorAmount, calculatorMonthlyRate, calculatorTenureMonths]);
  const calculatorTotalRepayment = calculatorEmi * calculatorTenureMonths;
  const calculatorTotalInterest = Math.max(0, calculatorTotalRepayment - calculatorAmount);
  const effectiveInterestRate = Math.max(
    0,
    Number(selectedRule?.annualInterestRate || 0) - Number(classificationBenefit.interestDiscount || 0)
  );
  const effectiveMaxAmount = Math.round(
    Number(selectedRule?.maxAmount || 0) * Number(classificationBenefit.maxAmountMultiplier || 1)
  );
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
  const selectedLoan = loans.find((loan) => loan.id === selectedLoanId) || activeLoans[0] || loans[0];
  const selectedSupportingFields = supportingDetailFieldsByLoanType[form.loanType] || [];
  const nextEmi =
    selectedLoan?.amortizationSchedule?.find((row) =>
      ["pending", "missed", "overdue"].includes(row.status)
    ) ||
    selectedLoan?.amortizationSchedule?.[0];
  const selectedLoanNextPendingEmi = selectedLoan?.amortizationSchedule?.find(
    (row) => !["paid", "foreclosed"].includes(row.status)
  );
  const selectedLoanForeclosureQuote = selectedLoan?.foreclosureQuote || {};
  const canManageRepayment = selectedLoan?.status === "disbursed";
  const isApprovedAwaitingDisbursal = selectedLoan?.status === "approved";

  const validateLoanForm = () => {
    const errors = {};
    const numericAmount = Number(form.amount || 0);
    const numericTenure = Number(form.tenureMonths || 0);
    const numericMonthlyIncome = Number(form.monthlyIncome || 0);
    const numericLiabilities = Number(form.existingMonthlyLiabilities || 0);
    const numericEmploymentDuration = Number(form.employmentDurationMonths || 0);
    const purpose = form.purpose.trim();
    const selectedAccount =
      form.disbursementAccountNumber || customerAccounts[0]?.accountNumber || "";
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
      errors.monthlyIncome = "Monthly income must be greater than zero.";
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
      errors.emiPreview = "EMI is above 50% of monthly income. Reduce amount or increase tenure.";
    }

    if (
      numericMonthlyIncome > 0 &&
      numericLiabilities >= 0 &&
      numericLiabilities + emiPreview > numericMonthlyIncome * 0.6
    ) {
      errors.totalObligations = "Existing liabilities plus EMI should stay within 60% of monthly income.";
    }

    if (!selectedAccount) {
      errors.disbursementAccountNumber = "Select the account where the loan amount should be credited.";
    }

    if (purpose.length < 20) {
      errors.purpose = "Purpose must be at least 20 characters.";
    }

    if (form.loanType === "education") {
      const admissionStatus = supportingDetails.education?.admissionStatus || "";

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
    setForm((current) => ({ ...current, [field]: value }));
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
    const loanTypeChanged = form.loanType !== calculator.loanType;

    setForm((current) => ({
      ...current,
      loanType: calculator.loanType,
      amount: calculator.amount,
      tenureMonths: calculator.tenureMonths,
    }));
    setTouchedFields((current) => ({
      ...current,
      loanType: true,
      amount: true,
      tenureMonths: true,
      emiPreview: true,
      totalObligations: true,
    }));

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
      setSupportingDetails(initialSupportingDetails);
      setDocuments([]);
      setTouchedFields({});
      setSubmitAttempted(false);
      await loadLoans();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Unable to reach the API server. Check that the backend is running on port 5000."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const payNextEmi = async () => {
    if (!selectedLoan || !selectedLoanNextPendingEmi) return;

    setPayingEmiNumber(selectedLoanNextPendingEmi.emiNumber);

    try {
      const { data } = await api.patch(
        `/loans/${selectedLoan.id}/emis/${selectedLoanNextPendingEmi.emiNumber}/pay`,
        {
          paymentAccountNumber:
            selectedLoan.disbursementAccountNumber || customerAccounts[0]?.accountNumber,
        }
      );

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      toast.success(data.message || "EMI paid successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to pay EMI.");
    } finally {
      setPayingEmiNumber(null);
    }
  };

  const postPartPayment = async () => {
    if (!selectedLoan) return;
    const amount = Number(partPaymentAmount || 0);

    if (amount <= 0) {
      toast.warning("Enter a valid part-payment amount.");
      return;
    }

    setIsPostingPartPayment(true);

    try {
      const { data } = await api.post(`/loans/${selectedLoan.id}/part-payments`, {
        amount,
        paymentAccountNumber:
          selectedLoan.disbursementAccountNumber || customerAccounts[0]?.accountNumber,
      });

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      setPartPaymentAmount("");
      toast.success(data.message || "Part-payment posted successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to post part-payment.");
    } finally {
      setIsPostingPartPayment(false);
    }
  };

  const forecloseSelectedLoan = async () => {
    if (!selectedLoan) return;

    setIsForeclosing(true);

    try {
      const { data } = await api.post(`/loans/${selectedLoan.id}/foreclose`, {
        paymentAccountNumber:
          selectedLoan.disbursementAccountNumber || customerAccounts[0]?.accountNumber,
      });

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      toast.success(data.message || "Loan foreclosed successfully.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to foreclose loan.");
    } finally {
      setIsForeclosing(false);
    }
  };

  const acceptSanctionLetter = async () => {
    if (!selectedLoan) return;

    setAcceptingSanctionId(selectedLoan.id);

    try {
      const { data } = await api.patch(`/loans/${selectedLoan.id}/sanction/accept`);

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      toast.success(data.message || "Sanction letter accepted.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to accept sanction letter.");
    } finally {
      setAcceptingSanctionId("");
    }
  };

  const acceptLoanAgreement = async () => {
    if (!selectedLoan) return;

    setAcceptingAgreementId(selectedLoan.id);

    try {
      const { data } = await api.patch(`/loans/${selectedLoan.id}/agreement/accept`);

      setLoans((current) =>
        current.map((loan) => (loan.id === data.loan.id ? data.loan : loan))
      );
      setSelectedLoanId(data.loan.id);
      toast.success(data.message || "Loan agreement accepted.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to accept loan agreement.");
    } finally {
      setAcceptingAgreementId("");
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

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
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

        <section className="grid grid-cols-1 gap-6">
          <SectionCard
            title="EMI Calculator"
            subtitle="Estimate repayment before starting a loan application."
            icon={Calculator}
          >
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
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
                    className="btn-primary justify-center sm:col-span-2 xl:col-span-1"
                  >
                    <Send size={17} />
                    Apply With These Details
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

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
                  className="input-field"
                  required
                />
                {visibleErrors.amount && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.amount}</span>}
              </label>
              <label className="label-field">
                <span>Tenure<RequiredMark /></span>
                <select
                  value={form.tenureMonths}
                  onChange={(event) => updateForm("tenureMonths", event.target.value)}
                  className="input-field"
                >
                  {[12, 24, 36, 48, 60, 84, 120, 180, 240]
                    .filter(
                      (months) =>
                        months >= Number(selectedRule?.minTenureMonths || 1) &&
                        months <= Number(selectedRule?.maxTenureMonths || 240)
                    )
                    .map((months) => (
                      <option key={months} value={months}>
                        {months} months
                      </option>
                    ))}
                </select>
                {visibleErrors.tenureMonths && <span className="mt-1 text-xs font-semibold text-red-600">{visibleErrors.tenureMonths}</span>}
              </label>
              <label className="label-field">
                <span>Monthly Income<RequiredMark /></span>
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
                Existing Monthly Liabilities
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
                <select
                  value={form.disbursementAccountNumber || customerAccounts[0]?.accountNumber || ""}
                  onChange={(event) => updateForm("disbursementAccountNumber", event.target.value)}
                  className="input-field"
                >
                  {customerAccounts.map((account) => (
                    <option key={account.accountNumber} value={account.accountNumber}>
                      {account.accountType || "Account"} - {account.accountNumber} - {formatCurrency(account.balance || 0)}
                    </option>
                  ))}
                </select>
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
                        {field.label}
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
                  <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <p className="text-xs font-bold uppercase text-emerald-700">
                      {user?.classification || "Customer"} Benefit
                    </p>
                    <p className="mt-1 text-sm font-bold leading-5 text-emerald-800">
                      {Number(classificationBenefit.interestDiscount || 0)}% discount / max {formatCurrency(effectiveMaxAmount)}
                    </p>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary md:col-span-2 xl:col-span-3">
                <Send size={17} />
                {isSubmitting ? "Submitting..." : "Submit To Manager"}
              </button>
            </form>
          </SectionCard>

          <SectionCard
            title="Application Tracking"
            subtitle="Manager decisions and request-for-information notes appear here."
            icon={ClipboardList}
          >
            {loans.length === 0 ? (
              <EmptyState message="No loan applications have been submitted yet." />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {loans.map((loan) => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => setSelectedLoanId(loan.id)}
                    className={`relative overflow-hidden rounded-xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
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

                    <div className="grid grid-cols-1 gap-5 pt-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-start">
                      <div className="min-w-0">
                        <p className="break-words text-lg font-black text-slate-950">
                          {loan.loanTypeLabel}
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-500">
                          {loan.id} / {formatCurrency(loan.amount)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-bank-card-border">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            Monthly EMI
                          </p>
                          <p className="mt-1 font-black text-slate-950">
                            {formatCurrency(loan.emiAmount)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-bank-card-border">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            Rate
                          </p>
                          <p className="mt-1 font-black text-slate-950">
                            {loan.annualInterestRate}% p.a.
                          </p>
                        </div>
                      </div>

                      <div className="min-w-0 rounded-lg bg-white px-3 py-2 ring-1 ring-bank-card-border">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          Credit Account
                        </p>
                        <p className="mt-1 break-words text-sm font-bold text-slate-800">
                          {loan.disbursementAccountType || "Account"} {loan.disbursementAccountNumber || "not selected"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {loan.documents?.length || 0} document(s)
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[loan.status] || statusStyles.submitted}`}>
                          {statusLabel(loan.status)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-bank-card-border">
                          {loan.eligibilityRecommendation || "Under review"}
                        </span>
                      </div>
                    </div>

                    {(loan.additionalInfoRequested || loan.rejectionReason) && (
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
        </section>

        {selectedLoan && (
          <section className="grid grid-cols-1 gap-6">
            <SectionCard title="Eligibility Snapshot" icon={Gauge}>
              <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      {selectedLoan.loanTypeLabel}
                    </p>
                    <h3 className="mt-1 text-2xl font-bold text-slate-950">
                      You may be eligible for up to{" "}
                      {formatCurrency(
                        selectedLoan.eligibilityDetails?.classificationBenefit?.maxAmount ||
                          selectedLoan.amount
                      )}
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
              {selectedLoan.eligibilityDetails?.classificationBenefit && (
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-800">
                  {Number(selectedLoan.eligibilityDetails.classificationBenefit.interestDiscount || 0) > 0
                    ? `A ${selectedLoan.eligibilityDetails.classificationBenefit.interestDiscount}% customer benefit has been applied to your estimated rate.`
                    : "No interest discount is currently available for this profile."}{" "}
                  Maximum eligible amount:{" "}
                  {formatCurrency(selectedLoan.eligibilityDetails.classificationBenefit.maxAmount)}.
                </div>
              )}
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
            </SectionCard>

            {selectedLoan.sanctionLetter?.fileUrl && (
              <SectionCard
                title="Sanction Letter"
                subtitle="Review and accept the sanctioned terms before disbursal."
                icon={FileText}
              >
                <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        {statusLabel(selectedLoan.sanctionLetter.status || "generated")}
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {selectedLoan.sanctionLetter.fileName || "Loan sanction letter"}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        Generated on{" "}
                        {selectedLoan.sanctionLetter.generatedAt
                          ? new Date(selectedLoan.sanctionLetter.generatedAt).toLocaleDateString()
                          : "approval"}.
                        {selectedLoan.sanctionLetter.acceptedAt
                          ? ` Accepted on ${new Date(selectedLoan.sanctionLetter.acceptedAt).toLocaleDateString()}.`
                          : " Acceptance is required before the manager can disburse the loan."}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <a
                        href={getUploadUrl(selectedLoan.sanctionLetter.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary justify-center px-4 py-2 text-sm"
                      >
                        <FileText size={16} />
                        View PDF
                      </a>
                      <button
                        type="button"
                        onClick={acceptSanctionLetter}
                        disabled={
                          selectedLoan.sanctionLetter.status === "accepted" ||
                          acceptingSanctionId === selectedLoan.id
                        }
                        className="btn-primary justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <CheckCircle2 size={16} />
                        {selectedLoan.sanctionLetter.status === "accepted"
                          ? "Accepted"
                          : acceptingSanctionId === selectedLoan.id
                            ? "Accepting..."
                            : "Accept Terms"}
                      </button>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {selectedLoan.loanAgreement?.fileUrl && (
              <SectionCard
                title="Loan Agreement"
                subtitle="Review and accept the legal repayment contract before disbursal."
                icon={FileText}
              >
                <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        {statusLabel(selectedLoan.loanAgreement.status || "generated")}
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {selectedLoan.loanAgreement.fileName || "Loan agreement"}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        Generated on{" "}
                        {selectedLoan.loanAgreement.generatedAt
                          ? new Date(selectedLoan.loanAgreement.generatedAt).toLocaleDateString()
                          : "sanction acceptance"}.
                        {selectedLoan.loanAgreement.acceptedAt
                          ? ` Accepted on ${new Date(selectedLoan.loanAgreement.acceptedAt).toLocaleDateString()}.`
                          : " Manager disbursal is enabled only after agreement acceptance."}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <a
                        href={getUploadUrl(selectedLoan.loanAgreement.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary justify-center px-4 py-2 text-sm"
                      >
                        <FileText size={16} />
                        View PDF
                      </a>
                      <button
                        type="button"
                        onClick={acceptLoanAgreement}
                        disabled={
                          selectedLoan.loanAgreement.status === "accepted" ||
                          acceptingAgreementId === selectedLoan.id
                        }
                        className="btn-primary justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <CheckCircle2 size={16} />
                        {selectedLoan.loanAgreement.status === "accepted"
                          ? "Accepted"
                          : acceptingAgreementId === selectedLoan.id
                            ? "Accepting..."
                            : "Accept Agreement"}
                      </button>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {selectedLoan.repaymentScheduleDocument?.fileUrl && (
              <SectionCard
                title="Repayment Schedule PDF"
                subtitle="Download the final EMI schedule generated at disbursal."
                icon={CalendarClock}
              >
                <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        {statusLabel(selectedLoan.repaymentScheduleDocument.status || "generated")}
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {selectedLoan.repaymentScheduleDocument.fileName || "Repayment schedule"}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        Generated on{" "}
                        {selectedLoan.repaymentScheduleDocument.generatedAt
                          ? new Date(selectedLoan.repaymentScheduleDocument.generatedAt).toLocaleDateString()
                          : "disbursal"}.
                      </p>
                    </div>
                    <a
                      href={getUploadUrl(selectedLoan.repaymentScheduleDocument.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary justify-center px-4 py-2 text-sm"
                    >
                      <FileText size={16} />
                      View PDF
                    </a>
                  </div>
                </div>
              </SectionCard>
            )}

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
                  <div className="rounded-xl border border-bank-card-border bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Part-Payment
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {canManageRepayment
                        ? "Extra amount reduces outstanding principal and recalculates the remaining schedule with the same EMI."
                        : "Part-payment starts after the manager disburses the approved loan."}
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        type="number"
                        min="1"
                        value={partPaymentAmount}
                        onChange={(event) => setPartPaymentAmount(event.target.value)}
                        className="input-field"
                        placeholder="Amount"
                        disabled={!canManageRepayment}
                      />
                      <button
                        type="button"
                        onClick={postPartPayment}
                        disabled={!canManageRepayment || isPostingPartPayment}
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
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Principal</th>
                      <th className="px-4 py-3">Interest</th>
                      <th className="px-4 py-3">Penalty</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedLoan.repaymentHistory || []).length === 0 ? (
                      <tr className="table-row">
                        <td className="px-4 py-4 text-sm font-semibold text-slate-500" colSpan={7}>
                          No repayment activity recorded yet.
                        </td>
                      </tr>
                    ) : (
                      (selectedLoan.repaymentHistory || []).map((entry, index) => (
                        <tr key={`${entry.transactionId || entry.paymentType}-${index}`} className="table-row">
                          <td className="px-4 py-3">
                            {entry.paidAt ? new Date(entry.paidAt).toLocaleDateString() : "Not set"}
                          </td>
                          <td className="px-4 py-3 font-bold">{statusLabel(entry.paymentType)}</td>
                          <td className="px-4 py-3">{formatCurrency(entry.amount)}</td>
                          <td className="px-4 py-3">{formatCurrency(entry.principalPaid)}</td>
                          <td className="px-4 py-3">{formatCurrency(entry.interestPaid)}</td>
                          <td className="px-4 py-3">{formatCurrency(entry.penaltyPaid)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              entry.status === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}>
                              {statusLabel(entry.status)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              title="Amortization Schedule"
              subtitle={
                ["approved", "disbursed", "closed"].includes(selectedLoan.status)
                  ? "Repayment schedule for the approved loan."
                  : "Estimated schedule shown for review before manager approval."
              }
              icon={CalendarClock}
            >
              {!["approved", "disbursed", "closed"].includes(selectedLoan.status) && (
                <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  This schedule is provisional. EMI dates and repayment tracking start after manager approval and disbursal.
                </div>
              )}
              {selectedLoan.status === "disbursed" && selectedLoanNextPendingEmi && (
                <div className="mb-4 flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-emerald-900">
                      Next EMI: {formatCurrency(selectedLoanNextPendingEmi.emiAmount)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      EMI {selectedLoanNextPendingEmi.emiNumber} will be paid from the disbursement account.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={payNextEmi}
                    disabled={payingEmiNumber === selectedLoanNextPendingEmi.emiNumber}
                    className="btn-primary justify-center bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <CheckCircle2 size={16} />
                    {payingEmiNumber === selectedLoanNextPendingEmi.emiNumber
                      ? "Paying..."
                      : "Pay Next EMI"}
                  </button>
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
                    {(selectedLoan.amortizationSchedule || []).map((row) => (
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
              </div>
            </SectionCard>
          </section>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default Loans;
