const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { ACCOUNT_TYPES, DEFAULT_MONTHLY_OD_USES, getAccountTypeOdRules } = require('../utils/accountTypeOdPolicy');
const { syncCustomerAccounts } = require('../utils/customerAccounts');
const { writeSystemLog } = require('../utils/systemLog');
const {
  getBusinessRuleConfig,
  DEFAULT_MANAGER_TIER_PERMISSIONS,
} = require('./businessRuleController');

const GRACE_PERIOD_DAYS = 3;
const REVIEW_CYCLE = 'Monthly';
const OVERDRAFT_DUE_RULE = 'Due before month-end';

const tierFieldLabels = {
  label: 'Classification name',
  perTxnLimit: 'Per transaction limit',
  dailyLimit: 'Daily limit',
  monthlyLimit: 'Monthly limit',
  maxODLimit: 'Overdraft limit',
  penaltyAmount: 'Penalty amount',
  lateFeeRate: 'Interest rate',
  interestRate: 'Interest rate',
  eligibility: 'Eligibility',
  reviewNotes: 'Review notes',
  accountTypeOdRules: 'Account type OD rules',
};

const moneyFields = new Set([
  'perTxnLimit',
  'dailyLimit',
  'monthlyLimit',
  'maxODLimit',
  'penaltyAmount',
]);

const numberFields = new Set([
  ...moneyFields,
]);

const formatTierValue = (field, value) => {
  if (field === 'accountTypeOdRules') {
    return (Array.isArray(value) ? value : [])
      .map((rule) => `${rule.accountType}: OD INR ${Number(rule.odLimit || 0).toLocaleString('en-IN')}, minimum opening INR ${Number(rule.minOpeningBalance || 0).toLocaleString('en-IN')}, ${Number(rule.monthlyOdUses || DEFAULT_MONTHLY_OD_USES)} monthly uses`)
      .join(', ') || 'not set';
  }

  if (moneyFields.has(field)) {
    return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
  }

  return String(value || '').trim() || 'not set';
};

const parseMonthlyInterestPercent = (value) => {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);

  return match ? match[1] : '';
};

const formatPercentNumber = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return '';

  return numericValue.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
};

const normalizeMonthlyInterestRate = (value) => {
  const displayValue = formatPercentNumber(parseMonthlyInterestPercent(value));

  return displayValue ? `${displayValue}% monthly` : '';
};

const getInterestRateValue = (payload) => {
  const value = payload.interestRate !== undefined ? payload.interestRate : payload.lateFeeRate;

  return value === undefined ? undefined : normalizeMonthlyInterestRate(value);
};

const normalizeAccountTypeOdRules = (
  payloadRules,
  fallbackOdLimit = 0,
  fallbackMinOpeningBalance = 0
) => {
  const rulesByType = new Map(
    (Array.isArray(payloadRules) ? payloadRules : []).map((rule) => [
      rule.accountType,
      rule,
    ])
  );

  return ACCOUNT_TYPES.map((accountType) => {
    const rule = rulesByType.get(accountType) || {};

    return {
      accountType,
      odLimit: Number(
        rule.odLimit === '' || rule.odLimit === undefined
          ? fallbackOdLimit ?? 0
          : rule.odLimit
      ),
      minOpeningBalance: Number(rule.minOpeningBalance ?? fallbackMinOpeningBalance ?? 0),
    };
  });
};

const validateAccountTypeOdRules = (rules = []) => {
  for (const rule of rules) {
    if (!ACCOUNT_TYPES.includes(rule.accountType)) {
      return 'Invalid account type in overdraft rules';
    }

    if (!Number.isFinite(Number(rule.odLimit)) || Number(rule.odLimit) < 0) {
      return `${rule.accountType} overdraft limit must be 0 or greater`;
    }

    if (!Number.isFinite(Number(rule.minOpeningBalance)) || Number(rule.minOpeningBalance) < 0) {
      return `${rule.accountType} minimum opening balance must be 0 or greater`;
    }
  }

  return '';
};

