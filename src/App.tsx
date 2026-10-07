import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettingsStore } from './store/useSettingsStore';
import { useInventoryStore } from './store/useInventoryStore';
import { useAuthStore } from './store/useAuthStore';
import Pos from './Pos';
import BackofficeLayout from './pages/backoffice/Layout';
import StockManagement from './pages/backoffice/StockManagement';
import StockMutation from './pages/backoffice/StockMutation';
import Purchases from './pages/backoffice/Purchases';
import SupplierData from './pages/backoffice/SupplierData';
import EmployeeData from './pages/backoffice/EmployeeData';
import Settings from './pages/backoffice/Settings';
import { CustomerData } from './pages/backoffice/CustomerData';
import Reports from './pages/backoffice/Reports';
import LoginPage from './pages/LoginPage';
import { useCustomerStore } from './store/useCustomerStore';
import { useSalesStore } from './store/useSalesStore';
import { useHoldStore } from './store/useHoldStore';
import { useSupplierStore } from './store/useSupplierStore';
import { useDraftStore } from './store/useDraftStore';
import { io } from 'socket.io-client';
import GlobalNotification from './components/GlobalNotification';

// Route guard — jika belum login, redirect ke /login
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  const { appName } = useSettingsStore();
  const { currentUser, fetchEmployees } = useAuthStore();

  const { fetchProducts, fetchTransactions, fetchCategories } = useInventoryStore();
  const { fetchSales } = useSalesStore();
  const { fetchSettings } = useSettingsStore();
  const { fetchCustomers } = useCustomerStore();
  const { fetchSuppliers } = useSupplierStore();
  const { fetchDrafts } = useDraftStore();
  const { fetchHeldOrders } = useHoldStore();

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  // Initial fetch for employees (needed before login)
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Fetch data dari API ketika user sudah login (Fase SaaS)
  useEffect(() => {
    if (currentUser) {
      fetchProducts();
      fetchCategories();
      fetchTransactions();
      fetchSales();
      fetchSettings();
      fetchCustomers();
      fetchSuppliers();
      fetchDrafts();
      fetchHeldOrders();
    }
  }, [currentUser]);

  // Real-time cross-tab synchronization untuk Auth / Sesi (karena masih pakai persist localStorage)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'auth-storage') useAuthStore.persist.rehydrate();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Polling Lisensi: Otomatis memblokir aplikasi (tanpa perlu refresh manual) jika lisensi habis/terkunci
  useEffect(() => {
    const checkLicenseStatus = async () => {
      try {
        const res = await fetch('/api/license-status');
        if (res.ok) {
          const data = await res.json();
          if (data && data.allowed === false) {
            window.location.reload(); // Paksa muat ulang agar dihadang oleh layar kunci
          }
        }
      } catch (err) {
        // Abaikan sementara jika gagal terhubung
      }
    };
    // Periksa setiap 30 detik
    const interval = setInterval(checkLicenseStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // WebSockets Real-time Database Sync (Redis/Socket.IO)
  useEffect(() => {
    if (!currentUser) return;
    
    // Default tenant for demo (TID-DEMO-123)
    const socket = io('/');
    (window as any).socketInstance = socket;
    socket.emit('join_tenant', 'TID-DEMO-123');
    
    socket.on('data_updated', (entity) => {
      // Refresh secara efisien hanya data yang berubah untuk menghemat limit database!
      if (!entity || entity === 'products') fetchProducts();
      if (!entity || entity === 'categories') fetchCategories();
      if (!entity || entity === 'transactions') fetchTransactions();
      if (!entity || entity === 'sales') fetchSales();
      if (!entity || entity === 'customers') fetchCustomers();
      if (!entity || entity === 'suppliers') fetchSuppliers();
      if (!entity || entity === 'settings') fetchSettings();
      if (!entity || entity === 'users') fetchEmployees();
    });

    socket.on('draft_updated_grDrafts', (draftsArr) => {
      // Data already parsed in API response JSON
      useDraftStore.setState({ drafts: Array.isArray(draftsArr) ? draftsArr : [] });
    });
    
    socket.on('draft_updated_posHold', (heldArr) => {
      useHoldStore.setState({ heldOrders: Array.isArray(heldArr) ? heldArr : [] });
    });

    return () => {
      socket.disconnect();
      delete (window as any).socketInstance;
    };
  }, [currentUser]);


  return (
    <Router>
      <Routes>
        {/* Login Route */}
        <Route
          path="/login"
          element={
            currentUser
              ? <Navigate to="/" replace />
              : <LoginPage onLogin={() => { /* handled by store */ }} />
          }
        />

        {/* POS Route */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <Pos />
            </RequireAuth>
          }
        />

        {/* Back-Office Routes */}
        <Route
          path="/backoffice"
          element={
            <RequireAuth>
              <BackofficeLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/backoffice/stock" replace />} />
          <Route path="stock" element={<StockManagement />} />
          <Route path="stock-mutation" element={<StockMutation />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="customers" element={<CustomerData />} />
          <Route path="suppliers" element={<SupplierData />} />
          <Route path="employees" element={<EmployeeData />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalNotification />
    </Router>
  );
}

export default App;
