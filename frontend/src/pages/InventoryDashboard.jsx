import { AlertTriangle, ArrowDownToLine, Boxes, Package, Search, ShoppingCart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';

const number = value => Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 3 });
const statusMeta = {
  agotado: { label: 'Agotado', color: '#b91c1c', bg: '#fee2e2' },
  bajo: { label: 'Stock bajo', color: '#a16207', bg: '#fef3c7' },
  disponible: { label: 'Disponible', color: '#15803d', bg: '#dcfce7' },
  sin_control: { label: 'Sin control', color: '#475569', bg: '#f1f5f9' }
};

const InventoryDashboard = () => {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('materials');
  const [status, setStatus] = useState('attention');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `Control de inventario - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    fetch('/api/inventory-dashboard').then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar el inventario.'); return result; }).then(setData).catch(err => setError(err.message));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const source = tab === 'materials' ? data.materials : data.products;
    const query = search.trim().toLocaleLowerCase('es-CL');
    return source.filter(item => {
      if (query && !`${item.nombreMaterial || item.nombreProducto} ${item.categoria}`.toLocaleLowerCase('es-CL').includes(query)) return false;
      if (status === 'attention') return item.estado === 'agotado' || item.estado === 'bajo';
      if (status === 'controlled') return item.controlado;
      return true;
    }).sort((a, b) => ({ agotado: 0, bajo: 1, disponible: 2, sin_control: 3 }[a.estado] - { agotado: 0, bajo: 1, disponible: 2, sin_control: 3 }[b.estado]));
  }, [data, tab, status, search]);

  return <div className="animate-fade-in">
    <PageHeader title="Control de inventario" icon={Boxes} />
    {error && <div className="card" style={{ color: '#b91c1c' }}>{error}</div>}
    {!data && !error ? <div className="card" style={{ textAlign: 'center' }}>Analizando inventario…</div> : data && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="card" style={{ padding: '15px' }}><div className="input-label">Agotados</div><strong style={{ fontSize: '1.5rem', color: '#b91c1c' }}>{data.resumen.productosAgotados + data.resumen.materialesAgotados}</strong></div>
        <div className="card" style={{ padding: '15px' }}><div className="input-label">Stock bajo</div><strong style={{ fontSize: '1.5rem', color: '#a16207' }}>{data.resumen.productosBajos + data.resumen.materialesBajos}</strong></div>
        <div className="card" style={{ padding: '15px' }}><div className="input-label">Órdenes pendientes</div><strong style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}>{data.resumen.ordenesPendientes}</strong></div>
      </div>

      <div className="card" style={{ padding: '15px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '6px', flex: '0 0 auto' }}>
            <button className={`btn ${tab === 'materials' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '8px 12px', width: 'auto', minHeight: 38, flex: '0 0 auto' }} onClick={() => setTab('materials')}><Boxes size={15} /> Materia prima</button>
            <button className={`btn ${tab === 'products' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '8px 12px', width: 'auto', minHeight: 38, flex: '0 0 auto' }} onClick={() => setTab('products')}><Package size={15} /> Productos</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 1 auto', flexWrap: 'wrap' }}>
            <label style={{ position: 'relative', flex: '0 1 220px' }}><Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} /><input className="input-field" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículo" style={{ paddingLeft: '32px', width: '220px' }} /></label>
            <select className="input-field" style={{ width: '180px', flex: '0 0 180px' }} value={status} onChange={e => setStatus(e.target.value)}><option value="attention">Solo alertas</option><option value="controlled">Todo lo controlado</option><option value="all">Todos</option></select>
          </div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
          <table className="custom-table" style={{ minWidth: '760px' }}><thead><tr><th>Artículo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Existencia</th><th style={{ textAlign: 'right' }}>Recibido (30 días)</th><th style={{ textAlign: 'right' }}>Consumido (30 días)</th><th style={{ textAlign: 'right' }}>Por recibir</th></tr></thead><tbody>
            {rows.length === 0 ? <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>No hay artículos que coincidan con el filtro.</td></tr> : rows.map(item => {
              const meta = statusMeta[item.estado]; const unit = tab === 'materials' ? ` ${item.unidad}` : '';
              return <tr key={item.idMateriaPrima || item.idProducto}><td><strong>{item.nombreMaterial || item.nombreProducto}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>{item.categoria}</div></td><td><span style={{ background: meta.bg, color: meta.color, padding: '3px 8px', borderRadius: '999px', fontSize: '.72rem', fontWeight: 700 }}>{meta.label}</span></td><td style={{ textAlign: 'right', fontWeight: 800 }}>{item.controlado ? `${number(item.cantidad ?? item.stock)}${unit}` : 'No aplica'}</td><td style={{ textAlign: 'right', color: '#15803d' }}>+{number(item.entradas30Dias)}{unit}</td><td style={{ textAlign: 'right', color: '#b91c1c' }}>−{number(item.salidas30Dias)}{unit}</td><td style={{ textAlign: 'right', color: item.porRecibir > 0 ? '#2563eb' : 'inherit' }}>{number(item.porRecibir)}{unit}</td></tr>;
            })}
          </tbody></table>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '.72rem', marginTop: '10px' }}><AlertTriangle size={12} /> Revise los artículos con alerta.</div>
      </div>

      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><ArrowDownToLine size={18} color="var(--primary-color)" /> Últimas entradas confirmadas</h3>
        {data.recentEntries.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '22px' }}>No hay recepciones registradas.</div> : <div style={{ display: 'grid', gap: '7px' }}>{data.recentEntries.map(entry => <div key={entry.idOrdenCompra} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--panel-border)', padding: '8px 0' }}><div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><ShoppingCart size={16} color="var(--primary-color)" /><div><strong>Orden #{entry.idOrdenCompra} · {entry.descripcion}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>{new Date(entry.fecha).toLocaleString('es-CL')}</div></div></div><strong style={{ color: '#15803d' }}>+{number(entry.cantidad)}</strong></div>)}</div>}
      </div>
    </>}
  </div>;
};

export default InventoryDashboard;