const getTierPolicyChanges = (existingTier, update) =>
  Object.entries(update)
    .filter(([field, nextValue]) => {
      const currentValue = existingTier[field];

      if (field === 'accountTypeOdRules') {
        return (
          JSON.stringify(getAccountTypeOdRules(existingTier)) !==
          JSON.stringify(normalizeAccountTypeOdRules(nextValue, existingTier.maxODLimit, existingTier.minBalance))
        );
      }

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

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatMoney = (value) =>
  `INR ${Number(value || 0).toLocaleString('en-IN')}`;

const buildAccountTypeOdRuleCards = (tier) =>
  getAccountTypeOdRules(tier)
    .map((rule) => {
      return `
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#ffffff;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;">
            <strong style="font-size:15px;color:#0f172a;">${escapeHtml(rule.accountType)} Account</strong>
            <span style="background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;">
              Account rule
            </span>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;color:#475569;">
            <tr>
              <td style="padding:4px 0;">OD limit</td>
              <td align="right" style="padding:4px 0;font-weight:700;color:#0f172a;">${escapeHtml(formatMoney(rule.odLimit))}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;">Minimum opening balance</td>
              <td align="right" style="padding:4px 0;font-weight:700;color:#0f172a;">${escapeHtml(formatMoney(rule.minOpeningBalance))}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;">Monthly OD uses</td>
              <td align="right" style="padding:4px 0;font-weight:700;color:#0f172a;">${Number(rule.monthlyOdUses || DEFAULT_MONTHLY_OD_USES)}</td>
            </tr>
          </table>
        </div>`;
    })
    .join('');

const buildAccountTypeOdRuleLines = (tier) =>
  getAccountTypeOdRules(tier)
    .map(
      (rule) =>
        `- ${rule.accountType}: limit ${formatMoney(rule.odLimit)}; minimum opening balance ${formatMoney(rule.minOpeningBalance)}; monthly OD uses ${Number(rule.monthlyOdUses || DEFAULT_MONTHLY_OD_USES)}`
    )
    .join('\n');

const buildFullTierPolicyRows = (tier, changes = []) => {
  const changeByField = changes.reduce((map, change) => {
    map.set(change.field, change);
    return map;
  }, new Map());
  const rows = [
    ['label', 'Classification name', tier.label],
    ['perTxnLimit', 'Per transaction limit', tier.perTxnLimit],
    ['dailyLimit', 'Daily limit', tier.dailyLimit],
    ['monthlyLimit', 'Monthly limit', tier.monthlyLimit],
    ['maxODLimit', 'Maximum overdraft limit', tier.maxODLimit],
    ['penaltyAmount', 'Penalty after grace period', tier.penaltyAmount],
    ['lateFeeRate', 'Overdraft interest rate', tier.lateFeeRate],
    ['accountTypeOdRules', 'Account type OD rules', getAccountTypeOdRules(tier)],
    ['overdraftDueRule', 'Overdraft due rule', OVERDRAFT_DUE_RULE],
    ['gracePeriodDays', 'Grace period', `${GRACE_PERIOD_DAYS} days after month-end`],
    ['reviewCycle', 'Review cycle', REVIEW_CYCLE],
    ['eligibility', 'Eligibility', tier.eligibility],
    ['reviewNotes', 'Review notes', tier.reviewNotes],
  ];

  return rows.map(([field, label, value]) => {
    const change = changeByField.get(field);

    return {
      field,
      label,
      value: ['overdraftDueRule', 'gracePeriodDays', 'reviewCycle'].includes(field)
        ? value
        : formatTierValue(field, value),
      previousValue: change?.from,
      changed: Boolean(change),
    };
  });
};

const buildTierPolicyEmail = ({ customer, tier, changes, updatedByName }) => {
  const policyRows = buildFullTierPolicyRows(tier, changes);
  const generalPolicyRows = policyRows.filter((row) => row.field !== 'accountTypeOdRules');
  const changedRows = policyRows.filter((row) => row.changed);
  const odRulesChanged = changedRows.some((row) => row.field === 'accountTypeOdRules');
  const policyLines = generalPolicyRows
    .map((row) =>
      row.changed
        ? `- ${row.label}: ${row.value} (changed from ${row.previousValue})`
        : `- ${row.label}: ${row.value}`
    )
    .join('\n');
  const policyTableRows = generalPolicyRows
    .map(
      (row) => `
        <tr style="${row.changed ? 'background:#f0fdf4;' : ''}">
          <td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">${escapeHtml(row.label)}</td>
          <td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;${row.changed ? 'font-weight:700;' : ''}">${escapeHtml(row.value)}</td>
          <td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;color:${row.changed ? '#047857' : '#94a3b8'};font-weight:700;">${row.changed ? 'Updated' : '-'}</td>
        </tr>`
    )
    .join('');
  const changedHtml = changedRows.length
    ? changedRows
        .map((row) => {
          if (row.field === 'accountTypeOdRules') {
            return `
              <div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;padding:12px;margin-top:8px;">
                <strong style="display:block;color:#166534;">${escapeHtml(row.label)}</strong>
                <span style="display:block;margin-top:4px;color:#475569;">Your account-type overdraft policy was updated. The current rules are shown below.</span>
              </div>`;
          }

          return `
            <div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;padding:12px;margin-top:8px;">
              <strong style="display:block;color:#166534;">${escapeHtml(row.label)}</strong>
              <span style="display:block;margin-top:4px;color:#475569;">${escapeHtml(row.previousValue)} &rarr; <strong style="color:#0f172a;">${escapeHtml(row.value)}</strong></span>
            </div>`;
        })
        .join('')
    : '<p style="margin:0;color:#475569;">No field-level changes were listed, but the current policy is included below for reference.</p>';
  const changedSummary = changes
    .map((change) =>
      change.field === 'accountTypeOdRules'
        ? `${change.label}: updated. Current account-type OD rules are listed below.`
        : `${change.label}: ${change.from} -> ${change.to}`
    )
    .join('\n');
  const accountTypeOdLines = buildAccountTypeOdRuleLines(tier);
  const accountTypeOdCards = buildAccountTypeOdRuleCards(tier);

  return {
    subject: `${tier.label} tier policy updated`,
    text: `Hello ${customer.name},

Your ${tier.label} tier policy was updated by ${updatedByName}.

Changed details:
${changedSummary}

Complete current policy:
${policyLines}

Account type OD rules:
${accountTypeOdLines}

Regards,
Adnate PayNest`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;line-height:1.5;">
        <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="background:#0f172a;color:#ffffff;padding:18px 22px;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#bfdbfe;">Adnate PayNest</p>
            <h1 style="margin:6px 0 0;font-size:22px;line-height:1.3;">Tier policy updated</h1>
          </div>
          <div style="padding:22px;">
            <p style="margin-top:0;">Hello ${escapeHtml(customer.name)},</p>
            <p>Your <strong>${escapeHtml(tier.label)}</strong> tier policy was updated by ${escapeHtml(updatedByName)}.</p>

            <div style="border:1px solid #dbeafe;background:#eff6ff;border-radius:12px;padding:14px 16px;margin:18px 0;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8;">What changed</p>
              ${changedHtml}
            </div>

            <div style="margin:20px 0;">
              <p style="margin:0 0 10px;font-size:16px;font-weight:800;color:#0f172a;">Account type OD policy</p>
              ${odRulesChanged ? '<p style="margin:0 0 12px;color:#047857;font-weight:700;">Overdraft rules were updated. Please review the current account-wise limits below.</p>' : '<p style="margin:0 0 12px;color:#475569;">Current account-wise overdraft rules are shown below.</p>'}
              <div style="display:block;">
                ${accountTypeOdCards}
              </div>
            </div>

            <p style="margin:20px 0 10px;font-size:16px;font-weight:800;color:#0f172a;">Complete current policy</p>
            <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <thead>
                <tr>
                  <th align="left" style="padding:12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Policy detail</th>
                  <th align="left" style="padding:12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Current value</th>
                  <th align="left" style="padding:12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">Status</th>
                </tr>
              </thead>
              <tbody>${policyTableRows}</tbody>
            </table>
            <p style="margin-top:18px;color:#475569;">Please keep these limits in mind while using transfers and overdraft facilities. Monthly OD usage resets at the start of the next month.</p>
            <p>Regards,<br /><strong>Adnate PayNest</strong></p>
          </div>
        </div>
      </div>
    `,
  };
};

const sendTierPolicyEmails = async ({ customers, tier, changes, updatedByName }) => {
  const recipients = customers.filter((customer) => customer.email);
  const results = await Promise.all(
    recipients.map(async (customer) => {
      const email = buildTierPolicyEmail({ customer, tier, changes, updatedByName });
      const delivery = await sendEmail({
        to: customer.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });

      return {
        customerId: customer.customerId,
        email: customer.email,
        sent: delivery.sent,
        message: delivery.message,
      };
    })
  );

  return {
    totalRecipients: recipients.length,
    sent: results.filter((result) => result.sent).length,
    failed: results.filter((result) => !result.sent).length,
  };
};

const writeManagerTierPolicyNotifications = async ({
  tier,
  changes,
  customerCount,
  updatedBy,
}) => {
  if (changes.length === 0) return;

  const managers = await User.find({ role: 'manager', status: 'active' }).select('name');

  if (managers.length === 0) return;

  const changeSummary = summarizeTierPolicyChanges(changes);
  const extraChangeCount = Math.max(0, changes.length - 4);
  const messageSuffix =
    extraChangeCount > 0
      ? `${changeSummary}; and ${extraChangeCount} more change${extraChangeCount === 1 ? '' : 's'}.`
      : `${changeSummary}.`;
  const updatedByName = updatedBy?.name || 'Admin';

  await Promise.all(
    managers.map((manager) =>
      writeSystemLog({
        action: 'tier.policy.updated.manager',
        message: `${tier.label} tier policy was updated by ${updatedByName}. ${customerCount} assigned customer(s) may be affected. ${messageSuffix}`,
        actor: manager._id,
        actorName: manager.name,
        entityType: 'Tier',
        entityId: tier.name,
        severity: 'info',
        metadata: {
          tierName: tier.name,
          tierLabel: tier.label,
          customerCount,
          updatedBy: updatedByName,
          updatedById: updatedBy?._id,
          changes,
        },
      })
    )
  );
};

const writeAdminTierPolicyNotifications = async ({
  tier,
  changes,
  customerCount,
  updatedBy,
}) => {
  if (changes.length === 0 || updatedBy?.role !== 'manager') return;

  const admins = await User.find({ role: 'admin', status: 'active' }).select('name');

  if (admins.length === 0) return;

  const changeSummary = summarizeTierPolicyChanges(changes);
  const extraChangeCount = Math.max(0, changes.length - 4);
  const messageSuffix =
    extraChangeCount > 0
      ? `${changeSummary}; and ${extraChangeCount} more change${extraChangeCount === 1 ? '' : 's'}.`
      : `${changeSummary}.`;

  await Promise.all(
    admins.map((admin) =>
      writeSystemLog({
        action: 'tier.policy.updated.admin',
        message: `${updatedBy.name} updated ${tier.label} tier policy. ${customerCount} assigned customer(s) may be affected. ${messageSuffix}`,
        actor: admin._id,
        actorName: admin.name,
        entityType: 'Tier',
        entityId: tier.name,
        severity: 'warning',
        metadata: {
          tierName: tier.name,
          tierLabel: tier.label,
          customerCount,
          updatedBy: updatedBy.name,
          updatedById: updatedBy._id,
          updatedByRole: updatedBy.role,
          changes,
        },
      })
    )
  );
};

const writeManagerTierCreatedNotifications = async ({ tier, createdBy }) => {
  const managers = await User.find({ role: 'manager', status: 'active' }).select('name');

  if (managers.length === 0) return;

  const createdByName = createdBy?.name || 'Admin';
  const accountRules = getAccountTypeOdRules(tier)
    .map(
      (rule) =>
        `${rule.accountType}: OD ${formatMoney(rule.odLimit)}, minimum opening ${formatMoney(rule.minOpeningBalance)}`
    )
    .join('; ');

  await Promise.all(
    managers.map((manager) =>
      writeSystemLog({
        action: 'tier.policy.created.manager',
        message: `${tier.label} tier policy was added by ${createdByName}. ${accountRules}`,
        actor: manager._id,
        actorName: manager.name,
        entityType: 'Tier',
        entityId: tier.name,
        severity: 'success',
        metadata: {
          tierName: tier.name,
          tierLabel: tier.label,
          createdBy: createdByName,
          createdById: createdBy?._id,
          accountTypeOdRules: getAccountTypeOdRules(tier),
        },
      })
    )
  );
};

const serializeTier = (tier, stats = {}) => ({
  id: tier._id,
  key: tier.name,
  name: tier.name,
  label: tier.label,
  perTxnLimit: tier.perTxnLimit,
  dailyLimit: tier.dailyLimit,
  monthlyLimit: tier.monthlyLimit,
  maxODLimit: tier.maxODLimit,
  accountTypeOdRules: getAccountTypeOdRules(tier),
  minBalance: tier.minBalance,
  penaltyAmount: tier.penaltyAmount,
  interestRate: tier.lateFeeRate,
  lateFeeRate: tier.lateFeeRate,
  gracePeriodDays: GRACE_PERIOD_DAYS,
  reviewCycle: REVIEW_CYCLE,
  overdraftDueRule: OVERDRAFT_DUE_RULE,
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
    'penaltyAmount',
  ];
  const textFields = [
    'label',
    'interestRate',
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

  for (const field of textFields) {
    if (partial && payload[field] === undefined) continue;

    if (!String(payload[field] || '').trim()) {
      return `${field} is required`;
    }
  }

  if (payload.interestRate !== undefined) {
    const monthlyInterestPercent = Number(parseMonthlyInterestPercent(payload.interestRate));

    if (!Number.isFinite(monthlyInterestPercent) || monthlyInterestPercent <= 0) {
      return 'Interest rate must be a monthly percentage above 0';
    }
  }

  return '';
};

const getDerivedMinBalance = (rules = []) => {
  const balances = rules
    .map((rule) => Number(rule.minOpeningBalance || 0))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return balances.length > 0 ? Math.min(...balances) : 0;
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
    Tier.find().sort({ createdAt: -1, _id: -1 }),
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
    (await Tier.findOne().sort({ createdAt: -1, _id: -1 }));
  const tiers = await Tier.find().sort({ createdAt: -1, _id: -1 });

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
  const interestRate = getInterestRateValue(req.body);

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

  const validationMessage = validateTierPayload({
    ...req.body,
    label,
    interestRate,
    minBalance: req.body.minBalance ?? 0,
  });
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }
  const accountTypeOdRules = normalizeAccountTypeOdRules(
    req.body.accountTypeOdRules,
    req.body.maxODLimit,
    req.body.minBalance
  );
  const accountTypeRuleValidationMessage = validateAccountTypeOdRules(accountTypeOdRules);

  if (accountTypeRuleValidationMessage) {
    return res.status(400).json({ message: accountTypeRuleValidationMessage });
  }

  const tier = await Tier.create({
    name,
    label,
    perTxnLimit: Number(req.body.perTxnLimit),
    dailyLimit: Number(req.body.dailyLimit),
    monthlyLimit: Number(req.body.monthlyLimit),
    maxODLimit: Number(req.body.maxODLimit),
    minBalance: Number(req.body.minBalance ?? getDerivedMinBalance(accountTypeOdRules)),
    penaltyAmount: Number(req.body.penaltyAmount),
    lateFeeRate: interestRate,
    eligibility: req.body.eligibility,
    reviewNotes: req.body.reviewNotes,
    accountTypeOdRules,
  });

  await writeManagerTierCreatedNotifications({
    tier,
    createdBy: req.user,
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
    'penaltyAmount',
    'interestRate',
    'lateFeeRate',
    'eligibility',
    'reviewNotes',
  ];
  const managerRestrictedFields = new Set(['label', 'minBalance', 'eligibility', 'reviewNotes']);
  const managerPermissionFieldByRequestField = {
    perTxnLimit: 'perTxnLimit',
    dailyLimit: 'dailyLimit',
    monthlyLimit: 'monthlyLimit',
    maxODLimit: 'accountTypeOdRules',
    penaltyAmount: 'penaltyAmount',
    interestRate: 'interestRate',
    lateFeeRate: 'interestRate',
    accountTypeOdRules: 'accountTypeOdRules',
  };

  if (req.user.role === 'manager') {
    const requestedFields = [
      ...allowedFields.filter((field) => req.body[field] !== undefined),
      ...(req.body.accountTypeOdRules !== undefined ? ['accountTypeOdRules'] : []),
    ];

    const blockedAdminOnlyField = requestedFields.find((field) =>
      managerRestrictedFields.has(field)
    );

    if (blockedAdminOnlyField) {
      return res.status(403).json({
        message: `${tierFieldLabels[blockedAdminOnlyField] || blockedAdminOnlyField} can be changed only by admin`,
      });
    }

    const config = await getBusinessRuleConfig();
    const permissions = {
      ...DEFAULT_MANAGER_TIER_PERMISSIONS,
      ...(config.managerTierPermissions?.toObject?.() || config.managerTierPermissions || {}),
    };
    const blockedField = requestedFields.find((field) => {
      const permissionField = managerPermissionFieldByRequestField[field];

      return !permissionField || permissions[permissionField] !== true;
    });

    if (blockedField) {
      return res.status(403).json({
        message: `Manager is not allowed to edit ${tierFieldLabels[blockedField] || blockedField}`,
      });
    }
  }

  const update = {};
  const normalizedBody = {
    ...req.body,
    ...(getInterestRateValue(req.body) !== undefined
      ? { interestRate: getInterestRateValue(req.body) }
      : {}),
  };
  const validationMessage = validateTierPayload(normalizedBody, { partial: true });

  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }
  let accountTypeOdRules;

  if (req.body.accountTypeOdRules !== undefined) {
    accountTypeOdRules = normalizeAccountTypeOdRules(
      req.body.accountTypeOdRules,
      normalizedBody.maxODLimit ?? existingTier.maxODLimit,
      normalizedBody.minBalance ?? existingTier.minBalance
    );
    const accountTypeRuleValidationMessage = validateAccountTypeOdRules(accountTypeOdRules);

    if (accountTypeRuleValidationMessage) {
      return res.status(400).json({ message: accountTypeRuleValidationMessage });
    }
  }

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      const targetField = field === 'interestRate' ? 'lateFeeRate' : field;
      update[targetField] =
        targetField === 'lateFeeRate'
          ? getInterestRateValue({ [field]: req.body[field] })
          : ['label', 'eligibility', 'reviewNotes'].includes(targetField)
            ? req.body[field]
            : Number(req.body[field] || 0);
    }
  }

  if (accountTypeOdRules) {
    update.accountTypeOdRules = accountTypeOdRules;
    if (req.body.minBalance === undefined) {
      update.minBalance = getDerivedMinBalance(accountTypeOdRules);
    }
  }

  const policyChanges = getTierPolicyChanges(existingTier, update);
  const tier = await Tier.findOneAndUpdate(
    { name },
    {
      $set: update,
      $unset: {
        payoffDays: '',
        reviewCycle: '',
        settlementWindow: '',
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    }
  );

  await User.updateMany(
    { role: 'customer', classification: tier.name },
    {
      $set: {
        'account.transferLimit': tier.perTxnLimit,
        'accounts.$[].transferLimit': tier.perTxnLimit,
      },
    }
  );

  const tierCustomers = await User.find({
    role: 'customer',
    classification: tier.name,
  }).select('name email customerId account accounts role classification');
  const customerIds = tierCustomers
    .map((user) => user.customerId)
    .filter(Boolean);

  if (customerIds.length > 0) {
    await Promise.all(
      getAccountTypeOdRules(tier).map((rule) =>
        BankAccount.updateMany(
          {
            customerId: { $in: customerIds },
            accountType: rule.accountType,
          },
          {
            $set: {
              transferLimit: tier.perTxnLimit,
              withdrawalLimit: tier.dailyLimit,
              odLimit: rule.odLimit,
            },
          }
        )
      )
    );

    await Promise.all(tierCustomers.map((customer) => syncCustomerAccounts(customer)));
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

  await writeManagerTierPolicyNotifications({
    tier,
    changes: policyChanges,
    customerCount: tierCustomers.length,
    updatedBy: req.user,
  });
  await writeAdminTierPolicyNotifications({
    tier,
    changes: policyChanges,
    customerCount: tierCustomers.length,
    updatedBy: req.user,
  });

  const email =
    policyChanges.length > 0 && tierCustomers.length > 0
      ? await sendTierPolicyEmails({
        customers: tierCustomers,
        tier,
        changes: policyChanges,
        updatedByName: req.user?.name || 'Admin',
      })
      : {
        totalRecipients: 0,
        sent: 0,
        failed: 0,
      };

  res.json({ tier: serializeTier(tier), email, changes: policyChanges });
};

const deleteTier = async (req, res) => {
  const { name } = req.params;
  const tier = await Tier.findOne({ name });

  if (!tier) {
    return res.status(404).json({ message: 'Tier not found' });
  }

  const assignedCustomerCount = await User.countDocuments({
    role: 'customer',
    classification: tier.name,
  });

  if (assignedCustomerCount > 0) {
    return res.status(409).json({
      message: `Cannot delete ${tier.label} classification because ${assignedCustomerCount} customer(s) are assigned to it.`,
      assignedCustomerCount,
    });
  }

  await Tier.deleteOne({ _id: tier._id });

  res.json({ message: `${tier.label} classification deleted.` });
};

module.exports = { createTier, deleteTier, getCustomerPolicy, listTiers, updateTier };
