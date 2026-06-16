const EMAIL_PATTERN = /^[^\s@]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isValidEmail = (email) => EMAIL_PATTERN.test(normalizeEmail(email));

module.exports = {
  isValidEmail,
  normalizeEmail,
};
