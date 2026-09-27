import { create } from 'zustand';

export interface Product {
  id: string;
  name: string;
  price: number;
  type: string;
  stock: number;
  img?: string;
  badge?: string;
  tag?: string;
  tagColor?: string;
}

export interface Transaction {
  id: string;
  items: any[];
  total: number;
  method: string;
  date: string;
}

interface AppState {
  products: Product[];
  transactions: Transaction[];
  addTransaction: (tx: Transaction) => void;
  updateStock: (productId: string, qty: number) => void;
  adjustStockOpname: (productId: string, newStock: number) => void;
  addStock: (productId: string, qty: number) => void;
}

export const useStore = create<AppState>((set) => ({
  products: [
    { id: 'P01', name: 'Paket Sembako 1', price: 51000, type: 'Combo', stock: 50, tag: 'BESTSELLER', tagColor: 'promo', badge: '01', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80' },
    { id: 'P02', name: 'Beras Rojolele 5kg', price: 72000, type: 'Sembako', stock: 120, tag: 'STOK BANYAK', badge: '02', img: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80' },
    { id: 'P03', name: 'Minyak Goreng 2L', price: 39000, type: 'Sembako', stock: 85, tag: 'PROMO', tagColor: 'promo', badge: '03', img: 'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?auto=format&fit=crop&w=300&q=80' },
    { id: 'P04', name: 'Telur Ayam 1 Kg', price: 28000, type: 'Sembako', stock: 45, badge: '04', img: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=300&q=80' },
    { id: 'P05', name: 'Djarum Super 12', price: 26000, type: 'Rokok', stock: 200, tag: '+Korek', badge: '05', img: 'https://images.unsplash.com/photo-1528318269466-681a8bba1446?auto=format&fit=crop&w=300&q=80' },
    { id: 'P06', name: 'Kopi Kapal Api', price: 12000, type: 'Minuman', stock: 300, badge: '06', img: 'https://images.unsplash.com/photo-1559525839-b184a4d698c7?auto=format&fit=crop&w=300&q=80' },
    { id: 'P07', name: 'Aqua 600ml (Dus)', price: 34000, type: 'Minuman', stock: 40, tag: 'GROSIR', tagColor: 'promo', badge: '07', img: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=300&q=80' },
    { id: 'P08', name: 'Gula Pasir 1kg', price: 16000, type: 'Sembako', stock: 150, badge: '08', img: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=300&q=80' },
  ],
  transactions: [],
  addTransaction: (tx) => set((state) => ({ 
    transactions: [...state.transactions, tx] 
  })),
  updateStock: (productId, qty) => set((state) => ({
    products: state.products.map(p => 
      p.id === productId ? { ...p, stock: p.stock - qty } : p
    )
  })),
  adjustStockOpname: (productId, newStock) => set((state) => ({
    products: state.products.map(p => 
      p.id === productId ? { ...p, stock: newStock } : p
    )
  })),
  addStock: (productId, qty) => set((state) => ({
    products: state.products.map(p => 
      p.id === productId ? { ...p, stock: p.stock + qty } : p
    )
  }))
}));
