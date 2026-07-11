const { verifyToken } = require('../utils/jwt');
const db = require('../config/database');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Middleware pour vérifier l'authentification JWT
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        error: 'Token d\'authentification manquant',
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (tokenError) {
      return res.status(401).json({
        error: 'Token invalide ou expiré',
        details: isDev ? tokenError.message : undefined,
      });
    }

    // Vérifier que l'utilisateur existe toujours en base
    const result = await db.query(
      `SELECT id, matricule, nom, prenom, email, role, statut, centre_id
       FROM utilisateurs WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Utilisateur introuvable',
      });
    }

    const user = result.rows[0];

    if (user.statut !== 'ACTIF') {
      return res.status(403).json({
        error: 'Compte désactivé ou suspendu',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Erreur authentification:', error.message);
    return res.status(500).json({
      error: 'Erreur lors de la vérification du token',
      details: isDev ? error.message : undefined,
    });
  }
};

/**
 * Middleware pour vérifier le rôle de l'utilisateur
 * @param {Array<String>} allowedRoles - Rôles autorisés
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentification requise',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Accès refusé : permissions insuffisantes',
      });
    }

    next();
  };
};

/**
 * Cloisonnement par centre.
 *
 * Retourne l'ID du centre auquel restreindre les données :
 *  - ADMIN : null (aucune restriction ; peut filtrer via ?centre_id=…)
 *  - GESTIONNAIRE : son centre_id. S'il n'est rattaché à aucun centre,
 *    retourne -1 (ne matche rien) — fail closed plutôt que tout exposer.
 *
 * Usage dans un handler :
 *   const centreScope = getCentreScope(req);           // null | number
 *   if (centreScope !== null) { where += ` AND c.id = $n`; params.push(centreScope); }
 */
const getCentreScope = (req) => {
  if (req.user?.role === 'GESTIONNAIRE') {
    if (!req.user.centre_id) {
      console.warn(`⚠️ Gestionnaire ${req.user.matricule} sans centre rattaché — accès aux données refusé (fail closed).`);
      return -1;
    }
    return req.user.centre_id;
  }
  return null;
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  getCentreScope,
};
