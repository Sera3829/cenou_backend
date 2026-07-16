/**
 * Erreur métier portant un statut HTTP.
 *
 * Les services lèvent des HttpError ; les contrôleurs les traduisent en
 * réponse HTTP sans connaître la logique métier. Toute autre erreur est
 * traitée comme un 500.
 *
 *   throw new HttpError(409, 'Ce matricule est déjà enregistré');
 *   throw new HttpError(400, 'Montant invalide', { montant_attendu: 9000 });
 */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Traduit une erreur en réponse HTTP dans un contrôleur.
 * @param {Response} res
 * @param {Error} error
 * @param {String} messageParDefaut - message du 500 générique
 */
const repondreErreur = (res, error, messageParDefaut) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, ...error.extra });
  }
  console.error(`❌ ${messageParDefaut}:`, error);
  return res.status(500).json({
    error: messageParDefaut,
    details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
  });
};

module.exports = { HttpError, repondreErreur };
