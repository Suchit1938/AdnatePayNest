const mongoose = require('mongoose');

const BankAccount = require('../models/BankAccount');
const Approval = require('../models/Approval');
const Tier = require('../models/Tier');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ensureBankAccountsForUser, syncCustomerAccounts } = require('../utils/customerAccounts');
const { DEFAULT_MONTHLY_OD_USES, getAccountTypeOdRule } = require('../utils/accountTypeOdPolicy');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');

const serializeTransaction = (transaction, approvalDetail = {}) => ({
  id: transaction.transactionId,
  sender: transaction.senderName,
  receiver: transaction.receiverName,
  fromAccountNumber: transaction.fromAccountNumber,
  toAccountNumber: transaction.toAccountNumber,
  amount: transaction.amount,
  status: transaction.status,
  failureReason: transaction.failureReason || approvalDetail.rejectionReason || '',
  approvalStatus: approvalDetail.status || '',
  approvalId: approvalDetail.requestId || '',
  approvalReviewedBy: approvalDetail.reviewedBy?.name || '',
  approvalReviewedAt: approvalDetail.reviewedAt || null,
  type: transaction.type,
  date: transaction.createdAt?.toISOString().slice(0, 10),
  remarks: transaction.remarks,
  createdAt: transaction.createdAt,
});

const formatMoney = (value) => `INR ${toWholeRupees(value).toLocaleString('en-IN')}`;
const maskAccount = (value) => {
  const account = String(value || '');
  if (account.length <= 4) return account;
  return `XXXX${account.slice(-4)}`;
};

const sendTransferEmail = async ({ to, subject, lines }) => {
  if (!to) return null;

  const text = [...lines, '', 'Regards,', 'Adnate PayNest'].join('\n');
  const htmlLines = lines.map((line) => `<p>${line}</p>`).join('');

  return sendEmail({
    to,
    subject,
    text,
    html: `${htmlLines}<p>Regards,<br />Adnate PayNest</p>`,
  });
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendDetailedTransferEmail = async ({
  to,
  subject,
  greetingName,
  intro,
  amountLabel,
  amount,
  details,
  balanceRows,
}) => {
  if (!to) return null;

  const detailLines = details.filter(Boolean);
  const balanceLines = balanceRows.filter(Boolean);
  const text = [
    `Hello ${greetingName},`,
    intro,
    `${amountLabel}: ${formatMoney(amount)}`,
    '',
    'Transaction details:',
    ...detailLines.map((line) => `- ${line.label}: ${line.value}`),
    '',
    'Balance tracking:',
    ...balanceLines.map((line) => `- ${line.label}: ${line.value}`),
    '',
    'Regards,',
    'Adnate PayNest',
  ].join('\n');

  const detailRows = detailLines
    .map(
      (line) => `
        <tr>
          <td style="padding:8px 10px;color:#64748b;border-bottom:1px solid #e2e8f0;">${escapeHtml(line.label)}</td>
          <td style="padding:8px 10px;color:#0f172a;font-weight:700;border-bottom:1px solid #e2e8f0;">${escapeHtml(line.value)}</td>
        </tr>`
    )
    .join('');
  const balanceHtmlRows = balanceLines
    .map(
      (line) => `
        <tr>
          <td style="padding:8px 10px;color:#64748b;border-bottom:1px solid #e2e8f0;">${escapeHtml(line.label)}</td>
          <td style="padding:8px 10px;color:#0f172a;font-weight:700;border-bottom:1px solid #e2e8f0;">${escapeHtml(line.value)}</td>
        </tr>`
    )
    .join('');

  return sendEmail({
    to,
    subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:22px;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="background:#0f172a;color:#ffffff;padding:18px 22px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">AdnatePayNest Transaction Alert</p>
            <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(subject)}</h1>
          </div>
          <div style="padding:22px;">
            <p style="margin:0 0 10px;">Hello ${escapeHtml(greetingName)},</p>
            <p style="margin:0 0 16px;color:#334155;line-height:1.6;">${escapeHtml(intro)}</p>
            <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:18px 0;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#047857;font-weight:700;">${escapeHtml(amountLabel)}</div>
              <div style="font-size:28px;line-height:1.25;color:#047857;font-weight:800;margin-top:4px;">${escapeHtml(formatMoney(amount))}</div>
            </div>
            <h2 style="font-size:16px;margin:20px 0 8px;color:#0f172a;">Transaction Details</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">${detailRows}</table>
            <h2 style="font-size:16px;margin:22px 0 8px;color:#0f172a;">Balance Tracking</h2>
            <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">${balanceHtmlRows}</table>
            <p style="margin:18px 0 0;color:#475569;line-height:1.6;">This balance view is specific to your account for this transaction.</p>
            <p style="margin:18px 0 0;">Regards,<br /><strong>Team AdnatePayNest</strong></p>
          </div>
        </div>
      </div>
    `,
  });
};

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 40;
const PDF_LINE_HEIGHT = 14;

const normalizePdfText = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const escapePdfText = (value) =>
  normalizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const pdfText = (text, x, y, size = 9, font = 'F1') =>
  `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`;

const pdfRect = (x, y, width, height) =>
  `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`;

const splitPdfCell = (value, width) => {
  const words = normalizePdfText(value).split(' ').filter(Boolean);
  const maxChars = Math.max(8, Math.floor(width / 4.8));
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const safeWord = word.length > maxChars ? word.slice(0, maxChars) : word;

    if (!line) {
      line = safeWord;
      return;
    }

    if (`${line} ${safeWord}`.length <= maxChars) {
      line = `${line} ${safeWord}`;
      return;
    }

    lines.push(line);
    line = safeWord;
  });

  if (line) lines.push(line);
  return lines.length ? lines.slice(0, 4) : [''];
};

const createPdfBuffer = (pages) => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index + 3} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  pages.forEach((content, index) => {
    const contentObject = 3 + pages.length + index;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObject} 0 R >>`
    );
  });

  pages.forEach((content) => {
    objects.push(`<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`);
  });

  const parts = ['%PDF-1.4\n'];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(parts.join(''), 'ascii'));
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(parts.join(''), 'ascii');
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => {
    parts.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  });
  parts.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return Buffer.from(parts.join(''), 'ascii');
};

