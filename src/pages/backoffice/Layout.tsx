import React, { useState, useEffect, Suspense, Component } from 'react';
import { Outlet } from 'react-router-dom';
import TopHeader from '../../components/backoffice/TopHeader';
import SidebarMenu from '../../components/backoffice/SidebarMenu';

const ContentLoading: React.FC = () => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '280px', gap: '12px' }}>
      <div style={{ width: '30px', height: '30px', border: '3px solid #e2e8f0', borderTopColor: '#da291c', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>Memuat data halaman...</span>
      {slow && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
          }}
        >
          Muat Ulang Halaman
        </button>
      )}
    </div>
  );
};

class BackofficeErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '280px', gap: '12px', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Gagal memuat halaman Back-Office</div>
          <div style={{ fontSize: '12.5px', color: '#64748b', maxWidth: '340px' }}>
            Kemungkinan koneksi terputus atau aplikasi baru diperbarui di server.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#da291c', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Muat Ulang Sekarang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const BackofficeLayout: React.FC = () => {
  // State drawer sidebar untuk tampilan mobile/tablet
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bo-layout">
      <TopHeader onMenuToggle={() => setMenuOpen(o => !o)} menuOpen={menuOpen} />
      <div className="bo-main-area">
        <SidebarMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="bo-content">
          <BackofficeErrorBoundary>
            <Suspense fallback={<ContentLoading />}>
              <Outlet />
            </Suspense>
          </BackofficeErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default BackofficeLayout;
