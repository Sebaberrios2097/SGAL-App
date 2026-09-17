import { useEffect, useMemo, useState } from 'react';
import { useOrganization } from '../context/OrganizationContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Carta pública de productos. Accesible sin sesión ni permisos (pensada para
// clientes que abren el enlace desde un código QR). Solo se muestra cuando el
// módulo de ventas está habilitado y existen productos activos.
const formatPrice = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

const Menu = () => {
  const { branding, getBackgroundStyle, getLogoUrl } = useOrganization();
  const [state, setState] = useState({ status: 'loading', categorias: [], motivo: null });
  useDocumentTitle('Carta');

  useEffect(() => {
    let active = true;
    fetch('/api/menu', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('No fue posible cargar la carta.')))
      .then(data => {
        if (!active) return;
        setState(data.disponible
          ? { status: 'ready', categorias: data.categorias || [], motivo: null }
          : { status: 'unavailable', categorias: [], motivo: data.motivo });
      })
      .catch(() => { if (active) setState({ status: 'error', categorias: [], motivo: null }); });
    return () => { active = false; };
  }, []);

  const backgroundStyle = useMemo(() => getBackgroundStyle('carta'), [getBackgroundStyle]);
  const logoUrl = getLogoUrl('login');

  return (
    <div className="carta-page" style={backgroundStyle || undefined}>
      <div className={`carta-overlay${backgroundStyle ? ' carta-overlay--image' : ''}`}>
        <header className="carta-header">
          {logoUrl && <img className="carta-logo" src={logoUrl} alt={branding.nombreComercial} />}
          <h1 className="carta-title">{branding.nombreComercial}</h1>
          {branding.descripcion && <p className="carta-subtitle">{branding.descripcion}</p>}
        </header>

        <main className="carta-content">
          {state.status === 'loading' && <p className="carta-message">Cargando la carta…</p>}

          {state.status === 'error' && (
            <p className="carta-message">No fue posible cargar la carta. Vuelve a intentarlo más tarde.</p>
          )}

          {state.status === 'unavailable' && (
            <p className="carta-message">La carta no está disponible en este momento.</p>
          )}

          {state.status === 'ready' && state.categorias.map(categoria => (
            <section key={categoria.idCategoria} className="carta-category">
              <h2 className="carta-category-title">{categoria.nombre}</h2>
              <div className="carta-products">
                {categoria.productos.map(producto => (
                  <article key={producto.idProducto} className="carta-card">
                    {producto.tieneImagen && (
                      <img
                        className="carta-card-image"
                        src={`/api/menu/product/${producto.idProducto}/image`}
                        alt={producto.nombre}
                        loading="lazy"
                      />
                    )}
                    <div className="carta-card-body">
                      <div className="carta-card-head">
                        <h3 className="carta-card-name">{producto.nombre}</h3>
                        <span className="carta-card-price">{formatPrice(producto.precio)}</span>
                      </div>
                      {producto.stock != null && (
                        <span className={`carta-card-stock${producto.stock <= 0 ? ' carta-card-stock--out' : ''}`}>
                          {producto.stock <= 0 ? 'Agotado' : `Stock: ${producto.stock}`}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </main>

        {branding.contactoPublico && (
          <footer className="carta-footer">{branding.contactoPublico}</footer>
        )}
      </div>
    </div>
  );
};

export default Menu;