const buildStatementPdf = ({
  bankName,
  statementLabel,
  statementReference,
  periodLabel,
  generatedOn,
  filter,
  rows,
}) => {
  const headers = ['Date', 'Details', 'Status', 'Debit', 'Credit', 'Balance'];
  const columnWidths = [55, 150, 60, 85, 175, 55];
  const pages = [];
  let commands = [];
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN;

  const addPage = () => {
    if (commands.length) pages.push(commands.join('\n'));
    commands = [];
    y = PDF_PAGE_HEIGHT - PDF_MARGIN;
    commands.push(pdfText(`${bankName} - ${statementLabel}`, PDF_MARGIN, y, 16, 'F2'));
    y -= 20;
    commands.push(pdfText(`Statement Ref: ${statementReference}`, PDF_MARGIN, y, 10, 'F2'));
    y -= 16;
    commands.push(pdfText(`Period: ${periodLabel} | Generated: ${generatedOn} | Filter: ${filter || 'All'}`, PDF_MARGIN, y, 9));
    y -= 24;

    let x = PDF_MARGIN;
    commands.push('0.80 0.88 1.00 RG');
    headers.forEach((header, index) => {
      commands.push(pdfRect(x, y - 14, columnWidths[index], 20));
      commands.push(pdfText(header, x + 4, y - 9, 8, 'F2'));
      x += columnWidths[index];
    });
    commands.push('0.86 0.91 0.96 RG');
    y -= 24;
  };

  addPage();

  (rows.length ? rows : [{ Date: '', Details: 'No statement entries for this period.', Debit: '', Credit: '', Balance: '' }]).forEach((row) => {
    const cellLines = headers.map((header, index) => splitPdfCell(row[header], columnWidths[index] - 8));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * PDF_LINE_HEIGHT + 8;

    if (y - rowHeight < PDF_MARGIN) {
      addPage();
    }

    let x = PDF_MARGIN;
    headers.forEach((header, index) => {
      commands.push(pdfRect(x, y - rowHeight + 5, columnWidths[index], rowHeight));
      cellLines[index].forEach((line, lineIndex) => {
        commands.push(pdfText(line || '-', x + 4, y - 10 - lineIndex * PDF_LINE_HEIGHT, 8));
      });
      x += columnWidths[index];
    });
    y -= rowHeight;
  });

  pages.push(commands.join('\n'));
  return createPdfBuffer(pages);
};

const buildSafeStatementFilename = (statementReference) =>
  `${String(statementReference || 'statement').replace(/[^a-z0-9_-]/gi, '-')}.pdf`;

