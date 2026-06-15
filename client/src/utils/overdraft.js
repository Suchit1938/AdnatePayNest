const toAmount = (value) => Number(value || 0);

export const getCustomerAccounts = (user) => {
  if (user?.accounts?.length) {
    return user.accounts;
  }

  return user?.account?.accountNumber ? [user.account] : [];
};

export const getCustomerOverdraftSummary = (user) => {
  const accounts = getCustomerAccounts(user);
  const uniqueAccounts = accounts.filter(
    (account, index, list) =>
      account?.accountNumber &&
      list.findIndex((item) => item.accountNumber === account.accountNumber) === index
  );
  const overdraftLimit = uniqueAccounts.reduce(
    (sum, account) => sum + toAmount(account.overdraftLimit),
    0
  );
  const overdraftUsed = uniqueAccounts.reduce(
    (sum, account) => sum + toAmount(account.overdraftUsed),
    0
  );
  const odUsageCount = uniqueAccounts.reduce(
    (sum, account) => sum + toAmount(account.odCountThisMonth),
    0
  );

  return {
    overdraftLimit,
    overdraftUsed,
    odUsageCount,
    availableOverdraft: Math.max(0, overdraftLimit - overdraftUsed),
  };
};
