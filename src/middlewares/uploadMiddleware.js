const multer = require('multer');
const path = require('path');

// Stockage en MÉMOIRE : les photos partent directement vers Cloudinary.
// Plus aucune écriture sur le disque local — sur Render, le disque est
// éphémère et les fichiers disparaissaient à chaque redéploiement.
const storage = multer.memoryStorage();

// Filtrer les types de fichiers acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Seules les images (JPEG, PNG, GIF, WebP) sont acceptées'));
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB par fichier
  },
  fileFilter,
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
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
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
};
