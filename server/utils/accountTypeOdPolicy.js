const ACCOUNT_TYPES = ['Savings', 'Current', 'Salary'];
const DEFAULT_MONTHLY_OD_USES = 3;

const toWholeRupees = (value) => Math.round(Number(value || 0));

const normalizeAccountType = (value) =>
  ACCOUNT_TYPES.includes(value) ? value : 'Savings';

const getAccountTypeOdRules = (tier) => {
  const configuredRules = new Map(
    (tier?.accountTypeOdRules || []).map((rule) => [
      normalizeAccountType(rule.accountType),
      {
        accountType: normalizeAccountType(rule.accountType),
        odLimit: toWholeRupees(rule.odLimit),
        minOpeningBalance: toWholeRupees(rule.minOpeningBalance),
      },
    ])
  );

  return ACCOUNT_TYPES.map((accountType) => {
    const configuredRule = configuredRules.get(accountType);

    return {
      accountType,
      odLimit: toWholeRupees(configuredRule?.odLimit ?? tier?.maxODLimit),
      minOpeningBalance: toWholeRupees(configuredRule?.minOpeningBalance ?? tier?.minBalance),
      monthlyOdUses: DEFAULT_MONTHLY_OD_USES,
    };
  });
};

const getAccountTypeOdRule = (tier, accountType) =>
  getAccountTypeOdRules(tier).find(
    (rule) => rule.accountType === normalizeAccountType(accountType)
  ) || getAccountTypeOdRules(tier)[0];

module.exports = {
  ACCOUNT_TYPES,
  DEFAULT_MONTHLY_OD_USES,
  getAccountTypeOdRule,
  getAccountTypeOdRules,
  normalizeAccountType,
};
