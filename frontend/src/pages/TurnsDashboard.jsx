import {
  CalendarDays, ChevronDown, ChevronUp, Coins, Gift, Package, ReceiptText, ScrollText,
  ShoppingBag, TrendingUp, Users, Wallet
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNotificationMessage } from '../components/NotificationCenter';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const shortMoney = value => Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;
const num = value => Number(value || 0).toLocaleString('es-CL');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateTime = d => d ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const COLORS = ['var(--primary-color)', '#0d8a4d', '#52b788', '#95d5b2', '#2563eb', '#d97706', '#6d28d9', '#dc2626'];

const ESTADO_STYLE = {
  1: { label: 'Abierto', bg: '#dbeafe', color: '#1d4ed8' },
  2: { label: 'Cerrado', bg: '#dcfce7', color: '#166534' },
  3: { label: 'Descuadre', bg: '#fee2e2', color: '#b91c1c' }
};

const MetricCard = ({ icon: Icon, label, value, color = 'var(--primary-color)' }) => (
  <div className="card" style={{ padding: '18px', display: 'flex', gap: '14px', alignItems: 'center' }}>
    <div style={{ width: '44px', height: '44px', flex: '0 0 auto', borderRadius: '13px', background: `${color}14`, display: 'grid', placeItems: 'center' }}><Icon size={22} color={color} /></div>
    <div style={{ minWidth: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
    </div>
  </div>
);

const Toggle = ({ options, value, onChange }) => (
  <div style={{ display: 'inline-flex', border: '1px solid var(--panel-border)', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
    {options.map(o => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{
        padding: '5px 11px', fontSize: '0.74rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: value === o.value ? 'var(--primary-color)' : '#fff', color: value === o.value ? '#fff' : 'var(--text-muted)'
      }}>{o.label}</button>
    ))}
  </div>
);

const ChartCard = ({ title, icon: Icon, controls, children }) => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {Icon && <Icon size={18} color="var(--primary-color)" />}
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      {controls}
    </div>
    {children}
  </div>
);

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-border)', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '.85rem', borderBottom: '1px solid var(--panel-border)', whiteSpace: 'nowrap' };

const EmptyState = ({ children }) => <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>{children}</div>;
const axisProps = { fontSize: 11, stroke: '#94a3b8', tickLine: false };
const tooltipStyle = { fontSize: '0.8rem', borderRadius: '10px', border: '1px solid var(--panel-border)' };

