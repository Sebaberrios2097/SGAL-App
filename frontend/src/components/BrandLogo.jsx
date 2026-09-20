import { Boxes } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOrganization } from '../context/OrganizationContext';

const BrandLogo = ({ location = 'sidebar', maxHeight = 64, compact = false, light = false }) => {
  const { branding, displayName, hasConfiguredIdentity, getLogoUrl, logoVersions } = useOrganization();
  const [failed, setFailed] = useState(false);
  const logoUrl = getLogoUrl(location);

  useEffect(() => setFailed(false), [location, logoVersions]);

  if (logoUrl && !failed) {
    return <img
      src={logoUrl}
      alt={hasConfiguredIdentity ? `Logo de ${displayName}` : 'Logo de la organización'}
      onError={() => setFailed(true)}
      style={{ maxWidth: '100%', maxHeight, objectFit: 'contain' }}
    />;
  }

  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
    <div style={{
      width: compact ? 38 : 52,
      height: compact ? 38 : 52,
      flex: '0 0 auto',
      borderRadius: 12,
      display: 'grid',
      placeItems: 'center',
      background: light ? '#ffffff' : 'var(--primary-color)',
      color: light ? 'var(--primary-color)' : '#ffffff'
    }}><Boxes size={compact ? 20 : 28} /></div>
    <div style={{ minWidth: 0 }}>
      <strong style={{ display: 'block', color: light ? '#ffffff' : 'var(--text-main)', fontSize: compact ? '1rem' : '1.35rem' }}>
        {hasConfiguredIdentity ? displayName : 'Gestión interna'}
      </strong>
      {!compact && <span style={{ display: 'block', color: light ? 'rgba(255,255,255,.72)' : 'var(--text-muted)', fontSize: '.75rem' }}>
        {hasConfiguredIdentity && branding.descripcion ? branding.descripcion : 'Acceso seguro a la plataforma'}
      </span>}
    </div>
  </div>;
};

export default BrandLogo;
