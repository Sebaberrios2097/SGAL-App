SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Limpieza de artefactos del intento anterior (un solo extra por línea): una
-- columna Id_Ingrediente_Extra en Ven_Detalle_Venta con su FK y su default.
-- El modelo nuevo usa la tabla Ven_Detalle_Venta_Ingredientes.
-- ---------------------------------------------------------------------------
DECLARE @fk sysname = (
    SELECT TOP 1 fk.name FROM sys.foreign_keys fk
    WHERE fk.parent_object_id = OBJECT_ID('dbo.Ven_Detalle_Venta')
      AND fk.referenced_object_id = OBJECT_ID('dbo.Inv_Ingredientes_Extra'));
IF @fk IS NOT NULL EXEC('ALTER TABLE dbo.Ven_Detalle_Venta DROP CONSTRAINT [' + @fk + ']');

DECLARE @df sysname = (
    SELECT dc.name FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE c.object_id = OBJECT_ID('dbo.Ven_Detalle_Venta') AND c.name = 'Id_Ingrediente_Extra');
IF @df IS NOT NULL EXEC('ALTER TABLE dbo.Ven_Detalle_Venta DROP CONSTRAINT [' + @df + ']');

IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Id_Ingrediente_Extra') IS NOT NULL
    ALTER TABLE dbo.Ven_Detalle_Venta DROP COLUMN Id_Ingrediente_Extra;

-- ---------------------------------------------------------------------------
-- Repara estados previos: si Inv_Ingredientes_Extra quedó con un esquema viejo
-- (sin Id_Materia_Prima), se rehace. También se elimina la tabla de asociación
-- producto-extra: el modelo nuevo usa una bandera en el producto y, si acepta
-- extras, admite cualquiera del catálogo.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Inv_Ingredientes_Extra', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.Inv_Ingredientes_Extra', 'Id_Materia_Prima') IS NULL
BEGIN
    IF OBJECT_ID('dbo.Ven_Detalle_Venta_Ingredientes', 'U') IS NOT NULL DROP TABLE dbo.Ven_Detalle_Venta_Ingredientes;
    IF OBJECT_ID('dbo.Inv_Productos_Ingredientes_Extra', 'U') IS NOT NULL DROP TABLE dbo.Inv_Productos_Ingredientes_Extra;
    DROP TABLE dbo.Inv_Ingredientes_Extra;
END;

-- La asociación producto-extra ya no se usa (reemplazada por la bandera del producto).
IF OBJECT_ID('dbo.Inv_Productos_Ingredientes_Extra', 'U') IS NOT NULL
    DROP TABLE dbo.Inv_Productos_Ingredientes_Extra;

-- ---------------------------------------------------------------------------
-- Catálogo de ingredientes extra. Cada extra descuenta UNA materia prima con
-- una cantidad + unidad fija y suma su precio como recargo en la venta.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Inv_Ingredientes_Extra', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Inv_Ingredientes_Extra (
        Id_Ingrediente_Extra int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Inv_Ingredientes_Extra PRIMARY KEY,
        Nombre_Ingrediente_Extra nvarchar(50) NOT NULL,
        Descripcion nvarchar(150) NULL,
        Precio int NOT NULL CONSTRAINT DF_Inv_Ingredientes_Extra_Precio DEFAULT (0),
        Id_Materia_Prima int NOT NULL,
        Cantidad_Requerida decimal(18,3) NOT NULL,
        Id_Unidad_Medida int NOT NULL,
        Activo bit NOT NULL CONSTRAINT DF_Inv_Ingredientes_Extra_Activo DEFAULT (1),
        Fecha_Creacion datetime NOT NULL CONSTRAINT DF_Inv_Ingredientes_Extra_Fecha DEFAULT (GETDATE()),
        Fecha_Modificacion datetime NULL,
        CONSTRAINT FK_Inv_Ingredientes_Extra_Inv_Materia_Prima
            FOREIGN KEY (Id_Materia_Prima) REFERENCES dbo.Inv_Materia_Prima(Id_Materia_Prima),
        CONSTRAINT FK_Inv_Ingredientes_Extra_Inv_Unidades_Medida
            FOREIGN KEY (Id_Unidad_Medida) REFERENCES dbo.Inv_Unidades_Medida(Id_Unidad_Medida)
    );
