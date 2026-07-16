/**
 * Logique métier : administration des utilisateurs (admin/gestionnaire).
 * Cloisonnement par centre appliqué ici (centreScope : null=admin, id=gestionnaire).
 */
const crypto = require('crypto');
const db = require('../config/database');
const { HttpError } = require('../utils/httpError');
const { hashPassword } = require('../utils/hash');
const userRepository = require('../repositories/userRepository');
const logementRepository = require('../repositories/logementRepository');

/** Mot de passe par défaut cryptographiquement sûr (crypto, pas Math.random) */
function genererMotDePasseParDefaut() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(10);
  let password = '';
  for (let i = 0; i < bytes.length; i++) password += chars[bytes[i] % chars.length];
  return password + 'A1!'; // garantit majuscule + chiffre + spécial
}

/**
 * Liste paginée (2 temps : IDs filtrés puis détails paginés).
 * centreScope non nul restreint aux utilisateurs du centre.
 */
const liste = async (query, centreScope) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const centre_id = centreScope !== null ? centreScope : query.centre_id;

  const filtres = { role: query.role, statut: query.statut, centre_id, search: query.search };
  const tousLesIds = await userRepository.idsFiltres(filtres);
  const total = tousLesIds.length;

  const offset = (page - 1) * limit;
  const idsPagines = tousLesIds.slice(offset, offset + limit);

  const users = idsPagines.length ? await userRepository.detailsPourIds(idsPagines) : [];

  return {
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

const etudiants = (centreScope) =>
  userRepository.etudiantsActifs(centreScope !== null ? centreScope : null);

/** Détail complet : utilisateur + paiements + signalements + stats */
const detail = async (userId, centreScope) => {
  const user = await userRepository.detailAdmin(userId, centreScope);
  if (!user) {
    throw new HttpError(404, 'Utilisateur non trouvé');
  }
  const [paiements, signalements, statistics] = await Promise.all([
    userRepository.paiementsRecents(userId),
    userRepository.signalementsRecents(userId),
    userRepository.statistiquesAdmin(userId),
  ]);
  return { user, paiements, signalements, statistics };
};

/**
 * Création d'un utilisateur par un admin/gestionnaire.
 * - GESTIONNAIRE ne peut créer que des ETUDIANT
 * - GESTIONNAIRE cloisonné au logement/centre de son périmètre
 * - centre_id persisté pour un GESTIONNAIRE (sinon il ne verrait rien)
 */
const creer = async (acteur, data) => {
  const {
    matricule, nom, prenom, email, telephone, role,
    statut = 'ACTIF', mot_de_passe, centre_id, logement_id, date_debut, date_fin,
  } = data;

  if (acteur.role === 'GESTIONNAIRE' && ['ADMIN', 'GESTIONNAIRE'].includes(role)) {
    throw new HttpError(403, 'Accès refusé. Un gestionnaire ne peut créer que des étudiants.');
  }

  const client = await db.getClient();
  try {
    // Cloisonnement : logement du périmètre du gestionnaire
    const centreScope = acteur.role === 'GESTIONNAIRE' ? (acteur.centre_id || -1) : null;
    if (centreScope !== null && logement_id) {
      const centreDuLogement = await logementRepository.trouverCentreDuLogement(logement_id, client);
      if (centreDuLogement !== centreScope) {
        throw new HttpError(403, 'Accès refusé. Ce logement n\'appartient pas à votre centre.');
      }
    }

    // centre_id : obligatoire et vérifié pour un GESTIONNAIRE ; null sinon
    let centreIdGestionnaire = null;
    if (role === 'GESTIONNAIRE') {
      if (!centre_id) {
        throw new HttpError(400, 'Le centre est obligatoire pour un gestionnaire.');
      }
      if (!(await logementRepository.centreExiste(centre_id, client))) {
        throw new HttpError(400, 'Centre introuvable.');
      }
      centreIdGestionnaire = centre_id;
    }

    if (await userRepository.existeMatricule(matricule, client)) {
      throw new HttpError(409, 'Ce matricule est déjà utilisé');
    }
    if (await userRepository.existeEmail(email, null, client)) {
      throw new HttpError(409, 'Cet email est déjà utilisé');
    }

    await client.query('BEGIN');

    const motDePasseUtilise = mot_de_passe || genererMotDePasseParDefaut();
    const newUser = await userRepository.insererParAdmin(
      {
        matricule, nom, prenom, email, telephone,
        motDePasseHache: await hashPassword(motDePasseUtilise),
        role, statut, creePar: acteur.id, centreId: centreIdGestionnaire,
      },
      client
    );

    if (role === 'ETUDIANT' && logement_id && date_debut) {
      await logementRepository.insererAttribution(
        { utilisateurId: newUser.id, logementId: logement_id, dateDebut: date_debut, dateFin: date_fin || null },
        client
      );
      await logementRepository.changerStatut(logement_id, 'OCCUPE', client);
    }

    await client.query('COMMIT');

    return {
      user: newUser,
      passwordGenerated: !mot_de_passe,
      temporaryPassword: !mot_de_passe ? motDePasseUtilise : undefined,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Mise à jour d'un utilisateur par un admin/gestionnaire.
 * Gère aussi le déménagement d'un étudiant (changement de logement).
 */
const mettreAJour = async (acteur, userId, updates) => {
  const client = await db.getClient();
  try {
    const user = await userRepository.infosPourAdmin(userId, client);
    if (!user) {
      throw new HttpError(404, 'Utilisateur non trouvé');
    }

    // Cloisonnement gestionnaire : uniquement ses étudiants et logements
    const centreScope = acteur.role === 'GESTIONNAIRE' ? (acteur.centre_id || -1) : null;
    if (centreScope !== null) {
      if (user.role !== 'ETUDIANT') {
        throw new HttpError(403, 'Accès refusé. Un gestionnaire ne peut modifier que des étudiants.');
      }
      if (!(await logementRepository.estDansCentre(userId, centreScope, client))) {
        throw new HttpError(403, 'Accès refusé. Cet étudiant n\'appartient pas à votre centre.');
      }
      if (updates.logement_id) {
        const centreDuLogement = await logementRepository.trouverCentreDuLogement(updates.logement_id, client);
        if (centreDuLogement !== centreScope) {
          throw new HttpError(403, 'Accès refusé. Ce logement n\'appartient pas à votre centre.');
        }
      }
    }

    if (updates.email && await userRepository.existeEmail(updates.email, userId, client)) {
      throw new HttpError(409, 'Cet email est déjà utilisé par un autre utilisateur');
    }

    // Le rattachement à un centre ne concerne que les gestionnaires
    const champs = { nom: updates.nom, prenom: updates.prenom, email: updates.email,
      telephone: updates.telephone, statut: updates.statut };
    if (updates.centre_id !== undefined && user.role === 'GESTIONNAIRE') {
      if (updates.centre_id !== null && !(await logementRepository.centreExiste(updates.centre_id, client))) {
        throw new HttpError(400, 'Centre introuvable.');
      }
      champs.centre_id = updates.centre_id;
    }

    await client.query('BEGIN');
    await userRepository.mettreAJourParAdmin(userId, champs, client);

    // Gestion de l'attribution pour les étudiants
    if (user.role === 'ETUDIANT' && (updates.logement_id || updates.date_debut || updates.date_fin)) {
      const existante = await userRepository.attributionActiveSimple(userId, client);

      if (existante) {
        await logementRepository.changerStatut(existante.logement_id, 'DISPONIBLE', client);
        if (updates.logement_id && updates.logement_id !== existante.logement_id) {
          // Déménagement : terminer l'ancienne, créer la nouvelle
          await logementRepository.terminerAttribution(existante.id, client);
          await logementRepository.insererAttribution(
            { utilisateurId: userId, logementId: updates.logement_id,
              dateDebut: updates.date_debut || new Date(), dateFin: updates.date_fin || null },
            client
          );
          await logementRepository.changerStatut(updates.logement_id, 'OCCUPE', client);
        } else {
          // Même logement : ré-occuper et mettre à jour les dates si fournies
          await logementRepository.changerStatut(existante.logement_id, 'OCCUPE', client);
        }
      } else if (updates.logement_id) {
        await logementRepository.insererAttribution(
          { utilisateurId: userId, logementId: updates.logement_id,
            dateDebut: updates.date_debut || new Date(), dateFin: updates.date_fin || null },
          client
        );
        await logementRepository.changerStatut(updates.logement_id, 'OCCUPE', client);
      }
    }

    await client.query('COMMIT');

    return userRepository.detailAdmin(userId, null, client);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Suppression = SOFT DELETE (statut INACTIF).
 * Le DELETE physique détruisait tout l'historique financier via CASCADE.
 */
const supprimer = async (acteur, userId) => {
  const client = await db.getClient();
  try {
    const cible = await userRepository.infosPourAdmin(userId, client);
    if (!cible) {
      throw new HttpError(404, 'Utilisateur non trouvé');
    }

    if (acteur.role === 'GESTIONNAIRE' && ['ADMIN', 'GESTIONNAIRE'].includes(cible.role)) {
      throw new HttpError(403, 'Accès refusé. Un gestionnaire ne peut pas supprimer un administrateur ou un autre gestionnaire.');
    }

    const centreScope = acteur.role === 'GESTIONNAIRE' ? (acteur.centre_id || -1) : null;
    if (centreScope !== null && !(await logementRepository.estDansCentre(userId, centreScope, client))) {
      throw new HttpError(403, 'Accès refusé. Cet étudiant n\'appartient pas à votre centre.');
    }

    await client.query('BEGIN');
    const attributions = await logementRepository.attributionsActives(userId, client);
    for (const a of attributions) {
      await logementRepository.terminerAttribution(a.id, client);
      await logementRepository.changerStatut(a.logement_id, 'DISPONIBLE', client);
    }
    await userRepository.desactiver(userId, client);
    await client.query('COMMIT');

    return { matricule: cible.matricule };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/** Changement de statut (ADMIN/GESTIONNAIRE) avec garde-fous */
const changerStatut = async (acteur, userId, statut) => {
  const cible = await userRepository.infosPourAdmin(userId);
  if (!cible) {
    throw new HttpError(404, 'Utilisateur introuvable');
  }
  if (acteur.role === 'GESTIONNAIRE' && cible.role === 'ADMIN') {
    throw new HttpError(403, 'Accès refusé. Un gestionnaire ne peut pas modifier le statut d\'un administrateur.');
  }
  if (!['ACTIF', 'INACTIF', 'SUSPENDU'].includes(statut)) {
    throw new HttpError(400, 'Statut invalide. Valeurs acceptées: ACTIF, INACTIF, SUSPENDU');
  }
  return userRepository.changerStatut(userId, statut);
};

module.exports = {
  liste,
  etudiants,
  detail,
  creer,
  mettreAJour,
  supprimer,
  changerStatut,
};
