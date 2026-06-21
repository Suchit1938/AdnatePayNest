const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');

const BankAccount = require('../models/BankAccount');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { getBusinessRuleConfig } = require('./businessRuleController');
const {
  buildAmortizationSchedule,
  calculateEligibility,
  calculateEmi,
} = require('../utils/loanCalculator');
const { getLoanTypeRule, normalizeLoanRules } = require('../utils/loanRules');
const { syncCustomerAccounts } = require('../utils/customerAccounts');
const { sendEmail } = require('../utils/email');
const { writeSystemLog } = require('../utils/systemLog');
const {
  SETTLEMENT_ACCOUNT_NAME,
  SETTLEMENT_ACCOUNT_NUMBER,
  creditBankSettlement,
  debitBankSettlement,
} = require('../utils/bankSettlementAccount');

const toNumber = (value) => Number(value || 0);
const money = (value) => `₹ ${Math.round(toNumber(value)).toLocaleString('en-IN')}`;
const MISSED_EMI_FIXED_PENALTY = 500;
const MISSED_EMI_PENALTY_RATE = 0.02;
const FORECLOSURE_FEE_RATE = 0.02;
const ACTIVE_LOAN_STATUSES = ['approved', 'disbursed'];
const EMI_GRACE_PERIOD_DAYS = 5;
const SANCTION_LETTER_DIR = path.join(__dirname, '..', 'uploads', 'sanction-letters');
const LOAN_AGREEMENT_DIR = path.join(__dirname, '..', 'uploads', 'loan-agreements');
const REPAYMENT_SCHEDULE_DIR = path.join(__dirname, '..', 'uploads', 'repayment-schedules');

const calculateMissedEmiPenalty = (emiAmount) =>
  Math.round(Math.max(MISSED_EMI_FIXED_PENALTY, toNumber(emiAmount) * MISSED_EMI_PENALTY_RATE));

const calculateForeclosureFee = (outstandingPrincipal) =>
  Math.round(Math.max(0, toNumber(outstandingPrincipal) * FORECLOSURE_FEE_RATE));

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const isEmiGracePeriodActive = (emiRow, now = new Date()) =>
  emiRow?.dueDate && now <= addDays(emiRow.dueDate, EMI_GRACE_PERIOD_DAYS);

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    : 'Not set';

const buildReducedTenureSchedule = ({
  principal,
  annualInterestRate,
  emiAmount,
  startDate = new Date(),
  startingEmiNumber = 1,
}) => {
  const rows = [];
  const monthlyRate = toNumber(annualInterestRate) / 12 / 100;
  const emi = Math.max(1, Math.round(toNumber(emiAmount)));
  let outstanding = Math.max(0, Math.round(toNumber(principal)));
  let index = 0;

  while (outstanding > 0 && index < 600) {
    const interestComponent = Math.round(outstanding * monthlyRate);
    const principalComponent = Math.min(outstanding, Math.max(1, emi - interestComponent));
    const rowAmount = principalComponent + interestComponent;

    outstanding = Math.max(0, outstanding - principalComponent);
    rows.push({
      emiNumber: startingEmiNumber + index,
      dueDate: addMonths(startDate, index + 1),
      emiAmount: rowAmount,
      principalComponent,
      interestComponent,
      outstandingBalance: outstanding,
      status: 'pending',
    });
    index += 1;
  }

  return rows;
};

const getLoanOutstandingPrincipal = (loan) => {
  const paidPrincipal = (loan.repaymentHistory || []).reduce(
    (sum, entry) => sum + toNumber(entry.status === 'success' ? entry.principalPaid : 0),
    0
  );
  const calculatedPrincipal = Math.max(0, Math.round(toNumber(loan.amount) - paidPrincipal));
  const storedPrincipal = Math.max(0, Math.round(toNumber(loan.outstandingPrincipal)));

  if (loan.status === 'closed') return 0;

  if (
    loan.outstandingPrincipal !== undefined &&
    loan.outstandingPrincipal !== null &&
    (storedPrincipal > 0 || paidPrincipal > 0)
  ) {
    return storedPrincipal;
  }

  return calculatedPrincipal;
};

const getLastLoanPaymentDate = (loan) => {
  const paidDates = (loan.repaymentHistory || [])
    .filter((entry) => entry.status === 'success' && entry.paidAt)
    .map((entry) => new Date(entry.paidAt).getTime())
    .filter(Number.isFinite);

  if (paidDates.length > 0) return new Date(Math.max(...paidDates));
  return loan.lastInterestCalculatedAt || loan.disbursedAt || loan.createdAt || new Date();
};

const calculateAccruedInterest = (loan, now = new Date()) => {
  const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
  const annualRate = toNumber(loan.annualInterestRate) / 100;
  const anchor = getLastLoanPaymentDate(loan);
  const days = Math.max(0, Math.floor((now.getTime() - new Date(anchor).getTime()) / 86400000));

  if (outstandingPrincipal <= 0 || annualRate <= 0 || days <= 0) return 0;
  return Math.round(outstandingPrincipal * annualRate * (days / 365));
};

const getTotalAccruedInterest = (loan, now = new Date()) =>
  Math.max(0, Math.round(toNumber(loan.accruedInterest) + calculateAccruedInterest(loan, now)));

const buildForeclosureQuote = (loan, now = new Date()) => {
  const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
  const accruedInterest = getTotalAccruedInterest(loan, now);
  const unpaidPenalties = Math.max(0, Math.round(toNumber(loan.accruedPenalty)));
  const foreclosureFee = calculateForeclosureFee(outstandingPrincipal);

  return {
    outstandingPrincipal,
    accruedInterest,
    unpaidPenalties,
    foreclosureFee,
    totalPayable: outstandingPrincipal + accruedInterest + unpaidPenalties + foreclosureFee,
  };
};

const appendRepaymentHistory = (loan, entry) => {
  loan.repaymentHistory = [
    ...(loan.repaymentHistory || []),
    {
      ...entry,
      paidAt: entry.paidAt || new Date(),
    },
  ];
};

const sendLoanEmail = async ({ customer, subject, text, html }) => {
  if (!customer?.email) return;
  await sendEmail({ to: customer.email, subject, text, html });
};

const getLoanTransactionMeta = ({ loan, title, subtitle = '', direction = 'debit' }) => ({
  category: 'loan',
  direction,
  businessRefType: 'loan',
  businessRefId: loan.loanId,
  displayTitle: title,
  displaySubtitle: subtitle,
});

const addPdfFooter = (doc, loan) => {
  const bottom = doc.page.height - 54;

  doc
    .moveTo(42, bottom - 10)
    .lineTo(doc.page.width - 42, bottom - 10)
    .strokeColor('#dbe3ef')
    .lineWidth(1)
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#64748b')
    .text(`AdnatePayNest Loan Sanction Letter - ${loan.loanId}`, 42, bottom, {
      width: doc.page.width - 84,
      align: 'center',
    });
};

