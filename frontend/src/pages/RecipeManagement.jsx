import { ArrowLeft, Check, ClipboardList, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const RecipeManagement = () => {
  const { idProducto } = useParams();
  const [product, setProduct] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/recipe/product/${idProducto}`).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.mensaje); return data; }),
      fetch('/api/inventory-configuration/raw-materials').then(response => response.json()),
      fetch('/api/inventory-configuration/catalogs').then(response => response.json())
    ]).then(([recipeData, rawMaterials, catalogs]) => {
      setProduct(recipeData.producto);
      setSelected(Object.fromEntries((recipeData.receta?.materiales || []).map(material => [material.idMateriaPrima, { cantidadRequerida: material.cantidadRequerida, idUnidadMedida: material.idUnidadMedida }])));
      setMaterials(rawMaterials);
      setUnits(catalogs.unidades || []);
      document.title = `Receta de ${recipeData.producto.nombreProducto} - Siete Vidas`;
    }).catch(err => setError(err.message || 'No fue posible cargar la receta.')).finally(() => setLoading(false));
  }, [idProducto]);

  const filtered = useMemo(() => materials.filter(material => `${material.nombreMaterial} ${material.nombreMarca} ${material.nombreCategoria}`.toLowerCase().includes(search.toLowerCase())), [materials, search]);
  const toggle = material => setSelected(current => {
    const id = material.idMateriaPrima;
    if (Object.prototype.hasOwnProperty.call(current, id)) {
      const next = { ...current }; delete next[id]; return next;
    }
    return { ...current, [id]: { cantidadRequerida: '', idUnidadMedida: material.idUnidadMedida } };
  });
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const materiales = Object.entries(selected).map(([idMateriaPrima, value]) => ({ idMateriaPrima: Number(idMateriaPrima), idUnidadMedida: Number(value.idUnidadMedida), cantidadRequerida: Number(value.cantidadRequerida) }));
      if (materiales.some(material => material.cantidadRequerida <= 0 || !material.idUnidadMedida)) throw new Error('Ingrese una cantidad y unidad válidas para cada materia prima.');
      const response = await fetch(`/api/recipe/product/${idProducto}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materiales }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.mensaje || 'No fue posible guardar la receta.'); setMessage(data.mensaje);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando receta…</div>;
  if (error && !product) return <div className="card" style={{ color: '#b91c1c' }}>{error}</div>;
  return <div className="animate-fade-in"><Link to="/inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary-color)', fontWeight: 700, textDecoration: 'none', marginBottom: '18px' }}><ArrowLeft size={16} /> Volver a productos</Link>
    <div className="page-header"><div><h2 className="page-title"><ClipboardList size={25} /> Receta de {product.nombreProducto}</h2><p className="page-subtitle">Seleccione las materias primas e indique la cantidad requerida para preparar una unidad del producto.</p></div><button className="btn btn-primary" onClick={save} disabled={saving || Object.keys(selected).length === 0}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar receta'}</button></div>
    {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '16px' }}>{error}</div>}{message && <div className="card" style={{ color: '#15803d', marginBottom: '16px' }}>{message}</div>}
    <div className="card" style={{ marginBottom: '18px' }}><input className="input-field" placeholder="Buscar por nombre, marca o categoría…" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' }}>
      {filtered.map(material => {
        const active = Object.prototype.hasOwnProperty.call(selected, material.idMateriaPrima);
        const compatibleUnits = units.filter(unit => unit.tipoMagnitud === material.tipoMagnitud);
        const selectedRecipeUnit = active ? units.find(unit => unit.idUnidadMedida === Number(selected[material.idMateriaPrima].idUnidadMedida)) : null;
        return <div key={material.idMateriaPrima} onClick={() => !active && toggle(material)} className="card" style={{ cursor: active ? 'default' : 'pointer', textAlign: 'left', border: active ? '2px solid var(--primary-color)' : '1px solid var(--panel-border)', background: active ? '#f0fdf4' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><strong>{material.nombreMaterial}</strong><button type="button" onClick={event => { event.stopPropagation(); toggle(material); }} style={{ border: 'none', background: active ? 'var(--primary-color)' : '#e2e8f0', color: active ? '#fff' : 'var(--text-muted)', borderRadius: '50%', width: '25px', height: '25px', cursor: 'pointer' }}>{active && <Check size={16} />}</button></div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>{material.nombreMarca} · {material.nombreCategoria}</div>
          <div style={{ fontSize: '0.78rem', marginTop: '8px' }}>Disponible: {material.cantidad} {material.abreviacionUnidad}</div>
          {active && <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '8px', marginTop: '14px' }} onClick={event => event.stopPropagation()}><label className="input-group" style={{ margin: 0 }}><span className="input-label">Cantidad por producto</span><input className="input-field" autoFocus type="number" min={selectedRecipeUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} step={selectedRecipeUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} required value={selected[material.idMateriaPrima].cantidadRequerida} onChange={event => setSelected(current => ({ ...current, [material.idMateriaPrima]: { ...current[material.idMateriaPrima], cantidadRequerida: event.target.value } }))} /></label><label className="input-group" style={{ margin: 0 }}><span className="input-label">Unidad</span><select className="input-field" value={selected[material.idMateriaPrima].idUnidadMedida} onChange={event => setSelected(current => ({ ...current, [material.idMateriaPrima]: { ...current[material.idMateriaPrima], idUnidadMedida: event.target.value } }))}>{compatibleUnits.map(unit => <option key={unit.idUnidadMedida} value={unit.idUnidadMedida}>{unit.abreviacion}</option>)}</select></label></div>}
        </div>;
      })}
    </div>
    {materials.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Primero debe registrar materias primas desde Configuraciones.</div>}
  </div>;
};

export default RecipeManagement;
