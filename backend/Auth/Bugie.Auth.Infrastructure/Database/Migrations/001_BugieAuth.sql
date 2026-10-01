-- ============================================================
-- BugieAuth — Identidad y acceso
-- ============================================================
USE master;
GO
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BugieAuth')
    CREATE DATABASE BugieAuth;
GO
USE BugieAuth;
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'auth')
    EXEC('CREATE SCHEMA auth');
GO

-- Usuarios
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('auth.Users'))
BEGIN
    CREATE TABLE auth.Users (
        Id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        Email        NVARCHAR(200)    NOT NULL,
        PasswordHash NVARCHAR(256)    NOT NULL,
        Role         NVARCHAR(20)     NOT NULL,  -- passenger | driver | admin
        FullName     NVARCHAR(120)    NOT NULL,
        Phone        NVARCHAR(20)     NOT NULL,
        IsActive     BIT              NOT NULL DEFAULT 1,
        CreatedAt    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Users       PRIMARY KEY (Id),
        CONSTRAINT UQ_Users_Email UNIQUE      (Email),
        CONSTRAINT CK_Users_Role  CHECK       (Role IN ('passenger','driver','admin'))
    );
    CREATE INDEX IX_Users_Email ON auth.Users (Email);
    CREATE INDEX IX_Users_Role  ON auth.Users (Role);
    PRINT 'auth.Users OK';
END
GO

-- Refresh tokens (sesiones persistentes)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('auth.RefreshTokens'))
BEGIN
    CREATE TABLE auth.RefreshTokens (
        Id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        UserId    UNIQUEIDENTIFIER NOT NULL,
        Token     NVARCHAR(512)    NOT NULL,
        ExpiresAt DATETIME2        NOT NULL,
        IsRevoked BIT              NOT NULL DEFAULT 0,
        CreatedAt DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_RefreshTokens PRIMARY KEY (Id),
        CONSTRAINT FK_RT_User       FOREIGN KEY (UserId) REFERENCES auth.Users(Id),
        CONSTRAINT UQ_RT_Token      UNIQUE (Token)
    );
    CREATE INDEX IX_RT_UserId ON auth.RefreshTokens (UserId);
    PRINT 'auth.RefreshTokens OK';
END
GO

-- Admin inicial (password: Admin2026! — cambiar tras primer acceso)
IF NOT EXISTS (SELECT 1 FROM auth.Users WHERE Email = 'admin@bugie.pe')
BEGIN
    INSERT INTO auth.Users (Id, Email, PasswordHash, Role, FullName, Phone)
    VALUES (NEWID(), 'admin@bugie.pe',
            '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFRpOdem1Xm9Igy',
            'admin', 'Administrador Bugie', '000000000');
    PRINT 'Admin inicial creado: admin@bugie.pe / Admin2026!';
END
GO
PRINT '✓ BugieAuth lista';
GO
