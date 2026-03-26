-- Créer un utilisateur gestionnaire
INSERT INTO utilisateurs (matricule, nom, prenom, email, telephone, mot_de_passe, role, statut)
VALUES (
  'GEST003',
  'KABORE',
  'MATHIEU',
  'gestionnairemat@cenou.bf',
  '+22670111111',
  '$2b$10$JH7V9R3nVh1Ipi8iA/22rOiGzjC0wE5dTjv8gTnC4V2Lj8J5KjQ/O', -- Mot de passe: admin123
  'GESTIONNAIRE',
  'ACTIF'
) ON CONFLICT (matricule) DO NOTHING;

-- Vérifier la création
SELECT id, matricule, nom, prenom, role FROM utilisateurs WHERE matricule = 'GEST003';