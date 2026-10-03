import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Package, Truck, Users, Settings, User, PieChart, FlaskConical, ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

interface SidebarMenuProps {
  open?: boolean;
  onClose?: () => void;
}

const SidebarMenu: React.FC<SidebarMenuProps> = ({ open = false, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuthStore();
  const [isStockOpen, setIsStockOpen] = useState(location.pathname.startsWith('/backoffice/stock'));

  useEffect(() => {
    if (location.pathname.startsWith('/backoffice/stock')) {
      setIsStockOpen(true);
    }
    // Tutup drawer (mobile) setiap kali berpindah halaman
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const links = [
    { isParent: true, label: 'STOCK', icon: <Package size={18} />, group: 'stock' },
    { path: '/backoffice/stock', label: 'Manajemen Stok', isSubmenu: true, group: 'stock' },
    { path: '/backoffice/stock-mutation', label: 'Mutasi Stok', isSubmenu: true, group: 'stock' },
    { path: '/backoffice/purchases', label: 'Pembelian', icon: <Truck size={18} /> },
    { path: '/backoffice/customers', label: 'Data Pelanggan', icon: <User size={18} /> },
    { path: '/backoffice/suppliers', label: 'Data Supplier', icon: <Truck size={18} /> },
    { path: '/backoffice/employees', label: 'Data Karyawan', icon: <Users size={18} /> },
    { path: '/backoffice/reports', label: 'Laporan & Analitik', icon: <PieChart size={18} /> },
    { path: '/backoffice/settings', label: 'Pengaturan', icon: <Settings size={18} /> },
    { path: '/backoffice/seed', label: 'Seed Data Dummy', icon: <FlaskConical size={18} /> },
  ];

  return (
    <>
    <div
      className={`bo-sidebar-backdrop ${open ? 'open' : ''}`}
      onClick={onClose}
      aria-hidden="true"
    />
    <div className={`bo-sidebar ${open ? 'open' : ''}`}>
      <div className="bo-sidebar-title">Menu Utama</div>
      <div className="bo-sidebar-menu">
        {links.map((link, index) => {
          if (link.isParent) {
            const isActiveParent = location.pathname.startsWith('/backoffice/stock');
            return (
              <div 
                key={`parent-${index}`}
                className={`bo-menu-item ${isActiveParent && !isStockOpen ? 'active' : ''}`}
                onClick={() => setIsStockOpen(!isStockOpen)}
                style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 'bold' }}
              >
                {link.icon}
                <span style={{ flex: 1 }}>{link.label}</span>
                {isStockOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            );
          }

          if (link.isSubmenu) {
            if (link.group === 'stock' && !isStockOpen) return null;
            
            const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
            return (
              <Link 
                key={link.path} 
                to={link.path!} 
                className={`bo-menu-item ${isActive ? 'active' : ''}`}
                style={{ paddingLeft: '40px', fontSize: '0.85rem', marginTop: '-4px', marginBottom: '4px', backgroundColor: isActive ? 'rgba(218, 41, 28, 0.1)' : 'transparent', color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}
              >
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: isActive ? 'var(--primary)' : 'var(--text-muted)' }}></div>
                {link.label}
              </Link>
            );
          }

          const isActive = location.pathname === link.path || location.pathname.startsWith(link.path! + '/');
          return (
            <Link 
              key={link.path} 
              to={link.path!} 
              className={`bo-menu-item ${isActive ? 'active' : ''}`}
            >
              {link.icon}
              <span style={{ flex: 1 }}>{link.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Profil & logout — tampil di drawer mobile (di desktop ada di header) */}
      <div className="bo-sidebar-footer">
        <img src="https://i.pravatar.cc/100?img=5" alt="Avatar" className="bo-sidebar-avatar" />
        <div className="bo-sidebar-user">
          <div className="bo-sidebar-user-name">{currentUser?.name}</div>
          <div className="bo-sidebar-user-role">{currentUser?.role} • #{currentUser?.id?.toUpperCase()}</div>
        </div>
        <button
          type="button"
          className="bo-sidebar-logout"
          onClick={() => { logout(); navigate('/login'); }}
          aria-label="Logout"
          title="Logout"
        >
          <LogOut size={17} />
        </button>
      </div>
    </div>
    </>
  );
};

export default SidebarMenu;
