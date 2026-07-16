/**
 * Accès aux données : centres et étudiants d'un centre.
 */
const db = require('../config/database');

const liste = async (exec = db) => {
  const r = await exec.query(
    `SELECT id, nom, ville, adresse, capacite_totale, created_at
     FROM centres ORDER BY nom ASC`
  );
  return r.rows;
};

const parId = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT id, nom, ville, adresse, capacite_totale, created_at
     FROM centres WHERE id = $1`,
    [centreId]
  );
  return r.rows[0] || null;
};

const etudiantsDuCentre = async (centreId, exec = db) => {
  const r = await exec.query(
    `SELECT DISTINCT ON (u.id)
       u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone, u.statut,
       c.nom as centre_nom, l.numero_chambre
     FROM utilisateurs u
     INNER JOIN attributions a ON u.id = a.utilisateur_id
     INNER JOIN logements l ON a.logement_id = l.id
     INNER JOIN centres c ON l.centre_id = c.id
     WHERE c.id = $1
       AND u.role = 'ETUDIANT'
       AND u.statut = 'ACTIF'
       AND a.statut = 'ACTIVE'
     ORDER BY u.id, a.date_debut DESC`,
    [centreId]
  );
  return r.rows;
};

module.exports = { liste, parId, etudiantsDuCentre };
