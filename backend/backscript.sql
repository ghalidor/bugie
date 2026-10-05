--
-- PostgreSQL database dump
--

\restrict YsnpxMEeh3bvMg2ZAND0rWPBz7O4Vpf7wxtq80VOml5Ynkp1ISOymrUwqq3HrVv

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO postgres;

--
-- Name: drivers; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drivers;


ALTER SCHEMA drivers OWNER TO postgres;

--
-- Name: landing; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA landing;


ALTER SCHEMA landing OWNER TO postgres;

--
-- Name: payments; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA payments;


ALTER SCHEMA payments OWNER TO postgres;

--
-- Name: rewards; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA rewards;


ALTER SCHEMA rewards OWNER TO postgres;

--
-- Name: trips; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA trips;


ALTER SCHEMA trips OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adminroles; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.adminroles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(60) NOT NULL,
    description character varying(255),
    issystem boolean DEFAULT false NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE auth.adminroles OWNER TO postgres;

--
-- Name: passengerdocuments; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.passengerdocuments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    doctype character varying(50) NOT NULL,
    fileurl character varying(500) NOT NULL,
    storagefileid character varying(500),
    originalfilename character varying(255),
    mimetype character varying(100),
    sizebytes bigint,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    rejectionreason character varying(500),
    reviewedat timestamp without time zone,
    reviewedby uuid,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_passengerdocs_status CHECK ((((status)::text = 'rejected'::text) OR ((status)::text = 'approved'::text) OR ((status)::text = 'pending'::text))),
    CONSTRAINT ck_passengerdocs_type CHECK ((((doctype)::text = 'dni_back'::text) OR ((doctype)::text = 'dni_front'::text)))
);


ALTER TABLE auth.passengerdocuments OWNER TO postgres;

--
-- Name: passwordresettokens; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.passwordresettokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    tokenhash character varying(64) NOT NULL,
    expiresat timestamp without time zone NOT NULL,
    usedat timestamp without time zone,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE auth.passwordresettokens OWNER TO postgres;

--
-- Name: refreshtokens; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.refreshtokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    token character varying(512) NOT NULL,
    expiresat timestamp without time zone NOT NULL,
    isrevoked boolean DEFAULT false NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE auth.refreshtokens OWNER TO postgres;

--
-- Name: rolepermissions; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.rolepermissions (
    roleid uuid NOT NULL,
    permission character varying(80) NOT NULL
);


ALTER TABLE auth.rolepermissions OWNER TO postgres;

--
-- Name: userfcmtokens; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.userfcmtokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    token text NOT NULL,
    platform character varying(10) DEFAULT 'android'::character varying NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE auth.userfcmtokens OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: postgres
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(200) NOT NULL,
    passwordhash character varying(256) NOT NULL,
    role character varying(20) NOT NULL,
    fullname character varying(120) NOT NULL,
    phone character varying(20) NOT NULL,
    isactive boolean DEFAULT true NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    isverified boolean DEFAULT false NOT NULL,
    profilephotourl character varying(500),
    adminroleid uuid,
    termsaccepted boolean DEFAULT false NOT NULL,
    termsacceptedat timestamp without time zone,
    signatureimage text,
    CONSTRAINT ck_users_role CHECK ((((role)::text = 'admin'::text) OR ((role)::text = 'driver'::text) OR ((role)::text = 'passenger'::text)))
);


ALTER TABLE auth.users OWNER TO postgres;

--
-- Name: documentnotifications; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.documentnotifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    documentid uuid NOT NULL,
    daysbefore integer NOT NULL,
    notifiedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE drivers.documentnotifications OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid uuid NOT NULL,
    doctype character varying(30) NOT NULL,
    fileurl character varying(500) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    expiresat timestamp without time zone,
    reviewedat timestamp without time zone,
    reviewedby uuid,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    drivefileid character varying(500),
    originalfilename character varying(255),
    mimetype character varying(100),
    sizebytes bigint,
    rejectionreason character varying(500),
    CONSTRAINT ck_doc_status CHECK ((((status)::text = 'superseded'::text) OR ((status)::text = 'rejected'::text) OR ((status)::text = 'approved'::text) OR ((status)::text = 'pending'::text))),
    CONSTRAINT ck_doc_type CHECK ((((doctype)::text = 'certificado_unico_laboral'::text) OR ((doctype)::text = 'revision_tecnica'::text) OR ((doctype)::text = 'tarjeta_propiedad'::text) OR ((doctype)::text = 'soat'::text) OR ((doctype)::text = 'license'::text) OR ((doctype)::text = 'dni_back'::text) OR ((doctype)::text = 'dni_front'::text)))
);


ALTER TABLE drivers.documents OWNER TO postgres;

--
-- Name: driverpresencecheckins; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.driverpresencecheckins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driveruserid uuid NOT NULL,
    photourl character varying(500) NOT NULL,
    checkedinat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    checkedoutat timestamp without time zone,
    facequalityscore numeric(10,4),
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE drivers.driverpresencecheckins OWNER TO postgres;

--
-- Name: drivers; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    status smallint DEFAULT 1 NOT NULL,
    isonline boolean DEFAULT false NOT NULL,
    currentlat double precision,
    currentlng double precision,
    faceidphotourl character varying(500),
    rating numeric(3,2) DEFAULT 5.00 NOT NULL,
    totalratings integer DEFAULT 0 NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    approvedat timestamp without time zone,
    profilephotourl character varying(500),
    currentlocationat timestamp without time zone,
    CONSTRAINT ck_driver_status CHECK (((status >= 1) AND (status <= 6)))
);


ALTER TABLE drivers.drivers OWNER TO postgres;

--
-- Name: locationhistory; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.locationhistory (
    id bigint NOT NULL,
    driverid uuid NOT NULL,
    tripid uuid,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    speedkmh double precision,
    heading double precision,
    recordedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE drivers.locationhistory OWNER TO postgres;

--
-- Name: locationhistory_id_seq; Type: SEQUENCE; Schema: drivers; Owner: postgres
--

ALTER TABLE drivers.locationhistory ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME drivers.locationhistory_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reviews; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid uuid NOT NULL,
    passengerid uuid NOT NULL,
    tripid uuid NOT NULL,
    rating smallint NOT NULL,
    comment character varying(500),
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_rev_rating CHECK (((rating >= 1) AND (rating <= 5)))
);


ALTER TABLE drivers.reviews OWNER TO postgres;

--
-- Name: vehicles; Type: TABLE; Schema: drivers; Owner: postgres
--

CREATE TABLE drivers.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid uuid NOT NULL,
    plate character varying(20) NOT NULL,
    brand character varying(60) NOT NULL,
    model character varying(60) NOT NULL,
    year smallint NOT NULL,
    color character varying(30) NOT NULL,
    isactive boolean DEFAULT true NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    photourl character varying(500)
);


ALTER TABLE drivers.vehicles OWNER TO postgres;

--
-- Name: contactmessages; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.contactmessages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(120) NOT NULL,
    email character varying(200) NOT NULL,
    subject character varying(60) NOT NULL,
    message character varying(2000) NOT NULL,
    isread boolean DEFAULT false NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    readat timestamp without time zone,
    readbyuserid uuid,
    lastreplyat timestamp without time zone
);


ALTER TABLE landing.contactmessages OWNER TO postgres;

--
-- Name: contactreplies; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.contactreplies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contactid uuid NOT NULL,
    adminuserid uuid,
    adminname character varying(150),
    subject text NOT NULL,
    body text NOT NULL,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    errormessage text,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_contactreplies_status CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'failed'::character varying])::text[])))
);


ALTER TABLE landing.contactreplies OWNER TO postgres;

--
-- Name: faqitems; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.faqitems (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lang character varying(5) DEFAULT 'es'::character varying NOT NULL,
    category character varying(60) NOT NULL,
    question character varying(300) NOT NULL,
    answer text NOT NULL,
    ispublished boolean DEFAULT true NOT NULL,
    sortorder integer DEFAULT 0 NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE landing.faqitems OWNER TO postgres;

--
-- Name: mediaassets; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.mediaassets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename character varying(200) NOT NULL,
    fileurl character varying(500) NOT NULL,
    mimetype character varying(100) NOT NULL,
    sizebytes bigint DEFAULT 0 NOT NULL,
    uploadedby uuid NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE landing.mediaassets OWNER TO postgres;

--
-- Name: newsarticles; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.newsarticles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(120) NOT NULL,
    tag character varying(40) NOT NULL,
    title character varying(200) NOT NULL,
    summary character varying(500) NOT NULL,
    lang character varying(5) DEFAULT 'es'::character varying NOT NULL,
    ispublished boolean DEFAULT true NOT NULL,
    publishedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE landing.newsarticles OWNER TO postgres;

--
-- Name: sectioncontents; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.sectioncontents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sectionid uuid NOT NULL,
    lang character varying(5) NOT NULL,
    contentjson text NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE landing.sectioncontents OWNER TO postgres;

--
-- Name: sections; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sectionkey character varying(50) NOT NULL,
    sortorder integer DEFAULT 0 NOT NULL,
    isvisible boolean DEFAULT true NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE landing.sections OWNER TO postgres;

--
-- Name: systemsettings; Type: TABLE; Schema: landing; Owner: postgres
--

CREATE TABLE landing.systemsettings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settingkey character varying(60) NOT NULL,
    value character varying(500) NOT NULL,
    description character varying(200),
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedby uuid
);


ALTER TABLE landing.systemsettings OWNER TO postgres;

--
-- Name: driverwallet; Type: TABLE; Schema: payments; Owner: postgres
--

CREATE TABLE payments.driverwallet (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid uuid NOT NULL,
    balance numeric(12,2) DEFAULT 0 NOT NULL,
    totalearned numeric(12,2) DEFAULT 0 NOT NULL,
    totalwithdrawn numeric(12,2) DEFAULT 0 NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE payments.driverwallet OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: payments; Owner: postgres
--

CREATE TABLE payments.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid uuid NOT NULL,
    passengerid uuid NOT NULL,
    driverid uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    platformfee numeric(10,2) DEFAULT 0 NOT NULL,
    driveramount numeric(10,2) DEFAULT 0 NOT NULL,
    method character varying(10) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reference character varying(100),
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    paidat timestamp without time zone,
    platformfeerate numeric(5,2),
    CONSTRAINT ck_pay_method CHECK ((((method)::text = 'plin'::text) OR ((method)::text = 'yape'::text) OR ((method)::text = 'cash'::text))),
    CONSTRAINT ck_pay_status CHECK ((((status)::text = 'failed'::text) OR ((status)::text = 'refunded'::text) OR ((status)::text = 'completed'::text) OR ((status)::text = 'pending'::text)))
);


ALTER TABLE payments.payments OWNER TO postgres;

--
-- Name: COLUMN payments.platformfeerate; Type: COMMENT; Schema: payments; Owner: postgres
--

COMMENT ON COLUMN payments.payments.platformfeerate IS 'Porcentaje de comision aplicado a ESTE pago (10.00 = 10%). Se congela al cobrar: cambiar la configuracion no altera los viajes ya cobrados.';


--
-- Name: wallettransactions; Type: TABLE; Schema: payments; Owner: postgres
--

CREATE TABLE payments.wallettransactions (
    id bigint NOT NULL,
    driverid uuid NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(12,2) NOT NULL,
    reference character varying(200),
    balanceafter numeric(12,2) NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE payments.wallettransactions OWNER TO postgres;

--
-- Name: wallettransactions_id_seq; Type: SEQUENCE; Schema: payments; Owner: postgres
--

ALTER TABLE payments.wallettransactions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME payments.wallettransactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: withdrawals; Type: TABLE; Schema: payments; Owner: postgres
--

CREATE TABLE payments.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driverid uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    method character varying(20) NOT NULL,
    accountref character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    processedat timestamp without time zone,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    drivername character varying(120),
    operationnumber character varying(50),
    paidat timestamp without time zone,
    paidbyadminid uuid,
    paidbyadminname character varying(120),
    note character varying(300),
    sourcetype character varying(30) DEFAULT 'manual'::character varying NOT NULL,
    sourceref character varying(60),
    CONSTRAINT ck_wd_method CHECK (((method)::text = ANY ((ARRAY['yape'::character varying, 'plin'::character varying, 'transferencia'::character varying, 'efectivo'::character varying])::text[]))),
    CONSTRAINT ck_wd_sourcetype CHECK (((sourcetype)::text = ANY ((ARRAY['reward_redemption'::character varying, 'raffle_prize'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT ck_wd_status CHECK ((((status)::text = 'rejected'::text) OR ((status)::text = 'completed'::text) OR ((status)::text = 'processing'::text) OR ((status)::text = 'pending'::text)))
);


ALTER TABLE payments.withdrawals OWNER TO postgres;

--
-- Name: bugie_migraciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bugie_migraciones (
    nombre character varying(100) NOT NULL,
    aplicada timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE public.bugie_migraciones OWNER TO postgres;

--
-- Name: catalogitems; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.catalogitems (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(40) NOT NULL,
    usertype character varying(10) NOT NULL,
    name character varying(120) NOT NULL,
    description text,
    pointscost integer NOT NULL,
    rewardtype character varying(30) NOT NULL,
    amountsoles numeric(10,2),
    quantity integer,
    percentage numeric(5,2),
    minlevel character varying(20),
    stock integer,
    validitydays integer DEFAULT 30 NOT NULL,
    sortorder smallint DEFAULT 0 NOT NULL,
    isactive boolean DEFAULT true NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_catalogitems_cost CHECK ((pointscost > 0)),
    CONSTRAINT ck_catalogitems_stock CHECK (((stock IS NULL) OR (stock >= 0))),
    CONSTRAINT ck_catalogitems_type CHECK (((rewardtype)::text = ANY (ARRAY[('discount_amount'::character varying)::text, ('free_trip'::character varying)::text, ('discount_period'::character varying)::text, ('raffle_ticket'::character varying)::text, ('wallet_bonus'::character varying)::text, ('physical'::character varying)::text, ('partner_benefit'::character varying)::text]))),
    CONSTRAINT ck_catalogitems_usertype CHECK (((usertype)::text = ANY (ARRAY[('passenger'::character varying)::text, ('driver'::character varying)::text]))),
    CONSTRAINT ck_catalogitems_validity CHECK ((validitydays > 0))
);


ALTER TABLE rewards.catalogitems OWNER TO postgres;

--
-- Name: levels; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usertype character varying(10) NOT NULL,
    name character varying(20) NOT NULL,
    displayname character varying(40) NOT NULL,
    sortorder smallint NOT NULL,
    minpoints integer NOT NULL,
    maxpoints integer,
    discountpercentage numeric(5,2) DEFAULT 0 NOT NULL,
    monthlyfreetrips integer DEFAULT 0 NOT NULL,
    weeklyraffletickets integer DEFAULT 0 NOT NULL,
    monthlyraffletickets integer DEFAULT 0 NOT NULL,
    isactive boolean DEFAULT true NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_rewardslevels_discount CHECK (((discountpercentage >= (0)::numeric) AND (discountpercentage <= (100)::numeric))),
    CONSTRAINT ck_rewardslevels_minpoints CHECK ((minpoints >= 0)),
    CONSTRAINT ck_rewardslevels_usertype CHECK (((usertype)::text = ANY (ARRAY[('passenger'::character varying)::text, ('driver'::character varying)::text])))
);


ALTER TABLE rewards.levels OWNER TO postgres;

--
-- Name: milestoneawards; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.milestoneawards (
    id bigint NOT NULL,
    profileid uuid NOT NULL,
    type character varying(20) NOT NULL,
    periodkey character varying(20) NOT NULL,
    points integer NOT NULL,
    detail integer,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_milestoneawards_type CHECK (((type)::text = ANY (ARRAY[('streak'::character varying)::text, ('weekly_goal'::character varying)::text, ('anniversary'::character varying)::text, ('no_cancellations'::character varying)::text])))
);


ALTER TABLE rewards.milestoneawards OWNER TO postgres;

--
-- Name: milestoneawards_id_seq; Type: SEQUENCE; Schema: rewards; Owner: postgres
--

ALTER TABLE rewards.milestoneawards ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME rewards.milestoneawards_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pointsadjustments; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.pointsadjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profileid uuid NOT NULL,
    transactionid uuid NOT NULL,
    points integer NOT NULL,
    reason character varying(300) NOT NULL,
    adminid uuid,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_pointsadjustments_points CHECK ((points <> 0)),
    CONSTRAINT ck_pointsadjustments_reason CHECK ((length(TRIM(BOTH FROM reason)) >= 5))
);


ALTER TABLE rewards.pointsadjustments OWNER TO postgres;

--
-- Name: pointsprofiles; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.pointsprofiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    usertype character varying(10) NOT NULL,
    totalpoints integer DEFAULT 0 NOT NULL,
    availablepoints integer DEFAULT 0 NOT NULL,
    redeemedpoints integer DEFAULT 0 NOT NULL,
    currentlevel character varying(20) DEFAULT 'bronze'::character varying NOT NULL,
    pointsexpirydate timestamp without time zone,
    lastactivitydate timestamp without time zone,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    expirywarningsentfor timestamp without time zone,
    expirywarninglastmilestone integer,
    CONSTRAINT ck_pointsprofiles_available CHECK ((availablepoints >= 0)),
    CONSTRAINT ck_pointsprofiles_redeemed CHECK ((redeemedpoints >= 0)),
    CONSTRAINT ck_pointsprofiles_total CHECK ((totalpoints >= 0)),
    CONSTRAINT ck_pointsprofiles_usertype CHECK (((usertype)::text = ANY (ARRAY[('passenger'::character varying)::text, ('driver'::character varying)::text])))
);


ALTER TABLE rewards.pointsprofiles OWNER TO postgres;

--
-- Name: pointstransactions; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.pointstransactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profileid uuid NOT NULL,
    type character varying(10) NOT NULL,
    points integer NOT NULL,
    sourceevent character varying(50) NOT NULL,
    referenceid uuid,
    balancebefore integer NOT NULL,
    balanceafter integer NOT NULL,
    expirydate timestamp without time zone,
    notes text,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_pointstransactions_balance CHECK (((balancebefore >= 0) AND (balanceafter >= 0))),
    CONSTRAINT ck_pointstransactions_points CHECK ((points > 0)),
    CONSTRAINT ck_pointstransactions_type CHECK (((type)::text = ANY (ARRAY[('earn'::character varying)::text, ('redeem'::character varying)::text, ('expire'::character varying)::text, ('bonus'::character varying)::text, ('adjust_add'::character varying)::text, ('adjust_sub'::character varying)::text])))
);


ALTER TABLE rewards.pointstransactions OWNER TO postgres;

--
-- Name: promotionapplications; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.promotionapplications (
    id bigint NOT NULL,
    promotionid uuid NOT NULL,
    profileid uuid NOT NULL,
    tripid uuid NOT NULL,
    pointsadded integer NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE rewards.promotionapplications OWNER TO postgres;

--
-- Name: promotionapplications_id_seq; Type: SEQUENCE; Schema: rewards; Owner: postgres
--

ALTER TABLE rewards.promotionapplications ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME rewards.promotionapplications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: promotions; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(120) NOT NULL,
    description text,
    promotiontype character varying(20) NOT NULL,
    targetusertype character varying(10) DEFAULT 'both'::character varying NOT NULL,
    multipliervalue numeric(5,2),
    bonuspoints integer,
    startdate timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    enddate timestamp without time zone,
    conditionsjson text DEFAULT '{}'::text NOT NULL,
    isactive boolean DEFAULT true NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_promotions_bonus CHECK (((bonuspoints IS NULL) OR (bonuspoints > 0))),
    CONSTRAINT ck_promotions_dates CHECK (((enddate IS NULL) OR (enddate > startdate))),
    CONSTRAINT ck_promotions_multiplier CHECK (((multipliervalue IS NULL) OR ((multipliervalue > (0)::numeric) AND (multipliervalue <= (10)::numeric)))),
    CONSTRAINT ck_promotions_target CHECK (((targetusertype)::text = ANY (ARRAY[('passenger'::character varying)::text, ('driver'::character varying)::text, ('both'::character varying)::text]))),
    CONSTRAINT ck_promotions_type CHECK (((promotiontype)::text = ANY (ARRAY[('multiplier'::character varying)::text, ('bonus_points'::character varying)::text, ('discount'::character varying)::text, ('free_trip'::character varying)::text])))
);


ALTER TABLE rewards.promotions OWNER TO postgres;

--
-- Name: raffles; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.raffles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(120) NOT NULL,
    raffletype character varying(10) NOT NULL,
    prizedescription text NOT NULL,
    prizevalue numeric(10,2),
    drawdate timestamp without time zone NOT NULL,
    minlevelrequired character varying(20),
    minmonthsactive integer,
    targetusertype character varying(10) DEFAULT 'both'::character varying NOT NULL,
    winnerscount integer DEFAULT 1 NOT NULL,
    status character varying(10) DEFAULT 'open'::character varying NOT NULL,
    drawseed character varying(64),
    drawnat timestamp without time zone,
    ticketsatdraw integer,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_raffles_status CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('closed'::character varying)::text, ('drawn'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT ck_raffles_target CHECK (((targetusertype)::text = ANY (ARRAY[('passenger'::character varying)::text, ('driver'::character varying)::text, ('both'::character varying)::text]))),
    CONSTRAINT ck_raffles_type CHECK (((raffletype)::text = ANY (ARRAY[('weekly'::character varying)::text, ('monthly'::character varying)::text, ('special'::character varying)::text]))),
    CONSTRAINT ck_raffles_winners CHECK (((winnerscount > 0) AND (winnerscount <= 50)))
);


ALTER TABLE rewards.raffles OWNER TO postgres;

--
-- Name: raffletickets; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.raffletickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raffleid uuid NOT NULL,
    userid uuid NOT NULL,
    profileid uuid NOT NULL,
    ticketnumber character varying(20) NOT NULL,
    source character varying(20) NOT NULL,
    referenceid uuid,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_raffletickets_source CHECK (((source)::text = ANY (ARRAY[('level_benefit'::character varying)::text, ('points_redemption'::character varying)::text, ('promotion'::character varying)::text, ('monthly_points'::character varying)::text])))
);


ALTER TABLE rewards.raffletickets OWNER TO postgres;

--
-- Name: rafflewinners; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.rafflewinners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raffleid uuid NOT NULL,
    userid uuid NOT NULL,
    ticketnumber character varying(20) NOT NULL,
    prizerank integer NOT NULL,
    prizedetail text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    deliveredat timestamp without time zone,
    deliveredby uuid,
    note character varying(300),
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_rafflewinners_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('delivered'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE rewards.rafflewinners OWNER TO postgres;

--
-- Name: redemptions; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profileid uuid NOT NULL,
    userid uuid NOT NULL,
    catalogitemid uuid NOT NULL,
    code character varying(20) NOT NULL,
    itemname character varying(120) NOT NULL,
    pointsspent integer NOT NULL,
    rewardtype character varying(30) NOT NULL,
    amountsoles numeric(10,2),
    quantity integer,
    percentage numeric(5,2),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    expiresat timestamp without time zone NOT NULL,
    usedat timestamp without time zone,
    usedreferenceid uuid,
    usednote character varying(200),
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_redemptions_points CHECK ((pointsspent > 0)),
    CONSTRAINT ck_redemptions_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('used'::character varying)::text, ('expired'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE rewards.redemptions OWNER TO postgres;

--
-- Name: referralcodes; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.referralcodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    userid uuid NOT NULL,
    code character varying(12) NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE rewards.referralcodes OWNER TO postgres;

--
-- Name: referralinvitations; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.referralinvitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referreruserid uuid NOT NULL,
    email character varying(200) NOT NULL,
    code character varying(12) NOT NULL,
    sentat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    acceptedat timestamp without time zone
);


ALTER TABLE rewards.referralinvitations OWNER TO postgres;

--
-- Name: referrals; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referreruserid uuid NOT NULL,
    referreduserid uuid NOT NULL,
    referredusertype character varying(10) NOT NULL,
    code character varying(12) NOT NULL,
    status character varying(10) DEFAULT 'pending'::character varying NOT NULL,
    tripscompleted integer DEFAULT 0 NOT NULL,
    signuppoints integer DEFAULT 0 NOT NULL,
    qualifypoints integer DEFAULT 0 NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    qualifiedat timestamp without time zone,
    CONSTRAINT ck_referrals_noself CHECK ((referreruserid <> referreduserid)),
    CONSTRAINT ck_referrals_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('qualified'::character varying)::text]))),
    CONSTRAINT ck_referrals_type CHECK (((referredusertype)::text = ANY (ARRAY[('passenger'::character varying)::text, ('driver'::character varying)::text])))
);


ALTER TABLE rewards.referrals OWNER TO postgres;

--
-- Name: settings; Type: TABLE; Schema: rewards; Owner: postgres
--

CREATE TABLE rewards.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settingkey character varying(60) NOT NULL,
    value character varying(500) NOT NULL,
    description character varying(200),
    updatedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updatedby uuid
);


ALTER TABLE rewards.settings OWNER TO postgres;

--
-- Name: favoriteaddresses; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.favoriteaddresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    passengerid uuid NOT NULL,
    label character varying(60) NOT NULL,
    icon character varying(40) DEFAULT 'location_on'::character varying NOT NULL,
    address character varying(255) NOT NULL,
    lat numeric(9,6) NOT NULL,
    lng numeric(9,6) NOT NULL,
    sortorder integer DEFAULT 0 NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    description text
);


ALTER TABLE trips.favoriteaddresses OWNER TO postgres;

--
-- Name: favoritedrivers; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.favoritedrivers (
    passengerid uuid NOT NULL,
    driveruserid uuid NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE trips.favoritedrivers OWNER TO postgres;

--
-- Name: incidents; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid uuid NOT NULL,
    reportedbyuserid uuid NOT NULL,
    reportedbyrole character varying(20) NOT NULL,
    description character varying(1000) NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE trips.incidents OWNER TO postgres;

--
-- Name: outboxevents; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.outboxevents (
    id bigint NOT NULL,
    eventtype character varying(60) NOT NULL,
    payloadjson text NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    lasterror text,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    sentat timestamp without time zone,
    CONSTRAINT ck_outboxevents_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('sent'::character varying)::text, ('failed'::character varying)::text])))
);


ALTER TABLE trips.outboxevents OWNER TO postgres;

--
-- Name: outboxevents_id_seq; Type: SEQUENCE; Schema: trips; Owner: postgres
--

ALTER TABLE trips.outboxevents ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME trips.outboxevents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: passengeracceptancecancellations; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.passengeracceptancecancellations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid uuid NOT NULL,
    proposalid uuid NOT NULL,
    passengerid uuid NOT NULL,
    canceledat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE trips.passengeracceptancecancellations OWNER TO postgres;

--
-- Name: sosalerts; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.sosalerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid uuid NOT NULL,
    userid uuid NOT NULL,
    userrole character varying(20) NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolvedby uuid,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    resolvedat timestamp without time zone,
    resolutionreason character varying(500)
);


ALTER TABLE trips.sosalerts OWNER TO postgres;

--
-- Name: tripphotos; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.tripphotos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tripid uuid NOT NULL,
    url text NOT NULL,
    kind smallint NOT NULL,
    uploadedby uuid NOT NULL,
    createdat timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_tripphotos_kind CHECK (((kind >= 0) AND (kind <= 3)))
);


ALTER TABLE trips.tripphotos OWNER TO postgres;

