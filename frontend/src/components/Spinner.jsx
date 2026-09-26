// Spinner de carga reutilizable. Usa el keyframe `spin` global (definido en index.css).
// `size` en px; `label` opcional debajo; `style` se aplica al contenedor.
const Spinner = ({ size = 44, label, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', ...style }}>
    <div style={{
      border: `${Math.max(3, Math.round(size / 12))}px solid rgba(var(--primary-rgb), 0.12)`,
      width: size,
      height: size,
      borderRadius: '50%',
      borderLeftColor: 'var(--primary-color)',
      animation: 'spin 1s linear infinite'
    }} />
    {label && <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{label}</span>}
  </div>
);

export default Spinner;
