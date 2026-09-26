import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Receipt, Printer, ArrowLeft, Home, ShoppingCart, Plus, Minus, Trash2, Search, X, CreditCard, History, RefreshCw, Coffee, Package, Check, Ban, BookOpen } from 'lucide-react';
import { notify, confirmDialog } from '../components/NotificationCenter';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { usePointAvailability } from '../hooks/usePointAvailability';
import { buildReceiptHtml, buildReturnableVoucherHtml, printReceipt } from '../utils/receiptTemplates';
import { tryPrintBoletaDte } from '../utils/dteBoleta';
import PromotionSelector from '../components/PromotionSelector';
import DteCheckoutFields from '../components/DteCheckoutFields';
import ClienteSelect from '../components/ClienteSelect';
import Spinner from '../components/Spinner';
import { productImageUrl } from '../utils/productImage';
import { sortPosProducts } from '../utils/posOrdering';
import { EMPTY_INVOICE_RECIPIENT, isInvoiceDocument, isInvoiceRecipientComplete } from '../utils/dteDocuments';

const PENDING_POLL_MS = 4000;
// "Tarjeta" es transitorio en la interfaz; el POS informa débito/crédito reales.
const METODO_TARJETA = 5;

const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

// Denominaciones de peso chileno para sumar el efectivo recibido con un toque (sin teclear).
const DENOMINACIONES_CLP = [20000, 10000, 5000, 2000, 1000, 500, 100];
// Montos "redondos" sugeridos por encima del total en efectivo (vueltos típicos).
const sugerenciasEfectivo = (monto) => {
  const pasos = [1000, 2000, 5000, 10000, 20000];
  const arriba = pasos.map(paso => Math.ceil(monto / paso) * paso).filter(valor => valor > monto);
  return [...new Set(arriba)].sort((a, b) => a - b).slice(0, 4);
};
// Denominaciones (sumar): fondo tintado para diferenciarlas de los montos rápidos (fijar).
const denomBtnStyle = { padding: '12px 4px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#eef2f7', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-main)' };
// Monto rápido: el verde/primario aparece solo cuando ese monto es el recibido actual (seleccionado).
const quickBtnStyle = (selected) => ({
  flex: '1 1 auto', padding: '10px 8px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.85rem',
  border: `1.5px solid ${selected ? 'var(--primary-color)' : 'var(--panel-border)'}`,
  background: selected ? 'rgba(var(--primary-rgb), .07)' : '#fff',
  color: selected ? 'var(--primary-color)' : 'var(--text-main)', fontWeight: selected ? 800 : 700
});
const cashSectionLabel = { fontSize: '.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' };
const brutoDe = (vale) => Number(vale?.montoTotal || 0);
let uidSeq = 1;

const draftFromVale = (vale) => vale.items.map(d => ({
  uid: uidSeq++,
  idProducto: d.idProducto,
  nombreProducto: d.nombreProducto,
  cantidad: d.cantidad,
  envasesRecibidos: d.envasesRecibidos || 0,
  precioUnitario: d.precioUnitario,
  precioEnvase: d.precioEnvase || 0,
  seleccionesMateriales: (d.seleccionesMateriales || [])
    .filter(s => s.idMateriaPrimaBase != null)
    .map(s => ({ idMateriaPrimaBase: s.idMateriaPrimaBase, idMateriaPrimaSeleccionada: s.idMateriaPrima })),
  idsIngredientesExtra: (d.ingredientesExtra || []).map(x => x.idIngredienteExtra)
}));

const draftToItems = (draft) => draft.map(l => ({
  idProducto: l.idProducto,
  cantidad: l.cantidad,
  envasesRecibidos: l.envasesRecibidos || 0,
  seleccionesMateriales: l.seleccionesMateriales,
  idsIngredientesExtra: l.idsIngredientesExtra
}));

// Agrega una unidad del producto. `envaseTraido`:
//   null  -> producto no retornable (no aplica envase)
//   true  -> el cliente trajo el envase (suma a envasesRecibidos, no se cobra depósito)
//   false -> no lo trajo (se cobra el depósito de esa unidad)
// `precioEnvase` es el depósito resuelto (solo para el total optimista; el servidor recalcula).
const addLine = (list, p, envaseTraido = null, precioEnvase = 0) => {
  const idx = list.findIndex(l => l.idProducto === p.idProducto
    && l.seleccionesMateriales.length === 0 && l.idsIngredientesExtra.length === 0);
  const recibidoInc = envaseTraido === true ? 1 : 0;
  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = {
      ...copy[idx],
      cantidad: copy[idx].cantidad + 1,
      envasesRecibidos: (copy[idx].envasesRecibidos || 0) + recibidoInc,
      precioEnvase: precioEnvase || copy[idx].precioEnvase || 0
    };
    return copy;
  }
  return [...list, { uid: uidSeq++, idProducto: p.idProducto, nombreProducto: p.nombreProducto, cantidad: 1, envasesRecibidos: recibidoInc, precioUnitario: p.precio, precioEnvase: precioEnvase || 0, seleccionesMateriales: [], idsIngredientesExtra: [] }];
};

const promotionProducts = item => {
  const products = new Map();
  const add = (product, quantity) => {
    if (!product) return;
    const current = products.get(product.idProducto);
    products.set(product.idProducto, {
      idProducto: product.idProducto,
      nombreProducto: product.nombreProducto,
      cantidad: (current?.cantidad || 0) + quantity
    });
  };
  (item.promotion.grupos || []).filter(group => group.esBase).flatMap(group => group.productos || [])
    .forEach(product => add(product, product.cantidad || 1));
  (item.selections || []).forEach(selection => {
    const group = (item.promotion.grupos || []).find(candidate => candidate.idGrupo === selection.idGrupo);
    const product = group?.productos?.find(candidate => candidate.idProducto === selection.idProducto);
    add(product, (selection.cantidad || 1) * (product?.cantidad || 1));
  });
  return [...products.values()];
};

