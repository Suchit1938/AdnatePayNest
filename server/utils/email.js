const fs = require('fs');
const nodemailer = require('nodemailer');
const { logoCid, logoPath } = require('./branding');

const placeholderValues = new Set([
  'your_email@gmail.com',
  'your_gmail_app_password',
]);

const isPlaceholder = (value) => placeholderValues.has(String(value || '').trim());

const envValue = (key, fallback = '') => String(process.env[key] ?? fallback).trim();

const emailHost = () => envValue('EMAIL_HOST');
const emailUser = () => envValue('EMAIL_USER');
const emailPass = () => envValue('EMAIL_PASS').replace(/\s/g, '');
const emailPort = () => Number(envValue('EMAIL_PORT', '587'));
const emailSecure = () => {
  const value = envValue('EMAIL_SECURE').toLowerCase();
  return value === 'true' || emailPort() === 465;
};

const hasEmailConfig = () =>
  Boolean(
    emailHost() &&
    emailUser() &&
    emailPass() &&
    !isPlaceholder(emailUser()) &&
    !isPlaceholder(emailPass())
  );

const transporter = nodemailer.createTransport({
  host: emailHost(),
  port: emailPort(),
  secure: emailSecure(),
  family: 4,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  auth: {
    user: emailUser(),
    pass: emailPass(),
  },
});
const getLogoAttachment = () =>
  fs.existsSync(logoPath)
    ? {
      filename: 'adnatepaynest-logo.png',
      path: logoPath,
      cid: logoCid,
    }
    : null;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildHtmlFromText = (text) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim());

  return lines
    .map((line) => (line ? `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>` : '<br />'))
    .join('');
};

const addLogoToHtml = (html, text) => {
  const bodyHtml = html || buildHtmlFromText(text);

  if (!bodyHtml || bodyHtml.includes(`cid:${logoCid}`)) {
    return bodyHtml;
  }

  const logoAttachment = getLogoAttachment();

  if (!logoAttachment) {
    return bodyHtml;
  }

  return `
    <div style="font-family:Arial,sans-serif;">
      <div style="text-align:center;margin:0 0 16px;">
        <img src="cid:${logoCid}" alt="AdnatePayNest" style="width:76px;height:76px;border-radius:999px;display:inline-block;" />
      </div>
      ${bodyHtml}
    </div>
  `;
};

const addLogoAttachment = (attachments = []) => {
  const logoAttachment = getLogoAttachment();

  if (!logoAttachment) {
    return attachments;
  }

  const hasLogoAttachment = attachments.some((attachment) => attachment.cid === logoCid);

  return hasLogoAttachment ? attachments : [logoAttachment, ...attachments];
};

const sendEmail = async ({ to, subject, text, html, attachments }) => {
  if (!hasEmailConfig()) {
    console.warn('Email skipped: EMAIL_HOST, EMAIL_USER, or EMAIL_PASS is missing or still a placeholder.');
    return {
      sent: false,
      skipped: true,
      message: 'Email settings are not configured.',
    };
  }

  const transporter = createTransporter();

  try {
    const info = await transporter.sendMail({
      from: envValue('EMAIL_FROM') || emailUser(),
      to,
      subject,
      text,
      html: addLogoToHtml(html, text),
      attachments: addLogoAttachment(attachments),
    });

    return {
      sent: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.warn('Email send failed:', {
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      message: error.response || error.message || 'Email provider rejected the message.',
    });

    return {
      sent: false,
      message: error.response || error.message || 'Email provider rejected the message.',
      code: error.code,
    };
  }
};

module.exports = { sendEmail };
