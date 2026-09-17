import { ArrowLeft, Check, ClipboardList, Coffee, Droplet, Plus, Save, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const RecipeManagement = () => {
  const params = useParams();
  const idProducto = params.idProducto;

  const [product, setProduct] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [selected, setSelected] = useState({});
  const [savedSelected, setSavedSelected] = useState({});
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectorMode, setSelectorMode] = useState('ingredients');
  const [optionBaseId, setOptionBaseId] = useState(null);
  const [editingBaseId, setEditingBaseId] = useState(null);
  const [draftMaterialIds, setDraftMaterialIds] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [materialSearch, setMaterialSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const applyRecipe = (receta) => {
      const initialSelection = Object.fromEntries((receta?.materiales || []).map(material => [material.idMateriaPrima, {
        cantidadRequerida: material.cantidadRequerida,
        idUnidadMedida: material.idUnidadMedida,
        idMateriaPrimaReemplazada: material.idMateriaPrimaReemplazada || '',
        recargo: material.recargo || 0,
        usaMismaMedidaQuePrincipal: material.usaMismaMedidaQuePrincipal || false
      }]));
      setSelected(initialSelection);
      setSavedSelected(initialSelection);
    };

    Promise.all([
      fetch(`/api/recipe/product/${idProducto}`).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje);
        return data;
      }),
      fetch('/api/inventory-configuration/raw-materials').then(response => response.json()),
      fetch('/api/inventory-configuration/units').then(response => response.json())
    ])
      .then(([recipeData, rawMaterials, unitCatalog]) => {
        setProduct(recipeData.producto);
        applyRecipe(recipeData.receta);
        document.title = `Receta de ${recipeData.producto.nombreProducto} - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
        setMaterials(rawMaterials);
        setUnits(unitCatalog || []);
      }).catch(err => setError(err.message || 'No fue posible cargar la receta.')).finally(() => setLoading(false));
  }, [idProducto]);

  const categories = useMemo(() => Array.from(new Set(
    materials.map(material => material.nombreCategoria || 'Sin categoría')
  )).sort((a, b) => a.localeCompare(b, 'es')), [materials]);

  // El café calibrable se expresa siempre en gramos; sus gramos reales salen de la calibración.
  const gramsUnit = useMemo(() => units.find(unit => (unit.abreviacion || '').trim().toLowerCase() === 'g'), [units]);

  // Valores por defecto de un material recién agregado; el café calibrable queda fijado a gramos.
  const defaultEntry = (idMateriaPrima, idMateriaPrimaReemplazada = '') => {
    const material = materials.find(item => item.idMateriaPrima === idMateriaPrima);
    const calibratable = Boolean(material?.esCafeCalibrable);
    return {
      cantidadRequerida: calibratable ? 18 : '',
      idUnidadMedida: calibratable ? (gramsUnit?.idUnidadMedida || material?.idUnidadMedida || '') : (material?.idUnidadMedida || ''),
      idMateriaPrimaReemplazada,
      // El recargo de una opción parte del recargo base de la materia (0 si no tiene).
      recargo: material?.recargoBase || 0,
      usaMismaMedidaQuePrincipal: false
    };
  };

  const baseMaterials = useMemo(() => materials.filter(material =>
    Object.prototype.hasOwnProperty.call(selected, material.idMateriaPrima)
    && !selected[material.idMateriaPrima].idMateriaPrimaReemplazada
  ), [materials, selected]);

  const groupedModalMaterials = useMemo(() => {
    const search = materialSearch.trim().toLowerCase();
    const visible = materials.filter(material => {
      const category = material.nombreCategoria || 'Sin categoría';
      const matchesCategory = categoryFilter === 'Todos' || category === categoryFilter;
      const matchesSearch = !search || `${material.nombreMaterial} ${material.nombreMarca} ${category}`.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });

    return visible.reduce((groups, material) => {
      const category = material.nombreCategoria || 'Sin categoría';
      if (!groups[category]) groups[category] = [];
      groups[category].push(material);
      return groups;
    }, {});
  }, [materials, categoryFilter, materialSearch]);

  const openMaterialSelector = () => {
    setSelectorMode('ingredients');
    setOptionBaseId(null);
    setDraftMaterialIds(Object.keys(selected)
      .filter(id => !selected[id].idMateriaPrimaReemplazada)
      .map(Number));
    setCategoryFilter('Todos');
    setMaterialSearch('');
    setShowMaterialModal(true);
  };

  const openOptionSelector = idMateriaPrimaBase => {
    setSelectorMode('options');
    setOptionBaseId(idMateriaPrimaBase);
    setDraftMaterialIds(Object.keys(selected)
      .filter(id => Number(selected[id].idMateriaPrimaReemplazada) === idMateriaPrimaBase)
      .map(Number));
    setCategoryFilter('Todos');
    setMaterialSearch('');
    setShowMaterialModal(true);
  };

  const toggleDraftMaterial = idMateriaPrima => {
    setDraftMaterialIds(current => current.includes(idMateriaPrima)
      ? current.filter(id => id !== idMateriaPrima)
      : [...current, idMateriaPrima]);
  };

  const applyMaterialSelection = () => {
    setSelected(current => {
      if (selectorMode === 'options' && optionBaseId) {
        const next = Object.fromEntries(Object.entries(current).filter(([, value]) =>
          Number(value.idMateriaPrimaReemplazada) !== optionBaseId
        ));
        draftMaterialIds.forEach(id => {
          next[id] = current[id] || defaultEntry(id, optionBaseId);
        });
        return next;
      }

      const next = {};
      draftMaterialIds.forEach(id => {
        next[id] = current[id] || defaultEntry(id, '');
      });
      Object.entries(current).forEach(([id, value]) => {
        if (value.idMateriaPrimaReemplazada && draftMaterialIds.includes(Number(value.idMateriaPrimaReemplazada))) {
          next[id] = value;
        }
      });
      return next;
    });
    setShowMaterialModal(false);
  };

  const removeMaterial = idMateriaPrima => {
    setSelected(current => {
      const next = { ...current };
      delete next[idMateriaPrima];
      Object.keys(next).forEach(otherId => {
        if (Number(next[otherId].idMateriaPrimaReemplazada) === idMateriaPrima) {
          delete next[otherId];
        }
      });
      return next;
    });
  };

  const comparableMaterial = (source, idMateriaPrima) => {
    const value = source[idMateriaPrima];
    if (!value) return null;
    const measure = value.usaMismaMedidaQuePrincipal && value.idMateriaPrimaReemplazada
      ? source[value.idMateriaPrimaReemplazada] || value
      : value;
    const optionIds = value.idMateriaPrimaReemplazada ? [] : Object.entries(source)
      .filter(([, candidate]) => Number(candidate.idMateriaPrimaReemplazada) === Number(idMateriaPrima))
      .map(([id]) => Number(id))
      .sort((a, b) => a - b);
    return {
      cantidadRequerida: Number(measure.cantidadRequerida),
      idUnidadMedida: Number(measure.idUnidadMedida),
      idMateriaPrimaReemplazada: Number(value.idMateriaPrimaReemplazada) || null,
      recargo: Number(value.recargo) || 0,
      usaMismaMedidaQuePrincipal: Boolean(value.usaMismaMedidaQuePrincipal),
      optionIds
    };
  };

  const isMaterialDirty = idMateriaPrima => JSON.stringify(comparableMaterial(selected, idMateriaPrima))
    !== JSON.stringify(comparableMaterial(savedSelected, idMateriaPrima));

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const materiales = Object.entries(selected).map(([idMateriaPrima, value]) => {
        const sameAsPrimary = Boolean(value.idMateriaPrimaReemplazada && value.usaMismaMedidaQuePrincipal);
        const measure = sameAsPrimary ? selected[value.idMateriaPrimaReemplazada] : value;
        return {
          idMateriaPrima: Number(idMateriaPrima),
          idUnidadMedida: Number(measure.idUnidadMedida),
          cantidadRequerida: Number(measure.cantidadRequerida),
          idMateriaPrimaReemplazada: value.idMateriaPrimaReemplazada ? Number(value.idMateriaPrimaReemplazada) : null,
          recargo: value.idMateriaPrimaReemplazada ? Number(value.recargo) || 0 : 0,
          usaMismaMedidaQuePrincipal: sameAsPrimary
        };
      });
      // Las materias que no se descuentan del inventario (p. ej. agua) llevan cantidad opcional.
      const noDescuentaIds = new Set(materials.filter(m => m.noDescuentaInventario).map(m => m.idMateriaPrima));
      if (materiales.some(material => !material.idUnidadMedida
        || (material.cantidadRequerida <= 0 && !noDescuentaIds.has(material.idMateriaPrima)))) {
        throw new Error('Ingrese una cantidad y unidad válidas para cada materia prima.');
      }

      const response = await fetch(`/api/recipe/product/${idProducto}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materiales })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible guardar la receta.');
      setSavedSelected(JSON.parse(JSON.stringify(selected)));
      setMessage(data.mensaje);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando receta…</div>;
  if (error && !product) return <div className="card" style={{ color: '#b91c1c' }}>{error}</div>;

  const optionBase = materials.find(material => material.idMateriaPrima === optionBaseId);
  const editingBase = materials.find(material => material.idMateriaPrima === editingBaseId);
  const editingOptions = editingBaseId
    ? materials.filter(material => Number(selected[material.idMateriaPrima]?.idMateriaPrimaReemplazada) === editingBaseId)
    : [];

  const saveDisabled = saving || baseMaterials.length === 0;

  // ¿La receta usa materias especiales? Determina qué entradas mostrar en la leyenda de íconos.
  const selectedMaterialObjs = materials.filter(m => selected[m.idMateriaPrima]);
  const hasCalibratable = selectedMaterialObjs.some(m => m.esCafeCalibrable);
  const hasNoDescuenta = selectedMaterialObjs.some(m => m.noDescuentaInventario && !m.esCafeCalibrable);

  return (
    <div className="animate-fade-in">
      <Link to="/inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary-color)', fontWeight: 700, textDecoration: 'none', marginBottom: '18px' }}>
        <ArrowLeft size={16} /> Volver a productos
      </Link>

      <div className="page-header">
        <div>
          <h2 className="page-title"><ClipboardList size={25} /> Receta de {product?.nombreProducto || ''}</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button className="btn btn-secondary" type="button" onClick={openMaterialSelector}>
            <Plus size={16} /> Seleccionar ingredientes
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saveDisabled}>
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '16px' }}>{error}</div>}
      {message && <div className="card" style={{ color: '#15803d', marginBottom: '16px' }}>{message}</div>}

      {baseMaterials.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <ClipboardList size={34} color="var(--text-muted)" style={{ opacity: 0.55, marginBottom: '10px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>La receta no tiene ingredientes</h3>
          <button className="btn btn-primary" type="button" onClick={openMaterialSelector}>
            <Plus size={16} /> Seleccionar ingredientes
          </button>
        </div>
      ) : (
        <>
          {(hasCalibratable || hasNoDescuenta) && (
            <div className="recipe-legend">
              <span className="recipe-legend-title">Referencias:</span>
              {hasCalibratable && (
                <span className="recipe-legend-item tooltip-wide" data-tooltip="Cantidad según calibración.">
                  <Coffee size={14} color="#b45309" /> Café calibrable
                </span>
              )}
              {hasNoDescuenta && (
                <span className="recipe-legend-item tooltip-wide" data-tooltip="Sin descuento de inventario.">
                  <Droplet size={14} color="#0284c7" /> No descuenta inventario
                </span>
              )}
            </div>
          )}
          <div className="recipe-material-grid">
          {baseMaterials.map(material => {
            const recipeValue = selected[material.idMateriaPrima];
            const options = materials.filter(option => Number(selected[option.idMateriaPrima]?.idMateriaPrimaReemplazada) === material.idMateriaPrima);
            const dirty = isMaterialDirty(material.idMateriaPrima) || options.some(option => isMaterialDirty(option.idMateriaPrima));
            const compatibleUnits = units.filter(unit => unit.tipoMagnitud === material.tipoMagnitud);
            const selectedUnit = units.find(unit => unit.idUnidadMedida === Number(recipeValue.idUnidadMedida));
            const calibratable = Boolean(material.esCafeCalibrable);
            const noDescuenta = Boolean(material.noDescuentaInventario);
            const unitOptions = calibratable ? units.filter(unit => (unit.abreviacion || '').trim().toLowerCase() === 'g') : compatibleUnits;
            return (
              <div key={material.idMateriaPrima} className={`card recipe-material-card${dirty ? ' is-dirty' : ''}`}>
                <div className="recipe-material-head">
                  <span className="recipe-material-title">
                    <strong className="recipe-material-name">{material.nombreMaterial}</strong>
                    {calibratable && (
                      <span className="recipe-mat-tag tooltip-wide" data-tooltip="Cantidad según calibración." aria-label="Café calibrable">
                        <Coffee size={15} color="#b45309" />
                      </span>
                    )}
                    {noDescuenta && !calibratable && (
                      <span className="recipe-mat-tag tooltip-wide" data-tooltip="Sin descuento de inventario." aria-label="No descuenta inventario">
                        <Droplet size={15} color="#0284c7" />
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => removeMaterial(material.idMateriaPrima)} aria-label={`Quitar ${material.nombreMaterial}`} title="Quitar de la receta" className="recipe-remove-button">
                    <X size={14} />
                  </button>
                </div>
                {dirty && <span className="recipe-dirty-badge">Cambios sin guardar</span>}
                <div className="recipe-base-measure">
                  <label className="input-group" style={{ margin: 0 }}>
                    <span className="input-label">{calibratable ? 'Gramos' : 'Cantidad'}{(calibratable || noDescuenta) ? ' (Ref.)' : ''}</span>
                    <input className="input-field" type="number" min={selectedUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} step={selectedUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} value={recipeValue.cantidadRequerida} onChange={event => setSelected(current => ({ ...current, [material.idMateriaPrima]: { ...current[material.idMateriaPrima], cantidadRequerida: event.target.value } }))} />
                  </label>
                  <label className="input-group" style={{ margin: 0 }}>
                    <span className="input-label">Unidad</span>
                    <select className="input-field" disabled={calibratable} value={recipeValue.idUnidadMedida} onChange={event => setSelected(current => ({ ...current, [material.idMateriaPrima]: { ...current[material.idMateriaPrima], idUnidadMedida: event.target.value } }))}>
                      {unitOptions.map(unit => <option key={unit.idUnidadMedida} value={unit.idUnidadMedida}>{unit.abreviacion}</option>)}
                    </select>
                  </label>
                </div>

                {options.length > 0 && (
                  <div className="recipe-option-names">
                    <span className="recipe-option-names-label">Materias adicionales</span>
                    <p>{options.map(option => option.nombreMaterial).join(', ')}</p>
                  </div>
                )}

                <div className="recipe-material-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingBaseId(material.idMateriaPrima)}>
                    Ajustar opciones
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}

      {editingBase && (
        <div className="modal-overlay" style={{ zIndex: 1080 }}>
          <div className="modal-content" style={{ maxWidth: '760px', width: 'calc(100% - 32px)', maxHeight: '88vh', padding: '26px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: '0 0 5px', fontSize: '1.25rem', overflowWrap: 'anywhere' }}>Ajustar opciones</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem', overflowWrap: 'anywhere' }}>{editingBase.nombreMaterial}</p>
              </div>
              <button type="button" onClick={() => setEditingBaseId(null)} aria-label="Cerrar configuración" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'grid', placeItems: 'center' }}><X size={21} /></button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => openOptionSelector(editingBase.idMateriaPrima)}>
                <Plus size={15} /> Agregar opción
              </button>
            </div>

            <div className="recipe-options-modal-list">
              {editingOptions.length === 0 ? (
                <div className="recipe-options-empty">Esta materia todavía no tiene opciones adicionales.</div>
              ) : editingOptions.map(option => {
                const optionValue = selected[option.idMateriaPrima];
                const usesSameMeasure = optionValue.usaMismaMedidaQuePrincipal;
                const optionMeasure = usesSameMeasure ? selected[editingBase.idMateriaPrima] : optionValue;
                const optionUnits = units.filter(unit => unit.tipoMagnitud === option.tipoMagnitud);
                const selectedOptionUnit = units.find(unit => unit.idUnidadMedida === Number(optionMeasure.idUnidadMedida));
                // El recargo solo se edita si la materia tiene recargo base y es modificable.
                const recargoBase = option.recargoBase || 0;
                const recargoEditable = recargoBase > 0 && option.recargoModificable;
                const recargoValor = recargoEditable ? optionValue.recargo : recargoBase;
                return (
                  <section key={option.idMateriaPrima} className={`recipe-option-editor${isMaterialDirty(option.idMateriaPrima) ? ' is-dirty' : ''}`}>
                    <div className="recipe-option-editor-heading">
                      <strong>{option.nombreMaterial}</strong>
                      <button type="button" onClick={() => removeMaterial(option.idMateriaPrima)} aria-label={`Quitar ${option.nombreMaterial}`} title="Quitar opción" className="recipe-remove-button"><X size={13} /></button>
                    </div>
                    <label className="recipe-same-measure">
                      <input type="checkbox" checked={usesSameMeasure} onChange={event => setSelected(current => ({ ...current, [option.idMateriaPrima]: { ...current[option.idMateriaPrima], usaMismaMedidaQuePrincipal: event.target.checked } }))} />
                      Misma cantidad y unidad que la materia base
                    </label>
                    <div className="recipe-option-fields">
                      <label className="input-group" style={{ margin: 0 }}>
                        <span className="input-label">Cantidad</span>
                        <input className="input-field" type="number" min={selectedOptionUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} step={selectedOptionUnit?.tipoMagnitud === 'Unidad' ? '1' : '0.001'} disabled={usesSameMeasure} value={optionMeasure.cantidadRequerida} onChange={event => setSelected(current => ({ ...current, [option.idMateriaPrima]: { ...current[option.idMateriaPrima], cantidadRequerida: event.target.value } }))} />
                      </label>
                      <label className="input-group" style={{ margin: 0 }}>
                        <span className="input-label">Unidad</span>
                        <select className="input-field" disabled={usesSameMeasure} value={optionMeasure.idUnidadMedida} onChange={event => setSelected(current => ({ ...current, [option.idMateriaPrima]: { ...current[option.idMateriaPrima], idUnidadMedida: event.target.value } }))}>
                          {optionUnits.map(unit => <option key={unit.idUnidadMedida} value={unit.idUnidadMedida}>{unit.abreviacion}</option>)}
                        </select>
                      </label>
                      <label className="input-group" style={{ margin: 0 }}>
                        <span className="input-label">Recargo CLP {recargoEditable ? '' : '(fijo)'}</span>
                        <input className="input-field" type="number" min="0" step="1" disabled={!recargoEditable} value={recargoValor}
                          title={recargoBase === 0 ? 'Esta materia no tiene recargo base.' : recargoEditable ? 'Recargo base editable para esta receta.' : 'Recargo base fijo de la materia.'}
                          onChange={event => setSelected(current => ({ ...current, [option.idMateriaPrima]: { ...current[option.idMateriaPrima], recargo: event.target.value } }))} />
                      </label>
                    </div>
                  </section>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--panel-border)', paddingTop: '14px', marginTop: '18px' }}>
              <button type="button" className="btn btn-primary" onClick={() => setEditingBaseId(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}

      {showMaterialModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '760px', width: 'calc(100% - 32px)', maxHeight: '88vh', padding: '26px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                  {selectorMode === 'options' ? `Opciones para ${optionBase?.nombreMaterial || 'el ingrediente'}` : 'Seleccionar ingredientes'}
                </h3>
              </div>
              <button type="button" onClick={() => setShowMaterialModal(false)} aria-label="Cerrar selector de ingredientes" style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'grid', placeItems: 'center' }}>
                <X size={21} />
              </button>
            </div>

            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <Search size={17} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input-field" style={{ paddingLeft: '39px' }} value={materialSearch} onChange={event => setMaterialSearch(event.target.value)} placeholder="Buscar ingrediente, marca o categoría…" autoFocus />
            </div>

            <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '4px' }}>
              {['Todos', ...categories].map(category => {
                const active = categoryFilter === category;
                return (
                  <button key={category} type="button" onClick={() => setCategoryFilter(category)} style={{ border: `1px solid ${active ? 'var(--primary-color)' : 'var(--panel-border)'}`, background: active ? 'var(--primary-color)' : '#fff', color: active ? '#fff' : 'var(--text-main)', borderRadius: '999px', padding: '7px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {category}
                  </button>
                );
              })}
            </div>

            <div style={{ overflowY: 'auto', paddingRight: '4px', flex: 1 }}>
              {Object.keys(groupedModalMaterials).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px', fontSize: '0.875rem' }}>No se encontraron ingredientes con los filtros seleccionados.</div>
              ) : Object.entries(groupedModalMaterials)
                .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB, 'es'))
                .map(([category, categoryMaterials]) => (
                <section key={category} style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', margin: '0 0 8px' }}>{category}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: '8px' }}>
                    {categoryMaterials.map(material => {
                      const active = draftMaterialIds.includes(material.idMateriaPrima);
                      const currentRecipeValue = selected[material.idMateriaPrima];
                      const isCurrentOption = Number(currentRecipeValue?.idMateriaPrimaReemplazada) === optionBaseId;
                      const unavailable = selectorMode === 'options'
                        ? material.idMateriaPrima === optionBaseId || Boolean(currentRecipeValue && !isCurrentOption)
                        : Boolean(currentRecipeValue?.idMateriaPrimaReemplazada);
                      return (
                        <label key={material.idMateriaPrima} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px', borderRadius: '9px', cursor: unavailable ? 'not-allowed' : 'pointer', opacity: unavailable ? 0.55 : 1, border: `1.5px solid ${active ? 'var(--primary-color)' : 'var(--panel-border)'}`, background: active ? '#f0fdf4' : '#fff' }}>
                          <input type="checkbox" checked={active} disabled={unavailable} onChange={() => toggleDraftMaterial(material.idMateriaPrima)} />
                          <span style={{ minWidth: 0 }}>
                            <strong style={{ display: 'block', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.nombreMaterial}</strong>
                            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                              {unavailable
                                ? (material.idMateriaPrima === optionBaseId ? 'Ingrediente principal' : 'Ya utilizado en la receta')
                                : material.nombreMarca}
                            </span>
                          </span>
                          {active && <Check size={16} color="var(--primary-color)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                        </label>
                      );
                    })}
                  </div>
                </section>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {selectorMode === 'options'
                  ? `${draftMaterialIds.length} ${draftMaterialIds.length === 1 ? 'opción seleccionada' : 'opciones seleccionadas'}`
                  : `${draftMaterialIds.length} ${draftMaterialIds.length === 1 ? 'ingrediente seleccionado' : 'ingredientes seleccionados'}`}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMaterialModal(false)}>Cancelar</button>
                <button type="button" className="btn btn-primary" onClick={applyMaterialSelection}>Guardar selección</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeManagement;
