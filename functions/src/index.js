const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

admin.initializeApp();

const gmailConfig = (() => {
  try {
    return functions.config().gmail || {};
  } catch (error) {
    return {};
  }
})();

const resolveGmailCredentials = () => {
  const user = gmailConfig.user || process.env.GMAIL_USER || '';
  const password = gmailConfig.password || process.env.GMAIL_PASSWORD || '';
  const placeholders = ['your-email@gmail.com', 'your-app-password'];

  if (!user || !password || placeholders.includes(user) || placeholders.includes(password)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Firebase email is not configured yet. Set gmail.user and gmail.password in Firebase Functions config, then deploy functions again.'
    );
  }

  return { user, password };
};

const formatFromAddress = (user) => `ZERO FOLD <${user}>`;

// Configure your Gmail credentials here
// For security, use environment variables or Secret Manager
const createTransporter = () => {
  const credentials = resolveGmailCredentials();

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: credentials.user,
      pass: credentials.password
    }
  });
};

const safeNumber = (value) => Number(value) || 0;

const formatCurrency = (value) => `₵ ${safeNumber(value).toFixed(2)}`;

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString();
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const readAssetIfExists = (relativePath) => {
  try {
    const absolutePath = path.resolve(__dirname, '..', '..', relativePath);
    if (!fs.existsSync(absolutePath)) {
      return null;
    }
    return fs.readFileSync(absolutePath);
  } catch (error) {
    console.warn(`Failed to read asset ${relativePath}:`, error.message);
    return null;
  }
};

const logoAsset = readAssetIfExists(path.join('src', 'assets', 'logo.png'));
const instagramAsset = readAssetIfExists(path.join('src', 'assets', 'images.jpg'));
const phoneAsset = readAssetIfExists(path.join('src', 'assets', '4436746.png'));

const findInvoiceDocument = async (invoiceId) => {
  const directDoc = await admin.firestore().collection('invoices').doc(invoiceId).get();

  if (directDoc.exists) {
    return directDoc;
  }

  const fallbackSnapshot = await admin.firestore()
    .collection('invoices')
    .where('id', '==', invoiceId)
    .limit(1)
    .get();

  if (fallbackSnapshot.empty) {
    return null;
  }

  return fallbackSnapshot.docs[0];
};

