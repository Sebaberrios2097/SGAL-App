/*
  Módulo "Boletas": emisión de Documentos Tributarios Electrónicos (DTE) al SII vía
  LibreDTE (boleta 39, boleta exenta 41, factura 33, factura exenta 34, nota de crédito 61).

  - Nuevo módulo opcional `boletas`, dependiente de `ventas`. Deshabilitado por defecto:
    cada instalación lo activa y configura su emisor (RUT, certificado, CAF) explícitamente.
  - Permisos: emitir documentos exentos (crítico) y configurar el emisor. Se otorgan al rol
    ADMINISTRADOR.
  - Tabla `SII_Emisor` (fila única): datos del contribuyente + config de LibreDTE y correo.
  - Tabla `SII_Dte_Emision` (1:N con la venta): cada documento emitido, con su XML/PDF,
    folio, TrackID y estado. Una venta puede tener su documento principal y su nota de crédito.
  - Catálogos `SII_Tipos_DTE` y `SII_Estados_Boleta`: se crean si faltan y se siembran.

  Nota: las tablas de catálogo SII pueden existir ya en la BD (las entidades EF las mapean),
  pero no hay script previo que las cree; por eso se crean de forma defensiva.
*/

-- Catálogo de tipos de DTE (código oficial del SII, sin identity).
IF OBJECT_ID('dbo.SII_Tipos_DTE', 'U') IS NULL
    CREATE TABLE dbo.SII_Tipos_DTE (
        Id_Tipo_DTE int NOT NULL CONSTRAINT PK_SII_Tipos_DTE PRIMARY KEY,
        Nombre_DTE nvarchar(50) NOT NULL,
        Es_Facturable bit NOT NULL CONSTRAINT DF_SII_Tipos_DTE_Es_Facturable DEFAULT (0)
    );

-- Catálogo de estados de un documento frente al SII.
IF OBJECT_ID('dbo.SII_Estados_Boleta', 'U') IS NULL
    CREATE TABLE dbo.SII_Estados_Boleta (
        Id_Estado_Boleta int IDENTITY(1,1) NOT NULL CONSTRAINT PK_SII_Estados_Boleta PRIMARY KEY,
        Nombre_Estado_Boleta nvarchar(50) NOT NULL
    );

-- Emisor (fila única): identidad del emisor, certificado (con clave cifrada) y SMTP. La API de
-- LibreDTE Core es sin estado, así que SGAL-App conserva el certificado y lo envía al emitir;
-- los folios se gestionan en SII_Caf_Folios y el correo lo envía SGAL-App con este SMTP.
IF OBJECT_ID('dbo.SII_Emisor', 'U') IS NULL
    CREATE TABLE dbo.SII_Emisor (
        Id_Emisor int NOT NULL CONSTRAINT PK_SII_Emisor PRIMARY KEY,
        Rut varchar(12) NOT NULL,
        Razon_Social nvarchar(180) NOT NULL,
        Giro nvarchar(120) NOT NULL,
        Direccion nvarchar(150) NOT NULL,
        Comuna nvarchar(60) NOT NULL,
        Ciudad nvarchar(60) NOT NULL,
        Acteco int NULL,
        Resolucion_Numero int NULL,
        Resolucion_Fecha date NULL,
        Ambiente varchar(20) NOT NULL CONSTRAINT DF_SII_Emisor_Ambiente DEFAULT ('certificacion'),
        Libredte_Url nvarchar(250) NULL,
        Certificado_Nombre nvarchar(180) NULL,
        Certificado_Pfx varbinary(max) NULL,
        Certificado_Clave_Protegida nvarchar(max) NULL,
        Smtp_Host nvarchar(150) NULL,
        Smtp_Puerto int NULL,
        Smtp_Usuario nvarchar(150) NULL,
        Smtp_Clave_Protegida nvarchar(max) NULL,
        Correo_Remitente nvarchar(150) NULL,
        Envio_Automatico_Correo bit NOT NULL CONSTRAINT DF_SII_Emisor_Envio_Automatico_Correo DEFAULT (1),
        Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_SII_Emisor_Fecha_Actualizacion DEFAULT (SYSUTCDATETIME())
    );

