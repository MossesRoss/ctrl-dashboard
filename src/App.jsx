import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, APP_ID } from './firebase';
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { TrendingUp, Users, DollarSign, Activity, FileText, Palette, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const THEMES = {
  light: {
    bg: 'bg-zinc-50', text: 'text-zinc-950', surface: 'bg-white',
    border: 'border-zinc-200', primary: 'bg-zinc-900', primaryText: 'text-white',
    highlight: 'text-zinc-900', muted: 'text-zinc-500',
    secured: 'text-emerald-600', risk: 'text-rose-600'
  },
  dark: {
    bg: 'bg-zinc-950', text: 'text-zinc-100', surface: 'bg-zinc-900',
    border: 'border-zinc-800', primary: 'bg-white', primaryText: 'text-zinc-950',
    highlight: 'text-white', muted: 'text-zinc-400',
    secured: 'text-emerald-500', risk: 'text-rose-500'
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
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
    return () => unsub();
  }, [user]);

  const stats = useMemo(() => {
    let securedCapital = 0;
    let capitalAtRisk = 0;
    let validVolume = 0;

    orders.forEach(o => {
      if (o.status === 'pending' || !o.total) return;
      validVolume++;
      if (o.status === 'settled') {
        securedCapital += o.total;
      } else {
        capitalAtRisk += o.total;
      }
    });

    return {
      secured: securedCapital,
      atRisk: capitalAtRisk,
      volume: validVolume,
      aov: validVolume > 0 ? (securedCapital + capitalAtRisk) / validVolume : 0
    };
  }, [orders]);

  const forceSettle = async (orderId) => {
    if (!window.confirm("Override system and force settle this transaction?")) return;
    try {
      await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'orders', orderId), { status: 'settled' });
    } catch (err) {
      console.error("Override failed", err);
    }
  };

  const t = THEMES[theme];
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('ctrl_theme_admin', next);
  };

  if (!user) return <div className={`h-screen ${t.bg}`} />;

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans p-4 md:p-10 transition-colors duration-300 pb-20`}>
      <header className={`mb-8 border-b ${t.border} pb-6 flex justify-between items-start`}>
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Revenue Overview</h1>
          <p className={`${t.muted} font-mono text-xs tracking-widest uppercase mt-1 flex items-center gap-2`}>
            {APP_ID} • Real-Time Sync
          </p>
        </div>
        <button onClick={toggleTheme} className={`p-3 rounded-full ${t.surface} hover:opacity-80 ${t.muted} transition-colors border ${t.border} active:scale-95`}>
          <Palette size={20} />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className={`${t.surface} border border-emerald-500/50 shadow-sm p-6 rounded-xl relative overflow-hidden`}>
          <div className={`${t.secured} mb-2 flex items-center gap-2`}><DollarSign size={24} /></div>
          <div className="text-3xl font-black mb-1">{formatCurrency(stats.secured)}</div>
          <div className={`text-xs ${t.secured} uppercase tracking-widest font-bold`}>Settled Revenue</div>
        </div>

        <div className={`${t.surface} border border-rose-500/50 shadow-sm p-6 rounded-xl relative overflow-hidden`}>
          <div className={`${t.risk} mb-2 flex items-center gap-2`}><AlertTriangle size={24} /></div>
          <div className="text-3xl font-black mb-1">{formatCurrency(stats.atRisk)}</div>
          <div className={`text-xs ${t.risk} uppercase tracking-widest font-bold`}>Pending Collection</div>
        </div>

        <div className={`${t.surface} border ${t.border} p-6 rounded-xl`}>
          <div className={`${t.muted} mb-2`}><Activity size={24} /></div>
          <div className="text-3xl font-black mb-1">{stats.volume}</div>
          <div className={`text-xs ${t.muted} uppercase tracking-widest font-bold`}>Total Orders</div>
        </div>

        <div className={`${t.surface} border ${t.border} p-6 rounded-xl`}>
          <div className={`${t.muted} mb-2`}><TrendingUp size={24} /></div>
          <div className="text-3xl font-black mb-1">{formatCurrency(stats.aov)}</div>
          <div className={`text-xs ${t.muted} uppercase tracking-widest font-bold`}>Average Order Value</div>
        </div>
      </div>

      <div className={`${t.surface} border ${t.border} rounded-xl overflow-hidden shadow-sm`}>
        <div className={`p-5 border-b ${t.border} flex items-center gap-2 bg-black/5 dark:bg-white/5`}>
          <FileText size={18} className={t.muted} />
          <h3 className={`text-sm font-bold uppercase tracking-widest ${t.muted}`}>Transaction Ledger</h3>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`text-xs ${t.muted} uppercase bg-black/5 dark:bg-white/5`}>
              <tr>
                <th className="px-6 py-4 border-b border-current/10 font-bold">Status</th>
                <th className="px-6 py-4 border-b border-current/10 font-bold">Time</th>
                <th className="px-6 py-4 border-b border-current/10 font-bold">Order ID / TXN</th>
                <th className="px-6 py-4 border-b border-current/10 font-bold">Table</th>
                <th className="px-6 py-4 border-b border-current/10 font-bold">Amount</th>
                <th className="px-6 py-4 border-b border-current/10 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className={`text-sm divide-y ${t.border}`}>
              {orders.map((order) => {
                const isVerified = order.status === 'settled';
                const timeStr = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <tr key={order.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      {isVerified ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 ${t.secured} border border-emerald-500/20`}>
                          <ShieldCheck size={14} /> Settled
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/10 ${t.risk} border border-rose-500/20`}>
                          <AlertTriangle size={14} /> Pending
                        </span>
                      )}
                    </td>
                    <td className={`px-6 py-4 ${t.muted} font-mono text-xs`}>{timeStr}</td>
                    <td className={`px-6 py-4 ${t.muted} font-mono text-xs`}>{order.payment?.transactionId || order.id.slice(0, 8)}</td>
                    <td className="px-6 py-4 font-black">T-{order.tableId}</td>
                    <td className={`px-6 py-4 font-black ${isVerified ? t.text : t.muted}`}>{formatCurrency(order.total || 0)}</td>
                    <td className="px-6 py-4 text-right">
                      {!isVerified && (
                        <button onClick={() => forceSettle(order.id)} className="text-xs font-bold uppercase tracking-wider bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-lg hover:opacity-80 transition-opacity">
                          Force Settle
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {orders.map((order) => {
            const isVerified = order.status === 'settled';
            const timeStr = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={order.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-black text-lg">Table {order.tableId}</div>
                    <div className={`font-mono text-xs ${t.muted}`}>{timeStr} • {order.payment?.transactionId || order.id.slice(0, 6)}</div>
                  </div>
                  <div className={`font-black text-lg ${isVerified ? t.text : t.muted}`}>
                    {formatCurrency(order.total || 0)}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-2">
                  {isVerified ? (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 ${t.secured}`}>
                      <ShieldCheck size={14} /> Settled
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 ${t.risk}`}>
                      <AlertTriangle size={14} /> Pending
                    </span>
                  )}

                  {!isVerified && (
                    <button onClick={() => forceSettle(order.id)} className="text-[10px] font-bold uppercase tracking-wider border-2 border-current px-3 py-1.5 rounded-md hover:bg-current hover:text-white transition-colors">
                      Force Settle
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}