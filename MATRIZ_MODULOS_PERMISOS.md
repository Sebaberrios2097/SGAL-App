# Inventario de módulos, funcionalidades y permisos

Fecha del levantamiento: 11 de septiembre de 2026.

Este documento refleja las pantallas y endpoints existentes actualmente en `frontend/src` y `SgalApp.Api/Controllers`. No incluye entidades de base de datos que todavía no tienen una funcionalidad expuesta en la aplicación. La disponibilidad final de cada permiso depende además de que el módulo esté habilitado para la instalación del cliente.

## Convención utilizada

Cada permiso debe representar una acción concreta y estable, con el formato `modulo.recurso.accion`. Los nombres de rol (por ejemplo, `ADMINISTRADOR` o `BARISTA/VENDEDOR`) no deben participar en la autorización.

Los niveles que verá el administrador pueden construirse como conjuntos de permisos:

- **Solo lectura:** permisos `.ver`, `.listar` y, cuando corresponda, `.exportar`.
- **Modificación parcial:** lectura más un subconjunto explícito de acciones, como `.crear` y `.editar`, sin acciones sensibles.
- **Control total:** todos los permisos asignables del módulo.

No conviene guardar solamente un nivel genérico `LECTURA/EDICION/TOTAL`, porque acciones como anular una venta, recibir una orden, modificar stock o restablecer contraseñas tienen riesgos diferentes.

## Resumen de módulos

| Código | Módulo visible | Pantallas principales | Control de acceso |
|---|---|---|---|
| `configuracion_sistema` | Configuración del sistema | `/settings/organization`, `/settings/modules` | Permisos `configuracion_sistema.*`; la administración de módulos está reservada al superusuario desarrollador |
| `inicio` | Inicio y panel administrativo | `/dashboard` | `inicio.dashboard.ver`; es el respaldo de `/` cuando el usuario no opera turnos |
| `usuarios` | Usuarios (empleados y externos) | `/employees`, `/employees/:id/edit` | Permisos modulares `usuarios.*` |
| `roles` | Roles | `/roles` | Permisos `roles.*` |
| `inventario` | Productos y descuentos (categorías en Configuración) | `/inventory`, `/settings/product-categories` | Permisos `inventario.*` |
| `recetas` | Recetas (una por producto, sin preparaciones base) | `/recipes`, `/inventory/products/:idProducto/recipe` | Permisos `recetas.*` |
| `ingredientes_extra` | Ingredientes extra (materias primas marcadas) | `/settings/extra-ingredients` | Permisos `ingredientes_extra.*` |
| `configuracion_inventario` | Parámetros de inventario | `/settings/:section` | Permisos `configuracion_inventario.*` |
| `proveedores` | Proveedores | `/providers` | Permisos `proveedores.*` |
| `ordenes_compra` | Órdenes de compra | `/purchase-orders`, `/purchase-orders/:id` | Permisos `ordenes_compra.*` |
| `registros_turnos` | Consulta administrativa de turnos | `/admin/turn-records` | Permisos `registros_turnos.*` |
| `turnos` | Operación e historial del turno propio | `/` (landing), `/turn`, `/turn-history` | Permisos `turnos.*` y reglas sobre el turno propio |
| `ventas` | Punto de venta | `/sales` | Permisos `ventas.*` y turno propio abierto cuando corresponde |
| `bitacora` | Bitácora del turno | `/logbook/:idTurno` | Permisos `bitacora.*` y reglas sobre el turno propio |
| `integraciones` | Integraciones externas | Sin pantalla independiente | Permisos `integraciones.*` |
| `sesion` | Inicio de sesión y contraseña | `/login` | Público / usuario identificado por la solicitud |

### Configuración de organización y módulos

| Funcionalidad | Permiso | Endpoint |
|---|---|---|
| Leer identidad pública y módulos habilitados | No asignable | `GET /api/organization-configuration/public` |
| Obtener el logo público | No asignable | `GET /api/organization-configuration/logo` |
| Ver la configuración de identidad | `configuracion_sistema.marca.ver` | `GET /api/organization-configuration/branding` |
| Editar identidad y colores | `configuracion_sistema.marca.editar` | `PUT /api/organization-configuration/branding` |
| Subir o eliminar logo | `configuracion_sistema.marca.editar` | `POST` / `DELETE /api/organization-configuration/branding/logo` |
| Ver y modificar módulos habilitados | `configuracion_sistema.modulos.administrar` | `GET` / `PUT /api/organization-configuration/modules` |

