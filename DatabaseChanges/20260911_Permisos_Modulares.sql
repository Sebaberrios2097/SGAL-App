SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.Seg_Modulos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Seg_Modulos (
        Id_Modulo int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Seg_Modulos PRIMARY KEY,
        Codigo varchar(80) NOT NULL,
        Nombre nvarchar(120) NOT NULL,
        Orden int NOT NULL,
        Activo bit NOT NULL CONSTRAINT DF_Seg_Modulos_Activo DEFAULT (1),
        CONSTRAINT UQ_Seg_Modulos_Codigo UNIQUE (Codigo)
    );
END;

IF OBJECT_ID('dbo.Seg_Permisos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Seg_Permisos (
        Id_Permiso int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Seg_Permisos PRIMARY KEY,
        Id_Modulo int NOT NULL,
        Codigo varchar(150) NOT NULL,
        Nombre nvarchar(120) NOT NULL,
        Descripcion nvarchar(300) NULL,
        EsCritico bit NOT NULL CONSTRAINT DF_Seg_Permisos_EsCritico DEFAULT (0),
        Activo bit NOT NULL CONSTRAINT DF_Seg_Permisos_Activo DEFAULT (1),
        CONSTRAINT UQ_Seg_Permisos_Codigo UNIQUE (Codigo),
        CONSTRAINT FK_Seg_Permisos_Modulos FOREIGN KEY (Id_Modulo) REFERENCES dbo.Seg_Modulos(Id_Modulo)
    );
END;

