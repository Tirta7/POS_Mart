import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeLicenseStream } from '../utils/licenseStream';
import { playCelebrationChime } from '../utils/audioChime';

export interface VocmlLicenseState {
  allowed: boolean;
  status: string;
  expiresAt: string | null;
  remainingDays: number | null;
  trial: any | null;
  billing: any | null;
  isLocked: boolean;
  lockReason?: string;
  machineId?: string;
}

export interface CelebrationData {
  packageName: string;
  amountText: string;
  expiresAt: string;
  remainingDays?: number | null;
}

export function useVocmlLicense(options?: {
  machineId?: string;
  product?: string;
  storeName?: string;
}) {
  const [license, setLicense] = useState<VocmlLicenseState>({
    allowed: true,
    status: 'checking',
    expiresAt: null,
    remainingDays: null,
    trial: null,
    billing: null,
    isLocked: false,
    lockReason: '',
    machineId: options?.machineId,
  });

  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<CelebrationData | null>(null);
  const pollRef = useRef<any>(null);

  // 1. Sinkronisasi status lengkap dari VOC ML
  const fetchCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/license/status', { cache: 'no-store' });
      const data = await res.json();
      setLicense((prev) => ({
        ...prev,
        allowed: Boolean(data.allowed),
        status: data.status || 'unknown',
        expiresAt: data.expiresAt || null,
        remainingDays: data.remainingDays ?? data.daysLeft ?? null,
        trial: data.trial || null,
        billing: data.billing || null,
        isLocked: !data.allowed,
        lockReason: data.lockReason || (data.status === 'locked' ? data.reason : ''),
        machineId: data.machineId || prev.machineId,
      }));
      return data;
    } catch (err) {
      console.warn('[VOCML] Check error, using cache/offline tolerance', err);
      return null;
    }
  }, []);

  // 2. Handler saat lisensi terbuka (Pembayaran Berhasil / Admin Unlock) < 2 Detik
  const handleUnlocked = useCallback((payload: any = {}) => {
    // Putar lonceng perayaan
    playCelebrationChime();

    // Mutasi state lisensi seketika (Koreksi masa aktif & hilangkan kunci)
    setLicense((prev) => ({
      ...prev,
      allowed: true,
      status: 'active',
      isLocked: false,
      expiresAt: payload.expires_at || payload.license?.expiresAt || prev.expiresAt,
      remainingDays: payload.remaining_days ?? payload.license?.remainingDays ?? payload.license?.daysLeft ?? prev.remainingDays,
    }));

    // Tampilkan perayaan sukses bayar
    setCelebrationData({
      packageName: payload.package || payload.package_label || 'Langganan Aktif',
      amountText: payload.amount_text || '',
      expiresAt: payload.expires_at || payload.license?.expiresAt || '',
      remainingDays: payload.remaining_days ?? payload.license?.remainingDays ?? null,
    });
    setShowCelebration(true);

    // Sync ulang paket & kuota terbaru di background
    fetchCheck();
  }, [fetchCheck]);

  // 3. Handler saat dikunci remote dari VOCML (< 2 Detik)
  const handleLocked = useCallback((payload: any = {}) => {
    setLicense((prev) => ({
      ...prev,
      allowed: false,
      status: 'locked',
      isLocked: true,
      lockReason: payload.reason || payload.lockReason || 'Aplikasi dinonaktifkan sementara oleh admin lisensi',
    }));
  }, []);

  // 4. Engine 1: Server-Sent Events (SSE) Persistent Stream (Latensi < 150ms)
  useEffect(() => {
    fetchCheck();

    const unsubscribe = subscribeLicenseStream((data: any) => {
      if (!data) return;
      const isLocked = !data.allowed || data.status === 'locked' || data.status === 'expired';
      setLicense((prev) => ({
        ...prev,
        allowed: Boolean(data.allowed),
        status: data.status,
        expiresAt: data.expiresAt || null,
        remainingDays: data.remainingDays ?? data.daysLeft ?? null,
        trial: data.trial || null,
        billing: data.billing || null,
        isLocked,
        lockReason: data.lockReason || (data.status === 'locked' ? data.reason : ''),
        machineId: data.machineId || prev.machineId,
      }));
    });

    const handleUnlockEvent = (e: any) => handleUnlocked(e.detail);
    const handleLockEvent = (e: any) => handleLocked(e.detail);
    const handleUpdateEvent = () => fetchCheck();

    window.addEventListener('voc:license-unlocked', handleUnlockEvent);
    window.addEventListener('voc:license-locked', handleLockEvent);
    window.addEventListener('voc:license-updated', handleUpdateEvent);
    window.addEventListener('voc:billing-updated', handleUpdateEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('voc:license-unlocked', handleUnlockEvent);
      window.removeEventListener('voc:license-locked', handleLockEvent);
      window.removeEventListener('voc:license-updated', handleUpdateEvent);
      window.removeEventListener('voc:billing-updated', handleUpdateEvent);
    };
  }, [fetchCheck, handleUnlocked, handleLocked]);

  // 5. Engine 2: Fast Polling Fail-Safe (1.5 Detik Saat Terkunci)
  useEffect(() => {
    if (license.isLocked) {
      pollRef.current = setInterval(async () => {
        const latest = await fetchCheck();
        if (latest && latest.allowed) {
          clearInterval(pollRef.current);
          handleUnlocked(latest);
        }
      }, 1500); // Polling setiap 1.5 detik (< 2 detik respon)
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [license.isLocked, fetchCheck, handleUnlocked]);

  // 6. Action potong kuota transaksi
  const consumeQuota = async () => {
    if (!license.trial?.is_trial) return true; // Lisensi unlimited bebas potong
    try {
      const res = await fetch('/api/license/trial/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setLicense((prev) => ({
          ...prev,
          trial: { ...prev.trial, remaining: Math.max(0, (prev.trial?.remaining || 1) - 1) },
        }));
        return true;
      }
      // Kuota habis -> kunci layar
      setLicense((prev) => ({ ...prev, allowed: false, isLocked: true }));
      return false;
    } catch {
      return true;
    }
  };

  const arrearsDays = typeof license.remainingDays === 'number' && license.remainingDays < 0
    ? Math.abs(license.remainingDays)
    : 0;

  return {
    license,
    isLocked: license.isLocked,
    arrearsDays,
    showCelebration,
    closeCelebration: () => setShowCelebration(false),
    celebrationData,
    consumeQuota,
    refreshLicense: fetchCheck,
  };
}