-- Documentos emitidos (o por emitir) por venta.
IF OBJECT_ID('dbo.SII_Dte_Emision', 'U') IS NULL
    CREATE TABLE dbo.SII_Dte_Emision (
        Id_Emision int IDENTITY(1,1) NOT NULL CONSTRAINT PK_SII_Dte_Emision PRIMARY KEY,
        Id_Venta int NOT NULL,
        Id_Tipo_DTE int NOT NULL,
        Id_Estado_Boleta int NOT NULL,
        Folio int NULL,
        Track_Id bigint NULL,
        Monto_Neto int NOT NULL CONSTRAINT DF_SII_Dte_Emision_Monto_Neto DEFAULT (0),
        Monto_Exento int NOT NULL CONSTRAINT DF_SII_Dte_Emision_Monto_Exento DEFAULT (0),
        Monto_IVA int NOT NULL CONSTRAINT DF_SII_Dte_Emision_Monto_IVA DEFAULT (0),
        Monto_Total int NOT NULL CONSTRAINT DF_SII_Dte_Emision_Monto_Total DEFAULT (0),
        Xml_Firmado varbinary(max) NULL,
        Pdf varbinary(max) NULL,
        Fecha_Emision datetime NULL,
        Fecha_Actualizacion datetime NOT NULL CONSTRAINT DF_SII_Dte_Emision_Fecha_Actualizacion DEFAULT (GETDATE()),
        Ultimo_Error nvarchar(max) NULL,
        Reintentos int NOT NULL CONSTRAINT DF_SII_Dte_Emision_Reintentos DEFAULT (0),
        Id_Emision_Referencia int NULL,
        CONSTRAINT FK_SII_Dte_Emision_Ven_Ventas FOREIGN KEY (Id_Venta)
            REFERENCES dbo.Ven_Ventas (Id_Venta),
        CONSTRAINT FK_SII_Dte_Emision_SII_Tipos_DTE FOREIGN KEY (Id_Tipo_DTE)
            REFERENCES dbo.SII_Tipos_DTE (Id_Tipo_DTE),
        CONSTRAINT FK_SII_Dte_Emision_SII_Estados_Boleta FOREIGN KEY (Id_Estado_Boleta)
            REFERENCES dbo.SII_Estados_Boleta (Id_Estado_Boleta),
        CONSTRAINT FK_SII_Dte_Emision_Referencia FOREIGN KEY (Id_Emision_Referencia)
            REFERENCES dbo.SII_Dte_Emision (Id_Emision)
    );

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.SII_Dte_Emision')
      AND name = 'UX_SII_Dte_Emision_Venta_Tipo'
)
    CREATE UNIQUE INDEX UX_SII_Dte_Emision_Venta_Tipo
        ON dbo.SII_Dte_Emision (Id_Venta, Id_Tipo_DTE);

-- Actualización defensiva: si SII_Emisor ya existía de una versión anterior de este script,
-- agrega las columnas que falten (certificado y SMTP) sin recrear la tabla.
IF OBJECT_ID('dbo.SII_Emisor', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.SII_Emisor', 'Libredte_Url') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Libredte_Url nvarchar(250) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Certificado_Nombre') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Certificado_Nombre nvarchar(180) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Certificado_Pfx') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Certificado_Pfx varbinary(max) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Certificado_Clave_Protegida') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Certificado_Clave_Protegida nvarchar(max) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Smtp_Host') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Smtp_Host nvarchar(150) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Smtp_Puerto') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Smtp_Puerto int NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Smtp_Usuario') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Smtp_Usuario nvarchar(150) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Smtp_Clave_Protegida') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Smtp_Clave_Protegida nvarchar(max) NULL;
    IF COL_LENGTH('dbo.SII_Emisor', 'Correo_Remitente') IS NULL
        ALTER TABLE dbo.SII_Emisor ADD Correo_Remitente nvarchar(150) NULL;
END

