import { useState, useEffect, useMemo } from 'react';
import { db, auth, APP_ID } from './firebase';
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, Users, ShoppingBag, DollarSign, 
  Activity, ChevronRight, Filter 
} from 'lucide-react';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { 
  style: 'currency', 
  currency: 'INR', 
  maximumFractionDigits: 0 
}).format(amount);

const COLORS = ['#6C5CE7', '#00B894', '#FDCB6E', '#FF7675', '#A29BFE', '#00CEC9'];

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    signInAnonymously(auth);
    const q = query(collection(db, 'artifacts', APP_ID, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- ANALYTICS ENGINE ---
  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((acc, o) => acc + (o.total || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const uniqueUsers = new Set(orders.map(o => o.userId)).size;

    // Revenue by Day
    const revByDay = orders.reduce((acc, o) => {
      const date = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      acc[date] = (acc[date] || 0) + (o.total || 0);
      return acc;
    }, {});
    const revenueData = Object.entries(revByDay).map(([name, value]) => ({ name, value })).reverse().slice(-7);

    // Popular Items
    const itemFreq = {};
    orders.forEach(o => {
      o.items?.forEach(item => {
        itemFreq[item.name] = (itemFreq[item.name] || 0) + item.qty;
      });
    });
    const popularItems = Object.entries(itemFreq)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { totalRevenue, totalOrders, avgOrderValue, uniqueUsers, revenueData, popularItems };
  }, [orders]);

  if (loading) return (
    <div className="h-screen bg-canvas flex items-center justify-center flex-col gap-4">
        <Activity className="text-primary animate-pulse" size={40} />
        <div className="text-primary font-mono text-xs tracking-[0.3em] uppercase">Initialising Intelligence...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas text-main p-6 md:p-10 font-sans selection:bg-primary/30">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black text-main tracking-tighter mb-1 uppercase italic">Intelligence <span className="text-primary">Core</span></h1>
          <p className="text-muted font-mono text-[10px] tracking-widest uppercase">Real-time Node Analytics • {APP_ID}</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-surface border border-border px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 hover:bg-border transition text-main">
            <Filter size={14} /> Filters
          </button>
          <div className="bg-primary px-4 py-2 rounded-lg text-xs font-bold uppercase text-white shadow-lg shadow-primary/20">
            Live Feed
          </div>
        </div>
      </header>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), icon: DollarSign, color: 'text-success' },
          { label: 'Order Volume', value: stats.totalOrders, icon: ShoppingBag, color: 'text-primary' },
          { label: 'Avg Ticket', value: formatCurrency(stats.avgOrderValue), icon: TrendingUp, color: 'text-warning' },
          { label: 'Active Users', value: stats.uniqueUsers, icon: Users, color: 'text-secondary' },
        ].map((s, i) => (
          <div key={i} className="bg-surface border border-border p-6 rounded-2xl hover:border-primary/20 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 bg-canvas rounded-lg ${s.color} border border-border`}>
                <s.icon size={20} />
              </div>
              <span className="text-success text-[10px] font-mono font-bold">+12.5%</span>
            </div>
            <div className="text-2xl font-black text-main mb-1">{s.value}</div>
            <div className="text-[10px] text-muted uppercase tracking-widest font-mono">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-surface border border-border p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted">Revenue Velocity</h3>
            <div className="text-[10px] text-muted font-mono">Last 7 Cycles</div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D45" vertical={false} />
                <XAxis dataKey="name" stroke="#B2BEC3" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#B2BEC3" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B0C15', border: '1px solid #2A2D45', borderRadius: '8px' }}
                  itemStyle={{ color: '#DFE6E9', fontSize: '12px' }}
                />
                <Bar dataKey="value" fill="#6C5CE7" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Popular Items Pie */}
        <div className="bg-surface border border-border p-6 rounded-3xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-8">Product Mix</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.popularItems}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.popularItems.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B0C15', border: '1px solid #2A2D45', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-4">
            {stats.popularItems.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }}></div>
                  <span className="text-muted uppercase font-mono">{item.name}</span>
                </div>
                <span className="text-main font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface border border-border rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted">Recent Transmissions</h3>
          <button className="text-primary text-[10px] font-bold uppercase flex items-center gap-1 hover:text-secondary transition">View All <ChevronRight size={12} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] text-muted uppercase font-mono bg-canvas">
              <tr>
                <th className="px-6 py-4 font-medium">Order ID</th>
                <th className="px-6 py-4 font-medium">Table</th>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-border">
              {orders.slice(0, 5).map((order) => (
                <tr key={order.id} className="hover:bg-canvas/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-primary">{order.id.slice(-8)}</td>
                  <td className="px-6 py-4 font-bold text-main">T{order.tableId}</td>
                  <td className="px-6 py-4 text-muted">{new Date(order.createdAt).toLocaleTimeString()}</td>
                  <td className="px-6 py-4 font-bold text-main">{formatCurrency(order.total)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                      order.status === 'pending' ? 'bg-danger/10 text-danger' :
                      order.status === 'served' ? 'bg-success/10 text-success' :
                      'bg-primary/10 text-primary'
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
