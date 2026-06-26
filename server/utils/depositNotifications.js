const User = require('../models/User');
const { sendEmail } = require('./email');
const { writeSystemLog } = require('./systemLog');

const productName = (productType) => String(productType || '').toUpperCase();

const actionName = (actionType) =>
  actionType === 'premature_withdrawal' ? 'premature withdrawal' : 'opening';

const getAmountMetadata = (amount) => ({ amount: Math.round(Number(amount || 0)) });

const formatMoney = (amount) =>
  `Rs. ${Math.round(Number(amount || 0)).toLocaleString('en-IN')}`;

const getDepositEmailContext = (request = {}) => {
  const product = productName(request.productType);
  const action = actionName(request.actionType);
  const requestId = request.requestId || request.id || '';
  const depositNumber = request.depositNumber || request.payload?.fdNumber || request.payload?.rdNumber || '';
  const amountLabel =
    request.actionType === 'create'
      ? request.productType === 'rd'
        ? 'Monthly installment'
        : 'Deposit amount'
      : 'Estimated payout';

  return {
    product,
    action,
    requestId,
    depositNumber,
    amountLabel,
    amount: Math.round(Number(request.amount || 0)),
    tenureMonths: request.payload?.tenureMonths,
    managerNote: request.managerNote,
  };
};

const sendDepositRequestEmail = async ({ customer, request }) => {
  if (!customer?.email) {
    return { sent: false, message: 'Customer email is not available.' };
  }

  const context = getDepositEmailContext(request);
  const subject = `${context.product} ${context.action} request submitted`;
  const lines = [
    `Dear ${customer.name || 'Customer'},`,
    `Your ${context.product} ${context.action} request ${context.requestId} has been submitted for manager approval.`,
    `${context.amountLabel}: ${formatMoney(context.amount)}`,
    context.tenureMonths ? `Tenure: ${context.tenureMonths} months` : '',
    'You will be notified after the manager reviews the request.',
  ].filter(Boolean);

  return sendEmail({
    to: customer.email,
    subject,
    text: lines.join('\n'),
    html: `
      <p>Dear <strong>${customer.name || 'Customer'}</strong>,</p>
      <p>Your <strong>${context.product} ${context.action}</strong> request <strong>${context.requestId}</strong> has been submitted for manager approval.</p>
      <p><strong>${context.amountLabel}:</strong> ${formatMoney(context.amount)}</p>
      ${context.tenureMonths ? `<p><strong>Tenure:</strong> ${context.tenureMonths} months</p>` : ''}
      <p>You will be notified after the manager reviews the request.</p>
    `,
  });
};

const sendDepositDecisionEmail = async ({ customer, manager, request, status }) => {
  if (!customer?.email) {
    return { sent: false, message: 'Customer email is not available.' };
  }

  const context = getDepositEmailContext(request);
  const approved = status === 'approved';
  const decision = approved ? 'approved' : 'rejected';
  const subject = `${context.product} ${context.action} request ${decision}`;
  const depositLine = context.depositNumber
    ? `${context.product} number: ${context.depositNumber}`
    : '';
  const noteLine = !approved && context.managerNote ? `Manager note: ${context.managerNote}` : '';
  const approvalLine =
    request.actionType === 'create'
      ? `Your ${context.product} has ${approved ? 'been created' : 'not been created'}.`
      : `Your ${context.product} premature withdrawal has ${approved ? 'been processed' : 'not been processed'}.`;
  const lines = [
    `Dear ${customer.name || 'Customer'},`,
    `Your ${context.product} ${context.action} request ${context.requestId} was ${decision} by ${manager?.name || 'the manager'}.`,
    approvalLine,
    depositLine,
    `${context.amountLabel}: ${formatMoney(context.amount)}`,
    noteLine,
  ].filter(Boolean);

  return sendEmail({
    to: customer.email,
    subject,
    text: lines.join('\n'),
    html: `
      <p>Dear <strong>${customer.name || 'Customer'}</strong>,</p>
      <p>Your <strong>${context.product} ${context.action}</strong> request <strong>${context.requestId}</strong> was <strong>${decision}</strong> by ${manager?.name || 'the manager'}.</p>
      <p>${approvalLine}</p>
      ${depositLine ? `<p><strong>${context.product} number:</strong> ${context.depositNumber}</p>` : ''}
      <p><strong>${context.amountLabel}:</strong> ${formatMoney(context.amount)}</p>
      ${noteLine ? `<p><strong>Manager note:</strong> ${context.managerNote}</p>` : ''}
    `,
  });
};

