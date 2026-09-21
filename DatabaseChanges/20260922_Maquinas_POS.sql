/*
  Máquinas POS: credenciales de las terminales de pago, gestionadas por el Desarrollador.

  Las credenciales sensibles (access token, webhook secret) se guardan CIFRADAS con el
  Data Protection API de ASP.NET Core (la aplicación las descifra al usarlas). Los datos
  no secretos (terminal, URL base, banderas) se guardan en claro.

  Reemplaza la configuración por archivo/entorno de Mercado Pago: si existe una máquina
  activa, la integración Point la usa; si no, cae a la configuración por compatibilidad.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Int_Maquinas_POS', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Int_Maquinas_POS (
            Id_Maquina int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Int_Maquinas_POS PRIMARY KEY,
            Proveedor varchar(40) NOT NULL,
            Nombre nvarchar(120) NOT NULL,
            Activa bit NOT NULL CONSTRAINT DF_Int_Maquinas_POS_Activa DEFAULT (1),
            Access_Token_Cifrado nvarchar(max) NULL,
            Webhook_Secret_Cifrado nvarchar(max) NULL,
            Terminal_Id nvarchar(120) NULL,
            Base_Url nvarchar(200) NULL,
            Print_On_Terminal varchar(40) NULL,
            Payer_Condition varchar(60) NULL,
            Expiration_Time varchar(20) NULL,
            Permite_Simulacion bit NOT NULL CONSTRAINT DF_Int_Maquinas_POS_Permite_Sim DEFAULT (0),
            Auto_Simular bit NOT NULL CONSTRAINT DF_Int_Maquinas_POS_Auto_Sim DEFAULT (0),
            Fecha_Creacion datetime2 NOT NULL CONSTRAINT DF_Int_Maquinas_POS_Fecha_Creacion DEFAULT (SYSUTCDATETIME()),
            Fecha_Actualizacion datetime2 NOT NULL CONSTRAINT DF_Int_Maquinas_POS_Fecha_Act DEFAULT (SYSUTCDATETIME())
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
