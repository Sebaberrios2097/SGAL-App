/*
  Permite operar Ventas sin el módulo Turnos.

  - Id_Turno pasa a ser opcional.
  - Toda venta conserva el usuario que la realizó, tenga o no turno.
  - Ventas deja de depender comercialmente de Turnos.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.Ven_Ventas', 'Id_Usuario') IS NULL
        ALTER TABLE dbo.Ven_Ventas ADD Id_Usuario int NULL;

    /*
      SQL Server compila el lote completo antes de ejecutar el ALTER TABLE. Estas
      sentencias son dinámicas para que Id_Usuario se resuelva después de crearla.
    */
    EXEC sys.sp_executesql N'
        UPDATE sale
        SET Id_Usuario = shift.Id_Usuario
        FROM dbo.Ven_Ventas sale
        JOIN dbo.Tur_Turno shift ON shift.Id_Turno = sale.Id_Turno
        WHERE sale.Id_Usuario IS NULL;';

    DECLARE @VentasSinUsuario int;
    EXEC sys.sp_executesql
        N'SELECT @Cantidad = COUNT(*) FROM dbo.Ven_Ventas WHERE Id_Usuario IS NULL;',
        N'@Cantidad int OUTPUT',
        @Cantidad = @VentasSinUsuario OUTPUT;

    IF @VentasSinUsuario > 0
        THROW 51001, 'No fue posible determinar el usuario de todas las ventas existentes.', 1;

    EXEC sys.sp_executesql N'ALTER TABLE dbo.Ven_Ventas ALTER COLUMN Id_Usuario int NOT NULL;';
    ALTER TABLE dbo.Ven_Ventas ALTER COLUMN Id_Turno int NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID('dbo.Ven_Ventas')
          AND name = 'FK_Ven_Ventas_Emp_Usuarios'
    )
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.Ven_Ventas WITH CHECK
            ADD CONSTRAINT FK_Ven_Ventas_Emp_Usuarios
                FOREIGN KEY (Id_Usuario) REFERENCES dbo.Emp_Usuarios(Id_Usuario);';

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID('dbo.Ven_Ventas')
          AND name = 'IX_Ven_Ventas_Id_Usuario_Fecha_Venta'
    )
        EXEC sys.sp_executesql N'
            CREATE INDEX IX_Ven_Ventas_Id_Usuario_Fecha_Venta
                ON dbo.Ven_Ventas (Id_Usuario, Fecha_Venta DESC);';

    DELETE dependency
    FROM dbo.Seg_Modulos_Dependencias dependency
    JOIN dbo.Seg_Modulos module ON module.Id_Modulo = dependency.Id_Modulo
    JOIN dbo.Seg_Modulos required ON required.Id_Modulo = dependency.Id_Modulo_Requerido
    WHERE module.Codigo = 'ventas' AND required.Codigo = 'turnos';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
