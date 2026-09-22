/*
  Promociones (combos). Distintas de los descuentos por producto (Inv_Descuentos_Productos).

  Una promoción tiene precio propio y se compone de grupos:
    - grupo base (Es_Base = 1): productos fijos, cada uno con su cantidad incluida;
    - grupos excluyentes (Es_Base = 0): el cliente elige Cantidad_Elegir opciones del grupo,
      pudiendo repetir la misma opción (p. ej. "2x": un grupo excluyente con Cantidad_Elegir = 2).

  Permisos ventas.promociones.* en el módulo comercial 'ventas' (Punto de venta).
*/

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.Ven_Promociones', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Ven_Promociones (
            Id_Promocion int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ven_Promociones PRIMARY KEY,
            Nombre nvarchar(150) NOT NULL,
            Precio int NOT NULL,
            Descripcion nvarchar(300) NULL,
            Fecha_Inicio datetime NULL,
            Fecha_Fin datetime NULL,
            Activo bit NOT NULL CONSTRAINT DF_Ven_Promociones_Activo DEFAULT (1),
            Fecha_Creacion datetime NOT NULL CONSTRAINT DF_Ven_Promociones_Fecha DEFAULT (GETDATE())
        );
    END;

    IF OBJECT_ID('dbo.Ven_Promocion_Grupos', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Ven_Promocion_Grupos (
            Id_Grupo int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ven_Promocion_Grupos PRIMARY KEY,
            Id_Promocion int NOT NULL,
            Es_Base bit NOT NULL,
            Nombre nvarchar(120) NOT NULL,
            Cantidad_Elegir int NOT NULL CONSTRAINT DF_Ven_Promocion_Grupos_Cantidad DEFAULT (1),
            Orden int NOT NULL CONSTRAINT DF_Ven_Promocion_Grupos_Orden DEFAULT (0),
            CONSTRAINT FK_Ven_Promocion_Grupos_Promocion FOREIGN KEY (Id_Promocion)
                REFERENCES dbo.Ven_Promociones(Id_Promocion) ON DELETE CASCADE
        );
    END;

    IF OBJECT_ID('dbo.Ven_Promocion_Grupo_Productos', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Ven_Promocion_Grupo_Productos (
            Id_Grupo_Producto int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ven_Promocion_Grupo_Productos PRIMARY KEY,
            Id_Grupo int NOT NULL,
            Id_Producto int NOT NULL,
            Cantidad int NOT NULL CONSTRAINT DF_Ven_Promocion_Grupo_Productos_Cantidad DEFAULT (1),
            CONSTRAINT FK_Ven_Promocion_Grupo_Productos_Grupo FOREIGN KEY (Id_Grupo)
                REFERENCES dbo.Ven_Promocion_Grupos(Id_Grupo) ON DELETE CASCADE,
            CONSTRAINT FK_Ven_Promocion_Grupo_Productos_Producto FOREIGN KEY (Id_Producto)
                REFERENCES dbo.Inv_Productos(Id_Producto)
        );
    END;

    -- Permisos del módulo Punto de venta (ventas).
    DECLARE @VentasId int = (SELECT Id_Modulo FROM dbo.Seg_Modulos WHERE Codigo = 'ventas');
    IF @VentasId IS NULL THROW 51030, 'No existe el módulo ventas.', 1;

    DECLARE @Permisos TABLE (Codigo varchar(150), Nombre nvarchar(120), Descripcion nvarchar(300), EsCritico bit);
    INSERT INTO @Permisos VALUES
    ('ventas.promociones.ver', N'Ver promociones', N'Consulta las promociones y su configuración.', 0),
    ('ventas.promociones.crear', N'Crear promociones', N'Crea promociones y define sus grupos de productos.', 0),
    ('ventas.promociones.editar', N'Editar promociones', N'Modifica los datos y grupos de una promoción.', 0),
    ('ventas.promociones.estado.modificar', N'Cambiar estado de promociones', N'Activa o desactiva promociones.', 0),
    ('ventas.promociones.eliminar', N'Eliminar promociones', N'Elimina promociones.', 1);

    MERGE dbo.Seg_Permisos AS target
    USING (SELECT @VentasId AS Id_Modulo, Codigo, Nombre, Descripcion, EsCritico FROM @Permisos) AS source
    ON target.Codigo = source.Codigo
    WHEN MATCHED THEN UPDATE SET
        Id_Modulo = source.Id_Modulo, Nombre = source.Nombre,
        Descripcion = source.Descripcion, EsCritico = source.EsCritico, Activo = 1
    WHEN NOT MATCHED THEN INSERT (Id_Modulo, Codigo, Nombre, Descripcion, EsCritico, Activo)
        VALUES (source.Id_Modulo, source.Codigo, source.Nombre, source.Descripcion, source.EsCritico, 1);

    INSERT INTO dbo.Seg_PermisosXRol (Id_Rol_Usuario, Id_Permiso, Activo, Fecha_Asignacion)
    SELECT r.Id_Rol_Usuario, p.Id_Permiso, 1, GETDATE()
    FROM dbo.Emp_Roles_Usuarios r
    JOIN dbo.Seg_Permisos p ON p.Codigo LIKE 'ventas.promociones.%'
    WHERE UPPER(r.Nombre_Rol) = 'ADMINISTRADOR'
      AND NOT EXISTS (SELECT 1 FROM dbo.Seg_PermisosXRol x
          WHERE x.Id_Rol_Usuario = r.Id_Rol_Usuario AND x.Id_Permiso = p.Id_Permiso);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