END;

-- ---------------------------------------------------------------------------
-- Bandera del producto: indica si admite ingredientes extra en la venta.
-- ---------------------------------------------------------------------------
IF COL_LENGTH('dbo.Inv_Productos', 'Acepta_Ingredientes_Extra') IS NULL
BEGIN
    ALTER TABLE dbo.Inv_Productos
        ADD Acepta_Ingredientes_Extra bit NOT NULL
            CONSTRAINT DF_Inv_Productos_Acepta_Extra DEFAULT (0);
END;

-- ---------------------------------------------------------------------------
-- Ingredientes extra elegidos por línea de venta (precio como snapshot). El
-- consumo de materia prima se guarda en Ven_Detalle_Venta_Materiales, por lo
-- que la anulación repone stock sin lógica adicional.
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.Ven_Detalle_Venta_Ingredientes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ven_Detalle_Venta_Ingredientes (
        Id_Detalle_Venta_Ingrediente int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Ven_Detalle_Venta_Ingredientes PRIMARY KEY,
        Id_Detalle_Venta int NOT NULL,
        Id_Ingrediente_Extra int NOT NULL,
        Precio int NOT NULL,
        CONSTRAINT FK_Ven_Detalle_Venta_Ingredientes_Ven_Detalle_Venta
            FOREIGN KEY (Id_Detalle_Venta) REFERENCES dbo.Ven_Detalle_Venta(Id_Detalle_Venta) ON DELETE CASCADE,
        CONSTRAINT FK_Ven_Detalle_Venta_Ingredientes_Inv_Ingredientes_Extra
            FOREIGN KEY (Id_Ingrediente_Extra) REFERENCES dbo.Inv_Ingredientes_Extra(Id_Ingrediente_Extra)
    );
END;

-- ---------------------------------------------------------------------------
-- Módulo y permisos de gestión de ingredientes extra.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'ingredientes_extra')
BEGIN
    INSERT INTO dbo.Seg_Modulos (Codigo, Nombre, Orden, Activo)
    VALUES ('ingredientes_extra', N'Ingredientes extra', 65, 1);
END;

DECLARE @Permisos TABLE (Codigo varchar(150), Nombre nvarchar(120), EsCritico bit);
INSERT INTO @Permisos VALUES
('ingredientes_extra.ver',              N'Ver ingredientes extra',                 0),
('ingredientes_extra.crear',            N'Crear ingredientes extra',               0),
('ingredientes_extra.editar',           N'Editar ingredientes extra',              0),
('ingredientes_extra.estado.modificar', N'Activar o desactivar ingredientes extra',0);

MERGE dbo.Seg_Permisos AS target
USING (
    SELECT m.Id_Modulo, p.Codigo, p.Nombre, p.EsCritico
    FROM @Permisos p
    CROSS JOIN dbo.Seg_Modulos m
    WHERE m.Codigo = 'ingredientes_extra'
) AS source
ON target.Codigo = source.Codigo
WHEN MATCHED THEN UPDATE SET Id_Modulo = source.Id_Modulo, Nombre = source.Nombre, EsCritico = source.EsCritico, Activo = 1
WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, EsCritico, Activo)
    VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.EsCritico, 1);

-- Los roles con acceso total (Administrador y Desarrollador) reciben los nuevos permisos.
INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
FROM dbo.Emp_Roles_Usuarios r
JOIN dbo.Seg_Permisos p ON p.Codigo IN (
    'ingredientes_extra.ver','ingredientes_extra.crear','ingredientes_extra.editar','ingredientes_extra.estado.modificar')
WHERE UPPER(r.Nombre_Rol) IN ('ADMINISTRADOR', 'DESARROLLADOR')
  AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

COMMIT TRANSACTION;