## Matriz completa de funcionalidades

### 1. Sesión y credenciales

| Funcionalidad actual | Permiso propuesto | Endpoint | Observación |
|---|---|---|---|
| Iniciar sesión | No asignable | `POST /api/auth/login` | Debe permanecer público y emitir una identidad autenticada |
| Cambiar la contraseña propia | `sesion.password.cambiar_propia` | `POST /api/auth/change-password` | Hoy comparte endpoint con el restablecimiento administrativo |
| Restablecer la contraseña de otro usuario | `usuarios.password.restablecer` | `POST /api/auth/change-password` | Conviene separar esta operación de la anterior |
| Cerrar sesión | No asignable | Solo frontend | Actualmente elimina la sesión guardada en `localStorage` |

### 2. Inicio y reportes administrativos

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Ver resumen mensual de ventas y turnos | `inicio.dashboard.ver` | `GET /api/admin-dashboard/monthly-summary` |
| Ver panel de turnos (dashboard analítico) | `registros_turnos.dashboard.ver` | `GET /api/admin-dashboard/turns-overview` |
| Ver calendario administrativo de turnos | `registros_turnos.ver` | `GET /api/admin-dashboard/turn-records/calendar` |
| Ver turnos de un día | `registros_turnos.ver` | `GET /api/admin-dashboard/turn-records/day` |
| Ver detalle de una bitácora histórica | `registros_turnos.bitacora.ver` | `GET /api/admin-dashboard/turn-records/logbook/{idBitacora}` |
| Ver ventas de un turno desde el registro | `registros_turnos.ventas.ver` | `GET /api/sale/turn/{idTurno}` |

### 3. Empleados y cuentas de acceso

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Listar empleados, cuentas, estado, contacto y roles | `usuarios.ver` | `GET /api/employee` |
| Ver el detalle de un empleado y su cuenta | `usuarios.ver` | `GET /api/employee/{id}` |
| Crear empleado | `usuarios.empleado.crear` | `POST /api/employee` |
| Editar los datos personales de un empleado | `usuarios.empleado.editar` | `PUT /api/employee/{id}` |
| Crear cuenta para un empleado | `usuarios.cuenta.crear` | `POST /api/employee/{rut}/create-user` |
| Cambiar el nombre de una cuenta | `usuarios.cuenta.editar` | `PUT /api/employee/{id}/user` |
| Activar o desactivar empleado/cuenta | `usuarios.estado.modificar` | `PUT /api/employee/{id}/status` |
| Asignar o quitar roles a una cuenta | `usuarios.roles.asignar` | `POST /api/role/users/{userId}/roles` |
| Restablecer contraseña | `usuarios.password.restablecer` | `POST /api/auth/change-password` |

La edición separa los permisos sobre datos personales, cuenta de acceso y contraseña para que cada rol pueda recibir solo la capacidad necesaria. La tabla `Emp_Empleados` aloja tanto a **empleados** de la organización como a **externos** (`Es_Externo`), que también acceden al sistema con sus roles. Cada registro indica su tipo de documento en `Tipo_Documento` (`RUN` persona natural / `RUT` empresa); el identificador sigue siendo obligatorio y único para todos.

### 4. Roles y permisos

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Listar roles | `roles.ver` | `GET /api/role` |
| Crear rol | `roles.crear` | `POST /api/role` |
| Cambiar nombre de rol | `roles.editar` | `PUT /api/role/{id}` |
| Eliminar rol sin asignaciones activas | `roles.eliminar` | `DELETE /api/role/{id}` |
| Ver catálogo modular de permisos | `roles.ver` | `GET /api/role/permissions/catalog` |
| Ver permisos asignados a un rol | `roles.ver` | `GET /api/role/{id}/permissions` |
| Configurar permisos de un rol | `roles.permisos.asignar` | `PUT /api/role/{id}/permissions` |

`roles.permisos.asignar` debe considerarse un permiso crítico. Un usuario que lo posea puede aumentar indirectamente las capacidades de otros usuarios y, dependiendo de las reglas, las propias.

### 5. Productos, categorías y descuentos

