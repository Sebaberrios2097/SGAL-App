SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Org_Logos', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Org_Logos (
            Id_Logo int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Org_Logos PRIMARY KEY,
            Nombre nvarchar(120) NOT NULL,
            Contenido varbinary(max) NOT NULL,
            Tipo_Contenido varchar(50) NOT NULL,
            Nombre_Archivo nvarchar(180) NOT NULL,
            Fecha_Creacion datetime2 NOT NULL CONSTRAINT DF_Org_Logos_Fecha_Creacion DEFAULT (SYSUTCDATETIME()),
            Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Org_Logos_Fecha_Actualizacion DEFAULT (SYSUTCDATETIME())
        );
    END;

    IF OBJECT_ID('dbo.Org_Logos_Ubicaciones', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Org_Logos_Ubicaciones (
            Codigo_Ubicacion varchar(40) NOT NULL CONSTRAINT PK_Org_Logos_Ubicaciones PRIMARY KEY,
            Id_Logo int NOT NULL,
            Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Org_Logos_Ubicaciones_Fecha DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT FK_Org_Logos_Ubicaciones_Org_Logos FOREIGN KEY (Id_Logo)
                REFERENCES dbo.Org_Logos(Id_Logo) ON DELETE CASCADE
        );
        CREATE INDEX IX_Org_Logos_Ubicaciones_Id_Logo
            ON dbo.Org_Logos_Ubicaciones(Id_Logo);
    END;

    /* Conserva el logo configurado antes de esta migración y lo asigna a todas
       las ubicaciones que antes compartían obligatoriamente la misma imagen. */
    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Logos)
       AND EXISTS (
           SELECT 1 FROM dbo.Org_Configuracion
           WHERE Id_Configuracion = 1 AND Logo_Contenido IS NOT NULL
       )
    BEGIN
        DECLARE @IdLogoMigrado int;

        INSERT INTO dbo.Org_Logos
            (Nombre, Contenido, Tipo_Contenido, Nombre_Archivo, Fecha_Creacion, Fecha_Actualizacion)
        SELECT N'Logo principal migrado', Logo_Contenido,
               COALESCE(Logo_Tipo_Contenido, 'image/png'),
               COALESCE(Logo_Nombre_Archivo, N'logo.png'),
               SYSUTCDATETIME(), SYSUTCDATETIME()
        FROM dbo.Org_Configuracion
        WHERE Id_Configuracion = 1 AND Logo_Contenido IS NOT NULL;

        SET @IdLogoMigrado = CONVERT(int, SCOPE_IDENTITY());

        INSERT INTO dbo.Org_Logos_Ubicaciones
            (Codigo_Ubicacion, Id_Logo, Fecha_Actualizacion)
        VALUES
            ('login', @IdLogoMigrado, SYSUTCDATETIME()),
            ('sidebar', @IdLogoMigrado, SYSUTCDATETIME()),
            ('punto_venta', @IdLogoMigrado, SYSUTCDATETIME()),
            ('boletas', @IdLogoMigrado, SYSUTCDATETIME()),
            ('documentos', @IdLogoMigrado, SYSUTCDATETIME()),
            ('favicon', @IdLogoMigrado, SYSUTCDATETIME());
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
