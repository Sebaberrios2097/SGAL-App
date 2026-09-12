/* ============================================================================
   Materias primas que no se descuentan del inventario
   ----------------------------------------------------------------------------
   - Flag No_Descuenta_Inventario en Inv_Materia_Prima. Caso de uso: el agua de
     los cafés, cuyo consumo en mL es engorroso de controlar. Una materia marcada
     así no exige existencia y las recetas que la usen no descuentan stock (ni en
     la venta, ni en extras, ni en consumos de bitácora).
   ============================================================================ */

SET XACT_ABORT ON;
BEGIN TRAN;

IF COL_LENGTH('dbo.Inv_Materia_Prima', 'No_Descuenta_Inventario') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD No_Descuenta_Inventario BIT NOT NULL
        CONSTRAINT DF_Inv_Materia_Prima_No_Descuenta DEFAULT (0);

-- La cantidad requerida en receta pasa a permitir 0: las materias que no se descuentan
-- (p. ej. agua) la usan solo como referencia. Para el resto, la app sigue exigiendo > 0
-- (validación en cliente y en RecipeController), así que 0 solo aparece en no-descontables.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Inv_Materiales_Receta_Cantidad')
    ALTER TABLE dbo.Inv_Materiales_Receta DROP CONSTRAINT CK_Inv_Materiales_Receta_Cantidad;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Inv_Materiales_Receta_Cantidad')
    ALTER TABLE dbo.Inv_Materiales_Receta
        ADD CONSTRAINT CK_Inv_Materiales_Receta_Cantidad CHECK (Cantidad_Requerida >= 0);

COMMIT;
PRINT 'Materia prima: columna No_Descuenta_Inventario aplicada.';
