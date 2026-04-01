import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import logo from '../assets/logo.png';
import instagramIcon from '../assets/images.jpg';
import phoneIcon from '../assets/4436746.png';
import './InvoiceDetails.css';

function InvoiceDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [invoiceDocId, setInvoiceDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('draft');
  const [sendingEmail, setSendingEmail] = useState(false);

  const withTimeout = (promise, ms, stageLabel) => new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${stageLabel} timed out after ${ms / 1000}s`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        console.log('Fetching invoice with ID:', id);
        const docRef = doc(db, 'invoices', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const invoiceData = docSnap.data();
          console.log('Invoice found by Firestore document ID:', docSnap.id);
          setInvoice(invoiceData);
          setInvoiceDocId(docSnap.id);
          setStatus(invoiceData.status || 'draft');
          return;
        }

        const invoicesRef = collection(db, 'invoices');
        const fallbackQuery = query(invoicesRef, where('id', '==', id));
        const fallbackSnapshot = await getDocs(fallbackQuery);

        if (!fallbackSnapshot.empty) {
          const fallbackDoc = fallbackSnapshot.docs[0];
          const invoiceData = fallbackDoc.data();
          console.log('Invoice found by stored invoice ID:', fallbackDoc.id);
          setInvoice(invoiceData);
          setInvoiceDocId(fallbackDoc.id);
          setStatus(invoiceData.status || 'draft');
          return;
        }

        console.warn('Invoice document does not exist in Firestore');
      } catch (error) {
        console.error('Error fetching invoice:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchInvoice();
    }
  }, [id]);

  const updateStatus = async (newStatus) => {
    if (!invoiceDocId) {
      return;
    }

    try {
      const docRef = doc(db, 'invoices', invoiceDocId);
      await updateDoc(docRef, { status: newStatus });
      setStatus(newStatus);
      setInvoice({ ...invoice, status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const formatCurrency = (value) => {
    const numeric = Number(value) || 0;
    return `₵ ${numeric.toFixed(2)}`;
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
  };

  const generatePDFReceipt = async (mode = 'view') => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const mL = 40;
    const mR = pageWidth - 40;
    const cW = mR - mL;
    let y = 0;

    const safeText = (v) => (v ? String(v) : '-');
    const currency  = (v) => `₵ ${(Number(v) || 0).toFixed(2)}`;
    const brandDark   = [15,   15,  15];
    const brandRed    = [170,  20,  20];
    const brandGold   = [212, 160,  23];
    const textDark    = [30,   30,  30];
    const textGray    = [120, 120, 120];

    const loadImg = (src, format = 'jpeg') => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d');
        if (!ctx) { reject(new Error('canvas ctx failed')); return; }
        ctx.drawImage(img, 0, 0);
        if (format === 'png') {
          resolve(cv.toDataURL('image/png'));
          return;
        }
        // JPEG data URLs greatly reduce generated PDF size for email upload.
        resolve(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => reject(new Error('img load failed'));
      img.src = src;
    });

    const drawHorizontalGradient = (pdfDoc, x, topY, width, height, fromRgb, toRgb, steps = 120) => {
      const stripW = width / steps;
      for (let i = 0; i < steps; i += 1) {
        const t = i / (steps - 1);
        const r = Math.round(fromRgb[0] + (toRgb[0] - fromRgb[0]) * t);
        const g = Math.round(fromRgb[1] + (toRgb[1] - fromRgb[1]) * t);
        const b = Math.round(fromRgb[2] + (toRgb[2] - fromRgb[2]) * t);
        pdfDoc.setFillColor(r, g, b);
        pdfDoc.rect(x + i * stripW, topY, stripW + 0.5, height, 'F');
      }
    };

    // ── 1. TOP LOGO + COMPANY NAME ─────────────────────────────────────────
    y = 0;
    let logoDataUrl = null;
    let instagramDataUrl = null;
    let phoneDataUrl = null;
    const companyNameTop = 'ZERO';
    const companyNameBottom = 'FOLD';
    const logoSize = 125;
    const logoGap = 0;
    const companyNameShiftX = -32;
    try {
      logoDataUrl = await loadImg(logo, 'png');
    } catch (e) { console.warn('logo failed', e); }

    try {
      instagramDataUrl = await loadImg(instagramIcon);
    } catch (e) { console.warn('instagram icon failed', e); }

    try {
      phoneDataUrl = await loadImg(phoneIcon);
    } catch (e) { console.warn('phone icon failed', e); }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(25);
    const nameWidth = Math.max(doc.getTextWidth(companyNameTop), doc.getTextWidth(companyNameBottom));
    const brandBlockWidth = logoDataUrl ? (logoSize + logoGap + nameWidth) : nameWidth;
    const brandStartX = mL + (cW - brandBlockWidth) / 2;

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', brandStartX, y, logoSize, logoSize);
    }

    const companyNameX = logoDataUrl
      ? (brandStartX + logoSize + logoGap + companyNameShiftX)
      : (mL + cW / 2 - nameWidth / 2 + companyNameShiftX);
    const companyLineGap = 24;
    const companyNameTopMargin = 4;
    const companyNameY = logoDataUrl
      ? (y + (logoSize / 2) - (companyLineGap / 2) + 4 + companyNameTopMargin)
      : (y + 28 + companyNameTopMargin);
    doc.setTextColor(...brandDark);
    doc.text(companyNameTop, companyNameX, companyNameY);
    doc.text(companyNameBottom, companyNameX, companyNameY + companyLineGap);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...textGray);

    // ── 2. INVOICE BANNER ──────────────────────────────────────────────────
    y += logoDataUrl ? (logoSize + 22) : 72;
    drawHorizontalGradient(doc, mL, y, cW, 54, brandDark, brandRed);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.text('INVOICE', mL + 16, y + 35);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(190, 190, 190);
      doc.text('PAYMENT METHOD', mR - 14, y + 24, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
      doc.text(safeText(invoice.paymentMethod).toUpperCase(), mR - 14, y + 40, { align: 'right' });

    // ── 3. INFO ROW (4 columns) ────────────────────────────────────────────
    y += 54;
    const infoH = 64;
    const colW  = cW / 4;

    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(255, 255, 255);
    doc.rect(mL, y, cW, infoH, 'FD');

    // vertical dividers
    doc.setLineWidth(0.5);
    for (let i = 1; i < 4; i++) {
      doc.setDrawColor(210, 210, 210);
      doc.line(mL + colW * i, y + 10, mL + colW * i, y + infoH - 10);
    }

    const labels = ['BILLED TO', 'INVOICE NUMBER', 'DATE OF ISSUE', 'INVOICE TOTAL'];
    const values = [
      safeText(invoice.clientName),
      safeText(invoice.invoiceNumber),
      formatDate(invoice.issueDate),
      currency(invoice.total)
    ];
    const subs = [
      safeText(invoice.clientAddress) || safeText(invoice.clientEmail),
      '',
      formatDate(invoice.dueDate) ? `Due: ${formatDate(invoice.dueDate)}` : '',
      ''
    ];

    labels.forEach((label, i) => {
      const cx = mL + colW * i + 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...textGray);
      doc.text(label, cx, y + 16);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(i === 3 ? 13 : 10);
      doc.setTextColor(...textDark);
      doc.text(values[i], cx, y + 32);

      if (subs[i]) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...textGray);
        doc.text(subs[i], cx, y + 46, { maxWidth: colW - 16 });
      }
    });

    // ── GOLD ACCENT DIVIDER ────────────────────────────────────────────────
    y += infoH + 12;
    doc.setDrawColor(...brandGold);
    doc.setLineWidth(1.5);
    doc.line(mL, y, mR, y);
    doc.setLineWidth(0.5);
    y += 14;

    // ── 4. ITEMS TABLE ─────────────────────────────────────────────────────
    const cDesc  = mL + 10;
    const cUnit  = mL + 242;
    const cQty   = mL + 356;
    const cAmtR  = mR - 10;

    // Column headers in gold
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...brandGold);
    doc.text('DESCRIPTION', cDesc,  y + 10);
    doc.text('UNIT COST',   cUnit,  y + 10);
    doc.text('QUANTITY',    cQty,   y + 10);
    doc.text('AMOUNT',      cAmtR,  y + 10, { align: 'right' });
    y += 18;

    doc.setDrawColor(...brandGold);
    doc.setLineWidth(0.8);
    doc.line(mL, y, mR, y);
    y += 8;

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    if (items.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...textGray);
      doc.text('No items.', cDesc, y + 14);
      y += 30;
    } else {
      items.forEach((item) => {
        if (y > pageHeight - 160) { doc.addPage(); y = 40; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...textDark);
        doc.text(safeText(item.description), cDesc, y + 13, { maxWidth: 210 });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(currency(item.unitPrice), cUnit, y + 13);
        doc.text(String(Number(item.quantity) || 0), cQty, y + 13);
        doc.text(
          currency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
          cAmtR, y + 13, { align: 'right' }
        );
        y += 30;
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.4);
        doc.line(mL, y, mR, y);
      });
    }

    y += 18;

    // ── 5. COMMENTS + SUBTOTAL/TOTAL ──────────────────────────────────────
    const commentW = cW * 0.46;
    const totX     = mR - cW * 0.44;


    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textGray);
    doc.text('SubTotal', totX, y + 18);
    doc.setTextColor(...textDark);
    doc.text(currency(invoice.subtotal), mR, y + 18, { align: 'right' });

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.4);
    doc.line(totX, y + 28, mR, y + 28);

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...textDark);
    doc.text('Total', totX, y + 46);
    doc.text(currency(invoice.total), mR, y + 46, { align: 'right' });

    

    // ── 6. FOOTER ─────────────────────────────────────────────────────────
    const footerY = pageHeight - 60;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(mL, footerY, mR, footerY);

    const footerTextPadding = 8;
    const footerContactY = footerY + 18;
    const socialY = footerContactY + 12;
    const footerThanksY = socialY + 14;
    const footerCenterX = (mL + mR) / 2;
    const footerContentX = mL + footerTextPadding;
    const footerIconSize = 9;
    const footerIconGap = 6;
    const footerSectionGap = 18;
    const instagramLabel = '@zerofold_culture';
    const phoneLabel = '+233 572 201 211';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...textGray);
    doc.text(
      'For queries contact us at zerofold91@gmail.com',
      footerCenterX, footerContactY, { align: 'center', maxWidth: cW }
    );

    const socialX = footerContentX;
    if (instagramDataUrl) {
      const instagramTextWidth = doc.getTextWidth(instagramLabel);
      const phoneTextWidth = doc.getTextWidth(phoneLabel);
      const socialRowWidth = footerIconSize + footerIconGap + instagramTextWidth + footerSectionGap + footerIconSize + footerIconGap + phoneTextWidth;
      const centeredSocialX = footerCenterX - (socialRowWidth / 2);
      doc.addImage(instagramDataUrl, 'JPEG', centeredSocialX, socialY - 7, footerIconSize, footerIconSize);
      doc.text(instagramLabel, centeredSocialX + footerIconSize + footerIconGap, socialY);
      const phoneStartX = centeredSocialX + footerIconSize + footerIconGap + instagramTextWidth + footerSectionGap;
      if (phoneDataUrl) {
        doc.addImage(phoneDataUrl, 'JPEG', phoneStartX, socialY - 7, footerIconSize, footerIconSize);
        doc.text(phoneLabel, phoneStartX + footerIconSize + footerIconGap, socialY, { maxWidth: 172 });
      } else {
        doc.text(phoneLabel, phoneStartX, socialY, { maxWidth: 180 });
      }
    } else {
      doc.text('Instagram: @zerofold_culture   |   Phone: +233 572 201 211', footerCenterX, socialY, {
        align: 'center',
        maxWidth: 280
      });
    }

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...textGray);
    doc.text(
      'Thank you for your patronage. Please review your invoice details carefully.',
      footerCenterX, footerThanksY, { align: 'center', maxWidth: cW }
    );

    doc.setTextColor(0, 0, 0);

    if (mode === 'base64') {
      const dataUri = doc.output('datauristring');
      return dataUri.split(',')[1] || '';
    }

    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
    doc.save(`${invoice.invoiceNumber || 'receipt'}.pdf`);
    return null;
  };

  const downloadPDF = async () => {
    const element = document.querySelector('.invoice-preview');
    const canvas = await html2canvas(element);
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 10, 10, 190, 277);
    pdf.save(`${invoice.invoiceNumber}.pdf`);
  };

  const sendEmail = async () => {
    if (!invoiceDocId) {
      return;
    }

    try {
      setSendingEmail(true);
      const pdfBase64 = await withTimeout(generatePDFReceipt('base64'), 45000, 'PDF generation');

      const docRef = doc(db, 'invoices', invoiceDocId);
      await withTimeout(updateDoc(docRef, {
        status: 'sent',
        sendRequestedAt: serverTimestamp(),
        emailError: deleteField(),
        emailAttachmentBase64: pdfBase64,
        emailAttachmentPath: deleteField(),
        emailAttachmentName: `${invoice.invoiceNumber || 'invoice'}.pdf`
      }), 15000, 'Send request update');

      setStatus('sent');
      setInvoice({ ...invoice, status: 'sent' });
      alert(`Email request submitted for ${invoice.clientEmail}. The invoice will be sent from the backend.`);
    } catch (error) {
      console.error('Error sending email:', error);
      const firebaseCode = error?.code || 'unknown';
      const firebaseMessage = error?.message || 'Error sending email';
      const firebaseDetails = error?.details ? `\nDetails: ${JSON.stringify(error.details)}` : '';
      alert(`Email send failed (${firebaseCode}): ${firebaseMessage}${firebaseDetails}`);
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) return <div className="loading">Loading invoice...</div>;
  if (!invoice) return <div className="error">Invoice not found</div>;

  return (
    <div className="invoice-details">
      <div className="invoice-header">
        <h1>Invoice #{invoice.invoiceNumber}</h1>
        <div className="invoice-actions">
          <select value={status} onChange={(e) => updateStatus(e.target.value)} className="status-select">
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </select>
          <button onClick={generatePDFReceipt} className="btn btn-primary">🧾 View Receipt (PDF)</button>
          <button onClick={downloadPDF} className="btn btn-secondary">⬇️ Download Visible Receipt</button>
          <button onClick={sendEmail} className="btn btn-success" disabled={sendingEmail || !invoiceDocId}>
            {sendingEmail ? 'Sending...' : '📧 Send Email'}
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary">← Back</button>
        </div>
      </div>

      <div className="invoice-preview">
        <div className="invoice-container">
          {/* Header */}
          <div className="invoice-header-content">
            <div className="invoice-meta">
              <p><strong>Invoice #:</strong> {invoice.invoiceNumber}</p>
              <p><strong>Issue Date:</strong> {new Date(invoice.issueDate).toLocaleDateString()}</p>
              <p><strong>Due Date:</strong> {new Date(invoice.dueDate).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Bill To */}
          <div className="bill-section">
            <div>
              <h3>Bill To</h3>
              <p><strong>{invoice.clientName}</strong></p>
              <p>{invoice.clientEmail}</p>
              <p>{invoice.clientAddress}</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>₵ {item.unitPrice.toFixed(2)}</td>
                  <td>₵ {(item.quantity * item.unitPrice).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals-section">
            <div className="totals-row">
              <span>Subtotal:</span>
              <span>₵ {invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.taxAmount > 0 && (
              <div className="totals-row">
                <span>Tax ({invoice.tax}%):</span>
                <span>₵ {invoice.taxAmount.toFixed(2)}</span>
              </div>
            )}
            {invoice.discountAmount > 0 && (
              <div className="totals-row">
                <span>Discount ({invoice.discount}%):</span>
                <span>-₵ {invoice.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="totals-row total">
              <span>Total:</span>
              <span>₵ {invoice.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="notes-section">
              <h3>Notes</h3>
              <p>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InvoiceDetails;
