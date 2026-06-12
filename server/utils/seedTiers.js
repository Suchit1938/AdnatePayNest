require('dotenv').config();

const mongoose = require('mongoose');

const Tier = require('../models/Tier');

const tiers = [
  {
    name: 'silver',
    label: 'Silver',
    perTxnLimit: 50000,
    dailyLimit: 100000,
    monthlyLimit: 500000,
    maxODLimit: 50000,
    minBalance: 10000,
    penaltyAmount: 1000,
    lateFeeRate: '1.5% monthly',
    eligibility: 'Default tier for newly onboarded or low-risk customers',
    reviewNotes: 'Entry tier with conservative overdraft and transaction exposure.',
  },
  {
    name: 'gold',
    label: 'Gold',
    perTxnLimit: 150000,
    dailyLimit: 300000,
    monthlyLimit: 1500000,
    maxODLimit: 150000,
    minBalance: 100000,
    penaltyAmount: 2500,
    lateFeeRate: '1.5% monthly',
    eligibility: 'High-value customers with strong repayment history',
    reviewNotes: 'Priority review for overdraft renewal and higher transaction caps.',
  },
  {
    name: 'platinum',
    label: 'Platinum',
    perTxnLimit: 100000,
    dailyLimit: 250000,
    monthlyLimit: 1000000,
    maxODLimit: 100000,
    minBalance: 50000,
    penaltyAmount: 2000,
    lateFeeRate: '1.5% monthly',
    eligibility: 'Established customers with regular account activity',
    reviewNotes: 'Balanced tier for active salary and current account holders.',
  },
];

const seedTiers = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing from server/.env');
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
  }

  for (const tier of tiers) {
    await Tier.updateOne(
      { name: tier.name },
      {
        $setOnInsert: tier,
        $unset: {
          payoffDays: '',
          reviewCycle: '',
          settlementWindow: '',
        },
      },
      { upsert: true }
    );
  }

  const summary = {
    tiersSeeded: tiers.length,
    tiersTotal: await Tier.countDocuments(),
  };

  console.log(JSON.stringify(summary, null, 2));
};

if (require.main === module) {
  seedTiers()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = seedTiers;
