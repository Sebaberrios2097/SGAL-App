import {
  ArrowLeft, CalendarDays, Coins, Gift, Package, ReceiptText, ScrollText,
  ShoppingBag, TrendingUp, Users, Wallet
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { useAuth } from '../context/AuthContext';

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

const MetricCard = ({ icon: Icon, label, value, detail, color = 'var(--primary-color)' }) => (
  <div className="card" style={{ padding: '18px', display: 'flex', gap: '14px', alignItems: 'center' }}>
    <div style={{ width: '44px', height: '44px', flex: '0 0 auto', borderRadius: '13px', background: `${color}14`, display: 'grid', placeItems: 'center' }}><Icon size={22} color={color} /></div>
    <div style={{ minWidth: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      {detail && <div style={{ color: 'var(--text-muted)', fontSize: '.72rem', marginTop: '2px' }}>{detail}</div>}
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

const ChartCard = ({ title, subtitle, icon: Icon, controls, children }) => (
  <div className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {Icon && <Icon size={18} color="var(--primary-color)" />}
        <div><h3 style={{ margin: 0 }}>{title}</h3>{subtitle && <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '2px 0 0' }}>{subtitle}</p>}</div>
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
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [flowType, setFlowType] = useState('bars');

  const { from, to } = useMemo(() => {
    const t = new Date();
    if (preset === 'custom') return { from: customFrom, to: customTo };
    if (preset === 'today') return { from: iso(t), to: iso(t) };
    if (preset === '7d') { const s = new Date(t); s.setDate(s.getDate() - 6); return { from: iso(s), to: iso(t) }; }
    if (preset === '30d') { const s = new Date(t); s.setDate(s.getDate() - 29); return { from: iso(s), to: iso(t) }; }
    return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    document.title = `Panel de turnos - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    if (!from || !to) return;
    setLoading(true); setError('');
    fetch(`/api/admin-dashboard/turns-overview?from=${from}&to=${to}&granularity=${granularity}`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar el panel de turnos.'); return result; })
      .then(setData).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [from, to, granularity]);

  const rangeLabel = useMemo(() => {
    if (!from || !to) return '';
    const f = new Date(`${from}T00:00:00`), t = new Date(`${to}T00:00:00`);
    return `${f.toLocaleDateString('es-CL')} – ${t.toLocaleDateString('es-CL')}`;
  }, [from, to]);

  const presets = [
    { value: 'today', label: 'Hoy' },
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: 'month', label: 'Este mes' },
    { value: 'custom', label: 'Personalizado' }
  ];

  const productos = data ? data.productosVendidos : [];

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
    <div style={{ marginBottom: '18px' }}>
      <Link to="/admin/turn-records" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '.82rem', textDecoration: 'none', marginBottom: '8px' }}>
        <ArrowLeft size={15} /> Registros de turnos
      </Link>
      <h2 className="page-title">Panel de turnos</h2>
      <p className="page-subtitle" style={{ marginBottom: '14px' }}>Turnos, baristas, productos y montos · {rangeLabel}</p>
      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className="input-label">Período</span>
          <Toggle options={presets} value={preset} onChange={setPreset} />
        </div>
        {preset === 'custom' && <>
          <label className="input-group" style={{ margin: 0 }}><span className="input-label">Desde</span><input className="input-field" type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} /></label>
          <label className="input-group" style={{ margin: 0 }}><span className="input-label">Hasta</span><input className="input-field" type="date" value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)} /></label>
        </>}
        <label className="input-group" style={{ margin: 0, marginLeft: 'auto' }}><span className="input-label">Agrupar</span>
          <select className="input-field" value={granularity} onChange={e => setGranularity(e.target.value)}>
            <option value="day">Por día</option>
            <option value="week">Por semana</option>
            <option value="month">Por mes</option>
          </select>
        </label>
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
        <ChartCard title="Movimiento por período" subtitle="Turnos y ventas en cada tramo" icon={TrendingUp}
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
        <ChartCard title="Turnos por barista" subtitle="A quién están asociados los turnos y montos" icon={Users}>
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
        <ChartCard title="Ventas por barista" subtitle="Participación del monto" icon={Wallet}>
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
        <ChartCard title="Productos vendidos en los turnos" subtitle="Vendidos durante los turnos del período" icon={Package}>
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
        <ChartCard title="Consumos del empleado por barista" subtitle="Ventas de consumo asociadas a la bitácora en el rango. Marca las pagadas por el vendedor." icon={Gift}>
          {consumosPorBarista.length === 0 ? <EmptyState>Sin consumos de empleado registrados en el período.</EmptyState> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {consumosPorBarista.map(barista => (
                <div key={barista.idUsuario} style={{ border: '1px solid var(--panel-border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '10px 14px', background: '#faf9f7', borderBottom: '1px solid var(--panel-border)' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{barista.empleado || barista.usuario}</div>
                      {barista.empleado && <div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>{barista.usuario}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: '999px', fontSize: '.74rem', fontWeight: 700 }}>Cortesía: {money(barista.totalCortesia)}</span>
                      <span style={{ background: '#e0f2fe', color: '#075985', padding: '3px 10px', borderRadius: '999px', fontSize: '.74rem', fontWeight: 700 }}>A pagar: {money(barista.totalAdeudado)}</span>
                      <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: '999px', fontSize: '.74rem', fontWeight: 700 }}>Pendiente: {money(barista.totalPendiente)}</span>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Detalle de turnos */}
      <ChartCard title="Detalle de turnos" subtitle="Cada turno del período" icon={ScrollText}>
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
                {data.turnos.map(t => {
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
      </ChartCard>
    </>}
  </div>;
};

export default TurnsDashboard;
