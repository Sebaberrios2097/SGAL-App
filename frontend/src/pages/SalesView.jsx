import {
    AlertCircle,
    ArrowLeft,
    CheckCircle,
    Coffee,
    CreditCard,
    History,
    Home,
    Minus,
    Package,
    Plus,
    Printer,
    ShoppingBag,
    Trash2,
    User
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Débito y Crédito se cobran en la terminal Point: la venta queda pendiente
// hasta que Mercado Pago confirma el pago.
const METODOS_TARJETA = [2, 3];
const POINT_POLL_MS = 3000;
// Alineado con MercadoPagoPoint:ExpirationTime (PT5M) del backend.
const POINT_AVISO_DEMORA_MS = 5 * 60 * 1000;

const describirRechazoPoint = (estadoOrden) => {
  switch (estadoOrden) {
    case 'canceled': return 'El cobro fue cancelado en la terminal.';
    case 'expired': return 'El cobro expiró sin completarse en la terminal.';
    case 'failed': return 'La terminal rechazó el pago.';
    default: return 'El pago no pudo completarse.';
  }
};

const SalesView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [logoError, setLogoError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Turn/Shift State
  const [activeTurn, setActiveTurn] = useState(null);
  const [denominations, setDenominations] = useState([]);

  // Checkout (Sale) State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentAllocations, setPaymentAllocations] = useState({ 1: '', 2: '', 3: '', 4: '' });
  const [activeMethods, setActiveMethods] = useState([1]); // 1 = Efectivo by default
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [submittingSale, setSubmittingSale] = useState(false);

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

  // Closing Shift State
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingQuantities, setClosingQuantities] = useState({});
  const [expectedSummary, setExpectedSummary] = useState([]);
  const [realDebit, setRealDebit] = useState('');
  const [realCredit, setRealCredit] = useState('');
  const [realTransfer, setRealTransfer] = useState('');
  const [submittingClose, setSubmittingClose] = useState(false);

  // Sales History State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [saleHistory, setSaleHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedSalePayments, setExpandedSalePayments] = useState({}); // idVenta -> boolean

  // POS / Sales Catalog State
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [cart, setCart] = useState([]); // { product, quantity, finalPrice }
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    document.title = "Punto de Venta (POS) - Siete Vidas";
    checkShiftStatus();
    fetchDenominations();
    fetchCatalog();
  }, []);

  const checkShiftStatus = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/turn/active?idUsuario=${user.idUsuario}`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasActiveTurn && data.belongsToCurrentUser) {
          setActiveTurn(data.activeTurn);
        } else {
          setActiveTurn(null);
        }
      }
    } catch (e) {
      console.error('Error checking turn status', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDenominations = async () => {
    try {
      const res = await fetch('/api/turn/denominations');
      if (res.ok) {
        const data = await res.json();
        setDenominations(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCatalog = async () => {
    try {
      const [prodRes, catRes, discRes] = await Promise.all([
        fetch('/api/product'),
        fetch('/api/category'),
        fetch('/api/discount')
      ]);

      if (prodRes.ok && catRes.ok && discRes.ok) {
        setProducts(await prodRes.json());
        setCategories(await catRes.json());
        setDiscounts(await discRes.json());
      }
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
      cantidad: item.quantity
    }));

    const metodosPago = Object.keys(paymentAllocations)
      .map(id => ({
        idMetodoPago: parseInt(id),
        monto: parseInt(paymentAllocations[id]) || 0
      }))
      .filter(item => item.monto > 0);

    const sumAllocated = metodosPago.reduce((acc, curr) => acc + curr.monto, 0);
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
      const usaTarjeta = metodosPago.some(m => METODOS_TARJETA.includes(m.idMetodoPago));
      const endpoint = usaTarjeta ? '/api/sale/point' : '/api/sale';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idTurno: activeTurn.idTurno,
          metodosPago,
          items
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

  const buildSaleSnapshot = (idVenta) => ({
    idVenta,
    fecha: new Date().toLocaleString('es-CL'),
    barista: user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario,
    cart: [...cart],
    paymentAllocations: { ...paymentAllocations },
    cashReceived: cashReceived,
    subtotal: cart.reduce((acc, item) => acc + (item.product.precio * item.quantity), 0),
    total: calculateCartTotal()
  });

  const finalizeSale = (saleData) => {
    setCart([]);
    setShowCheckoutModal(false);
    setCashReceived('');
    setPaymentAllocations({ 1: '', 2: '', 3: '', 4: '' });
    fetchCatalog();

    setSuccess('Venta registrada con éxito. Imprimiendo...');
    setTimeout(() => setSuccess(''), 4000);

    setTimeout(() => {
      triggerPrintTicket(saleData);
    }, 300);
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
        2: id === 2 ? total : '',
        3: id === 3 ? total : '',
        4: id === 4 ? total : ''
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
        2: singleId === 2 ? total : '',
        3: singleId === 3 ? total : '',
        4: singleId === 4 ? total : ''
      });
      if (singleId !== 1) setCashReceived('');
    } else {
      // In split/multi-mode, reset allocations to empty strings
      setPaymentAllocations({ 1: '', 2: '', 3: '', 4: '' });
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

  const triggerPrintTicket = (saleData) => {
    if (!saleData) return;
    const isPromo = saleData.subtotal > saleData.total;
    const discount = saleData.subtotal - saleData.total;

    // BOLETA ITEMS (Producto, Cant, Total)
    let boletaItemsHtml = '';
    saleData.cart.forEach(item => {
      const itemIsPromo = item.finalPrice < item.product.precio;
      const originalSub = item.product.precio * item.quantity;
      const finalSub = item.finalPrice * item.quantity;
      const itemDiscountTotal = originalSub - finalSub;
      const discountPercent = Math.round(((item.product.precio - item.finalPrice) / item.product.precio) * 100);

      boletaItemsHtml += `
        <tr>
          <td style="font-size: 11px; padding: 5px 0; font-family: 'Courier New', Courier, monospace; vertical-align: top; line-height: 1.2;">
            ${item.product.nombreProducto}
            ${itemIsPromo ? `<br><small style="color: #444; font-size: 9px; font-family: 'Courier New', Courier, monospace;">Descto. ${discountPercent}% (-$${itemDiscountTotal.toLocaleString('es-CL')})</small>` : ''}
          </td>
          <td style="text-align: center; width: 40px; font-size: 11px; padding: 5px 0; font-family: 'Courier New', Courier, monospace; vertical-align: top;">
            ${item.quantity}
          </td>
          <td style="text-align: right; width: 75px; font-size: 11px; padding: 5px 0; font-family: 'Courier New', Courier, monospace; vertical-align: top;">
            ${itemIsPromo ? `<span style="text-decoration: line-through; font-size: 9px; color: #555;">$${originalSub.toLocaleString('es-CL')}</span><br><strong>$${finalSub.toLocaleString('es-CL')}</strong>` : `$${finalSub.toLocaleString('es-CL')}`}
          </td>
        </tr>
      `;
    });

    // BOLETA PAYMENTS
    let paymentsHtml = '';
    const activeMethodNames = {
      1: 'Efectivo',
      2: 'Débito',
      3: 'Crédito',
      4: 'Transferencia'
    };

    const payments = Object.keys(saleData.paymentAllocations)
      .map(id => ({
        id: parseInt(id),
        name: activeMethodNames[id],
        amount: parseInt(saleData.paymentAllocations[id]) || 0
      }))
      .filter(p => p.amount > 0);

    payments.forEach(p => {
      paymentsHtml += `
        <p style="margin: 2px 0; display: flex; justify-content: space-between; font-size: 11px; font-family: 'Courier New', Courier, monospace;">
          <span>- ${p.name}:</span>
          <strong>$${p.amount.toLocaleString('es-CL')}</strong>
        </p>
      `;
      if (p.id === 1) {
        const received = parseInt(saleData.cashReceived) || 0;
        const change = Math.max(0, received - p.amount);
        paymentsHtml += `
          <p style="margin: 2px 0 2px 10px; display: flex; justify-content: space-between; font-size: 10px; color: #555; font-family: 'Courier New', Courier, monospace;">
            <span>Recibido:</span>
            <span>$${received.toLocaleString('es-CL')}</span>
          </p>
          <p style="margin: 2px 0 2px 10px; display: flex; justify-content: space-between; font-size: 10px; color: #555; font-family: 'Courier New', Courier, monospace;">
            <span>Vuelto:</span>
            <span>$${change.toLocaleString('es-CL')}</span>
          </p>
        `;
      }
    });

    const discountRow = isPromo ? `
      <tr>
        <td style="font-size: 11px; padding: 4px 0; font-family: 'Courier New', Courier, monospace;">Descuentos:</td>
        <td></td>
        <td style="text-align: right; font-size: 11px; padding: 4px 0; color: #d93025; font-weight: bold; font-family: 'Courier New', Courier, monospace;">-$${discount.toLocaleString('es-CL')}</td>
      </tr>
    ` : '';

    // COMANDA ITEMS (Producto first, then Cant)
    let comandaItemsHtml = '';
    saleData.cart.forEach(item => {
      comandaItemsHtml += `
        <tr>
          <td style="font-size: 14px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee; font-family: 'Courier New', Courier, monospace; line-height: 1.3;">${item.product.nombreProducto}</td>
          <td style="width: 50px; text-align: right; font-size: 16px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #eee; font-family: 'Courier New', Courier, monospace;">${item.quantity}x</td>
        </tr>
      `;
    });

    // COMBINED HTMl WITH PAGE BREAK FOR DUAL SHEET PRINTING
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Impresión Siete Vidas</title>
        <style>
          @page {
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            width: 280px;
            margin: 0 auto;
            padding: 15px 5px;
            color: #000;
            box-sizing: border-box;
          }
          .text-center { text-align: center; }
          .logo-container {
            display: flex;
            justify-content: center;
            margin-bottom: 10px;
          }
          .logo {
            width: 70px;
            height: auto;
            display: block;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          .item-table {
            width: 100%;
            border-collapse: collapse;
          }
          .totals-table {
            width: 100%;
            margin-top: 8px;
          }
          .footer {
            font-size: 10px;
            margin-top: 15px;
          }
          .disclaimer {
            font-size: 9px;
            font-weight: bold;
            margin-top: 15px;
            line-height: 1.3;
            color: #333;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
          .comanda-section {
            padding-top: 15px;
          }
        </style>
      </head>
      <body>
        <!-- PAGE 1: BOLETA -->
        <div class="logo-container">
          <img src="${window.location.origin}/logo_login.png" class="logo" alt="Logo" />
        </div>
        <div class="divider"></div>
        <p style="margin: 2px 0; font-family: 'Courier New', Courier, monospace;"><strong>Nro. Boleta: #${saleData.idVenta}</strong></p>
        <p style="margin: 2px 0; font-family: 'Courier New', Courier, monospace;">Atendido por: ${saleData.barista}</p>
        <div class="divider"></div>
        <table class="item-table">
          <thead>
            <tr>
              <th style="text-align: left; font-size: 11px; border-bottom: 1px solid #000; font-family: 'Courier New', Courier, monospace;">Producto</th>
              <th style="text-align: center; width: 40px; font-size: 11px; border-bottom: 1px solid #000; font-family: 'Courier New', Courier, monospace;">Cant</th>
              <th style="text-align: right; width: 75px; font-size: 11px; border-bottom: 1px solid #000; font-family: 'Courier New', Courier, monospace;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${boletaItemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <table class="totals-table">
          <tr>
            <td style="font-size: 11px; padding: 4px 0; font-family: 'Courier New', Courier, monospace;">Subtotal:</td>
            <td></td>
            <td style="text-align: right; font-size: 11px; padding: 4px 0; font-weight: bold; font-family: 'Courier New', Courier, monospace;">$${saleData.subtotal.toLocaleString('es-CL')}</td>
          </tr>
          ${discountRow}
          <tr>
            <td style="font-size: 12px; padding: 4px 0; font-family: 'Courier New', Courier, monospace;"><strong>TOTAL:</strong></td>
            <td></td>
            <td style="text-align: right; font-size: 13px; padding: 4px 0; font-weight: bold; font-family: 'Courier New', Courier, monospace;">$${saleData.total.toLocaleString('es-CL')}</td>
          </tr>
        </table>
        <div class="divider"></div>
        <p style="margin: 2px 0; font-family: 'Courier New', Courier, monospace;"><strong>Detalle Pago:</strong></p>
        ${paymentsHtml}
        <div class="divider"></div>
        <p class="text-center footer" style="font-family: 'Courier New', Courier, monospace; margin-bottom: 10px;">¡Muchas gracias por su visita!<br>Siga nuestras redes @sietevidascafe</p>
        <div class="text-center disclaimer" style="font-family: 'Courier New', Courier, monospace;">
          *** DOCUMENTO NO VÁLIDO COMO BOLETA ELECTRÓNICA / SIN VALOR TRIBUTARIO (SII) ***
        </div>

        <!-- BREAK FOR PRINTER CUT -->
        <div class="page-break"></div>

        <!-- PAGE 2: COMANDA -->
        <div class="comanda-section">
          <h2 class="text-center" style="margin: 0; font-size: 18px; font-family: 'Courier New', Courier, monospace;">COMANDA DE PREPARACIÓN</h2>
          <div class="divider"></div>
          <p style="margin: 4px 0; font-family: 'Courier New', Courier, monospace;"><strong>Nro. Boleta: #${saleData.idVenta}</strong></p>
          <div class="divider"></div>
          <table class="item-table">
            <thead>
              <tr>
                <th style="text-align: left; font-size: 14px; border-bottom: 1px solid #000; padding-bottom: 4px; font-family: 'Courier New', Courier, monospace;">Producto</th>
                <th style="text-align: right; width: 50px; font-size: 14px; border-bottom: 1px solid #000; padding-bottom: 4px; font-family: 'Courier New', Courier, monospace;">Cant</th>
              </tr>
            </thead>
            <tbody>
              ${comandaItemsHtml}
            </tbody>
          </table>
          <div class="divider"></div>
          <p class="text-center" style="font-size: 12px; margin-top: 20px; font-family: 'Courier New', Courier, monospace;">-- Fin de Comanda --</p>
        </div>
      </body>
      </html>
    `;
    printTicket(html);
  };

  const triggerPrintBoleta = (sale) => {
    if (!sale) return;

    // Normalize from DB representation to print layout structure if needed
    const isReprint = !!sale.fechaVenta;
    
    const idVenta = sale.idVenta;
    const fecha = isReprint 
      ? new Date(sale.fechaVenta).toLocaleString('es-CL') 
      : sale.fecha;
    const barista = sale.barista || (user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario);
    
    const normalizedCart = isReprint 
      ? sale.items.map(item => ({
          product: {
            nombreProducto: item.nombreProducto,
            precio: item.precioNormal || item.precioUnitario
          },
          quantity: item.cantidad,
          finalPrice: item.precioUnitario
        }))
      : sale.cart;

    const subtotal = isReprint
      ? normalizedCart.reduce((acc, item) => acc + (item.product.precio * item.quantity), 0)
      : sale.subtotal;

    const total = isReprint
      ? sale.montoTotal
      : sale.total;

    const isPromo = subtotal > total;
    const discount = subtotal - total;

    // BOLETA ITEMS (Producto, Cant, Total)
    let boletaItemsHtml = '';
    normalizedCart.forEach(item => {
      const itemIsPromo = item.finalPrice < item.product.precio;
      const originalSub = item.product.precio * item.quantity;
      const finalSub = item.finalPrice * item.quantity;
      const itemDiscountTotal = originalSub - finalSub;
      const discountPercent = Math.round(((item.product.precio - item.finalPrice) / item.product.precio) * 100);

      boletaItemsHtml += `
        <tr>
          <td style="font-size: 11px; padding: 5px 0; font-family: 'Courier New', Courier, monospace; vertical-align: top; line-height: 1.2;">
            ${item.product.nombreProducto}
            ${itemIsPromo ? `<br><small style="color: #444; font-size: 9px; font-family: 'Courier New', Courier, monospace;">Descto. ${discountPercent}% (-$${itemDiscountTotal.toLocaleString('es-CL')})</small>` : ''}
          </td>
          <td style="text-align: center; width: 40px; font-size: 11px; padding: 5px 0; font-family: 'Courier New', Courier, monospace; vertical-align: top;">
            ${item.quantity}
          </td>
          <td style="text-align: right; width: 75px; font-size: 11px; padding: 5px 0; font-family: 'Courier New', Courier, monospace; vertical-align: top;">
            ${itemIsPromo ? `<span style="text-decoration: line-through; font-size: 9px; color: #555;">$${originalSub.toLocaleString('es-CL')}</span><br><strong>$${finalSub.toLocaleString('es-CL')}</strong>` : `$${finalSub.toLocaleString('es-CL')}`}
          </td>
        </tr>
      `;
    });

    // BOLETA PAYMENTS
    let paymentsHtml = '';
    const activeMethodNames = {
      1: 'Efectivo',
      2: 'Débito',
      3: 'Crédito',
      4: 'Transferencia'
    };

    if (isReprint) {
      sale.metodosPago.forEach(mp => {
        paymentsHtml += `
          <p style="margin: 2px 0; display: flex; justify-content: space-between; font-size: 11px; font-family: 'Courier New', Courier, monospace;">
            <span>- ${mp.nombreMetodoPago}:</span>
            <strong>$${mp.monto.toLocaleString('es-CL')}</strong>
          </p>
        `;
      });
    } else {
      const payments = Object.keys(sale.paymentAllocations)
        .map(id => ({
          id: parseInt(id),
          name: activeMethodNames[id],
          amount: parseInt(sale.paymentAllocations[id]) || 0
        }))
        .filter(p => p.amount > 0);

      payments.forEach(p => {
        paymentsHtml += `
          <p style="margin: 2px 0; display: flex; justify-content: space-between; font-size: 11px; font-family: 'Courier New', Courier, monospace;">
            <span>- ${p.name}:</span>
            <strong>$${p.amount.toLocaleString('es-CL')}</strong>
          </p>
        `;
        if (p.id === 1) {
          const received = parseInt(sale.cashReceived) || 0;
          const change = Math.max(0, received - p.amount);
          paymentsHtml += `
            <p style="margin: 2px 0 2px 10px; display: flex; justify-content: space-between; font-size: 10px; color: #555; font-family: 'Courier New', Courier, monospace;">
              <span>Recibido:</span>
              <span>$${received.toLocaleString('es-CL')}</span>
            </p>
            <p style="margin: 2px 0 2px 10px; display: flex; justify-content: space-between; font-size: 10px; color: #555; font-family: 'Courier New', Courier, monospace;">
              <span>Vuelto:</span>
              <span>$${change.toLocaleString('es-CL')}</span>
            </p>
          `;
        }
      });
    }

    const discountRow = isPromo ? `
      <tr>
        <td style="font-size: 11px; padding: 4px 0; font-family: 'Courier New', Courier, monospace;">Descuentos:</td>
        <td></td>
        <td style="text-align: right; font-size: 11px; padding: 4px 0; color: #d93025; font-weight: bold; font-family: 'Courier New', Courier, monospace;">-$${discount.toLocaleString('es-CL')}</td>
      </tr>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Impresión Siete Vidas</title>
        <style>
          @page {
            margin: 0;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            width: 280px;
            margin: 0 auto;
            padding: 15px 5px;
            color: #000;
            box-sizing: border-box;
          }
          .text-center { text-align: center; }
          .logo-container {
            display: flex;
            justify-content: center;
            margin-bottom: 10px;
          }
          .logo {
            width: 70px;
            height: auto;
            display: block;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          .item-table {
            width: 100%;
            border-collapse: collapse;
          }
          .totals-table {
            width: 100%;
            margin-top: 8px;
          }
          .footer {
            font-size: 10px;
            margin-top: 15px;
          }
          .disclaimer {
            font-size: 9px;
            font-weight: bold;
            margin-top: 15px;
            line-height: 1.3;
            color: #333;
          }
        </style>
      </head>
      <body>
        <!-- PAGE 1: BOLETA -->
        <div class="logo-container">
          <img src="${window.location.origin}/logo_login.png" class="logo" alt="Logo" />
        </div>
        <div class="divider"></div>
        <p style="margin: 2px 0; font-family: 'Courier New', Courier, monospace;"><strong>Nro. Boleta: #${idVenta}</strong></p>
        <p style="margin: 2px 0; font-family: 'Courier New', Courier, monospace;">Atendido por: ${barista}</p>
        <div class="divider"></div>
        <table class="item-table">
          <thead>
            <tr>
              <th style="text-align: left; font-size: 11px; border-bottom: 1px solid #000; font-family: 'Courier New', Courier, monospace;">Producto</th>
              <th style="text-align: center; width: 40px; font-size: 11px; border-bottom: 1px solid #000; font-family: 'Courier New', Courier, monospace;">Cant</th>
              <th style="text-align: right; width: 75px; font-size: 11px; border-bottom: 1px solid #000; font-family: 'Courier New', Courier, monospace;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${boletaItemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <table class="totals-table">
          <tr>
            <td style="font-size: 11px; padding: 4px 0; font-family: 'Courier New', Courier, monospace;">Subtotal:</td>
            <td></td>
            <td style="text-align: right; font-size: 11px; padding: 4px 0; font-weight: bold; font-family: 'Courier New', Courier, monospace;">$${subtotal.toLocaleString('es-CL')}</td>
          </tr>
          ${discountRow}
          <tr>
            <td style="font-size: 12px; padding: 4px 0; font-family: 'Courier New', Courier, monospace;"><strong>TOTAL:</strong></td>
            <td></td>
            <td style="text-align: right; font-size: 13px; padding: 4px 0; font-weight: bold; font-family: 'Courier New', Courier, monospace;">$${total.toLocaleString('es-CL')}</td>
          </tr>
        </table>
        <div class="divider"></div>
        <p style="margin: 2px 0; font-family: 'Courier New', Courier, monospace;"><strong>Detalle Pago:</strong></p>
        ${paymentsHtml}
        <div class="divider"></div>
        <p class="text-center footer" style="font-family: 'Courier New', Courier, monospace; margin-bottom: 10px;">¡Muchas gracias por su visita!<br>Siga nuestras redes @sietevidascafe</p>
        <div class="text-center disclaimer" style="font-family: 'Courier New', Courier, monospace;">
          *** DOCUMENTO NO VÁLIDO COMO BOLETA ELECTRÓNICA / SIN VALOR TRIBUTARIO (SII) ***
        </div>
      </body>
      </html>
    `;
    printTicket(html);
  };

  const handleOpenClosingModal = async () => {
    setError('');
    try {
      const res = await fetch(`/api/turn/summary?idTurno=${activeTurn.idTurno}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.mensaje || 'Error al obtener resumen del turno');
      }

      const data = await res.json();
      setExpectedSummary(data);

      const initialQuants = {};
      denominations.forEach(d => {
        initialQuants[d.idDenominacion] = '';
      });
      setClosingQuantities(initialQuants);

      setRealDebit('');
      setRealCredit('');
      setRealTransfer('');
      setShowClosingModal(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCloseShiftSubmit = async (e) => {
    e.preventDefault();
    if (submittingClose) return;
    setError('');
    setSubmittingClose(true);

    const desgloseEfectivo = Object.keys(closingQuantities)
      .map(id => ({
        idDenominacion: parseInt(id),
        cantidad: parseInt(closingQuantities[id]) || 0
      }))
      .filter(item => item.cantidad > 0);

    const desgloseOtrosMetodos = [
      { idMetodoPago: 2, montoReal: parseInt(realDebit) || 0 },
      { idMetodoPago: 3, montoReal: parseInt(realCredit) || 0 },
      { idMetodoPago: 4, montoReal: parseInt(realTransfer) || 0 }
    ];

    try {
      const res = await fetch('/api/turn/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idTurno: activeTurn.idTurno,
          desgloseEfectivo,
          desgloseOtrosMetodos,
          observacionCierre: null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al cerrar el turno');
      }

      setSuccess(`Turno cerrado con éxito. Estado final: ${data.idEstadoTurno === 2 ? 'Cerrado' : 'Cerrado con Descuadre ($' + data.diferenciaTotal.toLocaleString('es-CL') + ')'}`);
      setShowClosingModal(false);
      setActiveTurn(null);
      window.dispatchEvent(new CustomEvent('turn-status-changed'));
      navigate('/');
    } catch (err) {
      setError(err.message);
      setSubmittingClose(false);
    }
  };

  const handleOpenHistory = async () => {
    setError('');
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/sale/turn/${activeTurn.idTurno}`);
      if (!res.ok) {
        throw new Error('Error al obtener el historial de ventas del turno');
      }
      const data = await res.json();
      setSaleHistory(data);
    } catch (err) {
      alert(err.message);
      setShowHistoryModal(false);
    } finally {
      setLoadingHistory(false);
    }
  };

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

    const priceInfo = getProductPriceInfo(prod);
    const existingIndex = cart.findIndex(item => item.product.idProducto === prod.idProducto);

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (prod.stock !== null && currentQty >= prod.stock) {
        alert('No hay suficiente stock disponible');
        return;
      }
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, {
        product: prod,
        quantity: 1,
        finalPrice: priceInfo.finalPrice
      }]);
    }
  };

  const handleUpdateQty = (index, delta) => {
    const updated = [...cart];
    const item = updated[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      if (item.product.stock !== null && newQty > item.product.stock) {
        alert('No hay suficiente stock disponible');
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

  const calculateCartTotal = () => {
    return cart.reduce((total, item) => total + (item.finalPrice * item.quantity), 0);
  };

  const filteredProducts = products.filter(p => {
    if (!p.activo) return false;
    if (categoryFilter === 'all') return true;
    return p.idCategoriaProducto === parseInt(categoryFilter);
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f8fafc',
      color: 'var(--text-main)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Navbar */}
      <header style={{
        height: '110px',
        backgroundColor: 'var(--primary-color)',
        boxShadow: '0 4px 16px rgba(0, 76, 37, 0.15)',
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
        {/* Left: Back to Admin button (Icon-only: Arrow & Home) */}
        <button
          onClick={() => navigate('/')}
          title="Volver a Administración"
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

        {/* Center: Brand Logo (No redirect) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {!logoError ? (
            <img
              src="/logo_navbar.png"
              alt="Siete Vidas Logo"
              onError={() => setLogoError(true)}
              style={{ maxHeight: '90px', objectFit: 'contain' }}
            />
          ) : (
            <>
              <Coffee size={24} color="#ffffff" />
              <span style={{ fontWeight: '800', fontSize: '1.2rem', letterSpacing: '0.02em' }}>
                Siete Vidas
              </span>
            </>
          )}
        </div>

        {/* Right: User Profile Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: '700' }}>
              {user.empleado ? `${user.empleado.nombres} ${user.empleado.apellido1}` : user.nombreUsuario}
            </span>
            <span style={{ opacity: 0.75 }}>
              Barista Activo
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
            border: '4px solid rgba(0, 76, 37, 0.1)',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            borderLeftColor: 'var(--primary-color)',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* ACTIVE POS SCREEN */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 380px',
            height: activeTurn ? 'calc(100vh - 110px)' : 'calc(100vh - 170px)',
            overflow: 'hidden',
            opacity: activeTurn ? 1 : 0.5,
            pointerEvents: activeTurn ? 'auto' : 'none',
            userSelect: activeTurn ? 'auto' : 'none',
            transition: 'all 0.3s ease'
          }}>
            {/* LEFT COLUMN: Catalog */}
            <div style={{
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
                paddingBottom: '8px'
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
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '16px',
                  paddingBottom: '20px'
                }}>
                  {filteredProducts.map(prod => {
                    const priceInfo = getProductPriceInfo(prod);
                    const isOutOfStock = prod.stock !== null && prod.stock <= 0;

                    return (
                      <div
                        key={prod.idProducto}
                        onClick={() => !isOutOfStock && handleAddToCart(prod)}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          cursor: isOutOfStock ? 'not-allowed' : 'pointer',
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
                  })}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Cart Summary */}
            <div style={{
              backgroundColor: '#ffffff',
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden'
            }}>
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
                {activeTurn && (
                  <button
                    onClick={handleOpenHistory}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'transparent',
                      color: 'var(--primary-color)',
                      border: '1px solid var(--primary-color)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 77, 38, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <History size={12} />
                    Historial
                  </button>
                )}
              </div>

              {/* Shift banner info */}
              <div style={{
                padding: '8px 20px',
                backgroundColor: activeTurn ? '#f0fdf4' : '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '0.72rem',
                color: activeTurn ? '#15803d' : 'var(--text-muted)',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                {activeTurn ? (
                  <>
                    <span>
                      Turno Abierto #{activeTurn.idTurno} • Iniciado: {new Date(activeTurn.fechaApertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={handleOpenClosingModal}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      Cerrar Turno
                    </button>
                  </>
                ) : (
                  <span>Turno Cerrado • Esperando apertura</span>
                )}
              </div>

              {/* Cart Items List */}
              <div style={{
                flex: 1,
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
                      <div key={item.product.idProducto} style={{
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

                <button
                  disabled={cart.length === 0}
                  onClick={() => {
                    setError('');
                    const total = calculateCartTotal();
                    setPaymentAllocations({ 1: total, 2: '', 3: '', 4: '' });
                    setActiveMethods([1]);
                    setCashReceived('');
                    setShowCheckoutModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'var(--primary-color)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: cart.length === 0 ? 0.6 : 1,
                    transition: 'background-color 0.2s ease',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (cart.length > 0) e.currentTarget.style.backgroundColor = '#00361a';
                  }}
                  onMouseLeave={(e) => {
                    if (cart.length > 0) e.currentTarget.style.backgroundColor = 'var(--primary-color)';
                  }}
                >
                  Continuar al Pago
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Se anulará por un total de <strong style={{ color: 'var(--text-main)' }}>${ventaAAnular.montoTotal.toLocaleString('es-CL')}</strong>. Esta acción no se puede deshacer.
            </p>

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

                <h3 style={{ fontSize: '1.25rem', marginBottom: '6px', fontWeight: '700' }} className="text-gradient">
                  Esperando pago en la terminal
                </h3>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Venta #{pointPayment.idVenta}
                </p>

                <div style={{ fontSize: '2.1rem', fontWeight: '800', color: 'var(--text-main)', marginBottom: '6px' }}>
                  ${pointPayment.montoTarjeta.toLocaleString('es-CL')}
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Pide al cliente que complete el pago en la máquina.
                  La boleta se emite solo cuando el pago quede confirmado.
                </p>

                {pointDemorado && (
                  <div className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '12px', fontSize: '0.8rem' }}>
                    <AlertCircle size={14} />
                    <span>El cobro está tardando más de lo habitual. Puedes cancelarlo y volver a intentar.</span>
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

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  La venta quedó cancelada y el stock fue devuelto. No se emitió boleta.
                  Los productos siguen en el carrito por si quieres reintentar.
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

            <h3 style={{ fontSize: '1.4rem', marginBottom: '20px', fontWeight: '700' }} className="text-gradient">
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  {[
                    { id: 1, label: 'Efectivo' },
                    { id: 2, label: 'Débito' },
                    { id: 3, label: 'Crédito' },
                    { id: 4, label: 'Transferencia' }
                  ].map(m => {
                    const isActive = activeMethods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={submittingSale}
                        onClick={() => toggleMethod(m.id)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: '1.5px solid ' + (isActive ? 'var(--primary-color)' : 'var(--panel-border)'),
                          backgroundColor: isActive ? 'rgba(0, 77, 38, 0.05)' : '#ffffff',
                          color: isActive ? 'var(--primary-color)' : 'var(--text-main)',
                          fontWeight: isActive ? '800' : '600',
                          fontSize: '0.85rem',
                          cursor: submittingSale ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          textAlign: 'center'
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {/* Mode toggle button */}
                {!isSplitPayment ? (
                  <button
                    type="button"
                    disabled={submittingSale}
                    onClick={() => {
                      setIsSplitPayment(true);
                      setPaymentAllocations({ 1: '', 2: '', 3: '', 4: '' });
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
                      setActiveMethods([1]);
                      setPaymentAllocations({ 1: total, 2: '', 3: '', 4: '' });
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
                    const mLabel = mId === 1 ? 'Efectivo' : mId === 2 ? 'Débito' : mId === 3 ? 'Crédito' : 'Transferencia';
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
                                  placeholder="0"
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
                    { id: 2, label: 'Débito' },
                    { id: 3, label: 'Crédito' },
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
                                  placeholder="0"
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
                                    placeholder="0"
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

      {/* MODAL: Cuadratura de Cierre */}
      {showClosingModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px', padding: '30px' }}>
            <button
              type="button"
              className="btn"
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none', cursor: submittingClose ? 'not-allowed' : 'pointer', opacity: submittingClose ? 0.5 : 1 }}
              disabled={submittingClose}
              onClick={() => {
                setShowClosingModal(false);
                setError('');
              }}
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.4rem', marginBottom: '20px', fontWeight: '700' }} className="text-gradient">
              Arqueo y Cuadratura de Cierre
            </h3>

            {error && (
              <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', textTransform: 'none', marginBottom: '16px', fontSize: '0.8rem' }}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCloseShiftSubmit}>
              {/* Columns layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                {/* Left Column: Cash breakdown */}
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '10px', color: 'var(--text-main)' }}>
                    💵 Recuento de Efectivo Físico
                  </h4>
                  <div style={{
                    maxHeight: '280px',
                    overflowY: 'auto',
                    border: '1px solid var(--panel-border)',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    {denominations.map(d => (
                      <div key={d.idDenominacion} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        backgroundColor: 'var(--bg-light)',
                        borderRadius: '8px',
                        border: '1px solid var(--panel-border)'
                      }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                          {d.descripcion}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>x</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            disabled={submittingClose}
                            value={closingQuantities[d.idDenominacion] || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                              setClosingQuantities(prev => ({ ...prev, [d.idDenominacion]: val }));
                            }}
                            style={{
                              width: '70px',
                              padding: '6px 8px',
                              border: '1px solid var(--panel-border)',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              fontWeight: '700',
                              textAlign: 'center'
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Calculated Cash totals */}
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: 'rgba(0, 77, 38, 0.04)',
                    borderRadius: '8px',
                    border: '1px dashed var(--primary-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary-color)' }}>
                      Efectivo Real Recabado:
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--primary-color)' }}>
                      ${Object.keys(closingQuantities).reduce((acc, id) => {
                        const denom = denominations.find(d => d.idDenominacion === parseInt(id));
                        return acc + ((parseInt(closingQuantities[id]) || 0) * (denom?.valor || 0));
                      }, 0).toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>

                {/* Right Column: Other payment methods */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    💳 Otros Métodos de Pago
                  </h4>

                  {/* Expected Cash Info reference */}
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem'
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>Esperado en Efectivo:</span>
                    <span style={{ fontWeight: '700' }}>
                      ${(expectedSummary.find(s => s.idMetodoPago === 1)?.montoEsperado || 0).toLocaleString('es-CL')}
                    </span>
                  </div>

                  {/* Debit Input */}
                  <div style={{
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    padding: '12px',
                    backgroundColor: '#ffffff'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '700' }}>💳 Tarjeta de Débito:</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Esperado: ${(expectedSummary.find(s => s.idMetodoPago === 2)?.montoEsperado || 0).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                      <input
                        type="number"
                        placeholder="Monto real Débito"
                        disabled={submittingClose}
                        value={realDebit}
                        onChange={(e) => setRealDebit(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                        style={{
                          width: '100%',
                          padding: '6px 8px 6px 20px',
                          border: '1px solid var(--panel-border)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '700'
                        }}
                      />
                    </div>
                  </div>

                  {/* Credit Input */}
                  <div style={{
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    padding: '12px',
                    backgroundColor: '#ffffff'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '700' }}>💳 Tarjeta de Crédito:</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Esperado: ${(expectedSummary.find(s => s.idMetodoPago === 3)?.montoEsperado || 0).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                      <input
                        type="number"
                        placeholder="Monto real Crédito"
                        disabled={submittingClose}
                        value={realCredit}
                        onChange={(e) => setRealCredit(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                        style={{
                          width: '100%',
                          padding: '6px 8px 6px 20px',
                          border: '1px solid var(--panel-border)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '700'
                        }}
                      />
                    </div>
                  </div>

                  {/* Transfer Input */}
                  <div style={{
                    border: '1px solid var(--panel-border)',
                    borderRadius: '8px',
                    padding: '12px',
                    backgroundColor: '#ffffff'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '700' }}>🏦 Transferencia Bancaria:</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Esperado: ${(expectedSummary.find(s => s.idMetodoPago === 4)?.montoEsperado || 0).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)' }}>$</span>
                      <input
                        type="number"
                        placeholder="Monto real Transferencia"
                        disabled={submittingClose}
                        value={realTransfer}
                        onChange={(e) => setRealTransfer(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                        style={{
                          width: '100%',
                          padding: '6px 8px 6px 20px',
                          border: '1px solid var(--panel-border)',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '700'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Global Discrepancy Banner */}
              {(() => {
                const totalExpected = expectedSummary.reduce((acc, curr) => acc + curr.montoEsperado, 0);
                const calcRealCash = Object.keys(closingQuantities).reduce((acc, id) => {
                  const denom = denominations.find(d => d.idDenominacion === parseInt(id));
                  return acc + ((parseInt(closingQuantities[id]) || 0) * (denom?.valor || 0));
                }, 0);
                const totalReal = calcRealCash + (parseInt(realDebit) || 0) + (parseInt(realCredit) || 0) + (parseInt(realTransfer) || 0);
                const difference = totalReal - totalExpected;

                return (
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    backgroundColor: difference === 0 ? '#e6f4ea' : '#fce8e6',
                    border: '1px solid ' + (difference === 0 ? '#c2e7cd' : '#fad2cf'),
                    color: difference === 0 ? '#137333' : '#c5221f',
                    marginBottom: '24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', display: 'block', opacity: 0.8 }}>DIFERENCIA TOTAL DE CAJA:</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>
                        Esperado: ${totalExpected.toLocaleString('es-CL')} • Real: ${totalReal.toLocaleString('es-CL')}
                      </span>
                    </div>
                    <span style={{ fontSize: '1.4rem', fontWeight: '900' }}>
                      {difference > 0 ? '+' : ''}{difference.toLocaleString('es-CL')} CLP
                    </span>
                  </div>
                );
              })()}

              {/* Form buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', cursor: submittingClose ? 'not-allowed' : 'pointer' }}
                  disabled={submittingClose}
                  onClick={() => setShowClosingModal(false)}
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
                    cursor: submittingClose ? 'not-allowed' : 'pointer',
                    opacity: submittingClose ? 0.8 : 1,
                    backgroundColor: '#ef4444',
                    borderColor: '#ef4444'
                  }}
                  disabled={submittingClose}
                >
                  {submittingClose ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTopColor: '#ffffff',
                        animation: 'spin 0.8s linear infinite'
                      }} />
                      <span>Cerrando Caja...</span>
                    </div>
                  ) : (
                    'Cerrar Turno Oficialmente'
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

            <h3 style={{ fontSize: '1.4rem', marginBottom: '20px', fontWeight: '700' }} className="text-gradient">
              Historial de Ventas del Turno
            </h3>

            {loadingHistory ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
                <div style={{
                  border: '4px solid rgba(0, 76, 37, 0.1)',
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
                <span style={{ fontSize: '0.85rem' }}>Aún no hay ventas registradas en este turno</span>
              </div>
            ) : (
              <div style={{
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
                        <button
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
                        </button>

                        {sale.idEstadoVenta === 1 && (
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
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-main)' }}>
                          <span>{item.cantidad}x {item.nombreProducto}</span>
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
