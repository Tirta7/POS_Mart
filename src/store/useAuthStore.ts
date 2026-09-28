import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Employee } from '../types';

interface AuthState {
  currentUser: Employee | null;
  employees: Employee[];
  login: (username: string, password: string) => boolean;
  loginByPin: (pin: string) => boolean;
  logout: () => void;
  verifyPin: (pin: string, role?: 'Supervisor' | 'Admin') => boolean;
  addEmployee: (employee: Employee) => void;
  updateEmployee: (employee: Employee) => void;
  deleteEmployee: (id: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      employees: [
        {
          id: 'e1',
          name: 'Kasir Sari M.',
          role: 'Cashier',
          pin: '1234',
          username: 'sari',
          password: 'kasir123',
          isActive: true,
        },
        {
          id: 'e2',
          name: 'Hendro W.',
          role: 'Supervisor',
          pin: '8888',
          username: 'hendro',
          password: 'super888',
          isActive: true,
        },
        {
          id: 'admin',
          name: 'Admin',
          role: 'Admin',
          pin: '0000',
          username: 'admin',
          password: 'admin123',
          isActive: true,
        },
      ],
      login: (username, password) => {
        const user = get().employees.find(
          e => e.username === username && e.password === password && e.isActive
        );
        if (user) {
          set({ currentUser: user });
          return true;
        }
        return false;
      },
      loginByPin: (pin) => {
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
      },
      addEmployee: (employee) => set((state) => ({ employees: [...state.employees, employee] })),
      updateEmployee: (employee) => set((state) => ({
        employees: state.employees.map(e => e.id === employee.id ? employee : e)
      })),
      deleteEmployee: (id) => set((state) => ({
        employees: state.employees.filter(e => e.id !== id)
      })),
    }),
    {
      name: 'auth-storage',
    }
  )
);