--
-- Name: tripproposals; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.tripproposals (
    id uuid NOT NULL,
    tripid uuid NOT NULL,
    driverid uuid NOT NULL,
    fare numeric(10,2) NOT NULL,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    proposedbyrole character varying(20) DEFAULT 'driver'::character varying NOT NULL,
    rejectedby character varying(20),
    CONSTRAINT ck_tripproposals_fare_positive CHECK ((fare > (0)::numeric)),
    CONSTRAINT ck_tripproposals_proposedbyrole CHECK ((((proposedbyrole)::text = 'passenger'::text) OR ((proposedbyrole)::text = 'driver'::text))),
    CONSTRAINT ck_tripproposals_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'superseded'::character varying, 'accepted_by_passenger'::character varying, 'driver_accepted'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE trips.tripproposals OWNER TO postgres;

--
-- Name: tripratings; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.tripratings (
    id uuid NOT NULL,
    tripid uuid NOT NULL,
    passengerid uuid NOT NULL,
    driverid uuid NOT NULL,
    stars smallint NOT NULL,
    comment character varying(500),
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT ck_tripratings_stars CHECK (((stars >= 1) AND (stars <= 5)))
);


ALTER TABLE trips.tripratings OWNER TO postgres;

--
-- Name: triproutepoints; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.triproutepoints (
    id bigint NOT NULL,
    tripid uuid NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    speedkmh double precision,
    recordedat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE trips.triproutepoints OWNER TO postgres;

--
-- Name: triproutepoints_id_seq; Type: SEQUENCE; Schema: trips; Owner: postgres
--

ALTER TABLE trips.triproutepoints ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME trips.triproutepoints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: trips; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    passengerid uuid NOT NULL,
    driverid uuid,
    vehicleid uuid,
    originaddress character varying(300) NOT NULL,
    originlat double precision NOT NULL,
    originlng double precision NOT NULL,
    destaddress character varying(300) NOT NULL,
    destlat double precision NOT NULL,
    destlng double precision NOT NULL,
    distancekm double precision,
    estimatedfare numeric(10,2) NOT NULL,
    proposedfare numeric(10,2),
    proposeddriverid uuid,
    finalfare numeric(10,2),
    paymentmethod character varying(10) NOT NULL,
    status smallint DEFAULT 1 NOT NULL,
    createdat timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    acceptedat timestamp without time zone,
    driverarrivedat timestamp without time zone,
    startedat timestamp without time zone,
    completedat timestamp without time zone,
    cancelledby character varying(20),
    cancelreason character varying(200),
    passengerlastlat double precision,
    passengerlastlng double precision,
    passengerlocationat timestamp without time zone,
    servicetype smallint DEFAULT 0 NOT NULL,
    packagedescription text,
    packageweightkg numeric(10,2),
    packageisfragile boolean DEFAULT false NOT NULL,
    packagedetails text,
    pickupverified boolean DEFAULT false NOT NULL,
    pickupobservation text,
    couponcode character varying(20),
    discountamount numeric(10,2),
    farebeforediscount numeric(10,2),
    cancelledat timestamp without time zone,
    recipientname character varying(120),
    recipientphone character varying(20),
    deliveryreceivedby character varying(120),
    deliveryconfirmedat timestamp without time zone,
    CONSTRAINT ck_trips_pay CHECK ((((paymentmethod)::text = 'plin'::text) OR ((paymentmethod)::text = 'yape'::text) OR ((paymentmethod)::text = 'cash'::text))),
    CONSTRAINT ck_trips_status CHECK (((status >= 1) AND (status <= 7)))
);


ALTER TABLE trips.trips OWNER TO postgres;

--
-- Name: tripwaypoints; Type: TABLE; Schema: trips; Owner: postgres
--

CREATE TABLE trips.tripwaypoints (
    id uuid NOT NULL,
    tripid uuid NOT NULL,
    address character varying(300) NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    sortorder integer DEFAULT 0 NOT NULL
);


ALTER TABLE trips.tripwaypoints OWNER TO postgres;

--
-- Data for Name: adminroles; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.adminroles (id, name, description, issystem, createdat) FROM stdin;
4a0de1d8-2182-4e49-9a0f-f557888d8da9	super_admin	Acceso completo a todas las vistas y acciones. No se puede modificar.	t	2026-05-29 20:04:01.174277
\.


--
-- Data for Name: passengerdocuments; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.passengerdocuments (id, userid, doctype, fileurl, storagefileid, originalfilename, mimetype, sizebytes, status, rejectionreason, reviewedat, reviewedby, createdat) FROM stdin;
adec7c40-4d82-426f-9ab5-833d91237de5	f1e64012-7713-45b4-bff2-33b45d3abfd4	dni_front	http://localhost:5001/uploads/passengers/f1e64012-7713-45b4-bff2-33b45d3abfd4/617fed61d71b4d5589689510888862f9_scaled_1000222902.jpg	passengers/f1e64012-7713-45b4-bff2-33b45d3abfd4/617fed61d71b4d5589689510888862f9_scaled_1000222902.jpg	scaled_1000222902.jpg	image/jpeg	324776	pending	\N	\N	\N	2026-05-17 05:28:07.163333
a738fee9-c26d-4395-bd46-09a2608bff70	f1e64012-7713-45b4-bff2-33b45d3abfd4	dni_back	http://localhost:5001/uploads/passengers/f1e64012-7713-45b4-bff2-33b45d3abfd4/14bdcc1abb3b42c8a5408e6c88115221_auto.png	passengers/f1e64012-7713-45b4-bff2-33b45d3abfd4/14bdcc1abb3b42c8a5408e6c88115221_auto.png	auto.png	image/png	5611660	approved	\N	2026-05-17 05:28:44.273333	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 05:28:12.833333
8232163a-a858-4c06-9e03-2e5891083f81	a0160a2d-94d1-454e-bfa8-45945535a063	dni_front	http://localhost:5001/uploads/passengers/a0160a2d-94d1-454e-bfa8-45945535a063/0a802bc9e33c4b53a6a77413d5dfbff1_clipart162621.png	passengers/a0160a2d-94d1-454e-bfa8-45945535a063/0a802bc9e33c4b53a6a77413d5dfbff1_clipart162621.png	clipart162621.png	image/png	73603	approved	\N	2026-05-17 03:17:46.91	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:16:14.536667
f064b4b8-22db-4292-96a6-3051ed74b585	a0160a2d-94d1-454e-bfa8-45945535a063	dni_back	http://localhost:5001/uploads/passengers/a0160a2d-94d1-454e-bfa8-45945535a063/edbb4dced1fa4b169f92c52ec334c284_pngwing.com(13).png	passengers/a0160a2d-94d1-454e-bfa8-45945535a063/edbb4dced1fa4b169f92c52ec334c284_pngwing.com(13).png	pngwing.com (13).png	image/png	487887	approved	\N	2026-05-17 03:17:45.2	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:16:19.053333
0db8e62c-2bc4-4bbd-b739-cb99b0ff7cc9	05b9d66f-8441-45b4-bdc1-d418a807dddd	dni_back	/uploads/passengers/05b9d66f-8441-45b4-bdc1-d418a807dddd/e7bba2c3efb14681a7b86de75932250d_scaled_f00e3eba-812c-413c-9cd8-e524a040e17d3394573833217019818.jpg	passengers/05b9d66f-8441-45b4-bdc1-d418a807dddd/e7bba2c3efb14681a7b86de75932250d_scaled_f00e3eba-812c-413c-9cd8-e524a040e17d3394573833217019818.jpg	scaled_f00e3eba-812c-413c-9cd8-e524a040e17d3394573833217019818.jpg	image/jpeg	358196	approved	\N	2026-07-11 17:50:49.010199	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:33:34.589129
1da065da-60a6-4f42-af0d-b8234a6b7cab	05b9d66f-8441-45b4-bdc1-d418a807dddd	dni_front	/uploads/passengers/05b9d66f-8441-45b4-bdc1-d418a807dddd/b36183a0a8fa4d81af84d6c6d6473a75_scaled_25e66a51-ef88-4934-87b5-22e9c57a966f4788246973404428205.jpg	passengers/05b9d66f-8441-45b4-bdc1-d418a807dddd/b36183a0a8fa4d81af84d6c6d6473a75_scaled_25e66a51-ef88-4934-87b5-22e9c57a966f4788246973404428205.jpg	scaled_25e66a51-ef88-4934-87b5-22e9c57a966f4788246973404428205.jpg	image/jpeg	338899	approved	\N	2026-07-11 17:50:50.38381	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:33:27.989655
\.


--
-- Data for Name: passwordresettokens; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.passwordresettokens (id, userid, tokenhash, expiresat, usedat, createdat) FROM stdin;
\.


--
-- Data for Name: refreshtokens; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.refreshtokens (id, userid, token, expiresat, isrevoked, createdat) FROM stdin;
\.


--
-- Data for Name: rolepermissions; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.rolepermissions (roleid, permission) FROM stdin;
\.


--
-- Data for Name: userfcmtokens; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.userfcmtokens (id, userid, token, platform, createdat, updatedat) FROM stdin;
b2a16162-d03d-403a-96e4-2a87131c1924	3b33c255-70d2-401e-a76e-da1540155ec4	f6f-QE5fTuyjMVStm-w59V:APA91bEd18eLZpyDoi0Zrt452PJAGz0TvtFRpeagF_6fO0qXCum4BWgaXbXBUr-FTidYLJRkp2fUypsbuSibcVyS-GP-EOT4g3s4BtDbDOLVgnDP4VYUj7w	android	2026-07-11 16:42:05.607328	2026-10-01 10:21:12.921448
0b604d0d-1942-42e2-8322-3772b448a564	31e89885-cc6e-4097-af16-c8558a760474	fdskY4eKSwaGJqY0L-mwGh:APA91bH51y9FIrwAqZtuWW1oFN0EjhqzT2nuiX-tSrJJS5JDnfedRrDdOXmZBiuVpgmLXOB-LTxm6uG_ItH3z4rpL3_7c21qyeiHtWM4KLgJxZrR8WLon8E	android	2026-07-11 17:17:02.152473	2026-07-13 02:28:50.584197
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: postgres
--

COPY auth.users (id, email, passwordhash, role, fullname, phone, isactive, createdat, isverified, profilephotourl, adminroleid, termsaccepted, termsacceptedat, signatureimage) FROM stdin;
10b700cb-5890-44a0-8cb4-561af63e2cc0	admin@bugie.pe	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	admin	Administrador Bugie	000000000	t	2026-03-24 08:31:01.07	f	\N	4a0de1d8-2182-4e49-9a0f-f557888d8da9	f	\N	\N
3b33c255-70d2-401e-a76e-da1540155ec4	ghaluizu66@hotmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	driver	olvia tre	987654545	t	2026-05-23 06:06:32.493333	t	\N	\N	f	\N	\N
4497bc2b-6c1c-4e34-880c-173d504799ab	ghaluix3@gmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	passenger	teviru nla	454545	f	2026-05-26 05:47:53.373333	f	\N	\N	f	\N	\N
7ec78cab-0e66-4104-abc1-2506cab83499	ghaluizu1@hotmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	driver	jacinto llanos	965856598	t	2026-05-17 03:22:04.976667	f	\N	\N	f	\N	\N
f1e64012-7713-45b4-bff2-33b45d3abfd4	ghaluix2@gmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	passenger	alondra karl	98765789	t	2026-05-17 05:27:15.66	t	\N	\N	f	\N	\N
a0160a2d-94d1-454e-bfa8-45945535a063	ghaluix1@gmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	passenger	alondra parker	978655678	t	2026-05-17 03:14:07.31	t	/uploads/profiles/a0160a2d-94d1-454e-bfa8-45945535a063/14b75259236c48c38541b4cf5d8143f2_scaled_1000223288.jpg	\N	f	\N	\N
73e34565-0de5-43c3-b330-d8dceaee797a	ghaluix12@gmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	passenger	wert jeje	5454484	f	2026-05-26 06:09:42.83	f	\N	\N	f	\N	\N
0c456dc2-4925-42d7-8ebe-1289b5b65635	ghaluix33@gmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	passenger	tin tin	965841832	f	2026-07-09 22:01:06.292823	f	\N	\N	f	\N	\N
05b9d66f-8441-45b4-bdc1-d418a807dddd	ghaluizu@hotmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	passenger	Ariana Quiroz	965841832	t	2026-07-11 16:16:27.114209	t	/uploads/profiles/05b9d66f-8441-45b4-bdc1-d418a807dddd/716de18a06be4ee7b1c511dd35022b5c_scaled_aeeb5a94-3083-44d5-8d02-457990f3ff0d3197903080763583510.jpg	\N	t	2026-07-11 16:16:27.11421	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAACgCAYAAAB9o7WcAAAABHNCSVQICAgIfAhkiAAADNBJREFUeJzt3euRozgUhmHt1ibQnY4JwTgdUjDp4BAM6TgF75+RR62WQICEjtD7VE1Ndc/FtLE/H93/eb/fb4WijOOobrfb5+vL5aIej0fWawJK9G/uC8B60zT9+LppmmzXApSMACzQOI65LwE4BQKwQHYFeLlcsl0LUDICsDB93//6Hk1gYBsCEEC1CMDC2P1/NH+B7QjAwjACDMRDABbE1f8HYDsCsHA0gYHt/mElSDm+v79/fe/1emW5FuAMqAALweRnID4CsBD24Iei+QvsRgAWjBFgYB8CsBCMAAPxEYAFowkM7EMAFsBX/dEEBvYhAAFUiwAsgGsKDM1fYD8CsACuKTA0f4H9CEDhmAANpEMACueq/pRSquu6w68FOBsCUDgqQCAdAlA4lsAB6RCAgvmqPwZAgDgIQMF8/X8A4iAAC0QTGIiDDVEFc22AqtgEFYiGChBAtQhAoXwbIND8BeIhAAvDCDAQDwEolDkFhqoPSIMAFMo3BYYwBOIhAAWyqz8zDGkCA/EQgAIReMAxCECBzAqQvkAgnf9yXwB+MyvAruvU7XbLej34axxHNU3T54PJvFf6A0pX7WxZJh8BKIy9AcLZmsP65zPnOc7teSghRMZxVH3fL67N1n+uf+/7Xl0uF9U0zed3yEIACmNXfyWbq5ZC9H2v+r7PtvQvNPjmTNP0+ff6fpZ+X8+EAEQ0ZnUXcyebcRwPr57GcXR2PZgVnTKqcrNy16FvPwe66u37Xkx1Wzs2QxDG3ADh9Xqptm0/b6RhGMQ1o3SVpAIrPB0c5pvf9TOZP3eOsLA3orhcLqrrutXPvw5C39JGgjAvKkBBXBugSuwDDG0a2mG35vqbpsm2H6J9H/Z88DRNo5qmUV3XfZr0Jv01IZgHASiI5P6/NaG3JfAkse9DrJ9DV3t2EBKC+TAPEF7jOKq2bdX397e63W7e80m6rlPDMKjX66Uej8en6tnKDoicwZDiUKqu69Tr9frxc/V9r9q2jf5YmEcfoCBmv9MwDEop9emIv1wu6vF4JL+GkD69rf1hocznIUcfmT0AknIU2tUsltjXe1ZUgELlGPVs2/ZT6dnhZ1Z6uspLwQ6DHNWfOcqr/gRyquNJXQHvGzBBfASgEK4mX+oBEF3tLTVxdeilrPqUVX2qzE1f+7Fvt1uyYNIfLNo0TTSHD0IAVsis9lxvah16Zp/eEddkz7vLGYB65Nakm6spgrBpml8hSCV4gDdE+Pr6+vx6Pp/v9/v9vt/vn+/d7/fdj/F8Pt/X6/XHY+lf1+s1ymNsvS77evRzIIHvOUvxfJn3XNrzcEZUgALFrLiWRnLtJu7RXJWftEEA33Ojuw9iVmp2nyBVYFoEoADmi9zsfN+zFZY9qGEzgy9X2JQQfppr6oqmg7Bt2yhNZPNem2upER8BKMzeN/9c8OXo2/Pp+76Y8DPNBaHut9OBqKvDvu9XhZg9Ck0VmA7zAAWw5//pEFi7DthXfaSet7fWmea+6XBbs2zP3BrL3lRBs6vjUp8f6QjAzOYm3dobI/iUEnzKCnUl9Bq3Mrf/2rqO2QxH8/8hANMgADMzw8vuAF8KwJKCz9Xfd9TqllzMANsTippdOUq6v6UiADOb2/bJF4AlBZ/yXG/N20ClDEbX1/AjADObq/LsP/PtyCI1+JSjyatoznnZO2fvDUeCcRkBmNFc89dsMuqO8pKCzxXWZ2/ypmBvDKHtCceaq28b+wEWoKTgUzR5kzGfP18YhgSjeVhT7agAM/I1f+c2H5XcfPRdt+Rrli50JoDL3Oso10FT0jAROhPXxNi5Scx6Aq7UINETm+0mr+RrPrO5/mLC7y+awJnYQeEaLNAkNx+p+tLZshSyxIGynAjATEIOBpfO1dfHGy2eNftBltptkhtNYGHm1ppKoZvqroGO3GuMa1Nyt4kEVIAH8x24LbmZq9G8OtZcE3iu4uN+hCMAD1J6ePhWn9C8SsOeztI0zeLRpKW8liQhAA8wt0ec9BfsXHAzqTmdNYNkBN92BGBCIYeJS37RMsiRz9IgGfchDgIwgbmqSRkv6LW7PB/Fd/0l9FOWzj4Zz0bwxUUARrbUV2YGi8QXMVXf8UJaCtyDNAjASEL7yvac85FSyaPTJQoJPcUgU3IEYARrqqbUh52vxSDHcfSHX0jwqQIGyM6AANxhbV+Z7/S3XGjuHiNk+opm/p2Ylbc5rYaK/i8CcKO94ZEzYBjkSG9tv57dBRHjPpgDKuZ1jONIdf8HAbiBa05WSHhI6P+j6ktnz2CGXfltDcDSp14djQBcwXewT2h45Oz/K6HqMz8gzA0+TUt9Z0cfHBTSr6dfI8pz3+0PpbUfjqEDKnzQ/UYABtpa9Wk5+/8kVX3muReuwNtrmqZDQj60X2/pObbn/YXck9DBlNBrqBkBuGBv1edy1Isx91595htVZdz2Sx9eHqPfK+Z6XPu1ZVaKvsdVC8+jrnrZ8j4MATgj5tkWrh2gU/JVfak6v2OFna5azGasKaQ6cp2PMU2T6vt+871LsQmB67VlPqYKnDKz1MSGHwHoEfs4x1TTG2xHVH17ws4MNF2pqIhv3KZpPv9X13U/7uM4jque+5S7r9ivr2EYPt9XgX2dNG33IwAtviZvCdMGUlR9dp/dlrDLWZ2sHXjSP6NvPW6M4HGFqmsVjv24iv686AhAQ6rjHLcMgJh/L6Ry2TtIYz6WOUARGngSws4218S0HbHX3lK4+h5TCXk+z4gA/CN2k9cnxQvZvvbQN+uZws7FHl11Sb2zcugUFcUARhbVB+ARTd6UE6DtN1fXdZ/HsINt67STEt+YS9VfquBbO3ihaNZmVfXB6KmavLYth1ubwTwXyOb/HUMp1d0S83kx7+nc7txbgy90iop5PSV9mJxZtRXgUU3e1NNfuq4L7lOynSXsbK6BoKVzl9cG0trQMx9LysobVBiArqZPylHe1NNf9BtKvxn7vvfOnbOnoJyRa0dl1wjr2mpvbdNWb35rIvzkqSoAj2ry5qB/hjP8LFv5NnU1rV2pEVrlmf+v78zkmu+NVNUEoCv8jlgSJmEHmBrM9e2pwODbO4AxjqOzT5ZdneWqYhBk6zSRGLYMgMT4tzXZM7CxpcpTVhcCu2qX69QVoKtJRFPkPJbm2OnBDb1DzNppQCHTVCTttIP1ThuAEsKP5m86If19W0bHQ1df6B1mJO+viGWnDMBc/X02aQcgnYVvMEttCL21k5F9zW2qvjKdLgBdu+vywjyHkJ1u9JQgs/reOw1oadVI0zRUfaV6n8j9fn9/fX19fl2v16zXc71eP9dyv993/fvn85nkGkth39sj7u/z+fxxD+zHrv2enMFpKkC78pPWF0Mf4DY5zjJJvUEC5DhNAJoBIyX86APc58gR1iO2w4I8pwlA3Q/DIvPyHVn1EXx1O00AqsqXgZ3FEVUfoQftVAEoSYw5gE3T/DjU58xvSN+8vphVH8EHGwGIrOaWkcUII0IPcwhAwdaeC1KaVM3dkPW9BB8UAYgcUg1yUO1hLQIwka0Hg59ZiuZuyKFDBB98CMBEmPj8k28N7ZY12oQeYiEABTPfvKVWlL7gW9vcpV8PKRCASCJGczdkh2aOlsQeBKBwekNP9ScQpL/JYwUfTVwcgQBEFHOhFdLPR+ghBwIQu8wF11I/H6GH3AjARGINYEhdDrc1+NaEnmIXHSRGACYUo/9O2mqQtcEXetQkoYccCEAEWdok1Dz+UR8W5Do0yP53hB5yIgAPIqn5ukbombuh5+sSepCkioPRczG3eNpzSPbRB6SHnLfbdV1Qf54i9CAYAZhYjPA6KgBDTj9TRhN3DqO3KAEBmFjbtp+wkBqAoZXcHFZkoET0ASbWdZ2apmnX5ggpVoPECj2atigZAZhY0zSiwmFP8FHl4WwIwAroPjvfaO4cqjycGQFYgK2rQbZUe1R5qAkBeEJrg48RW9Tq39wXgGX2cjiXcRxV27bq+/tb3W63oGkqwzCo1+ulHo8H4YcqUQEWbk21R6UH/MQ8wEKYcwGHYVAqYIMBRegBswjAQpgBuITQA8LQBBbO3GRgDqEHrEcACrR2OylCD9iGABQkdECj67ofmxMA2IYAzGzr0jTCD9iPeYCZ6Hl7c3P2zLl6ubfCB86IADxQyGRl3wTlkMnQANahCXyAuW3lNQY0gOMxD/AAvjl8a0Pv6K3xgbOjAjxA13WfClCP3jKKC+RHBVgQc3v9YRgIUGAnBkEAVIsALIieAM1gCRAHTWAA1aICBFAtAhBAtQhAANUiAAFUiwAEUC0CEEC1CEAA1SIAAVSLAARQLQIQQLUIQADVIgABVIsABFAtAhBAtQhAANUiAAFUiwAEUC0CEEC1CEAA1SIAAVSLAARQrf8B/60857lgGDAAAAAASUVORK5CYII=
31e89885-cc6e-4097-af16-c8558a760474	ghaluix_w@gmail.com	$2a$12$/qmyx9ejJuDLaKIjRB1EbeVmCW14JM0ADcInpoxb5vdblLudvQD4q	driver	Laura Otino	965841832	f	2026-07-11 16:10:14.572947	f	\N	\N	t	2026-07-11 16:10:14.572975	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAACgCAYAAAB9o7WcAAAABHNCSVQICAgIfAhkiAAAC/xJREFUeJzt3dt5o8gWhuHqPZOACaATQSEYBTCJcNuXJh0IQSgdUtC+mCk95eXiUECdqO+9mbbb3UJM82vV+dfr9XopACjQ/2JfAADEQgACKBYBCKBYBCCAYhGAAIpFAAIoFgEIoFgEIIBiEYAAikUAAigWAQigWAQggGIRgACK9XfsC7iKcRyVUko9n081jqO63W5KKaXqun7/GkBafrEd1jHjOKqu69Tz+Vz8ubZtVdu2wa4LwDoCcKetwScRhEA6aALvMI6jut/vP75va+52XWf9mhAE4qMCdGQLv7Wqruu6H0FIJQjExyiwI9nk7ft+NcjatlXTNH37ORmIAMIjAB3ISq7ve6cR3rZtVV3X76/1yDGAOAjAndq23TW9hSoQSAd9gBvJ6m+apt1/V9M076a0axUJ4DxUgDucOXhBFQjEQwBuIKu/owHI6C+QBgLQ0RnhZTZ5XSdSAzgPAbiBOVprjuIewWgwEB8BuIFZpfkYsKAKBOIgACMxm9JUgEAcBCCAYhGAAIpFAK7wMQCiGAkGkkAARsRIMBAXAeiASg24FgJwxe12o1IDLooAjIh+QCAuAnADtrACrokAjIimNRAXAbiBbKoSVsA1EIAbnTkHMBfjOKqmaVTTNNGa/vr4Uboe4AMBuJFZBV79YdTBd7/f1fP5VM/nU3Vdp5qmCX4d9/v9HYBVVV3+3iMstsTfSB6HedZW9lVVvX99ZJv9s6xVW3Vdq2EYglyLeW9MHCmKs1ABbiTnA16xErE1deu6/hY2sfpA5b2/4v1HeASgAxkEVzGOo6qq6tt7quta9X2vhmH4cZxniPCRa7D1dZjXQAjiKALQgY9VIbGnwnRd961pr/4L+mEYvjXxQ4e/bRNa2fTtuo4ReRxCADq60qRoWxXV9721fy2VJYExqlFcFwHo6CpzAmX41XWtpmnaPLATM3hkNRp6dBrXQQDucGYVGGM9sBzs2DqyG7IZvLQP4+12U33ff7uWXD+IEBcBuIP5QOb28DVN8y28dH/fFiGbwWsHUZUwKg//CMAdcnz49ORmGX45z6dLYXoO8kYA7nTWwxeiotKTuHMKvy335Xa7XWpQCuERgDvlUgXKFSxqYaQ3VUv9jVSBOIIAPCD1h28u/Hwc7n42l3OTc/ggQpoIwANSrgJzDj9XqX8QIV0E4EGpPny+wm9tdPYsLtOD5AfRlZYpwi8C8KAzq8CzHlw5MTjXys9lgMilyQxoBOAJzHl0rlXg2cHUdd23ID0z/HwdEn+Gq6zQQVgE4ElSmI4hl7e1bXtqwIZq/tpeY8s9TS2UkT4C8CSyLzB0CNrCL6epLjaugZbChxDyQgCeKNYDGCr85Gv4RrMWvhGAJ5JbNYXYpUQfGqTJHZzPIl8jFJfXIjDhigA82Z5pMUeWw8lKM8R5HSFHlF2ravoB4YIAPFnIydG2EV+fr6XFChnm9+FsBKAHclqMjxD0PeIrX8sUsgJ03YIrxv6KyBcB6InPsytijvjGHll2+TChDxBrCEBPfJ5dETr8Qo/+Si6vSR8gXBCAHvlYJyyD9OrhpxxHd2n2wgUB6JHcsFNuUODK1vT1LZVm5J7KLsf1zwiLAPRsy9zArR33oZu+4zj+2EU6FlZ5wAcCMIAzmsJmcPqa7CylEn7S0odEKhUr8kAABnC0KSzn+4UKo5QqrT0n0jEggjUEYCBHlsmFmu8395oqkQpwSzM49I41yBsBGNCWprD8Xoh1vmtSCD/J1gxOqWJFHgjAgOaawnNNtRijvsqywUIqAbjWDDa/TuWakTYCMDCXpnCMpq9KePBDLTSDUxqxRj4IwAi2bJ4asw8ul6akGXiEH/YgACOQTWHZnxWr6asSHfwwzTWDcwltpOXX6/V6xb6IUjVN8yP86rr+Uc2EDKGqqqK99lbmmcd1Xavb7fYOwLqug+yJiGsgACOyHV4uTdMU7Hpk5RnytV0s3bdcjwBFHDSBI5JNYSl09ZXiyK+NbAZrIQeKcA1UgAmYawqHbMrlUv1ptiow9WtGeqgAE2ALutCVTC7VnyY/MHK4ZqSHAIR19YmsCFNiuzY2QcAeBGAC5uYBxnyodchUVaWapkkmEOUqFY2NUN2N46iaplFVVSXx/zYG+gATYE49McXuB5yjp56owE1P2e+nB0J0+DECvI3+EJEfGiX2oRKAka2FToy5eHpZmVxeNkcHohmMPq7JNuhhDiAxB3DeXOhpqc759I0AjMxW/cnJ0LErm72BeNYDZfuQ0PdEBmOJVcySteDTOwyVWjkTgBHNVX993//4R5vSg62veUsg6hDcG4ZL4aeZVWDsD4sUrH1glR56JgIworm+P/0Q59K82xKIe4JQht/cgyuXxqV6n3yj2tvhhSi+vr5eHx8fr4+Pj9fX19fr8/Pz/fXj8Xi9Xq/X4/F4f0//XA7k+3F9D4/H48ef//z8XPwz5s/q+1cCfa/m7vfn5+fr6+urqHviggCMRIaCLQBfIihzfLjl9a+9Bxn6W0PTvH9rYZk72weELfhy+7cSAwEYiXy45wJQ/l6OIfja+B5sYbm16jWD82oB+Hg8Fqtqgm8/+gAjGsfx3R+z1pGfS3/gkqX3YFsP7TqgYfap5j4YYk74Xhpo0nMh6dvbh5UgEbn8g92yi3TqbO9hHEdVVdW3h7yuazVNk/MDbe4Qk+P9MVdm3O939Xw+F0dx+75XwzCoYRgIv71il6D4lxwUWfuZnAZFTLZm7lnvSfYf5mBLfx5NW3+oADMiZ+vHXi+8x9wJeHVdq77vD02e3nN4eiy62tOVnlTX9fueTNNElefJ37EvAG7atv02367ruqweDFvT1NcyrBTvzdJcPfPc59Su+6qoADMk+9KWjtZMhd5ZxjbQcWb4LR02FZN+/7aKT1d6usoj/MIhADN0u91U3/fvr1MeFNFNvbnrO/thT60ZrINvrvI1gw/hEYCZkpsNpLJfn6nrutk+LrXQH3jU3OHpIc0Fn9mvx9SV+AjAROypWlIdFNFTW9bCx9fDb/69elOAUNaCj2ovLQRg5tq2/Raea8ds+mSObJr0iKb8ns/950LPCZxr6hN8aSMAL0AGSehBkaUpHfra5ERn3ytZQg2GzL13gi8PBOAF2AZFQoTgUvDpqk9O+fBd+WkhBkPm+jjbtiX4MkEAXoQcFPE9Mjz38Ovgsy3jCl0R+RoMmWvutm37HtxAHgjAzMydiqZmBkV8PPhznfy25q4ygiF0ReRjMMQW/GesYkEksdfi4V9bt3OS62Zta2fPXjO8tF5Vb7hp+/0U1q+a9+LoNllHtutCmgjAROwJwKUHUQbSngd1Lfj0PnW2348dfKaj1zW3Q3VK7xH7EICJ2BqAS6HzIbZA37OR6truJOaDb/u5FCsieb9c2HaovtqGqyVjQ9REuB7sozdEcO3jk/MGzb6xtY03zZULtkPKU17ZsGdDWdsmraWen3tVBGAijpxspkPw7FHftd2G9cqTlINPk4G9FGS2waPUAx77EICJOOtox6NheOUt1mWwmSGoq2DbVlVUfddFACbCx9m25r6BtjN767r+MWH4aqEn2Zq1c6j6ro8ATESIw71t/XY5Hq501Jb5kVR9ZWAidCJCbN4ZerVIqnS42TZoMLeqwvWxJX6CfDa59IMt+wpLe+Cp8KCoAMuU6j6CQGgEYKFs+wgSgigNAZgIM3x8bRUvDcOQ/WHiwBEEYCJinWCW4wlzwFkIwATIpmfIeWc5nTAHnI0ATIBZ/cUYmbSdMEd/IEpAACYghbCRgyJUgSgBK0ESUFXV+9fTNEW7DlaKoDRUgJHFGP2dQ38gSvPXnz9//sS+iJL9/v1bqf/C5p9//om+8N68HvO/sa8L8IEmMKyWto4CroIKEFa64qMSxJURgJhFCOLqaAJjldxEtO97QhCXwCgwVrFmGFdFAGKTYRjegyBUf7gKmsAAikUFCKBYBCCAYhGAAIpFAAIoFgEIoFgEIIBiEYAAikUAAigWAQigWAQggGIRgACKRQACKBYBCKBYBCCAYhGAAIpFAAIoFgEIoFgEIIBiEYAAikUAAigWAQigWAQggGIRgACKRQACKBYBCKBYBCCAYhGAAIr1f4bf4gXdgM+6AAAAAElFTkSuQmCC
\.


--
-- Data for Name: documentnotifications; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.documentnotifications (id, documentid, daysbefore, notifiedat) FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.documents (id, driverid, doctype, fileurl, status, expiresat, reviewedat, reviewedby, createdat, drivefileid, originalfilename, mimetype, sizebytes, rejectionreason) FROM stdin;
18b39e7a-8148-4afd-bf77-78b4335a2e48	a6230716-505a-4b5a-88ee-1ba0002663b8	dni_back	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/a7398644c810404d802035d59facbecd_auto.png	pending	\N	\N	\N	2026-05-23 06:07:45.133333	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/a7398644c810404d802035d59facbecd_auto.png	auto.png	image/png	5611660	\N
152ef229-8d86-411f-8a9c-9e3bad598a55	a6230716-505a-4b5a-88ee-1ba0002663b8	certificado_unico_laboral	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/e120741331914147bfd08d0bc1973841_BUGIECORRECCIONES.pdf	pending	\N	\N	\N	2026-05-23 06:10:15.63	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/e120741331914147bfd08d0bc1973841_BUGIECORRECCIONES.pdf	BUGIE CORRECCIONES.pdf	application/pdf	255112	\N
8b65adf7-b7a1-4062-bcc5-b4e177b419a7	a6230716-505a-4b5a-88ee-1ba0002663b8	tarjeta_propiedad	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/d8ca429b6bc147128b03a57bf7a4975a_logosomoscasino.png	pending	\N	\N	\N	2026-05-23 06:08:54.696667	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/d8ca429b6bc147128b03a57bf7a4975a_logosomoscasino.png	logo somoscasino.png	image/png	104149	\N
d637a66f-cb73-45c5-9ea5-d624dfec604c	a6230716-505a-4b5a-88ee-1ba0002663b8	dni_front	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/f6d648ca76004d4684e0ea7ebf6fe469_moto.png	pending	\N	\N	\N	2026-05-23 06:07:41.343333	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/f6d648ca76004d4684e0ea7ebf6fe469_moto.png	moto.png	image/png	1926314	\N
c5600425-cccb-48ae-a465-647744822f43	a6230716-505a-4b5a-88ee-1ba0002663b8	soat	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/9bb238270da54572bd5e665f3ff8cce6_Gemini_Generated_Image_41hxj041hxj041hx.png	pending	2026-06-07 05:00:00	\N	\N	2026-05-23 06:08:39.743333	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/9bb238270da54572bd5e665f3ff8cce6_Gemini_Generated_Image_41hxj041hxj041hx.png	Gemini_Generated_Image_41hxj041hxj041hx.png	image/png	1343245	\N
12606c76-fad5-4622-a725-ca685ec37713	a6230716-505a-4b5a-88ee-1ba0002663b8	license	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/1dd790ac3ffc418dabcbeafcc46173e8_WhatsAppImage2026-04-28at9.20.52PM.jpeg	pending	2026-06-06 05:00:00	\N	\N	2026-05-23 06:08:31.666667	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/1dd790ac3ffc418dabcbeafcc46173e8_WhatsAppImage2026-04-28at9.20.52PM.jpeg	WhatsApp Image 2026-04-28 at 9.20.52 PM.jpeg	image/jpeg	138610	\N
4d04446d-e0bb-48d9-aaef-e33a242c8b91	a6230716-505a-4b5a-88ee-1ba0002663b8	revision_tecnica	http://localhost:5003/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/b5c84e76499140ce925fe45b9b6c5dd7_CORRECCIONESBUGIEAVANCEFUNCIONALIDADES.pdf	pending	2026-06-07 05:00:00	\N	\N	2026-05-23 06:09:53.063333	drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/b5c84e76499140ce925fe45b9b6c5dd7_CORRECCIONESBUGIEAVANCEFUNCIONALIDADES.pdf	CORRECCIONES BUGIE AVANCE FUNCIONALIDADES.pdf	application/pdf	105538	\N
5d010425-ec40-4bd0-b2d6-7d14ce27e2c4	33bc52cf-5bb3-4419-9004-f7dcff553874	dni_back	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/8a5eed2ff4b94515aed939c533f7ca43_scaled_52a7b694-7d8a-4263-9f46-e4b7c97706fc8961068186872580878.jpg	approved	\N	2026-07-11 17:51:51.114628	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:25:53.424249	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/8a5eed2ff4b94515aed939c533f7ca43_scaled_52a7b694-7d8a-4263-9f46-e4b7c97706fc8961068186872580878.jpg	scaled_52a7b694-7d8a-4263-9f46-e4b7c97706fc8961068186872580878.jpg	image/jpeg	1482603	\N
8c117abb-2e36-4488-b986-4fc996f5d92c	33bc52cf-5bb3-4419-9004-f7dcff553874	dni_front	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/3fa7fd591a17427dbe2832c00a05ddc5_scaled_da842bd5-107d-4fe3-add3-94842387f2e72064618063661255621.jpg	approved	\N	2026-07-11 17:51:52.258812	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:25:44.30635	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/3fa7fd591a17427dbe2832c00a05ddc5_scaled_da842bd5-107d-4fe3-add3-94842387f2e72064618063661255621.jpg	scaled_da842bd5-107d-4fe3-add3-94842387f2e72064618063661255621.jpg	image/jpeg	1771142	\N
4373f2c1-c631-4418-bc5e-b6e6ded4122a	33bc52cf-5bb3-4419-9004-f7dcff553874	certificado_unico_laboral	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/d06fd3f2906e42ccbdb49e30e703c1bb_scaled_483ed2ec-c63e-46a2-a210-6aa5d80ab6054150053653182830300.jpg	approved	\N	2026-07-11 17:51:45.828508	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:27:50.374097	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/d06fd3f2906e42ccbdb49e30e703c1bb_scaled_483ed2ec-c63e-46a2-a210-6aa5d80ab6054150053653182830300.jpg	scaled_483ed2ec-c63e-46a2-a210-6aa5d80ab6054150053653182830300.jpg	image/jpeg	548916	\N
fbb3a0ce-48fa-46a1-af6f-9b7026c57e1d	33bc52cf-5bb3-4419-9004-f7dcff553874	tarjeta_propiedad	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/01dddbc606534a8dafc6acf9d5b3aa0a_scaled_b0771ff8-0519-4634-a026-464525d75fd6389064294943124884.jpg	approved	\N	2026-07-11 17:51:47.745183	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:26:42.482834	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/01dddbc606534a8dafc6acf9d5b3aa0a_scaled_b0771ff8-0519-4634-a026-464525d75fd6389064294943124884.jpg	scaled_b0771ff8-0519-4634-a026-464525d75fd6389064294943124884.jpg	image/jpeg	448965	\N
9a7a6ae8-12ac-44c6-acaa-3a2f375cb57a	30182b2f-91b3-42d5-94d3-33b075ed725f	dni_back	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/186c251a07cf486f915c57113cc6e625_Untitled-design-1.png	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:27.216667	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:23:27.256667	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/186c251a07cf486f915c57113cc6e625_Untitled-design-1.png	Untitled-design-1.png	image/png	890304	\N
d877ac16-5ac1-4edd-8549-4aa417eab6e2	30182b2f-91b3-42d5-94d3-33b075ed725f	certificado_unico_laboral	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/7a28b66c3dd8446a801a11c8ced1a32e_WhatsAppImage2026-05-09at10.28.09AM.jpeg	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:22.726667	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:24:23.326667	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/7a28b66c3dd8446a801a11c8ced1a32e_WhatsAppImage2026-05-09at10.28.09AM.jpeg	WhatsApp Image 2026-05-09 at 10.28.09 AM.jpeg	image/jpeg	49860	\N
ac3c42cb-b10e-40fe-9b6f-a33f80553347	30182b2f-91b3-42d5-94d3-33b075ed725f	tarjeta_propiedad	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/437e5d1c8a5e482fb12cff610f15157a_Gemini_Generated_Image_41hxj041hxj041hx.png	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:24.223333	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:24:02.126667	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/437e5d1c8a5e482fb12cff610f15157a_Gemini_Generated_Image_41hxj041hxj041hx.png	Gemini_Generated_Image_41hxj041hxj041hx.png	image/png	1343245	\N
b8395cd8-13ac-4b19-97ec-bab48e56604d	30182b2f-91b3-42d5-94d3-33b075ed725f	license	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/e3d5df8c24214c77a40499f8d66a166b_moto.png	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:26.633333	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:23:32.626667	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/e3d5df8c24214c77a40499f8d66a166b_moto.png	moto.png	image/png	1926314	\N
2cf265ba-59b6-42c9-9fe5-d8f41244ceeb	30182b2f-91b3-42d5-94d3-33b075ed725f	dni_front	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/6216692dfcf740b99c1d290ffc91a776_Gemini_Generated_Image_2fqo1g2fqo1g2fqo.jpg	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:27.903333	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:23:19.566667	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/6216692dfcf740b99c1d290ffc91a776_Gemini_Generated_Image_2fqo1g2fqo1g2fqo.jpg	Gemini_Generated_Image_2fqo1g2fqo1g2fqo.jpg	image/jpeg	985921	\N
89f99416-8ae3-486b-8942-e3fc90dd5202	30182b2f-91b3-42d5-94d3-33b075ed725f	revision_tecnica	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/7f3cd9154e4749ea92dbda918455b4df_WhatsAppImage2026-02-01at5.52.58AM.jpeg	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:23.556667	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:24:16.296667	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/7f3cd9154e4749ea92dbda918455b4df_WhatsAppImage2026-02-01at5.52.58AM.jpeg	WhatsApp Image 2026-02-01 at 5.52.58 AM.jpeg	image/jpeg	223559	\N
61a47726-da4e-46bd-82aa-ed95a05049b6	30182b2f-91b3-42d5-94d3-33b075ed725f	soat	http://localhost:5003/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/15023bf119e644a0a8e8ffdc3a56c294_auto.png	approved	2028-05-28 17:13:09.845036	2026-05-17 03:26:25.396667	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-17 03:23:49.78	drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/15023bf119e644a0a8e8ffdc3a56c294_auto.png	auto.png	image/png	5611660	\N
886a7538-e8f2-4be2-8d89-acc0d20abe92	33bc52cf-5bb3-4419-9004-f7dcff553874	license	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/04ba664b1a1c4674b32b35c153d4dcce_scaled_9dc737fa-4a8f-4d29-ba8e-f4c1bf924ed11862968122692436602.jpg	approved	2026-08-31 05:00:00	2026-07-11 17:51:50.066403	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:26:18.002583	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/04ba664b1a1c4674b32b35c153d4dcce_scaled_9dc737fa-4a8f-4d29-ba8e-f4c1bf924ed11862968122692436602.jpg	scaled_9dc737fa-4a8f-4d29-ba8e-f4c1bf924ed11862968122692436602.jpg	image/jpeg	1351801	\N
8226093c-052b-4304-a399-a77abd6b9533	33bc52cf-5bb3-4419-9004-f7dcff553874	revision_tecnica	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/5a069ed05c5748b78daf3aeeb5ba1257_scaled_a8d354b1-9af2-4a8a-9aa7-2e2a36790b8c6907345386500435651.jpg	approved	2026-08-30 05:00:00	2026-07-11 17:51:46.998178	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:27:35.599304	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/5a069ed05c5748b78daf3aeeb5ba1257_scaled_a8d354b1-9af2-4a8a-9aa7-2e2a36790b8c6907345386500435651.jpg	scaled_a8d354b1-9af2-4a8a-9aa7-2e2a36790b8c6907345386500435651.jpg	image/jpeg	385335	\N
0b87bb73-8d7d-4ba2-aa8e-24d9b9654172	33bc52cf-5bb3-4419-9004-f7dcff553874	soat	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/bb3749f9a29f46a8858c0e992f0878f0_scaled_1079231f-c81f-45fe-b253-9d5ce00fd6e03650584460391665107.jpg	approved	2026-08-31 05:00:00	2026-07-11 17:51:48.911165	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-07-11 17:26:31.261274	drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/bb3749f9a29f46a8858c0e992f0878f0_scaled_1079231f-c81f-45fe-b253-9d5ce00fd6e03650584460391665107.jpg	scaled_1079231f-c81f-45fe-b253-9d5ce00fd6e03650584460391665107.jpg	image/jpeg	488398	\N
\.


--
-- Data for Name: driverpresencecheckins; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.driverpresencecheckins (id, driveruserid, photourl, checkedinat, checkedoutat, facequalityscore, createdat) FROM stdin;
7a0a2f03-77b0-4c71-8d62-860e52cfe657	7ec78cab-0e66-4104-abc1-2506cab83499	/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/presence/641512d0bc844a80ac36f6c2917f330b_face_1780093051111.jpg	2026-05-30 03:17:35.646667	\N	1000.0000	2026-05-30 03:17:35.646667
ebca3bd7-8d64-409f-94ff-a545fb7bc99a	31e89885-cc6e-4097-af16-c8558a760474	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/presence/feac4ff7ece549cdbff974df732ec07d_face_1783805849375.jpg	2026-07-11 21:37:29.234707	\N	1000.0000	2026-07-11 21:37:29.2357
\.


--
-- Data for Name: drivers; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.drivers (id, userid, status, isonline, currentlat, currentlng, faceidphotourl, rating, totalratings, createdat, approvedat, profilephotourl, currentlocationat) FROM stdin;
a6230716-505a-4b5a-88ee-1ba0002663b8	3b33c255-70d2-401e-a76e-da1540155ec4	3	f	-18.011935	-70.2255071	\N	5.00	0	2026-05-23 06:06:34.62	2026-05-23 06:14:04.986667	/uploads/drivers/a6230716-505a-4b5a-88ee-1ba0002663b8/profile/6f0b3d8b61e64167b35c1b6dd9389c07_scaled_a8feb701-aa85-4f93-bdc3-4adcada516368898964762114879015.jpg	2026-05-28 08:50:14.536667
30182b2f-91b3-42d5-94d3-33b075ed725f	7ec78cab-0e66-4104-abc1-2506cab83499	3	t	-18.0120223	-70.2255801	\N	3.00	1	2026-05-17 03:22:07.13	2026-05-28 17:13:18.28	/uploads/drivers/30182b2f-91b3-42d5-94d3-33b075ed725f/profile/3cfa5082a2e24b66b18668667c48ca2b_scaled_81403f73-8aa7-4eaf-92d7-145d398c678b50144623218081128.jpg	2026-05-30 03:17:36.923333
33bc52cf-5bb3-4419-9004-f7dcff553874	31e89885-cc6e-4097-af16-c8558a760474	3	t	-18.0120543	-70.2256337	\N	3.33	3	2026-07-11 16:10:17.103295	2026-07-11 17:51:55.127317	/uploads/drivers/33bc52cf-5bb3-4419-9004-f7dcff553874/profile/5d15c3ae85b8454aabf2626275c72416_scaled_8fa4e23a-9c04-43ef-b117-f9e57261c96f1022269641290422892.jpg	2026-07-13 02:29:15.633902
\.


--
-- Data for Name: locationhistory; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.locationhistory (id, driverid, tripid, lat, lng, speedkmh, heading, recordedat) FROM stdin;
1	a6230716-505a-4b5a-88ee-1ba0002663b8	\N	-18.0120535	-70.2255953	\N	\N	2026-05-28 08:10:15.863333
2	a6230716-505a-4b5a-88ee-1ba0002663b8	\N	-18.0120473	-70.2255796	\N	\N	2026-05-28 08:14:31.09
3	a6230716-505a-4b5a-88ee-1ba0002663b8	\N	-18.0120496	-70.2255855	\N	\N	2026-05-28 08:22:49.103333
4	a6230716-505a-4b5a-88ee-1ba0002663b8	75b7d0dc-78d0-49c0-b088-3cfbd83cfb8a	-18.0120424	-70.2255978	0	0	2026-05-28 08:25:11.633333
5	a6230716-505a-4b5a-88ee-1ba0002663b8	\N	-18.0119946	-70.2255464	\N	\N	2026-05-28 08:32:10.203333
6	a6230716-505a-4b5a-88ee-1ba0002663b8	\N	-18.0120527	-70.2255916	\N	\N	2026-05-28 08:38:49.66
7	a6230716-505a-4b5a-88ee-1ba0002663b8	\N	-18.011935	-70.2255071	\N	\N	2026-05-28 08:50:14.54
8	30182b2f-91b3-42d5-94d3-33b075ed725f	\N	-18.0119918	-70.2255538	\N	\N	2026-05-28 17:14:33.43
9	30182b2f-91b3-42d5-94d3-33b075ed725f	\N	-18.0120223	-70.2255801	\N	\N	2026-05-30 03:17:36.933333
10	33bc52cf-5bb3-4419-9004-f7dcff553874	\N	-18.0119938	-70.2255612	\N	\N	2026-07-11 21:37:31.723616
11	33bc52cf-5bb3-4419-9004-f7dcff553874	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	-18.0120645	-70.2256286	0	0	2026-07-11 23:27:22.296366
12	33bc52cf-5bb3-4419-9004-f7dcff553874	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	-18.0120614	-70.225635	0	0	2026-07-11 23:28:39.913294
13	33bc52cf-5bb3-4419-9004-f7dcff553874	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	-18.0120614	-70.225635	0	0	2026-07-11 23:28:39.954367
14	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120614	-70.225635	0	0	2026-07-11 23:36:03.329858
15	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120614	-70.225635	0	0	2026-07-11 23:37:33.247261
16	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120614	-70.225635	0	0	2026-07-11 23:39:03.253637
17	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120614	-70.225635	0	0	2026-07-11 23:40:33.260046
18	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120646	-70.2256288	0	0	2026-07-11 23:42:11.211326
19	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120646	-70.2256288	0	0	2026-07-11 23:43:41.190162
20	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120646	-70.2256288	0	0	2026-07-11 23:45:11.201449
21	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:47:29.281067
22	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:47:29.29521
23	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:48:59.293654
24	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:48:59.335428
25	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:50:29.287276
26	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:50:29.297554
27	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:51:59.303091
28	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:51:59.304591
29	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:53:29.298157
30	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:53:29.318794
31	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:54:59.302522
32	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:54:59.316411
33	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:56:29.308289
34	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:56:29.342383
35	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:57:59.350494
36	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120662	-70.2256338	0	0	2026-07-11 23:57:59.350544
38	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120642	-70.2256299	0	0	2026-07-12 00:50:09.255198
37	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120642	-70.2256299	0	0	2026-07-12 00:50:09.255267
39	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120614	-70.2256338	0	0	2026-07-12 21:19:37.094185
40	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:20:39.520013
41	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:20:39.519192
42	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:20:39.533598
43	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:20:39.567778
45	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:22:09.552149
46	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:22:09.552137
44	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:22:09.552152
47	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:22:09.552142
48	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:23:39.575347
49	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:23:39.603719
50	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:23:39.603737
51	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:23:39.606152
52	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:25:09.547836
53	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:25:09.552676
54	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:25:09.5643
55	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:25:09.573394
56	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:26:39.568815
57	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:26:39.580472
58	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:26:39.591265
59	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:26:39.615631
60	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:28:09.533862
61	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:28:09.535521
62	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:28:09.538254
63	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:28:09.564625
64	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:29:39.572798
65	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:29:39.57328
66	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:29:39.58171
67	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:29:39.605525
68	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:31:09.576938
69	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:31:09.584695
70	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:31:09.591439
71	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:31:09.602587
72	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:32:39.585992
73	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:32:39.58727
74	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:32:39.637033
75	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:32:39.644639
76	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:34:09.608881
77	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:34:09.610007
79	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:34:09.610082
78	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120622	-70.2256285	0	0	2026-07-12 21:34:09.609504
80	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120609	-70.225619	0	0	2026-07-12 23:48:25.24232
81	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120609	-70.225619	0	0	2026-07-12 23:48:25.242312
82	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120609	-70.225619	0	0	2026-07-12 23:48:25.242301
83	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120609	-70.225619	0	0	2026-07-12 23:48:25.242287
84	33bc52cf-5bb3-4419-9004-f7dcff553874	44f6bd64-9466-4b6c-963e-bf51526d4109	-18.0120644	-70.2256272	0	0	2026-07-13 00:53:42.052325
85	33bc52cf-5bb3-4419-9004-f7dcff553874	5c8d648b-87dc-4081-b123-6d1cf26e6ded	-18.0120543	-70.2256337	0	0	2026-07-13 02:29:15.646773
\.


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.reviews (id, driverid, passengerid, tripid, rating, comment, createdat) FROM stdin;
\.


--
-- Data for Name: vehicles; Type: TABLE DATA; Schema: drivers; Owner: postgres
--

COPY drivers.vehicles (id, driverid, plate, brand, model, year, color, isactive, createdat, photourl) FROM stdin;
86ac23d1-102c-4e9e-ae55-376089ffa354	a6230716-505a-4b5a-88ee-1ba0002663b8	123QWE	ford	pik	2025	plomo	t	2026-05-23 06:13:21.893333	/uploads/vehicles/a6230716-505a-4b5a-88ee-1ba0002663b8/6c02ffcc60054a59920174faccebe2fd_scaled_6fd1db8f-a0cb-4ed6-8830-8be6bdd905986452753694588143895.jpg
ea91a6d3-06f3-469e-9271-e1a49d51292c	30182b2f-91b3-42d5-94d3-33b075ed725f	QWWR=23	audi	toyota	2025	azul	t	2026-05-24 07:09:18.686667	/uploads/vehicles/30182b2f-91b3-42d5-94d3-33b075ed725f/4ebb7c9e271242bfb2817a1e85271b09_scaled_1000222768.jpg
8351107b-233c-42c9-aedd-f233d6a44f0e	30182b2f-91b3-42d5-94d3-33b075ed725f	4578-QW	toyota	corolla	2020	negro	f	2026-05-17 04:12:58.85	/uploads/vehicles/30182b2f-91b3-42d5-94d3-33b075ed725f/7a5e46e5999944c6afd56e314f376df7_scaled_1000222902.jpg
caba480c-54a1-41aa-a771-7c1e1b082ecd	33bc52cf-5bb3-4419-9004-f7dcff553874	Q234	toyota	auu	2026	azyul	t	2026-07-11 19:04:51.854888	/uploads/vehicles/33bc52cf-5bb3-4419-9004-f7dcff553874/4076afeec81645308c36232fdf9ed935_scaled_564d10b7-97bf-42ce-9a57-d5d3b8960e078867135475619891448.jpg
\.


--
-- Data for Name: contactmessages; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.contactmessages (id, name, email, subject, message, isread, createdat, readat, readbyuserid, lastreplyat) FROM stdin;
\.


--
-- Data for Name: contactreplies; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.contactreplies (id, contactid, adminuserid, adminname, subject, body, status, errormessage, createdat) FROM stdin;
\.


--
-- Data for Name: faqitems; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.faqitems (id, lang, category, question, answer, ispublished, sortorder, createdat, updatedat) FROM stdin;
d9428da8-6f5b-f111-94c2-e89c25455173	es	Pasajeros	¿Cómo solicito un viaje?	Abre la app, ingresa tu destino, confirma la tarifa estimada y presiona "Solicitar viaje". Un conductor cercano aceptará tu pedido en segundos.	t	1	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
da428da8-6f5b-f111-94c2-e89c25455173	es	Pasajeros	¿Puedo cancelar un viaje?	Sí, puedes cancelar antes de que el conductor llegue a recogerte. Si el conductor ya inició la ruta hacia ti, podría aplicarse una pequeña tarifa de cancelación.	t	2	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
db428da8-6f5b-f111-94c2-e89c25455173	es	Pasajeros	¿Cómo califico a mi conductor?	Al finalizar el viaje, la app te mostrará automáticamente la pantalla de calificación. Puedes dar de 1 a 5 estrellas y dejar un comentario opcional.	t	3	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
dc428da8-6f5b-f111-94c2-e89c25455173	es	Conductores	¿Cómo me registro como conductor?	Descarga la app, regístrate y acude a nuestras oficinas para la validación física de documentos (DNI, licencia, SOAT, antecedentes). Una vez aprobado podrás empezar a conducir.	t	1	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
dd428da8-6f5b-f111-94c2-e89c25455173	es	Conductores	¿Qué documentos necesito?	DNI vigente, licencia de conducir, SOAT, certificado de antecedentes penales y tarjeta de propiedad del vehículo.	t	2	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
de428da8-6f5b-f111-94c2-e89c25455173	es	Conductores	¿Cuánto gano por viaje?	El 80% de la tarifa del viaje va directo a tu billetera digital. El 20% restante es la comisión de la plataforma.	t	3	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
df428da8-6f5b-f111-94c2-e89c25455173	es	Pagos	¿Qué métodos de pago acepta Bugie?	En el MVP aceptamos efectivo, Yape y Plin. Próximamente sumaremos tarjeta de crédito y débito.	t	1	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
e0428da8-6f5b-f111-94c2-e89c25455173	es	Pagos	¿Cómo retiro mis ganancias como conductor?	Tus ganancias se acumulan en tu billetera digital dentro de la app. Puedes solicitar retiros a tu cuenta bancaria o billetera Yape/Plin.	t	2	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
e1428da8-6f5b-f111-94c2-e89c25455173	es	Seguridad	¿Cómo funciona el botón SOS?	En cualquier momento del viaje puedes presionar el botón SOS. Esto alerta inmediatamente a nuestro Centro de Monitoreo 24/7 y, según la gravedad, se contacta a la Policía Nacional.	t	1	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
e2428da8-6f5b-f111-94c2-e89c25455173	es	Seguridad	¿Los conductores están verificados?	Sí. Todos los conductores pasan por verificación presencial de documentos en nuestras oficinas, y deben superar una validación biométrica facial diaria antes de empezar a conducir.	t	2	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
e3428da8-6f5b-f111-94c2-e89c25455173	es	Seguridad	¿La plataforma monitorea los viajes?	Sí, todos los viajes son monitoreados en tiempo real desde nuestro Centro de Comando, con alertas automáticas por desviaciones de ruta o detenciones prolongadas.	t	3	2026-05-29 20:04:16.25	2026-05-29 15:04:16.25
\.


--
-- Data for Name: mediaassets; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.mediaassets (id, filename, fileurl, mimetype, sizebytes, uploadedby, createdat) FROM stdin;
\.


--
-- Data for Name: newsarticles; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.newsarticles (id, slug, tag, title, summary, lang, ispublished, publishedat, createdat) FROM stdin;
59ed10b2-0ad2-4934-83d9-137fe3bdaedb	arquitectura-microservicios-bugie	Tecnología	La arquitectura detrás de Bugie: microservicios y onion architecture	Bugie está construido sobre 5 APIs independientes con arquitectura cebolla, CQRS y Dapper. Cada módulo es autónomo para que las actualizaciones no afecten al resto del sistema.	es	t	2026-03-10 14:00:00	2026-04-08 16:31:30.293333
70d18e1c-32a8-4ca7-b5b5-228479d469e3	verificacion-conductores-proceso	Seguridad	Así funciona la verificación de conductores en Bugie	Cada conductor pasa por un proceso de validación presencial que incluye DNI, licencia de conducir, SOAT, carta de antecedentes penales y reconocimiento facial diario antes de operar.	es	t	2026-02-20 15:00:00	2026-04-08 16:31:30.293333
d497423d-459b-4858-93b2-3eaebb62aaf8	driver-verification-process	Safety	How driver verification works at Bugie	Every driver goes through an in-person validation process including ID, driver's license, insurance, criminal background check and daily facial recognition before operating.	en	t	2026-02-20 15:00:00	2026-04-08 16:31:30.293333
b8fc1f9e-b92a-4912-b010-425ebf74d3b4	bugie-lanzamiento-trujillo	Producto	Bugie lanza su plataforma de transporte seguro en Trujillo	InteliaDevs S.A.C. presenta Bugie, la primera plataforma de transporte que combina verificación presencial, reconocimiento facial diario y botón SOS conectado a la Policía Nacional.	es	t	2026-02-09 13:00:00	2026-04-08 16:31:30.29
7d265b70-d8ef-4884-9ed7-46b10cf34d72	panel-admin-monitoreo	Producto	Panel administrativo con monitoreo en tiempo real	El back office de Bugie permite al equipo operativo ver conductores activos en el mapa, gestionar alertas SOS y aprobar documentos desde una sola interfaz.	es	t	2026-03-15 05:00:00	2026-03-24 08:31:02.576667
d45b56c3-4a6e-489b-b802-50a1684d70ba	bugie-lanzamiento	Producto	Bugie lanza su plataforma de transporte seguro en Trujillo	La plataforma Bugie inicia operaciones con conductores verificados, monitoreo 24/7 y botón SOS integrado para pasajeros y conductores.	es	t	2026-02-09 05:00:00	2026-03-24 08:31:02.576667
2bebae1d-de4f-47fa-ad6f-5c7e18d8f51b	bugie-launch-trujillo	Product	Bugie launches its safe transport platform in Trujillo	InteliaDevs S.A.C. presents Bugie, the first transport platform that combines in-person verification, daily facial recognition and an SOS button connected to the National Police.	en	t	2026-02-09 13:00:00	2026-04-08 16:31:30.293333
6515410a-f8d7-4682-8e46-6c6da08f6fae	arquitectura-microservicios	Tecnología	Arquitectura modular para soportar 5000+ conductores activos	El backend de Bugie usa microservicios independientes con arquitectura cebolla, CQRS y SQL Server con índices espaciales para búsqueda de conductores en tiempo real.	es	t	2026-03-01 05:00:00	2026-03-24 08:31:02.576667
9f7a99a2-f967-4bcf-a4d7-af25a0d5c273	verificacion-conductores	Seguridad	Verificación presencial obligatoria para todos los conductores	Bugie implementa un proceso de validación física de documentos: DNI, licencia, SOAT y antecedentes penales se verifican en oficinas antes de aprobar cada conductor.	es	t	2026-02-15 05:00:00	2026-03-24 08:31:02.576667
caaf0729-2227-44c9-87b9-beeafc2f2cf2	bugie-microservices-architecture	Technology	The architecture behind Bugie: microservices and onion architecture	Bugie is built on 5 independent APIs with onion architecture, CQRS and Dapper. Each module is autonomous so updates do not affect the rest of the system.	en	t	2026-03-10 14:00:00	2026-04-08 16:31:30.293333
\.


--
-- Data for Name: sectioncontents; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.sectioncontents (id, sectionid, lang, contentjson, updatedat) FROM stdin;
dce19eaa-9639-4d60-8cc3-1a8ba30a8b71	bb6abb08-e71d-4cef-b541-c1f8496846e9	es	{"eyebrow": "Noticias", "title": "Actualizaciones del proyecto Bugie.", "subtitle": "Avances del producto, decisiones de arquitectura y novedades del servicio en Trujillo.", "emptyText": "No hay artículos disponibles en este idioma."}	2026-04-08 07:22:19.753333
cb1709c9-a932-4385-bfcd-0c436c64a830	6fd10519-502d-4650-93fa-869d6aa77d2f	en	{"eyebrow": "Welcome", "title": "Sign in to continue.", "subtitle": "Access with your passenger or driver account.", "emailLabel": "Email", "emailPlaceholder": "email@example.com", "passwordLabel": "Password", "passwordPlaceholder": "••••••••", "rememberLabel": "Remember me", "forgotLabel": "Forgot your password?", "submitLabel": "Continue", "loadingLabel": "Signing in…", "noAccountLabel": "Don't have an account?", "registerLabel": "Create account"}	2026-04-08 07:22:19.756667
b3d94171-d440-4200-a7cf-9d37b6dff2a1	a62be9ac-ad21-4c94-aba8-00daab482c83	en	{"links":[{"label":"Company","href":"/empresa"},{"label":"Safety","href":"/seguridad"},{"label":"News","href":"/noticias"},{"label":"Contact","href":"/contacto"}],"loginLabel":"Sign in","registerLabel":"Create account"}	2026-03-24 08:31:02.53
139f0bab-4fff-4857-93d6-1c08de03fc44	cdc481d2-f4ca-4dea-8f0f-386c04f63535	es	{"eyebrow": "Acceso por rol", "title": "Ingresa a la plataforma de transporte seguro de Trujillo.", "subtitle": "Desde aquí se separan los flujos de pasajero y conductor. El panel admin queda fuera para aislar responsabilidades.", "chipLabel": "Transporte seguro", "features": [{"icon": "fa-shield-halved", "title": "Conductores verificados", "text": "Documentos, Face ID y antecedentes revisados antes de operar."}, {"icon": "fa-location-dot", "title": "Seguimiento en tiempo real", "text": "Trazabilidad activa del viaje para pasajero y conductor."}, {"icon": "fa-triangle-exclamation", "title": "Botón SOS", "text": "Alerta directa al monitoreo y Policía Nacional."}, {"icon": "fa-mobile-screen-button", "title": "App para todos", "text": "Pasajero, conductor y admin con flujos propios."}], "chips": ["Pasajero", "Conductor", "Admin separado"]}	2026-04-08 07:22:19.756667
ed378a79-4e9f-4b59-b596-2468fa695530	bb6abb08-e71d-4cef-b541-c1f8496846e9	en	{"eyebrow": "News", "title": "Bugie project updates.", "subtitle": "Product progress, architecture decisions and service news in Trujillo.", "emptyText": "No articles available in this language."}	2026-04-08 07:22:19.756667
8cf4087c-ac99-4d2e-a74e-2dc68b4f5e7e	f7413404-e958-4f87-a3df-74bd407e3c3a	en	{"eyebrow": "Safety", "title": "Bugie safety is not a feature — it is the reason it exists.", "subtitle": "Physical verification, continuous monitoring, daily biometrics and coordinated response.", "mapLabel": "Verified operation zones in Trujillo", "features": [{"icon": "fa-id-card", "title": "In-person verification", "text": "ID, license, insurance and background checks at Bugie offices."}, {"icon": "fa-fingerprint", "title": "Daily facial recognition", "text": "Biometric validation before each shift."}, {"icon": "fa-location-dot", "title": "24/7 monitoring", "text": "Routes recorded in real time."}, {"icon": "fa-triangle-exclamation", "title": "Dual SOS button", "text": "Alert connected to monitoring and National Police."}, {"icon": "fa-shield-halved", "title": "Response under 2 minutes", "text": "Bugie operational goal for any SOS alert."}, {"icon": "fa-handshake", "title": "Tactical alliance", "text": "Direct coordination with National Police of Trujillo."}], "stats": [{"value": "5,000+", "label": "Verified drivers"}, {"value": "24/7", "label": "Active monitoring"}, {"value": "<2min", "label": "SOS response time"}, {"value": "100%", "label": "In-person verification"}]}	2026-04-08 07:22:19.753333
0a12d9b5-ca61-48f8-be78-4051d2dfc710	6dc31b14-6c7a-4de6-aef0-5bcc1560ff6f	en	{"eyebrow": "Company", "title": "Bugie was born to elevate safety in urban mobility in Trujillo.", "description": "We are InteliaDevs S.A.C. — a team of software engineers from Trujillo building a transport platform that puts safety first.", "missionTitle": "Mission", "mission": "Build a safer and more reliable transport experience for Trujillo.", "visionTitle": "Vision", "vision": "To be the reference for safe mobility in northern Peru.", "problemsTitle": "The problem we solve", "problems": [{"iconClass": "fa-triangle-exclamation text-danger", "title": "Trust crisis", "text": "~30,000 taxis without verification."}, {"iconClass": "fa-user-slash text-warning", "title": "Unverified drivers", "text": "No background checks or licenses."}, {"iconClass": "fa-eye-slash text-info", "title": "No monitoring", "text": "No route traceability."}, {"iconClass": "fa-shield-halved text-success", "title": "The Bugie solution", "text": "Verification + monitoring + SOS in one platform."}], "teamTitle": "Team", "team": [{"name": "José Ishikawa", "role": "Project Manager / Scrum Master", "icon": "fa-user-tie"}, {"name": "Richard Blanco", "role": "Software Architect", "icon": "fa-code"}, {"name": "Dev Team", "role": "2 Full Stack + 1 QA", "icon": "fa-users"}]}	2026-04-08 07:22:19.753333
99e602b4-2aa4-4190-81b2-439c711770aa	a24d0563-7a90-441a-9d14-896b3db0ddf9	es	{\n  "eyebrow": "Prueba social",\n  "title": "La plataforma que inspira confianza desde la primera pantalla.",\n  "items": [\n    {\n      "name": "Camila R.",\n      "role": "Pasajera frecuente",\n      "stars": 5,\n      "text": "La interfaz transmite seguridad. Se entiende rápido quién conduce, por dónde va el viaje y dónde pedir ayuda."\n    },\n    {\n      "name": "Luis M.",\n      "role": "Conductor",\n      "stars": 5,\n      "text": "La app del conductor se siente más seria: disponibilidad, documentos, ingresos y soporte están más claros."\n    },\n    {\n      "name": "Operaciones",\n      "role": "Gestión",\n      "stars": 3,\n      "text": "Separar la web pública del panel admin ayuda a validar el producto sin mezclar flujos."\n    },\n    {\n      "name": "Luis M.",\n      "role": "Conductor",\n      "stars": 5,\n      "text": "La app del conductor se siente más seria: disponibilidad, documentos, ingresos y soporte están más claros."\n    },\n    {\n      "name": "Operaciones",\n      "role": "Gestión",\n      "stars": 3,\n      "text": "Separar la web pública del panel admin ayuda a validar el producto sin mezclar flujos."\n    },\n    {\n      "name": "Operaciones",\n      "role": "Gestión",\n      "stars": 3,\n      "text": "Separar la web pública del panel admin ayuda a validar el producto sin mezclar flujos."\n    },\n    {\n      "name": "Luis M.",\n      "role": "Conductor",\n      "stars": 5,\n      "text": "La app del conductor se siente más seria: disponibilidad, documentos, ingresos y soporte están más claros."\n    }\n  ]\n}	2026-04-25 17:40:02.913333
c139396e-aefd-4444-b26b-4af1251e89c3	6fd10519-502d-4650-93fa-869d6aa77d2f	es	{"eyebrow": "Bienvenido", "title": "Inicia sesión para continuar.", "subtitle": "Accede con tu cuenta de pasajero o conductor.", "emailLabel": "Correo", "emailPlaceholder": "correo@ejemplo.com", "passwordLabel": "Contraseña", "passwordPlaceholder": "••••••••", "rememberLabel": "Recordarme", "forgotLabel": "¿Olvidaste tu contraseña?", "submitLabel": "Continuar", "loadingLabel": "Ingresando…", "noAccountLabel": "¿Aún no tienes cuenta?", "registerLabel": "Crear cuenta"}	2026-04-08 07:22:19.756667
40060606-b4fa-4992-a480-4d84046d0865	23bc9a68-3933-4d60-8976-5ab5a65470d1	es	{\n  "title": "Tu app. Tu ciudad. Tu destino.",\n  "subtitle": "Viaja seguro. Viaja bacán, viaja con Bugie.",\n  "ctaPrimary": "Solicitar viaje",\n  "ctaSecondary": "Crear cuenta",\n  "pills": [\n    "✓ Tarifas justas",\n    "✓ Central de monitoreo",\n    "✓ Premios y beneficios"\n  ],\n  "stats": [\n    {\n      "value": "5000+",\n      "label": "✓ Conductores verificados"\n    },\n    {\n      "value": "24/7",\n      "label": "✓ Monitoreo activo"\n    },\n    {\n      "value": "<2min",\n      "label": "✓ Respuesta SOS"\n    }\n  ]\n}	2026-05-12 06:15:37.14
0c2e5b20-13f7-409f-bfce-568ccfe9ea34	de6a86bc-c1ca-47ab-84c5-a766429ad1ad	en	{"eyebrow":"Next step","title":"Start moving safely today.","text":"Sign up and request your first verified ride.","ctaPrimary":"Enter demo","ctaSecondary":"Contact team"}	2026-03-24 08:31:02.53
817aa4fd-a605-41a0-9dba-5a7ec2a7f74f	06b24d5c-789f-4206-aaa9-dc510b671986	es	{"eyebrow": "Contacto", "title": "Conversemos sobre Bugie y cómo podemos ayudarte.", "subtitle": "¿Quieres ser conductor, tienes una alianza o necesitas soporte? Escríbenos directamente.", "formTitle": "Escríbenos", "successTitle": "¡Mensaje enviado!", "successText": "Gracias por contactarnos. Te responderemos pronto.", "sendAnotherLabel": "Enviar otro mensaje", "sendLabel": "Enviar mensaje", "nameLabel": "Nombre", "emailLabel": "Correo", "subjectLabel": "Motivo", "messageLabel": "Mensaje", "namePlaceholder": "Tu nombre completo", "emailPlaceholder": "correo@ejemplo.com", "messagePlaceholder": "Cuéntanos qué necesitas (mínimo 10 caracteres)", "subjects": [{"value": "general", "label": "Consulta general"}, {"value": "alliance", "label": "Alianza comercial"}, {"value": "driver", "label": "Quiero ser conductor"}, {"value": "support", "label": "Soporte técnico"}], "info": [{"icon": "fa-location-dot", "title": "Trujillo, Perú", "desc": "Cobertura inicial del servicio."}, {"icon": "fa-envelope", "title": "hola@bugie.pe", "desc": "Respuesta en menos de 24 horas."}, {"icon": "fa-headset", "title": "Soporte y alianzas", "desc": "Canal preparado para operaciones."}]}	2026-04-08 07:22:19.753333
24c24f21-c0ae-4cb5-b21c-5b8eec895dca	4da4eaee-68a1-444d-94c8-344ce3f4f82d	es	{\n  "tagline": "Tu App de Transporte Seguro",\n  "description": "Plataforma de viajes locales diseñada para todos los peruanos.",\n  "companyCol": "Empresa",\n  "productCol": "Producto",\n  "contactCol": "Contacto",\n  "links": [\n    {\n      "label": "Nosotros",\n      "href": "/empresa"\n    },\n    {\n      "label": "Seguridad",\n      "href": "/seguridad"\n    },\n    {\n      "label": "Noticias",\n      "href": "/noticias"\n    },\n    {\n      "label": "Contacto",\n      "href": "/contacto"\n    },\n { "label": "Preguntas frecuentes", "href": "/faq" }\n  ],\n  "productLinks": [\n    {\n      "label": "Solicitar viaje",\n      "href": "/auth/login"\n    },\n    {\n      "label": "Crear cuenta",\n      "href": "/auth/registro"\n    },\n    {\n      "label": "Cómo funciona",\n      "href": "/como-funciona"\n    },\n    {\n      "label": "Tarifas",\n      "href": "/tarifas"\n    },\n    {\n      "label": "Panel admin",\n      "href": "http://localhost:5174",\n      "external": true\n    }\n  ],\n  "contact": {\n    "email": "hola@bugie.pe",\n    "city": "Trujillo, Perú",\n    "phone": "+51 999 999 999",\n    "support": "Soporte y alianzas"\n  },\n  "social": [\n    {\n      "name": "instagram",\n      "url": "https://instagram.com/bugie.pe"\n    },\n    {\n      "name": "facebook-f",\n      "url": "https://facebook.com/bugie.pe"\n    },\n    {\n      "name": "linkedin-in",\n      "url": "https://linkedin.com/company/bugie"\n    },\n    {\n      "name": "tiktok",\n      "url": "https://tiktok.com/@bugie.pe"\n    },\n    {\n      "name": "whatsapp",\n      "url": "https://wa.me/51999999999"\n    }\n  ],\n  "legal": "© 2026 Bugie. Todos los derechos reservados.",\n  "legalSub": "InteliaDevs S.A.C. · Trujillo, Perú"\n}	2026-05-30 01:53:13.093333
77f8e4b8-711e-4bda-b914-5c7213dec9ac	cdc481d2-f4ca-4dea-8f0f-386c04f63535	en	{"eyebrow": "Role access", "title": "Sign in to the safe transport platform in Trujillo.", "subtitle": "Passenger and driver flows are separated here.", "chipLabel": "Safe transport", "features": [{"icon": "fa-shield-halved", "title": "Verified drivers", "text": "Documents, Face ID and background checks."}, {"icon": "fa-location-dot", "title": "Real-time tracking", "text": "Active trip traceability."}, {"icon": "fa-triangle-exclamation", "title": "SOS button", "text": "Direct alert to monitoring and National Police."}, {"icon": "fa-mobile-screen-button", "title": "App for everyone", "text": "Passenger, driver and admin with their own flows."}], "chips": ["Passenger", "Driver", "Separate admin"]}	2026-04-08 07:22:19.756667
153ba096-5aa6-4362-8dcb-6dd2c126e0f8	a62be9ac-ad21-4c94-aba8-00daab482c83	es	{"links":[{"label":"Empresa","href":"/empresa"},{"label":"Seguridad","href":"/seguridad"},{"label":"Noticias","href":"/noticias"},{"label":"Contacto","href":"/contacto"}],"loginLabel":"Ingresar","registerLabel":"Crear cuenta"}	2026-03-24 08:31:02.523333
0ac5f7be-8d00-418c-a24a-790968c1516b	1ee74550-a061-41c3-b6ff-ea8243836cf3	es	{\n  "metricsTitle": "Beneficios",\n  "metrics": [\n    {\n      "label": "Descuentos en establecimientos locales, afiliaciones",\n      "value": 50,\n      "suffix": "+"\n    },\n    {\n      "label": "Acumula puntos y canjea premios,Cada S/ 1 equivale 1 Bugie coin",\n      "value": 1,\n      "suffix": "+"\n    },\n    {\n      "label": "El camino del bugiusuario,Descuentos preferenciales",\n      "value": 100,\n      "suffix": "%"\n    },\n    {\n      "label": "Sorteos y premios sorpresa",\n      "value": 24,\n      "suffix": "/7"\n    }\n  ],\n  "features": [\n    {\n      "icon": "fa-fingerprint",\n      "title": "Reconocimiento y validación",\n      "text": "Face ID diario y control de identidad para conductores."\n    },\n    {\n      "icon": "fa-location-crosshairs",\n      "title": "Seguimiento del servicio",\n      "text": "Estado y recorrido del viaje para pasajeros y conductores."\n    },\n    {\n      "icon": "fa-triangle-exclamation",\n      "title": "Botón SOS",\n      "text": "Acciones prioritarias y visibles para incidentes o reportes."\n    },\n    {\n      "icon": "fa-building-shield",\n      "title": "Easy Contact",\n      "text": "Respuesta rápida a través de nuestros canales de comunicación."\n    }\n  ]\n}	2026-05-12 06:23:24.553333
2b654b6b-fad9-4748-8201-8258a142aaa5	2a1e3fe8-ac27-4e11-84ff-43c959b2dcd6	en	{"eyebrow": "Register", "title": "Create your Bugie account.", "subtitle": "Choose whether you will be a passenger or driver.", "firstNameLabel": "First name", "firstNamePlaceholder": "First name", "lastNameLabel": "Last name", "lastNamePlaceholder": "Last name", "emailLabel": "Email", "emailPlaceholder": "email@example.com", "phoneLabel": "Phone", "phonePlaceholder": "999 999 999", "passwordLabel": "Password", "passwordPlaceholder": "Minimum 8 characters", "roleLabel": "I will use Bugie as", "roles": [{"value": "passenger", "label": "Passenger"}, {"value": "driver", "label": "Driver"}], "submitLabel": "Create account", "loadingLabel": "Creating account…", "hasAccountLabel": "Already have an account?", "loginLabel": "Sign in"}	2026-04-08 07:22:19.756667
91663a97-e273-41eb-bf30-93c2f0497482	06b24d5c-789f-4206-aaa9-dc510b671986	en	{"eyebrow": "Contact", "title": "Let us talk about Bugie and how we can help you.", "subtitle": "Want to be a driver, have a partnership or need support? Write to us directly.", "formTitle": "Write to us", "successTitle": "Message sent!", "successText": "Thank you for contacting us. We will get back to you soon.", "sendAnotherLabel": "Send another message", "sendLabel": "Send message", "nameLabel": "Name", "emailLabel": "Email", "subjectLabel": "Subject", "messageLabel": "Message", "namePlaceholder": "Your full name", "emailPlaceholder": "email@example.com", "messagePlaceholder": "Tell us what you need (min 10 characters)", "subjects": [{"value": "general", "label": "General inquiry"}, {"value": "alliance", "label": "Business partnership"}, {"value": "driver", "label": "I want to be a driver"}, {"value": "support", "label": "Technical support"}], "info": [{"icon": "fa-location-dot", "title": "Trujillo, Peru", "desc": "Initial service coverage."}, {"icon": "fa-envelope", "title": "hola@bugie.pe", "desc": "Response within 24 hours."}, {"icon": "fa-headset", "title": "Support and partnerships", "desc": "Channel ready for operations."}]}	2026-04-08 07:22:19.753333
3ee3658a-8e1f-4626-a034-97de788915fd	6dc31b14-6c7a-4de6-aef0-5bcc1560ff6f	es	{"eyebrow": "Empresa", "title": "Bugie nace para elevar la seguridad en la movilidad urbana de Trujillo.", "description": "Somos InteliaDevs S.A.C. — un equipo de ingenieros de software trujillanos construyendo una plataforma de transporte que pone la seguridad primero.", "missionTitle": "Misión", "mission": "Construir una experiencia de transporte más segura y confiable para Trujillo, combinando verificación, trazabilidad y soporte dentro de una misma plataforma.", "visionTitle": "Visión", "vision": "Ser la referencia en movilidad segura en el norte del Perú.", "problemsTitle": "El problema que resolvemos", "problems": [{"iconClass": "fa-triangle-exclamation text-danger", "title": "Crisis de confianza", "text": "~30,000 taxis operando sin verificación en Trujillo."}, {"iconClass": "fa-user-slash text-warning", "title": "Conductores sin validar", "text": "Sin control de antecedentes, licencias ni estado vehicular."}, {"iconClass": "fa-eye-slash text-info", "title": "Ausencia de monitoreo", "text": "Sin trazabilidad de rutas ni respuesta ante emergencias."}, {"iconClass": "fa-shield-halved text-success", "title": "La solución Bugie", "text": "Verificación + monitoreo + SOS en una sola plataforma."}], "teamTitle": "Equipo", "team": [{"name": "José Ishikawa", "role": "Gerente de Proyecto / Scrum Master", "icon": "fa-user-tie"}, {"name": "Richard Blanco", "role": "Arquitecto de Software", "icon": "fa-code"}, {"name": "Equipo Dev", "role": "2 Full Stack + 1 QA (Sprint 3+)", "icon": "fa-users"}]}	2026-04-08 07:22:19.753333
6da2e482-79b0-4661-819f-9e833a6b6fdc	2a1e3fe8-ac27-4e11-84ff-43c959b2dcd6	es	{"eyebrow": "Registro", "title": "Crea tu cuenta en Bugie.", "subtitle": "Elige si entrarás como pasajero o conductor.", "firstNameLabel": "Nombre", "firstNamePlaceholder": "Nombre", "lastNameLabel": "Apellido", "lastNamePlaceholder": "Apellido", "emailLabel": "Correo", "emailPlaceholder": "correo@ejemplo.com", "phoneLabel": "Teléfono", "phonePlaceholder": "999 999 999", "passwordLabel": "Contraseña", "passwordPlaceholder": "Mínimo 8 caracteres", "roleLabel": "Voy a usar Bugie como", "roles": [{"value": "passenger", "label": "Pasajero"}, {"value": "driver", "label": "Conductor"}], "submitLabel": "Crear cuenta", "loadingLabel": "Creando cuenta…", "hasAccountLabel": "¿Ya tienes cuenta?", "loginLabel": "Ingresar"}	2026-04-08 07:22:19.756667
d91fa4f1-45b5-47aa-b6ab-ae0b1a249f3d	de6a86bc-c1ca-47ab-84c5-a766429ad1ad	es	{\n  "eyebrow": "Siguiente paso",\n  "title": "Empieza a movilizarte de forma segura hoy.",\n  "text": "Regístrate y solicita tu primer viaje verificado con conductores aprobados en Trujillo.",\n  "ctaPrimary": "Para Android",\n  "ctaPrimaryHref": "/auth/login",\n  "ctaPrimaryIcon": "fa-play",\n  "ctaSecondary": "Para IOS",\n  "ctaSecondaryHref": "/contacto",\n  "ctaSecondaryIcon": "fa-play"\n}	2026-05-12 06:25:23.746667
769c439a-8bd7-4bad-9170-b5af5dd51039	f7413404-e958-4f87-a3df-74bd407e3c3a	es	{"eyebrow": "Seguridad", "title": "La seguridad de Bugie no es un feature — es la razón por la que existe.", "subtitle": "Verificación física, monitoreo continuo, biometría diaria y respuesta coordinada con autoridades.", "mapLabel": "Zonas de operación verificada en Trujillo", "features": [{"icon": "fa-id-card", "title": "Verificación presencial", "text": "Cada conductor presenta DNI, licencia, SOAT y antecedentes penales en oficinas Bugie."}, {"icon": "fa-fingerprint", "title": "Reconocimiento facial diario", "text": "El conductor realiza validación biométrica antes de iniciar cada jornada."}, {"icon": "fa-location-dot", "title": "Monitoreo 24/7", "text": "Todas las rutas se registran en tiempo real."}, {"icon": "fa-triangle-exclamation", "title": "Botón SOS dual", "text": "Pasajero y conductor tienen acceso directo a alerta de emergencia."}, {"icon": "fa-shield-halved", "title": "Respuesta en menos de 2 minutos", "text": "El objetivo operativo de Bugie ante cualquier alerta SOS."}, {"icon": "fa-handshake", "title": "Alianza táctica", "text": "Bugie coordina directamente con la Policía Nacional de Trujillo."}], "stats": [{"value": "5,000+", "label": "Conductores verificados"}, {"value": "24/7", "label": "Monitoreo activo"}, {"value": "<2min", "label": "Tiempo de respuesta SOS"}, {"value": "100%", "label": "Verificación presencial"}]}	2026-04-08 07:22:19.753333
fb2fe809-bcee-412e-89f0-b68c7aa1aa9a	b1833401-84f2-4ec1-8a57-405500ce1663	es	{"title":"Política de Privacidad","updatedLabel":"Última actualización","updatedAt":"2026-02-09","html":"<h2>1. Datos que recopilamos</h2><p>Recopilamos los datos necesarios para operar el servicio: nombre, correo, teléfono, ubicación durante viajes y documentos para la verificación de conductores.</p><h2>2. Uso de los datos</h2><p>Los datos se usan exclusivamente para prestar el servicio de transporte, garantizar la seguridad y cumplir obligaciones legales.</p><h2>3. Edita este contenido</h2><p>Este texto es un marcador inicial. Edítalo desde el panel administrativo en <strong>Contenido → Documentos legales</strong>.</p>"}	2026-05-12 06:44:15.32
f5d04f48-da57-4ae0-922c-bc99754d52ac	f89c94c5-23ff-4e78-b8dc-e365da06e2f5	es	{\n  "eyebrow": "¿Qué es Bugie?",\n  "title": "Una plataforma de viajes locales diseñada para todos los peruanos.",\n  "text": "Enfocado en aportar valor y seguridad a los pasajeros y conductores en tu ciudad.",\n  "items": [\n    {\n      "icon": "fa-shield-halved",\n      "title": "Seguridad operacional",\n      "text": "Soporte, monitoreo y respuesta SOS"\n    },\n    {\n      "icon": "fa-user-check",\n      "title": "Conductores verificados",\n      "text": "Verificación de identidad, antecedentes, validación diaria."\n    },\n    {\n      "icon": "fa-location-dot",\n      "title": "Seguimiento visible",\n      "text": "Trazabilidad, contactos de confianza y ubicación compartida."\n    },\n    {\n      "icon": "fa-bolt",\n      "title": "Pasos simples",\n      "text": "Haz tu solicitud, negocia, acepta y viaja."\n    }\n  ]\n}	2026-05-12 06:18:19.543333
9f0199d5-2c7f-4534-912e-c343d601df70	de6a86bc-c1ca-47ab-84c5-a766429ad1ad	pt	{"eyebrow":"Próximo passo","title":"Comece a se mover com segurança hoje.","text":"Cadastre-se e solicite sua primeira viagem verificada.","ctaPrimary":"Entrar no demo","ctaSecondary":"Contatar equipe"}	2026-03-24 08:31:02.536667
1849c046-70d3-4143-aaeb-cc1a9a54779b	23bc9a68-3933-4d60-8976-5ab5a65470d1	en	{"title":"Safe transportation in Trujillo","subtitle":"Verified drivers, 24/7 monitoring and SOS button.","ctaPrimary":"Request a ride","ctaSecondary":"Create account","pills":["Safe transport","Live monitoring","Verification"]}	2026-03-24 08:31:02.53
1235d987-7740-422e-96c8-d8acc18f9280	23bc9a68-3933-4d60-8976-5ab5a65470d1	pt	{"title":"Transporte seguro em Trujillo","subtitle":"Motoristas verificados, monitoramento 24/7 e botão SOS.","ctaPrimary":"Solicitar viagem","ctaSecondary":"Criar conta","pills":["Transporte seguro","Monitoramento","Verificação"]}	2026-03-24 08:31:02.536667
cf476a21-f9c1-4e36-9403-e159b5411fe9	490d7c7d-9e8a-4999-b30b-32f4cb25ab9d	es	{"title":"Términos y Condiciones","updatedLabel":"Última actualización","updatedAt":"2026-02-09","html":"<h2>1. Aceptación</h2><p>Al utilizar Bugie aceptas estos términos y condiciones. Si no estás de acuerdo, no uses la plataforma.</p><h2>2. Descripción del servicio</h2><p>Bugie es una plataforma de transporte seguro que conecta pasajeros con conductores verificados en Trujillo, Perú.</p><h2>3. Edita este contenido</h2><p>Este texto es un marcador inicial. Edítalo desde el panel administrativo en <strong>Contenido → Documentos legales</strong>.</p>"}	2026-05-12 06:44:15.313333
\.


--
-- Data for Name: sections; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.sections (id, sectionkey, sortorder, isvisible, updatedat) FROM stdin;
a62be9ac-ad21-4c94-aba8-00daab482c83	navbar	0	t	2026-03-24 08:31:02.513333
96a2c81f-2c0f-497a-9732-14502061ea62	how-it-works	3	t	2026-03-24 08:31:02.513333
490d7c7d-9e8a-4999-b30b-32f4cb25ab9d	terms	100	t	2026-05-12 06:44:15.296667
4da4eaee-68a1-444d-94c8-344ce3f4f82d	footer	99	t	2026-05-30 01:53:13.106667
cdc481d2-f4ca-4dea-8f0f-386c04f63535	auth	94	t	2026-04-08 07:22:19.713333
b1833401-84f2-4ec1-8a57-405500ce1663	privacy	101	t	2026-05-12 06:44:15.303333
2a1e3fe8-ac27-4e11-84ff-43c959b2dcd6	auth_register	96	t	2026-04-08 07:22:19.713333
23bc9a68-3933-4d60-8976-5ab5a65470d1	hero	1	t	2026-05-12 06:15:37.16
6dc31b14-6c7a-4de6-aef0-5bcc1560ff6f	company	90	t	2026-04-08 07:22:19.71
f7413404-e958-4f87-a3df-74bd407e3c3a	safety	91	t	2026-04-08 07:22:19.71
6fd10519-502d-4650-93fa-869d6aa77d2f	auth_login	95	t	2026-04-08 07:22:19.713333
a24d0563-7a90-441a-9d14-896b3db0ddf9	testimonials	6	t	2026-04-25 17:40:02.916667
de6a86bc-c1ca-47ab-84c5-a766429ad1ad	cta	7	t	2026-05-12 06:25:23.75
bb6abb08-e71d-4cef-b541-c1f8496846e9	news	93	t	2026-04-08 07:22:19.71
06b24d5c-789f-4206-aaa9-dc510b671986	contact	92	t	2026-04-08 07:22:19.71
f89c94c5-23ff-4e78-b8dc-e365da06e2f5	features	2	t	2026-05-12 06:18:19.546667
1ee74550-a061-41c3-b6ff-ea8243836cf3	stats	5	t	2026-05-12 06:23:24.553333
\.


--
-- Data for Name: systemsettings; Type: TABLE DATA; Schema: landing; Owner: postgres
--

COPY landing.systemsettings (id, settingkey, value, description, updatedat, updatedby) FROM stdin;
3bad1b57-2022-414b-b3ad-08c7f3e221e9	support_email	soporte@bugie.pe	Correo de soporte	2026-03-24 08:31:02.573333	\N
35376734-8eb9-4e59-853b-1e91adb229dc	base_fare	5.00	Tarifa base mínima en soles	2026-03-24 08:31:02.573333	\N
c282bda6-6366-4f9f-8a5e-792529623d1e	support_phone	(044) 123-456	Teléfono de soporte Trujillo	2026-03-24 08:31:02.573333	\N
3adfee10-6d48-4fed-b529-832999eb9963	default_lat	-18.00963785778757	Latitud centro del mapa (Trujillo)	2026-04-25 07:57:22.136667	10b700cb-5890-44a0-8cb4-561af63e2cc0
7234c118-c825-46b2-8806-890414c3d5df	default_lng	 -70.24570493144532	Longitud centro del mapa (Trujillo)	2026-04-25 07:57:22.98	10b700cb-5890-44a0-8cb4-561af63e2cc0
c18a1da5-d38f-4343-8f43-a19b3f9a873c	default_zoom	12	Zoom inicial del mapa	2026-04-30 08:42:15.183333	10b700cb-5890-44a0-8cb4-561af63e2cc0
0ac0823f-e63c-4084-8d52-a9e440a82ecf	sos_response_min	2	Tiempo objetivo de respuesta SOS en minutos	2026-03-24 08:31:02.573333	\N
ec93bc45-5c5a-497a-8a8a-dd63d38fabf2	max_radius_km	10	Radio máximo de búsqueda de conductores (km)	2026-03-24 08:31:02.573333	\N
96fd882d-b4ba-4f01-9b08-edf87052c734	deviation_detection_enabled	false	Si esta en true, se detecta cuando el conductor se sale de la ruta y se alerta. Default: false (desactivado).	2026-05-26 16:20:23.024506	\N
eea9832d-2882-4297-b4ea-f4e6a005d52b	default_city	tacna	Ciudad principal de operación de la plataforma	2026-05-26 17:55:00.933333	10b700cb-5890-44a0-8cb4-561af63e2cc0
851fbfbe-febf-479e-a646-f9182ec8dc6e	fare_per_km	1.50	Tarifa por kilómetro en soles	2026-03-24 08:31:02.573333	\N
e6cd1a41-e867-497a-95e9-6801f3b448ba	platform_fee_rate	10.00	Comision de Bugie por viaje, EN PORCENTAJE (10 = 10%). Se calcula sobre lo que el pasajero pago de verdad	2026-10-02 15:32:12.912384	\N
\.


--
-- Data for Name: driverwallet; Type: TABLE DATA; Schema: payments; Owner: postgres
--

COPY payments.driverwallet (id, driverid, balance, totalearned, totalwithdrawn, updatedat) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: payments; Owner: postgres
--

COPY payments.payments (id, tripid, passengerid, driverid, amount, platformfee, driveramount, method, status, reference, createdat, paidat, platformfeerate) FROM stdin;
253be34f-21d5-44e6-9a1d-42023592038f	415d44e9-bf79-4e4e-a802-0bfb9820747c	73e34565-0de5-43c3-b330-d8dceaee797a	3b33c255-70d2-401e-a76e-da1540155ec4	10.00	1.00	9.00	cash	completed	\N	2026-05-26 06:21:40.46	2026-05-26 06:21:40.46	10.00
80afa2c2-2109-49b9-863a-b231d63b4e51	03483e92-934d-40bb-a946-7b863370aa31	f1e64012-7713-45b4-bff2-33b45d3abfd4	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	1.10	9.90	cash	completed	\N	2026-05-18 00:07:51.846667	2026-05-18 00:07:51.846667	10.00
01864e61-beee-47af-b7b7-c4786e519039	47008ca1-b614-4789-bc38-368944749eb3	f1e64012-7713-45b4-bff2-33b45d3abfd4	7ec78cab-0e66-4104-abc1-2506cab83499	5.00	0.50	4.50	cash	completed	\N	2026-05-17 07:51:51.843333	2026-05-17 07:51:51.843333	10.00
ac5383ed-aed9-4e6a-a0f2-cf74c3205e22	b35df0ad-641c-4a5c-a259-756c9bd1f070	a0160a2d-94d1-454e-bfa8-45945535a063	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	1.00	9.00	cash	completed	\N	2026-05-24 07:10:33.436667	2026-05-24 07:10:33.436667	10.00
71a7ff57-9934-40b4-b666-e57fa8c0cfb6	5cf9e4da-d6b0-4a61-8924-3f90920b0cf8	f1e64012-7713-45b4-bff2-33b45d3abfd4	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	1.10	9.90	cash	completed	\N	2026-05-17 20:36:07.7	2026-05-17 20:36:07.7	10.00
90c64e7f-7c0e-45de-b3e9-e7e3741fb4db	75b7d0dc-78d0-49c0-b088-3cfbd83cfb8a	a0160a2d-94d1-454e-bfa8-45945535a063	3b33c255-70d2-401e-a76e-da1540155ec4	20.00	2.00	18.00	cash	completed	\N	2026-05-28 08:25:13.653333	2026-05-28 08:25:13.653333	10.00
486af7ee-fdc5-4a92-b54f-11bef684387a	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	20.00	2.00	18.00	cash	completed	\N	2026-07-11 23:29:04.077955	2026-07-11 23:29:04.078113	10.00
6507f833-8658-40db-868b-92b28b50c0cc	44f6bd64-9466-4b6c-963e-bf51526d4109	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	10.00	1.00	9.00	cash	completed	\N	2026-07-13 00:54:04.771995	2026-07-13 00:54:04.772172	10.00
b0e8399e-200f-4245-b229-d5be3db64cbf	5c8d648b-87dc-4081-b123-6d1cf26e6ded	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	15.00	1.50	13.50	yape	completed	\N	2026-07-13 02:30:07.63717	2026-07-13 02:30:07.637234	10.00
\.


--
-- Data for Name: wallettransactions; Type: TABLE DATA; Schema: payments; Owner: postgres
--

COPY payments.wallettransactions (id, driverid, type, amount, reference, balanceafter, createdat) FROM stdin;
\.


--
-- Data for Name: withdrawals; Type: TABLE DATA; Schema: payments; Owner: postgres
--

COPY payments.withdrawals (id, driverid, amount, method, accountref, status, processedat, createdat, drivername, operationnumber, paidat, paidbyadminid, paidbyadminname, note, sourcetype, sourceref) FROM stdin;
\.


--
-- Data for Name: bugie_migraciones; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bugie_migraciones (nombre, aplicada) FROM stdin;
2026-10-02_horas_a_utc	2026-10-03 00:28:34.82117
\.


--
-- Data for Name: catalogitems; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.catalogitems (id, code, usertype, name, description, pointscost, rewardtype, amountsoles, quantity, percentage, minlevel, stock, validitydays, sortorder, isactive, createdat, updatedat) FROM stdin;
717ee670-1b81-4f04-90e1-ba9f3ba88965	pass_discount_2	passenger	S/. 2 de descuento	Descuento de S/. 2 en tu proximo viaje.	500	discount_amount	2.00	\N	\N	\N	\N	30	1	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
29ffc5e6-c8ca-4768-b8eb-3cc7c2eb3b8b	pass_free_trip_8	passenger	Viaje gratis hasta S/. 8	Un viaje gratis. Si la tarifa supera S/. 8, pagas la diferencia.	1000	free_trip	8.00	\N	\N	\N	\N	30	2	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
d54ac583-00e4-4098-951b-5678a5bff296	pass_free_trip_15	passenger	Viaje gratis hasta S/. 15	Un viaje gratis. Si la tarifa supera S/. 15, pagas la diferencia.	2000	free_trip	15.00	\N	\N	\N	\N	30	3	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
e6c357cf-5123-494f-8fb4-d0f1feb7c664	pass_month_10	passenger	1 mes con 10% de descuento	10% de descuento en todos tus viajes durante 30 dias.	3000	discount_period	\N	30	10.00	\N	\N	30	4	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
f703c5a8-e191-4643-991d-bbd2088eb7b8	pass_raffle_1	passenger	1 ticket extra de sorteo mensual	Un ticket adicional para el sorteo mensual vigente.	5000	raffle_ticket	\N	1	\N	\N	\N	60	5	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
6a736216-9133-463b-b08c-034db8b780a8	pass_free_trip_25	passenger	Viaje gratis hasta S/. 25	Un viaje gratis. Si la tarifa supera S/. 25, pagas la diferencia.	7500	free_trip	25.00	\N	\N	\N	\N	30	6	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
1600e6ce-dcda-4e41-aee1-bcb64450f18d	pass_product	passenger	Producto del catalogo virtual	Accesorios o vouchers del catalogo. Se coordina la entrega.	10000	physical	\N	\N	\N	\N	\N	60	7	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
94eba1a6-6ae1-4915-b365-10fc816406fd	pass_smartphone	passenger	Smartphone entry-level	Smartphone de gama de entrada o su equivalente en creditos.	20000	physical	\N	\N	\N	\N	\N	90	8	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
fd410fdd-0e20-4228-87f2-027e598fd904	drv_bonus_5	driver	Bono de S/. 5	S/. 5 abonados a tu cuenta Bugie.	500	wallet_bonus	5.00	\N	\N	\N	\N	30	1	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
9573fa14-f2ae-4e15-91b3-e5aa76a0a70d	drv_bonus_15	driver	Bono de S/. 15	S/. 15 abonados a tu cuenta Bugie.	1250	wallet_bonus	15.00	\N	\N	\N	\N	30	2	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
44ad5392-1501-47e2-94fb-87c7918bb0e7	drv_bonus_35	driver	Bono de S/. 35	S/. 35 abonados a tu cuenta Bugie.	2500	wallet_bonus	35.00	\N	\N	\N	\N	30	3	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
c9544eeb-6c1a-4694-838d-2c049836e143	drv_maintenance	driver	Descuento en mantenimiento vehicular	Descuento en talleres socios afiliados.	3750	partner_benefit	\N	\N	\N	\N	\N	60	4	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
8350b32b-b6c4-407f-886e-3d3a649738f8	drv_bonus_80	driver	Bono de S/. 80	S/. 80 abonados a tu cuenta Bugie.	5000	wallet_bonus	80.00	\N	\N	\N	\N	30	5	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
eb632b65-ce0a-4168-90c7-1f46b49f6ff0	drv_insurance	driver	Seguro vehicular mensual	Un mes de seguro vehicular con socio afiliado.	7500	partner_benefit	\N	\N	\N	\N	\N	60	6	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
1db032bc-0006-40d5-a0e0-71fd1e488aa0	drv_product	driver	Producto del catalogo virtual premium	Producto premium del catalogo. Se coordina la entrega.	12500	physical	\N	\N	\N	\N	\N	60	7	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
8944e701-20be-4340-9598-e22d0e7814d1	drv_grand	driver	Gran premio	Tablet, herramientas o su equivalente en efectivo.	25000	physical	\N	\N	\N	\N	\N	90	8	t	2026-09-16 10:45:02.160732	2026-09-16 10:45:02.160732
\.


--
-- Data for Name: levels; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.levels (id, usertype, name, displayname, sortorder, minpoints, maxpoints, discountpercentage, monthlyfreetrips, weeklyraffletickets, monthlyraffletickets, isactive, createdat, updatedat) FROM stdin;
b3101b7c-f555-4b88-a4e9-e60729e0b10d	passenger	bronze	Bronce	1	0	4999	5.00	0	0	1	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
a590438b-8d7a-43ce-98c5-ab89ea7c5084	passenger	silver	Plata	2	5000	14999	10.00	0	0	3	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
ca7aa6d2-a835-44fa-bed2-aed1b863fbbd	passenger	gold	Oro	3	15000	39999	15.00	1	2	5	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
603b333f-d1f8-4cff-8046-9b2777e2864a	passenger	platinum	Platino	4	40000	\N	25.00	3	5	10	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
27c5c153-2a56-49b7-aaef-63509e32955d	driver	bronze	Bronce	1	0	4999	0.00	0	0	1	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
440afff8-b770-46ac-aa53-f071895daa31	driver	silver	Plata	2	5000	14999	0.00	0	0	3	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
3ba7f169-d86f-4bc1-a756-177c9c85de7b	driver	gold	Oro	3	15000	39999	0.00	0	2	5	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
f9300903-c808-47c5-ba5a-0bba13d4ed8b	driver	platinum	Platino	4	40000	\N	0.00	0	5	10	t	2026-09-16 01:49:09.626204	2026-09-16 01:49:09.626204
\.


--
-- Data for Name: milestoneawards; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.milestoneawards (id, profileid, type, periodkey, points, detail, createdat) FROM stdin;
1	03a67e97-9985-4265-84c0-d3fceb04ac14	streak	2026-06-03	150	7	2026-06-03 17:00:00
2	03a67e97-9985-4265-84c0-d3fceb04ac14	streak	2026-06-30	150	14	2026-06-30 17:00:00
3	03a67e97-9985-4265-84c0-d3fceb04ac14	weekly_goal	2026-W28	200	52	2026-07-07 17:00:00
4	03a67e97-9985-4265-84c0-d3fceb04ac14	weekly_goal	2026-W29	200	55	2026-07-14 17:00:00
5	03a67e97-9985-4265-84c0-d3fceb04ac14	no_cancellations	2026-08-02	100	7	2026-08-02 17:00:00
6	03a67e97-9985-4265-84c0-d3fceb04ac14	no_cancellations	2026-08-17	100	5	2026-08-17 17:00:00
7	03a67e97-9985-4265-84c0-d3fceb04ac14	no_cancellations	2026-09-01	100	6	2026-09-01 17:00:00
8	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	streak	2026-03-05	150	7	2026-03-05 17:00:00
\.


--
-- Data for Name: pointsadjustments; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.pointsadjustments (id, profileid, transactionid, points, reason, adminid, createdat) FROM stdin;
7b54cc82-872b-40f5-b7a0-a464a2d28273	03a67e97-9985-4265-84c0-d3fceb04ac14	98462d31-d4ef-41c1-8d1d-ec6587fc0b3d	500	Compensacion por la falla del 20/09 que no acredito puntos	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-09-22 22:03:00
\.


--
-- Data for Name: pointsprofiles; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.pointsprofiles (id, userid, usertype, totalpoints, availablepoints, redeemedpoints, currentlevel, pointsexpirydate, lastactivitydate, createdat, updatedat, expirywarningsentfor, expirywarninglastmilestone) FROM stdin;
03a67e97-9985-4265-84c0-d3fceb04ac14	3b33c255-70d2-401e-a76e-da1540155ec4	driver	17300	5050	9250	gold	2027-10-01 17:00:00	2026-10-01 11:00:00	2026-02-03 17:00:00	2026-10-01 11:00:00	\N	\N
fb8993ca-a667-49f9-a5c1-e38ec3a669a7	05b9d66f-8441-45b4-bdc1-d418a807dddd	passenger	11000	3300	6500	silver	2026-10-23 17:00:00	2026-09-29 17:00:00	2025-10-14 15:00:00	2026-10-01 21:00:10.602974	2026-10-23 17:00:00	30
\.


--
-- Data for Name: pointstransactions; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.pointstransactions (id, profileid, type, points, sourceevent, referenceid, balancebefore, balanceafter, expirydate, notes, createdat) FROM stdin;
d9063cf3-1603-4179-b9e6-6c5bc9c04cda	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8f54c429-ff64-4afc-8678-8261c3d6f7c4	0	75	\N	\N	2026-02-05 14:46:00
30ca4d30-11a8-4aea-8250-15e80e1f802b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	abcaf5e7-cc96-43c8-814a-4ed588b07ad0	75	150	\N	\N	2026-02-06 15:39:00
2c2fdf87-5ee6-4342-acfc-6c97e2078ee5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	7bedc4fc-0c8e-429c-a4e6-a7f5166e7724	150	225	\N	\N	2026-02-07 16:32:00
3dd01733-5b81-4d11-aeeb-33ec2ca2edb2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	28a7a13a-0aee-4d5c-8e6e-3b8a8a0537b0	225	300	\N	\N	2026-02-08 17:25:00
0e01fde1-5820-4e3d-a8b2-b230a844993d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ada9f102-c182-4209-bf76-db7774288f53	300	375	\N	\N	2026-02-09 18:18:00
aef205fc-7970-49a8-9d67-521feadf58b4	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	02e047f4-e641-4e3f-83fa-9bee107c41dd	375	450	\N	\N	2026-02-10 19:11:00
bfcae07b-f2ab-4e5a-9c2a-f734a61dc3f6	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	0cd7c63b-a4f6-4d0e-9e89-7f01f5cb0a83	450	525	\N	\N	2026-02-11 20:04:00
cbc08fd6-43f9-40d7-97bf-1fb300afb2af	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d5f54ad3-deba-45c2-b73f-b8ec1eff7e0d	525	600	\N	\N	2026-02-12 21:57:00
f10719b0-cc3e-4923-af5a-393999fd9d84	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	21b23015-a3d5-46b6-8e65-b07f5a4219cd	600	675	\N	\N	2026-02-13 22:50:00
9a80e9c9-0857-4946-aa52-19771e1bff77	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	576b2440-a5e5-42e7-9fe8-3c13e66a9dbc	675	725	\N	Recibiste 5 estrellas	2026-02-13 21:50:00
3fc44b94-aed2-4ce4-86b4-50bc0d948b2d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1ff24c27-4477-4e9c-905a-79a7c90ed548	725	800	\N	\N	2026-02-14 23:43:00
b4edc8c5-6247-46a7-a82e-3938eac3fcef	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f957a8db-eca2-4099-bbba-d1f3fe817253	800	875	\N	\N	2026-02-15 14:36:00
e1d49a15-6eb5-438a-8ee5-afa7e0ca9afc	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	5f602d24-af40-4e1c-bc40-fdee6ef8a311	875	950	\N	\N	2026-02-16 15:29:00
c028541f-7511-469e-995d-45c0620ea8cf	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	43ca55c2-cea7-4364-a2c8-1d19f688b78a	950	1025	\N	\N	2026-02-17 16:22:00
e1586c00-b143-433f-9f98-1a3b0ccc285f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	176db842-ed57-427a-bfa4-661cd9dd06e3	1025	1100	\N	\N	2026-02-18 17:15:00
29780e0b-f114-405e-8e04-fd1210b24369	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	80de5e5a-a428-4579-af82-855beed6eab9	1100	1175	\N	\N	2026-02-19 18:08:00
b99aab06-3f83-40f9-87bd-bcc1baa4dc60	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	fe5c1a68-da55-446b-a274-73841bf8eddd	1175	1250	\N	\N	2026-02-20 19:01:00
2384b3bf-8010-4aaa-8164-a15eeaab4b5a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	39133aaa-574f-4c4a-bcd6-76cbda5d7660	1250	1325	\N	\N	2026-02-21 20:54:00
f57f23c5-47e2-41b9-8c63-6c33bacec051	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	62162e2b-3532-4812-9548-7a435d5cafa4	1325	1400	\N	\N	2026-02-22 21:47:00
a9b0dd67-74da-456f-bdfa-8f3aa60f8836	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	03d6bba5-ff07-4666-a6b3-50d5d1393249	1400	1475	\N	\N	2026-02-23 22:40:00
af38eb14-725e-4a25-88f6-7b8dbeeb70c8	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ec380716-08bb-4b05-9274-342fb7b19c88	1475	1550	\N	\N	2026-02-24 23:33:00
9d69addd-ed6e-41aa-b182-fb23d0788cb7	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	3a476189-b58a-42d8-a082-998cf6bc547e	1550	1625	\N	\N	2026-02-25 14:26:00
82b3181f-2e54-41fb-a6bd-237820011d5d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	76f08646-a24f-477f-b495-740adf782fd0	1625	1700	\N	\N	2026-02-26 15:19:00
d44253a2-9c06-40d1-98bb-6cb8ba5b5c4f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e48025e5-81f8-4f1d-975b-774edea6b518	1700	1775	\N	\N	2026-02-27 16:12:00
788fc841-9262-4114-a277-5014bf187e91	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6a666a19-c753-4bbe-bf39-5e147ff3d2ad	1775	1850	\N	\N	2026-02-28 17:05:00
b56fd2d5-7e6f-456e-88a6-a4ee842f197d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	aa0fa918-c2e0-4a52-abc8-53bd92b6c4c0	1850	1925	\N	\N	2026-03-01 18:58:00
b78bdc8e-44e7-40c0-9a84-f32c6c8fcd99	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e8badf67-81d6-46e1-8190-febe55954d5c	1925	2000	\N	\N	2026-03-02 19:51:00
74e1f0d8-a0a3-476d-b4a3-9c15eacfbb6f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e3c18582-4513-4bad-9ea9-67bf2a7a2102	2000	2075	\N	\N	2026-03-03 20:44:00
f28c19e8-2a15-433e-b61c-0c6395772922	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	bf125bb5-a29e-4214-8dbd-cd662c5d5852	2075	2125	\N	Recibiste 5 estrellas	2026-03-03 21:44:00
60992de5-6719-47c7-a3b7-85b36a27315f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	370798e0-53d5-4ca3-a3a9-68af38ee8fd0	2125	2200	\N	\N	2026-03-04 21:37:00
7d47ee45-bfba-4b10-b808-0817bc501ba7	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e2458a2a-4711-4ee0-a282-7df3576cce83	2200	2275	\N	\N	2026-03-05 22:30:00
cf234a33-9321-473c-b3ed-b1d1e7a59f1a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	eea5fff9-d791-48c3-94e4-0b080c80eaea	2275	2350	\N	\N	2026-03-06 23:23:00
42549398-9838-4e67-a078-5d48ff8a4549	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d1e0b311-7fc2-435c-914e-5d7259eaeb11	2350	2425	\N	\N	2026-03-07 14:16:00
4b2e225b-a7b9-4c04-8830-6e67ea0984bf	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	efd83416-bf4c-49d3-baa8-7cdabf9adf15	2425	2500	\N	\N	2026-03-08 15:09:00
b3592fe8-78ec-4882-9bc9-499a3b33af40	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d4f2531c-a09a-4d1a-aa83-ad5589a0b82d	2500	2575	\N	\N	2026-03-09 16:02:00
0911c489-9677-4630-8842-41f64e34ce3d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	44aace00-f6a5-4ba4-bddd-c69c51b886ab	2575	2650	\N	\N	2026-03-10 17:55:00
65404003-d62c-4541-b72d-804c6e20a24c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e7ee95e8-f0cb-485a-bb58-15759d84d33e	2650	2725	\N	\N	2026-03-11 18:48:00
81f590b4-9637-4896-a4fe-d0d7eeb4772e	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	7469ae83-6fbc-46aa-b8b2-512ca9f38a23	2725	2800	\N	\N	2026-03-12 19:41:00
5e944638-a29e-4141-beb5-f638656115bb	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	96eace2c-e9af-4edb-ab45-d485685f84c8	2800	2875	\N	\N	2026-03-13 20:34:00
40401d73-4217-488b-8501-e291dc4387a5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8eb8cf29-05e8-445a-819b-e6ff9feb10c7	2875	2950	\N	\N	2026-03-14 21:27:00
7cc6c772-b0c5-41a8-9634-3926ddf9d9d3	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	bfc0a299-e319-44ea-bb19-f2997fc27666	2950	3025	\N	\N	2026-03-15 22:20:00
7ff83bb4-d146-4d0c-ab89-0f850145a09d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8bf104fc-98d9-4bdd-816c-29ac478b7736	3025	3100	\N	\N	2026-03-16 23:13:00
a538c265-48e3-495b-9831-6b165034af43	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	25d1a5ca-e096-4042-b970-9495298f6449	3100	3175	\N	\N	2026-03-17 14:06:00
3aff02b8-cf0f-4bf4-9bc0-2a8d0289bf90	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e7ae009f-4259-4021-bbd3-1d69a2385734	3175	3250	\N	\N	2026-03-18 15:59:00
c6e6e6ac-0c0a-4f7f-a211-cc4c39395036	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8f91c29b-194b-42e3-8ad4-62593b11f6b5	3250	3325	\N	\N	2026-03-19 16:52:00
789fba6a-2185-470b-88ca-1cbfcbba2f12	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	779dd614-aeed-4bf2-ab31-989bf0e5432b	3325	3400	\N	\N	2026-03-20 17:45:00
76777367-9265-4c40-bc83-33730b54074c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	07aba31d-b13b-48fc-9f16-6f30f3ded1cf	3400	3475	\N	\N	2026-03-21 18:38:00
2a3ce50b-2df3-42f5-8420-86db4dcc6e25	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	295dd1fe-045b-465b-bbe4-bd72864b79e2	3475	3525	\N	Recibiste 5 estrellas	2026-03-21 21:38:00
89315690-0536-457f-a343-ec9c5628ad1b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	5f9fdc77-a01e-4c06-a6f0-33146ff49cf9	3525	3600	\N	\N	2026-03-22 19:31:00
dfa2edfc-53db-4dbc-9e91-226151a7dfe7	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	46a16930-7566-432c-9e1c-8cb488ea2144	3600	3675	\N	\N	2026-03-23 20:24:00
9f75c74f-7804-4088-ad82-4f43c43ee117	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	eb188b0d-981f-445f-9525-ce6b3a017ecd	3675	3750	\N	\N	2026-03-24 21:17:00
9fa39f81-abf5-4d90-a2f5-c60638f2d344	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f807570a-1980-447c-9154-994d67790a86	3750	3825	\N	\N	2026-03-25 22:10:00
2e40b299-65e9-42df-a0a0-cacf0a580b1b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	acf4bceb-7643-46a9-8279-5e64104e8805	3825	3900	\N	\N	2026-03-26 23:03:00
7251f049-a2f9-4cfa-a2ec-c1dedc38352c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	835e80bb-a563-43c9-baa8-035a4245d3bc	3900	3975	\N	\N	2026-03-27 14:56:00
f0e4491f-1709-4e69-ba1d-49edddc4d104	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	4bb47c8b-2fc4-483e-a8aa-26791e2e330c	3975	4050	\N	\N	2026-03-28 15:49:00
97cf6011-4add-4e48-8214-79fbc4f15558	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	23c8e4f9-a253-4467-8e66-7d198a894f8c	4050	4125	\N	\N	2026-03-29 16:42:00
36632b96-e4c0-48c3-aea3-e3fcb51c43ed	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d6ea2536-ea6a-47ca-a59a-54a331a33e76	4125	4200	\N	\N	2026-03-30 17:35:00
da5e8e2c-b2b1-4e01-a3ab-f287913913f3	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8ce46ebd-3074-4ca3-83f9-fa163162cdcd	4200	4275	\N	\N	2026-03-31 18:28:00
9223b558-35b9-49db-bf0a-738e67723327	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	56629a5e-1948-46b0-b7e0-d9a936644dcb	4275	4350	\N	\N	2026-04-01 19:21:00
52380cbf-d7f0-41b6-9a10-cbaad4159295	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	5c32f407-e1c1-4ae9-bec6-026c509bc282	4350	4425	\N	\N	2026-04-02 20:14:00
a2098d28-01bc-49fa-84ae-925af692c3c1	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b0686edd-aca8-4ff1-a55d-1c7fc308f225	4425	4500	\N	\N	2026-04-03 21:07:00
46280288-d723-424b-a60e-984c242b31f3	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	9b7d1df9-198f-45e3-b32e-fe10c5359bd9	4500	4575	\N	\N	2026-04-04 22:00:00
dc29abce-9e30-4078-9677-4cecca918865	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	98abcff7-b15c-4d62-9d4a-0a6936af99e5	4575	4650	\N	\N	2026-04-05 23:53:00
0e9fadc1-27da-48ea-b6ac-38dc585a588b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	10896b08-1dab-4736-b46a-710896eb59e8	4650	4725	\N	\N	2026-04-06 14:46:00
3e4729ba-94d8-4150-98db-beac47424301	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	2d14a78c-6d0a-4d35-8cc3-b0f282992edb	4725	4800	\N	\N	2026-04-07 15:39:00
5c49be5b-73e9-4a5f-a8e7-ca2ba54bc7f8	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	3766988f-41c9-4320-88bd-2e3774bee014	4800	4875	\N	\N	2026-04-08 16:32:00
1e0edc20-f8e6-441c-8745-fccaa8a7c036	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	c5374dcc-2ae3-413a-b31a-413f0823625e	4875	4925	\N	Recibiste 5 estrellas	2026-04-08 21:32:00
e988523d-e15a-40db-b5ed-f4943e880aa6	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	fa81e9ed-f918-4246-8697-dfc086958c51	4925	5000	\N	\N	2026-04-09 17:25:00
67042975-55b0-458b-aad8-59e1e229f50a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a8e36222-cab3-4382-83b0-2d8d1a70b2ed	5000	5075	\N	\N	2026-04-10 18:18:00
116486d7-9f68-4a19-8061-7d1c02f729ef	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1824c802-761d-401c-b574-5f7df83e88b4	5075	5150	\N	\N	2026-04-11 19:11:00
297c6583-af9e-4ba0-a544-3b03088a9f28	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	364ec1d4-e8be-4bb9-ba73-d2e3ef6f7235	5150	5225	\N	\N	2026-04-12 20:04:00
4349dcda-4399-4970-9a5f-f9ef506cd86f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d361f35b-cf4e-4bbe-ad4f-0f0c52f0fcae	5225	5300	\N	\N	2026-04-13 21:57:00
3ad417cb-edc5-4596-a02a-70d4ae010549	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1d6eb9f2-0557-440b-912d-4670a2ba3805	5300	5375	\N	\N	2026-04-14 22:50:00
97bdd30f-33e4-43f3-b2f9-f099e91d48ca	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b406ffac-8f53-4024-b9cb-31af8243b499	5375	5450	\N	\N	2026-04-15 23:43:00
35c69596-29f8-47aa-87b0-55e31709b331	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d678d390-55b0-429a-8a05-d91637ba7c2b	5450	5525	\N	\N	2026-04-16 14:36:00
f5bd5519-bb14-4ec5-b36a-4647bcf14ed0	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	94a1328b-6d43-401b-b716-d9fa61ff7e5e	5525	5600	\N	\N	2026-04-17 15:29:00
8f45ba02-8148-4749-ad42-ec3b79b7775b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	39334659-c265-41bd-bf6a-055ef89e65b6	5600	5675	\N	\N	2026-04-18 16:22:00
457d1a77-f489-4f48-97e7-c5b34a0e3c8b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	5287bab7-10f0-4c0e-9898-ab0051359ff8	5675	5750	\N	\N	2026-04-19 17:15:00
f8bdaa87-a3a9-44a6-b4c5-47e8265108a7	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	112678a0-f46c-4ca7-b1d7-19c974c22d37	5750	5825	\N	\N	2026-04-20 18:08:00
ecdbeb35-0b8b-48d0-b33e-629fb05c4fb5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	128b5e84-66e9-4564-a9a9-ea73f7a1fbce	5825	5900	\N	\N	2026-04-21 19:01:00
0da456c0-ae30-4388-81eb-c058adb7aba2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	66c719b5-0c3e-4eb6-8613-2aefc437f546	5900	5975	\N	\N	2026-04-22 20:54:00
52a97d0e-7228-4b9a-8bb3-49953ecf15fc	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	14f85256-05a9-40c3-8cf3-fcf14e8f0f78	5975	6050	\N	\N	2026-04-23 21:47:00
68a15f3c-2c6e-4de3-9cb1-e2bd7a3ae203	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	523cfb31-a806-4cd0-b9ea-6567287ce67e	6050	6125	\N	\N	2026-04-24 22:40:00
0f947e34-fa1f-4870-8acd-ef427b4e044b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1c8f83ae-33f0-4e39-a508-d819bffe30df	6125	6200	\N	\N	2026-04-25 23:33:00
3263cd99-84bc-4920-abc8-aaa429eaa54a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	2b617356-9efb-4193-a8f7-721142025f01	6200	6275	\N	\N	2026-04-26 14:26:00
4878ff87-dc5c-44fc-bbaa-92888411d869	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	327a7b05-08cc-4afb-9d3b-8b5d3802885b	6275	6325	\N	Recibiste 5 estrellas	2026-04-26 21:26:00
580d8ca0-ee0d-498e-a08b-ee0f45135954	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a57f5798-a3dc-4360-b198-da8aa90a0363	6325	6400	\N	\N	2026-04-27 15:19:00
d3c571ed-f65a-4b22-85ee-63bc8d9a3ef8	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	0c02b96d-8122-41f1-ab5c-3a4ec3606e98	6400	6475	\N	\N	2026-04-28 16:12:00
2dfa6c0e-14eb-4564-bdbe-891f595f85ba	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6684e16a-832f-484a-852d-0329a067e878	6475	6550	\N	\N	2026-04-29 17:05:00
6bb79d88-3ade-4bdd-8ad5-978f1a86fa53	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	9b794c7a-2114-4037-8e1a-ebca1eba91c9	6550	6625	\N	\N	2026-04-30 18:58:00
9d922b10-7958-49a6-b161-c730dcf8b54b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	7acc5f06-f8be-4072-aae1-c7856d79fc24	6625	6700	\N	\N	2026-05-01 19:51:00
25fe1af3-868e-4998-b845-8e434f89a8b7	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ae4963d5-f9d8-4bb8-be0d-869d2e5a0313	6700	6775	\N	\N	2026-05-02 20:44:00
42d93ce4-697f-4f99-b9db-adedc5b29263	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	88048998-1da3-44c1-ad18-26da1fae992e	6775	6850	\N	\N	2026-05-03 21:37:00
51d87575-a576-4360-b664-c30fd26e8f73	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	91a93fcc-4cbd-419d-b74c-4a6a500cc48d	6850	6925	\N	\N	2026-05-04 22:30:00
8f3ced08-5774-4366-90a7-f202969e292c	03a67e97-9985-4265-84c0-d3fceb04ac14	expire	3000	points_expired	\N	6925	3925	\N	Puntos vencidos por inactividad	2026-05-04 12:30:00
f14744f8-c238-4721-86b0-673685898ea0	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	242024dc-577d-4077-9fe2-a6d7b158c990	3925	4000	\N	\N	2026-05-05 23:23:00
250d8371-2d9d-4f7f-a25f-e34bbd5936dd	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f6cb0e1a-f671-4845-a2c7-4e2d26710581	4000	4075	\N	\N	2026-05-06 14:16:00
5abf11cd-e014-4b57-8d48-40cd5da278d8	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a6006e60-be1e-4c1d-88f1-4dc4b758e5b6	4075	4150	\N	\N	2026-05-07 15:09:00
94c9b039-453c-475a-adca-1100f96e949d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	bcf1dcf8-e025-4918-a9b9-fe1babf486e2	4150	4225	\N	\N	2026-05-08 16:02:00
a97982e5-c263-49e8-a22a-4fd5c5662d8e	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b85c03fe-3ae7-430a-86c8-c262319d6774	4225	4300	\N	\N	2026-05-09 17:55:00
8b0dfa64-7cea-4c02-8135-38b42bd221f5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f1cb30c1-3b6a-4eef-a9fa-1a507b8a8df9	4300	4375	\N	\N	2026-05-10 18:48:00
4c45c432-4b4e-4400-8191-90926daa6bc9	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	dc4ea11b-caf7-49b0-a25c-ee3bc2b3eb6b	4375	4450	\N	\N	2026-05-11 19:41:00
ef38ffff-8815-4fad-9f34-8b7bcd823c3c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	7f7ef46f-7754-404e-a3ab-b5454520b017	4450	4525	\N	\N	2026-05-12 20:34:00
978f7dfb-8b45-459d-83dd-d15e3ba18b4c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	968b97d0-15e4-45df-b1e7-4ad0a6451ee9	4525	4600	\N	\N	2026-05-13 21:27:00
cd87210e-6a1b-4a42-bf35-bb5b97add609	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	caf2d0e9-30d1-465e-afa5-2e6069fab823	4600	4675	\N	\N	2026-05-14 22:20:00
95fc7acf-8e33-4675-bf30-c386ea4b8d5f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	16c6f511-731c-4f86-9136-d0622b806be5	4675	4725	\N	Recibiste 5 estrellas	2026-05-14 21:20:00
b9766227-e662-4e39-8e02-068a20a52804	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	95d1ebf5-742d-4dcb-99d2-7e63ab1fa45d	4725	4800	\N	\N	2026-05-15 23:13:00
152eb198-2842-436c-b659-5f6ae58609a5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6317a08f-852d-42a7-8a0d-616a64bedd79	4800	4875	\N	\N	2026-05-16 14:06:00
239505e8-1402-4efd-bb32-d79299862d5a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1ebf471f-3b4d-4262-ae8c-da18019bd12b	4875	4950	\N	\N	2026-05-17 15:59:00
85d6f5f7-49b6-433c-8c6b-0f30c4694049	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8f9d006f-1c28-4156-bfe9-a0ccb31a2fb4	4950	5025	\N	\N	2026-05-18 16:52:00
540706bc-cda5-441d-9f14-fe92f37f9bb3	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	2bad11da-adde-485e-a630-8c5ca140e633	5025	5100	\N	\N	2026-05-19 17:45:00
ca7bd157-cc45-4ff5-bae1-02ca1f3c7488	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8bd06120-8c0a-4abb-afb1-9c55506397d7	5100	5175	\N	\N	2026-05-20 18:38:00
cffdbc7f-fbe7-42f3-9a4f-1cbc12a0a262	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	95c0d07e-4fe5-4f6e-b6e5-365becfb3b37	5175	5250	\N	\N	2026-05-21 19:31:00
d24dc07e-a523-467e-a92c-ce53422d70ac	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	4974cf34-d2ed-4c9f-8714-58a850435902	5250	5325	\N	\N	2026-05-22 20:24:00
60fa15ed-5f60-49d7-a0d4-bee5b0fcbb1d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6592a9bb-f0af-4f06-ad45-a901290f606a	5325	5400	\N	\N	2026-05-23 21:17:00
45ae0760-1ef9-45d6-ba70-e36ea7b458f2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	377d39b8-26c1-4d80-857f-0f21fd68f906	5400	5475	\N	\N	2026-05-24 22:10:00
a4af2416-d454-4cb8-909a-bf84516dbb8c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ce04a5e9-b26f-4a1c-a71b-9c1db8fdca2a	5475	5550	\N	\N	2026-05-25 23:03:00
0ebdddca-b459-499e-839c-d89d8fceaafb	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	42c50604-e907-4fd4-ae55-19d6b3b84bc6	5550	5625	\N	\N	2026-05-26 14:56:00
549ddf50-c833-408f-a6af-826d47de55e3	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d111f9d5-fb7e-4989-902f-eb59bd63ad06	5625	5700	\N	\N	2026-05-27 15:49:00
589df586-82d6-4820-a702-6bb4b71ae1a0	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b2ae0c4d-ca26-4ec7-8ad5-317e4eaeb844	5700	5775	\N	\N	2026-05-28 16:42:00
fd3e1993-3ecf-414c-8799-04e9321c13e4	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	22700e49-6c67-4926-b358-cb3d7fc9b39c	5775	5850	\N	\N	2026-05-29 17:35:00
a17f96a3-368c-45d0-bbb4-8561abdc9ecc	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c35da087-563a-4cb6-bcaf-42f66afb6d68	5850	5925	\N	\N	2026-05-30 18:28:00
28b8132d-58fc-4742-9533-ca8cc461f95f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b5d85e6f-efb4-4847-9f6a-a1bcc7ef462d	5925	6000	\N	\N	2026-05-31 19:21:00
c1c33de5-7fa6-442a-9324-08573d84df52	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	cb227780-1cd1-4813-ba36-9c6ab5c19c45	6000	6075	\N	\N	2026-06-01 20:14:00
d2b06278-5eaf-42f6-af8c-b363ae6b28ba	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	8a7935e3-b3c9-4cda-bf5a-0bf498cbe6b8	6075	6125	\N	Recibiste 5 estrellas	2026-06-01 21:14:00
e6ebd5a4-28d8-4ef5-b60d-fbef36e38d7c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c9711328-ef01-489c-a284-f0f3b679fe63	6125	6200	\N	\N	2026-06-02 21:07:00
f1d50967-9045-40c5-b1be-0fca042e3be1	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	24a60345-cbb6-4cd1-a083-78f948565190	6200	6275	\N	\N	2026-06-03 22:00:00
2ad27c82-cdee-435f-8ae8-bcdc07151994	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	150	streak	\N	6275	6425	\N	Racha de 7 dias seguidos	2026-06-04 03:00:00
d1e4c679-1321-48a5-8c80-4d49d3a59a08	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	699444f3-d87b-47d9-83fd-e27839d40a4e	6425	6500	\N	\N	2026-06-04 23:53:00
3386df9b-c1dc-4605-a1a7-0eb54308ca63	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	06917d02-09fe-4b43-aa83-2bc28602143e	6500	6575	\N	\N	2026-06-05 14:46:00
2a9e8112-e022-4833-87b9-4d8a2e8a9eca	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a58424c1-7a22-49ba-b55f-168a6c248f12	6575	6650	\N	\N	2026-06-06 15:39:00
c7fd6645-bbc7-4b98-a33a-91db19bf5dac	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c3548938-8d0f-4ea7-9df1-56f216e2a535	6650	6725	\N	\N	2026-06-07 16:32:00
dbe63db8-8bce-4800-9d02-100db799732c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e81f3555-39f1-4832-ad6c-beeff44e9306	6725	6800	\N	\N	2026-06-08 17:25:00
0e6e36f2-8242-4a86-8769-bef8f199b272	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ba4eacd5-2829-4145-881b-29035457194f	6800	6875	\N	\N	2026-06-09 18:18:00
9a54286a-7992-4146-aff5-ecbcd7d01e5c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b81915f4-5670-4b8d-afa0-21d61f0049cf	6875	6950	\N	\N	2026-06-10 19:11:00
493630ca-765a-4dfa-ad0b-3e4e5ca14e64	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	41c659d3-a667-460e-a24e-ae055e12bf8d	6950	7025	\N	\N	2026-06-11 20:04:00
f340775e-dbe7-4d44-8715-2e47c1f93001	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6d1cf2c8-3a0f-49dd-ac8b-530ced2b7c47	7025	7100	\N	\N	2026-06-12 21:57:00
5f6deb65-af8d-4dc8-9fcf-ddd96f5232b2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c4afe665-b5b8-47ee-89d4-7259b2e481b0	7100	7175	\N	\N	2026-06-13 22:50:00
e09220db-7b68-4281-a8c2-ef7882a5a42a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a43e8bb6-4703-4556-bac0-3b26491c4909	7175	7250	\N	\N	2026-06-14 23:43:00
8f5c18c2-b014-4c5a-8a46-48978a41348e	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ad0a12d5-149f-4f12-adc2-3b28a9d3f380	7250	7325	\N	\N	2026-06-15 14:36:00
46ad1c85-774d-4d16-a273-8e2b5c7df123	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	0955bbce-30ce-4610-b829-8acc68ad5918	7325	7400	\N	\N	2026-06-16 15:29:00
d32aa21d-ae01-4fc2-9a58-2a87be17b87b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	2dcd4a4e-3048-446f-b0bb-4da1e78e0ffd	7400	7475	\N	\N	2026-06-17 16:22:00
52301acc-49b3-4165-9c16-4e2f89f279ee	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	2386ef92-3b59-495e-894a-f7efa4061ab7	7475	7550	\N	\N	2026-06-18 17:15:00
7bf5e6b8-edeb-43de-a3ac-70f9efed16fc	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	9f0cac1e-5677-4400-ad98-c1c2802e60ec	7550	7625	\N	\N	2026-06-19 18:08:00
8a6b4e75-f1b4-4a60-8de1-bf9eae9a6470	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	ea9068ca-f592-490e-a9f0-7a553592a8bc	7625	7675	\N	Recibiste 5 estrellas	2026-06-19 21:08:00
d329b8bb-fbfb-4bbd-be2a-eceeb0a3cb98	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	081d59a5-b761-45c2-83cb-294910cac446	7675	7750	\N	\N	2026-06-20 19:01:00
988ab5a2-f4c6-4ace-a161-a26d4512302d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	3470b7e1-ba04-47ce-8445-de25c6e96524	7750	7825	\N	\N	2026-06-21 20:54:00
17e717bd-5345-40f8-927b-3858c60f34ea	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	d898cadc-6794-443f-89cb-4c97a97d69c7	7825	7900	\N	\N	2026-06-22 21:47:00
9b1819b2-3aab-4c3f-93cf-e8126a80d47b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	611f0e8b-2ce7-4a1f-ac13-8a4f943e0d9b	7900	7975	\N	\N	2026-06-23 22:40:00
ec857d2f-7805-4f2e-97bd-cb1338b657bb	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ec2c2356-f107-4e0a-993e-f9b9f93d4041	7975	8050	\N	\N	2026-06-24 23:33:00
04cac3b2-b7dc-4121-8e18-cd661c66b700	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	747a4f2d-bc73-4a46-b661-0c0858039de6	8050	8125	\N	\N	2026-06-25 14:26:00
0490fd34-25ab-44de-b900-f8d5db6aae8b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e8021364-eb56-4547-b65b-033d3d66fdd1	8125	8200	\N	\N	2026-06-26 15:19:00
6b817a6d-1550-4a38-9279-b87bb9d21dae	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	25ed1a5c-2ae6-4a0c-a014-8ecf60090f81	8200	8275	\N	\N	2026-06-27 16:12:00
ef42b8f3-82bc-41b1-9289-3ef62cc5087f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8c029d3e-add2-4859-8e5c-74f94f06dd5e	8275	8350	\N	\N	2026-06-28 17:05:00
4fd476ef-f351-4b3d-8847-82e84d922159	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	19d14980-4a63-4da9-967d-5e9f9b8bc469	8350	8425	\N	\N	2026-06-29 18:58:00
62fc9cab-f221-4b0f-93cc-6fef25a24083	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	682c5914-da30-462a-9390-451e6fb6bdc4	8425	8500	\N	\N	2026-06-30 19:51:00
26c5bd69-0b01-4182-9c9a-c9c11728483b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	150	streak	\N	8500	8650	\N	Racha de 14 dias seguidos	2026-07-01 03:51:00
6020c9be-7928-4f67-adc6-0932a57dd923	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	5eba5c97-f683-4406-b40c-fa8c84a74464	8650	8725	\N	\N	2026-07-01 20:44:00
dd55c454-5e28-4561-812f-bd9cbbc0aab5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f7455700-d9b8-4994-8638-6b5aa97f1a2d	8725	8800	\N	\N	2026-07-02 21:37:00
d01288bf-63c9-4bba-bca3-07792c0ee790	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	824bf804-866b-4ef7-9b92-bc6de6774ff4	8800	8875	\N	\N	2026-07-03 22:30:00
b9e1c932-5d73-4c40-b631-bc8c3057d019	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	94ffa468-9660-41e9-8062-cba89a08587f	8875	8950	\N	\N	2026-07-04 23:23:00
1bb6890b-1ed8-42ee-a1f2-ad5cbf4f3c64	03a67e97-9985-4265-84c0-d3fceb04ac14	redeem	500	catalog_redemption	\N	8950	8450	\N	Bono de S/. 5	2026-07-05 20:16:00
77fdf848-0bef-48de-994a-0d2bf194ef95	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	b24c3aae-df5f-4ff6-ae6f-e40c3f556cfb	8450	8500	\N	Recibiste 5 estrellas	2026-07-07 21:02:00
c73e3bb5-0ba3-493e-aaac-5e8985988d14	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	200	weekly_goal	\N	8500	8700	\N	Meta semanal: 52 viajes	2026-07-08 04:02:00
9fb3e80a-aae2-4be7-b6e5-134b52576d20	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	200	weekly_goal	\N	8700	8900	\N	Meta semanal: 55 viajes	2026-07-15 04:13:00
0843cea8-a756-46c2-83ed-687f21d4c423	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	375	referral	\N	8900	9275	\N	Referiste a un nuevo usuario	2026-07-23 16:10:00
a607a481-bbd7-4b53-ac1e-17c11f727afe	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	f47c72d7-f949-4cc1-ad85-474001d6f0ce	9275	9325	\N	Recibiste 5 estrellas	2026-07-25 21:56:00
96c3c224-8139-4866-be65-45135bb3991b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	100	no_cancellations	\N	9325	9425	\N	7 viajes sin cancelar	2026-08-03 04:00:00
1887a4b1-687d-4a37-9bbf-76c403b53183	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	afb02c1b-01da-40a6-9c7c-848db4cc742f	9425	9475	\N	Recibiste 5 estrellas	2026-08-12 21:50:00
b472b827-87cf-484d-b6f3-badd08402a95	03a67e97-9985-4265-84c0-d3fceb04ac14	redeem	1250	catalog_redemption	\N	9475	8225	\N	Bono de S/. 15	2026-08-12 20:50:00
9ea9f5ae-d4a8-4980-8899-76db83a7d0e3	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	100	no_cancellations	\N	8225	8325	\N	5 viajes sin cancelar	2026-08-18 04:15:00
dd11d6f0-0684-4b1b-bab0-abbdbaff0537	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	375	referral	\N	8325	8700	\N	Referiste a un nuevo usuario	2026-08-22 16:40:00
599f7959-e728-41e8-a3bd-2664230b11ee	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	56a09c03-5f86-4cb5-b232-f6b323be6342	8700	8750	\N	Recibiste 5 estrellas	2026-08-30 21:44:00
4365739f-fb18-4af4-831a-000d9ec10403	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	100	no_cancellations	\N	8750	8850	\N	6 viajes sin cancelar	2026-09-02 04:30:00
0369330b-4c2b-4797-b18d-3e202f2703b6	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	200	referral_qualified	\N	8850	9050	\N	Tu referido completo 5 viajes	2026-09-13 16:06:00
7eefdb29-8a0e-41c2-839a-710b47959bb1	03a67e97-9985-4265-84c0-d3fceb04ac14	redeem	7500	catalog_redemption	\N	9050	1550	\N	Seguro vehicular mensual	2026-09-19 20:24:00
98462d31-d4ef-41c1-8d1d-ec6587fc0b3d	03a67e97-9985-4265-84c0-d3fceb04ac14	adjust_add	500	admin_adjustment	\N	1550	2050	\N	Compensacion por la falla del 20/09 que no acredito puntos	2026-09-22 22:03:00
e0ac8e60-9c24-49cb-a860-74deea34e540	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	eb3e3a77-d3ef-4e9a-ab67-56947c54c2bf	2050	2125	\N	\N	2026-09-26 14:35:00
ddd8f237-de05-4e53-bc1d-0af49a472fc9	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	146f34d3-95ef-41fe-a61a-e7982111be15	2125	2175	\N	Recibiste 5 estrellas	2026-09-27 01:35:00
d4d1a181-61a2-43b3-8694-3621276d270b	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	9401d7f4-034e-48ed-9dd2-f22141948288	2175	2250	\N	\N	2026-09-26 16:35:00
eed48ac3-431d-42b6-919c-d3f5b749d458	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	99630a3d-2b43-45df-a564-fcffbe907207	2250	2325	\N	\N	2026-09-26 22:35:00
1a87cd6f-2015-40cc-88d4-9f2cd1434641	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f5d47808-f3d1-4499-b6e4-ba502451fc0b	2325	2400	\N	\N	2026-09-26 19:35:00
9d3f1a84-a66f-4d00-8b9c-ebde559436ab	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	bfd5e467-b784-46fa-86f1-8481d7e85916	2400	2475	\N	\N	2026-09-26 16:35:00
51c1c69f-4e23-4b03-84ff-112bfda1715a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	8ed7494a-646b-4f6f-91fd-b7cf39953d4a	2475	2550	\N	\N	2026-09-26 22:35:00
c8e9476b-5f68-4b0f-bcb2-a940ea12c5f9	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1a5e201f-3063-421e-968e-5910c6b721b5	2550	2625	\N	\N	2026-09-27 14:28:00
5bda76b2-f446-4d54-b7c9-843c48656033	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a884a756-c400-4c04-946c-27fd2ee25972	2625	2700	\N	\N	2026-09-27 21:28:00
bcb2d638-ee1e-425b-8695-e2cc81329682	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6f4224e9-8dc7-4fb1-b51d-556e18c87b2d	2700	2775	\N	\N	2026-09-27 17:28:00
676bf148-1e82-4bd0-b552-b6a3058af1e0	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	f5777684-4862-4091-9a1d-30ebea65c346	2775	2850	\N	\N	2026-09-27 23:28:00
7ce0803e-9038-44e0-9ad3-acf045248bba	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e6afb8c3-6fbd-4cd8-ae3b-b76cc9447c74	2850	2925	\N	\N	2026-09-27 20:28:00
97f3ed0b-51c8-4399-849c-b33071815b5d	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ee145393-638e-4613-be65-0ca914f875ad	2925	3000	\N	\N	2026-09-27 17:28:00
1a4b42e9-b31f-4291-bba0-25201b04d766	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	faa3a4d9-0ece-4bfc-8e34-d91e024d7550	3000	3075	\N	\N	2026-09-27 23:28:00
ff43b89f-433f-45f2-9a80-b0dc0a3eeb77	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	1d3ad402-98cc-4333-9bc4-41744b5c7b4d	3075	3150	\N	\N	2026-09-28 14:21:00
eccb290e-4c43-489e-a0c9-15448fd3ab44	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	93295626-0d6f-4069-a927-bec780d6e41f	3150	3200	\N	Recibiste 5 estrellas	2026-09-29 01:21:00
f352d7cb-d95f-4bba-9a0b-349c20fdbdde	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	83b1cda0-a76c-41f4-9d99-f719723f9429	3200	3275	\N	\N	2026-09-28 18:21:00
dc182f16-f8b2-456b-a522-d4ca2e1e00b1	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	0b06aff4-6d3f-4a81-9550-5211bad60ef9	3275	3350	\N	\N	2026-09-29 00:21:00
59292b87-ca6e-490a-a2e0-bcad4582f763	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	642d62ad-02a0-4e08-a355-3e49ee897463	3350	3425	\N	\N	2026-09-28 21:21:00
95eb151d-a30d-46c2-b328-b0979b6970c2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	27f3b79e-9811-4abf-95d5-7de14f8c6795	3425	3500	\N	\N	2026-09-28 18:21:00
3474b9c9-c884-44f0-b745-0d2dcbe5eba8	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	cac58bab-a615-4d35-a141-8c3ac9c14f13	3500	3575	\N	\N	2026-09-29 00:21:00
deb0b543-49ac-4e33-a19e-f45de7e623bb	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	b8494d8c-308f-4c6a-aa0e-b928fa5a2e1d	3575	3650	\N	\N	2026-09-29 14:14:00
d2ce8455-4f1e-4603-8479-71032d3fcd6f	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	dbfa30ef-ba4f-4e04-a573-a0be010d946f	3650	3725	\N	\N	2026-09-29 21:14:00
55e05664-d7b7-4e67-84ae-e6b7ac866e08	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	a12d1a7c-8c1f-4e9f-a4d2-65ce532acdc8	3725	3800	\N	\N	2026-09-29 19:14:00
a42ecdb7-0f75-4fcc-9460-c345dc428433	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c316ce82-4f9b-407f-b687-07249792d30d	3800	3875	\N	\N	2026-09-29 16:14:00
af13bce7-491d-409d-ab00-a919e8baf4b2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	10d28e70-47f6-4b5f-9f06-3527079393fa	3875	3950	\N	\N	2026-09-29 22:14:00
9d6301d3-f3c7-482c-b9b9-31f96df40eb9	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	4a80b9e6-2d7f-4f36-981c-c29c2ad26230	3950	4025	\N	\N	2026-09-29 19:14:00
a345c262-b3d5-4b81-80a8-63c3cedeaf48	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	36f3b1e7-4749-4244-b714-801b44adb0db	4025	4100	\N	\N	2026-09-29 16:14:00
2e28fdb0-4de6-4671-afc3-06373d22868c	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	53f68384-8b28-4702-a75d-d02286fb5726	4100	4175	\N	\N	2026-09-30 14:07:00
79072161-7263-4091-b720-2a4e0b11c909	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	50	rating	68aeb3fc-ead8-4eea-a9f9-915e29f76ad2	4175	4225	\N	Recibiste 5 estrellas	2026-10-01 01:07:00
808bce5a-3617-4dfa-8439-7c16d26a9145	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	cd155138-8192-477c-bdc2-857018b104f3	4225	4300	\N	\N	2026-09-30 20:07:00
d190d768-168a-4673-8e29-ec1532e0ddc5	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	6412dde0-bf45-4099-a7a1-db41e6db38cd	4300	4375	\N	\N	2026-09-30 17:07:00
e1a5e1e2-ce18-4436-92a2-5e7cf4abaedd	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	ab88f709-e79f-4b23-a8a4-b2b722375bd1	4375	4450	\N	\N	2026-09-30 23:07:00
0a6eb6cd-db66-4fc5-8164-be12c81b167a	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c3169454-80d1-456f-8c21-0e378261ea92	4450	4525	\N	\N	2026-09-30 20:07:00
aa050d56-a529-4a72-8b0a-e214ecf324e8	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	993b9d53-9334-4961-ad4e-360406c60213	4525	4600	\N	\N	2026-09-30 17:07:00
a540c75d-5e00-4a0b-862e-c090029db595	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	985121ff-d408-4a63-b809-d0219f7569f9	4600	4675	\N	\N	2026-10-01 14:00:00
15c1dc84-b015-450b-ac22-5cc24f95c0d1	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	687717f6-6c08-43cb-9094-e5c92bd90a19	4675	4750	\N	\N	2026-10-01 21:00:00
f7e34bd0-b521-4ee0-9ed2-266f0dec65f4	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	0c9b7eca-3b9c-4cef-9303-3f1353f3b234	4750	4825	\N	\N	2026-10-01 21:00:00
5f16d0b5-da6e-4f42-9243-5c768daab8d2	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	c2488ac9-258e-40c4-9b12-89a715d91996	4825	4900	\N	\N	2026-10-01 18:00:00
e9b69ccd-3cc4-4dd9-ab96-c60c97bcf966	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	7d6a4258-47c3-4525-8364-663020d8a53b	4900	4975	\N	\N	2026-10-02 00:00:00
a15dfc57-d60c-47dd-af09-d0876444f196	03a67e97-9985-4265-84c0-d3fceb04ac14	earn	75	trip_completed	e316ef59-d3fd-4ea0-80c0-afc320b14680	4975	5050	\N	\N	2026-10-01 21:00:00
80474bd1-2dd5-4fae-91ad-ec9733104564	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	26b6fd7d-2ac2-4c0d-9c9b-d0ee89794d28	0	200	\N	Promociones: Hora Feliz	2025-11-05 18:30:00
38e2d538-80be-44cc-81dc-f17bd7273522	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	99f98a31-3f60-481b-abc5-2816f0d86549	200	300	\N	\N	2025-11-09 18:02:00
b1c7dd61-665c-42d8-9a68-9e7574615a1d	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	88f21d07-9f5b-47fb-84ff-6a0b67dea225	300	400	\N	\N	2025-11-13 18:34:00
69810358-0b2c-491f-87a9-79e0d08a06c0	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	d34122ed-a715-45a8-9e9b-b740152a1849	400	600	\N	Promociones: Hora Feliz	2025-11-17 18:06:00
90eee3c5-a56a-4f39-9803-cfb113783e72	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	e5b16c6d-48d0-4fde-b8a9-9da41763170b	600	700	\N	\N	2025-11-21 18:38:00
a59ba5f2-d7b7-43d1-8d6d-803c6e39e1e5	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	986c9c42-6a32-4dcd-99f7-a1c365eb2f31	700	800	\N	\N	2025-11-25 18:10:00
21b61245-fdd7-41ac-b22d-520a35a9ccc2	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	40fe3716-b289-4e9e-8d84-bc80b87d2526	800	1000	\N	Promociones: Hora Feliz	2025-11-29 18:42:00
a8393114-cc84-4794-b352-8d95b9612c34	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	893c5f85-adaa-4247-83eb-9bda265d2c5e	1000	1100	\N	\N	2025-12-03 18:14:00
05dfb1c0-36c2-4f30-a89a-059c28618c98	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	500	referral	\N	1100	1600	\N	Referiste a un nuevo usuario	2025-12-05 15:00:00
37f48051-ec2f-4c1c-bb6c-8b683fe374a5	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	e0d35d36-4e20-4ed0-b15d-455eda48390e	1600	1700	\N	\N	2025-12-07 18:46:00
f1d0f69a-5c04-40d9-ad55-3e4c3966e880	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	6df2d72b-d742-4736-b1ff-d64ced1d2105	1700	1900	\N	Promociones: Hora Feliz	2025-12-11 18:18:00
96ded398-9fe3-4d80-94da-21a051cf8ffa	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	cc8e3460-0e76-4f30-a842-40a25d10d13b	1900	2000	\N	\N	2025-12-15 18:50:00
3d0df07a-ac8a-4e8f-a4a6-025df33e5531	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	68a28b36-2d52-4157-8d01-c5feb10ea76b	2000	2100	\N	\N	2025-12-19 18:22:00
8399eada-03dc-4132-95e4-d2cea37c46cb	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	e030c4bd-9fe6-4c45-94bc-f0fa700dbf5f	2100	2300	\N	Promociones: Hora Feliz	2025-12-23 18:54:00
58fee3df-2598-4fab-8f0c-793aa638a331	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	referral_qualified	\N	2300	2500	\N	Tu referido completo 5 viajes	2025-12-25 15:40:00
d596a8a1-55be-4df2-97b2-e547095f0c40	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	4f2616bf-e666-40cb-8a19-4146f11dac23	2500	2600	\N	\N	2025-12-27 18:26:00
7bc39919-17c3-43ba-b34e-eeaf5dbdfd28	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	237b68dc-77ca-453d-bae7-8f8217a676fb	2600	2700	\N	\N	2025-12-31 18:58:00
d44c6bb9-a2db-440a-87f6-e6bc26aaf862	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	a50db71c-6088-43b6-bcff-bd2cdce956b1	2700	2900	\N	Promociones: Hora Feliz	2026-01-04 18:30:00
f7a704bc-9978-412f-82a8-2b5ccb297d62	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	8f31e75b-78a2-4a02-89a3-1b1bc9871f7b	2900	3000	\N	\N	2026-01-08 18:02:00
cf52e1a7-2fd0-4471-bed9-5894b1da55e6	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	84b85e75-70b3-4cda-b24d-14997d37a87f	3000	3100	\N	\N	2026-01-12 18:34:00
a0b4d7d4-ad36-4b08-9d8d-57acd4c25364	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	21a6b72e-bf3a-4f3b-9d5a-c88a9940982c	3100	3300	\N	Promociones: Hora Feliz	2026-01-16 18:06:00
2d141c19-9b59-42b5-88cf-ad1174e3ceb4	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	be740078-9a4f-4857-846f-de3c75cc9581	3300	3400	\N	\N	2026-01-20 18:38:00
f4262a03-6573-4c53-ad7d-60d336d8e5ae	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	8a61f719-53fc-44bb-be11-f7cf22a9cf07	3400	3500	\N	\N	2026-01-24 18:10:00
fad0119b-4291-4f72-b496-c1a754b0925e	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	ab447657-39d2-41c5-a920-a2bbe7af77fc	3500	3700	\N	Promociones: Hora Feliz	2026-01-28 18:42:00
a02718c7-ee79-4053-968b-bdcc919ee9b9	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	228d6d15-81f1-4800-9502-f66369739ede	3700	3800	\N	\N	2026-02-01 18:14:00
4d1923e7-52dc-479e-b13f-fbfc5c258840	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	7d9118d3-f87f-40c8-9edb-82a117a17e7e	3800	3900	\N	\N	2026-02-05 18:46:00
3f124e88-c13e-4494-88ff-50dd29798f45	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	c622b2f1-6085-4e84-9cd2-2d3e196b69c8	3900	4100	\N	Promociones: Hora Feliz	2026-02-09 18:18:00
a144473b-304e-4d23-94fd-a1685c99635c	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	1a8e100b-44ab-4834-ab4c-9af1fc0c4978	4100	4200	\N	\N	2026-02-13 18:50:00
48fef700-ce3d-484a-80b4-a8c81f8cba29	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	4c048834-b062-421f-8349-35394e1aae0a	4200	4300	\N	\N	2026-02-17 18:22:00
6b789d5d-be51-482a-8ac3-9ca206f5c379	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	5b0b91f1-8cfb-43b0-a7cb-26fb63abd3b4	4300	4500	\N	Promociones: Hora Feliz	2026-02-21 18:54:00
05ffc165-6395-43fd-942b-71d3628c0bc1	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	b4299bb5-17c9-485c-9855-c59da4165d61	4500	4600	\N	\N	2026-02-25 18:26:00
4c730622-56a9-4b0b-9769-06421b4fe59e	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	9659d8c6-0665-4424-8966-3d24b6db9576	4600	4700	\N	\N	2026-03-01 18:58:00
876eff30-2576-4fab-8871-ba3bbac2a600	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	ef3e92a8-0838-415f-98d7-2ada892ef1c1	4700	4900	\N	Promociones: Hora Feliz	2026-03-05 18:30:00
669cde32-cda7-41e3-adff-a641f7d92276	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	150	streak	\N	4900	5050	\N	Racha de 7 dias seguidos	2026-03-06 02:30:00
bc89575d-c279-4e99-9be5-ec01d1842ef3	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	3a3a3d71-0b98-417b-bf53-499abc4b63c5	5050	5150	\N	\N	2026-03-09 18:02:00
19c68ddf-7218-4bab-b0d5-23429ec943a4	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	87e08711-b5b7-4161-9a12-20cf06c7b0df	5150	5250	\N	\N	2026-03-13 18:34:00
c32770c9-ea6a-40a6-bf5b-27e8ecfdfb0d	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	6682d785-7867-417e-aca1-9e4a8be4885d	5250	5450	\N	Promociones: Hora Feliz	2026-03-17 18:06:00
f821dad9-36a8-49fc-8944-80ef9c1faaaa	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	64a3249e-6a7f-44bc-a384-a6a84ca6c6b0	5450	5550	\N	\N	2026-03-21 18:38:00
a3739506-754c-4b3a-a9a4-8ac3e8d80a8d	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	4db0b915-600c-4e2d-ba72-c954c6f63237	5550	5650	\N	\N	2026-03-25 18:10:00
eb64f607-c4f1-4537-bc92-4e9409b268bd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	dde86bf0-d9f6-4fb2-8925-ec17d82399a6	5650	5850	\N	Promociones: Hora Feliz	2026-03-29 18:42:00
b751a1c6-9f67-406b-8d8b-87a0671a7855	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	bbe98037-9698-460e-964a-19e8b557f82e	5850	5950	\N	\N	2026-04-02 18:14:00
096bd4e3-c4a4-4378-bbc9-c42d8b4acd29	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	f16320d5-24b6-48cf-9497-d48e94f7e827	5950	6050	\N	\N	2026-04-06 18:46:00
92b82f78-14bd-4538-92cb-b58f9d57b3c0	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	1c2a3abf-9efd-4505-8b45-7c869a06959b	6050	6250	\N	Promociones: Hora Feliz	2026-04-10 18:18:00
48406d57-8bf7-4d87-b9cd-cf08520a2934	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	7aee5fc0-d5df-4f11-a1d1-3310853e63a6	6250	6350	\N	\N	2026-04-14 18:50:00
b8b51c8c-1675-451c-8378-18c1b4deba6b	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	f76b2bfa-fbfb-461a-ac85-b2a73529d81e	6350	6450	\N	\N	2026-04-18 18:22:00
9cd97620-6827-4412-a83c-9be5dd3f02a3	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	b8c737c3-20e2-4a46-896f-1eaf65fe8ee7	6450	6650	\N	Promociones: Hora Feliz	2026-04-22 18:54:00
31caa2c3-a38f-4baf-bb5c-963ef0992a4c	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	46418464-a09c-4fa6-84f5-7bb49a321297	6650	6750	\N	\N	2026-04-26 18:26:00
055b0e7d-2737-4aee-abc0-deed7ae6485c	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	6ee7a29d-7c23-4c0e-870e-7365fff54dd7	6750	6850	\N	\N	2026-04-30 18:58:00
c253a43a-d9e1-4aae-b566-63a7cbff38d7	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	06abfa50-f496-452d-b9fb-4387af3b2499	6850	7050	\N	Promociones: Hora Feliz	2026-05-04 18:30:00
d982116b-3cd0-40b5-870b-05cf49a4ac7f	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	redeem	500	catalog_redemption	\N	7050	6550	\N	S/. 2 de descuento	2026-05-04 20:30:00
263d5d20-c871-4fda-921a-6e3e68d584f1	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	4556c4be-0c91-4516-baa7-f490c0f21fab	6550	6650	\N	\N	2026-05-08 18:02:00
d56aa987-d86e-455d-b534-bac66172d25f	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	4c050260-7381-4d6e-8c5a-b893c9b5c84b	6650	6750	\N	\N	2026-05-12 18:34:00
760fe2ef-2695-4935-af2d-2016f9259d2e	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	0439e003-5d8b-457b-beef-08fb2fa584d5	6750	6950	\N	Promociones: Hora Feliz	2026-05-16 18:06:00
4b785086-6792-41f7-a6d3-4e04b6d0875f	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	059d8b97-7217-4089-8b66-7b127eeb253d	6950	7050	\N	\N	2026-05-20 18:38:00
b0669263-9369-4968-b637-1d32797f4857	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	f3b19cb9-2327-4aeb-bf1f-544ac17701ff	7050	7150	\N	\N	2026-05-24 18:10:00
93e25c1a-1e1e-4e7c-9710-ffb7cd34eb78	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	9e52dbda-2366-4504-8832-f38b09613082	7150	7350	\N	Promociones: Hora Feliz	2026-05-28 18:42:00
d4e8a6da-df97-4d01-8c90-e4850291928f	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	249d2926-8ab8-4bfc-af76-7d13a4480f9a	7350	7450	\N	\N	2026-06-01 18:14:00
e6ddf520-6d78-4a68-af41-7b39236c0a98	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	105557c9-cd0e-4403-8a1e-bd5aaeffb76d	7450	7550	\N	\N	2026-06-05 18:46:00
e5f961d1-b505-4204-b48c-dd4c7d7d300f	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	d57dc7eb-55cd-4d9d-8f1a-f4028e488aee	7550	7750	\N	Promociones: Hora Feliz	2026-06-09 18:18:00
452016e8-8e0c-4ea2-88b2-e87cc899872d	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	2e794b5f-87b8-438a-89e4-4666e8fb5a8b	7750	7850	\N	\N	2026-06-13 18:50:00
a06fd396-d4a9-45f5-b05f-36ca5ca97e58	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	639e63a4-cc88-4a30-bbfd-0942f5cb2920	7850	7950	\N	\N	2026-06-17 18:22:00
2b82f2c3-325a-474f-a30f-1eade9e16ffa	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	7034f81f-830b-46a7-8a3c-0b9550f95d63	7950	8150	\N	Promociones: Hora Feliz	2026-06-21 18:54:00
d09520f1-17e7-47cc-8ceb-9c404c43be4d	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	a7fe67b1-2375-414f-99cc-b9753ca39537	8150	8250	\N	\N	2026-06-25 18:26:00
23ca5dc9-f61d-4701-b607-2893529ecb55	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	a6d5d6eb-9d78-4294-a7ab-c28fcc90372a	8250	8350	\N	\N	2026-06-29 18:58:00
9587968d-96a8-4a3e-9921-f127fe0f8e9a	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	089f8d08-e1d0-41ba-a7bf-bc49a5b373e8	8350	8550	\N	Promociones: Hora Feliz	2026-07-03 18:30:00
575e94c8-3a28-414c-b84c-f0710c6b7a7f	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	redeem	1000	catalog_redemption	\N	8550	7550	\N	Viaje gratis hasta S/. 8	2026-07-03 20:30:00
7292a2ad-8ddb-43b8-9143-855afe3ac900	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	182061a7-2171-49a8-ac58-3eb1a6cf9078	7550	7650	\N	\N	2026-07-07 18:02:00
d4e34d0c-98b8-4af4-b228-dd1f82f85a75	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	f2eefd02-41e6-4c18-839a-c183cd4b9e56	7650	7750	\N	\N	2026-07-11 18:34:00
ccfc50c1-f39a-4995-945c-257fb61a5663	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	2c44d8f4-206b-4892-adb9-42298f7d67fb	7750	7950	\N	Promociones: Hora Feliz	2026-07-15 18:06:00
1305659e-a7c1-4509-bf85-b3abba1abb1a	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	75f7245d-d1c0-4e90-8c35-288d4d2b22d1	7950	8050	\N	\N	2026-07-19 18:38:00
d398de41-798d-46c4-b1a8-f13e23c691d8	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	becfdd2c-e462-447f-9263-da5893331258	8050	8150	\N	\N	2026-07-23 18:10:00
e5e1abac-01f1-4411-9d89-38b291e9588b	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	66167425-cb2e-4060-8d5d-06528bb1b8a6	8150	8350	\N	Promociones: Hora Feliz	2026-07-27 18:42:00
dc6c5dcc-4172-4eac-9ff7-d120611412bd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	8db30f0b-901d-472a-a9d5-63d026217ce1	8350	8450	\N	\N	2026-07-31 18:14:00
dbaa1275-795f-4ef4-b921-3c31ebf253ac	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	redeem	5000	catalog_redemption	\N	8450	3450	\N	1 ticket extra de sorteo mensual	2026-08-02 20:00:00
bd44dc5c-5f00-4e0a-97ab-fd2d5b939959	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	b7930245-ddf4-450f-ae19-c9eb1ce83eaa	3450	3550	\N	\N	2026-08-04 18:46:00
984c426f-c125-4e5d-bff4-3a6c192a2301	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	200	trip_completed	03a7928c-b579-4aa7-9b60-d2dd40c367f0	3550	3750	\N	Promociones: Hora Feliz	2026-08-08 18:18:00
83666b1b-6517-447f-bec8-a67bb04e61a2	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	expire	1200	points_expired	\N	3750	2550	\N	Puntos vencidos por inactividad	2026-08-18 12:08:00
72e31abc-6841-4281-a49a-7a170a1821f9	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	50	rating	b7637c8b-c0c6-42c6-93a6-4664b03be595	2550	2600	\N	Calificaste tu viaje con 5 estrellas	2026-09-01 23:30:00
00bae9c4-fb28-482e-9c27-a8aa0ed943b7	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	150	trip_completed	6b9c0b8d-e466-48a1-a20e-58df030ca30d	2600	2750	\N	Promociones: Pago con Yape o Plin	2026-09-19 17:24:00
14c6d0c2-2345-4a8e-8682-220fe5265aef	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	150	trip_completed	16608834-9302-452d-b4e8-a65b6e4add1e	2750	2900	\N	Promociones: Pago con Yape o Plin	2026-09-22 17:03:00
434d2861-04a9-4c31-8d67-f0ed3ce407c5	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	150	trip_completed	b93819db-cd65-461a-b85c-7cda8b6beeeb	2900	3050	\N	Promociones: Pago con Yape o Plin	2026-09-25 17:42:00
daa8393b-8a8e-4d45-be8b-646587d247bc	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	150	trip_completed	80d9144d-dda2-4bd2-8219-d2b44e238ebf	3050	3200	\N	Promociones: Pago con Yape o Plin	2026-09-28 17:21:00
2b1d8b8e-9eb5-4184-9153-5bc24d963bbf	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	earn	100	trip_completed	0ba22d67-8689-40e4-8a12-ac5c8b5e50aa	3200	3300	\N	\N	2026-09-30 00:14:00
\.


--
-- Data for Name: promotionapplications; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.promotionapplications (id, promotionid, profileid, tripid, pointsadded, createdat) FROM stdin;
\.


--
-- Data for Name: promotions; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.promotions (id, name, description, promotiontype, targetusertype, multipliervalue, bonuspoints, startdate, enddate, conditionsjson, isactive, createdat, updatedat) FROM stdin;
4a8dfacf-7920-44f2-8a3f-718b40ad0bea	Hora Feliz	Doble de puntos de lunes a viernes, de 12 a 2 de la tarde.	multiplier	passenger	2.00	\N	2026-10-01 02:21:57.592672	\N	{"daysOfWeek":[1,2,3,4,5],"startHour":12,"endHour":14}	f	2026-10-01 02:21:57.592672	2026-10-01 02:21:57.592672
10448168-8fba-46f2-bf06-25e01e18c9d4	Primer viaje del día	Puntos extra en el primer viaje de cada día. Se suma a la promoción de día u hora que esté activa.	bonus_points	passenger	\N	50	2026-10-01 02:21:57.592672	\N	{"firstTripOfDay":true}	f	2026-10-01 02:21:57.592672	2026-10-01 02:21:57.592672
305ac9f2-c8b0-4e14-8c2d-11fd765bee2e	Pago con Yape o Plin	Puntos extra por pagar de forma digital. Se suma a lo que haya en ese momento.	bonus_points	both	\N	50	2026-10-01 02:21:57.592672	\N	{"paymentMethods":["yape","plin"]}	f	2026-10-01 02:21:57.592672	2026-10-01 02:21:57.592672
e18a46ac-69ee-4b7e-be33-68d86de5fdea	Fin de semana Bugie	Puntos y medio los sábados y domingos.	multiplier	passenger	1.50	\N	2026-10-01 02:21:57.592672	\N	{"daysOfWeek":[6,7]}	f	2026-10-01 02:21:57.592672	2026-10-01 02:21:57.592672
56f7f688-81aa-4bb0-8070-e8e8f463c9fb	[demo] Hora Feliz	Doble de puntos de lunes a viernes al mediodia.	multiplier	passenger	2.00	\N	2026-08-02 17:00:00	\N	{"daysOfWeek":[1,2,3,4,5],"startHour":12,"endHour":14}	t	2026-08-02 17:00:00	2026-08-02 17:00:00
53f45836-0929-475e-a58e-c0428206463c	[demo] Pago con Yape o Plin	Puntos extra por pagar de forma digital.	bonus_points	both	\N	50	2026-08-17 17:00:00	\N	{"paymentMethods":["yape","plin"]}	t	2026-08-17 17:00:00	2026-08-17 17:00:00
4996bb42-9fe9-41b6-b15a-eb7fa7db32ed	[demo] Fin de semana Bugie	Puntos y medio los sabados y domingos. Apagada a proposito.	multiplier	passenger	1.50	\N	2026-09-01 17:00:00	\N	{"daysOfWeek":[6,7]}	f	2026-09-01 17:00:00	2026-09-01 17:00:00
\.


--
-- Data for Name: raffles; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.raffles (id, name, raffletype, prizedescription, prizevalue, drawdate, minlevelrequired, minmonthsactive, targetusertype, winnerscount, status, drawseed, drawnat, ticketsatdraw, createdat, updatedat) FROM stdin;
580f360d-63e5-4e24-8ecf-80ac68f329fc	Sorteo semanal	weekly	S/ 100 en premios	100.00	2026-10-03 06:00:00	gold	\N	both	1	open	\N	\N	\N	2026-10-01 03:34:00.352962	2026-10-01 03:34:00.352962
fe81d5ec-cf4f-4de0-8b2d-a5dd522ee924	Sorteo mensual	monthly	Smartphone o tablet para el primer puesto. Del segundo al cuarto, S/ 300 en premios.	800.00	2026-11-01 06:00:00	\N	\N	both	4	open	\N	\N	\N	2026-10-01 03:34:00.352962	2026-10-01 03:34:00.352962
8d5c2a88-b271-42b8-984c-c078f043a2b8	Sorteo especial de Navidad	special	Gran premio de fin de año.	5000.00	2026-12-26 06:00:00	\N	6	both	1	open	\N	\N	\N	2026-10-01 03:34:00.352962	2026-10-01 03:34:31.657669
39f7a2e3-8599-47bc-9149-3bbbb497961f	[demo] Sorteo semanal	weekly	S/ 100 en premios	100.00	2026-10-04 17:00:00	gold	\N	both	1	open	\N	\N	\N	2026-09-27 17:00:00	2026-09-27 17:00:00
1274abe4-16a8-4b74-b944-27771532708d	[demo] Sorteo mensual de octubre	monthly	Smartphone para el primer puesto. Del segundo al cuarto, S/ 300 en premios.	800.00	2026-10-31 17:00:00	\N	\N	both	4	open	\N	\N	\N	2026-09-30 17:00:00	2026-09-30 17:00:00
0401d408-1f2d-41e7-894f-e3090c382046	[demo] Sorteo de setiembre	monthly	Tablet	600.00	2026-09-30 13:00:00	\N	\N	both	1	drawn	A1B2C3D4E5F60718	2026-09-30 13:00:00	31	2026-08-31 17:00:00	2026-09-30 13:00:00
\.


--
-- Data for Name: raffletickets; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.raffletickets (id, raffleid, userid, profileid, ticketnumber, source, referenceid, createdat) FROM stdin;
03b8e6bf-f55e-48f8-b3f4-16cd980584de	39f7a2e3-8599-47bc-9149-3bbbb497961f	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000001	level_benefit	\N	2026-09-27 17:00:00
c0e28c67-4ccd-4bb1-bb35-2a0d096adce5	39f7a2e3-8599-47bc-9149-3bbbb497961f	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000002	level_benefit	\N	2026-09-27 17:00:00
e1be3471-3738-4522-8e79-52e4a3761ae8	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000003	level_benefit	\N	2026-09-30 17:00:00
d5ca4503-8d68-4e16-a863-209238bec65c	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000004	level_benefit	\N	2026-09-30 17:00:00
f1f13e9a-b2f3-451f-972d-146061bd9b5e	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000005	level_benefit	\N	2026-09-30 17:00:00
637b4e95-e448-4698-bc9d-db2e0e113d32	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000006	level_benefit	\N	2026-09-30 17:00:00
4833ea65-4cbb-4b19-953c-d64ec0a3674b	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000007	level_benefit	\N	2026-09-30 17:00:00
aac72ddc-b038-48f6-a85f-2beb81e8b1cc	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000008	monthly_points	\N	2026-09-30 17:00:00
1a44ed6c-a300-43da-ac05-4915958bfe05	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000009	monthly_points	\N	2026-09-30 17:00:00
4d2a1e29-c3c3-4ba1-b7a1-76f6b4202ea2	1274abe4-16a8-4b74-b944-27771532708d	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000010	monthly_points	\N	2026-09-30 17:00:00
6a99d7e3-5c5c-47d0-88bb-be20f0ccdebb	1274abe4-16a8-4b74-b944-27771532708d	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000011	level_benefit	\N	2026-09-30 17:00:00
d5918a4d-99a6-4493-ab4d-0f9c93df2dbc	1274abe4-16a8-4b74-b944-27771532708d	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000012	level_benefit	\N	2026-09-30 17:00:00
0380f149-582e-496c-9f30-59776b3f2804	1274abe4-16a8-4b74-b944-27771532708d	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000013	level_benefit	\N	2026-09-30 17:00:00
864828a9-0bce-46aa-ba31-dea98f079e61	1274abe4-16a8-4b74-b944-27771532708d	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000014	points_redemption	\N	2026-09-30 17:00:00
1c78498e-b6d4-425e-9481-2630273a4cb3	0401d408-1f2d-41e7-894f-e3090c382046	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000015	level_benefit	\N	2026-09-06 17:00:00
e5e6d4d8-e5ce-45a6-87a2-f582796428bc	0401d408-1f2d-41e7-894f-e3090c382046	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000016	level_benefit	\N	2026-09-06 17:00:00
478bf5ff-6345-470d-aa9c-6c753ad05600	0401d408-1f2d-41e7-894f-e3090c382046	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000017	level_benefit	\N	2026-09-06 17:00:00
fdf8ffe5-2791-47aa-99b5-f2757039a027	0401d408-1f2d-41e7-894f-e3090c382046	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000018	level_benefit	\N	2026-09-06 17:00:00
9cc7c3a0-eaef-4ad2-843d-4e62d042ff6c	0401d408-1f2d-41e7-894f-e3090c382046	3b33c255-70d2-401e-a76e-da1540155ec4	03a67e97-9985-4265-84c0-d3fceb04ac14	BG-000019	level_benefit	\N	2026-09-06 17:00:00
d0265346-fdf1-4b79-b003-a95f7d635a22	0401d408-1f2d-41e7-894f-e3090c382046	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000020	level_benefit	\N	2026-09-06 17:00:00
5c853884-f5e3-4655-86af-f74e6280e661	0401d408-1f2d-41e7-894f-e3090c382046	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000021	level_benefit	\N	2026-09-06 17:00:00
ce15d99d-1efc-4a2d-ab10-2e47b6902426	0401d408-1f2d-41e7-894f-e3090c382046	05b9d66f-8441-45b4-bdc1-d418a807dddd	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	BG-000022	level_benefit	\N	2026-09-06 17:00:00
\.


--
-- Data for Name: rafflewinners; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.rafflewinners (id, raffleid, userid, ticketnumber, prizerank, prizedetail, status, deliveredat, deliveredby, note, createdat) FROM stdin;
f4d0077e-b3a5-4b62-81c3-a9aba4a91769	0401d408-1f2d-41e7-894f-e3090c382046	3b33c255-70d2-401e-a76e-da1540155ec4	BG-000015	1	Tablet	pending	\N	\N	\N	2026-09-30 13:00:00
\.


--
-- Data for Name: redemptions; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.redemptions (id, profileid, userid, catalogitemid, code, itemname, pointsspent, rewardtype, amountsoles, quantity, percentage, status, expiresat, usedat, usedreferenceid, usednote, createdat) FROM stdin;
51ce9ad4-2ad7-4c9a-9e75-9c87ff1f1b64	03a67e97-9985-4265-84c0-d3fceb04ac14	3b33c255-70d2-401e-a76e-da1540155ec4	eb632b65-ce0a-4168-90c7-1f46b49f6ff0	BG-4K7M2P	Seguro vehicular mensual	7500	partner_benefit	\N	\N	\N	active	2026-10-19 17:00:00	\N	\N	\N	2026-09-19 17:00:00
b57a2141-6532-4085-8804-5dc9b3ef52db	03a67e97-9985-4265-84c0-d3fceb04ac14	3b33c255-70d2-401e-a76e-da1540155ec4	fd410fdd-0e20-4228-87f2-027e598fd904	BG-2M8WKD	Bono de S/. 5	500	wallet_bonus	5.00	\N	\N	expired	2026-08-04 17:00:00	\N	\N	\N	2026-07-05 17:00:00
fce34640-5d31-413b-be96-ffb6b6e88b26	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	05b9d66f-8441-45b4-bdc1-d418a807dddd	717ee670-1b81-4f04-90e1-ba9f3ba88965	BG-7J4NVB	S/. 2 de descuento	500	discount_amount	2.00	\N	\N	active	2026-10-10 17:00:00	\N	\N	\N	2026-09-10 17:00:00
784ee7d4-fd34-4ed2-8207-91a9d2e68282	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	05b9d66f-8441-45b4-bdc1-d418a807dddd	f703c5a8-e191-4643-991d-bbd2088eb7b8	BG-8T6ZPN	1 ticket extra de sorteo mensual	5000	raffle_ticket	\N	1	\N	active	2026-10-30 17:00:00	\N	\N	\N	2026-08-02 17:00:00
02b4d263-c343-4c07-a38f-5cdc653c77a4	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	05b9d66f-8441-45b4-bdc1-d418a807dddd	717ee670-1b81-4f04-90e1-ba9f3ba88965	BG-3Q9LMX	S/. 2 de descuento	500	discount_amount	2.00	\N	\N	cancelled	2026-10-05 17:00:00	\N	\N	\N	2026-09-05 17:00:00
a283e615-8fd2-4921-bf56-88adb72ad5e3	03a67e97-9985-4265-84c0-d3fceb04ac14	3b33c255-70d2-401e-a76e-da1540155ec4	9573fa14-f2ae-4e15-91b3-e5aa76a0a70d	BG-9X3TQR	Bono de S/. 15	1250	wallet_bonus	15.00	\N	\N	used	2026-09-11 17:00:00	2026-08-27 17:00:00	\N	Pagado por Yape el 27/08, operacion 88213	2026-08-12 17:00:00
ddcfd2ee-a8d3-4cf9-91ac-66356148cd08	fb8993ca-a667-49f9-a5c1-e38ec3a669a7	05b9d66f-8441-45b4-bdc1-d418a807dddd	29ffc5e6-c8ca-4768-b8eb-3cc7c2eb3b8b	BG-5R2HFC	Viaje gratis hasta S/. 8	1000	free_trip	8.00	\N	\N	used	2026-08-02 17:00:00	2026-07-19 17:00:00	\N	Aplicado al viaje	2026-07-03 17:00:00
\.


--
-- Data for Name: referralcodes; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.referralcodes (id, userid, code, createdat) FROM stdin;
9fc4eda9-5131-4e18-9853-df47b71988d5	3b33c255-70d2-401e-a76e-da1540155ec4	OLV4K7MP	2026-07-13 17:00:00
8a04d8d6-f838-4c03-89ff-2121d3a957a0	05b9d66f-8441-45b4-bdc1-d418a807dddd	ARI9X3TQ	2025-11-25 17:00:00
\.


--
-- Data for Name: referralinvitations; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.referralinvitations (id, referreruserid, email, code, sentat, acceptedat) FROM stdin;
e9561026-3738-4cd8-9574-24af6e6adfd8	3b33c255-70d2-401e-a76e-da1540155ec4	amigo.sin.registrar@correo.pe	OLV4K7MP	2026-09-16 17:00:00	\N
8aad5d41-d56a-49ab-a09c-c749d443bbe5	3b33c255-70d2-401e-a76e-da1540155ec4	ghaluix@gmal.com	OLV4K7MP	2026-10-01 21:04:01.667028	\N
a1e443b7-025f-4fe5-a72b-ffec9e01a8a2	3b33c255-70d2-401e-a76e-da1540155ec4	ghaluix@gmaio.com	OLV4K7MP	2026-10-01 21:17:11.638976	\N
5823c7f6-b5c1-4680-9544-a120d50c69d4	3b33c255-70d2-401e-a76e-da1540155ec4	ghaluix@gmail.com	OLV4K7MP	2026-10-01 21:18:15.195586	\N
435e75a8-d55e-4dd3-bd0e-a541b78576b6	3b33c255-70d2-401e-a76e-da1540155ec4	ghaluix1@gmail.com	OLV4K7MP	2026-07-21 17:00:00	2026-07-23 17:00:00
20c97e10-e1c7-4faf-84b9-ea906bd764af	05b9d66f-8441-45b4-bdc1-d418a807dddd	ghaluix2@gmail.com	ARI9X3TQ	2025-12-03 17:00:00	2025-12-05 17:00:00
\.


--
-- Data for Name: referrals; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.referrals (id, referreruserid, referreduserid, referredusertype, code, status, tripscompleted, signuppoints, qualifypoints, createdat, qualifiedat) FROM stdin;
2447136a-5707-4aed-bc99-815fe9fc68d0	3b33c255-70d2-401e-a76e-da1540155ec4	f1e64012-7713-45b4-bff2-33b45d3abfd4	passenger	OLV4K7MP	pending	2	375	0	2026-08-22 17:00:00	\N
bb675191-d124-49e4-9e8f-2073b9018224	3b33c255-70d2-401e-a76e-da1540155ec4	a0160a2d-94d1-454e-bfa8-45945535a063	passenger	OLV4K7MP	qualified	7	375	200	2026-07-23 17:00:00	2026-09-13 17:00:00
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: rewards; Owner: postgres
--

COPY rewards.settings (id, settingkey, value, description, updatedat, updatedby) FROM stdin;
74d09bbe-6e00-4225-86c6-d193d90ec4a6	points_enabled	true	Activa o desactiva todo el motor de puntos	2026-09-16 01:49:09.626204	\N
4993c4e9-ab17-4599-96d6-215541092f28	points_rate_passenger	10	Puntos que gana el pasajero por cada S/. 1 del viaje	2026-09-16 01:49:09.626204	\N
4173e171-2b11-4986-9d62-0c4d678fb7d0	points_rate_driver	5	Puntos que gana el conductor por cada S/. 1 del viaje	2026-09-16 01:49:09.626204	\N
9da59ac9-8c1a-4cfc-a66a-a0008995d640	points_expiry_months_passenger	12	Meses de vigencia de los puntos del pasajero	2026-09-16 01:49:09.626204	\N
824b663e-8c27-4f8d-bc90-54a882f894fd	points_expiry_months_driver	12	Meses de vigencia de los puntos del conductor	2026-09-16 01:49:09.626204	\N
a536b67a-b376-4dca-95ed-1f887364110b	points_level_basis	total	Base para calcular el nivel: total (historico) o available (saldo)	2026-09-16 01:49:09.626204	\N
1c4e1495-4bba-4141-865f-31e0eb9b39dd	redemption_enabled	true	Permite o bloquea el canje de puntos	2026-09-16 10:45:02.160732	\N
6eb46d19-5731-4cc3-a8eb-d039220bc8c5	points_expiry_enabled	true	Activa el vencimiento automatico de puntos	2026-09-21 01:48:00.725053	\N
ff0b140e-0ecc-49f1-99f0-f8a1aeea2f9c	points_expiry_warning_days	30,7,1	Dias de anticipacion de los avisos push, separados por coma. Ej: 30,7,1	2026-09-21 01:48:10.155698	\N
f769b9d2-295b-4d91-a169-154dc0515b95	promotions_enabled	true	Activa o desactiva todas las promociones de una vez	2026-10-01 02:21:57.592672	\N
a806d3b2-65a1-4f89-ac1d-ab028a8da6e7	timezone_offset_hours	-5	Horas de diferencia con UTC para evaluar días y franjas horarias. Perú es -5	2026-10-01 02:21:57.592672	\N
a55f200b-6cee-4721-92d6-8a02b674df03	raffles_enabled	true	Activa el reparto de tickets y el sorteo automatico	2026-10-01 03:14:23.038089	\N
035aa304-d80c-494e-a508-fc59a5151cb0	raffle_points_per_ticket	500	Puntos ganados en el mes que dan un ticket extra. 0 lo desactiva	2026-10-01 03:14:23.038089	\N
427aaf21-2325-4ebb-bcfc-875d85105402	referrals_enabled	true	Activa el programa de referidos	2026-10-01 04:07:53.30164	\N
a55aea8a-832a-468f-8321-9edbe044a815	referral_points_passenger	500	Puntos para quien refiere, cuando el referido es pasajero	2026-10-01 04:07:53.30164	\N
64134ec7-dbbb-4d96-b68a-15fec5678c65	referral_points_driver	375	Puntos para quien refiere, cuando el referido es conductor	2026-10-01 04:07:53.30164	\N
8a6f3f75-6a14-43ad-8cfc-72c0ee657a9d	referral_qualify_trips	5	Viajes que debe completar el referido para el bono extra. 0 lo desactiva	2026-10-01 04:07:53.30164	\N
eb20ad67-e516-4ff9-803c-287616cfc34a	referral_qualify_points	200	Bono extra cuando el referido llega a esa cantidad de viajes	2026-10-01 04:07:53.30164	\N
86cece4d-e448-466b-9668-e30ee759bc53	streak_days	7	Dias seguidos viajando para ganar el bono de racha. 0 lo desactiva	2026-10-01 10:35:11.868499	\N
2800b398-94cd-459e-8e72-967e1a25a620	streak_points	150	Puntos al completar la racha. Se vuelve a pagar en cada bloque de dias	2026-10-01 10:35:11.868499	\N
50df6382-3efd-456b-ba39-2404bf5606a6	weekly_goal_trips_passenger	0	Viajes a la semana que debe hacer un pasajero para el bono. 0 lo desactiva	2026-10-01 10:35:11.868499	\N
2be52617-0e70-40e7-9b1a-ffd091176288	weekly_goal_trips_driver	50	Servicios a la semana que debe completar un conductor para el bono	2026-10-01 10:35:11.868499	\N
548007dd-1722-4b4c-a2c9-241b387a8b56	weekly_goal_points	200	Puntos al alcanzar la meta semanal	2026-10-01 10:35:11.868499	\N
c5ac8f64-3808-4592-983c-4b32ba0fea65	anniversary_multiplier	3	Multiplicador de puntos durante el mes de aniversario del usuario. 1 lo desactiva	2026-10-01 10:35:11.868499	\N
8d63810c-b0ad-4d2a-ac7e-195a5571264c	coupons_apply_to_fare	false	Permite aplicar cupones de descuento al precio de un viaje. Apagado, los cupones solo se acumulan	2026-10-01 17:18:10.018701	\N
8aff4a68-0892-4a5a-8eda-25bb59128b30	no_cancel_min_trips	3	Viajes que debe completar el conductor en el dia para optar al bono. 0 desactiva la regla	2026-10-01 18:03:58.29376	\N
71ce6763-8186-4e86-b063-e9401f2dd483	no_cancel_points	100	Puntos del bono diario por trabajar sin cancelar	2026-10-01 18:03:58.29376	\N
\.


--
-- Data for Name: favoriteaddresses; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.favoriteaddresses (id, passengerid, label, icon, address, lat, lng, sortorder, createdat, description) FROM stdin;
1244c04c-345f-444b-bf71-b23d27406e48	05b9d66f-8441-45b4-bdc1-d418a807dddd	casa	home	475, Jirón Colón	-8.108054	-79.025004	0	2026-07-12 00:11:56.830712	errr
7a4d3491-1c59-48cd-aacd-c9f6c5953cfc	05b9d66f-8441-45b4-bdc1-d418a807dddd	casa34	home	Los Guayabos, Capanique	-18.012015	-70.225571	1	2026-07-12 00:29:17.836158	ffff
0e8d11d9-17c6-402b-8e82-3d69e2de885d	05b9d66f-8441-45b4-bdc1-d418a807dddd	casa37	school	345, Avenida Gustavo Pinto	-18.002893	-70.243313	2	2026-07-13 02:30:46.11703	\N
\.


--
-- Data for Name: favoritedrivers; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.favoritedrivers (passengerid, driveruserid, createdat) FROM stdin;
05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	2026-07-13 02:30:47.265949
\.


--
-- Data for Name: incidents; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.incidents (id, tripid, reportedbyuserid, reportedbyrole, description, createdat) FROM stdin;
aa80c038-2541-44b7-bfcd-90a6a43b3c8b	415d44e9-bf79-4e4e-a802-0bfb9820747c	3b33c255-70d2-401e-a76e-da1540155ec4	driver	ddfff	2026-05-28 05:43:38.106667
\.


--
-- Data for Name: outboxevents; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.outboxevents (id, eventtype, payloadjson, status, attempts, lasterror, createdat, sentat) FROM stdin;
\.


--
-- Data for Name: passengeracceptancecancellations; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.passengeracceptancecancellations (id, tripid, proposalid, passengerid, canceledat) FROM stdin;
\.


--
-- Data for Name: sosalerts; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.sosalerts (id, tripid, userid, userrole, lat, lng, resolved, resolvedby, createdat, resolvedat, resolutionreason) FROM stdin;
db54b5ce-0b42-4c0c-b80c-36dd4b21cdc4	75b7d0dc-78d0-49c0-b088-3cfbd83cfb8a	3b33c255-70d2-401e-a76e-da1540155ec4	driver	-18.0120538	-70.2255938	t	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-26 23:05:05.076667	2026-05-28 00:36:21.73	error de pasajero
b769fb5e-fbc6-4b65-93ec-f6af1319ea8a	678dbf15-4a85-418c-9489-601f451ee9ee	a0160a2d-94d1-454e-bfa8-45945535a063	passenger	-18.0120436	-70.2255817	t	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-30 03:52:25.35	2026-05-29 22:54:51.987376	qwerty
bfc3ec0d-48e0-4494-916f-5a0f28a1057d	678dbf15-4a85-418c-9489-601f451ee9ee	a0160a2d-94d1-454e-bfa8-45945535a063	passenger	-18.0120284	-70.2255973	t	10b700cb-5890-44a0-8cb4-561af63e2cc0	2026-05-30 04:05:56.66	2026-07-11 20:43:42.718606	error
\.


--
-- Data for Name: tripphotos; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.tripphotos (id, tripid, url, kind, uploadedby, createdat) FROM stdin;
a70c1923-5bb3-47df-a17c-e1841378620f	44f6bd64-9466-4b6c-963e-bf51526d4109	/uploads/trips/44f6bd64-9466-4b6c-963e-bf51526d4109/package/53b6b9bcec1b447ca7362267c1dddec9_scaled_1000223288.jpg	0	05b9d66f-8441-45b4-bdc1-d418a807dddd	2026-07-11 18:34:26.699326-05
94f5901f-77b9-4171-9599-3c8df02de4a7	44f6bd64-9466-4b6c-963e-bf51526d4109	/uploads/trips/44f6bd64-9466-4b6c-963e-bf51526d4109/pickup/e9146c62157b43368cac81cfb3845f5c_scaled_8f539b38-838b-48db-a732-763ff1d832f7585237840107741292.jpg	1	31e89885-cc6e-4097-af16-c8558a760474	2026-07-11 18:48:04.609797-05
9a19bc9e-d8b1-4cf9-a15a-b7f01a5a4e46	44f6bd64-9466-4b6c-963e-bf51526d4109	/uploads/trips/44f6bd64-9466-4b6c-963e-bf51526d4109/pickup/7ac4e95c67924d9889257212bce9fc70_scaled_Screenshot_20260710-135748.png	2	31e89885-cc6e-4097-af16-c8558a760474	2026-07-11 18:48:04.615436-05
\.


--
-- Data for Name: tripproposals; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.tripproposals (id, tripid, driverid, fare, status, createdat, proposedbyrole, rejectedby) FROM stdin;
67a2e723-4954-487c-82b4-0100e6ffe67a	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-18 00:08:53.123333	driver	\N
8e95869f-c608-463c-9886-0902fa8e4ffc	678dbf15-4a85-418c-9489-601f451ee9ee	3b33c255-70d2-401e-a76e-da1540155ec4	15.00	pending	2026-05-30 03:46:42.65	driver	\N
23a3c0b9-082f-434c-9b3c-0b61ec186880	b35df0ad-641c-4a5c-a259-756c9bd1f070	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	accepted	2026-05-23 20:55:41.243333	driver	\N
3b25aad7-1e7e-46c6-84df-247059fc932b	b35df0ad-641c-4a5c-a259-756c9bd1f070	7ec78cab-0e66-4104-abc1-2506cab83499	9.00	superseded	2026-05-23 20:54:09.61	driver	\N
611203bf-bc3c-437e-b024-31706e1a8402	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-20 17:07:43.856667	driver	\N
21b096f9-7659-41f3-9093-3a8ec3ce228a	678dbf15-4a85-418c-9489-601f451ee9ee	3b33c255-70d2-401e-a76e-da1540155ec4	11.00	superseded	2026-05-28 08:34:40.483333	driver	\N
861bfca8-75c2-4567-8126-4277544867d1	02abada3-586c-45bf-886c-71b6a32ac9e4	3b33c255-70d2-401e-a76e-da1540155ec4	10.00	pending	2026-05-28 08:32:51.533333	driver	\N
503a73f2-03e9-4228-81bb-5620fe6f9ca5	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	8.00	superseded	2026-05-20 19:20:52.3	driver	\N
4ff1ac55-ab91-4cf0-b8f6-5ae341fd7c0f	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	rejected	2026-05-20 17:08:08.803333	passenger	driver
b86d1870-d83b-4d26-a8b7-5c6da3713a41	5cf9e4da-d6b0-4a61-8924-3f90920b0cf8	7ec78cab-0e66-4104-abc1-2506cab83499	12.00	superseded	2026-05-17 20:34:26.913333	driver	\N
4ac4650a-7349-4d4e-97d8-5feaa5b78cc9	678dbf15-4a85-418c-9489-601f451ee9ee	3b33c255-70d2-401e-a76e-da1540155ec4	11.00	superseded	2026-05-28 08:33:38.913333	passenger	\N
09ca1bc0-a225-4581-a1d3-6154d4c1a130	415d44e9-bf79-4e4e-a802-0bfb9820747c	3b33c255-70d2-401e-a76e-da1540155ec4	9.00	superseded	2026-05-26 06:15:18.226667	passenger	\N
4289fc25-8f65-49b0-beb7-64de66a6a296	02abada3-586c-45bf-886c-71b6a32ac9e4	3b33c255-70d2-401e-a76e-da1540155ec4	8.00	superseded	2026-05-23 06:15:23.81	driver	\N
8dbd2a10-14bc-4a3f-bfbe-689d58f3818a	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	8.00	superseded	2026-05-20 17:06:25.463333	driver	\N
c126d4eb-0a54-4b28-817e-6cbb886968d6	03483e92-934d-40bb-a946-7b863370aa31	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	accepted	2026-05-17 22:46:20.99	passenger	\N
35ddfb9a-5508-4615-8f20-6e6ab8e3194d	415d44e9-bf79-4e4e-a802-0bfb9820747c	3b33c255-70d2-401e-a76e-da1540155ec4	10.00	accepted	2026-05-26 06:17:19.313333	driver	\N
a2f51773-194b-4838-9b88-6eb2369f7f78	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	9.00	rejected	2026-05-20 18:33:24.323333	driver	passenger
a6d95e2b-a820-4e4e-a368-732438953651	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-20 17:10:31.416667	passenger	\N
99528816-7cff-43ce-b090-7be827d0caeb	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	8.00	superseded	2026-05-20 15:53:25.936667	passenger	\N
6f69c127-f9d8-49a9-b567-7c2ac25c4f3a	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-20 17:09:42.466667	driver	\N
cfd69f6b-d3ef-4cf0-bb28-848ca16269a5	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	9.00	superseded	2026-05-18 00:09:26.23	passenger	\N
0743c82a-ba43-40c4-bdac-89f197eefa82	415d44e9-bf79-4e4e-a802-0bfb9820747c	3b33c255-70d2-401e-a76e-da1540155ec4	10.00	superseded	2026-05-26 06:14:54.013333	driver	\N
4f254c09-c560-41e3-8e66-8e9c1d6da156	75b7d0dc-78d0-49c0-b088-3cfbd83cfb8a	3b33c255-70d2-401e-a76e-da1540155ec4	20.00	accepted	2026-05-26 16:49:01.993333	driver	\N
f9ddcf84-183c-456e-a1fb-9f7cfc51c6dd	03483e92-934d-40bb-a946-7b863370aa31	7ec78cab-0e66-4104-abc1-2506cab83499	12.00	superseded	2026-05-17 20:37:25.206667	driver	\N
543d09dd-72ca-4d98-8828-a9f2b246964b	5cf9e4da-d6b0-4a61-8924-3f90920b0cf8	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	accepted	2026-05-17 20:34:43.52	driver	\N
790a0b15-5414-429d-8041-aba05b78523d	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-20 18:48:35.903333	driver	\N
b35594b7-e880-4cfc-aab2-b6d48108d8c7	47008ca1-b614-4789-bc38-368944749eb3	7ec78cab-0e66-4104-abc1-2506cab83499	8.00	superseded	2026-05-17 07:42:47.303333	driver	\N
0c93a92b-989b-42de-b1a9-b960bb64f364	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-20 16:08:10.673333	driver	\N
c0b22db7-6679-4c10-aaae-bb57f95bc58b	02abada3-586c-45bf-886c-71b6a32ac9e4	3b33c255-70d2-401e-a76e-da1540155ec4	7.00	rejected	2026-05-23 06:16:37.266667	passenger	driver
fb8051ab-bb1e-408c-be6f-bf28a7f358d9	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	rejected	2026-05-20 16:08:30.74	driver	passenger
c8dadc5e-92fb-4b1f-9fb9-c3e853c4a5e7	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	9.00	superseded	2026-05-20 18:48:57.313333	passenger	\N
c1a9ccb9-4937-42e6-bf10-ce3582e2d139	b35df0ad-641c-4a5c-a259-756c9bd1f070	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-23 20:54:36.593333	passenger	\N
db6238e8-36f0-427e-8eb4-cf84adb033df	678dbf15-4a85-418c-9489-601f451ee9ee	3b33c255-70d2-401e-a76e-da1540155ec4	12.00	superseded	2026-05-28 08:33:12.38	driver	\N
71108525-2e38-469b-9e6a-d45e0cff9fd1	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	superseded	2026-05-20 17:06:59.876667	passenger	\N
1647aaf2-940c-42c4-9bf5-d48731b47da8	47008ca1-b614-4789-bc38-368944749eb3	7ec78cab-0e66-4104-abc1-2506cab83499	5.00	accepted	2026-05-17 07:43:20.01	driver	\N
657d79e8-f813-4adc-bf70-d4b8164a2598	415d44e9-bf79-4e4e-a802-0bfb9820747c	3b33c255-70d2-401e-a76e-da1540155ec4	10.00	superseded	2026-05-26 06:16:53.683333	passenger	\N
e7ce2488-8f72-4e21-b747-e1087f5d264c	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	pending	2026-05-23 05:37:06.62	passenger	\N
e89c8f70-efc4-47bb-9822-e2a46188053c	03483e92-934d-40bb-a946-7b863370aa31	7ec78cab-0e66-4104-abc1-2506cab83499	13.00	superseded	2026-05-17 22:28:38.713333	driver	\N
833639f5-02f3-47a8-a7a1-ed7c8c01fa69	415d44e9-bf79-4e4e-a802-0bfb9820747c	3b33c255-70d2-401e-a76e-da1540155ec4	11.00	superseded	2026-05-26 06:16:03.66	driver	\N
9b038d16-d37e-49cd-b485-fa0281f7fc81	02abada3-586c-45bf-886c-71b6a32ac9e4	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	superseded	2026-05-18 00:19:45.71	driver	\N
0e9a0858-4b4e-402f-9d8f-d39f09918c12	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	6.00	superseded	2026-07-11 21:41:03.545785	driver	\N
c5d45a1a-ae5b-418d-bb59-2c24dce1e9da	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	6.50	superseded	2026-07-11 21:47:00.510637	passenger	\N
c95b9a2e-f225-4376-bbf8-e05c9838aa0d	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	7.00	superseded	2026-07-11 21:47:47.619759	driver	\N
122b355d-8238-4335-8c49-165801548dbf	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	8.00	superseded	2026-07-11 21:52:42.726268	driver	\N
0108a19b-80aa-4a95-a1f4-c11f2a48f07a	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	7.00	superseded	2026-07-11 22:20:22.287713	passenger	\N
82e08fbc-17a1-438d-b07c-f839866b737b	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	5.00	superseded	2026-07-11 22:54:48.118168	driver	\N
3234d5b1-59e3-429e-b6d7-e2491bb6efa3	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	31e89885-cc6e-4097-af16-c8558a760474	20.00	accepted	2026-07-11 23:13:53.37593	driver	\N
39e10458-2eee-4b2a-94ab-448ae096cfbb	5c8d648b-87dc-4081-b123-6d1cf26e6ded	31e89885-cc6e-4097-af16-c8558a760474	25.00	superseded	2026-07-13 02:13:34.428487	driver	\N
023b6db4-341a-4b55-b527-9ed71199e0d9	5c8d648b-87dc-4081-b123-6d1cf26e6ded	31e89885-cc6e-4097-af16-c8558a760474	15.00	accepted	2026-07-13 02:28:09.396896	driver	\N
49efcc10-b224-4f9d-978f-d8e9c0b9a243	5c8d648b-87dc-4081-b123-6d1cf26e6ded	31e89885-cc6e-4097-af16-c8558a760474	20.00	rejected	2026-07-13 02:13:55.327774	passenger	passenger
8b131907-316e-4a3e-960f-355e37be6027	02abada3-586c-45bf-886c-71b6a32ac9e4	31e89885-cc6e-4097-af16-c8558a760474	8.00	pending	2026-07-14 01:55:59.314833	driver	\N
c95e1ab9-c227-4427-92a4-33c05c860ea5	02abada3-586c-45bf-886c-71b6a32ac9e4	31e89885-cc6e-4097-af16-c8558a760474	8.00	driver_accepted	2026-07-14 01:56:05.438704	driver	\N
\.


--
-- Data for Name: tripratings; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.tripratings (id, tripid, passengerid, driverid, stars, comment, createdat) FROM stdin;
9ebfcc0a-475f-49a8-b28a-1609e13ca5d4	b35df0ad-641c-4a5c-a259-756c9bd1f070	a0160a2d-94d1-454e-bfa8-45945535a063	7ec78cab-0e66-4104-abc1-2506cab83499	3	\N	2026-05-27 09:00:01.29
cb33d84e-42bb-4488-b515-82703a057c22	56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	3	\N	2026-07-11 23:30:25.473813
43050ad2-a7ba-477e-929b-0d99cdf6d37c	44f6bd64-9466-4b6c-963e-bf51526d4109	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	3	elocuente	2026-07-13 00:54:55.412971
7c9f35c0-69cd-4db4-b5fe-fd6ba14a290c	5c8d648b-87dc-4081-b123-6d1cf26e6ded	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	4	\N	2026-07-13 02:30:45.874184
\.


--
-- Data for Name: triproutepoints; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.triproutepoints (id, tripid, lat, lng, speedkmh, recordedat) FROM stdin;
\.


--
-- Data for Name: trips; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.trips (id, passengerid, driverid, vehicleid, originaddress, originlat, originlng, destaddress, destlat, destlng, distancekm, estimatedfare, proposedfare, proposeddriverid, finalfare, paymentmethod, status, createdat, acceptedat, driverarrivedat, startedat, completedat, cancelledby, cancelreason, passengerlastlat, passengerlastlng, passengerlocationat, servicetype, packagedescription, packageweightkg, packageisfragile, packagedetails, pickupverified, pickupobservation, couponcode, discountamount, farebeforediscount, cancelledat, recipientname, recipientphone, deliveryreceivedby, deliveryconfirmedat) FROM stdin;
64288154-9101-4db6-8b5a-522736c38ac4	a0160a2d-94d1-454e-bfa8-45945535a063	\N	\N	14, Pasaje Manuel Silva	-18.05278513631065	-70.25053024291994	20, Avenida Simón Bolívar	-18.04786643158489	-70.24716138839723	\N	15.00	\N	\N	\N	cash	5	2026-05-26 16:41:57.493333	\N	\N	\N	\N	passenger	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
02abada3-586c-45bf-886c-71b6a32ac9e4	f1e64012-7713-45b4-bff2-33b45d3abfd4	\N	\N	Las Camelias, Las Buganvillas	-18.013533677171477	-70.25589466094972	Residencial del sur, Tarapacá	-18.00300392229123	-70.24456501007081	\N	8.00	10.00	7ec78cab-0e66-4104-abc1-2506cab83499	\N	cash	7	2026-05-18 00:08:27.793333	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
678dbf15-4a85-418c-9489-601f451ee9ee	a0160a2d-94d1-454e-bfa8-45945535a063	\N	\N	Los Guayabos, Capanique	-18.012026	-70.2255873	22, Avenida Puya Raimondi	-18.03840949308146	-70.24867106133442	\N	15.00	12.00	3b33c255-70d2-401e-a76e-da1540155ec4	\N	cash	2	2026-05-28 08:31:25.003333	\N	\N	\N	\N	\N	\N	-18.0120284	-70.2255973	2026-05-29 23:26:28.898628	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
d71c3ec0-ece6-4a7a-9d8d-fafe773aada8	05b9d66f-8441-45b4-bdc1-d418a807dddd	\N	\N	475, Jirón Colón	-8.108054	-79.025004	345, Avenida Gustavo Pinto	-18.002893	-70.243313	\N	2658.00	\N	\N	\N	cash	1	2026-07-14 01:49:00.798856	\N	\N	\N	\N	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
415d44e9-bf79-4e4e-a802-0bfb9820747c	73e34565-0de5-43c3-b330-d8dceaee797a	3b33c255-70d2-401e-a76e-da1540155ec4	\N	Los Guayabos, Capanique	-18.0119608	-70.2255529	1, Calle Los Cipreses	-18.007697105514676	-70.22526088464846	\N	10.00	10.00	3b33c255-70d2-401e-a76e-da1540155ec4	10.00	cash	4	2026-05-26 06:13:54.56	2026-05-26 06:17:51.493333	\N	2026-05-26 06:18:51.396667	2026-05-26 06:21:38.336667	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
47008ca1-b614-4789-bc38-368944749eb3	f1e64012-7713-45b4-bff2-33b45d3abfd4	7ec78cab-0e66-4104-abc1-2506cab83499	\N	1020, Calle Los Nardos	-18.004076567811918	-70.25052664659933	798, Calle Arequipa	-18.001219566474408	-70.24583072732902	\N	5.00	8.00	7ec78cab-0e66-4104-abc1-2506cab83499	5.00	cash	4	2026-05-17 07:38:45.156667	2026-05-17 07:50:15.2	\N	2026-05-17 07:50:29.21	2026-05-17 07:51:49.7	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
75b7d0dc-78d0-49c0-b088-3cfbd83cfb8a	a0160a2d-94d1-454e-bfa8-45945535a063	3b33c255-70d2-401e-a76e-da1540155ec4	\N	Avenida Basadre y Forero, Los Guayabos	-18.011678006588628	-70.22521018981935	Asociación Villa Las Palmeras, Capanique	-18.002964383508793	-70.22522091865541	\N	20.00	20.00	3b33c255-70d2-401e-a76e-da1540155ec4	20.00	cash	4	2026-05-26 16:46:31.35	2026-05-26 16:49:35.236667	\N	2026-05-26 16:50:17.593333	2026-05-28 08:25:11.573333	\N	\N	-18.0120037	-70.2255781	2026-05-28 00:46:41.585979	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
5cf9e4da-d6b0-4a61-8924-3f90920b0cf8	f1e64012-7713-45b4-bff2-33b45d3abfd4	7ec78cab-0e66-4104-abc1-2506cab83499	\N	1, Calle Julio César Tello	-18.048973231840307	-70.25586783885957	1, Calle San Carlos	-18.04508664907155	-70.25149047374727	\N	11.00	12.00	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	cash	4	2026-05-17 20:33:33.883333	2026-05-17 20:35:22.34	\N	2026-05-17 20:35:50.59	2026-05-17 20:36:05.586667	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
b35df0ad-641c-4a5c-a259-756c9bd1f070	a0160a2d-94d1-454e-bfa8-45945535a063	7ec78cab-0e66-4104-abc1-2506cab83499	\N	9, Calle Las Moras	-18.009808149125373	-70.22633935164399	Calle Santiago Antúnez de Mayolo, Centro Poblado Nuestra Señora de la Natividad	-18.011701056109864	-70.22623234012336	\N	10.00	9.00	7ec78cab-0e66-4104-abc1-2506cab83499	10.00	cash	4	2026-05-23 20:41:07.353333	2026-05-23 20:56:09.446667	\N	2026-05-23 21:58:05.85	2026-05-24 07:10:31.29	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
03483e92-934d-40bb-a946-7b863370aa31	f1e64012-7713-45b4-bff2-33b45d3abfd4	7ec78cab-0e66-4104-abc1-2506cab83499	\N	545, Avenida General Varela	-18.00468495006402	-70.24761199951173	Avenida San Martín, Agrupamiento Zela	-18.011398697777913	-70.24718284606935	\N	11.00	12.00	7ec78cab-0e66-4104-abc1-2506cab83499	11.00	cash	4	2026-05-17 20:37:06.446667	2026-05-17 23:58:45.593333	\N	2026-05-18 00:07:48.75	2026-05-18 00:07:49.59	\N	\N	\N	\N	\N	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
44f6bd64-9466-4b6c-963e-bf51526d4109	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	\N	Los Guayabos, Capanique	-18.0120525	-70.2255748	2038, Calle Santiago Antúnez de Mayolo	-18.00945398388385	-70.22801648950566	\N	10.00	\N	\N	10.00	cash	4	2026-07-11 23:34:26.435383	2026-07-11 23:36:02.864097	\N	2026-07-11 23:48:04.909997	2026-07-13 00:54:02.396526	\N	\N	-18.0120644	-70.2255814	2026-07-13 00:53:43.988045	1	caja	10.00	t	nuevo	t	recibido	\N	\N	\N	\N	\N	\N	\N	\N
56f7b565-f9f9-4fab-8c2f-176c75a0e4aa	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	\N	Los Guayabos, Capanique	-18.011621095746396	-70.22552610658431	Asociación Los Damascos, Capanique	-18.012949480906236	-70.22474910416045	\N	20.00	\N	\N	20.00	cash	4	2026-07-11 20:20:40.835492	2026-07-11 23:27:21.52181	\N	2026-07-11 23:28:28.481691	2026-07-11 23:29:00.390528	\N	\N	-18.0120266	-70.2255721	2026-07-11 23:28:23.005747	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
5c8d648b-87dc-4081-b123-6d1cf26e6ded	05b9d66f-8441-45b4-bdc1-d418a807dddd	31e89885-cc6e-4097-af16-c8558a760474	\N	Los Guayabos, Capanique	-18.0119989	-70.2255404	345, Avenida Gustavo Pinto	-18.002892881230967	-70.24331338748493	\N	15.00	25.00	31e89885-cc6e-4097-af16-c8558a760474	15.00	yape	4	2026-07-13 02:01:12.074039	2026-07-13 02:28:31.31161	\N	2026-07-13 02:29:14.036432	2026-07-13 02:30:05.393271	\N	\N	-18.0119989	-70.2255404	2026-07-13 02:29:31.668845	0	\N	\N	f	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: tripwaypoints; Type: TABLE DATA; Schema: trips; Owner: postgres
--

COPY trips.tripwaypoints (id, tripid, address, lat, lng, sortorder) FROM stdin;
c758d3a2-4c53-4071-99db-43148e54a4a1	415d44e9-bf79-4e4e-a802-0bfb9820747c	Villa Jesús, Capanique	-18.006737757854946	-70.22844279362702	1
7228f18e-7196-4b8f-800d-880155a868db	47008ca1-b614-4789-bc38-368944749eb3	613, Calle Alfonso Ugarte	-18.003831683797053	-70.24741691154527	0
16b959c6-4950-4ff5-9a96-fcd92ebbcf55	5cf9e4da-d6b0-4a61-8924-3f90920b0cf8	20, Calle El Inti	-18.048203062814558	-70.25253117084505	0
486005ce-4fcd-4665-a0e3-ff840b6f3106	415d44e9-bf79-4e4e-a802-0bfb9820747c	2137, Calle San Martín de Porres	-18.009518587450984	-70.22867177741381	0
\.


--
-- Name: locationhistory_id_seq; Type: SEQUENCE SET; Schema: drivers; Owner: postgres
--

SELECT pg_catalog.setval('drivers.locationhistory_id_seq', 85, true);


--
-- Name: wallettransactions_id_seq; Type: SEQUENCE SET; Schema: payments; Owner: postgres
--

SELECT pg_catalog.setval('payments.wallettransactions_id_seq', 1, true);


--
-- Name: milestoneawards_id_seq; Type: SEQUENCE SET; Schema: rewards; Owner: postgres
--

SELECT pg_catalog.setval('rewards.milestoneawards_id_seq', 8, true);


--
-- Name: promotionapplications_id_seq; Type: SEQUENCE SET; Schema: rewards; Owner: postgres
--

SELECT pg_catalog.setval('rewards.promotionapplications_id_seq', 1, false);


--
-- Name: outboxevents_id_seq; Type: SEQUENCE SET; Schema: trips; Owner: postgres
--

SELECT pg_catalog.setval('trips.outboxevents_id_seq', 1, false);


--
-- Name: triproutepoints_id_seq; Type: SEQUENCE SET; Schema: trips; Owner: postgres
--

SELECT pg_catalog.setval('trips.triproutepoints_id_seq', 1, true);


--
-- Name: passengerdocuments passengerdocuments_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.passengerdocuments
    ADD CONSTRAINT passengerdocuments_pkey PRIMARY KEY (id);


--
-- Name: passwordresettokens passwordresettokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.passwordresettokens
    ADD CONSTRAINT passwordresettokens_pkey PRIMARY KEY (id);


--
-- Name: adminroles pk_adminroles; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.adminroles
    ADD CONSTRAINT pk_adminroles UNIQUE (id);


--
-- Name: userfcmtokens pk_userfcmtokens; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.userfcmtokens
    ADD CONSTRAINT pk_userfcmtokens PRIMARY KEY (id);


--
-- Name: refreshtokens refreshtokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.refreshtokens
    ADD CONSTRAINT refreshtokens_pkey PRIMARY KEY (id);


--
-- Name: rolepermissions rolepermissions_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.rolepermissions
    ADD CONSTRAINT rolepermissions_pkey PRIMARY KEY (roleid, permission);


--
-- Name: adminroles uq_adminroles_name; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.adminroles
    ADD CONSTRAINT uq_adminroles_name UNIQUE (name);


--
-- Name: passwordresettokens uq_passwordresettokens_hash; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.passwordresettokens
    ADD CONSTRAINT uq_passwordresettokens_hash UNIQUE (tokenhash);


--
-- Name: refreshtokens uq_rt_token; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.refreshtokens
    ADD CONSTRAINT uq_rt_token UNIQUE (token);


--
-- Name: userfcmtokens uq_userfcmtokens_token; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.userfcmtokens
    ADD CONSTRAINT uq_userfcmtokens_token UNIQUE (token);


--
-- Name: users uq_users_email; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT uq_users_email UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: documentnotifications documentnotifications_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.documentnotifications
    ADD CONSTRAINT documentnotifications_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: driverpresencecheckins driverpresencecheckins_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.driverpresencecheckins
    ADD CONSTRAINT driverpresencecheckins_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: locationhistory locationhistory_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.locationhistory
    ADD CONSTRAINT locationhistory_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: documentnotifications uq_docnotifs_docdays; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.documentnotifications
    ADD CONSTRAINT uq_docnotifs_docdays UNIQUE (documentid, daysbefore);


--
-- Name: drivers uq_driver_user; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.drivers
    ADD CONSTRAINT uq_driver_user UNIQUE (userid);


--
-- Name: reviews uq_rev_trip; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.reviews
    ADD CONSTRAINT uq_rev_trip UNIQUE (tripid);


--
-- Name: vehicles uq_vehicle_plate; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.vehicles
    ADD CONSTRAINT uq_vehicle_plate UNIQUE (plate);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: contactmessages contactmessages_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.contactmessages
    ADD CONSTRAINT contactmessages_pkey PRIMARY KEY (id);


--
-- Name: contactreplies contactreplies_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.contactreplies
    ADD CONSTRAINT contactreplies_pkey PRIMARY KEY (id);


--
-- Name: faqitems faqitems_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.faqitems
    ADD CONSTRAINT faqitems_pkey PRIMARY KEY (id);


--
-- Name: mediaassets mediaassets_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.mediaassets
    ADD CONSTRAINT mediaassets_pkey PRIMARY KEY (id);


--
-- Name: newsarticles newsarticles_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.newsarticles
    ADD CONSTRAINT newsarticles_pkey PRIMARY KEY (id);


--
-- Name: sectioncontents sectioncontents_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.sectioncontents
    ADD CONSTRAINT sectioncontents_pkey PRIMARY KEY (id);


--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);


