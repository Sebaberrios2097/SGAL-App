import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    Check,
    CheckCircle2,
    ChefHat,
    ClipboardList,
    Clock,
    Coffee,
    Gift,
    CreditCard,
    History,
    Home,
    Minus,
    Package,
    Plus,
    Printer,
    RefreshCw,
    RotateCcw,
    ShoppingBag,
    Trash2,
    User
} from 'lucide-react';
import { notify, useNotificationMessage } from '../components/NotificationCenter';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usePointAvailability } from '../hooks/usePointAvailability';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { buildReceiptHtml } from '../utils/receiptTemplates';

// "Tarjeta" es una opción transitoria de la interfaz. El backend registra
// débito o crédito después de que Mercado Pago informa el medio real.
const METODO_TARJETA = 5;
const POINT_POLL_MS = 3000;

// Identidad visual de Comandas: el fondo base siempre usa el color de acento
// configurado por la empresa.
const COMANDA_BACKGROUND = 'var(--accent-color)';
const COMANDA_BADGE_BG = 'rgba(255,255,255,0.82)';
const COMANDA_TEXT = '#ffffff';
const COMANDA_ACCENT = '#0d9488';         // teal complementario (acción / hecho)
const COMANDA_ACCENT_DARK = '#0f766e';
const COMANDA_PENDING = '#f59e0b';        // ámbar para comandas pendientes
// Refresco de la vista de comandas: pensada como pantalla de preparación viva.
const COMANDAS_POLL_MS = 12000;
// Alineado con MercadoPagoPoint:ExpirationTime (PT5M) del backend.
const POINT_AVISO_DEMORA_MS = 5 * 60 * 1000;
const buildAlternativeGroups = (product) => {
  const groups = new Map();

  (product.alternativasReceta || []).forEach(alternative => {
    if (!groups.has(alternative.idMateriaPrimaBase)) {
      groups.set(alternative.idMateriaPrimaBase, {
        idMateriaPrimaBase: alternative.idMateriaPrimaBase,
        nombreMateriaPrimaBase: alternative.nombreMateriaPrimaBase,
        opciones: [{
          idMateriaPrima: alternative.idMateriaPrimaBase,
          nombreMateriaPrima: alternative.nombreMateriaPrimaBase,
          recargo: 0
        }]
      });
    }

    groups.get(alternative.idMateriaPrimaBase).opciones.push({
      idMateriaPrima: alternative.idMateriaPrimaAlternativa,
      nombreMateriaPrima: alternative.nombreMateriaPrimaAlternativa,
      recargo: alternative.recargo
    });
  });

  return Array.from(groups.values());
};

const getSelectionSignature = (selections) => selections
  .map(selection => `${selection.idMateriaPrimaBase}:${selection.idMateriaPrimaSeleccionada}`)
  .sort()
  .join('|');

const getSelectionSurcharge = (selections = []) => selections
  .reduce((total, selection) => total + (selection.recargo || 0), 0);

const getExtrasSurcharge = (extras = []) => extras
  .reduce((total, extra) => total + (extra.precio || 0), 0);

// Firma única de una línea del carrito: producto + alternativas elegidas + ingredientes extra.
// Permite agrupar líneas idénticas y separar las que difieren en sus extras.
const getLineSignature = (selections = [], extras = []) =>
  `${getSelectionSignature(selections)}#${extras.map(extra => extra.idIngredienteExtra).sort((a, b) => a - b).join(',')}`;

const describirRechazoPoint = (estadoOrden) => {
  switch (estadoOrden) {
    case 'canceled': return 'El cobro fue cancelado en la terminal.';
    case 'expired': return 'El cobro expiró sin completarse en la terminal.';
    case 'failed': return 'La terminal rechazó el pago.';
    default: return 'El pago no pudo completarse.';
  }
};

