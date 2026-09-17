import { useCallback } from 'react';
import TurnRecordsCalendar from '../components/TurnRecordsCalendar';
import { useAuth } from '../context/AuthContext';

const AdminTurnRecords = () => {
  const { can } = useAuth();
  const buildCalendarUrl = useCallback((year, month) => `/api/admin-dashboard/turn-records/calendar?year=${year}&month=${month}`, []);
  const buildDayUrl = useCallback(date => `/api/admin-dashboard/turn-records/day?date=${date}`, []);
  const buildLogbookUrl = useCallback(id => `/api/admin-dashboard/turn-records/logbook/${id}`, []);

  return (
    <TurnRecordsCalendar
      buildCalendarUrl={buildCalendarUrl}
      buildDayUrl={buildDayUrl}
      buildLogbookUrl={buildLogbookUrl}
      showSales={can('registros_turnos.ventas.ver')}
      showLogbooks={can('registros_turnos.bitacora.ver')}
      title="Registros de turnos"
      backTo="/"
      backLabel="Volver al panel"
      documentTitle={`Registros de turnos - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'SGAL App'}`}
    />
  );
};

export default AdminTurnRecords;
