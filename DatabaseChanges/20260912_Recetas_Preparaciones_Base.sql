/* ============================================================================
   Recetas: preparaciones base independientes (sin producto)
   ----------------------------------------------------------------------------
   Permite crear recetas que NO pertenecen a un producto ("preparaciones base",
   p. ej. un espresso base = solo café), marcarlas como base y que otras recetas
   las usen como base (vínculo receta -> receta, reemplaza al antiguo
   producto -> producto).

   Reglas:
     - Receta de producto:  Id_Producto NOT NULL, Es_Preparacion_Base = 0.
     - Preparación base:     Id_Producto NULL, Es_Preparacion_Base = 1, Nombre NOT NULL.
     - Solo las preparaciones base pueden usarse como base de otras recetas
       (se valida en la aplicación).

   La tabla Inv_Recetas está vacía tras el reset, por lo que esta migración es
   solo estructural (no migra datos).
   ============================================================================ */

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) Eliminar el antiguo vínculo de base por producto.
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Inv_Recetas_Inv_Productos_Base')
    ALTER TABLE dbo.Inv_Recetas DROP CONSTRAINT FK_Inv_Recetas_Inv_Productos_Base;

IF COL_LENGTH('dbo.Inv_Recetas', 'Id_Producto_Base') IS NOT NULL
    ALTER TABLE dbo.Inv_Recetas DROP COLUMN Id_Producto_Base;

-- 2) Id_Producto pasa a ser opcional (las preparaciones base no tienen producto).
ALTER TABLE dbo.Inv_Recetas ALTER COLUMN Id_Producto INT NULL;

-- 3) Nuevas columnas.
IF COL_LENGTH('dbo.Inv_Recetas', 'Nombre') IS NULL
    ALTER TABLE dbo.Inv_Recetas ADD Nombre NVARCHAR(100) NULL;

IF COL_LENGTH('dbo.Inv_Recetas', 'Es_Preparacion_Base') IS NULL
    ALTER TABLE dbo.Inv_Recetas ADD Es_Preparacion_Base BIT NOT NULL
        CONSTRAINT DF_Inv_Recetas_Es_Preparacion_Base DEFAULT (0);

IF COL_LENGTH('dbo.Inv_Recetas', 'Id_Receta_Base') IS NULL
    ALTER TABLE dbo.Inv_Recetas ADD Id_Receta_Base INT NULL;

-- 4) Vínculo base receta -> receta.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Inv_Recetas_Receta_Base')
    EXEC(N'ALTER TABLE dbo.Inv_Recetas ADD CONSTRAINT FK_Inv_Recetas_Receta_Base
        FOREIGN KEY (Id_Receta_Base) REFERENCES dbo.Inv_Recetas (Id_Receta);');

-- 5) Coherencia del tipo de receta.
-- Se ejecuta con EXEC para que compile en tiempo de ejecución (ya con las columnas nuevas creadas);
-- de lo contrario el mismo batch no reconoce las columnas agregadas arriba.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Inv_Recetas_Tipo')
    EXEC(N'ALTER TABLE dbo.Inv_Recetas ADD CONSTRAINT CK_Inv_Recetas_Tipo CHECK (
        (Id_Producto IS NOT NULL AND Es_Preparacion_Base = 0)
        OR (Id_Producto IS NULL AND Es_Preparacion_Base = 1 AND Nombre IS NOT NULL)
    );');

COMMIT;
PRINT 'Inv_Recetas actualizada para soportar preparaciones base independientes.';
