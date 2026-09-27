import React from 'react';
import { Outlet } from 'react-router-dom';
import TopHeader from '../../components/backoffice/TopHeader';
import SidebarMenu from '../../components/backoffice/SidebarMenu';

const BackofficeLayout: React.FC = () => {
  return (
    <div className="bo-layout">
      <TopHeader />
      <div className="bo-main-area">
        <SidebarMenu />
        <main className="bo-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default BackofficeLayout;
