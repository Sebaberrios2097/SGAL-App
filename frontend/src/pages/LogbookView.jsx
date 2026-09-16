import { AlertCircle, ArrowLeft, Ban, BookOpen, Coffee, Gift, Lock, MessageSquareText, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const emptyExtraction = () => ({ gramos: '', segundos: '', mililitros: '', observaciones: '' });

const LogbookView = () => {
  const { user } = useAuth();
  const { idTurno } = useParams();
  const [logbook, setLogbook] = useState(null);
  const [rows, setRows] = useState([emptyExtraction()]);
  const [products, setProducts] = useState([]);
  const [consumptionForm, setConsumptionForm] = useState({ idProducto: '', cantidad: 1, solicitarComoCortesia: false, observacion: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingObservation, setSavingObservation] = useState(false);
  const [observation, setObservation] = useState('');
  const [error, setError] = useState('');
  const [observationError, setObservationError] = useState('');
  const [success, setSuccess] = useState('');
  const [observationSuccess, setObservationSuccess] = useState('');
  const [savingConsumption, setSavingConsumption] = useState(false);
  const [consumptionError, setConsumptionError] = useState('');
  const [consumptionSuccess, setConsumptionSuccess] = useState('');

  const loadLogbook = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [response, productsResponse] = await Promise.all([
        fetch(`/api/logbook/turn/${idTurno}?idUsuario=${user.idUsuario}`),
        fetch('/api/product')
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar la bitácora.');
      setLogbook(data);
      setObservation(data.observaciones || '');
      if (productsResponse.ok) setProducts((await productsResponse.json()).filter(product => product.activo));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [idTurno, user.idUsuario]);

  useEffect(() => {
    document.title = `Bitácora turno #${idTurno} - Siete Vidas`;
    loadLogbook();
  }, [idTurno, loadLogbook]);

  const updateRow = (index, field, value) => setRows(current => current.map(
    (row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row
  ));

  const handleSubmit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const extracciones = rows.map(row => ({
        gramos: Number(row.gramos),
        segundos: Number(row.segundos),
        mililitros: Number(row.mililitros),
        observaciones: row.observaciones.trim() || null
      }));
      const response = await fetch('/api/logbook/extractions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario, idTurno: Number(idTurno), extracciones })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible guardar las extracciones.');
      setRows([emptyExtraction()]);
      setSuccess(data.mensaje);
      await loadLogbook();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleObservationSubmit = async event => {
    event.preventDefault();
    setSavingObservation(true);
    setObservationError('');
    setObservationSuccess('');
    try {
      const response = await fetch('/api/logbook/observation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUsuario: user.idUsuario,
          idTurno: Number(idTurno),
          observaciones: observation.trim() || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible guardar la observación.');
      setObservation(observation.trim());
      setObservationSuccess(data.mensaje);
    } catch (err) {
      setObservationError(err.message);
    } finally {
      setSavingObservation(false);
    }
  };

  const selectedCourtesy = logbook?.cortesia?.productos?.find(product => product.idProducto === Number(consumptionForm.idProducto));

  const handleConsumptionSubmit = async event => {
    event.preventDefault();
    setSavingConsumption(true); setConsumptionError(''); setConsumptionSuccess('');
    try {
      const response = await fetch('/api/logbook/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idUsuario: user.idUsuario,
          idTurno: Number(idTurno),
          idProducto: Number(consumptionForm.idProducto),
          cantidad: Number(consumptionForm.cantidad),
          solicitarComoCortesia: consumptionForm.solicitarComoCortesia,
          observacion: consumptionForm.observacion.trim() || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible registrar el consumo.');
      setConsumptionForm({ idProducto: '', cantidad: 1, solicitarComoCortesia: false, observacion: '' });
      setConsumptionSuccess(data.mensaje);
      await loadLogbook();
    } catch (err) { setConsumptionError(err.message); }
    finally { setSavingConsumption(false); }
  };

  const voidConsumption = async consumption => {
    if (!window.confirm(`¿Anular el consumo de ${consumption.nombreProducto}? Las existencias serán repuestas.`)) return;
    setConsumptionError(''); setConsumptionSuccess('');
    try {
      const response = await fetch(`/api/logbook/products/${consumption.idProductosBitacora}/void`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: user.idUsuario })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible anular el consumo.');
      setConsumptionSuccess(data.mensaje);
      await loadLogbook();
    } catch (err) { setConsumptionError(err.message); }
  };

  if (loading) return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cargando bitácora…</div>;

  return (
    <div className="animate-fade-in" style={{ padding: '10px 0' }}>
      <Link to="/turn-history" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '18px', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 700 }}>
        <ArrowLeft size={16} /> Historial de turnos
      </Link>

      {error && !logbook ? <div className="card" style={{ padding: '20px', color: '#b91c1c' }}>{error}</div> : logbook && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '24px', gap: '16px' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.8rem', marginBottom: '6px' }}><BookOpen /> Bitácora del turno #{logbook.idTurno}</h2>
              <p style={{ color: 'var(--text-muted)' }}>Apertura: {new Date(logbook.fechaApertura).toLocaleString('es-CL')}</p>
            </div>
            <span style={{ padding: '7px 12px', borderRadius: '20px', background: logbook.esEditable ? '#dcfce7' : '#f1f5f9', color: logbook.esEditable ? '#166534' : '#475569', fontWeight: 700, fontSize: '0.8rem' }}>
              {logbook.esEditable ? 'Turno abierto' : <><Lock size={13} /> Solo lectura</>}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>

          <form onSubmit={handleObservationSubmit} className="card" style={{ padding: '22px', marginBottom: '22px', order: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '6px' }}>
              <MessageSquareText size={20} color="var(--primary-color)" />
              <h3>Observación de la bitácora</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '14px' }}>
              Registre aquí una observación general correspondiente a todo el turno.
            </p>
            {observationError && <div style={{ color: '#b91c1c', marginBottom: '10px' }}><AlertCircle size={15} /> {observationError}</div>}
            {observationSuccess && <div style={{ color: '#15803d', marginBottom: '10px' }}>{observationSuccess}</div>}
            <textarea
              className="input-field"
              rows="3"
              maxLength="1000"
              value={observation}
              disabled={!logbook.esEditable || savingObservation}
              placeholder="Escriba una observación general de la bitácora…"
              onChange={event => setObservation(event.target.value)}
              style={{ resize: 'vertical', minHeight: '92px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{observation.length}/1000 caracteres</span>
              {logbook.esEditable && (
                <button type="submit" className="btn btn-primary" disabled={savingObservation}>
                  <Save size={16} /> {savingObservation ? 'Guardando…' : 'Guardar observación'}
                </button>
              )}
            </div>
          </form>

          <section className="card" style={{ padding: '22px', marginBottom: '22px', order: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px', marginBottom: '16px' }}>
              <div><h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}><Coffee size={20} /> Productos consumidos</h3><p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Registra todos los productos consumidos por el empleado durante el turno.</p></div>
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#f0fdf4', color: '#166534', textAlign: 'center', minWidth: '150px' }}><div style={{ fontSize: '0.72rem', fontWeight: 700 }}>CORTESÍAS DISPONIBLES HOY</div><strong style={{ fontSize: '1.35rem' }}>{logbook.cortesia.restanteHoy} / {logbook.cortesia.limiteDiarioGlobal}</strong></div>
            </div>
            {consumptionError && <div style={{ color: '#b91c1c', marginBottom: '10px' }}><AlertCircle size={15} /> {consumptionError}</div>}
            {consumptionSuccess && <div style={{ color: '#15803d', marginBottom: '10px' }}>{consumptionSuccess}</div>}

            {logbook.esEditable && <form onSubmit={handleConsumptionSubmit} style={{ padding: '16px', background: '#f8fafc', border: '1px solid var(--panel-border)', borderRadius: '12px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) 110px minmax(220px, 2fr)', gap: '14px', alignItems: 'end' }}>
                <label className="input-group" style={{ margin: 0 }}><span className="input-label">Producto</span><select className="input-field" required value={consumptionForm.idProducto} onChange={event => { const idProducto = event.target.value; const eligible = logbook.cortesia.productos.some(product => product.idProducto === Number(idProducto)); setConsumptionForm(current => ({ ...current, idProducto, solicitarComoCortesia: eligible ? current.solicitarComoCortesia : false })); }}><option value="">Seleccione…</option>{products.map(product => <option key={product.idProducto} value={product.idProducto}>{product.nombreProducto}</option>)}</select></label>
                <label className="input-group" style={{ margin: 0 }}><span className="input-label">Cantidad</span><input className="input-field" type="number" min="1" required value={consumptionForm.cantidad} onChange={event => setConsumptionForm(current => ({ ...current, cantidad: event.target.value }))} /></label>
                <label className="input-group" style={{ margin: 0 }}><span className="input-label">Observación (opcional)</span><input className="input-field" maxLength="300" value={consumptionForm.observacion} onChange={event => setConsumptionForm(current => ({ ...current, observacion: event.target.value }))} /></label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '9px', color: selectedCourtesy ? 'var(--text-main)' : 'var(--text-muted)', cursor: selectedCourtesy ? 'pointer' : 'not-allowed' }}><input type="checkbox" checked={consumptionForm.solicitarComoCortesia} disabled={!selectedCourtesy || logbook.cortesia.restanteHoy === 0} onChange={event => setConsumptionForm(current => ({ ...current, solicitarComoCortesia: event.target.checked }))} style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)' }} /><Gift size={17} /> Registrar como cortesía{selectedCourtesy ? ` (máx. ${selectedCourtesy.cantidadDiaria} de este producto)` : ''}</label>
                <button className="btn btn-primary" disabled={savingConsumption || !consumptionForm.idProducto}>{savingConsumption ? 'Registrando…' : 'Registrar consumo'}</button>
              </div>
            </form>}

            {logbook.productosConsumidos.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aún no hay productos consumidos en este turno.</p> : <div className="table-container"><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}><table className="custom-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Tipo</th><th>Fecha</th><th>Observación</th>{logbook.esEditable && <th className="col-actions">Acciones</th>}</tr></thead><tbody>{logbook.productosConsumidos.map(consumption => <tr key={consumption.idProductosBitacora} style={{ opacity: consumption.activo ? 1 : .45, textDecoration: consumption.activo ? 'none' : 'line-through' }}><td>{consumption.nombreProducto}</td><td>{consumption.cantidad}</td><td><span className={`badge ${consumption.esCortesia ? 'badge-success' : 'badge-warning'}`}>{consumption.esCortesia ? 'Cortesía' : 'Consumo'}</span></td><td>{new Date(consumption.fechaConsumo).toLocaleString('es-CL')}</td><td>{consumption.observacion || '—'}</td>{logbook.esEditable && <td className="col-actions">{consumption.activo && <button className="btn btn-danger" style={{ padding: '7px' }} onClick={() => voidConsumption(consumption)} title="Anular consumo"><Ban size={15} /></button>}</td>}</tr>)}</tbody></table></div></div>}
          </section>

          {logbook.esEditable && (
            <form onSubmit={handleSubmit} className="card" style={{ padding: '22px', marginBottom: '22px', order: 1 }}>
              <h3 style={{ marginBottom: '6px' }}>Registrar extracciones</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '16px' }}>
                Puede ingresar una o varias extracciones antes de guardar.
              </p>
              {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}><AlertCircle size={15} /> {error}</div>}
              {success && <div style={{ color: '#15803d', marginBottom: '12px' }}>{success}</div>}
              <div style={{ display: 'grid', gap: '14px' }}>
                {rows.map((row, index) => (
                  <div key={index} style={{ padding: '16px', border: '1px solid var(--panel-border)', borderRadius: '12px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <strong style={{ fontSize: '0.9rem' }}>Extracción {index + 1}</strong>
                      <button
                        type="button"
                        className="btn btn-danger"
                        aria-label={`Quitar extracción ${index + 1}`}
                        title="Quitar extracción"
                        disabled={rows.length === 1}
                        onClick={() => setRows(current => current.filter((_, i) => i !== index))}
                        style={{ width: '36px', height: '36px', padding: 0 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px' }}>
                      <label className="input-group" style={{ marginBottom: 0 }}>
                        <span className="input-label">Gramos</span>
                        <input className="input-field" required min="0.1" step="0.1" type="number" placeholder="Ej. 18" value={row.gramos} onChange={e => updateRow(index, 'gramos', e.target.value)} />
                      </label>
                      <label className="input-group" style={{ marginBottom: 0 }}>
                        <span className="input-label">Segundos</span>
                        <input className="input-field" required min="1" step="1" type="number" placeholder="Ej. 28" value={row.segundos} onChange={e => updateRow(index, 'segundos', e.target.value)} />
                      </label>
                      <label className="input-group" style={{ marginBottom: 0 }}>
                        <span className="input-label">Mililitros</span>
                        <input className="input-field" required min="0.1" step="0.1" type="number" placeholder="Ej. 36" value={row.mililitros} onChange={e => updateRow(index, 'mililitros', e.target.value)} />
                      </label>
                    </div>
                    <label className="input-group" style={{ margin: '14px 0 0' }}>
                      <span className="input-label">Observación de la extracción (opcional)</span>
                      <textarea
                        className="input-field"
                        rows="2"
                        maxLength="300"
                        value={row.observaciones}
                        placeholder="Ej. Molienda muy fina; se ajustó el molino para la siguiente extracción…"
                        onChange={e => updateRow(index, 'observaciones', e.target.value)}
                        style={{ resize: 'vertical', minHeight: '72px' }}
                      />
                      <span style={{ alignSelf: 'flex-end', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{row.observaciones.length}/300</span>
                    </label>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRows(current => [...current, emptyExtraction()])}><Plus size={16} /> Agregar otra</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          )}

          <section className="card" style={{ padding: '22px', marginBottom: '22px', order: 2 }}>
            <h3 style={{ marginBottom: '16px' }}>Extracciones registradas ({logbook.extracciones.length})</h3>
            {logbook.extracciones.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aún no hay extracciones en esta bitácora.</p> : (
              <div className="table-container"><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}><table className="custom-table">
                <thead><tr>{['#', 'Gramos', 'Segundos', 'Mililitros', 'Observación'].map(value => <th key={value}>{value}</th>)}</tr></thead>
                <tbody>{logbook.extracciones.map((extraction, index) => <tr key={extraction.idExtraccion}>
                  <td>{index + 1}</td><td>{extraction.gramos}</td><td>{extraction.segundos}</td><td>{extraction.mililitros}</td><td style={{ minWidth: '220px' }}>{extraction.observaciones || '—'}</td>
                </tr>)}</tbody>
              </table></div></div>
            )}
          </section>
          </div>
        </>
      )}
    </div>
  );
};

export default LogbookView;
