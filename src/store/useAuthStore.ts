import { create } from 'zustand';
import type { Employee } from '../types';

interface AuthState {
  currentUser: Employee | null;
  employees: Employee[];
  login: (pin: string) => boolean;
  logout: () => void;
  verifyPin: (pin: string, role?: 'Supervisor' | 'Admin') => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: {
    id: 'e1',
    name: 'Kasir Sari M.',
    role: 'Cashier',
    pin: '1234',
    isActive: true,
  },
  employees: [
    {
      id: 'e1',
      name: 'Kasir Sari M.',
      role: 'Cashier',
      pin: '1234',
      isActive: true,
    },
    {
      id: 'e2',
      name: 'Hendro W.',
      role: 'Supervisor',
      pin: '8888',
      isActive: true,
    }
  ],
  login: (pin) => {
    const user = get().employees.find(e => e.pin === pin && e.isActive);
    if (user) {
      set({ currentUser: user });
      return true;
    }
    return false;
  },
  logout: () => set({ currentUser: null }),
  verifyPin: (pin, role) => {
    const user = get().employees.find(e => e.pin === pin && e.isActive);
    if (!user) return false;
    if (role && user.role !== role && user.role !== 'Admin') return false;
    return true;
  }
}));
