const fs = require('fs');
const path = require('path');
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

const logoPath = path.join(__dirname, '..', '..', 'client', 'public', 'logo.png');
const logoCid = 'adnatepaynest-logo';

const getLogoAttachment = () =>
  fs.existsSync(logoPath)
    ? {
      filename: 'adnatepaynest-logo.png',
      path: logoPath,
      cid: logoCid,
    }
    : null;

const addLogoToHtml = (html) => {
  if (!html || html.includes(`cid:${logoCid}`)) {
    return html;
  }

  const logoAttachment = getLogoAttachment();

  if (!logoAttachment) {
    return html;
  }

  return `
    <div style="font-family:Arial,sans-serif;">
      <div style="text-align:center;margin:0 0 16px;">
        <img src="cid:${logoCid}" alt="AdnatePayNest" style="width:76px;height:76px;border-radius:999px;display:inline-block;" />
      </div>
      ${html}
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
      html: addLogoToHtml(html),
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
