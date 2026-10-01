-- ============================================================
-- BugieLanding — CMS de la página pública
-- ============================================================
USE master;
GO
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'BugieLanding')
    CREATE DATABASE BugieLanding;
GO
USE BugieLanding;
GO
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'landing')
    EXEC('CREATE SCHEMA landing');
GO

-- Secciones de la landing
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('landing.Sections'))
BEGIN
    CREATE TABLE landing.Sections (
        Id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        SectionKey NVARCHAR(50)     NOT NULL,
        SortOrder  INT              NOT NULL DEFAULT 0,
        IsVisible  BIT              NOT NULL DEFAULT 1,
        UpdatedAt  DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_Sections    PRIMARY KEY (Id),
        CONSTRAINT UQ_Section_Key UNIQUE (SectionKey)
    );
    PRINT 'landing.Sections OK';
END
GO

-- Contenido por idioma (i18n: es | en | pt)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('landing.SectionContents'))
BEGIN
    CREATE TABLE landing.SectionContents (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        SectionId   UNIQUEIDENTIFIER NOT NULL,
        Lang        NVARCHAR(5)      NOT NULL,
        ContentJson NVARCHAR(MAX)    NOT NULL,
        UpdatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_SectionContents      PRIMARY KEY (Id),
        CONSTRAINT FK_Content_Section      FOREIGN KEY (SectionId) REFERENCES landing.Sections(Id),
        CONSTRAINT UQ_Content_Section_Lang UNIQUE (SectionId, Lang)
    );
    CREATE INDEX IX_Content_Lang ON landing.SectionContents (Lang);
    PRINT 'landing.SectionContents OK';
END
GO

-- Assets multimedia subidos desde el admin (imágenes, videos)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('landing.MediaAssets'))
BEGIN
    CREATE TABLE landing.MediaAssets (
        Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        FileName    NVARCHAR(200)    NOT NULL,
        FileUrl     NVARCHAR(500)    NOT NULL,
        MimeType    NVARCHAR(100)    NOT NULL,
        SizeBytes   BIGINT           NOT NULL DEFAULT 0,
        UploadedBy  UNIQUEIDENTIFIER NOT NULL,
        CreatedAt   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_MediaAssets PRIMARY KEY (Id)
    );
    PRINT 'landing.MediaAssets OK';
END
GO

-- Seed: secciones iniciales
IF NOT EXISTS (SELECT 1 FROM landing.Sections WHERE SectionKey = 'hero')
BEGIN
    INSERT INTO landing.Sections (Id, SectionKey, SortOrder) VALUES
        (NEWID(), 'navbar',        0),
        (NEWID(), 'hero',          1),
        (NEWID(), 'features',      2),
        (NEWID(), 'how-it-works',  3),
        (NEWID(), 'safety',        4),
        (NEWID(), 'stats',         5),
        (NEWID(), 'testimonials',  6),
        (NEWID(), 'cta',           7),
        (NEWID(), 'footer',       99);
    PRINT 'Secciones seed OK';
END
GO

