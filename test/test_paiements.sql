-- Créer un paiement en attente pour l'utilisateur Ali
INSERT INTO paiements (attribution_id, montant, date_echeance, mode_paiement, reference_transaction, statut)
VALUES (
  (SELECT id FROM attributions WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE matricule = 'N00273641682') AND statut = 'ACTIVE' LIMIT 1),
  3000.00,
  '2025-12-31',
  'ORANGE_MONEY',
  'CENOU-TEST-003',
  'EN_ATTENTE'
);

-- Créer un paiement confirmé (historique)
INSERT INTO paiements (attribution_id, montant, date_paiement, date_echeance, mode_paiement, reference_transaction, statut)
VALUES (
  (SELECT id FROM attributions WHERE utilisateur_id = (SELECT id FROM utilisateurs WHERE matricule = 'N00273641682') AND statut = 'ACTIVE' LIMIT 1),
  3000.00,
  '2025-09-15 10:30:00',
  '2025-09-31',
  'MOOV_MONEY',
  'CENOU-2025-SEP-CONFIRMED',
  'CONFIRME'
);

-- Vérifier les paiements créés
SELECT p.id, p.montant, p.date_paiement, p.date_echeance, p.mode_paiement, p.statut, u.matricule
FROM paiements p
JOIN attributions a ON p.attribution_id = a.id
JOIN utilisateurs u ON a.utilisateur_id = u.id
WHERE u.matricule = 'N00273641682';