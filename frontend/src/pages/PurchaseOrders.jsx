import { ClipboardCheck, Download, Eye, FileSpreadsheet, LoaderCircle, PackageCheck, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNotificationMessage } from '../components/NotificationCenter';
import { Link } from 'react-router-dom';
import { downloadFile } from '../utils/downloadFile';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;

const statusClass = status => {
  if (status === 'Completada') return 'badge-success';
  if (status === 'Cancelada') return 'badge-danger';
  if (status === 'Recibida parcialmente') return 'purchase-status-partial';
  return 'purchase-status-open';
};

const PurchaseOrders = () => {
  const { can } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingExcelId, setDownloadingExcelId] = useState(null);
  const [error, setError] = useNotificationMessage('error');

  useEffect(() => {
    document.title = `Órdenes de compra - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    fetch('/api/purchase-orders')
      .then(async response => {
        const body = await response.text();
        const data = body ? JSON.parse(body) : {};
        if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar las órdenes de compra.');
        return data;
      })
      .then(setOrders)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const estados = [...new Set(orders.map(o => o.estado))];

  const downloadExcel = async orderId => {
    setError('');
    setDownloadingExcelId(orderId);
    try {
      await downloadFile(`/api/purchase-orders/${orderId}/excel`, `orden-compra-${orderId}.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingExcelId(null);
    }
  };

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando órdenes de compra…</div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title"><ClipboardCheck size={25} /> Órdenes de compra</h2>
        </div>
        <div className="page-actions">
          {can('ordenes_compra.recibir') && <Link className="btn btn-secondary" to="/purchase-orders/receptions"><PackageCheck size={16} /> Recepciones</Link>}
          {can('ordenes_compra.crear') && <Link className="btn btn-primary" to="/purchase-orders/new"><Plus size={16} /> Nueva orden</Link>}
        </div>
      </div>

      {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}

      <div className="purchase-summary-grid">
        <div className="card purchase-summary-card"><span>Abiertas</span><strong>{orders.filter(order => ['Borrador', 'Emitida'].includes(order.estado)).length}</strong></div>
        <div className="card purchase-summary-card"><span>Recepciones parciales</span><strong>{orders.filter(order => order.estado === 'Recibida parcialmente').length}</strong></div>
        <div className="card purchase-summary-card"><span>Gasto real registrado</span><strong>{money(orders.reduce((total, order) => total + (order.totalReal || 0), 0))}</strong></div>
      </div>

      <DataTable
        rows={orders}
        rowKey={o => o.idOrdenCompra}
        search={o => `${o.idOrdenCompra} ${o.proveedor} ${o.estado} ${o.items.map(item => item.nombre).join(' ')}`}
        searchPlaceholder="Buscar por número, proveedor, estado o artículo…"
        filter={{ label: 'Estado', options: [
          { value: 'all', label: 'Todos', test: () => true },
          ...estados.map(e => ({ value: e, label: e, test: o => o.estado === e }))
        ] }}
        emptyMessage="Aún no hay órdenes de compra."
        columns={[
          { key: 'orden', header: 'Orden', sortValue: o => o.idOrdenCompra, cell: o => <><strong>#{o.idOrdenCompra}</strong><div className="purchase-cell-meta">{new Date(o.fechaSolicitud).toLocaleDateString('es-CL')}</div></> },
          { key: 'proveedor', header: 'Proveedor', sortValue: o => o.proveedor, cell: o => o.proveedor },
          { key: 'articulos', header: 'Artículos', align: 'right', sortValue: o => o.cantidadProductos, cell: o => o.cantidadProductos },
          { key: 'estimado', header: 'Total estimado', align: 'right', sortValue: o => o.totalEstimado, cell: o => money(o.totalEstimado) },
          { key: 'real', header: 'Total real', align: 'right', sortValue: o => (o.totalReal ?? -1), cell: o => o.totalReal == null ? '—' : money(o.totalReal) },
          { key: 'estado', header: 'Estado', sortValue: o => o.estado, cell: o => <><span className={`badge ${statusClass(o.estado)}`}>{o.estado}</span>{o.tienePreciosPendientes && <div className="purchase-price-pending">Precios por confirmar</div>}</> },
          { key: 'llegada', header: 'Llegada esperada', sortValue: o => new Date(o.fechaLlegadaEsperada).getTime(), cell: o => new Date(o.fechaLlegadaEsperada).toLocaleDateString('es-CL') },
          { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: o => (
            <div className="table-icon-actions">
              <Link className="btn btn-secondary table-icon-button" to={`/purchase-orders/${o.idOrdenCompra}`} title="Ver orden" aria-label={`Ver orden de compra ${o.idOrdenCompra}`}><Eye size={16} /></Link>
              {can('ordenes_compra.exportar') && <a className="btn table-icon-button table-icon-pdf" href={`/api/purchase-orders/${o.idOrdenCompra}/pdf`} title="Descargar PDF" aria-label={`Descargar PDF de la orden ${o.idOrdenCompra}`}><Download size={16} /></a>}
              {can('ordenes_compra.exportar') && <button type="button" className="btn table-icon-button table-icon-success" disabled={downloadingExcelId !== null} onClick={() => downloadExcel(o.idOrdenCompra)} title="Descargar Excel" aria-label={`Descargar Excel de la orden ${o.idOrdenCompra}`}>{downloadingExcelId === o.idOrdenCompra ? <LoaderCircle className="purchase-download-spinner" size={16} /> : <FileSpreadsheet size={16} />}</button>}
            </div>
          ) }
        ]}
      />
    </div>
  );
};

export default PurchaseOrders;
