import { Gift, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';

const money = value => `$${Number(value || 0).toLocaleString('es-CL')}`;
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const initialStart = () => { const date = new Date(); date.setDate(1); return localDate(date); };

const MyConsumptions = () => {
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `Mis consumos - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`;
    fetch('/api/turn/my-consumption-balance')
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.mensaje || 'No fue posible cargar los consumos.'); return result; })
      .then(setData).catch(err => setError(err.message));
  }, []);

  const rows = useMemo(() => (data?.consumos || []).filter(consumo => {
    const date = consumo.fechaVenta.slice(0, 10);
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  }), [data, startDate, endDate]);

  return <div className="animate-fade-in">
    <PageHeader title="Mis consumos" icon={Wallet} backTo="/turn" backLabel="Turno" />
    {error && <div className="card" style={{ color: '#b91c1c' }}>{error}</div>}
    {!data && !error ? <div className="card" style={{ textAlign: 'center' }}>Cargando consumos…</div> : data && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div className="card" style={{ padding: '17px' }}><div className="input-label">Total pendiente · {data.cantidadPendiente}</div><strong style={{ display: 'block', color: data.totalPendiente > 0 ? '#b91c1c' : '#15803d', fontSize: '1.65rem', marginTop: '4px' }}>{money(data.totalPendiente)}</strong></div>
        <div className="card" style={{ padding: '17px' }}><div className="input-label">Consumo histórico</div><strong style={{ display: 'block', fontSize: '1.35rem', marginTop: '4px' }}>{money(data.totalHistorico)}</strong></div>
        <div className="card" style={{ padding: '17px' }}><div className="input-label">Cortesías</div><strong style={{ display: 'block', color: '#a16207', fontSize: '1.35rem', marginTop: '4px' }}>{money(data.totalCortesia)}</strong></div>
      </div>
      <div className="card" style={{ marginBottom: 12, padding: '12px 14px', display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' }}>
        <label className="input-group" style={{ margin: 0 }}><span className="input-label">Desde</span><input className="input-field" type="date" value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} /></label>
        <label className="input-group" style={{ margin: 0 }}><span className="input-label">Hasta</span><input className="input-field" type="date" value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} /></label>
        <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', paddingBottom: 9 }}>{rows.length} registro{rows.length === 1 ? '' : 's'}</span>
      </div>
      <DataTable
        rows={rows}
        rowKey={row => row.idVenta}
        pageSize={10}
        emptyMessage="No hay consumos en el rango seleccionado."
        columns={[
          { key: 'fecha', header: 'Fecha', sortValue: row => new Date(row.fechaVenta).getTime(), cell: row => <><strong>{new Date(row.fechaVenta).toLocaleDateString('es-CL')}</strong><div className="purchase-cell-meta">{new Date(row.fechaVenta).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div></> },
          { key: 'turno', header: 'Turno', sortValue: row => row.idTurno, cell: row => `#${row.idTurno}` },
          { key: 'productos', header: 'Productos', cell: row => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{row.items.map((item, index) => <span key={`${item.idProducto}-${index}`} className={`badge ${item.esCortesia ? 'badge-warning' : ''}`}>{item.esCortesia && <Gift size={11} />} {item.cantidad}× {item.nombreProducto}</span>)}</div> },
          { key: 'monto', header: 'Total', align: 'right', sortValue: row => row.montoAdeudado, cell: row => <strong>{money(row.montoAdeudado)}</strong> },
          { key: 'estado', header: 'Estado', align: 'center', sortValue: row => row.pagadoPorEmpleado ? 1 : 0, cell: row => <span className={`badge ${row.pagadoPorEmpleado ? 'badge-success' : 'badge-warning'}`}>{row.pagadoPorEmpleado ? 'Pagado' : 'Pendiente'}</span> }
        ]}
      />
    </>}
  </div>;
};

export default MyConsumptions;
