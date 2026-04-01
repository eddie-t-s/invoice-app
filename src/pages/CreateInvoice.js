import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { jsPDF } from 'jspdf';
import './CreateInvoice.css';

function CreateInvoice() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [invoiceNumberLoaded, setInvoiceNumberLoaded] = useState(false);

  const items = [
    { description: 'RED SNOW', price: 400 },
    { description: 'ZF DARK COAST', price: 370 },
    { description: 'ZF GOLD COAST', price: 370 },
    { description: '12AM FOLD', price: 400 },
    { description: 'FIRE FOLD', price: 400 },
    { description: 'BLATE FOLD', price: 400 },
  ];

  useEffect(() => {
    const generateInvoiceNumber = async () => {
      try {
        const invoicesRef = collection(db, 'invoices');
        const q = query(invoicesRef, orderBy('invoiceNumber', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        let nextNum = 1;
        if (!querySnapshot.empty) {
          const lastInvoice = querySnapshot.docs[0].data();
          const lastNum = parseInt(lastInvoice.invoiceNumber.slice(2));
          nextNum = lastNum + 1;
        }
        const newInvoiceNumber = 'ZF' + nextNum.toString().padStart(5, '0');
        setFormData(prev => ({ ...prev, invoiceNumber: newInvoiceNumber }));
        setInvoiceNumberLoaded(true);
      } catch (error) {
        console.error('Error generating invoice number:', error);
        setFormData(prev => ({ ...prev, invoiceNumber: 'ZF00001' }));
        setInvoiceNumberLoaded(true);
      }
    };
    generateInvoiceNumber();
  }, []);

  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    clientTelephone: '',
    invoiceNumber: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
    paymentMethod: 'cash',
  });

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unitPrice: 0 }]
    });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal();
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const generatePDF = (invoiceData) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginLeft = 40;
    let yPos = 40;

    doc.setFontSize(18);
    doc.text('Invoice', marginLeft, yPos);
    doc.setFontSize(11);
    yPos += 25;

    doc.text(`Invoice Number: ${invoiceData.invoiceNumber}`, marginLeft, yPos);
    yPos += 15;
    doc.text(`Issue Date: ${invoiceData.issueDate}`, marginLeft, yPos);
    yPos += 15;
    doc.text(`Due Date: ${invoiceData.dueDate}`, marginLeft, yPos);
    yPos += 15;
    doc.text(`Payment Method: ${invoiceData.paymentMethod}`, marginLeft, yPos);
    yPos += 25;

    doc.setFontSize(14);
    doc.text('Bill To:', marginLeft, yPos);
    doc.setFontSize(11);
    yPos += 15;
    doc.text(`Name: ${invoiceData.clientName}`, marginLeft, yPos);
    yPos += 15;
    doc.text(`Email: ${invoiceData.clientEmail}`, marginLeft, yPos);
    yPos += 15;
    doc.text(`Telephone: ${invoiceData.clientTelephone}`, marginLeft, yPos);
    yPos += 25;

    doc.setFontSize(14);
    doc.text('Items', marginLeft, yPos);
    doc.setFontSize(11);
    yPos += 15;
    doc.text('Description', marginLeft, yPos);
    doc.text('Qty', 280, yPos);
    doc.text('Unit Price', 340, yPos);
    doc.text('Amount', 430, yPos);
    yPos += 10;
    doc.line(marginLeft, yPos, 520, yPos);
    yPos += 10;

    invoiceData.items.forEach((item) => {
      doc.text(item.description || '-', marginLeft, yPos);
      doc.text(`${item.quantity}`, 280, yPos);
      doc.text(`₵ ${item.unitPrice.toFixed(2)}`, 340, yPos);
      const amount = (item.quantity * item.unitPrice).toFixed(2);
      doc.text(`₵ ${amount}`, 430, yPos);
      yPos += 15;
      if (yPos > 760) {
        doc.addPage();
        yPos = 40;
      }
    });

    yPos += 20;
    doc.text(`Subtotal: ₵ ${invoiceData.subtotal.toFixed(2)}`, marginLeft, yPos);
    yPos += 15;
    doc.text(`Total: ₵ ${invoiceData.total.toFixed(2)}`, marginLeft, yPos);

    const pdfUrl = doc.output('bloburl');
    window.open(pdfUrl, '_blank');

    doc.save(`${invoiceData.invoiceNumber}.pdf`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!user || !user.uid) {
        alert('User not authenticated. Please log in again.');
        setLoading(false);
        navigate('/login');
        return;
      }

      const invoiceData = {
        ...formData,
        userId: user.uid,
        subtotal: calculateSubtotal(),
        total: calculateTotal(),
        status: 'draft',
        createdAt: new Date().toISOString(),
        id: uuidv4()
      };

      console.log('Creating invoice with data:', invoiceData);
      const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
      console.log('Invoice created with ID:', docRef.id);
      alert('Invoice created successfully!');
      // PDF generation is now handled on the invoice detail view by a user-gesture button
      navigate(`/invoice/${docRef.id}`);
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Error creating invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-invoice">
      <h1>Create New Invoice</h1>
      <form onSubmit={handleSubmit} className="invoice-form">
        
        {/* Client Information */}
        <section className="form-section">
          <h2>Client Information</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Client Name *</label>
              <input
                type="text"
                name="clientName"
                value={formData.clientName}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Client Email *</label>
              <input
                type="email"
                name="clientEmail"
                value={formData.clientEmail}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>Client Telephone</label>
            <input
              type="tel"
              name="clientTelephone"
              value={formData.clientTelephone}
              onChange={handleInputChange}
              required
            />
          </div>
        </section>

        {/* Invoice Details */}
        <section className="form-section">
          <h2>Invoice Details</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Invoice Number</label>
              <input
                type="text"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleInputChange}
                readOnly
              />
            </div>
            <div className="form-group">
              <label>Issue Date</label>
              <input
                type="date"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleInputChange}
              >
                <option value="cash">Cash</option>
                <option value="momo">Momo</option>
              </select>
            </div>
          </div>
        </section>

        {/* Invoice Items */}
        <section className="form-section">
          <div className="section-header">
            <h2>Invoice Items</h2>
            <button type="button" onClick={addItem} className="btn btn-primary">+ Add Item</button>
          </div>
          
          <div className="items-table">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <select
                        value={item.description}
                        onChange={(e) => {
                          const selectedItem = items.find(it => it.description === e.target.value);
                          if (selectedItem) {
                            updateItem(index, 'description', selectedItem.description);
                            updateItem(index, 'unitPrice', selectedItem.price);
                          } else {
                            updateItem(index, 'description', e.target.value);
                          }
                        }}
                      >
                        <option value="">Select Item</option>
                        {items.map(it => <option key={it.description} value={it.description}>{it.description} - ₵ {it.price}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value))}
                      />
                    </td>
                    <td>₵ {(item.quantity * item.unitPrice).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="btn btn-danger btn-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Calculations */}
        <section className="form-section calculations">
          <div className="calc-row">
            <label>Subtotal:</label>
            <span>₵ {calculateSubtotal().toFixed(2)}</span>
          </div>
          <div className="calc-row total">
            <label>Total:</label>
            <span>₵ {calculateTotal().toFixed(2)}</span>
          </div>
        </section>

        {/* Buttons */}
        <div className="form-actions">
          <button type="submit" className="btn btn-success" disabled={loading || !invoiceNumberLoaded}>
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
          <button type="button" onClick={() => navigate('/dashboard')} className="btn btn-primary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateInvoice;
