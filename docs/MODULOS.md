# Catálogo de módulos

Fecha de revisión: 20 de septiembre de 2026.

La configuración se divide en tres niveles:

1. **Módulos:** dominios amplios que una instalación contrata o habilita.
2. **Permisos:** acciones específicas disponibles dentro de cada módulo.
3. **Roles:** conjuntos de permisos entregados a cada usuario.

Un módulo no debe representar una sola pantalla o tabla. Si dos capacidades siempre pertenecen al mismo dominio y solo necesitan autorizaciones diferentes, se mantienen como permisos del mismo módulo. Deshabilitar un módulo bloquea todos sus permisos en la API, aunque un rol todavía los tenga asignados.

## Módulos nucleares

| Código | Nombre | Funcionalidad incluida |
|---|---|---|
| `configuracion_sistema` | Configuración del sistema | Identidad de la organización, logos, colores, fondos y selección de módulos. |
| `usuarios` | Usuarios y accesos | Empleados, cuentas, estados, contraseñas, roles y asignación granular de permisos. |
| `inventario` | Inventario | Productos terminados, categorías y stock simple por unidades; base logística apropiada para reventa. |
| `ordenes_compra` | Compras y proveedores | Proveedores, órdenes de compra, emisión, exportación, recepción, costos y actualización de stock. |

Los módulos nucleares no se pueden deshabilitar. Inventario y Compras y proveedores forman una única base logística: las compras actualizan las existencias y el inventario proporciona los productos que se compran.

## Módulos opcionales

| Código | Nombre comercial | Funcionalidad incluida | Depende de |
|---|---|---|---|
| `recetas` | Recetas y materiales | Materias primas, recetas, unidades, presentaciones, marcas, ingredientes extra y consumo de materiales. | `inventario` |
| `turnos` | Turnos | Apertura, cierre, arqueo, cortesías, bitácora, consumos, extracciones, historial y registros administrativos. | `usuarios` |
| `ventas` | Ventas | Punto de venta, descuentos, medios de pago, comandas, anulaciones, comprobantes y panel administrativo. Exige un turno abierto únicamente cuando el módulo Turnos está habilitado. | `inventario` |

El módulo de Integraciones se retiró temporalmente del catálogo. Sus permisos quedaron inactivos hasta definir un apartado exclusivo para el rol Desarrollador y su modelo de operación.

## Consolidaciones realizadas

Los códigos de permisos se conservan para no romper roles, endpoints ni instalaciones existentes, aunque su prefijo histórico ya no coincida con el módulo que los contiene.

| Módulos anteriores | Módulo actual | Motivo |
|---|---|---|
| `roles` | `usuarios` | Roles y permisos son parte del control de acceso de usuarios. |
| `configuracion_inventario`, `ingredientes_extra` | `recetas` | Forman la capa avanzada de composición y consumo de materiales. |
| `proveedores` | `ordenes_compra` | El maestro de proveedores forma parte del ciclo de compras. |
| `bitacora`, `registros_turnos` | `turnos` | Solo existen en el contexto operacional o histórico de un turno. |
| `inicio` | `ventas` | El panel administrativo resume la operación comercial y de turnos. |

En particular, los permisos `inventario.descuentos.*` aparecen dentro de **Ventas**, mientras que `inventario.productos.*` e `inventario.categorias.*` permanecen en **Inventario**.

Ventas puede funcionar de manera autónoma. Con **Turnos** habilitado, cada venta exige un turno abierto y participa en la cuadratura; sin **Turnos**, la venta se registra directamente a nombre del usuario y el panel omite indicadores de apertura, cierre y diferencia de caja.

Esta separación permite que comercios de reventa —por ejemplo, una botillería— utilicen productos con stock unitario sin habilitar recetas ni materias primas. Cafeterías, cocinas u otros negocios que transforman insumos pueden habilitar adicionalmente **Recetas y materiales**.

## Cómo añadir o dividir un módulo

Un nuevo módulo solo se justifica cuando al menos una de estas condiciones es cierta:

- puede contratarse y operar razonablemente sin otro dominio;
- necesita una dependencia o despliegue claramente diferente;
- representa una frontera comercial estable, no una pantalla aislada;
- deshabilitarlo debe retirar un conjunto coherente de capacidades.

Para incorporarlo:

1. Definir un código estable y una descripción orientada al cliente.
2. Agregar el módulo y sus dependencias mediante un script versionado.
3. Asociar cada permiso al módulo, manteniendo reglas de negocio adicionales.
4. Condicionar rutas y navegación por permisos efectivos.
5. Verificar en la API que un módulo deshabilitado bloquee sus operaciones.
6. Actualizar este catálogo y la matriz de permisos.

La activación de módulos es una decisión comercial. Los permisos continúan siendo la unidad de control operacional.
