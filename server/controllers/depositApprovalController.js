const Counter = require('../models/Counter');
const BankAccount = require('../models/BankAccount');
const DepositApprovalRequest = require('../models/DepositApprovalRequest');
const FixedDeposit = require('../models/FixedDeposit');
const RecurringDeposit = require('../models/RecurringDeposit');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser, syncCustomerAccounts, toWholeRupees } = require('../utils/customerAccounts');
const { writeSystemLog } = require('../utils/systemLog');

const toNumber = (value) => Number(value || 0);

const addMonths = (value, months) => {
  const date = new Date(value || new Date());
  date.setMonth(date.getMonth() + Number(months || 0));
  return date;
};

const getNextFdNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'fixedDeposit' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear().toString().slice(-2);
  return `FD-${year}${String(counter.value).padStart(5, '0')}`;
};

const getNextRdNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { key: 'recurringDeposit' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear().toString().slice(-2);
  return `RD-${year}${String(counter.value).padStart(5, '0')}`;
};

const serializeRequest = (request) => ({
  id: request.requestId,
  requestId: request.requestId,
  customer: request.customer,
  customerName: request.customerName,
  customerId: request.customerId,
  productType: request.productType,
  actionType: request.actionType,
  depositId: request.depositRef,
  depositNumber: request.depositNumber,
  linkedAccountNumber: request.linkedAccountNumber,
  amount: request.amount,
  payload: request.payload || {},
  calculation: request.calculation || {},
  status: request.status,
  managerNote: request.managerNote,
  reviewedBy: request.reviewedBy,
  reviewedAt: request.reviewedAt,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

const findCustomerPaymentAccount = async (customer, accountNumber, session) => {
  await ensureBankAccountsForUser(customer, { session });

  const query = {
    customerId: customer.customerId,
    accountStatus: 'active',
  };

  if (accountNumber) {
    query.accountNumber = String(accountNumber).trim();
  }

  return BankAccount.findOne(query).sort({ createdAt: 1 }).session(session);
};

const calculateRdAccumulatedValue = (rd, paidCount = rd.installmentsPaid) => {
  const installment = toNumber(rd.monthlyInstallmentAmount);
  const monthlyRate = toNumber(rd.interestRate) / 1200;

  if (paidCount <= 0) return 0;
  if (monthlyRate <= 0) return Math.round(installment * paidCount);

  return Math.round(installment * (((1 + monthlyRate) ** paidCount - 1) / monthlyRate));
};

const getDepositApprovalRequests = async (req, res) => {
  const query = req.user.role === 'customer' ? { customer: req.user._id } : {};
  const requests = await DepositApprovalRequest.find(query)
    .sort({ createdAt: -1 })
    .populate('reviewedBy', 'name');

  res.json({ requests: requests.map(serializeRequest) });
};

const approveFdCreate = async ({ request, customer, manager, session }) => {
  const payload = request.payload || {};
  const calculation = request.calculation || {};
  const paymentAccount = await findCustomerPaymentAccount(customer, payload.linkedAccountNumber, session);
  const depositAmount = Math.round(toNumber(payload.depositAmount));

  if (!paymentAccount) throw new Error('Linked account not found');
  if (toWholeRupees(paymentAccount.walletBalance) < depositAmount) {
    throw new Error('Insufficient balance to approve FD creation');
  }

  paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) - depositAmount;
  paymentAccount.availableBalance = paymentAccount.walletBalance;
  await paymentAccount.save({ session });

  const [fixedDeposit] = await FixedDeposit.create(
    [
      {
        fdNumber: await getNextFdNumber(),
        customer: customer._id,
        customerName: customer.name,
        customerId: customer.customerId,
        bankName: payload.bankName || 'Adnate Bank',
        linkedAccountNumber: paymentAccount.accountNumber,
        depositAmount,
        interestRate: toNumber(payload.interestRate),
        tenureMonths: Math.round(toNumber(payload.tenureMonths)),
        startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
        payoutType: payload.payoutType || 'cumulative',
        maturityDate: calculation.maturityDate,
        maturityAmount: Math.round(toNumber(calculation.maturityAmount)),
        interestEarned: Math.round(toNumber(calculation.interestEarned)),
        nomineeName: payload.nomineeName,
        notes: payload.notes,
        createdBy: manager._id,
      },
    ],
    { session }
  );

  await Transaction.create(
    [
      {
        transactionId: `FDPAY${Date.now()}`,
        sender: customer._id,
        senderName: customer.name,
        receiverName: 'Adnate Bank',
        receiverType: 'bank',
        fromAccountNumber: paymentAccount.accountNumber,
        toAccountNumber: fixedDeposit.fdNumber,
        amount: depositAmount,
        remarks: `FD approved and created ${fixedDeposit.fdNumber}`,
        status: 'success',
        type: 'fd-creation',
        category: 'investment',
        businessRefType: 'FixedDeposit',
        businessRefId: fixedDeposit.fdNumber,
        displayTitle: `FD ${fixedDeposit.fdNumber}`,
        displaySubtitle: 'Fixed deposit amount debited after manager approval',
      },
    ],
    { session }
  );

  await syncCustomerAccounts(customer, { session });

  return {
    depositNumber: fixedDeposit.fdNumber,
    depositId: fixedDeposit._id,
  };
};

const approveRdCreate = async ({ request, customer, manager, session }) => {
  const payload = request.payload || {};
  const calculation = request.calculation || {};
  const paymentAccount = await findCustomerPaymentAccount(customer, payload.linkedAccountNumber, session);
  const installment = Math.round(toNumber(payload.monthlyInstallmentAmount));
  const startDate = payload.startDate ? new Date(payload.startDate) : new Date();

  if (!paymentAccount) throw new Error('Linked account not found');
  if (toWholeRupees(paymentAccount.walletBalance) < installment) {
    throw new Error('Insufficient balance to approve RD creation');
  }

  paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) - installment;
  paymentAccount.availableBalance = paymentAccount.walletBalance;
  await paymentAccount.save({ session });

  const [rd] = await RecurringDeposit.create(
    [
      {
        rdNumber: await getNextRdNumber(),
        customer: customer._id,
        customerName: customer.name,
        customerId: customer.customerId,
        linkedAccountNumber: paymentAccount.accountNumber,
        monthlyInstallmentAmount: installment,
        interestRate: toNumber(payload.interestRate),
        tenureMonths: Math.round(toNumber(payload.tenureMonths)),
        startDate,
        maturityDate: calculation.maturityDate,
        totalInvestment: Math.round(toNumber(calculation.totalInvestment)),
        maturityAmount: Math.round(toNumber(calculation.maturityAmount)),
        interestEarned: Math.round(toNumber(calculation.interestEarned)),
        accumulatedValue: installment,
        installmentsPaid: 1,
        installments: [
          {
            installmentNumber: 1,
            amount: installment,
            status: 'paid',
            dueDate: startDate,
            paidAt: new Date(),
            remarks: 'First installment debited on manager approval.',
          },
        ],
        createdBy: manager._id,
      },
    ],
    { session }
  );

  rd.accumulatedValue = calculateRdAccumulatedValue(rd, 1);
  await rd.save({ session });

  await Transaction.create(
    [
      {
        transactionId: `RDPAY${Date.now()}`,
        sender: customer._id,
        senderName: customer.name,
        receiverName: 'Adnate Bank',
        receiverType: 'bank',
        fromAccountNumber: paymentAccount.accountNumber,
        toAccountNumber: rd.rdNumber,
        amount: installment,
        remarks: `RD approved and first installment debited for ${rd.rdNumber}`,
        status: 'success',
        type: 'rd-installment',
        category: 'investment',
        businessRefType: 'RecurringDeposit',
        businessRefId: rd.rdNumber,
        displayTitle: 'RD first installment',
        displaySubtitle: `First installment debited for ${rd.rdNumber}`,
      },
    ],
    { session }
  );

  await syncCustomerAccounts(customer, { session });

  return {
    depositNumber: rd.rdNumber,
    depositId: rd._id,
  };
};

