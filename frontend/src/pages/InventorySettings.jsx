import { Boxes, CheckCircle2, Edit2, Image as ImageIcon, Package, PackagePlus, Plus, Power, Save, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';
import DataTable from '../components/DataTable';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import PageHeader from '../components/PageHeader';
import { confirmDialog, notify, useNotificationMessage } from '../components/NotificationCenter';

const API = '/api/inventory-configuration';

const sectionInfo = {
  courtesy: { title: 'Cortesía' },
  'raw-materials': { title: 'Materiales/Ingredientes' },
  units: { title: 'Unidades de medida' },
  'material-categories': { title: 'Categorías de materia prima' },
  brands: { title: 'Marcas' }
};

const readResponse = async response => {
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.mensaje || 'No fue posible completar la operación.');
  return data;
};

const SimpleCatalogManager = ({ items, idKey, nameKey, endpoint, singular, onReload, canCreate, canEdit, canDelete }) => {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useNotificationMessage('error');

  const submit = async event => {
    event.preventDefault();
    setError('');
    try {
      await readResponse(await fetch(`${API}/${endpoint}${editing ? `/${editing[idKey]}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: name })
      }));
      setName('');
      setEditing(null);
      onReload();
    } catch (err) { setError(err.message); }
  };

  const remove = async item => {
    if (!await confirmDialog({ title: 'Eliminar registro', message: `Se eliminará “${item[nameKey]}”.`, confirmText: 'Eliminar', tone: 'danger' })) return;
    setError('');
    try {
      await readResponse(await fetch(`${API}/${endpoint}/${item[idKey]}`, { method: 'DELETE' }));
      onReload();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="responsive-split" style={{ '--split-cols': 'minmax(260px, 340px) minmax(0, 1fr)' }}>
      {(canCreate || editing) && <form onSubmit={submit} className="card" style={{ alignSelf: 'start' }}>
        <h3 style={{ marginBottom: '16px' }}>{editing ? `Editar ${singular}` : `Nueva ${singular}`}</h3>
        {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
        <label className="input-group"><span className="input-label">Nombre</span><input className="input-field" required maxLength="100" value={name} onChange={e => setName(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" type="submit"><Save size={16} /> Guardar</button>
          {editing && <button className="btn btn-secondary" type="button" onClick={() => { setEditing(null); setName(''); }}>Cancelar</button>}
        </div>
      </form>}
      <DataTable
        rows={items}
        rowKey={item => item[idKey]}
        search={item => item[nameKey]}
        searchPlaceholder="Buscar…"
        emptyMessage="Sin registros."
        columns={[
          { key: 'nombre', header: 'Nombre', sortValue: i => i[nameKey], cell: i => i[nameKey] },
          { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: i => (
            <div className="actions-wrapper">
              {canEdit && <button className="btn btn-secondary" title={`Editar ${singular}`} style={{ padding: '7px' }} onClick={() => { setEditing(i); setName(i[nameKey]); }}><Edit2 size={15} /></button>}
              {canDelete && <button className="btn btn-danger" title={`Eliminar ${singular}`} style={{ padding: '7px' }} onClick={() => remove(i)}><Trash2 size={15} /></button>}
            </div>
          ) }
        ]}
      />
    </div>
  );
};

const emptyUnit = { nombre: '', abreviacion: '', tipoMagnitud: 'Masa', factorConversionBase: 1, esUnidadBase: false };

const UnitsManager = ({ items, onReload, canCreate, canEdit, canDelete }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUnit);
  const [error, setError] = useNotificationMessage('error');
  const reset = () => { setEditing(null); setForm(emptyUnit); };
  const submit = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/units${editing ? `/${editing.idUnidadMedida}` : ''}`, {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, factorConversionBase: Number(form.factorConversionBase) })
      }));
      reset(); onReload();
    } catch (err) { setError(err.message); }
  };
  const edit = unit => {
    setEditing(unit);
    setForm({ nombre: unit.nombreUnidadMedida, abreviacion: unit.abreviacion, tipoMagnitud: unit.tipoMagnitud, factorConversionBase: unit.factorConversionBase, esUnidadBase: unit.esUnidadBase });
  };
  const remove = async unit => {
    if (!await confirmDialog({ title: 'Eliminar unidad', message: `Se eliminará “${unit.nombreUnidadMedida}”.`, confirmText: 'Eliminar', tone: 'danger' })) return;
    try { await readResponse(await fetch(`${API}/units/${unit.idUnidadMedida}`, { method: 'DELETE' })); onReload(); }
    catch (err) { setError(err.message); }
  };
  return <div className="responsive-split" style={{ '--split-cols': 'minmax(300px, 380px) minmax(0, 1fr)' }}>
    {(canCreate || editing) && <form className="card" onSubmit={submit} style={{ alignSelf: 'start' }}><h3 style={{ marginBottom: '16px' }}>{editing ? 'Editar unidad' : 'Nueva unidad'}</h3>
      {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
      <label className="input-group"><span className="input-label">Nombre</span><input className="input-field" maxLength="50" required value={form.nombre} onChange={e => setForm(current => ({ ...current, nombre: e.target.value }))} /></label>
      <label className="input-group"><span className="input-label">Abreviación</span><input className="input-field" maxLength="15" required value={form.abreviacion} onChange={e => setForm(current => ({ ...current, abreviacion: e.target.value }))} /></label>
      <label className="input-group"><span className="input-label">Magnitud</span><select className="input-field" value={form.tipoMagnitud} onChange={e => setForm(current => ({ ...current, tipoMagnitud: e.target.value }))}><option>Masa</option><option>Volumen</option><option>Unidad</option></select></label>
      <label className="input-group"><span className="input-label">Factor respecto de la base</span><input className="input-field" type="number" min="0.000001" step="0.000001" required disabled={form.esUnidadBase} value={form.factorConversionBase} onChange={e => setForm(current => ({ ...current, factorConversionBase: e.target.value }))} /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}><input type="checkbox" checked={form.esUnidadBase} onChange={e => setForm(current => ({ ...current, esUnidadBase: e.target.checked, factorConversionBase: e.target.checked ? 1 : current.factorConversionBase }))} /> Unidad de referencia de esta magnitud</label>
      <div style={{ display: 'flex', gap: '8px' }}><button className="btn btn-primary"><Save size={16} /> Guardar</button>{editing && <button type="button" className="btn btn-secondary" onClick={reset}>Cancelar</button>}</div>
    </form>}
    <DataTable
      rows={items}
      rowKey={u => u.idUnidadMedida}
      search={u => `${u.nombreUnidadMedida} ${u.abreviacion}`}
      searchPlaceholder="Buscar unidad…"
      filter={{ label: 'Magnitud', options: [
        { value: 'all', label: 'Todas', test: () => true },
        { value: 'Masa', label: 'Masa', test: u => u.tipoMagnitud === 'Masa' },
        { value: 'Volumen', label: 'Volumen', test: u => u.tipoMagnitud === 'Volumen' },
        { value: 'Unidad', label: 'Unidad', test: u => u.tipoMagnitud === 'Unidad' }
      ] }}
      emptyMessage="Sin unidades."
      columns={[
        { key: 'unidad', header: 'Unidad', sortValue: u => u.nombreUnidadMedida, cell: u => <>{u.nombreUnidadMedida}{u.esUnidadBase && <span className="badge badge-success" style={{ marginLeft: '7px' }}>Base</span>}</> },
        { key: 'abrev', header: 'Abrev.', sortValue: u => u.abreviacion, cell: u => u.abreviacion },
        { key: 'magnitud', header: 'Magnitud', sortValue: u => u.tipoMagnitud, cell: u => u.tipoMagnitud },
        { key: 'factor', header: 'Factor', align: 'right', sortValue: u => u.factorConversionBase, cell: u => u.factorConversionBase },
        { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: u => (
          <div className="actions-wrapper">{canEdit && <button className="btn btn-secondary" title="Editar unidad" style={{ padding: '7px' }} onClick={() => edit(u)}><Edit2 size={15} /></button>}{canDelete && <button className="btn btn-danger" title="Eliminar unidad" style={{ padding: '7px' }} onClick={() => remove(u)}><Trash2 size={15} /></button>}</div>
        ) }
      ]}
    />
  </div>;
};

const CourtesyManager = ({ products, entries, categoryEntries, availableCategories, policy, onReload, canEditPolicy, canCreate, canEdit, canChangeStatus }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ idProducto: '', cantidadDiaria: 1 });
  const [error, setError] = useNotificationMessage('error');
  const [mode, setMode] = useState(policy.modo || 'PRODUCTOS');
  const [globalLimit, setGlobalLimit] = useState(policy.limiteDiarioGlobal || 2);
  const [dailyAmount, setDailyAmount] = useState(policy.montoDiarioGlobal || 0);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    setMode(policy.modo || 'PRODUCTOS');
    setGlobalLimit(policy.limiteDiarioGlobal || 2);
    setDailyAmount(policy.montoDiarioGlobal || 0);
  }, [policy.modo, policy.limiteDiarioGlobal, policy.montoDiarioGlobal]);

  const isMoney = mode === 'MONTO';

  const savePolicy = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/courtesy-policy`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: mode, limiteDiarioGlobal: Number(globalLimit), montoDiarioGlobal: Number(dailyAmount) })
      }));
      notify.success(isMoney ? 'Cupo diario en dinero guardado.' : 'Cupo diario en productos guardado.');
      onReload();
    } catch (err) { setError(err.message); }
  };

  const submit = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/courtesy-products${editing ? `/${editing.idProductoCortesia}` : ''}`, {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idProducto: Number(form.idProducto), cantidadDiaria: Number(form.cantidadDiaria) })
      }));
      setEditing(null); setForm({ idProducto: '', cantidadDiaria: 1 }); onReload();
    } catch (err) { setError(err.message); }
  };

  const toggle = async entry => {
    try { await readResponse(await fetch(`${API}/courtesy-products/${entry.idProductoCortesia}/status`, { method: 'PUT' })); onReload(); }
    catch (err) { setError(err.message); }
  };

  const addCategory = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/courtesy-categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCategoriaProducto: Number(newCategory) })
      }));
      notify.success('Categoría agregada a la cortesía.');
      setNewCategory(''); onReload();
    } catch (err) { setError(err.message); }
  };

  const toggleCategory = async entry => {
    try { await readResponse(await fetch(`${API}/courtesy-categories/${entry.idCategoriaCortesia}/status`, { method: 'PUT' })); onReload(); }
    catch (err) { setError(err.message); }
  };

  const removeCategory = async entry => {
    if (!(await confirmDialog({ message: `¿Quitar la categoría "${entry.nombreCategoriaProducto}" de la cortesía?`, confirmText: 'Quitar', danger: true }))) return;
    try { await readResponse(await fetch(`${API}/courtesy-categories/${entry.idCategoriaCortesia}`, { method: 'DELETE' })); onReload(); }
    catch (err) { setError(err.message); }
  };

  // Categorías aún no configuradas como cortesía (para el selector de "agregar").
  const selectableCategories = availableCategories.filter(c => !categoryEntries.some(e => e.idCategoriaProducto === c.idCategoriaProducto));

  return <div className="responsive-split" style={{ '--split-cols': 'minmax(300px, 380px) minmax(0, 1fr)' }}>
    <div style={{ display: 'grid', gap: '16px', alignSelf: 'start' }}>
    <form className="card" onSubmit={savePolicy}><h3 style={{ marginBottom: '14px' }}>Cupo diario</h3>
      <div className="input-group"><span className="input-label">Tipo de cortesía</span>
        <select className="input-field" value={mode} disabled={!canEditPolicy} onChange={e => setMode(e.target.value)}>
          <option value="PRODUCTOS">Por productos (cantidad diaria)</option>
          <option value="MONTO">Por monto (dinero diario)</option>
        </select>
      </div>
      {isMoney
        ? <label className="input-group"><span className="input-label">Monto diario gratis ($)</span><input className="input-field" type="number" min="1" required value={dailyAmount} disabled={!canEditPolicy} onChange={e => setDailyAmount(e.target.value)} /></label>
        : <label className="input-group"><span className="input-label">Límite diario global (unidades)</span><input className="input-field" type="number" min="1" required value={globalLimit} disabled={!canEditPolicy} onChange={e => setGlobalLimit(e.target.value)} /></label>}
      <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '2px 0 12px' }}>{isMoney
        ? 'Cada empleado recibe este monto diario de consumo gratis en las categorías configuradas. Si un consumo supera el saldo, se cubre lo disponible y se cobra el resto.'
        : 'Cada empleado puede recibir gratis hasta esta cantidad de unidades al día entre los productos configurados.'}</p>
      {canEditPolicy && <button className="btn btn-primary"><Save size={16} /> Guardar</button>}
    </form>

    {isMoney
      ? (canCreate && <form className="card" onSubmit={addCategory}><h3 style={{ marginBottom: '16px' }}>Agregar categoría</h3>
          {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
          <div className="input-group"><span className="input-label">Categoría elegible</span><SearchableSelect required options={selectableCategories.map(x => ({ value: x.idCategoriaProducto, label: x.nombreCategoriaProducto }))} value={newCategory} onChange={setNewCategory} /></div>
          <button className="btn btn-primary" disabled={!newCategory}><Plus size={16} /> Agregar</button>
        </form>)
      : ((canCreate || editing) && <form className="card" onSubmit={submit}><h3 style={{ marginBottom: '16px' }}>{editing ? 'Editar cortesía' : 'Agregar producto'}</h3>
          {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
          <div className="input-group"><span className="input-label">Producto</span><SearchableSelect required options={products.filter(x => x.activo).map(x => ({ value: x.idProducto, label: x.nombreProducto }))} value={form.idProducto} onChange={value => setForm(current => ({ ...current, idProducto: value }))} /></div>
          <label className="input-group"><span className="input-label">Cantidad diaria gratis</span><input className="input-field" type="number" min="1" required value={form.cantidadDiaria} onChange={e => setForm(current => ({ ...current, cantidadDiaria: e.target.value }))} /></label>
          <div style={{ display: 'flex', gap: '8px' }}><button className="btn btn-primary" disabled={!form.idProducto}><Save size={16} /> Guardar</button>{editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setForm({ idProducto: '', cantidadDiaria: 1 }); }}>Cancelar</button>}</div>
        </form>)}
    </div>

    {isMoney
      ? <DataTable
          rows={categoryEntries}
          rowKey={e => e.idCategoriaCortesia}
          search={e => e.nombreCategoriaProducto}
          searchPlaceholder="Buscar categoría…"
          filter={{ label: 'Estado', options: [
            { value: 'all', label: 'Todos', test: () => true },
            { value: 'active', label: 'Activos', test: e => e.activo },
            { value: 'inactive', label: 'Inactivos', test: e => !e.activo }
          ] }}
          emptyMessage="No hay categorías de cortesía configuradas."
          columns={[
            { key: 'categoria', header: 'Categoría', sortValue: e => e.nombreCategoriaProducto, cell: e => e.nombreCategoriaProducto },
            { key: 'estado', header: 'Estado', sortValue: e => (e.activo ? 1 : 0), cell: e => <span className={`badge ${e.activo ? 'badge-success' : 'badge-danger'}`}>{e.activo ? 'Activo' : 'Inactivo'}</span> },
            { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: entry => (
              <div className="actions-wrapper">
                {canChangeStatus && <button className={entry.activo ? 'btn btn-danger' : 'btn btn-primary'} title={entry.activo ? 'Desactivar' : 'Activar'} style={{ padding: '7px' }} onClick={() => toggleCategory(entry)}><Power size={15} /></button>}
                {canEdit && <button className="btn btn-secondary" title="Quitar categoría de cortesía" style={{ padding: '7px' }} onClick={() => removeCategory(entry)}><Trash2 size={15} /></button>}
              </div>
            ) }
          ]}
        />
      : <DataTable
          rows={entries}
          rowKey={e => e.idProductoCortesia}
          search={e => e.nombreProducto}
          searchPlaceholder="Buscar producto…"
          filter={{ label: 'Estado', options: [
            { value: 'all', label: 'Todos', test: () => true },
            { value: 'active', label: 'Activos', test: e => e.activo },
            { value: 'inactive', label: 'Inactivos', test: e => !e.activo }
          ] }}
          emptyMessage="No hay productos de cortesía configurados."
          columns={[
            { key: 'producto', header: 'Producto', sortValue: e => e.nombreProducto, cell: e => e.nombreProducto },
            { key: 'cantidad', header: 'Cantidad diaria', align: 'right', sortValue: e => e.cantidadDiaria, cell: e => e.cantidadDiaria },
            { key: 'estado', header: 'Estado', sortValue: e => (e.activo ? 1 : 0), cell: e => <span className={`badge ${e.activo ? 'badge-success' : 'badge-danger'}`}>{e.activo ? 'Activo' : 'Inactivo'}</span> },
            { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: entry => (
              <div className="actions-wrapper">
                {canEdit && <button className="btn btn-secondary" title="Editar producto de cortesía" style={{ padding: '7px' }} onClick={() => { setEditing(entry); setForm({ idProducto: entry.idProducto, cantidadDiaria: entry.cantidadDiaria }); }}><Edit2 size={15} /></button>}
                {canChangeStatus && <button className={entry.activo ? 'btn btn-danger' : 'btn btn-primary'} title={entry.activo ? 'Desactivar' : 'Activar'} style={{ padding: '7px' }} onClick={() => toggle(entry)}><Power size={15} /></button>}
              </div>
            ) }
          ]}
        />}
  </div>;
};

const emptyMaterial = { idMarca: '', idCategoriaMateria: '', idUnidadMedida: '', nombreMaterial: '', descripcion: '', cantidad: '', imagenBase64: null, esCafeCalibrable: false, noDescuentaInventario: false, tieneRecargo: false, recargoBase: '', recargoModificable: false };

const RawMaterialsManager = ({ materials, catalogs, presentations, onReload, calibrationEnabled, canViewMaterials, canViewPresentations, canCreateMaterial, canEditMaterial, canDeleteMaterial, canCreatePresentation, canEditPresentation, canDeletePresentation, canEnterStock }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyMaterial);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useNotificationMessage('error');
  const [presentation, setPresentation] = useState({ idMateriaPrima: '', nombrePresentacion: '', cantidadContenido: '', idUnidadMedida: '' });
  const [editingPresentation, setEditingPresentation] = useState(null);
  const [stockEntries, setStockEntries] = useState({});
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showPresentationModal, setShowPresentationModal] = useState(false);

  const selectOptions = (items, id, name) => items.map(x => ({ value: x[id], label: x[name] }));

  const chooseImage = event => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { setPreview(reader.result); setForm(current => ({ ...current, imagenBase64: reader.result })); }; reader.readAsDataURL(file);
  };

  const openNewMaterial = () => { setEditing(null); setForm(emptyMaterial); setPreview(null); setError(''); setShowMaterialModal(true); };
  const openEditMaterial = material => {
    setEditing(material);
    setPreview(material.imagenBase64 ? `data:image/png;base64,${material.imagenBase64}` : null);
    setForm({ idMarca: material.idMarca, idCategoriaMateria: material.idCategoriaMateria, idUnidadMedida: material.idUnidadMedida, nombreMaterial: material.nombreMaterial, descripcion: material.descripcion || '', cantidad: material.cantidad, imagenBase64: null, esCafeCalibrable: material.esCafeCalibrable || false, noDescuentaInventario: material.noDescuentaInventario || false, tieneRecargo: (material.recargoBase || 0) > 0, recargoBase: material.recargoBase || '', recargoModificable: material.recargoModificable || false });
    setError('');
    setShowMaterialModal(true);
  };
  const closeMaterialModal = () => { setShowMaterialModal(false); setEditing(null); setForm(emptyMaterial); setPreview(null); setError(''); };

  const submitMaterial = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/raw-materials${editing ? `/${editing.idMateriaPrima}` : ''}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, idMarca: Number(form.idMarca), idCategoriaMateria: Number(form.idCategoriaMateria), idUnidadMedida: Number(form.idUnidadMedida), cantidad: Number(form.cantidad), recargoBase: form.tieneRecargo ? (Number(form.recargoBase) || 0) : 0, recargoModificable: form.tieneRecargo && !!form.recargoModificable }) }));
      closeMaterialModal(); onReload();
    } catch (err) { setError(err.message); }
  };
  const remove = async material => {
    if (!await confirmDialog({ title: 'Eliminar materia prima', message: `Se eliminará “${material.nombreMaterial}”.`, confirmText: 'Eliminar', tone: 'danger' })) return;
    try { await readResponse(await fetch(`${API}/raw-materials/${material.idMateriaPrima}`, { method: 'DELETE' })); onReload(); }
    catch (err) { setError(err.message); notify.error(err.message); }
  };

  const openNewPresentation = () => { setEditingPresentation(null); setPresentation({ idMateriaPrima: '', nombrePresentacion: '', cantidadContenido: '', idUnidadMedida: '' }); setError(''); setShowPresentationModal(true); };
  const openEditPresentation = item => { setEditingPresentation(item); setPresentation({ idMateriaPrima: item.idMateriaPrima, nombrePresentacion: item.nombrePresentacion, cantidadContenido: item.cantidadContenido, idUnidadMedida: item.idUnidadMedida }); setError(''); setShowPresentationModal(true); };
  const closePresentationModal = () => { setShowPresentationModal(false); setEditingPresentation(null); setPresentation({ idMateriaPrima: '', nombrePresentacion: '', cantidadContenido: '', idUnidadMedida: '' }); setError(''); };

  const selectedPresentationMaterial = materials.find(x => x.idMateriaPrima === Number(presentation.idMateriaPrima));
  const materialMagnitude = selectedPresentationMaterial
    ? (selectedPresentationMaterial.tipoMagnitud
        ?? catalogs.unidades.find(u => u.idUnidadMedida === selectedPresentationMaterial.idUnidadMedida)?.tipoMagnitud)
    : null;
  const compatibleUnits = materialMagnitude ? catalogs.unidades.filter(x => x.tipoMagnitud === materialMagnitude) : [];
  const selectedInventoryUnit = catalogs.unidades.find(x => x.idUnidadMedida === Number(form.idUnidadMedida));

  const createPresentation = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/raw-material-presentations${editingPresentation ? `/${editingPresentation.idPresentacionMateriaPrima}` : ''}`, { method: editingPresentation ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...presentation, idMateriaPrima: Number(presentation.idMateriaPrima), idUnidadMedida: Number(presentation.idUnidadMedida), cantidadContenido: Number(presentation.cantidadContenido), activo: true }) }));
      closePresentationModal(); onReload();
    } catch (err) { setError(err.message); }
  };
  const addStock = async item => {
    setError('');
    try {
      await readResponse(await fetch(`${API}/raw-material-presentations/${item.idPresentacionMateriaPrima}/stock-entry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidadPresentaciones: Number(stockEntries[item.idPresentacionMateriaPrima] || 0) }) }));
      setStockEntries(current => ({ ...current, [item.idPresentacionMateriaPrima]: '' })); onReload();
    } catch (err) { notify.error(err.message); }
  };
  const removePresentation = async item => {
    if (!await confirmDialog({ title: 'Eliminar formato', message: `Se eliminará el formato “${item.nombrePresentacion}”.`, confirmText: 'Eliminar', tone: 'danger' })) return;
    try { await readResponse(await fetch(`${API}/raw-material-presentations/${item.idPresentacionMateriaPrima}`, { method: 'DELETE' })); onReload(); }
    catch (err) { notify.error(err.message); }
  };

  const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: '8px' };

  const materialActions = (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {canCreatePresentation && <button type="button" className="btn btn-secondary" style={btnPrimary} onClick={openNewPresentation} disabled={materials.length === 0}><PackagePlus size={16} /> Nuevo formato</button>}
      {canCreateMaterial && <button type="button" className="btn btn-primary" style={btnPrimary} onClick={openNewMaterial}><Plus size={16} /> Nueva materia prima</button>}
    </div>
  );

  return (
    <>
      {/* Tabla de materias primas */}
      {canViewMaterials && (materials.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <Boxes size={40} color="var(--text-muted)" style={{ opacity: 0.5 }} />
          <div>
            <h3 style={{ margin: 0 }}>Aún no hay materias primas</h3>
          </div>
          {canCreateMaterial && <button type="button" className="btn btn-primary" style={btnPrimary} onClick={openNewMaterial}><Plus size={16} /> Agregar primera materia prima</button>}
        </div>
      ) : (
        <DataTable
          rows={materials}
          rowKey={m => m.idMateriaPrima}
          search={m => `${m.nombreMaterial} ${m.nombreMarca || ''} ${m.nombreCategoria || ''}`}
          searchPlaceholder="Buscar por nombre, marca o categoría…"
          toolbarExtra={materialActions}
          filter={{ label: 'Categoría', options: [
            { value: 'all', label: 'Todas', test: () => true },
            ...catalogs.categorias.map(c => ({ value: String(c.idCategoriaMateria), label: c.nombreCategoriaMateria, test: m => m.idCategoriaMateria === c.idCategoriaMateria }))
          ] }}
          emptyMessage="Sin coincidencias para los filtros aplicados."
          columns={[
            { key: 'materia', header: 'Materia prima', sortValue: m => m.nombreMaterial, cell: material => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{material.imagenBase64 ? <img src={`data:image/png;base64,${material.imagenBase64}`} alt="" style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '7px' }} /> : <ImageIcon size={22} color="var(--text-muted)" />}<div><strong>{material.nombreMaterial}</strong><div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{material.descripcion}</div></div></div>
            ) },
            { key: 'marca', header: 'Marca', sortValue: m => m.nombreMarca, cell: m => m.nombreMarca },
            { key: 'categoria', header: 'Categoría', sortValue: m => m.nombreCategoria, cell: m => m.nombreCategoria },
            { key: 'existencia', header: 'Existencia', sortValue: m => (Number(m.cantidad) || 0), cell: m => m.noDescuentaInventario ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No se descuenta</span> : <><Package size={14} /> {m.cantidad} {m.abreviacionUnidad}</> },
            { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: material => (
              <div className="actions-wrapper">{canEditMaterial && <button className="btn btn-secondary" title="Editar materia prima" style={{ padding: '7px' }} onClick={() => openEditMaterial(material)}><Edit2 size={15} /></button>}{canDeleteMaterial && <button className="btn btn-danger" title="Eliminar materia prima" style={{ padding: '7px' }} onClick={() => remove(material)}><Trash2 size={15} /></button>}</div>
            ) }
          ]}
        />
      ))}

      {/* Presentaciones e ingreso de existencias */}
      {canViewPresentations && materials.length > 0 && (
        <div style={{ marginTop: '22px' }}>
          <div style={{ padding: '0 4px 10px' }}>
            <h3 style={{ margin: 0 }}>Formatos de compra e ingreso de existencias</h3>
          </div>
          <DataTable
            rows={presentations}
            rowKey={p => p.idPresentacionMateriaPrima}
            search={p => `${p.nombreMaterial} ${p.nombrePresentacion}`}
            searchPlaceholder="Buscar formato…"
            emptyMessage="No hay formatos configurados."
            columns={[
              { key: 'materia', header: 'Materia prima', sortValue: p => p.nombreMaterial, cell: p => p.nombreMaterial },
              { key: 'presentacion', header: 'Formato', sortValue: p => p.nombrePresentacion, cell: p => p.nombrePresentacion },
              { key: 'contenido', header: 'Contenido', cell: p => `${p.cantidadContenido} ${p.abreviacionUnidad}` },
              { key: 'recibida', header: 'Cantidad recibida', cell: item => canEnterStock ? <input className="input-field" style={{ width: '110px' }} type="number" min="1" step="1" placeholder="Cajas" value={stockEntries[item.idPresentacionMateriaPrima] || ''} onChange={e => setStockEntries(current => ({ ...current, [item.idPresentacionMateriaPrima]: e.target.value }))} /> : '—' },
              { key: 'acciones', header: 'Acciones', headerClassName: 'col-actions', cellClassName: 'col-actions', cell: item => (
                <div className="actions-wrapper">{canEnterStock && <button className="btn btn-primary" type="button" disabled={!stockEntries[item.idPresentacionMateriaPrima]} onClick={() => addStock(item)}><Plus size={15} /> Ingresar</button>}{canEditPresentation && <button className="btn btn-secondary" title="Editar formato" style={{ padding: '7px' }} type="button" onClick={() => openEditPresentation(item)}><Edit2 size={15} /></button>}{canDeletePresentation && <button className="btn btn-danger" title="Eliminar formato" style={{ padding: '7px' }} type="button" onClick={() => removePresentation(item)}><Trash2 size={15} /></button>}</div>
              ) }
            ]}
          />
        </div>
      )}

      {/* Modal: crear/editar materia prima */}
      {showMaterialModal && (
        <div className="modal-overlay" onClick={closeMaterialModal}>
          <div className="modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <button type="button" className="btn" aria-label="Cerrar" onClick={closeMaterialModal} style={{ position: 'absolute', right: '18px', top: '18px', padding: '6px', background: 'none' }}><X size={20} color="var(--text-muted)" /></button>
            <h3 style={{ marginBottom: '16px' }} className="text-solid">{editing ? 'Editar materia prima' : 'Nueva materia prima'}</h3>
            {error && <div style={{ color: '#b91c1c', marginBottom: '12px', fontSize: '0.85rem' }}>{error}</div>}
            <form onSubmit={submitMaterial}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                <label className="input-group"><span className="input-label">Nombre</span><input className="input-field" maxLength="150" required value={form.nombreMaterial} onChange={e => setForm(current => ({ ...current, nombreMaterial: e.target.value }))} /></label>
                <div className="input-group"><span className="input-label">Marca</span><SearchableSelect options={selectOptions(catalogs.marcas, 'idMarca', 'nombreMarca')} value={form.idMarca} onChange={value => setForm(current => ({ ...current, idMarca: value }))} /></div>
                <div className="input-group"><span className="input-label">Categoría</span><SearchableSelect options={selectOptions(catalogs.categorias, 'idCategoriaMateria', 'nombreCategoriaMateria')} value={form.idCategoriaMateria} onChange={value => setForm(current => ({ ...current, idCategoriaMateria: value }))} /></div>
                <div className="input-group"><span className="input-label">Unidad de inventario</span><SearchableSelect options={catalogs.unidades.map(x => ({ value: x.idUnidadMedida, label: `${x.nombreUnidadMedida} (${x.abreviacion})` }))} value={form.idUnidadMedida} onChange={value => setForm(current => ({ ...current, idUnidadMedida: value }))} /></div>
                {!form.noDescuentaInventario && <label className="input-group"><span className="input-label">Cantidad disponible</span><input className="input-field" type="number" min="0" step={selectedInventoryUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} required value={form.cantidad} onChange={e => setForm(current => ({ ...current, cantidad: e.target.value }))} /></label>}
                <div className="input-group"><span className="input-label">Imagen</span>
                  <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content', fontWeight: 600 }}>
                    <Upload size={16} /> {preview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                    <input type="file" accept="image/*" onChange={chooseImage} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
              <label className="input-group"><span className="input-label">Descripción</span><textarea className="input-field" maxLength="300" rows="2" value={form.descripcion} onChange={e => setForm(current => ({ ...current, descripcion: e.target.value }))} /></label>
              {calibrationEnabled && <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px', fontSize: '.85rem' }}>
                <input type="checkbox" style={{ marginTop: '3px' }} checked={form.esCafeCalibrable} disabled={form.noDescuentaInventario} onChange={e => setForm(current => ({ ...current, esCafeCalibrable: e.target.checked }))} />
                <span>Café calibrable
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.78rem' }}>En las recetas, su cantidad (en gramos) se toma de la última calibración del turno. Solo una materia prima puede estar marcada; use una unidad de masa.</span>
                </span>
              </label>}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px', fontSize: '.85rem' }}>
                <input type="checkbox" style={{ marginTop: '3px' }} checked={form.noDescuentaInventario} disabled={form.esCafeCalibrable} onChange={e => setForm(current => ({ ...current, noDescuentaInventario: e.target.checked, cantidad: e.target.checked ? '' : current.cantidad }))} />
                <span>No descontar del inventario (ej. agua)
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.78rem' }}>Sin control de existencia</span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px', fontSize: '.85rem' }}>
                <input type="checkbox" style={{ marginTop: '3px' }} checked={form.tieneRecargo} onChange={e => setForm(current => ({ ...current, tieneRecargo: e.target.checked, recargoBase: e.target.checked ? current.recargoBase : '', recargoModificable: e.target.checked ? current.recargoModificable : false }))} />
                <span>Tiene cargo adicional (recargo base)
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.78rem' }}>Se aplica automáticamente cuando esta materia se usa como opción/alternativa de un ingrediente en una receta.</span>
                </span>
              </label>
              {form.tieneRecargo && (
                <div className="modal-grid-2" style={{ marginBottom: '14px' }}>
                  <label className="input-group"><span className="input-label">Recargo base (CLP)</span><input className="input-field" type="number" min="0" step="1" required value={form.recargoBase} onChange={e => setForm(current => ({ ...current, recargoBase: e.target.value }))} /></label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '.85rem', paddingTop: '22px' }}>
                    <input type="checkbox" style={{ marginTop: '3px' }} checked={form.recargoModificable} onChange={e => setForm(current => ({ ...current, recargoModificable: e.target.checked }))} />
                    <span>Modificable por receta
                      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.78rem' }}>Recargo editable</span>
                    </span>
                  </label>
                </div>
              )}
              {preview && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}><img src={preview} alt="Vista previa" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' }} /><button type="button" className="btn btn-danger" style={{ padding: '7px' }} onClick={() => { setPreview(null); setForm(current => ({ ...current, imagenBase64: '' })); }}><X size={15} /> Quitar</button></div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={closeMaterialModal}>Cancelar</button>
                <button className="btn btn-primary" style={btnPrimary} disabled={!form.idMarca || !form.idCategoriaMateria || !form.idUnidadMedida}><Save size={16} /> Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: crear presentación */}
      {showPresentationModal && (
        <div className="modal-overlay" onClick={closePresentationModal}>
          <div className="modal-content" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <button type="button" className="btn" aria-label="Cerrar" onClick={closePresentationModal} style={{ position: 'absolute', right: '18px', top: '18px', padding: '6px', background: 'none' }}><X size={20} color="var(--text-muted)" /></button>
            <h3 style={{ marginBottom: '6px' }} className="text-solid">{editingPresentation ? 'Editar formato de compra' : 'Nuevo formato de compra'}</h3>
            {error && <div style={{ color: '#b91c1c', marginBottom: '12px', fontSize: '0.85rem' }}>{error}</div>}
            <form onSubmit={createPresentation}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                <div className="input-group"><span className="input-label">Materia prima</span><SearchableSelect options={materials.filter(x => !x.noDescuentaInventario).map(x => ({ value: x.idMateriaPrima, label: x.nombreMaterial }))} value={presentation.idMateriaPrima} onChange={value => setPresentation(current => ({ ...current, idMateriaPrima: value, idUnidadMedida: '' }))} /></div>
                <label className="input-group"><span className="input-label">Nombre del formato</span><input className="input-field" required maxLength="100" value={presentation.nombrePresentacion} onChange={e => setPresentation(current => ({ ...current, nombrePresentacion: e.target.value }))} /></label>
                <label className="input-group"><span className="input-label">Contenido</span><input className="input-field" type="number" min={selectedPresentationMaterial?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} step={selectedPresentationMaterial?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} required value={presentation.cantidadContenido} onChange={e => setPresentation(current => ({ ...current, cantidadContenido: e.target.value }))} /></label>
                <div className="input-group"><span className="input-label">Unidad del contenido</span><SearchableSelect options={compatibleUnits.map(x => ({ value: x.idUnidadMedida, label: `${x.nombreUnidadMedida} (${x.abreviacion})` }))} value={presentation.idUnidadMedida} onChange={value => setPresentation(current => ({ ...current, idUnidadMedida: value }))} />{selectedPresentationMaterial && compatibleUnits.length === 0 && <small style={{ color: '#b91c1c', fontSize: '0.75rem' }}>No hay unidades para esta magnitud. Créalas en “Unidades de medida”.</small>}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={closePresentationModal}>Cancelar</button>
                <button className="btn btn-primary" style={btnPrimary} disabled={!presentation.idMateriaPrima || !presentation.idUnidadMedida}>{editingPresentation ? <Save size={16} /> : <Plus size={16} />} {editingPresentation ? 'Guardar cambios' : 'Agregar formato'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const InventorySettings = () => {
  // Las rutas son literales (turn/courtesy, settings/raw-materials, …),
  // por lo que la sección se deriva del último segmento de la URL, no de un parámetro de ruta.
  const { pathname } = useLocation();
  const section = pathname.split('/').filter(Boolean).pop();
  const { can } = useAuth();
  const { logbookIncludesCalibration } = useOrganization();
  const [data, setData] = useState({ catalogs: { unidades: [], categorias: [], marcas: [] }, products: [], courtesy: [], courtesyCategories: [], availableCategories: [], materials: [], presentations: [], policy: { modo: 'PRODUCTOS', limiteDiarioGlobal: 2, montoDiarioGlobal: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');

  const load = useCallback(async () => {
    setError('');
    try {
      const needsRawMaterialCatalogs = section === 'raw-materials';
      const isCourtesy = section === 'courtesy';
      const isRawMaterials = section === 'raw-materials';
      // Los combos (unidades/categorías/marcas) del formulario de materias primas se cargan por el
      // permiso de ESTA pantalla (materias primas / presentaciones), no por el del mantenedor. En la
      // sección propia de cada mantenedor sí se gatea por su permiso de lectura.
      const canRawMaterialCatalogs = can('configuracion_inventario.materias_primas.ver') || can('configuracion_inventario.presentaciones.ver');
      const canCourtesy = can('configuracion_inventario.cortesia.ver');
      const [catalogs, products, courtesy, courtesyCategories, availableCategories, materials, presentations, policy] = await Promise.all([
        Promise.all([
          (section === 'units' && can('configuracion_inventario.unidades.ver')) || (needsRawMaterialCatalogs && canRawMaterialCatalogs) ? fetch(`${API}/units`).then(readResponse) : [],
          (section === 'material-categories' && can('configuracion_inventario.categorias_materia.ver')) || (needsRawMaterialCatalogs && canRawMaterialCatalogs) ? fetch(`${API}/material-categories`).then(readResponse) : [],
          (section === 'brands' && can('configuracion_inventario.marcas.ver')) || (needsRawMaterialCatalogs && canRawMaterialCatalogs) ? fetch(`${API}/brands`).then(readResponse) : []
        ]).then(([unidades, categorias, marcas]) => ({ unidades, categorias, marcas })),
        isCourtesy && can('inventario.productos.ver') ? fetch('/api/product').then(readResponse) : [],
        isCourtesy && canCourtesy ? fetch(`${API}/courtesy-products`).then(readResponse) : [],
        isCourtesy && canCourtesy ? fetch(`${API}/courtesy-categories`).then(readResponse) : [],
        isCourtesy && canCourtesy ? fetch(`${API}/courtesy-available-categories`).then(readResponse) : [],
        isRawMaterials && (can('configuracion_inventario.materias_primas.ver') || can('configuracion_inventario.presentaciones.ver')) ? fetch(`${API}/raw-materials`).then(readResponse) : [],
        isRawMaterials && can('configuracion_inventario.presentaciones.ver') ? fetch(`${API}/raw-material-presentations`).then(readResponse) : [],
        isCourtesy && canCourtesy ? fetch(`${API}/courtesy-policy`).then(readResponse) : { modo: 'PRODUCTOS', limiteDiarioGlobal: 2, montoDiarioGlobal: 0 }
      ]);
      setData({ catalogs, products, courtesy, courtesyCategories, availableCategories, materials, presentations, policy });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [section, can]);

  useEffect(() => { document.title = `${sectionInfo[section]?.title || 'Configuraciones'} - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`; load(); }, [section, load]);
  const info = sectionInfo[section] || sectionInfo.courtesy;

  let content;
  if (section === 'courtesy') content = <CourtesyManager products={data.products} entries={data.courtesy} categoryEntries={data.courtesyCategories} availableCategories={data.availableCategories} policy={data.policy} onReload={load} canEditPolicy={can('configuracion_inventario.cortesia.politica.editar')} canCreate={can('configuracion_inventario.cortesia.crear')} canEdit={can('configuracion_inventario.cortesia.editar')} canChangeStatus={can('configuracion_inventario.cortesia.estado.modificar')} />;
  else if (section === 'raw-materials') content = <RawMaterialsManager materials={data.materials} catalogs={data.catalogs} presentations={data.presentations} onReload={load} calibrationEnabled={logbookIncludesCalibration} canViewMaterials={can('configuracion_inventario.materias_primas.ver')} canViewPresentations={can('configuracion_inventario.presentaciones.ver')} canCreateMaterial={can('configuracion_inventario.materias_primas.crear')} canEditMaterial={can('configuracion_inventario.materias_primas.editar')} canDeleteMaterial={can('configuracion_inventario.materias_primas.eliminar')} canCreatePresentation={can('configuracion_inventario.presentaciones.crear')} canEditPresentation={can('configuracion_inventario.presentaciones.editar')} canDeletePresentation={can('configuracion_inventario.presentaciones.eliminar')} canEnterStock={can('configuracion_inventario.stock.ingresar')} />;
  else if (section === 'units') content = <UnitsManager items={data.catalogs.unidades} onReload={load} canCreate={can('configuracion_inventario.unidades.crear')} canEdit={can('configuracion_inventario.unidades.editar')} canDelete={can('configuracion_inventario.unidades.eliminar')} />;
  else if (section === 'material-categories') content = <SimpleCatalogManager items={data.catalogs.categorias} idKey="idCategoriaMateria" nameKey="nombreCategoriaMateria" endpoint="material-categories" singular="categoría" onReload={load} canCreate={can('configuracion_inventario.categorias_materia.crear')} canEdit={can('configuracion_inventario.categorias_materia.editar')} canDelete={can('configuracion_inventario.categorias_materia.eliminar')} />;
  else content = <SimpleCatalogManager items={data.catalogs.marcas} idKey="idMarca" nameKey="nombreMarca" endpoint="brands" singular="marca" onReload={load} canCreate={can('configuracion_inventario.marcas.crear')} canEdit={can('configuracion_inventario.marcas.editar')} canDelete={can('configuracion_inventario.marcas.eliminar')} />;

  return <div className="animate-fade-in"><PageHeader title={info.title} icon={section === 'courtesy' ? Package : CheckCircle2} />{error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}{loading ? <div className="card" style={{ textAlign: 'center' }}>Cargando configuración…</div> : content}</div>;
};

export default InventorySettings;
