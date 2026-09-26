import { useEffect, useState } from 'react';
import { CalendarDays, RefreshCw, ShoppingBag, Wallet, Clock } from 'lucide-react';
import { notify } from '../components/NotificationCenter';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const today = () => new Date().toLocaleDateString('en-CA');
const time = value => value ? new Date(value).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : 'En curso';
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--panel-border)', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', borderBottom: '1px solid var(--panel-border)' };

export default function DailyOperations() {
  useDocumentTitle('Operación diaria');
  const [date, setDate] = useState(today());
  const [tab, setTab] = useState('sales');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/daily-operations?fecha=${encodeURIComponent(date)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.mensaje || 'No fue posible cargar la operación diaria.');
      setData(body);
    } catch (error) { notify.error(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);

  const turns = tab === 'sales-turns' ? data?.turnosVenta : data?.turnosCaja;
  return <div className="animate-fade-in">
    <div className="page-header"><div><h2 className="page-title">Operación diaria</h2><p style={{ color: 'var(--text-muted)', margin: 0 }}>Ventas y movimientos dentro de la jornada configurada.</p></div><CalendarDays color="var(--primary-color)" /></div>
    <div className="card" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><strong>Jornada</strong><input className="input-field" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {data && <span style={{ color: 'var(--text-muted)' }}><Clock size={14} /> {time(data.inicio)} – {time(data.fin)}</span>}
      <button className="btn" type="button" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}><RefreshCw size={15} /> Actualizar</button>
    </div>
    {data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
      {[['Ventas', data.resumen.cantidadVentas], ['Total', money(data.resumen.totalVentas)], ['Propinas', data.propinasHabilitadas ? money(data.resumen.totalPropinas) : 'Desactivadas'], ['Turnos', data.resumen.turnos]].map(([label, value]) => <div className="card" key={label}><small style={{ color: 'var(--text-muted)' }}>{label}</small><strong style={{ display: 'block', fontSize: '1.35rem', marginTop: 4 }}>{value}</strong></div>)}
    </div>}
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: 14, borderBottom: '1px solid var(--panel-border)' }}>
        <button className={`btn ${tab === 'sales' ? 'btn-primary' : ''}`} onClick={() => setTab('sales')}><ShoppingBag size={15} /> Ventas</button>
        <button className={`btn ${tab === 'sales-turns' ? 'btn-primary' : ''}`} onClick={() => setTab('sales-turns')}>Turnos de Venta</button>
        <button className={`btn ${tab === 'cash-turns' ? 'btn-primary' : ''}`} onClick={() => setTab('cash-turns')}><Wallet size={15} /> Turnos de Caja</button>
      </div>
      <div style={{ overflow: 'auto' }}>
        {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Cargando…</div> : tab === 'sales' ? <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Correlativo</th><th style={th}>Código</th><th style={th}>Hora</th><th style={th}>Canal</th><th style={th}>Vendedor</th><th style={th}>Estado</th><th style={th}>Pago</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead><tbody>
          {(data?.ventas || []).map(sale => <tr key={sale.idVenta}><td style={td}><strong>#{sale.correlativoDiario || '—'}</strong></td><td style={td}>VTA{sale.idVenta}</td><td style={td}>{time(sale.fechaVenta)}</td><td style={td}>{sale.canal === 'caja' ? 'Caja' : 'Venta'}</td><td style={td}>{sale.vendedor}</td><td style={td}>{sale.estado}</td><td style={td}>{sale.metodosPago.map(item => item.nombreMetodoPago).join(', ') || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{money(sale.montoTotal)}</td></tr>)}
          {!data?.ventas?.length && <tr><td colSpan="8" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No hay ventas en esta jornada.</td></tr>}
        </tbody></table> : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Turno</th><th style={th}>Usuario</th><th style={th}>Apertura</th><th style={th}>Cierre</th><th style={{ ...th, textAlign: 'right' }}>Ventas</th><th style={{ ...th, textAlign: 'right' }}>Monto</th><th style={{ ...th, textAlign: 'right' }}>Diferencia</th></tr></thead><tbody>
          {(turns || []).map(turn => { const cash = tab === 'cash-turns'; return <tr key={turn.idTurno}><td style={td}>#{turn.idTurno}</td><td style={td}>{turn.usuario}</td><td style={td}>{time(turn.fechaApertura)}</td><td style={td}>{time(turn.fechaCierre)}</td><td style={{ ...td, textAlign: 'right' }}>{cash ? turn.cajaCantidad : turn.ventaCantidad}</td><td style={{ ...td, textAlign: 'right' }}>{money(cash ? turn.cajaTotal : turn.ventaTotal)}</td><td style={{ ...td, textAlign: 'right' }}>{turn.diferenciaTotal == null ? '—' : money(turn.diferenciaTotal)}</td></tr>; })}
          {!turns?.length && <tr><td colSpan="7" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No hay movimientos para esta agrupación.</td></tr>}
        </tbody></table>}
      </div>
    </div>
  </div>;
}
