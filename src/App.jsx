import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, APP_ID } from './firebase';
import { collection, onSnapshot } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { TrendingUp, Users, DollarSign, Activity, FileText, Palette } from 'lucide-react';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const THEMES = {
  light: {
    bg: 'bg-rose-50', text: 'text-rose-950', surface: 'bg-white', 
    border: 'border-rose-200', primary: 'bg-rose-600', primaryText: 'text-white',
    highlight: 'text-rose-600', muted: 'text-rose-400'
  },
  dark: {
    bg: 'bg-zinc-950', text: 'text-zinc-100', surface: 'bg-zinc-900', 
    border: 'border-zinc-800', primary: 'bg-rose-600', primaryText: 'text-white',
    highlight: 'text-rose-500', muted: 'text-zinc-500'
  }
};

export default function AdminCore() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('ctrl_theme_admin') || 'dark');

  useEffect(() => {
    const initAuth = async () => { await signInAnonymously(auth); };
    initAuth();
    const unsub = auth.onAuthStateChanged(setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'orders'), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
    return () => unsub();
  }, [user]);

  const stats = useMemo(() => {
    // Exclude unpaid/pending from revenue math
    const validOrders = orders.filter(o => o.status !== 'pending');
    const totalRevenue = validOrders.reduce((acc, o) => acc + (o.total || 0), 0);
    const uniqueUsers = new Set(validOrders.map(o => o.userId)).size;
    
    return { 
        revenue: totalRevenue, 
        volume: validOrders.length, 
        users: uniqueUsers,
        aov: validOrders.length > 0 ? totalRevenue / validOrders.length : 0 
    };
  }, [orders]);

  const t = THEMES[theme];
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('ctrl_theme_admin', next);
  };

  if (!user) return <div className={`h-screen ${t.bg}`} />;

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans p-6 md:p-10 transition-colors duration-300`}>
      <header className={`mb-10 border-b ${t.border} pb-6 flex justify-between items-start`}>
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase">Intelligence <span className={t.muted}>Core</span></h1>
          <p className={`${t.muted} font-mono text-[10px] tracking-widest uppercase mt-1`}>Global Audit Node • {APP_ID}</p>
        </div>
        <button onClick={toggleTheme} className={`p-2 rounded-full ${t.surface} hover:opacity-80 ${t.muted} transition-colors border ${t.border}`}>
          <Palette size={16} />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Gross Revenue', value: formatCurrency(stats.revenue), icon: DollarSign },
          { label: 'Transaction Volume', value: stats.volume, icon: Activity },
          { label: 'Avg Ticket Value', value: formatCurrency(stats.aov), icon: TrendingUp },
          { label: 'Unique Terminals', value: stats.users, icon: Users },
        ].map((s, i) => (
          <div key={i} className={`${t.surface} border ${t.border} p-6 rounded-xl`}>
            <div className={`${t.muted} mb-4`}><s.icon size={20} /></div>
            <div className="text-2xl font-black mb-1">{s.value}</div>
            <div className={`text-[10px] ${t.muted} uppercase tracking-widest font-mono`}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={`${t.surface} border ${t.border} rounded-xl overflow-hidden`}>
        <div className={`p-5 border-b ${t.border} flex items-center gap-2`}>
            <FileText size={16} className={t.muted} />
            <h3 className={`text-xs font-bold uppercase tracking-widest ${t.muted}`}>Cryptographic Ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`text-[10px] ${t.muted} uppercase font-mono ${t.bg}`}>
              <tr>
                <th className="px-6 py-4">Transaction ID</th>
                <th className="px-6 py-4">Table</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Network Status</th>
              </tr>
            </thead>
            <tbody className={`text-xs divide-y ${t.border} font-mono`}>
              {orders.map((order) => (
                <tr key={order.id} className="hover:opacity-80 transition-opacity">
                  <td className={`px-6 py-4 ${t.highlight}`}>{order.payment?.transactionId || 'AWAITING_TX'}</td>
                  <td className="px-6 py-4 font-bold">T-{order.tableId}</td>
                  <td className={`px-6 py-4 ${t.muted}`}>{new Date(order.createdAt).toLocaleTimeString()}</td>
                  <td className="px-6 py-4 font-bold">{formatCurrency(order.total)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[9px] uppercase font-bold ${
                      order.status === 'served' ? `${t.bg} ${t.muted}` : `${t.primary} ${t.primaryText}`
                    }`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}