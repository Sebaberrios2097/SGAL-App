import {
  Boxes, Check, ChevronRight, CircleHelp, Folder, LockKeyhole, Puzzle, ShieldCheck, X
} from 'lucide-react';
import { useMemo, useState } from 'react';

// Compatibilidad temporal con una API anterior que solo devolvía el contador.
// La API actual entrega nombre, descripción y criticidad de cada capacidad.
const LEGACY_FEATURES = {
  configuracion_sistema: ['Ver identidad de la organización', 'Editar identidad de la organización', 'Administrar módulos de la instalación'],
  usuarios: ['Ver empleados', 'Crear empleados', 'Editar datos de empleados', 'Crear cuentas de usuario', 'Editar cuentas de usuario', 'Activar o desactivar usuarios', 'Asignar roles a usuarios', 'Restablecer contraseñas', 'Ver roles', 'Crear roles', 'Editar roles', 'Eliminar roles', 'Asignar permisos a roles'],
  inventario: ['Ver productos', 'Crear productos', 'Editar productos', 'Cambiar estado de productos', 'Ver categorías de producto', 'Crear categorías de producto', 'Editar categorías de producto', 'Cambiar estado de categorías'],
  recetas: ['Ver recetas', 'Editar recetas y sus materias primas', 'Ver materias primas', 'Crear materias primas', 'Editar materias primas', 'Eliminar materias primas', 'Ingresar stock', 'Ver presentaciones', 'Crear presentaciones', 'Editar presentaciones', 'Eliminar presentaciones', 'Ver unidades de medida', 'Crear unidades de medida', 'Editar unidades de medida', 'Eliminar unidades de medida', 'Ver categorías de materia prima', 'Crear categorías de materia prima', 'Editar categorías de materia prima', 'Eliminar categorías de materia prima', 'Ver marcas', 'Crear marcas', 'Editar marcas', 'Eliminar marcas', 'Ver ingredientes extra', 'Crear ingredientes extra', 'Editar ingredientes extra y sus recargos', 'Activar o desactivar ingredientes extra'],
  ordenes_compra: ['Ver proveedores', 'Crear proveedores', 'Editar proveedores', 'Cambiar estado de proveedores', 'Ver órdenes de compra', 'Crear órdenes de compra', 'Editar órdenes de compra', 'Emitir órdenes de compra', 'Recibir órdenes y actualizar stock', 'Confirmar precios de venta', 'Cancelar órdenes de compra', 'Exportar órdenes de compra'],
  turnos: ['Ver turnos propios', 'Ver datos operacionales del turno', 'Abrir turno', 'Cerrar turno', 'Ver configuración de cortesía', 'Editar política de cortesía', 'Crear productos de cortesía', 'Editar productos de cortesía', 'Cambiar estado de productos de cortesía', 'Registrar consumos', 'Anular consumos', 'Ver registros de turnos', 'Ver panel analítico de turnos', 'Ver ventas históricas', 'Marcar consumos de empleados como pagados'],
  ventas: ['Ver panel administrativo', 'Acceder al punto de venta', 'Crear ventas', 'Crear ventas con Point', 'Ver ventas propias', 'Abrir y cerrar turnos', 'Configurar cuadratura', 'Ver bitácora', 'Registrar consumos de empleados', 'Ver registros y ventas por turno', 'Aplicar descuentos', 'Ver descuentos', 'Crear descuentos', 'Cambiar estado de descuentos', 'Eliminar descuentos', 'Reimprimir comprobantes de ventas', 'Anular ventas'],
  bitacora: ['Ver bitácora propia', 'Editar observaciones', 'Registrar extracciones', 'Ver bitácoras históricas'],
  comandas: ['Gestionar comandas']
};

const featuresFor = (module) => {
  const apiFeatures = module.funcionalidades || module.permisos || module.features || [];
  if (apiFeatures.length) return apiFeatures;
  return (LEGACY_FEATURES[module.codigo] || []).map((nombre, index) => ({
    codigo: `${module.codigo}.legacy.${index}`,
    nombre,
    descripcion: null,
    esCritico: false
  }));
};

const GROUP_ORDER = {
  configuracion_sistema: ['Identidad de la organización', 'Módulos de la instalación'],
  usuarios: ['Empleados', 'Cuentas de usuario', 'Contraseñas', 'Roles y permisos'],
  inventario: ['Productos', 'Categorías de producto', 'Inventario simple'],
  recetas: ['Recetas', 'Materias primas', 'Ingredientes extra', 'Presentaciones', 'Unidades de medida', 'Categorías de materia prima', 'Marcas', 'Existencias', 'Configuración de materiales'],
  ordenes_compra: ['Proveedores', 'Órdenes de compra'],
  turnos: ['Operación de turnos', 'Cortesías', 'Consumos de usuarios', 'Registros administrativos'],
  ventas: ['Panel administrativo', 'Punto de venta', 'Operación de turnos', 'Bitácora', 'Consumos de usuarios', 'Cortesías', 'Registros administrativos', 'Descuentos', 'Ingredientes extra', 'Comprobantes'],
  bitacora: ['Bitácora'],
  comandas: ['Comandas']
};

