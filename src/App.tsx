import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSettingsStore } from './store/useSettingsStore';
import { useInventoryStore } from './store/useInventoryStore';
import Pos from './Pos';
import BackofficeLayout from './pages/backoffice/Layout';
import StockManagement from './pages/backoffice/StockManagement';
import SupplierData from './pages/backoffice/SupplierData';
import EmployeeData from './pages/backoffice/EmployeeData';
import Settings from './pages/backoffice/Settings';
import { CustomerData } from './pages/backoffice/CustomerData';
import { useCustomerStore } from './store/useCustomerStore';

function App() {
  const { appName } = useSettingsStore();

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  // Real-time cross-tab synchronization (WebSocket alternative for local tabs)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'inventory-storage' && e.newValue) {
        try {
          useInventoryStore.setState(JSON.parse(e.newValue).state);
        } catch (err) { /* ignore parse error */ }
      }
      if (e.key === 'settings-storage' && e.newValue) {
        try {
          useSettingsStore.setState(JSON.parse(e.newValue).state);
        } catch (err) { /* ignore parse error */ }
      }
      if (e.key === 'customer-storage' && e.newValue) {
        try {
          useCustomerStore.setState(JSON.parse(e.newValue).state);
        } catch (err) { /* ignore parse error */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Pos />} />
        
        {/* Back-Office Routes */}
        <Route path="/backoffice" element={<BackofficeLayout />}>
          <Route index element={<Navigate to="/backoffice/stock" replace />} />
          <Route path="stock" element={<StockManagement />} />
          <Route path="customers" element={<CustomerData />} />
          <Route path="suppliers" element={<SupplierData />} />
          <Route path="employees" element={<EmployeeData />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
