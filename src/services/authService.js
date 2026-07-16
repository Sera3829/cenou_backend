/**
 * Logique métier : inscription, connexion, profil, refresh.
 * Aucune notion de HTTP ici — les erreurs métier sont des HttpError
 * que le contrôleur traduit en réponses.
 */
const db = require('../config/database');
const { HttpError } = require('../utils/httpError');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateToken } = require('../utils/jwt');
const userRepository = require('../repositories/userRepository');
const logementRepository = require('../repositories/logementRepository');
const sessionService = require('./sessionService');

/**
 * Inscription d'un étudiant avec auto-attribution de la première
 * chambre disponible (verrouillée contre les inscriptions simultanées).
 */
const inscrire = async ({ matricule, nom, prenom, email, telephone, mot_de_passe }) => {
  const client = await db.getClient();

  try {
    if (await userRepository.existeMatricule(matricule, client)) {
      throw new HttpError(409, 'Ce matricule est déjà enregistré');
    }
    if (await userRepository.existeEmail(email, null, client)) {
      throw new HttpError(409, 'Cet email est déjà enregistré');
    }

    const motDePasseHache = await hashPassword(mot_de_passe);

    await client.query('BEGIN');

    const newUser = await userRepository.insererEtudiant(
      { matricule, nom, prenom, email, telephone, motDePasseHache },
      client
    );

    // Auto-attribution : première chambre disponible
    let attribution = null;
    const chambre = await logementRepository.reserverChambreDisponible(client);
    if (chambre) {
      const dateDebut = new Date().toISOString().split('T')[0];
      await logementRepository.insererAttribution(
        { utilisateurId: newUser.id, logementId: chambre.id, dateDebut },
        client
      );
      await logementRepository.changerStatut(chambre.id, 'OCCUPE', client);
      attribution = await logementRepository.infosLogement(chambre.id, client);
      console.log(`✅ Chambre ${attribution?.numero_chambre} attribuée à ${matricule}`);
    } else {
      console.warn(`⚠️ Aucune chambre disponible pour ${matricule}`);
    }

    await client.query('COMMIT');

    const token = generateToken({
      userId: newUser.id,
      matricule: newUser.matricule,
      role: newUser.role,
    });

    await sessionService.enregistrer(newUser.id, token);

    return { user: newUser, attribution, token };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    // Violation d'unicité : inscription simultanée avec même matricule/email
    if (error.code === '23505') {
      const champ = error.constraint?.includes('email') ? 'email' : 'matricule';
      throw new HttpError(409, `Ce ${champ} est déjà enregistré`);
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Connexion par matricule ou email.
 * Un nouveau login écrase la session précédente (session unique).
 */
const connecter = async ({ identifiant, mot_de_passe, plateforme }) => {
  const user = await userRepository.trouverPourConnexion(identifiant);

  if (!user) {
    throw new HttpError(401, 'Identifiant ou mot de passe incorrect');
  }

  if (user.statut !== 'ACTIF') {
    throw new HttpError(403, 'Compte désactivé ou suspendu. Contactez l\'administration.');
  }

  const motDePasseValide = await comparePassword(mot_de_passe, user.mot_de_passe);
  if (!motDePasseValide) {
    throw new HttpError(401, 'Identifiant ou mot de passe incorrect');
  }

  // Les comptes back-office n'utilisent pas l'application mobile
  if (plateforme === 'mobile' && ['ADMIN', 'GESTIONNAIRE'].includes(user.role)) {
    throw new HttpError(403, 'Accès non autorisé. Les administrateurs et gestionnaires doivent utiliser le dashboard web.');
  }

  const token = generateToken({
    userId: user.id,
    matricule: user.matricule,
    role: user.role,
  });

  await sessionService.enregistrer(user.id, token);
  await userRepository.marquerConnexion(user.id);

  return { user, token };
};

const deconnecter = async (userId) => {
  await sessionService.supprimer(userId);
};

/** Profil complet — vérifie que le token correspond à la session active */
const profil = async (userId, tokenCourant) => {
  const sessionOk = await sessionService.estValide(userId, tokenCourant);
  if (!sessionOk) {
    throw new HttpError(401, 'Session invalide. Veuillez vous reconnecter.');
  }

  const user = await userRepository.trouverProfilComplet(userId);
  if (!user) {
    throw new HttpError(404, 'Utilisateur introuvable');
  }
  return user;
};

const rafraichirToken = async ({ id, matricule, role }) => {
  const newToken = generateToken({ userId: id, matricule, role });
  await sessionService.rafraichir(id, newToken);
  return newToken;
};

module.exports = { inscrire, connecter, deconnecter, profil, rafraichirToken };
