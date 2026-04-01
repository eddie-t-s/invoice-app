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
            id: doc.id,
            ...raw,
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

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      try {
        await deleteDoc(doc(db, 'invoices', id));
        setInvoices(invoices.filter(inv => inv.id !== id));
      } catch (error) {
        console.error('Error deleting invoice:', error);
      }
    }
  };

  const generateDailySalesRecord = () => {
    const today = new Date();
    const todayStr = today.toLocaleDateString();
    const todayInvoices = invoices.filter(inv => {
      const d = inv.createdAt ? new Date(inv.createdAt) : null;
      return d && d.toLocaleDateString() === todayStr;
    });

    if (todayInvoices.length === 0) {
      alert('No invoices found for today.');
      return;
    }

    const rows = todayInvoices.map(inv => ({
      'Invoice #': inv.invoiceNumber || '',
      'Client': inv.clientName || '',
      'Telephone': inv.clientTelephone || '',
      'Email': inv.clientEmail || '',
      'Amount': inv.total != null ? Number(inv.total) : 0,
      'Date': inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '',
      'Payment Method': inv.paymentMethod || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    // Set column widths
    worksheet['!cols'] = [
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 28 },
      { wch: 12 }, { wch: 14 }, { wch: 16 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Sales');
    XLSX.writeFile(workbook, `daily-sales-${today.toISOString().split('T')[0]}.xlsx`);
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
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.clientName}</td>
                  <td>{invoice.clientTelephone || '-'}</td>
                  <td>{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'N/A'}</td>
                  <td><span className={`status ${invoice.status || 'draft'}`}>{invoice.status || 'draft'}</span></td>
                  <td className="actions">
                    <Link to={`/invoice/${invoice.id}`} className="btn btn-sm btn-primary">View</Link>
                    <button onClick={() => handleDelete(invoice.id)} className="btn btn-sm btn-danger">Delete</button>
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
