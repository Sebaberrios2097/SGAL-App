import { useEffect, useMemo, useState } from 'react';
import { Gift, X } from 'lucide-react';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;

const isCurrent = promo => {
  const now = new Date();
  return promo.activo
    && (!promo.fechaInicio || new Date(promo.fechaInicio) <= now)
    && (!promo.fechaFin || new Date(promo.fechaFin) >= now);
};

const promotionIndividualAmount = (promo, selections = []) => {
  const base = (promo.grupos || []).filter(g => g.esBase)
    .flatMap(g => g.productos || [])
    .reduce((sum, p) => sum + Number(p.precio || 0) * Number(p.cantidad || 1), 0);
  const choices = selections.reduce((sum, selection) => {
    const group = (promo.grupos || []).find(g => g.idGrupo === selection.idGrupo);
    const product = group?.productos?.find(p => p.idProducto === selection.idProducto);
    return sum + Number(product?.precio || 0);
  }, 0);
  return base + choices;
};

export const PromotionSelector = ({ promotions = [], onAdd, compact = false }) => {
  const active = useMemo(() => promotions.filter(isCurrent), [promotions]);
  const [selected, setSelected] = useState(null);
  const [choices, setChoices] = useState({});

  useEffect(() => {
    if (!selected) return;
    const defaults = {};
    (selected.grupos || []).filter(g => !g.esBase).forEach(group => {
      defaults[group.idGrupo] = Array.from({ length: group.cantidadElegir }, () => group.productos?.[0]?.idProducto || '');
    });
    setChoices(defaults);
  }, [selected]);

  const selections = selected ? Object.entries(choices).flatMap(([idGrupo, ids]) =>
    ids.map(idProducto => ({ idGrupo: Number(idGrupo), idProducto: Number(idProducto), cantidad: 1 }))) : [];
  const individual = selected ? promotionIndividualAmount(selected, selections) : 0;

  return (
    <>
      {active.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>No hay promociones vigentes.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {active.map(promo => (
            <button key={promo.idPromocion} type="button" onClick={() => setSelected(promo)}
              style={{ padding: 16, borderRadius: 12, border: '1px solid var(--panel-border)', background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
              <Gift size={20} color="var(--primary-color)" />
              <strong style={{ display: 'block', marginTop: 8 }}>{promo.nombre}</strong>
              {promo.descripcion && <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 4 }}>{promo.descripcion}</small>}
              <span style={{ display: 'block', color: 'var(--primary-color)', fontWeight: 800, marginTop: 8 }}>{money(promo.precio)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: 520, padding: 26 }}>
            <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar"
              style={{ position: 'absolute', right: 16, top: 16, border: 0, background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            <h3 style={{ margin: '0 32px 4px 0' }}>{selected.nombre}</h3>
            <div style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginBottom: 18 }}>
              {(selected.grupos || []).filter(g => g.esBase).flatMap(g => g.productos || [])
                .map(p => `${p.cantidad}× ${p.nombreProducto}`).join(' · ')}
            </div>
            {(selected.grupos || []).filter(g => !g.esBase).map(group => (
              <fieldset key={group.idGrupo} style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
                <legend style={{ fontWeight: 800, marginBottom: 8 }}>{group.nombre} · elige {group.cantidadElegir}</legend>
                {Array.from({ length: group.cantidadElegir }, (_, index) => (
                  <select key={index} value={choices[group.idGrupo]?.[index] || ''}
                    onChange={e => setChoices(current => ({ ...current, [group.idGrupo]: current[group.idGrupo].map((value, i) => i === index ? Number(e.target.value) : value) }))}
                    style={{ width: '100%', padding: 9, marginBottom: 7, borderRadius: 7, border: '1px solid #cbd5e1' }}>
                    {(group.productos || []).map(option => <option key={option.idProducto} value={option.idProducto}>{option.nombreProducto}</option>)}
                  </select>
                ))}
              </fieldset>
            ))}
            <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Valor individual</span><span>{money(individual)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 800, marginTop: 4 }}><span>Precio promoción</span><span>{money(selected.precio)}</span></div>
              {individual > selected.precio && <div style={{ textAlign: 'right', color: '#b45309', fontSize: '.8rem' }}>Ahorras {money(individual - selected.precio)}</div>}
            </div>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 18 }} onClick={() => {
              onAdd({ promotion: selected, quantity: 1, selections, individualAmount: individual });
              setSelected(null);
            }}>Agregar promoción</button>
          </div>
        </div>
      )}
    </>
  );
};

export default PromotionSelector;
