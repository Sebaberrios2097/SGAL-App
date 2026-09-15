SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Los ingredientes extra dejan de ser una tabla propia. Ahora cualquier materia
-- prima puede marcarse "Uso para ingrediente extra" y define su precio (recargo),
-- la cantidad que consume y su unidad. El detalle de venta de ingredientes pasa a
-- referenciar la materia prima directamente.
-- ---------------------------------------------------------------------------

-- 1) Columnas nuevas en la materia prima.
IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Uso_Ingrediente_Extra') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD Uso_Ingrediente_Extra BIT NOT NULL CONSTRAINT DF_Inv_Materia_Prima_Uso_Ingrediente_Extra DEFAULT 0;
IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Precio_Ingrediente_Extra') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD Precio_Ingrediente_Extra INT NULL;
IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Cantidad_Ingrediente_Extra') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD Cantidad_Ingrediente_Extra DECIMAL(18,3) NULL;
IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Id_Unidad_Ingrediente_Extra') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD Id_Unidad_Ingrediente_Extra INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Inv_Materia_Prima_Unidad_Ingrediente_Extra')
    ALTER TABLE dbo.Inv_Materia_Prima WITH CHECK
        ADD CONSTRAINT FK_Inv_Materia_Prima_Unidad_Ingrediente_Extra
        FOREIGN KEY (Id_Unidad_Ingrediente_Extra) REFERENCES dbo.Inv_Unidades_Medida (Id_Unidad_Medida);

-- 2) Repuntar Ven_Detalle_Venta_Ingredientes hacia la materia prima.
IF OBJECT_ID('dbo.Ven_Detalle_Venta_Ingredientes', 'U') IS NOT NULL
BEGIN
    -- Se pierden las elecciones históricas de extras (entorno de pruebas).
    DELETE FROM dbo.Ven_Detalle_Venta_Ingredientes;

    DECLARE @fkExtra sysname = (
        SELECT TOP 1 fk.name FROM sys.foreign_keys fk
        WHERE fk.parent_object_id = OBJECT_ID('dbo.Ven_Detalle_Venta_Ingredientes')
          AND fk.referenced_object_id = OBJECT_ID('dbo.Inv_Ingredientes_Extra'));
    IF @fkExtra IS NOT NULL EXEC('ALTER TABLE dbo.Ven_Detalle_Venta_Ingredientes DROP CONSTRAINT [' + @fkExtra + ']');

    IF COL_LENGTH('dbo.Ven_Detalle_Venta_Ingredientes', 'Id_Ingrediente_Extra') IS NOT NULL
       AND COL_LENGTH('dbo.Ven_Detalle_Venta_Ingredientes', 'Id_Materia_Prima') IS NULL
        EXEC sp_rename 'dbo.Ven_Detalle_Venta_Ingredientes.Id_Ingrediente_Extra', 'Id_Materia_Prima', 'COLUMN';

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ven_Detalle_Venta_Ingredientes_Inv_Materia_Prima')
        ALTER TABLE dbo.Ven_Detalle_Venta_Ingredientes WITH CHECK
            ADD CONSTRAINT FK_Ven_Detalle_Venta_Ingredientes_Inv_Materia_Prima
            FOREIGN KEY (Id_Materia_Prima) REFERENCES dbo.Inv_Materia_Prima (Id_Materia_Prima);
END;

-- 3) Eliminar la tabla de ingredientes extra (ya no se usa).
IF OBJECT_ID('dbo.Inv_Ingredientes_Extra', 'U') IS NOT NULL
    DROP TABLE dbo.Inv_Ingredientes_Extra;

COMMIT TRANSACTION;
