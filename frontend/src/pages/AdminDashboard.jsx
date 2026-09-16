import { Banknote, CalendarDays, CreditCard, DollarSign, ReceiptText, ShoppingBag, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const MetricCard = ({ icon: Icon, label, value, detail, color = '#004c25' }) => <div className="card" style={{ padding: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
  <div style={{ width: '46px', height: '46px', flex: '0 0 auto', borderRadius: '13px', background: `${color}14`, display: 'grid', placeItems: 'center' }}><Icon size={23} color={color} /></div>
  <div><div style={{ color: 'var(--text-muted)', fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div><div style={{ fontSize: '1.55rem', fontWeight: 800, lineHeight: 1.2 }}>{value}</div><div style={{ color: 'var(--text-muted)', fontSize: '.75rem', marginTop: '3px' }}>{detail}</div></div>
</div>;

const SalesLineChart = ({ data, days }) => {
  const values = Array.from({ length: days }, (_, index) => data.find(item => item.dia === index + 1)?.monto || 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${40 + index * (700 / Math.max(days - 1, 1))},${180 - value / max * 135}`).join(' ');
  return <div style={{ overflowX: 'auto' }}><svg viewBox="0 0 760 220" role="img" aria-label="Flujo de ventas diario" style={{ width: '100%', minWidth: '620px', display: 'block' }}>
    {[0, .25, .5, .75, 1].map(level => <g key={level}><line x1="40" y1={180 - level * 135} x2="740" y2={180 - level * 135} stroke="#e2e8f0" strokeWidth="1" /><text x="34" y={184 - level * 135} textAnchor="end" fill="#64748b" fontSize="10">{max * level >= 1000 ? `${Math.round(max * level / 1000)}k` : Math.round(max * level)}</text></g>)}
    <polygon points={`40,180 ${points} 740,180`} fill="rgba(0,76,37,.10)" />
    <polyline points={points} fill="none" stroke="#006b37" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    {values.map((value, index) => value > 0 && <circle key={index} cx={40 + index * (700 / Math.max(days - 1, 1))} cy={180 - value / max * 135} r="3.5" fill="#fff" stroke="#006b37" strokeWidth="2"><title>Día {index + 1}: {money(value)}</title></circle>)}
    {values.map((_, index) => ((index + 1) === 1 || (index + 1) % 5 === 0 || index + 1 === days) && <text key={index} x={40 + index * (700 / Math.max(days - 1, 1))} y="203" textAnchor="middle" fill="#64748b" fontSize="10">{index + 1}</text>)}
  </svg></div>;
};

const Ranking = ({ items, nameKey, empty }) => {
  const maximum = Math.max(...items.map(item => item.cantidad), 1);
  return <div style={{ display: 'grid', gap: '14px' }}>{items.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '36px 0' }}>{empty}</div> : items.map((item, index) => <div key={item.idProducto || item.idCategoriaProducto}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '.84rem', marginBottom: '6px' }}><span><strong style={{ color: '#006b37', marginRight: '8px' }}>#{index + 1}</strong>{item[nameKey]}</span><span style={{ fontWeight: 700 }}>{item.cantidad} uds.</span></div>
    <div style={{ height: '8px', borderRadius: '999px', background: '#e8eef0', overflow: 'hidden' }}><div style={{ height: '100%', width: `${item.cantidad / maximum * 100}%`, minWidth: '5px', borderRadius: 'inherit', background: index === 0 ? '#006b37' : index === 1 ? '#2c9461' : '#81b89b' }} /></div>
    <div style={{ color: 'var(--text-muted)', fontSize: '.7rem', marginTop: '3px', textAlign: 'right' }}>{money(item.monto)}</div>
  </div>)}</div>;
};

const PaymentFlow = ({ items, total }) => <div style={{ display: 'grid', gap: '12px' }}>{items.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '28px' }}>Sin pagos registrados en el período.</div> : <>
  <div style={{ display: 'flex', height: '18px', overflow: 'hidden', borderRadius: '999px', background: '#e2e8f0' }}>{items.map((item, index) => <div key={item.idMetodoPago} title={`${item.nombreMetodoPago}: ${money(item.monto)}`} style={{ width: `${item.monto / Math.max(total, 1) * 100}%`, background: ['#004c25', '#0d8a4d', '#52b788', '#95d5b2'][index % 4] }} />)}</div>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>{items.map((item, index) => <div key={item.idMetodoPago} style={{ padding: '11px', border: '1px solid var(--panel-border)', borderRadius: '10px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '.75rem' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ['#004c25', '#0d8a4d', '#52b788', '#95d5b2'][index % 4] }} />{item.nombreMetodoPago}</div><strong>{money(item.monto)}</strong></div>)}</div>
  </>}</div>;

const AdminDashboard = () => {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, monthNumber] = month.split('-').map(Number);

  useEffect(() => {
    document.title = 'Panel administrativo - Siete Vidas';
    setLoading(true); setError('');
    fetch(`/api/admin-dashboard/monthly-summary?year=${year}&month=${monthNumber}`)
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar el panel.'); return result; })
      .then(setData).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [year, monthNumber]);

  const monthLabel = useMemo(() => new Date(year, monthNumber - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }), [year, monthNumber]);
  return <div className="animate-fade-in">
    <div className="page-header" style={{ alignItems: 'end' }}><div><h2 className="page-title">Panel administrativo</h2><p className="page-subtitle">Resumen de rendimiento de {monthLabel}.</p></div><div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}><label className="input-group" style={{ margin: 0 }}><span className="input-label">Período</span><input className="input-field" type="month" value={month} onChange={event => setMonth(event.target.value)} /></label><Link className="btn btn-secondary" to="/admin/turn-records"><CalendarDays size={17} /> Registros de turnos</Link></div></div>
    {error && <div className="card" style={{ color: '#b91c1c' }}>{error}</div>}
    {loading ? <div className="card" style={{ textAlign: 'center' }}>Preparando indicadores…</div> : data && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: '16px', marginBottom: '18px' }}>
        <MetricCard icon={DollarSign} label="Flujo del mes" value={money(data.totalVentas)} detail="Ventas terminadas" />
        <MetricCard icon={ShoppingBag} label="Cantidad de ventas" value={data.cantidadVentas.toLocaleString('es-CL')} detail="Operaciones completadas" color="#0d8a4d" />
        <MetricCard icon={ReceiptText} label="Ticket promedio" value={money(Math.round(data.ticketPromedio))} detail="Promedio por venta" color="#2563eb" />
        <MetricCard icon={CalendarDays} label="Turnos registrados" value={data.cantidadTurnos} detail="Durante el período" color="#d97706" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(290px, 1fr)', gap: '18px', marginBottom: '18px' }}>
        <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><div><h3>Flujo de ventas diario</h3><p style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>Ingresos por día del mes</p></div><TrendingUp color="#006b37" /></div><SalesLineChart data={data.ventasDiarias} days={data.periodo.dias} /></div>
        <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '22px' }}><div><h3>Medios de pago</h3><p style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>Distribución del flujo</p></div><CreditCard color="#006b37" /></div><PaymentFlow items={data.metodosPago} total={data.totalVentas} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
        <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}><div><h3>Productos más vendidos</h3><p style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>Ordenados por unidades vendidas</p></div><ShoppingBag color="#006b37" /></div><Ranking items={data.productosMasVendidos} nameKey="nombreProducto" empty="No hay productos vendidos en este mes." /></div>
        <div className="card"><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}><div><h3>Categorías más vendidas</h3><p style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>Participación por unidades</p></div><Banknote color="#006b37" /></div><Ranking items={data.categoriasMasVendidas} nameKey="nombreCategoria" empty="No hay categorías vendidas en este mes." /></div>
      </div>
    </>}
  </div>;
};

export default AdminDashboard;
