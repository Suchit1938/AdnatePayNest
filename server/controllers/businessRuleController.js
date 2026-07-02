const BusinessRuleConfig = require('../models/BusinessRuleConfig');
const SystemLog = require('../models/SystemLog');
const Tier = require('../models/Tier');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const {
  DEFAULT_EMI_PENALTY_POLICY,
  DEFAULT_LOAN_DECISION_BANDS,
  DEFAULT_LOAN_SCORE_WEIGHTS,
  DEFAULT_LOAN_TYPE_RULES,
  DEFAULT_PART_PAYMENT_POLICY,
  normalizeLoanRules,
} = require('../utils/loanRules');
const { writeSystemLog } = require('../utils/systemLog');

const MANAGER_TIER_PERMISSION_FIELDS = [
  'perTxnLimit',
  'dailyLimit',
  'monthlyLimit',
  'accountTypeOdRules',
  'penaltyAmount',
  'interestRate',
];

const DEFAULT_MANAGER_TIER_PERMISSIONS = MANAGER_TIER_PERMISSION_FIELDS.reduce(
  (permissions, field) => ({
    ...permissions,
    [field]: false,
  }),
  {}
);

const DEFAULT_DEPOSIT_RATE_CARDS = [
  {
    productType: 'fd',
    label: 'FD 1 year',
    minTenureMonths: 12,
    maxTenureMonths: 12,
    annualInterestRate: 7,
    minAmount: 1000,
  },
  {
    productType: 'fd',
    label: 'FD 2 years',
    minTenureMonths: 24,
    maxTenureMonths: 24,
    annualInterestRate: 7.25,
    minAmount: 1000,
  },
  {
    productType: 'fd',
    label: 'FD 5 years',
    minTenureMonths: 60,
    maxTenureMonths: 60,
    annualInterestRate: 7.75,
    minAmount: 1000,
  },
  {
    productType: 'rd',
    label: 'RD 6 months',
    minTenureMonths: 6,
    maxTenureMonths: 6,
    annualInterestRate: 6.25,
    minAmount: 500,
  },
  {
    productType: 'rd',
    label: 'RD 1 year',
    minTenureMonths: 12,
    maxTenureMonths: 12,
    annualInterestRate: 6.75,
    minAmount: 500,
  },
  {
    productType: 'rd',
    label: 'RD 2 years',
    minTenureMonths: 24,
    maxTenureMonths: 24,
    annualInterestRate: 7.25,
    minAmount: 500,
  },
];

const toNumber = (value) => Number(value || 0);

const normalizeDepositRateCards = (rateCards = []) => {
  const sourceCards = Array.isArray(rateCards) && rateCards.length
    ? rateCards
    : DEFAULT_DEPOSIT_RATE_CARDS;

  return DEFAULT_DEPOSIT_RATE_CARDS.map((template) => {
    const matchingRule = sourceCards.find(
      (rule) =>
        (rule.productType === 'rd' ? 'rd' : 'fd') === template.productType &&
        Math.round(toNumber(rule.minTenureMonths)) === template.minTenureMonths
    );

    return {
      ...template,
      annualInterestRate: Math.max(
        0,
        toNumber(matchingRule?.annualInterestRate ?? template.annualInterestRate)
      ),
      minAmount: Math.max(
        0,
        Math.round(toNumber(matchingRule?.minAmount ?? template.minAmount))
      ),
    };
  });
};

