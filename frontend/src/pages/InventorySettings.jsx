import { CheckCircle2, Edit2, Image as ImageIcon, Package, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import SearchableSelect from '../components/SearchableSelect';

const API = '/api/inventory-configuration';

const sectionInfo = {
  courtesy: { title: 'Productos de cortesía', subtitle: 'Consumos diarios gratuitos disponibles para los empleados.' },
  'raw-materials': { title: 'Materias primas', subtitle: 'Ingredientes e insumos disponibles para configurar recetas.' },
  units: { title: 'Unidades de medida', subtitle: 'Unidades utilizadas para controlar las existencias de materias primas.' },
  'material-categories': { title: 'Categorías de materia prima', subtitle: 'Clasificación de ingredientes e insumos.' },
  brands: { title: 'Marcas', subtitle: 'Marcas asociadas a las materias primas.' }
};

const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--panel-border)', borderRadius: '9px', font: 'inherit', background: '#fff' };

const readResponse = async response => {
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.mensaje || 'No fue posible completar la operación.');
  return data;
};

const SimpleCatalogManager = ({ items, idKey, nameKey, endpoint, singular, onReload }) => {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

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
    if (!window.confirm(`¿Eliminar ${item[nameKey]}?`)) return;
    setError('');
    try {
      await readResponse(await fetch(`${API}/${endpoint}/${item[idKey]}`, { method: 'DELETE' }));
      onReload();
    } catch (err) { setError(err.message); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(420px, 1fr)', gap: '22px' }}>
      <form onSubmit={submit} className="card" style={{ alignSelf: 'start' }}>
        <h3 style={{ marginBottom: '16px' }}>{editing ? `Editar ${singular}` : `Nueva ${singular}`}</h3>
        {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
        <label className="input-group"><span className="input-label">Nombre</span><input className="input-field" required maxLength="100" value={name} onChange={e => setName(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" type="submit"><Save size={16} /> Guardar</button>
          {editing && <button className="btn btn-secondary" type="button" onClick={() => { setEditing(null); setName(''); }}>Cancelar</button>}
        </div>
      </form>
      <div className="table-container"><table className="custom-table"><thead><tr><th>Nombre</th><th className="col-actions">Acciones</th></tr></thead><tbody>
        {items.length === 0 ? <tr><td colSpan="2" style={{ textAlign: 'center' }}>Sin registros.</td></tr> : items.map(item => <tr key={item[idKey]}><td>{item[nameKey]}</td><td className="col-actions"><div className="actions-wrapper">
          <button className="btn btn-secondary" style={{ padding: '7px' }} onClick={() => { setEditing(item); setName(item[nameKey]); }}><Edit2 size={15} /></button>
          <button className="btn btn-danger" style={{ padding: '7px' }} onClick={() => remove(item)}><Trash2 size={15} /></button>
        </div></td></tr>)}
      </tbody></table></div>
    </div>
  );
};

const emptyUnit = { nombre: '', abreviacion: '', tipoMagnitud: 'Masa', factorConversionBase: 1, esUnidadBase: false };

const UnitsManager = ({ items, onReload }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUnit);
  const [error, setError] = useState('');
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
    if (!window.confirm(`¿Eliminar ${unit.nombreUnidadMedida}?`)) return;
    try { await readResponse(await fetch(`${API}/units/${unit.idUnidadMedida}`, { method: 'DELETE' })); onReload(); }
    catch (err) { setError(err.message); }
  };
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '22px' }}>
    <form className="card" onSubmit={submit} style={{ alignSelf: 'start' }}><h3 style={{ marginBottom: '8px' }}>{editing ? 'Editar unidad' : 'Nueva unidad'}</h3><p style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginBottom: '16px' }}>El factor indica cuántas unidades de referencia contiene. Ej.: g = 1, kg = 1000; mL = 1, L = 1000.</p>
      {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
      <label className="input-group"><span className="input-label">Nombre</span><input className="input-field" maxLength="50" required value={form.nombre} onChange={e => setForm(current => ({ ...current, nombre: e.target.value }))} placeholder="Kilogramo" /></label>
      <label className="input-group"><span className="input-label">Abreviación</span><input className="input-field" maxLength="15" required value={form.abreviacion} onChange={e => setForm(current => ({ ...current, abreviacion: e.target.value }))} placeholder="kg" /></label>
      <label className="input-group"><span className="input-label">Magnitud</span><select className="input-field" value={form.tipoMagnitud} onChange={e => setForm(current => ({ ...current, tipoMagnitud: e.target.value }))}><option>Masa</option><option>Volumen</option><option>Unidad</option></select></label>
      <label className="input-group"><span className="input-label">Factor respecto de la base</span><input className="input-field" type="number" min="0.000001" step="0.000001" required disabled={form.esUnidadBase} value={form.factorConversionBase} onChange={e => setForm(current => ({ ...current, factorConversionBase: e.target.value }))} /></label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}><input type="checkbox" checked={form.esUnidadBase} onChange={e => setForm(current => ({ ...current, esUnidadBase: e.target.checked, factorConversionBase: e.target.checked ? 1 : current.factorConversionBase }))} /> Unidad de referencia de esta magnitud</label>
      <div style={{ display: 'flex', gap: '8px' }}><button className="btn btn-primary"><Save size={16} /> Guardar</button>{editing && <button type="button" className="btn btn-secondary" onClick={reset}>Cancelar</button>}</div>
    </form>
    <div className="table-container"><table className="custom-table"><thead><tr><th>Unidad</th><th>Abrev.</th><th>Magnitud</th><th>Factor</th><th className="col-actions">Acciones</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center' }}>Sin unidades.</td></tr> : items.map(unit => <tr key={unit.idUnidadMedida}><td>{unit.nombreUnidadMedida}{unit.esUnidadBase && <span className="badge badge-success" style={{ marginLeft: '7px' }}>Base</span>}</td><td>{unit.abreviacion}</td><td>{unit.tipoMagnitud}</td><td>{unit.factorConversionBase}</td><td className="col-actions"><div className="actions-wrapper"><button className="btn btn-secondary" style={{ padding: '7px' }} onClick={() => edit(unit)}><Edit2 size={15} /></button><button className="btn btn-danger" style={{ padding: '7px' }} onClick={() => remove(unit)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
  </div>;
};

