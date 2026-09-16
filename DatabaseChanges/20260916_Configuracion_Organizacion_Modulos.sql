/*
  Configuración de una instalación SGAL.

  La aplicación se despliega en modalidad single-tenant: cada instalación tiene
  su propia base de datos y exactamente una fila en Org_Configuracion.
  Seg_Modulos describe capacidades del producto; Org_Modulos indica cuáles fueron
  contratadas/habilitadas en esta instalación; Seg_PermisosXRol controla qué puede
  hacer cada rol dentro de esas capacidades.
*/

IF COL_LENGTH('dbo.Seg_Modulos', 'Descripcion') IS NULL
    ALTER TABLE dbo.Seg_Modulos ADD Descripcion nvarchar(500) NULL;

IF COL_LENGTH('dbo.Seg_Modulos', 'Es_Nucleo') IS NULL
    ALTER TABLE dbo.Seg_Modulos ADD Es_Nucleo bit NOT NULL
        CONSTRAINT DF_Seg_Modulos_Es_Nucleo DEFAULT (0);

/* SQL Server compila todo el lote antes de ejecutar los ALTER TABLE. El cambio
   de lote permite que las columnas nuevas estén disponibles para los INSERT y
   UPDATE posteriores. Este archivo debe ejecutarse con SSMS o sqlcmd. */
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.Org_Configuracion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Org_Configuracion (
        Id_Configuracion int NOT NULL CONSTRAINT PK_Org_Configuracion PRIMARY KEY,
        Nombre_Comercial nvarchar(120) NOT NULL,
        Razon_Social nvarchar(180) NULL,
        Descripcion nvarchar(300) NULL,
        Texto_Pie_Documentos nvarchar(250) NULL,
        Contacto_Publico nvarchar(160) NULL,
        Color_Primario char(7) NOT NULL CONSTRAINT DF_Org_Configuracion_Color_Primario DEFAULT ('#1F4E5F'),
        Color_Secundario char(7) NOT NULL CONSTRAINT DF_Org_Configuracion_Color_Secundario DEFAULT ('#163A47'),
        Color_Acento char(7) NOT NULL CONSTRAINT DF_Org_Configuracion_Color_Acento DEFAULT ('#D97706'),
        Color_Fondo char(7) NOT NULL CONSTRAINT DF_Org_Configuracion_Color_Fondo DEFAULT ('#F8FAFC'),
        Logo_Contenido varbinary(max) NULL,
        Logo_Tipo_Contenido varchar(50) NULL,
        Logo_Nombre_Archivo nvarchar(180) NULL,
        Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Org_Configuracion_Fecha DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Org_Configuracion_Unica CHECK (Id_Configuracion = 1),
        CONSTRAINT CK_Org_Configuracion_Color_Primario CHECK (Color_Primario LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_Org_Configuracion_Color_Secundario CHECK (Color_Secundario LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_Org_Configuracion_Color_Acento CHECK (Color_Acento LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_Org_Configuracion_Color_Fondo CHECK (Color_Fondo LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.Org_Configuracion WHERE Id_Configuracion = 1)
BEGIN
    INSERT INTO dbo.Org_Configuracion
        (Id_Configuracion, Nombre_Comercial, Descripcion, Texto_Pie_Documentos, Color_Primario,
         Color_Secundario, Color_Acento, Color_Fondo, Fecha_Actualizacion)
    VALUES
        (1, N'SGAL App', N'Sistema de Gestión, Administración y Logística', N'Gracias por su preferencia.',
         '#1F4E5F', '#163A47', '#D97706', '#F8FAFC', SYSUTCDATETIME());
END;

IF OBJECT_ID('dbo.Org_Modulos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Org_Modulos (
        Id_Modulo int NOT NULL CONSTRAINT PK_Org_Modulos PRIMARY KEY,
        Habilitado bit NOT NULL CONSTRAINT DF_Org_Modulos_Habilitado DEFAULT (0),
        Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Org_Modulos_Fecha DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Org_Modulos_Seg_Modulos FOREIGN KEY (Id_Modulo)
            REFERENCES dbo.Seg_Modulos(Id_Modulo) ON DELETE CASCADE
    );
END;

IF OBJECT_ID('dbo.Seg_Modulos_Dependencias', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Seg_Modulos_Dependencias (
        Id_Modulo int NOT NULL,
        Id_Modulo_Requerido int NOT NULL,
        CONSTRAINT PK_Seg_Modulos_Dependencias PRIMARY KEY (Id_Modulo, Id_Modulo_Requerido),
        CONSTRAINT CK_Seg_Modulos_Dependencias_Distintos CHECK (Id_Modulo <> Id_Modulo_Requerido),
        CONSTRAINT FK_Seg_Modulos_Dependencias_Modulo FOREIGN KEY (Id_Modulo)
            REFERENCES dbo.Seg_Modulos(Id_Modulo) ON DELETE CASCADE,
        CONSTRAINT FK_Seg_Modulos_Dependencias_Requerido FOREIGN KEY (Id_Modulo_Requerido)
            REFERENCES dbo.Seg_Modulos(Id_Modulo_Requerido)
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'configuracion_sistema')
BEGIN
    INSERT INTO dbo.Seg_Modulos (Codigo, Nombre, Descripcion, Orden, Activo, Es_Nucleo)
    VALUES ('configuracion_sistema', N'Configuración del sistema',
        N'Identidad visual, datos de la organización y módulos habilitados para la instalación.',
        5, 1, 1);
END;

UPDATE dbo.Seg_Modulos
SET Es_Nucleo = CASE WHEN Codigo IN ('configuracion_sistema', 'inicio', 'usuarios', 'roles') THEN 1 ELSE 0 END,
    Descripcion = CASE Codigo
        WHEN 'configuracion_sistema' THEN N'Identidad visual, datos de la organización y módulos habilitados para la instalación.'
        WHEN 'inicio' THEN N'Página inicial y paneles de resumen de la operación.'
        WHEN 'usuarios' THEN N'Empleados, cuentas de acceso, estado y asignación de roles.'
        WHEN 'roles' THEN N'Roles, permisos funcionales y límites de autorización.'
        WHEN 'inventario' THEN N'Productos vendibles, categorías, descuentos y control de existencias.'
        WHEN 'recetas' THEN N'Recetas de productos y consumo automático de materias primas.'
        WHEN 'ingredientes_extra' THEN N'Ingredientes opcionales, recargos y consumo adicional de materias primas.'
        WHEN 'configuracion_inventario' THEN N'Materias primas, presentaciones, unidades, marcas y políticas de inventario.'
        WHEN 'proveedores' THEN N'Catálogo y administración de proveedores.'
        WHEN 'ordenes_compra' THEN N'Creación, emisión, recepción y exportación de órdenes de compra.'
        WHEN 'registros_turnos' THEN N'Consulta administrativa de turnos, ventas, consumos y bitácoras.'
        WHEN 'turnos' THEN N'Apertura, operación, cierre e historial de turnos de caja.'
        WHEN 'ventas' THEN N'Punto de venta, medios de pago, descuentos, comandas y anulaciones.'
        WHEN 'bitacora' THEN N'Consumos, extracciones y observaciones operacionales por turno.'
        WHEN 'integraciones' THEN N'Conexiones con servicios externos, actualmente Mercado Pago Point.'
        ELSE Descripcion
    END
WHERE Activo = 1;

DECLARE @Dependencies TABLE (Modulo varchar(80), Requerido varchar(80));
INSERT INTO @Dependencies VALUES
('recetas', 'inventario'),
('recetas', 'configuracion_inventario'),
('ingredientes_extra', 'inventario'),
('ingredientes_extra', 'configuracion_inventario'),
('ordenes_compra', 'proveedores'),
('ordenes_compra', 'inventario'),
('ordenes_compra', 'configuracion_inventario'),
('turnos', 'usuarios'),
('ventas', 'turnos'),
('ventas', 'inventario'),
('bitacora', 'turnos'),
('bitacora', 'inventario'),
('registros_turnos', 'turnos'),
('integraciones', 'ventas');

INSERT INTO dbo.Seg_Modulos_Dependencias (Id_Modulo, Id_Modulo_Requerido)
SELECT module.Id_Modulo, required.Id_Modulo
FROM @Dependencies dependency
JOIN dbo.Seg_Modulos module ON module.Codigo = dependency.Modulo
JOIN dbo.Seg_Modulos required ON required.Codigo = dependency.Requerido
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Seg_Modulos_Dependencias existing
    WHERE existing.Id_Modulo = module.Id_Modulo
      AND existing.Id_Modulo_Requerido = required.Id_Modulo
);

DECLARE @SystemModuleId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'configuracion_sistema');

DECLARE @SystemPermissions TABLE (
    Codigo varchar(150), Nombre nvarchar(120), Descripcion nvarchar(300), EsCritico bit
);
INSERT INTO @SystemPermissions VALUES
('configuracion_sistema.marca.ver', N'Ver configuración de marca', N'Consulta los datos e identidad visual de la organización.', 0),
('configuracion_sistema.marca.editar', N'Editar configuración de marca', N'Modifica nombre, descripción, colores y logo de la organización.', 1),
('configuracion_sistema.modulos.administrar', N'Administrar módulos', N'Habilita o deshabilita capacidades contratadas para la instalación.', 1);

MERGE dbo.Seg_Permisos AS target
USING (SELECT @SystemModuleId Id_Modulo, Codigo, Nombre, Descripcion, EsCritico FROM @SystemPermissions) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET
    Id_Modulo = source.Id_Modulo,
    Nombre = source.Nombre,
    Descripcion = source.Descripcion,
    EsCritico = source.EsCritico,
    Activo = 1
WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
    VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

/* Preserva el comportamiento de la aplicación existente al migrar: todos los
   módulos que ya existen quedan habilitados. Los módulos incorporados después
   deberán agregarse explícitamente a Org_Modulos o habilitarse desde la interfaz. */
INSERT INTO dbo.Org_Modulos (Id_Modulo, Habilitado, Fecha_Actualizacion)
SELECT m.Id_Modulo, 1, SYSUTCDATETIME()
FROM dbo.Seg_Modulos m
WHERE m.Activo = 1
  AND NOT EXISTS (SELECT 1 FROM dbo.Org_Modulos om WHERE om.Id_Modulo = m.Id_Modulo);

/* El Administrador puede configurar la marca. La administración del catálogo de
   módulos se reserva al Desarrollador, que ya funciona como superusuario. */
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
JOIN dbo.Seg_Permisos p ON p.Codigo IN (
    'configuracion_sistema.marca.ver',
    'configuracion_sistema.marca.editar')
WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.Seg_PermisosXRol x
      WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso
  );

COMMIT;
