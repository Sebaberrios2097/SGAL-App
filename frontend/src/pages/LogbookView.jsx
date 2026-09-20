import { AlertCircle, ArrowLeft, BookOpen, Coffee, History, Lock, MessageSquareText, Plus, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const emptyExtraction = () => ({ gramos: '', segundos: '', mililitros: '', observaciones: '' });
const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;

const LogbookView = () => {
  const { user, can } = useAuth();
  const { idTurno } = useParams();
  const [logbook, setLogbook] = useState(null);
  const [rows, setRows] = useState([emptyExtraction()]);
  const [idMateria, setIdMateria] = useState('');
  const [reusing, setReusing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingObservation, setSavingObservation] = useState(false);
  const [observation, setObservation] = useState('');
  const [error, setError] = useState('');
  const [observationError, setObservationError] = useState('');
  const [success, setSuccess] = useState('');
  const [observationSuccess, setObservationSuccess] = useState('');
  const [extractionActionError, setExtractionActionError] = useState('');

  const loadLogbook = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/logbook/turn/${idTurno}?idUsuario=${user.idUsuario}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar la bitácora.');
      setLogbook(data);
      setObservation(data.observaciones || '');
      // Por defecto descuenta del café calibrable; el barista puede cambiarlo.
      setIdMateria(current => current || (data.calibracion?.idMateriaDefault ? String(data.calibracion.idMateriaDefault) : ''));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [idTurno, user.idUsuario]);

  useEffect(() => {
    document.title = `Bitácora turno #${idTurno} - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
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
        body: JSON.stringify({ idUsuario: user.idUsuario, idTurno: Number(idTurno), idMateriaPrima: idMateria ? Number(idMateria) : null, extracciones })
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

  // Precarga el formulario con la última extracción del turno anterior (segundo turno del día
  // que arranca sin recalibrar). Solo tiene sentido si el turno actual aún no calibró.
  const reuseLastExtraction = async () => {
    setReusing(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/logbook/turn/${idTurno}/previous-extraction`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible obtener la última extracción.');
      if (!data.tieneExtraccion) {
        setError('No hay extracciones de turnos anteriores para reutilizar.');
        return;
      }
      const e = data.extraccion;
      setRows([{
        gramos: String(e.gramos),
        segundos: String(e.segundos),
        mililitros: String(e.mililitros),
        observaciones: e.observaciones || ''
      }]);
      if (e.idMateriaPrima) setIdMateria(String(e.idMateriaPrima));
      setSuccess(`Datos cargados de la última extracción del turno #${e.idTurnoOrigen}${e.materia ? ` (${e.materia})` : ''}. Revíselos y presione Guardar para registrarlos.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setReusing(false);
    }
  };

  const deleteExtraction = async extraction => {
    if (!window.confirm('¿Eliminar esta extracción? El café descontado será repuesto al inventario.')) return;
    setExtractionActionError('');
    try {
      const response = await fetch(`/api/logbook/extractions/${extraction.idExtraccion}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No fue posible eliminar la extracción.');
      await loadLogbook();
    } catch (err) {
      setExtractionActionError(err.message);
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

  if (loading) return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cargando bitácora…</div>;

  const consumos = logbook?.consumos || [];
  const totalAdeudado = consumos.reduce((sum, c) => sum + (c.montoAdeudado || 0), 0);
  const totalCortesia = consumos.reduce((sum, c) => sum + (c.montoCortesia || 0), 0);
  const totalPendiente = consumos.filter(c => !c.pagadoPorEmpleado).reduce((sum, c) => sum + (c.montoAdeudado || 0), 0);

  return (
    <div className="animate-fade-in" style={{ padding: '10px 0' }}>
      <Link to="/turn-history" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '18px', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 700 }}>
        <ArrowLeft size={16} /> Historial de turnos
      </Link>

      {error && !logbook ? <div className="card" style={{ padding: '20px', color: '#b91c1c' }}>{error}</div> : logbook && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
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
            {observationError && <div style={{ color: '#b91c1c', marginBottom: '10px' }}><AlertCircle size={15} /> {observationError}</div>}
            {observationSuccess && <div style={{ color: '#15803d', marginBottom: '10px' }}>{observationSuccess}</div>}
            <textarea
              className="input-field"
              rows="3"
              maxLength="1000"
              value={observation}
              disabled={!logbook.esEditable || !can('bitacora.observacion.editar') || savingObservation}
              placeholder="Escriba una observación general de la bitácora…"
              onChange={event => setObservation(event.target.value)}
              style={{ resize: 'vertical', minHeight: '92px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{observation.length}/1000 caracteres</span>
              {logbook.esEditable && can('bitacora.observacion.editar') && (
                <button type="submit" className="btn btn-primary" disabled={savingObservation}>
                  <Save size={16} /> {savingObservation ? 'Guardando…' : 'Guardar observación'}
                </button>
              )}
            </div>
          </form>

          {/* Consumos del turno: ventas de consumo del empleado (solo lectura). Se crean en el POS. */}
          <section className="card" style={{ padding: '22px', marginBottom: '22px', order: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}><Coffee size={20} /> Consumos del turno</h3>
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#f0fdf4', color: '#166534', textAlign: 'center', minWidth: '150px' }}><div style={{ fontSize: '0.72rem', fontWeight: 700 }}>CORTESÍAS DISPONIBLES HOY</div><strong style={{ fontSize: '1.35rem' }}>{logbook.cortesia.restanteHoy} / {logbook.cortesia.limiteDiarioGlobal}</strong></div>
            </div>

            {consumos.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aún no hay consumos registrados en este turno.</p> : (
              <>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>Cortesía: {money(totalCortesia)}</span>
                  <span className="badge" style={{ background: '#e0f2fe', color: '#075985' }}>A pagar: {money(totalAdeudado)}</span>
                  <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Pendiente de pago: {money(totalPendiente)}</span>
                </div>
                <div className="table-container"><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}>
                  <table className="custom-table">
                    <thead><tr><th>Fecha</th><th>Detalle</th><th style={{ textAlign: 'right' }}>Cortesía</th><th style={{ textAlign: 'right' }}>A pagar</th><th>Pago</th></tr></thead>
                    <tbody>
                      {consumos.map(c => (
                        <tr key={c.idVenta}>
                          <td>{new Date(c.fechaVenta).toLocaleString('es-CL')}</td>
                          <td>
                            {c.items.map((it, i) => (
                              <div key={i} style={{ fontSize: '.85rem' }}>
                                {it.cantidad}× {it.nombreProducto}
                                {it.esCortesia && <span className="badge badge-success" style={{ marginLeft: '6px', fontSize: '.6rem' }}>Cortesía</span>}
                                {it.extras?.length > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}> · {it.extras.map(x => x.nombre).join(', ')}</span>}
                              </div>
                            ))}
                          </td>
                          <td style={{ textAlign: 'right', color: '#92400e' }}>{c.montoCortesia > 0 ? money(c.montoCortesia) : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(c.montoAdeudado)}</td>
                          <td>{c.montoAdeudado === 0
                            ? <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>N/A</span>
                            : <span className={`badge ${c.pagadoPorEmpleado ? 'badge-success' : 'badge-warning'}`}>{c.pagadoPorEmpleado ? 'Pagado' : 'Por cobrar'}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></div>
              </>
            )}
          </section>

          {logbook.esEditable && can('bitacora.extracciones.crear') && (
            <form onSubmit={handleSubmit} className="card" style={{ padding: '22px', marginBottom: '22px', order: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h3 style={{ margin: 0 }}>Registrar extracciones</h3>
                {/* El reuso de calibración solo tiene sentido si el turno aún no calibró. */}
                {logbook.extracciones.length === 0 && (
                  <button type="button" className="btn btn-secondary" onClick={reuseLastExtraction} disabled={reusing} title="Copia los datos de la última extracción del turno anterior">
                    <History size={15} /> {reusing ? 'Cargando…' : 'Usar última extracción del turno anterior'}
                  </button>
                )}
              </div>
              {error && <div style={{ color: '#b91c1c', marginBottom: '12px' }}><AlertCircle size={15} /> {error}</div>}
              {success && <div style={{ color: '#15803d', marginBottom: '12px' }}>{success}</div>}
              {logbook.calibracion?.materias?.length > 0 && (
                <label className="input-group" style={{ marginBottom: '16px', maxWidth: '380px' }}>
                  <span className="input-label">Café utilizado (descuenta stock)</span>
                  <select className="input-field" value={idMateria} onChange={e => setIdMateria(e.target.value)}>
                    <option value="">Sin descuento de inventario</option>
                    {logbook.calibracion.materias.map(m => (
                      <option key={m.idMateriaPrima} value={m.idMateriaPrima}>{m.nombreMaterial}{m.esCafeCalibrable ? ' (calibrable)' : ''}</option>
                    ))}
                  </select>
                </label>
              )}
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
            {extractionActionError && <div style={{ color: '#b91c1c', marginBottom: '10px' }}><AlertCircle size={15} /> {extractionActionError}</div>}
            {logbook.extracciones.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Aún no hay extracciones en esta bitácora.</p> : (
              <div className="table-container"><div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}><table className="custom-table">
                <thead><tr>{['#', 'Café', 'Gramos', 'Segundos', 'Mililitros', 'Observación'].map(value => <th key={value}>{value}</th>)}{logbook.esEditable && can('bitacora.extracciones.crear') && <th className="col-actions">Acciones</th>}</tr></thead>
                <tbody>{logbook.extracciones.map((extraction, index) => <tr key={extraction.idExtraccion}>
                  <td>{index + 1}</td><td>{extraction.materia || '—'}</td><td>{extraction.gramos}</td><td>{extraction.segundos}</td><td>{extraction.mililitros}</td><td style={{ minWidth: '220px' }}>{extraction.observaciones || '—'}</td>
                  {logbook.esEditable && can('bitacora.extracciones.crear') && <td className="col-actions"><button className="btn btn-danger table-icon-button" onClick={() => deleteExtraction(extraction)} title="Eliminar extracción y reponer café" aria-label="Eliminar extracción"><Trash2 size={15} /></button></td>}
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
