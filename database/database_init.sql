
-- Table utilisateurs
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

-- Table centres
CREATE TABLE IF NOT EXISTS centres (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    ville VARCHAR(100) NOT NULL,
    adresse TEXT,
    capacite_totale INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table logements
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

-- Table attributions
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

-- Table paiements
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

-- Table signalements
CREATE TABLE IF NOT EXISTS signalements (
    id SERIAL PRIMARY KEY,
    attribution_id INTEGER REFERENCES attributions(id) ON DELETE CASCADE,
    type_probleme VARCHAR(30) CHECK (type_probleme IN ('PLOMBERIE', 'ELECTRICITE', 'TOITURE', 'SERRURE', 'MOBILIER', 'AUTRE')),
    description TEXT NOT NULL,
    photos TEXT[], -- Array de chemins d'images
    numero_suivi VARCHAR(20) UNIQUE NOT NULL,
    statut VARCHAR(20) DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'EN_COURS', 'RESOLU', 'ANNULE')),
    date_resolution TIMESTAMP,
    commentaire_resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table annonces
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

-- Index pour optimiser les performances
CREATE INDEX idx_utilisateurs_matricule ON utilisateurs(matricule);
CREATE INDEX idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX idx_paiements_statut ON paiements(statut);
CREATE INDEX idx_paiements_date ON paiements(date_paiement);
CREATE INDEX idx_signalements_statut ON signalements(statut);
CREATE INDEX idx_attributions_utilisateur ON attributions(utilisateur_id);
CREATE INDEX idx_logements_centre ON logements(centre_id);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_utilisateurs_updated_at BEFORE UPDATE ON utilisateurs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attributions_updated_at BEFORE UPDATE ON attributions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_paiements_updated_at BEFORE UPDATE ON paiements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signalements_updated_at BEFORE UPDATE ON signalements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annonces_updated_at BEFORE UPDATE ON annonces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Données de test (optionnel)
-- Centre de test
INSERT INTO centres (nom, ville, adresse, capacite_totale) 
VALUES ('CENOU Ouagadougou', 'Ouagadougou', 'Avenue de l''Indépendance', 200);

-- Utilisateur admin de test (mot de passe: admin123)
INSERT INTO utilisateurs (matricule, nom, prenom, email, telephone, mot_de_passe, role) 
VALUES ('ADMIN001', 'ADMIN', 'Système', 'admin@cenou.bf', '+22670000000', '$2a$10$xQH9z5L7qWJ5F0rY3nQ4zOqK4kHXvF.7JYC.1EqN0bWZH4V7ZH4V6', 'ADMIN');

COMMIT;