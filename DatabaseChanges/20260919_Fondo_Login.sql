/*
  Agrega la zona de fondo 'login' (imagen de 1920 x 1080 px) a Org_Fondos.

  Amplía la restricción de zonas permitidas y registra la fila de login
  deshabilitada, conservando las imágenes ya cargadas para las demás zonas.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Org_Fondos_Zona')
        ALTER TABLE dbo.Org_Fondos DROP CONSTRAINT CK_Org_Fondos_Zona;

    ALTER TABLE dbo.Org_Fondos ADD CONSTRAINT CK_Org_Fondos_Zona
        CHECK (Zona IN ('login', 'sidebar', 'ventas', 'comandas'));

    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Fondos WHERE Zona = 'login')
        INSERT INTO dbo.Org_Fondos (Zona, Habilitado) VALUES ('login', 0);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
