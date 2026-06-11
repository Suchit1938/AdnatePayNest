const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const User = require('../models/User');
const { writeSystemLog } = require('../utils/systemLog');

const tierFieldLabels = {
  label: 'Classification name',
  perTxnLimit: 'Per transaction limit',
  dailyLimit: 'Daily limit',
  monthlyLimit: 'Monthly limit',
  maxODLimit: 'Overdraft limit',
  minBalance: 'Minimum balance',
  payoffDays: 'Payoff days',
  penaltyAmount: 'Penalty amount',
  reviewCycle: 'Review cycle',
  lateFeeRate: 'Late fee rate',
  settlementWindow: 'Settlement window',
  eligibility: 'Eligibility',
  reviewNotes: 'Review notes',
};

const moneyFields = new Set([
  'perTxnLimit',
  'dailyLimit',
  'monthlyLimit',
  'maxODLimit',
  'minBalance',
  'penaltyAmount',
]);

const numberFields = new Set([
  ...moneyFields,
  'payoffDays',
]);

const formatTierValue = (field, value) => {
  if (moneyFields.has(field)) {
    return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
  }

  if (field === 'payoffDays') {
    const days = Number(value || 0);
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  return String(value || '').trim() || 'not set';
};

const getTierPolicyChanges = (existingTier, update) =>
  Object.entries(update)
    .filter(([field, nextValue]) => {
      const currentValue = existingTier[field];

      if (numberFields.has(field)) {
        return Number(currentValue || 0) !== Number(nextValue || 0);
      }

      return String(currentValue || '').trim() !== String(nextValue || '').trim();
    })
    .map(([field, nextValue]) => ({
      field,
      label: tierFieldLabels[field] || field,
      from: formatTierValue(field, existingTier[field]),
      to: formatTierValue(field, nextValue),
    }));

const summarizeTierPolicyChanges = (changes) =>
  changes
    .slice(0, 4)
    .map((change) => `${change.label} changed from ${change.from} to ${change.to}`)
    .join('; ');

const serializeTier = (tier, stats = {}) => ({
  id: tier._id,
  key: tier.name,
  name: tier.name,
  label: tier.label,
  perTxnLimit: tier.perTxnLimit,
  dailyLimit: tier.dailyLimit,
  monthlyLimit: tier.monthlyLimit,
  maxODLimit: tier.maxODLimit,
  minBalance: tier.minBalance,
  payoffDays: tier.payoffDays,
  penaltyAmount: tier.penaltyAmount,
  reviewCycle: tier.reviewCycle,
  lateFeeRate: tier.lateFeeRate,
  settlementWindow: tier.settlementWindow,
  eligibility: tier.eligibility,
  reviewNotes: tier.reviewNotes,
  customerCount: stats.customerCount || 0,
  odBlockedAccounts: stats.odBlockedAccounts || 0,
  odCountThisMonth: stats.odCountThisMonth || 0,
});

const slugifyTierName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validateTierPayload = (payload, { partial = false } = {}) => {
  const numericFields = [
    'perTxnLimit',
    'dailyLimit',
    'monthlyLimit',
    'maxODLimit',
    'minBalance',
    'payoffDays',
    'penaltyAmount',
  ];
  const textFields = [
    'label',
    'reviewCycle',
    'lateFeeRate',
    'settlementWindow',
    'eligibility',
    'reviewNotes',
  ];

  for (const field of numericFields) {
    if (partial && payload[field] === undefined) continue;

    const value = Number(payload[field]);
    if (!Number.isFinite(value) || value < 0) {
      return `${field} must be 0 or greater`;
    }
  }

  if (
    payload.perTxnLimit !== undefined &&
    payload.dailyLimit !== undefined &&
    Number(payload.perTxnLimit) > Number(payload.dailyLimit)
  ) {
    return 'Per transaction limit cannot be greater than daily limit';
  }

  if (
    payload.dailyLimit !== undefined &&
    payload.monthlyLimit !== undefined &&
    Number(payload.dailyLimit) > Number(payload.monthlyLimit)
  ) {
    return 'Daily limit cannot be greater than monthly limit';
  }

  if (payload.payoffDays !== undefined && Number(payload.payoffDays) <= 0) {
    return 'Payoff days must be greater than 0';
  }

  for (const field of textFields) {
    if (partial && payload[field] === undefined) continue;

    if (!String(payload[field] || '').trim()) {
      return `${field} is required`;
    }
  }

  return '';
};

const buildTierStats = async () => {
  const [users, totalUsers, totalManagers] = await Promise.all([
    User.find({ role: 'customer' }).select('classification customerId'),
    User.countDocuments({ role: { $in: ['customer', 'manager'] } }),
    User.countDocuments({ role: 'manager' }),
  ]);
  const statsByTier = {};
  let classifiedCustomerCount = 0;

  for (const user of users) {
    const tier = user.classification;

    if (!tier) continue;

    classifiedCustomerCount += 1;
    statsByTier[tier] ||= {
      customerCount: 0,
      odBlockedAccounts: 0,
      odCountThisMonth: 0,
      customerIds: [],
    };
    statsByTier[tier].customerCount += 1;

    if (user.customerId) {
      statsByTier[tier].customerIds.push(user.customerId);
    }
  }

  await Promise.all(
    Object.entries(statsByTier).map(async ([tier, stats]) => {
      const accounts = await BankAccount.find({
        customerId: { $in: stats.customerIds },
      }).select('odBlocked odCountThisMonth');

      statsByTier[tier].odBlockedAccounts = accounts.filter(
        (account) => account.odBlocked
      ).length;
      statsByTier[tier].odCountThisMonth = accounts.reduce(
        (sum, account) => sum + Number(account.odCountThisMonth || 0),
        0
      );
    })
  );

  return {
    statsByTier,
    summary: {
      totalUsers,
      totalCustomers: users.length,
      totalManagers,
      classifiedCustomerCount,
      unclassifiedCustomerCount: Math.max(0, users.length - classifiedCustomerCount),
    },
  };
};

const listTiers = async (req, res) => {
  const [tiers, tierStats] = await Promise.all([
    Tier.find().sort({ maxODLimit: 1 }),
    buildTierStats(),
  ]);

  res.json({
    tiers: tiers.map((tier) => serializeTier(tier, tierStats.statsByTier[tier.name])),
    summary: tierStats.summary,
  });
};

const getCustomerPolicy = async (req, res) => {
  const classification = req.user?.classification;
  const tier =
    (classification && (await Tier.findOne({ name: classification }))) ||
    (await Tier.findOne().sort({ maxODLimit: 1 }));
  const tiers = await Tier.find().sort({ maxODLimit: 1 });

  if (!tier) {
    return res.status(404).json({ message: 'Tier policy not found' });
  }

  res.json({
    tier: serializeTier(tier),
    tiers: tiers.map((item) => serializeTier(item)),
  });
};

const createTier = async (req, res) => {
  const label = String(req.body.label || req.body.name || '').trim();
  const name = slugifyTierName(req.body.name || label);

  if (!label || !name) {
    return res.status(400).json({ message: 'Classification name is required' });
  }

  const duplicateTier = await Tier.findOne({
    $or: [
      { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
      { label: { $regex: `^${escapeRegex(label)}$`, $options: 'i' } },
    ],
  });

  if (duplicateTier) {
    return res.status(409).json({ message: 'Classification name already exists' });
  }

  const validationMessage = validateTierPayload({ ...req.body, label });
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }

  const tier = await Tier.create({
    name,
    label,
    perTxnLimit: Number(req.body.perTxnLimit),
    dailyLimit: Number(req.body.dailyLimit),
    monthlyLimit: Number(req.body.monthlyLimit),
    maxODLimit: Number(req.body.maxODLimit),
    minBalance: Number(req.body.minBalance),
    payoffDays: Number(req.body.payoffDays),
    penaltyAmount: Number(req.body.penaltyAmount),
    reviewCycle: req.body.reviewCycle,
    lateFeeRate: req.body.lateFeeRate,
    settlementWindow: req.body.settlementWindow,
    eligibility: req.body.eligibility,
    reviewNotes: req.body.reviewNotes,
  });

  res.status(201).json({ tier: serializeTier(tier) });
};

const updateTier = async (req, res) => {
  const { name } = req.params;
  const existingTier = await Tier.findOne({ name });

  if (!existingTier) {
    return res.status(404).json({ message: 'Tier not found' });
  }

  if (req.body.label !== undefined) {
    const nextLabel = String(req.body.label || '').trim();

    if (!nextLabel) {
      return res.status(400).json({ message: 'label is required' });
    }

    const duplicateTier = await Tier.findOne({
      _id: { $ne: existingTier._id },
      label: { $regex: `^${escapeRegex(nextLabel)}$`, $options: 'i' },
    });

    if (duplicateTier) {
      return res.status(409).json({ message: 'Classification name already exists' });
    }
  }

  const allowedFields = [
    'label',
    'perTxnLimit',
    'dailyLimit',
    'monthlyLimit',
    'maxODLimit',
    'minBalance',
    'payoffDays',
    'penaltyAmount',
    'reviewCycle',
    'lateFeeRate',
    'settlementWindow',
    'eligibility',
    'reviewNotes',
  ];
  const update = {};
  const validationMessage = validateTierPayload(req.body, { partial: true });

  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      update[field] = ['label', 'reviewCycle', 'lateFeeRate', 'settlementWindow', 'eligibility', 'reviewNotes'].includes(field)
        ? req.body[field]
        : Number(req.body[field] || 0);
    }
  }

  const policyChanges = getTierPolicyChanges(existingTier, update);
  const tier = await Tier.findOneAndUpdate({ name }, update, {
    new: true,
    runValidators: true,
  });

  await User.updateMany(
    { role: 'customer', classification: tier.name },
    {
      $set: {
        'account.overdraftLimit': tier.maxODLimit,
        'accounts.$[].overdraftLimit': tier.maxODLimit,
        'account.transferLimit': tier.perTxnLimit,
        'accounts.$[].transferLimit': tier.perTxnLimit,
      },
    }
  );

  const tierCustomers = await User.find({
    role: 'customer',
    classification: tier.name,
  }).select('name customerId');
  const customerIds = tierCustomers
    .map((user) => user.customerId)
    .filter(Boolean);

  if (customerIds.length > 0) {
    await BankAccount.updateMany(
      { customerId: { $in: customerIds } },
      {
        $set: {
          transferLimit: tier.perTxnLimit,
          withdrawalLimit: tier.dailyLimit,
          odLimit: tier.maxODLimit,
        },
      }
    );
  }

  if (policyChanges.length > 0 && tierCustomers.length > 0) {
    const changeSummary = summarizeTierPolicyChanges(policyChanges);
    const extraChangeCount = Math.max(0, policyChanges.length - 4);
    const updatedByName = req.user?.name || 'Admin';
    const messageSuffix =
      extraChangeCount > 0
        ? `${changeSummary}; and ${extraChangeCount} more change${extraChangeCount === 1 ? '' : 's'}.`
        : `${changeSummary}.`;

    await Promise.all(
      tierCustomers.map((customer) =>
        writeSystemLog({
          action: 'tier.policy.updated.customer',
          message: `Your ${tier.label} tier policy was updated by ${updatedByName}. ${messageSuffix}`,
          actor: customer._id,
          actorName: customer.name,
          entityType: 'Tier',
          entityId: tier.name,
          severity: 'info',
          metadata: {
            tierName: tier.name,
            tierLabel: tier.label,
            customerId: customer.customerId,
            customerName: customer.name,
            updatedBy: updatedByName,
            updatedById: req.user._id,
            changes: policyChanges,
          },
        })
      )
    );
  }

  res.json({ tier: serializeTier(tier) });
};

const deleteTier = async (req, res) => {
  const { name } = req.params;
  const tier = await Tier.findOne({ name });

  if (!tier) {
    return res.status(404).json({ message: 'Tier not found' });
  }

  const assignedCustomers = await User.find({
    role: 'customer',
    classification: tier.name,
  })
    .select('name email customerId')
    .limit(5);
  const assignedCustomerCount = await User.countDocuments({
    role: 'customer',
    classification: tier.name,
  });

  if (assignedCustomerCount > 0) {
    return res.status(409).json({
      message: `Cannot delete ${tier.label} classification because ${assignedCustomerCount} customer(s) are assigned to it.`,
      assignedCustomerCount,
      assignedCustomers,
    });
  }

  await Tier.deleteOne({ _id: tier._id });

  res.json({ message: `${tier.label} classification deleted.` });
};

module.exports = { createTier, deleteTier, getCustomerPolicy, listTiers, updateTier };
