const BusinessRuleConfig = require('../models/BusinessRuleConfig');
const SystemLog = require('../models/SystemLog');
const Tier = require('../models/Tier');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
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

const getBusinessRuleConfig = async () => {
  const config = await BusinessRuleConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $setOnInsert: {
        key: 'global',
        managerTierPermissions: DEFAULT_MANAGER_TIER_PERMISSIONS,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return config;
};

const serializeBusinessRuleConfig = (config) => ({
  id: config._id,
  managerTierPermissions: {
    ...DEFAULT_MANAGER_TIER_PERMISSIONS,
    ...(config.managerTierPermissions?.toObject?.() || config.managerTierPermissions || {}),
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

  const config = await BusinessRuleConfig.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        managerTierPermissions: nextPermissions,
        updatedBy: req.user._id,
        updatedByName: req.user.name,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await writeSystemLog({
    action: 'business.rules.updated',
    message: `${req.user.name} updated manager tier-edit permissions.`,
    actor: req.user._id,
    actorName: req.user.name,
    entityType: 'BusinessRuleConfig',
    entityId: 'global',
    severity: 'info',
    metadata: {
      managerTierPermissions: nextPermissions,
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
