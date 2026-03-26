-- =========================================
-- Script d'initialisation des logements CENOU
-- =========================================

-- 1. Créer ou récupérer le centre principal
INSERT INTO centres (nom, ville, adresse, capacite_totale)
VALUES ('CENOU Ouagadougou', 'Ouagadougou', 'Avenue de l''Indépendance', 200)
ON CONFLICT DO NOTHING;

-- Récupérer l'ID du centre
DO $$
DECLARE
  v_centre_id INT;
  v_user_id INT;
  v_logement_id INT;
BEGIN
  -- Récupérer l'ID du centre
  SELECT id INTO v_centre_id FROM centres WHERE nom = 'CENOU Ouagadougou' LIMIT 1;
  
  RAISE NOTICE 'Centre ID: %', v_centre_id;

  -- 2. Créer des logements (30 chambres pour commencer)
  
  -- Chambres simples (10 chambres)
  FOR i IN 1..10 LOOP
    INSERT INTO logements (centre_id, numero_chambre, type_chambre, prix_mensuel, statut)
    VALUES (
      v_centre_id,
      'S-' || LPAD(i::TEXT, 3, '0'), -- S-001, S-002, etc.
      'SIMPLE',
      2500.00,
      'DISPONIBLE'
    )
    ON CONFLICT (centre_id, numero_chambre) DO NOTHING;
  END LOOP;

  -- Chambres doubles (15 chambres)
  FOR i IN 1..15 LOOP
    INSERT INTO logements (centre_id, numero_chambre, type_chambre, prix_mensuel, statut)
    VALUES (
      v_centre_id,
      'C-' || LPAD(i::TEXT, 3, '0'), -- C-001, C-002, etc.
      'DOUBLE',
      3000.00,
      'DISPONIBLE'
    )
    ON CONFLICT (centre_id, numero_chambre) DO NOTHING;
  END LOOP;

  -- Studios (5 studios)
  FOR i IN 1..5 LOOP
    INSERT INTO logements (centre_id, numero_chambre, type_chambre, prix_mensuel, statut)
    VALUES (
      v_centre_id,
      'ST-' || LPAD(i::TEXT, 3, '0'), -- ST-001, ST-002, etc.
      'STUDIO',
      4000.00,
      'DISPONIBLE'
    )
    ON CONFLICT (centre_id, numero_chambre) DO NOTHING;
  END LOOP;

  RAISE NOTICE '30 logements créés';

  -- 3. Créer une attribution pour l'utilisateur actuel
  
  -- Récupérer l'ID de l'utilisateur
  SELECT id INTO v_user_id FROM utilisateurs WHERE matricule = 'N00294520241';
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Utilisateur N00294520241 introuvable, attribution non créée';
  ELSE
    -- Vérifier si l'utilisateur a déjà une attribution active
    IF EXISTS (SELECT 1 FROM attributions WHERE utilisateur_id = v_user_id AND statut = 'ACTIVE') THEN
      RAISE NOTICE 'L''utilisateur a déjà une attribution active';
    ELSE
      -- Attribuer la chambre C-127
      SELECT id INTO v_logement_id FROM logements 
      WHERE centre_id = v_centre_id AND numero_chambre = 'C-127' 
      LIMIT 1;
      
      IF v_logement_id IS NULL THEN
        -- Si C-127 n'existe pas, créer et attribuer
        INSERT INTO logements (centre_id, numero_chambre, type_chambre, prix_mensuel, statut)
        VALUES (v_centre_id, 'C-127', 'DOUBLE', 3000.00, 'DISPONIBLE')
        RETURNING id INTO v_logement_id;
      END IF;

      -- Créer l'attribution
      INSERT INTO attributions (utilisateur_id, logement_id, date_debut, date_fin, statut)
      VALUES (
        v_user_id,
        v_logement_id,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '9 months', -- 9 mois d'attribution
        'ACTIVE'
      );

      -- Mettre à jour le statut du logement
      UPDATE logements SET statut = 'OCCUPE' WHERE id = v_logement_id;

      RAISE NOTICE 'Attribution créée pour l''utilisateur % - Chambre C-127', v_user_id;
    END IF;
  END IF;

END $$;

-- 4. Afficher un résumé
SELECT 
  'RÉSUMÉ' as info,
  (SELECT COUNT(*) FROM centres) as nb_centres,
  (SELECT COUNT(*) FROM logements) as nb_logements,
  (SELECT COUNT(*) FROM logements WHERE statut = 'DISPONIBLE') as logements_disponibles,
  (SELECT COUNT(*) FROM logements WHERE statut = 'OCCUPE') as logements_occupes,
  (SELECT COUNT(*) FROM attributions WHERE statut = 'ACTIVE') as attributions_actives;

-- 5. Afficher les logements créés
SELECT 
  c.nom as centre,
  l.numero_chambre,
  l.type_chambre,
  l.prix_mensuel,
  l.statut
FROM logements l
JOIN centres c ON l.centre_id = c.id
ORDER BY l.type_chambre, l.numero_chambre
LIMIT 10;

-- 6. Afficher l'attribution de l'utilisateur
SELECT 
  u.matricule,
  u.nom,
  u.prenom,
  c.nom as centre,
  l.numero_chambre,
  l.type_chambre,
  l.prix_mensuel,
  a.date_debut,
  a.date_fin,
  a.statut
FROM attributions a
JOIN utilisateurs u ON a.utilisateur_id = u.id
JOIN logements l ON a.logement_id = l.id
JOIN centres c ON l.centre_id = c.id
WHERE u.matricule = 'N00294520241';