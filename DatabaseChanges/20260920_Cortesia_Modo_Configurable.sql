/*
  La cortesía diaria del módulo "Operación de caja" pasa a ser configurable por modo:
    - PRODUCTOS (comportamiento actual): X unidades diarias de productos específicos.
    - MONTO     (nuevo): un monto diario en dinero, elegible por categorías de producto,
                 con cobertura parcial (cubre hasta agotar el saldo y cobra el resto).

  Inv_Configuracion_Cortesia.Modo                : 'PRODUCTOS' | 'MONTO'.
  Inv_Configuracion_Cortesia.Monto_Diario_Global : tope diario en dinero para el modo MONTO.
  Inv_Categorias_Cortesia                        : categorías elegibles en el modo MONTO.
  Ven_Detalle_Venta.Monto_Cortesia               : porción del subtotal cubierta como cortesía
                                                   (permite cortesía parcial sin dividir la línea).
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Modo y monto diario en la política de cortesía.
IF COL_LENGTH('dbo.Inv_Configuracion_Cortesia', 'Modo') IS NULL
    ALTER TABLE dbo.Inv_Configuracion_Cortesia ADD Modo VARCHAR(10) NOT NULL
        CONSTRAINT DF_Inv_Configuracion_Cortesia_Modo DEFAULT 'PRODUCTOS' WITH VALUES;

IF COL_LENGTH('dbo.Inv_Configuracion_Cortesia', 'Monto_Diario_Global') IS NULL
    ALTER TABLE dbo.Inv_Configuracion_Cortesia ADD Monto_Diario_Global INT NOT NULL
        CONSTRAINT DF_Inv_Configuracion_Cortesia_Monto_Diario DEFAULT 0 WITH VALUES;

-- Categorías elegibles para la cortesía por monto.
IF OBJECT_ID('dbo.Inv_Categorias_Cortesia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Inv_Categorias_Cortesia (
        Id_Categoria_Cortesia INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_Inv_Categorias_Cortesia PRIMARY KEY,
        Id_Categoria_Producto INT NOT NULL,
        Activo INT NOT NULL CONSTRAINT DF_Inv_Categorias_Cortesia_Activo DEFAULT 1,
        Fecha_Creacion DATETIME NOT NULL CONSTRAINT DF_Inv_Categorias_Cortesia_Fecha_Creacion DEFAULT GETDATE(),
        Fecha_Modificacion DATETIME NOT NULL CONSTRAINT DF_Inv_Categorias_Cortesia_Fecha_Modificacion DEFAULT GETDATE(),
        CONSTRAINT FK_Inv_Categorias_Cortesia_Inv_Categoria_Productos
            FOREIGN KEY (Id_Categoria_Producto) REFERENCES dbo.Inv_Categoria_Productos (Id_Categoria_Producto),
        CONSTRAINT UQ_Inv_Categorias_Cortesia_Categoria UNIQUE (Id_Categoria_Producto)
    );
END;

-- Porción del subtotal cubierta como cortesía en cada línea de venta (cortesía parcial).
IF COL_LENGTH('dbo.Ven_Detalle_Venta', 'Monto_Cortesia') IS NULL
BEGIN
    ALTER TABLE dbo.Ven_Detalle_Venta ADD Monto_Cortesia INT NOT NULL
        CONSTRAINT DF_Ven_Detalle_Venta_Monto_Cortesia DEFAULT 0;

    -- Las líneas ya marcadas como cortesía cubrían el subtotal completo.
    EXEC('UPDATE dbo.Ven_Detalle_Venta SET Monto_Cortesia = Subtotal WHERE Es_Cortesia = 1;');
END;

COMMIT TRANSACTION;
