const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Hacher un mot de passe
 * @param {String} password - Mot de passe en clair
 * @returns {Promise<String>} Mot de passe haché
 */
const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashed = await bcrypt.hash(password, salt);
    return hashed;
  } catch (error) {
    throw new Error('Erreur lors du hachage du mot de passe');
  }
};

/**
 * Comparer un mot de passe avec son hash
 * @param {String} password - Mot de passe en clair
 * @param {String} hashedPassword - Mot de passe haché
 * @returns {Promise<Boolean>} true si correspondance
 */
const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    throw new Error('Erreur lors de la comparaison du mot de passe');
  }
};

module.exports = {
  hashPassword,
  comparePassword,
};