--
-- Name: systemsettings systemsettings_pkey; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.systemsettings
    ADD CONSTRAINT systemsettings_pkey PRIMARY KEY (id);


--
-- Name: sectioncontents uq_content_section_lang; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.sectioncontents
    ADD CONSTRAINT uq_content_section_lang UNIQUE (sectionid, lang);


--
-- Name: newsarticles uq_news_slug_lang; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.newsarticles
    ADD CONSTRAINT uq_news_slug_lang UNIQUE (slug, lang);


--
-- Name: sections uq_section_key; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.sections
    ADD CONSTRAINT uq_section_key UNIQUE (sectionkey);


--
-- Name: systemsettings uq_setting_key; Type: CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.systemsettings
    ADD CONSTRAINT uq_setting_key UNIQUE (settingkey);


--
-- Name: driverwallet driverwallet_pkey; Type: CONSTRAINT; Schema: payments; Owner: postgres
--

ALTER TABLE ONLY payments.driverwallet
    ADD CONSTRAINT driverwallet_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: payments; Owner: postgres
--

ALTER TABLE ONLY payments.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments uq_payment_trip; Type: CONSTRAINT; Schema: payments; Owner: postgres
--

ALTER TABLE ONLY payments.payments
    ADD CONSTRAINT uq_payment_trip UNIQUE (tripid);


