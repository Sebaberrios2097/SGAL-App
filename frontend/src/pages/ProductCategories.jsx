import { AlertCircle, CheckCircle2, Edit2, Layers, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNotificationMessage } from '../components/NotificationCenter';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';

const ProductCategories = () => {
  const { can } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [nombre, setNombre] = useState('');
  const [formError, setFormError] = useNotificationMessage('error');

  const load = async () => {
    try {
      const res = await fetch('/api/category');
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'No fue posible cargar las categorías.');
      setCategories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = `Categorías de producto - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setNombre('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setNombre(cat.nombreCategoriaProducto);
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setNombre('');
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!nombre.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }
    try {
      const body = JSON.stringify({ nombreCategoriaProducto: nombre.trim() });
      const res = editing
        ? await fetch(`/api/category/${editing.idCategoriaProducto}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/category', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensaje || 'Error al guardar la categoría');
      closeForm();
      load();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const toggleStatus = async (cat) => {
    try {
      const res = await fetch(`/api/category/${cat.idCategoriaProducto}/status`, { method: 'PUT' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.mensaje || 'Error al cambiar el estado');
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando categorías…</div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title"><Layers size={25} /> Categorías de producto</h2>
        </div>
        {can('inventario.categorias.crear') && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nueva categoría
          </button>
        )}
      </div>

      {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}

      <DataTable
        rows={categories}
        rowKey={cat => cat.idCategoriaProducto}
        search={cat => cat.nombreCategoriaProducto}
        searchPlaceholder="Buscar categoría…"
        filter={{ label: 'Estado', options: [
          { value: 'all', label: 'Todas', test: () => true },
          { value: 'active', label: 'Activas', test: c => c.activo },
          { value: 'inactive', label: 'Inactivas', test: c => !c.activo }
        ] }}
        emptyMessage="Aún no hay categorías registradas."
        columns={[
          { key: 'nombre', header: 'Nombre', sortValue: c => c.nombreCategoriaProducto, cell: c => <span style={{ fontWeight: 600, opacity: c.activo ? 1 : 0.55 }}>{c.nombreCategoriaProducto}</span> },
          { key: 'estado', header: 'Estado', sortValue: c => (c.activo ? 1 : 0), cell: c => <span className={`badge ${c.activo ? 'badge-success' : 'badge-danger'}`}>{c.activo ? 'Activa' : 'Inactiva'}</span> },
          { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: c => (
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              {can('inventario.categorias.editar') && (
                <button className="btn btn-secondary table-icon-button" onClick={() => openEdit(c)} disabled={!c.activo}
                  title="Editar" aria-label={`Editar ${c.nombreCategoriaProducto}`}><Edit2 size={15} /></button>
              )}
              {can('inventario.categorias.estado.modificar') && (
                <button className={`btn table-icon-button ${c.activo ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggleStatus(c)}
                  title={c.activo ? 'Desactivar' : 'Activar'} aria-label={`${c.activo ? 'Desactivar' : 'Activar'} ${c.nombreCategoriaProducto}`}>
                  {c.activo ? <Trash2 size={15} /> : <CheckCircle2 size={15} />}
                </button>
              )}
            </div>
          ) }
        ]}
      />

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px', padding: '30px' }}>
            <button type="button" className="btn" style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} onClick={closeForm}>
              <X size={20} color="var(--text-muted)" />
            </button>
            <h3 style={{ fontSize: '1.4rem', marginBottom: '18px', fontWeight: 700 }} className="text-solid">
              {editing ? 'Editar categoría' : 'Nueva categoría'}
            </h3>
            {formError && (
              <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderRadius: '6px', textTransform: 'none', marginBottom: '14px', fontSize: '0.78rem' }}>
                <AlertCircle size={14} /><span>{formError}</span>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Nombre *</label>
                <input className="input-field" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} required autoFocus />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editing ? 'Actualizar' : 'Guardar'}</button>
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCategories;
