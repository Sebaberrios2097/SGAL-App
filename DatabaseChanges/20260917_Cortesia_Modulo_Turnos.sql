SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @ModuloTurnos int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'turnos');

IF @ModuloTurnos IS NULL
    THROW 50001, 'No existe el módulo turnos en Seg_Modulos.', 1;

UPDATE dbo.Seg_Permisos
SET Id_Modulo = @ModuloTurnos
WHERE Codigo IN (
    'configuracion_inventario.cortesia.ver',
    'configuracion_inventario.cortesia.politica.editar',
    'configuracion_inventario.cortesia.crear',
    'configuracion_inventario.cortesia.editar',
    'configuracion_inventario.cortesia.estado.modificar'
);

COMMIT TRANSACTION;
