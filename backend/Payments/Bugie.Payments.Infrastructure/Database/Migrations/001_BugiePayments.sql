-- ============================================================
-- BugiePayments — Pagos, billetera y retiros
-- ============================================================
USE master;
GO
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BugiePayments')
    CREATE DATABASE BugiePayments;
GO
USE BugiePayments;
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'payments')
    EXEC('CREATE SCHEMA payments');
GO

-- Transacciones de pago por viaje
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('payments.Payments'))
BEGIN
    CREATE TABLE payments.Payments (
        Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        TripId        UNIQUEIDENTIFIER NOT NULL,
        PassengerId   UNIQUEIDENTIFIER NOT NULL,
        DriverId      UNIQUEIDENTIFIER NOT NULL,
        Amount        DECIMAL(10,2)    NOT NULL,
        PlatformFee   DECIMAL(10,2)    NOT NULL DEFAULT 0,  -- comisión Bugie
        DriverAmount  DECIMAL(10,2)    NOT NULL DEFAULT 0,  -- monto neto al conductor
        Method        NVARCHAR(10)     NOT NULL,
        Status        NVARCHAR(20)     NOT NULL DEFAULT 'pending',
        Reference     NVARCHAR(100)    NULL,
        CreatedAt     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        PaidAt        DATETIME2        NULL,
        CONSTRAINT PK_Payments       PRIMARY KEY (Id),
        CONSTRAINT UQ_Payment_Trip   UNIQUE (TripId),  -- un pago por viaje
        CONSTRAINT CK_Pay_Method     CHECK (Method IN ('cash','yape','plin')),
        CONSTRAINT CK_Pay_Status     CHECK (Status IN ('pending','completed','refunded','failed'))
    );
    CREATE INDEX IX_Pay_Driver    ON payments.Payments (DriverId);
    CREATE INDEX IX_Pay_Passenger ON payments.Payments (PassengerId);
    CREATE INDEX IX_Pay_Status    ON payments.Payments (Status);
    PRINT 'payments.Payments OK';
END
GO

-- Billetera del conductor (saldo acumulado)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('payments.DriverWallet'))
BEGIN
    CREATE TABLE payments.DriverWallet (
        Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        DriverId      UNIQUEIDENTIFIER NOT NULL,
        Balance       DECIMAL(12,2)    NOT NULL DEFAULT 0,
        TotalEarned   DECIMAL(12,2)    NOT NULL DEFAULT 0,
        TotalWithdrawn DECIMAL(12,2)   NOT NULL DEFAULT 0,
        UpdatedAt     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Wallet       PRIMARY KEY (Id),
        CONSTRAINT UQ_Wallet_Driver UNIQUE (DriverId)
    );
    PRINT 'payments.DriverWallet OK';
END
GO

-- Solicitudes de retiro del conductor
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('payments.Withdrawals'))
BEGIN
    CREATE TABLE payments.Withdrawals (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        DriverId    UNIQUEIDENTIFIER NOT NULL,
        Amount      DECIMAL(12,2)    NOT NULL,
        Method      NVARCHAR(20)     NOT NULL,  -- bank_transfer | yape | plin
        AccountRef  NVARCHAR(100)    NOT NULL,  -- número de cuenta o teléfono
        Status      NVARCHAR(20)     NOT NULL DEFAULT 'pending',
        -- pending | processing | completed | rejected
        ProcessedAt DATETIME2        NULL,
        CreatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Withdrawals    PRIMARY KEY (Id),
        CONSTRAINT CK_WD_Status      CHECK (Status IN ('pending','processing','completed','rejected'))
    );
    CREATE INDEX IX_WD_Driver ON payments.Withdrawals (DriverId);
    PRINT 'payments.Withdrawals OK';
END
GO

-- Historial de movimientos de la billetera
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('payments.WalletTransactions'))
BEGIN
    CREATE TABLE payments.WalletTransactions (
        Id           BIGINT           NOT NULL IDENTITY(1,1),
        DriverId     UNIQUEIDENTIFIER NOT NULL,
        Type         NVARCHAR(20)     NOT NULL,  -- credit | debit | fee
        Amount       DECIMAL(12,2)    NOT NULL,
        Reference    NVARCHAR(200)    NULL,
        BalanceAfter DECIMAL(12,2)    NOT NULL,
        CreatedAt    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_WalletTx PRIMARY KEY (Id)
    );
    CREATE INDEX IX_WalletTx_Driver ON payments.WalletTransactions (DriverId, CreatedAt DESC);
    PRINT 'payments.WalletTransactions OK';
END
GO
PRINT '✓ BugiePayments lista';
GO
