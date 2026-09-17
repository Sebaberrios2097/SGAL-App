/*
  Agrega la zona de fondo 'carta' (imagen de 1920 x 1080 px) a Org_Fondos.

  Amplía la restricción de zonas permitidas y registra la fila de carta
  deshabilitada, conservando las imágenes ya cargadas para las demás zonas.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Org_Fondos_Zona')
        ALTER TABLE dbo.Org_Fondos DROP CONSTRAINT CK_Org_Fondos_Zona;

    ALTER TABLE dbo.Org_Fondos ADD CONSTRAINT CK_Org_Fondos_Zona
        CHECK (Zona IN ('login', 'sidebar', 'ventas', 'comandas', 'carta'));

    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Fondos WHERE Zona = 'carta')
        INSERT INTO dbo.Org_Fondos (Zona, Habilitado) VALUES ('carta', 0);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
