import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Minus, Trash2, X, Coffee, Receipt, Package, History,
  Pencil, Check, Lock, LogOut, UserPlus, Shield, User, Delete, ClipboardList,
  Tag, ImagePlus, ImageOff,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const uid = () => Math.random().toString(36).slice(2, 10);
const rupiah = (n) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
const EMOJIS = ["☕", "🥐", "🍰", "🧋", "🍫", "🥤", "🍩", "🥯", "🧁", "🍪"];

// Resize + convert an uploaded image file to a compact base64 data URL
function resizeImageFile(file, maxDim = 500) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("File bukan gambar yang valid"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}


// window.storage backed by Supabase (cloud), so data is shared across devices
// and survives browser cache clears. Falls back to localStorage if Supabase
// is unreachable, so the kasir can keep working during a connection hiccup.
if (typeof window !== "undefined" && !window.storage) {
  const LOCAL_PREFIX = "kasir_";
  const TABLE = "kasir_kv";

  window.storage = {
    async get(key) {
      try {
        const { data, error } = await supabase.from(TABLE).select("value").eq("key", key).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const value = JSON.stringify(data.value);
        localStorage.setItem(LOCAL_PREFIX + key, value); // keep a local mirror as backup
        return { key, value, shared: false };
      } catch (e) {
        const raw = localStorage.getItem(LOCAL_PREFIX + key);
        return raw !== null ? { key, value: raw, shared: false } : null;
      }
    },
    async set(key, value) {
      localStorage.setItem(LOCAL_PREFIX + key, value); // always mirror locally first
      try {
        const { error } = await supabase.from(TABLE).upsert({ key, value: JSON.parse(value), updated_at: new Date().toISOString() });
        if (error) throw error;
      } catch (e) {}
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(LOCAL_PREFIX + key);
      try { await supabase.from(TABLE).delete().eq("key", key); } catch (e) {}
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      try {
        const { data, error } = await supabase.from(TABLE).select("key").like("key", `${prefix}%`);
        if (error) throw error;
        return { keys: (data || []).map((d) => d.key), prefix, shared: false };
      } catch (e) {
        const keys = Object.keys(localStorage)
          .filter((k) => k.startsWith(LOCAL_PREFIX + prefix))
          .map((k) => k.slice(LOCAL_PREFIX.length));
        return { keys, prefix, shared: false };
      }
    },
  };
}