/* Cambio de lote para que las tablas nuevas estén disponibles al sembrar y configurar. */
GO

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    -- Catálogo de tipos de DTE (idempotente, por código oficial).
    MERGE dbo.SII_Tipos_DTE AS target
    USING (VALUES
        (39, N'Boleta electrónica', 0),
        (41, N'Boleta exenta electrónica', 0),
        (33, N'Factura electrónica', 1),
        (34, N'Factura exenta electrónica', 1),
        (61, N'Nota de crédito electrónica', 1)
    ) AS source (Id_Tipo_DTE, Nombre_DTE, Es_Facturable)
    ON target.Id_Tipo_DTE = source.Id_Tipo_DTE
    WHEN MATCHED THEN UPDATE SET Nombre_DTE = source.Nombre_DTE, Es_Facturable = source.Es_Facturable
    WHEN NOT MATCHED THEN INSERT (Id_Tipo_DTE, Nombre_DTE, Es_Facturable)
        VALUES (source.Id_Tipo_DTE, source.Nombre_DTE, source.Es_Facturable);

    -- Catálogo de estados del documento (idempotente, por nombre).
    DECLARE @Estados TABLE (Nombre nvarchar(50));
    INSERT INTO @Estados (Nombre) VALUES
        (N'Pendiente'), (N'Enviado'), (N'Aceptado'), (N'Aceptado con reparos'), (N'Rechazado');

    INSERT INTO dbo.SII_Estados_Boleta (Nombre_Estado_Boleta)
    SELECT e.Nombre FROM @Estados e
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.SII_Estados_Boleta b WHERE b.Nombre_Estado_Boleta = e.Nombre);

    -- Módulo Boletas (opcional, dependiente de Operación de caja/ventas).
    IF NOT EXISTS (SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'boletas')
        INSERT INTO dbo.Seg_Modulos (Codigo, Nombre, Descripcion, Orden, Activo, Es_Nucleo)
        VALUES ('boletas', N'Boletas',
            N'Emisión de documentos tributarios electrónicos (boletas y facturas) al SII.',
            80, 1, 0);
    ELSE
        UPDATE dbo.Seg_Modulos
        SET Nombre = N'Boletas',
            Descripcion = N'Emisión de documentos tributarios electrónicos (boletas y facturas) al SII.',
            Orden = 80, Activo = 1, Es_Nucleo = 0
        WHERE Codigo = 'boletas';

    DECLARE @BoletasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'boletas');
    DECLARE @VentasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas');

    IF @BoletasId IS NULL OR @VentasId IS NULL
        THROW 51020, 'No fue posible configurar el módulo Boletas.', 1;

    -- Dependencia: Boletas requiere Operación de caja (ventas).
    IF NOT EXISTS (
        SELECT 1 FROM dbo.Seg_Modulos_Dependencias
        WHERE Id_Modulo = @BoletasId AND Id_Modulo_Requerido = @VentasId
    )
        INSERT INTO dbo.Seg_Modulos_Dependencias (Id_Modulo, Id_Modulo_Requerido)
        VALUES (@BoletasId, @VentasId);

    -- Permisos del módulo.
    DECLARE @Permisos TABLE (Codigo varchar(150), Nombre nvarchar(120), Descripcion nvarchar(300), EsCritico bit);
    INSERT INTO @Permisos VALUES
    ('ventas.emitir_exento', N'Emitir documentos exentos', N'Permite marcar una venta como exenta de IVA al emitir el documento (boleta/factura exenta).', 1),
    ('configuracion_sistema.boletas.configurar', N'Configurar emisión de boletas', N'Configura los datos del emisor, el certificado, los folios (CAF) y el correo de facturas.', 1);

    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @BoletasId AS Id_Modulo, Codigo, Nombre, Descripcion, EsCritico FROM @Permisos) AS source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET
        Id_Modulo = source.Id_Modulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = source.EsCritico, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

    -- El módulo nace deshabilitado: la instalación lo activa cuando corresponda.
    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Modulos WHERE Id_Modulo = @BoletasId)
        INSERT INTO dbo.Org_Modulos (Id_Modulo, Habilitado, Fecha_Actualizacion)
        VALUES (@BoletasId, 0, SYSUTCDATETIME());

    -- El Administrador recibe todos los permisos de Boletas.
    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios r
    JOIN dbo.Seg_Permisos p ON p.Id_Modulo = @BoletasId
    WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
          WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
