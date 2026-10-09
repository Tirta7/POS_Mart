import React, { useState } from 'react';
import { useSupplierStore } from '../../store/useSupplierStore';
import { Plus, Building2, Edit2, Trash2, X, Save } from 'lucide-react';
import type { Supplier } from '../../types';

const SupplierData: React.FC = () => {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useSupplierStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    name: '',
    contact: '',
    phone: '',
    paymentTermDays: 0
  });

  const [error, setError] = useState('');

  const openAdd = () => {
    setEditTarget(null);
    setForm({ name: '', contact: '', phone: '', paymentTermDays: 0 });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (sup: Supplier) => {
    setEditTarget(sup);
    setForm({
      name: sup.name,
      contact: sup.contact,
      phone: sup.phone,
      paymentTermDays: sup.paymentTermDays || 0
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.contact || !form.phone) {
      setError('Mohon lengkapi nama perusahaan, kontak utama, dan nomor telepon.');
      return;
    }
    setError('');

    if (editTarget) {
      await updateSupplier(editTarget.id, form);
    } else {
      await addSupplier(form);
    }
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus supplier ini?')) {
      await deleteSupplier(id);
    }
  };

  return (
    <div className="bo-container">
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Data Supplier (Vendor)</h1>
          <p className="bo-page-subtitle">Kelola daftar master supplier dan terms pembayaran.</p>
        </div>
        <div className="bo-header-actions">
          <button className="bo-btn bo-btn-primary" onClick={openAdd}>
            <Plus size={18} /> Tambah Supplier
          </button>
        </div>
      </div>

      <div className="bo-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="bo-card-header" style={{ flexShrink: 0 }}>
          <h3 className="bo-card-title">
            <Building2 size={20} style={{ color: 'var(--primary)' }} /> 
            Daftar Supplier Aktif
          </h3>
        </div>
        <div className="bo-table-container" style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="bo-table" style={{ width: '100%', minWidth: '750px' }}>
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
                  <td className="bo-table-sku r-card-title">{sup.name}</td>
                  <td className="bo-table-bold">{sup.contact}</td>
                  <td style={{ fontWeight: '500', color: 'var(--text-muted)' }}>{sup.phone}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="bo-badge bo-badge-gray">
                      {sup.paymentTermDays} Hari
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="bo-action-btn" onClick={() => openEdit(sup)}>
                      <Edit2 size={16} />
                    </button>
                    <button className="bo-action-btn" onClick={() => handleDelete(sup.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
                    Belum ada data supplier
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="r-modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="r-modal" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                {editTarget ? 'Edit Supplier' : 'Tambah Supplier Baru'}
              </h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Nama Perusahaan</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Contoh: PT. Sumber Makmur"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Kontak Utama</label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                  placeholder="Contoh: Bapak Andi"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Nomor Telepon</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Contoh: 08123456789"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Tempo Pembayaran (Hari)</label>
                <input
                  type="number"
                  value={form.paymentTermDays === 0 ? '' : form.paymentTermDays}
                  onChange={e => setForm(f => ({ ...f, paymentTermDays: Number(e.target.value) }))}
                  placeholder="0 untuk pembayaran tunai"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => setModalOpen(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white', cursor: 'pointer', fontWeight: '600', color: '#374151' }}>
                  Batal
                </button>
                <button onClick={handleSave} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', background: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Save size={16} /> Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierData;
