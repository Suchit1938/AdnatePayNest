const fs = require('fs');
const nodemailer = require('nodemailer');
const { logoCid, logoPath } = require('./branding');

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
      html: addLogoToHtml(html, text),
      attachments: addLogoAttachment(attachments),
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