| Recurso | Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|---|
| Productos | Listar y ver stock/configuración (el código es opcional y no se muestra en la lista) | `inventario.productos.ver` | `GET /api/product` |
| Productos | Crear | `inventario.productos.crear` | `POST /api/product` |
| Productos | Editar | `inventario.productos.editar` | `PUT /api/product/{id}` |
| Productos | Activar o desactivar | `inventario.productos.estado.modificar` | `PUT /api/product/{id}/status` |
| Categorías de producto | Listar | `inventario.categorias.ver` | `GET /api/category` |
| Categorías de producto | Crear | `inventario.categorias.crear` | `POST /api/category` |
| Categorías de producto | Editar | `inventario.categorias.editar` | `PUT /api/category/{id}` |
| Categorías de producto | Activar o desactivar | `inventario.categorias.estado.modificar` | `PUT /api/category/{id}/status` |
| Descuentos | Listar | `inventario.descuentos.ver` | `GET /api/discount` |
| Descuentos | Crear y asociar a productos | `inventario.descuentos.crear` | `POST /api/discount` |
| Descuentos | Activar o desactivar | `inventario.descuentos.estado.modificar` | `PUT /api/discount/{id}/status` |
| Descuentos | Eliminar | `inventario.descuentos.eliminar` | `DELETE /api/discount/{id}` |

No existe actualmente un endpoint para editar un descuento; solo se puede crear, cambiar su estado o eliminarlo.

El mantenedor de **categorías de producto** se muestra en la sección **Configuración** del menú (`/settings/product-categories`, permiso `inventario.categorias.ver`), separado de la pantalla de productos. Los endpoints y permisos `inventario.categorias.*` no cambian.

### 6. Recetas

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Listar recetas | `recetas.ver` | `GET /api/recipe` |
| Ver receta de un producto | `recetas.ver` | `GET /api/recipe/product/{idProducto}` |
| Productos con receta pendientes (sin receta activa) | `recetas.editar` | `GET /api/recipe/products-without-recipe` |
| Crear o reemplazar la receta de un producto | `recetas.editar` | `PUT /api/recipe/product/{idProducto}` |

Cada producto con receta tiene su propia receta independiente y autocontenida. Se eliminó el concepto de "preparación base": la edición contempla ingredientes, cantidades y alternativas de ingredientes. Desde la vista de recetas se puede crear una receta para un producto que la requiere pero aún no la tiene.

### 6b. Ingredientes extra

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Listar materias primas marcadas como extra | `ingredientes_extra.ver` | `GET /api/extra-ingredient` |
| Opciones de formulario (materias primas y unidades) | `ingredientes_extra.ver` | `GET /api/extra-ingredient/options` |
| Catálogo activo para el punto de venta | `ventas.operar` \| `ventas.crear` \| `ingredientes_extra.ver` | `GET /api/extra-ingredient/active` |
| Marcar/editar una materia prima como extra | `ingredientes_extra.crear` \| `ingredientes_extra.editar` | `PUT /api/extra-ingredient/{idMateriaPrima}` |
| Quitar una materia prima del catálogo de extras | `ingredientes_extra.estado.modificar` | `PUT /api/extra-ingredient/{idMateriaPrima}/status` |

Ya no existe una tabla propia de ingredientes extra: cualquier **materia prima** puede marcarse con `Inv_Materia_Prima.Uso_Ingrediente_Extra` y define su recargo (`Precio_Ingrediente_Extra`), la cantidad que consume (`Cantidad_Ingrediente_Extra`) y su unidad (`Id_Unidad_Ingrediente_Extra`). El producto declara con una bandera (`Inv_Productos.Acepta_Ingredientes_Extra`, editable con `inventario.productos.editar`) si admite extras; si la tiene, en la venta cada línea del carrito puede activar/desactivar **cualquier** extra activo del catálogo. El consumo de materia prima se registra en `Ven_Detalle_Venta_Materiales` y la elección en `Ven_Detalle_Venta_Ingredientes` (que ahora referencia `Id_Materia_Prima`).

### 7. Configuración de inventario

