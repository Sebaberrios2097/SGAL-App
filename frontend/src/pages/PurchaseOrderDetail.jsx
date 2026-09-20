import { ArrowLeft, Check, ClipboardCheck, Download, FileSpreadsheet, LoaderCircle, Pencil, Plus, Save, Search, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { downloadFile } from '../utils/downloadFile';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const itemKey = item => `${item.tipoItem}:${item.idItem}`;
const itemTypeLabel = item => item.tipoItem === 'Producto' ? 'Producto' : 'Materia prima';
const PurchaseItemIdentity = ({ item, showFormat = true }) => <><strong>{item.nombre}</strong><span className="purchase-item-meta">{item.codigo} · {itemTypeLabel(item)}{showFormat && item.formato ? ` · ${item.formato}: ${item.contenidoFormato} ${item.unidadContenido}` : ` · ${item.unidad}`}</span></>;
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDate(new Date());
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDate(date);
};

const PurchaseOrderDetail = () => {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const { isModuleEnabled } = useOrganization();
  const materialsEnabled = isModuleEnabled('recetas');
  const [catalogs, setCatalogs] = useState({ proveedores: [], productos: [], materiasPrimas: [] });
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ idProveedor: '', fechaLlegadaEsperada: tomorrow(), observaciones: '', items: [] });
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [formatTarget, setFormatTarget] = useState(null);
  const [formatForm, setFormatForm] = useState({ nombreFormato: '', cantidadContenido: '' });
  const [priceSelection, setPriceSelection] = useState([]);
  const [itemFilter, setItemFilter] = useState('Todos');
  const [itemSearch, setItemSearch] = useState('');
  const [editingSalePriceKey, setEditingSalePriceKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadOrder = async (orderId, catalogSource = catalogs) => {
    const response = await fetch(`/api/purchase-orders/${orderId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar la orden.');
    setOrder(data);
    setForm({
      idProveedor: data.idProveedor,
      fechaLlegadaEsperada: data.fechaLlegadaEsperada.slice(0, 10),
      observaciones: data.observaciones || '',
      items: data.items.map(item => ({
        tipoItem: item.tipoItem,
        idItem: item.idItem,
        codigo: item.codigo,
        nombre: item.nombre,
        unidad: item.unidad,
        stock: item.stockActual,
        precioVenta: item.precioVentaAnterior ?? item.precioVentaActual,
        idFormatoCompra: item.idFormatoCompra,
        purchaseMode: item.idFormatoCompra ? 'format' : 'direct',
        formato: item.formato,
        formatos: catalogSource[item.tipoItem === 'Producto' ? 'productos' : 'materiasPrimas']?.find(catalogItem => catalogItem.idItem === item.idItem)?.formatos || [],
        contenidoFormato: item.contenidoFormato,
        unidadContenido: item.unidadContenido,
        cantidad: item.cantidadSolicitada,
        precioUnitario: item.precioUnitario,
        nuevoPrecioVenta: item.nuevoPrecioVenta ?? ''
      }))
    });
    document.title = `Orden de compra #${data.idOrdenCompra} - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    return data;
  };

  useEffect(() => {
    fetch('/api/purchase-orders/catalogs').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar los catálogos.');
      return data;
    })
      .then(async catalogData => {
        setCatalogs(catalogData);
        if (isNew) document.title = `Nueva orden de compra - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
        else await loadOrder(id, catalogData);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const availableItems = useMemo(
    () => materialsEnabled ? [...catalogs.productos, ...catalogs.materiasPrimas] : catalogs.productos,
    [catalogs, materialsEnabled]);
  const filteredItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    return availableItems.filter(item => {
      const typeMatches = itemFilter === 'Todos' || item.tipoItem === itemFilter;
      const searchMatches = !search || `${item.codigo} ${item.nombre} ${item.unidad}`.toLowerCase().includes(search);
      return typeMatches && searchMatches;
    });
  }, [availableItems, itemFilter, itemSearch]);
  // A draft is editable only when the current user owns the matching action.
  // View-only users still see its data, but never receive editable controls.
  const isDraft = (isNew || order?.estado === 'Borrador')
    && can(isNew ? 'ordenes_compra.crear' : 'ordenes_compra.editar');
  const isIssued = order?.estado === 'Emitida';
  const hasReception = order && ['Completada', 'Recibida parcialmente'].includes(order.estado);
  const totalEstimated = form.items.reduce((total, item) => total + Number(item.cantidad || 0) * Number(item.precioUnitario || 0), 0);
  const pendingPrices = order?.items.filter(item => item.nuevoPrecioVenta && !item.precioConfirmado) || [];

  const clearFeedback = () => { setError(''); setMessage(''); };

  const request = async (url, options = {}) => {
    clearFeedback();
    setSaving(true);
    try {
      const response = await fetch(url, {
        ...options,
        headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers
      });
      const body = await response.text();
      const data = body ? JSON.parse(body) : {};
      if (!response.ok) {
        const fallback = response.status === 403
          ? 'No tiene permisos de administrador para completar esta operación.'
          : 'No fue posible completar la operación.';
        throw new Error(data.mensaje || fallback);
      }
      return data;
    } finally {
      setSaving(false);
    }
  };

  const addItem = item => {
    setForm(current => current.items.some(existing => itemKey(existing) === itemKey(item)) ? current : {
      ...current,
      items: [...current.items, { ...item, purchaseMode: 'direct', idFormatoCompra: '', formato: 'Unidad de inventario', contenidoFormato: 1, unidadContenido: item.unidad, cantidad: 1, precioUnitario: '', nuevoPrecioVenta: '' }]
    });
  };

  const selectFormat = (key, formatId) => setForm(current => ({
    ...current,
    items: current.items.map(item => {
      if (itemKey(item) !== key) return item;
      const format = item.formatos.find(candidate => candidate.idFormatoCompra === Number(formatId));
      return { ...item, purchaseMode: 'format', idFormatoCompra: formatId, formato: format?.nombreFormato || '', contenidoFormato: format?.cantidadContenido || '', unidadContenido: format?.unidadContenido || item.unidad };
    })
  }));

  const setPurchaseMode = (key, mode) => setForm(current => ({
    ...current,
    items: current.items.map(item => {
      if (itemKey(item) !== key) return item;
      if (mode === 'direct') return { ...item, purchaseMode: 'direct', idFormatoCompra: '', formato: 'Unidad de inventario', contenidoFormato: 1, unidadContenido: item.unidad };
      const format = item.formatos?.[0];
      return { ...item, purchaseMode: 'format', idFormatoCompra: format?.idFormatoCompra || '', formato: format?.nombreFormato || '', contenidoFormato: format?.cantidadContenido || '', unidadContenido: format?.unidadContenido || item.unidad };
    })
  }));

  const createFormat = async () => {
    if (!formatTarget) return;
    try {
      const created = await request('/api/purchase-orders/purchase-formats', {
        method: 'POST',
        body: JSON.stringify({ tipoItem: formatTarget.tipoItem, idItem: formatTarget.idItem, nombreFormato: formatForm.nombreFormato, cantidadContenido: Number(formatForm.cantidadContenido) })
      });
      const newFormat = { ...created, unidadContenido: formatTarget.unidad };
      setCatalogs(current => {
        const key = formatTarget.tipoItem === 'Producto' ? 'productos' : 'materiasPrimas';
        return { ...current, [key]: current[key].map(item => item.idItem === formatTarget.idItem ? { ...item, formatos: [...item.formatos, newFormat] } : item) };
      });
      setForm(current => ({ ...current, items: current.items.map(item => itemKey(item) === itemKey(formatTarget) ? { ...item, formatos: [...(item.formatos || []), newFormat], purchaseMode: 'format', idFormatoCompra: created.idFormatoCompra, formato: created.nombreFormato, contenidoFormato: created.cantidadContenido, unidadContenido: formatTarget.unidad } : item) }));
      setFormatTarget(null);
      setFormatForm({ nombreFormato: '', cantidadContenido: '' });
    } catch (err) { setError(err.message); }
  };

  const updateItem = (key, field, value) => setForm(current => ({
    ...current,
    items: current.items.map(item => itemKey(item) === key ? { ...item, [field]: value } : item)
  }));

  const removeItem = key => setForm(current => ({
    ...current,
    items: current.items.filter(item => itemKey(item) !== key)
  }));

  const saveDraft = async () => {
    try {
      const payload = {
        idUsuario: user.idUsuario,
        idProveedor: Number(form.idProveedor),
        fechaLlegadaPedido: form.fechaLlegadaEsperada,
        observaciones: form.observaciones,
        items: form.items.map(item => ({
          tipoItem: item.tipoItem,
          idItem: item.idItem,
          idFormatoCompra: Number(item.idFormatoCompra),
          cantidad: Number(item.cantidad),
          precioUnitario: Number(item.precioUnitario),
          nuevoPrecioVenta: item.nuevoPrecioVenta === '' ? null : Number(item.nuevoPrecioVenta)
        }))
      };
      const data = await request(isNew ? '/api/purchase-orders' : `/api/purchase-orders/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(payload)
      });
      if (isNew) navigate(`/purchase-orders/${data.idOrdenCompra}`, { replace: true });
      else {
        await loadOrder(id);
        setMessage(data.mensaje);
      }
    } catch (err) { setError(err.message); }
  };

  const runAction = async (action, confirmation) => {
    if (confirmation && !window.confirm(confirmation)) return;
    try {
      const data = await request(`/api/purchase-orders/${id}/${action}`, { method: 'POST', body: JSON.stringify({ idUsuario: user.idUsuario }) });
      await loadOrder(id);
      setMessage(data.mensaje);
    } catch (err) { setError(err.message); }
  };

  const openPriceConfirmation = () => {
    setPriceSelection(pendingPrices.map(item => item.idOrdenDetalle));
    setShowPriceModal(true);
  };

  const confirmPrices = async () => {
    try {
      const data = await request(`/api/purchase-orders/${id}/confirm-prices`, {
        method: 'POST',
        body: JSON.stringify({ idUsuario: user.idUsuario, idsOrdenDetalle: priceSelection })
      });
      setShowPriceModal(false);
      await loadOrder(id);
      setMessage(data.mensaje);
    } catch (err) { setError(err.message); }
  };

  const downloadExcel = async () => {
    setError('');
    setDownloadingExcel(true);
    try {
      await downloadFile(`/api/purchase-orders/${id}/excel`, `orden-compra-${id}.xlsx`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingExcel(false);
    }
  };

  if (loading) return <div className="card" style={{ textAlign: 'center' }}>Cargando orden de compra…</div>;

  return (
    <div className="animate-fade-in">
      <Link to="/purchase-orders" className="purchase-back-link"><ArrowLeft size={16} /> Volver a órdenes</Link>
      <div className="page-header">
        <div>
          <h2 className="page-title"><ClipboardCheck size={25} /> {isNew ? 'Nueva orden de compra' : `Orden de compra #${order?.idOrdenCompra}`}</h2>
          {!isNew && <div style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 3 }}>{order?.proveedor} · {order?.estado}</div>}
        </div>
        {!isNew && can('ordenes_compra.exportar') && <div className="purchase-header-actions"><a className="btn btn-secondary" href={`/api/purchase-orders/${id}/pdf`}><Download size={15} /> PDF</a><button type="button" className="btn btn-secondary" disabled={downloadingExcel} onClick={downloadExcel}>{downloadingExcel ? <LoaderCircle className="purchase-download-spinner" size={15} /> : <FileSpreadsheet size={15} />} {downloadingExcel ? 'Generando…' : 'Excel'}</button></div>}
      </div>

      {error && <div className="card purchase-feedback is-error">{error}</div>}
      {message && <div className="card purchase-feedback is-success">{message}</div>}

      <div className="card purchase-order-form">
        <div className="purchase-form-grid">
          <label className="input-group"><span className="input-label">Proveedor</span><select className="input-field" value={form.idProveedor} disabled={!isDraft} onChange={event => setForm(current => ({ ...current, idProveedor: event.target.value }))}><option value="">Seleccione un proveedor</option>{catalogs.proveedores.map(provider => <option key={provider.idProveedor} value={provider.idProveedor}>{provider.nombreProveedor}</option>)}</select></label>
          <label className="input-group"><span className="input-label">Llegada esperada</span><input className="input-field" type="date" min={today()} disabled={!isDraft} value={form.fechaLlegadaEsperada} onChange={event => setForm(current => ({ ...current, fechaLlegadaEsperada: event.target.value }))} /></label>
        </div>

        <div className="purchase-section-heading"><div><h3>Artículos</h3><span>{form.items.length} agregado{form.items.length === 1 ? '' : 's'}</span></div>{isDraft && can(isNew ? 'ordenes_compra.crear' : 'ordenes_compra.editar') && <button type="button" className="btn btn-secondary" onClick={() => { setItemFilter('Todos'); setItemSearch(''); setShowItemModal(true); }}><Plus size={15} /> Agregar artículos</button>}</div>

        {form.items.length === 0 ? (
          <div className="purchase-empty">{materialsEnabled ? 'Agregue los productos y materias primas que se comprarán.' : 'Agregue los productos que se comprarán.'}</div>
        ) : (
          <div className="table-scroll-wrapper">
            <table className="custom-table purchase-items-table purchase-order-edit-table">
              <thead><tr><th>Artículo</th><th>Forma de compra</th><th>Cantidad</th><th>Costo unitario</th><th>Subtotal</th><th>Precio de venta</th>{isDraft && <th />}</tr></thead>
              <tbody>{form.items.map(item => {
                const key = itemKey(item);
                return <tr key={key}>
                  <td><PurchaseItemIdentity item={item} showFormat={false} /><span className="purchase-row-stock">Stock: {item.stock} {item.unidadContenido}</span></td>
                  <td className="purchase-buy-cell">
                    {isDraft ? <><div className="purchase-buy-mode"><button type="button" className={item.purchaseMode === 'direct' ? 'is-active' : ''} onClick={() => setPurchaseMode(key, 'direct')}>Directa</button><button type="button" className={item.purchaseMode === 'format' ? 'is-active' : ''} onClick={() => setPurchaseMode(key, 'format')}>Por formato</button></div>{item.purchaseMode === 'format' ? <div className="purchase-format-control"><select className="input-field" value={item.idFormatoCompra} onChange={event => selectFormat(key, event.target.value)}><option value="">Seleccione formato</option>{item.formatos.map(format => <option key={format.idFormatoCompra} value={format.idFormatoCompra}>{format.nombreFormato} · {format.cantidadContenido} {format.unidadContenido}</option>)}</select><button type="button" className="btn btn-secondary table-icon-button" title="Nuevo formato" onClick={() => { setFormatTarget(item); setFormatForm({ nombreFormato: '', cantidadContenido: '' }); }}><Plus size={15} /></button></div> : <div className="purchase-direct-mode">Por {item.unidad}</div>}</> : <strong>{item.formato} · {item.contenidoFormato} {item.unidadContenido}</strong>}
                  </td>
                  <td>{isDraft ? <input className="input-field purchase-number-input" type="number" min={item.purchaseMode === 'direct' && item.tipoItem === 'MateriaPrima' ? '0.001' : '1'} step={item.purchaseMode === 'direct' && item.tipoItem === 'MateriaPrima' ? '0.001' : '1'} value={item.cantidad} onChange={event => updateItem(key, 'cantidad', event.target.value)} /> : `${item.cantidad} ${item.formato}`}</td>
                  <td>{isDraft ? <div className="purchase-cost-input"><span>$</span><input className="input-field purchase-number-input" type="number" min="0" step="1" value={item.precioUnitario} onChange={event => updateItem(key, 'precioUnitario', event.target.value)} /></div> : money(item.precioUnitario)}</td>
                  <td><strong className="purchase-row-subtotal">{money(Number(item.cantidad || 0) * Number(item.precioUnitario || 0))}</strong></td>
                  <td>{item.tipoItem === 'Producto' ? <div className="purchase-price-cell"><span className="purchase-current-price"><span className="purchase-price-value"><small>Actual</small><strong>{money(item.precioVenta)}</strong></span>{isDraft && editingSalePriceKey !== key && <button type="button" className="btn btn-secondary purchase-change-price-button" aria-label="Cambiar precio" data-tooltip="Cambiar precio" onClick={() => setEditingSalePriceKey(key)}><Pencil size={13} /></button>}</span>{item.nuevoPrecioVenta !== '' && item.nuevoPrecioVenta !== null && item.nuevoPrecioVenta !== undefined && <span className="purchase-new-price"><span className="badge badge-success">Nuevo</span><strong>{money(item.nuevoPrecioVenta)}</strong></span>}{isDraft && editingSalePriceKey === key && <div className="purchase-price-editor"><input className="input-field purchase-number-input" type="number" min="1" step="1" placeholder="Nuevo precio" value={item.nuevoPrecioVenta} onChange={event => updateItem(key, 'nuevoPrecioVenta', event.target.value)} autoFocus /><button type="button" className="btn btn-primary purchase-price-action" aria-label="Aceptar nuevo precio" data-tooltip="Aceptar" onClick={() => setEditingSalePriceKey(null)}><Check size={14} /></button><button type="button" className="btn btn-secondary purchase-price-action" aria-label="Descartar cambio de precio" data-tooltip="Descartar cambio" onClick={() => { updateItem(key, 'nuevoPrecioVenta', ''); setEditingSalePriceKey(null); }}><X size={14} /></button></div>}</div> : <span className="purchase-not-applicable">No aplica</span>}</td>
                  {isDraft && <td><button type="button" className="recipe-remove-button" aria-label={`Quitar ${item.nombre}`} onClick={() => removeItem(key)}><Trash2 size={14} /></button></td>}
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}

        <div className="purchase-total-row"><span>Total estimado</span><strong>{money(totalEstimated)}</strong></div>
        <label className="input-group purchase-observations purchase-order-observations"><span className="input-label">Observaciones</span><textarea className="input-field" rows="3" maxLength="500" disabled={!isDraft} value={form.observaciones} onChange={event => setForm(current => ({ ...current, observaciones: event.target.value }))} /></label>
        {isDraft && <div className="purchase-footer-actions">{can(isNew ? 'ordenes_compra.crear' : 'ordenes_compra.editar') && <button type="button" className="btn btn-primary" disabled={saving} onClick={saveDraft}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar borrador'}</button>}{!isNew && can('ordenes_compra.emitir') && <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => runAction('issue', '¿Emitir esta orden? Después ya no se podrán modificar sus artículos.')}><Send size={15} /> Emitir orden</button>}</div>}
      </div>

      {isIssued && can('ordenes_compra.cancelar') && <div className="purchase-footer-actions"><button type="button" className="btn btn-danger" disabled={saving} onClick={() => runAction('cancel', '¿Cancelar esta orden de compra?')}><X size={15} /> Cancelar orden</button></div>}

      {hasReception && <div className="card purchase-reception-card"><div className="purchase-section-heading"><div><h3>Resultado de la recepción</h3><span>{order.estado}</span></div>{pendingPrices.length > 0 && can('ordenes_compra.precios.confirmar') && <button type="button" className="btn btn-primary" onClick={openPriceConfirmation}><Check size={15} /> Confirmar precios ({pendingPrices.length})</button>}</div><div className="table-scroll-wrapper"><table className="custom-table"><thead><tr><th>Artículo</th><th>Solicitado</th><th>Recibido</th><th>Estado</th><th>Costo unitario real</th><th>Subtotal real</th><th>Cambio de precio</th></tr></thead><tbody>{order.items.map(item => <tr key={item.idOrdenDetalle}><td><PurchaseItemIdentity item={item} /></td><td>{item.cantidadSolicitada} {item.unidad}</td><td>{item.cantidadRecibida} {item.unidad}</td><td><span className={`badge ${item.estadoRecepcion === 'Recibido' ? 'badge-success' : item.estadoRecepcion === 'No recibido' ? 'badge-danger' : 'purchase-status-partial'}`}>{item.estadoRecepcion}</span></td><td>{money(item.precioUnitarioReal)}</td><td>{money(item.subtotalReal)}</td><td>{item.nuevoPrecioVenta ? <span>{money(item.precioVentaAnterior)} → {money(item.nuevoPrecioVenta)} · {item.precioConfirmado ? 'Confirmado' : 'Pendiente'}</span> : 'Sin cambio'}</td></tr>)}</tbody></table></div><div className="purchase-total-row"><span>Gasto real registrado</span><strong>{money(order.totalReal)}</strong></div></div>}

      {showItemModal && <div className="modal-overlay"><div className="modal-content purchase-selector-modal"><div className="purchase-modal-heading"><div><h3>Agregar artículos</h3><p>{materialsEnabled ? 'Productos terminados y materias primas disponibles.' : 'Productos terminados disponibles.'}</p></div><button type="button" className="purchase-modal-close" onClick={() => setShowItemModal(false)} aria-label="Cerrar"><X size={21} /></button></div><div className="purchase-search"><Search size={17} /><input className="input-field" autoFocus value={itemSearch} onChange={event => setItemSearch(event.target.value)} placeholder="Buscar artículo…" /></div>{materialsEnabled && <div className="purchase-filter-row">{[['Todos', 'Todos'], ['Producto', 'Productos'], ['MateriaPrima', 'Materias primas']].map(([value, label]) => <button key={value} type="button" className={itemFilter === value ? 'is-active' : ''} onClick={() => setItemFilter(value)}>{label}</button>)}</div>}<div className="purchase-selector-list">{filteredItems.map(item => {
        const selected = form.items.some(existing => itemKey(existing) === itemKey(item));
        return <button type="button" key={itemKey(item)} className={selected ? 'is-selected' : ''} onClick={() => addItem(item)} disabled={selected}><span><strong>{item.codigo} · {item.nombre}</strong><small>{item.tipoItem === 'Producto' ? 'Producto' : 'Materia prima'} · Stock: {item.stock} {item.unidad}</small></span>{selected ? <Check size={17} /> : <Plus size={17} />}</button>;
      })}</div><div className="purchase-modal-footer"><button type="button" className="btn btn-primary" onClick={() => setShowItemModal(false)}>Listo</button></div></div></div>}

      {formatTarget && <div className="modal-overlay" style={{ zIndex: 1130 }}><div className="modal-content" style={{ maxWidth: 460 }}><div className="purchase-modal-heading"><div><h3>Nuevo formato de compra</h3></div><button type="button" className="purchase-modal-close" onClick={() => setFormatTarget(null)} aria-label="Cerrar"><X size={21} /></button></div><div style={{ display: 'grid', gap: 14 }}><div><strong>{formatTarget.nombre}</strong><div className="purchase-item-meta">Unidad de inventario: {formatTarget.unidad}</div></div><label className="input-group"><span className="input-label">Nombre del formato</span><input className="input-field" autoFocus maxLength="100" value={formatForm.nombreFormato} onChange={event => setFormatForm(current => ({ ...current, nombreFormato: event.target.value }))} placeholder={formatTarget.tipoItem === 'Producto' ? 'Caja' : 'Bolsa'} /></label><label className="input-group"><span className="input-label">Contenido por formato ({formatTarget.unidad})</span><input className="input-field" type="number" min="0.001" step={formatTarget.tipoItem === 'Producto' ? '1' : '0.001'} value={formatForm.cantidadContenido} onChange={event => setFormatForm(current => ({ ...current, cantidadContenido: event.target.value }))} /></label></div><div className="purchase-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setFormatTarget(null)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={saving || !formatForm.nombreFormato.trim() || Number(formatForm.cantidadContenido) <= 0} onClick={createFormat}>Crear formato</button></div></div></div>}

      {showPriceModal && <div className="modal-overlay" style={{ zIndex: 1120 }}><div className="modal-content purchase-price-modal"><div className="purchase-modal-heading"><div><h3>Confirmar cambios de precio</h3><p>Esta confirmación es independiente de la recepción de stock.</p></div><button type="button" className="purchase-modal-close" onClick={() => setShowPriceModal(false)} aria-label="Cerrar"><X size={21} /></button></div><div className="purchase-price-list">{pendingPrices.map(item => <label key={item.idOrdenDetalle}><input type="checkbox" checked={priceSelection.includes(item.idOrdenDetalle)} onChange={() => setPriceSelection(current => current.includes(item.idOrdenDetalle) ? current.filter(value => value !== item.idOrdenDetalle) : [...current, item.idOrdenDetalle])} /><span><strong>{item.nombre}</strong><small>{money(item.precioVentaAnterior)} → {money(item.nuevoPrecioVenta)}</small></span></label>)}</div><div className="purchase-modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowPriceModal(false)}>Ahora no</button><button type="button" className="btn btn-primary" disabled={saving || priceSelection.length === 0} onClick={confirmPrices}>Confirmar precios seleccionados</button></div></div></div>}
    </div>
  );
};

export default PurchaseOrderDetail;