IF OBJECT_ID('dbo.Seg_PermisosXRol', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Seg_PermisosXRol (
        Id_Rol_Usuario int NOT NULL,
        Id_Permiso int NOT NULL,
        Activo bit NOT NULL CONSTRAINT DF_Seg_PermisosXRol_Activo DEFAULT (1),
        Fecha_Asignacion datetime NOT NULL CONSTRAINT DF_Seg_PermisosXRol_Fecha DEFAULT (GETDATE()),
        CONSTRAINT PK_Seg_PermisosXRol PRIMARY KEY (Id_Rol_Usuario, Id_Permiso),
        CONSTRAINT FK_Seg_PermisosXRol_Rol FOREIGN KEY (Id_Rol_Usuario) REFERENCES dbo.Emp_Roles_Usuarios(Id_Rol_Usuario) ON DELETE CASCADE,
        CONSTRAINT FK_Seg_PermisosXRol_Permiso FOREIGN KEY (Id_Permiso) REFERENCES dbo.Seg_Permisos(Id_Permiso) ON DELETE CASCADE
    );
END;

DECLARE @Modulos TABLE (Codigo varchar(80), Nombre nvarchar(120), Orden int);
INSERT INTO @Modulos VALUES
('inicio', N'Inicio y panel', 10), ('usuarios', N'Empleados', 20),
('roles', N'Roles y permisos', 30), ('inventario', N'Productos, categorías y descuentos', 40),
('recetas', N'Recetas', 50), ('configuracion_inventario', N'Configuración de inventario', 60),
('proveedores', N'Proveedores', 70), ('ordenes_compra', N'Órdenes de compra', 80),
('registros_turnos', N'Registros administrativos de turnos', 90), ('turnos', N'Turnos', 100),
('ventas', N'Ventas y caja', 110), ('bitacora', N'Bitácora operacional', 120),
('integraciones', N'Integraciones', 130);

MERGE dbo.Seg_Modulos AS target
USING @Modulos AS source ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Nombre = source.Nombre, Orden = source.Orden, Activo = 1
WHEN NOT MATCHED THEN INSERT (Codigo, Nombre, Orden, Activo) VALUES (source.Codigo, source.Nombre, source.Orden, 1);

DECLARE @Permisos TABLE (Modulo varchar(80), Codigo varchar(150), Nombre nvarchar(120), EsCritico bit);
INSERT INTO @Permisos VALUES
('inicio','inicio.dashboard.ver',N'Ver panel administrativo',0),
('registros_turnos','registros_turnos.ver',N'Ver registros de turnos',0),
('registros_turnos','registros_turnos.bitacora.ver',N'Ver bitácoras históricas',0),
('registros_turnos','registros_turnos.ventas.ver',N'Ver ventas históricas',0),
('usuarios','usuarios.ver',N'Ver empleados',0),
('usuarios','usuarios.empleado.crear',N'Crear empleados',0),
('usuarios','usuarios.empleado.editar',N'Editar datos de empleados',0),
('usuarios','usuarios.cuenta.crear',N'Crear cuentas de usuario',1),
('usuarios','usuarios.cuenta.editar',N'Editar cuentas de usuario',1),
('usuarios','usuarios.estado.modificar',N'Activar o desactivar usuarios',1),
('usuarios','usuarios.roles.asignar',N'Asignar roles a usuarios',1),
('usuarios','usuarios.password.restablecer',N'Restablecer contraseñas',1),
('roles','roles.ver',N'Ver roles',0), ('roles','roles.crear',N'Crear roles',1),
('roles','roles.editar',N'Editar roles',1), ('roles','roles.eliminar',N'Eliminar roles',1),
('roles','roles.permisos.asignar',N'Asignar permisos a roles',1),
('inventario','inventario.productos.ver',N'Ver productos',0),
('inventario','inventario.productos.crear',N'Crear productos',0),
('inventario','inventario.productos.editar',N'Editar productos',0),
('inventario','inventario.productos.estado.modificar',N'Cambiar estado de productos',0),
('inventario','inventario.categorias.ver',N'Ver categorías de producto',0),
('inventario','inventario.categorias.crear',N'Crear categorías de producto',0),
('inventario','inventario.categorias.editar',N'Editar categorías de producto',0),
('inventario','inventario.categorias.estado.modificar',N'Cambiar estado de categorías',0),
('inventario','inventario.descuentos.ver',N'Ver descuentos',0),
('inventario','inventario.descuentos.crear',N'Crear descuentos',0),
('inventario','inventario.descuentos.estado.modificar',N'Cambiar estado de descuentos',0),
('inventario','inventario.descuentos.eliminar',N'Eliminar descuentos',1),
('recetas','recetas.ver',N'Ver recetas',0), ('recetas','recetas.editar',N'Editar recetas',0),
('configuracion_inventario','configuracion_inventario.catalogos.ver',N'Ver catálogos de inventario',0),
('configuracion_inventario','configuracion_inventario.unidades.crear',N'Crear unidades de medida',0),
('configuracion_inventario','configuracion_inventario.unidades.editar',N'Editar unidades de medida',0),
('configuracion_inventario','configuracion_inventario.unidades.eliminar',N'Eliminar unidades de medida',1),
('configuracion_inventario','configuracion_inventario.categorias_materia.crear',N'Crear categorías de materia',0),
('configuracion_inventario','configuracion_inventario.categorias_materia.editar',N'Editar categorías de materia',0),
('configuracion_inventario','configuracion_inventario.categorias_materia.eliminar',N'Eliminar categorías de materia',1),
('configuracion_inventario','configuracion_inventario.marcas.crear',N'Crear marcas',0),
('configuracion_inventario','configuracion_inventario.marcas.editar',N'Editar marcas',0),
('configuracion_inventario','configuracion_inventario.marcas.eliminar',N'Eliminar marcas',1),
('configuracion_inventario','configuracion_inventario.cortesia.ver',N'Ver configuración de cortesía',0),
('configuracion_inventario','configuracion_inventario.cortesia.politica.editar',N'Editar política de cortesía',1),
('configuracion_inventario','configuracion_inventario.cortesia.crear',N'Crear productos de cortesía',0),
('configuracion_inventario','configuracion_inventario.cortesia.editar',N'Editar productos de cortesía',0),
('configuracion_inventario','configuracion_inventario.cortesia.estado.modificar',N'Cambiar estado de productos de cortesía',0),
('configuracion_inventario','configuracion_inventario.materias_primas.ver',N'Ver materias primas',0),
('configuracion_inventario','configuracion_inventario.materias_primas.crear',N'Crear materias primas',0),
('configuracion_inventario','configuracion_inventario.materias_primas.editar',N'Editar materias primas',0),
('configuracion_inventario','configuracion_inventario.materias_primas.eliminar',N'Eliminar materias primas',1),
('configuracion_inventario','configuracion_inventario.presentaciones.ver',N'Ver presentaciones',0),
('configuracion_inventario','configuracion_inventario.presentaciones.crear',N'Crear presentaciones',0),
('configuracion_inventario','configuracion_inventario.presentaciones.editar',N'Editar presentaciones',0),
('configuracion_inventario','configuracion_inventario.presentaciones.eliminar',N'Eliminar presentaciones',1),
('configuracion_inventario','configuracion_inventario.stock.ingresar',N'Ingresar stock',1),
('proveedores','proveedores.ver',N'Ver proveedores',0), ('proveedores','proveedores.crear',N'Crear proveedores',0),
('proveedores','proveedores.editar',N'Editar proveedores',0), ('proveedores','proveedores.estado.modificar',N'Cambiar estado de proveedores',0),
('ordenes_compra','ordenes_compra.ver',N'Ver órdenes de compra',0),
('ordenes_compra','ordenes_compra.crear',N'Crear órdenes de compra',0),
('ordenes_compra','ordenes_compra.editar',N'Editar órdenes de compra',0),
('ordenes_compra','ordenes_compra.emitir',N'Emitir órdenes de compra',1),
('ordenes_compra','ordenes_compra.recibir',N'Recibir órdenes y actualizar stock',1),
('ordenes_compra','ordenes_compra.precios.confirmar',N'Confirmar precios de venta',1),
('ordenes_compra','ordenes_compra.cancelar',N'Cancelar órdenes de compra',1),
('ordenes_compra','ordenes_compra.exportar',N'Exportar órdenes de compra',0),
('turnos','turnos.propios.ver',N'Ver turnos propios',0), ('turnos','turnos.operar',N'Ver datos operacionales del turno',0),
('turnos','turnos.abrir',N'Abrir turno',1), ('turnos','turnos.cerrar',N'Cerrar turno',1),
('ventas','ventas.operar',N'Acceder al punto de venta',0), ('ventas','ventas.crear',N'Crear ventas',1),
('ventas','ventas.crear_point',N'Crear ventas con Point',1), ('ventas','ventas.propias.ver',N'Ver ventas propias',0),
('ventas','ventas.anular',N'Anular ventas',1),
('bitacora','bitacora.propia.ver',N'Ver bitácora propia',0),
('bitacora','bitacora.consumos.crear',N'Registrar consumos',0),
('bitacora','bitacora.consumos.anular',N'Anular consumos',1),
('bitacora','bitacora.observacion.editar',N'Editar observación',0),
('bitacora','bitacora.extracciones.crear',N'Registrar extracciones',1),
('integraciones','integraciones.point.administrar',N'Administrar terminales Point',1);

MERGE dbo.Seg_Permisos AS target
USING (SELECT m.Id_Modulo, p.Codigo, p.Nombre, p.EsCritico FROM @Permisos p JOIN dbo.Seg_Modulos m ON m.Codigo=p.Modulo) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Id_Modulo=source.Id_Modulo, Nombre=source.Nombre, EsCritico=source.EsCritico, Activo=1
WHEN NOT MATCHED THEN INSERT (Id_Modulo,Codigo,Nombre,EsCritico,Activo) VALUES(source.Id_Modulo,source.Codigo,source.Nombre,source.EsCritico,1);

-- Conserva el comportamiento actual: Administrador recibe todo.
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r CROSS JOIN dbo.Seg_Permisos p
WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
  AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x WHERE x.Id_Rol_Usuario=r.Id_Rol_Usuario AND x.Id_Permiso=p.Id_Permiso);

-- Permisos operacionales iniciales para las variantes históricas del rol de barista.
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
JOIN dbo.Seg_Permisos p ON p.Codigo IN (
 'turnos.propios.ver','turnos.operar','turnos.abrir','turnos.cerrar','ventas.operar','ventas.crear',
 'ventas.crear_point','ventas.propias.ver','ventas.anular','bitacora.propia.ver','bitacora.consumos.crear',
 'bitacora.consumos.anular','bitacora.observacion.editar','bitacora.extracciones.crear',
 'inventario.productos.ver','inventario.categorias.ver','inventario.descuentos.ver')
WHERE UPPER(r.Nombre_Rol) IN ('BARISTA/VENDEDOR','VENDEDOR/BARISTA')
  AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x WHERE x.Id_Rol_Usuario=r.Id_Rol_Usuario AND x.Id_Permiso=p.Id_Permiso);

COMMIT;