const CashRegister = () => {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const {
    branding, hasLogo, getLogoUrl, cajaShowCashButtons,
    receiptShowSeller, receiptShowPayment, receiptCustomFooter,
    posGroupByCategory, posSortField, posSortDirection, posShowCategories, posAllowSaleWithoutStock
  } = useOrganization();
  useDocumentTitle('Caja');
  const pointAvailability = usePointAvailability();

  const [cajaTurn, setCajaTurn] = useState(null);
  const [pending, setPending] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [promotions, setPromotions] = useState([]);
  // Productos retornables (id -> { precioEnvase, medioPago }) para preguntar por el envase al agregar.
  const [returnableMap, setReturnableMap] = useState(() => new Map());
  // Modal de envase: { product, resolve }. resolve(true)=trajo, resolve(false)=no trajo, resolve(null)=cancela.
  const [envasePrompt, setEnvasePrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'new'
  const [draft, setDraft] = useState([]);
  const [promoDraft, setPromoDraft] = useState([]);
  const [picker, setPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState('products');
  const [query, setQuery] = useState('');
  // Pago (igual que Ventas): métodos activos, pago dividido, montos y efectivo recibido.
  const [activeMethods, setActiveMethods] = useState([1]);
  const [isSplit, setIsSplit] = useState(false);
  const [allocations, setAllocations] = useState({ 1: '', 4: '', [METODO_TARJETA]: '' });
  const [recibido, setRecibido] = useState('');
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [tipoDocumento, setTipoDocumento] = useState('boleta');
  const [receptorFactura, setReceptorFactura] = useState({ ...EMPTY_INVOICE_RECIPIENT });
  const [idClienteVenta, setIdClienteVenta] = useState(null);
  const esFacturaSeleccionada = isInvoiceDocument(tipoDocumento);
  const [submitting, setSubmitting] = useState(false);
  // Cobro con tarjeta en la terminal (Point): { idVenta, idOrden, estado, mensaje, ... }
  const [pointPay, setPointPay] = useState(null);
  const [cancelandoPoint, setCancelandoPoint] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cashHistory, setCashHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showConsumptionConfirm, setShowConsumptionConfirm] = useState(false);
  const [consumptionResult, setConsumptionResult] = useState(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const maxDescuento = Number(user?.maxDiscountPercent || 0);
  const puedeCobrar = can('caja.cobrar');
  const puedeModificar = can('caja.venta.modificar');
  const requiereEfectivoRecibido = can('caja.pago.efectivo.ingresar');

  const cajaAbierta = Boolean(cajaTurn);
  const selected = useMemo(() => pending.find(v => v.idVenta === selectedId) || null, [pending, selectedId]);
  const editing = mode === 'edit' || mode === 'new';

  const openHistory = async () => {
    setShowHistory(true); setLoadingHistory(true);
    try {
      const res = await fetch('/api/cash-register/history', { cache: 'no-store' });
      if (!res.ok) throw new Error('No fue posible cargar el historial de cobros.');
      setCashHistory(await res.json());
    } catch (err) { notify.error(err.message); setShowHistory(false); }
    finally { setLoadingHistory(false); }
  };

  const reprintFromCash = async (sale) => {
    if ([33, 34].includes(sale.idTipoDte)) {
      window.open(`/api/dte/venta/${sale.idVenta}/pdf`, '_blank');
      return;
    }
    const items = (sale.items || []).map(item => ({
      nombreProducto: item.nombreProducto, quantity: item.cantidad,
      normalPrice: item.precioNormal || item.precioUnitario, finalPrice: item.precioUnitario,
      materialSelections: item.seleccionesMateriales || [], extras: item.ingredientesExtra || []
    }));
    const payments = (sale.metodosPago || []).map(p => ({ name: p.nombreMetodoPago, amount: p.monto, isCash: p.idMetodoPago === 1 }));
    const printed = await tryPrintBoletaDte({
      idVenta: sale.idVenta, items, promotions: sale.promociones || [], payments,
      barista: sale.vendedor, logoUrl: hasLogo('boletas') ? `${window.location.origin}${getLogoUrl('boletas')}` : null,
      options: { showSeller: receiptShowSeller, showPayment: receiptShowPayment, customFooter: receiptCustomFooter, defaultFooter: branding.textoPieDocumentos || 'Gracias por su preferencia.', contacto: branding.contactoPublico || null }
    });
    if (!printed) notify.error('Esta venta no tiene una boleta electrónica disponible para reimprimir.');
  };

  const retryDteFromCash = async (sale) => {
    try {
      const res = await fetch(`/api/dte/venta/${sale.idVenta}/emitir`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible emitir el documento.');
      notify.success(`Documento emitido con folio ${data.folio}.`);
      await openHistory();
      if ([33, 34].includes(data.tipoDte)) window.open(`/api/dte/venta/${sale.idVenta}/pdf`, '_blank');
    } catch (err) { notify.error(err.message); }
  };

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
      const turnRes = await fetch(`/api/turn/active?idUsuario=${user.idUsuario}`).then(r => r.json());
      setCajaTurn(turnRes.hasActiveTurn && turnRes.belongsToCurrentUser ? turnRes.activeTurn : null);
      await loadPending();
    } catch {
      setCajaTurn(null);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [loadPending, user.idUsuario]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!cajaAbierta || !puedeModificar) return;
    setCatalogLoading(true);
    Promise.all([
      fetch('/api/product').then(r => r.ok ? r.json() : []),
      fetch('/api/category').then(r => r.ok ? r.json() : []),
      fetch('/api/promotion').then(r => r.ok ? r.json() : []),
      fetch('/api/returnables/pos').then(r => r.ok ? r.json() : [])
    ]).then(([productData, categoryData, promotionData, returnableData]) => {
      setCatalog((Array.isArray(productData) ? productData : []).filter(p => p.activo));
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setPromotions(Array.isArray(promotionData) ? promotionData : []);
      setReturnableMap(new Map((Array.isArray(returnableData) ? returnableData : [])
        .map(x => [x.idProducto, { precioEnvase: x.precioEnvase, medioPago: x.medioPago }])));
    }).catch(() => { setCatalog([]); setCategories([]); setPromotions([]); setReturnableMap(new Map()); })
      .finally(() => setCatalogLoading(false));
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

  const draftTotal = useMemo(() => draft.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0)
    + promoDraft.reduce((acc, p) => acc + p.promotion.precio * p.quantity, 0), [draft, promoDraft]);
  const catalogFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(p => {
      if (q && !p.nombreProducto.toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'all' && p.idCategoriaProducto !== parseInt(categoryFilter)) return false;
      return true;
    });
  }, [catalog, query, categoryFilter]);

  // Presentación del catálogo (igual que en Ventas): agrupado por categoría o
  // lista única ordenada, según la configuración del Punto de venta.
  const productGroups = useMemo(() => {
    if (!posGroupByCategory) {
      const sorted = sortPosProducts(catalogFiltered, posSortField, posSortDirection);
      return sorted.length ? [{ id: 'all', name: null, items: sorted }] : [];
    }
    const groups = new Map();
    categories.filter(c => c.activo).forEach(c => groups.set(c.idCategoriaProducto, {
      id: c.idCategoriaProducto, name: c.nombreCategoriaProducto, items: []
    }));
    const sinCategoria = { id: 'sin-categoria', name: 'Sin categoría', items: [] };
    catalogFiltered.forEach(p => {
      const group = groups.get(p.idCategoriaProducto);
      if (group) group.items.push(p);
      else sinCategoria.items.push(p);
    });
    return [...groups.values(), sinCategoria].filter(g => g.items.length > 0);
  }, [categories, catalogFiltered, posGroupByCategory, posSortField, posSortDirection]);

  // Monto por método según el modo (único = total al método activo; dividido = lo asignado).
  const montoDe = (id) => {
    if (!isSplit) return activeMethods[0] === id ? total : 0;
    return parseInt(allocations[id]) || 0;
  };
  const efectivoMonto = montoDe(1);
  const tarjetaMonto = montoDe(METODO_TARJETA);
  const sumAsignado = [1, 4, METODO_TARJETA].reduce((acc, id) => acc + montoDe(id), 0);
  const vuelto = Math.max(0, (parseInt(recibido) || 0) - efectivoMonto);
  // Parte del depósito de envases que el backend exigirá pagar en efectivo (resuelto en /pending).
  const efectivoEnvases = Number(selected?.efectivoEnvasesObligatorio || 0);

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

  const startNew = async () => {
    if (submitting || !cajaTurn) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/cash-register/sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], promociones: [] }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible crear la venta.');
      await loadPending();
      setSelectedId(data.idVenta); setMode('view'); resetPago();
      notify.success('Venta creada. Escanea o agrega productos para continuar.');
    } catch (err) { notify.error(err.message); }
    finally { setSubmitting(false); }
  };
  const cancelEdit = () => {
    if (mode === 'new') setSelectedId(null);
    setMode('view'); setDraft([]); setPromoDraft([]); setPicker(false);
  };

  // Abre el modal de envase y espera la respuesta del cajero.
  const askEnvase = (product) => new Promise(resolve => setEnvasePrompt({ product, resolve }));
  const answerEnvase = (value) => { const resolve = envasePrompt?.resolve; setEnvasePrompt(null); resolve?.(value); };

  // Para un producto retornable pregunta si trajo el envase; para el resto no interrumpe.
  // Devuelve { proceed, traido, precioEnvase } — proceed=false si el cajero cancela.
  const resolveEnvase = async (product) => {
    const info = returnableMap.get(product.idProducto);
    if (!info) return { proceed: true, traido: null, precioEnvase: 0 };
    const answer = await askEnvase({
      idProducto: product.idProducto, nombreProducto: product.nombreProducto, precioEnvase: info.precioEnvase
    });
    if (answer === 'cancel') return { proceed: false };
    return { proceed: true, traido: answer === true, precioEnvase: info.precioEnvase };
  };

  const addProduct = async (p) => {
    if (p.stock !== null && p.stock <= 0 && !posAllowSaleWithoutStock) { notify.warning('Producto sin stock disponible.'); return; }
    const enCarrito = draft.filter(l => l.idProducto === p.idProducto).reduce((acc, l) => acc + l.cantidad, 0);
    if (p.stock !== null && enCarrito >= p.stock && !posAllowSaleWithoutStock) { notify.warning('No hay suficiente stock disponible.'); return; }
    const env = await resolveEnvase(p);
    if (!env.proceed) return;
    setDraft(prev => addLine(prev, p, env.traido, env.precioEnvase));
  };
  const changeQty = async (uid, delta) => {
    const line = draft.find(l => l.uid === uid);
    if (!line) return;
    // Al subir cantidad de un retornable se vuelve a preguntar por el envase de esa unidad.
    if (delta > 0 && returnableMap.has(line.idProducto)) {
      const env = await resolveEnvase(line);
      if (!env.proceed) return;
      setDraft(prev => prev.map(l => l.uid === uid
        ? { ...l, cantidad: l.cantidad + 1, envasesRecibidos: (l.envasesRecibidos || 0) + (env.traido ? 1 : 0), precioEnvase: env.precioEnvase || l.precioEnvase }
        : l));
      return;
    }
    setDraft(prev => prev.map(l => {
      if (l.uid !== uid) return l;
      const cantidad = Math.max(1, l.cantidad + delta);
      return { ...l, cantidad, envasesRecibidos: Math.min(l.envasesRecibidos || 0, cantidad) };
    }));
  };
  const removeLine = (uid) => setDraft(prev => prev.filter(l => l.uid !== uid));

  const selectedPromotionsPayload = () => (selected?.promociones || []).map(promo => ({
    idPromocion: promo.idPromocion,
    cantidad: promo.cantidad,
    selecciones: promo.selecciones || []
  }));

  const persistSelectedItems = async (nextDraft) => {
    if (!selected || submitting || (nextDraft.length === 0 && (selected.promociones || []).length === 0)) return false;
    const saleBeforeUpdate = selected;
    const renderedItems = nextDraft.map(line => ({
      ...line,
      subtotal: Number(line.precioUnitario || 0) * Number(line.cantidad || 0),
      recargoEnvases: Math.max(0, Number(line.cantidad || 0) - Number(line.envasesRecibidos || 0)) * Number(line.precioEnvase || 0)
    }));
    const itemsTotal = renderedItems.reduce((sum, line) => sum + line.subtotal + line.recargoEnvases, 0);
    const promotionsTotal = (selected.promociones || []).reduce((sum, promo) =>
      sum + Number(promo.montoIndividual ?? (promo.precio || 0) * (promo.cantidad || 0)), 0);
    // La respuesta visual es inmediata; la recarga posterior confirma cálculos y stock del servidor.
    setPending(current => current.map(sale => sale.idVenta === selected.idVenta
      ? { ...sale, items: renderedItems, montoTotal: itemsTotal + promotionsTotal }
      : sale));
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cash-register/${selected.idVenta}/items`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draftToItems(nextDraft), promociones: selectedPromotionsPayload() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible actualizar el vale.');
      await loadPending();
      return true;
    } catch (err) {
      setPending(current => current.map(sale => sale.idVenta === saleBeforeUpdate.idVenta ? saleBeforeUpdate : sale));
      notify.error(err.message);
      return false;
    } finally { setSubmitting(false); }
  };

  const addProductDirectly = async (product) => {
    if (!selected) return;
    if (product.stock !== null && product.stock <= 0 && !posAllowSaleWithoutStock) {
      notify.warning('No hay suficiente stock disponible.');
      return;
    }
    const env = await resolveEnvase(product);
    if (!env.proceed) return;
    const current = draftFromVale(selected);
    await persistSelectedItems(addLine(current, product, env.traido, env.precioEnvase));
  };

  const changeSelectedQuantity = async (itemIndex, delta) => {
    const current = draftFromVale(selected);
    const target = current[itemIndex];
    if (!target) return;
    const nextQuantity = target.cantidad + delta;
    if (nextQuantity <= 0) return;
    // Al subir cantidad de un retornable se pregunta por el envase de la nueva unidad.
    if (delta > 0 && returnableMap.has(target.idProducto)) {
      const env = await resolveEnvase(target);
      if (!env.proceed) return;
      await persistSelectedItems(current.map((line, index) => index === itemIndex
        ? { ...line, cantidad: nextQuantity, envasesRecibidos: (line.envasesRecibidos || 0) + (env.traido ? 1 : 0), precioEnvase: env.precioEnvase || line.precioEnvase }
        : line));
      return;
    }
    await persistSelectedItems(current.map((line, index) => index === itemIndex
      ? { ...line, cantidad: nextQuantity, envasesRecibidos: Math.min(line.envasesRecibidos || 0, nextQuantity) }
      : line));
  };

  const removeSelectedProduct = async (itemIndex) => {
    const current = draftFromVale(selected);
    const next = current.filter((_, index) => index !== itemIndex);
    if (next.length === 0 && (selected.promociones || []).length === 0) {
      notify.warning('El vale debe conservar al menos un producto o promoción.');
      return;
    }
    await persistSelectedItems(next);
  };

  const changeReturnedContainers = async (itemIndex, value) => {
    const current = draftFromVale(selected);
    const target = current[itemIndex];
    if (!target) return;
    const received = Math.min(target.cantidad, Math.max(0, Number(value) || 0));
    await persistSelectedItems(current.map((line, index) => index === itemIndex ? { ...line, envasesRecibidos: received } : line));
  };

  const handleScan = async (code) => {
    const normalized = code.trim();
    if (/^ENV[0-9A-F]+$/i.test(normalized) && can('caja.retornables.canjear')) {
      try {
        const response = await fetch(`/api/returnables/voucher/${encodeURIComponent(normalized)}`);
        const voucher = await response.json();
        if (!response.ok) throw new Error(voucher.mensaje || 'Vale no encontrado.');
        const products = [];
        for (const item of voucher.productos) {
          const entered = window.prompt(`Envases recibidos de ${item.nombreProducto} (máximo ${item.cantidad})`, String(item.cantidad));
          if (entered === null) return;
          products.push({ idProducto: item.idProducto, cantidad: Math.min(item.cantidad, Math.max(0, Number(entered) || 0)) });
        }
        const redeemResponse = await fetch(`/api/returnables/voucher/${encodeURIComponent(normalized)}/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productos: products }) });
        const result = await redeemResponse.json();
        if (!redeemResponse.ok) throw new Error(result.mensaje || 'No fue posible canjear el vale.');
        notify.success(`Devuelve ${money(result.montoDevuelto)} en efectivo.`);
        if (result.valeSaldo) printReceipt(buildReturnableVoucherHtml({ commercialName: branding.nombreComercial, voucher: result.valeSaldo, products: result.valeSaldo.productos }));
      } catch (error) { notify.error(error.message); }
      return;
    }
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
    if (submitting) return;
    // Pregunta por el envase antes de bloquear con submitting (el modal espera al cajero).
    const env = await resolveEnvase(prod);
    if (!env.proceed) return;
    setSubmitting(true);
    try {
      if (!selected) {
        const res = await fetch('/api/cash-register/sale', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: draftToItems(addLine([], prod, env.traido, env.precioEnvase)), promociones: [] })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || 'No fue posible crear la venta.');
        await loadPending(); setSelectedId(data.idVenta); setMode('view'); resetPago();
      } else {
        const updated = addLine(draftFromVale(selected), prod, env.traido, env.precioEnvase);
        const res = await fetch(`/api/cash-register/${selected.idVenta}/items`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: draftToItems(updated), promociones: (selected.promociones || []).map(p => ({ idPromocion: p.idPromocion, cantidad: p.cantidad, selecciones: p.selecciones || [] })) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje || 'No fue posible agregar el producto.');
        await loadPending(); setSelectedId(selected.idVenta); setMode('view');
      }
      notify.success(`${prod.nombreProducto} agregado.`);
    } catch (err) { notify.error(err.message); }
    finally { setSubmitting(false); }
  };
  useBarcodeScanner(handleScan, { enabled: cajaAbierta && (puedeCobrar || puedeModificar) && !envasePrompt });

  const saveEdit = async () => {
    if (submitting || (draft.length === 0 && promoDraft.length === 0)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cash-register/${selectedId}/items`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draftToItems(draft), promociones: promoDraft.map(p => ({ idPromocion: p.promotion.idPromocion, cantidad: p.quantity, selecciones: p.selections })) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible modificar el vale.');
      notify.success('Vale actualizado.');
      await loadPending();
      setMode('view'); setPicker(false); resetPago();
    } catch (err) { notify.error(err.message); } finally { setSubmitting(false); }
  };

  const createSale = async () => {
    if (submitting || (draft.length === 0 && promoDraft.length === 0) || !cajaTurn) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/cash-register/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draftToItems(draft), promociones: promoDraft.map(p => ({ idPromocion: p.promotion.idPromocion, cantidad: p.quantity, selecciones: p.selections })) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible crear la venta.');
      notify.success('Venta creada. Ya puedes cobrarla.');
      await loadPending();
      selectVale(data.idVenta);
    } catch (err) { notify.error(err.message); } finally { setSubmitting(false); }
  };

  const registerPersonalConsumption = async () => {
    if (!selected || submitting || !can('bitacora.consumos.crear')) return;
    if ((selected.promociones || []).length > 0) {
      notify.warning('Las promociones no se pueden registrar como consumo de personal.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cash-register/${selected.idVenta}/consumption`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: draftToItems(draftFromVale(selected)), promociones: [] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible registrar el consumo.');
      setShowConsumptionConfirm(false);
      setConsumptionResult({ montoAdeudado: data.montoAdeudado || 0, montoCortesia: data.montoCortesia || 0 });
      setSelectedId(null);
      resetPago();
      await loadPending();
      notify.success('Consumo agregado a tu bitácora.');
    } catch (err) {
      setShowConsumptionConfirm(false);
      notify.error(err.message);
    } finally { setSubmitting(false); }
  };

  const voidSelectedSale = async () => {
    if (!selected || submitting || !can('caja.venta.anular')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cash-register/${selected.idVenta}/void`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: voidReason.trim() || null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible anular la venta.');
      setShowVoidConfirm(false);
      setVoidReason('');
      setSelectedId(null);
      resetPago();
      await loadPending();
      notify.success('Venta anulada. Quedó registrada en el historial.');
    } catch (err) {
      notify.error(err.message);
    } finally { setSubmitting(false); }
  };

  const printBoleta = (vale, totalCobrado, pagos, recibidoValor) => {
    const items = vale.items.map(d => ({
      nombreProducto: d.nombreProducto,
      quantity: d.cantidad,
      normalPrice: d.precioNormal || d.precioUnitario,
      finalPrice: d.precioUnitario,
      containerCharge: d.recargoEnvases || 0,
      missingContainers: Math.max(0, d.cantidad - (d.envasesRecibidos || 0)),
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
        items,
        promotions: vale.promociones || [],
        subtotal: subtotalBruto + (vale.promociones || []).reduce((sum, p) => sum + p.montoIndividual, 0),
        total: totalCobrado, payments, cashReceived: recibidoValor
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

  // Imprime la boleta electrónica (80mm con timbre) si la venta ya tiene DTE emitido.
  // Conserva el detalle del ticket interno (líneas con selecciones/extras, pago, vendedor, pie).
  // Devuelve true si imprimió; false si no hay DTE (módulo apagado o emisión fallida).
  const printBoletaDte = async (vale, pagos, recibidoValor) => {
    // La boleta (documento tributario) NO incluye el depósito de envases: es un monto de canje
    // reembolsable, no una venta. Por eso las líneas van sin containerCharge y el total sale del DTE.
    const items = (vale.items || []).map(d => ({
      nombreProducto: d.nombreProducto,
      quantity: d.cantidad,
      normalPrice: d.precioNormal || d.precioUnitario,
      finalPrice: d.precioUnitario,
      materialSelections: (d.seleccionesMateriales || []).map(s => ({ nombreMateriaPrima: s.nombreMateriaPrima, recargo: s.recargo })),
      extras: (d.ingredientesExtra || []).map(x => ({ nombre: x.nombre, precio: x.precio }))
    }));
    const nombres = { 1: 'Efectivo', 2: 'Débito', 3: 'Crédito', 4: 'Transferencia' };
    const payments = (pagos || []).map(p => ({ name: nombres[p.idMetodoPago] || 'Pago', amount: p.monto, isCash: p.idMetodoPago === 1 }));
    // Depósito de envases: no va en el total tributario, pero se declara en la boleta para transparencia.
    const containerDeposit = (vale.items || []).reduce((sum, d) => sum + (d.recargoEnvases || 0), 0);
    return tryPrintBoletaDte({
      idVenta: vale.idVenta, items, promotions: vale.promociones || [], payments,
      cashReceived: recibidoValor, barista: vale.vendedor, containerDeposit,
      logoUrl: hasLogo('boletas') ? `${window.location.origin}${getLogoUrl('boletas')}` : null,
      options: {
        showSeller: receiptShowSeller, showPayment: receiptShowPayment, customFooter: receiptCustomFooter,
        defaultFooter: branding.textoPieDocumentos || 'Gracias por su preferencia.',
        contacto: branding.contactoPublico || null
      }
    });
  };

  // Cobra el vale con los métodos indicados; imprime la boleta y limpia.
  const finalizarCobro = async (valeCobrado, pagos, recibidoValor) => {
    const res = await fetch(`/api/cash-register/${valeCobrado.idVenta}/collect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ porcentajeDescuento: pctDescuento(), metodosPago: pagos, tipoDocumento, receptorFactura: esFacturaSeleccionada ? receptorFactura : null, idCliente: idClienteVenta })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.mensaje || 'No fue posible cobrar el vale.');
    notify.success(esFacturaSeleccionada ? 'Venta cobrada. Factura emitida.' : 'Venta cobrada. Boleta emitida.');

    // El vale de envases siempre se imprime DESPUÉS del documento; si no se imprime documento,
    // se imprime el vale solo. El depósito no va en la boleta (es un canje reembolsable).
    const imprimirVale = () => {
      if (!data.valeEnvases) return;
      const names = new Map((valeCobrado.items || []).map(item => [item.idProducto, item.nombreProducto]));
      printReceipt(buildReturnableVoucherHtml({ commercialName: branding.nombreComercial,
        voucher: data.valeEnvases, products: data.valeEnvases.productos.map(item => ({ ...item, nombreProducto: names.get(item.idProducto) })) }));
    };

    // El cobro ya se efectuó (incluida la aprobación de la terminal en el caso de tarjeta):
    // recién ahora se ofrece imprimir el documento.
    const imprimir = await confirmDialog({
      title: esFacturaSeleccionada ? 'Factura emitida' : 'Boleta emitida',
      message: esFacturaSeleccionada ? '¿Deseas abrir la factura para imprimir?' : '¿Deseas imprimir la boleta?',
      confirmText: 'Imprimir',
      cancelText: 'No imprimir',
      tone: 'info'
    });
    if (imprimir) {
      if (esFacturaSeleccionada) {
        window.open(`/api/dte/venta/${valeCobrado.idVenta}/pdf`, '_blank');
        setTimeout(imprimirVale, 900);
      } else {
        const emitida = await printBoletaDte(valeCobrado, pagos, recibidoValor);
        if (!emitida) notify.error('La venta se cobró, pero la boleta no está disponible para imprimir.');
        // Espera a que la boleta salga primero para que el vale quede a continuación.
        setTimeout(imprimirVale, 1300);
      }
    } else {
      // Sin impresión de documento: el vale de envases se imprime solo.
      imprimirVale();
    }
    setSelectedId(null);
    setPending(prev => prev.filter(v => v.idVenta !== valeCobrado.idVenta));
    resetPago();
    setTipoDocumento('boleta');
    setReceptorFactura({ ...EMPTY_INVOICE_RECIPIENT });
    setIdClienteVenta(null);
    loadPending();
  };

  const handleCollect = async () => {
    if (!selected || submitting || pointPay) return;
    if (esFacturaSeleccionada && !isInvoiceRecipientComplete(receptorFactura)) {
      notify.error('Completa RUT, razón social, giro, dirección y comuna para emitir la factura.');
      return;
    }
    if (sumAsignado !== total) {
      notify.error(`La suma de los pagos (${money(sumAsignado)}) debe ser igual al total (${money(total)}).`);
      return;
    }
    if ([1, 4, METODO_TARJETA].every(id => montoDe(id) === 0)) { notify.error('Indica el método de pago.'); return; }
    if (efectivoEnvases > 0 && efectivoMonto < efectivoEnvases) {
      notify.error(`Los envases requieren al menos ${money(efectivoEnvases)} pagados en efectivo.`);
      return;
    }
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
          body: JSON.stringify({
            montoTarjeta: tarjetaMonto,
            porcentajeDescuento: pctDescuento(),
            tipoDocumento,
            receptorFactura: esFacturaSeleccionada ? receptorFactura : null,
            idCliente: idClienteVenta
          })
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
  // Tarjeta de producto igual que en Ventas: imagen, nombre, stock y precio.
  // Los productos sin stock quedan atenuados y no se pueden seleccionar.
  const renderCajaProductCard = (prod) => {
    const visibleDraft = editing ? draft : (selected ? draftFromVale(selected) : []);
    const enCarrito = visibleDraft.filter(l => l.idProducto === prod.idProducto).reduce((acc, l) => acc + l.cantidad, 0);
    const isOutOfStock = prod.stock !== null && (editing ? prod.stock - enCarrito : prod.stock) <= 0;
    // Si se permite vender sin stock, la tarjeta sigue clickeable (solo mantiene el aviso).
    const blockSale = isOutOfStock && !posAllowSaleWithoutStock;

    return (
      <div key={prod.idProducto}
        className={`pos-product-card${enCarrito > 0 ? ' is-selected' : ''}`}
        onClick={() => !blockSale && (editing ? addProduct(prod) : addProductDirectly(prod))}
        style={{
          backgroundColor: enCarrito > 0 ? 'rgba(var(--primary-rgb), .06)' : '#ffffff', border: `2px solid ${enCarrito > 0 ? 'var(--primary-color)' : '#e2e8f0'}`, borderRadius: '12px', padding: '11px',
          display: 'flex', flexDirection: 'column', cursor: blockSale ? 'not-allowed' : 'pointer',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease', boxShadow: enCarrito > 0 ? '0 0 0 3px rgba(var(--primary-rgb), .12)' : '0 2px 8px rgba(0,0,0,0.02)',
          opacity: blockSale ? 0.5 : 1, userSelect: 'none', position: 'relative', contentVisibility: 'auto', containIntrinsicSize: '150px 225px'
        }}
        onMouseEnter={(e) => { if (!blockSale) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 14px rgba(0, 0, 0, 0.05)'; } }}
        onMouseLeave={(e) => { if (!blockSale) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'; } }}
      >
        {enCarrito > 0 && <span className="pos-product-selected-badge"><Check size={13} /> {enCarrito}</span>}
        <div style={{ width: '100%', height: '110px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '10px' }}>
          {prod.tieneImagen
            ? <img src={productImageUrl(prod)} alt={prod.nombreProducto} loading="lazy" decoding="async" width="150" height="110" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Coffee size={28} color="#94a3b8" />}
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', minHeight: '34px', lineHeight: '1.25', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '6px' }}>
          {prod.nombreProducto}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: isOutOfStock ? '#b91c1c' : 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>
          <Package size={12} />
          <span>{prod.stock !== null ? (isOutOfStock ? 'Sin stock' : `Stock: ${prod.stock}`) : 'Sin control de stock'}</span>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>{money(prod.precio)}</span>
        </div>
      </div>
    );
  };

  const renderPicker = () => (
    <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '12px', background: '#fff', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 9, flexShrink: 0 }}>
        <button type="button" className={`btn ${pickerTab === 'products' ? 'btn-primary' : ''}`} onClick={() => setPickerTab('products')}>Productos</button>
        <button type="button" className={`btn ${pickerTab === 'promotions' ? 'btn-primary' : ''}`} onClick={() => setPickerTab('promotions')}>Promociones</button>
      </div>
      {pickerTab === 'products' ? <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexShrink: 0 }}>
        <Search size={15} color="var(--text-muted)" />
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto…"
          style={{ flex: 1, padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
        <button type="button" onClick={() => setPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      {/* Filtro por categoría (configurable, igual que en Ventas) */}
      {posShowCategories && <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '6px', flexShrink: 0 }}>
        <button type="button" onClick={() => setCategoryFilter('all')}
          style={{ padding: '7px 14px', borderRadius: '20px', border: '1px solid #cbd5e1', backgroundColor: categoryFilter === 'all' ? 'var(--primary-color)' : '#ffffff', color: categoryFilter === 'all' ? '#ffffff' : 'var(--text-main)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Todos
        </button>
        {categories.filter(c => c.activo).map(cat => (
          <button key={cat.idCategoriaProducto} type="button" onClick={() => setCategoryFilter(cat.idCategoriaProducto)}
            style={{ padding: '7px 14px', borderRadius: '20px', border: '1px solid #cbd5e1', backgroundColor: categoryFilter === cat.idCategoriaProducto ? 'var(--primary-color)' : '#ffffff', color: categoryFilter === cat.idCategoriaProducto ? '#ffffff' : 'var(--text-main)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {cat.nombreCategoriaProducto}
          </button>
        ))}
      </div>}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '4px' }}>
        {catalogLoading ? <Spinner label="Cargando productos…" style={{ padding: '40px 8px' }} />
          : productGroups.length === 0 ? <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px' }}>Sin coincidencias.</span>
          : productGroups.map(group => (
            <div key={group.id}>
              {group.name && <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, whiteSpace: 'nowrap' }}>{group.name}</h3>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
              </div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                {group.items.map(prod => renderCajaProductCard(prod))}
              </div>
            </div>
          ))}
      </div>
      </> : <div style={{ maxHeight: 300, overflowY: 'auto' }}><PromotionSelector compact promotions={promotions} onAdd={item => setPromoDraft(current => [...current, item])} /></div>}
    </div>
  );

  const renderEditor = () => (
    <>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{mode === 'new' ? 'Nueva venta' : `Editar vale #${selectedId}`}</h3>
        <button type="button" onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {draft.length === 0 && promoDraft.length === 0 ? <div style={{ padding: '30px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Agrega productos o promociones.</div>
          : <>{draft.map(l => (
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
          ))}{promoDraft.map((item, index) => (
            <div key={`promo-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{item.promotion.nombre}</strong>
                <small style={{ display: 'block', color: '#15803d' }}>{money(item.promotion.precio)} c/u</small>
                <span style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)', fontSize: '.7rem', lineHeight: 1.35 }}>
                  {promotionProducts(item).map(product => <span key={product.idProducto} style={{ display: 'block' }}>{product.cantidad}× {product.nombreProducto}</span>)}
                </span>
              </div>
              <button type="button" style={qtyBtn} onClick={() => setPromoDraft(current => current.map((p, i) => i === index ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p))}><Minus size={14} /></button>
              <strong>{item.quantity}</strong>
              <button type="button" style={qtyBtn} onClick={() => setPromoDraft(current => current.map((p, i) => i === index ? { ...p, quantity: p.quantity + 1 } : p))}><Plus size={14} /></button>
              <button type="button" style={{ ...qtyBtn, color: '#dc2626' }} onClick={() => setPromoDraft(current => current.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
            </div>
          ))}</>}
      </div>
      <div style={{ padding: '10px 18px', borderTop: '1px solid var(--panel-border)' }}>
          <button type="button" onClick={() => { setPicker(true); setQuery(''); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '8px', border: '1.5px dashed var(--primary-color)', background: '#fff', color: 'var(--primary-color)', fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Agregar producto o promoción
          </button>
        </div>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--panel-border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 800 }}>
          <span>Total aprox.:</span><span style={{ color: 'var(--primary-color)' }}>{money(draftTotal)}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={cancelEdit} style={{ padding: '11px 16px', borderRadius: '8px', border: '1.5px solid var(--panel-border)', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" disabled={submitting || (draft.length === 0 && promoDraft.length === 0)} onClick={mode === 'new' ? createSale : saveEdit}
            style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 800, cursor: 'pointer', opacity: (submitting || (draft.length === 0 && promoDraft.length === 0)) ? 0.6 : 1 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {can('caja.venta.anular') && <button type="button" disabled={submitting} onClick={() => { setVoidReason(''); setShowVoidConfirm(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', fontSize: '.82rem' }}>
            <Ban size={14} /> Anular venta
          </button>}
          {puedeModificar && <button type="button" onClick={() => { setPicker(true); setQuery(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8, border: '1.5px solid var(--primary-color)', background: '#fff', color: 'var(--primary-color)', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem' }}>
            <Plus size={14} /> Agregar productos
          </button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
        {selected.items.map((d, i) => (
          <Fragment key={`${d.idProducto}-${i}`}><div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.92rem' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{d.nombreProducto}<small style={{ display: 'block', color: 'var(--text-muted)' }}>{money(d.precioUnitario)} c/u</small></span>
            {puedeModificar && <button type="button" disabled={submitting} onClick={() => changeSelectedQuantity(i, -1)} style={qtyBtn}><Minus size={14} /></button>}
            <strong style={{ minWidth: 22, textAlign: 'center' }}>{d.cantidad}</strong>
            {puedeModificar && <button type="button" disabled={submitting} onClick={() => changeSelectedQuantity(i, 1)} style={qtyBtn}><Plus size={14} /></button>}
            <span style={{ minWidth: 76, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(d.subtotal)}</span>
            {puedeModificar && <button type="button" disabled={submitting} onClick={() => removeSelectedProduct(i)} style={{ ...qtyBtn, borderColor: '#fca5a5', color: '#dc2626' }}><Trash2 size={14} /></button>}
          </div>
          {d.precioEnvase > 0 && <div style={{ margin: '-3px 0 8px', padding: '8px 10px', borderRadius: 8, background: '#f8fafc', fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}><strong>Envases recibidos</strong><small style={{ display: 'block', color: 'var(--text-muted)' }}>Faltan {Math.max(0, d.cantidad - (d.envasesRecibidos || 0))} · Recargo {money(d.recargoEnvases)}</small></span>
            <input type="number" min="0" max={d.cantidad} value={d.envasesRecibidos || 0} disabled={!puedeModificar || submitting}
              onChange={event => changeReturnedContainers(i, event.target.value)} style={{ width: 64, padding: 6, textAlign: 'center', border: '1px solid var(--panel-border)', borderRadius: 7 }} />
          </div>}</Fragment>
        ))}
        {(selected.promociones || []).map(promo => (
          <div key={promo.idVentaPromocion} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{promo.cantidad}× Promo: {promo.nombre}</strong>
              <strong>{money(promo.precio * promo.cantidad)}</strong>
            </div>
            <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 3 }}>{(promo.productos || []).map(p => `${p.cantidad}× ${p.nombreProducto}`).join(' · ')}</small>
            {promo.descuento > 0 && <small style={{ display: 'block', color: '#b45309', marginTop: 2 }}>Descuento promo: -{money(promo.descuento)}</small>}
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
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flexShrink: 0 }}>Cobro</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto', minWidth: 0 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>Emitir:</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DteCheckoutFields part="document" collapsible documentType={tipoDocumento} onDocumentTypeChange={setTipoDocumento}
              canEmitExempt={can('ventas.emitir_exento')} disabled={submitting || Boolean(pointPay)} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <span>Subtotal:</span><span>{money(brutoDe(selected))}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-color)' }}>
          <span>TOTAL:</span><span>{money(total)}</span>
        </div>
        {efectivoEnvases > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '8px 10px', borderRadius: 8, background: '#fffbeb', color: '#b45309' }}>
            <span>Envases · pago en efectivo{efectivoMonto < efectivoEnvases ? ' (pendiente)' : ''}:</span>
            <strong>{money(efectivoEnvases)}</strong>
          </div>
        )}
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

        <DteCheckoutFields part="recipient" documentType={tipoDocumento} onDocumentTypeChange={setTipoDocumento}
          recipient={receptorFactura} onRecipientChange={setReceptorFactura}
          canEmitExempt={can('ventas.emitir_exento')} disabled={submitting || Boolean(pointPay)} />

        <ClienteSelect value={idClienteVenta} onChange={setIdClienteVenta} disabled={submitting || Boolean(pointPay)} />

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Recibido{requiereEfectivoRecibido ? ' *' : ''}:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>$</span>
                <input type="number" min="0" value={recibido} onChange={e => setRecibido(e.target.value)} placeholder="0"
                  style={{ width: '130px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', textAlign: 'right', fontSize: '1.15rem', fontWeight: 800 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Vuelto:</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: vuelto > 0 ? '#137333' : 'inherit' }}>{money(vuelto)}</span>
            </div>

            {cajaShowCashButtons && (
              <>
                {/* Pago rápido: fija el monto entregado de una vez (exacto o vuelto redondo) */}
                <span style={cashSectionLabel}>Pago rápido</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <button type="button" onClick={() => setRecibido(String(efectivoMonto))} style={quickBtnStyle((parseInt(recibido) || 0) === efectivoMonto)}>
                    Exacto {money(efectivoMonto)}
                  </button>
                  {sugerenciasEfectivo(efectivoMonto).map(monto => (
                    <button key={monto} type="button" onClick={() => setRecibido(String(monto))} style={quickBtnStyle((parseInt(recibido) || 0) === monto)}>
                      {money(monto)}
                    </button>
                  ))}
                </div>

                {/* Sumar efectivo: cada toque agrega el billete o moneda recibido */}
                <span style={cashSectionLabel}>Sumar efectivo (toca cada billete)</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {DENOMINACIONES_CLP.map(denom => (
                    <button key={denom} type="button" onClick={() => setRecibido(prev => String((parseInt(prev) || 0) + denom))} style={denomBtnStyle}>
                      +{money(denom)}
                    </button>
                  ))}
                  <button type="button" onClick={() => setRecibido('')} style={{ ...denomBtnStyle, background: '#fff', borderColor: '#fca5a5', color: '#dc2626' }}>Borrar</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--panel-border)', background: '#f8fafc', display: 'flex', gap: '10px', alignItems: 'stretch' }}>
        <button type="button" onClick={openHistory} title="Historial de cobros en Caja" aria-label="Historial de cobros en Caja"
          style={{ flexShrink: 0, width: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--primary-color)', border: '1.5px solid var(--primary-color)', borderRadius: '10px', cursor: 'pointer' }}>
          <History size={18} />
        </button>
        <button type="button" disabled={submitting || !puedeCobrar} onClick={handleCollect}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '1rem', cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !puedeCobrar) ? 0.6 : 1 }}>
          {submitting ? 'Cobrando…' : `Cobrar ${money(total)}`}
        </button>
        {can('bitacora.consumos.crear') && <button type="button"
          disabled={submitting || (selected?.promociones || []).length > 0}
          title={(selected?.promociones || []).length > 0 ? 'Los consumos de personal no admiten promociones.' : 'Registrar el vale como consumo personal'}
          aria-label="Consumo personal"
          onClick={() => setShowConsumptionConfirm(true)}
          style={{ flex: '0 0 auto', width: 48, padding: 12, backgroundColor: '#fff', color: 'var(--primary-color)', border: '1.5px solid var(--primary-color)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (submitting || (selected?.promociones || []).length > 0) ? 'not-allowed' : 'pointer', opacity: (submitting || (selected?.promociones || []).length > 0) ? .6 : 1 }}>
          <BookOpen size={18} />
        </button>}
      </div>
    </>
  );

  const columna = { background: '#fff', border: '1px solid var(--panel-border)', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', color: 'var(--text-main)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header className="pos-header" style={{ height: '96px', backgroundColor: 'var(--primary-color)', boxShadow: '0 4px 16px rgba(var(--primary-rgb), 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', color: '#fff', position: 'sticky', top: 0, zIndex: 90, boxSizing: 'border-box' }}>
        <button type="button" onClick={() => navigate('/turn')} title="Volver al turno" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
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
        </div>
      </header>

      {showHistory && <div className="modal-overlay" style={{ zIndex: 180 }}>
        <div className="modal-content" style={{ width: 'min(900px, 94vw)', maxWidth: 900, maxHeight: '85vh', padding: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><h3 style={{ margin: 0 }}>Historial de cobros en Caja</h3><button type="button" className="btn" onClick={() => setShowHistory(false)}><X size={17} /></button></div>
          <div style={{ overflow: 'auto' }}>
            {loadingHistory ? <div style={{ padding: 30, textAlign: 'center' }}>Cargando…</div> : cashHistory.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No hay cobros registrados.</div> :
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}><thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--panel-border)' }}><th style={{ padding: 8 }}>Venta</th><th>Fecha</th><th>Vendedor</th><th>Estado</th><th>Documento</th><th>Total</th><th></th></tr></thead><tbody>
                {cashHistory.map(sale => {
                  const anulada = sale.idEstadoVenta === 3;
                  return <tr key={sale.idVenta} style={{ borderBottom: '1px solid var(--panel-border)', opacity: anulada ? .78 : 1 }}>
                    <td style={{ padding: '10px 8px' }}>#{sale.idVenta}</td>
                    <td style={{ padding: '10px 8px' }}>{new Date(sale.fechaAnulacion || sale.fechaVenta).toLocaleString('es-CL')}</td>
                    <td style={{ padding: '10px 8px' }}>{sale.vendedor}</td>
                    <td style={{ padding: '10px 8px' }}>{anulada ? <><strong style={{ color: '#b91c1c' }}>Anulada</strong>{sale.motivoAnulacion && <small style={{ display: 'block', maxWidth: 210, marginTop: 3, color: 'var(--text-muted)', whiteSpace: 'normal' }}>{sale.motivoAnulacion}</small>}</> : <strong style={{ color: '#137333' }}>Cobrada</strong>}</td>
                    <td style={{ padding: '10px 8px' }}>{anulada ? '—' : sale.idTipoDte ? `${[33,34].includes(sale.idTipoDte) ? 'Factura' : 'Boleta'} N° ${sale.folioDte || '—'}` : 'Emisión pendiente'}</td>
                    <td style={{ padding: '10px 8px' }}>{money(sale.montoTotal)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{anulada ? '—' : sale.idTipoDte ? <button type="button" className="btn" onClick={() => reprintFromCash(sale)} style={{ padding: '6px 10px', fontSize: '.78rem', whiteSpace: 'nowrap' }}><Printer size={14} /> Reimprimir</button> : <button type="button" className="btn btn-primary" onClick={() => retryDteFromCash(sale)} style={{ padding: '6px 10px', fontSize: '.78rem', whiteSpace: 'nowrap' }}><RefreshCw size={14} /> Emitir ahora</button>}</td>
                  </tr>;
                })}
              </tbody></table>}
          </div>
        </div>
      </div>}

      {picker && <div className="modal-overlay" style={{ zIndex: 190 }} onMouseDown={event => { if (event.target === event.currentTarget) setPicker(false); }}>
        <div className="modal-content" style={{ width: 'min(820px, 94vw)', maxWidth: 820, height: '82vh', padding: 22, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
            <div><h3 style={{ margin: 0 }}>Agregar a la venta #{selectedId}</h3><small style={{ color: 'var(--text-muted)' }}>Selecciona productos o promociones y luego guarda los cambios.</small></div>
            <button type="button" className="btn" onClick={() => setPicker(false)}><X size={17} /></button>
          </div>
          {renderPicker()}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, flexShrink: 0 }}><button type="button" className="btn btn-primary" onClick={() => setPicker(false)}>Listo</button></div>
        </div>
      </div>}

      {envasePrompt && <div className="modal-overlay" style={{ zIndex: 300 }}>
        <div className="modal-content" style={{ width: 'min(420px, 92vw)', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 999, background: 'rgba(var(--primary-rgb), .1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Package size={26} color="var(--primary-color)" />
          </div>
          <h3 style={{ margin: '0 0 6px' }}>¿El cliente trajo el envase?</h3>
          <p style={{ margin: '0 0 4px', fontWeight: 800 }}>{envasePrompt.product.nombreProducto}</p>
          <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.4 }}>
            Si no lo trae, se agrega el depósito de <strong>{money(envasePrompt.product.precioEnvase)}</strong> por el envase.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => answerEnvase(true)}><Check size={16} /> Sí, lo trajo</button>
            <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={() => answerEnvase(false)}>No · +{money(envasePrompt.product.precioEnvase)}</button>
          </div>
          <button type="button" className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => answerEnvase('cancel')}>Cancelar</button>
        </div>
      </div>}

      {showConsumptionConfirm && selected && <div className="modal-overlay" style={{ zIndex: 200 }}>
        <div className="modal-content" style={{ width: 'min(440px, 92vw)', padding: 24 }}>
          <h3 style={{ margin: '0 0 8px' }}>Registrar consumo personal</h3>
          <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Los productos del vale #{selected.idVenta} se quitarán de la lista de cobro y quedarán registrados en tu bitácora como consumo de personal. Las cortesías se aplicarán automáticamente.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn" disabled={submitting} onClick={() => setShowConsumptionConfirm(false)} style={{ flex: 1 }}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={registerPersonalConsumption} style={{ flex: 1 }}>
              {submitting ? 'Registrando…' : 'Confirmar consumo'}
            </button>
          </div>
        </div>
      </div>}

      {showVoidConfirm && selected && <div className="modal-overlay" style={{ zIndex: 205 }}>
        <div className="modal-content" style={{ width: 'min(460px, 92vw)', padding: 24 }}>
          <h3 style={{ margin: '0 0 8px' }}>Anular venta #{selected.idVenta}</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Se repondrá el stock y la venta dejará de estar disponible para cobro, pero permanecerá en el historial como anulada.
          </p>
          <label htmlFor="cash-void-reason" style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}>Motivo (opcional)</label>
          <textarea id="cash-void-reason" value={voidReason} maxLength={300} rows={3} autoFocus
            onChange={event => setVoidReason(event.target.value)} placeholder="Ej.: pedido duplicado"
            style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: 10, border: '1px solid var(--panel-border)', borderRadius: 8, marginBottom: 6 }} />
          <div style={{ marginBottom: 16, textAlign: 'right', color: 'var(--text-muted)', fontSize: '.75rem' }}>{voidReason.length}/300</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn" disabled={submitting} onClick={() => { setShowVoidConfirm(false); setVoidReason(''); }} style={{ flex: 1 }}>Cancelar</button>
            <button type="button" disabled={submitting} onClick={voidSelectedSale}
              style={{ flex: 1, padding: '10px 14px', border: 0, borderRadius: 8, background: '#dc2626', color: '#fff', fontWeight: 800, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? .6 : 1 }}>
              {submitting ? 'Anulando…' : 'Anular venta'}
            </button>
          </div>
        </div>
      </div>}

      {consumptionResult && <div className="modal-overlay" style={{ zIndex: 200 }}>
        <div className="modal-content" style={{ width: 'min(420px, 92vw)', padding: 24 }}>
          <h3 style={{ margin: '0 0 14px' }}>Consumo registrado</h3>
          <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cortesía aplicada</span><strong>{money(consumptionResult.montoCortesia)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Monto adeudado</span><strong>{money(consumptionResult.montoAdeudado)}</strong></div>
          </div>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setConsumptionResult(null)}>Listo</button>
        </div>
      </div>}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : !cajaAbierta ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
          <Wallet size={46} style={{ opacity: 0.35 }} />
          <div style={{ maxWidth: '420px' }}>No tienes un turno abierto. Inícialo desde la pantalla de turno para operar la caja.</div>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/turn')}>
            <ArrowLeft size={18} /> Ir al turno
          </button>
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
                      {new Date(vale.fechaVenta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {vale.items.length + (vale.promociones?.length || 0)} ítem(s)
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

      {pointPay && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: 420, padding: 28, textAlign: 'center' }}>
            {pointPay.estado === 'esperando' && (
              <>
                <div style={{ margin: '4px auto 18px', border: '4px solid rgba(var(--primary-rgb), 0.15)', width: 44, height: 44, borderRadius: '50%', borderLeftColor: 'var(--primary-color)', animation: 'spin 1s linear infinite' }} />
                <h3 style={{ margin: '0 0 6px', fontWeight: 800 }}>Cobrando en la terminal</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', margin: '0 0 4px' }}>
                  Pide al cliente que pase la tarjeta en la terminal POS.
                </p>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-color)', margin: '8px 0 20px' }}>{money(pointPay.montoTarjeta)}</p>
                <button type="button" className="btn btn-danger" disabled={cancelandoPoint} onClick={cancelarPoint} style={{ width: '100%' }}>
                  {cancelandoPoint ? 'Cancelando…' : 'Cancelar cobro'}
                </button>
              </>
            )}
            {pointPay.estado === 'rechazado' && (
              <>
                <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#c5221f' }}>Cobro no completado</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', margin: '0 0 20px' }}>{pointPay.mensaje}</p>
                <button type="button" className="btn btn-primary" onClick={() => { setPointPay(null); loadPending(); }} style={{ width: '100%' }}>
                  Cerrar
                </button>
              </>
            )}
            {pointPay.estado === 'error_cobro' && (
              <>
                <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#b45309' }}>Tarjeta cobrada</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', margin: '0 0 16px' }}>
                  El pago con tarjeta se aprobó pero no se pudo cerrar la venta: {pointPay.mensaje}. Reintenta para finalizar (no se vuelve a cobrar).
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn" onClick={() => { setPointPay(null); loadPending(); }} style={{ flex: 1, border: '1.5px solid var(--panel-border)' }}>Cerrar</button>
                  <button type="button" className="btn btn-primary" onClick={reintentarCierre} style={{ flex: 1 }}>Reintentar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

const qtyBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1.5px solid var(--panel-border)', background: '#fff', cursor: 'pointer', flexShrink: 0 };

export default CashRegister;
