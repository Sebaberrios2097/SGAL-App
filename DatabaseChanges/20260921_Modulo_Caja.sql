/*
  Módulo "Caja": separa la generación de la orden (vendedor) del cobro (cajero).

  - Nuevo módulo opcional `caja`, dependiente de `ventas` (Operación de caja).
    Queda deshabilitado por defecto: cada instalación lo activa explícitamente.
  - Los turnos se etiquetan con un tipo (1 = vendedor, 2 = caja) para que puedan
    coexistir un turno de vendedor y uno de caja abiertos a la vez.
  - Cada venta conserva el turno del vendedor que la originó (Id_Turno) y, cuando
    se cobra en caja, el turno de caja donde se cuadró el dinero (Id_Turno_Caja).
  - Permisos del módulo: operar, abrir/cerrar turno de caja, cobrar y modificar
    la venta en caja. Se otorgan al rol ADMINISTRADOR.
*/

IF COL_LENGTH('dbo.Tur_Turno', 'Tipo_Turno') IS NULL
    ALTER TABLE dbo.Tur_Turno ADD Tipo_Turno tinyint NOT NULL
        CONSTRAINT DF_Tur_Turno_Tipo_Turno DEFAULT (1) WITH VALUES;

IF COL_LENGTH('dbo.Ven_Ventas', 'Id_Turno_Caja') IS NULL
    ALTER TABLE dbo.Ven_Ventas ADD Id_Turno_Caja int NULL;

/* El lote se compila completo antes de ejecutarse; el cambio de lote deja las
   columnas nuevas disponibles para las restricciones e índices posteriores. */
GO

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID('dbo.Ven_Ventas')
          AND name = 'FK_Ven_Ventas_Turno_Caja'
    )
        ALTER TABLE dbo.Ven_Ventas WITH CHECK
        ADD CONSTRAINT FK_Ven_Ventas_Turno_Caja
            FOREIGN KEY (Id_Turno_Caja) REFERENCES dbo.Tur_Turno(Id_Turno);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('dbo.Ven_Ventas')
          AND name = 'IX_Ven_Ventas_Id_Turno_Caja'
    )
        CREATE INDEX IX_Ven_Ventas_Id_Turno_Caja
            ON dbo.Ven_Ventas (Id_Turno_Caja) WHERE Id_Turno_Caja IS NOT NULL;

    -- Módulo Caja (opcional, dependiente de Operación de caja).
    IF NOT EXISTS (SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'caja')
        INSERT INTO dbo.Seg_Modulos (Codigo, Nombre, Descripcion, Orden, Activo, Es_Nucleo)
        VALUES ('caja', N'Caja',
            N'Cobro de las ventas generadas por los vendedores: turno de caja, cobro de vales y emisión de la boleta.',
            70, 1, 0);
    ELSE
        UPDATE dbo.Seg_Modulos
        SET Nombre = N'Caja',
            Descripcion = N'Cobro de las ventas generadas por los vendedores: turno de caja, cobro de vales y emisión de la boleta.',
            Orden = 70, Activo = 1, Es_Nucleo = 0
        WHERE Codigo = 'caja';

    DECLARE @CajaId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'caja');
    DECLARE @VentasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas');

    IF @CajaId IS NULL OR @VentasId IS NULL
        THROW 51010, 'No fue posible configurar el módulo Caja.', 1;

    -- Dependencia: Caja requiere Operación de caja.
    IF NOT EXISTS (
        SELECT 1 FROM dbo.Seg_Modulos_Dependencias
        WHERE Id_Modulo = @CajaId AND Id_Modulo_Requerido = @VentasId
    )
        INSERT INTO dbo.Seg_Modulos_Dependencias (Id_Modulo, Id_Modulo_Requerido)
        VALUES (@CajaId, @VentasId);

    -- Permisos del módulo.
    DECLARE @Permisos TABLE (Codigo varchar(150), Nombre nvarchar(120), Descripcion nvarchar(300), EsCritico bit);
    INSERT INTO @Permisos VALUES
    ('caja.operar', N'Acceder a la caja', N'Abre la pantalla de caja y ve los vales pendientes de cobro.', 0),
    ('caja.turno.abrir', N'Abrir turno de caja', N'Inicia un turno de caja con su apertura de efectivo.', 1),
    ('caja.turno.cerrar', N'Cerrar turno de caja', N'Cierra el turno de caja y registra la cuadratura.', 1),
    ('caja.cobrar', N'Cobrar ventas en caja', N'Cobra los vales generados por los vendedores y emite la boleta.', 0),
    ('caja.venta.modificar', N'Modificar ventas en caja', N'Agrega o quita productos de un vale antes de cobrarlo.', 0);

    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @CajaId AS Id_Modulo, Codigo, Nombre, Descripcion, EsCritico FROM @Permisos) AS source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET
        Id_Modulo = source.Id_Modulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = source.EsCritico, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

    -- El módulo nace deshabilitado: la instalación lo activa cuando corresponda.
    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Modulos WHERE Id_Modulo = @CajaId)
        INSERT INTO dbo.Org_Modulos (Id_Modulo, Habilitado, Fecha_Actualizacion)
        VALUES (@CajaId, 0, SYSUTCDATETIME());

    -- El Administrador recibe todos los permisos de Caja.
    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios r
    JOIN dbo.Seg_Permisos p ON p.Id_Modulo = @CajaId
    WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
          WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
