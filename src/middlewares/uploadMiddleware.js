const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, '../../uploads/signalements');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration du stockage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Générer un nom unique : timestamp-random-extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'signalement-' + uniqueSuffix + ext);
  }
});

// Filtrer les types de fichiers acceptés
const fileFilter = (req, file, cb) => {
  // Accepter uniquement les images
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Seules les images (JPEG, PNG, GIF, WebP) sont acceptées'));
  }
};

// Configuration de multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite à 10 MB par fichier
  },
  fileFilter: fileFilter,
});

// Middleware pour upload multiple (max 5 photos)
const uploadSignalementPhotos = upload.array('photos', 5);

// Wrapper pour gérer les erreurs multer
const handleUploadErrors = (req, res, next) => {
  uploadSignalementPhotos(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'Fichier trop volumineux',
          details: 'La taille maximale par fichier est de 10 MB',
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          error: 'Trop de fichiers',
          details: 'Maximum 5 photos autorisées',
        });
      }
      return res.status(400).json({
        error: 'Erreur lors de l\'upload',
        details: err.message,
      });
    } else if (err) {
      return res.status(400).json({
        error: 'Erreur lors de l\'upload',
        details: err.message,
      });
    }
    next();
  });
};

module.exports = {
  uploadSignalementPhotos: handleUploadErrors,
  uploadsDir,
};