const emailStatement = async (req, res) => {
  const {
    statementReference,
    statementLabel,
    periodLabel,
    generatedOn,
    filter,
    bankName = 'AdnatePayNest',
    rows = [],
  } = req.body;

  if (!req.user?.email) {
    return res.status(400).json({ message: 'Your account does not have an email address.' });
  }

  if (!statementReference || !statementLabel || !periodLabel) {
    return res.status(400).json({ message: 'Statement details are required.' });
  }

  const safeRows = Array.isArray(rows) ? rows : [];
  const statementPdf = buildStatementPdf({
    bankName,
    statementLabel,
    statementReference,
    periodLabel,
    generatedOn: generatedOn || new Date().toISOString().slice(0, 10),
    filter,
    rows: safeRows,
  });
  const delivery = await sendEmail({
    to: req.user.email,
    subject: `${statementLabel} - ${statementReference}`,
    text: [
      `Hello ${req.user.name},`,
      '',
      `Your ${statementLabel} is ready.`,
      `Statement Ref: ${statementReference}`,
      `Period: ${periodLabel}`,
      `Generated On: ${generatedOn || new Date().toISOString().slice(0, 10)}`,
      `Filter: ${filter || 'All'}`,
      '',
      'The statement PDF is attached to this email.',
      '',
      'Regards,',
      'Adnate PayNest',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
        <div style="max-width:860px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="background:#0f172a;color:#ffffff;padding:18px 22px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">${escapeHtml(bankName)}</p>
            <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(statementLabel)}</h1>
          </div>
          <div style="padding:22px;">
            <p>Hello ${escapeHtml(req.user.name)},</p>
            <p>Your statement has been generated. The PDF copy is attached to this email.</p>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0;">
              <div><strong>Statement Ref:</strong><br />${escapeHtml(statementReference)}</div>
              <div><strong>Period:</strong><br />${escapeHtml(periodLabel)}</div>
              <div><strong>Generated On:</strong><br />${escapeHtml(generatedOn || new Date().toISOString().slice(0, 10))}</div>
              <div><strong>Filter:</strong><br />${escapeHtml(filter || 'All')}</div>
            </div>
            <p style="margin-top:18px;color:#475569;">For records, keep the attached PDF safely. You can also open AdnatePayNest to download CSV or regenerate the statement.</p>
            <p>Regards,<br /><strong>Team AdnatePayNest</strong></p>
          </div>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: buildSafeStatementFilename(statementReference),
        content: statementPdf,
        contentType: 'application/pdf',
      },
    ],
  });

  if (!delivery?.sent) {
    return res.status(500).json({ message: delivery?.message || 'Unable to send statement email.' });
  }

  res.json({ message: `Statement sent to ${req.user.email}.` });
};

const toWholeRupees = (value) => Math.round(Number(value || 0));
const normalizeAccountNumber = (value) => String(value || '').trim();
const makeId = (prefix) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);
const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);
const getCurrentMonthOdCount = (bankAccount) =>
  bankAccount.odCountMonthKey === getCurrentMonthKey()
    ? toWholeRupees(bankAccount.odCountThisMonth)
    : 0;
const isCurrentMonthOdBlocked = (bankAccount) =>
  bankAccount.odCountMonthKey === getCurrentMonthKey() && Boolean(bankAccount.odBlocked);
const getTodayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const refreshMonthlyOverdraftCounter = (bankAccount) => {
  const currentMonthKey = getCurrentMonthKey();

  if (bankAccount.odCountMonthKey !== currentMonthKey) {
    bankAccount.odCountThisMonth = 0;
    bankAccount.odBlocked = false;
    bankAccount.odCountMonthKey = currentMonthKey;
  }
};

const getAccountSnapshot = (user, accountNumber) =>
  (user.accounts || []).find((account) => account.accountNumber === accountNumber) ||
  (user.account?.accountNumber === accountNumber ? user.account : null);

