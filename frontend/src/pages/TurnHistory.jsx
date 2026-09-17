import { useCallback } from 'react';
import TurnRecordsCalendar from '../components/TurnRecordsCalendar';
import { useAuth } from '../context/AuthContext';

const TurnHistory = () => {
  const { user, can } = useAuth();
  const idUsuario = user.idUsuario;

  const buildCalendarUrl = useCallback((year, month) => `/api/turn/calendar?idUsuario=${idUsuario}&year=${year}&month=${month}`, [idUsuario]);
  const buildDayUrl = useCallback(date => `/api/turn/day?idUsuario=${idUsuario}&date=${date}`, [idUsuario]);
  const buildLogbookUrl = useCallback(id => `/api/admin-dashboard/turn-records/logbook/${id}`, []);

  return (
    <TurnRecordsCalendar
      buildCalendarUrl={buildCalendarUrl}
      buildDayUrl={buildDayUrl}
      buildLogbookUrl={buildLogbookUrl}
      showSales={false}
      showLogbooks={can('bitacora.propia.ver')}
      title="Historial de turnos"
      backTo="/"
      backLabel="Volver al inicio"
      documentTitle={`Historial de turnos - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`}
    />
  );
};

export default TurnHistory;