const buildInvoiceEmailHtml = (invoice, clientName) => {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const itemsHTML = items.map((item) => {
    const quantity = safeNumber(item.quantity);
    const unitPrice = safeNumber(item.unitPrice);
    const amount = quantity * unitPrice;

    return `
      <tr>
        <td>${escapeHtml(item.description || '-')}</td>
        <td>${quantity}</td>
        <td>${formatCurrency(unitPrice)}</td>
        <td>${formatCurrency(amount)}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; background: #f3f4f6; font-family: Arial, sans-serif; color: #1f2937; }
          .container { max-width: 680px; margin: 0 auto; padding: 24px; }
          .card { background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; }
          .header { background: linear-gradient(90deg, #0f0f0f 0%, #aa1414 100%); color: #ffffff; padding: 28px 32px; }
          .header h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 1px; }
          .header p { margin: 4px 0; color: #f3f4f6; }
          .section { padding: 24px 32px; }
          .meta { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .meta td { width: 50%; padding: 8px 0; vertical-align: top; }
          .meta-label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 4px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          .table th { text-align: left; font-size: 12px; color: #aa1414; padding: 12px 0; border-bottom: 2px solid #e5e7eb; }
          .table td { padding: 14px 0; border-bottom: 1px solid #f1f5f9; }
          .table th:last-child, .table td:last-child { text-align: right; }
          .summary { margin-left: auto; width: 260px; padding-top: 16px; }
          .summary-row { display: flex; justify-content: space-between; padding: 8px 0; color: #4b5563; }
          .summary-total { display: flex; justify-content: space-between; padding-top: 12px; margin-top: 8px; border-top: 1px solid #d1d5db; font-size: 18px; font-weight: bold; color: #111827; }
          .footer { padding: 0 32px 28px; color: #6b7280; font-size: 13px; }
          .empty { color: #6b7280; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>INVOICE</h1>
              <p>Invoice #: ${escapeHtml(invoice.invoiceNumber || '-')}</p>
              <p>Payment Method: ${escapeHtml(invoice.paymentMethod || '-')}</p>
            </div>
            <div class="section">
              <p>Hello ${escapeHtml(clientName)},</p>
              <p>Please find your receipt details below.</p>

              <table class="meta">
                <tr>
                  <td>
                    <span class="meta-label">Billed To</span>
                    <strong>${escapeHtml(invoice.clientName || '-')}</strong><br />
                    ${escapeHtml(invoice.clientEmail || '-')}<br />
                    ${escapeHtml(invoice.clientTelephone || '-')}
                  </td>
                  <td>
                    <span class="meta-label">Dates</span>
                    Issue Date: ${escapeHtml(formatDate(invoice.issueDate))}<br />
                    Due Date: ${escapeHtml(formatDate(invoice.dueDate))}
                  </td>
                </tr>
              </table>

              <table class="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Quantity</th>
                    <th>Unit Cost</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML || '<tr><td class="empty" colspan="4">No items on this invoice.</td></tr>'}
                </tbody>
              </table>

              <div class="summary">
                <div class="summary-row"><span>Subtotal</span><strong>${formatCurrency(invoice.subtotal)}</strong></div>
                <div class="summary-total"><span>Total</span><span>${formatCurrency(invoice.total)}</span></div>
              </div>
            </div>
            <div class="footer">
              <p>Thank you for your patronage.</p>
              <p>Instagram: @zerofold_culture | Phone: +233 572 201 211</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

const buildInvoicePdfBuffer = (invoice) => new Promise((resolve, reject) => {
  const pdfDoc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];

  pdfDoc.on('data', (chunk) => chunks.push(chunk));
  pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
  pdfDoc.on('error', reject);

  const pageWidth = pdfDoc.page.width;
  const pageHeight = pdfDoc.page.height;
  const mL = 40;
  const mR = pageWidth - 40;
  const cW = mR - mL;
  const brandDark = [15, 15, 15];
  const brandRed = [170, 20, 20];
  const brandGold = [212, 160, 23];
  const textDark = '#1e1e1e';
  const textGray = '#767676';
  const safeText = (value) => (value ? String(value) : '-');
  const currency = (value) => formatCurrency(value);
  let y = 0;

  // 1) Header brand block (same structure as View Receipt)
  const companyTop = 'ZERO';
  const companyBottom = 'FOLD';
  const logoBoxSize = 125;
  const logoGap = 0;
  const companyShiftX = -32;
  pdfDoc.font('Helvetica-Bold').fontSize(25);
  const nameWidth = Math.max(pdfDoc.widthOfString(companyTop), pdfDoc.widthOfString(companyBottom));
  const blockWidth = (logoAsset ? logoBoxSize : 0) + logoGap + nameWidth;
  const blockX = mL + ((cW - blockWidth) / 2);
  const logoX = blockX;
  const logoY = y;

  if (logoAsset) {
    try {
      pdfDoc.image(logoAsset, logoX, logoY, { width: logoBoxSize, height: logoBoxSize });
    } catch (error) {
      console.warn('Failed to draw logo in PDF:', error.message);
    }
  }

  const companyX = logoAsset
    ? (logoX + logoBoxSize + logoGap + companyShiftX)
    : (mL + cW / 2 - nameWidth / 2 + companyShiftX);
  const companyLineGap = 24;
  const companyTopY = logoAsset
    ? (logoY + (logoBoxSize / 2) - (companyLineGap / 2) + 8)
    : (logoY + 32);
  pdfDoc.font('Helvetica-Bold').fontSize(25).fillColor(textDark).text(companyTop, companyX, companyTopY);
  pdfDoc.text(companyBottom, companyX, companyTopY + companyLineGap);

  // 2) Invoice banner
  y += (logoAsset ? logoBoxSize + 22 : 72);
  const headerGradient = pdfDoc.linearGradient(mL, y, mR, y);
  // PDFKit reliably parses hex colors in gradients across runtimes.
  headerGradient.stop(0, '#0f0f0f');
  headerGradient.stop(1, '#aa1414');
  pdfDoc.rect(mL, y, cW, 54).fill(headerGradient);
  pdfDoc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28).text('INVOICE', mL + 16, y + 14);
  pdfDoc.fillColor('#cfcfcf').font('Helvetica').fontSize(8)
    .text('PAYMENT METHOD', mR - 140, y + 18, { width: 126, align: 'right' });
  pdfDoc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
    .text(safeText(invoice.paymentMethod).toUpperCase(), mR - 140, y + 34, { width: 126, align: 'right' });

  // 3) Info row
  y += 54;
  const infoH = 64;
  const colW = cW / 4;
  pdfDoc.rect(mL, y, cW, infoH).fillAndStroke('#ffffff', '#dddddd');
  for (let i = 1; i < 4; i += 1) {
    const x = mL + colW * i;
    pdfDoc.moveTo(x, y + 10).lineTo(x, y + infoH - 10).strokeColor('#d2d2d2').lineWidth(0.5).stroke();
  }

  const labels = ['BILLED TO', 'INVOICE NUMBER', 'DATE OF ISSUE', 'INVOICE TOTAL'];
  const values = [
    safeText(invoice.clientName),
    safeText(invoice.invoiceNumber),
    formatDate(invoice.issueDate),
    currency(invoice.total)
  ];
  const subs = [
    safeText(invoice.clientTelephone) !== '-' ? safeText(invoice.clientTelephone) : safeText(invoice.clientEmail),
    '',
    formatDate(invoice.dueDate) !== '-' ? `Due: ${formatDate(invoice.dueDate)}` : '',
    ''
  ];

  labels.forEach((label, i) => {
    const cx = mL + colW * i + 12;
    pdfDoc.font('Helvetica').fontSize(7).fillColor(textGray).text(label, cx, y + 10);
    pdfDoc.font('Helvetica-Bold').fontSize(i === 3 ? 13 : 10).fillColor(textDark).text(values[i], cx, y + 24, { width: colW - 16 });
    if (subs[i]) {
      pdfDoc.font('Helvetica').fontSize(7.5).fillColor(textGray).text(subs[i], cx, y + 40, { width: colW - 16 });
    }
  });

  // 4) Items table
  y += infoH + 12;
  pdfDoc.moveTo(mL, y).lineTo(mR, y).strokeColor(`rgb(${brandGold[0]},${brandGold[1]},${brandGold[2]})`).lineWidth(1.5).stroke();
  y += 14;

  const cDesc = mL + 10;
  const cUnit = mL + 242;
  const cQty = mL + 356;
  const cAmtR = mR - 10;
  pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor(`rgb(${brandGold[0]},${brandGold[1]},${brandGold[2]})`);
  pdfDoc.text('DESCRIPTION', cDesc, y);
  pdfDoc.text('UNIT COST', cUnit, y);
  pdfDoc.text('QUANTITY', cQty, y);
  pdfDoc.text('AMOUNT', cAmtR - 60, y, { width: 60, align: 'right' });
  y += 18;
  pdfDoc.moveTo(mL, y).lineTo(mR, y).strokeColor(`rgb(${brandGold[0]},${brandGold[1]},${brandGold[2]})`).lineWidth(0.8).stroke();
  y += 8;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.length === 0) {
    pdfDoc.font('Helvetica-Oblique').fontSize(9).fillColor(textGray).text('No items.', cDesc, y + 4);
    y += 30;
  } else {
    items.forEach((item) => {
      if (y > pageHeight - 180) {
        pdfDoc.addPage();
        y = 40;
      }

      const qty = safeNumber(item.quantity);
      const unit = safeNumber(item.unitPrice);
      const amt = qty * unit;
      pdfDoc.font('Helvetica-Bold').fontSize(9.5).fillColor(textDark)
        .text(safeText(item.description), cDesc, y + 4, { width: 210 });
      pdfDoc.font('Helvetica').fontSize(9.5)
        .text(currency(unit), cUnit, y + 4)
        .text(String(qty), cQty, y + 4)
        .text(currency(amt), cAmtR - 80, y + 4, { width: 80, align: 'right' });

      y += 30;
      pdfDoc.moveTo(mL, y).lineTo(mR, y).strokeColor('#e6e6e6').lineWidth(0.4).stroke();
    });
  }

  // 5) Totals
  y += 20;
  const totX = mR - cW * 0.44;
  pdfDoc.font('Helvetica').fontSize(10).fillColor(textGray).text('SubTotal', totX, y);
  pdfDoc.font('Helvetica').fontSize(10).fillColor(textDark)
    .text(currency(invoice.subtotal), mR - 90, y, { width: 90, align: 'right' });
  pdfDoc.moveTo(totX, y + 10).lineTo(mR, y + 10).strokeColor('#dcdcdc').lineWidth(0.4).stroke();
  pdfDoc.font('Helvetica-Bold').fontSize(12).fillColor(textDark).text('Total', totX, y + 24);
  pdfDoc.font('Helvetica-Bold').fontSize(12)
    .text(currency(invoice.total), mR - 90, y + 24, { width: 90, align: 'right' });

  // 6) Footer (centered contact row + icons)
  const footerY = pageHeight - 60;
  pdfDoc.moveTo(mL, footerY).lineTo(mR, footerY).strokeColor('#dcdcdc').lineWidth(0.5).stroke();

  const centerX = (mL + mR) / 2;
  const footerContactY = footerY + 14;
  const socialY = footerContactY + 12;
  const footerThanksY = socialY + 14;
  const footerIconSize = 9;
  const footerIconGap = 6;
  const footerSectionGap = 18;
  const instagramLabel = '@zerofold_culture';
  const phoneLabel = '+233 572 201 211';

  pdfDoc.font('Helvetica').fontSize(7.5).fillColor(textGray)
    .text('For queries contact us at zerofold91@gmail.com', mL, footerContactY, { width: cW, align: 'center' });

  if (instagramAsset) {
    const instagramTextWidth = pdfDoc.widthOfString(instagramLabel);
    const phoneTextWidth = pdfDoc.widthOfString(phoneLabel);
    const rowWidth = footerIconSize + footerIconGap + instagramTextWidth
      + footerSectionGap + footerIconSize + footerIconGap + phoneTextWidth;
    const rowStartX = centerX - (rowWidth / 2);

    try {
      pdfDoc.image(instagramAsset, rowStartX, socialY - 7, { width: footerIconSize, height: footerIconSize });
    } catch (error) {
      console.warn('Failed to draw instagram icon in PDF:', error.message);
    }

    pdfDoc.font('Helvetica').fontSize(7.5).fillColor(textGray)
      .text(instagramLabel, rowStartX + footerIconSize + footerIconGap, socialY - 1);

    const phoneStartX = rowStartX + footerIconSize + footerIconGap + instagramTextWidth + footerSectionGap;
    if (phoneAsset) {
      try {
        pdfDoc.image(phoneAsset, phoneStartX, socialY - 7, { width: footerIconSize, height: footerIconSize });
      } catch (error) {
        console.warn('Failed to draw phone icon in PDF:', error.message);
      }
      pdfDoc.text(phoneLabel, phoneStartX + footerIconSize + footerIconGap, socialY - 1);
    } else {
      pdfDoc.text(phoneLabel, phoneStartX, socialY - 1);
    }
  } else {
    pdfDoc.text('Instagram: @zerofold_culture   |   Phone: +233 572 201 211', mL, socialY, {
      width: cW,
      align: 'center'
    });
  }

  pdfDoc.font('Helvetica-Oblique').fontSize(8).fillColor(textGray)
    .text('Thank you for your patronage. Please review your invoice details carefully.', mL, footerThanksY, {
      width: cW,
      align: 'center'
    });

  pdfDoc.end();
});

const sendInvoiceEmailHandler = async ({ invoiceId, clientEmail, clientName, invoiceNumber, pdfBase64 }) => {
  if (!invoiceId || !clientEmail || !clientName) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const invoiceDoc = await findInvoiceDocument(invoiceId);

  if (!invoiceDoc) {
    throw new functions.https.HttpsError('not-found', 'Invoice not found');
  }

  const invoice = invoiceDoc.data();
  let pdfBuffer;
  try {
    pdfBuffer = pdfBase64
      ? Buffer.from(String(pdfBase64), 'base64')
      : await buildInvoicePdfBuffer(invoice);
  } catch (error) {
    const details = {
      stage: 'pdf_generation',
      message: error && error.message ? String(error.message) : 'Unknown PDF error'
    };
    console.error('Invoice PDF generation failed:', details);
    throw new functions.https.HttpsError('failed-precondition', 'Failed to generate invoice PDF', details);
  }
  const { user } = resolveGmailCredentials();
  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from: formatFromAddress(user),
      sender: user,
      to: clientEmail,
      subject: `Invoice ${invoiceNumber || invoice.invoiceNumber || ''}`.trim(),
      text: 'Hello,\n\nPlease find attached your invoice for your review.\n\nThank you for your patronage.\n\nKind regards,\nZerofold_culture.',
      html: '<p>Hello,</p><p>Please find attached your invoice for your review.</p><div><object data="cid:invoicePdf" type="application/pdf" width="100%" height="420"><p>Invoice PDF is attached.</p></object></div><p>Thank you for your patronage.</p><p>Kind regards,<br />Zerofold_culture.</p>',
      attachments: [
        {
          filename: `${invoice.invoiceNumber || 'invoice'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
          cid: 'invoicePdf',
          contentDisposition: 'inline'
        }
      ]
    });
  } catch (error) {
    const details = {
      provider: 'gmail',
      code: error && error.code ? String(error.code) : 'unknown',
      responseCode: error && error.responseCode ? error.responseCode : null,
      response: error && error.response ? String(error.response) : '',
      command: error && error.command ? String(error.command) : ''
    };
    console.error('SMTP send failed (callable):', details);
    throw new functions.https.HttpsError('failed-precondition', 'Gmail send failed', details);
  }

  await admin.firestore().collection('invoices').doc(invoiceDoc.id).update({
    status: 'sent',
    sentAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { message: 'Invoice sent successfully', invoiceDocId: invoiceDoc.id };
};

const sendInvoiceFromDocument = async (invoiceDoc) => {
  const invoice = invoiceDoc.data() || {};
  const clientEmail = invoice.clientEmail;
  const clientName = invoice.clientName;

  if (!clientEmail || !clientName) {
    throw new Error('Invoice is missing client email or client name');
  }

  let pdfBuffer;
  if (invoice.emailAttachmentPath) {
    const bucket = admin.storage().bucket();
    const file = bucket.file(String(invoice.emailAttachmentPath));
    const [downloaded] = await file.download();
    pdfBuffer = downloaded;
  } else if (invoice.emailAttachmentBase64) {
    pdfBuffer = Buffer.from(String(invoice.emailAttachmentBase64), 'base64');
  } else {
    pdfBuffer = await buildInvoicePdfBuffer(invoice);
  }
  const attachmentName = invoice.emailAttachmentName || `${invoice.invoiceNumber || 'invoice'}.pdf`;
  const { user } = resolveGmailCredentials();
  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from: formatFromAddress(user),
      sender: user,
      to: clientEmail,
      subject: `Invoice ${invoice.invoiceNumber || ''}`.trim() || 'Invoice',
      text: 'Hello,\n\nPlease find attached your invoice for your review.\n\nThank you for your patronage.\n\nKind regards,\nZerofold_culture.',
      html: '<p>Hello,</p><p>Please find attached your invoice for your review.</p><div><object data="cid:invoicePdf" type="application/pdf" width="100%" height="420"><p>Invoice PDF is attached.</p></object></div><p>Thank you for your patronage.</p><p>Kind regards,<br />Zerofold_culture.</p>',
      attachments: [
        {
          filename: attachmentName,
          content: pdfBuffer,
          contentType: 'application/pdf',
          cid: 'invoicePdf',
          contentDisposition: 'inline'
        }
      ]
    });
  } catch (error) {
    const details = {
      provider: 'gmail',
      code: error && error.code ? String(error.code) : 'unknown',
      responseCode: error && error.responseCode ? error.responseCode : null,
      response: error && error.response ? String(error.response) : '',
      command: error && error.command ? String(error.command) : ''
    };
    console.error('SMTP send failed (status trigger):', details);
    throw new Error(`Gmail send failed: ${details.code} ${details.responseCode || ''} ${details.response || ''}`.trim());
  }

  await admin.firestore().collection('invoices').doc(invoiceDoc.id).update({
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    emailAttachmentBase64: admin.firestore.FieldValue.delete(),
    emailAttachmentPath: admin.firestore.FieldValue.delete(),
    emailAttachmentName: admin.firestore.FieldValue.delete()
  });
};

