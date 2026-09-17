# Catálogo de módulos de SGAL App

Fecha de revisión: 16 de septiembre de 2026.

SGAL App utiliza tres niveles complementarios:

1. **Catálogo del producto:** define qué módulos existen, su descripción y dependencias.
2. **Instalación del cliente:** determina cuáles de esos módulos están habilitados para esa empresa.
3. **Roles y permisos:** establece qué acciones puede realizar cada usuario dentro de los módulos habilitados.

Deshabilitar un módulo bloquea sus permisos en la API aunque un rol todavía los tenga asignados. Los módulos de núcleo no se pueden deshabilitar.

## Módulos de núcleo

| Código | Nombre | Descripción |
|---|---|---|
| `configuracion_sistema` | Configuración del sistema | Identidad visual de la empresa y administración de módulos contratados. |
| `inicio` | Inicio | Panel principal y resumen administrativo. |
| `usuarios` | Usuarios | Empleados, cuentas, estados, credenciales y asignación de roles. |
| `roles` | Roles y permisos | Catálogo de roles y permisos granulares. |

## Módulos opcionales disponibles

| Código | Nombre comercial | Descripción | Depende de |
|---|---|---|---|
| `inventario` | Inventario | Productos, materias primas, existencias, movimientos y descuentos. | — |
| `configuracion_inventario` | Configuración de inventario | Categorías, unidades de medida, marcas, presentaciones y reglas operativas. | `inventario` |
| `recetas` | Recetas | Composición de productos y consumo de materias primas. | `inventario`, `configuracion_inventario` |
| `ingredientes_extra` | Ingredientes extra | Materias primas que pueden agregarse opcionalmente a una venta. | `inventario`, `configuracion_inventario` |
| `proveedores` | Proveedores | Registro de proveedores y sus datos comerciales. | — |
| `ordenes_compra` | Órdenes de compra | Solicitud, exportación, recepción y costeo de compras. | `proveedores`, `inventario`, `configuracion_inventario` |
| `turnos` | Turnos operativos | Apertura, cierre, arqueo, extracciones, consumos del vendedor, cortesías e historial del turno. | `usuarios` |
| `ventas` | Ventas / punto de venta | Registro de ventas, medios de pago, descuentos, anulaciones y comprobantes. | `turnos`, `inventario` |
| `bitacora` | Bitácora | Novedades, pérdidas y consumos registrados durante un turno. | `turnos`, `inventario` |
| `registros_turnos` | Registros administrativos | Calendario, consulta y auditoría histórica de turnos. | `turnos` |
| `integraciones` | Integraciones | Conectores con servicios externos, actualmente Mercado Pago Point. | `ventas` |

El detalle de cada acción y su permiso está en [MATRIZ_MODULOS_PERMISOS.md](../MATRIZ_MODULOS_PERMISOS.md).

## Módulos previstos, todavía no implementados

Estos módulos corresponden a la evolución logística planteada y no deben venderse aún como funcionalidad existente:

| Código sugerido | Alcance esperado |
|---|---|
| `clientes` | Empresas o personas compradoras, contactos, direcciones y condiciones comerciales. |
| `pedidos` | Solicitudes de clientes, líneas de producto, fechas comprometidas y estados. |
| `preparacion` | Empaquetamiento, responsables, incidencias y control de avance. |
| `despachos` | Envíos, transportista, seguimiento, entrega y evidencia de recepción. |
| `devoluciones` | Rechazos, devoluciones y reintegro o merma de existencias. |

## Cómo añadir un módulo

1. Definir un código estable en minúsculas y una descripción orientada al cliente.
2. Agregar el módulo y sus dependencias mediante un script versionado en `DatabaseChanges`.
3. Crear permisos con el formato `modulo.recurso.accion` y proteger todos los endpoints correspondientes.
4. Añadir rutas y opciones de navegación condicionadas por esos permisos.
5. Verificar que el módulo deshabilitado no exponga operaciones desde la API, no solo que se oculte en pantalla.
6. Actualizar este catálogo y la matriz de permisos.
7. Agregar pruebas de autorización, dependencias y regresión funcional.

La activación de módulos es configuración comercial; los permisos continúan siendo configuración operacional de cada cliente.
