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

  const sortInvoicesForDisplay = (sourceInvoices) => {
    return [...sourceInvoices].sort((a, b) => {
      const aStatus = resolveStatus(a);
      const bStatus = resolveStatus(b);
      const aIsIncomplete = aStatus === 'void';
      const bIsIncomplete = bStatus === 'void';

      if (aIsIncomplete !== bIsIncomplete) {
        return aIsIncomplete ? 1 : -1;
      }

      const aDate = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });
  };

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

  const isSalesInvoice = (invoice) => resolveStatus(invoice) === 'paid';

  const buildExportRows = (sourceInvoices) => sourceInvoices.map(inv => {
    const status = resolveStatus(inv);
    const normalizedStatus = String(status || 'draft').toLowerCase();
    return {
      'Invoice #': inv.invoiceNumber || '',
      'Client': inv.clientName || '',
      'Telephone': inv.clientTelephone || '',
      'Email': inv.clientEmail || '',
      'Amount': inv.total != null ? Number(inv.total) : 0,
      'Date': inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '',
      'Payment Method': inv.paymentMethod || '',
      'Status': normalizedStatus === 'void' ? 'voided' : normalizedStatus,
      'Included In Sales': normalizedStatus === 'paid' ? 'yes' : 'no',
    };
  });

  const exportRecords = (records, sheetName, filename) => {
    const salesRecords = records.filter(isSalesInvoice);

    if (salesRecords.length === 0) {
      alert('No completed sales invoices found.');
      return;
    }

    const rows = buildExportRows(salesRecords);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 28 },
      { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 },
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
        setInvoices(sortInvoicesForDisplay(invoicesData));
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
        setInvoices(prevInvoices => sortInvoicesForDisplay(prevInvoices.filter(inv => inv.docId !== docId)));
      } catch (error) {
        console.error('Error deleting invoice:', error);
      }
    }
  };

  const generateAllSalesRecord = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportRecords(invoices, 'All Sales', `all-sales-${dateStamp}.xlsx`);
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
        <button onClick={generateAllSalesRecord} className="btn btn-secondary">Generate All Sales Record</button>
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
