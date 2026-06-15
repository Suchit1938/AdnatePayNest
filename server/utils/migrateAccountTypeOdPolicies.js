require('dotenv').config();

const mongoose = require('mongoose');

const BankAccount = require('../models/BankAccount');
const Tier = require('../models/Tier');
const User = require('../models/User');
const { getAccountTypeOdRules } = require('./accountTypeOdPolicy');
const { syncCustomerAccounts } = require('./customerAccounts');

const ensureTierRules = async (tier) => {
  tier.accountTypeOdRules = getAccountTypeOdRules(tier);
  await tier.save();

  return tier;
};

const migrateAccountTypeOdPolicies = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
  }

  const tiers = await Tier.find();
  const tiersByName = new Map();

  for (const tier of tiers) {
    const updatedTier = await ensureTierRules(tier);
    tiersByName.set(updatedTier.name, updatedTier);
  }

  const customers = await User.find({ role: 'customer' });
  let updatedAccounts = 0;
  let syncedCustomers = 0;

  for (const customer of customers) {
    const tier = tiersByName.get(customer.classification);
    const ruleByAccountType = new Map(
      getAccountTypeOdRules(tier).map((rule) => [rule.accountType, rule])
    );
    const accounts = await BankAccount.find({ customerId: customer.customerId });

    for (const account of accounts) {
      const rule = ruleByAccountType.get(account.accountType);

      if (!rule) continue;

      account.transferLimit = tier?.perTxnLimit || account.transferLimit || 0;
      account.withdrawalLimit = tier?.dailyLimit || account.withdrawalLimit || 0;
      account.odLimit = rule.odLimit;
      account.odUsed = Math.max(0, Number(account.odUsed || 0));
      account.odCountThisMonth = Math.max(0, Number(account.odCountThisMonth || 0));
      account.odBlocked =
        account.odBlocked ||
        Number(account.odCountThisMonth || 0) >= Number(rule.monthlyOdUses ?? 3);

      await account.save();
      updatedAccounts += 1;
    }

    await syncCustomerAccounts(customer);
    syncedCustomers += 1;
  }

  return {
    tiersUpdated: tiers.length,
    accountsUpdated: updatedAccounts,
    customersSynced: syncedCustomers,
  };
};

if (require.main === module) {
  migrateAccountTypeOdPolicies()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = migrateAccountTypeOdPolicies;
