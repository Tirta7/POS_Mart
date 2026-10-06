import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { Eye, EyeOff, ShieldCheck, Check } from 'lucide-react';

// Inisial untuk avatar akun (mis. "Sari Dewi" → "SD")
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';

// Warna avatar lembut ala iOS, konsisten per nama
const AVATAR_COLORS = ['#ff9f0a', '#30d158', '#0a84ff', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#5e5ce6'];
const avatarColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const LoginPage: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const { login, employees } = useAuthStore();
  const { appName, appLogo } = useSettingsStore();

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

  // Area status bar (jam/baterai) & latar html mengikuti warna halaman login
  // (terang/gelap) agar tampil penuh tanpa belang di bagian atas.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? null;
    const html = document.documentElement;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const bg = mq.matches ? '#000000' : '#f2f2f7';
      meta?.setAttribute('content', bg);
      html.style.backgroundColor = bg;
      document.body.style.backgroundColor = bg;
    };
    apply();
    mq.addEventListener('change', apply);

    return () => {
      mq.removeEventListener('change', apply);
      if (meta && prevTheme !== null) meta.setAttribute('content', prevTheme);
      html.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  return (
    <div className="login-page lg-root">
      <style>{LOGIN_CSS}</style>

      {/* Latar lembut (blur blob) */}
      <div className="lg-bg" aria-hidden="true">
        <div className="lg-blob lg-blob-a" />
        <div className="lg-blob lg-blob-b" />
      </div>

      <main className="lg-card">
        {/* Brand */}
        <header className="lg-brand">
          <div className="lg-icon" style={{ overflow: 'hidden', padding: appLogo ? '0' : undefined, backgroundColor: appLogo ? 'transparent' : undefined }}>
            {appLogo ? (
              <img src={appLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              appName.charAt(0)
            )}
          </div>
          <h1 className="lg-title">{appName}</h1>
          <p className="lg-subtitle">Masuk untuk melanjutkan</p>
        </header>

        {/* Pilih akun cepat */}
        {activeEmployees.length > 0 && (
          <section className="lg-section">
            <div className="lg-section-label">Pilih Akun</div>
            <div className="lg-accounts">
              {activeEmployees.map(emp => {
                const selected = username === emp.username;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    className={`lg-account ${selected ? 'is-selected' : ''}`}
                    onClick={() => { setUsername(emp.username); setError(''); }}
                    title={emp.name}
                  >
                    <span className="lg-avatar" style={{ background: avatarColor(emp.name) }}>
                      {initials(emp.name)}
                      {selected && <span className="lg-avatar-check"><Check size={10} strokeWidth={3.5} /></span>}
                    </span>
                    <span className="lg-account-name">{emp.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Form — gaya grouped list iOS */}
        <form onSubmit={handleSubmit}>
          <div className={`lg-group ${error ? 'has-error' : ''}`}>
            <label className="lg-row">
              <span className="lg-row-label">Username</span>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                className="lg-input"
              />
            </label>
            <label className="lg-row">
              <span className="lg-row-label">Password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="wajib diisi"
                autoComplete="current-password"
                required
                className="lg-input"
              />
              <button
                type="button"
                className="lg-eye"
                onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </label>
          </div>

          {error && <div className="lg-error">{error}</div>}

          <button type="submit" disabled={isLoading} className="lg-submit">
            {isLoading ? (<><span className="lg-spinner" /> Memverifikasi…</>) : 'Masuk'}
          </button>
        </form>

        <footer className="lg-footer">
          <ShieldCheck size={13} />
          <span>Akun terhubung dengan Data Karyawan</span>
        </footer>
      </main>
    </div>
  );
};

const LOGIN_CSS = `
  .lg-root {
    --lg-bg: #f2f2f7;
    --lg-card: rgba(255,255,255,0.72);
    --lg-group: #ffffff;
    --lg-text: #1c1c1e;
    --lg-muted: #8e8e93;
    --lg-sep: rgba(60,60,67,0.14);
    --lg-accent: #da291c;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    background: var(--lg-bg);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
    color: var(--lg-text);
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .lg-root {
      --lg-bg: #000000;
      --lg-card: rgba(28,28,30,0.72);
      --lg-group: #1c1c1e;
      --lg-text: #f2f2f7;
      --lg-muted: #8e8e93;
      --lg-sep: rgba(84,84,88,0.5);
    }
  }

  .lg-bg { position: fixed; inset: 0; overflow: hidden; pointer-events: none; background: var(--lg-bg); }

  /* HP/tablet: latar halaman (gradasi lembut + blob) tembus mulus sampai area
     jam & baterai — tanpa strip warna terpisah, mengikuti warna aplikasi.
     Blob atas diturunkan agar area di belakang jam satu warna polos. */
  .lg-blob {
    position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; pointer-events: none;
  }
  .lg-blob-a { width: 320px; height: 320px; top: 22%; right: -120px; background: radial-gradient(circle, #ff8a7a, transparent 70%); }
  .lg-blob-b { width: 360px; height: 360px; bottom: -120px; left: -110px; background: radial-gradient(circle, #9db8ff, transparent 70%); }

  .lg-card {
    position: relative; z-index: 1;
    width: 100%; max-width: 360px; margin: 20px;
    padding: 28px 22px 20px;
    background: var(--lg-card);
    -webkit-backdrop-filter: saturate(180%) blur(24px);
    backdrop-filter: saturate(180%) blur(24px);
    border-radius: 24px;
    box-shadow: 0 0 0 .5px rgba(0,0,0,.06), 0 12px 40px rgba(0,0,0,.08);
    animation: lgIn .5s cubic-bezier(.32,.72,0,1);
  }
  @keyframes lgIn { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }

  .lg-brand { text-align: center; margin-bottom: 22px; }
  .lg-icon {
    width: 56px; height: 56px; margin: 0 auto 12px;
    border-radius: 14px;
    background: linear-gradient(160deg, #ef4433 0%, #c81e12 100%);
    color: #fff; font-size: 24px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 16px rgba(218,41,28,.28), inset 0 1px 0 rgba(255,255,255,.25);
  }
  .lg-title { font-size: 20px; font-weight: 700; letter-spacing: -.4px; margin: 0; }
  .lg-subtitle { font-size: 13px; color: var(--lg-muted); margin: 3px 0 0; }

  .lg-section { margin-bottom: 18px; }
  .lg-section-label {
    font-size: 12px; font-weight: 500; color: var(--lg-muted);
    text-transform: uppercase; letter-spacing: .3px; margin: 0 4px 8px;
  }
  .lg-accounts {
    display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 4px;
    scrollbar-width: none; scroll-snap-type: x proximity;
  }
  .lg-accounts::-webkit-scrollbar { display: none; }
  .lg-account {
    flex: 0 0 auto; width: 62px;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    background: none; border: none; padding: 4px 0; cursor: pointer;
    scroll-snap-align: start; -webkit-tap-highlight-color: transparent;
    transition: transform .15s;
  }
  .lg-account:active { transform: scale(.94); }
  .lg-avatar {
    position: relative;
    width: 42px; height: 42px; border-radius: 50%;
    color: #fff; font-size: 14px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 2px transparent;
    transition: box-shadow .2s;
  }
  .lg-account.is-selected .lg-avatar { box-shadow: 0 0 0 2px var(--lg-bg), 0 0 0 4px var(--lg-accent); }
  .lg-avatar-check {
    position: absolute; right: -2px; bottom: -2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--lg-accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 2px var(--lg-group);
  }
  .lg-account-name {
    font-size: 11.5px; color: var(--lg-text); max-width: 62px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .lg-account.is-selected .lg-account-name { color: var(--lg-accent); font-weight: 600; }

  .lg-group {
    background: var(--lg-group);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 0 0 .5px rgba(0,0,0,.04);
    transition: box-shadow .2s;
  }
  .lg-group.has-error { box-shadow: 0 0 0 1px rgba(255,59,48,.55); }
  .lg-row {
    display: flex; align-items: center; gap: 10px;
    min-height: 46px; padding: 0 14px;
    position: relative; cursor: text;
  }
  .lg-row + .lg-row::before {
    content: ''; position: absolute; top: 0; left: 14px; right: 0;
    height: .5px; background: var(--lg-sep);
  }
  .lg-row-label { flex: 0 0 84px; font-size: 15px; color: var(--lg-text); }
  .lg-input {
    flex: 1; min-width: 0;
    border: none; outline: none; background: transparent;
    font: inherit; font-size: 16px; color: var(--lg-text);
    padding: 12px 0;
  }
  .lg-input::placeholder { color: var(--lg-muted) !important; opacity: .7; }
  .lg-eye {
    background: none; border: none; padding: 6px; margin-right: -6px;
    color: var(--lg-muted); cursor: pointer; display: flex;
  }

  .lg-error {
    margin: 10px 4px 0; font-size: 12.5px; color: #ff3b30; text-align: center;
  }

  .lg-submit {
    width: 100%; height: 48px; margin-top: 16px;
    border: none; border-radius: 12px;
    background: var(--lg-accent); color: #fff;
    font: inherit; font-size: 16px; font-weight: 600; letter-spacing: -.2px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; transition: opacity .15s, transform .15s;
  }
  .lg-submit:hover { opacity: .92; }
  .lg-submit:active { transform: scale(.985); opacity: .85; }
  .lg-submit:disabled { opacity: .6; cursor: default; }
  .lg-spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
    animation: lgSpin .7s linear infinite;
  }
  @keyframes lgSpin { to { transform: rotate(360deg); } }

  .lg-footer {
    margin-top: 16px;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    font-size: 11.5px; color: var(--lg-muted);
  }

  @media (max-width: 400px) {
    .lg-card {
      margin: 16px; padding: 24px 16px 18px;
      background: transparent; box-shadow: none;
      -webkit-backdrop-filter: none; backdrop-filter: none;
    }
    .lg-row-label { flex-basis: 78px; }
  }
`;

export default LoginPage;
