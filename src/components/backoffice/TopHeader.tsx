import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import ShiftLabel from '../ShiftLabel';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ShoppingCart, ShieldCheck, AlertTriangle } from 'lucide-react';

interface TopHeaderProps {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}

const TopHeader: React.FC<TopHeaderProps> = ({ onMenuToggle, menuOpen }) => {
  const { currentUser, logout } = useAuthStore();
  const { appName, appLogo } = useSettingsStore();
  const navigate = useNavigate();

  const [licenseState, setLicenseState] = useState<{
    allowed?: boolean;
    status?: string;
    expiresAt?: string | null;
    remainingDays?: number | null;
    trial?: { is_trial?: boolean; remaining?: number } | null;
  } | null>(null);

  useEffect(() => {
    const applyLicense = (data: any) => {
      if (!data) return;
      const status = data.status || (data.allowed ? 'active' : 'locked');
      const remDays = data.remainingDays ?? data.daysLeft ?? null;
      setLicenseState({
        allowed: Boolean(data.allowed),
        status,
        expiresAt: data.expiresAt || null,
        remainingDays: remDays,
        trial: data.trial || null,
      });
    };

    fetch('/api/license/status')
      .then((r) => r.json())
      .then(applyLicense)
      .catch(() => {});

    const handleUpdate = (e: any) => applyLicense(e.detail?.license || e.detail);
    const handleLock = () => setLicenseState((prev) => ({ ...(prev || {}), allowed: false, status: 'locked' }));

    window.addEventListener('voc:license-changed', handleUpdate);
    window.addEventListener('voc:license-locked', handleLock);
    window.addEventListener('voc:license-unlocked', handleUpdate);
    window.addEventListener('voc:license-updated', handleUpdate);

    return () => {
      window.removeEventListener('voc:license-changed', handleUpdate);
      window.removeEventListener('voc:license-locked', handleLock);
      window.removeEventListener('voc:license-unlocked', handleUpdate);
      window.removeEventListener('voc:license-updated', handleUpdate);
    };
  }, []);

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
        <div className="bo-header-logo" style={{ overflow: 'hidden', backgroundColor: appLogo ? 'transparent' : undefined }}>
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
        {licenseState?.status === 'trial' && licenseState?.trial?.is_trial && (
          <div
            className="bo-status-pill"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              borderColor: '#bfdbfe',
              fontWeight: 800,
            }}
            title="Sisa kuota transaksi trial VOCML"
          >
            ⭐ Trial: Sisa {licenseState.trial.remaining ?? 0}x
          </div>
        )}
        {licenseState?.allowed && licenseState?.status !== 'trial' && (
          <div
            className="bo-status-pill"
            style={{
              background: (licenseState.remainingDays ?? 30) <= 7 ? '#fef3c7' : '#ecfdf5',
              color: (licenseState.remainingDays ?? 30) <= 7 ? '#b45309' : '#047857',
              borderColor: (licenseState.remainingDays ?? 30) <= 7 ? '#fde68a' : '#a7f3d0',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title={`Lisensi aktif${licenseState.expiresAt ? ` s/d ${licenseState.expiresAt}` : ''}`}
          >
            <ShieldCheck size={13} />
            <span>{licenseState.remainingDays != null ? `${licenseState.remainingDays} Hari Lagi` : 'Lisensi Aktif'}</span>
          </div>
        )}
        {licenseState && !licenseState.allowed && (
          <div
            className="bo-status-pill"
            style={{
              background: '#fef2f2',
              color: '#b91c1c',
              borderColor: '#fecaca',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <AlertTriangle size={13} />
            <span>Terkunci</span>
          </div>
        )}
        <div className="bo-status-pill border-l border-gray-300"><ShiftLabel /></div>
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
