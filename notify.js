const nodemailer = require('nodemailer');

function smtpConfigFromEnv() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465; // 465 = implicit TLS
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.NOTIFY_FROM || user;
  const to   = process.env.NOTIFY_TO   || user;

  return { host, port, secure, user, pass, from, to };
}

async function sendTestMail(subject = 'SMTP debug', text = 'If you see this, SMTP works.') {
  const cfg = smtpConfigFromEnv();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    throw new Error('SMTP not configured (need SMTP_HOST/PORT/USER/PASS + NOTIFY_FROM/TO)');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { ciphers: 'TLSv1.2' },
    logger: true,  // ausführliche Logs in Render
    debug: true
  });

  const info = await transporter.sendMail({
    from: cfg.from,
    to:   cfg.to,
    subject,
    text
  });

  return {
    messageId: info.messageId,
    accepted:  info.accepted,
    rejected:  info.rejected,
    response:  info.response,
    envelope:  info.envelope
  };
}

module.exports = { sendTestMail };