--
-- Name: driverwallet uq_wallet_driver; Type: CONSTRAINT; Schema: payments; Owner: postgres
--

ALTER TABLE ONLY payments.driverwallet
    ADD CONSTRAINT uq_wallet_driver UNIQUE (driverid);


--
-- Name: wallettransactions wallettransactions_pkey; Type: CONSTRAINT; Schema: payments; Owner: postgres
--

ALTER TABLE ONLY payments.wallettransactions
    ADD CONSTRAINT wallettransactions_pkey PRIMARY KEY (id);


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: payments; Owner: postgres
--

ALTER TABLE ONLY payments.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- Name: bugie_migraciones bugie_migraciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bugie_migraciones
    ADD CONSTRAINT bugie_migraciones_pkey PRIMARY KEY (nombre);


--
-- Name: catalogitems pk_catalogitems; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.catalogitems
    ADD CONSTRAINT pk_catalogitems PRIMARY KEY (id);


--
-- Name: milestoneawards pk_milestoneawards; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.milestoneawards
    ADD CONSTRAINT pk_milestoneawards PRIMARY KEY (id);


--
-- Name: pointsadjustments pk_pointsadjustments; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointsadjustments
    ADD CONSTRAINT pk_pointsadjustments PRIMARY KEY (id);


--
-- Name: pointsprofiles pk_pointsprofiles; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointsprofiles
    ADD CONSTRAINT pk_pointsprofiles PRIMARY KEY (id);


