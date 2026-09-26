import { AlertCircle, Check, Download, Edit2, Plus, Power, ShieldOff, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';
import { confirmDialog, useNotificationMessage } from '../components/NotificationCenter';

const emptyCliente = {
  tipoDocumento: '',
  documento: '',
  nombre: '',
  telefono: '',
  correo: '',
  direccion: '',
  aceptaMarketing: false
};

const ClienteManagement = () => {
  const { can } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCliente);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useNotificationMessage('error');
  const [message, setMessage] = useNotificationMessage('success');

  const readResponse = async response => {
    const body = await response.text();
    const data = body ? JSON.parse(body) : {};
    if (!response.ok) {
      const fallback = response.status === 403
        ? 'No tiene permisos para completar esta operación.'
        : 'No fue posible completar la operación.';
      throw new Error(data.mensaje || fallback);
    }
    return data;
  };

  const loadClientes = async () => {
    const response = await fetch('/api/clientes');
    setClientes(await readResponse(response));
  };

  useEffect(() => {
    document.title = `Clientes - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    loadClientes()
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyCliente);
    setError('');
    setShowModal(true);
  };

  const openEdit = cliente => {
    setEditing(cliente);
    setForm({
      tipoDocumento: cliente.tipoDocumento || '',
      documento: cliente.documento || '',
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      correo: cliente.correo || '',
      direccion: cliente.direccion || '',
      aceptaMarketing: Boolean(cliente.aceptaMarketing)
    });
    setError('');
    setShowModal(true);
  };

  const saveCliente = async event => {
    event.preventDefault();
    if (!form.nombre.trim()) {
      setError('El nombre del cliente es obligatorio.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(editing ? `/api/clientes/${editing.idCliente}` : '/api/clientes', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, nombre: form.nombre.trim() })
      });
      const data = await readResponse(response);
      await loadClientes();
      setShowModal(false);
      setMessage(editing ? (data.mensaje || 'Cliente actualizado.') : 'Cliente registrado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async cliente => {
    if (cliente.activo && !await confirmDialog({ title: 'Desactivar cliente', message: `“${cliente.nombre}” ya no aparecerá para asignar en nuevas ventas.`, confirmText: 'Desactivar', tone: 'danger' })) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/clientes/${cliente.idCliente}/status`, { method: 'PUT' });
      const data = await readResponse(response);
      await loadClientes();
      setMessage(data.mensaje);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const exportCliente = async cliente => {
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/clientes/${cliente.idCliente}/export`);
      if (!response.ok) await readResponse(response);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cliente_${cliente.idCliente}_datos.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const anonimizar = async cliente => {
    if (!await confirmDialog({
      title: 'Anonimizar cliente',
      message: `Se borrarán los datos personales de “${cliente.nombre}” de forma irreversible. Las ventas asociadas se conservan sin datos personales (obligación tributaria). Esta acción ejerce el derecho de supresión.`,
      confirmText: 'Anonimizar',
      tone: 'danger'
    })) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/clientes/${cliente.idCliente}/anonimizar`, { method: 'POST' });
      const data = await readResponse(response);
      await loadClientes();
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
          <h2 className="page-title"><Users size={25} /> Clientes</h2>
        </div>
        {can('clientes.crear') && <button type="button" className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nuevo cliente</button>}
      </div>

      {error && <div className="card provider-feedback is-error"><AlertCircle size={17} /> {error}</div>}
      {message && <div className="card provider-feedback is-success"><Check size={17} /> {message}</div>}

      <div className="purchase-summary-grid provider-summary-grid">
        <div className="card purchase-summary-card"><span>Registrados</span><strong>{clientes.length}</strong></div>
        <div className="card purchase-summary-card"><span>Activos</span><strong>{clientes.filter(c => c.activo).length}</strong></div>
        <div className="card purchase-summary-card"><span>Aceptan marketing</span><strong>{clientes.filter(c => c.aceptaMarketing).length}</strong></div>
      </div>

      {loading ? <div className="card purchase-empty">Cargando clientes…</div> : (
        <DataTable
          rows={clientes}
          rowKey={c => c.idCliente}
          search={c => `${c.nombre} ${c.documento || ''} ${c.telefono || ''} ${c.correo || ''}`}
          searchPlaceholder="Buscar cliente…"
          filter={{ label: 'Estado', options: [
            { value: 'all', label: 'Todos', test: () => true },
            { value: 'active', label: 'Activos', test: c => c.activo },
            { value: 'inactive', label: 'Inactivos', test: c => !c.activo }
          ] }}
          emptyMessage="No se encontraron clientes."
          columns={[
            { key: 'cliente', header: 'Cliente', sortValue: c => c.nombre, cell: c => <div className="provider-name"><span className="provider-icon"><Users size={17} /></span><span><strong>{c.nombre}</strong><small>{c.documento ? `${c.tipoDocumento || 'Doc'}: ${c.documento}` : 'Sin documento'}</small></span></div> },
            { key: 'contacto', header: 'Contacto', cell: c => <div className="provider-details"><span>{c.telefono || 'Teléfono no informado'}</span><small>{c.correo || 'Correo no informado'}</small><small>{c.direccion || 'Dirección no informada'}</small></div> },
            { key: 'marketing', header: 'Marketing', sortValue: c => (c.aceptaMarketing ? 1 : 0), cell: c => <span className={`badge ${c.aceptaMarketing ? 'badge-success' : 'provider-status-inactive'}`}>{c.aceptaMarketing ? 'Consiente' : 'No'}</span> },
            { key: 'estado', header: 'Estado', sortValue: c => (c.activo ? 1 : 0), cell: c => <span className={`badge ${c.activo ? 'badge-success' : 'provider-status-inactive'}`}>{c.activo ? 'Activo' : 'Inactivo'}</span> },
            { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: c => (
              <div className="table-icon-actions">
                {can('clientes.editar') && <button type="button" className="btn btn-secondary table-icon-button" onClick={() => openEdit(c)} title="Editar cliente" aria-label={`Editar ${c.nombre}`}><Edit2 size={15} /></button>}
                {can('clientes.exportar') && <button type="button" className="btn btn-secondary table-icon-button" onClick={() => exportCliente(c)} title="Exportar datos (derecho de acceso)" aria-label={`Exportar ${c.nombre}`}><Download size={15} /></button>}
                {can('clientes.estado.modificar') && <button type="button" className={`btn table-icon-button ${c.activo ? 'table-icon-danger' : 'table-icon-success'}`} disabled={saving} onClick={() => toggleStatus(c)} title={c.activo ? 'Desactivar cliente' : 'Activar cliente'} aria-label={`${c.activo ? 'Desactivar' : 'Activar'} ${c.nombre}`}><Power size={15} /></button>}
                {can('clientes.anonimizar') && <button type="button" className="btn table-icon-button table-icon-danger" disabled={saving} onClick={() => anonimizar(c)} title="Anonimizar (derecho de supresión)" aria-label={`Anonimizar ${c.nombre}`}><ShieldOff size={15} /></button>}
              </div>
            ) }
          ]}
        />
      )}

      {showModal && <div className="modal-overlay"><div className="modal-content provider-modal"><div className="purchase-modal-heading"><div><h3>{editing ? 'Editar cliente' : 'Nuevo cliente'}</h3><p>Solo el nombre es obligatorio. Pide el resto únicamente si el cliente lo autoriza.</p></div><button type="button" className="purchase-modal-close" onClick={() => setShowModal(false)} aria-label="Cerrar"><X size={21} /></button></div><form onSubmit={saveCliente}>{error && <div className="provider-modal-error"><AlertCircle size={15} /> {error}</div>}<div className="provider-form-grid">
        <label className="input-group provider-form-wide"><span className="input-label">Nombre o razón social *</span><input className="input-field" autoFocus required maxLength="150" value={form.nombre} onChange={e => setForm(c => ({ ...c, nombre: e.target.value }))} /></label>
        <label className="input-group"><span className="input-label">Tipo de documento</span><select className="input-field" value={form.tipoDocumento} onChange={e => setForm(c => ({ ...c, tipoDocumento: e.target.value }))}><option value="">Sin documento</option><option value="RUN">RUN (persona)</option><option value="RUT">RUT (empresa)</option></select></label>
        <label className="input-group"><span className="input-label">Documento</span><input className="input-field" maxLength="12" placeholder="12345678-9" value={form.documento} onChange={e => setForm(c => ({ ...c, documento: e.target.value }))} /></label>
        <label className="input-group"><span className="input-label">Teléfono</span><input className="input-field" type="tel" maxLength="20" value={form.telefono} onChange={e => setForm(c => ({ ...c, telefono: e.target.value }))} /></label>
        <label className="input-group"><span className="input-label">Correo</span><input className="input-field" type="email" maxLength="150" value={form.correo} onChange={e => setForm(c => ({ ...c, correo: e.target.value }))} /></label>
        <label className="input-group provider-form-wide"><span className="input-label">Dirección</span><input className="input-field" maxLength="200" value={form.direccion} onChange={e => setForm(c => ({ ...c, direccion: e.target.value }))} /></label>
        <label className="input-group provider-form-wide" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}><input type="checkbox" checked={form.aceptaMarketing} onChange={e => setForm(c => ({ ...c, aceptaMarketing: e.target.checked }))} /><span className="input-label" style={{ margin: 0 }}>El cliente autoriza recibir promociones (consentimiento de marketing)</span></label>
      </div><div className="purchase-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar cliente'}</button></div></form></div></div>}
    </div>
  );
};

export default ClienteManagement;