const drawSanctionHeader = (doc, loan) => {
  doc.rect(0, 0, doc.page.width, 112).fill('#0f3a5f');
  doc.circle(64, 52, 24).fill('#ffffff');
  doc
    .fillColor('#0f3a5f')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('APN', 48, 43, { width: 32, align: 'center' });
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('AdnatePayNest Bank', 104, 30);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#dbeafe')
    .text('Digital Banking and Lending Services', 104, 58);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#ffffff')
    .text('LOAN SANCTION LETTER', 392, 34, { width: 150, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#bfdbfe')
    .text(`Ref: ${loan.loanId}`, 392, 56, { width: 150, align: 'right' });
};

const drawInfoCard = (doc, title, rows, x, y, width) => {
  doc.roundedRect(x, y, width, 26 + rows.length * 24, 8).fillAndStroke('#f8fafc', '#dbe3ef');
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#0f172a')
    .text(title, x + 14, y + 12, { width: width - 28 });

  rows.forEach((row, index) => {
    const rowY = y + 34 + index * 24;

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(row.label, x + 14, rowY, { width: width * 0.42 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(row.value || 'Not set', x + width * 0.45, rowY, { width: width * 0.48 });
  });
};

const drawTermsTable = (doc, loan, x, y, width) => {
  const rows = [
    ['Sanctioned Amount', money(loan.amount)],
    ['Loan Product', loan.loanTypeLabel || loan.loanType],
    ['Interest Rate', `${loan.annualInterestRate}% p.a.`],
    ['Tenure', `${loan.tenureMonths} months`],
    ['Monthly EMI', money(loan.emiAmount)],
    ['Total Interest', money(loan.totalInterest)],
    ['Total Repayment', money(loan.totalRepayment)],
    ['Disbursement Account', `${loan.disbursementAccountType || 'Account'} ${loan.disbursementAccountNumber || ''}`.trim()],
  ];

  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#0f172a')
    .text('Sanctioned Loan Terms', x, y);

  let rowY = y + 24;
  rows.forEach(([label, value], index) => {
    const fill = index % 2 === 0 ? '#ffffff' : '#f8fafc';

    doc.rect(x, rowY, width, 28).fillAndStroke(fill, '#e2e8f0');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#475569')
      .text(label, x + 12, rowY + 9, { width: width * 0.42 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(value, x + width * 0.48, rowY + 9, { width: width * 0.46, align: 'right' });
    rowY += 28;
  });

  return rowY;
};

const generateSanctionLetterPdf = (loan, manager) =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(SANCTION_LETTER_DIR, { recursive: true });

    const fileName = `${loan.loanId}-sanction-letter.pdf`;
    const filePath = path.join(SANCTION_LETTER_DIR, fileName);
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    const issuedAt = new Date();
    const validUntil = addDays(issuedAt, 30);
    const customer = loan.customer || {};

    stream.on('finish', () => {
      resolve({
        fileName,
        filePath,
        fileUrl: `/uploads/sanction-letters/${fileName}`,
        generatedAt: issuedAt,
      });
    });
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    drawSanctionHeader(doc, loan);

    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('In-Principle Sanction and Terms of Approval', 42, 138);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text(
        'We are pleased to inform you that your loan application has been approved subject to acceptance of the terms below, completion of applicable documentation, and final disbursement checks.',
        42,
        164,
        { width: 510, lineGap: 4 }
      );

    drawInfoCard(
      doc,
      'Borrower Details',
      [
        { label: 'Customer Name', value: customer.name },
        { label: 'Customer ID', value: customer.customerId },
        { label: 'Classification', value: loan.customerClassification || customer.classification },
      ],
      42,
      220,
      238
    );
    drawInfoCard(
      doc,
      'Sanction Details',
      [
        { label: 'Loan ID', value: loan.loanId },
        { label: 'Issue Date', value: formatDate(issuedAt) },
        { label: 'Valid Until', value: formatDate(validUntil) },
      ],
      304,
      220,
      248
    );

    const tableBottom = drawTermsTable(doc, loan, 42, 326, 510);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#0f172a')
      .text('Key Conditions', 42, tableBottom + 26);

    const conditions = [
      `The sanctioned amount will be disbursed only after the borrower accepts this sanction letter in the application.`,
      `The first EMI will follow the repayment schedule generated at disbursement. EMI auto-pay will attempt debit from the selected repayment account.`,
      `A grace period of ${EMI_GRACE_PERIOD_DAYS} days is available after each EMI due date. No late penalty is applied within this period.`,
      `If an EMI remains unpaid after the grace period, the account may be marked missed and a penalty of the higher of ${money(MISSED_EMI_FIXED_PENALTY)} or ${MISSED_EMI_PENALTY_RATE * 100}% of EMI may apply.`,
      `Part-payment and foreclosure are subject to the outstanding principal, accrued interest, unpaid penalties, and foreclosure charges shown in the application.`,
      `The lender may withhold or cancel disbursement if submitted documents are found invalid, mismatched, or materially incomplete.`,
    ];

    let conditionY = tableBottom + 52;
    conditions.forEach((condition, index) => {
      doc
        .circle(48, conditionY + 5, 2.2)
        .fill('#2563eb');
      doc
        .font('Helvetica')
        .fontSize(9.2)
        .fillColor('#334155')
        .text(condition, 60, conditionY, { width: 480, lineGap: 3 });
      conditionY += index === 0 ? 32 : 38;
    });

    doc.addPage();
    drawSanctionHeader(doc, loan);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#0f172a')
      .text('Declaration and Acceptance', 42, 138);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#334155')
      .text(
        'This sanction letter is not a disbursement confirmation. Disbursement will be completed only after borrower acceptance and successful completion of operational checks. By accepting this letter, the borrower confirms that the loan terms, repayment obligations, charges, and penalties have been reviewed and understood.',
        42,
        166,
        { width: 510, lineGap: 5 }
      );

    doc.roundedRect(42, 250, 510, 130, 8).fillAndStroke('#f8fafc', '#dbe3ef');
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0f172a')
      .text('Borrower Acceptance', 60, 270);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#475569')
      .text('Accepted digitally in AdnatePayNest by the customer before disbursement.', 60, 294, {
        width: 460,
      });
    doc
      .moveTo(60, 346)
      .lineTo(246, 346)
      .strokeColor('#94a3b8')
      .stroke();
    doc
      .moveTo(316, 346)
      .lineTo(510, 346)
      .strokeColor('#94a3b8')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text('Borrower Signature / Digital Acceptance', 60, 354)
      .text('Date', 316, 354);

    doc.roundedRect(42, 410, 510, 116, 8).fillAndStroke('#eff6ff', '#bfdbfe');
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0f3a5f')
      .text('For AdnatePayNest Bank', 60, 430);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#334155')
      .text(`Approved by: ${manager?.name || 'Authorized Manager'}`, 60, 456)
      .text(`Approval Date: ${formatDate(loan.reviewedAt || issuedAt)}`, 60, 476)
      .text('This is a system-generated sanction letter and does not require a physical stamp.', 60, 496);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text('Important Notice', 42, 560);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#64748b')
      .text(
        'Please preserve this letter for your records. Any mismatch in borrower details, loan details, repayment account, or sanctioned amount should be reported before accepting the sanction terms.',
        42,
        578,
        { width: 510, lineGap: 3 }
      );

    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i += 1) {
      doc.switchToPage(i);
      addPdfFooter(doc, loan);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(`Page ${i + 1} of ${pageRange.count}`, 482, doc.page.height - 54, {
          width: 70,
          align: 'right',
        });
    }

    doc.end();
  });

const generateAndSendSanctionLetter = async (loan, manager) => {
  const pdf = await generateSanctionLetterPdf(loan, manager);
  const emailResult = loan.customer?.email
    ? await sendEmail({
      to: loan.customer.email,
      subject: `Loan sanction letter for ${loan.loanId}`,
      text: `Your ${loan.loanTypeLabel} loan has been approved. Please review and accept the attached sanction letter before disbursement.`,
      html: `<p>Your <strong>${loan.loanTypeLabel}</strong> loan application <strong>${loan.loanId}</strong> has been approved.</p><p>Please review and accept the sanction letter before disbursement.</p>`,
      attachments: [
        {
          filename: pdf.fileName,
          path: pdf.filePath,
        },
      ],
    })
    : { sent: false, message: 'Customer email is not available.' };

  loan.sanctionLetter = {
    ...(loan.sanctionLetter || {}),
    status: emailResult?.sent ? 'sent' : 'generated',
    fileName: pdf.fileName,
    fileUrl: pdf.fileUrl,
    filePath: pdf.filePath,
    generatedAt: pdf.generatedAt,
    sentAt: emailResult?.sent ? new Date() : loan.sanctionLetter?.sentAt,
    emailStatus: emailResult?.sent ? 'sent' : emailResult?.message || 'Email not configured',
  };

  return emailResult;
};

const drawAgreementClause = (doc, number, title, body, x, y, width) => {
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor('#0f172a')
    .text(`${number}. ${title}`, x, y, { width });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#475569')
    .text(body, x, y + 16, { width, lineGap: 3 });

  return doc.y + 12;
};

const generateLoanAgreementPdf = (loan, manager) =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(LOAN_AGREEMENT_DIR, { recursive: true });

    const fileName = `${loan.loanId}-loan-agreement.pdf`;
    const filePath = path.join(LOAN_AGREEMENT_DIR, fileName);
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    const generatedAt = new Date();
    const customer = loan.customer || {};
    const clauseWidth = 510;

    stream.on('finish', () => {
      resolve({
        fileName,
        filePath,
        fileUrl: `/uploads/loan-agreements/${fileName}`,
        generatedAt,
      });
    });
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    drawSanctionHeader(doc, loan);
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text('Loan Agreement and Repayment Authorization', 42, 138);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text(
        'This agreement records the binding terms between AdnatePayNest Bank and the borrower for the sanctioned loan. The borrower must accept this agreement before disbursement.',
        42,
        166,
        { width: clauseWidth, lineGap: 4 }
      );

    drawInfoCard(
      doc,
      'Borrower',
      [
        { label: 'Name', value: customer.name },
        { label: 'Customer ID', value: customer.customerId },
        { label: 'Classification', value: loan.customerClassification || customer.classification },
      ],
      42,
      220,
      238
    );
    drawInfoCard(
      doc,
      'Agreement',
      [
        { label: 'Loan ID', value: loan.loanId },
        { label: 'Date', value: formatDate(generatedAt) },
        { label: 'Approved By', value: manager?.name || loan.reviewedBy?.name || 'Authorized Manager' },
      ],
      304,
      220,
      248
    );

    let y = drawTermsTable(doc, loan, 42, 326, clauseWidth) + 24;
    const firstPageClauses = [
      [
        'Loan Facility',
        `The lender agrees to provide the borrower a ${loan.loanTypeLabel || loan.loanType} loan of ${money(loan.amount)} subject to this agreement, sanction terms, document verification, and disbursement controls.`,
      ],
      [
        'Repayment Obligation',
        `The borrower agrees to repay the loan through monthly EMIs of ${money(loan.emiAmount)} for ${loan.tenureMonths} months, together with applicable interest, charges, penalties, and any other dues.`,
      ],
      [
        'Auto-Debit Authorization',
        `The borrower authorizes EMI recovery from ${loan.disbursementAccountType || 'the selected account'} ${loan.disbursementAccountNumber || ''}. If sufficient balance is unavailable, the EMI may be marked overdue or missed as per policy.`,
      ],
    ];

    firstPageClauses.forEach(([title, body], index) => {
      y = drawAgreementClause(doc, index + 1, title, body, 42, y, clauseWidth);
    });

    doc.addPage();
    drawSanctionHeader(doc, loan);
    y = 138;

    const clauses = [
      [
        'Grace Period and Late Payment',
        `A ${EMI_GRACE_PERIOD_DAYS}-day grace period applies after each EMI due date. If the EMI remains unpaid after the grace period, penalty may be charged at the higher of ${money(MISSED_EMI_FIXED_PENALTY)} or ${MISSED_EMI_PENALTY_RATE * 100}% of EMI.`,
      ],
      [
        'Part-Payment and Foreclosure',
        'Part-payment and foreclosure are permitted subject to outstanding principal, accrued interest, unpaid penalties, foreclosure fee, and operational checks shown in the application at the time of payment.',
      ],
      [
        'Events of Default',
        'Failure to pay EMI after the grace period, false documents, misuse of loan proceeds, account irregularity, or breach of this agreement may be treated as default and may affect recovery actions and customer profile.',
      ],
      [
        'Borrower Declarations',
        'The borrower confirms that submitted information and documents are true, the loan purpose is genuine, and the borrower has understood the interest, EMI, total repayment, charges, and consequences of default.',
      ],
      [
        'Lender Rights',
        'The lender may verify documents, contact the borrower, send electronic communications, adjust payments against dues, withhold disbursement, or close the facility according to policy and applicable law.',
      ],
      [
        'Electronic Records',
        'The borrower agrees that digital acceptance in AdnatePayNest is valid evidence of consent and will be retained with the loan record for audit and servicing.',
      ],
      [
        'Governing Terms',
        'This agreement is governed by applicable banking policies, platform terms, and Indian law. Disputes should first be raised through official customer support channels.',
      ],
    ];

    clauses.forEach(([title, body], index) => {
      if (y > 660) {
        doc.addPage();
        drawSanctionHeader(doc, loan);
        y = 138;
      }
      y = drawAgreementClause(doc, index + 4, title, body, 42, y, clauseWidth);
    });

    if (y > 560) {
      doc.addPage();
      drawSanctionHeader(doc, loan);
      y = 138;
    }

    doc.roundedRect(42, y + 8, 510, 154, 8).fillAndStroke('#f8fafc', '#dbe3ef');
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#0f172a')
      .text('Digital Acceptance and Execution', 60, y + 28);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#475569')
      .text(
        'By accepting this agreement in the application, the borrower confirms consent to the loan contract, repayment authorization, EMI schedule, penalty terms, and lender rights stated above.',
        60,
        y + 52,
        { width: 460, lineGap: 4 }
      );
    doc
      .moveTo(60, y + 124)
      .lineTo(246, y + 124)
      .strokeColor('#94a3b8')
      .stroke();
    doc
      .moveTo(316, y + 124)
      .lineTo(510, y + 124)
      .strokeColor('#94a3b8')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text('Borrower Digital Acceptance', 60, y + 132)
      .text('Agreement Acceptance Date', 316, y + 132);

    doc.roundedRect(42, y + 188, 510, 86, 8).fillAndStroke('#eff6ff', '#bfdbfe');
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0f3a5f')
      .text('For AdnatePayNest Bank', 60, y + 208);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#334155')
      .text(`Authorized Manager: ${manager?.name || 'Authorized Manager'}`, 60, y + 232)
      .text(`Agreement Generated: ${formatDate(generatedAt)}`, 60, y + 252);

    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i += 1) {
      doc.switchToPage(i);
      addPdfFooter(doc, loan);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(`Page ${i + 1} of ${pageRange.count}`, 482, doc.page.height - 54, {
          width: 70,
          align: 'right',
        });
    }

    doc.end();
  });