const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const fallbackGroupFor = (moduleCode, feature) => {
  if (feature.grupo) return feature.grupo;
  const text = normalized(`${feature.codigo} ${feature.nombre}`);
  if (moduleCode === 'configuracion_sistema') return text.includes('modulo') ? 'Módulos de la instalación' : 'Identidad de la organización';
  if (moduleCode === 'usuarios') {
    if (text.includes('rol') || text.includes('permiso')) return 'Roles y permisos';
    if (text.includes('contrasena')) return 'Contraseñas';
    if (text.includes('empleado')) return 'Empleados';
    return 'Cuentas de usuario';
  }
  if (moduleCode === 'inventario') {
    // Primero se usan los prefijos técnicos para no mezclar recursos con nombres
    // parecidos (p. ej. categorías de producto y categorías de materia prima).
    if (text.includes('inventario.categorias.') || text.includes('categoria de producto') || text.includes('categorias de producto')) return 'Categorías de producto';
    if (text.includes('inventario.productos.') || text.includes('producto')) return 'Productos';
    return 'Inventario simple';
  }
  if (moduleCode === 'recetas') {
    if (text.includes('categorias_materia') || text.includes('categoria de materia') || text.includes('categorias de materia')) return 'Categorías de materia prima';
    if (text.includes('materias_primas') || text.includes('materia prima') || text.includes('materias primas')) return 'Materias primas';
    if (text.includes('ingrediente extra')) return 'Ingredientes extra';
    if (text.includes('.presentaciones.') || text.includes('presentacion')) return 'Presentaciones';
    if (text.includes('.unidades.') || text.includes('unidad de medida')) return 'Unidades de medida';
    if (text.includes('.marcas.') || text.includes('marca')) return 'Marcas';
    if (text.includes('recetas.') || text.includes('receta')) return 'Recetas';
    if (text.includes('.stock.') || text.includes('stock') || text.includes('existencia')) return 'Existencias';
    return 'Configuración de materiales';
  }
  if (moduleCode === 'ordenes_compra') return text.includes('proveedor') ? 'Proveedores' : 'Órdenes de compra';
  if (moduleCode === 'turnos') {
    if (text.includes('registro') || text.includes('historica') || text.includes('panel analitico') || text.includes('pagado')) return 'Registros administrativos';
    if (text.includes('bitacora') || text.includes('consumo') || text.includes('observacion') || text.includes('extraccion')) return 'Bitácora';
    if (text.includes('cortesia')) return 'Cortesías';
    return 'Operación de turnos';
  }
  if (moduleCode === 'bitacora') return 'Bitácora';
  if (moduleCode === 'comandas') return 'Comandas';
  if (moduleCode === 'ventas') {
    if (text.includes('panel administrativo')) return 'Panel administrativo';
    if (text.includes('registros_turnos') || text.includes('registro') || text.includes('historica') || text.includes('panel analitico') || text.includes('pagado')) return 'Registros administrativos';
    if (text.includes('bitacora.consumos') || text.includes('consumo')) return 'Consumos de usuarios';
    if (text.includes('bitacora') || text.includes('extraccion') || text.includes('observacion')) return 'Bitácora';
    if (text.includes('turnos.') || text.includes('turno')) return 'Operación de turnos';
    if (text.includes('cortesia')) return 'Cortesías';
    if (text.includes('descuento')) return 'Descuentos';
    if (text.includes('ingrediente extra')) return 'Ingredientes extra';
    if (text.includes('comanda')) return 'Comandas';
    if (text.includes('comprobante') || text.includes('reimprimir')) return 'Comprobantes';
    return 'Punto de venta';
  }
  return 'Otras funcionalidades';
};

const groupFeatures = (module, features) => {
  const groups = new Map();
  features.forEach(feature => {
    const group = fallbackGroupFor(module.codigo, feature);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(feature);
  });
  const order = GROUP_ORDER[module.codigo] || [];
  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
      || left.localeCompare(right, 'es');
  });
};

