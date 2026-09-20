import { ClipboardList, Coffee, Droplet, Edit2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';

const groupMaterials = materials => materials
  .filter(material => !material.idMateriaPrimaReemplazada)
  .map(base => ({
    base,
    options: materials.filter(material => Number(material.idMateriaPrimaReemplazada) === base.idMateriaPrima)
  }));

const RecipeList = () => {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  useEffect(() => {
    document.title = `Recetas - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    fetch('/api/recipe')
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar las recetas.');
        return data;
      })
      .then(setRecipes)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setShowCreate(true);
    setSelectedProduct('');
    setPendingError('');
    setPendingLoading(true);
    fetch('/api/recipe/products-without-recipe')
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar los productos.');
        return data;
      })
      .then(setPending)
      .catch(err => setPendingError(err.message))
      .finally(() => setPendingLoading(false));
  };

  const anyCalibratable = useMemo(() => recipes.some(r => r.materiales.some(m => m.esCafeCalibrable)), [recipes]);
  const anyNoDescuenta = useMemo(() => recipes.some(r => r.materiales.some(m => m.noDescuentaInventario && !m.esCafeCalibrable)), [recipes]);

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando recetas…</div>;

  return <div className="animate-fade-in">
    <div className="page-header">
      <div>
        <h2 className="page-title"><ClipboardList size={25} /> Recetas</h2>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span className="badge badge-success">{recipes.filter(recipe => recipe.estado).length} activas</span>
        {can('recetas.editar') && <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Crear Receta</button>}
      </div>
    </div>
    {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}
    {(anyCalibratable || anyNoDescuenta) && (
      <div className="recipe-legend" style={{ marginBottom: '18px' }}>
        <span className="recipe-legend-title">Referencias:</span>
        {anyCalibratable && (
          <span className="recipe-legend-item tooltip-wide" data-tooltip="Cantidad según calibración.">
            <Coffee size={14} color="#b45309" /> Café calibrable
          </span>
        )}
        {anyNoDescuenta && (
          <span className="recipe-legend-item tooltip-wide" data-tooltip="Sin descuento de inventario.">
            <Droplet size={14} color="#0284c7" /> No descuenta inventario
          </span>
        )}
      </div>
    )}
    <DataTable
      rows={recipes}
      rowKey={r => r.idReceta}
      search={r => `${r.nombre} ${r.materiales.map(m => m.nombreMaterial).join(' ')}`}
      searchPlaceholder="Buscar por producto o materia prima…"
      filter={{ label: 'Estado', options: [
        { value: 'all', label: 'Todas', test: () => true },
        { value: 'active', label: 'Activas', test: r => r.estado },
        { value: 'inactive', label: 'Inactivas', test: r => !r.estado }
      ] }}
      emptyMessage="Aún no hay recetas configuradas."
      columns={[
        { key: 'producto', header: 'Producto', sortValue: r => r.nombre, cell: r => <strong>{r.nombre}</strong> },
        { key: 'materiales', header: 'Materiales', cell: r => (
          <div className="recipe-list-groups">{groupMaterials(r.materiales).map(({ base, options }) => (
            <div key={base.idMateriaPrima} className="recipe-list-group">
              <strong>{base.esCafeCalibrable && <span className="recipe-inline-tag" title="Café calibrable"><Coffee size={12} color="#b45309" /></span>}{!base.esCafeCalibrable && base.noDescuentaInventario && <span className="recipe-inline-tag" title="No descuenta inventario"><Droplet size={12} color="#0284c7" /></span>}{base.nombreMaterial}: {base.esCafeCalibrable ? 'según calibración (Ref.)' : `${base.cantidadRequerida} ${base.abreviacionUnidad}${base.noDescuentaInventario ? ' (Ref.)' : ''}`}</strong>{options.length > 0 && <span>{options.map(option => `${option.nombreMaterial}${option.recargo > 0 ? ` (+$${option.recargo.toLocaleString('es-CL')})` : ''}`).join(', ')}</span>}
            </div>
          ))}</div>
        ) },
        { key: 'estado', header: 'Estado', sortValue: r => (r.estado ? 1 : 0), cell: r => <span className={`badge ${r.estado ? 'badge-success' : 'badge-danger'}`}>{r.estado ? 'Activa' : 'Inactiva'}</span> },
        { key: 'fecha', header: 'Última modificación', sortValue: r => new Date(r.fechaModificacion || r.fechaCreacion).getTime(), cell: r => new Date(r.fechaModificacion || r.fechaCreacion).toLocaleString('es-CL') },
        { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: r => can('recetas.editar') && <Link className="btn btn-secondary table-icon-button" to={`/inventory/products/${r.idProducto}/recipe`} title="Editar" aria-label={`Editar receta de ${r.nombre}`}><Edit2 size={15} /></Link> }
      ]}
    />

    {showCreate && (
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: '460px', padding: '30px' }}>
          <button type="button" className="btn" style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} onClick={() => setShowCreate(false)}>
            <X size={20} color="var(--text-muted)" />
          </button>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '8px', fontWeight: 700 }} className="text-solid">Crear receta</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>Seleccione producto.</div>
          {pendingError && <div className="card" style={{ color: '#b91c1c', marginBottom: '14px' }}>{pendingError}</div>}
          {pendingLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>Cargando productos…</div>
          ) : pending.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
              Todos los productos con receta ya tienen una configurada.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Producto *</label>
                <select className="input-field" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} autoFocus>
                  <option value="">Seleccionar producto…</option>
                  {pending.map(p => <option key={p.idProducto} value={p.idProducto}>{p.nombreProducto}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={!selectedProduct}
                  onClick={() => navigate(`/inventory/products/${selectedProduct}/recipe`)}>
                  Configurar receta
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
  </div>;
};

export default RecipeList;