const getBusinessRuleConfig = async () => {
  const config = await BusinessRuleConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $setOnInsert: {
        key: 'global',
        managerTierPermissions: DEFAULT_MANAGER_TIER_PERMISSIONS,
        loanRules: {
          loanTypes: DEFAULT_LOAN_TYPE_RULES,
          scoreWeights: DEFAULT_LOAN_SCORE_WEIGHTS,
          decisionBands: DEFAULT_LOAN_DECISION_BANDS,
          partPaymentPolicy: DEFAULT_PART_PAYMENT_POLICY,
          emiPenaltyPolicy: DEFAULT_EMI_PENALTY_POLICY,
        },
        depositRules: {
          rateCards: DEFAULT_DEPOSIT_RATE_CARDS,
        },
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  if (!config.depositRules?.rateCards?.length) {
    config.depositRules = {
      ...(config.depositRules || {}),
      rateCards: DEFAULT_DEPOSIT_RATE_CARDS,
    };
    await config.save();
  }

  return config;
};

const serializeBusinessRuleConfig = (config) => ({
  id: config._id,
  managerTierPermissions: {
    ...DEFAULT_MANAGER_TIER_PERMISSIONS,
    ...(config.managerTierPermissions?.toObject?.() || config.managerTierPermissions || {}),
  },
  loanRules: normalizeLoanRules(config.loanRules),
  depositRules: {
    rateCards: normalizeDepositRateCards(config.depositRules?.rateCards),
  },
  updatedByName: config.updatedByName,
  updatedAt: config.updatedAt,
});

const getBusinessRules = async (req, res) => {
  const [config, auditLogs] = await Promise.all([
    getBusinessRuleConfig(),
    SystemLog.find({
      action: {
        $in: [
          'business.rules.updated',
          'manual.message.admin',
          'tier.policy.updated.admin',
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(12),
  ]);

  res.json({
    config: serializeBusinessRuleConfig(config),
    auditLogs: auditLogs.map((log) => ({
      id: log._id,
      action: log.action,
      message: log.message,
      actorName: log.actorName,
      severity: log.severity,
      createdAt: log.createdAt,
      metadata: log.metadata || {},
    })),
  });
};

const updateBusinessRules = async (req, res) => {
  const nextPermissions = {};

  MANAGER_TIER_PERMISSION_FIELDS.forEach((field) => {
    nextPermissions[field] = req.body.managerTierPermissions?.[field] === true;
  });
  const currentConfig = await getBusinessRuleConfig();
  const currentLoanRules = normalizeLoanRules(currentConfig.loanRules);
  const incomingLoanRules = req.body.loanRules || {};
  const nextLoanTypes = Array.isArray(incomingLoanRules.loanTypes)
    ? incomingLoanRules.loanTypes.map((rule, index) => {
      const fallback = currentLoanRules.loanTypes[index] || DEFAULT_LOAN_TYPE_RULES[index] || {};

      return {
        key: fallback.key || rule.key,
        label: fallback.label || rule.label,
        annualInterestRate: Math.max(0, Number(rule.annualInterestRate || fallback.annualInterestRate || 0)),
        minAmount: Math.max(0, Number(rule.minAmount || fallback.minAmount || 0)),
        maxAmount: Math.max(0, Number(rule.maxAmount || fallback.maxAmount || 0)),
        minTenureMonths: Math.max(1, Number(rule.minTenureMonths || fallback.minTenureMonths || 1)),
        maxTenureMonths: Math.max(1, Number(rule.maxTenureMonths || fallback.maxTenureMonths || 1)),
      };
    })
    : currentLoanRules.loanTypes;
  const incomingScoreWeights = {
    ...currentLoanRules.scoreWeights,
    ...(incomingLoanRules.scoreWeights || {}),
  };
  const nextScoreWeights = Object.keys(DEFAULT_LOAN_SCORE_WEIGHTS).reduce(
    (weights, field) => ({
      ...weights,
      [field]: Math.min(100, Math.max(0, Number(incomingScoreWeights[field] || 0))),
    }),
    {}
  );
  const scoreWeightTotal = Object.values(nextScoreWeights).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );

  if (Math.abs(scoreWeightTotal - 100) >= 0.001) {
    return res.status(400).json({
      message: 'Eligibility score weights must total 100%.',
    });
  }
  const nextDecisionBands = {
    ...currentLoanRules.decisionBands,
    ...(incomingLoanRules.decisionBands || {}),
  };
  const incomingPartPaymentPolicy = incomingLoanRules.partPaymentPolicy || {};
  const nextPartPaymentPolicy = {
    enabled: incomingPartPaymentPolicy.enabled !== false,
    minimumAmount: Math.max(0, Number(
      incomingPartPaymentPolicy.minimumAmount ?? currentLoanRules.partPaymentPolicy.minimumAmount
    )),
    minimumPrincipalPercentage: Math.min(100, Math.max(0, Number(
      incomingPartPaymentPolicy.minimumPrincipalPercentage ??
        currentLoanRules.partPaymentPolicy.minimumPrincipalPercentage
    ))),
    lockInMonths: Math.max(0, Math.round(Number(
      incomingPartPaymentPolicy.lockInMonths ?? currentLoanRules.partPaymentPolicy.lockInMonths
    ))),
    chargePercentage: Math.min(100, Math.max(0, Number(
      incomingPartPaymentPolicy.chargePercentage ?? currentLoanRules.partPaymentPolicy.chargePercentage
    ))),
  };
  const incomingEmiPenaltyPolicy = incomingLoanRules.emiPenaltyPolicy || {};
  const nextEmiPenaltyPolicy = {
    gracePeriodDays: Math.max(0, Math.round(Number(
      incomingEmiPenaltyPolicy.gracePeriodDays ?? currentLoanRules.emiPenaltyPolicy.gracePeriodDays
    ))),
    fixedPenaltyAmount: Math.max(0, Number(
      incomingEmiPenaltyPolicy.fixedPenaltyAmount ?? currentLoanRules.emiPenaltyPolicy.fixedPenaltyAmount
    )),
    penaltyRatePercentage: Math.min(100, Math.max(0, Number(
      incomingEmiPenaltyPolicy.penaltyRatePercentage ?? currentLoanRules.emiPenaltyPolicy.penaltyRatePercentage
    ))),
  };
  const nextDepositRateCards = normalizeDepositRateCards(req.body.depositRules?.rateCards);

  const config = await BusinessRuleConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        managerTierPermissions: nextPermissions,
        loanRules: {
          loanTypes: nextLoanTypes,
          scoreWeights: nextScoreWeights,
          decisionBands: nextDecisionBands,
          partPaymentPolicy: nextPartPaymentPolicy,
          emiPenaltyPolicy: nextEmiPenaltyPolicy,
        },
        depositRules: {
          rateCards: nextDepositRateCards,
        },
        updatedBy: req.user._id,
        updatedByName: req.user.name,
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  await writeSystemLog({
    action: 'business.rules.updated',
    message: `${req.user.name} updated business permissions, loan policy rules, and deposit product rules.`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'BusinessRuleConfig',
    entityId: 'global',
    severity: 'info',
    metadata: {
      managerTierPermissions: nextPermissions,
      loanRules: {
        loanTypes: nextLoanTypes,
        scoreWeights: nextScoreWeights,
        decisionBands: nextDecisionBands,
        partPaymentPolicy: nextPartPaymentPolicy,
        emiPenaltyPolicy: nextEmiPenaltyPolicy,
      },
      depositRules: {
        rateCards: nextDepositRateCards,
      },
    },
  });

  res.json({
    message: 'Business rules updated.',
    config: serializeBusinessRuleConfig(config),
  });
};

const getMessageRecipients = async ({ targetType, targetUserId, targetTier }) => {
  if (targetType === 'manager') {
    return User.find({ role: 'manager', status: 'active' }).select('name email role customerId employeeId');
  }

  if (targetType === 'customer') {
    return User.find({ _id: targetUserId, role: 'customer' }).select('name email role customerId employeeId');
  }

  if (targetType === 'allCustomers') {
    return User.find({ role: 'customer', status: 'active' }).select('name email role customerId employeeId');
  }

  if (targetType === 'customersByTier') {
    const tier = await Tier.findOne({ name: targetTier }).select('name');

    if (!tier) return [];

    return User.find({
      role: 'customer',
      status: 'active',
      classification: tier.name,
    }).select('name email role customerId employeeId classification');
  }

  if (targetType === 'allUsers') {
    return User.find({
      role: { $in: ['customer', 'manager'] },
      status: 'active',
    }).select('name email role customerId employeeId');
  }

  return [];
};

const sendManualMessage = async (req, res) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  const targetType = String(req.body.targetType || '').trim();
  const targetUserId = req.body.targetUserId;
  const targetTier = String(req.body.targetTier || '').trim();
  const sendEmailAlso = req.body.sendEmail === true;

  if (!title || !body) {
    return res.status(400).json({ message: 'Message title and body are required' });
  }

  if (!['manager', 'customer', 'customersByTier', 'allCustomers', 'allUsers'].includes(targetType)) {
    return res.status(400).json({ message: 'Select a valid message target' });
  }

  if (targetType === 'customer' && !targetUserId) {
    return res.status(400).json({ message: 'Select a customer before sending the message' });
  }

  if (targetType === 'customersByTier' && !targetTier) {
    return res.status(400).json({ message: 'Select a classification before sending the message' });
  }

  const recipients = await getMessageRecipients({ targetType, targetUserId, targetTier });

  if (recipients.length === 0) {
    return res.status(404).json({ message: 'No recipients found for this message' });
  }

  await Promise.all(
    recipients.map((recipient) =>
      writeSystemLog({
        action: 'manual.message',
        message: `${title}: ${body}`,
        actor: recipient._id,
        actorName: recipient.name,
        entityType: 'ManualMessage',
        entityId: targetType,
        severity: 'info',
        metadata: {
          title,
          body,
          targetType,
          targetTier,
          recipientRole: recipient.role,
          sentBy: req.user.name,
          sentById: req.user._id,
        },
      })
    )
  );

  let email = {
    totalRecipients: 0,
    sent: 0,
    failed: 0,
  };

  if (sendEmailAlso) {
    const emailRecipients = recipients.filter((recipient) => recipient.email);
    const results = await Promise.all(
      emailRecipients.map((recipient) =>
        sendEmail({
          to: recipient.email,
          subject: title,
          text: `Hello ${recipient.name},\n\n${body}\n\nRegards,\nAdnate PayNest`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#0f172a;">
              <p>Hello ${recipient.name},</p>
              <p>${body.replace(/\n/g, '<br />')}</p>
              <p>Regards,<br /><strong>Adnate PayNest</strong></p>
            </div>
          `,
        })
      )
    );

    email = {
      totalRecipients: emailRecipients.length,
      sent: results.filter((result) => result.sent).length,
      failed: results.filter((result) => !result.sent).length,
    };
  }

  await writeSystemLog({
    action: 'manual.message.admin',
    message: `${req.user.name} sent "${title}" to ${recipients.length} recipient(s).`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'ManualMessage',
    entityId: targetType,
    severity: 'success',
    metadata: {
      title,
      body,
      targetType,
      targetTier,
      recipientCount: recipients.length,
      sendEmail: sendEmailAlso,
      email,
    },
  });

  res.status(201).json({
    message: `Message sent to ${recipients.length} recipient(s).`,
    recipientCount: recipients.length,
    email,
  });
};

module.exports = {
  DEFAULT_MANAGER_TIER_PERMISSIONS,
  MANAGER_TIER_PERMISSION_FIELDS,
  getBusinessRuleConfig,
  getBusinessRules,
  sendManualMessage,
  updateBusinessRules,
};
