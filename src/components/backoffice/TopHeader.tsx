import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ShoppingCart } from 'lucide-react';

interface TopHeaderProps {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}

const TopHeader: React.FC<TopHeaderProps> = ({ onMenuToggle, menuOpen }) => {
  const { currentUser, logout } = useAuthStore();
  const { appName, appLogo } = useSettingsStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="bo-header">
      <div className="bo-header-left">
        <button
          type="button"
          className="bo-menu-toggle"
          onClick={onMenuToggle}
          aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="bo-header-logo" style={{ overflow: 'hidden' }}>
          {appLogo ? (
            <img src={appLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            appName.charAt(0)
          )}
        </div>
        <div className="bo-header-titles">
          <div className="bo-header-title">{appName}</div>
          <div className="bo-header-subtitle">Terminal #01 • Back-Office</div>
        </div>
      </div>

      <div className="bo-header-status">
        <div className="bo-status-pill active">
          <span className="bo-status-dot"></span> ONLINE
        </div>
        <div className="bo-status-pill border-l border-gray-300">Shift A (Pagi)</div>
        <div className="bo-status-pill border-l border-gray-300">Admin Mode</div>
      </div>

      <div className="bo-header-right">
        <Link to="/" className="bo-nav-link bo-pos-link" aria-label="Ke Kasir POS" title="Ke Kasir POS">
          <ShoppingCart size={18} className="show-mobile" />
          <span className="hide-mobile">Ke Kasir POS</span>
        </Link>
        <div className="bo-user-profile">
          <div className="bo-user-text">
            <div className="bo-user-name">{currentUser?.name}</div>
            <div className="bo-user-id">ID: #{currentUser?.id?.toUpperCase()} • {currentUser?.role}</div>
          </div>
          <img src="https://i.pravatar.cc/100?img=5" alt="Avatar" className="bo-avatar" />
          <button
            onClick={handleLogout}
            title="Logout"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TopHeader;
