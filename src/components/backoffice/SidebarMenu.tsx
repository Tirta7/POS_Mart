import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Package, Truck, Users, Settings, User, PieChart, FlaskConical } from 'lucide-react';

const SidebarMenu: React.FC = () => {
  const location = useLocation();

  const links = [
    { path: '/backoffice/stock', label: 'Manajemen Stok', icon: <Package size={18} /> },
    { path: '/backoffice/customers', label: 'Data Pelanggan', icon: <User size={18} /> },
    { path: '/backoffice/suppliers', label: 'Data Supplier', icon: <Truck size={18} /> },
    { path: '/backoffice/employees', label: 'Data Karyawan', icon: <Users size={18} /> },
    { path: '/backoffice/reports', label: 'Laporan & Analitik', icon: <PieChart size={18} /> },
    { path: '/backoffice/settings', label: 'Pengaturan', icon: <Settings size={18} /> },
    { path: '/backoffice/seed', label: 'Seed Data Dummy', icon: <FlaskConical size={18} /> },
  ];

  return (
    <div className="bo-sidebar">
      <div className="bo-sidebar-title">Menu Utama</div>
      <div className="bo-sidebar-menu">
        {links.map((link) => {
          const isActive = location.pathname.includes(link.path);
          return (
            <Link 
              key={link.path} 
              to={link.path} 
              className={`bo-menu-item ${isActive ? 'active' : ''}`}
            >
              {link.icon}
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default SidebarMenu;