| Recurso | Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|---|
| Unidades de medida | Ver | `configuracion_inventario.unidades.ver` | `GET .../units` |
| Unidades de medida | Crear | `configuracion_inventario.unidades.crear` | `POST .../units` |
| Unidades de medida | Editar | `configuracion_inventario.unidades.editar` | `PUT .../units/{id}` |
| Unidades de medida | Eliminar | `configuracion_inventario.unidades.eliminar` | `DELETE .../units/{id}` |
| Categorías de materia | Ver | `configuracion_inventario.categorias_materia.ver` | `GET .../material-categories` |
| Categorías de materia | Crear | `configuracion_inventario.categorias_materia.crear` | `POST .../material-categories` |
| Categorías de materia | Editar | `configuracion_inventario.categorias_materia.editar` | `PUT .../material-categories/{id}` |
| Categorías de materia | Eliminar | `configuracion_inventario.categorias_materia.eliminar` | `DELETE .../material-categories/{id}` |
| Marcas | Ver | `configuracion_inventario.marcas.ver` | `GET .../brands` |
| Marcas | Crear | `configuracion_inventario.marcas.crear` | `POST .../brands` |
| Marcas | Editar | `configuracion_inventario.marcas.editar` | `PUT .../brands/{id}` |
| Marcas | Eliminar | `configuracion_inventario.marcas.eliminar` | `DELETE .../brands/{id}` |
| Política de cortesía | Ver | `configuracion_inventario.cortesia.ver` | `GET .../courtesy-policy` |
| Política de cortesía | Editar | `configuracion_inventario.cortesia.politica.editar` | `PUT .../courtesy-policy` |
| Productos de cortesía | Listar | `configuracion_inventario.cortesia.ver` | `GET .../courtesy-products` |
| Productos de cortesía | Crear | `configuracion_inventario.cortesia.crear` | `POST .../courtesy-products` |
| Productos de cortesía | Editar | `configuracion_inventario.cortesia.editar` | `PUT .../courtesy-products/{id}` |
| Productos de cortesía | Activar o desactivar | `configuracion_inventario.cortesia.estado.modificar` | `PUT .../courtesy-products/{id}/status` |
| Materias primas | Listar | `configuracion_inventario.materias_primas.ver` | `GET .../raw-materials` |
| Materias primas | Crear | `configuracion_inventario.materias_primas.crear` | `POST .../raw-materials` |
| Materias primas | Editar | `configuracion_inventario.materias_primas.editar` | `PUT .../raw-materials/{id}` |
| Materias primas | Eliminar | `configuracion_inventario.materias_primas.eliminar` | `DELETE .../raw-materials/{id}` |
| Presentaciones de materia prima | Listar | `configuracion_inventario.presentaciones.ver` | `GET .../raw-material-presentations` |
| Presentaciones de materia prima | Crear | `configuracion_inventario.presentaciones.crear` | `POST .../raw-material-presentations` |
| Presentaciones de materia prima | Editar | `configuracion_inventario.presentaciones.editar` | `PUT .../raw-material-presentations/{id}` |
| Presentaciones de materia prima | Eliminar | `configuracion_inventario.presentaciones.eliminar` | `DELETE .../raw-material-presentations/{id}` |
| Stock de materia prima | Ingresar stock desde una presentación | `configuracion_inventario.stock.ingresar` | `POST .../raw-material-presentations/{id}/stock-entry` |

En esta tabla, `...` representa `/api/inventory-configuration`.

### 8. Proveedores

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Listar y ver datos del proveedor | `proveedores.ver` | `GET /api/providers` |
| Crear | `proveedores.crear` | `POST /api/providers` |
| Editar | `proveedores.editar` | `PUT /api/providers/{id}` |
| Activar o desactivar | `proveedores.estado.modificar` | `PUT /api/providers/{id}/status` |

Hoy las tres operaciones de escritura validan en el backend que el nombre del rol sea exactamente `ADMINISTRADOR`. La lectura no tiene validación de acceso.

### 9. Órdenes de compra

| Funcionalidad actual | Permiso propuesto | Endpoint | Sensibilidad |
|---|---|---|---|
| Ver catálogos para confeccionar órdenes | `ordenes_compra.ver` | `GET /api/purchase-orders/catalogs` | Normal |
| Listar órdenes | `ordenes_compra.ver` | `GET /api/purchase-orders` | Normal |
| Ver detalle | `ordenes_compra.ver` | `GET /api/purchase-orders/{id}` | Normal |
| Crear borrador | `ordenes_compra.crear` | `POST /api/purchase-orders` | Normal |
| Editar borrador | `ordenes_compra.editar` | `PUT /api/purchase-orders/{id}` | Normal |
| Emitir orden | `ordenes_compra.emitir` | `POST /api/purchase-orders/{id}/issue` | Alta |
| Registrar recepción y aumentar stock | `ordenes_compra.recibir` | `POST /api/purchase-orders/{id}/receive` | Alta |
| Confirmar cambios de precio de venta | `ordenes_compra.precios.confirmar` | `POST /api/purchase-orders/{id}/confirm-prices` | Alta |
| Cancelar borrador u orden emitida | `ordenes_compra.cancelar` | `POST /api/purchase-orders/{id}/cancel` | Alta |
| Exportar PDF | `ordenes_compra.exportar` | `GET /api/purchase-orders/{id}/pdf` | Normal |
| Exportar Excel | `ordenes_compra.exportar` | `GET /api/purchase-orders/{id}/excel` | Normal |