const generateAndSendLoanAgreement = async (loan, manager) => {
  const pdf = await generateLoanAgreementPdf(loan, manager);
  const emailResult = loan.customer?.email
    ? await sendEmail({
      to: loan.customer.email,
      subject: `Loan agreement for ${loan.loanId}`,
      text: `Your loan agreement is ready. Please review and accept it before disbursement.`,
      html: `<p>Your loan agreement for <strong>${loan.loanId}</strong> is ready.</p><p>Please review and accept it before disbursement.</p>`,
      attachments: [
        {
          filename: pdf.fileName,
          path: pdf.filePath,
        },
      ],
    })
    : { sent: false, message: 'Customer email is not available.' };

  loan.loanAgreement = {
    ...(loan.loanAgreement || {}),
    status: emailResult?.sent ? 'sent' : 'generated',
    fileName: pdf.fileName,
    fileUrl: pdf.fileUrl,
    filePath: pdf.filePath,
    generatedAt: pdf.generatedAt,
    sentAt: emailResult?.sent ? new Date() : loan.loanAgreement?.sentAt,
    emailStatus: emailResult?.sent ? 'sent' : emailResult?.message || 'Email not configured',
  };

  return emailResult;
};

const drawRepaymentScheduleHeader = (doc, startY) => {
  const columns = [
    ['EMI', 42, 42],
    ['Due Date', 84, 78],
    ['EMI Amount', 162, 82],
    ['Principal', 244, 82],
    ['Interest', 326, 78],
    ['Balance', 404, 86],
    ['Status', 490, 62],
  ];

  doc.rect(42, startY, 510, 24).fillAndStroke('#eff6ff', '#bfdbfe');
  columns.forEach(([label, x, width]) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#0f3a5f')
      .text(label, x + 5, startY + 8, { width: width - 10 });
  });

  return startY + 24;
};

const drawRepaymentScheduleRow = (doc, row, y, index) => {
  const fill = index % 2 === 0 ? '#ffffff' : '#f8fafc';
  const values = [
    [row.emiNumber, 42, 42],
    [formatDate(row.dueDate), 84, 78],
    [money(row.emiAmount), 162, 82],
    [money(row.principalComponent), 244, 82],
    [money(row.interestComponent), 326, 78],
    [money(row.outstandingBalance), 404, 86],
    [String(row.status || 'pending').replace(/_/g, ' '), 490, 62],
  ];

  doc.rect(42, y, 510, 23).fillAndStroke(fill, '#e2e8f0');
  values.forEach(([value, x, width]) => {
    doc
      .font('Helvetica')
      .fontSize(7.2)
      .fillColor('#334155')
      .text(String(value || ''), x + 5, y + 7, { width: width - 10 });
  });

  return y + 23;
};

const generateRepaymentSchedulePdf = (loan) =>
  new Promise((resolve, reject) => {
    fs.mkdirSync(REPAYMENT_SCHEDULE_DIR, { recursive: true });

    const fileName = `${loan.loanId}-repayment-schedule.pdf`;
    const filePath = path.join(REPAYMENT_SCHEDULE_DIR, fileName);
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    const generatedAt = new Date();
    const customer = loan.customer || {};
    const schedule = loan.amortizationSchedule || [];

    stream.on('finish', () => {
      resolve({
        fileName,
        filePath,
        fileUrl: `/uploads/repayment-schedules/${fileName}`,
        generatedAt,
      });
    });
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    drawSanctionHeader(doc, loan);
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text('Repayment Schedule', 42, 138);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#475569')
      .text(
        'This schedule is generated at loan disbursement and records EMI due dates, principal and interest components, and projected outstanding balance.',
        42,
        164,
        { width: 510, lineGap: 4 }
      );

    drawInfoCard(
      doc,
      'Borrower',
      [
        { label: 'Name', value: customer.name },
        { label: 'Customer ID', value: customer.customerId },
        { label: 'Repayment Account', value: `${loan.disbursementAccountType || 'Account'} ${loan.disbursementAccountNumber || ''}`.trim() },
      ],
      42,
      212,
      238
    );
    drawInfoCard(
      doc,
      'Loan Terms',
      [
        { label: 'Loan ID', value: loan.loanId },
        { label: 'Loan Amount', value: money(loan.amount) },
        { label: 'Monthly EMI', value: money(loan.emiAmount) },
      ],
      304,
      212,
      248
    );

    let y = drawRepaymentScheduleHeader(doc, 340);
    schedule.forEach((row, index) => {
      if (y > 730) {
        doc.addPage();
        drawSanctionHeader(doc, loan);
        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor('#0f172a')
          .text('Repayment Schedule Continued', 42, 138);
        y = drawRepaymentScheduleHeader(doc, 172);
      }

      y = drawRepaymentScheduleRow(doc, row, y, index);
    });

    if (schedule.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#64748b')
        .text('No repayment schedule rows are available.', 54, y + 16);
    }

    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i += 1) {
      doc.switchToPage(i);
      addPdfFooter(doc, loan);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(`Page ${i + 1} of ${pageRange.count}`, 482, doc.page.height - 54, {
          width: 70,
          align: 'right',
        });
    }

    doc.end();
  });

const generateAndSendRepaymentSchedule = async (loan) => {
  const pdf = await generateRepaymentSchedulePdf(loan);
  const emailResult = loan.customer?.email
    ? await sendEmail({
      to: loan.customer.email,
      subject: `Repayment schedule for loan ${loan.loanId}`,
      text: `Your repayment schedule for loan ${loan.loanId} is attached.`,
      html: `<p>Your repayment schedule for loan <strong>${loan.loanId}</strong> is attached.</p>`,
      attachments: [
        {
          filename: pdf.fileName,
          path: pdf.filePath,
        },
      ],
    })
    : { sent: false, message: 'Customer email is not available.' };

  loan.repaymentScheduleDocument = {
    ...(loan.repaymentScheduleDocument || {}),
    status: emailResult?.sent ? 'sent' : 'generated',
    fileName: pdf.fileName,
    fileUrl: pdf.fileUrl,
    filePath: pdf.filePath,
    generatedAt: pdf.generatedAt,
    sentAt: emailResult?.sent ? new Date() : loan.repaymentScheduleDocument?.sentAt,
    emailStatus: emailResult?.sent ? 'sent' : emailResult?.message || 'Email not configured',
  };

  return emailResult;
};

const getRecommendation = (score, decisionBands) => {
  if (score >= decisionBands.highlyEligible) return 'Highly eligible';
  if (score >= decisionBands.eligible) return 'Eligible';
  if (score >= decisionBands.review) return 'Manager review recommended';
  return 'Not recommended';
};

