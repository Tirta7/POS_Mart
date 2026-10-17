import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useSettingsStore } from './store/useSettingsStore';
import { useInventoryStore } from './store/useInventoryStore';
import { useAuthStore } from './store/useAuthStore';
import Pos from './Pos';
import { useCustomerStore } from './store/useCustomerStore';
import { useSalesStore } from './store/useSalesStore';
import { useHoldStore } from './store/useHoldStore';
import { useSupplierStore } from './store/useSupplierStore';
import { useDraftStore } from './store/useDraftStore';
import { getSocket } from './utils/socket';
import GlobalNotification from './components/GlobalNotification';
import BroadcastToast from './components/BroadcastToast';
import UpdateWatcher from './components/UpdateWatcher';
import LicenseLockScreen from './components/LicenseLockScreen';

// Code-splitting via lazy loading untuk seluruh halaman Back-Office & Login agar startup/refresh kasir instan!
const BackofficeLayout = lazy(() => import('./pages/backoffice/Layout'));
const StockManagement = lazy(() => import('./pages/backoffice/StockManagement'));
const StockMutation = lazy(() => import('./pages/backoffice/StockMutation'));
const Purchases = lazy(() => import('./pages/backoffice/Purchases'));
const SupplierData = lazy(() => import('./pages/backoffice/SupplierData'));
const EmployeeData = lazy(() => import('./pages/backoffice/EmployeeData'));
const Settings = lazy(() => import('./pages/backoffice/Settings'));
const CustomerData = lazy(() => import('./pages/backoffice/CustomerData'));
const Reports = lazy(() => import('./pages/backoffice/Reports'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Fallback spinner saat transisi antar halaman
const RouteLoading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: '#f8fafc', gap: '12px' }}>
    <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#da291c', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Memuat halaman...</span>
  </div>
);

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

  // Initial fetch for settings and employees (needed on startup & before login)
  useEffect(() => {
    fetchSettings();
    fetchEmployees();
  }, []);

  // Fetch data dari API ketika user sudah login (Fase SaaS)
  useEffect(() => {
    if (currentUser) {
      fetchProducts();
      fetchCategories();
      fetchSales();
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



  // WebSockets Real-time Database Sync (Redis/Socket.IO)
  useEffect(() => {
    if (!currentUser) return;
    
    const socket = getSocket();
    
    const handleDataUpdated = (entity: string) => {
      // Refresh secara efisien hanya data yang berubah untuk menghemat limit database!
      if (!entity || entity === 'products' || entity === 'transactions' || entity === 'stock-transactions' || entity === 'sales') {
        fetchProducts();
      }
      if (!entity || entity === 'categories') {
        fetchCategories();
      }
      if (!entity || entity === 'transactions' || entity === 'stock-transactions' || entity === 'sales') {
        fetchTransactions();
      }
      if (!entity || entity === 'sales' || entity === 'transactions') {
        fetchSales();
      }
      if (!entity || entity === 'customers' || entity === 'sales' || entity === 'transactions') {
        fetchCustomers();
      }
      if (!entity || entity === 'suppliers') {
        fetchSuppliers();
      }
      if (!entity || entity === 'settings') {
        fetchSettings();
      }
      if (!entity || entity === 'users') {
        fetchEmployees();
      }
    };

    const handleSaleCompleted = () => {
      fetchTransactions();
      fetchProducts();
      fetchSales();
      fetchCustomers();
    };

    const handleStockMutation = () => {
      fetchTransactions();
      fetchProducts();
    };

    const handleCustomerOrdersUpdated = () => {
      fetchCustomers();
    };

    const handleGrDrafts = (draftsArr: any) => {
      useDraftStore.setState({ drafts: Array.isArray(draftsArr) ? draftsArr : [] });
    };

    const handlePosHold = (heldArr: any) => {
      useHoldStore.setState({ heldOrders: Array.isArray(heldArr) ? heldArr : [] });
    };

    socket.on('data_updated', handleDataUpdated);
    socket.on('sale_completed', handleSaleCompleted);
    socket.on('stock_mutation_updated', handleStockMutation);
    socket.on('customer_orders_updated', handleCustomerOrdersUpdated);
    socket.on('draft_updated_grDrafts', handleGrDrafts);
    socket.on('draft_updated_posHold', handlePosHold);

    return () => {
      socket.off('data_updated', handleDataUpdated);
      socket.off('sale_completed', handleSaleCompleted);
      socket.off('stock_mutation_updated', handleStockMutation);
      socket.off('customer_orders_updated', handleCustomerOrdersUpdated);
      socket.off('draft_updated_grDrafts', handleGrDrafts);
      socket.off('draft_updated_posHold', handlePosHold);
    };
  }, [currentUser]);


  return (
    <Router>
      <Suspense fallback={<RouteLoading />}>
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
      </Suspense>
      <GlobalNotification />
      <BroadcastToast />
      <UpdateWatcher />
      <LicenseLockScreen />
    </Router>
  );
}

export default App;
