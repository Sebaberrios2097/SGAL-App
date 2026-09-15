SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Se elimina el concepto de "preparación base". Cada producto con receta tiene
-- su receta independiente y autocontenida. Se borran las preparaciones base
-- existentes (entorno de pruebas) y se quitan las columnas de base de Inv_Recetas.
-- ---------------------------------------------------------------------------

-- 1) Romper vínculos a base y borrar las preparaciones base y sus materiales.
IF COL_LENGTH('dbo.Inv_Recetas', 'Id_Receta_Base') IS NOT NULL
    UPDATE dbo.Inv_Recetas SET Id_Receta_Base = NULL WHERE Id_Receta_Base IS NOT NULL;

IF COL_LENGTH('dbo.Inv_Recetas', 'Es_Preparacion_Base') IS NOT NULL
BEGIN
    DELETE mr FROM dbo.Inv_Materiales_Receta mr
        INNER JOIN dbo.Inv_Recetas r ON r.Id_Receta = mr.Id_Receta
        WHERE r.Es_Preparacion_Base = 1;
    DELETE FROM dbo.Inv_Recetas WHERE Es_Preparacion_Base = 1;
END;

-- Recetas huérfanas sin producto (no deberían quedar): se eliminan para poder
-- dejar Id_Producto NOT NULL.
DELETE mr FROM dbo.Inv_Materiales_Receta mr
    INNER JOIN dbo.Inv_Recetas r ON r.Id_Receta = mr.Id_Receta
    WHERE r.Id_Producto IS NULL;
DELETE FROM dbo.Inv_Recetas WHERE Id_Producto IS NULL;

-- 2) Quitar la FK self-referencial y las columnas de base.
DECLARE @fkBase sysname = (
    SELECT TOP 1 fk.name FROM sys.foreign_keys fk
    WHERE fk.parent_object_id = OBJECT_ID('dbo.Inv_Recetas')
      AND fk.referenced_object_id = OBJECT_ID('dbo.Inv_Recetas'));
IF @fkBase IS NOT NULL EXEC('ALTER TABLE dbo.Inv_Recetas DROP CONSTRAINT [' + @fkBase + ']');

-- Elimina cualquier CHECK constraint que dependa de las columnas que se van a quitar
-- (p. ej. CK_Inv_Recetas_Tipo que combina Es_Preparacion_Base / Id_Producto / Nombre).
DECLARE @ckName sysname;
DECLARE ck_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT cc.name
    FROM sys.check_constraints cc
    LEFT JOIN sys.sql_expression_dependencies d
        ON d.referencing_id = cc.object_id
    LEFT JOIN sys.columns c
        ON c.object_id = cc.parent_object_id AND c.column_id = d.referenced_minor_id
    WHERE cc.parent_object_id = OBJECT_ID('dbo.Inv_Recetas')
      AND (c.name IN ('Es_Preparacion_Base', 'Id_Receta_Base', 'Nombre', 'Id_Producto')
           OR cc.definition LIKE '%Es_Preparacion_Base%'
           OR cc.definition LIKE '%Id_Receta_Base%'
           OR cc.definition LIKE '%[[]Nombre]%'
           OR cc.definition LIKE '%Id_Producto%');
OPEN ck_cursor;
FETCH NEXT FROM ck_cursor INTO @ckName;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC('ALTER TABLE dbo.Inv_Recetas DROP CONSTRAINT [' + @ckName + ']');
    FETCH NEXT FROM ck_cursor INTO @ckName;
END;
CLOSE ck_cursor;
DEALLOCATE ck_cursor;

DECLARE @ixBase sysname = (
    SELECT TOP 1 i.name FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID('dbo.Inv_Recetas') AND c.name = 'Id_Receta_Base' AND i.is_primary_key = 0);
IF @ixBase IS NOT NULL EXEC('DROP INDEX [' + @ixBase + '] ON dbo.Inv_Recetas');

IF COL_LENGTH('dbo.Inv_Recetas', 'Id_Receta_Base') IS NOT NULL
    ALTER TABLE dbo.Inv_Recetas DROP COLUMN Id_Receta_Base;

DECLARE @dfBase sysname = (
    SELECT dc.name FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE c.object_id = OBJECT_ID('dbo.Inv_Recetas') AND c.name = 'Es_Preparacion_Base');
IF @dfBase IS NOT NULL EXEC('ALTER TABLE dbo.Inv_Recetas DROP CONSTRAINT [' + @dfBase + ']');
IF COL_LENGTH('dbo.Inv_Recetas', 'Es_Preparacion_Base') IS NOT NULL
    ALTER TABLE dbo.Inv_Recetas DROP COLUMN Es_Preparacion_Base;

IF COL_LENGTH('dbo.Inv_Recetas', 'Nombre') IS NOT NULL
    ALTER TABLE dbo.Inv_Recetas DROP COLUMN Nombre;

-- 3) Id_Producto ahora es obligatorio.
IF COL_LENGTH('dbo.Inv_Recetas', 'Id_Producto') IS NOT NULL
    ALTER TABLE dbo.Inv_Recetas ALTER COLUMN Id_Producto INT NOT NULL;

COMMIT TRANSACTION;
