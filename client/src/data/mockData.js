export const BANK_NAME = "Adnate Bank";

export const overdraftPolicies = {
  gold: {
    label: "Gold",
    limit: 150000,
    payoffDays: 45,
    penaltyAmount: 2500,
    reviewCycle: "Quarterly",
    decidedBy: "Admin",
  },
  platinum: {
    label: "Platinum",
    limit: 100000,
    payoffDays: 30,
    penaltyAmount: 2000,
    reviewCycle: "Quarterly",
    decidedBy: "Admin",
  },
  silver: {
    label: "Silver",
    limit: 50000,
    payoffDays: 15,
    penaltyAmount: 1000,
    reviewCycle: "Monthly",
    decidedBy: "Admin",
  },
};


export const admins = [
  {
    id: 201,
    name: "Suchit Gupta",

    email: "suchitguta66@gmail.com",
    password: "admin123",

    role: "admin",

    employeeId: "ADMIN001",

    permissions: [
      "manage-users",
      "manage-transactions",
      "manage-managers",
      "view-analytics",
      "system-control",
    ],

    status: "active",
  },
];

export const customers = [
  {
    id: 1,
    name: "Rahul Sharma",
    email: "rahul@gmail.com",
    password: "123456",
    role: "customer",

    customerId: "CUST1001",

    accountNumber: "458212341001",
    bankName: BANK_NAME,
    ifsc: "ADNT0004521",

    accountType: "Savings",
    classification: "silver",

    balance: 120000,
    overdraftLimit: overdraftPolicies.silver.limit,
    overdraftUsed: 0,

    pendingRequests: 2,
    totalTransfers: 128,

    status: "active",
  },

  {
    id: 2,
    name: "Priya Mehta",
    email: "priya@gmail.com",
    password: "123456",
    role: "customer",

    customerId: "CUST1002",

    accountNumber: "458212341002",
    bankName: BANK_NAME,
    ifsc: "ADNT0007821",

    accountType: "Current",
    classification: "silver",

    balance: 85000,
    overdraftLimit: overdraftPolicies.silver.limit,
    overdraftUsed: 0,

    pendingRequests: 1,
    totalTransfers: 94,

    status: "active",
  },

  {
    id: 3,
    name: "Amit Verma",
    email: "amit@gmail.com",
    password: "123456",
    role: "customer",

    customerId: "CUST1003",

    accountNumber: "458212341003",
    bankName: BANK_NAME,
    ifsc: "ADNT0004512",

    accountType: "Savings",
    classification: "gold",

    balance: 250000,
    overdraftLimit: overdraftPolicies.gold.limit,
    overdraftUsed: 0,

    pendingRequests: 0,
    totalTransfers: 301,

    status: "active",
  },

  {
    id: 4,
    name: "Sneha Kapoor",
    email: "sneha@gmail.com",
    password: "123456",
    role: "customer",

    customerId: "CUST1004",

    accountNumber: "458212341004",
    bankName: BANK_NAME,
    ifsc: "ADNT0002211",

    accountType: "Salary",
    classification: "silver",

    balance: 45000,
    overdraftLimit: overdraftPolicies.silver.limit,
    overdraftUsed: 0,

    pendingRequests: 3,
    totalTransfers: 58,

    status: "active",
  },

  {
    id: 5,
    name: "Karan Malhotra",
    email: "karan@gmail.com",
    password: "123456",
    role: "customer",

    customerId: "CUST1005",

    accountNumber: "458212341005",
    bankName: BANK_NAME,
    ifsc: "ADNT0004412",

    accountType: "Savings",
    classification: "silver",

    balance: 98000,
    overdraftLimit: overdraftPolicies.silver.limit,
    overdraftUsed: 0,

    pendingRequests: 1,
    totalTransfers: 76,

    status: "active",
  },

  {
    id: 6,
    name: "Ananya Singh",
    email: "ananya@gmail.com",
    password: "123456",
    role: "customer",

    customerId: "CUST1006",

    accountNumber: "458212341006",
    bankName: BANK_NAME,
    ifsc: "ADNT0008821",

    accountType: "Current",
    classification: "platinum",

    balance: 315000,
    overdraftLimit: overdraftPolicies.platinum.limit,
    overdraftUsed: 0,

    pendingRequests: 4,
    totalTransfers: 412,

    status: "active",
  },
];

export const managers = [
  {
    id: 101,
    name: "Vikram Joshi",
    email: "manager1@gmail.com",
    password: "123456",
    role: "manager",

    employeeId: "MGR9001",

    branch: "Mumbai Main Branch",

    pendingApprovals: 12,
    approvedToday: 24,
    rejectedToday: 3,

    status: "active",
  },
];

export const transactions = [
  {
    id: "TXN1001",
    sender: "Rahul Sharma",
    receiver: "Priya Mehta",

    amount: 5000,

    status: "success",

    type: "bank-transfer",

    date: "2026-05-18",
  },

  {
    id: "TXN1002",
    sender: "Amit Verma",
    receiver: "Karan Malhotra",

    amount: 15000,

    status: "pending",

    type: "bank-transfer",

    date: "2026-05-18",
  },

  {
    id: "TXN1003",
    sender: "Sneha Kapoor",
    receiver: "Ananya Singh",

    amount: 2500,

    status: "success",

    type: "upi",

    date: "2026-05-17",
  },

  {
    id: "TXN1004",
    sender: "Rahul Sharma",
    receiver: "Electricity Board",

    amount: 4200,

    status: "success",

    type: "bill-payment",

    date: "2026-05-17",
  },

  {
    id: "TXN1005",
    sender: "Priya Mehta",
    receiver: "Netflix",

    amount: 799,

    status: "failed",

    type: "subscription",

    date: "2026-05-16",
  },
];

export const notifications = [
  {
    id: 1,
    title: "Transfer Successful",
    message: "₹5,000 transferred successfully to Priya Mehta.",
    type: "success",
    time: "2 mins ago",
  },

  {
    id: 2,
    title: "Approval Pending",
    message: "Your transfer of ₹15,000 is pending manager approval.",
    type: "warning",
    time: "10 mins ago",
  },

  {
    id: 3,
    title: "Overdraft Alert",
    message: "No overdraft has been used from your assigned limit.",
    type: "danger",
    time: "1 hour ago",
  },

  {
    id: 4,
    title: "Transfer Failed",
    message: "Transaction failed due to insufficient balance.",
    type: "error",
    time: "3 hours ago",
  },
];

export const users = [...customers, ...managers, ...admins];

export const activeCustomer = customers[0];

export const beneficiaries = customers
  .filter((customer) => customer.id !== activeCustomer.id)
  .slice(0, 3)
  .map((customer) => ({
    id: customer.id,
    name: customer.name,
    account: customer.accountNumber,
  }));

export const statementEntries = transactions.map((transaction) => ({
  id: transaction.id,
  date: transaction.date,
  detail:
    transaction.sender === activeCustomer.name
      ? `Transfer to ${transaction.receiver}`
      : `Transfer from ${transaction.sender}`,
  type: transaction.sender === activeCustomer.name ? "Debit" : "Credit",
  amount: transaction.amount,
  status: transaction.status,
}));

export const formatCurrency = (amount) =>
  `INR ${Number(amount).toLocaleString("en-IN")}`;

export const maskAccountNumber = (accountNumber) =>
  `XXXX XXXX ${String(accountNumber).slice(-4)}`;
