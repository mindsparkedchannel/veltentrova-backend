const nodemailer = require("nodemailer");

function getSmtp() {
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    from: process.env.NOTIFY_FROM || process.env.SMTP_USER,
    to:   process.env.NOTIFY_TO   || process.env.SMTP_USER,
  };
}

async function sendLeadMail({ email, name, note, source }) {
  try {
    const cfg = getSmtp();
    if (!cfg.host || !cfg.auth.user || !cfg.auth.pass) {
      return { ok: false, error: "SMTP not configured" };
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.auth,
      tls: { ciphers: "TLSv1.2" }
    });

    const subject = `New lead: ${name || email}`;
    const text = [
      "New lead",
      `Email : ${email || ""}`,
      `Name  : ${name || ""}`,
      `Source: ${source || ""}`,
      `Note  : ${note || ""}`
    ].join("\n");

    const info = await transporter.sendMail({
      from: cfg.from,
      to:   cfg.to,
      subject,
      text,
      replyTo: email || undefined,
    });

    return { ok: true, messageId: info.messageId, response: info.response };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

module.exports = { sendLeadMail };
