/**
 * Accès aux données : utilisateurs.
 * Chaque fonction accepte un exécuteur optionnel (client transactionnel) ;
 * par défaut, le pool partagé.
 */
const db = require('../config/database');

const existeMatricule = async (matricule, exec = db) => {
  const r = await exec.query('SELECT id FROM utilisateurs WHERE matricule = $1', [matricule]);
  return r.rows.length > 0;
};

const existeEmail = async (email, excludeId = null, exec = db) => {
  const r = excludeId
    ? await exec.query('SELECT id FROM utilisateurs WHERE email = $1 AND id != $2', [email, excludeId])
    : await exec.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
  return r.rows.length > 0;
};

/** Profil complet (avec attribution active) par identifiant matricule/email — pour le login */
const trouverPourConnexion = async (identifiant, exec = db) => {
  const r = await exec.query(
    `SELECT
      u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.mot_de_passe, u.role, u.statut,
      l.numero_chambre,
      l.type_chambre,
      l.prix_mensuel::integer AS loyer_mensuel,
      c.nom AS nom_centre,
      c.ville,
      a.date_debut,
      a.date_fin,
      a.statut AS statut_attribution
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE (u.matricule = $1 OR u.email = $1)`,
    [identifiant]
  );
  return r.rows[0] || null;
};

/** Profil complet (avec attribution active) par id — pour /auth/me */
const trouverProfilComplet = async (userId, exec = db) => {
  const r = await exec.query(
    `SELECT
      u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.role, u.statut, u.created_at,
      l.numero_chambre,
      l.type_chambre,
      l.prix_mensuel::integer AS loyer_mensuel,
      c.nom AS nom_centre,
      c.ville,
      a.date_debut,
      a.date_fin,
      a.statut AS statut_attribution
     FROM utilisateurs u
     LEFT JOIN attributions a ON u.id = a.utilisateur_id AND a.statut = 'ACTIVE'
     LEFT JOIN logements l ON a.logement_id = l.id
     LEFT JOIN centres c ON l.centre_id = c.id
     WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || null;
};

const insererEtudiant = async ({ matricule, nom, prenom, email, telephone, motDePasseHache }, exec = db) => {
  const r = await exec.query(
    `INSERT INTO utilisateurs (matricule, nom, prenom, email, telephone, mot_de_passe, role, statut)
     VALUES ($1, $2, $3, $4, $5, $6, 'ETUDIANT', 'ACTIF')
     RETURNING id, matricule, nom, prenom, email, telephone, role, statut, created_at`,
    [matricule, nom, prenom, email, telephone || null, motDePasseHache]
  );
  return r.rows[0];
};

const insererParAdmin = async (
  { matricule, nom, prenom, email, telephone, motDePasseHache, role, statut, creePar, centreId },
  exec = db
) => {
  const r = await exec.query(
    `INSERT INTO utilisateurs (
       matricule, nom, prenom, email, telephone,
       mot_de_passe, role, statut, created_by, centre_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, matricule, nom, prenom, email, telephone, role, statut, centre_id, created_at`,
    [matricule, nom, prenom, email, telephone || null, motDePasseHache, role, statut, creePar, centreId]
  );
  return r.rows[0];
};

const marquerConnexion = async (userId, exec = db) => {
  await exec.query('UPDATE utilisateurs SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
};

const trouverParId = async (userId, exec = db) => {
  const r = await exec.query(
    'SELECT id, matricule, nom, prenom, email, role, statut, centre_id FROM utilisateurs WHERE id = $1',
    [userId]
  );
  return r.rows[0] || null;
};

const desactiver = async (userId, exec = db) => {
  await exec.query(
    `UPDATE utilisateurs SET statut = 'INACTIF', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [userId]
  );
};

module.exports = {
  existeMatricule,
  existeEmail,
  trouverPourConnexion,
  trouverProfilComplet,
  insererEtudiant,
  insererParAdmin,
  marquerConnexion,
  trouverParId,
  desactiver,
};
