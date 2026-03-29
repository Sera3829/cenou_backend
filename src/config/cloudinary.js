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
 * Supprimer une image de Cloudinary
 * @param {string} publicId - ID public de l'image
 */
const deleteImage = async (publicId) => {
  await cloudinary.uploader.destroy(publicId);
};

module.exports = { cloudinary, uploadImage, deleteImage };