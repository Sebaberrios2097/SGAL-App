import { useEffect, useMemo, useState } from 'react';
import { PackageOpen, Save, Search, Plus, X, Check, Coffee, Settings2, Trash2, Star } from 'lucide-react';
import { notify, confirmDialog } from '../components/NotificationCenter';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { productImageUrl } from '../utils/productImage';

const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;
const hasSpecialConfig = (product) =>
  (product.precioEnvase != null && product.precioEnvase !== '') ||
  (product.medioPago != null && product.medioPago !== '');

const ReturnablesSettings = () => {
  useDocumentTitle('Productos retornables');
  const [general, setGeneral] = useState(null);
  const [retornables, setRetornables] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal "Agregar productos"
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerSelected, setPickerSelected] = useState(() => new Set());

  // Modal de configuración especial por artículo
  const [configTarget, setConfigTarget] = useState(null);

  const load = async () => {
    const [cfgRes, prodRes, catRes] = await Promise.all([
      fetch('/api/returnables/configuration', { cache: 'no-store' }),
      fetch('/api/product', { cache: 'no-store' }),
      fetch('/api/category', { cache: 'no-store' })
    ]);
    if (!cfgRes.ok) return notify.error('No fue posible cargar los productos retornables.');
    const cfg = await cfgRes.json();
    const products = prodRes.ok ? await prodRes.json() : [];
    const cats = catRes.ok ? await catRes.json() : [];
    const catalogActive = (Array.isArray(products) ? products : []).filter(p => p.activo);
    const byId = new Map(catalogActive.map(p => [p.idProducto, p]));
    const rows = (cfg.productos || []).filter(p => p.retornable).map(p => {
      const info = byId.get(p.idProducto) || {};
      return {
        idProducto: p.idProducto,
        nombreProducto: p.nombreProducto,
        precio: p.precio,
        tieneImagen: info.tieneImagen || false,
        fechaModificacion: info.fechaModificacion,
        idCategoriaProducto: info.idCategoriaProducto,
        precioEnvase: p.precioEnvase ?? null,
        medioPago: p.medioPago ?? null
      };
    });
    setGeneral({
      precioGeneral: cfg.retornablesPrecioGeneral || 0,
      medioPago: cfg.retornablesMedioPago || 'EFECTIVO',
      vigenciaDias: cfg.retornablesVigenciaDias ?? ''
    });
    setRetornables(rows);
    setCatalog(catalogActive);
    setCategories(Array.isArray(cats) ? cats : []);
  };
  useEffect(() => { load(); }, []);

  const retornableIds = useMemo(() => new Set(retornables.map(p => p.idProducto)), [retornables]);

  const visibleRetornables = useMemo(() => {
    const q = query.trim().toLowerCase();
    return retornables.filter(p => !q || p.nombreProducto.toLowerCase().includes(q));
  }, [retornables, query]);

  // Candidatos del modal: catálogo activo que aún no es retornable, agrupado por categoría (como en Caja).
  const pickerGroups = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const candidates = catalog.filter(p => !retornableIds.has(p.idProducto)
      && (!q || p.nombreProducto.toLowerCase().includes(q))
      && (pickerCategory === 'all' || p.idCategoriaProducto === pickerCategory));
    const groups = new Map();
    categories.filter(c => c.activo).forEach(c => groups.set(c.idCategoriaProducto, {
      id: c.idCategoriaProducto, name: c.nombreCategoriaProducto, items: []
    }));
    const sinCategoria = { id: 'sin', name: 'Sin categoría', items: [] };
    candidates.forEach(p => { const g = groups.get(p.idCategoriaProducto); (g || sinCategoria).items.push(p); });
    return [...groups.values(), sinCategoria].filter(g => g.items.length > 0);
  }, [catalog, retornableIds, pickerQuery, pickerCategory, categories]);

  // Guarda toda la configuración en una sola operación (general + lista completa de retornables).
  const persist = async (nextRetornables, { silent } = {}) => {
    setSaving(true);
    try {
      const res = await fetch('/api/returnables/configuration', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precioGeneral: Number(general.precioGeneral) || 0,
          medioPago: general.medioPago,
          vigenciaDias: general.vigenciaDias === '' ? null : Number(general.vigenciaDias),
          productos: nextRetornables.map(p => ({
            idProducto: p.idProducto,
            precioEnvase: (p.precioEnvase === '' || p.precioEnvase == null) ? null : Number(p.precioEnvase),
            medioPago: p.medioPago || null
          }))
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.mensaje || 'No fue posible guardar la configuración.');
      if (!silent) notify.success('Configuración actualizada.');
      return true;
    } catch (error) { notify.error(error.message); return false; }
    finally { setSaving(false); }
  };

  const saveGeneral = () => persist(retornables);

  const togglePick = (id) => setPickerSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openPicker = () => { setPickerSelected(new Set()); setPickerQuery(''); setPickerCategory('all'); setPickerOpen(true); };

  const confirmAddProducts = async () => {
    const toAdd = catalog
      .filter(p => pickerSelected.has(p.idProducto) && !retornableIds.has(p.idProducto))
      .map(p => ({
        idProducto: p.idProducto, nombreProducto: p.nombreProducto, precio: p.precio,
        tieneImagen: p.tieneImagen, fechaModificacion: p.fechaModificacion,
        idCategoriaProducto: p.idCategoriaProducto, precioEnvase: null, medioPago: null
      }));
    if (toAdd.length === 0) { setPickerOpen(false); return; }
    const next = [...retornables, ...toAdd];
    if (await persist(next, { silent: true })) {
      setRetornables(next);
      setPickerOpen(false);
      setPickerSelected(new Set());
      notify.success(`${toAdd.length} producto(s) agregado(s) a retornables.`);
    }
  };

  const removeProduct = async (product) => {
    const confirmed = await confirmDialog({
      title: 'Quitar de retornables',
      message: `¿Quitar "${product.nombreProducto}" de los productos retornables?`,
      confirmText: 'Quitar', cancelText: 'Cancelar', tone: 'danger'
    });
    if (!confirmed) return;
    const next = retornables.filter(p => p.idProducto !== product.idProducto);
    if (await persist(next, { silent: true })) { setRetornables(next); notify.success('Producto quitado.'); }
  };

  const saveSpecial = async () => {
    const clean = {
      ...configTarget,
      precioEnvase: (configTarget.precioEnvase === '' || configTarget.precioEnvase == null) ? null : Number(configTarget.precioEnvase),
      medioPago: configTarget.medioPago || null
    };
    const next = retornables.map(p => p.idProducto === clean.idProducto ? { ...p, precioEnvase: clean.precioEnvase, medioPago: clean.medioPago } : p);
    if (await persist(next, { silent: true })) {
      setRetornables(next);
      setConfigTarget(null);
      notify.success('Configuración especial guardada.');
    }
  };

  if (!general) return <div className="card">Cargando…</div>;

  const renderPickCard = (prod) => {
    const selected = pickerSelected.has(prod.idProducto);
    return (
      <div key={prod.idProducto} onClick={() => togglePick(prod.idProducto)}
        style={{
          border: `2px solid ${selected ? 'var(--primary-color)' : '#e2e8f0'}`, borderRadius: 12, padding: 11,
          display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative',
          background: selected ? 'rgba(var(--primary-rgb), .06)' : '#fff', userSelect: 'none',
          boxShadow: selected ? '0 0 0 3px rgba(var(--primary-rgb), .12)' : '0 2px 8px rgba(0,0,0,0.02)'
        }}>
        {selected && <span style={{ position: 'absolute', top: 8, right: 8, background: 'var(--primary-color)', color: '#fff', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={13} /></span>}
        <div style={{ width: '100%', height: 100, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 10 }}>
          {prod.tieneImagen
            ? <img src={productImageUrl(prod)} alt={prod.nombreProducto} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Coffee size={26} color="#94a3b8" />}
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>{prod.nombreProducto}</div>
        <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: '0.9rem', fontWeight: 800 }}>{money(prod.precio)}</div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header"><h2 className="page-title">Productos retornables</h2><PackageOpen color="var(--primary-color)" /></div>

      {/* Configuración general del depósito de envases */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 16, alignItems: 'start' }}>
        <label className="input-group" style={{ marginBottom: 0 }}><span className="input-label">Precio general por envase</span><input className="input-field" type="number" min="0" value={general.precioGeneral} onChange={e => setGeneral({ ...general, precioGeneral: e.target.value })} /></label>
        <label className="input-group" style={{ marginBottom: 0 }}><span className="input-label">Medio de pago general</span><select className="input-field" value={general.medioPago} onChange={e => setGeneral({ ...general, medioPago: e.target.value })}><option value="EFECTIVO">Solo efectivo</option><option value="TODOS">Todo medio de pago</option></select></label>
        <label className="input-group" style={{ marginBottom: 0 }}><span className="input-label">Vigencia del vale (días)</span><input className="input-field" type="number" min="1" placeholder="Sin vencimiento" value={general.vigenciaDias} onChange={e => setGeneral({ ...general, vigenciaDias: e.target.value })} /></label>
        <div className="input-group" style={{ marginBottom: 0 }}><span className="input-label" aria-hidden="true" style={{ visibility: 'hidden' }}>Acción</span><button className="btn btn-primary" disabled={saving} onClick={saveGeneral} style={{ width: '100%', padding: '12px 24px' }}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar general'}</button></div>
      </div>

      {/* Barra de acciones de la lista de retornables */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
          <Search size={17} color="var(--text-muted)" />
          <input className="input-field" style={{ flex: 1 }} placeholder="Buscar en retornables…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openPicker}><Plus size={17} /> Agregar productos</button>
      </div>

      {/* Solo productos que ya son retornables */}
      {retornables.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
          <PackageOpen size={34} style={{ opacity: 0.5 }} />
          <p style={{ margin: '12px 0 4px', fontWeight: 700 }}>Aún no hay productos retornables</p>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Usa “Agregar productos” para incluir los envases que se devuelven.</p>
        </div>
      ) : visibleRetornables.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>Sin coincidencias.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
          {visibleRetornables.map(product => {
            const special = hasSpecialConfig(product);
            return (
              <div className="card" key={product.idProducto} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, border: special ? '2px solid var(--primary-color)' : '1px solid var(--panel-border)', boxShadow: special ? '0 0 0 3px rgba(var(--primary-rgb), .10)' : undefined, position: 'relative' }}>
                {special && <span title="Configuración especial" style={{ position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--primary-color)', color: '#fff', borderRadius: 999, padding: '3px 9px', fontSize: '0.68rem', fontWeight: 800 }}><Star size={11} /> Especial</span>}
                <div style={{ display: 'flex', gap: 11 }}>
                  <div style={{ width: 58, height: 58, flexShrink: 0, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {product.tieneImagen
                      ? <img src={productImageUrl(product)} alt={product.nombreProducto} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Coffee size={22} color="#94a3b8" />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, lineHeight: 1.2, paddingRight: special ? 62 : 0 }}>{product.nombreProducto}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{money(product.precio)}</div>
                  </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: 8, padding: '7px 9px', lineHeight: 1.4 }}>
                  <div>Envase: <strong style={{ color: 'var(--text-main)' }}>{special && product.precioEnvase != null ? money(product.precioEnvase) : `General (${money(general.precioGeneral)})`}</strong></div>
                  <div>Pago: <strong style={{ color: 'var(--text-main)' }}>{product.medioPago === 'EFECTIVO' ? 'Solo efectivo' : product.medioPago === 'TODOS' ? 'Todo medio' : `General (${general.medioPago === 'EFECTIVO' ? 'efectivo' : 'todo medio'})`}</strong></div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <button className="btn" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => setConfigTarget({ ...product })}><Settings2 size={15} /> Especial</button>
                  <button className="btn btn-danger" style={{ fontSize: '0.8rem' }} disabled={saving} onClick={() => removeProduct(product)} title="Quitar de retornables"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: agregar productos (multiselección, foto, guardado en una operación) */}
      {pickerOpen && (
        <div className="modal-overlay" style={{ zIndex: 190 }} onMouseDown={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
          <div className="modal-content" style={{ width: 'min(1280px, 96vw)', maxWidth: 'none', height: 'min(90vh, 820px)', display: 'flex', flexDirection: 'column', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Agregar productos retornables</h3>
              <button className="btn" onClick={() => setPickerOpen(false)}><X size={17} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Search size={15} color="var(--text-muted)" />
              <input autoFocus className="input-field" style={{ flex: 1 }} placeholder="Buscar producto…" value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => setPickerCategory('all')} style={chip(pickerCategory === 'all')}>Todas</button>
              {categories.filter(c => c.activo).map(cat => (
                <button key={cat.idCategoriaProducto} type="button" onClick={() => setPickerCategory(cat.idCategoriaProducto)} style={chip(pickerCategory === cat.idCategoriaProducto)}>{cat.nombreCategoriaProducto}</button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>
              {pickerGroups.length === 0
                ? <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: 8 }}>No hay productos disponibles para agregar.</span>
                : pickerGroups.map(group => (
                  <div key={group.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0, whiteSpace: 'nowrap' }}>{group.name}</h4>
                      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                      {group.items.map(renderPickCard)}
                    </div>
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexShrink: 0, gap: 10 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{pickerSelected.size} seleccionado(s)</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={() => setPickerOpen(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={saving || pickerSelected.size === 0} onClick={confirmAddProducts}>
                  <Plus size={16} /> {saving ? 'Guardando…' : `Agregar ${pickerSelected.size || ''}`.trim()}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: configuración especial por artículo */}
      {configTarget && (
        <div className="modal-overlay" style={{ zIndex: 200 }} onMouseDown={e => { if (e.target === e.currentTarget) setConfigTarget(null); }}>
          <div className="modal-content" style={{ width: 'min(440px, 92vw)', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0 }}>Configuración especial</h3>
              <button className="btn" onClick={() => setConfigTarget(null)}><X size={16} /></button>
            </div>
            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{configTarget.nombreProducto}</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <label className="input-group">
                <span className="input-label">Precio especial del envase</span>
                <input className="input-field" type="number" min="0" placeholder={`General: ${money(general.precioGeneral)}`}
                  value={configTarget.precioEnvase ?? ''} onChange={e => setConfigTarget({ ...configTarget, precioEnvase: e.target.value })} />
              </label>
              <label className="input-group">
                <span className="input-label">Medio de pago especial</span>
                <select className="input-field" value={configTarget.medioPago || ''} onChange={e => setConfigTarget({ ...configTarget, medioPago: e.target.value })}>
                  <option value="">Usar configuración general</option>
                  <option value="EFECTIVO">Solo efectivo</option>
                  <option value="TODOS">Todo medio de pago</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn" disabled={saving} onClick={() => setConfigTarget({ ...configTarget, precioEnvase: '', medioPago: '' })} style={{ flex: 1 }}>Limpiar</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveSpecial} style={{ flex: 1 }}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const chip = (active) => ({
  padding: '7px 14px', borderRadius: 20, border: '1px solid #cbd5e1',
  background: active ? 'var(--primary-color)' : '#fff', color: active ? '#fff' : 'var(--text-main)',
  fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap'
});

export default ReturnablesSettings;
