export const emailPattern =
  /^[^\s@]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export const isValidEmail = (email) => emailPattern.test(normalizeEmail(email));
