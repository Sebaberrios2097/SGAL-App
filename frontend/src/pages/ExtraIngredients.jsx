import { AlertCircle, Check, Edit2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  idMateriaPrima: '',
  precio: '',
  cantidadRequerida: '',
  idUnidadMedida: ''
};

const readResponse = async response => {
  const body = await response.text();
  const data = body ? JSON.parse(body) : {};
  if (!response.ok) {
    const fallback = response.status === 403
      ? 'No tiene permisos para completar esta operación.'
      : 'No fue posible completar la operación.';
    throw new Error(data.mensaje || data.Mensaje || fallback);
  }
  return data;
};

const ExtraIngredients = () => {
  const { can } = useAuth();
  const [items, setItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadItems = async () => {
    const data = await readResponse(await fetch('/api/extra-ingredient'));
    setItems(data);
  };

  const loadOptions = async () => {
    const data = await readResponse(await fetch('/api/extra-ingredient/options'));
    setMaterials(data.materiasPrimas || []);
    setUnits(data.unidades || []);
  };

  useEffect(() => {
    document.title = `Ingredientes extra - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    Promise.all([loadItems(), loadOptions()])
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedMaterial = useMemo(
    () => materials.find(m => String(m.idMateriaPrima) === String(form.idMateriaPrima)),
    [materials, form.idMateriaPrima]
  );

  // Solo se ofrecen unidades de la misma magnitud que la materia prima para poder convertir el consumo.
  const compatibleUnits = useMemo(
    () => (selectedMaterial ? units.filter(u => u.tipoMagnitud === selectedMaterial.tipoMagnitud) : []),
    [units, selectedMaterial]
  );

  // Al crear, solo se ofrecen materias primas que todavía no son ingrediente extra.
  const availableMaterials = useMemo(
    () => materials.filter(m => !m.usoIngredienteExtra),
    [materials]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = item => {
    setEditing(item);
    setForm({
      idMateriaPrima: item.idMateriaPrima,
      precio: String(item.precio),
      cantidadRequerida: item.cantidadRequerida != null ? String(item.cantidadRequerida) : '',
      idUnidadMedida: item.idUnidadMedida
    });
    setError('');
    setShowModal(true);
  };

  // Al elegir la materia prima, se propone su unidad de inventario por defecto.
  const handleMaterialChange = value => {
    const material = materials.find(m => String(m.idMateriaPrima) === String(value));
    setForm(current => ({
      ...current,
      idMateriaPrima: value,
      idUnidadMedida: material ? material.idUnidadMedida : ''
    }));
  };

  const save = async event => {
    event.preventDefault();
    if (!form.idMateriaPrima) { setError('Seleccione la materia prima.'); return; }
    if (!form.idUnidadMedida) { setError('Seleccione la unidad de la cantidad.'); return; }
    // La cantidad es referencial (opcional) si la materia no descuenta inventario.
    if (!selectedMaterial?.noDescuentaInventario && !(Number(form.cantidadRequerida) > 0)) { setError('La cantidad debe ser mayor que cero.'); return; }
    if (Number(form.precio) < 0) { setError('El precio no puede ser negativo.'); return; }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        idMateriaPrima: Number(form.idMateriaPrima),
        precio: Number(form.precio) || 0,
        cantidadRequerida: Number(form.cantidadRequerida) || 0,
        idUnidadMedida: Number(form.idUnidadMedida)
      };
      await readResponse(await fetch(`/api/extra-ingredient/${payload.idMateriaPrima}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }));
      await Promise.all([loadItems(), loadOptions()]);
      setShowModal(false);
      setMessage(editing ? 'Ingrediente extra actualizado.' : 'Materia prima marcada como ingrediente extra.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async item => {
    if (!window.confirm(`¿Quitar "${item.nombreMateriaPrima}" del catálogo de ingredientes extra? Dejará de ofrecerse en la venta.`)) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await readResponse(await fetch(`/api/extra-ingredient/${item.idMateriaPrima}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false })
      }));
      await Promise.all([loadItems(), loadOptions()]);
      setMessage('Ingrediente extra quitado del catálogo.');
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
          <h2 className="page-title"><Sparkles size={25} /> Ingredientes extra</h2>
        </div>
        {can('ingredientes_extra.crear') && <button type="button" className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Marcar materia prima</button>}
      </div>

      {error && !showModal && <div className="card provider-feedback is-error"><AlertCircle size={17} /> {error}</div>}
      {message && <div className="card provider-feedback is-success"><Check size={17} /> {message}</div>}

      {loading ? <div className="card purchase-empty">Cargando ingredientes…</div> : (
        <DataTable
          rows={items}
          rowKey={item => item.idMateriaPrima}
          search={item => item.nombreMateriaPrima}
          searchPlaceholder="Buscar materia prima…"
          filter={{ label: 'Tipo', options: [
            { value: 'all', label: 'Todos', test: () => true },
            { value: 'descuenta', label: 'Descuenta stock', test: i => !i.noDescuentaInventario },
            { value: 'ref', label: 'Referencial', test: i => i.noDescuentaInventario }
          ] }}
          emptyMessage="No hay materias primas marcadas como ingrediente extra."
          columns={[
            { key: 'materia', header: 'Materia prima', sortValue: i => i.nombreMateriaPrima, cell: i => <strong>{i.nombreMateriaPrima}</strong> },
            { key: 'consume', header: 'Consume', cell: i => i.cantidadRequerida != null
              ? `${i.cantidadRequerida} ${i.abreviacionUnidad}${i.noDescuentaInventario ? ' (Ref.)' : ''}`
              : <em style={{ color: 'var(--text-muted)' }}>Referencial</em> },
            { key: 'precio', header: 'Precio (recargo)', align: 'right', sortValue: i => i.precio, cell: i => `$${Number(i.precio).toLocaleString('es-CL')}` },
            { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: i => (
              <div className="table-icon-actions">
                {can('ingredientes_extra.editar') && <button type="button" className="btn btn-secondary table-icon-button" onClick={() => openEdit(i)} title="Editar" aria-label={`Editar ${i.nombreMateriaPrima}`}><Edit2 size={15} /></button>}
                {can('ingredientes_extra.estado.modificar') && <button type="button" className="btn table-icon-button table-icon-danger" disabled={saving} onClick={() => remove(i)} title="Quitar del catálogo" aria-label={`Quitar ${i.nombreMateriaPrima}`}><Trash2 size={15} /></button>}
              </div>
            ) }
          ]}
        />
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content provider-modal">
            <div className="purchase-modal-heading">
              <h3>{editing ? 'Editar ingrediente extra' : 'Marcar materia prima como extra'}</h3>
              <button type="button" className="purchase-modal-close" onClick={() => setShowModal(false)} aria-label="Cerrar"><X size={21} /></button>
            </div>
            <form onSubmit={save}>
              {error && <div className="provider-modal-error"><AlertCircle size={15} /> {error}</div>}
              <div className="provider-form-grid">
                <div className="input-group provider-form-wide">
                  <span className="input-label">Materia prima *</span>
                  {editing
                    ? <input className="input-field" value={editing.nombreMateriaPrima} disabled />
                    : <SearchableSelect options={availableMaterials.map(m => ({ value: m.idMateriaPrima, label: m.nombreMaterial }))} value={form.idMateriaPrima} onChange={handleMaterialChange} placeholder="Seleccione la materia prima" />}
                </div>
                <label className="input-group"><span className="input-label">Cantidad {selectedMaterial?.noDescuentaInventario ? '(Ref.)' : '*'}</span><input className="input-field" type="number" min="0" step="0.001" required={!selectedMaterial?.noDescuentaInventario} value={form.cantidadRequerida} onChange={event => setForm(current => ({ ...current, cantidadRequerida: event.target.value }))} placeholder={selectedMaterial?.noDescuentaInventario ? 'Opcional' : 'Ej: 30'} /></label>
                <div className="input-group"><span className="input-label">Unidad *</span><SearchableSelect options={compatibleUnits.map(u => ({ value: u.idUnidadMedida, label: `${u.nombreUnidadMedida} (${u.abreviacion})` }))} value={form.idUnidadMedida} onChange={value => setForm(current => ({ ...current, idUnidadMedida: value }))} placeholder={selectedMaterial ? 'Seleccione unidad' : 'Elija primero la materia prima'} />{selectedMaterial && compatibleUnits.length === 0 && <small style={{ color: '#b91c1c', fontSize: '0.75rem' }}>No hay unidades para la magnitud {selectedMaterial.tipoMagnitud}.</small>}</div>
                <label className="input-group"><span className="input-label">Precio (recargo) *</span><input className="input-field" type="number" min="0" step="1" required value={form.precio} onChange={event => setForm(current => ({ ...current, precio: event.target.value }))} placeholder="Ej: 700" /></label>
              </div>
              <div className="purchase-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Marcar como extra'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtraIngredients;
