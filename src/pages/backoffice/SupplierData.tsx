import React from 'react';
import { useSupplierStore } from '../../store/useSupplierStore';
import { Plus, Building2, Edit2, Trash2 } from 'lucide-react';

const SupplierData: React.FC = () => {
  const { suppliers } = useSupplierStore();

  return (
    <div className="bo-container">
      
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Data Supplier (Vendor)</h1>
          <p className="bo-page-subtitle">Kelola daftar master supplier dan terms pembayaran.</p>
        </div>
        <div className="bo-header-actions">
          <button className="bo-btn bo-btn-primary">
            <Plus size={18} /> Tambah Supplier
          </button>
        </div>
      </div>

      <div className="bo-card">
        <div className="bo-card-header">
          <h3 className="bo-card-title">
            <Building2 size={20} style={{ color: 'var(--primary)' }} /> 
            Daftar Supplier Aktif
          </h3>
        </div>
        <div className="bo-table-container">
          <table className="bo-table">
            <thead>
              <tr>
                <th>Nama Perusahaan / Vendor</th>
                <th>Kontak Utama</th>
                <th>Nomor Telepon</th>
                <th style={{ textAlign: 'center' }}>Tempo Pembayaran</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(sup => (
                <tr key={sup.id}>
                  <td className="bo-table-sku">{sup.name}</td>
                  <td className="bo-table-bold">{sup.contact}</td>
                  <td style={{ fontWeight: '500', color: 'var(--text-muted)' }}>{sup.phone}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="bo-badge bo-badge-gray">
                      {sup.paymentTermDays} Hari
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="bo-action-btn"><Edit2 size={16} /></button>
                    <button className="bo-action-btn"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default SupplierData;
