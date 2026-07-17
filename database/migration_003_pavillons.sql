-- ============================================================================
-- Migration 003 — Pavillons : hiérarchie Centre → Pavillon → Chambres
-- À exécuter une fois :  psql "$DATABASE_URL" -f database/migration_003_pavillons.sql
-- Idempotente. Les chambres existantes (données de test) sont rattachées à un
-- pavillon « Principal » créé automatiquement dans chaque centre concerné.
-- ============================================================================

BEGIN;

-- ── 1. Table pavillons ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pavillons (
    id SERIAL PRIMARY KEY,
    centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    capacite INTEGER DEFAULT 0,          -- nombre de chambres prévu
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (centre_id, nom)
);

CREATE INDEX IF NOT EXISTS idx_pavillons_centre ON pavillons(centre_id);

-- ── 2. Rattachement des chambres à un pavillon ──────────────────────────────
ALTER TABLE logements
  ADD COLUMN IF NOT EXISTS pavillon_id INTEGER REFERENCES pavillons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_logements_pavillon ON logements(pavillon_id);

-- ── 3. Rattacher les chambres existantes à un pavillon « Principal » ────────
-- Pour chaque centre ayant des chambres sans pavillon, on crée « Principal »
-- (si absent) puis on y rattache ces chambres. Sans effet si tout est déjà en
-- ordre (migration rejouable).
DO $$
DECLARE
  c RECORD;
  pav_id INTEGER;
BEGIN
  FOR c IN
    SELECT DISTINCT centre_id
    FROM logements
    WHERE pavillon_id IS NULL AND centre_id IS NOT NULL
  LOOP
    -- Pavillon « Principal » du centre (créé si nécessaire)
    SELECT id INTO pav_id FROM pavillons
      WHERE centre_id = c.centre_id AND nom = 'Principal';
    IF pav_id IS NULL THEN
      INSERT INTO pavillons (centre_id, nom, capacite)
      VALUES (c.centre_id, 'Principal',
              (SELECT COUNT(*) FROM logements WHERE centre_id = c.centre_id))
      RETURNING id INTO pav_id;
    END IF;

    UPDATE logements
      SET pavillon_id = pav_id
      WHERE centre_id = c.centre_id AND pavillon_id IS NULL;
  END LOOP;
END $$;

COMMIT;
