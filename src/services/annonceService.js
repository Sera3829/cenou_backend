/**
 * Logique métier : annonces (création ciblée, diffusion, consultation).
 */
const { HttpError } = require('../utils/httpError');
const annonceRepository = require('../repositories/annonceRepository');
const broadcast = require('./notificationBroadcastService');

// Cibles étudiants (écran Annonces) + cibles internes staff (messagerie / cloche).
const CIBLES_VALIDES = [
  'TOUS', 'CENTRE_SPECIFIQUE', 'ETUDIANTS',
  'GESTIONNAIRES', 'GESTIONNAIRES_CENTRE', 'UTILISATEURS',
];
// Cibles de messagerie interne : l'auteur ne se notifie pas lui-même.
const CIBLES_STAFF = ['GESTIONNAIRES', 'GESTIONNAIRES_CENTRE', 'UTILISATEURS'];
const STATUTS_VALIDES = ['PUBLIE', 'BROUILLON', 'ARCHIVE'];

/** Résout la liste des destinataires selon la cible */
const resoudreDestinataires = async ({ cible, centre_id, user_ids }) => {
  if (cible === 'TOUS') {
    const ids = await annonceRepository.idsTousEtudiants();
    return { userIds: ids, info: `${ids.length} étudiant(s) - Tous` };
  }
  if (cible === 'CENTRE_SPECIFIQUE') {
    const ids = await annonceRepository.idsEtudiantsDuCentre(centre_id);
    const nom = await annonceRepository.nomCentre(centre_id);
    return { userIds: ids, info: `${ids.length} étudiant(s) - Centre: ${nom || `Centre ${centre_id}`}` };
  }
  if (cible === 'ETUDIANTS') {
    const ids = await annonceRepository.idsEtudiantsParmi(user_ids);
    return { userIds: ids, info: `${ids.length} étudiant(s) spécifique(s)` };
  }
  if (cible === 'GESTIONNAIRES') {
    const ids = await annonceRepository.idsGestionnaires();
    return { userIds: ids, info: `${ids.length} membre(s) du staff` };
  }
  if (cible === 'GESTIONNAIRES_CENTRE') {
    const ids = await annonceRepository.idsGestionnairesDuCentre(centre_id);
    const nom = await annonceRepository.nomCentre(centre_id);
    return { userIds: ids, info: `${ids.length} gestionnaire(s) - Centre: ${nom || `Centre ${centre_id}`}` };
  }
  if (cible === 'UTILISATEURS') {
    const ids = await annonceRepository.idsStaffParmi(user_ids);
    return { userIds: ids, info: `${ids.length} destinataire(s) direct(s)` };
  }
  return { userIds: [], info: '0 destinataire' };
};

