import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const defaultBranding = {
  nombreComercial: 'SGAL App',
  razonSocial: null,
  descripcion: 'Sistema de Gestión, Administración y Logística',
  textoPieDocumentos: 'Gracias por su preferencia.',
  contactoPublico: null,
  colorPrimario: '#1F4E5F',
  colorSecundario: '#163A47',
  colorAcento: '#D97706',
  colorFondo: '#F8FAFC'
};

const OrganizationContext = createContext(null);

const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`;
};

export const OrganizationProvider = ({ children }) => {
  const [branding, setBranding] = useState(defaultBranding);
  const [logoVersions, setLogoVersions] = useState({});
  const [enabledModules, setEnabledModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadConfiguration = useCallback(async () => {
    try {
      const response = await fetch('/api/organization-configuration/public', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar la configuración de la organización.');
      const data = await response.json();
      setBranding({ ...defaultBranding, ...(data.branding || {}) });
      setLogoVersions(data.logos || {});
      setEnabledModules(data.modulosHabilitados || []);
    } catch (error) {
      console.error(error);
      setBranding(defaultBranding);
      setLogoVersions({});
      setEnabledModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfiguration(); }, [loadConfiguration]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', branding.colorPrimario);
    root.style.setProperty('--primary-hover', branding.colorSecundario);
    root.style.setProperty('--accent-color', branding.colorAcento);
    root.style.setProperty('--bg-color', branding.colorFondo);
    root.style.setProperty('--primary-rgb', hexToRgb(branding.colorPrimario));
    root.style.setProperty('--primary-glow', `rgba(${hexToRgb(branding.colorPrimario)}, 0.12)`);
    document.title = branding.nombreComercial;
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
      favicon.href = logoVersions.favicon
        ? `/api/organization-configuration/logo/favicon?v=${encodeURIComponent(logoVersions.favicon)}`
        : '/favicon.svg';
    }
    window.__SGAL_CONFIGURATION__ = { branding, logoVersions, enabledModules };
  }, [branding, logoVersions, enabledModules]);

  const value = useMemo(() => ({
    branding,
    logoVersions,
    enabledModules,
    loading,
    hasLogo: (location) => Boolean(logoVersions[location]),
    getLogoUrl: (location) => logoVersions[location]
      ? `/api/organization-configuration/logo/${location}?v=${encodeURIComponent(logoVersions[location])}`
      : null,
    isModuleEnabled: (code) => enabledModules.includes(code),
    refreshConfiguration: loadConfiguration
  }), [branding, logoVersions, enabledModules, loading, loadConfiguration]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
};

export const useOrganization = () => useContext(OrganizationContext);
