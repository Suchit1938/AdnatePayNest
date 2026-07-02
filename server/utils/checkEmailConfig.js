const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const envValue = (key, fallback = '') => String(process.env[key] ?? fallback).trim();

const main = async () => {
  const host = envValue('EMAIL_HOST');
  const port = Number(envValue('EMAIL_PORT', '587'));
  const secureValue = envValue('EMAIL_SECURE').toLowerCase();
  const user = envValue('EMAIL_USER');
  const pass = envValue('EMAIL_PASS').replace(/\s/g, '');

  if (!host || !user || !pass) {
    console.error('Email config is incomplete. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secureValue === 'true' || port === 465,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user,
      pass,
    },
  });

  await transporter.verify();
  console.log(`Email config verified for ${user} via ${host}:${port}.`);
};

main().catch((error) => {
  console.error('Email config verification failed:', {
    code: error.code,
    command: error.command,
    responseCode: error.responseCode,
    message: error.response || error.message,
  });
  process.exit(1);
});
