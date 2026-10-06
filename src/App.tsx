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

// Route guard — jika belum login, redirect ke /login
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuthStore();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  const { appName } = useSettingsStore();
  const { currentUser } = useAuthStore();

  const { fetchProducts, fetchTransactions } = useInventoryStore();
  const { fetchSales } = useSalesStore();
  const { fetchSettings } = useSettingsStore();
  const { fetchCustomers } = useCustomerStore();
  const { fetchSuppliers } = useSupplierStore();

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  // Fetch data dari API ketika user sudah login (Fase SaaS)
  useEffect(() => {
    if (currentUser) {
      fetchProducts();
      fetchTransactions();
      fetchSales();
      fetchSettings();
      fetchCustomers();
      fetchSuppliers();
    }
  }, [currentUser]);

  // Real-time cross-tab synchronization
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'inventory-storage') useInventoryStore.persist.rehydrate();
      if (e.key === 'settings-storage') useSettingsStore.persist.rehydrate();
      if (e.key === 'customer-storage') useCustomerStore.persist.rehydrate();
      if (e.key === 'sales-storage') useSalesStore.persist.rehydrate();
      if (e.key === 'auth-storage') useAuthStore.persist.rehydrate();
      if (e.key === 'hold-storage') useHoldStore.persist.rehydrate();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);


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
    </Router>
  );
}

export default App;
