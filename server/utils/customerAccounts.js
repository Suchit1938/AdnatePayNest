const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');

const validAccountTypes = new Set(['Savings', 'Current', 'Salary']);

const toWholeRupees = (value) => Math.round(Number(value || 0));
const normalizeAccountNumber = (value) => String(value || '').trim();

const normalizeAccountType = (value) =>
  validAccountTypes.has(value) ? value : 'Savings';

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const getAccountSnapshots = (user) => {
  const snapshots = [user.account, ...(user.accounts || [])].filter(
    (account) => account?.accountNumber
  );
  const seen = new Set();

  return snapshots.filter((account) => {
    const accountNumber = normalizeAccountNumber(account.accountNumber);

    if (!accountNumber || seen.has(accountNumber)) {
      return false;
    }

    seen.add(accountNumber);
    return true;
  });
};

const buildAccountSnapshot = (user, bankAccount) => {
  const existingAccount =
    (user.accounts || []).find(
      (account) => account.accountNumber === bankAccount.accountNumber
    ) ||
    (user.account?.accountNumber === bankAccount.accountNumber ? user.account : null) ||
    {};

  return {
    accountNumber: bankAccount.accountNumber,
    bankName:
      existingAccount.bankName ||
      user.account?.bankName ||
      process.env.BANK_NAME ||
      'Adnate Bank',
    ifsc:
      existingAccount.ifsc ||
      user.account?.ifsc ||
      process.env.BANK_IFSC ||
      'ADNT0004521',
    accountType: bankAccount.accountType,
    balance: toWholeRupees(bankAccount.walletBalance),
    availableBalance: toWholeRupees(bankAccount.availableBalance),
    transferLimit: toWholeRupees(bankAccount.transferLimit),
    withdrawalLimit: toWholeRupees(bankAccount.withdrawalLimit),
    overdraftLimit: toWholeRupees(firstDefined(bankAccount.odLimit, existingAccount.overdraftLimit)),
    overdraftUsed: toWholeRupees(firstDefined(bankAccount.odUsed, existingAccount.overdraftUsed)),
    odCountThisMonth: toWholeRupees(bankAccount.odCountThisMonth),
    odBlocked: bankAccount.odBlocked || false,
    accountStatus: bankAccount.accountStatus,
    accountOpenedAt: bankAccount.accountOpenedAt || bankAccount.createdAt,
  };
};

const sessionQuery = (query, session) => (session ? query.session(session) : query);

const ensureBankAccountsForUser = async (user, options = {}) => {
  const { session } = options;

  if (user?.role !== 'customer' || !user.customerId) {
    return [];
  }

  const snapshots = getAccountSnapshots(user);
  const existingAccounts = await sessionQuery(
    BankAccount.find({ customerId: user.customerId }),
    session
  );
  const existingAccountNumbers = new Set(
    existingAccounts.map((account) => account.accountNumber)
  );
  const tier = await sessionQuery(Tier.findOne({ name: user.classification }), session);
  const panNumber =
    user.panNumber || `LEGACY${String(user.customerId).replace(/[^a-z0-9]/gi, '')}`;

  for (const snapshot of snapshots) {
    const accountNumber = normalizeAccountNumber(snapshot.accountNumber);

    if (!accountNumber || existingAccountNumbers.has(accountNumber)) {
      continue;
    }

    const alreadyLinked = await sessionQuery(
      BankAccount.findOne({ accountNumber }),
      session
    );

    if (alreadyLinked) {
      continue;
    }

    const balance = toWholeRupees(snapshot.balance);
    const overdraftLimit = toWholeRupees(
      snapshot.overdraftLimit || tier?.maxODLimit
    );

    await BankAccount.create(
      [
        {
          customerId: user.customerId,
          panNumber,
          accountNumber,
          accountType: normalizeAccountType(snapshot.accountType || user.accountType),
          walletBalance: balance,
          availableBalance: balance,
          transferLimit: toWholeRupees(tier?.perTxnLimit),
          withdrawalLimit: toWholeRupees(tier?.dailyLimit),
          accountOpenedAt: user.createdAt,
          accountStatus: 'active',
          odLimit: overdraftLimit,
          odUsed: toWholeRupees(snapshot.overdraftUsed),
          odCountThisMonth: toWholeRupees(snapshot.odCountThisMonth),
          odBlocked: snapshot.odBlocked || false,
        },
      ],
      { session }
    );

    existingAccountNumbers.add(accountNumber);
  }

  return sessionQuery(
    BankAccount.find({
      customerId: user.customerId,
      accountStatus: 'active',
    }).sort({ createdAt: 1 }),
    session
  );
};

const syncCustomerAccounts = async (user, options = {}) => {
  const { session } = options;

  if (user?.role !== 'customer' || !user.customerId) {
    return user;
  }

  const bankAccounts = await ensureBankAccountsForUser(user, { session });

  if (bankAccounts.length === 0) {
    return user;
  }

  const accountSnapshots = bankAccounts.map((bankAccount) =>
    buildAccountSnapshot(user, bankAccount)
  );
  const currentAccount =
    accountSnapshots.find(
      (account) => account.accountNumber === user.account?.accountNumber
    ) || accountSnapshots[0];

  user.accounts = accountSnapshots;
  user.account = currentAccount;
  await user.save({ session });

  return user;
};

module.exports = {
  buildAccountSnapshot,
  ensureBankAccountsForUser,
  normalizeAccountNumber,
  syncCustomerAccounts,
  toWholeRupees,
};
