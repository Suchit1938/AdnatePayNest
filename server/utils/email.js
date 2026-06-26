const fs = require('fs');
const dns = require('dns');
const net = require('net');
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

const resolveEmailHost = async () => {
  const host = emailHost();

  if (net.isIP(host)) {
    return { host };
  }

  try {
    const [ipv4Address] = await dns.promises.resolve4(host);

    if (ipv4Address) {
      return {
        host: ipv4Address,
        servername: host,
      };
    }
  } catch (error) {
    console.warn('Email host IPv4 lookup failed, falling back to configured host:', {
      host,
      message: error.message,
    });
  }

  return { host, servername: host };
};

const createTransporter = async (overrides = {}) => {
  const resolvedHost = await resolveEmailHost();

  return nodemailer.createTransport({
    host: resolvedHost.host,
    port: overrides.port ?? emailPort(),
    secure: overrides.secure ?? emailSecure(),
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: emailUser(),
      pass: emailPass(),
    },
    tls: resolvedHost.servername
      ? {
        servername: resolvedHost.servername,
      }
      : undefined,
  });
};

const isConnectionTimeout = (error) =>
  ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(error?.code) ||
  /timeout|timed out/i.test(error?.message || '');

const sendMailWithConfiguredTransport = async (mailOptions) =>
  (await createTransporter()).sendMail(mailOptions);

const sendMailWithFallbackTransport = async (mailOptions, error) => {
  if (!isConnectionTimeout(error) || emailPort() === 465) {
    throw error;
  }

  console.warn('Email send retrying with SMTP SSL port 465 after connection timeout.');

  return (await createTransporter({ port: 465, secure: true })).sendMail(mailOptions);
};
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

  const mailOptions = {
    from: envValue('EMAIL_FROM') || emailUser(),
    to,
    subject,
    text,
    html: addLogoToHtml(html, text),
    attachments: addLogoAttachment(attachments),
  };

  try {
    let info;

    try {
      info = await sendMailWithConfiguredTransport(mailOptions);
    } catch (error) {
      info = await sendMailWithFallbackTransport(mailOptions, error);
    }

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
