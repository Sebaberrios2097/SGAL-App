/*
  Módulo "Clientes": registro básico de clientes (CRM) para el segmento mostrador.

  - Nueva tabla `Ven_Clientes`: persona o empresa, con datos personales MÍNIMOS y
    todos opcionales salvo el nombre. Pensada con privacidad por diseño de cara a la
    Ley 21.719 (protección de datos personales):
      * Consentimiento de marketing separado del dato de la venta (con su fecha).
      * Baja por ANONIMIZACIÓN (no DELETE físico): conserva la venta asociada por
        obligación tributaria, pero borra/ofusca los datos personales.
  - `Ven_Ventas.Id_Cliente`: cliente asignado a la venta (nullable). Es independiente
    de `Id_Cliente_Empresa` (receptor de factura, que no se toca).
  - Módulo opcional `clientes` (gateable, nace deshabilitado). Permisos ver/crear/
    editar/estado/exportar (acceso-portabilidad) y anonimizar (supresión, crítico).
    Se otorgan al rol ADMINISTRADOR.
*/

IF OBJECT_ID('dbo.Ven_Clientes', 'U') IS NULL
    CREATE TABLE dbo.Ven_Clientes (
        Id_Cliente int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Ven_Clientes PRIMARY KEY,
        -- Tipo de documento: 'RUN' (persona) / 'RUT' (empresa) / NULL (sin documento).
        Tipo_Documento varchar(10) NULL,
        -- RUN/RUT normalizado con guion; opcional (minimización de datos).
        Documento varchar(12) NULL,
        -- Nombre de la persona o razón social; único dato obligatorio.
        Nombre nvarchar(150) NOT NULL,
        Telefono varchar(20) NULL,
        Correo nvarchar(150) NULL,
        Direccion nvarchar(200) NULL,
        -- Consentimiento de marketing (Ley 21.719): separado de la relación de venta.
        Acepta_Marketing bit NOT NULL CONSTRAINT DF_Ven_Clientes_Acepta_Marketing DEFAULT (0),
        Fecha_Consentimiento_Marketing datetime2 NULL,
        Activo bit NOT NULL CONSTRAINT DF_Ven_Clientes_Activo DEFAULT (1),
        -- Baja lógica por derecho de supresión: se ofuscan los datos personales.
        Anonimizado bit NOT NULL CONSTRAINT DF_Ven_Clientes_Anonimizado DEFAULT (0),
        Fecha_Anonimizacion datetime2 NULL,
        Fecha_Creacion datetime2 NOT NULL CONSTRAINT DF_Ven_Clientes_Fecha_Creacion DEFAULT (SYSUTCDATETIME()),
        Fecha_Actualizacion datetime2 NULL
    );
GO

-- Un documento no puede repetirse entre clientes vigentes (el anonimizado libera su documento).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Ven_Clientes_Documento'
              AND object_id = OBJECT_ID('dbo.Ven_Clientes'))
    CREATE UNIQUE INDEX UX_Ven_Clientes_Documento
        ON dbo.Ven_Clientes (Documento)
        WHERE Documento IS NOT NULL;
GO

IF COL_LENGTH('dbo.Ven_Ventas', 'Id_Cliente') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Id_Cliente int NULL;
GO

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID('dbo.Ven_Ventas')
          AND name = 'FK_Ven_Ventas_Cliente'
    )
        ALTER TABLE dbo.Ven_Ventas WITH CHECK
        ADD CONSTRAINT FK_Ven_Ventas_Cliente
            FOREIGN KEY (Id_Cliente) REFERENCES dbo.Ven_Clientes(Id_Cliente);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('dbo.Ven_Ventas')
          AND name = 'IX_Ven_Ventas_Id_Cliente'
    )
        CREATE INDEX IX_Ven_Ventas_Id_Cliente
            ON dbo.Ven_Ventas (Id_Cliente) WHERE Id_Cliente IS NOT NULL;

    -- Módulo Clientes (opcional, sin dependencias).
    IF NOT EXISTS (SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'clientes')
        INSERT INTO dbo.Seg_Modulos (Codigo, Nombre, Descripcion, Orden, Activo, Es_Nucleo)
        VALUES ('clientes', N'Clientes',
            N'Registro de clientes para asignarlos a las ventas y facturar; base para cuentas.',
            80, 1, 0);
    ELSE
        UPDATE dbo.Seg_Modulos
        SET Nombre = N'Clientes',
            Descripcion = N'Registro de clientes para asignarlos a las ventas y facturar; base para cuentas.',
            Orden = 80, Activo = 1, Es_Nucleo = 0
        WHERE Codigo = 'clientes';

    DECLARE @ClientesId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'clientes');

    IF @ClientesId IS NULL
        THROW 51011, 'No fue posible configurar el módulo Clientes.', 1;

    -- Permisos del módulo.
    DECLARE @Permisos TABLE (Codigo varchar(150), Nombre nvarchar(120), Descripcion nvarchar(300), EsCritico bit);
    INSERT INTO @Permisos VALUES
    ('clientes.ver', N'Ver clientes', N'Lista y consulta la ficha de los clientes.', 0),
    ('clientes.crear', N'Crear clientes', N'Registra un cliente nuevo.', 0),
    ('clientes.editar', N'Editar clientes', N'Modifica los datos de un cliente.', 0),
    ('clientes.estado.modificar', N'Activar o desactivar clientes', N'Cambia el estado activo de un cliente.', 0),
    ('clientes.exportar', N'Exportar datos de un cliente', N'Descarga los datos de un cliente (derecho de acceso y portabilidad).', 0),
    ('clientes.anonimizar', N'Anonimizar un cliente', N'Ejerce el derecho de supresión: ofusca los datos personales conservando las ventas.', 1);

    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @ClientesId AS Id_Modulo, Codigo, Nombre, Descripcion, EsCritico FROM @Permisos) AS source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET
        Id_Modulo = source.Id_Modulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = source.EsCritico, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

    -- El módulo nace deshabilitado: la instalación lo activa cuando corresponda.
    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Modulos WHERE Id_Modulo = @ClientesId)
        INSERT INTO dbo.Org_Modulos (Id_Modulo, Habilitado, Fecha_Actualizacion)
        VALUES (@ClientesId, 0, SYSUTCDATETIME());

    -- El Administrador recibe todos los permisos de Clientes.
    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios r
    JOIN dbo.Seg_Permisos p ON p.Id_Modulo = @ClientesId
    WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
          WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
