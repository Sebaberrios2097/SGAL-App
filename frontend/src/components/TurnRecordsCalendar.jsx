import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, Coffee, Eye, HandCoins, Receipt, ShoppingBag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader';
import { useNotificationMessage } from './NotificationCenter';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const localMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const LogbookDetail = ({ id, buildLogbookUrl, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useNotificationMessage('error');
  useEffect(() => {
    fetch(buildLogbookUrl(id))
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje); return result; })
      .then(setData).catch(err => setError(err.message));
  }, [id, buildLogbookUrl]);
  return <div className="modal-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="modal-content" style={{ maxWidth: '900px', maxHeight: '88vh', overflowY: 'auto' }}>
    <button type="button" onClick={onClose} aria-label="Cerrar" style={{ position: 'absolute', right: '20px', top: '20px', border: 0, background: '#f1f5f9', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer' }}><X size={18} /></button>
    {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : !data ? <div style={{ textAlign: 'center', padding: '30px' }}>Cargando bitácora…</div> : <>
      <div style={{ marginBottom: '22px' }}><span className="badge badge-success">{data.estado}</span><h2 style={{ marginTop: '10px' }}>Bitácora #{data.idBitacora}</h2><p style={{ color: 'var(--text-muted)' }}>Turno #{data.idTurno} · {data.empleado || data.usuario}</p></div>
      <h3 style={{ marginBottom: '10px' }}>Extracciones ({data.extracciones.length})</h3>
      <div className="table-container" style={{ marginBottom: '20px' }}><table className="custom-table"><thead><tr><th>Gramos</th><th>Segundos</th><th>Mililitros</th><th>Observaciones</th></tr></thead><tbody>{data.extracciones.length === 0 ? <tr><td colSpan="4" style={{ textAlign: 'center' }}>Sin extracciones.</td></tr> : data.extracciones.map(item => <tr key={item.idExtraccion}><td>{item.gramos} g</td><td>{item.segundos} s</td><td>{item.mililitros} mL</td><td>{item.observaciones || '—'}</td></tr>)}</tbody></table></div>
      <div className="card" style={{ boxShadow: 'none', marginBottom: '18px', background: '#f8fafc' }}><strong>Observaciones del turno</strong><p style={{ marginTop: '7px', color: data.observaciones ? 'var(--text-main)' : 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{data.observaciones || 'Sin observaciones registradas.'}</p></div>
      <h3 style={{ marginBottom: '10px' }}>Productos consumidos ({data.productosConsumidos.length})</h3>
      <div className="table-container"><table className="custom-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Tipo</th><th>Hora</th><th>Observación</th></tr></thead><tbody>{data.productosConsumidos.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center' }}>Sin productos consumidos.</td></tr> : data.productosConsumidos.map(item => <tr key={item.idProductosBitacora} style={{ opacity: item.activo ? 1 : .5 }}><td>{item.nombreProducto}</td><td>{item.cantidad}</td><td>{item.esCortesia ? <span className="badge badge-success">Cortesía</span> : 'Consumo'}</td><td>{new Date(item.fechaConsumo).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</td><td>{item.activo ? item.observacion || '—' : 'Anulado'}</td></tr>)}</tbody></table></div>
    </>}
  </div></div>;
};

// Lista de ventas de un turno (solo administrador). Se carga bajo demanda al expandir.
const TurnSalesList = ({ idTurno }) => {
  const [open, setOpen] = useState(false);
  const [sales, setSales] = useState(null);
  const [error, setError] = useNotificationMessage('error');

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && sales === null) {
      fetch(`/api/sale/turn/${idTurno}`)
        .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar las ventas.'); return result; })
        .then(setSales).catch(err => setError(err.message));
    }
  };

  return <div style={{ marginTop: '14px', borderTop: '1px dashed #d9e5de', paddingTop: '12px' }}>
    <button type="button" onClick={toggle} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: 0, background: 'none', color: 'var(--primary-color)', fontWeight: 700, cursor: 'pointer', font: 'inherit', padding: 0 }}>
      <Receipt size={15} /> {open ? 'Ocultar ventas del turno' : 'Ver ventas del turno'}
    </button>
    {open && <div style={{ marginTop: '10px' }}>
      {error ? <div style={{ color: '#b91c1c', fontSize: '.8rem' }}>{error}</div>
        : sales === null ? <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Cargando ventas…</div>
        : sales.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>No hubo ventas en este turno.</div>
        : <div style={{ display: 'grid', gap: '7px' }}>{sales.map(sale => <div key={sale.idVenta} style={{ border: '1px solid #e2e8f0', borderRadius: '9px', padding: '10px 12px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '.82rem' }}>Boleta #{sale.idVenta}</strong>
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{new Date(sale.fechaVenta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className={`badge ${sale.idEstadoVenta === 3 ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '.66rem' }}>{sale.nombreEstadoVenta}</span>
              <strong style={{ fontSize: '.86rem', color: 'var(--primary-color)' }}>{money(sale.montoTotal)}</strong>
            </div>
            <div style={{ marginTop: '5px', fontSize: '.72rem', color: 'var(--text-muted)' }}>
              {(sale.metodosPago || []).map(mp => `${mp.nombreMetodoPago}: ${money(mp.monto)}`).join(' · ') || 'Sin métodos registrados'}
            </div>
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'grid', gap: '5px' }}>
              {(sale.items || []).map((item, index) => <div key={`${item.idProducto}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '.78rem' }}>
                <span><strong>{item.cantidad}×</strong> {item.nombreProducto}{item.seleccionesMateriales?.length ? ` · ${item.seleccionesMateriales.map(x => x.nombreMateriaPrima).join(', ')}` : ''}{item.ingredientesExtra?.length ? ` + ${item.ingredientesExtra.map(x => x.nombre).join(', ')}` : ''}</span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(item.subtotal)}</span>
              </div>)}
            </div>
          </div>)}</div>}
    </div>}
  </div>;
};

