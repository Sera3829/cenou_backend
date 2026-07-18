-- ============================================================================
-- Migration 004 — Messagerie interne : élargit les cibles d'annonces
-- À exécuter une fois :  psql "$DATABASE_URL" -f database/migration_004_messagerie_cibles.sql
-- Idempotente. Ajoute GESTIONNAIRES_CENTRE et UTILISATEURS aux cibles autorisées.
-- (Le serveur tente aussi cette mise à jour au runtime ; ce fichier est le
--  chemin fiable si le rôle applicatif n'a pas le droit d'ALTER.)
-- ============================================================================

BEGIN;

ALTER TABLE annonces DROP CONSTRAINT IF EXISTS annonces_cible_check;

ALTER TABLE annonces ADD CONSTRAINT annonces_cible_check
  CHECK (cible IN (
    'TOUS', 'CENTRE_SPECIFIQUE', 'ETUDIANTS',
    'GESTIONNAIRES', 'GESTIONNAIRES_CENTRE', 'UTILISATEURS'
  ));

COMMIT;
