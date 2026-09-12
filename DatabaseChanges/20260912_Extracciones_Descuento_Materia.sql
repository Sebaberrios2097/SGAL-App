-- Asocia cada extracción (calibración) con la materia prima (café) utilizada y
-- guarda cuánto stock descontó, para poder reponerlo si la extracción se revierte.
-- Idempotente: puede ejecutarse varias veces sin duplicar columnas ni constraints.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1. Materia prima utilizada en la extracción (nullable: extracciones históricas o
--    calibraciones con café no controlado en inventario quedan sin asociación).
IF COL_LENGTH('dbo.Tur_Extracciones', 'Id_Materia_Prima') IS NULL
BEGIN
    ALTER TABLE dbo.Tur_Extracciones ADD Id_Materia_Prima int NULL;
END;

-- 2. Gramaje realmente descontado del stock, expresado en la unidad de la materia prima.
IF COL_LENGTH('dbo.Tur_Extracciones', 'Cantidad_Descontada') IS NULL
BEGIN
    ALTER TABLE dbo.Tur_Extracciones
        ADD Cantidad_Descontada decimal(18,3) NOT NULL
        CONSTRAINT DF_Tur_Extracciones_Cantidad_Descontada DEFAULT (0);
END;

-- 3. Clave foránea hacia la materia prima.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Tur_Extracciones_Inv_Materia_Prima')
BEGIN
    ALTER TABLE dbo.Tur_Extracciones WITH CHECK
        ADD CONSTRAINT FK_Tur_Extracciones_Inv_Materia_Prima
        FOREIGN KEY (Id_Materia_Prima) REFERENCES dbo.Inv_Materia_Prima (Id_Materia_Prima);
END;

COMMIT;
