// Utilidades de identidad visual.

export const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
};

// URL pública de la imagen de fondo de una zona (con parámetro de versión para
// invalidar la caché cuando se reemplaza la imagen).
export const backgroundImageUrl = (zona, version) =>
  `/api/organization-configuration/background/${zona}${version ? `?v=${encodeURIComponent(version)}` : ''}`;

// Estilo CSS del fondo de una zona a partir de su configuración. Devuelve null si
// la zona no tiene imagen o no está habilitada (ignoreEnabled fuerza el estilo
// para previsualizar en administración).
export const backgroundStyleFor = (config, { ignoreEnabled = false } = {}) => {
  if (!config || !config.tieneImagen) return null;
  if (!ignoreEnabled && !config.habilitado) return null;
  return {
    backgroundImage: `url(${backgroundImageUrl(config.zona, config.version)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  };
};