const writeDepositRequestNotifications = async ({
  customer,
  request,
  productType,
  actionType,
  amount,
  depositNumber = '',
  session,
}) => {
  const product = productName(productType);
  const action = actionName(actionType);
  const baseAction = `deposit.${productType}.${actionType}.requested`;
  const metadata = {
    productType,
    actionType,
    customerId: customer.customerId,
    customerName: customer.name,
    depositNumber,
    requestId: request.requestId,
    ...getAmountMetadata(amount),
  };

  await writeSystemLog(
    {
      action: `${baseAction}.customer`,
      message: `Your ${product} ${action} request ${request.requestId} was submitted for manager approval.`,
      actor: customer._id,
      actorName: customer.name,
      recipient: customer._id,
      entityType: 'DepositApprovalRequest',
      entityId: request.requestId,
      severity: 'info',
      metadata,
    },
    { session }
  );

  const managers = await User.find({ role: 'manager', status: 'active' })
    .select('name')
    .session(session);

  for (const manager of managers) {
    await writeSystemLog(
      {
        action: `${baseAction}.manager`,
        message: `${customer.name} requested ${product} ${action} approval for ${request.requestId}.`,
        actor: customer._id,
        actorName: customer.name,
        recipient: manager._id,
        entityType: 'DepositApprovalRequest',
        entityId: request.requestId,
        severity: 'warning',
        metadata,
      },
      { session }
    );
  }

  await writeSystemLog(
    {
      action: `${baseAction}.admin`,
      message: `${customer.name} submitted ${product} ${action} request ${request.requestId}.`,
      actor: customer._id,
      actorName: customer.name,
      entityType: 'DepositApprovalRequest',
      entityId: request.requestId,
      severity: 'info',
      metadata,
    },
    { session }
  );
};

const writeDepositDecisionNotifications = async ({
  customer,
  manager,
  request,
  status,
  session,
}) => {
  const product = productName(request.productType);
  const action = actionName(request.actionType);
  const baseAction = `deposit.${request.productType}.${request.actionType}.${status}`;
  const metadata = {
    productType: request.productType,
    actionType: request.actionType,
    customerId: customer.customerId,
    customerName: customer.name,
    depositNumber: request.depositNumber,
    requestId: request.requestId,
    managerNote: request.managerNote,
    ...getAmountMetadata(request.amount),
  };
  const severity = status === 'approved' ? 'success' : 'warning';

  await writeSystemLog(
    {
      action: `${baseAction}.customer`,
      message: `Your ${product} ${action} request ${request.requestId} was ${status} by ${manager.name}.`,
      actor: manager._id,
      actorName: manager.name,
      recipient: customer._id,
      entityType: 'DepositApprovalRequest',
      entityId: request.requestId,
      severity,
      metadata,
    },
    { session }
  );

  await writeSystemLog(
    {
      action: `${baseAction}.manager`,
      message: `${manager.name} ${status} ${customer.name}'s ${product} ${action} request ${request.requestId}.`,
      actor: manager._id,
      actorName: manager.name,
      recipient: manager._id,
      entityType: 'DepositApprovalRequest',
      entityId: request.requestId,
      severity,
      metadata,
    },
    { session }
  );

  await writeSystemLog(
    {
      action: `${baseAction}.admin`,
      message: `${manager.name} ${status} ${customer.name}'s ${product} ${action} request ${request.requestId}.`,
      actor: manager._id,
      actorName: manager.name,
      entityType: 'DepositApprovalRequest',
      entityId: request.requestId,
      severity,
      metadata,
    },
    { session }
  );
};

module.exports = {
  sendDepositDecisionEmail,
  sendDepositRequestEmail,
  writeDepositDecisionNotifications,
  writeDepositRequestNotifications,
};
