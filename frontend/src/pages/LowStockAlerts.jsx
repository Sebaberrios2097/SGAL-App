import { AlertCircle, PackageX, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';

const LowStockAlerts = () => {
  const [data, setData] = useState({ total: 0, agotados: 0, bajos: 0, defaultMinimo: 0, productos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `Alertas de stock - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    fetch('/api/inventory-dashboard/low-stock')
      .then(async response => {
        const body = await response.text();
        const parsed = body ? JSON.parse(body) : {};
        if (!response.ok) throw new Error(parsed.mensaje || 'No fue posible cargar las alertas de stock.');
        return parsed;
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title"><ShieldAlert size={25} /> Alertas de stock</h2>
        </div>
      </div>

      {error && <div className="card provider-feedback is-error"><AlertCircle size={17} /> {error}</div>}

      <div className="purchase-summary-grid provider-summary-grid">
        <div className="card purchase-summary-card"><span>En alerta</span><strong>{data.total}</strong></div>
        <div className="card purchase-summary-card"><span>Agotados</span><strong>{data.agotados}</strong></div>
        <div className="card purchase-summary-card"><span>Bajos</span><strong>{data.bajos}</strong></div>
        <div className="card purchase-summary-card"><span>Umbral por defecto</span><strong>{data.defaultMinimo}</strong></div>
      </div>

      {loading ? <div className="card purchase-empty">Cargando alertas…</div> : (
        data.productos.length === 0 ? (
          <div className="card purchase-empty"><PackageX size={18} /> Ningún producto está bajo su umbral de stock. 🎉</div>
        ) : (
          <DataTable
            rows={data.productos}
            rowKey={p => p.idProducto}
            search={p => `${p.nombreProducto} ${p.categoria || ''}`}
            searchPlaceholder="Buscar producto…"
            filter={{ label: 'Estado', options: [
              { value: 'all', label: 'Todos', test: () => true },
              { value: 'agotado', label: 'Agotados', test: p => p.estado === 'agotado' },
              { value: 'bajo', label: 'Bajos', test: p => p.estado === 'bajo' }
            ] }}
            emptyMessage="No se encontraron productos."
            columns={[
              { key: 'producto', header: 'Producto', sortValue: p => p.nombreProducto, cell: p => <div className="provider-name"><span className="provider-icon"><PackageX size={17} /></span><span><strong>{p.nombreProducto}</strong><small>{p.categoria || 'Sin categoría'}</small></span></div> },
              { key: 'stock', header: 'Stock', align: 'right', sortValue: p => p.stock, cell: p => <strong>{p.stock}</strong> },
              { key: 'minimo', header: 'Mínimo', align: 'right', sortValue: p => p.minimo, cell: p => p.minimo },
              { key: 'estado', header: 'Estado', sortValue: p => (p.estado === 'agotado' ? 0 : 1), cell: p => <span className={`badge ${p.estado === 'agotado' ? 'provider-status-inactive' : 'badge-warning'}`}>{p.estado === 'agotado' ? 'Agotado' : 'Bajo'}</span> }
            ]}
          />
        )
      )}

      <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        El umbral se define por producto (en su ficha) o, si no lo tiene, se usa el umbral por defecto de la organización.{' '}
        <Link to="/inventory/control">Ver control de inventario</Link>.
      </p>
    </div>
  );
};

export default LowStockAlerts;
