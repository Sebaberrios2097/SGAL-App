/*
  Fondos personalizados por zona de la aplicación.

  Cada zona ('sidebar', 'ventas', 'comandas') admite una única imagen de fondo
  subida por el administrador, con dimensiones exactas obligatorias:
    - sidebar : 600 x 2024 px
    - ventas  : 1920 x 1080 px
    - comandas: 1920 x 1080 px

  La imagen se guarda en la base de datos de la instalación y solo se aplica
  cuando Habilitado = 1; en caso contrario la zona conserva su apariencia actual.

  Nota: se recrea la tabla para reemplazar el diseño anterior basado en capas
  (logo + color + velo). Esta funcionalidad no maneja datos productivos.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Org_Fondos', 'U') IS NOT NULL
        DROP TABLE dbo.Org_Fondos;

    CREATE TABLE dbo.Org_Fondos (
        Zona varchar(40) NOT NULL CONSTRAINT PK_Org_Fondos PRIMARY KEY,
        Habilitado bit NOT NULL CONSTRAINT DF_Org_Fondos_Habilitado DEFAULT (0),
        Contenido varbinary(max) NULL,
        Tipo_Contenido varchar(50) NULL,
        Nombre_Archivo nvarchar(180) NULL,
        Ancho int NULL,
        Alto int NULL,
        Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Org_Fondos_Fecha DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_Org_Fondos_Zona CHECK (Zona IN ('sidebar', 'ventas', 'comandas'))
    );

    /* Registra las tres zonas deshabilitadas y sin imagen para no alterar la
       apariencia actual hasta que se suba y habilite un fondo. */
    INSERT INTO dbo.Org_Fondos (Zona, Habilitado)
    VALUES ('sidebar', 0), ('ventas', 0), ('comandas', 0);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
