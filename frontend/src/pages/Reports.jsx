import { AlertCircle, BarChart3, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';

const isoDate = date => date.toISOString().slice(0, 10);
const clp = value => `$${(value ?? 0).toLocaleString('es-CL')}`;
const fmtDate = value => (value ? new Date(value).toLocaleDateString('es-CL') : '—');

const TABS = [
  { key: 'sales-by-product', label: 'Ventas por producto', perm: 'inicio.dashboard.ver', dated: true },
  { key: 'sales-by-period', label: 'Ventas por período', perm: 'inicio.dashboard.ver', dated: true },
  { key: 'stock', label: 'Stock', perm: 'inventario.productos.ver', dated: false },
  { key: 'purchases', label: 'Compras', perm: 'ordenes_compra.ver', dated: true }
];

const downloadCsv = (name, headers, rows) => {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(h => escape(h.label)).join(',')];
  rows.forEach(row => lines.push(headers.map(h => escape(h.value(row))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const Reports = () => {
  const { can } = useAuth();
  const tabs = useMemo(() => TABS.filter(t => can(t.perm)), [can]);
  const [activeTab, setActiveTab] = useState(tabs[0]?.key);
  const today = useMemo(() => new Date(), []);
  const [desde, setDesde] = useState(isoDate(new Date(today.getTime() - 29 * 86400000)));
  const [hasta, setHasta] = useState(isoDate(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentTab = tabs.find(t => t.key === activeTab);

  useEffect(() => {
    document.title = `Reportes - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
  }, []);

  useEffect(() => {
    if (!currentTab) return;
    setLoading(true);
    setError('');
    const query = currentTab.dated ? `?desde=${desde}&hasta=${hasta}` : '';
    fetch(`/api/reports/${currentTab.key}${query}`)
      .then(async response => {
        const body = await response.text();
        const parsed = body ? JSON.parse(body) : {};
        if (!response.ok) throw new Error(parsed.mensaje || 'No fue posible cargar el reporte.');
        return parsed;
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeTab, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentTab) {
    return <div className="card purchase-empty">No tiene permisos para ver reportes.</div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div><h2 className="page-title"><BarChart3 size={25} /> Reportes</h2></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map(tab => (
          <button key={tab.key} type="button"
            className={`btn ${tab.key === activeTab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setData(null); setActiveTab(tab.key); }}>{tab.label}</button>
        ))}
      </div>

      {currentTab.dated && (
        <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <label className="input-group"><span className="input-label">Desde</span><input type="date" className="input-field" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
          <label className="input-group"><span className="input-label">Hasta</span><input type="date" className="input-field" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
        </div>
      )}

      {error && <div className="card provider-feedback is-error"><AlertCircle size={17} /> {error}</div>}

      {loading ? <div className="card purchase-empty">Cargando reporte…</div> : data && (
        <>
          {activeTab === 'sales-by-product' && <SalesByProduct data={data} />}
          {activeTab === 'sales-by-period' && <SalesByPeriod data={data} />}
          {activeTab === 'stock' && <Stock data={data} />}
          {activeTab === 'purchases' && <Purchases data={data} />}
        </>
      )}
    </div>
  );
};

const ExportButton = ({ onClick }) => (
  <button type="button" className="btn btn-secondary" onClick={onClick} style={{ marginBottom: 12 }}><Download size={15} /> Exportar CSV</button>
);

const SalesByProduct = ({ data }) => (
  <>
    <div className="purchase-summary-grid provider-summary-grid">
      <div className="card purchase-summary-card"><span>Unidades vendidas</span><strong>{data.totalUnidades}</strong></div>
      <div className="card purchase-summary-card"><span>Ingresos</span><strong>{clp(data.totalIngresos)}</strong></div>
      <div className="card purchase-summary-card"><span>Productos distintos</span><strong>{(data.productos || []).length}</strong></div>
    </div>
    <ExportButton onClick={() => downloadCsv('ventas_por_producto.csv',
      [{ label: 'Producto', value: p => p.nombreProducto }, { label: 'Cantidad', value: p => p.cantidad }, { label: 'Ingresos', value: p => p.ingresos }],
      data.productos)} />
    <DataTable rows={data.productos || []} rowKey={p => p.idProducto}
      search={p => p.nombreProducto} searchPlaceholder="Buscar producto…" emptyMessage="Sin ventas en el período."
      columns={[
        { key: 'producto', header: 'Producto', sortValue: p => p.nombreProducto, cell: p => <strong>{p.nombreProducto}</strong> },
        { key: 'cantidad', header: 'Cantidad', align: 'right', sortValue: p => p.cantidad, cell: p => p.cantidad },
        { key: 'ingresos', header: 'Ingresos', align: 'right', sortValue: p => p.ingresos, cell: p => clp(p.ingresos) }
      ]} />
  </>
);

const SalesByPeriod = ({ data }) => (
  <>
    <div className="purchase-summary-grid provider-summary-grid">
      <div className="card purchase-summary-card"><span>Ventas</span><strong>{data.totalVentas}</strong></div>
      <div className="card purchase-summary-card"><span>Monto total</span><strong>{clp(data.totalMonto)}</strong></div>
    </div>
    <div className="card" style={{ marginBottom: 16 }}>
      <strong style={{ display: 'block', marginBottom: 8 }}>Por método de pago</strong>
      {(data.porMetodo || []).length === 0 ? <span style={{ color: 'var(--text-muted)' }}>Sin datos.</span> :
        (data.porMetodo || []).map(m => <div key={m.metodo} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>{m.metodo}</span><strong>{clp(m.total)}</strong></div>)}
    </div>
    <ExportButton onClick={() => downloadCsv('ventas_por_dia.csv',
      [{ label: 'Fecha', value: d => fmtDate(d.fecha) }, { label: 'Ventas', value: d => d.ventas }, { label: 'Total', value: d => d.total }],
      data.porDia)} />
    <DataTable rows={data.porDia || []} rowKey={d => d.fecha}
      searchPlaceholder="Buscar…" emptyMessage="Sin ventas en el período."
      columns={[
        { key: 'fecha', header: 'Fecha', sortValue: d => d.fecha, cell: d => fmtDate(d.fecha) },
        { key: 'ventas', header: 'Ventas', align: 'right', sortValue: d => d.ventas, cell: d => d.ventas },
        { key: 'total', header: 'Total', align: 'right', sortValue: d => d.total, cell: d => clp(d.total) }
      ]} />
  </>
);

const Stock = ({ data }) => (
  <>
    <div className="purchase-summary-grid provider-summary-grid">
      <div className="card purchase-summary-card"><span>Productos</span><strong>{(data.productos || []).length}</strong></div>
      <div className="card purchase-summary-card"><span>Agotados</span><strong>{data.agotados}</strong></div>
      <div className="card purchase-summary-card"><span>Bajos</span><strong>{data.bajos}</strong></div>
    </div>
    <ExportButton onClick={() => downloadCsv('stock.csv',
      [{ label: 'Producto', value: p => p.nombreProducto }, { label: 'Categoría', value: p => p.categoria }, { label: 'Stock', value: p => p.stock }, { label: 'Mínimo', value: p => p.minimo }, { label: 'Estado', value: p => p.estado }],
      data.productos)} />
    <DataTable rows={data.productos || []} rowKey={p => p.idProducto}
      search={p => `${p.nombreProducto} ${p.categoria || ''}`} searchPlaceholder="Buscar producto…"
      filter={{ label: 'Estado', options: [
        { value: 'all', label: 'Todos', test: () => true },
        { value: 'agotado', label: 'Agotados', test: p => p.estado === 'agotado' },
        { value: 'bajo', label: 'Bajos', test: p => p.estado === 'bajo' },
        { value: 'disponible', label: 'Disponibles', test: p => p.estado === 'disponible' }
      ] }}
      emptyMessage="Sin productos con control de stock."
      columns={[
        { key: 'producto', header: 'Producto', sortValue: p => p.nombreProducto, cell: p => <div><strong>{p.nombreProducto}</strong><small style={{ display: 'block', color: 'var(--text-muted)' }}>{p.categoria}</small></div> },
        { key: 'stock', header: 'Stock', align: 'right', sortValue: p => p.stock, cell: p => p.stock },
        { key: 'minimo', header: 'Mínimo', align: 'right', sortValue: p => p.minimo, cell: p => p.minimo },
        { key: 'estado', header: 'Estado', sortValue: p => p.estado, cell: p => <span className={`badge ${p.estado === 'agotado' ? 'provider-status-inactive' : p.estado === 'bajo' ? 'badge-warning' : 'badge-success'}`}>{p.estado}</span> }
      ]} />
  </>
);

const Purchases = ({ data }) => (
  <>
    <div className="purchase-summary-grid provider-summary-grid">
      <div className="card purchase-summary-card"><span>Órdenes</span><strong>{(data.ordenes || []).length}</strong></div>
      <div className="card purchase-summary-card"><span>Gasto estimado</span><strong>{clp(data.totalEstimado)}</strong></div>
      <div className="card purchase-summary-card"><span>Gasto real</span><strong>{clp(data.totalReal)}</strong></div>
    </div>
    <ExportButton onClick={() => downloadCsv('compras.csv',
      [{ label: 'Orden', value: o => o.idOrdenCompra }, { label: 'Proveedor', value: o => o.proveedor }, { label: 'Solicitud', value: o => fmtDate(o.fechaSolicitud) }, { label: 'Recepción', value: o => fmtDate(o.fechaRecepcion) }, { label: 'Estado', value: o => o.estado }, { label: 'Estimado', value: o => o.montoTotal }, { label: 'Real', value: o => o.montoTotalReal ?? '' }],
      data.ordenes)} />
    <DataTable rows={data.ordenes || []} rowKey={o => o.idOrdenCompra}
      search={o => `${o.proveedor} ${o.estado}`} searchPlaceholder="Buscar proveedor…" emptyMessage="Sin compras en el período."
      columns={[
        { key: 'orden', header: 'N°', sortValue: o => o.idOrdenCompra, cell: o => `#${o.idOrdenCompra}` },
        { key: 'proveedor', header: 'Proveedor', sortValue: o => o.proveedor, cell: o => <strong>{o.proveedor}</strong> },
        { key: 'solicitud', header: 'Solicitud', sortValue: o => o.fechaSolicitud, cell: o => fmtDate(o.fechaSolicitud) },
        { key: 'estado', header: 'Estado', sortValue: o => o.estado, cell: o => <span className="badge">{o.estado}</span> },
        { key: 'estimado', header: 'Estimado', align: 'right', sortValue: o => o.montoTotal, cell: o => clp(o.montoTotal) },
        { key: 'real', header: 'Real', align: 'right', sortValue: o => o.montoTotalReal ?? 0, cell: o => o.montoTotalReal != null ? clp(o.montoTotalReal) : '—' }
      ]} />
  </>
);

export default Reports;
