import { ArrowLeft, PackageCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { confirmDialog, useNotificationMessage } from '../components/NotificationCenter';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;

const ReceptionList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');

  useEffect(() => {
    document.title = `Recepciones - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    fetch('/api/purchase-orders').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar las órdenes.');
      return data;
    }).then(data => setOrders(data.filter(order => order.estado === 'Emitida')))
      .catch(err => setError(err.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando recepciones…</div>;

  return <div className="animate-fade-in">
    <PageHeader title="Recepciones pendientes" icon={PackageCheck} backTo="/purchase-orders" backLabel="Órdenes" />
    {error && <div className="card purchase-feedback is-error">{error}</div>}
    <DataTable
      rows={orders}
      rowKey={order => order.idOrdenCompra}
      pageSize={10}
      search={order => `${order.idOrdenCompra} ${order.proveedor} ${order.items.map(item => item.nombre).join(' ')}`}
      searchPlaceholder="Buscar orden, proveedor o artículo…"
      emptyMessage="No hay órdenes emitidas pendientes de recepción."
      columns={[
        { key: 'orden', header: 'Orden', sortValue: order => order.idOrdenCompra, cell: order => <><strong>#{order.idOrdenCompra}</strong><div className="purchase-cell-meta">{new Date(order.fechaSolicitud).toLocaleDateString('es-CL')}</div></> },
        { key: 'proveedor', header: 'Proveedor', sortValue: order => order.proveedor, cell: order => order.proveedor },
        { key: 'articulos', header: 'Artículos', align: 'right', sortValue: order => order.cantidadProductos, cell: order => order.cantidadProductos },
        { key: 'total', header: 'Total estimado', align: 'right', sortValue: order => order.totalEstimado, cell: order => money(order.totalEstimado) },
        { key: 'llegada', header: 'Llegada esperada', sortValue: order => new Date(order.fechaLlegadaEsperada).getTime(), cell: order => new Date(order.fechaLlegadaEsperada).toLocaleDateString('es-CL') },
        { key: 'accion', header: 'Acción', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: order => <Link className="btn btn-primary" to={`/purchase-orders/receptions/${order.idOrdenCompra}`}><PackageCheck size={15} /> Recibir</Link> }
      ]}
    />
  </div>;
};

const ReceptionDetail = ({ id }) => {
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [receipts, setReceipts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useNotificationMessage('error');

  useEffect(() => {
    fetch(`/api/purchase-orders/${id}`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar la orden.');
      if (data.estado !== 'Emitida') throw new Error('Esta orden ya no está pendiente de recepción.');
      return data;
    }).then(data => {
      setOrder(data);
      setReceipts(Object.fromEntries(data.items.map(item => [item.idOrdenDetalle, {
        cantidadRecibida: item.cantidadSolicitada,
        precioUnitarioReal: item.precioUnitario,
        nuevoPrecioVenta: item.nuevoPrecioVenta ?? '',
        observacionRecepcion: ''
      }])));
      document.title = `Recepción orden #${data.idOrdenCompra}`;
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [id]);

  const total = useMemo(() => order?.items.reduce((sum, item) => {
    const receipt = receipts[item.idOrdenDetalle] || {};
    return sum + Number(receipt.cantidadRecibida || 0) * Number(receipt.precioUnitarioReal || 0);
  }, 0) || 0, [order, receipts]);

  const update = (detailId, field, value) => setReceipts(current => ({ ...current, [detailId]: { ...current[detailId], [field]: value } }));

  const receive = async () => {
    if (!await confirmDialog({ title: 'Confirmar recepción', message: 'La recepción actualizará las existencias del inventario.', confirmText: 'Recibir productos' })) return;
    setSaving(true); setError('');
    try {
      const items = order.items.map(item => ({ idOrdenDetalle: item.idOrdenDetalle, ...receipts[item.idOrdenDetalle], nuevoPrecioVenta: receipts[item.idOrdenDetalle].nuevoPrecioVenta === '' ? null : Number(receipts[item.idOrdenDetalle].nuevoPrecioVenta) }));
      const response = await fetch(`/api/purchase-orders/${id}/receive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.mensaje || 'No fue posible registrar la recepción.');
      const priceIds = items.filter(item => item.nuevoPrecioVenta).map(item => item.idOrdenDetalle);
      if (priceIds.length > 0) {
        const priceResponse = await fetch(`/api/purchase-orders/${id}/confirm-prices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idsOrdenDetalle: priceIds }) });
        const priceResult = await priceResponse.json();
        if (!priceResponse.ok) throw new Error(priceResult.mensaje || 'La recepción se guardó, pero no se actualizaron los precios.');
      }
      navigate('/purchase-orders/receptions', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando orden…</div>;
  if (!order) return <div className="animate-fade-in"><Link className="purchase-back-link" to="/purchase-orders/receptions"><ArrowLeft size={16} /> Volver a recepciones</Link><div className="card purchase-feedback is-error">{error}</div></div>;

  return <div className="animate-fade-in">
    <PageHeader title={`Recepción orden #${order.idOrdenCompra}`} icon={PackageCheck} backTo="/purchase-orders/receptions" backLabel="Recepciones" />
    <div className="card purchase-reception-summary"><div><span>Proveedor</span><strong>{order.proveedor}</strong></div><div><span>Llegada esperada</span><strong>{new Date(order.fechaLlegadaEsperada).toLocaleDateString('es-CL')}</strong></div><div><span>Artículos</span><strong>{order.cantidadProductos}</strong></div></div>
    {error && <div className="card purchase-feedback is-error">{error}</div>}
    <div className="card purchase-reception-card" style={{ marginTop: 0 }}>
      <div className="table-scroll-wrapper"><table className="custom-table purchase-items-table"><thead><tr><th>Artículo</th><th>Solicitado</th><th>Recibido</th><th>Costo unitario real</th><th>Subtotal</th><th>Nuevo precio de venta</th><th>Observación</th></tr></thead><tbody>{order.items.map(item => {
        const receipt = receipts[item.idOrdenDetalle] || {};
        return <tr key={item.idOrdenDetalle}><td><strong>{item.nombre}</strong><span className="purchase-item-meta">{item.codigo} · {item.formato}: {item.contenidoFormato} {item.unidadContenido}</span></td><td>{item.cantidadSolicitada} {item.unidad}</td><td><input className="input-field purchase-number-input" type="number" min="0" max={item.cantidadSolicitada} step={item.idFormatoCompra || item.tipoItem === 'Producto' ? 1 : 0.001} value={receipt.cantidadRecibida} onChange={event => update(item.idOrdenDetalle, 'cantidadRecibida', event.target.value)} /></td><td><input className="input-field purchase-number-input" type="number" min="0" step="1" value={receipt.precioUnitarioReal} onChange={event => update(item.idOrdenDetalle, 'precioUnitarioReal', event.target.value)} /></td><td><strong>{money(Number(receipt.cantidadRecibida || 0) * Number(receipt.precioUnitarioReal || 0))}</strong></td><td>{item.tipoItem === 'Producto' ? <input className="input-field purchase-number-input" type="number" min="1" step="1" placeholder="Sin cambio" value={receipt.nuevoPrecioVenta} onChange={event => update(item.idOrdenDetalle, 'nuevoPrecioVenta', event.target.value)} /> : 'No aplica'}</td><td><input className="input-field" maxLength="300" placeholder={Number(receipt.cantidadRecibida) === 0 ? 'Motivo' : 'Opcional'} value={receipt.observacionRecepcion} onChange={event => update(item.idOrdenDetalle, 'observacionRecepcion', event.target.value)} /></td></tr>;
      })}</tbody></table></div>
      <div className="purchase-total-row"><span>Gasto real</span><strong>{money(total)}</strong></div>
      <div className="purchase-footer-actions"><button type="button" className="btn btn-secondary" onClick={() => navigate('/purchase-orders/receptions')}>Cancelar</button><button type="button" className="btn btn-primary" disabled={saving} onClick={receive}><PackageCheck size={15} /> {saving ? 'Registrando…' : 'Confirmar recepción'}</button></div>
    </div>
  </div>;
};

const PurchaseOrderReceptions = () => {
  const { id } = useParams();
  return id ? <ReceptionDetail id={id} /> : <ReceptionList />;
};

export default PurchaseOrderReceptions;