const DayDetailView = ({ date, loading, data, showSales, showLogbooks, onBack, onLogbook }) => <div className="records-day-view">
    <button type="button" className="btn btn-secondary" onClick={onBack} style={{ marginBottom: '20px' }}><ArrowLeft size={17} /> Volver al calendario</button>
    <PageHeader title={new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })} icon={CalendarDays} />
    <div>
      {loading ? <div className="card" style={{ textAlign: 'center' }}>Cargando registros…</div> : data?.turnos.length === 0 ? <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hubo turnos durante este día.</div> : <div style={{ display: 'grid', gap: '14px' }}>{data?.turnos.map(turn => <div className="card" key={turn.idTurno} style={{ padding: '19px', boxShadow: '0 2px 8px rgba(15,23,42,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '15px' }}><div><h3>Turno #{turn.idTurno}</h3><p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{turn.empleado || turn.usuario}</p></div><span className={`badge ${turn.idEstadoTurno === 1 ? 'badge-warning' : 'badge-success'}`}>{turn.estado}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: turn.bitacoras.length ? '16px' : 0 }}><div><Clock size={14} /> <strong style={{ display: 'block' }}>{new Date(turn.fechaApertura).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>Apertura</div></div><div><ShoppingBag size={14} /> <strong style={{ display: 'block' }}>{turn.cantidadVentas} ventas</strong><div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>{money(turn.totalVentas)}</div></div><div><HandCoins size={14} /> <strong style={{ display: 'block' }}>{money(turn.propinaTotal)}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>Propinas</div></div><div><Coffee size={14} /> <strong style={{ display: 'block' }}>{turn.bitacoras.length} bitácora{turn.bitacoras.length === 1 ? '' : 's'}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>{turn.fechaCierre ? `Cierre ${new Date(turn.fechaCierre).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'En curso'}</div></div></div>
        {showLogbooks && <div style={{ display: 'grid', gap: '8px' }}>{turn.bitacoras.map(logbook => <button key={logbook.idBitacora} type="button" onClick={() => onLogbook(logbook.idBitacora)} style={{ width: '100%', border: '1px solid #d9e5de', background: '#f7fbf8', borderRadius: '11px', padding: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}><div><strong>Bitácora #{logbook.idBitacora}</strong><div style={{ color: 'var(--text-muted)', fontSize: '.75rem', marginTop: '3px' }}>{logbook.cantidadExtracciones} extracciones · {logbook.cantidadConsumos} consumos{logbook.observaciones ? ` · ${logbook.observaciones}` : ''}</div></div><Eye size={18} color="var(--primary-color)" /></button>)}</div>}
        {showSales && <TurnSalesList idTurno={turn.idTurno} />}
      </div>)}</div>}
    </div>
</div>;

const TurnRecordsCalendar = ({ buildCalendarUrl, buildDayUrl, buildLogbookUrl, showSales = false, showLogbooks = true, title, backTo = '/', backLabel = 'Volver al panel', documentTitle }) => {
  const [month, setMonth] = useState(localMonth);
  const [calendar, setCalendar] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [logbookId, setLogbookId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);
  const [error, setError] = useNotificationMessage('error');
  const [year, monthNumber] = month.split('-').map(Number);

  useEffect(() => {
    if (documentTitle) document.title = documentTitle;
    setLoading(true); setError(''); setSelectedDate(null); setDayData(null);
    fetch(buildCalendarUrl(year, monthNumber))
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje); return result; })
      .then(result => setCalendar(result.dias)).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [year, monthNumber, buildCalendarUrl, documentTitle]);

  const cells = useMemo(() => {
    const totalDays = new Date(year, monthNumber, 0).getDate();
    const mondayOffset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
    return [...Array(mondayOffset).fill(null), ...Array.from({ length: totalDays }, (_, index) => index + 1)];
  }, [year, monthNumber]);
  const recordsByDay = useMemo(() => Object.fromEntries(calendar.map(item => [new Date(item.fecha).getDate(), item])), [calendar]);
  const monthLabel = new Date(year, monthNumber - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  const moveMonth = offset => {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };
  const selectDay = day => {
    const selected = dateKey(new Date(year, monthNumber - 1, day));
    setSelectedDate(selected); setDayData(null); setDayLoading(true); setError('');
    fetch(buildDayUrl(selected))
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje); return result; })
      .then(setDayData).catch(err => setError(err.message)).finally(() => setDayLoading(false));
  };

  return <div className="animate-fade-in">
    <div className="records-calendar-view" style={{ display: selectedDate ? 'none' : 'block' }}>
    <Link to={backTo} style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 700, marginBottom: '18px' }}><ArrowLeft size={16} /> {backLabel}</Link>
    <PageHeader title={title} icon={CalendarDays} actions={<input className="input-field" style={{ width: '185px' }} type="month" value={month} onChange={event => setMonth(event.target.value)} />} />
    {error && <div className="card" style={{ color: '#b91c1c', marginBottom: '18px' }}>{error}</div>}
    <div className="card" style={{ padding: '20px', marginBottom: '22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}><button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button><h3 style={{ textTransform: 'capitalize' }}>{monthLabel}</h3><button className="btn btn-secondary" style={{ padding: '8px' }} onClick={() => moveMonth(1)}><ChevronRight size={18} /></button></div>
      {loading ? <div style={{ textAlign: 'center', padding: '55px' }}>Cargando calendario…</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(90px, 1fr))', gap: '7px', overflowX: 'auto' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <div key={day} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem', fontWeight: 800, padding: '5px' }}>{day}</div>)}
        {cells.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} />;
          const record = recordsByDay[day];
          const selected = selectedDate === dateKey(new Date(year, monthNumber - 1, day));
          return <button key={day} type="button" onClick={() => selectDay(day)} style={{ minHeight: '105px', textAlign: 'left', padding: '10px', borderRadius: '11px', border: selected ? '2px solid var(--primary-color)' : '1px solid #dce4e8', background: selected ? '#eef9f2' : record ? '#fff' : '#f8fafc', cursor: 'pointer', font: 'inherit' }}><strong style={{ fontSize: '.9rem' }}>{day}</strong>{record ? <div style={{ display: 'grid', gap: '4px', marginTop: '9px', fontSize: '.7rem' }}><span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>{record.cantidadTurnos} turno{record.cantidadTurnos === 1 ? '' : 's'}</span><span><BookOpen size={11} /> {record.cantidadBitacoras} bitácora{record.cantidadBitacoras === 1 ? '' : 's'}</span><span><ShoppingBag size={11} /> {record.cantidadVentas} ventas</span><strong>{money(record.totalVentas)}</strong>{record.propinaTotal > 0 && <span style={{ color: 'var(--text-muted)' }}>Propina {money(record.propinaTotal)}</span>}</div> : <div style={{ color: '#a4afb9', fontSize: '.68rem', marginTop: '12px' }}>Sin actividad</div>}</button>;
        })}
      </div>}
    </div>
    </div>
    {selectedDate && <DayDetailView date={selectedDate} loading={dayLoading} data={dayData} showSales={showSales} showLogbooks={showLogbooks} onBack={() => { setSelectedDate(null); setDayData(null); }} onLogbook={setLogbookId} />}
    {logbookId && <LogbookDetail id={logbookId} buildLogbookUrl={buildLogbookUrl} onClose={() => setLogbookId(null)} />}
  </div>;
};

export default TurnRecordsCalendar;
