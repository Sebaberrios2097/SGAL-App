import { BookOpen, CalendarDays, Clock, Coffee, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const formatDate = value => value
  ? new Date(value).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
  : 'En curso';

const TurnHistory = () => {
  const { user } = useAuth();
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Historial de turnos - Siete Vidas';
    fetch(`/api/turn/history?idUsuario=${user.idUsuario}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || 'No fue posible cargar los turnos.');
        return data;
      })
      .then(setTurns)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user.idUsuario]);

  return (
    <div className="animate-fade-in" style={{ padding: '10px 0' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '6px' }}>Historial de turnos</h2>
        <p style={{ color: 'var(--text-muted)' }}>Todos los turnos registrados a su nombre.</p>
      </div>

      {loading && <div className="card" style={{ padding: '36px', textAlign: 'center' }}>Cargando turnos…</div>}
      {error && <div className="card" style={{ padding: '20px', color: '#b91c1c' }}>{error}</div>}
      {!loading && !error && turns.length === 0 && (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Coffee size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <div>Aún no tiene turnos registrados.</div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '14px' }}>
        {turns.map(turn => (
          <article key={turn.idTurno} className="card" style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(260px, 2fr) auto', gap: '20px', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '1.05rem' }}>Turno #{turn.idTurno}</strong>
              <div style={{ marginTop: '6px', color: turn.idEstadoTurno === 1 ? '#15803d' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                {turn.estadoNombre}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: '10px', fontSize: '0.82rem' }}>
              <span><CalendarDays size={14} /> Apertura: {formatDate(turn.fechaApertura)}</span>
              <span><Clock size={14} /> Cierre: {formatDate(turn.fechaCierre)}</span>
              <span><Coffee size={14} /> {turn.extractionCount} extracciones</span>
              <span><ShoppingBag size={14} /> {turn.salesCount} ventas · ${turn.totalSales.toLocaleString('es-CL')}</span>
            </div>
            <Link className="btn btn-secondary" to={`/logbook/${turn.idTurno}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', textDecoration: 'none' }}>
              <BookOpen size={16} /> Ver bitácora
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
};

export default TurnHistory;