-- Seed: contenido español
IF NOT EXISTS (SELECT 1 FROM landing.SectionContents WHERE Lang = 'es')
BEGIN
    DECLARE @NavId   UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='navbar');
    DECLARE @HeroId  UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='hero');
    DECLARE @FeatId  UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='features');
    DECLARE @StatsId UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='stats');
    DECLARE @CtaId   UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='cta');
    DECLARE @FootId  UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='footer');

    INSERT INTO landing.SectionContents (Id, SectionId, Lang, ContentJson) VALUES
    (NEWID(), @NavId, 'es', N'{"links":[{"label":"Empresa","href":"/empresa"},{"label":"Seguridad","href":"/seguridad"},{"label":"Noticias","href":"/noticias"},{"label":"Contacto","href":"/contacto"}],"loginLabel":"Ingresar","registerLabel":"Crear cuenta"}'),
    (NEWID(), @HeroId, 'es', N'{"title":"Transporte seguro en Trujillo","subtitle":"Conductores verificados, monitoreo 24/7 y botón SOS.","ctaPrimary":"Solicitar viaje","ctaSecondary":"Crear cuenta","pills":["Transporte seguro","Monitoreo visible","Verificación"],"stats":[{"value":"5000+","label":"Conductores verificados"},{"value":"24/7","label":"Monitoreo activo"},{"value":"<2min","label":"Respuesta SOS"}]}'),
    (NEWID(), @FeatId, 'es', N'{"eyebrow":"Valor","title":"Una plataforma que comunica seguridad desde la primera pantalla.","text":"Cada vista está pensada para transmitir confianza antes de que el usuario suba al vehículo.","items":[{"icon":"fa-shield-halved","title":"Seguridad operacional","text":"Verificación de identidad, soporte, historial y flujo SOS."},{"icon":"fa-user-check","title":"Conductores validados","text":"Documentos, estados y monitoreo en una sola experiencia."},{"icon":"fa-location-dot","title":"Seguimiento visible","text":"Trazabilidad y contexto del viaje sin saturar la pantalla."},{"icon":"fa-bolt","title":"Solicitud simple","text":"Solicitar, aceptar, seguir y cerrar un viaje en pasos claros."}]}'),
    (NEWID(), @StatsId, 'es', N'{"metrics":[{"label":"Conductores","value":5000,"suffix":"+"},{"label":"Viajes realizados","value":50000,"suffix":"+"},{"label":"Confianza","value":98,"suffix":"%"},{"label":"Soporte","value":24,"suffix":"/7"}]}'),
    (NEWID(), @CtaId, 'es', N'{"eyebrow":"Siguiente paso","title":"Empieza a movilizarte de forma segura hoy.","text":"Regístrate y solicita tu primer viaje verificado.","ctaPrimary":"Entrar al demo","ctaSecondary":"Contactar equipo"}'),
    (NEWID(), @FootId, 'es', N'{"brand":"Bugie","description":"Plataforma de transporte seguro con foco en identidad, trazabilidad y soporte.","address":"Trujillo, Perú","email":"hola@bugie.pe","copyright":"Bugie — Plataforma Integral de Transporte Seguro"}');
    PRINT 'Seed español OK';
END
GO

-- Seed: contenido inglés
IF NOT EXISTS (SELECT 1 FROM landing.SectionContents WHERE Lang = 'en')
BEGIN
    DECLARE @HeroId_en  UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='hero');
    DECLARE @CtaId_en   UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='cta');
    DECLARE @NavId_en   UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='navbar');

    INSERT INTO landing.SectionContents (Id, SectionId, Lang, ContentJson) VALUES
    (NEWID(), @NavId_en, 'en', N'{"links":[{"label":"Company","href":"/empresa"},{"label":"Safety","href":"/seguridad"},{"label":"News","href":"/noticias"},{"label":"Contact","href":"/contacto"}],"loginLabel":"Sign in","registerLabel":"Create account"}'),
    (NEWID(), @HeroId_en, 'en', N'{"title":"Safe transportation in Trujillo","subtitle":"Verified drivers, 24/7 monitoring and SOS button.","ctaPrimary":"Request a ride","ctaSecondary":"Create account","pills":["Safe transport","Live monitoring","Verification"]}'),
    (NEWID(), @CtaId_en, 'en', N'{"eyebrow":"Next step","title":"Start moving safely today.","text":"Sign up and request your first verified ride.","ctaPrimary":"Enter demo","ctaSecondary":"Contact team"}');
    PRINT 'Seed inglés OK';
END
GO

-- Seed: contenido portugués
IF NOT EXISTS (SELECT 1 FROM landing.SectionContents WHERE Lang = 'pt')
BEGIN
    DECLARE @HeroId_pt UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='hero');
    DECLARE @CtaId_pt  UNIQUEIDENTIFIER = (SELECT Id FROM landing.Sections WHERE SectionKey='cta');

    INSERT INTO landing.SectionContents (Id, SectionId, Lang, ContentJson) VALUES
    (NEWID(), @HeroId_pt, 'pt', N'{"title":"Transporte seguro em Trujillo","subtitle":"Motoristas verificados, monitoramento 24/7 e botão SOS.","ctaPrimary":"Solicitar viagem","ctaSecondary":"Criar conta","pills":["Transporte seguro","Monitoramento","Verificação"]}'),
    (NEWID(), @CtaId_pt, 'pt', N'{"eyebrow":"Próximo passo","title":"Comece a se mover com segurança hoje.","text":"Cadastre-se e solicite sua primeira viagem verificada.","ctaPrimary":"Entrar no demo","ctaSecondary":"Contatar equipe"}');
    PRINT 'Seed portugués OK';
END
GO
PRINT '✓ BugieLanding lista';
GO
