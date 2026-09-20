import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, StopCircle, Wallet, Receipt, Printer, ArrowLeft, Home, ShoppingCart } from 'lucide-react';
import { notify } from '../components/NotificationCenter';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import TurnOpeningModal from '../components/TurnOpeningModal';
import TurnClosingModal from '../components/TurnClosingModal';
import { buildReceiptHtml, printReceipt } from '../utils/receiptTemplates';

const TIPO_CAJA = 2;
// Refresco de los vales pendientes: la caja ve las ventas del vendedor casi al instante.
const PENDING_POLL_MS = 4000;
const METODOS = [
  { id: 1, nombre: 'Efectivo' },
  { id: 2, nombre: 'Débito' },
  { id: 3, nombre: 'Crédito' },
  { id: 4, nombre: 'Transferencia' }
];

const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;
const brutoDe = (vale) => vale.items.reduce((acc, item) => acc + item.subtotal, 0);

const CashRegister = () => {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const {
    branding, hasLogo, getLogoUrl, turnsRequireReconciliation,
    receiptShowSeller, receiptShowPayment, receiptCustomFooter
  } = useOrganization();
  useDocumentTitle('Caja');

  const [cajaTurn, setCajaTurn] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [metodo, setMetodo] = useState(1);
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [recibido, setRecibido] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [directBusy, setDirectBusy] = useState(false);

  const maxDescuento = Number(user?.maxDiscountPercent || 0);
  const puedeCobrar = can('caja.cobrar');
  const puedeAbrir = can('caja.turno.abrir');
  const puedeCerrar = can('caja.turno.cerrar');

  const cajaAbierta = Boolean(cajaTurn);
  const selected = useMemo(() => pending.find(v => v.idVenta === selectedId) || null, [pending, selectedId]);

  // Sólo trae los vales pendientes (para el refresco en vivo, sin recargar el turno).
  const loadPending = useCallback(async () => {
    try {
      const res = await fetch('/api/cash-register/pending');
      if (!res.ok) return;
      const data = await res.json();
      setPending(Array.isArray(data) ? data : []);
    } catch {
      // Corte de red puntual: se reintenta en el siguiente ciclo.
    }
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

  // Actualización en tiempo real: mientras haya turno de caja abierto, se sondean los
  // vales periódicamente para que las ventas recién emitidas aparezcan sin recargar.
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

  const vuelto = metodo === 1 ? Math.max(0, (parseInt(recibido) || 0) - total) : 0;

  const selectVale = (idVenta) => {
    setSelectedId(idVenta);
    setMetodo(1);
    setDescuentoPct(0);
    setRecibido('');
  };

  const openDirect = async () => {
    if (directBusy) return;
    setDirectBusy(true);
    try {
      const res = await fetch('/api/turn/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario, tipoTurno: TIPO_CAJA, desglose: [] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible abrir el turno de caja.');
      notify.success('Turno de caja iniciado.');
      await refresh();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setDirectBusy(false);
    }
  };

  const closeDirect = async () => {
    if (directBusy || !cajaTurn) return;
    setDirectBusy(true);
    try {
      const res = await fetch('/api/turn/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idTurno: cajaTurn.idTurno, desgloseEfectivo: [], desgloseOtrosMetodos: [] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible cerrar el turno de caja.');
      notify.success('Turno de caja cerrado.');
      setSelectedId(null);
      await refresh();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setDirectBusy(false);
    }
  };

  const printBoleta = (vale, totalCobrado, metodoId, recibidoValor) => {
    const items = vale.items.map(d => ({
      nombreProducto: d.nombreProducto,
      quantity: d.cantidad,
      normalPrice: d.precioNormal || d.precioUnitario,
      finalPrice: d.precioUnitario,
      materialSelections: (d.seleccionesMateriales || []).map(s => ({
        nombreMateriaPrima: s.nombreMateriaPrima,
        recargo: s.recargo
      })),
      extras: (d.ingredientesExtra || []).map(x => ({ nombre: x.nombre, precio: x.precio }))
    }));
    const subtotalBruto = items.reduce((acc, item) => acc + item.normalPrice * item.quantity, 0);
    const nombreMetodo = METODOS.find(m => m.id === metodoId)?.nombre || 'Pago';

    const html = buildReceiptHtml({
      mode: 'boleta',
      commercialName: branding.nombreComercial,
      logoUrl: hasLogo('boletas') ? `${window.location.origin}${getLogoUrl('boletas')}` : null,
      data: {
        idVenta: vale.idVenta,
        fecha: new Date().toLocaleString('es-CL'),
        barista: vale.vendedor,
        items,
        subtotal: subtotalBruto,
        total: totalCobrado,
        payments: [{ name: nombreMetodo, amount: totalCobrado, isCash: metodoId === 1 }],
        cashReceived: metodoId === 1 ? recibidoValor : null
      },
      options: {
        showSeller: receiptShowSeller,
        showPayment: receiptShowPayment,
        customFooter: receiptCustomFooter,
        defaultFooter: branding.textoPieDocumentos || 'Gracias por su preferencia.',
        contacto: branding.contactoPublico || null,
        includeComanda: false
      }
    });
    setTimeout(() => printReceipt(html), 200);
  };

  const handleCollect = async () => {
    if (!selected || submitting) return;
    if (metodo === 1 && (parseInt(recibido) || 0) < total) {
      notify.error(`El efectivo recibido debe ser mayor o igual al total (${money(total)}).`);
      return;
    }
    setSubmitting(true);
    const valeCobrado = selected;
    const recibidoActual = recibido;
    try {
      const res = await fetch(`/api/cash-register/${valeCobrado.idVenta}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          porcentajeDescuento: Math.min(Math.max(Number(descuentoPct) || 0, 0), maxDescuento),
          metodosPago: [{ idMetodoPago: metodo, monto: total }]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible cobrar el vale.');
      notify.success('Venta cobrada. Imprimiendo boleta...');
      printBoleta(valeCobrado, data.montoTotal, metodo, recibidoActual);
      setSelectedId(null);
      setPending(prev => prev.filter(v => v.idVenta !== valeCobrado.idVenta));
      loadPending();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const headerStatus = cajaAbierta
    ? { text: `Turno de caja #${cajaTurn.idTurno}`, bg: 'rgba(255,255,255,0.18)' }
    : { text: 'Sin turno de caja', bg: 'rgba(255,255,255,0.10)' };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', color: 'var(--text-main)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header className="pos-header" style={{
        height: '96px', backgroundColor: 'var(--primary-color)', boxShadow: '0 4px 16px rgba(var(--primary-rgb), 0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', color: '#fff',
        position: 'sticky', top: 0, zIndex: 90, boxSizing: 'border-box'
      }}>
        <button type="button" onClick={() => navigate('/welcome')} title="Volver al inicio" aria-label="Volver al inicio"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
          <ArrowLeft size={18} /><Home size={18} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <BrandLogo location="punto_venta" maxHeight={54} compact light />
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.9 }}>
            <Wallet size={13} /> Caja
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ padding: '5px 12px', borderRadius: '30px', fontSize: '0.78rem', fontWeight: 700, background: headerStatus.bg, whiteSpace: 'nowrap' }}>
            {headerStatus.text}
          </span>
          {!cajaAbierta && puedeAbrir && (
            <button type="button" disabled={directBusy}
              onClick={() => turnsRequireReconciliation ? setShowOpening(true) : openDirect()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: 'var(--primary-color)', border: 'none', padding: '9px 14px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
              <PlayCircle size={17} /> Abrir turno
            </button>
          )}
          {cajaAbierta && puedeCerrar && (
            <button type="button" disabled={directBusy}
              onClick={() => turnsRequireReconciliation ? setShowClosing(true) : closeDirect()}
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
          <div style={{ maxWidth: '420px' }}>
            Abre un turno de caja para cobrar los vales que generan los vendedores.
          </div>
          {puedeAbrir && (
            <button type="button" className="btn btn-primary" disabled={directBusy}
              onClick={() => turnsRequireReconciliation ? setShowOpening(true) : openDirect()}>
              <PlayCircle size={18} /> Abrir turno de caja
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* IZQUIERDA: vales / boletas pendientes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Receipt size={20} color="var(--primary-color)" />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Vales pendientes</h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} />
                en vivo · {pending.length}
              </span>
            </div>

            {pending.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', border: '1.5px dashed var(--panel-border)', borderRadius: '14px' }}>
                No hay vales pendientes. Aparecerán aquí en cuanto los vendedores generen ventas.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                {pending.map(vale => {
                  const activo = vale.idVenta === selectedId;
                  return (
                    <button key={vale.idVenta} type="button" onClick={() => selectVale(vale.idVenta)} disabled={!puedeCobrar}
                      style={{
                        textAlign: 'left', cursor: puedeCobrar ? 'pointer' : 'not-allowed', borderRadius: '14px', padding: '16px',
                        background: activo ? 'rgba(var(--primary-rgb), 0.06)' : '#fff',
                        border: `2px solid ${activo ? 'var(--primary-color)' : 'var(--panel-border)'}`,
                        display: 'flex', flexDirection: 'column', gap: '8px', transition: 'border-color 0.15s ease'
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '1.02rem' }}>Vale #{vale.idVenta}</strong>
                        <span style={{ fontWeight: 800, color: 'var(--primary-color)' }}>{money(brutoDe(vale))}</span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: 600 }}>{vale.vendedor}</span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {new Date(vale.fechaVenta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {vale.items.length} {vale.items.length === 1 ? 'producto' : 'productos'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DERECHA: carrito / cobro del vale seleccionado */}
          <aside style={{ width: '400px', flexShrink: 0, borderLeft: '1px solid var(--panel-border)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selected ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
                <ShoppingCart size={40} style={{ opacity: 0.3 }} />
                <span>Selecciona un vale de la izquierda para cobrarlo.</span>
              </div>
            ) : (
              <>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--panel-border)' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Vale #{selected.idVenta}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Atendió: {selected.vendedor}</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {selected.items.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
                      <span><strong>{d.cantidad}×</strong> {d.nombreProducto}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{money(d.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--panel-border)', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {maxDescuento > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.88rem' }}>Descuento (máx. {maxDescuento}%):</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="number" min="0" max={maxDescuento} step="0.01" value={descuentoPct}
                          onChange={e => setDescuentoPct(Math.min(Math.max(Number(e.target.value) || 0, 0), maxDescuento))}
                          style={{ width: '72px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right' }} />
                        <span style={{ fontWeight: 700 }}>%</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    <span>Subtotal:</span><span>{money(brutoDe(selected))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-color)' }}>
                    <span>TOTAL:</span><span>{money(total)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {METODOS.map(m => (
                      <button key={m.id} type="button" onClick={() => setMetodo(m.id)}
                        style={{
                          flex: '1 1 auto', padding: '9px 6px', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                          border: `1.5px solid ${metodo === m.id ? 'var(--primary-color)' : 'var(--panel-border)'}`,
                          background: metodo === m.id ? 'var(--primary-color)' : '#fff',
                          color: metodo === m.id ? '#fff' : 'var(--text-main)'
                        }}>
                        {m.nombre}
                      </button>
                    ))}
                  </div>

                  {metodo === 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.88rem' }}>Recibido:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="number" min="0" value={recibido} onChange={e => setRecibido(e.target.value)}
                          style={{ width: '110px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right' }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Vuelto: <strong>{money(vuelto)}</strong></span>
                      </div>
                    </div>
                  )}

                  <button type="button" disabled={submitting || !puedeCobrar} onClick={handleCollect}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px',
                      background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '0.95rem',
                      cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !puedeCobrar) ? 0.6 : 1
                    }}>
                    <Printer size={18} /> {submitting ? 'Cobrando…' : `Cobrar e imprimir (${money(total)})`}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <TurnOpeningModal
        open={showOpening}
        tipoTurno={TIPO_CAJA}
        title="Abrir turno de caja"
        onClose={() => setShowOpening(false)}
        onOpened={refresh}
      />
      <TurnClosingModal
        open={showClosing}
        turn={cajaTurn}
        onClose={() => setShowClosing(false)}
        onClosed={() => { setSelectedId(null); refresh(); }}
      />
    </div>
  );
};

export default CashRegister;