const syncUserAccountSnapshot = (user, bankAccount) => {
  const bankName =
    user.account?.bankName ||
    user.accounts?.[0]?.bankName ||
    process.env.BANK_NAME ||
    'Adnate Bank';
  const ifsc =
    user.account?.ifsc ||
    user.accounts?.[0]?.ifsc ||
    process.env.BANK_IFSC ||
    'ADNT0004521';
  const nextSnapshot = {
    accountNumber: bankAccount.accountNumber,
    bankName,
    ifsc,
    accountType: bankAccount.accountType,
    balance: toWholeRupees(bankAccount.walletBalance),
    transferLimit: bankAccount.transferLimit || 0,
    overdraftLimit: firstDefined(bankAccount.odLimit, user.account?.overdraftLimit, 0),
    overdraftUsed: firstDefined(bankAccount.odUsed, 0),
    odStartedAt: bankAccount.odStartedAt || null,
    odDrawdowns: bankAccount.odDrawdowns || [],
    odCountThisMonth: getCurrentMonthOdCount(bankAccount),
    odBlocked: isCurrentMonthOdBlocked(bankAccount),
  };

  user.accounts = (user.accounts || []).map((account) =>
    account.accountNumber === bankAccount.accountNumber
      ? { ...(account.toObject?.() || account), ...nextSnapshot }
      : account
  );

};

const getTransactions = async (req, res) => {
  const filter =
    req.user.role === 'customer'
      ? { $or: [{ sender: req.user._id }, { receiver: req.user._id }] }
      : {};
  const transactions = await Transaction.find(filter).sort({ createdAt: -1 });
  const reviewedApprovals = await Approval.find({
    transaction: { $in: transactions.map((transaction) => transaction._id) },
    status: { $in: ['approved', 'rejected'] },
  })
    .populate('reviewedBy', 'name')
    .select('requestId transaction status rejectionReason reviewedBy reviewedAt');
  const approvalByTransaction = reviewedApprovals.reduce((map, approval) => {
    map.set(String(approval.transaction), approval);
    return map;
  }, new Map());

  res.json({
    transactions: transactions.map((transaction) =>
      serializeTransaction(
        transaction,
        approvalByTransaction.get(String(transaction._id))
      )
    ),
  });
};

