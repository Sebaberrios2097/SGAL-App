import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Gift, Minus, Plus, X } from 'lucide-react';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const optionGroupLabel = group => group.nombre?.trim().toLocaleLowerCase('es') === 'elige'
  ? `Elige ${group.cantidadElegir}`
  : `${group.nombre} · elige ${group.cantidadElegir}`;

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
    return sum + Number(product?.precio || 0) * Number(product?.cantidad || 1) * Number(selection.cantidad || 1);
  }, 0);
  return base + choices;
};

export const PromotionSelector = ({ promotions = [], onAdd, compact = false }) => {
  const active = useMemo(() => promotions.filter(isCurrent), [promotions]);
  const [selected, setSelected] = useState(null);
  const [choices, setChoices] = useState({});
  const [currentStep, setCurrentStep] = useState(0);

  const selectPromotion = promo => {
    const hasOptions = (promo.grupos || []).some(group => !group.esBase);
    if (hasOptions) {
      setSelected(promo);
      return;
    }

    onAdd({
      promotion: promo,
      quantity: 1,
      selections: [],
      individualAmount: promotionIndividualAmount(promo)
    });
  };

  useEffect(() => {
    if (!selected) return;
    setChoices({});
    setCurrentStep(0);
  }, [selected]);

  const optionGroups = selected ? (selected.grupos || []).filter(group => !group.esBase) : [];
  const selections = Object.entries(choices).flatMap(([idGrupo, products]) =>
    Object.entries(products).filter(([, cantidad]) => cantidad > 0).map(([idProducto, cantidad]) => ({
      idGrupo: Number(idGrupo), idProducto: Number(idProducto), cantidad
    })));
  const individual = selected ? promotionIndividualAmount(selected, selections) : 0;
  const currentGroup = optionGroups[currentStep];
  const isSummaryStep = Boolean(selected) && currentStep === optionGroups.length;

  const selectedCount = group => Object.values(choices[group.idGrupo] || {}).reduce((sum, quantity) => sum + quantity, 0);
  const groupIsComplete = group => selectedCount(group) === Number(group.cantidadElegir || 1);

  const updateChoice = (group, product, delta) => {
    setChoices(current => {
      const groupChoices = current[group.idGrupo] || {};
      const currentQuantity = groupChoices[product.idProducto] || 0;
      const total = Object.values(groupChoices).reduce((sum, quantity) => sum + quantity, 0);
      if (delta > 0 && total >= group.cantidadElegir) return current;

      const nextQuantity = Math.max(0, currentQuantity + delta);
      const nextGroup = group.cantidadElegir === 1 && delta > 0
        ? { [product.idProducto]: 1 }
        : { ...groupChoices, [product.idProducto]: nextQuantity };
      if (nextQuantity === 0) delete nextGroup[product.idProducto];
      return { ...current, [group.idGrupo]: nextGroup };
    });
  };

  const closeSelector = () => {
    setSelected(null);
    setChoices({});
    setCurrentStep(0);
  };

  return (
    <>
      {active.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>No hay promociones vigentes.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {active.map(promo => (
            <button key={promo.idPromocion} type="button" onClick={() => selectPromotion(promo)}
              style={{ padding: 16, borderRadius: 12, border: '1px solid var(--panel-border)', background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
              <Gift size={20} color="var(--primary-color)" />
              <strong style={{ display: 'block', marginTop: 8 }}>{promo.nombre}</strong>
              {promo.descripcion && <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 4 }}>{promo.descripcion}</small>}
              <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.4 }}>
                {(promo.grupos || []).filter(group => group.esBase).flatMap(group => group.productos || [])
                  .map(product => `${product.cantidad}× ${product.nombreProducto}`).join(' · ') || 'Sin productos fijos'}
              </small>
              {(promo.grupos || []).filter(group => !group.esBase).map(group => {
                const options = group.productos || [];
                const remaining = Math.max(0, options.length - 2);
                return (
                  <span key={group.idGrupo} style={{ display: 'block', marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--panel-border)', fontSize: '.7rem', lineHeight: 1.4 }}>
                    <strong style={{ display: 'block', color: 'var(--text-main)' }}>{optionGroupLabel(group)}</strong>
                    {options.slice(0, 2).map(option => <span key={option.idProducto} style={{ display: 'block', color: 'var(--text-muted)' }}>{option.nombreProducto}</span>)}
                    {remaining > 0 && <span style={{ display: 'block', color: 'var(--primary-color)', fontWeight: 700 }}>+{remaining} {remaining === 1 ? 'producto' : 'productos'}</span>}
                  </span>
                );
              })}
              <span style={{ display: 'block', color: 'var(--primary-color)', fontWeight: 800, marginTop: 8 }}>{money(promo.precio)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ width: 'min(860px, calc(100vw - 32px))', maxWidth: 860, maxHeight: '90vh', padding: 26, overflowY: 'auto' }}>
            <button type="button" onClick={closeSelector} aria-label="Cerrar"
              style={{ position: 'absolute', right: 16, top: 16, border: 0, background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            <h3 style={{ margin: '0 32px 4px 0' }}>{selected.nombre}</h3>
            <div style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{money(selected.precio)}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '20px 0', overflowX: 'auto', paddingBottom: 3 }}>
              {[...optionGroups.map(group => group.nombre), 'Resumen'].map((label, index) => {
                const complete = index < optionGroups.length && groupIsComplete(optionGroups[index]);
                const activeStep = currentStep === index;
                return (
                  <div key={`${label}-${index}`} style={{ display: 'flex', alignItems: 'center', flex: index < optionGroups.length ? '1 0 auto' : '0 0 auto' }}>
                    <button type="button" onClick={() => setCurrentStep(index)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, border: 0, background: 'none', padding: 0, cursor: 'pointer', color: activeStep ? 'var(--primary-color)' : complete ? '#15803d' : 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: `2px solid ${activeStep ? 'var(--primary-color)' : complete ? '#16a34a' : '#cbd5e1'}`, background: complete && !activeStep ? '#dcfce7' : '#fff', fontSize: '.75rem' }}>
                        {complete && !activeStep ? <Check size={14} /> : index + 1}
                      </span>
                      <span style={{ fontSize: '.78rem' }}>{label}</span>
                    </button>
                    {index < optionGroups.length && <span style={{ height: 2, minWidth: 28, flex: 1, margin: '0 8px', background: complete ? '#86efac' : '#e2e8f0' }} />}
                  </div>
                );
              })}
            </div>

            {!isSummaryStep && currentGroup && (
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{currentGroup.nombre}</h4>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Selecciona {currentGroup.cantidadElegir} {currentGroup.cantidadElegir === 1 ? 'opción' : 'opciones'}</span>
                  </div>
                  <span className="badge" style={{ textTransform: 'none' }}>{selectedCount(currentGroup)} / {currentGroup.cantidadElegir}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                  {(currentGroup.productos || []).map(option => {
                    const quantity = choices[currentGroup.idGrupo]?.[option.idProducto] || 0;
                    return (
                      <button key={option.idProducto} type="button" onClick={() => updateChoice(currentGroup, option, quantity > 0 && currentGroup.cantidadElegir === 1 ? -1 : 1)}
                        style={{ minHeight: 112, padding: 14, borderRadius: 12, border: `2px solid ${quantity > 0 ? 'var(--primary-color)' : 'var(--panel-border)'}`, background: quantity > 0 ? 'rgba(var(--primary-rgb), .07)' : '#fff', textAlign: 'left', cursor: 'pointer', position: 'relative' }}>
                        {quantity > 0 && <span style={{ position: 'absolute', right: 10, top: 10, width: 23, height: 23, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-color)', color: '#fff', fontSize: '.74rem', fontWeight: 800 }}>{quantity}</span>}
                        <strong style={{ display: 'block', paddingRight: 26 }}>{option.nombreProducto}</strong>
                        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.76rem', marginTop: 5 }}>{option.cantidad > 1 ? `${option.cantidad} unidades · ` : ''}{money(option.precio * (option.cantidad || 1))}</span>
                        {currentGroup.cantidadElegir > 1 && quantity > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                            <span onClick={event => { event.stopPropagation(); updateChoice(currentGroup, option, -1); }} style={{ width: 27, height: 27, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid var(--panel-border)', background: '#fff' }}><Minus size={14} /></span>
                            <span style={{ fontWeight: 800 }}>{quantity}</span>
                            <span onClick={event => { event.stopPropagation(); updateChoice(currentGroup, option, 1); }} style={{ width: 27, height: 27, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid var(--panel-border)', background: '#fff' }}><Plus size={14} /></span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {isSummaryStep && (
              <section>
                <h4 style={{ margin: '0 0 12px' }}>Resumen de la promoción</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(selected.grupos || []).filter(group => group.esBase).map(group => (
                    <div key={group.idGrupo} style={{ padding: 12, border: '1px solid var(--panel-border)', borderRadius: 10 }}>
                      <strong style={{ fontSize: '.83rem' }}>Incluye</strong>
                      <div style={{ marginTop: 5, color: 'var(--text-muted)', fontSize: '.8rem' }}>{group.productos.map(product => `${product.cantidad}× ${product.nombreProducto}`).join(' · ')}</div>
                    </div>
                  ))}
                  {optionGroups.map(group => (
                    <div key={group.idGrupo} style={{ padding: 12, border: '1px solid var(--panel-border)', borderRadius: 10 }}>
                      <strong style={{ fontSize: '.83rem' }}>{group.nombre}</strong>
                      <div style={{ marginTop: 5, color: 'var(--text-muted)', fontSize: '.8rem' }}>
                        {Object.entries(choices[group.idGrupo] || {}).filter(([, quantity]) => quantity > 0).map(([idProducto, quantity]) => {
                          const product = group.productos.find(option => option.idProducto === Number(idProducto));
                          return `${quantity}× ${product?.nombreProducto || 'Producto'}`;
                        }).join(' · ') || 'Sin selección'}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: 14, marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Valor individual</span><span>{money(individual)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 800, marginTop: 4 }}><span>Precio promoción</span><span>{money(selected.precio)}</span></div>
                  {individual > selected.precio && <div style={{ textAlign: 'right', color: '#b45309', fontSize: '.8rem' }}>Ahorro: {money(individual - selected.precio)}</div>}
                </div>
              </section>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 22 }}>
              <button type="button" className="btn btn-secondary" disabled={currentStep === 0} onClick={() => setCurrentStep(step => Math.max(0, step - 1))}>
                <ChevronLeft size={16} /> Anterior
              </button>
              {!isSummaryStep ? (
                <button type="button" className="btn btn-primary" disabled={!currentGroup || !groupIsComplete(currentGroup)} onClick={() => setCurrentStep(step => step + 1)}>
                  Siguiente <ChevronRight size={16} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={optionGroups.some(group => !groupIsComplete(group))} onClick={() => {
                  onAdd({ promotion: selected, quantity: 1, selections, individualAmount: individual });
                  closeSelector();
                }}>Agregar promoción</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PromotionSelector;
