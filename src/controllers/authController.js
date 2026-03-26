const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateToken } = require('../utils/jwt');
const { db: firebaseDb, isFirebaseAvailable } = require('../config/firebase');

/**
 * Inscription d'un nouvel étudiant
 * POST /api/auth/register
 */
const register = async (req, res) => {
  const client = await db.getClient();
  
  try {
    const { matricule, nom, prenom, email, telephone, mot_de_passe } = req.body;

    // Vérifier si le matricule existe déjà
    const existingMatricule = await client.query(
      'SELECT id FROM utilisateurs WHERE matricule = $1',
      [matricule]
    );

    if (existingMatricule.rows.length > 0) {
      return res.status(409).json({
        error: 'Ce matricule est déjà enregistré',
      });
    }

    // Vérifier si l'email existe déjà
    const existingEmail = await client.query(
      'SELECT id FROM utilisateurs WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        error: 'Cet email est déjà enregistré',
      });
    }

    // Hacher le mot de passe
    const hashedPassword = await hashPassword(mot_de_passe);

    // Insérer le nouvel utilisateur
    const result = await client.query(
      `INSERT INTO utilisateurs (matricule, nom, prenom, email, telephone, mot_de_passe, role, statut)
       VALUES ($1, $2, $3, $4, $5, $6, 'ETUDIANT', 'ACTIF')
       RETURNING id, matricule, nom, prenom, email, telephone, role, statut, created_at`,
      [matricule, nom, prenom, email, telephone || null, hashedPassword]
    );

    const newUser = result.rows[0];

    // Générer le token JWT
    const token = generateToken({
      userId: newUser.id,
      matricule: newUser.matricule,
      role: newUser.role,
    });

    // Enregistrer la session dans Firebase (optionnel - ne bloque pas si Firebase indisponible)
    if (isFirebaseAvailable()) {
      try {
        await firebaseDb.collection('sessions').doc(newUser.id.toString()).set({
          userId: newUser.id,
          token: token,
          loginAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        console.log('✅ Session Firebase créée');
      } catch (firebaseError) {
        console.error('⚠️ Erreur Firebase (non bloquante):', firebaseError.message);
        // On continue quand même, Firebase n'est pas critique pour l'inscription
      }
    } else {
      console.log('⚠️ Firebase indisponible - Session non enregistrée');
    }

    res.status(201).json({
      message: 'Inscription réussie',
      user: {
        id: newUser.id,
        matricule: newUser.matricule,
        nom: newUser.nom,
        prenom: newUser.prenom,
        email: newUser.email,
        telephone: newUser.telephone,
        role: newUser.role,
      },
      token: token,
    });
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'inscription',
      details: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Connexion d'un utilisateur
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { identifiant, mot_de_passe } = req.body;

    // Rechercher l'utilisateur par matricule OU email
const result = await db.query(
  `SELECT 
    u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone, 
    u.mot_de_passe, u.role, u.statut,
    l.numero_chambre,
    l.type_chambre,
    l.prix_mensuel::integer AS loyer_mensuel,  -- ✅ Cast en integer
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

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Identifiant ou mot de passe incorrect',
      });
    }

    const user = result.rows[0];

    // Vérifier le statut du compte
    if (user.statut !== 'ACTIF') {
      return res.status(403).json({
        error: 'Compte désactivé ou suspendu. Contactez l\'administration.',
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await comparePassword(mot_de_passe, user.mot_de_passe);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Identifiant ou mot de passe incorrect',
      });
    }

    // Générer le token JWT
    const token = generateToken({
      userId: user.id,
      matricule: user.matricule,
      role: user.role,
    });

    // Enregistrer la session dans Firebase (optionnel)
    if (isFirebaseAvailable()) {
      try {
        await firebaseDb.collection('sessions').doc(user.id.toString()).set({
          userId: user.id,
          token: token,
          loginAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        console.log('✅ Session Firebase créée');
      } catch (firebaseError) {
        console.error('⚠️ Erreur Firebase (non bloquante):', firebaseError.message);
      }
    }

    // Mettre à jour la date de dernière connexion
    await db.query(
      'UPDATE utilisateurs SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    res.json({
  message: 'Connexion réussie',
  user: {
    id: user.id,
    matricule: user.matricule,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    telephone: user.telephone,
    role: user.role,
    numero_chambre: user.numero_chambre,
    nom_centre: user.nom_centre,          
    loyer_mensuel: user.loyer_mensuel,      
    date_debut: user.date_debut,            
    date_fin: user.date_fin,                  
  },
  token: token,
});
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({
      error: 'Erreur lors de la connexion',
      details: error.message,
    });
  }
};

/**
 * Déconnexion d'un utilisateur
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Supprimer la session de Firebase (si disponible)
    if (isFirebaseAvailable()) {
      try {
        await firebaseDb.collection('sessions').doc(userId.toString()).delete();
        console.log('✅ Session Firebase supprimée');
      } catch (firebaseError) {
        console.error('⚠️ Erreur Firebase (non bloquante):', firebaseError.message);
      }
    }

    res.json({
      message: 'Déconnexion réussie',
    });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({
      error: 'Erreur lors de la déconnexion',
      details: error.message,
    });
  }
};

/**
 * Récupérer les informations de l'utilisateur connecté
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ NOUVEAU CODE (avec JOIN)
const result = await db.query(
  `SELECT 
    u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone, 
    u.role, u.statut, u.created_at,
    l.numero_chambre,
    l.type_chambre,
    l.prix_mensuel::integer AS loyer_mensuel,  -- ✅ Cast en integer
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

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Utilisateur introuvable',
      });
    }

    res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du profil',
      details: error.message,
    });
  }
};

/**
 * Rafraîchir le token JWT
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res) => {
  try {
    const userId = req.user.id;

    // Générer un nouveau token
    const newToken = generateToken({
      userId: req.user.id,
      matricule: req.user.matricule,
      role: req.user.role,
    });

    // Mettre à jour la session dans Firebase (si disponible)
    if (isFirebaseAvailable()) {
      try {
        await firebaseDb.collection('sessions').doc(userId.toString()).update({
          token: newToken,
          lastActivity: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        console.log('✅ Session Firebase mise à jour');
      } catch (firebaseError) {
        console.error('⚠️ Erreur Firebase (non bloquante):', firebaseError.message);
      }
    }

    res.json({
      message: 'Token rafraîchi avec succès',
      token: newToken,
    });
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token:', error);
    res.status(500).json({
      error: 'Erreur lors du rafraîchissement du token',
      details: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  refreshToken,
};