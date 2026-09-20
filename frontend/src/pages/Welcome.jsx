import { ArrowRight, Building2, Compass, MousePointer2, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const Welcome = () => {
  const { user, can } = useAuth();
  const { displayName, hasConfiguredIdentity } = useOrganization();
  useDocumentTitle('Bienvenida');
  const firstName = user?.empleado?.alias || user?.empleado?.nombres?.split(' ')[0] || user?.nombreUsuario;

  return <div className="welcome-page animate-fade-in">
    <section className="welcome-hero">
      <div className="welcome-orbit welcome-orbit-one" /><div className="welcome-orbit welcome-orbit-two" />
      <div className="welcome-icon"><Compass size={32} /></div>
      <span className="welcome-eyebrow">{hasConfiguredIdentity ? displayName : 'Espacio de trabajo'}</span>
      <h1>Hola, {firstName}</h1>
      <p>Seleccione una opción del menú lateral para comenzar a interactuar con el sistema.</p>
      <div className="welcome-hint"><MousePointer2 size={18} /> Sus herramientas disponibles aparecen organizadas a la izquierda.</div>
    </section>
    {can('configuracion_sistema.marca.editar') && !hasConfiguredIdentity && (
      <section className="welcome-setup-card">
        <div className="welcome-setup-icon"><Building2 size={24} /></div>
        <div><span>Personalice la experiencia</span><h2>Agregue la identidad de su empresa</h2><p>Configure el nombre, logotipo y colores para que este espacio represente a su organización.</p></div>
        <Link className="btn btn-secondary" to="/settings/organization"><Palette size={17} /> Configurar identidad <ArrowRight size={16} /></Link>
      </section>
    )}
  </div>;
};

export default Welcome;
