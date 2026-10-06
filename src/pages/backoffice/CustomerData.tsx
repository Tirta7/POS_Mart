import React, { useState } from 'react';
import { useCustomerStore } from '../../store/useCustomerStore';
import { Plus, Search, Edit2, Trash2, X, ShoppingBag, Eye } from 'lucide-react';
import type { Customer } from '../../types';
import '../../styles/backoffice.css';

export const CustomerData = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useCustomerStore();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'ADD' | 'EDIT'>('ADD');
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>({});
  
  // View History state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'ADD') {
      addCustomer({
        id: currentCustomer.id || ('CUST-' + Date.now().toString()),
        name: currentCustomer.name || '',
        phone: currentCustomer.phone || '',
        address: currentCustomer.address || '',
        orders: []
      });
    } else if (modalMode === 'EDIT' && currentCustomer.id) {
      updateCustomer(currentCustomer as Customer);
    }
    setIsModalOpen(false);
    setCurrentCustomer({});
  };

  const formatIDR = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="bo-container">
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Data Pelanggan Grosir</h1>
          <p className="bo-page-subtitle">Kelola daftar pelanggan dan riwayat transaksi mereka.</p>
        </div>
        <div className="bo-header-actions">
          <button 
            className="bo-btn bo-btn-primary" 
            onClick={() => { setModalMode('ADD'); setCurrentCustomer({}); setIsModalOpen(true); }}
          >
            <Plus size={18} /> Tambah Pelanggan
          </button>
        </div>
      </div>

      <div className="bo-card">
        <div className="bo-card-header" style={{ marginBottom: '20px', padding: 0, border: 'none' }}>
          <div style={{ display: 'flex', position: 'relative', width: '100%' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: '#888' }} />
            <input 
              type="text" 
              placeholder="Cari nama atau nomor telepon..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bo-input"
              style={{ width: '100%', paddingLeft: '40px' }}
            />
          </div>
        </div>

        <div className="bo-table-container">
          <table className="bo-table">
          <thead>
            <tr style={{ borderBottom: '2px solid #f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '12px 8px', color: '#666', fontSize: '12px' }}>ID</th>
              <th style={{ padding: '12px 8px', color: '#666', fontSize: '12px' }}>NAMA PELANGGAN</th>
              <th style={{ padding: '12px 8px', color: '#666', fontSize: '12px' }}>TELEPON</th>
              <th style={{ padding: '12px 8px', color: '#666', fontSize: '12px' }}>ALAMAT</th>
              <th style={{ padding: '12px 8px', color: '#666', fontSize: '12px', textAlign: 'center' }}>TOTAL ORDER</th>
              <th style={{ padding: '12px 8px', color: '#666', fontSize: '12px', textAlign: 'right' }}>AKSI</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#888' }}>Data tidak ditemukan</td></tr>
            ) : (
              filteredCustomers.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 8px', fontSize: '14px', fontWeight: 'bold' }}>{c.id}</td>
                  <td className="r-card-title" style={{ padding: '12px 8px', fontSize: '14px', fontWeight: 'bold', color: 'var(--primary)' }}>{c.name}</td>
                  <td style={{ padding: '12px 8px', fontSize: '14px' }}>{c.phone}</td>
                  <td style={{ padding: '12px 8px', fontSize: '14px' }}>{c.address}</td>
                  <td style={{ padding: '12px 8px', fontSize: '14px', textAlign: 'center' }}>
                    <span style={{ background: '#f3f4f6', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>
                      {c.orders.length}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        onClick={() => { setViewCustomer(c); setHistoryModalOpen(true); }}
                        style={{ background: '#eff6ff', color: '#3b82f6', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                        title="Lihat Riwayat Transaksi"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => { setModalMode('EDIT'); setCurrentCustomer(c); setIsModalOpen(true); }}
                        style={{ background: '#f3f4f6', color: '#4b5563', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => { if(window.confirm('Hapus data pelanggan ini?')) deleteCustomer(c.id); }}
                        style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* MODAL FORM PELANGGAN */}
      {isModalOpen && (
        <div className="r-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="r-modal" style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{modalMode === 'ADD' ? 'Tambah Pelanggan Baru' : 'Edit Pelanggan'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>ID PELANGGAN</label>
                <input 
                  type="text" 
                  required
                  placeholder="Misal: PLG-001"
                  disabled={modalMode === 'EDIT'}
                  value={currentCustomer.id || ''}
                  onChange={e => setCurrentCustomer({...currentCustomer, id: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', backgroundColor: modalMode === 'EDIT' ? '#f3f4f6' : 'white' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>NAMA LENGKAP</label>
                <input 
                  type="text" 
                  required
                  value={currentCustomer.name || ''}
                  onChange={e => setCurrentCustomer({...currentCustomer, name: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>NO. TELEPON</label>
                <input 
                  type="text" 
                  required
                  value={currentCustomer.phone || ''}
                  onChange={e => setCurrentCustomer({...currentCustomer, phone: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none' }}
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}>ALAMAT</label>
                <textarea 
                  rows={3}
                  value={currentCustomer.address || ''}
                  onChange={e => setCurrentCustomer({...currentCustomer, address: e.target.value})}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none', resize: 'none' }}
                />
              </div>
              <button type="submit" style={{ width: '100%', padding: '12px', background: 'var(--primary)', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                Simpan Data
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RIWAYAT TRANSAKSI */}
      {historyModalOpen && viewCustomer && (
        <div className="r-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="r-modal" style={{ background: 'white', padding: '0', borderRadius: '12px', width: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#111' }}>Riwayat Transaksi</h3>
                <div style={{ fontSize: '14px', color: 'var(--primary)', fontWeight: 'bold', marginTop: '4px' }}>{viewCustomer.name} ({viewCustomer.phone})</div>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#666"/></button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {viewCustomer.orders.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
                  <ShoppingBag size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                  <div>Belum ada riwayat transaksi.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {viewCustomer.orders.map(order => (
                    <div key={order.orderId} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      <div style={{ background: '#f3f4f6', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', color: '#111', marginRight: '16px' }}>{order.orderId}</span>
                          <span style={{ fontSize: '12px', color: '#666' }}>{formatDate(order.date)}</span>
                        </div>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                          {formatIDR(order.total)}
                        </div>
                      </div>
                      <div style={{ padding: '12px 16px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ color: '#666', borderBottom: '1px solid #f3f4f6' }}>
                              <th style={{ paddingBottom: '8px', textAlign: 'left' }}>Item</th>
                              <th style={{ paddingBottom: '8px', textAlign: 'center' }}>Qty</th>
                              <th style={{ paddingBottom: '8px', textAlign: 'right' }}>Harga</th>
                              <th style={{ paddingBottom: '8px', textAlign: 'right' }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item, idx) => (
                              <tr key={idx}>
                                <td style={{ paddingTop: '8px', color: '#111', fontWeight: 500 }}>{item.name}</td>
                                <td style={{ paddingTop: '8px', textAlign: 'center' }}>{item.qty}</td>
                                <td style={{ paddingTop: '8px', textAlign: 'right' }}>{formatIDR(item.price)}</td>
                                <td style={{ paddingTop: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatIDR(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