exports.sendInvoiceEmailCallable = functions.https.onCall(async (data) => {
  try {
    return await sendInvoiceEmailHandler(data || {});
  } catch (error) {
    console.error('Callable sendInvoiceEmail error:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', error.message || 'Failed to send invoice email', {
      code: error && error.code ? String(error.code) : 'unknown',
      message: error && error.message ? String(error.message) : 'Unknown error'
    });
  }
});

const getTimestampMillis = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

exports.sendInvoiceOnStatusChange = functions.firestore
  .document('invoices/{invoiceDocId}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const becameSent = before.status !== 'sent' && after.status === 'sent';
    const resendRequested =
      after.status === 'sent' &&
      getTimestampMillis(before.sendRequestedAt) !== getTimestampMillis(after.sendRequestedAt);

    if (!becameSent && !resendRequested) {
      return null;
    }

    try {
      await sendInvoiceFromDocument(change.after);
      return null;
    } catch (error) {
      console.error('Error sending invoice from status trigger:', error);
      await admin.firestore().collection('invoices').doc(change.after.id).update({
        emailError: error.message || 'Failed to send email'
      });
      return null;
    }
  });

// Optional: Scheduled function to send reminder emails for upcoming due dates
exports.sendPaymentReminders = functions.pubsub.schedule('every day 09:00').onRun(async (context) => {
  try {
    const today = new Date();
    const reminderDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

    const invoicesSnapshot = await admin.firestore()
      .collection('invoices')
      .where('status', '==', 'sent')
      .where('dueDate', '<=', reminderDate.toISOString())
      .get();

    for (const doc of invoicesSnapshot.docs) {
      const invoice = doc.data();
      
      const reminderHTML = `
        <html>
          <body>
            <h2>Payment Reminder</h2>
            <p>Hello ${invoice.clientName},</p>
            <p>This is a friendly reminder that invoice <strong>${invoice.invoiceNumber}</strong> is due on <strong>${new Date(invoice.dueDate).toLocaleDateString()}</strong>.</p>
            <p>Amount due: <strong>${formatCurrency(invoice.total)}</strong></p>
            <p>Please process the payment at your earliest convenience.</p>
            <p>Thank you!</p>
          </body>
        </html>
      `;

      const { user } = resolveGmailCredentials();
      const transporter = createTransporter();

      await transporter.sendMail({
        from: formatFromAddress(user),
        sender: user,
        to: invoice.clientEmail,
        subject: `Payment Reminder: Invoice ${invoice.invoiceNumber}`,
        html: reminderHTML
      });
    }

    console.log('Payment reminders sent successfully');
    return null;
  } catch (error) {
    console.error('Error sending reminders:', error);
    return null;
  }
});
