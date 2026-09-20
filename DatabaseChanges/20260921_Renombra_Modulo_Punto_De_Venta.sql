/*
  Renombra el módulo comercial `ventas` de "Operación de caja" a "Punto de venta".

  Al existir ahora un módulo dedicado `caja` (cobro), el nombre "Operación de caja"
  del módulo de ventas quedaba ambiguo. El código del módulo (`ventas`) no cambia,
  por lo que permisos, roles y dependencias se conservan.
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE dbo.Seg_Modulos
    SET Nombre = N'Punto de venta',
        Descripcion = N'Punto de venta, turnos, cuadratura configurable, bitácora, consumos de empleados y control administrativo por turno.'
    WHERE Codigo = 'ventas';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
