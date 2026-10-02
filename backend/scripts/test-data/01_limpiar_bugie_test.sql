-- =====================================================================
-- Deja bugie_test "limpia": borra datos transaccionales y conserva la
-- configuracion (landing, settings, niveles, catalogo, roles admin).
-- SOLO para la base de prueba bugie_test. NO ejecutar en bugie.
-- =====================================================================
DO $$
BEGIN
  IF current_database() <> 'bugie_test' THEN
    RAISE EXCEPTION 'Este script solo se ejecuta en bugie_test (actual: %)', current_database();
  END IF;
END $$;

BEGIN;

TRUNCATE
  trips.trips, trips.tripproposals, trips.tripratings, trips.triproutepoints,
  trips.tripwaypoints, trips.tripphotos, trips.sosalerts, trips.incidents,
  trips.outboxevents, trips.favoriteaddresses, trips.favoritedrivers,
  trips.passengeracceptancecancellations,
  payments.payments, payments.driverwallet, payments.wallettransactions, payments.withdrawals,
  drivers.drivers, drivers.documents, drivers.documentnotifications, drivers.vehicles,
  drivers.reviews, drivers.locationhistory, drivers.driverpresencecheckins,
  rewards.pointsprofiles, rewards.pointstransactions, rewards.pointsadjustments,
  rewards.milestoneawards, rewards.promotionapplications, rewards.promotions,
  rewards.raffles, rewards.raffletickets, rewards.rafflewinners, rewards.redemptions,
  rewards.referralcodes, rewards.referralinvitations, rewards.referrals,
  landing.contactmessages, landing.contactreplies,
  auth.passengerdocuments, auth.refreshtokens, auth.userfcmtokens;

-- Usuarios: solo queda el admin principal
DELETE FROM auth.users WHERE role <> 'admin';

-- Admin principal con la contrasena de prueba (bcrypt, compatible con BCrypt.Net)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE auth.users
   SET passwordhash = crypt('10203040', gen_salt('bf', 11))
 WHERE role = 'admin';

COMMIT;
