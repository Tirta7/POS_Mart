import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Link, useLocation } from 'react-router-dom';
import { Package, Truck, Users, LayoutDashboard } from 'lucide-react';

const TopHeader: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { appName } = useSettingsStore();
  const location = useLocation();

  return (
    <div className="bo-header">
      <div className="bo-header-left">
        <div className="bo-header-logo">
          {appName.charAt(0)}
        </div>
        <div>
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
        <Link to="/" className="bo-nav-link">
          Ke Kasir POS
        </Link>
        <div className="bo-user-profile">
          <div>
            <div className="bo-user-name">{currentUser?.name}</div>
            <div className="bo-user-id">ID: #{currentUser?.pin}</div>
          </div>
          <img src="https://i.pravatar.cc/100?img=5" alt="Avatar" className="bo-avatar" />
        </div>
      </div>
    </div>
  );
};

export default TopHeader;
