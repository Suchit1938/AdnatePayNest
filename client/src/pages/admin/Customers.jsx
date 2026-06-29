import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CreditCard,
  Edit3,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import api from "../../api/axios";
import PageContent from "../../components/ui/PageContent";
import PageHeader from "../../components/ui/PageHeader";
import TablePagination from "../../components/ui/TablePagination";
import { useToast } from "../../components/ui/useToast";
import usePaginatedRows from "../../components/ui/usePaginatedRows";
import DashboardLayout from "../../layouts/DashboardLayout";
import { isValidEmail } from "../../utils/emailValidation";
import { formatCurrency, maskAccountNumber } from "../../utils/format";
import { getTierTone } from "../../utils/ui";

const ADMIN_ID = "ADMIN001";
const DEFAULT_BANK_NAME = "Adnate Bank";
const DEFAULT_BANK_IFSC = "ADNT0281237";
const DEFAULT_BRANCH_NAME = "Jaipur";
const DEFAULT_ASSIGNED_REGION = "Jaipur";

const initialUserForm = {
  fullName: "",
  email: "",
  phone: "",
  dob: "",
  address: "",
  role: "customer",
  status: "active",
  classification: "",
  customerId: "",
  accountType: "",
  panNumber: "",
  aadhaarNumber: "",
  walletBalance: "",
  bankAccountNo: "",
  bankIfsc: DEFAULT_BANK_IFSC,
  bankName: DEFAULT_BANK_NAME,
  accountStatus: "active",
  employeeId: "",
  assignedRegion: DEFAULT_ASSIGNED_REGION,
  branchId: DEFAULT_BANK_IFSC,
  branchName: DEFAULT_BRANCH_NAME,
};

const initialAccountForm = {
  accountType: "",
  openingBalance: "",
  accountStatus: "active",
};

const accountTypes = ["Savings", "Current", "Salary"];

const getAccountTypeRule = (tier, accountType) =>
  (tier?.accountTypeOdRules || []).find((rule) => rule.accountType === accountType);

const validationPatterns = {
  phone: /^[6-9]\d{9}$/,
  panNumber: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  aadhaarNumber: /^\d{12}$/,
  customerId: /^CUST\d{4,}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  accountNumber: /^\d{9,18}$/,
  name: /^[A-Za-z ]{2,}$/,
};

const isAdult = (dob) => {
  if (!dob) return true;

  const birthDate = new Date(dob);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= 18;
};

const getAutoPassword = (fullName, phone) => {
  const firstName = String(fullName || "").trim().split(/\s+/)[0] || "";
  const namePart = firstName.replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase();
  const phonePart = String(phone || "").replace(/\D/g, "").slice(-5);

  return namePart && phonePart.length === 5 ? `${namePart}@${phonePart}` : "";
};

const validateField = (field, value) => {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "";
  }

  switch (field) {
    case "fullName":
      return validationPatterns.name.test(trimmedValue)
        ? ""
        : "Name must contain only letters and spaces.";
    case "email":
      return isValidEmail(trimmedValue)
        ? ""
        : "Enter a valid email address.";
    case "phone":
      return validationPatterns.phone.test(trimmedValue)
        ? ""
        : "Enter a valid 10 digit Indian mobile number.";
    case "panNumber":
      return validationPatterns.panNumber.test(trimmedValue.toUpperCase())
        ? ""
        : "PAN must be like ABCDE1234F.";
    case "aadhaarNumber":
      return validationPatterns.aadhaarNumber.test(trimmedValue)
        ? ""
        : "Aadhaar must be 12 digits.";
    case "customerId":
      return validationPatterns.customerId.test(trimmedValue.toUpperCase())
        ? ""
        : "Customer ID must be like CUST1001.";
    case "bankAccountNo":
      return validationPatterns.accountNumber.test(trimmedValue)
        ? ""
        : "Account number must be 9 to 18 digits.";
    case "bankIfsc":
      return validationPatterns.ifsc.test(trimmedValue.toUpperCase())
        ? ""
        : "IFSC must be like HDFC0001234.";
    case "dob":
      return isAdult(trimmedValue)
        ? ""
        : "Customer must be at least 18 years old.";
    case "walletBalance":
      return Number(trimmedValue || 0) >= 0
        ? ""
        : "Wallet balance cannot be negative.";
    default:
      return "";
  }
};

const activeValidationFieldsByRole = {
  customer: [
    "fullName",
    "email",
    "phone",
    "panNumber",
    "aadhaarNumber",
    "bankIfsc",
    "dob",
    "walletBalance",
  ],
  manager: [
    "fullName",
    "email",
    "phone",
    "panNumber",
    "aadhaarNumber",
  ],
};

const inputClass = "input-field";

const createUserIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const Field = ({ label, required = false, children }) => (
  <label className="label-field">
    <span>
      {label}
      {required && <span className="ml-1 text-red-600">*</span>}
    </span>
    {children}
  </label>
);

const FieldError = ({ message }) => {
  if (!message) return null;

  return <p className="mt-1 text-sm font-medium text-red-600">{message}</p>;
};

const ReadOnlyField = ({ label, value }) => (
  <Field label={label}>
    <input
      readOnly
      value={value || "Not assigned"}
      className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
    />
  </Field>
);

const getCustomerAccounts = (user) =>
  user.accounts?.length ? user.accounts : [user.account].filter((account) => account?.accountNumber);

const sumAccountBalances = (accounts = []) =>
  accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);

const sumOverdraftUsed = (accounts = []) =>
  accounts.reduce((sum, account) => sum + Number(account.overdraftUsed || 0), 0);

const toDateOnly = (value) => {
  if (!value) return "";

  return String(value).slice(0, 10);
};

