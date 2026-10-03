import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopHeader from '../../components/backoffice/TopHeader';
import SidebarMenu from '../../components/backoffice/SidebarMenu';

const BackofficeLayout: React.FC = () => {
  // State drawer sidebar untuk tampilan mobile/tablet
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bo-layout">
      <TopHeader onMenuToggle={() => setMenuOpen(o => !o)} menuOpen={menuOpen} />
      <div className="bo-main-area">
        <SidebarMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="bo-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default BackofficeLayout;