--
-- Name: pointstransactions pk_pointstransactions; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointstransactions
    ADD CONSTRAINT pk_pointstransactions PRIMARY KEY (id);


--
-- Name: promotionapplications pk_promotionapplications; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.promotionapplications
    ADD CONSTRAINT pk_promotionapplications PRIMARY KEY (id);


--
-- Name: promotions pk_promotions; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.promotions
    ADD CONSTRAINT pk_promotions PRIMARY KEY (id);


--
-- Name: raffles pk_raffles; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.raffles
    ADD CONSTRAINT pk_raffles PRIMARY KEY (id);


--
-- Name: raffletickets pk_raffletickets; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.raffletickets
    ADD CONSTRAINT pk_raffletickets PRIMARY KEY (id);


--
-- Name: rafflewinners pk_rafflewinners; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.rafflewinners
    ADD CONSTRAINT pk_rafflewinners PRIMARY KEY (id);


--
-- Name: redemptions pk_redemptions; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.redemptions
    ADD CONSTRAINT pk_redemptions PRIMARY KEY (id);


--
-- Name: referralcodes pk_referralcodes; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referralcodes
    ADD CONSTRAINT pk_referralcodes PRIMARY KEY (id);


--
-- Name: referralinvitations pk_referralinvitations; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referralinvitations
    ADD CONSTRAINT pk_referralinvitations PRIMARY KEY (id);


