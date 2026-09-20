import {
  Banknote, CalendarDays, Coins, CreditCard, DollarSign, ReceiptText, Scale,
  ShoppingBag, TrendingDown, TrendingUp, Users, Wallet
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNotificationMessage } from '../components/NotificationCenter';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const shortMoney = value => Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const COLORS = ['var(--primary-color)', '#0d8a4d', '#52b788', '#95d5b2', '#2563eb', '#d97706'];

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

const axisProps = { fontSize: 11, stroke: '#94a3b8', tickLine: false };
const tooltipStyle = { fontSize: '0.8rem', borderRadius: '10px', border: '1px solid var(--panel-border)' };

const AdminDashboard = () => {
  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState('30d');
  const [customFrom, setCustomFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)));
  const [customTo, setCustomTo] = useState(iso(today));
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');

  // Toggles por gráfico
  const [flowType, setFlowType] = useState('area');
  const [salesType, setSalesType] = useState('bar');

  const { from, to } = useMemo(() => {
    const t = new Date();
    if (preset === 'custom') return { from: customFrom, to: customTo };
    if (preset === 'today') return { from: iso(t), to: iso(t) };
    if (preset === '7d') { const s = new Date(t); s.setDate(s.getDate() - 6); return { from: iso(s), to: iso(t) }; }
    if (preset === 'month') return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
    const s = new Date(t); s.setDate(s.getDate() - 29); return { from: iso(s), to: iso(t) };
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    document.title = `Panel administrativo - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    if (!from || !to) return;
    setLoading(true); setError('');
    fetch(`/api/admin-dashboard/overview?from=${from}&to=${to}&granularity=${granularity}`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar el panel.'); return result; })
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

  return <div className="animate-fade-in">
    <div style={{ marginBottom: '18px' }}>
      <h2 className="page-title">Panel administrativo</h2>
      <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '4px 0 14px' }}>{rangeLabel}</div>
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
        <MetricCard icon={DollarSign} label="Ingresos" value={money(data.totalIngresos)} detail="Ventas terminadas" />
        <MetricCard icon={TrendingDown} label="Egresos" value={money(data.totalEgresos)} detail="Compras recibidas" color="#dc2626" />
        <MetricCard icon={Scale} label="Resultado" value={money(data.resultado)} detail="Ingresos − Egresos" color={data.resultado >= 0 ? '#0d8a4d' : '#dc2626'} />
        <MetricCard icon={ShoppingBag} label="Ventas" value={Number(data.cantidadVentas).toLocaleString('es-CL')} detail="Operaciones" color="#2563eb" />
        <MetricCard icon={ReceiptText} label="Ticket promedio" value={money(Math.round(data.ticketPromedio))} detail="Por venta" color="#0d8a4d" />
        <MetricCard icon={Coins} label="Propinas" value={money(data.totalPropinas)} detail="Point" color="#d97706" />
        {data.turnsEnabled && <MetricCard icon={Wallet} label="Diferencia de caja" value={money(data.diferenciaCajaTotal)} detail="Sobrante/faltante" color={data.diferenciaCajaTotal === 0 ? '#0d8a4d' : '#dc2626'} />}
        {data.turnsEnabled && <MetricCard icon={CalendarDays} label="Turnos" value={data.cantidadTurnos} detail="En el período" color="#6d28d9" />}
      </div>

      {/* Ingresos vs Egresos */}
      <div style={{ marginBottom: '18px' }}>
        <ChartCard title="Ingresos vs Egresos" icon={TrendingUp}
          controls={<Toggle options={[{ value: 'area', label: 'Área' }, { value: 'line', label: 'Línea' }, { value: 'bar', label: 'Barras' }]} value={flowType} onChange={setFlowType} />}>
          <ResponsiveContainer width="100%" height={300}>
            {flowType === 'bar' ? (
              <BarChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} /><YAxis {...axisProps} tickFormatter={shortMoney} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={money} /><Legend />
                <Bar name="Ingresos" dataKey="ingresos" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                <Bar name="Egresos" dataKey="egresos" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : flowType === 'line' ? (
              <LineChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} /><YAxis {...axisProps} tickFormatter={shortMoney} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={money} /><Legend />
                <Line name="Ingresos" dataKey="ingresos" stroke="var(--primary-color)" strokeWidth={2.5} dot={false} />
                <Line name="Egresos" dataKey="egresos" stroke="#dc2626" strokeWidth={2.5} dot={false} />
                <Line name="Resultado" dataKey="resultado" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} /><YAxis {...axisProps} tickFormatter={shortMoney} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={money} /><Legend />
                <Area name="Ingresos" dataKey="ingresos" stroke="var(--primary-color)" strokeWidth={2.5} fill="var(--primary-color)" fillOpacity={0.14} />
                <Area name="Egresos" dataKey="egresos" stroke="#dc2626" strokeWidth={2.5} fill="#dc2626" fillOpacity={0.12} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: '18px', marginBottom: '18px' }}>
        {/* Ventas por período */}
        <ChartCard title="Ventas por período" icon={ShoppingBag}
          controls={<Toggle options={[{ value: 'bar', label: 'Barras' }, { value: 'line', label: 'Línea' }]} value={salesType} onChange={setSalesType} />}>
          <ResponsiveContainer width="100%" height={260}>
            {salesType === 'line' ? (
              <LineChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line name="Ventas" dataKey="cantidadVentas" stroke="#2563eb" strokeWidth={2.5} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={data.series} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                <XAxis dataKey="etiqueta" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar name="Ventas" dataKey="cantidadVentas" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </ChartCard>

        {/* Medios de pago */}
        <ChartCard title="Medios de pago" icon={CreditCard}>
          {data.metodosPago.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>Sin pagos en el período.</div> : <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data.metodosPago} dataKey="monto" nameKey="nombreMetodoPago" innerRadius={55} outerRadius={95} paddingAngle={2}>
                {data.metodosPago.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={money} /><Legend />
            </PieChart>
          </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Flujo de caja: solo existe cuando la instalación trabaja con turnos. */}
      {data.turnsEnabled && <div style={{ marginBottom: '18px' }}>
        <ChartCard title="Flujo de caja" icon={Wallet}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px' }}><div style={{ color: 'var(--text-muted)', fontSize: '.72rem', fontWeight: 700 }}>EFECTIVO APERTURA</div><strong style={{ fontSize: '1.1rem' }}>{money(data.flujoCaja.efectivoApertura)}</strong></div>
            <div style={{ padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px' }}><div style={{ color: 'var(--text-muted)', fontSize: '.72rem', fontWeight: 700 }}>EFECTIVO CIERRE</div><strong style={{ fontSize: '1.1rem' }}>{money(data.flujoCaja.efectivoCierre)}</strong></div>
            <div style={{ padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px' }}><div style={{ color: 'var(--text-muted)', fontSize: '.72rem', fontWeight: 700 }}>DIFERENCIA TOTAL</div><strong style={{ fontSize: '1.1rem', color: data.diferenciaCajaTotal === 0 ? '#0d8a4d' : '#dc2626' }}>{money(data.diferenciaCajaTotal)}</strong></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '18px' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '.76rem', margin: '0 0 8px' }}>Esperado vs. real por método</p>
              {data.flujoCaja.porMetodo.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Sin turnos cerrados en el período.</div> : <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.flujoCaja.porMetodo} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                  <XAxis dataKey="nombreMetodoPago" {...axisProps} /><YAxis {...axisProps} tickFormatter={shortMoney} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={money} /><Legend />
                  <Bar name="Esperado" dataKey="esperado" fill="#95d5b2" radius={[4, 4, 0, 0]} />
                  <Bar name="Real" dataKey="real" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>}
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '.76rem', margin: '0 0 8px' }}>Diferencia de caja por día</p>
              {data.flujoCaja.diferenciaPorDia.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Sin diferencias registradas.</div> : <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.flujoCaja.diferenciaPorDia} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" vertical={false} />
                  <XAxis dataKey="fecha" {...axisProps} tickFormatter={d => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })} />
                  <YAxis {...axisProps} tickFormatter={shortMoney} width={44} />
                  <Tooltip contentStyle={tooltipStyle} formatter={money} labelFormatter={d => new Date(d).toLocaleDateString('es-CL')} />
                  <Line name="Diferencia" dataKey="diferencia" stroke="#d97706" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>}
            </div>
          </div>
        </ChartCard>
      </div>}

      <div style={{ marginBottom: '18px' }}>
        <ChartCard title="Ventas por usuario" icon={Users}>
          {data.ventasPorUsuario.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Sin ventas en el período.</div> : <ResponsiveContainer width="100%" height={Math.max(210, data.ventasPorUsuario.length * 42)}>
            <BarChart data={data.ventasPorUsuario.map(item => ({ ...item, nombre: item.empleado || item.usuario }))} layout="vertical" margin={{ left: 8, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f5" horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={shortMoney} />
              <YAxis type="category" dataKey="nombre" width={145} {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => name === 'Monto' ? money(value) : value} />
              <Bar dataKey="monto" name="Monto" fill="var(--primary-color)" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Rankings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
        <ChartCard title="Productos más vendidos" icon={ShoppingBag}>
          {data.productosMasVendidos.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Sin ventas en el período.</div> : <ResponsiveContainer width="100%" height={Math.max(200, data.productosMasVendidos.length * 34)}>
            <BarChart data={data.productosMasVendidos} layout="vertical" margin={{ left: 8, right: 12 }}>
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="nombreProducto" width={130} {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => n === 'monto' ? money(v) : v} />
              <Bar dataKey="cantidad" name="Unidades" fill="var(--primary-color)" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer>}
        </ChartCard>
        <ChartCard title="Categorías más vendidas" icon={Banknote}>
          {data.categoriasMasVendidas.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Sin ventas en el período.</div> : <ResponsiveContainer width="100%" height={280}>
            <PieChart margin={{ top: 8, bottom: 8 }}>
              <Pie data={data.categoriasMasVendidas} dataKey="cantidad" nameKey="nombreCategoria" cx="50%" cy="45%" outerRadius={90}>
                {data.categoriasMasVendidas.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} uds.`} /><Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>}
        </ChartCard>
      </div>
    </>}
  </div>;
};

export default AdminDashboard;
