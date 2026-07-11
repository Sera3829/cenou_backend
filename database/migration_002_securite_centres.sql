-- ============================================================================
-- Migration 002 — Sécurité, cloisonnement par centre, intégrité financière
-- À exécuter UNE FOIS sur la base existante (Neon) :
--   psql "$DATABASE_URL" -f database/migration_002_securite_centres.sql
-- Toutes les instructions sont idempotentes (IF NOT EXISTS / vérifications).
-- ============================================================================

BEGIN;

-- ── 1. Rattachement d'un gestionnaire à son centre ──────────────────────────
-- Un GESTIONNAIRE ne voit que les données de son centre. NULL pour les autres rôles.
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS centre_id INTEGER REFERENCES centres(id) ON DELETE SET NULL;

-- Colonne utilisée par POST /api/users/admin/create (absente du schéma initial)
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- ── 2. Protéger l'historique financier ──────────────────────────────────────
-- L'ancien ON DELETE CASCADE détruisait paiements + transactions à la
-- suppression d'un utilisateur. On passe en RESTRICT : la suppression physique
-- est bloquée s'il existe des paiements (le code fait désormais du soft-delete).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'paiements_attribution_id_fkey') THEN
    ALTER TABLE paiements DROP CONSTRAINT paiements_attribution_id_fkey;
  END IF;
  ALTER TABLE paiements
    ADD CONSTRAINT paiements_attribution_id_fkey
    FOREIGN KEY (attribution_id) REFERENCES attributions(id) ON DELETE RESTRICT;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'attributions_utilisateur_id_fkey') THEN
    ALTER TABLE attributions DROP CONSTRAINT attributions_utilisateur_id_fkey;
  END IF;
  ALTER TABLE attributions
    ADD CONSTRAINT attributions_utilisateur_id_fkey
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE RESTRICT;
END $$;

-- ── 3. Tables référencées par le code mais absentes du schéma initial ───────
CREATE TABLE IF NOT EXISTS equipes_techniques (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    description TEXT,
    specialite VARCHAR(50),
    chef_equipe VARCHAR(150),
    telephone VARCHAR(20),
    email VARCHAR(150),
    statut VARCHAR(20) DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE signalements
  ADD COLUMN IF NOT EXISTS equipe_id INTEGER REFERENCES equipes_techniques(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS signalement_historique (
    id SERIAL PRIMARY KEY,
    signalement_id INTEGER REFERENCES signalements(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    effectue_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paiement_historique (
    id SERIAL PRIMARY KEY,
    paiement_id INTEGER REFERENCES paiements(id) ON DELETE CASCADE,
    ancien_statut VARCHAR(20),
    nouveau_statut VARCHAR(20),
    modifie_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
    raison TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    paiement_id INTEGER REFERENCES paiements(id) ON DELETE CASCADE,
    montant DECIMAL(10, 2),
    statut VARCHAR(30),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Colonnes utilisées par initierPaiement, absentes du schéma initial
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS nombre_mois INTEGER DEFAULT 1;

-- ── 4. Index de performance (jointures les plus fréquentes) ─────────────────
CREATE INDEX IF NOT EXISTS idx_paiements_attribution   ON paiements(attribution_id);
CREATE INDEX IF NOT EXISTS idx_paiements_reference     ON paiements(reference_transaction);
CREATE INDEX IF NOT EXISTS idx_attributions_logement   ON attributions(logement_id);
CREATE INDEX IF NOT EXISTS idx_attributions_statut     ON attributions(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_attribution ON signalements(attribution_id);
CREATE INDEX IF NOT EXISTS idx_signalements_created    ON signalements(created_at);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_centre     ON utilisateurs(centre_id);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role       ON utilisateurs(role);
CREATE INDEX IF NOT EXISTS idx_logements_statut        ON logements(statut);

COMMIT;

-- ── 5. Après migration : rattacher chaque gestionnaire à son centre ─────────
-- UPDATE utilisateurs SET centre_id = <ID_CENTRE> WHERE matricule = '<MATRICULE_GESTIONNAIRE>';
-- SELECT id, nom, ville FROM centres;  -- pour retrouver les IDs
