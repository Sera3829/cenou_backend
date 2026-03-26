-- Créer un centre de test (si pas déjà fait)
INSERT INTO centres (nom, ville, adresse, capacite_totale) 
VALUES ('CENOU Ouagadougou', 'Ouagadougou', 'Avenue de l''Indépendance', 200)
ON CONFLICT DO NOTHING;

-- Créer un logement de test
INSERT INTO logements (centre_id, numero_chambre, type_chambre, prix_mensuel, statut)
VALUES (
  (SELECT id FROM centres WHERE nom = 'CENOU Ouagadougou' LIMIT 1),
  'C-127',
  'DOUBLE',
  3000.00,
  'OCCUPE'
) ON CONFLICT (centre_id, numero_chambre) DO NOTHING;

-- Créer une attribution pour l'utilisateur FIREBASE01 (ID 8)
INSERT INTO attributions (utilisateur_id, logement_id, date_debut, date_fin, statut)
VALUES (
  (SELECT id FROM utilisateurs WHERE matricule = 'FIREBASE01' LIMIT 1),
  (SELECT id FROM logements WHERE numero_chambre = 'C-127' LIMIT 1),
  '2024-09-01',
  '2025-06-30',
  'ACTIVE'
) ON CONFLICT DO NOTHING;

-- Vérifier les données créées
SELECT u.matricule, u.nom, u.prenom, 
       c.nom as centre, l.numero_chambre, l.prix_mensuel,
       a.date_debut, a.date_fin, a.statut
FROM utilisateurs u
JOIN attributions a ON u.id = a.utilisateur_id
JOIN logements l ON a.logement_id = l.id
JOIN centres c ON l.centre_id = c.id
WHERE u.matricule = 'FIREBASE01';