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

module.exports = {
  calculateOverdraftInterest,
  getInterestDays,
  parseMonthlyInterestRate,
};
