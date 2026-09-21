import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, StopCircle, Wallet, Receipt, Printer, ArrowLeft, Home, ShoppingCart, Plus, Minus, Trash2, Pencil, Search, X, CreditCard } from 'lucide-react';
import { notify } from '../components/NotificationCenter';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { usePointAvailability } from '../hooks/usePointAvailability';
import TurnOpeningModal from '../components/TurnOpeningModal';
import TurnClosingModal from '../components/TurnClosingModal';
import { buildReceiptHtml, printReceipt } from '../utils/receiptTemplates';

const TIPO_CAJA = 2;
const PENDING_POLL_MS = 4000;
// "Tarjeta" es transitorio en la interfaz; el POS informa débito/crédito reales.
const METODO_TARJETA = 5;

const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;
const brutoDe = (vale) => vale.items.reduce((acc, item) => acc + item.subtotal, 0);
let uidSeq = 1;

const draftFromVale = (vale) => vale.items.map(d => ({
  uid: uidSeq++,
  idProducto: d.idProducto,
  nombreProducto: d.nombreProducto,
  cantidad: d.cantidad,
  precioUnitario: d.precioUnitario,
  seleccionesMateriales: (d.seleccionesMateriales || [])
    .filter(s => s.idMateriaPrimaBase != null)
    .map(s => ({ idMateriaPrimaBase: s.idMateriaPrimaBase, idMateriaPrimaSeleccionada: s.idMateriaPrima })),
  idsIngredientesExtra: (d.ingredientesExtra || []).map(x => x.idIngredienteExtra)
}));

const draftToItems = (draft) => draft.map(l => ({
  idProducto: l.idProducto,
  cantidad: l.cantidad,
  seleccionesMateriales: l.seleccionesMateriales,
  idsIngredientesExtra: l.idsIngredientesExtra
}));

const addLine = (list, p) => {
  const idx = list.findIndex(l => l.idProducto === p.idProducto
    && l.seleccionesMateriales.length === 0 && l.idsIngredientesExtra.length === 0);
  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
    return copy;
  }
  return [...list, { uid: uidSeq++, idProducto: p.idProducto, nombreProducto: p.nombreProducto, cantidad: 1, precioUnitario: p.precio, seleccionesMateriales: [], idsIngredientesExtra: [] }];
};