Hoy todas las escrituras comparan el rol `ADMINISTRADOR`; todas las lecturas y exportaciones carecen de control de acceso en el backend.

### 10. Turnos

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Consultar turno activo propio | `turnos.propios.ver` | `GET /api/turn/active` |
| Consultar último turno propio | `turnos.propios.ver` | `GET /api/turn/last` |
| Ver historial propio | `turnos.propios.ver` | `GET /api/turn/history` |
| Ver calendario propio | `turnos.propios.ver` | `GET /api/turn/calendar` |
| Ver detalle diario propio | `turnos.propios.ver` | `GET /api/turn/day` |
| Consultar denominaciones de efectivo | `turnos.operar` | `GET /api/turn/denominations` |
| Abrir turno | `turnos.abrir` | `POST /api/turn/open` |
| Ver resumen para cierre | `turnos.cerrar` | `GET /api/turn/summary` |
| Cerrar turno y registrar desglose | `turnos.cerrar` | `POST /api/turn/close` |

Los endpoints reciben `idUsuario` desde el cliente. El alcance “propio” debe comprobarse con la identidad autenticada, no confiando en ese parámetro.

### 11. Ventas y caja

| Funcionalidad actual | Permiso propuesto | Endpoint | Condición de negocio |
|---|---|---|---|
| Ver catálogo disponible para venta | `ventas.operar` | `GET /api/product`, `/api/category`, `/api/discount` | Turno propio abierto |
| Crear venta con medios no Point | `ventas.crear` | `POST /api/sale` | Turno propio abierto |
| Iniciar venta con Mercado Pago Point | `ventas.crear_point` | `POST /api/sale/point` | Turno propio abierto |
| Sincronizar el estado de cobro Point | `ventas.crear_point` | `POST /api/sale/point/{idVenta}/sync` | Venta/turno autorizado |
| Ver ventas del turno | `ventas.propias.ver` | `GET /api/sale/turn/{idTurno}` | Turno propio, salvo permiso administrativo |
| Reimprimir boleta desde el historial | `ventas.documentos.reimprimir` | Solo frontend | Requiere además ver ventas propias |
| Anular venta y opcionalmente devolver stock | `ventas.anular` | `POST /api/sale/{idVenta}/anular` | Acción crítica |

El acceso a la pantalla exige actualmente el nombre de rol de barista y que el frontend detecte un turno propio abierto. Esa comprobación de interfaz no reemplaza la autorización en la API.

### 12. Bitácora operacional

| Funcionalidad actual | Permiso propuesto | Endpoint |
|---|---|---|
| Ver bitácora del turno | `bitacora.propia.ver` | `GET /api/logbook/turn/{idTurno}` |
| Registrar producto consumido | `bitacora.consumos.crear` | `POST /api/logbook/products` |
| Anular consumo registrado | `bitacora.consumos.anular` | `PUT /api/logbook/products/{id}/void` |
| Editar observación | `bitacora.observacion.editar` | `PUT /api/logbook/observation` |
| Registrar extracciones de caja | `bitacora.extracciones.crear` | `POST /api/logbook/extractions` |

Al igual que en turnos, la pertenencia al turno debe comprobarse en el servidor a partir de la identidad autenticada.

### 13. Integración Mercado Pago Point

Estas capacidades existen en la API, pero las llamadas de bajo nivel no deberían asignarse normalmente a roles humanos. Deben quedar como operaciones internas usadas por el módulo de ventas.

| Funcionalidad técnica | Clasificación sugerida | Endpoint |
|---|---|---|
| Listar terminales | Interna; opcionalmente `integraciones.point.administrar` | `GET /api/point/terminals` |
| Cambiar modo de terminal | `integraciones.point.administrar` | `PATCH /api/point/terminals/{terminalId}/operating-mode` |
| Crear/consultar/cancelar/reembolsar/simular orden Point | Interna | Rutas bajo `/api/point/orders` |
| Recibir webhook de Mercado Pago | No asignable; validar firma | `POST /api/point/webhook` |

