const { verifyToken } = require('../utils/jwt');
const db = require('../config/database');

/**
 * Middleware pour vérifier l'authentification JWT
 * VERSION AMÉLIORÉE AVEC LOGS DÉTAILLÉS
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Récupérer le token du header Authorization
    const authHeader = req.headers['authorization'];
    
    // ✅ LOG: Vérifier le header
    console.log('📤 Authorization Header:', authHeader ? `Bearer ${authHeader.substring(7, 27)}...` : 'MANQUANT');
    
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.log('❌ Token manquant dans le header');
      return res.status(401).json({
        error: 'Token d\'authentification manquant',
      });
    }

    // ✅ LOG: Token reçu
    console.log('🔑 Token reçu (premiers 30 car):', token.substring(0, 30) + '...');

    // Vérifier et décoder le token
    let decoded;
    try {
      decoded = verifyToken(token);
      console.log('✅ Token décodé avec succès, userId:', decoded.userId);
    } catch (tokenError) {
      // ✅ LOG: Erreur exacte du token
      console.error('❌ Erreur verifyToken:', tokenError.message);
      console.error('❌ Stack:', tokenError.stack);
      
      if (tokenError.message === 'Token invalide ou expiré') {
        return res.status(401).json({
          error: 'Token invalide ou expiré',
        });
      }
      
      // Retourner l'erreur exacte en développement
      return res.status(401).json({
        error: 'Token invalide',
        details: process.env.NODE_ENV === 'development' ? tokenError.message : undefined,
      });
    }

    // Vérifier que l'utilisateur existe toujours en base
    console.log('🔍 Recherche utilisateur en base, userId:', decoded.userId);
    
    const result = await db.query(
      'SELECT id, matricule, nom, prenom, email, role, statut FROM utilisateurs WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      console.log('❌ Utilisateur introuvable en base, userId:', decoded.userId);
      return res.status(401).json({
        error: 'Utilisateur introuvable',
      });
    }

    const user = result.rows[0];
    console.log('✅ Utilisateur trouvé:', user.matricule, '-', user.nom, user.prenom);

    // Vérifier que l'utilisateur est actif
    if (user.statut !== 'ACTIF') {
      console.log('❌ Compte non actif, statut:', user.statut);
      return res.status(403).json({
        error: 'Compte désactivé ou suspendu',
      });
    }

    // Ajouter les infos utilisateur à la requête
    req.user = user;
    console.log('✅ Authentification réussie pour:', user.matricule);
    
    next();
  } catch (error) {
    // ✅ LOG: Erreur détaillée
    console.error('❌❌❌ Erreur authentification CATCH GLOBAL:', error);
    console.error('❌ Message:', error.message);
    console.error('❌ Stack:', error.stack);
    
    return res.status(500).json({
      error: 'Erreur lors de la vérification du token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
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
      console.log('❌ authorizeRoles: Pas d\'utilisateur dans req.user');
      return res.status(401).json({
        error: 'Authentification requise',
      });
    }

    console.log('🔐 authorizeRoles: User role:', req.user.role, '| Allowed:', allowedRoles);

    if (!allowedRoles.includes(req.user.role)) {
      console.log('❌ Rôle refusé:', req.user.role, 'n\'est pas dans', allowedRoles);
      return res.status(403).json({
        error: 'Accès refusé : permissions insuffisantes',
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }

    console.log('✅ Autorisation accordée pour rôle:', req.user.role);
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
};