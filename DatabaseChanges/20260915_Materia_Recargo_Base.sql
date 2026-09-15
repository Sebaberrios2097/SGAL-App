SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Una materia prima puede declarar un "recargo base" (cargo adicional) que se
-- usa automáticamente cuando la materia se elige como opción/alternativa de un
-- ingrediente en una receta.
--   Recargo_Base        : monto del cargo (0 = sin cargo).
--   Recargo_Modificable : si el cargo puede ajustarse por receta (true) o queda
--                         fijo al valor base (false).
-- ---------------------------------------------------------------------------

IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Recargo_Base') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD Recargo_Base INT NOT NULL CONSTRAINT DF_Inv_Materia_Prima_Recargo_Base DEFAULT 0;

IF COL_LENGTH('dbo.Inv_Materia_Prima', 'Recargo_Modificable') IS NULL
    ALTER TABLE dbo.Inv_Materia_Prima ADD Recargo_Modificable BIT NOT NULL CONSTRAINT DF_Inv_Materia_Prima_Recargo_Modificable DEFAULT 0;

COMMIT TRANSACTION;