### Endpoints técnicos fuera del catálogo de permisos

- `GET /api/health`: diagnóstico de disponibilidad; debe limitar la información expuesta.
- `GET /weatherforecast`: endpoint de plantilla sin funcionalidad de negocio; se recomienda eliminarlo.

Las entidades SII presentes en el modelo (`SiiCafFolios`, `SiiClientesEmpresa`, `SiiEstadosBoleta`, `SiiTiposDte`) no constituyen hoy un módulo funcional porque no tienen controladores ni pantallas asociados.

## Estado actual de autorización

La implementación modular asociada a este documento incorpora:

1. Autenticación mediante cookie HTTP-only con endpoints de sesión `login`, `me` y `logout`.
2. Resolución de permisos efectivos desde los roles activos del usuario en cada autorización.
3. Atributos de permiso en los endpoints de negocio; la API es la fuente de verdad.
4. Rutas, navegación y acciones principales del frontend basadas en códigos de permiso y no en nombres de rol.
5. Validación de pertenencia usando la identidad autenticada en turnos, ventas, bitácora y operaciones Point. Los `idUsuario` recibidos por compatibilidad ya no se usan como identidad.
6. Protección especial para el cambio forzado de contraseña y para evitar que un administrador conceda permisos que él mismo no posee.

El script `DatabaseChanges/20260911_Permisos_Modulares.sql` crea y carga el catálogo. Conserva el comportamiento inicial otorgando todos los permisos al rol `ADMINISTRADOR` y el paquete operacional a las dos variantes históricas del rol de barista.

## Estructura mínima sugerida

| Tabla | Propósito | Campos mínimos |
|---|---|---|
| `Seg_Modulos` | Catálogo y agrupación visual | `IdModulo`, `Codigo`, `Nombre`, `Orden`, `Activo` |
| `Seg_Permisos` | Acción atómica autorizable | `IdPermiso`, `IdModulo`, `Codigo`, `Nombre`, `Descripcion`, `EsCritico`, `Activo` |
| `Seg_PermisosXRol` | Permisos concedidos a cada rol | `IdRolUsuario`, `IdPermiso`, `Activo`, auditoría |
| `Seg_PermisosXUsuario` (opcional, no implementada) | Excepciones explícitas | `IdUsuario`, `IdPermiso`, `Efecto` (`Permitir`/`Denegar`), auditoría |

Para la primera versión basta con permisos por rol. Las excepciones por usuario conviene agregarlas solo si existe un caso real, ya que complican la explicación del permiso efectivo.

## Reglas de diseño necesarias

- Autorizar cada endpoint en el servidor mediante una política asociada al código de permiso.
- Obtener `IdUsuario` desde el token/cookie autenticado. No usar como identidad un ID enviado en query o body.
- Calcular los permisos efectivos como la unión de los permisos de todos los roles activos del usuario.
- Mantener las restricciones de negocio además del permiso: poseer `ventas.crear` no reemplaza tener un turno propio abierto; poseer `ordenes_compra.editar` no permite editar una orden ya emitida.
- Impedir que quien administra roles se otorgue permisos que no posee, salvo la cuenta de superadministración definida por una regla explícita.
- Registrar auditoría para cambios de roles/permisos y para acciones críticas: anulación de ventas, recepción/cancelación de órdenes, cambios de precio, stock, contraseñas y estados de usuarios.
- Ocultar o deshabilitar rutas, menús y botones según permisos efectivos, pero tratar esto solo como presentación.
- Definir permisos internos/no asignables para webhook y operaciones técnicas Point.

## Paquetes de selección para la interfaz

Estos paquetes son atajos de selección, no nuevos permisos:

- **Lectura:** selecciona todos los permisos de consulta del módulo.
- **Operación:** lectura más acciones operacionales frecuentes; excluye configuración, eliminación, anulación y administración de accesos.
- **Administración:** todos los permisos asignables del módulo.
- **Personalizado:** permite marcar acciones individualmente.

Este enfoque permite crear, por ejemplo, un rol que pueda recibir órdenes y actualizar stock, pero no crearlas, emitirlas, cancelarlas ni confirmar cambios de precio.