const creer = async (createdBy, data) => {
  const { titre, contenu, cible, centre_id, statut = 'PUBLIE', user_ids,
    date_publication, date_expiration } = data;

  if (!titre || !contenu || !cible) {
    throw new HttpError(400, 'Titre, contenu et cible sont requis');
  }
  if (!CIBLES_VALIDES.includes(cible)) {
    throw new HttpError(400, `Cible invalide. Valeurs acceptées: ${CIBLES_VALIDES.join(', ')}`);
  }
  if ((cible === 'CENTRE_SPECIFIQUE' || cible === 'GESTIONNAIRES_CENTRE') && !centre_id) {
    throw new HttpError(400, 'centre_id est requis pour une diffusion par centre');
  }
  if ((cible === 'ETUDIANTS' || cible === 'UTILISATEURS') && (!user_ids || user_ids.length === 0)) {
    throw new HttpError(400, 'user_ids est requis pour un message ciblé');
  }

  // Garde-fou : s'assure que la contrainte cible accepte les cibles de messagerie.
  await annonceRepository.assurerContrainteCible();

  const annonce = await annonceRepository.creer({
    titre, contenu, cible, centreId: centre_id, statut, createdBy,
    datePublication: date_publication, dateExpiration: date_expiration,
  });

  let { userIds, info } = await resoudreDestinataires({ cible, centre_id, user_ids });
  // Messagerie interne : ne pas s'auto-notifier de son propre message.
  if (CIBLES_STAFF.includes(cible)) {
    userIds = userIds.filter((id) => Number(id) !== Number(createdBy));
  }

  await annonceRepository.assurerTableDestinataires();
  await annonceRepository.enregistrerDestinataires(annonce.id, userIds);

  // Diffusion push en arrière-plan (ne bloque pas la réponse)
  if (statut === 'PUBLIE' && userIds.length > 0) {
    setImmediate(() => {
      broadcast.diffuserAnnonce(annonce.id, titre, contenu, cible, userIds, createdBy)
        .catch((err) => console.error('❌ Diffusion async annonce:', err.message));
    });
  }

  await annonceRepository.journaliserActivite({
    utilisateurId: createdBy,
    titre: 'Annonce envoyée',
    description: `Annonce "${titre}" envoyée (${info})`,
    metadata: { annonce_id: annonce.id, titre, cible, destinataires_count: userIds.length, statut },
  });

  const complete = await annonceRepository.detailComplet(annonce.id);
  return { annonce: complete, destinataires: { count: userIds.length, info } };
};

const listeAdmin = (query) => annonceRepository.listeAdmin(query);

const listePourEtudiant = async (userId, { limit = 50, offset = 0 }) => {
  const annonces = await annonceRepository.listePourEtudiant(userId, limit, offset);
  const unreadCount = await annonceRepository.compteNonLues(userId);
  return { annonces, unreadCount };
};

/** Boîte de réception de messagerie interne pour un membre du staff. */
const inboxStaff = async (userId, { limit = 50, offset = 0 } = {}) => {
  await annonceRepository.assurerTableDestinataires();
  const messages = await annonceRepository.listePourStaff(userId, limit, offset);
  const unreadCount = await annonceRepository.compteNonLues(userId);
  return { messages, unreadCount };
};

/** Marque un message comme lu pour l'utilisateur courant ; renvoie le compte non lus à jour. */
const marquerLue = async (annonceId, userId) => {
  await annonceRepository.marquerLue(annonceId, userId);
  const unreadCount = await annonceRepository.compteNonLues(userId);
  return { unreadCount };
};

const detail = async (annonceId, userId, role) => {
  const annonce = await annonceRepository.detailPourUtilisateur(annonceId, userId);
  if (!annonce) {
    throw new HttpError(404, 'Annonce non trouvée');
  }
  if (role === 'ETUDIANT' && !(await annonceRepository.etudiantAAcces(annonceId, userId))) {
    throw new HttpError(403, 'Vous n\'avez pas accès à cette annonce');
  }
  return annonce;
};

const changerStatut = async (annonceId, statut) => {
  if (!STATUTS_VALIDES.includes(statut)) {
    throw new HttpError(400, 'Statut invalide. Valeurs acceptées: PUBLIE, BROUILLON, ARCHIVE');
  }
  const annonce = await annonceRepository.changerStatut(annonceId, statut);
  if (!annonce) {
    throw new HttpError(404, 'Annonce non trouvée');
  }

  // Rediffuser aux destinataires si (re)publication
  if (statut === 'PUBLIE') {
    const userIds = await annonceRepository.idsDestinataires(annonceId);
    if (userIds.length > 0) {
      await broadcast.diffuserAnnonce(
        annonce.id, annonce.titre, annonce.contenu, annonce.cible, userIds, annonce.created_by
      );
    }
  }
  return annonce;
};

const supprimer = async (annonceId) => {
  if (!(await annonceRepository.supprimer(annonceId))) {
    throw new HttpError(404, 'Annonce non trouvée');
  }
};

module.exports = {
  creer,
  listeAdmin,
  listePourEtudiant,
  inboxStaff,
  marquerLue,
  detail,
  changerStatut,
  supprimer,
};
