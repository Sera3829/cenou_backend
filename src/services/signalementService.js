/**
 * Logique métier : signalements de problèmes.
 */
const crypto = require('crypto');
const db = require('../config/database');
const { HttpError } = require('../utils/httpError');
const { uploadBuffer } = require('../config/cloudinary');
const signalementRepository = require('../repositories/signalementRepository');
const logementRepository = require('../repositories/logementRepository');
const notificationPush = require('./notificationPushService');

// ── Côté étudiant ────────────────────────────────────────────────────────

/**
 * Créer un signalement, avec ou sans photos.
 * Les photos (buffers mémoire) partent vers Cloudinary AVANT la transaction.
 */
const creer = async (utilisateurId, { type_probleme, description }, photos = []) => {
  const client = await db.getClient();
  try {
    const attribution = await logementRepository.attributionActive(utilisateurId, client);
    if (!attribution) {
      throw new HttpError(400, 'Aucune attribution active trouvée');
    }

    const numeroSuivi = `#${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const photoUrls = [];
    if (photos.length > 0) {
      console.log(`📸 Upload de ${photos.length} photo(s) vers Cloudinary…`);
      for (const photo of photos) {
        try {
          const url = await uploadBuffer(photo.buffer, 'cenou/signalements');
          photoUrls.push(url);
        } catch (err) {
          console.error(`❌ Erreur upload photo: ${err.message}`);
        }
      }
      // Des photos étaient jointes mais aucune n'a pu être stockée :
      // on refuse plutôt que de créer un signalement amputé de ses preuves.
      if (photoUrls.length === 0) {
        throw new HttpError(502, 'Impossible de stocker les photos pour le moment. Réessayez.');
      }
    }

    await client.query('BEGIN');
    const signalement = await signalementRepository.inserer(
      {
        attributionId: attribution.id,
        typeProbleme: type_probleme,
        description,
        photos: photoUrls,
        numeroSuivi,
      },
      client
    );
    await client.query('COMMIT');

    await notificationPush.envoyer({
      userId: 'GESTIONNAIRE',
      title: `Nouveau signalement ${numeroSuivi}`,
      message: `${type_probleme} - Chambre ${attribution.numero_chambre}`,
      type: 'SIGNALEMENT',
      data: {
        signalement_id: signalement.id,
        numero_suivi: numeroSuivi,
        type_probleme,
        chambre: attribution.numero_chambre,
      },
    });

    return { signalement, attribution, photoUrls };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const listerPourUtilisateur = (utilisateurId) =>
  signalementRepository.listeParUtilisateur(utilisateurId);

const detailPourUtilisateur = async (signalementId, utilisateurId) => {
  const signalement = await signalementRepository.detailPourUtilisateur(signalementId, utilisateurId);
  if (!signalement) {
    throw new HttpError(404, 'Signalement introuvable ou accès non autorisé');
  }
  return signalement;
};

/** URL d'une photo (les anciennes photos sur disque local n'existent plus) */
const urlPhoto = async (signalementId, utilisateurId, index) => {
  const photos = await signalementRepository.photosPourUtilisateur(signalementId, utilisateurId);
  if (photos === null) {
    throw new HttpError(404, 'Signalement introuvable ou accès non autorisé');
  }
  if (!photos.length || index < 0 || index >= photos.length) {
    throw new HttpError(404, 'Photo introuvable');
  }
  const photo = photos[index];
  if (!/^https?:\/\//.test(photo)) {
    throw new HttpError(410, 'Cette photo n\'est plus disponible (ancien stockage local)');
  }
  return photo;
};

// ── Côté admin (cloisonné par centre) ────────────────────────────────────

const filtresEffectifs = (query, centreScope) => ({
  type: query.type,
  statut: query.statut,
  centre_id: centreScope !== null ? centreScope : query.centre_id,
  date_from: query.date_from,
  date_to: query.date_to,
  search: query.search,
});

const listeAdmin = async (query, centreScope) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const filtres = filtresEffectifs(query, centreScope);

  const { signalements, total } = await signalementRepository.listeAdmin(filtres, { page, limit });

  const formattes = signalements.map((s) => ({
    id: s.id,
    numero_suivi: s.numero_suivi,
    type_probleme: s.type_probleme,
    description: s.description,
    photos: s.photos || [],
    statut: s.statut,
    date_resolution: s.date_resolution,
    commentaire_resolution: s.commentaire_resolution,
    created_at: s.created_at,
    updated_at: s.updated_at,
    etudiant_nom_complet: `${s.nom || ''} ${s.prenom || ''}`.trim() || 'Non spécifié',
    matricule: s.matricule,
    telephone: s.telephone,
    email: s.email,
    nom_centre: s.nom_centre,
    ville: s.ville || 'Non spécifiée',
    numero_chambre: s.numero_chambre,
    type_chambre: s.type_chambre || 'Standard',
    photos_count: Array.isArray(s.photos) ? s.photos.length : 0,
  }));

  return {
    signalements: formattes,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    filters_applied: {
      type: query.type || null,
      statut: query.statut || null,
      centre_id: filtres.centre_id || null,
      date_from: query.date_from || null,
      date_to: query.date_to || null,
      search: query.search || null,
    },
  };
};

const statistiquesAdmin = (query, centreScope) =>
  signalementRepository.statistiquesAdmin(filtresEffectifs(query, centreScope));

const detailAdmin = async (signalementId, centreScope) => {
  const s = await signalementRepository.detailAdmin(signalementId, centreScope);
  if (!s) {
    throw new HttpError(404, 'Signalement introuvable');
  }
  return {
    id: s.id,
    numero_suivi: s.numero_suivi,
    type_probleme: s.type_probleme,
    description: s.description,
    photos: s.photos || [],
    statut: s.statut,
    date_resolution: s.date_resolution,
    commentaire_resolution: s.commentaire_resolution,
    created_at: s.created_at,
    updated_at: s.updated_at,
    etudiant_nom_complet: s.nom && s.prenom ? `${s.nom} ${s.prenom}`.trim() : 'Non spécifié',
    matricule: s.matricule,
    telephone: s.telephone,
    email: s.email,
    nom_centre: s.nom_centre,
    ville: s.ville || 'Non spécifiée',
    numero_chambre: s.numero_chambre,
    photos_count: Array.isArray(s.photos) ? s.photos.length : 0,
  };
};

const changerStatut = async (signalementId, { statut, commentaire_resolution }, centreScope) => {
  const client = await db.getClient();
  try {
    const existant = await signalementRepository.detailAdmin(signalementId, centreScope, client);
    if (!existant) {
      throw new HttpError(404, 'Signalement introuvable');
    }

    await client.query('BEGIN');
    const misAJour = await signalementRepository.mettreAJourStatut(
      signalementId,
      { statut, commentaireResolution: commentaire_resolution },
      client
    );
    await client.query('COMMIT');

    if (existant.user_id) {
      let title = 'Mise à jour signalement';
      let message = '';
      if (statut === 'EN_COURS') {
        title = 'Signalement pris en charge 🔧';
        message = 'Votre signalement est en cours de traitement.';
      } else if (statut === 'RESOLU') {
        title = 'Signalement résolu ✅';
        message = 'Votre problème a été résolu.';
      }
      await notificationPush.envoyer({
        userId: existant.user_id,
        title,
        message,
        type: 'SIGNALEMENT',
        data: { signalement_id: signalementId, numero_suivi: misAJour.numero_suivi, statut },
      });
    }

    return {
      ...misAJour,
      numero_chambre: existant.numero_chambre,
      nom_centre: existant.nom_centre,
      user_id: existant.user_id,
      nom: existant.nom,
      prenom: existant.prenom,
      etudiant_nom_complet: existant.nom && existant.prenom
        ? `${existant.nom} ${existant.prenom}`.trim()
        : 'Non spécifié',
      matricule: existant.matricule,
      telephone: existant.telephone,
      email: existant.email,
      photos_count: misAJour.photos ? misAJour.photos.length : 0,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const equipes = () => signalementRepository.equipesActives();

const affecterEquipe = async (signalementId, { equipe_id, commentaire }, assignePar, centreScope) => {
  const client = await db.getClient();
  try {
    const signalement = await signalementRepository.trouverEnAttente(signalementId, centreScope, client);
    if (!signalement) {
      throw new HttpError(404, 'Signalement non trouvé ou déjà pris en charge');
    }

    const equipe = await signalementRepository.equipeActiveParId(equipe_id, client);
    if (!equipe) {
      throw new HttpError(404, 'Équipe technique non trouvée');
    }

    await client.query('BEGIN');
    const misAJour = await signalementRepository.affecterEquipe(signalementId, equipe_id, client);
    await signalementRepository.insererHistorique(
      {
        signalementId,
        action: 'AFFECTATION',
        details: { equipe_id, equipe_nom: equipe.nom, commentaire, assigne_par: assignePar },
        effectuePar: assignePar,
      },
      client
    );
    await client.query('COMMIT');

    const user = await signalementRepository.utilisateurDuSignalement(signalementId, client);
    if (user) {
      await notificationPush.envoyer({
        userId: user.id,
        type: 'SIGNALEMENT',
        title: 'Signalement pris en charge',
        message: 'Une équipe technique a été affectée à votre signalement',
        data: { signalement_id: signalementId, equipe_id },
      });
    }

    return misAJour;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  creer,
  listerPourUtilisateur,
  detailPourUtilisateur,
  urlPhoto,
  listeAdmin,
  statistiquesAdmin,
  detailAdmin,
  changerStatut,
  equipes,
  affecterEquipe,
};