--
-- Name: referrals pk_referrals; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referrals
    ADD CONSTRAINT pk_referrals PRIMARY KEY (id);


--
-- Name: levels pk_rewardslevels; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.levels
    ADD CONSTRAINT pk_rewardslevels PRIMARY KEY (id);


--
-- Name: settings pk_rewardssettings; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.settings
    ADD CONSTRAINT pk_rewardssettings PRIMARY KEY (id);


--
-- Name: catalogitems uq_catalogitems_code; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.catalogitems
    ADD CONSTRAINT uq_catalogitems_code UNIQUE (code);


--
-- Name: pointsprofiles uq_pointsprofiles_user; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointsprofiles
    ADD CONSTRAINT uq_pointsprofiles_user UNIQUE (userid);


--
-- Name: raffletickets uq_raffletickets_number; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.raffletickets
    ADD CONSTRAINT uq_raffletickets_number UNIQUE (raffleid, ticketnumber);


--
-- Name: rafflewinners uq_rafflewinners_rank; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.rafflewinners
    ADD CONSTRAINT uq_rafflewinners_rank UNIQUE (raffleid, prizerank);


--
-- Name: redemptions uq_redemptions_code; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.redemptions
    ADD CONSTRAINT uq_redemptions_code UNIQUE (code);


