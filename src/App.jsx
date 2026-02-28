import React, { useState, useEffect, useRef } from 'react';
import { db, auth, APP_ID } from './firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, writeBatch, increment } from 'firebase/firestore';
import {
  Plus, Minus, ShoppingBag, QrCode,
  CheckCircle2, Receipt, Utensils, Wallet, Activity, Banknote, X, ArrowLeft
} from 'lucide-react';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const generateTxId = () => 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase();

function MissingTableUI() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 px-6 text-center animate-in fade-in duration-500">
      <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mb-8 shadow-sm">
        <QrCode className="text-rose-600" size={40} />
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 mb-3 leading-tight">
        Scan Table QR Code
      </h1>
      <p className="text-base text-zinc-600 mb-8 max-w-xs">
        Point your camera at the table's QR code to access the menu.
      </p>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white p-4 rounded-2xl border border-zinc-200 flex gap-4 shadow-sm animate-pulse">
          <div className="w-24 h-24 rounded-xl bg-zinc-200 shrink-0"></div>
          <div className="flex-grow flex flex-col justify-center gap-2">
            <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
            <div className="h-3 bg-zinc-200 rounded w-full"></div>
            <div className="h-3 bg-zinc-200 rounded w-1/2 mb-2"></div>
            <div className="flex justify-between items-center mt-auto">
              <div className="h-4 bg-zinc-200 rounded w-1/4"></div>
              <div className="h-8 bg-zinc-200 rounded w-16"></div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tableId, setTableId] = useState(null);
  const [view, setView] = useState("menu");
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState(0); // 0: closed, 1: cart review, 2: payment options
  const [showUpiQrFallback, setShowUpiQrFallback] = useState(false);

  const ordersRef = useRef([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTable = params.get('table');
    const storedTable = localStorage.getItem('ctrl_table');

    if (urlTable) {
      setTableId(urlTable);
      localStorage.setItem('ctrl_table', urlTable);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (storedTable) {
      setTableId(storedTable);
    }

    const initAuth = async () => { await signInAnonymously(auth); };
    initAuth();
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubMenu = onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'menu'), (snap) => {
      setMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoadingMenu(false);
    });

    const unsubOrders = onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'orders'), (snap) => {
      const allData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myOrders = allData.filter(o => o.userId === user.uid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (ordersRef.current.length > 0) {
        myOrders.forEach(newOrder => {
          const oldOrder = ordersRef.current.find(o => o.id === newOrder.id);
          if (oldOrder && newOrder.items) {
            let newlyReady = [];
            newOrder.items.forEach((newItem, idx) => {
              if (newItem.status === 'ready' && oldOrder.items[idx]?.status !== 'ready') {
                newlyReady.push(newItem.name);
              }
            });
            if (newlyReady.length > 0) {
              setNotification(`Your ${newlyReady.join(', ')} is ready!`);
              setTimeout(() => setNotification(null), 4000);
            }
          }
        });
      }

      ordersRef.current = myOrders;
      setOrders(myOrders);
    });

    return () => { unsubMenu(); unsubOrders(); };
  }, [user]);

  const handleCartChange = (itemId, change) => {
    const item = menuItems.find(m => m.id === itemId);
    if (!item) return;

    setCart(prev => {
      const currentQty = prev[itemId] || 0;
      const newQty = currentQty + change;

      if (newQty > item.qty) {
        setNotification("Maximum available added.");
        setTimeout(() => setNotification(null), 2000);
        return prev;
      }

      const updated = { ...prev };
      if (newQty <= 0) {
        delete updated[itemId];
        if (Object.keys(updated).length === 0 && checkoutStep === 1) setCheckoutStep(0);
      } else {
        updated[itemId] = newQty;
      }
      return updated;
    });
  };

  const executeCheckout = async (method) => {
    if (!user) return;
    setIsProcessing(true);

    let totalAmount = 0;
    const finalItems = [];

    Object.entries(cart).forEach(([id, qty]) => {
      const trueItem = menuItems.find(m => m.id === id);
      if (trueItem && trueItem.qty >= qty) {
        totalAmount += trueItem.price * qty;
        finalItems.push({ name: trueItem.name, id: trueItem.id, qty: qty, status: 'pending' });
      }
    });

    if (totalAmount <= 0 || finalItems.length === 0) {
      alert("Cart invalid. An item sold out while you were browsing.");
      setIsProcessing(false);
      setCheckoutStep(0);
      return;
    }

    const txId = generateTxId();

    if (method === 'UPI') {
      const upiLink = `upi://pay?pa=merchant@upi&pn=CTRL_NODE&tr=${txId}&am=${totalAmount.toFixed(2)}&cu=INR`;
      try {
        window.location.href = upiLink;
        // If device ignores deep link, trigger fallback after slight delay
        setTimeout(() => setShowUpiQrFallback(true), 1500);
      } catch (e) {
        setShowUpiQrFallback(true);
      }
    }

    const orderStatus = method === 'CASH' ? 'pending' : 'payment_pending';

    const payload = {
      tableId,
      userId: user.uid,
      total: totalAmount,
      status: orderStatus,
      createdAt: new Date().toISOString(),
      payment: { transactionId: txId, method: method },
      items: finalItems
    };

    const batch = writeBatch(db);
    const orderRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'orders'));
    batch.set(orderRef, payload);

    Object.entries(cart).forEach(([id, qty]) => {
      const itemRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'menu', id);
      batch.update(itemRef, { qty: increment(-qty) });
    });

    try {
      await batch.commit();
      if (method === 'CASH') {
        setCart({});
        setCheckoutStep(0);
        setView("orders");
        setNotification("Order sent to kitchen!");
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (e) {
      console.error(e);
      alert("Transaction failed to sync.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!tableId) return <MissingTableUI />;

  const visualTotal = Object.entries(cart).reduce((acc, [id, qty]) => {
    const item = menuItems.find(m => m.id === id);
    return acc + ((item?.price || 0) * qty);
  }, 0);

  const categories = ['All', ...new Set(menuItems.map(item => item.category || 'Mains'))];
  const filteredMenu = selectedCategory === 'All' ? menuItems : menuItems.filter(item => (item.category || 'Mains') === selectedCategory);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-32 selection:bg-rose-200">

      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-zinc-900 text-white px-6 py-3 rounded-2xl font-medium shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />
          <span className="text-sm">{notification}</span>
        </div>
      )}

      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-zinc-200 z-40">
        <div className="p-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-zinc-900 font-bold bg-zinc-100 px-4 py-2 rounded-full text-sm">
            <Utensils size={16} /> Table {tableId}
          </div>
          <div className="flex bg-zinc-100 rounded-full p-1 border border-zinc-200">
            <button
              onClick={() => setView('menu')}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all ${view === 'menu' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              Menu
            </button>
            <button
              onClick={() => setView('orders')}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all ${view === 'orders' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              Orders
            </button>
          </div>
        </div>

        {view === 'menu' && !isLoadingMenu && (
          <div className="px-4 pb-3 overflow-x-auto no-scrollbar flex gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedCategory === cat ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 border border-zinc-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </header>

      {view === 'menu' ? (
        <div className="p-4 max-w-2xl mx-auto space-y-4">
          {isLoadingMenu ? <SkeletonLoader /> : filteredMenu.map(item => {
            const isOutOfStock = item.qty <= 0;
            const inCart = cart[item.id] || 0;

            return (
              <div key={item.id} className={`bg-white p-4 rounded-2xl border flex gap-4 transition-all shadow-sm ${isOutOfStock ? 'opacity-60 border-zinc-200 bg-zinc-50' : 'border-zinc-200'}`}>
                <div className="w-24 h-24 rounded-xl bg-zinc-100 shrink-0 border border-zinc-200 overflow-hidden relative flex items-center justify-center">
                  {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : <Utensils size={24} className="text-zinc-300" />}
                  {isOutOfStock && <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[2px]"><span className="text-[9px] font-bold text-white uppercase tracking-widest bg-zinc-900 px-2 py-1 rounded">Sold Out</span></div>}
                </div>

                <div className="flex-grow flex flex-col justify-center">
                  <div className="font-bold text-zinc-900 mb-1 leading-tight">{item.name}</div>
                  <div className="text-zinc-500 text-xs line-clamp-2 leading-relaxed mb-2">{item.desc}</div>

                  <div className="flex justify-between items-center mt-auto">
                    <div className="text-sm font-black text-zinc-900 font-mono tracking-tight">{formatCurrency(item.price)}</div>

                    {!isOutOfStock && (
                      <div className="flex items-center gap-3">
                        {inCart > 0 ? (
                          <div className="flex items-center gap-3 bg-zinc-100 rounded-lg p-1">
                            <button onClick={() => handleCartChange(item.id, -1)} className="p-1.5 text-zinc-600 active:scale-90 transition-transform"><Minus size={14} /></button>
                            <span className="font-mono text-sm w-4 text-center font-bold">{inCart}</span>
                            <button onClick={() => handleCartChange(item.id, 1)} className="p-1.5 text-zinc-900 bg-white rounded shadow-sm active:scale-90 transition-transform"><Plus size={14} /></button>
                          </div>
                        ) : (
                          <button onClick={() => handleCartChange(item.id, 1)} className="bg-rose-50 text-rose-700 font-bold text-xs px-5 py-2 rounded-lg active:scale-95 transition-transform">Add</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="p-4 max-w-2xl mx-auto space-y-4">
          {orders.length === 0 ? (
            <div className="text-center py-20 text-zinc-500 flex flex-col items-center">
              <ShoppingBag size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">No active orders.</p>
            </div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-sm">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-zinc-100">
                  <div>
                    <span className="font-bold text-lg font-mono block">{formatCurrency(order.total)}</span>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{order.payment?.method}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${order.status === 'served' ? 'bg-zinc-100 text-zinc-600' :
                      order.status === 'bill_requested' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                    }`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-4 mb-5">
                  {order.items && order.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="bg-zinc-100 text-zinc-600 font-bold w-8 h-8 rounded-lg flex items-center justify-center text-sm">{item.qty}</span>
                        <span className={`text-sm font-medium ${item.status === 'ready' ? 'text-zinc-900' : 'text-zinc-600'}`}>{item.name}</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg ${item.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>

                {order.status === 'served' && order.payment?.method === 'CASH' && (
                  <button onClick={() => updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'orders', order.id), { status: 'bill_requested' })} className="w-full py-4 rounded-xl border-2 border-zinc-200 text-zinc-700 font-bold text-sm uppercase tracking-wide flex justify-center items-center gap-2 active:bg-zinc-50 transition-colors">
                    <Receipt size={18} /> Request Bill
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Cart & Checkout Overlay */}
      {visualTotal > 0 && checkoutStep > 0 && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-full max-h-[85vh] flex flex-col">

            <div className="flex justify-between items-center mb-6">
              {checkoutStep === 2 ? (
                <button onClick={() => setCheckoutStep(1)} className="p-2 -ml-2 text-zinc-900"><ArrowLeft size={20} /></button>
              ) : (
                <h2 className="text-xl font-bold">Review Order</h2>
              )}
              <button onClick={() => setCheckoutStep(0)} className="p-2 -mr-2 text-zinc-400 hover:text-zinc-900"><X size={20} /></button>
            </div>

            {checkoutStep === 1 && (
              <>
                <div className="overflow-y-auto no-scrollbar space-y-4 mb-6">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = menuItems.find(m => m.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="flex justify-between items-center border-b border-zinc-100 pb-4">
                        <div>
                          <div className="font-bold text-zinc-900">{item.name}</div>
                          <div className="text-zinc-500 text-xs font-mono">{formatCurrency(item.price)} x {qty}</div>
                        </div>
                        <div className="font-mono font-bold">{formatCurrency(item.price * qty)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-auto pt-4 border-t border-zinc-200">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-zinc-500 font-medium">Total Amount</span>
                    <span className="text-2xl font-black font-mono">{formatCurrency(visualTotal)}</span>
                  </div>
                  <button onClick={() => setCheckoutStep(2)} className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold text-lg active:scale-[0.98] transition-all">
                    Proceed to Payment
                  </button>
                </div>
              </>
            )}

            {checkoutStep === 2 && !showUpiQrFallback && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-2">Select Method</h3>
                <button onClick={() => executeCheckout('UPI')} disabled={isProcessing} className="w-full bg-zinc-900 text-white py-4 rounded-xl flex justify-center items-center gap-2 font-bold shadow-md active:scale-[0.98] transition-all disabled:opacity-70">
                  {isProcessing ? <Activity size={18} className="animate-spin" /> : <Wallet size={18} />}
                  Pay {formatCurrency(visualTotal)} via UPI
                </button>
                <button onClick={() => executeCheckout('CASH')} disabled={isProcessing} className="w-full bg-white text-zinc-900 py-4 rounded-xl flex justify-center items-center gap-2 font-bold border-2 border-zinc-200 active:bg-zinc-50 transition-all disabled:opacity-70">
                  <Banknote size={18} />
                  Pay by Cash
                </button>
              </div>
            )}

            {checkoutStep === 2 && showUpiQrFallback && (
              <div className="flex flex-col items-center text-center gap-4 py-4">
                <div className="w-48 h-48 bg-zinc-100 border-2 border-dashed border-zinc-300 rounded-2xl flex flex-col items-center justify-center text-zinc-400">
                  <QrCode size={48} className="mb-2" />
                  <span className="text-xs uppercase font-bold">QR Generation Pending</span>
                </div>
                <p className="text-sm text-zinc-500">Scan at the counter or pay by cash to finalize.</p>
                <button onClick={() => executeCheckout('CASH')} className="w-full mt-4 bg-zinc-900 text-white py-4 rounded-xl font-bold">Switch to Cash</button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Floating Checkout Trigger */}
      {view === 'menu' && visualTotal > 0 && checkoutStep === 0 && (
        <div className="fixed bottom-6 left-0 w-full px-4 z-40">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setCheckoutStep(1)}
              className="w-full bg-zinc-900 text-white py-4 rounded-2xl flex justify-between px-6 items-center font-bold text-lg active:scale-[0.98] transition-all shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">{Object.values(cart).reduce((a, b) => a + b, 0)}</div>
                <span className="uppercase tracking-widest text-sm">View Cart</span>
              </div>
              <span className="font-mono">{formatCurrency(visualTotal)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}