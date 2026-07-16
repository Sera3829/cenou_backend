/**
 * Logique métier : profil et compte de l'utilisateur connecté.
 */
const { HttpError } = require('../utils/httpError');
const { hashPassword, comparePassword } = require('../utils/hash');
const userRepository = require('../repositories/userRepository');
const logementRepository = require('../repositories/logementRepository');

const profil = async (userId, role) => {
  const user = await userRepository.profilDeBase(userId);
  if (!user) {
    throw new HttpError(404, 'Utilisateur introuvable');
  }
  let attribution = null;
  if (role === 'ETUDIANT') {
    attribution = await logementRepository.attributionActiveDetaillee(userId);
  }
  return { user, attribution };
};

const mettreAJourProfil = async (userId, { email, telephone }) => {
  if (email && await userRepository.existeEmail(email, userId)) {
    throw new HttpError(409, 'Cet email est déjà utilisé par un autre utilisateur');
  }
  const user = await userRepository.mettreAJourProfil(userId, { email, telephone });
  if (!user) {
    throw new HttpError(400, 'Aucune modification fournie');
  }
  return user;
};

const changerMotDePasse = async (userId, { ancien_mot_de_passe, nouveau_mot_de_passe }) => {
  const hacheActuel = await userRepository.hashMotDePasse(userId);
  if (!hacheActuel) {
    throw new HttpError(404, 'Utilisateur introuvable');
  }
  if (!(await comparePassword(ancien_mot_de_passe, hacheActuel))) {
    throw new HttpError(401, 'L\'ancien mot de passe est incorrect');
  }
  if (await comparePassword(nouveau_mot_de_passe, hacheActuel)) {
    throw new HttpError(400, 'Le nouveau mot de passe doit être différent de l\'ancien');
  }
  await userRepository.changerMotDePasse(userId, await hashPassword(nouveau_mot_de_passe));
};

const historiqueAttributions = async (userId, role) => {
  if (role !== 'ETUDIANT') {
    throw new HttpError(403, 'Cette fonctionnalité est réservée aux étudiants');
  }
  return logementRepository.historiqueAttributions(userId);
};

const statistiques = async (userId, role) => {
  if (role !== 'ETUDIANT') {
    throw new HttpError(403, 'Cette fonctionnalité est réservée aux étudiants');
  }
  return userRepository.statistiquesEtudiant(userId);
};

const desactiverSonCompte = async (userId, { mot_de_passe }) => {
  const hache = await userRepository.hashMotDePasse(userId);
  if (!hache) {
    throw new HttpError(404, 'Utilisateur introuvable');
  }
  if (!(await comparePassword(mot_de_passe, hache))) {
    throw new HttpError(401, 'Mot de passe incorrect');
  }
  await userRepository.desactiver(userId);
};

module.exports = {
  profil,
  mettreAJourProfil,
  changerMotDePasse,
  historiqueAttributions,
  statistiques,
  desactiverSonCompte,
};
