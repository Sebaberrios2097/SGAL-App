import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag, Plus, Save, Trash2, X, Power, ArrowLeft, CircleHelp, Search, PackagePlus, Check } from 'lucide-react';
import { notify } from '../components/NotificationCenter';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const money = (v) => `$${Number(v || 0).toLocaleString('es-CL')}`;
const toDateInput = (value) => value ? String(value).slice(0, 10) : '';
const displayDate = (value) => value ? new Date(value).toLocaleDateString('es-CL') : null;
const optionGroupLabel = group => group.nombre?.trim().toLocaleLowerCase('es') === 'elige'
  ? `Elige ${group.cantidadElegir}`
  : `${group.nombre} · elige ${group.cantidadElegir}`;

const emptyGroup = (esBase) => ({ esBase, nombre: esBase ? 'Incluye' : 'Elige', cantidadElegir: 1, productos: [] });
const emptyForm = () => ({
  idPromocion: null, nombre: '', precio: '', descripcion: '', fechaInicio: '', fechaFin: '', activo: true,
  grupos: [emptyGroup(true)]
});

const Promotions = ({ embedded = false, createNew = false, onFormOpenChange }) => {
  const { can } = useAuth();
  useDocumentTitle(embedded ? 'Gestión de inventario' : 'Promociones');
  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pickerGroupIndex, setPickerGroupIndex] = useState(null);
  const [pickerSelections, setPickerSelections] = useState({});
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState('all');

  const puedeCrear = can('ventas.promociones.crear');
  const puedeEditar = can('ventas.promociones.editar');
  const puedeEstado = can('ventas.promociones.estado.modificar');
  const puedeEliminar = can('ventas.promociones.eliminar');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, prodRes] = await Promise.all([fetch('/api/promotion'), fetch('/api/product')]);
      if (!pRes.ok) throw new Error('No fue posible cargar las promociones.');
      setPromos(await pRes.json());
      setProducts(prodRes.ok ? (await prodRes.json()).filter(p => p.activo) : []);
    } catch (err) { notify.error(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productCategories = useMemo(() => {
    const unique = new Map();
    products.forEach(product => {
      if (product.idCategoriaProducto != null) unique.set(String(product.idCategoriaProducto), product.nombreCategoriaProducto || 'Sin categoría');
    });
    return [...unique.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [products]);

  const filteredPickerProducts = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase();
    return products.filter(product => {
      const matchesCategory = pickerCategory === 'all' || String(product.idCategoriaProducto) === pickerCategory;
      const searchable = `${product.nombreProducto} ${product.codigoProducto || ''} ${product.nombreCategoriaProducto || ''}`.toLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
    });
  }, [products, pickerCategory, pickerSearch]);

  const startNew = () => {
    setForm(emptyForm());
    onFormOpenChange?.(true);
  };
  const closeForm = () => {
    setForm(null);
    onFormOpenChange?.(false);
  };
  const startEdit = (promo) => {
    setForm({
      idPromocion: promo.idPromocion, nombre: promo.nombre, precio: promo.precio,
      descripcion: promo.descripcion || '', fechaInicio: toDateInput(promo.fechaInicio),
      fechaFin: toDateInput(promo.fechaFin), activo: promo.activo,
      grupos: promo.grupos.map(g => ({
        esBase: g.esBase, nombre: g.nombre, cantidadElegir: g.cantidadElegir,
        productos: g.productos.map(gp => ({ idProducto: gp.idProducto, nombreProducto: gp.nombreProducto, precio: gp.precio, cantidad: gp.cantidad }))
      }))
    });
    onFormOpenChange?.(true);
  };

  useEffect(() => {
    if (createNew && !form) setForm(emptyForm());
  }, [createNew, form]);

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const setGroup = (gi, patch) => setForm(f => ({ ...f, grupos: f.grupos.map((g, i) => i === gi ? { ...g, ...patch } : g) }));
  const addGroup = () => setForm(f => ({ ...f, grupos: [...f.grupos, emptyGroup(false)] }));
  const removeGroup = (gi) => setForm(f => ({ ...f, grupos: f.grupos.filter((_, i) => i !== gi) }));
  const setProductCantidad = (gi, idProducto, cantidad) => setForm(f => ({ ...f, grupos: f.grupos.map((g, i) =>
    i === gi ? { ...g, productos: g.productos.map(p => p.idProducto === idProducto ? { ...p, cantidad } : p) } : g) }));
  const removeProduct = (gi, idProducto) => setForm(f => ({ ...f, grupos: f.grupos.map((g, i) =>
    i === gi ? { ...g, productos: g.productos.filter(p => p.idProducto !== idProducto) } : g) }));

  const openProductPicker = (groupIndex) => {
    setPickerGroupIndex(groupIndex);
    setPickerSelections({});
    setPickerSearch('');
    setPickerCategory('all');
  };

  const closeProductPicker = () => {
    setPickerGroupIndex(null);
    setPickerSelections({});
  };

  const togglePickerProduct = (product) => {
    setPickerSelections(current => {
      if (current[product.idProducto]) {
        const next = { ...current };
        delete next[product.idProducto];
        return next;
      }
      return { ...current, [product.idProducto]: { product, cantidad: 1 } };
    });
  };

  const setPickerQuantity = (idProducto, cantidad) => {
    setPickerSelections(current => ({
      ...current,
      [idProducto]: { ...current[idProducto], cantidad: Math.max(1, parseInt(cantidad) || 1) }
    }));
  };

  const confirmPickerProducts = () => {
    const selectedProducts = Object.values(pickerSelections);
    if (pickerGroupIndex == null || selectedProducts.length === 0) return;

    const duplicatedNames = selectedProducts
      .filter(({ product }) => form.grupos.some((group, index) => index !== pickerGroupIndex && group.productos.some(item => item.idProducto === product.idProducto)))
      .map(({ product }) => product.nombreProducto);
    if (duplicatedNames.length > 0) {
      notify.info(`${duplicatedNames.join(', ')} ${duplicatedNames.length === 1 ? 'también está' : 'también están'} en otro grupo. Se agregarán igualmente.`);
    }

    setForm(current => ({
      ...current,
      grupos: current.grupos.map((group, index) => {
        if (index !== pickerGroupIndex) return group;
        const additions = selectedProducts.map(({ product, cantidad }) => ({
          idProducto: product.idProducto,
          nombreProducto: product.nombreProducto,
          precio: product.precio,
          cantidad
        }));
        const additionById = new Map(additions.map(item => [item.idProducto, item]));
        const existing = group.productos.map(item => additionById.get(item.idProducto) || item);
        const existingIds = new Set(group.productos.map(item => item.idProducto));
        return { ...group, productos: [...existing, ...additions.filter(item => !existingIds.has(item.idProducto))] };
      })
    }));
    closeProductPicker();
  };

  // Valor "individual" estimado: base (cantidad fija) + excluyentes (precio máx × cantidad a elegir).
  const valorIndividual = useMemo(() => {
    if (!form) return 0;
    return form.grupos.reduce((acc, g) => {
      if (g.esBase) return acc + g.productos.reduce((s, p) => s + p.precio * p.cantidad, 0);
      const maxPrecio = g.productos.reduce((m, p) => Math.max(m, p.precio * p.cantidad), 0);
      return acc + maxPrecio * (parseInt(g.cantidadElegir) || 1);
    }, 0);
  }, [form]);

  const save = async () => {
    if (!form || saving) return;
    if (!form.nombre.trim()) { notify.error('El nombre es obligatorio.'); return; }
    if (!(parseInt(form.precio) > 0)) { notify.error('El precio debe ser mayor a cero.'); return; }
    if (form.grupos.some(g => g.productos.length === 0)) { notify.error('Cada grupo debe tener al menos un producto.'); return; }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre, precio: parseInt(form.precio), descripcion: form.descripcion || null,
        fechaInicio: form.fechaInicio || null, fechaFin: form.fechaFin || null, activo: form.activo,
        grupos: form.grupos.map((g, i) => ({
          esBase: g.esBase, nombre: g.nombre, cantidadElegir: g.esBase ? 1 : (parseInt(g.cantidadElegir) || 1), orden: i,
          productos: g.productos.map(p => ({ idProducto: p.idProducto, cantidad: parseInt(p.cantidad) || 1 }))
        }))
      };
      const res = await fetch(form.idPromocion ? `/api/promotion/${form.idPromocion}` : '/api/promotion', {
        method: form.idPromocion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.mensaje || 'No fue posible guardar la promoción.'); }
      notify.success('Promoción guardada.');
      closeForm();
      await load();
    } catch (err) { notify.error(err.message); } finally { setSaving(false); }
  };

  const toggleStatus = async (promo) => {
    try {
      const res = await fetch(`/api/promotion/${promo.idPromocion}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !promo.activo })
      });
      if (!res.ok) throw new Error('No fue posible cambiar el estado.');
      await load();
    } catch (err) { notify.error(err.message); }
  };

  const remove = async (promo) => {
    if (!confirm(`¿Eliminar la promoción "${promo.nombre}"?`)) return;
    try {
      const res = await fetch(`/api/promotion/${promo.idPromocion}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No fue posible eliminar la promoción.');
      notify.success('Promoción eliminada.');
      await load();
    } catch (err) { notify.error(err.message); }
  };

  return (
    <div className={embedded ? '' : 'animate-fade-in'}>
      {!embedded && (
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 className="page-title">Promociones</h2>
          <Tag color="var(--primary-color)" />
        </div>
      )}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : form ? (
        <div className="view-enter-forward">
            <div className="card" style={{ padding: 22, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button type="button" className="btn" onClick={closeForm} style={{ border: '1.5px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} /> Volver</button>
                <h3 style={{ margin: 0 }}>{form.idPromocion ? 'Editar promoción' : 'Nueva promoción'}</h3>
              </div>

              {!form.idPromocion && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', marginBottom: 18, border: '1px solid rgba(212, 163, 115, 0.35)', borderRadius: 12, background: 'rgba(212, 163, 115, 0.08)', color: 'var(--text-main)' }}>
                  <CircleHelp size={20} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '.84rem', lineHeight: 1.5 }}>
                    <strong style={{ fontSize: '.9rem' }}>¿Cómo crear una promoción?</strong>
                    <span>Define el nombre, el precio promocional y su vigencia. En el <strong>grupo base</strong> agrega los productos que siempre incluye el combo y sus cantidades.</span>
                    <span>Si el cliente puede elegir, agrega un <strong>grupo excluyente</strong>, incorpora las alternativas disponibles e indica cuántas debe seleccionar.</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
                <div className="input-group"><label className="input-label">Nombre *</label><input className="input-field" maxLength={150} value={form.nombre} onChange={e => setField('nombre', e.target.value)} /></div>
                <div className="input-group"><label className="input-label">Precio (CLP) *</label><input className="input-field" type="number" min={1} value={form.precio} onChange={e => setField('precio', e.target.value)} /></div>
                <div className="input-group"><label className="input-label">Vigencia desde</label><input className="input-field" type="date" value={form.fechaInicio} onChange={e => setField('fechaInicio', e.target.value)} /></div>
                <div className="input-group"><label className="input-label">Vigencia hasta</label><input className="input-field" type="date" value={form.fechaFin} onChange={e => setField('fechaFin', e.target.value)} /></div>
                <div className="input-group" style={{ gridColumn: '1 / -1' }}><label className="input-label">Descripción (opcional)</label><input className="input-field" maxLength={300} value={form.descripcion} onChange={e => setField('descripcion', e.target.value)} /></div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem', marginBottom: 16 }}>
                <input type="checkbox" checked={form.activo} onChange={e => setField('activo', e.target.checked)} /> Activa
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {form.grupos.map((g, gi) => (
                  <div key={gi} style={{ border: '1.5px solid var(--panel-border)', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                      <select value={g.esBase ? 'base' : 'excl'} onChange={e => setGroup(gi, { esBase: e.target.value === 'base' })}
                        style={{ padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontWeight: 700 }}>
                        <option value="base">Grupo base (fijo)</option>
                        <option value="excl">Grupo excluyente (a elegir)</option>
                      </select>
                      <input className="input-field" style={{ flex: 1, minWidth: 160 }} placeholder="Nombre del grupo" value={g.nombre} onChange={e => setGroup(gi, { nombre: e.target.value })} />
                      {!g.esBase && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem' }}>
                          Elegir:
                          <input className="input-field" type="number" min={1} style={{ width: 70 }} value={g.cantidadElegir} onChange={e => setGroup(gi, { cantidadElegir: e.target.value })} />
                        </label>
                      )}
                      {form.grupos.length > 1 && (
                        <button type="button" className="btn btn-danger" style={{ padding: 8 }} onClick={() => removeGroup(gi)}><Trash2 size={15} /></button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {g.productos.map(p => (
                        <div key={p.idProducto} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem' }}>
                          <span style={{ flex: 1 }}>{p.nombreProducto} <span style={{ color: 'var(--text-muted)' }}>({money(p.precio)})</span></span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>×
                            <input type="number" min={1} value={p.cantidad} onChange={e => setProductCantidad(gi, p.idProducto, e.target.value)}
                              style={{ width: 60, padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right' }} />
                          </label>
                          <button type="button" onClick={() => removeProduct(gi, p.idProducto)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><X size={15} /></button>
                        </div>
                      ))}
                      {g.productos.length === 0 && <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Agrega productos a este grupo.</span>}
                    </div>

                    <button type="button" className="btn btn-secondary" onClick={() => openProductPicker(gi)} style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}>
                      <PackagePlus size={16} /> Añadir productos
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className="btn" onClick={addGroup} style={{ marginTop: 12, border: '1.5px dashed var(--primary-color)', color: 'var(--primary-color)' }}>
                <Plus size={16} /> Agregar grupo excluyente
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, flexWrap: 'wrap', gap: 12 }}>
                <span style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
                  Valor individual estimado: <strong>{money(valorIndividual)}</strong>
                  {parseInt(form.precio) > 0 && valorIndividual > parseInt(form.precio) &&
                    <> · Descuento: <strong style={{ color: '#15803d' }}>{money(valorIndividual - parseInt(form.precio))}</strong></>}
                </span>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={save}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar promoción'}</button>
              </div>
            </div>
        </div>
      ) : (
        <div className="view-enter-back">
          {!embedded && puedeCrear && (
            <button type="button" className="btn btn-primary" onClick={startNew} style={{ marginBottom: 16 }}><Plus size={17} /> Nueva promoción</button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {promos.map(promo => {
              const valInd = promo.grupos.reduce((acc, g) => {
                if (g.esBase) return acc + g.productos.reduce((s, p) => s + p.precio * p.cantidad, 0);
                const mx = g.productos.reduce((m, p) => Math.max(m, p.precio * p.cantidad), 0);
                return acc + mx * g.cantidadElegir;
              }, 0);
              return (
                <div key={promo.idPromocion} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, opacity: promo.activo ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1.02rem' }}>{promo.nombre}</strong>
                    <span className={`badge ${promo.activo ? 'badge-success' : ''}`} style={{ fontSize: '.7rem' }}>{promo.activo ? 'Activa' : 'Inactiva'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary-color)' }}>{money(promo.precio)}</span>
                    {valInd > promo.precio && <span style={{ fontSize: '.78rem', color: '#15803d' }}>ahorra {money(valInd - promo.precio)}</span>}
                  </div>
                  {promo.descripcion && <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{promo.descripcion}</span>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    <span className="badge" style={{ textTransform: 'none' }}>{promo.grupos.length} {promo.grupos.length === 1 ? 'grupo' : 'grupos'}</span>
                    <span className="badge" style={{ textTransform: 'none' }}>
                      {promo.fechaInicio || promo.fechaFin
                        ? `${displayDate(promo.fechaInicio) || 'Sin inicio'} — ${displayDate(promo.fechaFin) || 'Sin término'}`
                        : 'Sin vigencia definida'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 0', borderTop: '1px solid var(--panel-border)', borderBottom: '1px solid var(--panel-border)' }}>
                    {promo.grupos.map(group => (
                      <div key={group.idGrupo} style={{ fontSize: '.78rem', lineHeight: 1.4 }}>
                        <strong>{group.esBase ? 'Incluye' : optionGroupLabel(group)}</strong>
                        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                          {group.productos.map(product => `${product.cantidad > 1 ? `${product.cantidad}× ` : ''}${product.nombreProducto}`).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {puedeEditar && <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => startEdit(promo)}>Editar</button>}
                    {puedeEstado && <button type="button" className="btn" title={promo.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleStatus(promo)} style={{ border: '1.5px solid var(--panel-border)' }}><Power size={15} /></button>}
                    {puedeEliminar && <button type="button" className="btn btn-danger" onClick={() => remove(promo)}><Trash2 size={15} /></button>}
                  </div>
                </div>
              );
            })}
            {promos.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay promociones.</div>}
          </div>
        </div>
      )}

      {pickerGroupIndex != null && form && (
        <div className="modal-overlay" style={{ zIndex: 1300 }}>
          <div className="modal-content promotion-product-picker">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0 }}>Añadir productos</h3>
                <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                  Grupo: <strong>{form.grupos[pickerGroupIndex]?.nombre}</strong>
                </p>
              </div>
              <button type="button" onClick={closeProductPicker} aria-label="Cerrar" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 4 }}><X size={21} /></button>
            </div>

            <div className="promotion-product-picker__layout">
              <section className="promotion-product-picker__catalog">
                <div style={{ position: 'relative' }}>
                  <Search size={17} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input className="input-field" value={pickerSearch} onChange={event => setPickerSearch(event.target.value)} placeholder="Buscar por nombre, SKU o categoría…" style={{ paddingLeft: 38 }} autoFocus />
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {[{ value: 'all', label: 'Todas' }, ...productCategories].map(category => (
                    <button key={category.value} type="button" onClick={() => setPickerCategory(category.value)}
                      className={`btn ${pickerCategory === category.value ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '6px 10px', fontSize: '.76rem', borderRadius: 999 }}>
                      {category.label}
                    </button>
                  ))}
                </div>

                <div className="promotion-product-picker__grid">
                  {filteredPickerProducts.map(product => {
                    const selection = pickerSelections[product.idProducto];
                    return (
                      <div key={product.idProducto} role="button" tabIndex={0} onClick={() => togglePickerProduct(product)}
                        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') togglePickerProduct(product); }}
                        className={`promotion-product-option${selection ? ' is-selected' : ''}`}>
                        <div className="promotion-product-option__image">
                          {product.imagenBase64
                            ? <img src={`data:image/png;base64,${product.imagenBase64}`} alt="" />
                            : <Tag size={20} color="var(--text-muted)" />}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ display: 'block', fontSize: '.86rem' }}>{product.nombreProducto}</strong>
                          <small style={{ color: 'var(--text-muted)' }}>{product.nombreCategoriaProducto || 'Sin categoría'} · {money(product.precio)}</small>
                        </div>
                        <span className="promotion-product-option__check">{selection && <Check size={14} />}</span>
                      </div>
                    );
                  })}
                  {filteredPickerProducts.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No se encontraron productos.</div>}
                </div>
              </section>

              <aside className="promotion-product-picker__summary">
                <div>
                  <strong>Productos por agregar</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: 3 }}>{Object.keys(pickerSelections).length} seleccionados</div>
                </div>
                <div className="promotion-product-picker__summary-list">
                  {Object.values(pickerSelections).map(({ product, cantidad }) => (
                    <div key={product.idProducto} style={{ padding: '10px 0', borderBottom: '1px solid var(--panel-border)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <strong style={{ flex: 1, fontSize: '.82rem' }}>{product.nombreProducto}</strong>
                        <button type="button" onClick={() => togglePickerProduct(product)} aria-label={`Quitar ${product.nombreProducto}`} style={{ border: 0, background: 'none', color: '#dc2626', cursor: 'pointer', padding: 0 }}><X size={15} /></button>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: '.76rem', color: 'var(--text-muted)' }}>
                        Cantidad
                        <input type="number" min={1} value={cantidad} onChange={event => setPickerQuantity(product.idProducto, event.target.value)}
                          style={{ width: 68, padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 7, textAlign: 'right' }} />
                      </label>
                    </div>
                  ))}
                  {Object.keys(pickerSelections).length === 0 && <div style={{ padding: '28px 6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>Selecciona uno o más productos del catálogo.</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button type="button" className="btn btn-primary" disabled={Object.keys(pickerSelections).length === 0} onClick={confirmPickerProducts} style={{ width: '100%', justifyContent: 'center' }}>
                    Agregar productos al grupo
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeProductPicker} style={{ width: '100%', justifyContent: 'center' }}>Cancelar</button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Promotions;
