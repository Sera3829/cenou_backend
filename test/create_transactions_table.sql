-- =========================================
-- Créer la table transactions
-- =========================================

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  paiement_id INTEGER REFERENCES paiements(id) ON DELETE CASCADE,
  montant DECIMAL(10, 2) NOT NULL,
  statut VARCHAR(20) NOT NULL CHECK (statut IN ('INITIE', 'EN_ATTENTE', 'CONFIRME', 'ECHEC', 'REMBOURSE')),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_transactions_paiement ON transactions(paiement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_statut ON transactions(statut);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_transactions_updated_at_trigger ON transactions;
CREATE TRIGGER update_transactions_updated_at_trigger
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_transactions_updated_at();

-- Vérifier la création
SELECT 
  'Table transactions créée' as status,
  COUNT(*) as nombre_colonnes
FROM information_schema.columns 
WHERE table_name = 'transactions';

-- Afficher la structure
\d transactions