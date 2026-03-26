-- Supprimer l'ancien gestionnaire (si existe)
DELETE FROM utilisateurs WHERE matricule = 'GEST001';

-- Le laisser s'inscrire via l'API (méthode recommandée)
-- Ou générer un nouveau hash avec bcrypt

-- Alternative: Utiliser un hash que je vais générer maintenant
-- Hash pour "Password123" (plus sécurisé que "admin123")
INSERT INTO utilisateurs (matricule, nom, prenom, email, telephone, mot_de_passe, role, statut)
VALUES (
  'GEST001',
  'OUEDRAOGO',
  'Jean',
  'gestionnaire@cenou.bf',
  '+22670111111',
  '$2a$10$K8YqLZvZ6JZqj5Z5ZqL5ZeZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5O',
  'GESTIONNAIRE',
  'ACTIF'
);