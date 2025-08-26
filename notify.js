const nodemailer = require("nodemailer");

function smtpConfigFromEnv() {
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.NOTIFY_FROM || process.env.SMTP_USER,
    to:   process.env.NOTIFY_TO   || process.env.SMTP_USER,
  };
}

async function sendTestMail(subject = "SMTP debug", text = "If you see this, SMTP works.") {
  const cfg = smtpConfigFromEnv();
  if (!cfg.host || !cfg.user || !cfg.pass) throw new Error("SMTP not configured");

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { ciphers: "TLSv1.2" },
    logger: true,
    debug: true
  });

  const info = await transporter.sendMail({ from: cfg.from, to: cfg.to, subject, text });
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response, envelope: info.envelope };
}

module.exports = { sendTestMail };
