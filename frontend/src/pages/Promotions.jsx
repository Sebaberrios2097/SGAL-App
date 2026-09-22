import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag, Plus, Save, Trash2, X, Power, ArrowLeft } from 'lucide-react';
import { notify } from '../components/NotificationCenter';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const money = (v) => `$${Number(v || 0).toLocaleString('es-CL')}`;
const toDateInput = (value) => value ? String(value).slice(0, 10) : '';

const emptyGroup = (esBase) => ({ esBase, nombre: esBase ? 'Incluye' : 'Elige', cantidadElegir: 1, productos: [] });
const emptyForm = () => ({
  idPromocion: null, nombre: '', precio: '', descripcion: '', fechaInicio: '', fechaFin: '', activo: true,
  grupos: [emptyGroup(true)]
});

const Promotions = ({ embedded = false }) => {
  const { can } = useAuth();
  useDocumentTitle(embedded ? 'Gestión de inventario' : 'Promociones');
  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const productOptions = useMemo(
    () => products.map(p => ({ value: p.idProducto, label: `${p.nombreProducto} (${money(p.precio)})` })),
    [products]);
  const productById = useMemo(() => Object.fromEntries(products.map(p => [p.idProducto, p])), [products]);

  const startNew = () => setForm(emptyForm());
  const startEdit = (promo) => setForm({
    idPromocion: promo.idPromocion, nombre: promo.nombre, precio: promo.precio,
    descripcion: promo.descripcion || '', fechaInicio: toDateInput(promo.fechaInicio),
    fechaFin: toDateInput(promo.fechaFin), activo: promo.activo,
    grupos: promo.grupos.map(g => ({
      esBase: g.esBase, nombre: g.nombre, cantidadElegir: g.cantidadElegir,
      productos: g.productos.map(gp => ({ idProducto: gp.idProducto, nombreProducto: gp.nombreProducto, precio: gp.precio, cantidad: gp.cantidad }))
    }))
  });

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const setGroup = (gi, patch) => setForm(f => ({ ...f, grupos: f.grupos.map((g, i) => i === gi ? { ...g, ...patch } : g) }));
  const addGroup = () => setForm(f => ({ ...f, grupos: [...f.grupos, emptyGroup(false)] }));
  const removeGroup = (gi) => setForm(f => ({ ...f, grupos: f.grupos.filter((_, i) => i !== gi) }));
  const addProductToGroup = (gi, idProducto) => {
    const prod = productById[idProducto];
    if (!prod) return;
    setForm(f => ({ ...f, grupos: f.grupos.map((g, i) => {
      if (i !== gi) return g;
      if (g.productos.some(p => p.idProducto === idProducto)) return g;
      return { ...g, productos: [...g.productos, { idProducto, nombreProducto: prod.nombreProducto, precio: prod.precio, cantidad: 1 }] };
    }) }));
  };
  const setProductCantidad = (gi, idProducto, cantidad) => setForm(f => ({ ...f, grupos: f.grupos.map((g, i) =>
    i === gi ? { ...g, productos: g.productos.map(p => p.idProducto === idProducto ? { ...p, cantidad } : p) } : g) }));
  const removeProduct = (gi, idProducto) => setForm(f => ({ ...f, grupos: f.grupos.map((g, i) =>
    i === gi ? { ...g, productos: g.productos.filter(p => p.idProducto !== idProducto) } : g) }));

  // Valor "individual" estimado: base (cantidad fija) + excluyentes (precio máx × cantidad a elegir).
  const valorIndividual = useMemo(() => {
    if (!form) return 0;
    return form.grupos.reduce((acc, g) => {
      if (g.esBase) return acc + g.productos.reduce((s, p) => s + p.precio * p.cantidad, 0);
      const maxPrecio = g.productos.reduce((m, p) => Math.max(m, p.precio), 0);
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
      setForm(null);
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
      {!form && (
        <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', maxWidth: 720, marginBottom: 18 }}>
          Combos con precio propio: un grupo base de productos fijos y grupos excluyentes donde se eligen
          opciones (p. ej. una bebida entre varias, o "2x" eligiendo dos variantes del mismo producto).
        </p>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : form ? (
        <div className="view-enter-forward">
            <div className="card" style={{ padding: 22, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button type="button" className="btn" onClick={() => setForm(null)} style={{ border: '1.5px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} /> Volver</button>
                <h3 style={{ margin: 0 }}>{form.idPromocion ? 'Editar promoción' : 'Nueva promoción'}</h3>
              </div>

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
                          {g.esBase && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>×
                              <input type="number" min={1} value={p.cantidad} onChange={e => setProductCantidad(gi, p.idProducto, e.target.value)}
                                style={{ width: 60, padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 6, textAlign: 'right' }} />
                            </label>
                          )}
                          <button type="button" onClick={() => removeProduct(gi, p.idProducto)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}><X size={15} /></button>
                        </div>
                      ))}
                      {g.productos.length === 0 && <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Agrega productos a este grupo.</span>}
                    </div>

                    <SearchableSelect
                      options={productOptions.filter(o => !g.productos.some(p => p.idProducto === o.value))}
                      value=""
                      onChange={(val) => val && addProductToGroup(gi, val)}
                      noOptionsMessage="Sin productos"
                      placeholder="Agregar producto al grupo…"
                    />
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
          {puedeCrear && (
            <button type="button" className="btn btn-primary" onClick={startNew} style={{ marginBottom: 16 }}><Plus size={17} /> Nueva promoción</button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {promos.map(promo => {
              const valInd = promo.grupos.reduce((acc, g) => {
                if (g.esBase) return acc + g.productos.reduce((s, p) => s + p.precio * p.cantidad, 0);
                const mx = g.productos.reduce((m, p) => Math.max(m, p.precio), 0);
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
                  {promo.descripcion && <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{promo.descripcion}</span>}
                  <span style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{promo.grupos.length} {promo.grupos.length === 1 ? 'grupo' : 'grupos'}</span>
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
    </div>
  );
};

export default Promotions;