export default function KasirApp() {
  const [tab, setTab] = useState("kasir");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ taxPercent: 0, shopName: "Coffee Shop Saya", logoUrl: "" });
  const [staff, setStaff] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [currentUser, setCurrentUser] = useState(null); // {id, name, role} - session only, not persisted
  const [loginStep, setLoginStep] = useState("pick"); // pick | pin
  const [loginStaffId, setLoginStaffId] = useState(null);
  const [pinEntry, setPinEntry] = useState("");
  const [loginError, setLoginError] = useState("");
  const [onboardName, setOnboardName] = useState("");
  const [onboardPin, setOnboardPin] = useState("");

  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState("Semua");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("Tunai");
  const [cashInput, setCashInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [lastReceipt, setLastReceipt] = useState(null);

  const [productModal, setProductModal] = useState(null);
  const [staffModal, setStaffModal] = useState(null); // {id?, name, pin, role}
  const [discountModal, setDiscountModal] = useState(null); // {id?, name, type, value, productIds, active}

  useEffect(() => {
    (async () => {
      for (const [key, setter] of [
        ["products", setProducts],
        ["orders", setOrders],
        ["settings", setSettings],
        ["staff", setStaff],
        ["activityLog", setActivityLog],
        ["discounts", setDiscounts],
      ]) {
        try {
          const r = await window.storage.get(key);
          if (r) setter(JSON.parse(r.value));
        } catch (e) {}
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) window.storage.set("products", JSON.stringify(products)).catch(() => {}); }, [products, loaded]);
  useEffect(() => { if (loaded) window.storage.set("orders", JSON.stringify(orders)).catch(() => {}); }, [orders, loaded]);
  useEffect(() => { if (loaded) window.storage.set("settings", JSON.stringify(settings)).catch(() => {}); }, [settings, loaded]);
  useEffect(() => { if (loaded) window.storage.set("staff", JSON.stringify(staff)).catch(() => {}); }, [staff, loaded]);
  useEffect(() => { if (loaded) window.storage.set("activityLog", JSON.stringify(activityLog)).catch(() => {}); }, [activityLog, loaded]);
  useEffect(() => { if (loaded) window.storage.set("discounts", JSON.stringify(discounts)).catch(() => {}); }, [discounts, loaded]);

  function logActivity(action, detail) {
    setActivityLog((prev) => [
      { id: uid(), timestamp: Date.now(), staffId: currentUser?.id, staffName: currentUser?.name || "?", action, detail },
      ...prev,
    ].slice(0, 500));
  }

  // ---------- Auth ----------
  function startLogin(staffMember) {
    setLoginStaffId(staffMember.id);
    setLoginStep("pin");
    setPinEntry("");
    setLoginError("");
  }

  function submitPin(digit) {
    if (digit === "back") return setPinEntry((p) => p.slice(0, -1));
    if (pinEntry.length >= 6) return;
    const next = pinEntry + digit;
    setPinEntry(next);
    const person = staff.find((s) => s.id === loginStaffId);
    if (person && next.length === person.pin.length) {
      if (next === person.pin) {
        setCurrentUser({ id: person.id, name: person.name, role: person.role });
        setLoginStep("pick");
        setPinEntry("");
        setLoginStaffId(null);
        setTimeout(() => logActivity("login", "Masuk ke kasir"), 0);
      } else {
        setLoginError("PIN salah, coba lagi");
        setTimeout(() => setPinEntry(""), 300);
      }
    }
  }

  function doLogout() {
    logActivity("logout", "Keluar dari kasir");
    setCurrentUser(null);
    setTab("kasir");
  }

  function createFirstAdmin() {
    if (!onboardName.trim() || onboardPin.length < 4) return;
    const admin = { id: uid(), name: onboardName.trim(), pin: onboardPin, role: "admin" };
    setStaff([admin]);
    setCurrentUser({ id: admin.id, name: admin.name, role: admin.role });
    setOnboardName("");
    setOnboardPin("");
  }

  const isAdmin = currentUser?.role === "admin";

  // ---------- Derived cart/product data ----------
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category || "Lainnya"));
    return ["Semua", ...Array.from(set)];
  }, [products]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === "Semua") return products;
    return products.filter((p) => (p.category || "Lainnya") === activeCategory);
  }, [products, activeCategory]);

  // Best active promo (if any) applicable to a given product
  function bestDiscountFor(productId, price) {
    const applicable = discounts.filter((d) => d.active !== false && (d.productIds || []).includes(productId));
    let bestCut = 0;
    let bestLabel = null;
    applicable.forEach((d) => {
      const cut = d.type === "percent" ? (price * (Number(d.value) || 0)) / 100 : (Number(d.value) || 0);
      if (cut > bestCut) { bestCut = cut; bestLabel = d.name; }
    });
    bestCut = Math.min(bestCut, price);
    return { cut: bestCut, label: bestLabel };
  }

  const cartLines = useMemo(() => {
    return cart.map((c) => {
      const prod = products.find((p) => p.id === c.productId);
      if (!prod) return null;
      const { cut, label } = bestDiscountFor(prod.id, prod.price);
      return { ...prod, qty: c.qty, discountCut: cut, discountLabel: label, finalPrice: Math.max(prod.price - cut, 0) };
    }).filter(Boolean);
  }, [cart, products, discounts]);

  const subtotal = cartLines.reduce((s, l) => s + l.price * l.qty, 0);
  const promoDiscountTotal = cartLines.reduce((s, l) => s + l.discountCut * l.qty, 0);
  const discount = Math.min(Number(discountInput) || 0, subtotal - promoDiscountTotal);
  const taxable = subtotal - promoDiscountTotal - discount;
  const tax = (taxable * (Number(settings.taxPercent) || 0)) / 100;
  const total = taxable + tax;
  const cash = Number(cashInput) || 0;
  const change = payMethod === "Tunai" ? Math.max(cash - total, 0) : 0;

  function addToCart(productId) {
    setCart((prev) => {
      const found = prev.find((c) => c.productId === productId);
      if (found) return prev.map((c) => (c.productId === productId ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { productId, qty: 1 }];
    });
  }
  function changeQty(productId, delta) {
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0));
  }
  function removeFromCart(productId) { setCart((prev) => prev.filter((c) => c.productId !== productId)); }
  function clearCart() { setCart([]); setDiscountInput(""); setCashInput(""); setPayMethod("Tunai"); }
  function openCheckout() { if (cartLines.length) setCheckoutOpen(true); }

  function confirmCheckout() {
    if (payMethod === "Tunai" && cash < total) return;
    const record = {
      id: uid(), timestamp: Date.now(),
      items: cartLines.map((l) => ({
        name: l.name, price: l.finalPrice, originalPrice: l.price, qty: l.qty,
        icon: l.icon, discountLabel: l.discountLabel,
      })),
      subtotal, promoDiscount: promoDiscountTotal, discount, tax, total, payMethod,
      cash: payMethod === "Tunai" ? cash : total, change,
      staffName: currentUser?.name || "?",
    };
    setOrders((prev) => [record, ...prev]);
    logActivity("transaksi", `${rupiah(total)} · ${cartLines.length} item`);
    setLastReceipt(record);
    setCheckoutOpen(false);
    clearCart();
  }

  function saveProduct(p) {
    const isNew = !p.id;
    if (isNew) setProducts((prev) => [...prev, { ...p, id: uid() }]);
    else setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    logActivity(isNew ? "tambah_produk" : "edit_produk", `${p.name} · ${rupiah(p.price)}`);
    setProductModal(null);
  }
  function deleteProduct(id) {
    const p = products.find((x) => x.id === id);
    setProducts((prev) => prev.filter((x) => x.id !== id));
    setCart((prev) => prev.filter((c) => c.productId !== id));
    if (p) logActivity("hapus_produk", p.name);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 300);
      setSettings((s) => ({ ...s, logoUrl: dataUrl }));
    } catch (err) {}
    e.target.value = "";
  }

  async function handleProductImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 500);
      setProductModal((p) => ({ ...p, image: dataUrl }));
    } catch (err) {}
    e.target.value = "";
  }

  function saveDiscount(d) {
    const isNew = !d.id;
    if (isNew) setDiscounts((prev) => [...prev, { ...d, id: uid() }]);
    else setDiscounts((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    logActivity(isNew ? "tambah_promo" : "edit_promo", `${d.name} · ${(d.productIds || []).length} produk`);
    setDiscountModal(null);
  }
  function deleteDiscount(id) {
    const d = discounts.find((x) => x.id === id);
    setDiscounts((prev) => prev.filter((x) => x.id !== id));
    if (d) logActivity("hapus_promo", d.name);
  }
  function toggleDiscountActive(id) {
    setDiscounts((prev) => prev.map((x) => (x.id === id ? { ...x, active: x.active === false } : x)));
  }

  function saveStaffMember(s) {
    const isNew = !s.id;
    if (isNew) setStaff((prev) => [...prev, { ...s, id: uid() }]);
    else setStaff((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: s.name, role: s.role, pin: s.pin || x.pin } : x)));
    logActivity(isNew ? "tambah_staff" : "edit_staff", `${s.name} · ${s.role}`);
    setStaffModal(null);
  }
  function deleteStaffMember(id) {
    const admins = staff.filter((s) => s.role === "admin");
    const target = staff.find((s) => s.id === id);
    if (target?.role === "admin" && admins.length <= 1) return; // keep at least 1 admin
    setStaff((prev) => prev.filter((s) => s.id !== id));
    if (target) logActivity("hapus_staff", target.name);
  }

  const todayOrders = orders.filter((o) => new Date(o.timestamp).toDateString() === new Date().toDateString());
  const todayTotal = todayOrders.reduce((s, o) => s + o.total, 0);

  if (!loaded) return <div className="min-h-screen bg-[#FDF5F8]" />;

  // ---------- Onboarding: create first admin ----------
  if (staff.length === 0) {
    return (
      <div className="min-h-screen bg-[#FDF5F8] flex items-center justify-center p-4">
        <div className="bg-white border border-[#F0D3DE] rounded-2xl p-6 w-full max-w-sm">
          <div className="w-10 h-10 rounded-lg bg-[#D6336C] flex items-center justify-center text-white mb-3">
            <Shield size={20} />
          </div>
          <h1 className="font-semibold text-lg mb-1">Buat akun admin pertama</h1>
          <p className="text-xs text-[#9C7885] mb-4">Akun ini bisa kelola produk, staff, dan lihat semua aktivitas kasir.</p>
          <label className="text-xs text-[#9C7885] block mb-1">Nama</label>
          <input value={onboardName} onChange={(e) => setOnboardName(e.target.value)} placeholder="Nama kamu"
            className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
          <label className="text-xs text-[#9C7885] block mb-1">PIN (4-6 digit)</label>
          <input value={onboardPin} onChange={(e) => setOnboardPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            type="password" inputMode="numeric" placeholder="••••"
            className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-4 tracking-widest outline-none focus:border-[#D6336C]" />
          <button onClick={createFirstAdmin} disabled={!onboardName.trim() || onboardPin.length < 4}
            className="w-full bg-[#3D1F2B] disabled:bg-[#EBCCDA] text-white font-semibold py-3 rounded-lg text-sm">
            Buat Akun & Mulai
          </button>
        </div>
      </div>
    );
  }

  // ---------- Login gate ----------
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#FDF5F8] flex items-center justify-center p-4">
        <div className="bg-white border border-[#F0D3DE] rounded-2xl p-6 w-full max-w-sm">
          <div className="w-10 h-10 rounded-lg bg-[#D6336C] flex items-center justify-center text-white mb-3">
            <Lock size={20} />
          </div>
          {loginStep === "pick" ? (
            <>
              <h1 className="font-semibold text-lg mb-1">{settings.shopName}</h1>
              <p className="text-xs text-[#9C7885] mb-4">Pilih namamu untuk masuk kasir</p>
              <div className="flex flex-col gap-2">
                {staff.map((s) => (
                  <button key={s.id} onClick={() => startLogin(s)}
                    className="flex items-center gap-3 border border-[#F0D3DE] rounded-lg px-3 py-2.5 text-left hover:border-[#D6336C]">
                    <div className="w-8 h-8 rounded-full bg-[#FBEAF1] flex items-center justify-center">
                      <User size={15} className="text-[#9C7885]" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-[10px] text-[#9C7885] uppercase tracking-wide">{s.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setLoginStep("pick")} className="text-xs text-[#9C7885] mb-2">&larr; Kembali</button>
              <h1 className="font-semibold text-lg mb-1">Masukkan PIN</h1>
              <p className="text-xs text-[#9C7885] mb-4">{staff.find((s) => s.id === loginStaffId)?.name}</p>
              <div className="flex justify-center gap-2 mb-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`w-3 h-3 rounded-full ${i < pinEntry.length ? "bg-[#3D1F2B]" : "bg-[#F0D3DE]"}`} />
                ))}
              </div>
              {loginError && <p className="text-xs text-[#C23B57] text-center mb-2">{loginError}</p>}
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9","","0","back"].map((k, i) =>
                  k === "" ? <div key={i} /> : (
                    <button key={i} onClick={() => submitPin(k)}
                      className="h-12 rounded-lg bg-[#FBEAF1] flex items-center justify-center text-lg font-medium hover:bg-[#F0D3DE]">
                      {k === "back" ? <Delete size={18} /> : k}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- Main app ----------
  return (
    <div className="min-h-screen w-full bg-[#FDF5F8] text-[#3D1F2B] flex flex-col">
      <header className="border-b border-[#F0D3DE] bg-[#FDF5F8] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-md bg-[#D6336C] flex items-center justify-center text-white shrink-0 overflow-hidden">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Coffee size={18} />
              )}
            </div>
            <div className="min-w-0">
              <input value={settings.shopName} disabled={!isAdmin}
                onChange={(e) => setSettings((s) => ({ ...s, shopName: e.target.value }))}
                className="bg-transparent font-semibold text-sm sm:text-base outline-none border-b border-transparent focus:border-[#D6336C] max-w-[120px] sm:max-w-xs truncate" />
              <p className="text-[10px] text-[#9C7885] truncate">{currentUser.name} · {currentUser.role}</p>
            </div>
          </div>
          <nav className="flex gap-1 bg-[#FBEAF1] rounded-lg p-1 overflow-x-auto">
            {[
              { id: "kasir", label: "Kasir", icon: Receipt, show: true },
              { id: "produk", label: "Produk", icon: Package, show: isAdmin },
              { id: "promo", label: "Promo", icon: Tag, show: isAdmin },
              { id: "riwayat", label: "Riwayat", icon: History, show: true },
              { id: "staff", label: "Staff", icon: Shield, show: isAdmin },
              { id: "aktivitas", label: "Aktivitas", icon: ClipboardList, show: isAdmin },
            ].filter((t) => t.show).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors shrink-0 ${tab === t.id ? "bg-white text-[#3D1F2B] shadow-sm" : "text-[#9C7885] hover:text-[#3D1F2B]"}`}>
                <t.icon size={14} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
          <button onClick={doLogout} className="shrink-0 w-8 h-8 rounded-md bg-[#FBEAF1] flex items-center justify-center text-[#C23B57]" title="Ganti pengguna">
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {tab === "kasir" && (
        <div className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((c) => (
                <button key={c} onClick={() => setActiveCategory(c)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeCategory === c ? "bg-[#3D1F2B] text-white border-[#3D1F2B]" : "bg-white text-[#9C7885] border-[#F0D3DE] hover:border-[#D6336C]"}`}>
                  {c}
                </button>
              ))}
            </div>
            {products.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-20 border-2 border-dashed border-[#F0D3DE] rounded-xl">
                <Coffee size={32} className="text-[#D6336C] mb-2" />
                <p className="text-sm font-medium">Belum ada produk</p>
                <p className="text-xs text-[#9C7885] mb-3">{isAdmin ? "Tambahkan produk pertamamu di tab Produk" : "Minta admin menambahkan produk"}</p>
                {isAdmin && (
                  <button onClick={() => setTab("produk")} className="text-xs font-semibold bg-[#D6336C] text-white px-4 py-2 rounded-lg">Buka tab Produk</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {visibleProducts.map((p) => {
                  const { cut, label } = bestDiscountFor(p.id, p.price);
                  return (
                    <button key={p.id} onClick={() => addToCart(p.id)}
                      className="relative bg-white border border-[#F0D3DE] rounded-xl p-3 text-left hover:border-[#D6336C] hover:shadow-sm transition-all active:scale-[0.98]">
                      {cut > 0 && (
                        <span className="absolute top-2 right-2 bg-[#D6336C] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Tag size={9} /> Promo
                        </span>
                      )}
                      <div className="w-full aspect-square rounded-lg bg-[#FBEAF1] mb-2 overflow-hidden flex items-center justify-center text-2xl">
                        {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : (p.icon || "☕")}
                      </div>
                      <div className="text-sm font-medium leading-tight line-clamp-2">{p.name}</div>
                      {cut > 0 ? (
                        <div className="mt-1">
                          <div className="text-[10px] font-mono text-[#9C7885] line-through">{rupiah(p.price)}</div>
                          <div className="text-xs font-mono text-[#D6336C] font-semibold">{rupiah(p.price - cut)}</div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-[#D6336C] mt-1">{rupiah(p.price)}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white border border-[#F0D3DE] rounded-xl overflow-hidden sticky top-20 flex flex-col">
              <div className="px-4 py-3 border-b border-dashed border-[#F0D3DE] flex items-center justify-between">
                <h2 className="font-mono text-xs tracking-widest text-[#9C7885] uppercase">Pesanan</h2>
                {cartLines.length > 0 && (
                  <button onClick={clearCart} className="text-[#C23B57] text-xs flex items-center gap-1"><Trash2 size={12} /> Kosongkan</button>
                )}
              </div>
              <div className="px-4 py-2 max-h-[45vh] overflow-y-auto">
                {cartLines.length === 0 ? (
                  <p className="text-xs text-[#9C7885] py-8 text-center">Belum ada item. Ketuk produk untuk menambah.</p>
                ) : (
                  <div className="divide-y divide-[#FBEAF1]">
                    {cartLines.map((l) => (
                      <div key={l.id} className="py-2 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-[#FBEAF1] shrink-0 overflow-hidden flex items-center justify-center text-lg">
                          {l.image ? <img src={l.image} alt={l.name} className="w-full h-full object-cover" /> : (l.icon || "☕")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{l.name}</div>
                          {l.discountCut > 0 ? (
                            <div className="text-[11px] font-mono">
                              <span className="text-[#9C7885] line-through mr-1">{rupiah(l.price)}</span>
                              <span className="text-[#D6336C]">{rupiah(l.finalPrice)}</span>
                              <span className="text-[#9C7885]"> x {l.qty}</span>
                            </div>
                          ) : (
                            <div className="text-[11px] font-mono text-[#9C7885]">{rupiah(l.price)} x {l.qty}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => changeQty(l.id, -1)} className="w-6 h-6 rounded-md bg-[#FBEAF1] flex items-center justify-center"><Minus size={12} /></button>
                          <span className="text-xs w-4 text-center">{l.qty}</span>
                          <button onClick={() => changeQty(l.id, 1)} className="w-6 h-6 rounded-md bg-[#FBEAF1] flex items-center justify-center"><Plus size={12} /></button>
                          <button onClick={() => removeFromCart(l.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-[#C23B57]"><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-dashed border-[#F0D3DE] font-mono text-xs space-y-1">
                <div className="flex justify-between text-[#9C7885]"><span>Subtotal</span><span>{rupiah(subtotal)}</span></div>
                {promoDiscountTotal > 0 && (
                  <div className="flex justify-between text-[#D6336C]"><span>Diskon promo</span><span>-{rupiah(promoDiscountTotal)}</span></div>
                )}
                {Number(settings.taxPercent) > 0 && (
                  <div className="flex justify-between text-[#9C7885]"><span>Pajak ({settings.taxPercent}%)</span><span>{rupiah(tax)}</span></div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#3D1F2B] pt-1"><span>Total</span><span>{rupiah(total)}</span></div>
              </div>
              <div className="p-3">
                <button onClick={openCheckout} disabled={cartLines.length === 0}
                  className="w-full bg-[#3D1F2B] disabled:bg-[#EBCCDA] disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-lg transition-colors">
                  Bayar {cartLines.length > 0 ? rupiah(total) : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "produk" && isAdmin && (
        <div className="max-w-4xl w-full mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Produk</h2>
              <p className="text-xs text-[#9C7885]">Kelola menu, harga, dan kategori</p>
            </div>
            <button onClick={() => setProductModal({ name: "", price: "", category: "", icon: "☕", image: "" })}
              className="flex items-center gap-1.5 bg-[#D6336C] text-white text-sm font-medium px-3 py-2 rounded-lg">
              <Plus size={15} /> Tambah Produk
            </button>
          </div>
          <div className="bg-white border border-[#F0D3DE] rounded-xl p-3 flex flex-col gap-4">
            <div>
              <label className="text-xs text-[#9C7885] block mb-1">Nama brand</label>
              <input value={settings.shopName} onChange={(e) => setSettings((s) => ({ ...s, shopName: e.target.value }))}
                placeholder="Nama coffee shop kamu"
                className="w-full border border-[#F0D3DE] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[#D6336C]" />
            </div>
            <div>
              <label className="text-xs text-[#9C7885] block mb-1">Logo brand</label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#FBEAF1] flex items-center justify-center overflow-hidden shrink-0">
                  {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Coffee size={20} className="text-[#9C7885]" />
                  )}
                </div>
                <label className="flex items-center gap-1.5 text-xs font-medium bg-[#FBEAF1] px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F0D3DE]">
                  <ImagePlus size={14} /> {settings.logoUrl ? "Ganti Logo" : "Unggah Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                {settings.logoUrl && (
                  <button onClick={() => setSettings((s) => ({ ...s, logoUrl: "" }))}
                    className="flex items-center gap-1 text-xs text-[#C23B57]"><ImageOff size={14} /> Hapus</button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#9C7885] block mb-1">Pajak per transaksi (%)</label>
              <input type="number" min="0" value={settings.taxPercent}
                onChange={(e) => setSettings((s) => ({ ...s, taxPercent: e.target.value }))}
                className="w-24 border border-[#F0D3DE] rounded-md px-2 py-1 text-sm outline-none focus:border-[#D6336C]" />
            </div>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-[#9C7885] text-center py-10">Belum ada produk. Tambahkan yang pertama.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {products.map((p) => (
                <div key={p.id} className="bg-white border border-[#F0D3DE] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#FBEAF1] shrink-0 overflow-hidden flex items-center justify-center text-2xl">
                    {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : (p.icon || "☕")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-[#9C7885]">{p.category || "Lainnya"} · <span className="font-mono">{rupiah(p.price)}</span></div>
                  </div>
                  <button onClick={() => setProductModal(p)} className="w-8 h-8 rounded-md bg-[#FBEAF1] flex items-center justify-center"><Pencil size={14} /></button>
                  <button onClick={() => deleteProduct(p.id)} className="w-8 h-8 rounded-md bg-[#FCE8E9] text-[#C23B57] flex items-center justify-center"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "riwayat" && (
        <div className="max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
          <div className="bg-white border border-[#F0D3DE] rounded-xl p-4 flex items-center justify-between">
            <div><p className="text-xs text-[#9C7885]">Total transaksi hari ini</p><p className="text-lg font-bold font-mono">{rupiah(todayTotal)}</p></div>
            <div className="text-right"><p className="text-xs text-[#9C7885]">Jumlah pesanan</p><p className="text-lg font-bold font-mono">{todayOrders.length}</p></div>
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-[#9C7885] text-center py-10">Belum ada riwayat transaksi.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {orders.map((o) => (
                <div key={o.id} className="bg-white border border-[#F0D3DE] rounded-xl p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-[#9C7885]">{new Date(o.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className="text-xs font-medium bg-[#FBEAF1] px-2 py-0.5 rounded-full">{o.payMethod}</span>
                  </div>
                  <div className="text-xs text-[#9C7885] mb-1">{o.items.map((it) => `${it.name} x${it.qty}`).join(", ")}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#9C7885]">Kasir: {o.staffName || "-"}</span>
                    <span className="text-sm font-mono font-semibold">{rupiah(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "staff" && isAdmin && (
        <div className="max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold">Staff</h2><p className="text-xs text-[#9C7885]">Kelola akun & PIN kasir</p></div>
            <button onClick={() => setStaffModal({ name: "", pin: "", role: "kasir" })}
              className="flex items-center gap-1.5 bg-[#D6336C] text-white text-sm font-medium px-3 py-2 rounded-lg">
              <UserPlus size={15} /> Tambah Staff
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {staff.map((s) => (
              <div key={s.id} className="bg-white border border-[#F0D3DE] rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FBEAF1] flex items-center justify-center"><User size={16} className="text-[#9C7885]" /></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name} {s.id === currentUser.id && <span className="text-[10px] text-[#D6336C]">(kamu)</span>}</div>
                  <div className="text-[10px] text-[#9C7885] uppercase tracking-wide">{s.role}</div>
                </div>
                <button onClick={() => setStaffModal({ ...s, pin: "" })} className="w-8 h-8 rounded-md bg-[#FBEAF1] flex items-center justify-center"><Pencil size={14} /></button>
                <button onClick={() => deleteStaffMember(s.id)} className="w-8 h-8 rounded-md bg-[#FCE8E9] text-[#C23B57] flex items-center justify-center"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "promo" && isAdmin && (
        <div className="max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold">Promo & Diskon</h2><p className="text-xs text-[#9C7885]">Atur diskon khusus untuk produk tertentu</p></div>
            <button onClick={() => setDiscountModal({ name: "", type: "percent", value: "", productIds: [], active: true })}
              className="flex items-center gap-1.5 bg-[#D6336C] text-white text-sm font-medium px-3 py-2 rounded-lg">
              <Plus size={15} /> Tambah Promo
            </button>
          </div>
          {discounts.length === 0 ? (
            <p className="text-sm text-[#9C7885] text-center py-10">Belum ada promo. Buat diskon untuk produk tertentu, misalnya event atau jam happy hour.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {discounts.map((d) => (
                <div key={d.id} className="bg-white border border-[#F0D3DE] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#FBEAF1] flex items-center justify-center shrink-0"><Tag size={16} className="text-[#9C7885]" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-[#9C7885]">
                      {d.type === "percent" ? `${d.value}%` : rupiah(d.value)} · {(d.productIds || []).length} produk · {d.active === false ? "Nonaktif" : "Aktif"}
                    </div>
                  </div>
                  <button onClick={() => toggleDiscountActive(d.id)}
                    className={`px-2.5 py-1.5 rounded-md text-[10px] font-semibold shrink-0 ${d.active === false ? "bg-[#FBEAF1] text-[#9C7885]" : "bg-[#E3F1E9] text-[#4E8B6B]"}`}>
                    {d.active === false ? "Nonaktif" : "Aktif"}
                  </button>
                  <button onClick={() => setDiscountModal({ ...d })} className="w-8 h-8 rounded-md bg-[#FBEAF1] flex items-center justify-center shrink-0"><Pencil size={14} /></button>
                  <button onClick={() => deleteDiscount(d.id)} className="w-8 h-8 rounded-md bg-[#FCE8E9] text-[#C23B57] flex items-center justify-center shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "aktivitas" && isAdmin && (
        <div className="max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
          <div><h2 className="font-semibold">Aktivitas</h2><p className="text-xs text-[#9C7885]">Riwayat aksi semua akun kasir</p></div>
          {activityLog.length === 0 ? (
            <p className="text-sm text-[#9C7885] text-center py-10">Belum ada aktivitas tercatat.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {activityLog.map((a) => (
                <div key={a.id} className="bg-white border border-[#F0D3DE] rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium">{a.staffName}</span>
                    <span className="text-[#9C7885]"> — {actionLabel(a.action)}{a.detail ? `: ${a.detail}` : ""}</span>
                  </div>
                  <span className="text-[#9C7885] shrink-0 ml-2">{new Date(a.timestamp).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">Pembayaran</h3><button onClick={() => setCheckoutOpen(false)}><X size={18} /></button></div>
            <div className="font-mono text-xs space-y-1 mb-3 pb-3 border-b border-dashed border-[#F0D3DE]">
              <div className="flex justify-between text-[#9C7885]"><span>Subtotal</span><span>{rupiah(subtotal)}</span></div>
              {promoDiscountTotal > 0 && (
                <div className="flex justify-between text-[#D6336C]"><span>Diskon promo</span><span>-{rupiah(promoDiscountTotal)}</span></div>
              )}
              <div className="flex justify-between text-sm pt-1"><span className="text-[#9C7885]">Total tagihan</span><span className="font-bold">{rupiah(total)}</span></div>
            </div>
            <label className="text-xs text-[#9C7885] block mb-1">Diskon tambahan (Rp)</label>
            <input type="number" min="0" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="0"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">Metode pembayaran</label>
            <div className="flex gap-2 mb-3">
              {["Tunai", "QRIS", "Kartu"].map((m) => (
                <button key={m} onClick={() => setPayMethod(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border ${payMethod === m ? "bg-[#3D1F2B] text-white border-[#3D1F2B]" : "border-[#F0D3DE] text-[#9C7885]"}`}>{m}</button>
              ))}
            </div>
            {payMethod === "Tunai" && (
              <>
                <label className="text-xs text-[#9C7885] block mb-1">Uang diterima</label>
                <input type="number" min="0" value={cashInput} onChange={(e) => setCashInput(e.target.value)} placeholder="0"
                  className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-[#D6336C]" />
                <div className="flex justify-between text-sm font-mono mb-3">
                  <span className="text-[#9C7885]">Kembalian</span>
                  <span className={change >= 0 && cash >= total ? "text-[#4E8B6B] font-semibold" : "text-[#9C7885]"}>{rupiah(change)}</span>
                </div>
              </>
            )}
            <button onClick={confirmCheckout} disabled={payMethod === "Tunai" && cash < total}
              className="w-full bg-[#D6336C] disabled:bg-[#F3C4D9] disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm flex items-center justify-center gap-2">
              <Check size={16} /> Selesaikan Pesanan
            </button>
          </div>
        </div>
      )}

      {lastReceipt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-xl w-full max-w-xs p-5 font-mono text-xs relative">
            <button onClick={() => setLastReceipt(null)} className="absolute right-3 top-3"><X size={16} /></button>
            <div className="text-center mb-2">
              {settings.logoUrl && (
                <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 object-cover rounded-md mx-auto mb-1" />
              )}
              <p className="font-bold text-sm">{settings.shopName}</p>
              <p className="text-[#9C7885]">{new Date(lastReceipt.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
            <div className="border-t border-dashed border-[#F0D3DE] my-2" />
            {lastReceipt.items.map((it, i) => (
              <div key={i} className="py-0.5">
                <div className="flex justify-between"><span>{it.name} x{it.qty}</span><span>{rupiah(it.price * it.qty)}</span></div>
                {it.discountLabel && (
                  <div className="flex justify-between text-[10px] text-[#D6336C]"><span>↳ {it.discountLabel}</span><span>coret {rupiah(it.originalPrice)}</span></div>
                )}
              </div>
            ))}
            <div className="border-t border-dashed border-[#F0D3DE] my-2" />
            <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(lastReceipt.subtotal)}</span></div>
            {lastReceipt.promoDiscount > 0 && <div className="flex justify-between"><span>Diskon promo</span><span>-{rupiah(lastReceipt.promoDiscount)}</span></div>}
            {lastReceipt.discount > 0 && <div className="flex justify-between"><span>Diskon</span><span>-{rupiah(lastReceipt.discount)}</span></div>}
            {lastReceipt.tax > 0 && <div className="flex justify-between"><span>Pajak</span><span>{rupiah(lastReceipt.tax)}</span></div>}
            <div className="flex justify-between font-bold text-sm mt-1"><span>Total</span><span>{rupiah(lastReceipt.total)}</span></div>
            <div className="flex justify-between mt-1"><span>{lastReceipt.payMethod}</span><span>{rupiah(lastReceipt.cash)}</span></div>
            {lastReceipt.payMethod === "Tunai" && <div className="flex justify-between"><span>Kembali</span><span>{rupiah(lastReceipt.change)}</span></div>}
            <div className="text-center mt-2 text-[#9C7885]">Kasir: {lastReceipt.staffName}</div>
            <div className="text-center mt-1 text-[#9C7885]">Terima kasih!</div>
            <button onClick={() => setLastReceipt(null)} className="w-full mt-3 bg-[#3D1F2B] text-white py-2 rounded-lg font-sans text-xs font-semibold">Tutup</button>
          </div>
        </div>
      )}

      {productModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">{productModal.id ? "Edit Produk" : "Tambah Produk"}</h3><button onClick={() => setProductModal(null)}><X size={18} /></button></div>
            <label className="text-xs text-[#9C7885] block mb-1">Gambar produk</label>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-lg bg-[#FBEAF1] flex items-center justify-center overflow-hidden shrink-0 text-2xl">
                {productModal.image ? (
                  <img src={productModal.image} alt="Preview" className="w-full h-full object-cover" />
                ) : (productModal.icon || "☕")}
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium bg-[#FBEAF1] px-3 py-2 rounded-lg cursor-pointer hover:bg-[#F0D3DE]">
                <ImagePlus size={14} /> {productModal.image ? "Ganti Gambar" : "Unggah Gambar"}
                <input type="file" accept="image/*" className="hidden" onChange={handleProductImageUpload} />
              </label>
              {productModal.image && (
                <button onClick={() => setProductModal((p) => ({ ...p, image: "" }))}
                  className="flex items-center gap-1 text-xs text-[#C23B57]"><ImageOff size={14} /> Hapus</button>
              )}
            </div>
            <label className="text-xs text-[#9C7885] block mb-1">Ikon {productModal.image && <span className="text-[#9C7885]">(dipakai jika gambar dihapus)</span>}</label>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {EMOJIS.map((em) => (
                <button key={em} onClick={() => setProductModal((p) => ({ ...p, icon: em }))}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg border ${productModal.icon === em ? "border-[#D6336C] bg-[#FCE4EE]" : "border-[#F0D3DE]"}`}>{em}</button>
              ))}
            </div>
            <label className="text-xs text-[#9C7885] block mb-1">Nama produk</label>
            <input value={productModal.name} onChange={(e) => setProductModal((p) => ({ ...p, name: e.target.value }))} placeholder="mis. Kopi Susu"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">Harga (Rp)</label>
            <input type="number" min="0" value={productModal.price} onChange={(e) => setProductModal((p) => ({ ...p, price: e.target.value }))} placeholder="0"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">Kategori</label>
            <input value={productModal.category} onChange={(e) => setProductModal((p) => ({ ...p, category: e.target.value }))} placeholder="mis. Minuman, Makanan"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-[#D6336C]" />
            <button onClick={() => saveProduct({ ...productModal, name: productModal.name.trim() || "Produk", price: Number(productModal.price) || 0 })}
              disabled={!productModal.name.trim()} className="w-full bg-[#3D1F2B] disabled:bg-[#EBCCDA] text-white font-semibold py-3 rounded-lg text-sm">
              Simpan Produk
            </button>
          </div>
        </div>
      )}

      {staffModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">{staffModal.id ? "Edit Staff" : "Tambah Staff"}</h3><button onClick={() => setStaffModal(null)}><X size={18} /></button></div>
            <label className="text-xs text-[#9C7885] block mb-1">Nama</label>
            <input value={staffModal.name} onChange={(e) => setStaffModal((s) => ({ ...s, name: e.target.value }))} placeholder="Nama staff"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">PIN (4-6 digit) {staffModal.id && <span className="text-[#9C7885]">— kosongkan jika tidak diubah</span>}</label>
            <input value={staffModal.pin} onChange={(e) => setStaffModal((s) => ({ ...s, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
              type="password" inputMode="numeric" placeholder="••••"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 tracking-widest outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">Peran</label>
            <div className="flex gap-2 mb-4">
              {["kasir", "admin"].map((r) => (
                <button key={r} onClick={() => setStaffModal((s) => ({ ...s, role: r }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize ${staffModal.role === r ? "bg-[#3D1F2B] text-white border-[#3D1F2B]" : "border-[#F0D3DE] text-[#9C7885]"}`}>{r}</button>
              ))}
            </div>
            <button
              onClick={() => {
                if (!staffModal.name.trim()) return;
                if (!staffModal.id && staffModal.pin.length < 4) return;
                saveStaffMember(staffModal);
              }}
              disabled={!staffModal.name.trim() || (!staffModal.id && staffModal.pin.length < 4)}
              className="w-full bg-[#3D1F2B] disabled:bg-[#EBCCDA] text-white font-semibold py-3 rounded-lg text-sm">
              Simpan Staff
            </button>
          </div>
        </div>
      )}

      {discountModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">{discountModal.id ? "Edit Promo" : "Tambah Promo"}</h3><button onClick={() => setDiscountModal(null)}><X size={18} /></button></div>
            <label className="text-xs text-[#9C7885] block mb-1">Nama promo</label>
            <input value={discountModal.name} onChange={(e) => setDiscountModal((d) => ({ ...d, name: e.target.value }))} placeholder="mis. Promo Akhir Pekan"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">Jenis diskon</label>
            <div className="flex gap-2 mb-3">
              {[{ k: "percent", l: "Persen (%)" }, { k: "nominal", l: "Nominal (Rp)" }].map((o) => (
                <button key={o.k} onClick={() => setDiscountModal((d) => ({ ...d, type: o.k }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border ${discountModal.type === o.k ? "bg-[#3D1F2B] text-white border-[#3D1F2B]" : "border-[#F0D3DE] text-[#9C7885]"}`}>{o.l}</button>
              ))}
            </div>
            <label className="text-xs text-[#9C7885] block mb-1">Nilai diskon {discountModal.type === "percent" ? "(%)" : "(Rp)"}</label>
            <input type="number" min="0" value={discountModal.value} onChange={(e) => setDiscountModal((d) => ({ ...d, value: e.target.value }))} placeholder="0"
              className="w-full border border-[#F0D3DE] rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-[#D6336C]" />
            <label className="text-xs text-[#9C7885] block mb-1">Berlaku untuk produk</label>
            <div className="border border-[#F0D3DE] rounded-lg p-2 mb-3 max-h-40 overflow-y-auto flex flex-col gap-0.5">
              {products.length === 0 ? (
                <p className="text-xs text-[#9C7885] p-2">Belum ada produk. Tambahkan produk dulu di tab Produk.</p>
              ) : products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-[#FBEAF1] text-sm cursor-pointer">
                  <input type="checkbox" checked={(discountModal.productIds || []).includes(p.id)}
                    onChange={(e) => setDiscountModal((d) => {
                      const set = new Set(d.productIds || []);
                      if (e.target.checked) set.add(p.id); else set.delete(p.id);
                      return { ...d, productIds: Array.from(set) };
                    })} />
                  <span className="w-5 h-5 rounded overflow-hidden bg-[#FBEAF1] flex items-center justify-center text-xs shrink-0">
                    {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : (p.icon || "☕")}
                  </span>
                  <span className="flex-1 truncate">{p.name}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 mb-4 text-sm cursor-pointer">
              <input type="checkbox" checked={discountModal.active !== false} onChange={(e) => setDiscountModal((d) => ({ ...d, active: e.target.checked }))} />
              Aktifkan promo ini sekarang
            </label>
            <button
              onClick={() => saveDiscount({ ...discountModal, name: discountModal.name.trim() || "Promo", value: Number(discountModal.value) || 0 })}
              disabled={!discountModal.name.trim() || !(discountModal.productIds || []).length || !(Number(discountModal.value) > 0)}
              className="w-full bg-[#3D1F2B] disabled:bg-[#EBCCDA] text-white font-semibold py-3 rounded-lg text-sm">
              Simpan Promo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function actionLabel(action) {
  const map = {
    login: "masuk kasir",
    logout: "keluar kasir",
    tambah_produk: "menambah produk",
    edit_produk: "mengubah produk",
    hapus_produk: "menghapus produk",
    transaksi: "transaksi",
    tambah_staff: "menambah staff",
    edit_staff: "mengubah staff",
    hapus_staff: "menghapus staff",
    tambah_promo: "menambah promo",
    edit_promo: "mengubah promo",
    hapus_promo: "menghapus promo",
  };
  return map[action] || action;
}
