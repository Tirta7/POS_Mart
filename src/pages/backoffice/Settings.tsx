import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Settings as SettingsIcon, Save } from 'lucide-react';

const Settings: React.FC = () => {
  const { appName, setAppName } = useSettingsStore();
  const [localAppName, setLocalAppName] = useState(appName);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalAppName(appName);
  }, [appName]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAppName(localAppName);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="bo-container">
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Pengaturan Sistem</h1>
          <p className="bo-page-subtitle">Kelola konfigurasi dan preferensi aplikasi.</p>
        </div>
      </div>

      <div className="bo-card">
        <div className="bo-card-header">
          <h3 className="bo-card-title">
            <SettingsIcon size={20} style={{ color: 'var(--primary)' }} /> 
            Pengaturan Umum
          </h3>
        </div>
        
        <div className="bo-card-body bg-[#fafafa]">
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="bo-form-group" style={{ maxWidth: '400px' }}>
              <label className="bo-label">Nama Aplikasi</label>
              <input 
                type="text" 
                value={localAppName}
                onChange={(e) => setLocalAppName(e.target.value)}
                placeholder="Contoh: SRIKANDI MART"
                className="bo-input"
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Nama ini akan ditampilkan pada header, struk kasir, dan judul tab browser.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="bo-btn bo-btn-primary">
                <Save size={18} /> Simpan Pengaturan
              </button>
              {isSaved && (
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--green)' }}>
                  Perubahan berhasil disimpan!
                </span>
              )}
            </div>
            
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
