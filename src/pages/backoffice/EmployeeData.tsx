import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { UserPlus, Users, Edit2, Trash2, X, Eye, EyeOff, Save } from 'lucide-react';
import type { Employee } from '../../types';

const EMPTY_EMP: Omit<Employee, 'id'> = {
  name: '',
  role: 'Cashier',
  pin: '',
  username: '',
  password: '',
  isActive: true,
};

const EmployeeData: React.FC = () => {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useAuthStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState<Omit<Employee, 'id'>>(EMPTY_EMP);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_EMP);
    setError('');
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    setForm({ name: emp.name, role: emp.role, pin: emp.pin, username: emp.username, password: emp.password, isActive: emp.isActive });
    setError('');
    setShowPassword(false);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.username.trim() || !form.password.trim() || !form.pin.trim()) {
      setError('Semua field wajib diisi.');
      return;
    }
    // Check duplicate username
    const dupUser = employees.find(e => e.username === form.username.trim() && e.id !== editTarget?.id);
    if (dupUser) { setError('Username sudah digunakan oleh karyawan lain.'); return; }

    if (editTarget) {
      updateEmployee({ ...editTarget, ...form });
    } else {
      addEmployee({ id: 'E' + Date.now(), ...form });
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Hapus karyawan ini?')) deleteEmployee(id);
  };

  return (
    <div className="bo-container">

      <div className="bo-page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="bo-page-title">Data Karyawan & Otorisasi</h1>
          <p className="bo-page-subtitle">Kelola daftar kasir, supervisor, dan hak akses login.</p>
        </div>
        <div className="bo-header-actions">
          <button className="bo-btn bo-btn-primary" onClick={openAdd}>
            <UserPlus size={18} /> Tambah Karyawan
          </button>
        </div>
      </div>

      <div className="bo-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: '0' }}>
        <div className="bo-card-header" style={{ flexShrink: 0 }}>
          <h3 className="bo-card-title">
            <Users size={20} style={{ color: 'var(--primary)' }} />
            Daftar Karyawan Aktif
          </h3>
        </div>
        <div className="bo-table-container" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="bo-table" style={{ width: '100%', minWidth: '750px' }}>
            <thead>
              <tr>
                <th>ID / NIK</th>
                <th>Nama Lengkap</th>
                <th>Username Login</th>
                <th>Jabatan / Role</th>
                <th>PIN</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td className="bo-table-bold">{emp.id.toUpperCase()}</td>
                  <td className="bo-table-bold r-card-title">{emp.name}</td>
                  <td>
                    <code style={{ backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontSize: '13px', color: '#374151' }}>
                      {emp.username}
                    </code>
                  </td>
                  <td>
                    <span className={`bo-badge ${emp.role === 'Supervisor' ? 'bo-badge-amber' : emp.role === 'Admin' ? 'bo-badge-red' : 'bo-badge-gray'}`}>
                      {emp.role}
                    </span>
                  </td>
                  <td>
                    <code style={{ backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}>
                      ••••
                    </code>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {emp.isActive ? (
                      <span className="bo-badge bo-badge-green">
                        <span className="bo-badge-dot green"></span> Aktif
                      </span>
                    ) : (
                      <span className="bo-badge bo-badge-red">
                        <span className="bo-badge-dot red"></span> Non-Aktif
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="bo-action-btn" onClick={() => openEdit(emp)}><Edit2 size={16} /></button>
                    <button className="bo-action-btn" onClick={() => handleDelete(emp.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit */}
      {modalOpen && (
        <div className="r-modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="r-modal" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                {editTarget ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}
              </h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { label: 'Nama Lengkap', key: 'name', type: 'text', placeholder: 'Contoh: Kasir Budi' },
                { label: 'Username Login', key: 'username', type: 'text', placeholder: 'Contoh: budi' },
                { label: 'PIN (4-6 digit)', key: 'pin', type: 'text', placeholder: 'Contoh: 1234' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>{field.label}</label>
                  <input
                    type={field.type}
                    value={(form as any)[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              {/* Password */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Password Login</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Masukkan password..."
                    style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Role & Status */}
              <div className="r-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Jabatan / Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as Employee['role'] }))}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: 'white' }}
                  >
                    <option value="Cashier">Cashier</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Status</label>
                  <select
                    value={form.isActive ? 'true' : 'false'}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'true' }))}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', fontSize: '14px', backgroundColor: 'white' }}
                  >
                    <option value="true">Aktif</option>
                    <option value="false">Non-Aktif</option>
                  </select>
                </div>
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

export default EmployeeData;
