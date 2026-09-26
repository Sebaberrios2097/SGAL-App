import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backgroundStyleFor, hexToRgb } from '../utils/backgroundStyle';

const defaultBranding = {
  nombreComercial: 'SGAL App',
  razonSocial: null,
  descripcion: 'Sistema de Gestión, Administración y Logística',
  textoPieDocumentos: 'Gracias por su preferencia.',
  contactoPublico: null,
  colorPrimario: '#1F4E5F',
  colorSecundario: '#163A47',
  colorAcento: '#D97706',
  colorFondo: '#F8FAFC',
  boletaMuestraVendedor: true,
  boletaMuestraPago: true,
  boletaColaPersonalizada: null,
  valeIncluyeCodigoBarra: false,
  posAgruparPorCategoria: true,
  posOrdenProductos: 'nombre',
  posOrdenDireccion: 'asc',
  posMostrarBuscador: true,
  posMostrarCategorias: true,
  posPermitirVentaSinStock: false,
  cajaMostrarBotonesEfectivo: true,
  cajaRequiereCuadratura: true,
  cajaPropinasHabilitadas: false,
  jornadaHoraApertura: '06:00:00',
  jornadaHoraCierre: '02:00:00'
};

const OrganizationContext = createContext(null);

export const OrganizationProvider = ({ children }) => {
  const [branding, setBranding] = useState(defaultBranding);
  const [logoVersions, setLogoVersions] = useState({});
  const [enabledModules, setEnabledModules] = useState([]);
  const [backgrounds, setBackgrounds] = useState({});
  const [loading, setLoading] = useState(true);
  const hasConfiguredIdentity = Boolean(
    branding.nombreComercial?.trim() && branding.nombreComercial.trim().toLowerCase() !== 'sgal app'
  );
  const displayName = hasConfiguredIdentity ? branding.nombreComercial.trim() : 'Sistema de gestión';

  const loadConfiguration = useCallback(async () => {
    try {
      const response = await fetch('/api/organization-configuration/public', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible cargar la configuración de la organización.');
      const data = await response.json();
      setBranding({ ...defaultBranding, ...(data.branding || {}) });
      setLogoVersions(data.logos || {});
      setEnabledModules(data.modulosHabilitados || []);
      setBackgrounds(Object.fromEntries((data.fondos || []).map(f => [f.zona, f])));
    } catch (error) {
      console.error(error);
      setBranding(defaultBranding);
      setLogoVersions({});
      setEnabledModules([]);
      setBackgrounds({});
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
    document.title = displayName;
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
      favicon.href = logoVersions.favicon
        ? `/api/organization-configuration/logo/favicon?v=${encodeURIComponent(logoVersions.favicon)}`
        : '/favicon.svg';
    }
    window.__SGAL_CONFIGURATION__ = {
      branding: { ...branding, nombreComercial: displayName },
      logoVersions,
      enabledModules,
      backgrounds
    };
  }, [branding, displayName, logoVersions, enabledModules, backgrounds]);

  const getBackgroundStyle = useCallback(
    (zona) => backgroundStyleFor(backgrounds[zona]),
    [backgrounds]);

  const value = useMemo(() => ({
    branding,
    displayName,
    hasConfiguredIdentity,
    logoVersions,
    enabledModules,
    backgrounds,
    loading,
    hasLogo: (location) => Boolean(logoVersions[location]),
    getLogoUrl: (location) => logoVersions[location]
      ? `/api/organization-configuration/logo/${location}?v=${encodeURIComponent(logoVersions[location])}`
      : null,
    isModuleEnabled: (code) => enabledModules.includes(code),
    turnsRequireReconciliation: branding.turnosRequierenCuadratura ?? true,
    logbookIncludesCalibration: branding.bitacoraIncluyeCalibracion ?? true,
    receiptShowSeller: branding.boletaMuestraVendedor ?? true,
    receiptShowPayment: branding.boletaMuestraPago ?? true,
    receiptCustomFooter: branding.boletaColaPersonalizada ?? null,
    receiptShowBarcode: branding.valeIncluyeCodigoBarra ?? false,
    posGroupByCategory: branding.posAgruparPorCategoria ?? true,
    posSortField: branding.posOrdenProductos ?? 'nombre',
    posSortDirection: branding.posOrdenDireccion ?? 'asc',
    posShowSearch: branding.posMostrarBuscador ?? true,
    posShowCategories: branding.posMostrarCategorias ?? true,
    posAllowSaleWithoutStock: branding.posPermitirVentaSinStock ?? false,
    cajaShowCashButtons: branding.cajaMostrarBotonesEfectivo ?? true,
    cajaRequireReconciliation: branding.cajaRequiereCuadratura ?? true,
    cajaTipsEnabled: branding.cajaPropinasHabilitadas ?? false,
    workdayOpening: branding.jornadaHoraApertura ?? '06:00:00',
    workdayClosing: branding.jornadaHoraCierre ?? '02:00:00',
    getBackgroundStyle,
    refreshConfiguration: loadConfiguration
  }), [branding, displayName, hasConfiguredIdentity, logoVersions, enabledModules, backgrounds, loading, getBackgroundStyle, loadConfiguration]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
};

export const useOrganization = () => useContext(OrganizationContext);