const TurnsDashboard = () => {
  const { can } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(iso(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');

  const [flowType, setFlowType] = useState('bars');
  const [expandedBaristas, setExpandedBaristas] = useState([]);
  const [turnPage, setTurnPage] = useState(1);

  const { from, to } = useMemo(() => {
    const t = new Date();
    if (preset === 'custom') return { from: customFrom, to: customTo };
    if (preset === 'today') return { from: iso(t), to: iso(t) };
    if (preset === '7d') { const s = new Date(t); s.setDate(s.getDate() - 6); return { from: iso(s), to: iso(t) }; }
    if (preset === '30d') { const s = new Date(t); s.setDate(s.getDate() - 29); return { from: iso(s), to: iso(t) }; }
    return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  }, [preset, customFrom, customTo]);

  const granularity = useMemo(() => {
    const days = Math.max(1, (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000 + 1);
    return days > 62 ? 'month' : days > 16 ? 'week' : 'day';
  }, [from, to]);

  useEffect(() => {
    document.title = `Panel de turnos - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    if (!from || !to) return;
    setLoading(true); setError('');
    fetch(`/api/admin-dashboard/turns-overview?from=${from}&to=${to}&granularity=${granularity}`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar el panel de turnos.'); return result; })
      .then(setData).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [from, to, granularity]);

  useEffect(() => { setTurnPage(1); }, [from, to]);

  const rangeLabel = useMemo(() => {
    if (!from || !to) return '';
    const f = new Date(`${from}T00:00:00`), t = new Date(`${to}T00:00:00`);
    return `${f.toLocaleDateString('es-CL')} – ${t.toLocaleDateString('es-CL')}`;
  }, [from, to]);

  const presets = [
    { value: 'today', label: 'Hoy' },
    { value: '7d', label: '7 días' },
    { value: 'month', label: 'Este mes' },
    { value: 'custom', label: 'Personalizado' }
  ];

  const productos = data ? data.productosVendidos : [];
  const turnPageSize = 10;
  const turnPageCount = Math.max(1, Math.ceil((data?.turnos.length || 0) / turnPageSize));
  const visibleTurns = data?.turnos.slice((turnPage - 1) * turnPageSize, turnPage * turnPageSize) || [];

  // Ventas de consumo del empleado agrupadas por barista (propietario del turno) para el rango.
  const consumosPorBarista = useMemo(() => {
    if (!data?.consumosPorBarista) return [];
    const map = new Map();
    for (const venta of data.consumosPorBarista) {
      const key = venta.idUsuario;
      if (!map.has(key)) {
        map.set(key, { idUsuario: venta.idUsuario, usuario: venta.usuario, empleado: venta.empleado, ventas: [], totalAdeudado: 0, totalCortesia: 0, totalPendiente: 0 });
      }
      const grupo = map.get(key);
      grupo.ventas.push(venta);
      grupo.totalAdeudado += venta.montoAdeudado || 0;
      grupo.totalCortesia += venta.montoCortesia || 0;
      if (!venta.pagadoPorEmpleado) grupo.totalPendiente += venta.montoAdeudado || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalPendiente - a.totalPendiente);
  }, [data]);

  const marcarPagada = async (venta) => {
    try {
      const res = await fetch(`/api/sale/${venta.idVenta}/consumption-paid`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagado: !venta.pagadoPorEmpleado })
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.mensaje || 'No fue posible actualizar el pago.'); }
      // Recarga el panel para reflejar el cambio.
      fetch(`/api/admin-dashboard/turns-overview?from=${from}&to=${to}&granularity=${granularity}`)
        .then(r => r.json()).then(setData).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  };

  return <div className="animate-fade-in">
    <PageHeader title="Panel de turnos" icon={CalendarDays} backTo="/admin/turn-records" backLabel="Registros de turnos" />
    <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '-10px 0 14px 4px' }}>{rangeLabel}</div>
    <div style={{ marginBottom: '18px' }}>
      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className="input-label">Período</span>
          <Toggle options={presets} value={preset} onChange={setPreset} />
        </div>
        {preset === 'custom' && <>
          <label className="input-group" style={{ margin: 0 }}><span className="input-label">Desde</span><input className="input-field" type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} /></label>
          <label className="input-group" style={{ margin: 0 }}><span className="input-label">Hasta</span><input className="input-field" type="date" value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)} /></label>
        </>}
        <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '.75rem', alignSelf: 'center' }}>La agrupación se ajusta automáticamente al período.</div>
      </div>
    </div>

    {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '16px' }}>{error}</div>}
    {loading ? <div className="card" style={{ textAlign: 'center' }}>Preparando indicadores…</div> : data && <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <MetricCard icon={CalendarDays} label="Turnos" value={num(data.cantidadTurnos)} detail={`${data.turnosCerrados} cerrados · ${data.turnosAbiertos} abiertos`} color="#6d28d9" />
        <MetricCard icon={Wallet} label="Descuadrados" value={num(data.turnosDescuadrados)} detail="Cierres con diferencia" color={data.turnosDescuadrados === 0 ? '#0d8a4d' : '#dc2626'} />
        <MetricCard icon={ShoppingBag} label="Ventas" value={money(data.totalVentas)} detail={`${num(data.cantidadVentas)} operaciones`} color="var(--primary-color)" />
        <MetricCard icon={Package} label="Unidades vendidas" value={num(data.unidadesVendidas)} detail="Productos en ventas" color="#2563eb" />
        <MetricCard icon={ReceiptText} label="Ticket promedio" value={money(Math.round(data.ticketPromedio))} detail="Por venta" color="#0d8a4d" />
        <MetricCard icon={TrendingUp} label="Venta/turno" value={money(Math.round(data.ventaPromedioTurno))} detail="Promedio por turno" color="#0d8a4d" />
        <MetricCard icon={Coins} label="Propinas" value={money(data.totalPropinas)} detail="Point" color="#d97706" />
      </div>

      {/* Movimiento por período */}
      <div style={{ marginBottom: '18px' }}>
        <ChartCard title="Movimiento por período" icon={TrendingUp}
          controls={<Toggle options={[{ value: 'bars', label: 'Turnos + $' }, { value: 'ventas', label: 'Ventas' }]} value={flowType} onChange={setFlowType} />}>
          <ResponsiveContainer width="100%" height={300}>
            {flowType === 'bars' ? (
              <ComposedChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} />
                <YAxis yAxisId="l" {...axisProps} allowDecimals={false} width={36} />
                <YAxis yAxisId="r" orientation="right" {...axisProps} tickFormatter={shortMoney} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => n === 'Monto' ? money(v) : v} /><Legend />
                <Bar yAxisId="l" name="Turnos" dataKey="turnos" fill="#6d28d9" radius={[4, 4, 0, 0]} />
                <Line yAxisId="r" name="Monto" dataKey="monto" stroke="var(--primary-color)" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            ) : (
              <BarChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} /><Legend />
                <Bar name="Ventas" dataKey="cantidadVentas" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Por barista */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: '18px', marginBottom: '18px' }}>
        <ChartCard title="Turnos por barista" icon={Users}>
          {data.porBarista.length === 0 ? <EmptyState>Sin turnos en el período.</EmptyState> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                <thead><tr>
                  <th style={th}>Barista</th><th style={{ ...th, textAlign: 'right' }}>Turnos</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ventas</th><th style={{ ...th, textAlign: 'right' }}>Monto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unid.</th><th style={{ ...th, textAlign: 'right' }}>Propina</th>
                  <th style={{ ...th, textAlign: 'right' }}>Diferencia</th>
                </tr></thead>
                <tbody>
                  {data.porBarista.map(b => (
                    <tr key={b.idUsuario}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{b.empleado || b.usuario}</div>
                        {b.empleado && <div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>{b.usuario}</div>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(b.turnos)}{b.turnosDescuadrados > 0 && <span style={{ color: '#dc2626', fontSize: '.72rem' }}> ({b.turnosDescuadrados}⚠)</span>}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(b.cantidadVentas)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(b.monto)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(b.unidades)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#d97706' }}>{money(b.propina)}</td>
                      <td style={{ ...td, textAlign: 'right', color: b.diferencia === 0 ? 'inherit' : '#dc2626' }}>{money(b.diferencia)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
        <ChartCard title="Ventas por barista" icon={Wallet}>
          {data.porBarista.length === 0 ? <EmptyState>Sin datos.</EmptyState> : <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.porBarista} dataKey="monto" nameKey="usuario" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {data.porBarista.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={money} /><Legend />
            </PieChart>
          </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Productos vendidos en los turnos */}
      <div style={{ marginBottom: '18px' }}>
        <ChartCard title="Productos vendidos en los turnos" icon={Package}>
          {productos.length === 0 ? <EmptyState>Sin productos en el período.</EmptyState> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '18px', alignItems: 'start' }}>
              <ResponsiveContainer width="100%" height={Math.max(220, productos.length * 30)}>
                <BarChart data={productos} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="nombreProducto" width={140} {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="cantidad" name="Unidades" fill="var(--primary-color)" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Producto</th><th style={{ ...th, textAlign: 'right' }}>Unid.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                  </tr></thead>
                  <tbody>
                    {productos.map(p => (
                      <tr key={p.idProducto}>
                        <td style={td}>{p.nombreProducto}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{num(p.cantidad)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(p.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Consumos del empleado por barista: ventas asociadas a bitácora (por cobrar) en el rango */}
      <div style={{ marginBottom: '18px' }}>
        <ChartCard title="Consumos del empleado por barista" icon={Gift}>
          {consumosPorBarista.length === 0 ? <EmptyState>Sin consumos de empleado registrados en el período.</EmptyState> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {consumosPorBarista.map(barista => {
                const expanded = expandedBaristas.includes(barista.idUsuario);
                return (
                <div key={barista.idUsuario} style={{ border: '1px solid var(--panel-border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <button type="button" onClick={() => setExpandedBaristas(current => expanded ? current.filter(id => id !== barista.idUsuario) : [...current, barista.idUsuario])} style={{ width: '100%', border: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '10px 14px', background: '#faf9f7', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{barista.empleado || barista.usuario}</div>
                      {barista.empleado && <div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>{barista.usuario}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: '999px', fontSize: '.74rem', fontWeight: 700 }}>Cortesía: {money(barista.totalCortesia)}</span>
                      <span style={{ background: '#e0f2fe', color: '#075985', padding: '3px 10px', borderRadius: '999px', fontSize: '.74rem', fontWeight: 700 }}>A pagar: {money(barista.totalAdeudado)}</span>
                      <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: '999px', fontSize: '.74rem', fontWeight: 700 }}>Pendiente: {money(barista.totalPendiente)}</span>
                      {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                    </div>
                  </button>
                  {expanded && <div style={{ overflowX: 'auto', maxHeight: '340px', overflowY: 'auto', borderTop: '1px solid var(--panel-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={th}>Fecha</th>
                        <th style={th}>Detalle</th>
                        <th style={{ ...th, textAlign: 'right' }}>Cortesía</th>
                        <th style={{ ...th, textAlign: 'right' }}>A pagar</th>
                        <th style={th}>Pago</th>
                      </tr></thead>
                      <tbody>
                        {barista.ventas.map(v => (
                          <tr key={v.idVenta}>
                            <td style={td}>{dateTime(v.fechaVenta)}</td>
                            <td style={td}>{v.items.map((it, i) => (
                              <div key={i} style={{ fontSize: '.82rem' }}>{num(it.cantidad)}× {it.nombreProducto}{it.esCortesia && <span style={{ color: '#d97706' }}> (cortesía)</span>}</div>
                            ))}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#d97706' }}>{v.montoCortesia > 0 ? money(v.montoCortesia) : '—'}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(v.montoAdeudado)}</td>
                            <td style={td}>
                              {v.montoAdeudado === 0
                                ? <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>N/A</span>
                                : can('registros_turnos.consumos.pagar') ? (
                                  <button type="button" className={`btn ${v.pagadoPorEmpleado ? 'btn-secondary' : 'btn-primary'}`} style={{ padding: '4px 10px', fontSize: '.76rem' }} onClick={() => marcarPagada(v)}>
                                    {v.pagadoPorEmpleado ? 'Pagado ✓' : 'Marcar pagada'}
                                  </button>
                                ) : <span className={`badge ${v.pagadoPorEmpleado ? 'badge-success' : 'badge-warning'}`}>{v.pagadoPorEmpleado ? 'Pagado' : 'Por cobrar'}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>}
                </div>
              )})}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Detalle de turnos */}
      <ChartCard title="Detalle de turnos" icon={ScrollText}>
        {data.turnos.length === 0 ? <EmptyState>Sin turnos en el período.</EmptyState> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead><tr>
                <th style={th}>#</th><th style={th}>Barista</th><th style={th}>Apertura</th><th style={th}>Cierre</th>
                <th style={th}>Estado</th><th style={{ ...th, textAlign: 'right' }}>Ventas</th>
                <th style={{ ...th, textAlign: 'right' }}>Unid.</th><th style={{ ...th, textAlign: 'right' }}>Monto</th>
                <th style={{ ...th, textAlign: 'right' }}>Cons./Cort.</th><th style={{ ...th, textAlign: 'right' }}>Propina</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferencia</th>
              </tr></thead>
              <tbody>
                {visibleTurns.map(t => {
                  const est = ESTADO_STYLE[t.idEstadoTurno] || { label: t.estado, bg: '#f1f5f9', color: '#475569' };
                  return (
                    <tr key={t.idTurno}>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{t.idTurno}</td>
                      <td style={td}>{t.empleado || t.usuario}</td>
                      <td style={td}>{dateTime(t.fechaApertura)}</td>
                      <td style={td}>{dateTime(t.fechaCierre)}</td>
                      <td style={td}><span style={{ background: est.bg, color: est.color, padding: '2px 8px', borderRadius: '999px', fontSize: '.72rem', fontWeight: 700 }}>{est.label}</span></td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(t.cantidadVentas)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(t.unidades)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(t.monto)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{num(t.consumoUnidades)} / {num(t.cortesiaUnidades)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#d97706' }}>{money(t.propina)}</td>
                      <td style={{ ...td, textAlign: 'right', color: (t.diferencia ?? 0) === 0 ? 'inherit' : '#dc2626' }}>{t.diferencia == null ? '—' : money(t.diferencia)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.turnos.length > turnPageSize && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}><span style={{ color: 'var(--text-muted)', fontSize: '.76rem' }}>Página {turnPage} de {turnPageCount}</span><div style={{ display: 'flex', gap: '6px' }}><button className="btn btn-secondary" disabled={turnPage === 1} onClick={() => setTurnPage(page => page - 1)}>Anterior</button><button className="btn btn-secondary" disabled={turnPage === turnPageCount} onClick={() => setTurnPage(page => page + 1)}>Siguiente</button></div></div>}
      </ChartCard>
    </>}
  </div>;
};

export default TurnsDashboard;
