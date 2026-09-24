/* Reutiliza clientes de factura por RUT y evita duplicados futuros. */
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID('dbo.SII_Clientes_Empresa', 'U') IS NOT NULL
    BEGIN
        SELECT
            cliente.Id_Cliente_Empresa,
            UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(cliente.Rut_Empresa)), '.', ''), '-', ''), ' ', '')) AS Rut_Normalizado
        INTO #ClientesNormalizados
        FROM dbo.SII_Clientes_Empresa AS cliente;

        SELECT
            normalizado.Id_Cliente_Empresa,
            MIN(normalizado.Id_Cliente_Empresa) OVER (PARTITION BY normalizado.Rut_Normalizado) AS Id_Cliente_Conservar
        INTO #ClientesDuplicados
        FROM #ClientesNormalizados AS normalizado
        WHERE normalizado.Rut_Normalizado <> '';

        IF OBJECT_ID('dbo.Ven_Ventas', 'U') IS NOT NULL
        BEGIN
            UPDATE venta
            SET venta.Id_Cliente_Empresa = duplicado.Id_Cliente_Conservar
            FROM dbo.Ven_Ventas AS venta
            INNER JOIN #ClientesDuplicados AS duplicado
                ON duplicado.Id_Cliente_Empresa = venta.Id_Cliente_Empresa
            WHERE duplicado.Id_Cliente_Empresa <> duplicado.Id_Cliente_Conservar;
        END;

        DELETE cliente
        FROM dbo.SII_Clientes_Empresa AS cliente
        INNER JOIN #ClientesDuplicados AS duplicado
            ON duplicado.Id_Cliente_Empresa = cliente.Id_Cliente_Empresa
        WHERE duplicado.Id_Cliente_Empresa <> duplicado.Id_Cliente_Conservar;

        UPDATE cliente
        SET cliente.Rut_Empresa = LEFT(normalizado.Rut_Normalizado, LEN(normalizado.Rut_Normalizado) - 1)
            + '-' + RIGHT(normalizado.Rut_Normalizado, 1)
        FROM dbo.SII_Clientes_Empresa AS cliente
        INNER JOIN #ClientesNormalizados AS normalizado
            ON normalizado.Id_Cliente_Empresa = cliente.Id_Cliente_Empresa
        WHERE LEN(normalizado.Rut_Normalizado) >= 2;

        IF NOT EXISTS (
            SELECT 1
            FROM sys.indexes
            WHERE object_id = OBJECT_ID('dbo.SII_Clientes_Empresa')
              AND name = 'UX_SII_Clientes_Empresa_Rut'
        )
            CREATE UNIQUE INDEX UX_SII_Clientes_Empresa_Rut
                ON dbo.SII_Clientes_Empresa (Rut_Empresa)
                WHERE Rut_Empresa <> '';
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