const approveFdPrematureWithdrawal = async ({ request, customer, session }) => {
  const fd = await FixedDeposit.findOne({
    _id: request.depositRef,
    customer: customer._id,
  }).session(session);
  const calculation = request.calculation || {};

  if (!fd) throw new Error('Fixed deposit not found');
  if (fd.status !== 'active') throw new Error('Only active FDs can be withdrawn prematurely');

  const paymentAccount = await findCustomerPaymentAccount(customer, fd.linkedAccountNumber, session);
  if (!paymentAccount) throw new Error('Linked account not found');

  const payoutAmount = Math.round(toNumber(calculation.payoutAmount));
  paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) + payoutAmount;
  paymentAccount.availableBalance = paymentAccount.walletBalance;
  await paymentAccount.save({ session });

  fd.status = 'closed';
  fd.closedAt = new Date();
  await fd.save({ session });

  await Transaction.create(
    [
      {
        transactionId: `FDWD${Date.now()}`,
        sender: customer._id,
        senderName: 'Adnate Bank',
        receiver: customer._id,
        receiverName: customer.name,
        fromAccountNumber: fd.fdNumber,
        toAccountNumber: paymentAccount.accountNumber,
        amount: payoutAmount,
        remarks: `FD premature withdrawal approved ${fd.fdNumber}`,
        status: 'success',
        type: 'fd-premature-withdrawal',
        category: 'investment',
        businessRefType: 'FixedDeposit',
        businessRefId: fd.fdNumber,
        displayTitle: `FD withdrawal ${fd.fdNumber}`,
        displaySubtitle: 'Premature withdrawal approved by manager',
      },
    ],
    { session }
  );

  await syncCustomerAccounts(customer, { session });

  return {
    depositNumber: fd.fdNumber,
    depositId: fd._id,
  };
};