const CourtesyManager = ({ products, entries, policy, onReload }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ idProducto: '', cantidadDiaria: 1 });
  const [error, setError] = useState('');
  const [globalLimit, setGlobalLimit] = useState(policy.limiteDiarioGlobal || 2);

  useEffect(() => setGlobalLimit(policy.limiteDiarioGlobal || 2), [policy.limiteDiarioGlobal]);

  const savePolicy = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/courtesy-policy`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limiteDiarioGlobal: Number(globalLimit) })
      }));
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

  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '22px' }}>
    <div style={{ display: 'grid', gap: '16px', alignSelf: 'start' }}>
    <form className="card" onSubmit={savePolicy}><h3 style={{ marginBottom: '8px' }}>Cupo compartido</h3><p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '14px' }}>Máximo total que cada empleado puede consumir gratis durante un día, combinando cualquiera de los productos habilitados.</p>
      <label className="input-group"><span className="input-label">Límite diario global</span><input className="input-field" type="number" min="1" required value={globalLimit} onChange={e => setGlobalLimit(e.target.value)} /></label>
      <button className="btn btn-primary"><Save size={16} /> Guardar límite</button>
    </form>
    <form className="card" onSubmit={submit}><h3 style={{ marginBottom: '16px' }}>{editing ? 'Editar cortesía' : 'Agregar producto'}</h3>
      {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
      <div className="input-group"><span className="input-label">Producto</span><SearchableSelect required options={products.filter(x => x.activo).map(x => ({ value: x.idProducto, label: x.nombreProducto }))} value={form.idProducto} onChange={value => setForm(current => ({ ...current, idProducto: value }))} placeholder="Seleccione un producto" /></div>
      <label className="input-group"><span className="input-label">Cantidad diaria gratis</span><input className="input-field" type="number" min="1" required value={form.cantidadDiaria} onChange={e => setForm(current => ({ ...current, cantidadDiaria: e.target.value }))} /></label>
      <div style={{ display: 'flex', gap: '8px' }}><button className="btn btn-primary" disabled={!form.idProducto}><Save size={16} /> Guardar</button>{editing && <button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setForm({ idProducto: '', cantidadDiaria: 1 }); }}>Cancelar</button>}</div>
    </form></div>
    <div className="table-container"><table className="custom-table"><thead><tr><th>Producto</th><th>Cantidad diaria</th><th>Estado</th><th className="col-actions">Acciones</th></tr></thead><tbody>
      {entries.length === 0 ? <tr><td colSpan="4" style={{ textAlign: 'center' }}>No hay productos de cortesía configurados.</td></tr> : entries.map(entry => <tr key={entry.idProductoCortesia}><td>{entry.nombreProducto}</td><td>{entry.cantidadDiaria}</td><td><span className={`badge ${entry.activo ? 'badge-success' : 'badge-danger'}`}>{entry.activo ? 'Activo' : 'Inactivo'}</span></td><td className="col-actions"><div className="actions-wrapper">
        <button className="btn btn-secondary" style={{ padding: '7px' }} onClick={() => { setEditing(entry); setForm({ idProducto: entry.idProducto, cantidadDiaria: entry.cantidadDiaria }); }}><Edit2 size={15} /></button>
        <button className={entry.activo ? 'btn btn-danger' : 'btn btn-primary'} style={{ padding: '7px' }} onClick={() => toggle(entry)}><Power size={15} /></button>
      </div></td></tr>)}
    </tbody></table></div>
  </div>;
};

const emptyMaterial = { idMarca: '', idCategoriaMateria: '', idUnidadMedida: '', nombreMaterial: '', descripcion: '', cantidad: '', imagenBase64: null };

const RawMaterialsManager = ({ materials, catalogs, presentations, onReload }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyMaterial);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [presentation, setPresentation] = useState({ idMateriaPrima: '', nombrePresentacion: '', cantidadContenido: '', idUnidadMedida: '' });
  const [stockEntries, setStockEntries] = useState({});

  const selectOptions = (items, id, name) => items.map(x => ({ value: x[id], label: x[name] }));
  const reset = () => { setEditing(null); setForm(emptyMaterial); setPreview(null); };
  const chooseImage = event => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { setPreview(reader.result); setForm(current => ({ ...current, imagenBase64: reader.result })); }; reader.readAsDataURL(file);
  };
  const edit = material => {
    setEditing(material); setPreview(material.imagenBase64 ? `data:image/png;base64,${material.imagenBase64}` : null);
    setForm({ idMarca: material.idMarca, idCategoriaMateria: material.idCategoriaMateria, idUnidadMedida: material.idUnidadMedida, nombreMaterial: material.nombreMaterial, descripcion: material.descripcion || '', cantidad: material.cantidad, imagenBase64: null });
  };
  const submit = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/raw-materials${editing ? `/${editing.idMateriaPrima}` : ''}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, idMarca: Number(form.idMarca), idCategoriaMateria: Number(form.idCategoriaMateria), idUnidadMedida: Number(form.idUnidadMedida), cantidad: Number(form.cantidad) }) }));
      reset(); onReload();
    } catch (err) { setError(err.message); }
  };
  const remove = async material => {
    if (!window.confirm(`¿Eliminar ${material.nombreMaterial}?`)) return;
    try { await readResponse(await fetch(`${API}/raw-materials/${material.idMateriaPrima}`, { method: 'DELETE' })); onReload(); }
    catch (err) { setError(err.message); }
  };
  const selectedPresentationMaterial = materials.find(x => x.idMateriaPrima === Number(presentation.idMateriaPrima));
  const compatibleUnits = selectedPresentationMaterial ? catalogs.unidades.filter(x => x.tipoMagnitud === selectedPresentationMaterial.tipoMagnitud) : [];
  const selectedInventoryUnit = catalogs.unidades.find(x => x.idUnidadMedida === Number(form.idUnidadMedida));
  const createPresentation = async event => {
    event.preventDefault(); setError('');
    try {
      await readResponse(await fetch(`${API}/raw-material-presentations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...presentation, idMateriaPrima: Number(presentation.idMateriaPrima), idUnidadMedida: Number(presentation.idUnidadMedida), cantidadContenido: Number(presentation.cantidadContenido), activo: true }) }));
      setPresentation({ idMateriaPrima: '', nombrePresentacion: '', cantidadContenido: '', idUnidadMedida: '' }); onReload();
    } catch (err) { setError(err.message); }
  };
  const addStock = async item => {
    setError('');
    try {
      await readResponse(await fetch(`${API}/raw-material-presentations/${item.idPresentacionMateriaPrima}/stock-entry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidadPresentaciones: Number(stockEntries[item.idPresentacionMateriaPrima] || 0) }) }));
      setStockEntries(current => ({ ...current, [item.idPresentacionMateriaPrima]: '' })); onReload();
    } catch (err) { setError(err.message); }
  };
  const removePresentation = async item => {
    if (!window.confirm(`¿Eliminar la presentación ${item.nombrePresentacion}?`)) return;
    try { await readResponse(await fetch(`${API}/raw-material-presentations/${item.idPresentacionMateriaPrima}`, { method: 'DELETE' })); onReload(); }
    catch (err) { setError(err.message); }
  };

  return <><div className="card" style={{ marginBottom: '22px' }}><h3 style={{ marginBottom: '16px' }}>{editing ? 'Editar materia prima' : 'Nueva materia prima'}</h3>{error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}>{error}</div>}
    <form onSubmit={submit}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
      <label className="input-group"><span className="input-label">Nombre</span><input className="input-field" maxLength="150" required value={form.nombreMaterial} onChange={e => setForm(current => ({ ...current, nombreMaterial: e.target.value }))} /></label>
      <div className="input-group"><span className="input-label">Marca</span><SearchableSelect options={selectOptions(catalogs.marcas, 'idMarca', 'nombreMarca')} value={form.idMarca} onChange={value => setForm(current => ({ ...current, idMarca: value }))} placeholder="Seleccione marca" /></div>
      <div className="input-group"><span className="input-label">Categoría</span><SearchableSelect options={selectOptions(catalogs.categorias, 'idCategoriaMateria', 'nombreCategoriaMateria')} value={form.idCategoriaMateria} onChange={value => setForm(current => ({ ...current, idCategoriaMateria: value }))} placeholder="Seleccione categoría" /></div>
      <div className="input-group"><span className="input-label">Unidad de inventario</span><SearchableSelect options={catalogs.unidades.map(x => ({ value: x.idUnidadMedida, label: `${x.nombreUnidadMedida} (${x.abreviacion})` }))} value={form.idUnidadMedida} onChange={value => setForm(current => ({ ...current, idUnidadMedida: value }))} placeholder="Seleccione unidad" /></div>
      <label className="input-group"><span className="input-label">Cantidad disponible</span><input className="input-field" type="number" min="0" step={selectedInventoryUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} required value={form.cantidad} onChange={e => setForm(current => ({ ...current, cantidad: e.target.value }))} /></label>
      <label className="input-group"><span className="input-label">Imagen</span><input style={inputStyle} type="file" accept="image/*" onChange={chooseImage} /></label>
    </div>
    <label className="input-group"><span className="input-label">Descripción</span><textarea className="input-field" maxLength="300" rows="2" value={form.descripcion} onChange={e => setForm(current => ({ ...current, descripcion: e.target.value }))} /></label>
    {preview && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}><img src={preview} alt="Vista previa" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px' }} /><button type="button" className="btn btn-danger" style={{ padding: '7px' }} onClick={() => { setPreview(null); setForm(current => ({ ...current, imagenBase64: '' })); }}><X size={15} /> Quitar</button></div>}
    <div style={{ display: 'flex', gap: '8px' }}><button className="btn btn-primary" disabled={!form.idMarca || !form.idCategoriaMateria || !form.idUnidadMedida}><Save size={16} /> Guardar</button>{editing && <button type="button" className="btn btn-secondary" onClick={reset}>Cancelar</button>}</div>
    </form></div>
    <form className="card" onSubmit={createPresentation} style={{ marginBottom: '22px' }}><h3 style={{ marginBottom: '8px' }}>Presentación de compra</h3><p style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginBottom: '16px' }}>Ejemplo: una caja de leche contiene 1 L. Al ingresar cajas, la existencia se convierte automáticamente a la unidad del inventario.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
      <div className="input-group"><span className="input-label">Materia prima</span><SearchableSelect options={materials.map(x => ({ value: x.idMateriaPrima, label: x.nombreMaterial }))} value={presentation.idMateriaPrima} onChange={value => setPresentation(current => ({ ...current, idMateriaPrima: value, idUnidadMedida: '' }))} placeholder="Seleccione materia" /></div>
      <label className="input-group"><span className="input-label">Nombre de presentación</span><input className="input-field" required maxLength="100" value={presentation.nombrePresentacion} onChange={e => setPresentation(current => ({ ...current, nombrePresentacion: e.target.value }))} placeholder="Caja 1 L" /></label>
      <label className="input-group"><span className="input-label">Contenido</span><input className="input-field" type="number" min={selectedPresentationMaterial?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} step={selectedPresentationMaterial?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} required value={presentation.cantidadContenido} onChange={e => setPresentation(current => ({ ...current, cantidadContenido: e.target.value }))} /></label>
      <div className="input-group"><span className="input-label">Unidad del contenido</span><SearchableSelect options={compatibleUnits.map(x => ({ value: x.idUnidadMedida, label: `${x.nombreUnidadMedida} (${x.abreviacion})` }))} value={presentation.idUnidadMedida} onChange={value => setPresentation(current => ({ ...current, idUnidadMedida: value }))} placeholder="Seleccione unidad" /></div>
    </div><button className="btn btn-primary" disabled={!presentation.idMateriaPrima || !presentation.idUnidadMedida}><Plus size={16} /> Agregar presentación</button></form>
    <div className="table-container"><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}><table className="custom-table"><thead><tr><th>Materia prima</th><th>Marca</th><th>Categoría</th><th>Existencia</th><th className="col-actions">Acciones</th></tr></thead><tbody>
      {materials.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center' }}>No hay materias primas registradas.</td></tr> : materials.map(material => <tr key={material.idMateriaPrima}><td><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{material.imagenBase64 ? <img src={`data:image/png;base64,${material.imagenBase64}`} alt="" style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '7px' }} /> : <ImageIcon size={22} color="var(--text-muted)" />}<div><strong>{material.nombreMaterial}</strong><div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{material.descripcion}</div></div></div></td><td>{material.nombreMarca}</td><td>{material.nombreCategoria}</td><td><Package size={14} /> {material.cantidad} {material.abreviacionUnidad}</td><td className="col-actions"><div className="actions-wrapper"><button className="btn btn-secondary" style={{ padding: '7px' }} onClick={() => edit(material)}><Edit2 size={15} /></button><button className="btn btn-danger" style={{ padding: '7px' }} onClick={() => remove(material)}><Trash2 size={15} /></button></div></td></tr>)}
    </tbody></table></div></div>
    <div className="table-container" style={{ marginTop: '22px' }}><div style={{ padding: '18px 20px 4px' }}><h3>Presentaciones e ingreso de existencias</h3></div><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}><table className="custom-table"><thead><tr><th>Materia prima</th><th>Presentación</th><th>Contenido</th><th>Cantidad recibida</th><th className="col-actions">Acciones</th></tr></thead><tbody>
      {presentations.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center' }}>No hay presentaciones configuradas.</td></tr> : presentations.map(item => <tr key={item.idPresentacionMateriaPrima}><td>{item.nombreMaterial}</td><td>{item.nombrePresentacion}</td><td>{item.cantidadContenido} {item.abreviacionUnidad}</td><td><input className="input-field" style={{ width: '110px' }} type="number" min="1" step="1" placeholder="Cajas" value={stockEntries[item.idPresentacionMateriaPrima] || ''} onChange={e => setStockEntries(current => ({ ...current, [item.idPresentacionMateriaPrima]: e.target.value }))} /></td><td className="col-actions"><div className="actions-wrapper"><button className="btn btn-primary" type="button" disabled={!stockEntries[item.idPresentacionMateriaPrima]} onClick={() => addStock(item)}><Plus size={15} /> Ingresar</button><button className="btn btn-danger" style={{ padding: '7px' }} type="button" onClick={() => removePresentation(item)}><Trash2 size={15} /></button></div></td></tr>)}
    </tbody></table></div></div></>;
};

const InventorySettings = () => {
  const { section } = useParams();
  const [data, setData] = useState({ catalogs: { unidades: [], categorias: [], marcas: [] }, products: [], courtesy: [], materials: [], presentations: [], policy: { limiteDiarioGlobal: 2 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [catalogs, products, courtesy, materials, presentations, policy] = await Promise.all([
        fetch(`${API}/catalogs`).then(readResponse), fetch('/api/product').then(readResponse),
        fetch(`${API}/courtesy-products`).then(readResponse), fetch(`${API}/raw-materials`).then(readResponse),
        fetch(`${API}/raw-material-presentations`).then(readResponse),
        fetch(`${API}/courtesy-policy`).then(readResponse)
      ]);
      setData({ catalogs, products, courtesy, materials, presentations, policy });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { document.title = `${sectionInfo[section]?.title || 'Configuraciones'} - Siete Vidas`; load(); }, [section, load]);
  const info = sectionInfo[section] || sectionInfo.courtesy;

  let content;
  if (section === 'courtesy') content = <CourtesyManager products={data.products} entries={data.courtesy} policy={data.policy} onReload={load} />;
  else if (section === 'raw-materials') content = <RawMaterialsManager materials={data.materials} catalogs={data.catalogs} presentations={data.presentations} onReload={load} />;
  else if (section === 'units') content = <UnitsManager items={data.catalogs.unidades} onReload={load} />;
  else if (section === 'material-categories') content = <SimpleCatalogManager items={data.catalogs.categorias} idKey="idCategoriaMateria" nameKey="nombreCategoriaMateria" endpoint="material-categories" singular="categoría" onReload={load} />;
  else content = <SimpleCatalogManager items={data.catalogs.marcas} idKey="idMarca" nameKey="nombreMarca" endpoint="brands" singular="marca" onReload={load} />;

  return <div className="animate-fade-in"><div className="page-header"><div><h2 className="page-title">{info.title}</h2><p className="page-subtitle">{info.subtitle}</p></div><CheckCircle2 color="var(--primary-color)" /></div>{error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}{loading ? <div className="card" style={{ textAlign: 'center' }}>Cargando configuración…</div> : content}</div>;
};

export default InventorySettings;