--
-- Name: referralcodes uq_referralcodes_code; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referralcodes
    ADD CONSTRAINT uq_referralcodes_code UNIQUE (code);


--
-- Name: referralcodes uq_referralcodes_user; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referralcodes
    ADD CONSTRAINT uq_referralcodes_user UNIQUE (userid);


--
-- Name: referrals uq_referrals_referred; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referrals
    ADD CONSTRAINT uq_referrals_referred UNIQUE (referreduserid);


--
-- Name: levels uq_rewardslevels_type_name; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.levels
    ADD CONSTRAINT uq_rewardslevels_type_name UNIQUE (usertype, name);


--
-- Name: settings uq_rewardssettings_key; Type: CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.settings
    ADD CONSTRAINT uq_rewardssettings_key UNIQUE (settingkey);


--
-- Name: favoriteaddresses favoriteaddresses_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.favoriteaddresses
    ADD CONSTRAINT favoriteaddresses_pkey PRIMARY KEY (id);


--
-- Name: favoritedrivers favoritedrivers_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.favoritedrivers
    ADD CONSTRAINT favoritedrivers_pkey PRIMARY KEY (passengerid, driveruserid);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: passengeracceptancecancellations passengeracceptancecancellations_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.passengeracceptancecancellations
    ADD CONSTRAINT passengeracceptancecancellations_pkey PRIMARY KEY (id);


