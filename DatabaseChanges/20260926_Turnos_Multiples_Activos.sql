/*
  Permite configurar si distintos usuarios pueden mantener turnos abiertos
  simultáneamente. Por defecto conserva el comportamiento exclusivo actual.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Turnos_Permitir_Multiples_Activos') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Turnos_Permitir_Multiples_Activos bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Turnos_Multiples_Activos DEFAULT (0) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
