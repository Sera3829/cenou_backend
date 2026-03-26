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
    return res.status(401).json({
      error: 'Token invalide',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expiré',
    });
  }

  // Erreur PostgreSQL
  if (err.code) {
    return res.status(500).json({
      error: 'Erreur base de données',
      code: err.code,
    });
  }

  // Erreur générique
  res.status(err.status || 500).json({
    error: err.message || 'Erreur serveur interne',
  });
};

module.exports = errorHandler;