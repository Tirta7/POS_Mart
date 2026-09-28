import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';

const LoginPage: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const { login, employees } = useAuthStore();
  const { appName } = useSettingsStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      const success = login(username.trim(), password);
      if (success) {
        onLogin();
      } else {
        setError('Username atau password salah. Silakan coba lagi.');
        setIsLoading(false);
      }
    }, 600);
  };

  const activeEmployees = employees.filter(e => e.isActive);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorations */}
      <div style={{
        position: 'absolute', top: '-100px', right: '-100px',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(218,41,28,0.15) 0%, transparent 70%)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-100px', left: '-100px',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)',
      }} />

      <div style={{
        width: '100%', maxWidth: '420px', margin: '24px',
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        padding: '40px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo/Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #da291c, #ff6b35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '28px', fontWeight: '900', color: 'white',
            boxShadow: '0 8px 24px rgba(218,41,28,0.4)',
          }}>
            {appName.charAt(0)}
          </div>
          <h1 style={{ color: 'white', fontSize: '24px', fontWeight: '800', margin: '0 0 4px' }}>
            {appName}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
            Sistem Point of Sale — Masuk untuk melanjutkan
          </p>
        </div>

        {/* Quick Select Kasir */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.5px' }}>
            PILIH AKUN KASIR
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeEmployees.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => setUsername(emp.username)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: `1px solid ${username === emp.username ? 'rgba(218,41,28,0.8)' : 'rgba(255,255,255,0.15)'}`,
                  background: username === emp.username ? 'rgba(218,41,28,0.2)' : 'rgba(255,255,255,0.05)',
                  color: username === emp.username ? '#ff6b6b' : 'rgba(255,255,255,0.7)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {emp.name}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Username */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="Masukkan username..."
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}`,
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = 'rgba(218,41,28,0.6)'; }}
              onBlur={e => { if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.15)'; }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Masukkan password..."
                required
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 16px',
                  borderRadius: '12px',
                  border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}`,
                  background: 'rgba(255,255,255,0.08)',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = 'rgba(218,41,28,0.6)'; }}
                onBlur={e => { if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.15)'; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: '4px',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: '10px',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5', fontSize: '13px', fontWeight: '500',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: isLoading
                ? 'rgba(255,255,255,0.1)'
                : 'linear-gradient(135deg, #da291c, #ff4747)',
              color: 'white',
              fontSize: '15px',
              fontWeight: '700',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: isLoading ? 'none' : '0 4px 16px rgba(218,41,28,0.4)',
              transition: 'all 0.2s',
              marginTop: '4px',
            }}
          >
            {isLoading ? (
              <>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Memverifikasi...
              </>
            ) : (
              <>
                <LogIn size={18} />
                Masuk
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: '24px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <ShieldCheck size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
            Akun terhubung dengan Data Karyawan
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.25) !important; }
      `}</style>
    </div>
  );
};

export default LoginPage;
