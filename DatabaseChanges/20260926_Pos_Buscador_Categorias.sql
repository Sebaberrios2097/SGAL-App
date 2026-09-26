/*
  Ajustes adicionales de presentación del catálogo en el Punto de venta.

    - Pos_Mostrar_Buscador: muestra el buscador de productos en el catálogo (1) o lo oculta (0).
    - Pos_Mostrar_Categorias: muestra la sección de categorías (1) o la oculta (0),
      útil cuando hay demasiadas categorías.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Pos_Mostrar_Buscador') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Pos_Mostrar_Buscador bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Pos_Buscador DEFAULT (1) WITH VALUES;

    IF COL_LENGTH('dbo.Org_Configuracion', 'Pos_Mostrar_Categorias') IS NULL
        ALTER TABLE dbo.Org_Configuracion ADD Pos_Mostrar_Categorias bit NOT NULL
            CONSTRAINT DF_Org_Configuracion_Pos_Categorias DEFAULT (1) WITH VALUES;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