const SalesView = () => {
  const { user, can, canAny } = useAuth();
  const { branding, getLogoUrl, hasLogo, getBackgroundStyle, isModuleEnabled, logbookIncludesCalibration,
    receiptShowSeller, receiptShowPayment, receiptCustomFooter, receiptShowBarcode } = useOrganization();

  // Opciones de personalización del comprobante compartidas por ambas impresiones.
  const receiptOptions = () => ({
    showSeller: receiptShowSeller,
    showPayment: receiptShowPayment,
    customFooter: receiptCustomFooter,
    defaultFooter: branding.textoPieDocumentos || 'Gracias por su preferencia.',
    contacto: branding.contactoPublico || null
  });
  const boletaLogoUrl = () => (hasLogo('boletas') ? `${window.location.origin}${getLogoUrl('boletas')}` : null);
  const materialsEnabled = isModuleEnabled('recetas');
  const turnsEnabled = isModuleEnabled('ventas');
  const commandsEnabled = isModuleEnabled('comandas');
  // Con Caja, el vendedor solo genera la orden (vale); el cobro ocurre en la caja.
  const cajaEnabled = isModuleEnabled('caja');
  const navigate = useNavigate();
  useDocumentTitle('Punto de Venta (POS)');
  const pointAvailability = usePointAvailability();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');
  const [success, setSuccess] = useNotificationMessage('success');

  // Turn/Shift State
  const [activeTurn, setActiveTurn] = useState(null);
  const [calibracionTurno, setCalibracionTurno] = useState(null); // { tieneCalibracion, gramos } | null

  // Checkout (Sale) State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentAllocations, setPaymentAllocations] = useState({ 1: '', 4: '', [METODO_TARJETA]: '' });
  const [activeMethods, setActiveMethods] = useState([1]); // 1 = Efectivo by default
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);
  // Consumo de empleado: modal de confirmación y de resultado (estilizados).
  const [showConsumoConfirm, setShowConsumoConfirm] = useState(false);
  const [consumoResult, setConsumoResult] = useState(null); // { montoAdeudado, montoCortesia }
  // Descuento al cobro. El % máximo permitido viene de la sesión (según el rol del usuario).
  const [descuentoPct, setDescuentoPct] = useState(0);
  const maxDescuento = Number(user?.maxDiscountPercent || 0);
  const puedeDescontar = maxDescuento > 0;

  // Cobro con tarjeta en la terminal Point
  // { idVenta, idOrden, montoTarjeta, estado: 'esperando' | 'confirmado' | 'rechazado', mensaje, snapshot }
  const [pointPayment, setPointPayment] = useState(null);
  const [pointDemorado, setPointDemorado] = useState(false);
  const [cancelandoPoint, setCancelandoPoint] = useState(false);

  // Anulación de ventas
  const [ventaAAnular, setVentaAAnular] = useState(null);
  const [devolverStockAnulacion, setDevolverStockAnulacion] = useState(true);
  const [anulandoVenta, setAnulandoVenta] = useState(false);
  const [resultadoAnulacion, setResultadoAnulacion] = useState(null);

  // Sales History State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [saleHistory, setSaleHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedSalePayments, setExpandedSalePayments] = useState({}); // idVenta -> boolean

  // Comandas State
  // viewMode alterna entre la sección de venta (POS) y la de comandas.
  const [viewMode, setViewMode] = useState('venta'); // 'venta' | 'comandas'
  const [comandas, setComandas] = useState([]);
  const [loadingComandas, setLoadingComandas] = useState(false);
  const [comandasError, setComandasError] = useNotificationMessage('error');
  const [updatingComanda, setUpdatingComanda] = useState(null); // idVenta en curso
  const [showComandaHistory, setShowComandaHistory] = useState(false);
  // Cache de recetas por producto: idProducto -> { status, materiales, nombreBase }.
  const [recipeCache, setRecipeCache] = useState({});

  // POS / Sales Catalog State
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [extrasCatalog, setExtrasCatalog] = useState([]); // ingredientes extra activos (global)
  const [cart, setCart] = useState([]); // { product, quantity, finalPrice }
  // Si != null, el carrito corresponde a un vale reescaneado que se está modificando.
  const [editingVentaId, setEditingVentaId] = useState(null);
  const [cartOpen, setCartOpen] = useState(false); // panel de carrito deslizable (móvil)
  const [productToCustomize, setProductToCustomize] = useState(null);
  const [materialChoices, setMaterialChoices] = useState({});
  // Editor de ingredientes extra por línea del carrito.
  const [extrasEditor, setExtrasEditor] = useState(null); // { index } de la línea editada
  const [extraChoices, setExtraChoices] = useState([]); // ids de extras seleccionados en el editor
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    checkShiftStatus();
    fetchCatalog();
  }, []);

  const checkShiftStatus = async () => {
    if (!user) return;
    if (!turnsEnabled) {
      setActiveTurn(null);
      setCalibracionTurno(null);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/turn/active?idUsuario=${user.idUsuario}`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasActiveTurn && data.belongsToCurrentUser) {
          setActiveTurn(data.activeTurn);
          if (logbookIncludesCalibration) fetchCalibracion(data.activeTurn.idTurno);
          else setCalibracionTurno(null);
        } else {
          setActiveTurn(null);
          setCalibracionTurno(null);
        }
      }
    } catch (e) {
      console.error('Error checking turn status', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalibracion = async idTurno => {
    try {
      const res = await fetch(`/api/logbook/turn/${idTurno}/calibration`);
      if (res.ok) setCalibracionTurno(await res.json());
    } catch (e) {
      console.error('Error obteniendo la calibración del turno', e);
    }
  };

  const fetchCatalog = async () => {
    try {
      const [prodRes, catRes, discRes, extraRes] = await Promise.all([
        fetch('/api/product'),
        fetch('/api/category'),
        fetch('/api/discount'),
        materialsEnabled ? fetch('/api/extra-ingredient/active') : null
      ]);

      if (prodRes.ok && catRes.ok && discRes.ok) {
        setProducts(await prodRes.json());
        setCategories(await catRes.json());
        setDiscounts(await discRes.json());
      }
      // El catálogo de extras es opcional: si falla, los productos simplemente no ofrecerán extras.
      if (extraRes?.ok) setExtrasCatalog(await extraRes.json());
      else setExtrasCatalog([]);
    } catch (e) {
      console.error('Error loading catalog', e);
    }
  };

  const handleCreateSale = async (e) => {
    e.preventDefault();
    if (submittingSale) return;
    setError('');
    setSubmittingSale(true);

    const items = cart.map(item => ({
      idProducto: item.product.idProducto,
      cantidad: item.quantity,
      seleccionesMateriales: (item.materialSelections || []).map(selection => ({
        idMateriaPrimaBase: selection.idMateriaPrimaBase,
        idMateriaPrimaSeleccionada: selection.idMateriaPrimaSeleccionada
      })),
      idsIngredientesExtra: (item.extras || []).map(extra => extra.idIngredienteExtra)
    }));

    const asignacionesPago = Object.keys(paymentAllocations)
      .map(id => ({
        idMetodoPago: parseInt(id),
        monto: parseInt(paymentAllocations[id]) || 0
      }))
      .filter(item => item.monto > 0);

    // El identificador visual de Tarjeta nunca se envía como IdMetodoPago porque no
    // pertenece al catálogo de la base de datos.
    const montoTarjeta = asignacionesPago.find(m => m.idMetodoPago === METODO_TARJETA)?.monto || 0;
    const metodosPago = asignacionesPago.filter(m => m.idMetodoPago !== METODO_TARJETA);
    if (montoTarjeta > 0 && !pointAvailability.available) {
      setError(pointAvailability.message || 'El cobro con tarjeta no está configurado.');
      setSubmittingSale(false);
      return;
    }
    const sumAllocated = asignacionesPago.reduce((acc, curr) => acc + curr.monto, 0);
    if (sumAllocated !== calculateCartTotal()) {
      setError(`La suma de los montos asignados ($${sumAllocated.toLocaleString('es-CL')}) debe ser igual al total a cobrar ($${calculateCartTotal().toLocaleString('es-CL')}).`);
      setSubmittingSale(false);
      return;
    }

    // Cash check: if cash is selected, verify received cash
    const cashMethod = metodosPago.find(m => m.idMetodoPago === 1);
    if (cashMethod && cashMethod.monto > 0) {
      const received = parseInt(cashReceived) || 0;
      if (received < cashMethod.monto) {
        setError(`El efectivo recibido ($${received.toLocaleString('es-CL')}) debe ser mayor o igual al monto asignado a Efectivo ($${cashMethod.monto.toLocaleString('es-CL')}).`);
        setSubmittingSale(false);
        return;
      }
    }

    try {
      const usaTarjeta = montoTarjeta > 0;
      const endpoint = usaTarjeta ? '/api/sale/point' : '/api/sale';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idTurno: activeTurn?.idTurno ?? null,
          montoTarjeta,
          metodosPago,
          items,
          porcentajeDescuento: descuentoPctEfectivo()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detalle ? `${data.mensaje} (${data.detalle})` : (data.mensaje || 'Error al procesar la venta'));
      }

      if (usaTarjeta) {
        // La venta queda pendiente: ni se limpia el carrito ni se imprime hasta
        // que la terminal confirme el pago.
        setPointDemorado(false);
        setPointPayment({
          idVenta: data.idVenta,
          idOrden: data.idOrden,
          montoTarjeta: data.montoTarjeta,
          estado: 'esperando',
          mensaje: '',
          snapshot: buildSaleSnapshot(data.idVenta)
        });
        return;
      }

      finalizeSale(buildSaleSnapshot(data.idVenta));

    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingSale(false);
    }
  };

  // Consumo de empleado: crea una venta asociada a la bitácora (por cobrar), sin métodos de
  // pago; la cortesía se aplica automáticamente en el servidor. No requiere pasar por el pago.
  const handleCreateConsumption = async () => {
    if (!turnsEnabled || !activeTurn || submittingSale || cart.length === 0 || faltaCalibracion) return;
    setError('');
    setSubmittingSale(true);
    try {
      const items = cart.map(item => ({
        idProducto: item.product.idProducto,
        cantidad: item.quantity,
        seleccionesMateriales: (item.materialSelections || []).map(selection => ({
          idMateriaPrimaBase: selection.idMateriaPrimaBase,
          idMateriaPrimaSeleccionada: selection.idMateriaPrimaSeleccionada
        })),
        idsIngredientesExtra: (item.extras || []).map(extra => extra.idIngredienteExtra)
      }));
      const res = await fetch('/api/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idTurno: activeTurn.idTurno, esConsumoEmpleado: true, items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detalle ? `${data.mensaje} (${data.detalle})` : (data.mensaje || 'Error al registrar el consumo'));
      setCart([]);
      setCartOpen(false);
      setShowConsumoConfirm(false);
      setConsumoResult({ montoAdeudado: data.montoAdeudado || 0, montoCortesia: data.montoCortesia || 0 });
    } catch (err) {
      setError(err.message);
      setShowConsumoConfirm(false);
    } finally {
      setSubmittingSale(false);
    }
  };

  const buildSaleSnapshot = (idVenta) => ({
    idVenta,
    fecha: new Date().toLocaleString('es-CL'),
    barista: user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario,
    cart: [...cart],
    paymentAllocations: { ...paymentAllocations },
    cashReceived: cashReceived,
    subtotal: cart.reduce((acc, item) => acc + ((item.normalPrice ?? item.product.precio) * item.quantity), 0),
    total: calculateCartTotal()
  });

  const finalizeSale = (saleData) => {
    setCart([]);
    setShowCheckoutModal(false);
    setCashReceived('');
    setDescuentoPct(0);
    setPaymentAllocations({ 1: '', 4: '', [METODO_TARJETA]: '' });
    fetchCatalog();

    setSuccess('Venta registrada con éxito. Imprimiendo...');
    setTimeout(() => setSuccess(''), 4000);

    setTimeout(() => {
      triggerPrintTicket(saleData);
    }, 300);
  };

  // Con el módulo Caja: el vendedor genera la orden como vale (sin cobro) y la envía
  // a caja. Imprime un vale mínimo (fecha, productos, cantidades y subtotal con descuentos).
  const handleGenerarVale = async () => {
    if (submittingSale || cart.length === 0 || faltaCalibracion) return;
    setError('');
    setSubmittingSale(true);

    const items = cart.map(item => ({
      idProducto: item.product.idProducto,
      cantidad: item.quantity,
      seleccionesMateriales: (item.materialSelections || []).map(selection => ({
        idMateriaPrimaBase: selection.idMateriaPrimaBase,
        idMateriaPrimaSeleccionada: selection.idMateriaPrimaSeleccionada
      })),
      idsIngredientesExtra: (item.extras || []).map(extra => extra.idIngredienteExtra)
    }));

    try {
      // Vale reescaneado: se actualiza el mismo vale; si no, se crea uno nuevo.
      const editando = editingVentaId != null;
      const res = await fetch(editando ? `/api/sale/${editingVentaId}/items` : '/api/sale', {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? { items } : { idTurno: activeTurn?.idTurno ?? null, items })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detalle ? `${data.mensaje} (${data.detalle})` : (data.mensaje || 'Error al generar el vale'));
      }

      const idVenta = editando ? editingVentaId : data.idVenta;
      const valeItems = cart.map(item => ({
        nombreProducto: item.product.nombreProducto,
        quantity: item.quantity,
        normalPrice: item.normalPrice,
        finalPrice: item.finalPrice,
        materialSelections: item.materialSelections,
        extras: item.extras
      }));
      const subtotalBruto = cart.reduce((acc, item) => acc + (item.normalPrice * item.quantity), 0);
      const html = buildReceiptHtml({
        mode: 'vale',
        commercialName: branding.nombreComercial,
        logoUrl: boletaLogoUrl(),
        data: {
          idVenta,
          fecha: new Date().toLocaleString('es-CL'),
          items: valeItems,
          subtotal: subtotalBruto,
          total: calculateCartSubtotal(),
          payments: []
        },
        options: { includeComanda: false, barcodeValue: receiptShowBarcode ? `VTA${idVenta}` : null }
      });

      setCart([]);
      setDescuentoPct(0);
      setCartOpen(false);
      setEditingVentaId(null);
      fetchCatalog();
      setSuccess(editando ? 'Vale actualizado. Imprimiendo...' : 'Vale generado. Enviado a caja. Imprimiendo...');
      setTimeout(() => setSuccess(''), 4000);
      setTimeout(() => printTicket(html), 300);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingSale(false);
    }
  };

  // Consulta el estado del cobro mientras el cliente paga en la terminal.
  useEffect(() => {
    if (!pointPayment || pointPayment.estado !== 'esperando') return;

    let activo = true;
    const inicio = Date.now();
    const idVenta = pointPayment.idVenta;

    const consultarEstado = async () => {
      try {
        const res = await fetch(`/api/sale/point/${idVenta}/sync`, { method: 'POST' });
        const data = await res.json();
        if (!activo || !res.ok) return;

        if (data.idEstadoVenta === 1) {
          setPointPayment(prev => (prev ? { ...prev, estado: 'confirmado' } : prev));
        } else if (data.idEstadoVenta === 2) {
          setPointPayment(prev => (prev ? { ...prev, estado: 'rechazado', mensaje: describirRechazoPoint(data.estadoOrden) } : prev));
        } else if (Date.now() - inicio > POINT_AVISO_DEMORA_MS) {
          setPointDemorado(true);
        }
      } catch {
        // Corte de red puntual: se reintenta en el siguiente ciclo.
      }
    };

    consultarEstado();
    const timer = setInterval(consultarEstado, POINT_POLL_MS);

    return () => {
      activo = false;
      clearInterval(timer);
    };
  }, [pointPayment?.idVenta, pointPayment?.estado]);

  // Pago confirmado: recién aquí se cierra la venta y se emite la boleta.
  useEffect(() => {
    if (pointPayment?.estado !== 'confirmado') return;

    const saleData = pointPayment.snapshot;
    setPointPayment(null);
    setPointDemorado(false);
    finalizeSale(saleData);
  }, [pointPayment?.estado]);

  const handleCancelarCobroPoint = async () => {
    if (!pointPayment || cancelandoPoint) return;
    setCancelandoPoint(true);

    try {
      const res = await fetch(`/api/point/orders/${pointPayment.idOrden}/cancel`, { method: 'POST' });
      if (!res.ok) {
        // Si la terminal no permite cancelar de forma remota, hay que hacerlo en el lector.
        setPointPayment(prev => (prev
          ? { ...prev, mensaje: 'No se pudo cancelar desde el sistema. Cancela el cobro en la terminal.' }
          : prev));
      }
      // El polling detecta el estado final y cierra el modal.
    } catch {
      setPointPayment(prev => (prev
        ? { ...prev, mensaje: 'No se pudo contactar al servidor para cancelar el cobro.' }
        : prev));
    } finally {
      setCancelandoPoint(false);
    }
  };

  const cerrarAvisoPointRechazado = () => {
    setPointPayment(null);
    setPointDemorado(false);
    fetchCatalog();
  };

  const montoPorMetodos = (sale, ids) =>
    (sale?.metodosPago || []).filter(m => ids.includes(m.idMetodoPago)).reduce((acc, m) => acc + m.monto, 0);

  const handleAnularVenta = async () => {
    if (!ventaAAnular || anulandoVenta) return;
    setAnulandoVenta(true);
    setError('');

    try {
      const res = await fetch(`/api/sale/${ventaAAnular.idVenta}/anular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devolverStock: devolverStockAnulacion })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'No se pudo anular la venta.');
      }

      // El resultado se muestra en el modal: puede incluir la instrucción de
      // devolver efectivo desde la caja, y el cajero tiene que verla sí o sí.
      setResultadoAnulacion(data);

      handleOpenHistory();
      fetchCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnulandoVenta(false);
    }
  };

  const toggleMethod = (id) => {
    if (!isSplitPayment) {
      setActiveMethods([id]);
      const total = calculateCartTotal();
      setPaymentAllocations({
        1: id === 1 ? total : '',
        4: id === 4 ? total : '',
        [METODO_TARJETA]: id === METODO_TARJETA ? total : ''
      });
      setCashReceived('');
      return;
    }

    let updated;
    if (activeMethods.includes(id)) {
      if (activeMethods.length === 1) return; // Must keep at least one active method
      updated = activeMethods.filter(x => x !== id);
    } else {
      updated = [...activeMethods, id];
    }

    setActiveMethods(updated);

    // Re-calculate allocations
    const total = calculateCartTotal();
    if (updated.length === 1) {
      const singleId = updated[0];
      setPaymentAllocations({
        1: singleId === 1 ? total : '',
        4: singleId === 4 ? total : '',
        [METODO_TARJETA]: singleId === METODO_TARJETA ? total : ''
      });
      if (singleId !== 1) setCashReceived('');
    } else {
      // In split/multi-mode, reset allocations to empty strings
      setPaymentAllocations({ 1: '', 4: '', [METODO_TARJETA]: '' });
      setCashReceived('');
    }
  };

  const toggleSalePayments = (idVenta) => {
    setExpandedSalePayments(prev => ({
      ...prev,
      [idVenta]: !prev[idVenta]
    }));
  };

  const printTicket = (htmlContent) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = '0px';
    iframe.style.top = '-1000px';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow || iframe.contentDocument;
    const iframeDoc = doc.document || doc;
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  const METHOD_NAMES = { 1: 'Efectivo', 4: 'Transferencia', [METODO_TARJETA]: 'Tarjeta' };

  const triggerPrintTicket = (saleData) => {
    if (!saleData) return;

    const items = saleData.cart.map(item => ({
      nombreProducto: item.product.nombreProducto,
      quantity: item.quantity,
      normalPrice: item.normalPrice,
      finalPrice: item.finalPrice,
      materialSelections: item.materialSelections,
      extras: item.extras
    }));

    const payments = Object.keys(saleData.paymentAllocations)
      .map(id => ({
        name: METHOD_NAMES[id],
        amount: parseInt(saleData.paymentAllocations[id]) || 0,
        isCash: parseInt(id) === 1
      }))
      .filter(p => p.amount > 0);

    const html = buildReceiptHtml({
      mode: 'boleta',
      commercialName: branding.nombreComercial,
      logoUrl: boletaLogoUrl(),
      data: {
        idVenta: saleData.idVenta,
        fecha: saleData.fecha,
        barista: saleData.barista,
        items,
        subtotal: saleData.subtotal,
        total: saleData.total,
        payments,
        cashReceived: saleData.cashReceived
      },
      options: { ...receiptOptions(), includeComanda: true }
    });
    printTicket(html);
  };

  // Reimpresión de boleta: acepta una venta del historial (desde BD, `fechaVenta`
  // presente) o el snapshot recién generado en pantalla. No incluye la comanda.
  const triggerPrintBoleta = (sale) => {
    if (!sale) return;
    const isReprint = !!sale.fechaVenta;

    const fecha = isReprint ? new Date(sale.fechaVenta).toLocaleString('es-CL') : sale.fecha;
    const barista = sale.barista || (user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario);

    const items = isReprint
      ? sale.items.map(item => ({
          nombreProducto: item.nombreProducto,
          quantity: item.cantidad,
          finalPrice: item.precioUnitario,
          normalPrice: item.precioNormal || item.precioUnitario,
          materialSelections: (item.seleccionesMateriales || []).map(selection => ({
            nombreMateriaPrima: selection.nombreMateriaPrima,
            recargo: selection.recargo
          })),
          extras: (item.ingredientesExtra || []).map(extra => ({
            nombre: extra.nombre,
            precio: extra.precio
          }))
        }))
      : sale.cart.map(item => ({
          nombreProducto: item.product.nombreProducto,
          quantity: item.quantity,
          normalPrice: item.normalPrice,
          finalPrice: item.finalPrice,
          materialSelections: item.materialSelections,
          extras: item.extras
        }));

    const subtotal = isReprint
      ? items.reduce((acc, item) => acc + (item.normalPrice * item.quantity), 0)
      : sale.subtotal;
    const total = isReprint ? sale.montoTotal : sale.total;

    const payments = isReprint
      ? sale.metodosPago.map(mp => ({ name: mp.nombreMetodoPago, amount: mp.monto, isCash: mp.idMetodoPago === 1 }))
      : Object.keys(sale.paymentAllocations)
          .map(id => ({ name: METHOD_NAMES[id], amount: parseInt(sale.paymentAllocations[id]) || 0, isCash: parseInt(id) === 1 }))
          .filter(p => p.amount > 0);

    const html = buildReceiptHtml({
      mode: 'boleta',
      commercialName: branding.nombreComercial,
      logoUrl: boletaLogoUrl(),
      data: {
        idVenta: sale.idVenta,
        fecha,
        barista,
        items,
        subtotal,
        total,
        payments,
        cashReceived: isReprint ? null : sale.cashReceived
      },
      options: { ...receiptOptions(), includeComanda: false }
    });
    printTicket(html);
  };

  const handleOpenHistory = async () => {
    setError('');
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await fetch(activeTurn ? `/api/sale/turn/${activeTurn.idTurno}` : '/api/sale/mine');
      if (!res.ok) {
        throw new Error('Error al obtener el historial de ventas');
      }
      const data = await res.json();
      setSaleHistory(data);
    } catch (err) {
      notify.error(err.message);
      setShowHistoryModal(false);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Mapa de productos por id, para saber cuáles llevan receta configurada.
  const productById = products.reduce((map, p) => { map[p.idProducto] = p; return map; }, {});

  // Trae la receta de un producto una sola vez y la guarda en cache.
  const ensureRecipe = async (idProducto) => {
    if (recipeCache[idProducto]) return;
    setRecipeCache(prev => ({ ...prev, [idProducto]: { status: 'loading' } }));
    try {
      const res = await fetch(`/api/recipe/product/${idProducto}`);
      if (!res.ok) throw new Error('recipe');
      const data = await res.json();
      const receta = data.receta;
      setRecipeCache(prev => ({
        ...prev,
        [idProducto]: receta
          ? {
              status: 'loaded',
              nombreBase: receta.nombreBase || null,
              // Ingredientes fijos de la receta (las alternativas elegidas se
              // muestran aparte, desde las selecciones de cada línea de venta).
              materiales: (receta.materiales || []).filter(m => !m.idMateriaPrimaReemplazada)
            }
          : { status: 'empty', materiales: [] }
      }));
    } catch {
      setRecipeCache(prev => ({ ...prev, [idProducto]: { status: 'error', materiales: [] } }));
    }
  };

  // Asegura en cache las recetas de todos los productos con receta de las comandas dadas.
  const ensureRecipesForComandas = (lista) => {
    if (!materialsEnabled) return;
    const pendientes = new Set();
    lista.forEach(c => (c.items || []).forEach(item => {
      const prod = productById[item.idProducto];
      if (prod?.requiereReceta && prod?.tieneRecetaConfigurada && !recipeCache[item.idProducto]) {
        pendientes.add(item.idProducto);
      }
    }));
    pendientes.forEach(ensureRecipe);
  };

  const fetchComandas = async ({ silent } = {}) => {
    if (turnsEnabled && !activeTurn) return;
    if (!silent) setLoadingComandas(true);
    try {
      const res = await fetch(activeTurn ? `/api/sale/turn/${activeTurn.idTurno}` : '/api/sale/mine');
      if (!res.ok) throw new Error('No se pudieron cargar las comandas del turno.');
      const data = await res.json();
      // Solo las ventas concretadas tienen comanda que preparar.
      const soloVentas = data.filter(v => v.idEstadoVenta === 1);
      setComandas(soloVentas);
      setComandasError('');
      ensureRecipesForComandas(soloVentas);
    } catch (err) {
      if (!silent) setComandasError(err.message);
    } finally {
      if (!silent) setLoadingComandas(false);
    }
  };

  const toggleComanda = async (idVenta, terminada) => {
    if (updatingComanda) return;
    setUpdatingComanda(idVenta);
    // Actualización optimista: la pantalla de preparación debe sentirse inmediata.
    setComandas(prev => prev.map(c => c.idVenta === idVenta
      ? { ...c, comandaTerminada: terminada, fechaComandaTerminada: terminada ? new Date().toISOString() : null }
      : c));
    try {
      const res = await fetch(`/api/sale/${idVenta}/comanda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminada })
      });
      if (!res.ok) throw new Error('toggle');
      const data = await res.json();
      setComandas(prev => prev.map(c => c.idVenta === idVenta
        ? { ...c, comandaTerminada: data.comandaTerminada, fechaComandaTerminada: data.fechaComandaTerminada }
        : c));
    } catch {
      // Si falla, revierte y recarga para no dejar la pantalla mintiendo.
      fetchComandas({ silent: true });
    } finally {
      setUpdatingComanda(null);
    }
  };

  // Carga y refresco periódico mientras la vista de comandas está activa.
  useEffect(() => {
    if (viewMode !== 'comandas' || (turnsEnabled && !activeTurn)) return;
    fetchComandas();
    const timer = setInterval(() => fetchComandas({ silent: true }), COMANDAS_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeTurn?.idTurno, turnsEnabled]);

  // Get active discount for a product
  const getProductPriceInfo = (prod) => {
    const activeDisc = discounts.find(d => {
      if (d.idProducto !== prod.idProducto || !d.activo) return false;
      const now = new Date();
      const start = new Date(d.fechaInicioDescuento);
      const end = d.fechaTerminoDescuento ? new Date(d.fechaTerminoDescuento) : null;
      return now >= start && (!end || now <= end);
    });

    if (activeDisc) {
      const discountVal = (prod.precio * activeDisc.porcentajeDescuento) / 100;
      const finalPrice = Math.round(prod.precio - discountVal);
      return {
        hasDiscount: true,
        originalPrice: prod.precio,
        finalPrice,
        discountPct: activeDisc.porcentajeDescuento
      };
    }

    return {
      hasDiscount: false,
      finalPrice: prod.precio
    };
  };

  // Cart operations
  const handleAddToCart = (prod) => {
    if (prod.stock !== null && prod.stock <= 0) return; // Out of stock

    const alternativeGroups = materialsEnabled ? buildAlternativeGroups(prod) : [];
    if (alternativeGroups.length > 0) {
      setProductToCustomize(prod);
      setMaterialChoices(Object.fromEntries(
        alternativeGroups.map(group => [group.idMateriaPrimaBase, group.idMateriaPrimaBase])
      ));
      return;
    }

    addConfiguredProductToCart(prod, []);
  };

  // Reescaneo del ticket interno: carga los productos de ese vale al carrito para modificarlo.
  const loadVentaIntoCart = async (idVenta) => {
    try {
      const res = await fetch(`/api/sale/${idVenta}/items`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible recuperar el vale.');
      const nuevoCarrito = data.items.map(d => {
        const prod = products.find(p => p.idProducto === d.idProducto)
          || { idProducto: d.idProducto, nombreProducto: d.nombreProducto, precio: d.precioNormal, stock: null };
        const materialSelections = (d.seleccionesMateriales || [])
          .filter(s => s.idMateriaPrimaBase != null)
          .map(s => ({ idMateriaPrimaBase: s.idMateriaPrimaBase, idMateriaPrimaSeleccionada: s.idMateriaPrima, nombreMateriaPrima: s.nombreMateriaPrima, recargo: s.recargo }));
        const extras = (d.ingredientesExtra || []).map(x => ({ idIngredienteExtra: x.idIngredienteExtra, nombre: x.nombre, precio: x.precio }));
        return {
          product: prod,
          quantity: d.cantidad,
          finalPrice: d.precioUnitario,
          normalPrice: d.precioNormal,
          materialSelections,
          extras,
          selectionSignature: getLineSignature(materialSelections, extras)
        };
      });
      setCart(nuevoCarrito);
      setEditingVentaId(idVenta);
      notify.success(`Editando vale #${idVenta}. Modifica y vuelve a generar el vale.`);
    } catch (err) {
      notify.error(err.message);
    }
  };

  // Lector de código de barras: un ticket interno (patrón VTA<id>) recupera el vale para
  // modificarlo; cualquier otro código se busca como SKU y se agrega al carrito.
  const handleBarcodeScan = (code) => {
    const normalized = code.trim();
    const ticket = /^VTA(\d+)$/i.exec(normalized);
    if (ticket) {
      loadVentaIntoCart(parseInt(ticket[1], 10));
      return;
    }
    const prod = products.find(p => p.activo && (p.codigoProducto || '').trim() === normalized);
    if (!prod) {
      notify.warning(`Código no reconocido: ${normalized}`);
      return;
    }
    handleAddToCart(prod);
  };

  // Activo solo en la vista de venta y sin modales de por medio, para no interferir.
  const scannerEnabled = viewMode === 'venta' && (!turnsEnabled || Boolean(activeTurn))
    && !showCheckoutModal && !showConsumoConfirm && !showHistoryModal && !pointPayment
    && !productToCustomize && !extrasEditor;
  useBarcodeScanner(handleBarcodeScan, { enabled: scannerEnabled });

  const addConfiguredProductToCart = (prod, materialSelections) => {
    const selectionSignature = getLineSignature(materialSelections, []);
    const priceInfo = getProductPriceInfo(prod);
    const surcharge = getSelectionSurcharge(materialSelections);
    const existingIndex = cart.findIndex(item =>
      item.product.idProducto === prod.idProducto && item.selectionSignature === selectionSignature
    );

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (prod.stock !== null && currentQty >= prod.stock) {
        notify.warning('No hay suficiente stock disponible.');
        return;
      }
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, {
        product: prod,
        quantity: 1,
        finalPrice: priceInfo.finalPrice + surcharge,
        normalPrice: prod.precio + surcharge,
        materialSelections,
        extras: [],
        selectionSignature
      }]);
    }
  };

  // Abre el editor de extras para una línea del carrito.
  const openExtrasEditor = (index) => {
    if (!materialsEnabled) return;
    setExtrasEditor({ index });
    setExtraChoices((cart[index].extras || []).map(extra => extra.idIngredienteExtra));
  };

  // Aplica los extras elegidos a la línea: recalcula precio y firma, y funde con una
  // línea gemela (mismo producto y misma configuración) si ya existe.
  const confirmExtrasEdit = () => {
    if (!extrasEditor) return;
    const { index } = extrasEditor;
    const line = cart[index];
    if (!line) { setExtrasEditor(null); return; }

    const extras = extrasCatalog
      .filter(extra => extraChoices.includes(extra.idIngredienteExtra))
      .map(extra => ({ idIngredienteExtra: extra.idIngredienteExtra, nombre: extra.nombre, precio: extra.precio }));

    const priceInfo = getProductPriceInfo(line.product);
    const surcharge = getSelectionSurcharge(line.materialSelections) + getExtrasSurcharge(extras);
    const signature = getLineSignature(line.materialSelections, extras);

    const twinIndex = cart.findIndex((item, i) =>
      i !== index && item.product.idProducto === line.product.idProducto && item.selectionSignature === signature);

    const updated = [...cart];
    if (twinIndex > -1) {
      const combinedQty = updated[twinIndex].quantity + line.quantity;
      if (line.product.stock !== null && combinedQty > line.product.stock) {
        notify.warning('No hay suficiente stock disponible para combinar estas líneas.');
        return;
      }
      updated[twinIndex] = { ...updated[twinIndex], quantity: combinedQty };
      updated.splice(index, 1);
    } else {
      updated[index] = {
        ...line,
        extras,
        finalPrice: priceInfo.finalPrice + surcharge,
        normalPrice: line.product.precio + surcharge,
        selectionSignature: signature
      };
    }
    setCart(updated);
    setExtrasEditor(null);
    setExtraChoices([]);
  };

  const confirmProductCustomization = () => {
    if (!productToCustomize) return;

    const materialSelections = buildAlternativeGroups(productToCustomize).map(group => {
      const selectedId = materialChoices[group.idMateriaPrimaBase] ?? group.idMateriaPrimaBase;
      const selectedOption = group.opciones.find(option => option.idMateriaPrima === selectedId) || group.opciones[0];
      return {
        idMateriaPrimaBase: group.idMateriaPrimaBase,
        idMateriaPrimaSeleccionada: selectedOption.idMateriaPrima,
        nombreMateriaPrima: selectedOption.nombreMateriaPrima,
        recargo: selectedOption.recargo
      };
    });

    addConfiguredProductToCart(productToCustomize, materialSelections);
    setProductToCustomize(null);
    setMaterialChoices({});
  };

  const handleUpdateQty = (index, delta) => {
    const updated = [...cart];
    const item = updated[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      if (item.product.stock !== null && newQty > item.product.stock) {
        notify.warning('No hay suficiente stock disponible.');
        return;
      }
      item.quantity = newQty;
    }
    setCart(updated);
  };

  const handleRemoveFromCart = (index) => {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  const calculateCartSubtotal = () => cart.reduce((total, item) => total + (item.finalPrice * item.quantity), 0);

  // Porcentaje efectivo (acotado al máximo del usuario) y monto de descuento.
  const descuentoPctEfectivo = () => Math.min(Math.max(Number(descuentoPct) || 0, 0), maxDescuento);
  const getDescuentoMonto = () => Math.round(calculateCartSubtotal() * descuentoPctEfectivo() / 100);

  // Total a cobrar ya con el descuento aplicado. El resto del flujo (pagos, impresión) lo usa tal cual.
  const calculateCartTotal = () => calculateCartSubtotal() - getDescuentoMonto();

  const filteredProducts = products.filter(p => {
    if (!p.activo) return false;
    if (categoryFilter === 'all') return true;
    return p.idCategoriaProducto === parseInt(categoryFilter);
  });

  // Agrupa los productos filtrados por categoría, respetando el orden del catálogo.
  const productGroups = (() => {
    const groups = new Map();
    categories.filter(c => c.activo).forEach(c => groups.set(c.idCategoriaProducto, {
      id: c.idCategoriaProducto,
      name: c.nombreCategoriaProducto,
      items: []
    }));
    const sinCategoria = { id: 'sin-categoria', name: 'Sin categoría', items: [] };
    filteredProducts.forEach(p => {
      const group = groups.get(p.idCategoriaProducto);
      if (group) group.items.push(p);
      else sinCategoria.items.push(p);
    });
    return [...groups.values(), sinCategoria].filter(g => g.items.length > 0);
  })();

  const renderProductCard = (prod) => {
    const priceInfo = getProductPriceInfo(prod);
    const isOutOfStock = prod.stock !== null && prod.stock <= 0;

    return (
      <div
        key={prod.idProducto}
        onClick={() => canAny('ventas.crear', 'ventas.crear_point') && !isOutOfStock && handleAddToCart(prod)}
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          cursor: (isOutOfStock || !canAny('ventas.crear', 'ventas.crear_point')) ? 'not-allowed' : 'pointer',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          opacity: isOutOfStock ? 0.5 : 1,
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          if (!isOutOfStock) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(0, 0, 0, 0.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOutOfStock) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
          }
        }}
      >
        {/* Product Thumbnail */}
        <div style={{
          width: '100%',
          height: '110px',
          borderRadius: '8px',
          backgroundColor: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: '10px'
        }}>
          {prod.imagenBase64 ? (
            <img
              src={`data:image/png;base64,${prod.imagenBase64}`}
              alt={prod.nombreProducto}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Coffee size={28} color="#94a3b8" />
          )}
        </div>

        {/* Product Name */}
        <div style={{
          fontSize: '0.85rem',
          fontWeight: '700',
          color: 'var(--text-main)',
          minHeight: '34px',
          lineHeight: '1.25',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginBottom: '6px'
        }}>
          {prod.nombreProducto}
        </div>

        {/* Stock indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.72rem',
          color: isOutOfStock ? '#b91c1c' : 'var(--text-muted)',
          fontWeight: '600',
          marginBottom: '8px'
        }}>
          <Package size={12} />
          <span>
            {prod.stock !== null ? `Stock: ${prod.stock}` : 'Usa Receta'}
          </span>
        </div>

        {/* Price Section */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column' }}>
          {priceInfo.hasDiscount ? (
            <>
              <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: '700' }}>
                Oferta -{priceInfo.discountPct}%
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#15803d' }}>
                  ${priceInfo.finalPrice.toLocaleString('es-CL')}
                </span>
                <span style={{ fontSize: '0.75rem', textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                  ${priceInfo.originalPrice.toLocaleString('es-CL')}
                </span>
              </div>
            </>
          ) : (
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-main)' }}>
              ${prod.precio.toLocaleString('es-CL')}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Receta (ingredientes fijos) de una línea de comanda, si el producto la usa.
  const renderComandaRecipe = (item) => {
    if (!materialsEnabled) return null;
    const prod = productById[item.idProducto];
    if (!prod?.requiereReceta || !prod?.tieneRecetaConfigurada) return null;
    const entry = recipeCache[item.idProducto];

    if (!entry || entry.status === 'loading') {
      return (
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Cargando receta…
        </span>
      );
    }
    if (!entry.materiales || entry.materiales.length === 0) return null;

    return (
      <div style={{ marginTop: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', color: COMANDA_ACCENT_DARK }}>
          <ChefHat size={13} />
          <span style={{ fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Receta{entry.nombreBase ? ` · base ${entry.nombreBase}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          {entry.materiales.map(m => (
            <span
              key={m.idMateriaPrima}
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: COMANDA_ACCENT_DARK,
                backgroundColor: 'rgba(13, 148, 136, 0.10)',
                border: '1px solid rgba(13, 148, 136, 0.25)',
                borderRadius: '999px',
                padding: '2px 8px'
              }}
            >
              {m.nombreMaterial}
              {m.cantidadRequerida != null && m.abreviacionUnidad
                ? ` · ${m.cantidadRequerida} ${m.abreviacionUnidad}`
                : ''}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderComandaCard = (c) => {
    const terminada = c.comandaTerminada;
    const accent = terminada ? COMANDA_ACCENT : COMANDA_PENDING;
    const hora = new Date(c.fechaVenta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <div
        key={c.idVenta}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          borderTop: `5px solid ${accent}`,
          boxShadow: terminada
            ? '0 2px 8px rgba(0,0,0,0.05)'
            : '0 8px 22px rgba(122, 34, 71, 0.16)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          opacity: terminada ? 0.85 : 1,
          transition: 'box-shadow 0.2s ease, opacity 0.2s ease'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              backgroundColor: terminada ? 'rgba(13,148,136,0.12)' : 'rgba(245,158,11,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent
            }}>
              {terminada ? <CheckCircle2 size={18} /> : <ClipboardList size={18} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Comanda #{c.idVenta}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <Clock size={11} /> {hora}
              </span>
            </div>
          </div>
          <span style={{
            fontSize: '0.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
            color: '#ffffff', backgroundColor: accent, borderRadius: '999px', padding: '3px 10px'
          }}>
            {terminada ? 'Terminada' : 'Pendiente'}
          </span>
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          {(c.items || []).map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', gap: '10px',
              paddingBottom: idx < c.items.length - 1 ? '12px' : 0,
              borderBottom: idx < c.items.length - 1 ? '1px dashed #f1d5e4' : 'none'
            }}>
              <span style={{
                flexShrink: 0, minWidth: '30px', height: '26px', padding: '0 6px',
                borderRadius: '8px', backgroundColor: COMANDA_BADGE_BG, color: 'var(--accent-color)',
                fontSize: '0.85rem', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {item.cantidad}×
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {item.nombreProducto}
                </span>

                {/* Alternativas elegidas por el cliente */}
                {(item.seleccionesMateriales || []).length > 0 && (
                  <div style={{ marginTop: '3px' }}>
                    {item.seleccionesMateriales.map(sel => (
                      <span key={sel.idMateriaPrima} style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                        · {sel.nombreMateriaPrima}
                      </span>
                    ))}
                  </div>
                )}

                {/* Ingredientes extra */}
                {(item.ingredientesExtra || []).length > 0 && (
                  <div style={{ marginTop: '3px' }}>
                    {item.ingredientesExtra.map(ex => (
                      <span key={`ex-${ex.idIngredienteExtra}`} style={{ display: 'block', fontSize: '0.7rem', color: COMANDA_ACCENT_DARK, fontWeight: 600, lineHeight: 1.35 }}>
                        + {ex.nombre}
                      </span>
                    ))}
                  </div>
                )}

                {/* Receta del producto */}
                {renderComandaRecipe(item)}
              </div>
            </div>
          ))}
        </div>

        {/* Action */}
        {can('ventas.comandas.gestionar') && (
          <button
            type="button"
            disabled={updatingComanda === c.idVenta}
            onClick={() => toggleComanda(c.idVenta, !terminada)}
            style={{
              marginTop: '14px', width: '100%', padding: '10px',
              borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800,
              cursor: updatingComanda === c.idVenta ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              transition: 'all 0.2s ease',
              border: terminada ? `1.5px solid ${COMANDA_ACCENT}` : 'none',
              backgroundColor: terminada ? '#ffffff' : COMANDA_ACCENT,
              color: terminada ? COMANDA_ACCENT_DARK : '#ffffff',
              opacity: updatingComanda === c.idVenta ? 0.7 : 1
            }}
          >
            {terminada
              ? (<><RotateCcw size={15} /> Reabrir comanda</>)
              : (<><Check size={16} /> Terminar comanda</>)}
          </button>
        )}
      </div>
    );
  };

  const renderComandasView = () => {
    const pendientes = comandas.filter(c => !c.comandaTerminada);
    const terminadas = comandas.filter(c => c.comandaTerminada);

    return (
      <div style={{
        height: salesContextReady ? 'calc(100vh - 110px)' : 'calc(100vh - 170px)',
        overflowY: 'auto',
        backgroundColor: COMANDA_BACKGROUND,
        ...(comandasBackground || {}),
        backgroundAttachment: 'fixed',
        padding: '24px',
        opacity: salesContextReady ? 1 : 0.5,
        pointerEvents: salesContextReady ? 'auto' : 'none'
      }}>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .comanda-spin { animation: spin 0.9s linear infinite; }`}</style>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '9px', margin: 0, fontSize: '1.3rem', fontWeight: 800, color: COMANDA_TEXT }}>
              <ClipboardList size={22} /> {turnsEnabled ? 'Comandas del turno' : 'Comandas'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => fetchComandas()}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              backgroundColor: '#ffffff', color: 'var(--accent-color)',
              border: `1px solid ${COMANDA_TEXT}`, borderRadius: '10px',
              padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} className={loadingComandas ? 'comanda-spin' : ''} /> Actualizar
          </button>
        </div>

        {comandasError && (
          <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '10px', textTransform: 'none', marginBottom: '16px', fontSize: '0.82rem' }}>
            <AlertCircle size={15} /> <span>{comandasError}</span>
          </div>
        )}

        {loadingComandas && comandas.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <div style={{
              border: '4px solid rgba(122, 34, 71, 0.15)', width: '46px', height: '46px',
              borderRadius: '50%', borderLeftColor: COMANDA_TEXT, animation: 'spin 1s linear infinite'
            }} />
          </div>
        ) : (
          <>
            {/* Pendientes */}
            {pendientes.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                padding: '50px 24px', color: COMANDA_TEXT,
                backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: '16px',
                border: '1px dashed rgba(122,34,71,0.35)'
              }}>
                <CheckCircle2 size={40} style={{ opacity: 0.65 }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                  No hay comandas pendientes. ¡Todo al día!
                </span>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px'
              }}>
                {pendientes.map(renderComandaCard)}
              </div>
            )}

            {/* Historial de comandas del turno */}
            {terminadas.length > 0 && (
              <div style={{ marginTop: '28px' }}>
                <button
                  type="button"
                  onClick={() => setShowComandaHistory(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: COMANDA_TEXT, fontSize: '0.95rem', fontWeight: 800, padding: 0, marginBottom: '14px'
                  }}
                >
                  <History size={18} />
                  {turnsEnabled ? 'Historial de comandas del turno' : 'Historial de comandas'} ({terminadas.length})
                  <span style={{ fontSize: '0.75rem' }}>{showComandaHistory ? '▲' : '▼'}</span>
                </button>
                {showComandaHistory && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '16px'
                  }}>
                    {terminadas.map(renderComandaCard)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Falta calibración: hay en el carrito alguna preparación que depende del café por calibración
  // y el turno todavía no tiene ninguna extracción registrada. El backend además lo bloquea.
  const faltaCalibracion = turnsEnabled && logbookIncludesCalibration && cart.some(item => item.product?.requiereCalibracion)
    && calibracionTurno?.tieneCalibracion === false;

  const salesContextReady = !turnsEnabled || Boolean(activeTurn);
  // Las comandas pertenecen al turno abierto de Punto de venta.
  const showViewSwitch = commandsEnabled && salesContextReady && can('ventas.comandas.gestionar');
  const enComandas = viewMode === 'comandas';
  // Fondos personalizados por sección (si están habilitados en Identidad).
  const ventasBackground = getBackgroundStyle('ventas');
  const comandasBackground = getBackgroundStyle('comandas');

  // Segmento del switch. La costura entre ambos es diagonal (clip-path), no recta.
  const renderViewSwitch = () => (
    <div style={{
      display: 'flex',
      position: 'relative',
      height: '32px',
      width: '224px',
      borderRadius: '9px',
      background: 'rgba(255,255,255,0.16)',
      border: '1px solid rgba(255,255,255,0.30)',
      overflow: 'hidden',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.12)'
    }}>
      <button
        type="button"
        onClick={() => setViewMode('venta')}
        style={{
          flex: 1, border: 'none', cursor: 'pointer', font: 'inherit',
          fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.02em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          paddingRight: '14px',
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)',
          backgroundColor: enComandas ? 'transparent' : '#ffffff',
          color: enComandas ? 'rgba(255,255,255,0.85)' : 'var(--primary-color)',
          transition: 'background-color .2s ease, color .2s ease',
          zIndex: enComandas ? 1 : 2
        }}
      >
        <ShoppingBag size={14} /> Venta
      </button>
      <button
        type="button"
        onClick={() => setViewMode('comandas')}
        style={{
          flex: 1, border: 'none', cursor: 'pointer', font: 'inherit',
          fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.02em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          paddingLeft: '14px', marginLeft: '-16px',
          clipPath: 'polygon(16px 0, 100% 0, 100% 100%, 0 100%)',
          backgroundColor: enComandas ? COMANDA_BACKGROUND : 'transparent',
          color: enComandas ? COMANDA_TEXT : 'rgba(255,255,255,0.85)',
          transition: 'background-color .2s ease, color .2s ease',
          zIndex: enComandas ? 2 : 1
        }}
      >
        <ClipboardList size={14} /> Comandas
      </button>
    </div>
  );

  return (
    <div style={{
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f8fafc',
      color: 'var(--text-main)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Navbar */}
      <header className="pos-header" style={{
        height: '110px',
        backgroundColor: 'var(--primary-color)',
        boxShadow: '0 4px 16px rgba(var(--primary-rgb), 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px',
        color: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 90,
        boxSizing: 'border-box'
      }}>
        {/* Regresa al contexto anterior sin pasar por la redirección automática de '/'. */}
        <button
          type="button"
          onClick={() => navigate(turnsEnabled ? '/turn' : '/welcome')}
          title={turnsEnabled ? 'Volver al turno' : 'Volver al inicio'}
          aria-label={turnsEnabled ? 'Volver al turno' : 'Volver al inicio'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxSizing: 'border-box'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
        >
          <ArrowLeft size={18} />
          <Home size={18} />
        </button>

        {/* Center: Brand Logo + switch Venta/Comandas debajo del logo */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: showViewSwitch ? '6px' : '0'
        }}>
          <BrandLogo location="punto_venta" maxHeight={showViewSwitch ? 58 : 90} compact light />
          {showViewSwitch && renderViewSwitch()}
        </div>

        {/* Right: User Profile Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="pos-user-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: '700' }}>
              {user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario}
            </span>
            <span style={{ opacity: 0.75 }}>
              {turnsEnabled ? 'Operador con turno activo' : 'Usuario activo'}
            </span>
          </div>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <User size={18} />
          </div>
        </div>
      </header>

      {/* Main View Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
          <div style={{
            border: '4px solid rgba(var(--primary-rgb), 0.1)',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            borderLeftColor: 'var(--primary-color)',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : enComandas ? (
        renderComandasView()
      ) : (
        <>
          {/* ACTIVE POS SCREEN */}
          <div className="pos-layout" style={{
            height: salesContextReady ? 'calc(100vh - 110px)' : 'calc(100vh - 170px)',
            overflow: 'hidden',
            // Fondo personalizado de venta si está habilitado.
            ...(ventasBackground || {
              backgroundColor: '#f8fafc',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }),
            backgroundAttachment: 'fixed',
            opacity: salesContextReady ? 1 : 0.5,
            pointerEvents: salesContextReady ? 'auto' : 'none',
            userSelect: salesContextReady ? 'auto' : 'none',
            transition: 'all 0.3s ease'
          }}>
            {/* LEFT COLUMN: Catalog */}
            <div className="pos-catalog" style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflowY: 'auto'
            }}>
              {/* Category Filter Pills */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                overflowX: 'auto',
                flexShrink: 0,
                paddingTop: '4px',
                paddingBottom: '10px'
              }}>
                <button
                  onClick={() => setCategoryFilter('all')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: categoryFilter === 'all' ? 'var(--primary-color)' : '#ffffff',
                    color: categoryFilter === 'all' ? '#ffffff' : 'var(--text-main)',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Todos
                </button>
                {categories.filter(c => c.activo).map(cat => (
                  <button
                    key={cat.idCategoriaProducto}
                    onClick={() => setCategoryFilter(cat.idCategoriaProducto)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: categoryFilter === cat.idCategoriaProducto ? 'var(--primary-color)' : '#ffffff',
                      color: categoryFilter === cat.idCategoriaProducto ? '#ffffff' : 'var(--text-main)',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cat.nombreCategoriaProducto}
                  </button>
                ))}
              </div>

              {/* Catalog Grid */}
              {filteredProducts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifycontent: 'center', flex: 1, padding: '40px', color: 'var(--text-muted)' }}>
                  <Coffee size={40} style={{ opacity: 0.5 }} />
                  <span style={{ marginTop: '12px' }}>No hay productos activos en esta categoría</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '20px' }}>
                  {productGroups.map(group => (
                    <div key={group.id}>
                      {/* Separador de categoría */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, whiteSpace: 'nowrap' }}>
                          {group.name}
                        </h3>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '16px'
                      }}>
                        {group.items.map(prod => renderProductCard(prod))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overlay del carrito (solo móvil, con panel abierto) */}
            {cartOpen && (
              <button
                type="button"
                className="pos-cart-overlay"
                aria-label="Cerrar carrito"
                onClick={() => setCartOpen(false)}
              />
            )}

            {/* RIGHT COLUMN: Cart Summary */}
            <div className={`pos-cart${cartOpen ? ' is-open' : ''}`} style={{
              backgroundColor: '#ffffff',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden'
            }}>
              {/* Cerrar panel (solo móvil) */}
              <button
                type="button"
                className="pos-cart-close"
                aria-label="Cerrar carrito"
                onClick={() => setCartOpen(false)}
              >
                <X size={18} />
              </button>

              {/* Header info */}
              <div style={{
                padding: '20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShoppingBag size={20} color="var(--primary-color)" />
                  <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>
                    Resumen de Venta
                  </h3>
                </div>
              </div>

              {/* Cart Items List */}
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '16px'
              }}>
                {cart.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--text-muted)',
                    gap: '10px'
                  }}>
                    <ShoppingBag size={32} style={{ opacity: 0.3 }} />
                    <span style={{ fontSize: '0.85rem' }}>El carrito está vacío</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {cart.map((item, index) => (
                      <div key={`${item.product.idProducto}-${item.selectionSignature}`} style={{
                        display: 'flex',
                        gap: '10px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid #f1f5f9'
                      }}>
                        {/* Thumbnail */}
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          backgroundColor: '#f1f5f9',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}>
                          {item.product.imagenBase64 ? (
                            <img
                              src={`data:image/png;base64,${item.product.imagenBase64}`}
                              alt={item.product.nombreProducto}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Coffee size={16} color="#94a3b8" />
                            </div>
                          )}
                        </div>

                        {/* Product Detail */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            display: 'block',
                            color: 'var(--text-main)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {item.product.nombreProducto}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: '700' }}>
                            ${item.finalPrice.toLocaleString('es-CL')}
                          </span>
                          {item.materialSelections.length > 0 && (
                            <span style={{ display: 'block', marginTop: '2px', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.25 }}>
                              {item.materialSelections.map(selection => (
                                <span key={selection.idMateriaPrimaBase} style={{ display: 'block' }}>
                                  {selection.nombreMateriaPrima}
                                  {selection.recargo > 0 ? ` (+$${selection.recargo.toLocaleString('es-CL')})` : ''}
                                </span>
                              ))}
                            </span>
                          )}
                          {item.extras && item.extras.length > 0 && (
                            <span style={{ display: 'block', marginTop: '2px', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.25 }}>
                              {item.extras.map(extra => (
                                <span key={extra.idIngredienteExtra} style={{ display: 'block' }}>
                                  + {extra.nombre}
                                  {extra.precio > 0 ? ` (+$${extra.precio.toLocaleString('es-CL')})` : ''}
                                </span>
                              ))}
                            </span>
                          )}
                          {materialsEnabled && item.product.aceptaIngredientesExtra && extrasCatalog.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openExtrasEditor(index)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '5px',
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--primary-color)', fontSize: '0.7rem', fontWeight: '700'
                              }}
                            >
                              <Plus size={11} /> {item.extras && item.extras.length > 0 ? 'Editar extras' : 'Agregar extras'}
                            </button>
                          )}
                        </div>

                        {/* Quantity Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleUpdateQty(index, -1)}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Minus size={10} />
                          </button>
                          <span style={{ fontSize: '0.8rem', fontWeight: '700', minWidth: '16px', textAlign: 'center' }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQty(index, 1)}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Plus size={10} />
                          </button>
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleRemoveFromCart(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total Summary Block */}
              <div style={{
                padding: '20px',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc'
              }}>
                {puedeDescontar && !cajaEnabled && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      <span>Subtotal:</span>
                      <span>${calculateCartSubtotal().toLocaleString('es-CL')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.9rem' }}>Descuento (máx. {maxDescuento.toLocaleString('es-CL')}%):</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min="0"
                          max={maxDescuento}
                          step="0.01"
                          value={descuentoPct}
                          onChange={(e) => {
                            const raw = Number(e.target.value) || 0;
                            setDescuentoPct(Math.min(Math.max(raw, 0), maxDescuento));
                          }}
                          style={{ width: '80px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontSize: '0.9rem' }}
                        />
                        <span style={{ fontWeight: 700 }}>%</span>
                      </div>
                    </div>
                    {getDescuentoMonto() > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#b45309', marginBottom: '8px' }}>
                        <span>Descuento aplicado:</span>
                        <span>-${getDescuentoMonto().toLocaleString('es-CL')}</span>
                      </div>
                    )}
                  </>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.05rem',
                  fontWeight: '800',
                  marginBottom: '16px'
                }}>
                  <span>Total a Pagar:</span>
                  <span style={{ color: 'var(--primary-color)' }}>
                    ${calculateCartTotal().toLocaleString('es-CL')}
                  </span>
                </div>

                {faltaCalibracion && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', padding: '10px 12px', fontSize: '0.8rem', marginBottom: '14px', lineHeight: 1.35 }}>
                    <Coffee size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>El carrito incluye preparaciones con café por calibración. Registra una extracción en la bitácora del turno antes de cobrar.</span>
                  </div>
                )}

                {editingVentaId && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', marginBottom: '10px', borderRadius: '8px', backgroundColor: 'rgba(217, 119, 6, 0.12)', border: '1px solid rgba(217, 119, 6, 0.4)', fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>
                    <span>Editando vale #{editingVentaId}</span>
                    <button type="button" onClick={() => { setCart([]); setEditingVentaId(null); }}
                      style={{ background: 'none', border: 'none', color: '#92400e', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}>
                      Cancelar
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                  {/* Historial: ícono, a la izquierda del botón de confirmar venta */}
                  {salesContextReady && can('ventas.propias.ver') && (
                    <button
                      type="button"
                      onClick={handleOpenHistory}
                      title={turnsEnabled ? 'Historial de ventas del turno' : 'Historial de mis ventas'}
                      aria-label={turnsEnabled ? 'Historial de ventas del turno' : 'Historial de mis ventas'}
                      style={{
                        flexShrink: 0,
                        width: '46px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'transparent',
                        color: 'var(--primary-color)',
                        border: '1.5px solid var(--primary-color)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 77, 38, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <History size={18} />
                    </button>
                  )}

                  {canAny('ventas.crear', 'ventas.crear_point') && <button
                    disabled={cart.length === 0 || faltaCalibracion || (cajaEnabled && submittingSale)}
                    onClick={() => {
                      setError('');
                      if (cajaEnabled) {
                        // Con Caja el vendedor no cobra: genera el vale y lo envía a caja.
                        handleGenerarVale();
                        return;
                      }
                      const total = calculateCartTotal();
                      const defaultMethod = can('ventas.crear') ? 1 : METODO_TARJETA;
                      setPaymentAllocations({ 1: defaultMethod === 1 ? total : '', 4: '', [METODO_TARJETA]: defaultMethod === METODO_TARJETA ? total : '' });
                      setActiveMethods([defaultMethod]);
                      setCashReceived('');
                      setCartOpen(false);
                      setShowCheckoutModal(true);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: 'var(--primary-color)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '700',
                      cursor: (cart.length === 0 || faltaCalibracion) ? 'not-allowed' : 'pointer',
                      opacity: (cart.length === 0 || faltaCalibracion) ? 0.6 : 1,
                      transition: 'background-color 0.2s ease',
                      fontSize: '0.9rem'
                    }}
                    onMouseEnter={(e) => {
                      if (cart.length > 0 && !faltaCalibracion) e.currentTarget.style.backgroundColor = 'var(--primary-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (cart.length > 0 && !faltaCalibracion) e.currentTarget.style.backgroundColor = 'var(--primary-color)';
                    }}
                  >
                    {cajaEnabled ? (editingVentaId ? 'Actualizar vale' : 'Generar vale') : 'Continuar al Pago'}
                  </button>}
                  {turnsEnabled && can('ventas.crear') && <button
                    type="button"
                    disabled={cart.length === 0 || faltaCalibracion || submittingSale}
                    onClick={() => { setError(''); setShowConsumoConfirm(true); }}
                    title="Registrar el carrito como consumo del empleado (por cobrar, cortesía automática)"
                    aria-label="Consumo de empleado"
                    style={{
                      flex: '0 0 auto',
                      width: '48px',
                      padding: '12px',
                      backgroundColor: '#fff',
                      color: 'var(--primary-color)',
                      border: '1.5px solid var(--primary-color)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: (cart.length === 0 || faltaCalibracion || submittingSale) ? 'not-allowed' : 'pointer',
                      opacity: (cart.length === 0 || faltaCalibracion || submittingSale) ? 0.6 : 1
                    }}
                  >
                    <BookOpen size={18} />
                  </button>}
                </div>
              </div>
            </div>
          </div>

          {/* Barra flotante para abrir el carrito (solo móvil/tablet angosto) */}
          {canAny('ventas.crear', 'ventas.crear_point') && <button
            type="button"
            className="pos-cart-bar"
            disabled={!salesContextReady}
            onClick={() => setCartOpen(true)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingBag size={18} />
              Ver carrito ({cart.reduce((count, item) => count + item.quantity, 0)})
            </span>
            <span>${calculateCartTotal().toLocaleString('es-CL')}</span>
          </button>}
        </>
      )}

      {/* MODAL: elección excluyente de materias primas de la receta */}
      {materialsEnabled && productToCustomize && (
        <div className="modal-overlay" style={{ zIndex: 1050 }}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '28px' }}>
            <button
              type="button"
              className="btn"
              style={{ position: 'absolute', right: '18px', top: '18px', padding: '6px', background: 'none' }}
              onClick={() => { setProductToCustomize(null); setMaterialChoices({}); }}
              aria-label="Cerrar"
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.3rem', marginBottom: '6px', fontWeight: '700', paddingRight: '30px' }}>
              Seleccione tipo
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>{productToCustomize.nombreProducto}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {buildAlternativeGroups(productToCustomize).map(group => (
                <fieldset key={group.idMateriaPrimaBase} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: '0.84rem', fontWeight: '800', marginBottom: '8px' }}>
                    {group.nombreMateriaPrimaBase}
                  </legend>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {group.opciones.map(option => {
                      const selected = materialChoices[group.idMateriaPrimaBase] === option.idMateriaPrima;
                      return (
                        <label key={option.idMateriaPrima} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                          padding: '11px 12px', borderRadius: '8px', cursor: 'pointer',
                          border: `1.5px solid ${selected ? 'var(--primary-color)' : 'var(--panel-border)'}`,
                          backgroundColor: selected ? 'rgba(0, 77, 38, 0.05)' : '#fff'
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '0.84rem', fontWeight: selected ? '750' : '600' }}>
                            <input
                              type="radio"
                              name={`material-${group.idMateriaPrimaBase}`}
                              checked={selected}
                              onChange={() => setMaterialChoices(previous => ({
                                ...previous,
                                [group.idMateriaPrimaBase]: option.idMateriaPrima
                              }))}
                            />
                            {option.nombreMateriaPrima}
                          </span>
                          <strong style={{ color: option.recargo > 0 ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {option.recargo > 0 ? `+$${option.recargo.toLocaleString('es-CL')}` : 'Sin recargo'}
                          </strong>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Precio unitario</span>
                <strong style={{ fontSize: '1.2rem', color: 'var(--primary-color)' }}>
                  ${(getProductPriceInfo(productToCustomize).finalPrice + buildAlternativeGroups(productToCustomize).reduce((total, group) => {
                    const selectedId = materialChoices[group.idMateriaPrimaBase] ?? group.idMateriaPrimaBase;
                    return total + (group.opciones.find(option => option.idMateriaPrima === selectedId)?.recargo || 0);
                  }, 0)).toLocaleString('es-CL')}
                </strong>
              </div>
              <button type="button" className="btn btn-primary" onClick={confirmProductCustomization}>
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ingredientes extra por línea del carrito */}
      {materialsEnabled && extrasEditor && cart[extrasEditor.index] && (() => {
        const editorLine = cart[extrasEditor.index];
        const admitidos = extrasCatalog;
        const surchargeTotal = admitidos
          .filter(extra => extraChoices.includes(extra.idIngredienteExtra))
          .reduce((total, extra) => total + (extra.precio || 0), 0);
        return (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-content" style={{ maxWidth: '460px', padding: '28px', position: 'relative' }}>
              <button type="button" onClick={() => { setExtrasEditor(null); setExtraChoices([]); }} aria-label="Cerrar" style={{ position: 'absolute', top: '18px', right: '18px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} color="currentColor" />
              </button>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '6px', fontWeight: '700', paddingRight: '30px' }}>
                Seleccione extras
              </h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>{editorLine.product.nombreProducto}</div>

              <div style={{ display: 'grid', gap: '8px' }}>
                {admitidos.map(extra => {
                  const selected = extraChoices.includes(extra.idIngredienteExtra);
                  return (
                    <label key={extra.idIngredienteExtra} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                      padding: '11px 12px', borderRadius: '8px', cursor: 'pointer',
                      border: `1.5px solid ${selected ? 'var(--primary-color)' : 'var(--panel-border)'}`,
                      backgroundColor: selected ? 'rgba(0, 77, 38, 0.05)' : '#fff'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '0.84rem', fontWeight: selected ? '750' : '600' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setExtraChoices(previous => selected
                            ? previous.filter(id => id !== extra.idIngredienteExtra)
                            : [...previous, extra.idIngredienteExtra])}
                        />
                        {extra.nombre}
                      </span>
                      <strong style={{ color: extra.precio > 0 ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {extra.precio > 0 ? `+$${extra.precio.toLocaleString('es-CL')}` : 'Sin recargo'}
                      </strong>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Recargo por extras</span>
                  <strong style={{ fontSize: '1.2rem', color: 'var(--primary-color)' }}>
                    +${surchargeTotal.toLocaleString('es-CL')}
                  </strong>
                </div>
                <button type="button" className="btn btn-primary" onClick={confirmExtrasEdit}>
                  Guardar extras
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: Confirmación de anulación de venta */}
      {ventaAAnular && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '430px', padding: '28px' }}>
            {resultadoAnulacion ? (
              <>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '12px', fontWeight: '700' }}>
                  Venta #{resultadoAnulacion.idVenta} anulada
                </h3>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '12px' }}>
                  {resultadoAnulacion.mensaje}
                </p>

                {resultadoAnulacion.montoEfectivoADevolver > 0 && (
                  <div className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '14px', fontSize: '0.8rem' }}>
                    <AlertCircle size={14} />
                    <span>Entrega ${resultadoAnulacion.montoEfectivoADevolver.toLocaleString('es-CL')} desde la caja.</span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => { setResultadoAnulacion(null); setVentaAAnular(null); }}
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '10px', fontWeight: '700' }}>
              Anular venta #{ventaAAnular.idVenta}
            </h3>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '14px' }}>Total: <strong>${ventaAAnular.montoTotal.toLocaleString('es-CL')}</strong></div>

            {montoPorMetodos(ventaAAnular, [2, 3]) > 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '10px' }}>
                Se reembolsarán <strong>${montoPorMetodos(ventaAAnular, [2, 3]).toLocaleString('es-CL')}</strong> a la tarjeta
                automáticamente. Si Mercado Pago rechaza la devolución, la venta no se anula.
              </div>
            )}

            {montoPorMetodos(ventaAAnular, [1, 4]) > 0 && (
              <div className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '12px', fontSize: '0.78rem' }}>
                <AlertCircle size={14} />
                <span>Debes devolver ${montoPorMetodos(ventaAAnular, [1, 4]).toLocaleString('es-CL')} manualmente (efectivo o transferencia).</span>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '18px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={devolverStockAnulacion}
                onChange={(e) => setDevolverStockAnulacion(e.target.checked)}
              />
              Devolver los productos al inventario
            </label>

            {error && (
              <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '12px', fontSize: '0.78rem' }}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={anulandoVenta}
                onClick={() => { setVentaAAnular(null); setError(''); }}
              >
                Volver
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, cursor: anulandoVenta ? 'not-allowed' : 'pointer', opacity: anulandoVenta ? 0.6 : 1 }}
                disabled={anulandoVenta}
                onClick={handleAnularVenta}
              >
                {anulandoVenta ? 'Anulando...' : 'Anular venta'}
              </button>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Cobro con tarjeta en la terminal Point.
          Va por encima del modal de venta, que queda abierto detrás para conservar
          el carrito si el pago se rechaza. */}
      {pointPayment && pointPayment.estado !== 'confirmado' && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '420px', padding: '30px', textAlign: 'center' }}>
            {pointPayment.estado === 'esperando' ? (
              <>
                <CreditCard size={42} color="var(--primary-color)" style={{ marginBottom: '14px' }} />

                <h3 style={{ fontSize: '1.25rem', marginBottom: '6px', fontWeight: '700' }} className="text-solid">
                  Esperando pago en la terminal
                </h3>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Venta #{pointPayment.idVenta}
                </p>

                <div style={{ fontSize: '2.1rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '6px' }}>
                  ${pointPayment.montoTarjeta.toLocaleString('es-CL')}
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Complete el pago en la terminal.</div>

                {pointDemorado && (
                  <div className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '12px', fontSize: '0.8rem' }}>
                    <AlertCircle size={14} />
                  <span>Cobro demorado.</span>
                  </div>
                )}

                {pointPayment.mensaje && (
                  <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '12px', fontSize: '0.8rem' }}>
                    <AlertCircle size={14} />
                    <span>{pointPayment.mensaje}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', cursor: cancelandoPoint ? 'not-allowed' : 'pointer', opacity: cancelandoPoint ? 0.6 : 1 }}
                  disabled={cancelandoPoint}
                  onClick={handleCancelarCobroPoint}
                >
                  {cancelandoPoint ? 'Cancelando...' : 'Cancelar cobro'}
                </button>
              </>
            ) : (
              <>
                <AlertCircle size={42} color="var(--danger-color)" style={{ marginBottom: '14px' }} />

                <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', fontWeight: '700' }}>
                  Pago no completado
                </h3>

                <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '10px' }}>
                  {pointPayment.mensaje}
                </p>


                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={cerrarAvisoPointRechazado}
                >
                  Entendido
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Confirmar consumo de empleado */}
      {showConsumoConfirm && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '440px', padding: '28px', textAlign: 'center' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(0,76,37,0.1)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <BookOpen size={26} color="var(--primary-color)" />
            </div>
            <h3 style={{ marginBottom: '8px' }}>Registrar consumo de empleado</h3>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>Confirme el consumo.</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={submittingSale} onClick={() => setShowConsumoConfirm(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={submittingSale} onClick={handleCreateConsumption}>{submittingSale ? 'Registrando…' : 'Confirmar consumo'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Resultado del consumo de empleado */}
      {consumoResult && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '420px', padding: '30px', textAlign: 'center' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <CheckCircle2 size={30} color="#16a34a" />
            </div>
            <h3 style={{ marginBottom: '6px' }}>Consumo registrado</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Gift size={16} /> Cortesía</span>
                <span>${Number(consumoResult.montoCortesia).toLocaleString('es-CL')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: '#e0f2fe', color: '#075985', fontWeight: 700 }}>
                <span>A pagar</span>
                <span>${Number(consumoResult.montoAdeudado).toLocaleString('es-CL')}</span>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setConsumoResult(null)}>Listo</button>
          </div>
        </div>
      )}

      {/* MODAL: Checkout / Registrar Pago */}
      {showCheckoutModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px', padding: '30px' }}>
            <button
              type="button"
              className="btn"
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none', cursor: submittingSale ? 'not-allowed' : 'pointer', opacity: submittingSale ? 0.5 : 1 }}
              disabled={submittingSale}
              onClick={() => {
                setShowCheckoutModal(false);
                setError('');
              }}
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.4rem', marginBottom: '20px', fontWeight: '700' }} className="text-solid">
              Registrar Pago
            </h3>

            {error && (
              <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '16px', fontSize: '0.8rem' }}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateSale}>
              {/* Total display */}
              <div style={{
                backgroundColor: 'var(--bg-light)',
                border: '1px solid var(--panel-border)',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'center',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '600' }}>Total a cobrar:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                  ${calculateCartTotal().toLocaleString('es-CL')}
                </span>
              </div>

              {/* Active Payment Methods Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px' }}>
                  {isSplitPayment ? 'Medios de Pago Seleccionados:' : 'Medio de Pago:'}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {[
                    { id: 1, label: 'Efectivo' },
                    { id: METODO_TARJETA, label: 'Tarjeta' },
                    { id: 4, label: 'Transferencia' }
                  ].filter(m => m.id === METODO_TARJETA ? can('ventas.crear_point') : can('ventas.crear')).map(m => {
                    const isActive = activeMethods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={submittingSale || (m.id === METODO_TARJETA && (pointAvailability.loading || !pointAvailability.available))}
                        onClick={() => toggleMethod(m.id)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: '1.5px solid ' + (isActive ? 'var(--primary-color)' : 'var(--panel-border)'),
                          backgroundColor: isActive ? 'rgba(0, 77, 38, 0.05)' : '#ffffff',
                          color: isActive ? 'var(--primary-color)' : 'var(--text-main)',
                          fontWeight: isActive ? '800' : '600',
                          fontSize: '0.85rem',
                          cursor: submittingSale || (m.id === METODO_TARJETA && !pointAvailability.available) ? 'not-allowed' : 'pointer',
                          opacity: m.id === METODO_TARJETA && (pointAvailability.loading || !pointAvailability.available) ? 0.5 : 1,
                          transition: 'all 0.2s ease',
                          textAlign: 'center'
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {!pointAvailability.loading && !pointAvailability.available && can('ventas.crear_point') && (
                  <div className="badge badge-warning" style={{ display: 'block', padding: '8px 10px', borderRadius: 8, textTransform: 'none', fontSize: '.76rem', lineHeight: 1.4, marginBottom: 12 }}>
                    Tarjeta no disponible: {pointAvailability.message || 'configura una máquina POS activa.'}
                  </div>
                )}

                {/* Mode toggle button */}
                {!isSplitPayment ? (
                  <button
                    type="button"
                    disabled={submittingSale}
                    onClick={() => {
                      setIsSplitPayment(true);
                      setPaymentAllocations({ 1: '', 4: '', [METODO_TARJETA]: '' });
                      setCashReceived('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      width: '100%',
                      padding: '8px',
                      border: '1px dashed var(--primary-color)',
                      borderRadius: '8px',
                      backgroundColor: '#fdfdfd',
                      color: 'var(--primary-color)',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} />
                    Dividir pago con múltiples métodos
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submittingSale}
                    onClick={() => {
                      setIsSplitPayment(false);
                      const total = calculateCartTotal();
                      const defaultMethod = can('ventas.crear') ? 1 : METODO_TARJETA;
                      setActiveMethods([defaultMethod]);
                      setPaymentAllocations({ 1: defaultMethod === 1 ? total : '', 4: '', [METODO_TARJETA]: defaultMethod === METODO_TARJETA ? total : '' });
                      setCashReceived('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      width: '100%',
                      padding: '8px',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      color: 'var(--text-muted)',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <ArrowLeft size={14} />
                    Volver a Pago Único
                  </button>
                )}
              </div>

              {/* Payment Allocation Details */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '16px'
              }}>
                {activeMethods.length === 1 ? (
                  // Single Payment Mode
                  (() => {
                    const mId = activeMethods[0];
                    const mLabel = mId === 1 ? 'Efectivo' : mId === METODO_TARJETA ? 'Tarjeta' : 'Transferencia';
                    const total = calculateCartTotal();

                    return (
                      <div style={{
                        border: '1.5px solid var(--primary-color)',
                        borderRadius: '10px',
                        padding: '16px',
                        backgroundColor: 'rgba(0, 77, 38, 0.01)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                            Cobro total con {mLabel}
                          </span>
                          <span style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                            ${total.toLocaleString('es-CL')}
                          </span>
                        </div>

                        {mId === 1 && (
                          <div style={{
                            borderTop: '1px dashed #e2e8f0',
                            paddingTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                Efectivo Recibido:
                              </label>
                              <div style={{ position: 'relative', width: '130px' }}>
                                <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                                <input
                                  type="number"
                                  value={cashReceived}
                                  disabled={submittingSale}
                                  onChange={(e) => setCashReceived(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px 6px 18px',
                                    border: '1px solid var(--panel-border)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                            </div>

                            {parseInt(cashReceived) >= total && (
                              <div style={{
                                backgroundColor: '#e6f4ea',
                                border: '1px solid #c2e7cd',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#137333' }}>Vuelto / Cambio:</span>
                                <span style={{ fontSize: '1rem', fontWeight: '800', color: '#137333' }}>
                                  ${(parseInt(cashReceived) - total).toLocaleString('es-CL')}
                                </span>
                              </div>
                            )}

                            {cashReceived && parseInt(cashReceived) < total && (
                              <span style={{ fontSize: '0.72rem', color: '#d93025', fontWeight: '700', textAlign: 'right' }}>
                                ⚠️ El efectivo recibido es menor al total a pagar
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  // Split / Multi-Payment Mode
                  [
                    { id: 1, label: 'Efectivo' },
                    { id: METODO_TARJETA, label: 'Tarjeta' },
                    { id: 4, label: 'Transferencia' }
                  ]
                    .filter(m => activeMethods.includes(m.id))
                    .map(m => {
                      const currentAllocated = parseInt(paymentAllocations[m.id]) || 0;
                      const otherAllocationsSum = Object.keys(paymentAllocations)
                        .filter(k => parseInt(k) !== m.id)
                        .reduce((acc, k) => acc + (parseInt(paymentAllocations[k]) || 0), 0);
                      const maxPossible = Math.max(0, calculateCartTotal() - otherAllocationsSum);

                      return (
                        <div key={m.id} style={{
                          border: '1.5px solid ' + (currentAllocated > 0 ? 'var(--primary-color)' : 'var(--panel-border)'),
                          borderRadius: '10px',
                          padding: '12px',
                          backgroundColor: currentAllocated > 0 ? 'rgba(0, 77, 38, 0.02)' : '#ffffff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                              {m.label}
                            </span>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* Todo Button */}
                              {maxPossible > 0 && currentAllocated !== maxPossible && (
                                <button
                                  type="button"
                                  disabled={submittingSale}
                                  onClick={() => {
                                    setPaymentAllocations(prev => ({
                                      ...prev,
                                      [m.id]: maxPossible
                                    }));
                                    if (m.id === 1) {
                                      setCashReceived(''); // reset received
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid var(--primary-color)',
                                    borderRadius: '6px',
                                    backgroundColor: '#ffffff',
                                    color: 'var(--primary-color)',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Todo
                                </button>
                              )}
                              
                              <div style={{ position: 'relative', width: '130px' }}>
                                <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                                <input
                                  type="number"
                                  min="0"
                                  disabled={submittingSale}
                                  value={paymentAllocations[m.id]}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const numericVal = val === '' ? '' : Math.min(maxPossible, Math.max(0, parseInt(val) || 0));
                                    setPaymentAllocations(prev => ({
                                      ...prev,
                                      [m.id]: numericVal
                                    }));
                                    if (m.id === 1) {
                                      setCashReceived(''); // reset received
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px 6px 18px',
                                    border: '1px solid var(--panel-border)',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Cash change calculator inside the Cash method item */}
                          {m.id === 1 && currentAllocated > 0 && (
                            <div style={{
                              borderTop: '1px dashed #e2e8f0',
                              paddingTop: '10px',
                              marginTop: '4px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>
                                  Efectivo Recibido:
                                </label>
                                <div style={{ position: 'relative', width: '130px' }}>
                                  <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                                  <input
                                    type="number"
                                    value={cashReceived}
                                    disabled={submittingSale}
                                    onChange={(e) => setCashReceived(e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 8px 6px 18px',
                                      border: '1px solid var(--panel-border)',
                                      borderRadius: '6px',
                                      fontSize: '0.85rem',
                                      fontWeight: '700',
                                      textAlign: 'right',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                </div>
                              </div>

                              {parseInt(cashReceived) >= currentAllocated && (
                                <div style={{
                                  backgroundColor: '#e6f4ea',
                                  border: '1px solid #c2e7cd',
                                  borderRadius: '6px',
                                  padding: '6px 10px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#137333' }}>Vuelto / Cambio:</span>
                                  <span style={{ fontSize: '1rem', fontWeight: '800', color: '#137333' }}>
                                    ${(parseInt(cashReceived) - currentAllocated).toLocaleString('es-CL')}
                                  </span>
                                </div>
                              )}

                              {cashReceived && parseInt(cashReceived) < currentAllocated && (
                                <span style={{ fontSize: '0.72rem', color: '#d93025', fontWeight: '700', textAlign: 'right' }}>
                                  ⚠️ El efectivo recibido es menor al monto de efectivo asignado
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>

              {/* Progress Summary */}
              {activeMethods.length > 1 && (() => {
                const total = calculateCartTotal();
                const currentSum = Object.keys(paymentAllocations).reduce((acc, k) => acc + (parseInt(paymentAllocations[k]) || 0), 0);
                const remaining = total - currentSum;

                return (
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: remaining === 0 ? '#e6f4ea' : '#fff7ed',
                    border: '1px solid ' + (remaining === 0 ? '#c2e7cd' : '#fed7aa'),
                    color: remaining === 0 ? '#137333' : '#c2410c',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                  }}>
                    <span>Asignado: ${currentSum.toLocaleString('es-CL')}</span>
                    <span>
                      {remaining === 0 ? '✓ Monto Completado' : `Restante: $${remaining.toLocaleString('es-CL')}`}
                    </span>
                  </div>
                );
              })()}

              {/* Form buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', cursor: submittingSale ? 'not-allowed' : 'pointer' }}
                  disabled={submittingSale}
                  onClick={() => setShowCheckoutModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    borderRadius: '10px', 
                    cursor: (() => {
                      if (submittingSale) return 'not-allowed';
                      const total = calculateCartTotal();
                      
                      if (activeMethods.length === 1) {
                        const singleId = activeMethods[0];
                        if (singleId === 1) {
                          const received = parseInt(cashReceived) || 0;
                          return (received < total) ? 'not-allowed' : 'pointer';
                        }
                        return 'pointer';
                      } else {
                        const currentSum = Object.keys(paymentAllocations).reduce((acc, k) => acc + (parseInt(paymentAllocations[k]) || 0), 0);
                        const isComplete = currentSum === total;
                        const cashAlloc = parseInt(paymentAllocations[1]) || 0;
                        const cashOk = cashAlloc === 0 || (parseInt(cashReceived) >= cashAlloc);
                        return (!isComplete || !cashOk) ? 'not-allowed' : 'pointer';
                      }
                    })(),
                    opacity: (() => {
                      if (submittingSale) return 0.6;
                      const total = calculateCartTotal();
                      
                      if (activeMethods.length === 1) {
                        const singleId = activeMethods[0];
                        if (singleId === 1) {
                          const received = parseInt(cashReceived) || 0;
                          return (received < total) ? 0.6 : 1;
                        }
                        return 1;
                      } else {
                        const currentSum = Object.keys(paymentAllocations).reduce((acc, k) => acc + (parseInt(paymentAllocations[k]) || 0), 0);
                        const isComplete = currentSum === total;
                        const cashAlloc = parseInt(paymentAllocations[1]) || 0;
                        const cashOk = cashAlloc === 0 || (parseInt(cashReceived) >= cashAlloc);
                        return (!isComplete || !cashOk) ? 0.6 : 1;
                      }
                    })()
                  }}
                  disabled={(() => {
                    if (submittingSale) return true;
                    const total = calculateCartTotal();
                    
                    if (activeMethods.length === 1) {
                      const singleId = activeMethods[0];
                      if (singleId === 1) {
                        const received = parseInt(cashReceived) || 0;
                        return received < total;
                      }
                      return false;
                    } else {
                      const currentSum = Object.keys(paymentAllocations).reduce((acc, k) => acc + (parseInt(paymentAllocations[k]) || 0), 0);
                      const isComplete = currentSum === total;
                      const cashAlloc = parseInt(paymentAllocations[1]) || 0;
                      const cashOk = cashAlloc === 0 || (parseInt(cashReceived) >= cashAlloc);
                      return !isComplete || !cashOk;
                    }
                  })()}
                >
                  {submittingSale ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTopColor: '#ffffff',
                        animation: 'spin 0.8s linear infinite'
                      }} />
                      <span>Procesando...</span>
                    </div>
                  ) : (
                    'Confirmar Pago'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MODAL: Historial de Ventas del Turno */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '560px', padding: '30px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <button
              type="button"
              className="btn"
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none', cursor: 'pointer' }}
              onClick={() => setShowHistoryModal(false)}
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.4rem', marginBottom: '20px', fontWeight: '700' }} className="text-solid">
              Historial de Ventas del Turno
            </h3>

            {loadingHistory ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
                <div style={{
                  border: '4px solid rgba(var(--primary-rgb), 0.1)',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  borderLeftColor: 'var(--primary-color)',
                  animation: 'spin 1s linear infinite'
                }} />
              </div>
            ) : saleHistory.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                padding: '40px',
                color: 'var(--text-muted)'
              }}>
                <ShoppingBag size={32} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: '0.85rem' }}>{turnsEnabled ? 'Aún no hay ventas registradas en este turno' : 'Aún no has registrado ventas'}</span>
              </div>
            ) : (
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                paddingRight: '4px'
              }}>
                {saleHistory.map(sale => (
                  <div key={sale.idVenta} style={{
                    border: '1px solid var(--panel-border)',
                    borderRadius: '10px',
                    padding: '14px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-main)' }}>
                          Venta #{sale.idVenta}
                        </span>
                        {can('ventas.documentos.reimprimir') && <button
                          type="button"
                          onClick={() => triggerPrintBoleta(sale)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: 'transparent',
                            color: 'var(--primary-color)',
                            border: '1px solid var(--primary-color)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.68rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 77, 38, 0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Printer size={10} />
                          Reimprimir
                        </button>}

                        {sale.idEstadoVenta === 1 && can('ventas.anular') && (
                          <button
                            type="button"
                            onClick={() => { setDevolverStockAnulacion(true); setError(''); setVentaAAnular(sale); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: 'transparent',
                              color: 'var(--danger-color)',
                              border: '1px solid var(--danger-color)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Trash2 size={10} />
                            Anular
                          </button>
                        )}

                        {sale.idEstadoVenta !== 1 && (
                          <span
                            className={sale.idEstadoVenta === 3 ? 'badge badge-danger' : 'badge badge-warning'}
                            style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', textTransform: 'none' }}
                          >
                            {sale.nombreEstadoVenta}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {new Date(sale.fechaVenta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                      {sale.items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.78rem', color: 'var(--text-main)' }}>
                          <span>
                            {item.cantidad}x {item.nombreProducto}
                            {(item.seleccionesMateriales || []).map(selection => (
                              <small key={selection.idMateriaPrima} style={{ display: 'block', color: 'var(--text-muted)', paddingLeft: '12px' }}>
                                {selection.nombreMateriaPrima}{selection.recargo > 0 ? ` (+$${selection.recargo.toLocaleString('es-CL')})` : ''}
                              </small>
                            ))}
                            {(item.ingredientesExtra || []).map(extra => (
                              <small key={`ex-${extra.idIngredienteExtra}`} style={{ display: 'block', color: 'var(--text-muted)', paddingLeft: '12px' }}>
                                + {extra.nombre}{extra.precio > 0 ? ` (+$${extra.precio.toLocaleString('es-CL')})` : ''}
                              </small>
                            ))}
                          </span>
                          <span style={{ fontWeight: '600' }}>${item.subtotal.toLocaleString('es-CL')}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '8px',
                        borderTop: '1px dashed var(--panel-border)'
                      }}>
                        {sale.metodosPago.length > 1 ? (
                          <div 
                            onClick={() => toggleSalePayments(sale.idVenta)}
                            style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--primary-color)', 
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              userSelect: 'none'
                            }}
                          >
                            <span>Ver desglose ({sale.metodosPago.length})</span>
                            <span style={{ fontSize: '0.65rem' }}>{expandedSalePayments[sale.idVenta] ? '▲' : '▼'}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                            {sale.metodosPago[0]?.nombreMetodoPago}
                          </span>
                        )}
                        <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                          ${sale.montoTotal.toLocaleString('es-CL')}
                        </span>
                      </div>
                      
                      {sale.metodosPago.length > 1 && expandedSalePayments[sale.idVenta] && (
                        <div style={{
                          marginTop: '6px',
                          padding: '8px 12px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid var(--panel-border)',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}>
                          {sale.metodosPago.map((mp, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>{mp.nombreMetodoPago}:</span>
                              <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>${mp.monto.toLocaleString('es-CL')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}    </div>
  );
};

export default SalesView;

// Custom X icon support
const X = ({ size, color }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
