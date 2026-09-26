/*
  Permite habilitar todas las funcionalidades de un módulo o únicamente una
  selección. La configuración inicial conserva todas las funcionalidades.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Modulos', 'Todas_Funcionalidades') IS NULL
        ALTER TABLE dbo.Org_Modulos ADD Todas_Funcionalidades bit NOT NULL
            CONSTRAINT DF_Org_Modulos_Todas_Funcionalidades DEFAULT (1) WITH VALUES;

    IF OBJECT_ID('dbo.Org_Permisos', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Org_Permisos
        (
            Id_Permiso int NOT NULL,
            Fecha_Actualizacion datetime2 NOT NULL
                CONSTRAINT DF_Org_Permisos_Fecha_Actualizacion DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT PK_Org_Permisos PRIMARY KEY (Id_Permiso),
            CONSTRAINT FK_Org_Permisos_Seg_Permisos FOREIGN KEY (Id_Permiso)
                REFERENCES dbo.Seg_Permisos(Id_Permiso) ON DELETE CASCADE
        );
    END

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
