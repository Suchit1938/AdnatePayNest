const toAmount = (value) => Number(value || 0);

export const getCustomerAccounts = (user) => {
  if (user?.accounts?.length) {
    return user.accounts;
  }

  return user?.account?.accountNumber ? [user.account] : [];
};

export const getCustomerOverdraftSummary = (user) => {
  const accounts = getCustomerAccounts(user);
  const snapshots = [user?.account, ...accounts].filter(Boolean);
  const overdraftLimit = Math.max(
    ...snapshots.map((account) => toAmount(account.overdraftLimit)),
    0
  );
  const overdraftUsed = Math.max(
    ...snapshots.map((account) => toAmount(account.overdraftUsed)),
    0
  );
  const odUsageCount = Math.max(
    ...snapshots.map((account) => toAmount(account.odCountThisMonth)),
    0
  );

  return {
    overdraftLimit,
    overdraftUsed,
    odUsageCount,
    availableOverdraft: Math.max(0, overdraftLimit - overdraftUsed),
  };
};