const ModuleCatalog = ({ modules, onChange, readOnly = false, configurationByCode = {} }) => {
  const [detail, setDetail] = useState(null);
  const namesByCode = useMemo(
    () => Object.fromEntries(modules.map(module => [module.codigo, module.nombre])),
    [modules]
  );

  const toggle = (code) => {
    if (readOnly) return;
    const target = modules.find(module => module.codigo === code);
    if (!target || target.esNucleo) return;

    const enabled = new Set(modules.filter(module => module.habilitado).map(module => module.codigo));
    if (!target.habilitado) {
      const enableWithDependencies = (moduleCode) => {
        enabled.add(moduleCode);
        const current = modules.find(module => module.codigo === moduleCode);
        current?.dependencias?.forEach(enableWithDependencies);
      };
      enableWithDependencies(code);
    } else {
      const disableWithDependants = (moduleCode) => {
        enabled.delete(moduleCode);
        modules
          .filter(module => !module.esNucleo && module.dependencias?.includes(moduleCode))
          .forEach(module => disableWithDependants(module.codigo));
      };
      disableWithDependants(code);
    }
    onChange(modules.map(module => ({
      ...module,
      habilitado: module.esNucleo || enabled.has(module.codigo)
    })));
  };

  const renderGroup = (title, description, items, core) => (
    <section className="module-group" key={title}>
      <div className="module-group-heading">
        <div className={`module-group-icon ${core ? 'is-core' : ''}`}>
          {core ? <ShieldCheck size={21} /> : <Puzzle size={21} />}
        </div>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="module-group-count">{items.length}</span>
      </div>
      <div className="module-card-grid">
        {items.map(module => (
          <article
            key={module.codigo}
            className={`module-option-card ${module.habilitado ? 'is-enabled' : ''} ${module.esNucleo ? 'is-core' : ''}`}
          >
            <div className="module-option-topline">
              <button
                type="button"
                className={`module-switch ${module.habilitado ? 'is-on' : ''}`}
                aria-label={`${module.habilitado ? 'Desactivar' : 'Activar'} ${module.nombre}`}
                aria-pressed={module.habilitado}
                disabled={module.esNucleo || readOnly}
                onClick={() => toggle(module.codigo)}
              >
                <span>{module.habilitado && <Check size={13} />}</span>
              </button>
              <div className="module-option-status">
                {module.esNucleo ? <><LockKeyhole size={13} /> Esencial</> : module.habilitado ? 'Habilitado' : 'No habilitado'}
              </div>
            </div>
            <div className="module-option-icon"><Boxes size={23} /></div>
            <h4>{module.nombre}</h4>
            <p>{module.descripcion || 'Capacidad funcional de la aplicación.'}</p>
            {module.dependencias?.length > 0 && (
              <div className="module-dependencies">
                Requiere {module.dependencias.map(code => namesByCode[code] || code).join(', ')}
              </div>
            )}
            {module.habilitado && configurationByCode[module.codigo] && (
              <div className="module-inline-configuration">
                {configurationByCode[module.codigo]}
              </div>
            )}
            <button type="button" className="module-detail-button" onClick={() => setDetail(module)}>
              Ver funcionalidades <ChevronRight size={15} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const coreModules = modules.filter(module => module.esNucleo);
  const optionalModules = modules.filter(module => !module.esNucleo);
  const detailFeatures = detail ? featuresFor(detail) : [];
  const detailGroups = detail ? groupFeatures(detail, detailFeatures) : [];

  return <>
    <div className="module-catalog">
      {renderGroup('Módulos nucleares', 'Base obligatoria para la configuración, los accesos y la gestión logística de inventario y compras.', coreModules, true)}
      {renderGroup('Módulos opcionales', 'Active solo las áreas que formarán parte de esta instalación.', optionalModules, false)}
    </div>

    {detail && (
      <div className="module-modal-backdrop" role="presentation" onMouseDown={() => setDetail(null)}>
        <section
          className="module-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="module-detail-title"
          onMouseDown={event => event.stopPropagation()}
        >
          <button type="button" className="module-modal-close" aria-label="Cerrar" onClick={() => setDetail(null)}><X size={20} /></button>
          <div className="module-modal-hero">
            <div className="module-option-icon"><Boxes size={26} /></div>
            <div>
              <span className="module-modal-eyebrow">{detail.esNucleo ? 'Módulo nuclear' : 'Módulo opcional'}</span>
              <h2 id="module-detail-title">{detail.nombre}</h2>
            </div>
          </div>
          <p className="module-modal-description">{detail.descripcion}</p>
          {detail.dependencias?.length > 0 && (
            <div className="module-modal-notice"><CircleHelp size={18} />
              <span>Al habilitarlo también se necesitan: <strong>{detail.dependencias.map(code => namesByCode[code] || code).join(', ')}</strong>.</span>
            </div>
          )}
          <h3>Funcionalidades y accesos incluidos <span className="module-feature-count">{detailFeatures.length}</span></h3>
          <div className="module-feature-groups">
            {detailGroups.length ? detailGroups.map(([group, features]) => (
              <section className="module-feature-group" key={group}>
                <div className="module-feature-group-heading"><Folder size={16} /><strong>{group}</strong><span>{features.length}</span></div>
                <div className="module-feature-list">
                  {features.map(feature => (
                    <div className="module-feature" key={feature.codigo}>
                      <span><Check size={14} /></span>
                      <div><strong>{feature.nombre}</strong>{feature.descripcion && <p>{feature.descripcion}</p>}{feature.esCritico && <small>Acción sensible</small>}</div>
                    </div>
                  ))}
                </div>
              </section>
            )) : <p className="module-empty-features">Este módulo no incorpora acciones adicionales para los usuarios.</p>}
          </div>
          <div className="module-modal-footer">
            <span>Estas capacidades quedan disponibles para asignarlas a los roles correspondientes.</span>
            {!detail.esNucleo && !readOnly && <button type="button" className="btn btn-primary" onClick={() => { toggle(detail.codigo); setDetail(null); }}>
              {detail.habilitado ? 'Deshabilitar módulo' : 'Habilitar módulo'}
            </button>}
          </div>
        </section>
      </div>
    )}
  </>;
};

export default ModuleCatalog;
