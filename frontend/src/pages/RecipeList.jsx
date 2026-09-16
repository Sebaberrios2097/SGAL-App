import { ClipboardList, Edit2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const RecipeList = () => {
  const [recipes, setRecipes] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Recetas - Siete Vidas';
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return recipes;
    return recipes.filter(recipe => `${recipe.nombreProducto} ${recipe.materiales.map(material => material.nombreMaterial).join(' ')}`.toLowerCase().includes(term));
  }, [recipes, search]);

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando recetas…</div>;

  return <div className="animate-fade-in">
    <div className="page-header"><div><h2 className="page-title"><ClipboardList size={25} /> Recetas</h2><p className="page-subtitle">Todas las recetas configuradas y sus materias primas.</p></div><span className="badge badge-success">{recipes.filter(recipe => recipe.estado).length} activas</span></div>
    {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}
    <div className="card" style={{ marginBottom: '18px', position: 'relative' }}><Search size={18} style={{ position: 'absolute', left: '32px', top: '31px', color: 'var(--text-muted)' }} /><input className="input-field" style={{ paddingLeft: '38px' }} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por producto o materia prima…" /></div>
    <div className="table-container"><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}><table className="custom-table"><thead><tr><th>Producto</th><th>Materiales</th><th>Estado</th><th>Última modificación</th><th className="col-actions">Acciones</th></tr></thead><tbody>
      {filtered.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center' }}>{recipes.length === 0 ? 'Aún no hay recetas configuradas.' : 'No se encontraron recetas.'}</td></tr> : filtered.map(recipe => <tr key={recipe.idReceta}><td><strong>{recipe.nombreProducto}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>Receta #{recipe.idReceta}</div></td><td><div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{recipe.materiales.map(material => <span key={material.idMateriaPrima} className="badge" style={{ background: '#eef2f7', color: 'var(--text-color)', textTransform: 'none' }}>{material.nombreMaterial}: {material.cantidadRequerida} {material.abreviacionUnidad}</span>)}</div></td><td><span className={`badge ${recipe.estado ? 'badge-success' : 'badge-danger'}`}>{recipe.estado ? 'Activa' : 'Inactiva'}</span></td><td>{new Date(recipe.fechaModificacion || recipe.fechaCreacion).toLocaleString('es-CL')}</td><td className="col-actions"><Link className="btn btn-secondary" to={`/inventory/products/${recipe.idProducto}/recipe`}><Edit2 size={15} /> Editar</Link></td></tr>)}
    </tbody></table></div></div>
  </div>;
};

export default RecipeList;
