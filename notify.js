const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFY_TO = process.env.NOTIFY_TO;
const NOTIFY_FROM = process.env.NOTIFY_FROM || SMTP_USER;

let transporter = null;
function getTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("[notify] SMTP env missing; emails disabled");
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

async function notifyLeadEmail(lead) {
  const t = getTransport();
  if (!t || !NOTIFY_TO) return false;
  const { email, name, note, source, id } = lead;
  const subject = `Neuer Lead: ${name} <${email}>`;
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Source: ${source || ""}`,
    `Note: ${note || ""}`,
    `Notion: https://www.notion.so/${String(id||"").replace(/-/g,"")}`,
  ].join("\n");
  const info = await t.sendMail({ from: NOTIFY_FROM, to: NOTIFY_TO, subject, text });
  return info?.messageId || true;
}

module.exports = { notifyLeadEmail };