const CashRegister = () => {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const {
    branding, hasLogo, getLogoUrl, turnsRequireReconciliation,
    receiptShowSeller, receiptShowPayment, receiptCustomFooter
  } = useOrganization();
  useDocumentTitle('Caja');
  const pointAvailability = usePointAvailability();

  const [cajaTurn, setCajaTurn] = useState(null);
  const [pending, setPending] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'new'
  const [draft, setDraft] = useState([]);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  // Pago (igual que Ventas): métodos activos, pago dividido, montos y efectivo recibido.
  const [activeMethods, setActiveMethods] = useState([1]);
  const [isSplit, setIsSplit] = useState(false);
  const [allocations, setAllocations] = useState({ 1: '', 4: '', [METODO_TARJETA]: '' });
  const [recibido, setRecibido] = useState('');
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [directBusy, setDirectBusy] = useState(false);
  // Cobro con tarjeta en la terminal (Point): { idVenta, idOrden, estado, mensaje, ... }
  const [pointPay, setPointPay] = useState(null);
  const [cancelandoPoint, setCancelandoPoint] = useState(false);

  const maxDescuento = Number(user?.maxDiscountPercent || 0);
  const puedeCobrar = can('caja.cobrar');
  const puedeModificar = can('caja.venta.modificar');
  const puedeAbrir = can('caja.turno.abrir');
  const puedeCerrar = can('caja.turno.cerrar');
  const requiereEfectivoRecibido = can('caja.pago.efectivo.ingresar');

  const cajaAbierta = Boolean(cajaTurn);
  const selected = useMemo(() => pending.find(v => v.idVenta === selectedId) || null, [pending, selectedId]);
  const editing = mode === 'edit' || mode === 'new';

  const loadPending = useCallback(async () => {
    try {
      const res = await fetch('/api/cash-register/pending');
      if (!res.ok) return;
      const data = await res.json();
      setPending(Array.isArray(data) ? data : []);
    } catch { /* reintenta en el próximo ciclo */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const turnRes = await fetch(`/api/turn/active?tipo=${TIPO_CAJA}`).then(r => r.json());
      setCajaTurn(turnRes.hasActiveTurn && turnRes.belongsToCurrentUser ? turnRes.activeTurn : null);
      await loadPending();
    } catch {
      setCajaTurn(null);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [loadPending]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!cajaAbierta || !puedeModificar) return;
    fetch('/api/product')
      .then(r => r.ok ? r.json() : [])
      .then(data => setCatalog((Array.isArray(data) ? data : []).filter(p => p.activo)))
      .catch(() => setCatalog([]));
  }, [cajaAbierta, puedeModificar]);

  const cajaTurnRef = useRef(cajaAbierta);
  cajaTurnRef.current = cajaAbierta;
  useEffect(() => {
    if (!cajaAbierta) return undefined;
    const timer = setInterval(() => { if (cajaTurnRef.current) loadPending(); }, PENDING_POLL_MS);
    return () => clearInterval(timer);
  }, [cajaAbierta, loadPending]);

  const total = useMemo(() => {
    if (!selected) return 0;
    const bruto = brutoDe(selected);
    const pct = Math.min(Math.max(Number(descuentoPct) || 0, 0), maxDescuento);
    return bruto - Math.round(bruto * pct / 100);
  }, [selected, descuentoPct, maxDescuento]);

  const draftTotal = useMemo(() => draft.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0), [draft]);
  const catalogFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(p => !q || p.nombreProducto.toLowerCase().includes(q)).slice(0, 40);
  }, [catalog, query]);

  // Monto por método según el modo (único = total al método activo; dividido = lo asignado).
  const montoDe = (id) => {
    if (!isSplit) return activeMethods[0] === id ? total : 0;
    return parseInt(allocations[id]) || 0;
  };
  const efectivoMonto = montoDe(1);
  const tarjetaMonto = montoDe(METODO_TARJETA);
  const sumAsignado = [1, 4, METODO_TARJETA].reduce((acc, id) => acc + montoDe(id), 0);
  const vuelto = Math.max(0, (parseInt(recibido) || 0) - efectivoMonto);

  const resetPago = () => {
    setActiveMethods([1]);
    setIsSplit(false);
    setAllocations({ 1: '', 4: '', [METODO_TARJETA]: '' });
    setRecibido('');
    setDescuentoPct(0);
  };

  const selectVale = (idVenta) => {
    setSelectedId(idVenta);
    setMode('view');
    resetPago();
  };

  const toggleMethod = (id) => {
    if (!isSplit) { setActiveMethods([id]); if (id !== 1) setRecibido(''); return; }
    setActiveMethods(prev => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const toggleSplit = () => {
    setIsSplit(prev => {
      const next = !prev;
      if (next) { setAllocations({ 1: '', 4: '', [METODO_TARJETA]: '' }); }
      else { setActiveMethods([1]); setRecibido(''); }
      return next;
    });
  };

  const startEdit = () => {
    if (!selected) return;
    setDraft(draftFromVale(selected));
    setPicker(false); setQuery(''); setMode('edit');
  };
  const startNew = () => {
    setSelectedId(null); setDraft([]); setPicker(true); setQuery(''); setMode('new'); resetPago();
  };
  const cancelEdit = () => {
    if (mode === 'new') setSelectedId(null);
    setMode('view'); setDraft([]); setPicker(false);
  };

  const addProduct = (p) => setDraft(prev => addLine(prev, p));
  const changeQty = (uid, delta) => setDraft(prev => prev.map(l => l.uid === uid ? { ...l, cantidad: Math.max(1, l.cantidad + delta) } : l));
  const removeLine = (uid) => setDraft(prev => prev.filter(l => l.uid !== uid));

  const handleScan = (code) => {
    const normalized = code.trim();
    const ticket = /^VTA(\d+)$/i.exec(normalized);
    if (ticket) {
      const idVenta = parseInt(ticket[1], 10);
      if (pending.some(v => v.idVenta === idVenta)) selectVale(idVenta);
      else notify.warning(`El vale #${idVenta} no está pendiente de cobro.`);
      return;
    }
    if (!puedeModificar) { notify.warning('No tiene permiso para agregar productos.'); return; }
    const prod = catalog.find(p => p.activo && (p.codigoProducto || '').trim() === normalized);
    if (!prod) { notify.warning(`Código no reconocido: ${normalized}`); return; }
    if (mode === 'edit' || mode === 'new') setDraft(prev => addLine(prev, prod));
    else if (selected) { setDraft(addLine(draftFromVale(selected), prod)); setPicker(false); setMode('edit'); }
    else { setDraft(addLine([], prod)); setSelectedId(null); setPicker(false); setMode('new'); }
  };
  useBarcodeScanner(handleScan, { enabled: cajaAbierta && (puedeCobrar || puedeModificar) });

  const saveEdit = async () => {
    if (submitting || draft.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cash-register/${selectedId}/items`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draftToItems(draft) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible modificar el vale.');
      notify.success('Vale actualizado.');
      await loadPending();
      setMode('view'); setPicker(false); resetPago();
    } catch (err) { notify.error(err.message); } finally { setSubmitting(false); }
  };

  const createSale = async () => {
    if (submitting || draft.length === 0 || !cajaTurn) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/cash-register/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draftToItems(draft) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible crear la venta.');
      notify.success('Venta creada. Ya puedes cobrarla.');
      await loadPending();
      selectVale(data.idVenta);
    } catch (err) { notify.error(err.message); } finally { setSubmitting(false); }
  };

  const openDirect = async () => {
    if (directBusy) return;
    setDirectBusy(true);
    try {
      const res = await fetch('/api/turn/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario, tipoTurno: TIPO_CAJA, desglose: [] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible abrir el turno de caja.');
      notify.success('Turno de caja iniciado.');
      await refresh();
    } catch (err) { notify.error(err.message); } finally { setDirectBusy(false); }
  };

  const closeDirect = async () => {
    if (directBusy || !cajaTurn) return;
    setDirectBusy(true);
    try {
      const res = await fetch('/api/turn/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idTurno: cajaTurn.idTurno, desgloseEfectivo: [], desgloseOtrosMetodos: [] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible cerrar el turno de caja.');
      notify.success('Turno de caja cerrado.');
      setSelectedId(null);
      await refresh();
    } catch (err) { notify.error(err.message); } finally { setDirectBusy(false); }
  };

  const printBoleta = (vale, totalCobrado, pagos, recibidoValor) => {
    const items = vale.items.map(d => ({
      nombreProducto: d.nombreProducto,
      quantity: d.cantidad,
      normalPrice: d.precioNormal || d.precioUnitario,
      finalPrice: d.precioUnitario,
      materialSelections: (d.seleccionesMateriales || []).map(s => ({ nombreMateriaPrima: s.nombreMateriaPrima, recargo: s.recargo })),
      extras: (d.ingredientesExtra || []).map(x => ({ nombre: x.nombre, precio: x.precio }))
    }));
    const subtotalBruto = items.reduce((acc, item) => acc + item.normalPrice * item.quantity, 0);
    const nombres = { 1: 'Efectivo', 2: 'Débito', 3: 'Crédito', 4: 'Transferencia' };
    const payments = pagos.map(p => ({ name: nombres[p.idMetodoPago] || 'Pago', amount: p.monto, isCash: p.idMetodoPago === 1 }));
    const html = buildReceiptHtml({
      mode: 'boleta',
      commercialName: branding.nombreComercial,
      logoUrl: hasLogo('boletas') ? `${window.location.origin}${getLogoUrl('boletas')}` : null,
      data: {
        idVenta: vale.idVenta, fecha: new Date().toLocaleString('es-CL'), barista: vale.vendedor,
        items, subtotal: subtotalBruto, total: totalCobrado, payments, cashReceived: recibidoValor
      },
      options: {
        showSeller: receiptShowSeller, showPayment: receiptShowPayment, customFooter: receiptCustomFooter,
        defaultFooter: branding.textoPieDocumentos || 'Gracias por su preferencia.',
        contacto: branding.contactoPublico || null, includeComanda: false
      }
    });
    setTimeout(() => printReceipt(html), 200);
  };

  const pctDescuento = () => Math.min(Math.max(Number(descuentoPct) || 0, 0), maxDescuento);

  // Cobra el vale con los métodos indicados; imprime la boleta y limpia.
  const finalizarCobro = async (valeCobrado, pagos, recibidoValor) => {
    const res = await fetch(`/api/cash-register/${valeCobrado.idVenta}/collect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ porcentajeDescuento: pctDescuento(), metodosPago: pagos })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || 'No fue posible cobrar el vale.');
    notify.success('Venta cobrada. Imprimiendo boleta...');
    printBoleta(valeCobrado, data.montoTotal, pagos, recibidoValor);
    setSelectedId(null);
    setPending(prev => prev.filter(v => v.idVenta !== valeCobrado.idVenta));
    resetPago();
    loadPending();
  };

  const handleCollect = async () => {
    if (!selected || submitting || pointPay) return;
    if (sumAsignado !== total) {
      notify.error(`La suma de los pagos (${money(sumAsignado)}) debe ser igual al total (${money(total)}).`);
      return;
    }
    if ([1, 4, METODO_TARJETA].every(id => montoDe(id) === 0)) { notify.error('Indica el método de pago.'); return; }
    if (tarjetaMonto > 0 && !pointAvailability.available) {
      notify.error(pointAvailability.message || 'El cobro con tarjeta no está configurado.');
      return;
    }
    // Si el rol exige registrar el efectivo recibido, se valida contra el monto en efectivo.
    if (efectivoMonto > 0 && requiereEfectivoRecibido && (parseInt(recibido) || 0) < efectivoMonto) {
      notify.error(`Debes ingresar el efectivo recibido (≥ ${money(efectivoMonto)}).`);
      return;
    }

    // Con tarjeta, el cobro pasa por la terminal (Point); el vale se cierra al aprobarse.
    if (tarjetaMonto > 0) {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/cash-register/${selected.idVenta}/point/start`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ montoTarjeta: tarjetaMonto, porcentajeDescuento: pctDescuento() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || 'No fue posible enviar el cobro a la terminal.');
        const otros = [1, 4].map(id => ({ idMetodoPago: id, monto: montoDe(id) })).filter(p => p.monto > 0);
        setPointPay({
          idVenta: selected.idVenta, idOrden: data.idOrden, estado: 'esperando', mensaje: '',
          montoTarjeta: tarjetaMonto, otros, recibido: efectivoMonto > 0 ? recibido : null, vale: selected
        });
      } catch (err) { notify.error(err.message); } finally { setSubmitting(false); }
      return;
    }

    // Solo efectivo/transferencia: cobro directo.
    const pagos = [1, 4].map(id => ({ idMetodoPago: id, monto: montoDe(id) })).filter(p => p.monto > 0);
    setSubmitting(true);
    const valeCobrado = selected;
    const recibidoActual = efectivoMonto > 0 ? recibido : null;
    try {
      await finalizarCobro(valeCobrado, pagos, recibidoActual);
    } catch (err) { notify.error(err.message); } finally { setSubmitting(false); }
  };

  // Sondeo del cobro con tarjeta en la terminal.
  useEffect(() => {
    if (pointPay?.estado !== 'esperando') return undefined;
    let activo = true;
    const consultar = async () => {
      try {
        const res = await fetch(`/api/cash-register/point/${pointPay.idVenta}/sync`, { method: 'POST' });
        const data = await res.json();
        if (!activo || !res.ok) return;
        if (data.estadoOrden === 'processed' && data.idMetodoPago) {
          activo = false;
          const pagos = [...pointPay.otros, { idMetodoPago: data.idMetodoPago, monto: pointPay.montoTarjeta }];
          try {
            await finalizarCobro(pointPay.vale, pagos, pointPay.recibido);
            setPointPay(null);
          } catch (err) {
            // La tarjeta se cobró pero falló el cierre del vale: se puede reintentar.
            setPointPay(prev => prev ? { ...prev, estado: 'error_cobro', mensaje: err.message, idMetodoTarjeta: data.idMetodoPago } : prev);
          }
        } else if (['canceled', 'failed', 'expired'].includes(data.estadoOrden)) {
          setPointPay(prev => prev ? { ...prev, estado: 'rechazado', mensaje: describirRechazo(data.estadoOrden) } : prev);
        }
      } catch { /* corte puntual: reintenta */ }
    };
    consultar();
    const timer = setInterval(consultar, 3000);
    return () => { activo = false; clearInterval(timer); };
  }, [pointPay?.idVenta, pointPay?.estado]);

  const cancelarPoint = async () => {
    if (!pointPay || cancelandoPoint) return;
    setCancelandoPoint(true);
    try {
      const res = await fetch(`/api/cash-register/point/${pointPay.idVenta}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('No fue posible cancelar el cobro desde la caja. Cancélalo en la terminal.');
      setPointPay(prev => prev ? { ...prev, estado: 'rechazado', mensaje: 'El cobro fue cancelado.' } : prev);
    } catch (err) { notify.error(err.message); }
    finally { setCancelandoPoint(false); }
  };

  const reintentarCierre = async () => {
    if (!pointPay) return;
    const pagos = [...pointPay.otros, { idMetodoPago: pointPay.idMetodoTarjeta || 2, monto: pointPay.montoTarjeta }];
    try { await finalizarCobro(pointPay.vale, pagos, pointPay.recibido); setPointPay(null); }
    catch (err) { notify.error(err.message); }
  };

  const describirRechazo = (estado) => estado === 'canceled' ? 'El cobro fue cancelado en la terminal.'
    : estado === 'expired' ? 'El cobro expiró sin completarse.' : 'La terminal rechazó el pago.';

  const headerStatus = cajaAbierta
    ? { text: `Turno de caja #${cajaTurn.idTurno}`, bg: 'rgba(255,255,255,0.18)' }
    : { text: 'Sin turno de caja', bg: 'rgba(255,255,255,0.10)' };

  // ---- Columna 2: carrito (vista o edición) ----
  const renderPicker = () => (
    <div style={{ borderTop: '1px solid var(--panel-border)', padding: '12px 16px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Search size={15} color="var(--text-muted)" />
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto…"
          style={{ flex: 1, padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
        <button type="button" onClick={() => setPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {catalogFiltered.length === 0 ? <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px' }}>Sin coincidencias.</span>
          : catalogFiltered.map(p => (
            <button key={p.idProducto} type="button" onClick={() => addProduct(p)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--panel-border)', background: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}>
              <span>{p.nombreProducto}</span>
              <span style={{ color: 'var(--primary-color)', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(p.precio)}</span>
            </button>
          ))}
      </div>
    </div>
  );

  const renderEditor = () => (
    <>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{mode === 'new' ? 'Nueva venta' : `Editar vale #${selectedId}`}</h3>
        <button type="button" onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {draft.length === 0 ? <div style={{ padding: '30px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Agrega productos.</div>
          : draft.map(l => (
            <div key={l.uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{l.nombreProducto}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{money(l.precioUnitario)} c/u</div>
              </div>
              <button type="button" onClick={() => changeQty(l.uid, -1)} style={qtyBtn}><Minus size={14} /></button>
              <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: 700 }}>{l.cantidad}</span>
              <button type="button" onClick={() => changeQty(l.uid, 1)} style={qtyBtn}><Plus size={14} /></button>
              <button type="button" onClick={() => removeLine(l.uid)} style={{ ...qtyBtn, borderColor: '#fca5a5', color: '#dc2626' }}><Trash2 size={14} /></button>
            </div>
          ))}
      </div>
      {picker ? renderPicker() : (
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--panel-border)' }}>
          <button type="button" onClick={() => { setPicker(true); setQuery(''); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px', border: '1.5px dashed var(--primary-color)', background: '#fff', color: 'var(--primary-color)', fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Agregar producto
          </button>
        </div>
      )}
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--panel-border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 800 }}>
          <span>Total aprox.:</span><span style={{ color: 'var(--primary-color)' }}>{money(draftTotal)}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={cancelEdit} style={{ padding: '11px 16px', borderRadius: '8px', border: '1.5px solid var(--panel-border)', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" disabled={submitting || draft.length === 0} onClick={mode === 'new' ? createSale : saveEdit}
            style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: (submitting || draft.length === 0) ? 0.6 : 1 }}>
            {submitting ? 'Guardando…' : (mode === 'new' ? 'Crear venta' : 'Guardar cambios')}
          </button>
        </div>
      </div>
    </>
  );

  const renderCarritoView = () => (
    <>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Vale #{selected.idVenta}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Atendió: {selected.vendedor}</span>
        </div>
        {puedeModificar && (
          <button type="button" onClick={startEdit} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 11px', borderRadius: '8px', border: '1.5px solid var(--panel-border)', background: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
            <Pencil size={14} /> Editar
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
        {selected.items.map((d, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.92rem' }}>
            <span><strong>{d.cantidad}×</strong> {d.nombreProducto}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{money(d.subtotal)}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--panel-border)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 800 }}>
        <span>Subtotal:</span><span>{money(brutoDe(selected))}</span>
      </div>
    </>
  );

  // ---- Columna 3: cobro (métodos de pago iguales a Ventas) ----
  const metodoBtn = (id, label, disabled) => {
    const activo = activeMethods.includes(id);
    return (
      <button key={id} type="button" disabled={disabled} onClick={() => toggleMethod(id)}
        title={disabled ? 'Disponible al configurar Máquinas POS' : undefined}
        style={{
          flex: '1 1 auto', padding: '11px 6px', borderRadius: '8px', fontWeight: 700, fontSize: '0.84rem',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
          border: `1.5px solid ${activo ? 'var(--primary-color)' : 'var(--panel-border)'}`,
          background: activo ? 'var(--primary-color)' : '#fff', color: activo ? '#fff' : 'var(--text-main)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
        }}>
        {id === METODO_TARJETA && <CreditCard size={15} />}{label}
      </button>
    );
  };

  const renderPago = () => (
    <>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--panel-border)' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Cobro</h3>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {maxDescuento > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem' }}>Descuento (máx. {maxDescuento}%):</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="number" min="0" max={maxDescuento} step="0.01" value={descuentoPct}
                onChange={e => setDescuentoPct(Math.min(Math.max(Number(e.target.value) || 0, 0), maxDescuento))}
                style={{ width: '76px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right' }} />
              <span style={{ fontWeight: 700 }}>%</span>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <span>Subtotal:</span><span>{money(brutoDe(selected))}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-color)' }}>
          <span>TOTAL:</span><span>{money(total)}</span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={isSplit} onChange={toggleSplit} /> Pago dividido
        </label>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {metodoBtn(1, 'Efectivo', false)}
          {metodoBtn(4, 'Transferencia', false)}
          {metodoBtn(METODO_TARJETA, 'Tarjeta', pointAvailability.loading || !pointAvailability.available)}
        </div>

        {!pointAvailability.loading && !pointAvailability.available && (
          <div style={{ fontSize: '.78rem', color: '#b45309', lineHeight: 1.4 }}>
            Tarjeta no disponible: {pointAvailability.message || 'configura una máquina POS activa.'}
          </div>
        )}

        {isSplit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[[1, 'Efectivo'], [4, 'Transferencia'], [METODO_TARJETA, 'Tarjeta']].filter(([id]) => activeMethods.includes(id)).map(([id, label]) => (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.86rem' }}>{label}:</span>
                <input type="number" min="0" value={allocations[id]} onChange={e => setAllocations(a => ({ ...a, [id]: e.target.value }))}
                  style={{ width: '120px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right' }} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: sumAsignado === total ? '#137333' : '#b45309' }}>
              <span>Asignado:</span><span>{money(sumAsignado)} / {money(total)}</span>
            </div>
          </div>
        ) : null}

        {efectivoMonto > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.9rem' }}>Recibido{requiereEfectivoRecibido ? ' *' : ''}:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="number" min="0" value={recibido} onChange={e => setRecibido(e.target.value)}
                style={{ width: '120px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right' }} />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Vuelto: <strong>{money(vuelto)}</strong></span>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--panel-border)', background: '#f8fafc' }}>
        <button type="button" disabled={submitting || !puedeCobrar} onClick={handleCollect}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '1rem', cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !puedeCobrar) ? 0.6 : 1 }}>
          <Printer size={18} /> {submitting ? 'Cobrando…' : `Cobrar e imprimir (${money(total)})`}
        </button>
      </div>
    </>
  );

  const columna = { background: '#fff', border: '1px solid var(--panel-border)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', color: 'var(--text-main)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header className="pos-header" style={{ height: '96px', backgroundColor: 'var(--primary-color)', boxShadow: '0 4px 16px rgba(var(--primary-rgb), 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', color: '#fff', position: 'sticky', top: 0, zIndex: 90, boxSizing: 'border-box' }}>
        <button type="button" onClick={() => navigate('/welcome')} title="Volver al inicio" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
          <ArrowLeft size={18} /><Home size={18} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <BrandLogo location="punto_venta" maxHeight={54} compact light />
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.9 }}>
            <Wallet size={13} /> Caja
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ padding: '5px 12px', borderRadius: '30px', fontSize: '0.78rem', fontWeight: 700, background: headerStatus.bg, whiteSpace: 'nowrap' }}>{headerStatus.text}</span>
          {!cajaAbierta && puedeAbrir && (
            <button type="button" disabled={directBusy} onClick={() => turnsRequireReconciliation ? setShowOpening(true) : openDirect()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: 'var(--primary-color)', border: 'none', padding: '9px 14px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
              <PlayCircle size={17} /> Abrir turno
            </button>
          )}
          {cajaAbierta && puedeCerrar && (
            <button type="button" disabled={directBusy} onClick={() => turnsRequireReconciliation ? setShowClosing(true) : closeDirect()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '9px 14px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
              <StopCircle size={17} /> Cerrar turno
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : !cajaAbierta ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
          <Wallet size={46} style={{ opacity: 0.35 }} />
          <div style={{ maxWidth: '420px' }}>Abre un turno de caja para cobrar los vales que generan los vendedores.</div>
          {puedeAbrir && (
            <button type="button" className="btn btn-primary" disabled={directBusy} onClick={() => turnsRequireReconciliation ? setShowOpening(true) : openDirect()}>
              <PlayCircle size={18} /> Abrir turno de caja
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', gap: '14px', padding: '14px', overflow: 'hidden' }}>
          {/* COLUMNA 1: ventas sin cobrar */}
          <div style={{ ...columna, flex: '0.85 1 0', minWidth: '230px' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={18} color="var(--primary-color)" />
                <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>Sin cobrar</h2>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: 'auto' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} /> {pending.length}
                </span>
              </div>
              {puedeModificar && (
                <button type="button" onClick={startNew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={16} /> Nueva venta
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pending.length === 0 ? (
                <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>Sin vales pendientes.</div>
              ) : pending.map(vale => {
                const activo = vale.idVenta === selectedId;
                return (
                  <button key={vale.idVenta} type="button" onClick={() => selectVale(vale.idVenta)} disabled={!puedeCobrar}
                    style={{ textAlign: 'left', cursor: puedeCobrar ? 'pointer' : 'not-allowed', borderRadius: '12px', padding: '12px', background: activo ? 'rgba(var(--primary-rgb), 0.06)' : '#fff', border: `2px solid ${activo ? 'var(--primary-color)' : 'var(--panel-border)'}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Vale #{vale.idVenta}</strong>
                      <span style={{ fontWeight: 800, color: 'var(--primary-color)' }}>{money(brutoDe(vale))}</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>{vale.vendedor}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {new Date(vale.fechaVenta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {vale.items.length} {vale.items.length === 1 ? 'ítem' : 'ítems'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* COLUMNA 2: carrito */}
          <div style={{ ...columna, flex: '1.25 1 0', minWidth: '300px' }}>
            {editing ? renderEditor()
              : selected ? renderCarritoView()
              : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
                  <ShoppingCart size={38} style={{ opacity: 0.3 }} />
                  <span>Selecciona un vale{puedeModificar ? ' o crea una venta nueva' : ''}.</span>
                </div>
              )}
          </div>

          {/* COLUMNA 3: cobro */}
          <div style={{ ...columna, flex: '1.15 1 0', minWidth: '300px' }}>
            {selected && !editing ? renderPago()
              : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
                  <Wallet size={38} style={{ opacity: 0.3 }} />
                  <span>{editing ? 'Guarda los cambios para cobrar.' : 'El cobro aparecerá aquí al elegir un vale.'}</span>
                </div>
              )}
          </div>
        </div>
      )}

      {pointPay && (
        <div role="dialog" aria-modal="true" aria-labelledby="point-payment-title"
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ width: 'min(430px, 100%)', padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
            <div style={{ width: 58, height: 58, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pointPay.estado === 'esperando' ? 'rgba(var(--primary-rgb), 0.1)' : pointPay.estado === 'error_cobro' ? '#fef3c7' : '#fee2e2' }}>
              <CreditCard size={30} color={pointPay.estado === 'esperando' ? 'var(--primary-color)' : pointPay.estado === 'error_cobro' ? '#b45309' : '#dc2626'} />
            </div>
            <div>
              <h3 id="point-payment-title" style={{ margin: '0 0 8px' }}>
                {pointPay.estado === 'esperando' ? 'Esperando pago en la terminal' : pointPay.estado === 'error_cobro' ? 'Pago aprobado, cierre pendiente' : 'Pago no completado'}
              </h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {pointPay.estado === 'esperando'
                  ? `Completa el cobro de ${money(pointPay.montoTarjeta)} en la máquina POS.`
                  : pointPay.mensaje}
              </p>
            </div>
            {pointPay.estado === 'esperando' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-color)', fontSize: '.86rem', fontWeight: 700 }}>
                <span className="spinner" aria-hidden="true" /> Consultando el estado del pago…
              </div>
            )}
            <div style={{ width: '100%', display: 'flex', gap: 10, justifyContent: 'center' }}>
              {pointPay.estado === 'esperando' && (
                <button type="button" className="btn btn-danger" disabled={cancelandoPoint} onClick={cancelarPoint}>
                  {cancelandoPoint ? 'Cancelando…' : 'Cancelar cobro'}
                </button>
              )}
              {pointPay.estado === 'error_cobro' && (
                <button type="button" className="btn btn-primary" onClick={reintentarCierre}>Reintentar cierre del vale</button>
              )}
              {pointPay.estado === 'rechazado' && (
                <button type="button" className="btn btn-primary" onClick={() => setPointPay(null)}>Volver a intentar</button>
              )}
            </div>
          </div>
        </div>
      )}

      <TurnOpeningModal open={showOpening} tipoTurno={TIPO_CAJA} title="Abrir turno de caja" onClose={() => setShowOpening(false)} onOpened={refresh} />
      <TurnClosingModal open={showClosing} turn={cajaTurn} onClose={() => setShowClosing(false)} onClosed={() => { setSelectedId(null); refresh(); }} />
    </div>
  );
};

const qtyBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1.5px solid var(--panel-border)', background: '#fff', cursor: 'pointer', flexShrink: 0 };

export default CashRegister;
