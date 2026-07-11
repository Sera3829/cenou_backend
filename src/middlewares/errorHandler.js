const isDev = process.env.NODE_ENV !== 'production';

const errorHandler = (err, req, res, next) => {
  console.error('❌ Erreur:', err);

  // Erreur de validation
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Erreur de validation',
      details: err.details,
    });
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token invalide' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expiré' });
  }

  // Erreur CORS (origine refusée)
  if (err.message && err.message.startsWith('Origine non autorisée')) {
    return res.status(403).json({ error: 'Origine non autorisée' });
  }

  // Erreur PostgreSQL : ne jamais exposer le code/message SQL au client en prod
  if (err.code) {
    return res.status(500).json({
      error: 'Erreur base de données',
      details: isDev ? `${err.code}: ${err.message}` : undefined,
    });
  }

  // Erreur générique
  res.status(err.status || 500).json({
    error: err.status ? err.message : 'Erreur serveur interne',
    details: isDev ? err.message : undefined,
  });
};

module.exports = errorHandler;