const getNextCustomerIdPreview = (customerRows = []) => {
  const maxNumber = customerRows.reduce((max, customer) => {
    const match = String(customer.customerId || "").match(/^CUST(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);

  return `CUST${maxNumber + 1}`;
};

const getNextEmployeeIdPreview = (managerRows = []) => {
  const maxNumber = managerRows.reduce((max, manager) => {
    const match = String(manager.employeeId || "").match(/^MGR(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 9000);

  return `MGR${maxNumber + 1}`;
};

const getNextAccountNumberPreview = (customerRows = []) => {
  const maxNumber = customerRows.reduce((max, customer) => {
    const accounts = customer.accounts?.length
      ? customer.accounts
      : [{ accountNumber: customer.accountNumber }];

    accounts.forEach((account) => {
      const accountNumber = String(account.accountNumber || "");

      if (/^\d+$/.test(accountNumber)) {
        max = Math.max(max, Number(accountNumber));
      }
    });

    return max;
  }, 1000000000);

  return String(maxNumber + 1);
};

const toCustomerRow = (customer) => {
  const accounts = getCustomerAccounts(customer);
  const firstAccount = accounts[0] || {};

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    panNumber: customer.panNumber,
    aadhaarNumber: customer.aadhaarNumber,
    dob: customer.dob,
    role: "customer",
    customerId: customer.customerId,
    accounts,
    accountNumber: firstAccount.accountNumber,
    bankName: firstAccount.bankName,
    ifsc: firstAccount.ifsc,
    accountType: firstAccount.accountType,
    accountStatus: firstAccount.accountStatus || "active",
    phone: customer.phone,
    address: customer.address,
    classification: customer.classification,
    balance: sumAccountBalances(accounts) || firstAccount.balance || 0,
    overdraftLimit: accounts.reduce((sum, account) => sum + Number(account.overdraftLimit || 0), 0),
    overdraftUsed: sumOverdraftUsed(accounts) || firstAccount.overdraftUsed || 0,
    pendingRequests: customer.pendingRequests || 0,
    totalTransfers: customer.totalTransfers || 0,
    status: customer.status,
    createdAt: customer.createdAt,
  };
};

const toManagerRow = (manager) => ({
  id: manager.id,
  name: manager.name,
  email: manager.email,
  role: "manager",
  employeeId: manager.employeeId,
  branch: manager.branch || manager.branchName,
  assignedRegion: manager.assignedRegion,
  branchId: manager.branchId,
  branchName: manager.branchName || manager.branch,
  pendingApprovals: manager.pendingApprovals || 0,
  approvedToday: manager.approvedToday || 0,
  rejectedToday: manager.rejectedToday || 0,
  status: manager.status,
});

const getCustomerAccountSummary = (customer) => {
  const accounts = customer.accounts?.length
    ? customer.accounts
    : [
        {
          accountNumber: customer.accountNumber,
          accountType: customer.accountType,
          balance: customer.balance,
          overdraftLimit: customer.overdraftLimit,
          overdraftUsed: customer.overdraftUsed,
          accountStatus: customer.accountStatus,
        },
      ].filter((account) => account.accountNumber || account.balance || account.overdraftLimit);
  const balance = accounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0
  );
  const overdraftLimit = accounts.reduce(
    (sum, account) => sum + Number(account.overdraftLimit || 0),
    0
  );
  const overdraftUsed = accounts.reduce(
    (sum, account) => sum + Number(account.overdraftUsed || 0),
    0
  );

  return {
    accounts,
    balance,
    overdraftLimit,
    overdraftUsed,
    availableOverdraft: Math.max(0, overdraftLimit - overdraftUsed),
    needsFinancialWarning: balance > 0 || overdraftUsed > 0 || overdraftLimit > 0,
  };
};

const pageCopyByMode = {
  users: {
    eyebrow: "Admin / Users & Access",
    title: "Users & Access",
    subtitle: "Create customer and manager profiles with verified identity and role-specific access.",
  },
  customers: {
    eyebrow: "Admin / Customer Operations",
    title: "Customer Operations",
    subtitle: "Review customer profiles, linked accounts, tier assignments, and access status.",
  },
  managers: {
    eyebrow: "Admin / Manager Access",
    title: "Manager Access",
    subtitle: "Review branch manager profiles and control operational access.",
  },
};

const Customers = ({ managementMode = "users" }) => {
  const toast = useToast();
  const [customerRows, setCustomerRows] = useState([]);
  const [managerRows, setManagerRows] = useState([]);
  const [createdUsers, setCreatedUsers] = useState([]);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [editForm, setEditForm] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [accountForm, setAccountForm] = useState(null);
  const [accountDetailsReview, setAccountDetailsReview] = useState(null);
  const [accountErrors, setAccountErrors] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const createUserIdempotencyKeyRef = useRef(createUserIdempotencyKey());
  const [disableReview, setDisableReview] = useState(null);
  const [managerReplacementReview, setManagerReplacementReview] = useState(null);
  const [managerStatusReview, setManagerStatusReview] = useState(null);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [tierFilterDraft, setTierFilterDraft] = useState("");
  const [tierRows, setTierRows] = useState([]);
  const pageCopy = pageCopyByMode[managementMode] || pageCopyByMode.users;
  const showCreateForm = managementMode === "users";
  const showCustomers = managementMode === "customers";
  const showManagers = managementMode === "managers";
  const showFormToast = (message, type = "info") => {
    setFormMessage(message);
    toast[type]?.(message);
  };

  useEffect(() => {
    Promise.allSettled([
      api.get("/users"),
      api.get("/tiers"),
    ]).then(([usersResult, tiersResult]) => {
      if (usersResult.status === "fulfilled") {
        const { data } = usersResult.value;
        setCustomerRows(data.customers.map(toCustomerRow));
        setManagerRows(data.managers.map(toManagerRow));
      }

      if (tiersResult.status === "fulfilled") {
        setTierRows(tiersResult.value.data.tiers);
      }
    });
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customerRows.filter((customer) => {
      const searchableText = [
        customer.name,
        customer.email,
      ]
        .join(" ")
        .toLowerCase();

      if (query && !searchableText.includes(query)) return false;
      if (tierFilter && customer.classification !== tierFilter) return false;

      return true;
    });
  }, [customerRows, search, tierFilter]);

  const filteredManagers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return managerRows;
    }

    return managerRows.filter((manager) =>
      [manager.name, manager.email, manager.employeeId, manager.branch]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [managerRows, search]);
  const customerPagination = usePaginatedRows(filteredCustomers);
  const managerPagination = usePaginatedRows(filteredManagers);

  const hasActiveCustomerFilters = Boolean(search) || Boolean(tierFilter);
  const hasActiveManagerFilters = Boolean(search);

  const applyCustomerFilters = () => {
    setSearch(searchDraft.trim());
    setTierFilter(tierFilterDraft);
  };

  const resetCustomerFilters = () => {
    setSearch("");
    setSearchDraft("");
    setTierFilter("");
    setTierFilterDraft("");
  };

  const nextCustomerIdPreview = useMemo(
    () => getNextCustomerIdPreview(customerRows),
    [customerRows]
  );

  const nextAccountNumberPreview = useMemo(
    () => getNextAccountNumberPreview(customerRows),
    [customerRows]
  );

  const nextEmployeeIdPreview = useMemo(
    () => getNextEmployeeIdPreview(managerRows),
    [managerRows]
  );
  const selectedCreateTier = tierRows.find(
    (tier) => tier.key === userForm.classification
  );
  const selectedCreateAccountRule = getAccountTypeRule(
    selectedCreateTier,
    userForm.accountType
  );
  const selectedMinOpeningBalance = Number(
    selectedCreateAccountRule?.minOpeningBalance || selectedCreateTier?.minBalance || 0
  );
  const getOpeningBalanceError = (value, minOpeningBalance = selectedMinOpeningBalance) => {
    const trimmedValue = String(value || "").trim();

    if (!trimmedValue) {
      return "";
    }

    const openingBalance = Number(trimmedValue);

    if (!Number.isFinite(openingBalance)) {
      return "Opening balance must be a valid amount.";
    }

    if (openingBalance < 0) {
      return "Opening balance cannot be negative.";
    }

    if (openingBalance < minOpeningBalance) {
      return `Minimum opening balance is ${formatCurrency(minOpeningBalance)}.`;
    }

    return "";
  };

  const openingBalanceError =
    userForm.role === "customer"
      ? getOpeningBalanceError(userForm.walletBalance)
      : "";

  const updateUserForm = (field, value) => {
    setUserForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      };

      if (["classification", "accountType"].includes(field) && nextForm.role === "customer") {
        const selectedTier = tierRows.find((tier) => tier.key === nextForm.classification);
        const selectedRule = getAccountTypeRule(selectedTier, nextForm.accountType);
        const minOpeningBalance = Number(
          selectedRule?.minOpeningBalance || selectedTier?.minBalance || 0
        );

        if (
          minOpeningBalance > 0 &&
          (!nextForm.walletBalance || Number(nextForm.walletBalance) < minOpeningBalance)
        ) {
          nextForm.walletBalance = String(minOpeningBalance);
        }
      }

      return nextForm;
    });

    setFieldErrors((currentErrors) => {
      const fieldError =
        field === "walletBalance"
          ? getOpeningBalanceError(value)
          : validateField(field, value);
      const nextErrors = {
        ...currentErrors,
        [field]: fieldError,
      };

      if (field === "role") {
        return {};
      }

      return nextErrors;
    });
  };

  const handleCreateUser = async (event, options = {}) => {
    event.preventDefault();

    if (isCreatingUser) {
      return;
    }

    const normalizedEmail = userForm.email.trim().toLowerCase();
    const isCustomer = userForm.role === "customer";
    const selectedTier = userForm.classification;
    const selectedPolicy = tierRows.find((tier) => tier.key === selectedTier);
    const requiredFields = [
      ["fullName", "Full Name"],
      ["email", "Email"],
      ...(isCustomer
        ? [
          ["phone", "Phone"],
          ["panNumber", "PAN Number"],
          ["aadhaarNumber", "Aadhaar Number"],
          ["classification", "Tier"],
          ["accountType", "Account Type"],
          ["dob", "Date of birth"],
          ["address", "Address"],
          ["walletBalance", "Opening Balance"],
          ["bankIfsc", "IFSC"],
          ["bankName", "Bank Name"],
        ]
        : [
          ["phone", "Phone"],
          ["panNumber", "PAN Number"],
          ["aadhaarNumber", "Aadhaar Number"],
          ["address", "Address"],
          ["assignedRegion", "Assigned Region"],
          ["branchId", "IFSC Code"],
          ["branchName", "Branch Name"],
        ]),
    ];

    const normalizedPhone = userForm.phone.trim();
    const normalizedPan = userForm.panNumber.trim().toUpperCase();
    const normalizedAadhaar = userForm.aadhaarNumber.trim();
    const normalizedIfsc = userForm.bankIfsc.trim().toUpperCase();
    const generatedPassword = getAutoPassword(userForm.fullName, normalizedPhone);

    if (!validationPatterns.name.test(userForm.fullName.trim())) {
      showFormToast("Full name must contain only letters and spaces.", "warning");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      showFormToast("Enter a valid email address.", "warning");
      return;
    }

    if (!validationPatterns.phone.test(normalizedPhone)) {
      showFormToast("Phone number must be a valid 10 digit Indian mobile number.", "warning");
      return;
    }

    if (!validationPatterns.panNumber.test(normalizedPan)) {
      showFormToast("PAN number must be in valid format, like ABCDE1234F.", "warning");
      return;
    }

    if (!validationPatterns.aadhaarNumber.test(normalizedAadhaar)) {
      showFormToast("Aadhaar number must be 12 digits.", "warning");
      return;
    }

    if (isCustomer) {
      if (!validationPatterns.ifsc.test(normalizedIfsc)) {
        showFormToast("IFSC must be in valid format, like HDFC0001234.", "warning");
        return;
      }

      if (!isAdult(userForm.dob)) {
        showFormToast("Customer must be at least 18 years old.", "warning");
        return;
      }
    }

    if (Number(userForm.walletBalance || 0) < 0) {
      showFormToast("Wallet balance cannot be negative.", "warning");
      return;
    }

    if (
      isCustomer &&
      selectedPolicy &&
      Number(userForm.walletBalance || 0) < selectedMinOpeningBalance
    ) {
      showFormToast(
        `${userForm.accountType} account requires at least ${formatCurrency(selectedMinOpeningBalance)} opening balance for ${selectedPolicy.label} tier.`,
        "warning"
      );
      return;
    }

    const missingField = requiredFields.find(
      ([field]) => !String(userForm[field]).trim()
    );

    if (isCustomer && !selectedPolicy) {
      showFormToast("Select a valid classification tier before creating a customer.", "warning");
      return;
    }

    if (missingField) {
      showFormToast(`${missingField[1]} is required before creating a user.`, "warning");
      return;
    }

    if (!generatedPassword) {
      showFormToast(
        "Enter a valid first name and 10 digit mobile number to generate the password.",
        "warning"
      );
      return;
    }

    const emailExists = [
      ...createdUsers.map((user) => user.email),
      ...customerRows.map((customer) => customer.email),
      ...managerRows.map((manager) => manager.email),
    ].some((email) => email.toLowerCase() === normalizedEmail);
    const phoneExists = createdUsers.some((user) => user.phone === normalizedPhone);

    if (emailExists || phoneExists) {
      showFormToast(
        `${emailExists ? "Email" : "Phone"} already exists. Use unique identity details.`,
        "warning"
      );
      return;
    }

    if (!isCustomer && !options.skipManagerReplacementReview) {
      const affectedManagers = managerRows;
      const pendingApprovals = affectedManagers.reduce(
        (total, manager) => total + Number(manager.pendingApprovals || 0),
        0
      );

      setManagerReplacementReview({
        newManagerName: userForm.fullName.trim(),
        branchName: DEFAULT_BRANCH_NAME,
        affectedManagers,
        pendingApprovals,
      });
      return;
    }

    setIsCreatingUser(true);

    const now = new Date().toISOString();
    const walletBalance = Number(userForm.walletBalance || 0);
    const nextUser = {
      fullName: userForm.fullName,
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash: generatedPassword,
      role: userForm.role,
      status: "active",
      ...(isCustomer
        ? {
          classification: selectedTier,
          accountType: userForm.accountType,
          customerId: nextCustomerIdPreview,
          panNumber: userForm.panNumber,
          aadhaarNumber: normalizedAadhaar,
          dob: userForm.dob,
          address: userForm.address,
          wallet: {
            balance: walletBalance,
            currency: "INR",
          },
          bank: {
            accountNo: nextAccountNumberPreview,
            ifsc: userForm.bankIfsc,
            bankName: userForm.bankName,
          },
        }
        : {
          panNumber: userForm.panNumber,
          aadhaarNumber: normalizedAadhaar,
          address: userForm.address,
          employeeId: nextEmployeeIdPreview,
          assignedRegion: DEFAULT_ASSIGNED_REGION,
          branchId: DEFAULT_BANK_IFSC,
          branchName: DEFAULT_BRANCH_NAME,
          permissions: ["review-transactions", "approve-requests"],
        }),
      createdBy: ADMIN_ID,
      createdAt: now,
      updatedAt: now,
    };

    let createdUser;
    let emailDelivery;

    try {
      const { data } = await api.post(
        "/users",
        {
          name: userForm.fullName,
          email: normalizedEmail,
          phone: normalizedPhone,
          password: generatedPassword,
          role: userForm.role,
          status: "active",
          classification: selectedTier,
          accountType: userForm.accountType,
          panNumber: userForm.panNumber,
          aadhaarNumber: normalizedAadhaar,
          dob: userForm.dob,
          address: userForm.address,
          assignedRegion: DEFAULT_ASSIGNED_REGION,
          branchId: DEFAULT_BANK_IFSC,
          branchName: DEFAULT_BRANCH_NAME,
          branch: DEFAULT_BRANCH_NAME,
          permissions: ["review-transactions", "approve-requests"],
          createdBy: ADMIN_ID,
          account: isCustomer
            ? {
              ifsc: userForm.bankIfsc,
              bankName: userForm.bankName,
              accountType: userForm.accountType,
              balance: walletBalance,
              overdraftLimit:
                selectedCreateAccountRule?.odLimit || selectedPolicy.maxODLimit || selectedPolicy.limit,
              accountStatus: userForm.accountStatus,
            }
            : undefined,
        },
        {
          headers: {
            "Idempotency-Key": createUserIdempotencyKeyRef.current,
          },
        }
      );

      createdUser = data.user;
      emailDelivery = data.email;
      createdUser.managerReplacement = data.managerReplacement;
    } catch (error) {
      showFormToast(
        error.response?.data?.message ||
        "User was not created. Please try again.",
        "error"
      );
      createUserIdempotencyKeyRef.current = createUserIdempotencyKey();
      setIsCreatingUser(false);
      return;
    }

    setCreatedUsers((currentRows) => [
      { ...nextUser, id: createdUser.id },
      ...currentRows,
    ]);

    if (isCustomer) {
      setCustomerRows((currentRows) => [
        toCustomerRow(createdUser),
        ...currentRows,
      ]);
    } else {
      setManagerRows((currentRows) => [
        {
          ...toManagerRow(createdUser),
          pendingApprovals:
            createdUser.managerReplacement?.reassignedPendingApprovals || 0,
        },
        ...currentRows.map((manager) => ({
          ...manager,
          status: "inactive",
          pendingApprovals: 0,
        })),
      ]);
    }

    setUserForm(initialUserForm);
    setFieldErrors({});
    createUserIdempotencyKeyRef.current = createUserIdempotencyKey();
    setIsCreatingUser(false);
    if (isCustomer && emailDelivery?.sent === false) {
      showFormToast(
        `User created, but the welcome email was not sent. ${emailDelivery.message || ""}`.trim(),
        "warning"
      );
      return;
    }

    showFormToast(
      isCustomer && emailDelivery?.sent
        ? "User created. Welcome email sent."
        : !isCustomer && createdUser.managerReplacement?.replacedManagers
          ? `Manager created. ${createdUser.managerReplacement.replacedManagers} previous manager(s) marked inactive and ${createdUser.managerReplacement.reassignedPendingApprovals} pending approval(s) reassigned.`
          : "User created.",
      "success"
    );
  };

  const updateCustomerStatus = async (customer, nextStatus) => {
    try {
      const { data } = await api.patch(`/users/${customer.id}/status`, {
        status: nextStatus,
      });

      setCustomerRows((currentRows) =>
        currentRows.map((row) =>
          row.id === customer.id ? { ...row, status: data.user.status } : row
        )
      );
      setDisableReview(null);
      showFormToast(
        `${customer.name} ${nextStatus === "inactive" ? "disabled" : "enabled"} successfully.`,
        "success"
      );
    } catch (error) {
      showFormToast(
        error.response?.data?.message || "Unable to update customer status.",
        "error"
      );
      setDisableReview((current) =>
        current ? { ...current, isSaving: false } : current
      );
    }
  };

  const toggleCustomerStatus = (customer) => {
    const nextStatus = customer.status === "active" ? "inactive" : "active";

    if (nextStatus === "inactive") {
      setFormMessage("");
      setDisableReview({
        customer,
        summary: getCustomerAccountSummary(customer),
        step: "confirm",
        isSaving: false,
      });
      return;
    }

    updateCustomerStatus(customer, nextStatus);
  };

  const continueDisableReview = () => {
    if (!disableReview) return;

    if (
      disableReview.step === "confirm" &&
      disableReview.summary.needsFinancialWarning
    ) {
      toast.warning("Customer has remaining account balance or overdraft exposure.");
      setDisableReview((current) => ({ ...current, step: "financial-warning" }));
      return;
    }

    setDisableReview((current) => ({ ...current, isSaving: true }));
    updateCustomerStatus(disableReview.customer, "inactive");
  };

  const applyManagerStatusResult = (manager, nextStatus, data) => {
    const reassignedPendingApprovals = Number(
      data.managerReplacement?.reassignedPendingApprovals || 0
    );
    const replacementManagerId = data.managerReplacement?.replacementManagerId;

    setManagerRows((currentRows) =>
      currentRows.map((row) => {
        if (row.id === manager.id) {
          return {
            ...row,
            status: data.user.status,
            pendingApprovals:
              nextStatus === "active"
                ? Number(row.pendingApprovals || 0) + reassignedPendingApprovals
                : 0,
          };
        }

        if (nextStatus === "active" && row.status === "active") {
          return { ...row, status: "inactive", pendingApprovals: 0 };
        }

        if (replacementManagerId && row.id === replacementManagerId) {
          return {
            ...row,
            pendingApprovals: Number(row.pendingApprovals || 0) + reassignedPendingApprovals,
          };
        }

        return row;
      })
    );
  };

  const updateManagerStatus = async (manager, nextStatus) => {
    setManagerStatusReview((current) =>
      current ? { ...current, isSaving: true } : current
    );

    try {
      const { data } = await api.patch(`/users/${manager.id}/status`, {
        status: nextStatus,
      });

      applyManagerStatusResult(manager, nextStatus, data);
      setManagerStatusReview(null);
      toast.success(
        nextStatus === "active"
          ? `${manager.name} enabled. Pending approvals were moved to this manager.`
          : `${manager.name} disabled successfully.`
      );
    } catch (error) {
      showFormToast(
        error.response?.data?.message || "Unable to update manager status.",
        "error"
      );
      setManagerStatusReview((current) =>
        current ? { ...current, isSaving: false } : current
      );
    }
  };

  const toggleManagerStatus = (manager) => {
    const nextStatus = manager.status === "active" ? "inactive" : "active";
    const otherActiveManagers = managerRows.filter(
      (row) => row.id !== manager.id && row.status === "active"
    );
    const pendingApprovals =
      nextStatus === "active"
        ? otherActiveManagers.reduce(
            (total, row) => total + Number(row.pendingApprovals || 0),
            0
          )
        : Number(manager.pendingApprovals || 0);

    setManagerStatusReview({
      manager,
      nextStatus,
      otherActiveManagers,
      pendingApprovals,
      isSaving: false,
      canProceed: nextStatus === "active" || pendingApprovals === 0 || otherActiveManagers.length > 0,
    });
  };

  const getAvailableAccountTypes = (customer) => {
    const existingTypes = new Set(
      (customer.accounts || []).map((account) => account.accountType)
    );

    return accountTypes.filter((type) => !existingTypes.has(type));
  };

  const validateAccountForm = (form = accountForm) => {
    const errors = {};
    const availableTypes = getAvailableAccountTypes(form.customer);
    const customerTier = tierRows.find(
      (tier) => tier.key === form.customer?.classification
    );
    const accountRule = getAccountTypeRule(customerTier, form.accountType);
    const minOpeningBalance = Number(
      accountRule?.minOpeningBalance || customerTier?.minBalance || 0
    );

    if (!availableTypes.includes(form.accountType)) {
      errors.accountType = "Choose an account type this customer does not already have.";
    }

    if (Number(form.openingBalance || 0) < 0) {
      errors.openingBalance = "Opening balance cannot be negative.";
    } else if (Number(form.openingBalance || 0) < minOpeningBalance) {
      errors.openingBalance = `Minimum opening balance is ${formatCurrency(minOpeningBalance)}.`;
    }

    if (!["active", "inactive", "blocked"].includes(form.accountStatus)) {
      errors.accountStatus = "Select a valid account status.";
    }

    setAccountErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const beginAddAccount = (customer) => {
    const availableTypes = getAvailableAccountTypes(customer);
    const initialType = availableTypes[0] || "";
    const customerTier = tierRows.find((tier) => tier.key === customer.classification);
    const accountRule = getAccountTypeRule(customerTier, initialType);
    const minOpeningBalance = Number(
      accountRule?.minOpeningBalance || customerTier?.minBalance || 0
    );

    setAccountErrors({});
    setAccountForm({
      ...initialAccountForm,
      customer,
      accountType: initialType,
      openingBalance: minOpeningBalance > 0 ? String(minOpeningBalance) : "",
    });
  };

  const updateAccountForm = (field, value) => {
    const nextForm = {
      ...accountForm,
      [field]: value,
    };

    if (field === "accountType") {
      const customerTier = tierRows.find(
        (tier) => tier.key === accountForm.customer?.classification
      );
      const accountRule = getAccountTypeRule(customerTier, value);
      const minOpeningBalance = Number(
        accountRule?.minOpeningBalance || customerTier?.minBalance || 0
      );

      if (
        minOpeningBalance > 0 &&
        (!nextForm.openingBalance || Number(nextForm.openingBalance) < minOpeningBalance)
      ) {
        nextForm.openingBalance = String(minOpeningBalance);
      }
    }

    setAccountForm(nextForm);
    validateAccountForm(nextForm);
  };

  const saveAccountForm = async (event) => {
    event.preventDefault();

    if (!accountForm || !validateAccountForm()) {
      showFormToast("Please fix the highlighted account fields before saving.", "warning");
      return;
    }

    try {
      const { data } = await api.post(`/users/${accountForm.customer.id}/accounts`, {
        accountType: accountForm.accountType,
        openingBalance: Number(accountForm.openingBalance || 0),
        accountStatus: accountForm.accountStatus,
      });

      setCustomerRows((currentRows) =>
        currentRows.map((row) =>
          row.id === accountForm.customer.id ? toCustomerRow(data.user) : row
        )
      );
      setAccountForm(null);
      setAccountErrors({});
      showFormToast(data.message || "Account added successfully.", "success");
    } catch (error) {
      showFormToast(error.response?.data?.message || "Unable to add account.", "error");
    }
  };

  const beginEditCustomer = (customer) => {
    setEditErrors({});
    setEditForm({
      type: "customer",
      id: customer.id,
      name: customer.name,
      fullName: customer.name || "",
      customerId: customer.customerId,
      email: customer.email,
      panNumber: customer.panNumber || "",
      aadhaarNumber: customer.aadhaarNumber || "",
      dob: customer.dob ? String(customer.dob).slice(0, 10) : "",
      accounts: customer.accounts || [],
      phone: customer.phone || "",
      address: customer.address || "",
      classification: customer.classification || "",
      accountStatus: customer.accountStatus || "active",
      status: customer.status || "active",
    });
  };

  const beginEditManager = (manager) => {
    setEditErrors({});
    setEditForm({
      type: "manager",
      id: manager.id,
      name: manager.name,
      employeeId: manager.employeeId,
      email: manager.email,
      assignedRegion: manager.assignedRegion || DEFAULT_ASSIGNED_REGION,
      branchId: manager.branchId || DEFAULT_BANK_IFSC,
      branchName: manager.branchName || manager.branch || DEFAULT_BRANCH_NAME,
      status: manager.status || "active",
    });
  };

  const updateEditForm = (field, value) => {
    setEditForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));

    setEditErrors((currentErrors) => {
      const nextForm = {
        ...editForm,
        [field]: value,
      };
      const nextErrors = { ...currentErrors };
      const trimmedValue = String(value || "").trim();

      if (nextForm.type === "customer") {
        if (field === "fullName") {
          nextErrors.fullName = validationPatterns.name.test(trimmedValue)
            ? ""
            : "Name must contain only letters and spaces.";
        }

        if (field === "email") {
          nextErrors.email = isValidEmail(trimmedValue)
            ? ""
            : "Enter a valid email address.";
        }

        if (field === "dob") {
          nextErrors.dob = isAdult(value)
            ? ""
            : "Customer must be at least 18 years old.";
        }

        if (field === "phone") {
          nextErrors.phone = validationPatterns.phone.test(trimmedValue)
            ? ""
            : "Enter a valid 10 digit Indian mobile number.";
        }

        if (field === "classification") {
          nextErrors.classification = trimmedValue ? "" : "Select a customer tier.";
        }
      } else {
        if (["assignedRegion", "branchId", "branchName"].includes(field)) {
          nextErrors[field] = trimmedValue ? "" : `${field.replace(/([A-Z])/g, " $1")} is required.`;
        }

      }

      return nextErrors;
    });
  };

  const validateEditForm = () => {
    const errors = {};

    if (editForm.type === "customer") {
      if (!validationPatterns.name.test(String(editForm.fullName || "").trim())) {
        errors.fullName = "Name must contain only letters and spaces.";
      }

      if (!isValidEmail(editForm.email)) {
        errors.email = "Enter a valid email address.";
      }

      if (!isAdult(editForm.dob)) {
        errors.dob = "Customer must be at least 18 years old.";
      }

      if (!validationPatterns.phone.test(String(editForm.phone || "").trim())) {
        errors.phone = "Enter a valid 10 digit Indian mobile number.";
      }

      if (!editForm.classification) {
        errors.classification = "Select a customer tier.";
      }

      if (!["active", "inactive", "blocked"].includes(editForm.accountStatus)) {
        errors.accountStatus = "Select a valid account status.";
      }

      if (!["active", "inactive", "suspended"].includes(editForm.status)) {
        errors.status = "Select a valid login status.";
      }
    } else {
      if (!String(editForm.assignedRegion || "").trim()) {
        errors.assignedRegion = "Assigned region is required.";
      }

      if (!String(editForm.branchId || "").trim()) {
        errors.branchId = "Branch ID is required.";
      }

      if (!String(editForm.branchName || "").trim()) {
        errors.branchName = "Branch name is required.";
      }

      if (!["active", "inactive", "suspended"].includes(editForm.status)) {
        errors.status = "Select a valid login status.";
      }
    }

    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveEditForm = async (event) => {
    event.preventDefault();

    if (!editForm) return;

    if (!validateEditForm()) {
      showFormToast("Please fix the highlighted fields before saving.", "warning");
      return;
    }

    const payload =
      editForm.type === "customer"
        ? {
          name: editForm.fullName,
          email: editForm.email,
          dob: editForm.dob,
          phone: editForm.phone,
          address: editForm.address,
          classification: editForm.classification,
          accountStatus: editForm.accountStatus,
          status: editForm.status,
        }
        : {
          assignedRegion: DEFAULT_ASSIGNED_REGION,
          branchId: DEFAULT_BANK_IFSC,
          branchName: DEFAULT_BRANCH_NAME,
          status: editForm.status,
        };

    try {
      const { data } = await api.patch(`/users/${editForm.id}`, payload);

      if (editForm.type === "customer") {
        setCustomerRows((currentRows) =>
          currentRows.map((row) =>
            row.id === editForm.id ? toCustomerRow(data.user) : row
          )
        );
      } else {
        const editedManager = managerRows.find((manager) => manager.id === editForm.id) || {
          id: editForm.id,
          name: editForm.name,
          pendingApprovals: 0,
        };

        if (data.managerReplacement) {
          applyManagerStatusResult(editedManager, editForm.status, data);
        } else {
          setManagerRows((currentRows) =>
            currentRows.map((row) =>
              row.id === editForm.id ? toManagerRow(data.user) : row
            )
          );
        }
      }

      if (editForm.type === "customer" && data.email?.sent === false) {
        showFormToast(
          `${editForm.name} updated, but the customer email was not sent. ${data.email.message || ""}`.trim(),
          "warning"
        );
      } else {
        showFormToast(
          editForm.type === "customer" && data.email?.sent
            ? `${editForm.name} updated. Customer email sent.`
            : `${editForm.name} updated.`,
          "success"
        );
      }
      setEditForm(null);
      setEditErrors({});
    } catch (error) {
      showFormToast(error.response?.data?.message || "Unable to update user.", "error");
    }
  };

  const isCustomerRole = userForm.role === "customer";
  const generatedPasswordPreview = useMemo(
    () => getAutoPassword(userForm.fullName, userForm.phone),
    [userForm.fullName, userForm.phone]
  );
  const activeValidationFields =
    activeValidationFieldsByRole[userForm.role] || activeValidationFieldsByRole.customer;
  const hasValidationErrors =
    activeValidationFields.some((field) => fieldErrors[field]) ||
    Boolean(openingBalanceError);

  return (
    <DashboardLayout>
      <PageContent>
        <PageHeader
          eyebrow={pageCopy.eyebrow}
          title={pageCopy.title}
          subtitle={pageCopy.subtitle}
        />

        <section className="space-y-6">
          {showCreateForm && (
          <form
            noValidate
            onSubmit={handleCreateUser}
            className="card-padded"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
                <UserPlus size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Create User</h2>
                <p className="text-sm text-slate-500">
                  Enter all user details manually before creating an account.
                </p>
              </div>
            </div>

            {formMessage && (
              <div className="alert-info mt-5">
                {formMessage}
              </div>
            )}

            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                  Identity
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Field label="Role" required>
                    <select
                      required
                      value={userForm.role}
                      onChange={(event) =>
                        updateUserForm("role", event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="customer">Customer</option>
                      <option value="manager">Manager</option>
                    </select>
                  </Field>
                  <Field label="Full Name" required>
                    <input
                      required
                      value={userForm.fullName}
                      onChange={(event) =>
                        updateUserForm("fullName", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Enter full name"
                    />
                    <FieldError message={fieldErrors.fullName} />
                  </Field>
                  <Field label="Phone" required>
                    <input
                      required
                      inputMode="tel"
                      value={userForm.phone}
                      onChange={(event) =>
                        updateUserForm("phone", event.target.value)
                      }
                      className={inputClass}
                      placeholder="10 digit mobile number"
                    />
                    <FieldError message={fieldErrors.phone} />
                  </Field>
                  <Field label="Email" required>
                    <input
                      required
                      type="email"
                      value={userForm.email}
                      onChange={(event) =>
                        updateUserForm("email", event.target.value)
                      }
                      className={inputClass}
                      placeholder="user@email.com"
                    />
                    <FieldError message={fieldErrors.email} />
                  </Field>
                  {isCustomerRole && (
                    <Field label="Date of Birth" required>
                      <input
                        required
                        type="date"
                        value={userForm.dob}
                        onChange={(event) =>
                          updateUserForm("dob", event.target.value)
                        }
                        className={inputClass}
                      />
                      <FieldError message={fieldErrors.dob} />
                    </Field>
                  )}
                  <Field label="Auto Password">
                    <input
                      readOnly
                      value={generatedPasswordPreview}
                      className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
                      placeholder="Generated after name and phone"
                    />
                  </Field>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                  {isCustomerRole ? "KYC" : "KYC & Assignment"}
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {isCustomerRole ? (
                    <>
                      <Field label="PAN Number" required={isCustomerRole}>
                        <input
                          required={isCustomerRole}
                          value={userForm.panNumber}
                          onChange={(event) =>
                            updateUserForm("panNumber", event.target.value.toUpperCase())
                          }
                          className={inputClass}
                          placeholder="ABCDE1234F"
                        />
                        <FieldError message={fieldErrors.panNumber} />
                      </Field>
                      <Field label="Aadhaar Number" required={isCustomerRole}>
                        <input
                          required={isCustomerRole}
                          inputMode="numeric"
                          maxLength="12"
                          value={userForm.aadhaarNumber}
                          onChange={(event) =>
                            updateUserForm("aadhaarNumber", event.target.value.replace(/\D/g, ""))
                          }
                          className={inputClass}
                          placeholder="12 digit Aadhaar"
                        />
                        <FieldError message={fieldErrors.aadhaarNumber} />
                      </Field>
                      <div className="lg:col-span-3">
                        <Field label="Address" required>
                          <input
                            required
                            value={userForm.address}
                            onChange={(event) =>
                              updateUserForm("address", event.target.value)
                            }
                            className={inputClass}
                            placeholder="Enter address"
                          />
                        </Field>
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="PAN Number" required>
                        <input
                          required
                          value={userForm.panNumber}
                          onChange={(event) =>
                            updateUserForm("panNumber", event.target.value.toUpperCase())
                          }
                          className={inputClass}
                          placeholder="ABCDE1234F"
                        />
                        <FieldError message={fieldErrors.panNumber} />
                      </Field>
                      <Field label="Aadhaar Number" required>
                        <input
                          required
                          inputMode="numeric"
                          maxLength="12"
                          value={userForm.aadhaarNumber}
                          onChange={(event) =>
                            updateUserForm("aadhaarNumber", event.target.value.replace(/\D/g, ""))
                          }
                          className={inputClass}
                          placeholder="12 digit Aadhaar"
                        />
                        <FieldError message={fieldErrors.aadhaarNumber} />
                      </Field>
                      <Field label="Employee ID">
                        <input
                          readOnly
                          value={nextEmployeeIdPreview}
                          className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
                          placeholder="Auto generated"
                        />
                      </Field>
                      <Field label="Assigned Region">
                        <input
                          readOnly
                          value={DEFAULT_ASSIGNED_REGION}
                          className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
                        />
                      </Field>
                      <Field label="IFSC Code">
                        <input
                          readOnly
                          value={DEFAULT_BANK_IFSC}
                          className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
                        />
                      </Field>
                      <Field label="Branch Name">
                        <input
                          readOnly
                          value={DEFAULT_BRANCH_NAME}
                          className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
                        />
                      </Field>
                      <div className="lg:col-span-3">
                        <Field label="Address" required>
                          <input
                            required
                            value={userForm.address}
                            onChange={(event) =>
                              updateUserForm("address", event.target.value)
                            }
                            className={inputClass}
                            placeholder="Enter address"
                          />
                        </Field>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {isCustomerRole && (
                <>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                      Bank Account Setup
                    </h3>
                    <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <Field label="Account Type" required>
                        <select
                          required
                          value={userForm.accountType}
                          onChange={(event) =>
                            updateUserForm("accountType", event.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="">Select account</option>
                          <option value="Savings">Savings</option>
                          <option value="Current">Current</option>
                          <option value="Salary">Salary</option>
                        </select>
                      </Field>
                      <Field label="Customer ID">
                        <input
                          readOnly
                          value={nextCustomerIdPreview}
                          className={inputClass}
                          placeholder="Auto generated"
                        />
                      </Field>
                      <Field label="Tier" required>
                        <select
                          required
                          value={userForm.classification}
                          onChange={(event) =>
                            updateUserForm("classification", event.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="">Select tier</option>
                          {tierRows.map((tier) => (
                            <option key={tier.key} value={tier.key}>
                              {tier.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Opening Balance" required>
                        <input
                          required
                          min={selectedMinOpeningBalance}
                          type="number"
                          value={userForm.walletBalance}
                          onChange={(event) =>
                            updateUserForm("walletBalance", event.target.value)
                          }
                          className={inputClass}
                          placeholder={
                            selectedMinOpeningBalance > 0
                              ? String(selectedMinOpeningBalance)
                              : "0"
                          }
                        />
                        {selectedCreateTier && userForm.accountType && (
                          <p className="mt-2 text-xs font-semibold text-blue-700">
                            Minimum opening balance for {selectedCreateTier.label} {userForm.accountType}:{" "}
                            {formatCurrency(selectedMinOpeningBalance)}
                          </p>
                        )}
                        <FieldError message={fieldErrors.walletBalance || openingBalanceError} />
                      </Field>
                      <Field label="Account Number">
                        <input
                          readOnly
                          value={nextAccountNumberPreview}
                          className={inputClass}
                          placeholder="Auto generated"
                        />
                      </Field>
                      <Field label="IFSC" required>
                        <input
                          required
                          value={userForm.bankIfsc}
                          onChange={(event) =>
                            updateUserForm("bankIfsc", event.target.value.toUpperCase())
                          }
                          className={inputClass}
                          placeholder="HDFC0001234"
                        />
                        <FieldError message={fieldErrors.bankIfsc} />
                      </Field>
                      <div className="lg:col-span-3">
                        <Field label="Bank Name" required>
                          <input
                            required
                            value={userForm.bankName}
                            onChange={(event) =>
                              updateUserForm("bankName", event.target.value)
                            }
                            className={inputClass}
                            placeholder="Enter bank name"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={hasValidationErrors || isCreatingUser}
              className="btn-primary mt-6 w-full"
            >
              <UserPlus size={18} />
              {isCreatingUser ? "Creating user..." : "Create User"}
            </button>
          </form>
          )}

          {(showCustomers || showManagers) && (
          <div className="space-y-6">
            {showCustomers && (
            <div className="table-shell">
              <div className="border-b border-slate-100 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Customer Directory</h2>
                  <p className="text-sm text-slate-500">
                    Editable: phone, address, customer tier, account status, and login status.
                  </p>
                </div>

                <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto">
                  <label className="min-w-0 flex-1 sm:w-80 sm:flex-none">
                    <span className="text-sm font-semibold text-slate-600">Name / Email</span>
                    <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <Search size={18} className="shrink-0 text-slate-400" />
                    <input
                      value={searchDraft}
                      onChange={(event) => setSearchDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          applyCustomerFilters();
                        }
                      }}
                      className="w-full outline-none"
                      placeholder="Search name or email"
                    />
                    </span>
                  </label>
                  <label className="w-full sm:w-56">
                    <span className="text-sm font-semibold text-slate-600">Tier</span>
                    <select
                      value={tierFilterDraft}
                      onChange={(event) => setTierFilterDraft(event.target.value)}
                      className={`${inputClass} mt-2`}
                    >
                      <option value="">All tiers</option>
                      {tierRows.map((tier) => (
                        <option key={tier.key} value={tier.key}>
                          {tier.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={applyCustomerFilters}
                    className="btn-primary px-4 py-2"
                  >
                    <Search size={16} />
                    Search
                  </button>
                </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-500">
                    Showing {filteredCustomers.length} of {customerRows.length} customers
                  </p>
                  {hasActiveCustomerFilters && (
                    <button
                      type="button"
                      onClick={resetCustomerFilters}
                      className="btn-secondary px-4 py-2"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div>
                <table className="w-full table-fixed text-left">
                  <thead className="table-head">
                    <tr>
                      <th className="w-[31%] px-4 py-4">Customer</th>
                      <th className="w-[31%] px-4 py-4">Accounts</th>
                      <th className="w-[13%] px-4 py-4">Tier</th>
                      <th className="w-[11%] px-4 py-4">Status</th>
                      <th className="w-[14%] px-4 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerPagination.pageRows.map((customer) => (
                      <tr key={customer.customerId} className="table-row align-top">
                        <td className="px-4 py-4">
                          <p className="truncate font-semibold text-slate-900" title={customer.name}>
                            {customer.name}
                          </p>
                          <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-slate-500">
                            <Mail size={14} className="shrink-0" />
                            <span className="truncate" title={customer.email}>
                              {customer.email}
                            </span>
                          </p>
                          <p className="mt-1 truncate text-xs font-semibold uppercase text-slate-400">
                            {customer.customerId} / PAN {customer.panNumber || "Not set"}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-400">
                            Registered {toDateOnly(customer.createdAt) || "Not available"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          {customer.accounts?.length > 0 ? (
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {customer.accounts.length} account
                                  {customer.accounts.length === 1 ? "" : "s"}
                                </span>
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                  By type
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {customer.accounts.map((account) => (
                                  <span
                                    key={account.accountNumber || account.accountType}
                                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                                    title={`${account.accountType || "Account"} ${maskAccountNumber(account.accountNumber)}`}
                                  >
                                    <span className="font-bold text-slate-800">
                                      {account.accountType || "Account"}
                                    </span>
                                    <span className="truncate font-semibold text-slate-500">
                                      {maskAccountNumber(account.accountNumber)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">No account linked</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex max-w-full truncate rounded-full px-3 py-1 text-sm font-semibold capitalize ${getTierTone(customer.classification).badge}`}>
                            {customer.classification}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                              customer.status === "active"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {customer.status === "active" ? (
                              <BadgeCheck size={14} />
                            ) : (
                              <Ban size={14} />
                            )}
                            {customer.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              aria-label={`Edit ${customer.name}`}
                              title="Edit customer"
                              onClick={() => beginEditCustomer(customer)}
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => beginAddAccount(customer)}
                              className="rounded-lg border border-blue-100 p-2 text-blue-700 hover:bg-blue-50"
                              aria-label={`Add account for ${customer.name}`}
                              title="Add account"
                            >
                              <Plus size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setAccountDetailsReview({
                                  customer,
                                  summary: getCustomerAccountSummary(customer),
                                })
                              }
                              className="rounded-lg border border-emerald-100 p-2 text-emerald-700 hover:bg-emerald-50"
                              aria-label={`View accounts for ${customer.name}`}
                              title="View accounts"
                            >
                              <Wallet size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCustomerStatus(customer)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              aria-label={`${customer.status === "active" ? "Disable" : "Enable"} ${customer.name}`}
                              title={customer.status === "active" ? "Disable access" : "Enable access"}
                            >
                              {customer.status === "active" ? (
                                <Ban size={16} />
                              ) : (
                                <BadgeCheck size={16} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-sm font-semibold text-slate-500"
                        >
                          No customers match the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <TablePagination {...customerPagination} />
              </div>
            </div>
            )}

            {showManagers && (
            <div className="table-shell">
              <div className="border-b border-slate-100 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Manager Directory</h2>
                  <p className="text-sm text-slate-500">
                    Single-branch assignment is fixed; login status remains editable.
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto">
                  <label className="min-w-0 flex-1 sm:w-80 sm:flex-none">
                    <span className="text-sm font-semibold text-slate-600">
                      Name / Email / Employee ID
                    </span>
                    <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <Search size={18} className="shrink-0 text-slate-400" />
                      <input
                        value={searchDraft}
                        onChange={(event) => setSearchDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            applyCustomerFilters();
                          }
                        }}
                        className="w-full outline-none"
                        placeholder="Search managers"
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={applyCustomerFilters}
                    className="btn-primary px-4 py-2"
                  >
                    <Search size={16} />
                    Search
                  </button>
                </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-500">
                    Showing {filteredManagers.length} of {managerRows.length} managers
                  </p>
                  {hasActiveManagerFilters && (
                    <button
                      type="button"
                      onClick={resetCustomerFilters}
                      className="btn-secondary px-4 py-2"
                    >
                      Reset Search
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="table-head">
                    <tr>
                      <th className="px-6 py-4">Manager</th>
                      <th className="px-6 py-4">Branch</th>
                      <th className="px-6 py-4">Approvals</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerPagination.pageRows.map((manager) => (
                      <tr key={manager.employeeId} className="table-row">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">
                            {manager.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {manager.email} / {manager.employeeId}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-slate-900">
                            {manager.branchName || manager.branch}
                          </p>
                          <p className="text-sm text-slate-500">
                            {manager.assignedRegion} / {manager.branchId}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold">
                            {manager.pendingApprovals}
                          </span>
                          <span className="text-sm text-slate-500">
                            {" "}
                            pending
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${manager.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                              }`}
                          >
                            {manager.status === "active" ? (
                              <BadgeCheck size={15} />
                            ) : (
                              <Ban size={15} />
                            )}
                            {manager.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              aria-label={`Edit ${manager.name}`}
                              onClick={() => beginEditManager(manager)}
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleManagerStatus(manager)}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              {manager.status === "active" ? (
                                <Ban size={15} />
                              ) : (
                                <BadgeCheck size={15} />
                              )}
                              {manager.status === "active" ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredManagers.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-sm font-semibold text-slate-500"
                        >
                          No managers match the selected search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <TablePagination {...managerPagination} />
              </div>
            </div>
            )}
          </div>
          )}
        </section>

        {accountDetailsReview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                      <Wallet size={24} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                        Customer Accounts
                      </p>
                      <h2 className="mt-1 text-2xl font-bold text-slate-950">
                        {accountDetailsReview.customer.name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {accountDetailsReview.customer.customerId} / {accountDetailsReview.customer.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAccountDetailsReview(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <Wallet size={18} className="text-blue-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Total Balance
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {formatCurrency(accountDetailsReview.summary.balance)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <CreditCard size={18} className="text-emerald-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Overdraft Limit
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {formatCurrency(accountDetailsReview.summary.overdraftLimit)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Overdraft Used
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {formatCurrency(accountDetailsReview.summary.overdraftUsed)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <Users size={18} className="text-violet-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Accounts
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {accountDetailsReview.summary.accounts.length}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {accountDetailsReview.summary.accounts.length === 0 && (
                    <div className="empty-state">
                      No account details are linked to this customer yet.
                    </div>
                  )}
                  {accountDetailsReview.summary.accounts.map((account) => (
                    <section
                      key={account.accountNumber || account.accountType}
                      className="rounded-xl border border-bank-card-border bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-950">
                            {account.accountType || "Account"}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {maskAccountNumber(account.accountNumber)} / IFSC {account.ifsc || accountDetailsReview.customer.ifsc || "Not set"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {account.bankName || accountDetailsReview.customer.bankName || DEFAULT_BANK_NAME}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${
                            (account.accountStatus || account.status || "active") === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {account.accountStatus || account.status || "active"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg bg-bank-surface p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">
                            Balance
                          </p>
                          <p className="mt-1 font-bold text-slate-950">
                            {formatCurrency(account.balance || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-bank-surface p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">
                            Overdraft Limit
                          </p>
                          <p className="mt-1 font-bold text-slate-950">
                            {formatCurrency(account.overdraftLimit || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-bank-surface p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">
                            Overdraft Used
                          </p>
                          <p className="mt-1 font-bold text-slate-950">
                            {formatCurrency(account.overdraftUsed || 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-bank-surface p-3">
                          <p className="text-xs font-bold uppercase text-slate-500">
                            Available Overdraft
                          </p>
                          <p className="mt-1 font-bold text-slate-950">
                            {formatCurrency(
                              Math.max(
                                0,
                                Number(account.overdraftLimit || 0) -
                                  Number(account.overdraftUsed || 0)
                              )
                            )}
                          </p>
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {disableReview && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center">
            <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-100 px-6 py-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`rounded-xl p-3 ${
                      disableReview.step === "financial-warning"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {disableReview.step === "financial-warning" ? (
                      <ShieldAlert size={24} />
                    ) : (
                      <Ban size={24} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-600">
                      Disable Customer Access
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      {disableReview.step === "financial-warning"
                        ? "Review remaining account exposure"
                        : `Disable ${disableReview.customer.name}?`}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {disableReview.step === "financial-warning"
                        ? "This customer still has account balance or overdraft details linked to the profile. Review these values before final disable."
                        : "The customer will lose login access immediately. Accounts and transaction history will remain visible to admins."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="rounded-xl border border-bank-card-border bg-bank-surface px-4 py-3">
                  <p className="font-bold text-slate-950">{disableReview.customer.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {disableReview.customer.customerId} / {disableReview.customer.email}
                  </p>
                </div>

                {disableReview.step === "financial-warning" && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-bank-card-border bg-white p-4">
                        <Wallet size={18} className="text-blue-600" />
                        <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                          Balance
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {formatCurrency(disableReview.summary.balance)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-bank-card-border bg-white p-4">
                        <AlertTriangle size={18} className="text-amber-600" />
                        <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                          Overdraft Used
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {formatCurrency(disableReview.summary.overdraftUsed)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-bank-card-border bg-white p-4">
                        <CreditCard size={18} className="text-emerald-600" />
                        <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                          Available Overdraft
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {formatCurrency(disableReview.summary.availableOverdraft)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-bank-card-border bg-white p-4">
                        <Users size={18} className="text-violet-600" />
                        <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                          Accounts
                        </p>
                        <p className="mt-1 text-lg font-bold text-slate-950">
                          {disableReview.summary.accounts.length}
                        </p>
                      </div>
                    </div>

                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-bank-card-border bg-white p-3">
                      {disableReview.summary.accounts.map((account) => (
                        <div
                          key={account.accountNumber || account.accountType}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bank-surface px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {account.accountType || "Account"} / {maskAccountNumber(account.accountNumber)}
                            </p>
                            <p className="text-xs font-semibold capitalize text-slate-500">
                              {account.accountStatus || account.status || "active"}
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-bold text-slate-900">
                              {formatCurrency(account.balance || 0)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Overdraft used {formatCurrency(account.overdraftUsed || 0)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setDisableReview(null)}
                    disabled={disableReview.isSaving}
                    className="btn-secondary justify-center px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={continueDisableReview}
                    disabled={disableReview.isSaving}
                    className={`justify-center ${
                      disableReview.step === "financial-warning"
                        ? "btn-danger-soft bg-red-600 text-white hover:bg-red-700"
                        : "btn-primary bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {disableReview.isSaving
                      ? "Disabling..."
                      : disableReview.step === "financial-warning"
                        ? "Disable Anyway"
                        : "Continue"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {managerReplacementReview && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center">
            <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-100 px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                    <ShieldAlert size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600">
                      Replace Branch Manager
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      Assign {managerReplacementReview.newManagerName}?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      This will make the new manager active for {managerReplacementReview.branchName}.
                      Existing manager access will be disabled, but their profiles and history will stay saved.
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <Users size={18} className="text-blue-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Affected Managers
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {managerReplacementReview.affectedManagers.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Pending Work
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {managerReplacementReview.pendingApprovals}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-bank-surface p-4">
                    <BadgeCheck size={18} className="text-emerald-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      New Status
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      Active
                    </p>
                  </div>
                </div>

                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} />
                    <div>
                      <h3 className="font-bold text-amber-950">
                        Pending approvals will move automatically
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-amber-900">
                        All pending approvals assigned to existing managers will be transferred
                        to {managerReplacementReview.newManagerName}. The old manager will be marked inactive,
                        not deleted.
                      </p>
                    </div>
                  </div>
                </section>

                <div className="rounded-xl border border-bank-card-border bg-white p-4">
                  <h3 className="font-bold text-slate-950">Existing manager access</h3>
                  <div className="mt-3 space-y-2">
                    {managerReplacementReview.affectedManagers.length === 0 && (
                      <p className="text-sm text-slate-500">
                        No manager is currently assigned to this branch.
                      </p>
                    )}
                    {managerReplacementReview.affectedManagers.map((manager) => (
                      <div
                        key={manager.id || manager.employeeId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bank-surface px-3 py-2"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{manager.name}</p>
                          <p className="text-xs font-semibold text-slate-500">
                            {manager.employeeId} / {manager.email}
                          </p>
                        </div>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold uppercase text-red-700">
                          Will be inactive
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setManagerReplacementReview(null)}
                    disabled={isCreatingUser}
                    className="btn-secondary justify-center px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManagerReplacementReview(null);
                      handleCreateUser(
                        { preventDefault: () => {} },
                        { skipManagerReplacementReview: true }
                      );
                    }}
                    disabled={isCreatingUser}
                    className="btn-primary justify-center px-4 py-2"
                  >
                    {isCreatingUser ? "Creating user..." : "Replace Manager"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {managerStatusReview && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center">
            <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-slate-100 px-6 py-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`rounded-xl p-3 ${
                      managerStatusReview.nextStatus === "active"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {managerStatusReview.nextStatus === "active" ? (
                      <ShieldAlert size={24} />
                    ) : (
                      <Ban size={24} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Manager Access Review
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      {managerStatusReview.nextStatus === "active"
                        ? `Enable ${managerStatusReview.manager.name}?`
                        : `Disable ${managerStatusReview.manager.name}?`}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {managerStatusReview.nextStatus === "active"
                        ? "Only one manager can be active. Enabling this manager will disable the current active manager and move pending approvals here."
                        : "Disabling a manager removes login access. Pending approvals need another active manager before this can continue."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="rounded-xl border border-bank-card-border bg-bank-surface px-4 py-3">
                  <p className="font-bold text-slate-950">
                    {managerStatusReview.manager.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {managerStatusReview.manager.employeeId} / {managerStatusReview.manager.email}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-bank-card-border bg-white p-4">
                    <Users size={18} className="text-blue-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Active Managers
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {managerRows.filter((manager) => manager.status === "active").length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-white p-4">
                    <AlertTriangle size={18} className="text-amber-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      Pending Work
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-950">
                      {managerStatusReview.pendingApprovals}
                    </p>
                  </div>
                  <div className="rounded-xl border border-bank-card-border bg-white p-4">
                    <BadgeCheck size={18} className="text-emerald-600" />
                    <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                      New Status
                    </p>
                    <p className="mt-1 text-lg font-bold capitalize text-slate-950">
                      {managerStatusReview.nextStatus}
                    </p>
                  </div>
                </div>

                {managerStatusReview.nextStatus === "active" && (
                  <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} />
                      <div>
                        <h3 className="font-bold text-amber-950">
                          Pending approvals will transfer
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-amber-900">
                          Current active manager access will be disabled. Pending approval records,
                          customer links, and transaction details stay saved and are reassigned to
                          {` ${managerStatusReview.manager.name}`}.
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {managerStatusReview.nextStatus !== "active" &&
                  managerStatusReview.pendingApprovals > 0 && (
                    <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 shrink-0 text-red-700" size={20} />
                        <div>
                          <h3 className="font-bold text-red-950">
                            Disable is blocked for now
                          </h3>
                          <p className="mt-1 text-sm leading-6 text-red-900">
                            This manager still owns pending approvals. Enable or create another
                            manager first, then those approvals will transfer automatically.
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                {managerStatusReview.nextStatus === "active" && (
                  <div className="rounded-xl border border-bank-card-border bg-white p-4">
                    <h3 className="font-bold text-slate-950">Managers affected</h3>
                    <div className="mt-3 space-y-2">
                      {managerStatusReview.otherActiveManagers.length === 0 && (
                        <p className="text-sm text-slate-500">
                          No other manager is currently active.
                        </p>
                      )}
                      {managerStatusReview.otherActiveManagers.map((manager) => (
                        <div
                          key={manager.id || manager.employeeId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bank-surface px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{manager.name}</p>
                            <p className="text-xs font-semibold text-slate-500">
                              {manager.employeeId} / {manager.email}
                            </p>
                          </div>
                          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold uppercase text-red-700">
                            Will be inactive
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setManagerStatusReview(null)}
                    disabled={managerStatusReview.isSaving}
                    className="btn-secondary justify-center px-4 py-2"
                  >
                    Cancel
                  </button>
                  {managerStatusReview.canProceed && (
                    <button
                      type="button"
                      onClick={() =>
                        updateManagerStatus(
                          managerStatusReview.manager,
                          managerStatusReview.nextStatus
                        )
                      }
                      disabled={managerStatusReview.isSaving}
                      className={`justify-center px-4 py-2 ${
                        managerStatusReview.nextStatus === "active"
                          ? "btn-primary"
                          : "btn-primary bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      {managerStatusReview.isSaving
                        ? "Saving..."
                        : managerStatusReview.nextStatus === "active"
                          ? "Enable Manager"
                          : "Disable Manager"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {accountForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
            <form
              onSubmit={saveAccountForm}
              className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl"
            >
              <div className="border-b border-slate-100 bg-white px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-blue-600">
                      Add account
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      {accountForm.customer.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {accountForm.customer.customerId} / {accountForm.customer.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAccountForm(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div className="space-y-5 px-6 py-5">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-1 text-blue-600" size={20} />
                    <div>
                      <h3 className="text-base font-bold text-slate-950">
                        Existing accounts
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {accountTypes.map((type) => {
                          const existingAccount = accountForm.customer.accounts?.find(
                            (account) => account.accountType === type
                          );

                          return (
                            <span
                              key={type}
                              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                existingAccount
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-white text-slate-500"
                              }`}
                            >
                              {type}
                              {existingAccount
                                ? ` - ${maskAccountNumber(existingAccount.accountNumber)}`
                                : " - Not created"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Account Type" required>
                    <select
                      value={accountForm.accountType}
                      onChange={(event) =>
                        updateAccountForm("accountType", event.target.value)
                      }
                      className={inputClass}
                    >
                      {getAvailableAccountTypes(accountForm.customer).length === 0 && (
                        <option value="">All account types already created</option>
                      )}
                      {getAvailableAccountTypes(accountForm.customer).map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <FieldError message={accountErrors.accountType} />
                  </Field>

                  <Field label="Opening Balance" required>
                    <input
                      min={
                        Number(
                          getAccountTypeRule(
                            tierRows.find((tier) => tier.key === accountForm.customer?.classification),
                            accountForm.accountType
                          )?.minOpeningBalance ||
                            tierRows.find((tier) => tier.key === accountForm.customer?.classification)?.minBalance ||
                            0
                        )
                      }
                      type="number"
                      value={accountForm.openingBalance}
                      onChange={(event) =>
                        updateAccountForm("openingBalance", event.target.value)
                      }
                      className={inputClass}
                      placeholder="0"
                    />
                    <p className="mt-2 text-xs font-semibold text-blue-700">
                      Minimum opening balance:{" "}
                      {formatCurrency(
                        getAccountTypeRule(
                          tierRows.find((tier) => tier.key === accountForm.customer?.classification),
                          accountForm.accountType
                        )?.minOpeningBalance ||
                          tierRows.find((tier) => tier.key === accountForm.customer?.classification)?.minBalance ||
                          0
                      )}
                    </p>
                    <FieldError message={accountErrors.openingBalance} />
                  </Field>

                  <Field label="Account Status" required>
                    <select
                      value={accountForm.accountStatus}
                      onChange={(event) =>
                        updateAccountForm("accountStatus", event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="blocked">Blocked</option>
                    </select>
                    <FieldError message={accountErrors.accountStatus} />
                  </Field>

                  <Field label="Bank Details">
                    <input
                      readOnly
                      value={`${DEFAULT_BANK_NAME} / ${DEFAULT_BANK_IFSC}`}
                      className={`${inputClass} cursor-not-allowed border-slate-200 bg-slate-100 font-semibold text-slate-500 shadow-none`}
                    />
                  </Field>

                  <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                    Transfer, withdrawal, and overdraft limits will be applied from the customer's current classification.
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 bg-white px-6 py-4">
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setAccountForm(null)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={getAvailableAccountTypes(accountForm.customer).length === 0}
                  >
                    <Plus size={18} />
                    Create Account
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
            <form
              onSubmit={saveEditForm}
              className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            >
              <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-blue-600">
                    {editForm.type === "customer" ? "Customer profile review" : "Manager access review"}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">
                    Edit {editForm.name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {editForm.type === "customer"
                      ? `${editForm.customerId} / ${editForm.email}`
                      : `${editForm.employeeId} / ${editForm.email}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {editForm.type === "customer" ? (
                <div className="space-y-5">
                  <section className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-950">
                        Profile and access
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Keep customer contact, login, and classification details current.
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Full Name">
                        <input
                          value={editForm.fullName}
                          onChange={(event) =>
                            updateEditForm("fullName", event.target.value)
                          }
                          className={inputClass}
                        />
                        <FieldError message={editErrors.fullName} />
                      </Field>
                      <Field label="Email ID">
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(event) =>
                            updateEditForm("email", event.target.value)
                          }
                          className={inputClass}
                        />
                        <FieldError message={editErrors.email} />
                      </Field>
                      <Field label="Date of Birth">
                        <input
                          type="date"
                          value={editForm.dob}
                          onChange={(event) => updateEditForm("dob", event.target.value)}
                          className={inputClass}
                        />
                        <FieldError message={editErrors.dob} />
                      </Field>
                      <Field label="Phone Number">
                        <input
                          value={editForm.phone}
                          onChange={(event) =>
                            updateEditForm("phone", event.target.value)
                          }
                          className={inputClass}
                        />
                        <FieldError message={editErrors.phone} />
                      </Field>
                      <Field label="Tier">
                        <select
                          value={editForm.classification}
                          onChange={(event) =>
                            updateEditForm("classification", event.target.value)
                          }
                          className={inputClass}
                        >
                          {tierRows.map((tier) => (
                            <option key={tier.key} value={tier.key}>
                              {tier.label}
                            </option>
                          ))}
                        </select>
                        <FieldError message={editErrors.classification} />
                      </Field>
                      <Field label="Account Status">
                        <select
                          value={editForm.accountStatus}
                          onChange={(event) =>
                            updateEditForm("accountStatus", event.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="blocked">Blocked</option>
                        </select>
                        <FieldError message={editErrors.accountStatus} />
                      </Field>
                      <Field label="Login Status">
                        <select
                          value={editForm.status}
                          onChange={(event) =>
                            updateEditForm("status", event.target.value)
                          }
                          className={inputClass}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="suspended">Suspended</option>
                        </select>
                        <FieldError message={editErrors.status} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Address">
                          <input
                            value={editForm.address}
                            onChange={(event) =>
                              updateEditForm("address", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-950">
                        Verified KYC and account record
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        System-issued identifiers stay fixed for audit and banking consistency.
                      </p>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ReadOnlyField label="Customer ID" value={editForm.customerId} />
                      <ReadOnlyField label="PAN Number" value={editForm.panNumber} />
                      <ReadOnlyField label="Aadhaar Number" value={editForm.aadhaarNumber} />
                      <div className="sm:col-span-2">
                        <p className="text-sm font-semibold text-slate-600">Accounts By Type</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {(editForm.accounts || []).map((account) => (
                            <div
                              key={account.accountNumber || account.accountType}
                              className="rounded-lg border border-slate-200 bg-white p-3"
                            >
                              <p className="font-bold text-slate-900">
                                {account.accountType || "Account"}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                {maskAccountNumber(account.accountNumber)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ReadOnlyField label="Employee ID" value={editForm.employeeId} />
                  <ReadOnlyField label="Assigned Region" value={DEFAULT_ASSIGNED_REGION} />
                  <ReadOnlyField label="IFSC Code" value={DEFAULT_BANK_IFSC} />
                  <ReadOnlyField label="Branch Name" value={DEFAULT_BRANCH_NAME} />
                </div>
              )}

              {editForm.type !== "customer" && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Login Status">
                  <select
                    value={editForm.status}
                    onChange={(event) => updateEditForm("status", event.target.value)}
                    className={inputClass}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                  <FieldError message={editErrors.status} />
                  </Field>
                </div>
              )}
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
                <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditForm(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
};

export default Customers;
