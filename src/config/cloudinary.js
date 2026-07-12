const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload une image vers Cloudinary
 * @param {string} filePath - Chemin local du fichier
 * @param {string} folder - Dossier dans Cloudinary
 * @returns {Promise<string>} URL publique de l'image
 */
const uploadImage = async (filePath, folder = 'signalements') => {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: folder,
    resource_type: 'image',
    transformation: [
      { quality: 'auto', fetch_format: 'auto' }, // Optimisation automatique
      { width: 1200, crop: 'limit' }             // Max 1200px de large
    ],
  });
  return result.secure_url; // URL HTTPS permanente
};

/**
 * Upload une image vers Cloudinary depuis un buffer mémoire
 * (multer memoryStorage : aucun fichier n'est écrit sur le disque,
 * indispensable sur Render dont le disque est éphémère).
 * @param {Buffer} buffer - Contenu du fichier
 * @param {string} folder - Dossier dans Cloudinary
 * @returns {Promise<string>} URL publique HTTPS de l'image
 */
const uploadBuffer = (buffer, folder = 'cenou/signalements') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' },
          { width: 1200, crop: 'limit' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Supprimer une image de Cloudinary
 * @param {string} publicId - ID public de l'image
 */
const deleteImage = async (publicId) => {
  await cloudinary.uploader.destroy(publicId);
};

module.exports = { cloudinary, uploadImage, uploadBuffer, deleteImage };