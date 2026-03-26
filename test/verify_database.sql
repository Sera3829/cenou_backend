-- =========================================
-- Vérifier et créer toutes les tables manquantes
-- =========================================

-- 1. Table utilisateurs
CREATE TABLE IF NOT EXISTS utilisateurs (
  id SERIAL PRIMARY KEY,
  matricule VARCHAR(50) UNIQUE NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  telephone VARCHAR(20),
  mot_de_passe VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ETUDIANT', 'GESTIONNAIRE', 'ADMIN')),
  statut VARCHAR(20) DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF', 'SUSPENDU')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table centres
CREATE TABLE IF NOT EXISTS centres (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  ville VARCHAR(100) NOT NULL,
  adresse TEXT,
  capacite_totale INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table logements
CREATE TABLE IF NOT EXISTS logements (
  id SERIAL PRIMARY KEY,
  centre_id INTEGER REFERENCES centres(id) ON DELETE CASCADE,
  numero_chambre VARCHAR(20) NOT NULL,
  type_chambre VARCHAR(20) CHECK (type_chambre IN ('SIMPLE', 'DOUBLE', 'STUDIO')),
  prix_mensuel DECIMAL(10, 2) NOT NULL,
  statut VARCHAR(20) DEFAULT 'DISPONIBLE' CHECK (statut IN ('DISPONIBLE', 'OCCUPE', 'MAINTENANCE')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(centre_id, numero_chambre)
);

-- 4. Table attributions
CREATE TABLE IF NOT EXISTS attributions (
  id SERIAL PRIMARY KEY,
  utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
  logement_id INTEGER REFERENCES logements(id) ON DELETE CASCADE,
  date_debut DATE NOT NULL,
  date_fin DATE,
  statut VARCHAR(20) DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'TERMINEE', 'SUSPENDUE')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table paiements
CREATE TABLE IF NOT EXISTS paiements (
  id SERIAL PRIMARY KEY,
  attribution_id INTEGER REFERENCES attributions(id) ON DELETE CASCADE,
  montant DECIMAL(10, 2) NOT NULL,
  date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  date_echeance DATE NOT NULL,
  mode_paiement VARCHAR(30) CHECK (mode_paiement IN ('ORANGE_MONEY', 'MOOV_MONEY', 'ESPECES', 'VIREMENT')),
  reference_transaction VARCHAR(100) UNIQUE,
  statut VARCHAR(20) DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'CONFIRME', 'ECHEC', 'REMBOURSE')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Table transactions (LA TABLE MANQUANTE)
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  paiement_id INTEGER REFERENCES paiements(id) ON DELETE CASCADE,
  montant DECIMAL(10, 2) NOT NULL,
  statut VARCHAR(20) NOT NULL CHECK (statut IN ('INITIE', 'EN_ATTENTE', 'CONFIRME', 'ECHEC', 'REMBOURSE')),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Table signalements
CREATE TABLE IF NOT EXISTS signalements (
  id SERIAL PRIMARY KEY,
  attribution_id INTEGER REFERENCES attributions(id) ON DELETE CASCADE,
  type_probleme VARCHAR(30) CHECK (type_probleme IN ('PLOMBERIE', 'ELECTRICITE', 'TOITURE', 'SERRURE', 'MOBILIER', 'AUTRE')),
  description TEXT NOT NULL,
  photos TEXT[],
  numero_suivi VARCHAR(20) UNIQUE NOT NULL,
  statut VARCHAR(20) DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'RESOLU', 'ANNULE')),
  date_resolution TIMESTAMP,
  commentaire_resolution TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Table annonces
CREATE TABLE IF NOT EXISTS annonces (
  id SERIAL PRIMARY KEY,
  titre VARCHAR(200) NOT NULL,
  contenu TEXT NOT NULL,
  cible VARCHAR(50) CHECK (cible IN ('TOUS', 'CENTRE_SPECIFIQUE', 'ETUDIANTS', 'GESTIONNAIRES')),
  centre_id INTEGER REFERENCES centres(id) ON DELETE SET NULL,
  statut VARCHAR(20) DEFAULT 'PUBLIE' CHECK (statut IN ('BROUILLON', 'PUBLIE', 'ARCHIVE')),
  created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Créer les index
CREATE INDEX IF NOT EXISTS idx_utilisateurs_matricule ON utilisateurs(matricule);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_paiements_statut ON paiements(statut);
CREATE INDEX IF NOT EXISTS idx_paiements_date ON paiements(date_paiement);
CREATE INDEX IF NOT EXISTS idx_signalements_statut ON signalements(statut);
CREATE INDEX IF NOT EXISTS idx_attributions_utilisateur ON attributions(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_logements_centre ON logements(centre_id);
CREATE INDEX IF NOT EXISTS idx_transactions_paiement ON transactions(paiement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_statut ON transactions(statut);

-- Afficher un résumé
SELECT 
  'VÉRIFICATION BASE DE DONNÉES' as info;

SELECT 
  table_name as table,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as nb_colonnes,
  (
    SELECT COUNT(*) 
    FROM information_schema.tables ist 
    WHERE ist.table_name = t.table_name 
    AND ist.table_schema = 'public'
  ) as existe
FROM (
  VALUES 
    ('utilisateurs'),
    ('centres'),
    ('logements'),
    ('attributions'),
    ('paiements'),
    ('transactions'),
    ('signalements'),
    ('annonces')
) AS t(table_name)
ORDER BY table_name;

-- Compter les enregistrements
SELECT 
  'utilisateurs' as table, COUNT(*) as nb_lignes FROM utilisateurs
UNION ALL
SELECT 'centres', COUNT(*) FROM centres
UNION ALL
SELECT 'logements', COUNT(*) FROM logements
UNION ALL
SELECT 'attributions', COUNT(*) FROM attributions
UNION ALL
SELECT 'paiements', COUNT(*) FROM paiements
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'signalements', COUNT(*) FROM signalements
UNION ALL
SELECT 'annonces', COUNT(*) FROM annonces
ORDER BY table;