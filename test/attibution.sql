INSERT INTO attributions (
    utilisateur_id, 
    logement_id, 
    date_debut, 
    date_fin, 
    statut, 
    created_at, 
    updated_at
) VALUES (
    21, 
    19,
    '2025-12-11', -- Date de début
    '2026-01-11', -- Date de fin (1 mois après)
    'ACTIVE',
    NOW(),
    NOW()
)
RETURNING *;