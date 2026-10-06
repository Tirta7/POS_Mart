import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Employee } from '../types';

interface AuthState {
  currentUser: Employee | null;
  employees: Employee[];
  isLoading: boolean;
  error: string | null;
  fetchEmployees: () => Promise<void>;
  login: (username: string, password: string) => boolean;
  loginByPin: (pin: string) => boolean;
  logout: () => void;
  verifyPin: (pin: string, role?: 'Supervisor' | 'Admin') => boolean;
  addEmployee: (employee: Employee) => Promise<void>;
  updateEmployee: (employee: Employee) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
}

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-tenant-id': 'TID-DEMO-123'
});

const mapUser = (dbUser: any): Employee => ({
  id: dbUser.id,
  username: dbUser.username,
  password: dbUser.password_hash,
  name: dbUser.name || dbUser.username,
  pin: dbUser.pin || '',
  role: dbUser.role as any,
  isActive: dbUser.is_active
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      employees: [],
      isLoading: false,
      error: null,
      
      fetchEmployees: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/saas/users', { headers: getHeaders() });
          if (!res.ok) throw new Error('Gagal memuat data karyawan');
          const data = await res.json();
          set({ employees: data.map(mapUser), isLoading: false });
        } catch (err: any) {
          set({ error: err.message, isLoading: false });
        }
      },

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
      addEmployee: async (employee) => {
        try {
          const res = await fetch('/api/saas/users', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              id: employee.id,
              username: employee.username,
              password: employee.password,
              role: employee.role,
              name: employee.name,
              pin: employee.pin,
              isActive: employee.isActive
            })
          });
          if (res.ok) {
            const newUser = await res.json();
            set((state) => ({ employees: [...state.employees, mapUser(newUser)] }));
          }
        } catch (err) {
          console.error(err);
        }
      },
      updateEmployee: async (employee) => {
        try {
          const res = await fetch(`/api/saas/users/${employee.id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
              username: employee.username,
              password: employee.password,
              role: employee.role,
              name: employee.name,
              pin: employee.pin,
              isActive: employee.isActive
            })
          });
          if (res.ok) {
            const updatedUser = await res.json();
            set((state) => ({
              employees: state.employees.map(e => e.id === employee.id ? mapUser(updatedUser) : e)
            }));
          }
        } catch (err) {
          console.error(err);
        }
      },
      deleteEmployee: async (id) => {
        try {
          const res = await fetch(`/api/saas/users/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          if (res.ok) {
            set((state) => ({
              employees: state.employees.filter(e => e.id !== id)
            }));
          }
        } catch (err) {
          console.error(err);
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ currentUser: state.currentUser }), // Only persist session
    }
  )
);