const createTransfer = async (req, res) => {
  const { beneficiaryId, amount, remarks = '', fromAccountNumber, toAccountNumber } = req.body;
  const transferAmount = toWholeRupees(amount);

  if (!beneficiaryId || !transferAmount || transferAmount < 1) {
    return res.status(400).json({ message: 'Beneficiary and amount are required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const sender = await User.findById(req.user._id).session(session);

    if (!sender) {
      throw new Error('Sender not found');
    }

    const savedBeneficiary = sender.savedBeneficiaries.id(beneficiaryId);

    if (!savedBeneficiary) {
      throw new Error('Beneficiary not found');
    }

    const receiver = await User.findById(savedBeneficiary.beneficiaryUser).session(session);

    if (!sender || !receiver || receiver.role !== 'customer') {
      throw new Error('Beneficiary not found');
    }

    if (receiver.status !== 'active') {
      throw new Error('Beneficiary is inactive and cannot receive new transfers');
    }

    await Promise.all([
      ensureBankAccountsForUser(sender, { session }),
      ensureBankAccountsForUser(receiver, { session }),
    ]);

    const senderAccountNumber = normalizeAccountNumber(
      fromAccountNumber || sender.account?.accountNumber
    );
    const requestedReceiverAccountNumber = normalizeAccountNumber(
      toAccountNumber || savedBeneficiary.accountNumber
    );
    const savedReceiverAccountNumber = normalizeAccountNumber(savedBeneficiary.accountNumber);
    const receiverAccountNumber = requestedReceiverAccountNumber;

    if (!senderAccountNumber || !receiverAccountNumber) {
      throw new Error('Sender and beneficiary accounts are required');
    }

    if (receiverAccountNumber !== savedReceiverAccountNumber) {
      throw new Error('Selected beneficiary account is not saved for this beneficiary');
    }

    const [senderBankAccount, receiverBankAccount, senderTier] = await Promise.all([
      BankAccount.findOne({
        customerId: sender.customerId,
        accountNumber: senderAccountNumber,
        accountStatus: 'active',
      }).session(session),
      BankAccount.findOne({
        customerId: receiver.customerId,
        accountNumber: receiverAccountNumber,
        accountStatus: 'active',
      }).session(session),
      Tier.findOne({ name: sender.classification }).session(session),
    ]);

    if (!senderBankAccount) {
      throw new Error('Selected sender bank account is not active or was not found');
    }

    if (!receiverBankAccount) {
      throw new Error('Selected beneficiary bank account is not active or was not found');
    }

    const senderSnapshot = getAccountSnapshot(sender, senderBankAccount.accountNumber);
    const currentBalance = toWholeRupees(senderBankAccount.walletBalance);
    const odRule = getAccountTypeOdRule(senderTier, senderBankAccount.accountType);
    const overdraftLimit = toWholeRupees(
      firstDefined(senderBankAccount.odLimit, senderSnapshot?.overdraftLimit, odRule.odLimit)
    );
    const monthlyOdUses = toWholeRupees(odRule.monthlyOdUses ?? DEFAULT_MONTHLY_OD_USES);
    const overdraftUsed = toWholeRupees(senderBankAccount.odUsed);
    const overdraftAvailable = Math.max(0, overdraftLimit - overdraftUsed);
    const overdraftNeeded = Math.max(0, transferAmount - currentBalance);
    const canUseOverdraft = overdraftNeeded > 0 && overdraftNeeded <= overdraftAvailable;

    const transferLimit = toWholeRupees(
      senderBankAccount.transferLimit || senderTier?.perTxnLimit
    );
    const dailyLimit = toWholeRupees(
      senderBankAccount.withdrawalLimit || senderTier?.dailyLimit
    );
    const { start: todayStart, end: tomorrowStart } = getTodayBounds();
    const todayTransfers = await Transaction.aggregate([
      {
        $match: {
          sender: sender._id,
          fromAccountNumber: senderBankAccount.accountNumber,
          status: 'success',
          createdAt: { $gte: todayStart, $lt: tomorrowStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session);
    const transferredToday = toWholeRupees(todayTransfers[0]?.total);
    const wouldExceedTransferLimit = transferLimit > 0 && transferAmount > transferLimit;
    const wouldExceedDailyLimit =
      dailyLimit > 0 && transferredToday + transferAmount > dailyLimit;

    if ((wouldExceedTransferLimit || wouldExceedDailyLimit) && !canUseOverdraft) {
      const assignedManager = await User.findOne({
        role: 'manager',
        status: 'active',
      })
        .sort({ createdAt: 1 })
        .session(session);

      if (!assignedManager) {
        throw new Error('No active manager is available for approval');
      }

      const transaction = await Transaction.create(
        [
          {
            transactionId: makeId('TXN'),
            sender: sender._id,
            receiver: receiver._id,
            senderName: sender.name,
            receiverName: receiver.name,
            fromAccountNumber: senderBankAccount.accountNumber,
            toAccountNumber: receiverBankAccount.accountNumber,
            amount: transferAmount,
            remarks:
              remarks ||
              `${senderBankAccount.accountNumber} to ${receiverBankAccount.accountNumber}`,
            status: 'pending',
          },
        ],
        { session }
      );

      const transferLimitRatio =
        wouldExceedTransferLimit && transferLimit > 0 ? transferAmount / transferLimit : 1;
      const dailyLimitRatio =
        wouldExceedDailyLimit && dailyLimit > 0
          ? (transferredToday + transferAmount) / dailyLimit
          : 1;
      const limitRatio = Math.max(transferLimitRatio, dailyLimitRatio);
      const approvalReasons = [
        wouldExceedTransferLimit ? 'per-transaction limit' : null,
        wouldExceedDailyLimit ? 'daily limit' : null,
      ].filter(Boolean);
      const approval = await Approval.create(
        [
          {
            requestId: makeId('APR'),
            transaction: transaction[0]._id,
            customer: sender._id,
            assignedManager: assignedManager._id,
            amount: transferAmount,
            risk: limitRatio >= 2 ? 'high' : 'medium',
          },
        ],
        { session }
      );

      sender.pendingRequests = toWholeRupees(sender.pendingRequests) + 1;
      await writeSystemLog(
        {
          action: 'approval.created',
          message: `Approval escalation ${approval[0].requestId} created for ${sender.name}'s beneficiary transfer of INR ${transferAmount.toLocaleString('en-IN')} above ${approvalReasons.join(' and ')}`,
          actor: sender._id,
          actorName: sender.name,
          entityType: 'Approval',
          entityId: approval[0].requestId,
          severity: limitRatio >= 2 ? 'danger' : 'warning',
          metadata: {
            transactionId: transaction[0].transactionId,
            amount: transferAmount,
            assignedManager: assignedManager.name,
            approvalReasons,
            transferLimit,
            dailyLimit,
            transferredToday,
            projectedDailyTotal: transferredToday + transferAmount,
          },
        },
        { session }
      );
      await sender.save({ session });
      await syncCustomerAccounts(sender, { session });
      await session.commitTransaction();

      await Promise.all([
        sendTransferEmail({
          to: assignedManager.email,
          subject: `Approval required for ${formatMoney(transferAmount)} transfer`,
          lines: [
            `Hello ${assignedManager.name},`,
            `${sender.name}'s transfer of ${formatMoney(transferAmount)} requires approval.`,
            `Approval ID: ${approval[0].requestId}`,
            `Reason: ${approvalReasons.join(' and ')}`,
          ],
        }),
        sendTransferEmail({
          to: sender.email,
          subject: 'Transfer pending approval',
          lines: [
            `Hello ${sender.name},`,
            `Your transfer of ${formatMoney(transferAmount)} to ${receiver.name} is pending manager approval.`,
            `Approval ID: ${approval[0].requestId}`,
          ],
        }),
      ]);

      return res.status(202).json({
        message: 'Transfer is pending manager approval',
        approval: {
          id: approval[0].requestId,
          status: approval[0].status,
          risk: approval[0].risk,
          amount: approval[0].amount,
          manager: assignedManager.name,
        },
        transaction: serializeTransaction(transaction[0]),
        account: sender.account,
        accounts: sender.accounts,
      });
    }

    if (overdraftNeeded > 0) {
      refreshMonthlyOverdraftCounter(senderBankAccount);
    }

    if (
      overdraftNeeded > 0 &&
      (senderBankAccount.odBlocked ||
        toWholeRupees(senderBankAccount.odCountThisMonth) >= monthlyOdUses)
    ) {
      throw new Error(`Monthly overdraft attempt limit reached for this ${senderBankAccount.accountType} account. You can use overdraft only ${monthlyOdUses} times in a month`);
    }

    if (overdraftNeeded > overdraftAvailable) {
      throw new Error('Insufficient balance and overdraft limit');
    }

    const nextOverdraftUsed = overdraftUsed + overdraftNeeded;
    const senderOpeningBalance = currentBalance;
    const receiverOpeningBalance = toWholeRupees(receiverBankAccount.walletBalance);

    senderBankAccount.walletBalance = Math.max(0, currentBalance - transferAmount);

    senderBankAccount.availableBalance = senderBankAccount.walletBalance;
    senderBankAccount.odLimit = overdraftLimit;
    senderBankAccount.odUsed = nextOverdraftUsed;

    if (overdraftNeeded > 0) {
      const usedAt = new Date();
      senderBankAccount.odStartedAt = senderBankAccount.odStartedAt || usedAt;
      senderBankAccount.odDrawdowns = [
        ...(senderBankAccount.odDrawdowns || []),
        { amount: overdraftNeeded, usedAt },
      ];
      senderBankAccount.odCountThisMonth = toWholeRupees(senderBankAccount.odCountThisMonth) + 1;
      senderBankAccount.odCountMonthKey = getCurrentMonthKey();
      senderBankAccount.odBlocked = senderBankAccount.odCountThisMonth >= monthlyOdUses;
    }

    receiverBankAccount.walletBalance = receiverOpeningBalance + transferAmount;

    receiverBankAccount.availableBalance =
      toWholeRupees(receiverBankAccount.availableBalance) + transferAmount;
    sender.totalTransfers += 1;

    syncUserAccountSnapshot(sender, senderBankAccount);
    syncUserAccountSnapshot(receiver, receiverBankAccount);

    await Promise.all([
      senderBankAccount.save({ session }),
      receiverBankAccount.save({ session }),
    ]);
    await sender.save({ session });
    await receiver.save({ session });

    const transaction = await Transaction.create(
      [
        {
          transactionId: `TXN${Date.now()}`,
          sender: sender._id,
          receiver: receiver._id,
          senderName: sender.name,
          receiverName: receiver.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
          amount: transferAmount,
          remarks:
            remarks ||
            `${senderBankAccount.accountNumber} to ${receiverBankAccount.accountNumber}`,
          status: 'success',
        },
      ],
      { session }
    );

    await writeSystemLog(
      {
        action: 'transfer.completed',
        message: `Transfer ${transaction[0].transactionId} completed from ${sender.name} to ${receiver.name}`,
        actor: sender._id,
        actorName: sender.name,
        entityType: 'Transaction',
        entityId: transaction[0].transactionId,
        severity: 'success',
        metadata: {
          amount: transferAmount,
          customerName: sender.name,
          receiverName: receiver.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
        },
      },
      { session }
    );

    if (overdraftNeeded > 0 && senderBankAccount.odCountThisMonth >= 3) {
      await writeSystemLog(
        {
          action: 'overdraft.third_attempt',
          message: `${sender.name} has used overdraft ${senderBankAccount.odCountThisMonth} times this month on ${senderBankAccount.accountType} account. Monthly OD usage is now blocked until next month.`,
          actor: sender._id,
          actorName: sender.name,
          entityType: 'Transaction',
          entityId: transaction[0].transactionId,
          severity: 'warning',
          metadata: {
          customerId: sender.customerId,
          customerName: sender.name,
          amount: transferAmount,
          overdraftUsed: nextOverdraftUsed,
            accountType: senderBankAccount.accountType,
            accountNumber: senderBankAccount.accountNumber,
            odCountThisMonth: senderBankAccount.odCountThisMonth,
          },
        },
        { session }
      );
    } else if (overdraftNeeded > 0) {
      await writeSystemLog(
        {
          action: 'overdraft.used',
          message: `${sender.name} used ${formatMoney(overdraftNeeded)} overdraft from ${senderBankAccount.accountType} account for transfer ${transaction[0].transactionId}. OD usage count this month: ${senderBankAccount.odCountThisMonth}.`,
          actor: sender._id,
          actorName: sender.name,
          entityType: 'Transaction',
          entityId: transaction[0].transactionId,
          severity: 'warning',
          metadata: {
            customerId: sender.customerId,
            customerName: sender.name,
            amount: transferAmount,
            overdraftUsed: nextOverdraftUsed,
            overdraftNeeded,
            accountType: senderBankAccount.accountType,
            accountNumber: senderBankAccount.accountNumber,
            odCountThisMonth: senderBankAccount.odCountThisMonth,
            source: 'transfer',
          },
        },
        { session }
      );
    }

    await syncCustomerAccounts(sender, { session });

    await session.commitTransaction();

    await Promise.all([
      sendDetailedTransferEmail({
        to: sender.email,
        subject: 'Transfer completed',
        greetingName: sender.name,
        intro: `Your transfer to ${receiver.name} has been completed successfully.`,
        amountLabel: 'Amount Debited',
        amount: transferAmount,
        details: [
          { label: 'Transaction ID', value: transaction[0].transactionId },
          { label: 'Receiver', value: receiver.name },
          { label: 'From account', value: maskAccount(senderBankAccount.accountNumber) },
          { label: 'To account', value: maskAccount(receiverBankAccount.accountNumber) },
          { label: 'Remarks', value: transaction[0].remarks || 'Bank transfer' },
        ],
        balanceRows: [
          { label: 'Opening wallet balance', value: formatMoney(senderOpeningBalance) },
          { label: 'Amount debited', value: `- ${formatMoney(transferAmount)}` },
          overdraftNeeded > 0
            ? { label: 'Overdraft used in this transfer', value: formatMoney(overdraftNeeded) }
            : null,
          { label: 'Closing wallet balance', value: formatMoney(senderBankAccount.walletBalance) },
          { label: 'Total overdraft outstanding', value: formatMoney(senderBankAccount.odUsed) },
        ],
      }),
      sendDetailedTransferEmail({
        to: receiver.email,
        subject: 'Amount credited to your account',
        greetingName: receiver.name,
        intro: `You have received a credit from ${sender.name}.`,
        amountLabel: 'Amount Credited',
        amount: transferAmount,
        details: [
          { label: 'Transaction ID', value: transaction[0].transactionId },
          { label: 'Sender', value: sender.name },
          { label: 'From account', value: maskAccount(senderBankAccount.accountNumber) },
          { label: 'Credited account', value: maskAccount(receiverBankAccount.accountNumber) },
          { label: 'Remarks', value: transaction[0].remarks || 'Bank transfer' },
        ],
        balanceRows: [
          { label: 'Opening wallet balance', value: formatMoney(receiverOpeningBalance) },
          { label: 'Amount credited', value: `+ ${formatMoney(transferAmount)}` },
          { label: 'Closing wallet balance', value: formatMoney(receiverBankAccount.walletBalance) },
        ],
      }),
      overdraftNeeded > 0 && senderBankAccount.odCountThisMonth >= 3
        ? sendTransferEmail({
          to: sender.email,
          subject: 'Overdraft usage limit reached',
          lines: [
            `Hello ${sender.name},`,
            `Your ${senderBankAccount.accountType} account monthly overdraft usage count has reached ${senderBankAccount.odCountThisMonth}.`,
            'Overdraft usage for this account is now blocked until next month.',
          ],
        })
        : null,
    ].filter(Boolean));

    res.status(201).json({
      message: 'Transfer completed',
      transaction: serializeTransaction(transaction[0]),
      balance: senderBankAccount.walletBalance,
      account: sender.account,
      accounts: sender.accounts,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const createOwnAccountTransfer = async (req, res) => {
  const { amount, remarks = '', fromAccountNumber, toAccountNumber } = req.body;
  const transferAmount = toWholeRupees(amount);
  const senderAccountNumber = normalizeAccountNumber(fromAccountNumber);
  const receiverAccountNumber = normalizeAccountNumber(toAccountNumber);

  if (!senderAccountNumber || !receiverAccountNumber || !transferAmount || transferAmount < 1) {
    return res.status(400).json({ message: 'From account, to account, and amount are required' });
  }

  if (senderAccountNumber === receiverAccountNumber) {
    return res.status(400).json({ message: 'From and to accounts cannot be the same' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const customer = await User.findById(req.user._id).session(session);

    if (!customer || customer.role !== 'customer') {
      throw new Error('Customer not found');
    }

    await ensureBankAccountsForUser(customer, { session });

    const [senderBankAccount, receiverBankAccount] = await Promise.all([
      BankAccount.findOne({
        customerId: customer.customerId,
        accountNumber: senderAccountNumber,
        accountStatus: 'active',
      }).session(session),
      BankAccount.findOne({
        customerId: customer.customerId,
        accountNumber: receiverAccountNumber,
        accountStatus: 'active',
      }).session(session),
    ]);

    if (!senderBankAccount) {
      throw new Error('Selected from account is not active or was not found');
    }

    if (!receiverBankAccount) {
      throw new Error('Selected to account is not active or was not found');
    }

    const currentBalance = toWholeRupees(senderBankAccount.walletBalance);

    if (transferAmount > currentBalance) {
      throw new Error('Insufficient balance. Overdraft is not allowed for own account transfers');
    }

    senderBankAccount.walletBalance = currentBalance - transferAmount;
    senderBankAccount.availableBalance = senderBankAccount.walletBalance;
    receiverBankAccount.walletBalance =
      toWholeRupees(receiverBankAccount.walletBalance) + transferAmount;
    receiverBankAccount.availableBalance = receiverBankAccount.walletBalance;
    customer.totalTransfers = toWholeRupees(customer.totalTransfers) + 1;

    syncUserAccountSnapshot(customer, senderBankAccount);
    syncUserAccountSnapshot(customer, receiverBankAccount);

    await senderBankAccount.save({ session });
    await receiverBankAccount.save({ session });
    await customer.save({ session });

    const transaction = await Transaction.create(
      [
        {
          transactionId: makeId('OWN'),
          sender: customer._id,
          receiver: customer._id,
          senderName: customer.name,
          receiverName: customer.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
          amount: transferAmount,
          remarks:
            remarks ||
            `Own account transfer from ${senderBankAccount.accountType} to ${receiverBankAccount.accountType}`,
          status: 'success',
          type: 'own-account',
        },
      ],
      { session }
    );

    await writeSystemLog(
      {
        action: 'transfer.own_account.completed',
        message: `Own account transfer ${transaction[0].transactionId} completed for ${customer.name}`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Transaction',
        entityId: transaction[0].transactionId,
        severity: 'success',
        metadata: {
          amount: transferAmount,
          customerName: customer.name,
          fromAccountNumber: senderBankAccount.accountNumber,
          toAccountNumber: receiverBankAccount.accountNumber,
        },
      },
      { session }
    );

    await syncCustomerAccounts(customer, { session });

    await session.commitTransaction();

    await sendTransferEmail({
      to: customer.email,
      subject: 'Own account transfer completed',
      lines: [
        `Hello ${customer.name},`,
        `Your own account transfer of ${formatMoney(transferAmount)} was completed successfully.`,
        `Transaction ID: ${transaction[0].transactionId}`,
        `From account: ${maskAccount(senderBankAccount.accountNumber)}`,
        `To account: ${maskAccount(receiverBankAccount.accountNumber)}`,
      ],
    });

    res.status(201).json({
      message: 'Own account transfer completed',
      transaction: serializeTransaction(transaction[0]),
      balance: senderBankAccount.walletBalance,
      account: customer.account,
      accounts: customer.accounts,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = { emailStatement, getTransactions, createOwnAccountTransfer, createTransfer };
