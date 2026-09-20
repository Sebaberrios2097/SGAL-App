/*
  Consolida el catálogo comercial en dominios funcionales amplios. Los códigos
  de permiso se conservan por compatibilidad, pero su Id_Modulo pasa al dominio
  que realmente habilita la funcionalidad.

  Catálogo resultante:
    Núcleo: configuracion_sistema, usuarios, inventario, ordenes_compra
    Opcionales: recetas, turnos, ventas
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @ConfiguracionId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'configuracion_sistema');
    DECLARE @UsuariosId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'usuarios');
    DECLARE @InventarioId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'inventario');
    DECLARE @RecetasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'recetas');
    DECLARE @ComprasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ordenes_compra');
    DECLARE @TurnosId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'turnos');
    DECLARE @VentasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas');

    IF @ConfiguracionId IS NULL OR @UsuariosId IS NULL OR @InventarioId IS NULL OR @RecetasId IS NULL
       OR @ComprasId IS NULL OR @TurnosId IS NULL OR @VentasId IS NULL
        THROW 51000, 'No se puede consolidar el catálogo: faltan módulos base.', 1;

    /* Conserva la selección existente antes de cambiar estados y dependencias. */
    DECLARE @Seleccion TABLE (Codigo varchar(80) PRIMARY KEY, Habilitado bit NOT NULL);
    INSERT INTO @Seleccion (Codigo, Habilitado)
    SELECT m.Codigo, CONVERT(bit, CASE WHEN m.Es_Nucleo = 1 OR ISNULL(om.Habilitado, 0) = 1 THEN 1 ELSE 0 END)
    FROM dbo.Seg_Modulos m
    LEFT JOIN dbo.Org_Modulos om ON om.Id_Modulo = m.Id_Modulo;
    DECLARE @EraCatalogoConsolidado bit = CASE WHEN EXISTS (
        SELECT 1 FROM dbo.Seg_Modulos WHERE Codigo = 'recetas' AND Activo = 0
    ) THEN 1 ELSE 0 END;

    /* Accesos y roles forman un único núcleo administrativo. */
    UPDATE dbo.Seg_Permisos SET Id_Modulo = @UsuariosId WHERE Codigo LIKE 'roles.%';

    /* Recetas y materiales es la capa avanzada sobre el inventario simple. */
    UPDATE dbo.Seg_Permisos SET Id_Modulo = @RecetasId
    WHERE Codigo LIKE 'recetas.%'
       OR Codigo LIKE 'configuracion_inventario.%'
       OR Codigo LIKE 'ingredientes_extra.%';

    /* Compras agrupa el ciclo de órdenes y su maestro de proveedores. */
    UPDATE dbo.Seg_Permisos SET Id_Modulo = @ComprasId WHERE Codigo LIKE 'proveedores.%';

    /* Turnos agrupa operación, cortesías, bitácora y consulta administrativa. */
    UPDATE dbo.Seg_Permisos SET Id_Modulo = @TurnosId
    WHERE Codigo LIKE 'bitacora.%'
       OR Codigo LIKE 'registros_turnos.%'
       OR Codigo LIKE 'configuracion_inventario.cortesia.%';

    /* Ventas incorpora descuentos y su panel conjunto. */
    UPDATE dbo.Seg_Permisos SET Id_Modulo = @VentasId
    WHERE Codigo LIKE 'inventario.descuentos.%'
       OR Codigo = 'inicio.dashboard.ver';

    /* Integraciones se retira hasta definir su modelo exclusivo para Desarrollador. */
    UPDATE dbo.Seg_Permisos SET Activo = 0 WHERE Codigo LIKE 'integraciones.%';

    UPDATE dbo.Seg_Modulos
    SET Nombre = CASE Codigo
            WHEN 'configuracion_sistema' THEN N'Configuración del sistema'
            WHEN 'usuarios' THEN N'Usuarios y accesos'
            WHEN 'inventario' THEN N'Inventario'
            WHEN 'recetas' THEN N'Recetas y materiales'
            WHEN 'ordenes_compra' THEN N'Compras y proveedores'
            WHEN 'turnos' THEN N'Turnos'
            WHEN 'ventas' THEN N'Ventas'
        END,
        Descripcion = CASE Codigo
            WHEN 'configuracion_sistema' THEN N'Identidad de la organización y configuración de los módulos disponibles.'
            WHEN 'usuarios' THEN N'Empleados, cuentas, roles, permisos y control de acceso al sistema.'
            WHEN 'inventario' THEN N'Productos terminados, categorías y control de stock simple por unidades.'
            WHEN 'recetas' THEN N'Materias primas, recetas, unidades, presentaciones, marcas, ingredientes extra y consumo de materiales.'
            WHEN 'ordenes_compra' THEN N'Proveedores, órdenes de compra, recepciones, costos y actualización de existencias.'
            WHEN 'turnos' THEN N'Apertura y cierre, cortesías, bitácora, consumos, extracciones e historial administrativo de turnos.'
            WHEN 'ventas' THEN N'Punto de venta, descuentos, medios de pago, comandas, comprobantes y panel administrativo.'
        END,
        Orden = CASE Codigo
            WHEN 'configuracion_sistema' THEN 10
            WHEN 'usuarios' THEN 20
            WHEN 'inventario' THEN 30
            WHEN 'recetas' THEN 40
            WHEN 'ordenes_compra' THEN 50
            WHEN 'turnos' THEN 60
            WHEN 'ventas' THEN 70
        END,
        Es_Nucleo = CASE WHEN Codigo IN ('configuracion_sistema', 'usuarios', 'inventario', 'ordenes_compra') THEN 1 ELSE 0 END,
        Activo = 1
    WHERE Codigo IN ('configuracion_sistema', 'usuarios', 'inventario', 'recetas', 'ordenes_compra', 'turnos', 'ventas');

    UPDATE dbo.Seg_Modulos
    SET Activo = 0, Es_Nucleo = 0
    WHERE Codigo IN ('inicio', 'roles', 'ingredientes_extra', 'configuracion_inventario',
                     'proveedores', 'registros_turnos', 'bitacora', 'integraciones');

    /* Reemplaza el grafo anterior por dependencias entre dominios consolidados. */
    DELETE dependency
    FROM dbo.Seg_Modulos_Dependencias dependency
    JOIN dbo.Seg_Modulos module ON module.Id_Modulo = dependency.Id_Modulo
    WHERE module.Codigo IN ('configuracion_sistema', 'inicio', 'usuarios', 'roles', 'inventario', 'recetas',
                            'ingredientes_extra', 'configuracion_inventario', 'proveedores', 'ordenes_compra',
                            'registros_turnos', 'turnos', 'ventas', 'bitacora', 'integraciones');
    INSERT INTO dbo.Seg_Modulos_Dependencias (Id_Modulo, Id_Modulo_Requerido) VALUES
        (@RecetasId, @InventarioId),
        (@TurnosId, @UsuariosId),
        (@VentasId, @InventarioId);

    DECLARE @InventarioHabilitado bit = CASE WHEN EXISTS (
        SELECT 1 FROM @Seleccion WHERE Codigo = 'inventario' AND Habilitado = 1
    ) THEN 1 ELSE 0 END;
    DECLARE @RecetasHabilitado bit = CASE WHEN EXISTS (
        SELECT 1 FROM @Seleccion WHERE Codigo IN ('recetas', 'configuracion_inventario', 'ingredientes_extra') AND Habilitado = 1
    ) THEN 1 ELSE 0 END;
    IF @EraCatalogoConsolidado = 1 AND @InventarioHabilitado = 1 SET @RecetasHabilitado = 1;
    DECLARE @ComprasHabilitado bit = CASE WHEN EXISTS (
        SELECT 1 FROM @Seleccion WHERE Codigo IN ('ordenes_compra', 'proveedores') AND Habilitado = 1
    ) THEN 1 ELSE 0 END;
    DECLARE @TurnosHabilitado bit = CASE WHEN EXISTS (
        SELECT 1 FROM @Seleccion WHERE Codigo IN ('turnos', 'bitacora', 'registros_turnos') AND Habilitado = 1
    ) THEN 1 ELSE 0 END;
    DECLARE @VentasHabilitado bit = CASE WHEN EXISTS (
        SELECT 1 FROM @Seleccion WHERE Codigo = 'ventas' AND Habilitado = 1
    ) THEN 1 ELSE 0 END;
    /* Cierre transitivo: un dominio habilitado conserva todos sus requisitos. */
    IF @RecetasHabilitado = 1 SET @InventarioHabilitado = 1;
    IF @VentasHabilitado = 1 SET @InventarioHabilitado = 1;

    /* Inventario y Compras son parte inseparable del núcleo logístico. */
    SET @InventarioHabilitado = 1;
    SET @ComprasHabilitado = 1;

    DECLARE @NuevaSeleccion TABLE (IdModulo int PRIMARY KEY, Habilitado bit NOT NULL);
    INSERT INTO @NuevaSeleccion VALUES
        (@ConfiguracionId, 1), (@UsuariosId, 1),
        (@InventarioId, 1), (@RecetasId, @RecetasHabilitado), (@ComprasId, 1),
        (@TurnosId, @TurnosHabilitado), (@VentasId, @VentasHabilitado);

    MERGE dbo.Org_Modulos AS target
    USING @NuevaSeleccion AS source ON source.IdModulo = target.Id_Modulo
    WHEN MATCHED THEN UPDATE SET Habilitado = source.Habilitado, Fecha_Actualizacion = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Habilitado, Fecha_Actualizacion)
        VALUES (source.IdModulo, source.Habilitado, SYSUTCDATETIME());

    UPDATE om SET Habilitado = 0, Fecha_Actualizacion = SYSUTCDATETIME()
    FROM dbo.Org_Modulos om
    JOIN dbo.Seg_Modulos m ON m.Id_Modulo = om.Id_Modulo
    WHERE m.Activo = 0;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
