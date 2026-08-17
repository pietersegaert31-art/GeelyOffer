import nodemailer from 'nodemailer';

let transporter;

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendQuoteEmail({ to, customerName, vehicleLabel, salespersonName, pdfBuffer, filename }) {
  if (!isEmailConfigured()) {
    const error = new Error('E-mail is niet geconfigureerd op deze server (SMTP_HOST/SMTP_USER/SMTP_PASS ontbreken)');
    error.status = 503;
    throw error;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await getTransporter().sendMail({
    from: `"Geely Offertes" <${from}>`,
    to,
    subject: `Uw Geely offerte — ${vehicleLabel}`,
    text: [
      `Beste ${customerName},`,
      '',
      `Bijgevoegd vindt u uw persoonlijke offerte voor de ${vehicleLabel}.`,
      '',
      salespersonName ? `Met vriendelijke groeten,\n${salespersonName}` : 'Met vriendelijke groeten,',
    ].join('\n'),
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}
