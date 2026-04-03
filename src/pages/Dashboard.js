import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import './Dashboard.css';

function Dashboard() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const isInvoiceIncomplete = (invoice) => {
    if (!invoice) return true;
    const hasClient = Boolean(invoice.clientName && invoice.clientName.trim());
    const hasInvoiceNumber = Boolean(invoice.invoiceNumber && invoice.invoiceNumber.trim());
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const hasValidItem = items.some((item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      const hasDescription = Boolean(item?.description && String(item.description).trim());
      return hasDescription && quantity > 0 && unitPrice >= 0;
    });
    return !hasClient || !hasInvoiceNumber || !hasValidItem;
  };

  const resolveStatus = (invoice) => {
    if ((invoice.status || '').toLowerCase() === 'void') return 'void';
    return isInvoiceIncomplete(invoice) ? 'void' : (invoice.status || 'draft');
  };

  const buildExportRows = (sourceInvoices) => sourceInvoices.map(inv => {
    const status = resolveStatus(inv);
    return {
      'Invoice #': inv.invoiceNumber || '',
      'Client': inv.clientName || '',
      'Telephone': inv.clientTelephone || '',
      'Email': inv.clientEmail || '',
      'Amount': inv.total != null ? Number(inv.total) : 0,
      'Date': inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '',
      'Payment Method': inv.paymentMethod || '',
      'Status': status === 'void' ? 'voided' : status,
    };
  });

  const exportRecords = (records, sheetName, filename) => {
    if (records.length === 0) {
      alert('No invoices found for the selected period.');
      return;
    }

    const rows = buildExportRows(records);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 28 },
      { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchInvoices = async () => {
      try {
        const q = query(collection(db, 'invoices'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const invoicesData = querySnapshot.docs.map(doc => {
          const raw = doc.data();
          const createdAt = raw.createdAt;
          const createdAtDate = createdAt && createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
          return {
            ...raw,
            docId: doc.id,
            createdAt: isNaN(createdAtDate.getTime()) ? new Date() : createdAtDate,
          };
        });
        setInvoices(invoicesData.sort((a, b) => b.createdAt - a.createdAt));
      } catch (error) {
        console.error('Error fetching invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [user]);

  const handleDelete = async (docId) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      try {
        await deleteDoc(doc(db, 'invoices', docId));
        setInvoices(invoices.filter(inv => inv.docId !== docId));
      } catch (error) {
        console.error('Error deleting invoice:', error);
      }
    }
  };

  const generateDailySalesRecord = () => {
    const defaultDate = new Date().toISOString().slice(0, 10);
    const selectedDate = window.prompt('Enter day to export (YYYY-MM-DD):', defaultDate);
    if (!selectedDate) return;

    const targetDate = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) {
      alert('Invalid date format. Use YYYY-MM-DD.');
      return;
    }

    const filtered = invoices.filter(inv => {
      const d = inv.createdAt ? new Date(inv.createdAt) : null;
      return d && d.toISOString().slice(0, 10) === selectedDate;
    });

    exportRecords(filtered, `Daily ${selectedDate}`, `daily-sales-${selectedDate}.xlsx`);
  };

  const generateMonthlySalesRecord = () => {
    const defaultMonth = new Date().toISOString().slice(0, 7);
    const selectedMonth = window.prompt('Enter month to export (YYYY-MM):', defaultMonth);
    if (!selectedMonth) return;

    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
      alert('Invalid month format. Use YYYY-MM.');
      return;
    }

    const filtered = invoices.filter(inv => {
      const d = inv.createdAt ? new Date(inv.createdAt) : null;
      return d && d.toISOString().slice(0, 7) === selectedMonth;
    });

    exportRecords(filtered, `Monthly ${selectedMonth}`, `monthly-sales-${selectedMonth}.xlsx`);
  };

  if (loading) return <div className="loading">Loading invoices...</div>;
  if (!user) return (
    <div className="dashboard">
      <div className="empty-state">
        <p>Please log in to see your invoices.</p>
        <Link to="/login" className="btn btn-primary">Login</Link>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <Link to="/create" className="btn btn-primary">+ Create New Invoice</Link>
        <button onClick={generateDailySalesRecord} className="btn btn-secondary">Generate Daily Sales Record</button>
        <button onClick={generateMonthlySalesRecord} className="btn btn-secondary">Generate Monthly Sales Record</button>
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state">
          <Link to="/create" className="btn btn-primary">Create Invoice</Link>
        </div>
      ) : (
        <div className="invoices-table">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Telephone</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.docId || invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.clientName}</td>
                  <td>{invoice.clientTelephone || '-'}</td>
                  <td>{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'N/A'}</td>
                  <td><span className={`status ${resolveStatus(invoice)}`}>{resolveStatus(invoice)}</span></td>
                  <td className="actions">
                    <Link to={`/invoice/${invoice.docId || invoice.id}`} className="btn btn-sm btn-primary">View</Link>
                    <button onClick={() => handleDelete(invoice.docId || invoice.id)} className="btn btn-sm btn-danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