const approveRdPrematureWithdrawal = async ({ request, customer, session }) => {
  const rd = await RecurringDeposit.findOne({
    _id: request.depositRef,
    customer: customer._id,
  }).session(session);
  const calculation = request.calculation || {};

  if (!rd) throw new Error('Recurring deposit not found');
  if (rd.status !== 'active') throw new Error('Only active RDs can be withdrawn prematurely');

  const paymentAccount = await findCustomerPaymentAccount(customer, rd.linkedAccountNumber, session);
  if (!paymentAccount) throw new Error('Linked account not found');

  const payoutAmount = Math.round(toNumber(calculation.payoutAmount));
  const penaltyAmount = Math.round(toNumber(calculation.penaltyAmount));
  paymentAccount.walletBalance = toWholeRupees(paymentAccount.walletBalance) + payoutAmount;
  paymentAccount.availableBalance = paymentAccount.walletBalance;
  await paymentAccount.save({ session });

  rd.status = 'closed';
  rd.closedAt = new Date();
  rd.accumulatedValue = Math.round(toNumber(calculation.accumulatedAmount));
  rd.penaltyAccrued += penaltyAmount;
  await rd.save({ session });

  await Transaction.create(
    [
      {
        transactionId: `RDWD${Date.now()}`,
        sender: customer._id,
        senderName: 'Adnate Bank',
        receiver: customer._id,
        receiverName: customer.name,
        fromAccountNumber: rd.rdNumber,
        toAccountNumber: paymentAccount.accountNumber,
        amount: payoutAmount,
        remarks: `RD premature withdrawal approved ${rd.rdNumber}`,
        status: 'success',
        type: 'rd-premature-withdrawal',
        category: 'investment',
        businessRefType: 'RecurringDeposit',
        businessRefId: rd.rdNumber,
        displayTitle: `RD withdrawal ${rd.rdNumber}`,
        displaySubtitle: 'Premature withdrawal approved by manager',
      },
    ],
    { session }
  );

  await syncCustomerAccounts(customer, { session });

  return {
    depositNumber: rd.rdNumber,
    depositId: rd._id,
  };
};

const decideDepositApprovalRequest = async (req, res) => {
  const { status, managerNote = '' } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Approval status must be approved or rejected' });
  }

  const session = await DepositApprovalRequest.startSession();

  try {
    let responsePayload;

    await session.withTransaction(async () => {
      const request = await DepositApprovalRequest.findOne({
        requestId: req.params.id,
      }).session(session);

      if (!request) throw new Error('Deposit approval request not found');
      if (request.status !== 'pending') throw new Error('This deposit request has already been reviewed');

      const customer = await User.findById(request.customer).session(session);
      if (!customer) throw new Error('Customer not found');

      let executionResult = {};

      if (status === 'approved') {
        if (request.productType === 'fd' && request.actionType === 'create') {
          executionResult = await approveFdCreate({ request, customer, manager: req.user, session });
        } else if (request.productType === 'rd' && request.actionType === 'create') {
          executionResult = await approveRdCreate({ request, customer, manager: req.user, session });
        } else if (request.productType === 'fd' && request.actionType === 'premature_withdrawal') {
          executionResult = await approveFdPrematureWithdrawal({ request, customer, session });
        } else if (request.productType === 'rd' && request.actionType === 'premature_withdrawal') {
          executionResult = await approveRdPrematureWithdrawal({ request, customer, session });
        }
      }

      request.status = status;
      request.managerNote = String(managerNote || '').trim();
      request.reviewedBy = req.user._id;
      request.reviewedAt = new Date();
      if (executionResult.depositNumber) {
        request.depositNumber = executionResult.depositNumber;
      }
      if (executionResult.depositId) {
        request.depositRef = executionResult.depositId;
        request.depositModel = request.productType === 'fd' ? 'FixedDeposit' : 'RecurringDeposit';
      }
      await request.save({ session });

      await writeSystemLog(
        {
          action: `deposit.${request.productType}.${request.actionType}.${status}.manager`,
          message: `${req.user.name} ${status} ${request.productType.toUpperCase()} ${request.actionType.replace(/_/g, ' ')} request ${request.requestId}.`,
          actor: req.user._id,
          actorName: req.user.name,
          recipient: customer._id,
          entityType: 'DepositApprovalRequest',
          entityId: request.requestId,
          severity: status === 'approved' ? 'success' : 'warning',
          metadata: {
            productType: request.productType,
            actionType: request.actionType,
            depositNumber: request.depositNumber,
            amount: request.amount,
            managerNote: request.managerNote,
          },
        },
        { session }
      );

      responsePayload = {
        message: `Deposit request ${status}.`,
        request: serializeRequest(request),
      };
    });

    res.json(responsePayload);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to review deposit request' });
  } finally {
    session.endSession();
  }
};

module.exports = {
  decideDepositApprovalRequest,
  getDepositApprovalRequests,
};
