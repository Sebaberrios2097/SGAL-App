/* Cola auditable para ventas realizadas durante una contingencia sin folios de boleta. */
IF COL_LENGTH('dbo.SII_Clientes_Empresa', 'Correo') IS NULL
    ALTER TABLE dbo.SII_Clientes_Empresa ADD Correo nvarchar(150) NULL;

IF OBJECT_ID('dbo.SII_Contingencia_Lote', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SII_Contingencia_Lote (
        Id_Lote int IDENTITY(1,1) NOT NULL CONSTRAINT PK_SII_Contingencia_Lote PRIMARY KEY,
        Id_Tipo_DTE int NOT NULL,
        Folio int NOT NULL,
        Track_Id bigint NULL,
        Estado varchar(20) NOT NULL,
        Cantidad_Ventas int NOT NULL,
        Monto_Total int NOT NULL,
        Desde datetime2 NOT NULL,
        Hasta datetime2 NOT NULL,
        Fecha_Emision datetime2 NOT NULL,
        Xml_Firmado varbinary(max) NOT NULL,
        CONSTRAINT FK_SII_Contingencia_Lote_Tipo FOREIGN KEY (Id_Tipo_DTE) REFERENCES dbo.SII_Tipos_DTE(Id_Tipo_DTE)
    );
END;

IF OBJECT_ID('dbo.SII_Contingencia_DTE', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SII_Contingencia_DTE (
        Id_Contingencia int IDENTITY(1,1) NOT NULL CONSTRAINT PK_SII_Contingencia_DTE PRIMARY KEY,
        Id_Venta int NOT NULL,
        Id_Tipo_DTE int NOT NULL,
        Estado varchar(20) NOT NULL CONSTRAINT DF_SII_Contingencia_DTE_Estado DEFAULT ('pendiente'),
        Motivo nvarchar(500) NOT NULL,
        Fecha_Registro datetime2 NOT NULL CONSTRAINT DF_SII_Contingencia_DTE_Fecha DEFAULT (SYSUTCDATETIME()),
        Fecha_Regularizacion datetime2 NULL,
        Id_Lote int NULL,
        CONSTRAINT FK_SII_Contingencia_DTE_Venta FOREIGN KEY (Id_Venta) REFERENCES dbo.Ven_Ventas(Id_Venta),
        CONSTRAINT FK_SII_Contingencia_DTE_Tipo FOREIGN KEY (Id_Tipo_DTE) REFERENCES dbo.SII_Tipos_DTE(Id_Tipo_DTE),
        CONSTRAINT FK_SII_Contingencia_DTE_Lote FOREIGN KEY (Id_Lote) REFERENCES dbo.SII_Contingencia_Lote(Id_Lote),
        CONSTRAINT CK_SII_Contingencia_DTE_Estado CHECK (Estado IN ('pendiente','regularizada','excluida'))
    );
    CREATE UNIQUE INDEX UX_SII_Contingencia_DTE_Venta ON dbo.SII_Contingencia_DTE(Id_Venta);
    CREATE INDEX IX_SII_Contingencia_DTE_Pendiente ON dbo.SII_Contingencia_DTE(Estado, Id_Tipo_DTE);
END;
