const parseMonthlyInterestRate = (value) => {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);

  return match ? Number(match[1]) / 100 : 0;
};

const getInterestDays = (startedAt, now = new Date()) => {
  if (!startedAt) return 1;

  const startedTime = new Date(startedAt).getTime();

  if (!Number.isFinite(startedTime)) return 1;

  const elapsedMs = Math.max(0, now.getTime() - startedTime);
  return Math.max(1, Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)));
};

const calculateOverdraftInterest = ({
  principal,
  monthlyInterestRate,
  startedAt,
  now = new Date(),
}) => {
  const usedPrincipal = Math.max(0, Math.round(Number(principal || 0)));
  const rate = parseMonthlyInterestRate(monthlyInterestRate);

  if (usedPrincipal <= 0 || rate <= 0) {
    return {
      interestAmount: 0,
      interestDays: usedPrincipal > 0 ? getInterestDays(startedAt, now) : 0,
      monthlyRate: rate,
    };
  }

  const interestDays = getInterestDays(startedAt, now);
  const interestAmount = Math.ceil(usedPrincipal * rate * (interestDays / 30));

  return {
    interestAmount,
    interestDays,
    monthlyRate: rate,
  };
};

const normalizeDrawdowns = ({ drawdowns = [], principal = 0, startedAt }) => {
  const entries = (drawdowns || [])
    .map((entry) => ({
      amount: Math.max(0, Math.round(Number(entry.amount || 0))),
      usedAt: entry.usedAt || startedAt || new Date(),
    }))
    .filter((entry) => entry.amount > 0);
  const entryTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const currentPrincipal = Math.max(0, Math.round(Number(principal || 0)));

  if (entryTotal === currentPrincipal) {
    return entries;
  }

  if (entryTotal > currentPrincipal) {
    let remaining = currentPrincipal;

    return entries
      .map((entry) => {
        const amount = Math.min(entry.amount, remaining);
        remaining -= amount;
        return { ...entry, amount };
      })
      .filter((entry) => entry.amount > 0);
  }

  if (currentPrincipal > entryTotal) {
    return [
      ...entries,
      {
        amount: currentPrincipal - entryTotal,
        usedAt: startedAt || new Date(),
      },
    ];
  }

  return entries;
};

const calculateOverdraftInterestByDrawdown = ({
  drawdowns = [],
  principal,
  monthlyInterestRate,
  startedAt,
  now = new Date(),
}) => {
  const entries = normalizeDrawdowns({ drawdowns, principal, startedAt });
  const rate = parseMonthlyInterestRate(monthlyInterestRate);

  if (entries.length === 0 || rate <= 0) {
    return {
      interestAmount: 0,
      interestDays: entries.length > 0 ? Math.max(...entries.map((entry) => getInterestDays(entry.usedAt, now))) : 0,
      monthlyRate: rate,
      drawdowns: entries.map((entry) => ({
        ...entry,
        interestDays: getInterestDays(entry.usedAt, now),
        interestAmount: 0,
      })),
    };
  }

  const drawdownInterest = entries.map((entry) => {
    const interestDays = getInterestDays(entry.usedAt, now);

    return {
      ...entry,
      interestDays,
      interestAmount: Math.ceil(entry.amount * rate * (interestDays / 30)),
    };
  });

  return {
    interestAmount: drawdownInterest.reduce((sum, entry) => sum + entry.interestAmount, 0),
    interestDays: Math.max(...drawdownInterest.map((entry) => entry.interestDays)),
    monthlyRate: rate,
    drawdowns: drawdownInterest,
  };
};

const applyPrincipalPaymentToDrawdowns = ({ drawdowns = [], principalPayment = 0 }) => {
  let remainingPayment = Math.max(0, Math.round(Number(principalPayment || 0)));

  return (drawdowns || [])
    .map((entry) => {
      const amount = Math.max(0, Math.round(Number(entry.amount || 0)));
      const paidAmount = Math.min(amount, remainingPayment);
      remainingPayment -= paidAmount;

      return {
        amount: amount - paidAmount,
        usedAt: entry.usedAt,
      };
    })
    .filter((entry) => entry.amount > 0);
};

module.exports = {
  applyPrincipalPaymentToDrawdowns,
  calculateOverdraftInterest,
  calculateOverdraftInterestByDrawdown,
  getInterestDays,
  normalizeDrawdowns,
  parseMonthlyInterestRate,
};