const makeLoanId = () =>
  `LN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

const getCustomerId = (loan) => loan.customer?.customerId || '';
const getCustomerObjectId = (loan) => String(loan.customer?._id || loan.customer || '');

const getActiveLoanCount = async (customerId) => {
  if (!customerId) return 0;

  return Loan.countDocuments({
    customer: customerId,
    status: { $in: ACTIVE_LOAN_STATUSES },
  });
};

const getActiveLoanCountsByCustomer = async (customerIds) => {
  const objectIds = [...new Set(customerIds.filter(Boolean).map(String))];

  if (!objectIds.length) return new Map();

  const rows = await Loan.aggregate([
    {
      $match: {
        customer: { $in: objectIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: { $in: ACTIVE_LOAN_STATUSES },
      },
    },
    { $group: { _id: '$customer', count: { $sum: 1 } } },
  ]);

  return rows.reduce((map, row) => {
    map.set(String(row._id), row.count);
    return map;
  }, new Map());
};

const buildEligibilitySnapshot = (loan, loanRules, bankAccounts = [], activeLoanCount = 0) => {
  const classification = String(
    loan.customerClassification || loan.customer?.classification || ''
  ).toLowerCase();
  const typeRule = getLoanTypeRule(loanRules, loan.loanType);
  const classificationBenefit = loanRules.classificationBenefits[classification] || {
    classificationScoreRatio: 0.4,
    interestDiscount: 0,
    maxAmountMultiplier: 1,
  };
  const effectiveMaxAmount = Math.round(
    Number(typeRule?.maxAmount || loan.amount || 0) *
      Number(classificationBenefit.maxAmountMultiplier || 1)
  );
  const eligibility = calculateEligibility({
    customer: loan.customer,
    bankAccounts,
    monthlyIncome: loan.monthlyIncome,
    existingMonthlyLiabilities: loan.existingMonthlyLiabilities,
    activeLoanCount,
    employmentDurationMonths: loan.employmentDurationMonths,
    loanAmount: loan.amount,
    emi: loan.emiAmount,
    weights: loanRules.scoreWeights,
    classificationBenefits: loanRules.classificationBenefits,
  });

  return {
    score: eligibility.totalScore,
    recommendation: getRecommendation(eligibility.totalScore, loanRules.decisionBands),
    details: {
      ...eligibility,
      scoreWeights: loanRules.scoreWeights,
      classificationBenefit: {
        classification,
        baseInterestRate: typeRule?.annualInterestRate ?? loan.annualInterestRate,
        effectiveInterestRate: loan.annualInterestRate,
        interestDiscount: Number(classificationBenefit.interestDiscount || 0),
        maxAmount: effectiveMaxAmount,
        maxAmountMultiplier: Number(classificationBenefit.maxAmountMultiplier || 1),
      },
    },
  };
};

const shouldRefreshEligibility = (loan) =>
  ['submitted', 'under_review'].includes(loan.status);

const refreshLoanEligibility = async (loan, loanRules, bankAccounts = [], activeLoanCount = 0) => {
  if (!shouldRefreshEligibility(loan)) return loan;

  const snapshot = buildEligibilitySnapshot(loan, loanRules, bankAccounts, activeLoanCount);
  const currentScores = loan.eligibilityDetails?.componentScores || {};
  const nextScores = snapshot.details.componentScores || {};
  const hasChanged =
    Number(loan.eligibilityScore || 0) !== snapshot.score ||
    loan.eligibilityRecommendation !== snapshot.recommendation ||
    JSON.stringify(currentScores) !== JSON.stringify(nextScores) ||
    Number(loan.eligibilityDetails?.highestOdUsesThisMonth || 0) !==
      Number(snapshot.details.highestOdUsesThisMonth || 0) ||
    Number(loan.eligibilityDetails?.odBlockedAccounts || 0) !==
      Number(snapshot.details.odBlockedAccounts || 0) ||
    Number(loan.eligibilityDetails?.activeLoanCount || 0) !==
      Number(snapshot.details.activeLoanCount || 0);

  if (!hasChanged) return loan;

  loan.eligibilityScore = snapshot.score;
  loan.eligibilityRecommendation = snapshot.recommendation;
  loan.eligibilityDetails = snapshot.details;
  await loan.save();

  return loan;
};

const serializeLoan = (loan, activeLoanCount = loan.eligibilityDetails?.activeLoanCount || 0) => ({
  id: loan.loanId,
  customerId: loan.customer?._id || loan.customer,
  customerName: loan.customer?.name,
  customerCode: loan.customer?.customerId,
  customerClassification: loan.customerClassification,
  loanType: loan.loanType,
  loanTypeLabel: loan.loanTypeLabel,
  purpose: loan.purpose,
  supportingDetails: loan.supportingDetails || {},
  amount: loan.amount,
  tenureMonths: loan.tenureMonths,
  annualInterestRate: loan.annualInterestRate,
  monthlyIncome: loan.monthlyIncome,
  existingMonthlyLiabilities: loan.existingMonthlyLiabilities,
  activeLoanCount,
  employmentType: loan.employmentType,
  employmentDurationMonths: loan.employmentDurationMonths,
  disbursementAccountNumber: loan.disbursementAccountNumber,
  disbursementAccountType: loan.disbursementAccountType,
  emiAmount: loan.emiAmount,
  totalInterest: loan.totalInterest,
  totalRepayment: loan.totalRepayment,
  outstandingPrincipal: getLoanOutstandingPrincipal(loan),
  accruedInterest: getTotalAccruedInterest(loan),
  accruedPenalty: loan.accruedPenalty || 0,
  foreclosureFee: calculateForeclosureFee(getLoanOutstandingPrincipal(loan)),
  foreclosureQuote: buildForeclosureQuote(loan),
  repaymentHistory: loan.repaymentHistory || [],
  eligibilityScore: loan.eligibilityScore,
  eligibilityRecommendation: loan.eligibilityRecommendation,
  eligibilityDetails: loan.eligibilityDetails || {},
  sanctionLetter: {
    status: loan.sanctionLetter?.status || 'pending',
    fileName: loan.sanctionLetter?.fileName || '',
    fileUrl: loan.sanctionLetter?.fileUrl || '',
    generatedAt: loan.sanctionLetter?.generatedAt,
    sentAt: loan.sanctionLetter?.sentAt,
    acceptedAt: loan.sanctionLetter?.acceptedAt,
    emailStatus: loan.sanctionLetter?.emailStatus || '',
  },
  loanAgreement: {
    status: loan.loanAgreement?.status || 'pending',
    fileName: loan.loanAgreement?.fileName || '',
    fileUrl: loan.loanAgreement?.fileUrl || '',
    generatedAt: loan.loanAgreement?.generatedAt,
    sentAt: loan.loanAgreement?.sentAt,
    acceptedAt: loan.loanAgreement?.acceptedAt,
    emailStatus: loan.loanAgreement?.emailStatus || '',
  },
  repaymentScheduleDocument: {
    status: loan.repaymentScheduleDocument?.status || 'pending',
    fileName: loan.repaymentScheduleDocument?.fileName || '',
    fileUrl: loan.repaymentScheduleDocument?.fileUrl || '',
    generatedAt: loan.repaymentScheduleDocument?.generatedAt,
    sentAt: loan.repaymentScheduleDocument?.sentAt,
    emailStatus: loan.repaymentScheduleDocument?.emailStatus || '',
  },
  status: loan.status,
  additionalInfoRequested: loan.additionalInfoRequested,
  managerNote: loan.managerNote,
  rejectionReason: loan.rejectionReason,
  reviewedBy: loan.reviewedBy?.name,
  reviewedAt: loan.reviewedAt,
  disbursedAt: loan.disbursedAt,
  closedAt: loan.closedAt,
  createdAt: loan.createdAt,
  updatedAt: loan.updatedAt,
  amortizationSchedule: loan.amortizationSchedule || [],
  documents: (loan.documents || []).map((document) => ({
    id: document._id,
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    fileUrl: document.fileUrl,
    filePath: document.filePath,
    storedFileName: document.storedFileName,
    dataUrl: document.dataUrl,
    reviewStatus: document.reviewStatus,
    managerNote: document.managerNote,
    reviewedBy: document.reviewedBy?.name,
    reviewedAt: document.reviewedAt,
    uploadedAt: document.uploadedAt,
  })),
});

const serializeLoanWithActiveLoanCount = async (loan) =>
  serializeLoan(loan, await getActiveLoanCount(loan.customer?._id || loan.customer));

const getLoans = async (req, res) => {
  const filter = req.user.role === 'customer' ? { customer: req.user._id } : {};
  const loans = await Loan.find(filter)
    .populate('customer', 'name customerId classification accounts account')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 });
  const config = await getBusinessRuleConfig();
  const loanRules = normalizeLoanRules(config.loanRules);
  const customerIds = [
    ...new Set(loans.map(getCustomerId).filter(Boolean)),
  ];
  const customerObjectIds = [
    ...new Set(loans.map(getCustomerObjectId).filter(Boolean)),
  ];
  const activeLoanCountsByCustomer = await getActiveLoanCountsByCustomer(customerObjectIds);
  const bankAccounts = customerIds.length
    ? await BankAccount.find({
      customerId: { $in: customerIds },
      accountStatus: 'active',
    })
    : [];
  const bankAccountsByCustomerId = bankAccounts.reduce((map, account) => {
    const rows = map.get(account.customerId) || [];

    rows.push(account);
    map.set(account.customerId, rows);

    return map;
  }, new Map());
  const refreshedLoans = await Promise.all(
    loans.map((loan) =>
      refreshLoanEligibility(
        loan,
        loanRules,
        bankAccountsByCustomerId.get(getCustomerId(loan)) || [],
        activeLoanCountsByCustomer.get(getCustomerObjectId(loan)) || 0
      )
    )
  );

  res.json({
    loans: refreshedLoans.map((loan) =>
      serializeLoan(loan, activeLoanCountsByCustomer.get(getCustomerObjectId(loan)) || 0)
    ),
    loanRules,
  });
};

const createLoan = async (req, res) => {
  const customer = await User.findById(req.user._id);

  if (!customer || customer.role !== 'customer') {
    return res.status(403).json({ message: 'Only customers can submit loan applications' });
  }

  const config = await getBusinessRuleConfig();
  const loanRules = normalizeLoanRules(config.loanRules);
  const loanType = String(req.body.loanType || '').trim();
  const typeRule = getLoanTypeRule(loanRules, loanType);

  if (!typeRule || typeRule.key !== loanType) {
    return res.status(400).json({ message: 'Select a valid loan type' });
  }

  const classification = String(customer.classification || '').toLowerCase();
  const classificationBenefit = loanRules.classificationBenefits[classification] || {
    classificationScoreRatio: 0.4,
    interestDiscount: 0,
    maxAmountMultiplier: 1,
  };
  const effectiveInterestRate = Math.max(
    0,
    Number(typeRule.annualInterestRate || 0) - Number(classificationBenefit.interestDiscount || 0)
  );
  const effectiveMaxAmount = Math.round(
    Number(typeRule.maxAmount || 0) * Number(classificationBenefit.maxAmountMultiplier || 1)
  );
  const amount = toNumber(req.body.amount);
  const tenureMonths = Math.round(toNumber(req.body.tenureMonths));
  const monthlyIncome = toNumber(req.body.monthlyIncome);
  const existingMonthlyLiabilities = toNumber(req.body.existingMonthlyLiabilities);
  const employmentDurationMonths = Math.round(toNumber(req.body.employmentDurationMonths));
  const employmentType = String(req.body.employmentType || '').trim();
  const accounts = customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean);
  const requestedDisbursementAccount = String(req.body.disbursementAccountNumber || '').trim();
  const disbursementAccount =
    accounts.find((account) => account.accountNumber === requestedDisbursementAccount) ||
    accounts[0];

  if (!disbursementAccount?.accountNumber) {
    return res.status(400).json({ message: 'Select a valid account for loan disbursement' });
  }

  if (amount < typeRule.minAmount || amount > effectiveMaxAmount) {
    return res.status(400).json({
      message: `${typeRule.label} amount must be between ${money(typeRule.minAmount)} and ${money(effectiveMaxAmount)} for ${customer.classification || 'customer'} classification`,
    });
  }

  if (tenureMonths < typeRule.minTenureMonths || tenureMonths > typeRule.maxTenureMonths) {
    return res.status(400).json({
      message: `${typeRule.label} tenure must be between ${typeRule.minTenureMonths} and ${typeRule.maxTenureMonths} months`,
    });
  }

  if (monthlyIncome <= 0) {
    return res.status(400).json({ message: 'Monthly income is required' });
  }

  if (existingMonthlyLiabilities < 0) {
    return res.status(400).json({ message: 'Existing monthly liabilities cannot be negative' });
  }

  const minimumEmploymentDurationByType = {
    salaried: 6,
    'self-employed': 12,
    business: 12,
  };
  const requiredEmploymentDuration = minimumEmploymentDurationByType[employmentType] || 0;

  if (requiredEmploymentDuration > 0 && employmentDurationMonths <= 0) {
    return res.status(400).json({
      message: 'Employment duration is required for this employment type',
    });
  }

  if (requiredEmploymentDuration > 0 && employmentDurationMonths < requiredEmploymentDuration) {
    return res.status(400).json({
      message: `Minimum employment duration is ${requiredEmploymentDuration} months`,
    });
  }

  let documentTypes = [];
  let supportingDetails = {};

  try {
    documentTypes = JSON.parse(req.body.documentTypes || '[]');
  } catch {
    documentTypes = [];
  }

  try {
    supportingDetails = JSON.parse(req.body.supportingDetails || '{}');
  } catch {
    supportingDetails = {};
  }

  if (!documentTypes.includes('Bank Statement')) {
    return res.status(400).json({ message: 'Bank Statement is required for loan review' });
  }

  if (
    employmentType === 'student' &&
    !documentTypes.includes('Co-applicant Income Proof')
  ) {
    return res.status(400).json({
      message: 'Co-applicant income proof is required when employment type is student',
    });
  }

  const purpose = String(req.body.purpose || '').trim();

  if (purpose.length < 20) {
    return res.status(400).json({ message: 'Purpose must be at least 20 characters' });
  }

  if (
    loanType === 'education' &&
    supportingDetails.admissionStatus &&
    !['Confirmed', 'Provisional', 'Awaiting Result'].includes(supportingDetails.admissionStatus)
  ) {
    return res.status(400).json({ message: 'Select a valid admission status' });
  }

  const emiAmount = calculateEmi({
    principal: amount,
    annualInterestRate: effectiveInterestRate,
    tenureMonths,
  });

  if (emiAmount > monthlyIncome * 0.5) {
    return res.status(400).json({
      message: 'EMI is above 50% of monthly income. Reduce amount or increase tenure.',
    });
  }

  if (existingMonthlyLiabilities + emiAmount > monthlyIncome * 0.6) {
    return res.status(400).json({
      message: 'Existing liabilities plus EMI should stay within 60% of monthly income.',
    });
  }

  const documents = (req.files || []).map((file, index) => {
    const documentType =
      String(documentTypes[index] || '').trim() || `Document ${index + 1}`;
    const relativeUrl = `/uploads/loan-documents/${file.filename}`;

    return {
      documentType,
      fileName: file.originalname,
      storedFileName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      filePath: file.path,
      fileUrl: relativeUrl,
    };
  });

  const totalRepayment = emiAmount * tenureMonths;
  const totalInterest = Math.max(0, totalRepayment - amount);
  const bankAccounts = customer.customerId
    ? await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    })
    : [];
  const activeLoanCount = await getActiveLoanCount(customer._id);
  const eligibility = calculateEligibility({
    customer,
    bankAccounts,
    monthlyIncome,
    existingMonthlyLiabilities,
    activeLoanCount,
    employmentDurationMonths,
    loanAmount: amount,
    emi: emiAmount,
    weights: loanRules.scoreWeights,
    classificationBenefits: loanRules.classificationBenefits,
  });

  const loan = await Loan.create({
    loanId: makeLoanId(),
    customer: customer._id,
    loanType,
    loanTypeLabel: typeRule.label,
    purpose,
    supportingDetails,
    amount,
    tenureMonths,
    annualInterestRate: effectiveInterestRate,
    monthlyIncome,
    existingMonthlyLiabilities,
    employmentType,
    employmentDurationMonths,
    customerClassification: customer.classification,
    disbursementAccountNumber: disbursementAccount.accountNumber,
    disbursementAccountType: disbursementAccount.accountType || '',
    emiAmount,
    totalInterest,
    totalRepayment,
    outstandingPrincipal: amount,
    accruedInterest: 0,
    accruedPenalty: 0,
    foreclosureFee: 0,
    eligibilityScore: eligibility.totalScore,
    eligibilityRecommendation: getRecommendation(eligibility.totalScore, loanRules.decisionBands),
    eligibilityDetails: {
      ...eligibility,
      scoreWeights: loanRules.scoreWeights,
      classificationBenefit: {
        classification,
        baseInterestRate: typeRule.annualInterestRate,
        effectiveInterestRate,
        interestDiscount: Number(classificationBenefit.interestDiscount || 0),
        maxAmount: effectiveMaxAmount,
        maxAmountMultiplier: Number(classificationBenefit.maxAmountMultiplier || 1),
      },
    },
    amortizationSchedule: buildAmortizationSchedule({
      principal: amount,
      annualInterestRate: effectiveInterestRate,
      tenureMonths,
    }),
    documents,
  });

  await writeSystemLog({
    action: 'loan.submitted',
    message: `${customer.name} submitted ${typeRule.label} application ${loan.loanId} for ${money(amount)}.`,
    actor: customer._id,
    actorName: customer.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: 'info',
    metadata: {
      loanId: loan.loanId,
      amount,
      loanType,
      eligibilityScore: eligibility.totalScore,
    },
  });

  const responseLoan = await Loan.findById(loan._id).populate('customer', 'name customerId');

  res.status(201).json({
    message: 'Loan application submitted to manager review.',
    loan: serializeLoan(responseLoan, activeLoanCount),
  });
};

const reviewLoan = async (req, res) => {
  const action = String(req.body.action || '').trim();
  const note = String(req.body.note || '').trim();

  if (!['approve', 'reject', 'request_info'].includes(action)) {
    return res.status(400).json({ message: 'Select a valid loan review action' });
  }

  if (['reject', 'request_info'].includes(action) && !note) {
    return res.status(400).json({ message: 'Manager note is required for this action' });
  }

  const loan = await Loan.findOne({ loanId: req.params.id }).populate(
    'customer',
    'name email customerId classification accounts account'
  );

  if (!loan) return res.status(404).json({ message: 'Loan application not found' });
  if (!['submitted', 'under_review'].includes(loan.status)) {
    return res.status(400).json({ message: 'Only submitted or under-review loans can be reviewed' });
  }

  const config = await getBusinessRuleConfig();
  const loanRules = normalizeLoanRules(config.loanRules);
  const bankAccounts = loan.customer?.customerId
    ? await BankAccount.find({
      customerId: loan.customer.customerId,
      accountStatus: 'active',
    })
    : [];
  const activeLoanCount = await getActiveLoanCount(loan.customer?._id);

  await refreshLoanEligibility(loan, loanRules, bankAccounts, activeLoanCount);

  loan.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'under_review';
  loan.assignedManager = req.user._id;
  loan.reviewedBy = req.user._id;
  loan.reviewedAt = new Date();
  loan.additionalInfoRequested = action === 'request_info';
  loan.managerNote = note;
  loan.rejectionReason = action === 'reject' ? note : '';
  if (action === 'approve') {
    await generateAndSendSanctionLetter(loan, req.user);
  }
  await loan.save();

  await writeSystemLog({
    action: `loan.${action}`,
    message: `${req.user.name} ${action.replace('_', ' ')} for loan ${loan.loanId}.`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: action === 'approve' ? 'success' : action === 'reject' ? 'danger' : 'warning',
    metadata: {
      loanId: loan.loanId,
      amount: loan.amount,
      customerName: loan.customer?.name,
      note,
    },
  });

  if (loan.customer?._id) {
    await writeSystemLog({
      action:
        action === 'approve'
          ? 'loan.approved.customer'
          : action === 'reject'
            ? 'loan.rejected.customer'
            : 'loan.info_requested.customer',
      message:
        action === 'approve'
          ? `Your ${loan.loanTypeLabel} application ${loan.loanId} was approved by ${req.user.name}.`
          : action === 'reject'
            ? `Your ${loan.loanTypeLabel} application ${loan.loanId} was rejected. Reason: ${note}`
            : `Manager requested more information for loan ${loan.loanId}: ${note}`,
      actor: loan.customer._id,
      actorName: loan.customer.name,
      entityType: 'Loan',
      entityId: loan.loanId,
      severity: action === 'approve' ? 'success' : action === 'reject' ? 'danger' : 'warning',
      metadata: {
        loanId: loan.loanId,
        amount: loan.amount,
        reviewedBy: req.user.name,
        note,
      },
    });
  }

  const responseLoan = await Loan.findById(loan._id)
    .populate('customer', 'name customerId')
    .populate('reviewedBy', 'name');

  res.json({
    message:
      action === 'approve'
        ? 'Loan application approved.'
        : action === 'reject'
          ? 'Loan application rejected.'
          : 'Additional information requested.',
    loan: serializeLoan(responseLoan, activeLoanCount),
  });
};

const reviewLoanDocument = async (req, res) => {
  const reviewStatus = String(req.body.reviewStatus || '').trim();
  const managerNote = String(req.body.managerNote || '').trim();

  if (!['pending', 'verified', 'mismatch', 'rejected', 'additional_info_required'].includes(reviewStatus)) {
    return res.status(400).json({ message: 'Select a valid document review status' });
  }

  if (['mismatch', 'rejected', 'additional_info_required'].includes(reviewStatus) && !managerNote) {
    return res.status(400).json({ message: 'Manager note is required for this document status' });
  }

  const loan = await Loan.findOne({ loanId: req.params.id })
    .populate('customer', 'name customerId')
    .populate('reviewedBy', 'name');

  if (!loan) return res.status(404).json({ message: 'Loan application not found' });

  const document = loan.documents.id(req.params.documentId);

  if (!document) {
    return res.status(404).json({ message: 'Loan document not found' });
  }

  document.reviewStatus = reviewStatus;
  document.managerNote = managerNote;
  document.reviewedBy = req.user._id;
  document.reviewedAt = new Date();
  loan.assignedManager = loan.assignedManager || req.user._id;
  if (loan.status === 'submitted') loan.status = 'under_review';
  await loan.save();

  await writeSystemLog({
    action: 'loan.document.reviewed',
    message: `${req.user.name} marked ${document.documentType} for loan ${loan.loanId} as ${reviewStatus.replaceAll('_', ' ')}.`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: reviewStatus === 'verified' ? 'success' : reviewStatus === 'pending' ? 'info' : 'warning',
    metadata: {
      loanId: loan.loanId,
      documentId: document._id,
      documentType: document.documentType,
      reviewStatus,
      managerNote,
    },
  });

  const responseLoan = await Loan.findById(loan._id)
    .populate('customer', 'name customerId')
    .populate('reviewedBy', 'name')
    .populate('documents.reviewedBy', 'name');

  res.json({
    message: 'Document review updated.',
    loan: await serializeLoanWithActiveLoanCount(responseLoan),
  });
};

const acceptSanctionLetter = async (req, res) => {
  const loan = await Loan.findOne({
    loanId: req.params.id,
    customer: req.user._id,
  }).populate('customer', 'name email customerId classification accounts account');

  if (!loan) return res.status(404).json({ message: 'Loan application not found' });
  if (loan.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved loans can be accepted for disbursal' });
  }
  if (!loan.sanctionLetter?.fileUrl) {
    return res.status(400).json({ message: 'Sanction letter is not available yet' });
  }
  if (loan.sanctionLetter.status === 'accepted') {
    return res.json({
      message: 'Sanction letter already accepted.',
      loan: await serializeLoanWithActiveLoanCount(loan),
    });
  }

  loan.sanctionLetter = {
    ...(loan.sanctionLetter || {}),
    status: 'accepted',
    acceptedAt: new Date(),
    acceptedBy: req.user._id,
  };
  await generateAndSendLoanAgreement(loan, req.user);
  await loan.save();

  await writeSystemLog({
    action: 'loan.sanction.accepted.customer',
    message: `${loan.customer?.name || 'Customer'} accepted sanction letter for loan ${loan.loanId}.`,
    actor: req.user._id,
    actorName: loan.customer?.name || req.user.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: 'success',
    metadata: {
      loanId: loan.loanId,
      acceptedAt: loan.sanctionLetter.acceptedAt,
    },
  });

  res.json({
    message: 'Sanction letter accepted. Loan agreement is ready for review.',
    loan: await serializeLoanWithActiveLoanCount(loan),
  });
};

const acceptLoanAgreement = async (req, res) => {
  const loan = await Loan.findOne({
    loanId: req.params.id,
    customer: req.user._id,
  }).populate('customer', 'name email customerId classification accounts account');

  if (!loan) return res.status(404).json({ message: 'Loan application not found' });
  if (loan.status !== 'approved') {
    return res.status(400).json({ message: 'Only approved loans can be accepted for disbursal' });
  }
  if (loan.sanctionLetter?.status !== 'accepted') {
    return res.status(400).json({ message: 'Accept the sanction letter before accepting the loan agreement' });
  }
  if (!loan.loanAgreement?.fileUrl) {
    await generateAndSendLoanAgreement(loan, req.user);
  }
  if (loan.loanAgreement.status === 'accepted') {
    return res.json({
      message: 'Loan agreement already accepted.',
      loan: await serializeLoanWithActiveLoanCount(loan),
    });
  }

  loan.loanAgreement = {
    ...(loan.loanAgreement || {}),
    status: 'accepted',
    acceptedAt: new Date(),
    acceptedBy: req.user._id,
  };
  await loan.save();

  await writeSystemLog({
    action: 'loan.agreement.accepted.customer',
    message: `${loan.customer?.name || 'Customer'} accepted loan agreement for loan ${loan.loanId}.`,
    actor: req.user._id,
    actorName: loan.customer?.name || req.user.name,
    entityType: 'Loan',
    entityId: loan.loanId,
    severity: 'success',
    metadata: {
      loanId: loan.loanId,
      acceptedAt: loan.loanAgreement.acceptedAt,
    },
  });

  res.json({
    message: 'Loan agreement accepted. Loan is ready for disbursal.',
    loan: await serializeLoanWithActiveLoanCount(loan),
  });
};

const attemptLoanEmiDeduction = async ({
  loan,
  customer,
  paymentAccount,
  emiNumber,
  paymentType = 'emi',
  markMissedOnFailure = false,
  now = new Date(),
  session,
}) => {
  const emiRow = emiNumber
    ? loan.amortizationSchedule.find((row) => row.emiNumber === emiNumber)
    : loan.amortizationSchedule.find((row) => row.status !== 'paid' && row.status !== 'foreclosed');

  if (!emiRow) throw new Error('EMI installment not found');
  if (emiRow.status === 'paid') throw new Error('This EMI is already paid');

  const firstPendingEmi = loan.amortizationSchedule.find(
    (row) => row.status !== 'paid' && row.status !== 'foreclosed'
  );

  if (firstPendingEmi && firstPendingEmi.emiNumber !== emiRow.emiNumber) {
    throw new Error(`Please pay EMI ${firstPendingEmi.emiNumber} before later installments`);
  }

  const unpaidPenalty = Math.max(0, toNumber(emiRow.penaltyAmount) - toNumber(emiRow.penaltyPaid));
  const amountDue = Math.round(toNumber(emiRow.emiAmount) + unpaidPenalty);
  const currentBalance = toNumber(paymentAccount.walletBalance);

  emiRow.attemptCount = toNumber(emiRow.attemptCount) + 1;

  if (currentBalance < amountDue) {
    if (!markMissedOnFailure) {
      throw new Error('Insufficient balance to pay this EMI');
    }

    if (isEmiGracePeriodActive(emiRow, now)) {
      emiRow.status = 'overdue';

      const [transaction] = await Transaction.create(
        [
          {
            transactionId: `LNEMIGRACE${Date.now()}`,
            sender: customer._id,
            senderName: customer.name,
            receiverName: SETTLEMENT_ACCOUNT_NAME,
            receiverType: 'bank',
            fromAccountNumber: paymentAccount.accountNumber,
            toAccountNumber: loan.loanId,
            amount: Math.max(1, amountDue),
            remarks: `EMI ${emiRow.emiNumber} auto deduction failed during grace period for loan ${loan.loanId}`,
            status: 'failed',
            failureReason: 'Insufficient balance during grace period',
            type: 'loan-emi-payment',
            ...getLoanTransactionMeta({
              loan,
              title: `Failed EMI payment for loan ${loan.loanId}`,
              subtitle: `EMI ${emiRow.emiNumber} could not be auto-deducted during grace period`,
            }),
          },
        ],
        { session }
      );

      appendRepaymentHistory(loan, {
        emiNumber: emiRow.emiNumber,
        paymentType: 'failed_emi',
        amount: amountDue,
        status: 'failed',
        transactionId: transaction.transactionId,
        accountNumber: paymentAccount.accountNumber,
        remarks: `Insufficient balance. EMI is overdue but within ${EMI_GRACE_PERIOD_DAYS}-day grace period.`,
      });

      await loan.save({ session });
      await writeSystemLog(
        {
          action: 'loan.emi.grace_period.customer',
          message: `EMI ${emiRow.emiNumber} for loan ${loan.loanId} could not be auto-paid due to insufficient balance. Grace period remains active.`,
          actor: customer._id,
          actorName: customer.name,
          entityType: 'Loan',
          entityId: loan.loanId,
          severity: 'warning',
          metadata: {
            loanId: loan.loanId,
            emiNumber: emiRow.emiNumber,
            amount: amountDue,
            gracePeriodDays: EMI_GRACE_PERIOD_DAYS,
            transactionId: transaction.transactionId,
            paymentAccountNumber: paymentAccount.accountNumber,
          },
        },
        { session }
      );

      await sendLoanEmail({
        customer,
        subject: `EMI payment overdue for loan ${loan.loanId}`,
        text: `Your EMI ${emiRow.emiNumber} payment could not be auto-paid due to insufficient balance. Please pay within ${EMI_GRACE_PERIOD_DAYS} days of the due date to avoid penalty.`,
        html: `<p>Your EMI <strong>${emiRow.emiNumber}</strong> payment for loan <strong>${loan.loanId}</strong> could not be auto-paid due to insufficient balance.</p><p>Please pay within <strong>${EMI_GRACE_PERIOD_DAYS} days</strong> of the due date to avoid penalty.</p>`,
      });

      return {
        paid: false,
        gracePeriodActive: true,
        emiRow,
        transaction,
        amountDue,
      };
    }

    const penaltyAmount = toNumber(emiRow.penaltyAmount) || calculateMissedEmiPenalty(emiRow.emiAmount);

    emiRow.status = 'missed';
    emiRow.missedAt = emiRow.missedAt || now;
    emiRow.penaltyAmount = penaltyAmount;
    loan.accruedPenalty = Math.max(0, toNumber(loan.accruedPenalty) + Math.max(0, penaltyAmount - unpaidPenalty));

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNEMIFAIL${Date.now()}`,
          sender: customer._id,
          senderName: customer.name,
          receiverName: SETTLEMENT_ACCOUNT_NAME,
          receiverType: 'bank',
          fromAccountNumber: paymentAccount.accountNumber,
          toAccountNumber: loan.loanId,
          amount: Math.max(1, amountDue),
          remarks: `Failed EMI ${emiRow.emiNumber} auto deduction for loan ${loan.loanId}`,
          status: 'failed',
          failureReason: 'Insufficient balance',
          type: 'loan-emi-payment',
          ...getLoanTransactionMeta({
            loan,
            title: `Failed EMI payment for loan ${loan.loanId}`,
            subtitle: `EMI ${emiRow.emiNumber} failed due to insufficient balance`,
          }),
        },
      ],
      { session }
    );

    appendRepaymentHistory(loan, {
      emiNumber: emiRow.emiNumber,
      paymentType: 'failed_emi',
      amount: amountDue,
      status: 'failed',
      transactionId: transaction.transactionId,
      accountNumber: paymentAccount.accountNumber,
      remarks: 'Insufficient balance. EMI marked missed and penalty initiated.',
    });

    await loan.save({ session });
    await writeSystemLog(
      {
        action: 'loan.emi.failed.customer',
        message: `EMI ${emiRow.emiNumber} for loan ${loan.loanId} failed because the repayment account had insufficient balance. Penalty added: ${money(penaltyAmount)}.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'danger',
        metadata: {
          loanId: loan.loanId,
          emiNumber: emiRow.emiNumber,
          amount: amountDue,
          penaltyAmount,
          transactionId: transaction.transactionId,
          paymentAccountNumber: paymentAccount.accountNumber,
        },
      },
      { session }
    );

    await sendLoanEmail({
      customer,
      subject: `EMI payment failed for loan ${loan.loanId}`,
      text: `Your EMI ${emiRow.emiNumber} payment failed due to insufficient balance. Penalty added: ${money(penaltyAmount)}.`,
      html: `<p>Your EMI <strong>${emiRow.emiNumber}</strong> payment for loan <strong>${loan.loanId}</strong> failed due to insufficient balance.</p><p>Penalty added: <strong>${money(penaltyAmount)}</strong>.</p>`,
    });

    return { paid: false, emiRow, transaction, amountDue, penaltyAmount };
  }

  paymentAccount.walletBalance = currentBalance - amountDue;
  paymentAccount.availableBalance = paymentAccount.walletBalance;

  const principalPaid = Math.min(getLoanOutstandingPrincipal(loan), toNumber(emiRow.principalComponent));
  const interestPaid = toNumber(emiRow.interestComponent);
  const penaltyPaid = unpaidPenalty;

  emiRow.status = 'paid';
  emiRow.paidAt = new Date();
  emiRow.penaltyPaid = toNumber(emiRow.penaltyPaid) + penaltyPaid;

  loan.outstandingPrincipal = Math.max(0, getLoanOutstandingPrincipal(loan) - principalPaid);
  loan.accruedPenalty = Math.max(0, toNumber(loan.accruedPenalty) - penaltyPaid);
  loan.accruedInterest = 0;
  loan.lastInterestCalculatedAt = emiRow.paidAt;
  loan.foreclosureFee = calculateForeclosureFee(loan.outstandingPrincipal);

  const isFullyPaid = loan.amortizationSchedule.every((row) =>
    ['paid', 'foreclosed'].includes(row.status)
  );

  if (isFullyPaid || loan.outstandingPrincipal <= 0) {
    loan.status = 'closed';
    loan.closedAt = new Date();
    loan.outstandingPrincipal = 0;
  }

  await paymentAccount.save({ session });
  await creditBankSettlement(amountDue, { session });

  const [transaction] = await Transaction.create(
    [
      {
        transactionId: `LNEMI${Date.now()}`,
        sender: customer._id,
        senderName: customer.name,
        receiverName: SETTLEMENT_ACCOUNT_NAME,
        receiverType: 'bank',
        fromAccountNumber: paymentAccount.accountNumber,
        toAccountNumber: loan.loanId,
        amount: amountDue,
        remarks: `EMI ${emiRow.emiNumber} payment for loan ${loan.loanId}`,
        status: 'success',
        type: 'loan-emi-payment',
        ...getLoanTransactionMeta({
          loan,
          title: `Loan EMI payment for loan ${loan.loanId}`,
          subtitle: `EMI ${emiRow.emiNumber}: principal ${money(principalPaid)}, interest ${money(interestPaid)}`,
        }),
      },
    ],
    { session }
  );

  appendRepaymentHistory(loan, {
    emiNumber: emiRow.emiNumber,
    paymentType,
    amount: amountDue,
    principalPaid,
    interestPaid,
    penaltyPaid,
    status: 'success',
    transactionId: transaction.transactionId,
    accountNumber: paymentAccount.accountNumber,
    remarks: `EMI ${emiRow.emiNumber} paid successfully.`,
  });

  await loan.save({ session });
  await writeSystemLog(
    {
      action: isFullyPaid ? 'loan.closed.customer' : 'loan.emi.paid',
      message: isFullyPaid
        ? `${customer.name} paid the final EMI and closed loan ${loan.loanId}.`
        : `${customer.name} paid EMI ${emiRow.emiNumber} for loan ${loan.loanId}.`,
      actor: customer._id,
      actorName: customer.name,
      entityType: 'Loan',
      entityId: loan.loanId,
      severity: 'success',
      metadata: {
        loanId: loan.loanId,
        transactionId: transaction.transactionId,
        emiNumber: emiRow.emiNumber,
        amount: amountDue,
        principalPaid,
        interestPaid,
        penaltyPaid,
        outstandingPrincipal: loan.outstandingPrincipal,
        status: loan.status,
        paymentAccountNumber: paymentAccount.accountNumber,
      },
    },
    { session }
  );

  await sendLoanEmail({
    customer,
    subject: `EMI paid for loan ${loan.loanId}`,
    text: `EMI ${emiRow.emiNumber} of ${money(amountDue)} was paid successfully. Outstanding principal: ${money(loan.outstandingPrincipal)}.`,
    html: `<p>EMI <strong>${emiRow.emiNumber}</strong> of <strong>${money(amountDue)}</strong> was paid successfully.</p><p>Outstanding principal: <strong>${money(loan.outstandingPrincipal)}</strong>.</p>`,
  });

  return { paid: true, emiRow, transaction, amountDue };
};

const disburseLoan = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (loan.status !== 'approved') throw new Error('Only approved loans can be disbursed');
    if (loan.sanctionLetter?.status !== 'accepted') {
      throw new Error('Customer must accept the loan sanction letter before disbursal');
    }
    if (loan.loanAgreement?.status !== 'accepted') {
      throw new Error('Customer must accept the loan agreement before disbursal');
    }

    const customer = await User.findById(loan.customer).session(session);
    if (!customer) throw new Error('Customer not found');

    const accounts = customer.accounts?.length ? customer.accounts : [customer.account].filter(Boolean);
    const targetAccount =
      accounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      accounts[0];

    if (!targetAccount?.accountNumber) {
      throw new Error('Customer does not have an active account for disbursement');
    }

    const bankAccount = await BankAccount.findOne({
      customerId: customer.customerId,
      accountNumber: targetAccount.accountNumber,
      accountStatus: 'active',
    }).session(session);

    if (!bankAccount) {
      throw new Error('Active customer bank account was not found for disbursement');
    }

    await debitBankSettlement(loan.amount, { session });

    bankAccount.walletBalance = toNumber(bankAccount.walletBalance) + loan.amount;
    bankAccount.availableBalance = toNumber(bankAccount.availableBalance) + loan.amount;
    await bankAccount.save({ session });

    if (customer.accounts?.length) {
      customer.accounts = customer.accounts.map((account) =>
        account.accountNumber === targetAccount.accountNumber
          ? { ...(account.toObject?.() || account), balance: toNumber(account.balance) + loan.amount }
          : account
      );
    }

    if (customer.account?.accountNumber === targetAccount.accountNumber) {
      customer.account.balance = toNumber(customer.account.balance) + loan.amount;
    }

    const disbursedAt = new Date();

    loan.status = 'disbursed';
    loan.disbursedAt = disbursedAt;
    loan.outstandingPrincipal = loan.amount;
    loan.accruedInterest = 0;
    loan.accruedPenalty = 0;
    loan.foreclosureFee = calculateForeclosureFee(loan.amount);
    loan.lastInterestCalculatedAt = disbursedAt;
    loan.amortizationSchedule = buildAmortizationSchedule({
      principal: loan.amount,
      annualInterestRate: loan.annualInterestRate,
      tenureMonths: loan.tenureMonths,
      startDate: disbursedAt,
    });
    loan.assignedManager = req.user._id;
    await customer.save({ session });
    await loan.save({ session });

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNDISB${Date.now()}`,
          receiver: customer._id,
          senderType: 'bank',
          senderName: SETTLEMENT_ACCOUNT_NAME,
          receiverName: customer.name,
          fromAccountNumber: SETTLEMENT_ACCOUNT_NUMBER,
          toAccountNumber: targetAccount.accountNumber,
          amount: loan.amount,
          remarks: `Loan ${loan.loanId} disbursed to customer account`,
          status: 'success',
          type: 'loan-disbursement',
          ...getLoanTransactionMeta({
            loan,
            title: `Loan disbursement for loan ${loan.loanId}`,
            subtitle: `${money(loan.amount)} credited to ${targetAccount.accountNumber}`,
            direction: 'credit',
          }),
        },
      ],
      { session }
    );

    await writeSystemLog(
      {
        action: 'loan.disbursed',
        message: `${req.user.name} disbursed loan ${loan.loanId} for ${money(loan.amount)}.`,
        actor: req.user._id,
        actorName: req.user.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          amount: loan.amount,
          customerName: customer.name,
          accountNumber: targetAccount.accountNumber,
          transactionId: transaction.transactionId,
        },
      },
      { session }
    );

    await writeSystemLog(
      {
        action: 'loan.disbursed.customer',
        message: `${money(loan.amount)} was disbursed for loan ${loan.loanId} to your account.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          amount: loan.amount,
          accountNumber: targetAccount.accountNumber,
          transactionId: transaction.transactionId,
        },
      },
      { session }
    );

    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId email classification')
      .populate('reviewedBy', 'name');
    try {
      await generateAndSendRepaymentSchedule(responseLoan);
      await responseLoan.save();

      await writeSystemLog({
        action: 'loan.repayment_schedule.generated',
        message: `Repayment schedule PDF generated for loan ${responseLoan.loanId}.`,
        actor: req.user._id,
        actorName: req.user.name,
        entityType: 'Loan',
        entityId: responseLoan.loanId,
        severity: 'success',
        metadata: {
          loanId: responseLoan.loanId,
          fileUrl: responseLoan.repaymentScheduleDocument?.fileUrl || '',
          emailStatus: responseLoan.repaymentScheduleDocument?.emailStatus || '',
        },
      });
    } catch (scheduleError) {
      console.error('Repayment schedule PDF generation failed:', scheduleError.message);
    }

    res.json({
      message: 'Loan amount disbursed to customer account. Repayment schedule PDF generated.',
      loan: await serializeLoanWithActiveLoanCount(responseLoan),
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const payLoanEmi = async (req, res) => {
  const emiNumber = Math.round(toNumber(req.params.emiNumber));
  const paymentAccountNumber = String(req.body.paymentAccountNumber || '').trim();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (String(loan.customer) !== String(req.user._id)) {
      throw new Error('You can pay EMI only for your own loan');
    }
    if (loan.status !== 'disbursed') {
      throw new Error('EMI payment is available only after loan disbursal');
    }
    if (!emiNumber || emiNumber < 1) {
      throw new Error('Select a valid EMI number');
    }

    const customer = await User.findById(req.user._id).session(session);

    if (!customer || customer.role !== 'customer') {
      throw new Error('Customer not found');
    }

    const bankAccounts = await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    }).session(session);
    const paymentAccount =
      (paymentAccountNumber
        ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
        : null) ||
      bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      bankAccounts[0];

    if (!paymentAccount) throw new Error('Active payment account not found');

    const result = await attemptLoanEmiDeduction({
      loan,
      customer,
      paymentAccount,
      emiNumber,
      paymentType: 'emi',
      session,
    });

    await syncCustomerAccounts(customer, { session });
    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId classification accounts account')
      .populate('reviewedBy', 'name');

    res.json({
      message: responseLoan.status === 'closed'
        ? 'Final EMI paid. Loan closed successfully.'
        : `EMI ${result.emiRow.emiNumber} paid successfully.`,
      loan: await serializeLoanWithActiveLoanCount(responseLoan),
      transaction: result.transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const runDueEmiProcessing = async ({ now = new Date() } = {}) => {
  const dueLoans = await Loan.find({
    status: 'disbursed',
    amortizationSchedule: {
      $elemMatch: {
        status: { $in: ['pending', 'missed', 'overdue'] },
        dueDate: { $lte: now },
      },
    },
  }).populate('customer', 'name email customerId classification accounts account');
  const results = [];

  for (const loan of dueLoans) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customer = await User.findById(loan.customer?._id || loan.customer).session(session);

      if (!customer) throw new Error('Customer not found');

      const dueEmi = loan.amortizationSchedule.find(
        (row) =>
          ['pending', 'missed', 'overdue'].includes(row.status) &&
          row.dueDate &&
          new Date(row.dueDate) <= now
      );

      if (!dueEmi) {
        await session.abortTransaction();
        continue;
      }

      const bankAccounts = await BankAccount.find({
        customerId: customer.customerId,
        accountStatus: 'active',
      }).session(session);
      const paymentAccount =
        bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
        bankAccounts[0];

      if (!paymentAccount) throw new Error('Active repayment account not found');

      const result = await attemptLoanEmiDeduction({
        loan,
        customer,
        paymentAccount,
        emiNumber: dueEmi.emiNumber,
        paymentType: 'auto_emi',
        markMissedOnFailure: true,
        now,
        session,
      });

      await syncCustomerAccounts(customer, { session });
      await session.commitTransaction();
      results.push({
        loanId: loan.loanId,
        emiNumber: dueEmi.emiNumber,
        status: result.paid ? 'paid' : result.gracePeriodActive ? 'overdue' : 'missed',
        amount: result.amountDue,
      });
    } catch (error) {
      await session.abortTransaction();
      results.push({
        loanId: loan.loanId,
        status: 'failed',
        message: error.message,
      });
    } finally {
      session.endSession();
    }
  }

  return results;
};

const getPreviousMonthWindow = (now = new Date()) => {
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodStart = new Date(periodEnd);
  periodStart.setMonth(periodStart.getMonth() - 1);

  return { periodStart, periodEnd };
};

const runMonthlyRepaymentProcessing = async ({ now = new Date() } = {}) => {
  const { periodStart, periodEnd } = getPreviousMonthWindow(now);
  const dueProcessingResults = await runDueEmiProcessing({ now });
  const loans = await Loan.find({
    $or: [
      {
        amortizationSchedule: {
          $elemMatch: {
            dueDate: { $gte: periodStart, $lt: periodEnd },
          },
        },
      },
      {
        repaymentHistory: {
          $elemMatch: {
            paidAt: { $gte: periodStart, $lt: periodEnd },
          },
        },
      },
    ],
  }).populate('customer', 'name customerId email');

  const summary = loans.reduce(
    (result, loan) => {
      const scheduleRows = (loan.amortizationSchedule || []).filter((row) => {
        const dueDate = row.dueDate ? new Date(row.dueDate) : null;
        return dueDate && dueDate >= periodStart && dueDate < periodEnd;
      });
      const repaymentRows = (loan.repaymentHistory || []).filter((entry) => {
        const paidAt = entry.paidAt ? new Date(entry.paidAt) : null;
        return paidAt && paidAt >= periodStart && paidAt < periodEnd;
      });
      const collectedAmount = repaymentRows.reduce(
        (sum, entry) => sum + toNumber(entry.status === 'success' ? entry.amount : 0),
        0
      );
      const penaltyCollected = repaymentRows.reduce(
        (sum, entry) => sum + toNumber(entry.status === 'success' ? entry.penaltyPaid : 0),
        0
      );
      const expectedAmount = scheduleRows.reduce(
        (sum, row) => sum + toNumber(row.status === 'foreclosed' ? 0 : row.emiAmount),
        0
      );
      const missedRows = scheduleRows.filter((row) => ['missed', 'overdue'].includes(row.status));

      result.expectedAmount += expectedAmount;
      result.collectedAmount += collectedAmount;
      result.penaltyCollected += penaltyCollected;
      result.dueEmiCount += scheduleRows.length;
      result.paidEmiCount += scheduleRows.filter((row) => row.status === 'paid').length;
      result.missedEmiCount += missedRows.length;
      result.delinquentAmount += missedRows.reduce(
        (sum, row) => sum + toNumber(row.emiAmount) + toNumber(row.penaltyAmount),
        0
      );

      if (scheduleRows.length || repaymentRows.length) {
        result.loanSummaries.push({
          loanId: loan.loanId,
          customerName: loan.customer?.name || 'Customer',
          customerId: loan.customer?.customerId || '',
          expectedAmount,
          collectedAmount,
          dueEmiCount: scheduleRows.length,
          missedEmiCount: missedRows.length,
        });
      }

      return result;
    },
    {
      periodStart,
      periodEnd,
      expectedAmount: 0,
      collectedAmount: 0,
      penaltyCollected: 0,
      dueEmiCount: 0,
      paidEmiCount: 0,
      missedEmiCount: 0,
      delinquentAmount: 0,
      loanSummaries: [],
    }
  );

  summary.collectionRate =
    summary.expectedAmount > 0
      ? Math.round((summary.collectedAmount / summary.expectedAmount) * 100)
      : 100;
  summary.dueProcessingResults = dueProcessingResults;

  await writeSystemLog({
    action: 'loan.monthly_repayment_processing',
    message: `Monthly loan repayment processing completed for ${formatDate(periodStart)} to ${formatDate(addDays(periodEnd, -1))}. Collection rate: ${summary.collectionRate}%.`,
    actorName: 'System',
    entityType: 'Loan',
    entityId: `${periodStart.toISOString().slice(0, 7)}`,
    severity: summary.missedEmiCount > 0 ? 'warning' : 'success',
    metadata: {
      periodStart,
      periodEnd,
      expectedAmount: summary.expectedAmount,
      collectedAmount: summary.collectedAmount,
      penaltyCollected: summary.penaltyCollected,
      dueEmiCount: summary.dueEmiCount,
      paidEmiCount: summary.paidEmiCount,
      missedEmiCount: summary.missedEmiCount,
      delinquentAmount: summary.delinquentAmount,
      collectionRate: summary.collectionRate,
      processedDueEmis: dueProcessingResults.length,
      loanSummaries: summary.loanSummaries.slice(0, 25),
    },
  });

  return summary;
};

const processDueEmis = async (req, res) => {
  const results = await runDueEmiProcessing();

  res.json({
    message: `Processed ${results.length} due EMI item(s).`,
    results,
  });
};

const processMonthlyRepayments = async (req, res) => {
  const summary = await runMonthlyRepaymentProcessing();

  res.json({
    message: `Monthly repayment processing completed with ${summary.collectionRate}% collection rate.`,
    summary,
  });
};

const forecloseLoan = async (req, res) => {
  const paymentAccountNumber = String(req.body.paymentAccountNumber || '').trim();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (String(loan.customer) !== String(req.user._id)) {
      throw new Error('You can foreclose only your own loan');
    }
    if (loan.status !== 'disbursed') {
      throw new Error('Foreclosure is available only after loan disbursal');
    }

    const customer = await User.findById(req.user._id).session(session);
    if (!customer) throw new Error('Customer not found');

    const bankAccounts = await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    }).session(session);
    const paymentAccount =
      (paymentAccountNumber
        ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
        : null) ||
      bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      bankAccounts[0];

    if (!paymentAccount) throw new Error('Active payment account not found');

    const quote = buildForeclosureQuote(loan);
    if (quote.totalPayable <= 0) throw new Error('No foreclosure amount is due');
    if (toNumber(paymentAccount.walletBalance) < quote.totalPayable) {
      throw new Error('Insufficient balance to foreclose this loan');
    }

    paymentAccount.walletBalance = toNumber(paymentAccount.walletBalance) - quote.totalPayable;
    paymentAccount.availableBalance = paymentAccount.walletBalance;
    await paymentAccount.save({ session });
    await creditBankSettlement(quote.totalPayable, { session });

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNFORE${Date.now()}`,
          sender: customer._id,
          senderName: customer.name,
          receiverName: SETTLEMENT_ACCOUNT_NAME,
          receiverType: 'bank',
          fromAccountNumber: paymentAccount.accountNumber,
          toAccountNumber: loan.loanId,
          amount: quote.totalPayable,
          remarks: `Foreclosure payment for loan ${loan.loanId}`,
          status: 'success',
          type: 'loan-foreclosure',
          ...getLoanTransactionMeta({
            loan,
            title: `Loan foreclosure for loan ${loan.loanId}`,
            subtitle: `Principal ${money(quote.outstandingPrincipal)}, interest ${money(quote.accruedInterest)}, fees ${money(quote.foreclosureFee + quote.unpaidPenalties)}`,
          }),
        },
      ],
      { session }
    );

    loan.amortizationSchedule = loan.amortizationSchedule.map((row) =>
      row.status === 'paid' ? row : { ...(row.toObject?.() || row), status: 'foreclosed' }
    );
    loan.outstandingPrincipal = 0;
    loan.accruedInterest = 0;
    loan.accruedPenalty = 0;
    loan.foreclosureFee = quote.foreclosureFee;
    loan.lastInterestCalculatedAt = new Date();
    loan.status = 'closed';
    loan.closedAt = new Date();
    appendRepaymentHistory(loan, {
      paymentType: 'foreclosure',
      amount: quote.totalPayable,
      principalPaid: quote.outstandingPrincipal,
      interestPaid: quote.accruedInterest,
      penaltyPaid: quote.unpaidPenalties,
      foreclosureFeePaid: quote.foreclosureFee,
      status: 'success',
      transactionId: transaction.transactionId,
      accountNumber: paymentAccount.accountNumber,
      remarks: 'Loan foreclosed by customer.',
    });
    await loan.save({ session });

    await writeSystemLog(
      {
        action: 'loan.foreclosed.customer',
        message: `${customer.name} foreclosed loan ${loan.loanId} by paying ${money(quote.totalPayable)}.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          transactionId: transaction.transactionId,
          amount: quote.totalPayable,
          ...quote,
        },
      },
      { session }
    );

    await sendLoanEmail({
      customer,
      subject: `Loan ${loan.loanId} foreclosed`,
      text: `Your loan was foreclosed. Total paid: ${money(quote.totalPayable)}.`,
      html: `<p>Your loan <strong>${loan.loanId}</strong> was foreclosed.</p><p>Total paid: <strong>${money(quote.totalPayable)}</strong>.</p>`,
    });

    await syncCustomerAccounts(customer, { session });
    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId classification accounts account')
      .populate('reviewedBy', 'name');

    res.json({
      message: 'Loan foreclosed successfully.',
      loan: await serializeLoanWithActiveLoanCount(responseLoan),
      transaction,
      quote,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

const makePartPayment = async (req, res) => {
  const paymentAccountNumber = String(req.body.paymentAccountNumber || '').trim();
  const amount = Math.round(toNumber(req.body.amount));
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await Loan.findOne({ loanId: req.params.id }).session(session);

    if (!loan) throw new Error('Loan application not found');
    if (String(loan.customer) !== String(req.user._id)) {
      throw new Error('You can make part-payments only for your own loan');
    }
    if (loan.status !== 'disbursed') {
      throw new Error('Part-payment is available only after loan disbursal');
    }
    if (amount <= 0) throw new Error('Enter a valid part-payment amount');

    const outstandingPrincipal = getLoanOutstandingPrincipal(loan);
    if (amount >= outstandingPrincipal) {
      throw new Error('Use foreclosure to clear the full outstanding principal');
    }

    const customer = await User.findById(req.user._id).session(session);
    if (!customer) throw new Error('Customer not found');

    const bankAccounts = await BankAccount.find({
      customerId: customer.customerId,
      accountStatus: 'active',
    }).session(session);
    const paymentAccount =
      (paymentAccountNumber
        ? bankAccounts.find((account) => account.accountNumber === paymentAccountNumber)
        : null) ||
      bankAccounts.find((account) => account.accountNumber === loan.disbursementAccountNumber) ||
      bankAccounts[0];

    if (!paymentAccount) throw new Error('Active payment account not found');
    if (toNumber(paymentAccount.walletBalance) < amount) {
      throw new Error('Insufficient balance for this part-payment');
    }

    paymentAccount.walletBalance = toNumber(paymentAccount.walletBalance) - amount;
    paymentAccount.availableBalance = paymentAccount.walletBalance;
    await paymentAccount.save({ session });
    await creditBankSettlement(amount, { session });

    const [transaction] = await Transaction.create(
      [
        {
          transactionId: `LNPART${Date.now()}`,
          sender: customer._id,
          senderName: customer.name,
          receiverName: SETTLEMENT_ACCOUNT_NAME,
          receiverType: 'bank',
          fromAccountNumber: paymentAccount.accountNumber,
          toAccountNumber: loan.loanId,
          amount,
          remarks: `Part-payment for loan ${loan.loanId}`,
          status: 'success',
          type: 'loan-part-payment',
          ...getLoanTransactionMeta({
            loan,
            title: `Loan part-payment for loan ${loan.loanId}`,
            subtitle: `${money(amount)} reduced outstanding principal`,
          }),
        },
      ],
      { session }
    );

    const paidRows = loan.amortizationSchedule.filter((row) => row.status === 'paid');
    const nextDueDate =
      loan.amortizationSchedule.find((row) => row.status !== 'paid')?.dueDate || new Date();
    const nextOutstandingPrincipal = Math.max(0, outstandingPrincipal - amount);
    const rebuiltRows = buildReducedTenureSchedule({
      principal: nextOutstandingPrincipal,
      annualInterestRate: loan.annualInterestRate,
      emiAmount: loan.emiAmount,
      startDate: addMonths(nextDueDate, -1),
      startingEmiNumber: paidRows.length + 1,
    });

    loan.outstandingPrincipal = nextOutstandingPrincipal;
    loan.foreclosureFee = calculateForeclosureFee(nextOutstandingPrincipal);
    loan.accruedInterest = getTotalAccruedInterest(loan);
    loan.lastInterestCalculatedAt = new Date();
    loan.amortizationSchedule = [
      ...paidRows.map((row) => row.toObject?.() || row),
      ...rebuiltRows,
    ];
    appendRepaymentHistory(loan, {
      paymentType: 'part_payment',
      amount,
      principalPaid: amount,
      status: 'success',
      transactionId: transaction.transactionId,
      accountNumber: paymentAccount.accountNumber,
      remarks: 'Part-payment reduced outstanding principal and future tenure.',
    });
    await loan.save({ session });

    await writeSystemLog(
      {
        action: 'loan.part_payment.customer',
        message: `${customer.name} made a part-payment of ${money(amount)} for loan ${loan.loanId}.`,
        actor: customer._id,
        actorName: customer.name,
        entityType: 'Loan',
        entityId: loan.loanId,
        severity: 'success',
        metadata: {
          loanId: loan.loanId,
          transactionId: transaction.transactionId,
          amount,
          outstandingPrincipal: nextOutstandingPrincipal,
        },
      },
      { session }
    );

    await sendLoanEmail({
      customer,
      subject: `Part-payment posted for loan ${loan.loanId}`,
      text: `Your part-payment of ${money(amount)} was posted. Outstanding principal: ${money(nextOutstandingPrincipal)}.`,
      html: `<p>Your part-payment of <strong>${money(amount)}</strong> was posted for loan <strong>${loan.loanId}</strong>.</p><p>Outstanding principal: <strong>${money(nextOutstandingPrincipal)}</strong>.</p>`,
    });

    await syncCustomerAccounts(customer, { session });
    await session.commitTransaction();

    const responseLoan = await Loan.findById(loan._id)
      .populate('customer', 'name customerId classification accounts account')
      .populate('reviewedBy', 'name');

    res.json({
      message: 'Part-payment posted successfully. Future schedule has been recalculated.',
      loan: await serializeLoanWithActiveLoanCount(responseLoan),
      transaction,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = {
  acceptLoanAgreement,
  acceptSanctionLetter,
  createLoan,
  disburseLoan,
  forecloseLoan,
  getLoans,
  makePartPayment,
  payLoanEmi,
  processDueEmis,
  processMonthlyRepayments,
  runDueEmiProcessing,
  runMonthlyRepaymentProcessing,
  reviewLoanDocument,
  reviewLoan,
};
