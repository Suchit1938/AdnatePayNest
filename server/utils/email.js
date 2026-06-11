const nodemailer = require('nodemailer');

const placeholderValues = new Set([
  'your_email@gmail.com',
  'your_gmail_app_password',
]);

const isPlaceholder = (value) => placeholderValues.has(String(value || '').trim());

const hasEmailConfig = () =>
  Boolean(
    process.env.EMAIL_HOST &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASS &&
      !isPlaceholder(process.env.EMAIL_USER) &&
      !isPlaceholder(process.env.EMAIL_PASS)
  );

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: String(process.env.EMAIL_PASS || '').replace(/\s/g, ''),
    },
  });

const sendEmail = async ({ to, subject, text, html }) => {
  if (!hasEmailConfig()) {
    return {
      sent: false,
      skipped: true,
      message: 'Email settings are not configured.',
    };
  }

  const transporter = createTransporter();

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    });

    return {
      sent: true,
      messageId: info.messageId,
    };
  } catch (error) {
    return {
      sent: false,
      message: error.response || error.message || 'Email provider rejected the message.',
      code: error.code,
    };
  }
};

module.exports = { sendEmail };
