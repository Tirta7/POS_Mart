import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export type ShiftCode = 'A' | 'B' | 'C' | 'AUTO';

export const SHIFT_OPTIONS: { value: ShiftCode; label: string; hours: string }[] = [
  { value: 'A', label: 'Shift A (Pagi)', hours: '06:00 – 14:00' },
  { value: 'B', label: 'Shift B (Siang)', hours: '14:00 – 22:00' },
  { value: 'C', label: 'Shift C (Malam)', hours: '22:00 – 06:00' },
  { value: 'AUTO', label: 'Otomatis (ikut jam)', hours: 'Menyesuaikan waktu sekarang' },
];

/** Shift berdasarkan jam saat ini (dipakai untuk mode Otomatis). */
const shiftByClock = (d: Date): Exclude<ShiftCode, 'AUTO'> => {
  const h = d.getHours();
  if (h >= 6 && h < 14) return 'A';
  if (h >= 14 && h < 22) return 'B';
  return 'C';
};

export const shiftLabel = (shift: ShiftCode | string | undefined, now: Date = new Date()): string => {
  const code = shift === 'AUTO' ? shiftByClock(now) : (shift as ShiftCode) || 'A';
  return (SHIFT_OPTIONS.find(o => o.value === code) || SHIFT_OPTIONS[0]).label;
};

/** Menampilkan shift karyawan yang sedang login, mis. "Shift B (Siang)". */
const ShiftLabel: React.FC = () => {
  const { currentUser, employees } = useAuthStore();
  const [now, setNow] = useState(() => new Date());

  // Perbarui tiap menit (agar mode Otomatis berganti sesuai jam)
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Data terbaru dari daftar karyawan (sesi login lama belum menyimpan shift)
  const me = employees.find(e => e.id === currentUser?.id) || currentUser;
  return <>{shiftLabel(me?.shift, now)}</>;
};

export default ShiftLabel;