--
-- Name: outboxevents pk_outboxevents; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.outboxevents
    ADD CONSTRAINT pk_outboxevents PRIMARY KEY (id);


--
-- Name: tripphotos pk_tripphotos; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripphotos
    ADD CONSTRAINT pk_tripphotos PRIMARY KEY (id);


--
-- Name: sosalerts sosalerts_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.sosalerts
    ADD CONSTRAINT sosalerts_pkey PRIMARY KEY (id);


--
-- Name: tripproposals tripproposals_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripproposals
    ADD CONSTRAINT tripproposals_pkey PRIMARY KEY (id);


--
-- Name: tripratings tripratings_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripratings
    ADD CONSTRAINT tripratings_pkey PRIMARY KEY (id);


--
-- Name: triproutepoints triproutepoints_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.triproutepoints
    ADD CONSTRAINT triproutepoints_pkey PRIMARY KEY (id);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--
-- Name: tripwaypoints tripwaypoints_pkey; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripwaypoints
    ADD CONSTRAINT tripwaypoints_pkey PRIMARY KEY (id);


--
-- Name: incidents uq_incidents_tripid_role; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.incidents
    ADD CONSTRAINT uq_incidents_tripid_role UNIQUE (tripid, reportedbyrole);


--
-- Name: tripratings uq_tripratings_tripid; Type: CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripratings
    ADD CONSTRAINT uq_tripratings_tripid UNIQUE (tripid);


--
-- Name: ix_passwordresettokens_userid; Type: INDEX; Schema: auth; Owner: postgres
--

CREATE INDEX ix_passwordresettokens_userid ON auth.passwordresettokens USING btree (userid);


--
-- Name: ix_userfcmtokens_userid; Type: INDEX; Schema: auth; Owner: postgres
--

CREATE INDEX ix_userfcmtokens_userid ON auth.userfcmtokens USING btree (userid);


--
-- Name: ix_contactreplies_contactid; Type: INDEX; Schema: landing; Owner: postgres
--

CREATE INDEX ix_contactreplies_contactid ON landing.contactreplies USING btree (contactid, createdat DESC);


--
-- Name: ix_wd_driver_paidat; Type: INDEX; Schema: payments; Owner: postgres
--

CREATE INDEX ix_wd_driver_paidat ON payments.withdrawals USING btree (driverid, paidat);


--
-- Name: uq_wd_source; Type: INDEX; Schema: payments; Owner: postgres
--

CREATE UNIQUE INDEX uq_wd_source ON payments.withdrawals USING btree (sourcetype, sourceref) WHERE (sourceref IS NOT NULL);


--
-- Name: ix_catalogitems_type_active; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_catalogitems_type_active ON rewards.catalogitems USING btree (usertype, isactive, sortorder);


--
-- Name: ix_milestoneawards_type; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_milestoneawards_type ON rewards.milestoneawards USING btree (type, createdat DESC);


--
-- Name: ix_pointsadjustments_admin; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointsadjustments_admin ON rewards.pointsadjustments USING btree (adminid, createdat DESC);


--
-- Name: ix_pointsadjustments_profile; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointsadjustments_profile ON rewards.pointsadjustments USING btree (profileid, createdat DESC);


--
-- Name: ix_pointsprofiles_expiry; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointsprofiles_expiry ON rewards.pointsprofiles USING btree (pointsexpirydate) WHERE (pointsexpirydate IS NOT NULL);


--
-- Name: ix_pointsprofiles_expiryjob; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointsprofiles_expiryjob ON rewards.pointsprofiles USING btree (pointsexpirydate) WHERE ((pointsexpirydate IS NOT NULL) AND (availablepoints > 0));


--
-- Name: ix_pointsprofiles_level; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointsprofiles_level ON rewards.pointsprofiles USING btree (currentlevel, usertype);


--
-- Name: ix_pointstransactions_expiry; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointstransactions_expiry ON rewards.pointstransactions USING btree (expirydate) WHERE (expirydate IS NOT NULL);


--
-- Name: ix_pointstransactions_profile; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointstransactions_profile ON rewards.pointstransactions USING btree (profileid, createdat DESC);


--
-- Name: ix_pointstransactions_source; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_pointstransactions_source ON rewards.pointstransactions USING btree (sourceevent, createdat DESC);


--
-- Name: ix_promoapp_promotion; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_promoapp_promotion ON rewards.promotionapplications USING btree (promotionid, createdat DESC);


--
-- Name: ix_promotions_active; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_promotions_active ON rewards.promotions USING btree (isactive, targetusertype, startdate, enddate);


--
-- Name: ix_raffles_status_draw; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_raffles_status_draw ON rewards.raffles USING btree (status, drawdate);


--
-- Name: ix_raffletickets_raffle; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_raffletickets_raffle ON rewards.raffletickets USING btree (raffleid);


--
-- Name: ix_raffletickets_user; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_raffletickets_user ON rewards.raffletickets USING btree (userid, createdat DESC);


--
-- Name: ix_rafflewinners_user; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_rafflewinners_user ON rewards.rafflewinners USING btree (userid, createdat DESC);


--
-- Name: ix_redemptions_status; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_redemptions_status ON rewards.redemptions USING btree (status, expiresat);


--
-- Name: ix_redemptions_user; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_redemptions_user ON rewards.redemptions USING btree (userid, createdat DESC);


--
-- Name: ix_referralinvitations_email; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_referralinvitations_email ON rewards.referralinvitations USING btree (lower((email)::text));


--
-- Name: ix_referralinvitations_referrer; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_referralinvitations_referrer ON rewards.referralinvitations USING btree (referreruserid, sentat DESC);


--
-- Name: ix_referrals_pending; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_referrals_pending ON rewards.referrals USING btree (referreduserid) WHERE ((status)::text = 'pending'::text);


--
-- Name: ix_referrals_referrer; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_referrals_referrer ON rewards.referrals USING btree (referreruserid, createdat DESC);


--
-- Name: ix_rewardslevels_type_sort; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE INDEX ix_rewardslevels_type_sort ON rewards.levels USING btree (usertype, sortorder);


--
-- Name: uq_milestoneawards_period; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE UNIQUE INDEX uq_milestoneawards_period ON rewards.milestoneawards USING btree (profileid, type, periodkey);


--
-- Name: uq_pointstransactions_source_ref; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE UNIQUE INDEX uq_pointstransactions_source_ref ON rewards.pointstransactions USING btree (profileid, sourceevent, referenceid) WHERE (referenceid IS NOT NULL);


--
-- Name: uq_promoapp_promo_profile_trip; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE UNIQUE INDEX uq_promoapp_promo_profile_trip ON rewards.promotionapplications USING btree (promotionid, profileid, tripid);


--
-- Name: uq_raffletickets_levelonce; Type: INDEX; Schema: rewards; Owner: postgres
--

CREATE UNIQUE INDEX uq_raffletickets_levelonce ON rewards.raffletickets USING btree (raffleid, userid, ticketnumber) WHERE ((source)::text = 'level_benefit'::text);


--
-- Name: ix_outboxevents_pending; Type: INDEX; Schema: trips; Owner: postgres
--

CREATE INDEX ix_outboxevents_pending ON trips.outboxevents USING btree (createdat) WHERE ((status)::text = 'pending'::text);


--
-- Name: ix_tripphotos_tripid; Type: INDEX; Schema: trips; Owner: postgres
--

CREATE INDEX ix_tripphotos_tripid ON trips.tripphotos USING btree (tripid);


--
-- Name: ix_trips_couponcode; Type: INDEX; Schema: trips; Owner: postgres
--

CREATE INDEX ix_trips_couponcode ON trips.trips USING btree (couponcode) WHERE (couponcode IS NOT NULL);


--
-- Name: ux_favoriteaddresses_passenger_label; Type: INDEX; Schema: trips; Owner: postgres
--

CREATE UNIQUE INDEX ux_favoriteaddresses_passenger_label ON trips.favoriteaddresses USING btree (passengerid, lower((label)::text));


--
-- Name: passengerdocuments fk_passengerdocs_user; Type: FK CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.passengerdocuments
    ADD CONSTRAINT fk_passengerdocs_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: passwordresettokens fk_passwordresettokens_user; Type: FK CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.passwordresettokens
    ADD CONSTRAINT fk_passwordresettokens_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rolepermissions fk_rolepermissions_role; Type: FK CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.rolepermissions
    ADD CONSTRAINT fk_rolepermissions_role FOREIGN KEY (roleid) REFERENCES auth.adminroles(id) ON DELETE CASCADE;


--
-- Name: refreshtokens fk_rt_user; Type: FK CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.refreshtokens
    ADD CONSTRAINT fk_rt_user FOREIGN KEY (userid) REFERENCES auth.users(id);


--
-- Name: userfcmtokens fk_userfcmtokens_user; Type: FK CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.userfcmtokens
    ADD CONSTRAINT fk_userfcmtokens_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users fk_users_adminrole; Type: FK CONSTRAINT; Schema: auth; Owner: postgres
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT fk_users_adminrole FOREIGN KEY (adminroleid) REFERENCES auth.adminroles(id);


--
-- Name: documents fk_doc_driver; Type: FK CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.documents
    ADD CONSTRAINT fk_doc_driver FOREIGN KEY (driverid) REFERENCES drivers.drivers(id);


--
-- Name: documentnotifications fk_docnotifs_doc; Type: FK CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.documentnotifications
    ADD CONSTRAINT fk_docnotifs_doc FOREIGN KEY (documentid) REFERENCES drivers.documents(id) ON DELETE CASCADE;


--
-- Name: reviews fk_rev_driver; Type: FK CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.reviews
    ADD CONSTRAINT fk_rev_driver FOREIGN KEY (driverid) REFERENCES drivers.drivers(id);


--
-- Name: vehicles fk_vehicle_driver; Type: FK CONSTRAINT; Schema: drivers; Owner: postgres
--

ALTER TABLE ONLY drivers.vehicles
    ADD CONSTRAINT fk_vehicle_driver FOREIGN KEY (driverid) REFERENCES drivers.drivers(id);


--
-- Name: contactreplies fk_contactreplies_contact; Type: FK CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.contactreplies
    ADD CONSTRAINT fk_contactreplies_contact FOREIGN KEY (contactid) REFERENCES landing.contactmessages(id) ON DELETE CASCADE;


--
-- Name: sectioncontents fk_content_section; Type: FK CONSTRAINT; Schema: landing; Owner: postgres
--

ALTER TABLE ONLY landing.sectioncontents
    ADD CONSTRAINT fk_content_section FOREIGN KEY (sectionid) REFERENCES landing.sections(id);


--
-- Name: milestoneawards fk_milestoneawards_profile; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.milestoneawards
    ADD CONSTRAINT fk_milestoneawards_profile FOREIGN KEY (profileid) REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE;


--
-- Name: pointsadjustments fk_pointsadjustments_profile; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointsadjustments
    ADD CONSTRAINT fk_pointsadjustments_profile FOREIGN KEY (profileid) REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE;


--
-- Name: pointsprofiles fk_pointsprofiles_user; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointsprofiles
    ADD CONSTRAINT fk_pointsprofiles_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pointstransactions fk_pointstransactions_profile; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.pointstransactions
    ADD CONSTRAINT fk_pointstransactions_profile FOREIGN KEY (profileid) REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE;


--
-- Name: promotionapplications fk_promoapp_profile; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.promotionapplications
    ADD CONSTRAINT fk_promoapp_profile FOREIGN KEY (profileid) REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE;


--
-- Name: promotionapplications fk_promoapp_promotion; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.promotionapplications
    ADD CONSTRAINT fk_promoapp_promotion FOREIGN KEY (promotionid) REFERENCES rewards.promotions(id) ON DELETE CASCADE;


--
-- Name: raffletickets fk_raffletickets_profile; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.raffletickets
    ADD CONSTRAINT fk_raffletickets_profile FOREIGN KEY (profileid) REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE;


--
-- Name: raffletickets fk_raffletickets_raffle; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.raffletickets
    ADD CONSTRAINT fk_raffletickets_raffle FOREIGN KEY (raffleid) REFERENCES rewards.raffles(id) ON DELETE CASCADE;


--
-- Name: rafflewinners fk_rafflewinners_raffle; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.rafflewinners
    ADD CONSTRAINT fk_rafflewinners_raffle FOREIGN KEY (raffleid) REFERENCES rewards.raffles(id) ON DELETE CASCADE;


--
-- Name: redemptions fk_redemptions_item; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.redemptions
    ADD CONSTRAINT fk_redemptions_item FOREIGN KEY (catalogitemid) REFERENCES rewards.catalogitems(id);


--
-- Name: redemptions fk_redemptions_profile; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.redemptions
    ADD CONSTRAINT fk_redemptions_profile FOREIGN KEY (profileid) REFERENCES rewards.pointsprofiles(id) ON DELETE CASCADE;


--
-- Name: referralcodes fk_referralcodes_user; Type: FK CONSTRAINT; Schema: rewards; Owner: postgres
--

ALTER TABLE ONLY rewards.referralcodes
    ADD CONSTRAINT fk_referralcodes_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: triproutepoints fk_route_trip; Type: FK CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.triproutepoints
    ADD CONSTRAINT fk_route_trip FOREIGN KEY (tripid) REFERENCES trips.trips(id);


--
-- Name: sosalerts fk_sos_trip; Type: FK CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.sosalerts
    ADD CONSTRAINT fk_sos_trip FOREIGN KEY (tripid) REFERENCES trips.trips(id);


--
-- Name: tripphotos fk_tripphotos_trip; Type: FK CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripphotos
    ADD CONSTRAINT fk_tripphotos_trip FOREIGN KEY (tripid) REFERENCES trips.trips(id) ON DELETE CASCADE;


--
-- Name: tripwaypoints fk_twp_trip; Type: FK CONSTRAINT; Schema: trips; Owner: postgres
--

ALTER TABLE ONLY trips.tripwaypoints
    ADD CONSTRAINT fk_twp_trip FOREIGN KEY (tripid) REFERENCES trips.trips(id);


--
-- PostgreSQL database dump complete
--

\unrestrict YsnpxMEeh3bvMg2ZAND0rWPBz7O4Vpf7wxtq80VOml5Ynkp1ISOymrUwqq3HrVv

