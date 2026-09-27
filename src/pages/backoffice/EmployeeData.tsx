import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { UserPlus, Users, Edit2, Trash2 } from 'lucide-react';

const EmployeeData: React.FC = () => {
  const { employees } = useAuthStore();

  return (
    <div className="bo-container">
      
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Data Karyawan & Otorisasi</h1>
          <p className="bo-page-subtitle">Kelola daftar kasir, supervisor, dan hak akses.</p>
        </div>
        <div className="bo-header-actions">
          <button className="bo-btn bo-btn-primary">
            <UserPlus size={18} /> Tambah Karyawan
          </button>
        </div>
      </div>

      <div className="bo-card">
        <div className="bo-card-header">
          <h3 className="bo-card-title">
            <Users size={20} style={{ color: 'var(--primary)' }} /> 
            Daftar Karyawan Aktif
          </h3>
        </div>
        <div className="bo-table-container">
          <table className="bo-table">
            <thead>
              <tr>
                <th>ID / NIK</th>
                <th>Nama Lengkap</th>
                <th>Jabatan / Role</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td className="bo-table-bold">{emp.id.toUpperCase()}</td>
                  <td className="bo-table-bold">{emp.name}</td>
                  <td>
                    <span className={`bo-badge ${emp.role === 'Supervisor' ? 'bo-badge-amber' : 'bo-badge-gray'}`}>
                      {emp.role}
                    </span>
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

export default EmployeeData;
