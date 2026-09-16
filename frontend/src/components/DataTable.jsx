import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/**
 * Tabla reutilizable con búsqueda por coincidencia, filtro por una columna, orden por columna
 * a selección (por defecto por el id de forma descendente) y paginación. El id nunca se muestra:
 * `rowKey` se usa como clave de fila y como criterio de orden por defecto.
 *
 * Props:
 *  - rows: array de datos.
 *  - rowKey: (row) => id  (clave única; también orden por defecto).
 *  - columns: [{ key, header, cell?, sortValue?, align, width, thStyle, tdStyle, headerClassName, cellClassName }]
 *  - search: (row) => string  (texto sobre el que busca; si se omite, no hay buscador).
 *  - searchPlaceholder
 *  - filter: { label, options: [{ value, label, test:(row)=>bool }] }  (opcional; la 1ª opción es la default).
 *  - pageSize (default 10)
 *  - defaultSortDir ('desc' por defecto)
 *  - emptyMessage
 *  - toolbarExtra: nodo extra a la derecha de la barra (p. ej. un botón).
 */
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const DataTable = ({
  rows = [],
  rowKey,
  columns = [],
  search,
  searchPlaceholder = 'Buscar…',
  filter,
  pageSize = 5,
  defaultSortDir = 'desc',
  emptyMessage = 'Sin registros.',
  toolbarExtra
}) => {
  const [term, setTerm] = useState('');
  const [filterValue, setFilterValue] = useState(filter?.options?.[0]?.value ?? 'all');
  const [sort, setSort] = useState({ key: null, dir: defaultSortDir }); // key null = por id
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : 5);

  useEffect(() => { setPage(1); }, [term, filterValue, size, rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (filter) {
      const option = filter.options.find(o => o.value === filterValue);
      if (option?.test) result = result.filter(option.test);
    }
    const t = term.trim().toLowerCase();
    if (t && search) result = result.filter(row => (search(row) || '').toLowerCase().includes(t));
    return result;
  }, [rows, filter, filterValue, term, search]);

  const sorted = useMemo(() => {
    const column = columns.find(c => c.key === sort.key);
    const dir = sort.dir === 'asc' ? 1 : -1;
    const getVal = column?.sortValue
      ? column.sortValue
      : (row) => (rowKey ? rowKey(row) : 0);
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' }) * dir;
    });
    return copy;
  }, [filtered, sort, columns, rowKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / size));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * size, currentPage * size);

  const toggleSort = (column) => {
    if (!column.sortValue) return;
    setSort(current => current.key === column.key
      ? { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key: column.key, dir: 'asc' });
  };

  const sortIcon = (column) => {
    if (!column.sortValue) return null;
    if (sort.key !== column.key) return <ChevronsUpDown size={13} style={{ opacity: 0.4, marginLeft: '4px', verticalAlign: 'middle' }} />;
    return sort.dir === 'asc'
      ? <ArrowUp size={13} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
      : <ArrowDown size={13} style={{ marginLeft: '4px', verticalAlign: 'middle' }} />;
  };

  return (
    <div>
      {(search || filter || toolbarExtra) && (
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px', padding: '12px 14px' }}>
          {search && (
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input-field" style={{ paddingLeft: '36px' }} value={term} onChange={e => setTerm(e.target.value)} placeholder={searchPlaceholder} />
            </div>
          )}
          {filter && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {filter.label}
              <select className="input-field" style={{ width: 'auto', minWidth: '150px' }} value={filterValue} onChange={e => setFilterValue(e.target.value)}>
                {filter.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
          {toolbarExtra && <div style={{ marginLeft: 'auto' }}>{toolbarExtra}</div>}
        </div>
      )}

      <div className="table-container">
        <div className="table-scroll-wrapper" style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                {columns.map(column => (
                  <th key={column.key} className={column.headerClassName} style={{ width: column.width, textAlign: column.align || 'left', whiteSpace: 'nowrap', ...(column.thStyle || {}) }}>
                    {column.sortValue ? (
                      <button type="button" onClick={() => toggleSort(column)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', fontWeight: 'inherit', display: 'inline-flex', alignItems: 'center' }}>
                        {column.header}{sortIcon(column)}
                      </button>
                    ) : column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>{emptyMessage}</td></tr>
              ) : pageRows.map(row => (
                <tr key={rowKey(row)}>
                  {columns.map(column => (
                    <td key={column.key} className={column.cellClassName} style={{ textAlign: column.align || 'left', ...(column.tdStyle || {}) }}>
                      {column.cell ? column.cell(row) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length > PAGE_SIZE_OPTIONS[0] && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: '1px solid var(--panel-border)', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '.8rem', color: 'var(--text-muted)' }}>
              <span>Mostrar</span>
              <select className="input-field" style={{ padding: '4px 8px', width: 'auto' }} value={size} onChange={e => setSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>de {sorted.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '.82rem' }} disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</button>
              <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Página {currentPage} de {totalPages}</span>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '.82rem' }} disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;
