import { AlertCircle, Building2, Check, Edit2, Plus, Power, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';

const emptyProvider = {
  nombreProveedor: '',
  rut: '',
  nombreContacto: '',
  telefono: '',
  correo: '',
  direccion: '',
  comuna: '',
  ciudad: ''
};

const ProviderManagement = () => {
  const { user, can } = useAuth();
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProvider);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const readResponse = async response => {
    const body = await response.text();
    const data = body ? JSON.parse(body) : {};
    if (!response.ok) {
      const fallback = response.status === 403
        ? 'No tiene permisos de administrador para completar esta operación.'
        : 'No fue posible completar la operación.';
      throw new Error(data.mensaje || fallback);
    }
    return data;
  };

  const loadProviders = async () => {
    const response = await fetch('/api/providers');
    const data = await readResponse(response);
    setProviders(data);
  };

  useEffect(() => {
    document.title = `Proveedores - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    loadProviders()
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyProvider);
    setError('');
    setShowModal(true);
  };

  const openEdit = provider => {
    setEditing(provider);
    setForm(Object.fromEntries(Object.keys(emptyProvider).map(key => [key, provider[key] || ''])));
    setError('');
    setShowModal(true);
  };

  const saveProvider = async event => {
    event.preventDefault();
    if (!form.nombreProveedor.trim()) {
      setError('El nombre del proveedor es obligatorio.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(editing ? `/api/providers/${editing.idProveedor}` : '/api/providers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario, ...form, nombreProveedor: form.nombreProveedor.trim() })
      });
      const data = await readResponse(response);
      await loadProviders();
      setShowModal(false);
      setMessage(editing ? data.mensaje : 'Proveedor registrado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async provider => {
    if (provider.activo && !window.confirm(`¿Desactivar a "${provider.nombreProveedor}"? Ya no podrá seleccionarse en nuevas órdenes.`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/providers/${provider.idProveedor}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario })
      });
      const data = await readResponse(response);
      await loadProviders();
      setMessage(data.mensaje);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title"><Truck size={25} /> Proveedores</h2>
          <p className="page-subtitle">Administre los proveedores disponibles para las órdenes de compra.</p>
        </div>
        {can('proveedores.crear') && <button type="button" className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nuevo proveedor</button>}
      </div>

      {error && <div className="card provider-feedback is-error"><AlertCircle size={17} /> {error}</div>}
      {message && <div className="card provider-feedback is-success"><Check size={17} /> {message}</div>}

      <div className="purchase-summary-grid provider-summary-grid">
        <div className="card purchase-summary-card"><span>Registrados</span><strong>{providers.length}</strong></div>
        <div className="card purchase-summary-card"><span>Activos</span><strong>{providers.filter(provider => provider.activo).length}</strong></div>
        <div className="card purchase-summary-card"><span>Con órdenes abiertas</span><strong>{providers.filter(provider => provider.ordenesAbiertas > 0).length}</strong></div>
      </div>

      {loading ? <div className="card purchase-empty">Cargando proveedores…</div> : (
        <DataTable
          rows={providers}
          rowKey={p => p.idProveedor}
          search={p => `${p.nombreProveedor} ${p.rut || ''} ${p.nombreContacto || ''} ${p.correo || ''}`}
          searchPlaceholder="Buscar proveedor…"
          filter={{ label: 'Estado', options: [
            { value: 'all', label: 'Todos', test: () => true },
            { value: 'active', label: 'Activos', test: p => p.activo },
            { value: 'inactive', label: 'Inactivos', test: p => !p.activo }
          ] }}
          emptyMessage="No se encontraron proveedores."
          columns={[
            { key: 'proveedor', header: 'Proveedor', sortValue: p => p.nombreProveedor, cell: p => <div className="provider-name"><span className="provider-icon"><Building2 size={17} /></span><span><strong>{p.nombreProveedor}</strong><small>{p.rut || 'RUT no informado'}</small></span></div> },
            { key: 'contacto', header: 'Contacto', cell: p => <div className="provider-details"><span>{p.nombreContacto || 'Sin contacto'}</span><small>{p.telefono || 'Teléfono no informado'}</small><small>{p.correo || 'Correo no informado'}</small></div> },
            { key: 'ubicacion', header: 'Ubicación', cell: p => <div className="provider-details"><span>{[p.comuna, p.ciudad].filter(Boolean).join(', ') || 'Sin ubicación'}</span><small>{p.direccion || 'Dirección no informada'}</small></div> },
            { key: 'ordenes', header: 'Órdenes', align: 'right', sortValue: p => p.cantidadOrdenes, cell: p => <><strong>{p.cantidadOrdenes}</strong><small className="provider-open-orders">{p.ordenesAbiertas} abiertas</small></> },
            { key: 'estado', header: 'Estado', sortValue: p => (p.activo ? 1 : 0), cell: p => <span className={`badge ${p.activo ? 'badge-success' : 'provider-status-inactive'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span> },
            { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: p => (
              <div className="table-icon-actions">
                {can('proveedores.editar') && <button type="button" className="btn btn-secondary table-icon-button" onClick={() => openEdit(p)} title="Editar proveedor" aria-label={`Editar ${p.nombreProveedor}`}><Edit2 size={15} /></button>}
                {can('proveedores.estado.modificar') && <button type="button" className={`btn table-icon-button ${p.activo ? 'table-icon-danger' : 'table-icon-success'}`} disabled={saving} onClick={() => toggleStatus(p)} title={p.activo ? 'Desactivar proveedor' : 'Activar proveedor'} aria-label={`${p.activo ? 'Desactivar' : 'Activar'} ${p.nombreProveedor}`}><Power size={15} /></button>}
              </div>
            ) }
          ]}
        />
      )}

      {showModal && <div className="modal-overlay"><div className="modal-content provider-modal"><div className="purchase-modal-heading"><div><h3>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</h3><p>Estos datos se mostrarán en la orden de compra.</p></div><button type="button" className="purchase-modal-close" onClick={() => setShowModal(false)} aria-label="Cerrar"><X size={21} /></button></div><form onSubmit={saveProvider}>{error && <div className="provider-modal-error"><AlertCircle size={15} /> {error}</div>}<div className="provider-form-grid"><label className="input-group"><span className="input-label">Nombre del proveedor *</span><input className="input-field" autoFocus required maxLength="150" value={form.nombreProveedor} onChange={event => setForm(current => ({ ...current, nombreProveedor: event.target.value }))} placeholder="Ej: Distribuidora Central" /></label><label className="input-group"><span className="input-label">RUT</span><input className="input-field" maxLength="20" value={form.rut} onChange={event => setForm(current => ({ ...current, rut: event.target.value }))} placeholder="76.123.456-7" /></label><label className="input-group"><span className="input-label">Persona de contacto</span><input className="input-field" maxLength="150" value={form.nombreContacto} onChange={event => setForm(current => ({ ...current, nombreContacto: event.target.value }))} /></label><label className="input-group"><span className="input-label">Teléfono</span><input className="input-field" type="tel" maxLength="30" value={form.telefono} onChange={event => setForm(current => ({ ...current, telefono: event.target.value }))} placeholder="+56 9 1234 5678" /></label><label className="input-group provider-form-wide"><span className="input-label">Correo</span><input className="input-field" type="email" maxLength="150" value={form.correo} onChange={event => setForm(current => ({ ...current, correo: event.target.value }))} placeholder="contacto@proveedor.cl" /></label><label className="input-group provider-form-wide"><span className="input-label">Dirección</span><input className="input-field" maxLength="250" value={form.direccion} onChange={event => setForm(current => ({ ...current, direccion: event.target.value }))} placeholder="Calle y número" /></label><label className="input-group"><span className="input-label">Comuna</span><input className="input-field" maxLength="100" value={form.comuna} onChange={event => setForm(current => ({ ...current, comuna: event.target.value }))} /></label><label className="input-group"><span className="input-label">Ciudad</span><input className="input-field" maxLength="100" value={form.ciudad} onChange={event => setForm(current => ({ ...current, ciudad: event.target.value }))} /></label></div><div className="purchase-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar proveedor'}</button></div></form></div></div>}
    </div>
  );
};

export default ProviderManagement;
