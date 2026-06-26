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
const emailFrom = () => envValue('EMAIL_FROM') || emailUser();
const resendApiKey = () => envValue('RESEND_API_KEY');
const emailSecure = () => {
  const value = envValue('EMAIL_SECURE').toLowerCase();
  return value === 'true' || emailPort() === 465;
};

const hasResendConfig = () => Boolean(resendApiKey() && envValue('EMAIL_FROM'));

const hasSmtpConfig = () =>
  Boolean(
    emailHost() &&
    emailUser() &&
    emailPass() &&
    !isPlaceholder(emailUser()) &&
    !isPlaceholder(emailPass())
  );

const hasEmailConfig = () => hasResendConfig() || hasSmtpConfig();

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

const toResendAttachment = (attachment) => {
  if (!attachment || attachment.cid) {
    return null;
  }

  const content = attachment.content ?? (attachment.path ? fs.readFileSync(attachment.path) : null);

  if (!content) {
    return null;
  }

  return {
    filename: attachment.filename,
    content: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(String(content)).toString('base64'),
  };
};

const sendMailWithResend = async ({ from, to, subject, text, html, attachments }) => {
  const resendAttachments = (attachments || [])
    .map(toResendAttachment)
    .filter(Boolean);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html: html || buildHtmlFromText(text),
      attachments: resendAttachments.length ? resendAttachments : undefined,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = result?.message || result?.error || `Resend rejected the email with status ${response.status}.`;
    const error = new Error(message);
    error.code = result?.name || `RESEND_${response.status}`;
    throw error;
  }

  return {
    messageId: result?.id,
  };
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
    console.warn('Email skipped: RESEND_API_KEY + EMAIL_FROM or SMTP settings are missing.');
    return {
      sent: false,
      skipped: true,
      message: 'Email settings are not configured.',
    };
  }

  const from = emailFrom();
  const commonMailOptions = {
    from,
    to,
    subject,
    text,
    html,
    attachments,
  };

  try {
    let info;

    if (hasResendConfig()) {
      info = await sendMailWithResend(commonMailOptions);
    } else {
      const smtpMailOptions = {
        ...commonMailOptions,
        html: addLogoToHtml(html, text),
        attachments: addLogoAttachment(attachments),
      };

      try {
        info = await sendMailWithConfiguredTransport(smtpMailOptions);
      } catch (error) {
        info = await sendMailWithFallbackTransport(smtpMailOptions, error);
      }
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
