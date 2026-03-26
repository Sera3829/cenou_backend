const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Compresser une image si elle dépasse 5 MB
 * @param {String} filePath - Chemin du fichier original
 * @returns {Promise<Object>} Informations sur le fichier compressé
 */
const compressImage = async (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    console.log(`📸 Traitement image: ${path.basename(filePath)} (${fileSizeInMB.toFixed(2)} MB)`);

    // Si le fichier fait moins de 5 MB, pas besoin de compression
    if (fileSizeInMB <= 5) {
      console.log('✅ Image OK, pas de compression nécessaire');
      return {
        path: filePath,
        originalSize: stats.size,
        compressedSize: stats.size,
        compressed: false,
      };
    }

    // Compresser l'image
    const outputPath = filePath.replace(path.extname(filePath), '-compressed.jpg');

    await sharp(filePath)
      .resize(1920, 1920, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 80,
        progressive: true,
      })
      .toFile(outputPath);

    const compressedStats = fs.statSync(outputPath);
    const compressedSizeInMB = compressedStats.size / (1024 * 1024);

    console.log(`✅ Image compressée: ${compressedSizeInMB.toFixed(2)} MB (réduction de ${((1 - compressedStats.size / stats.size) * 100).toFixed(1)}%)`);

    // Supprimer le fichier original
    fs.unlinkSync(filePath);

    return {
      path: outputPath,
      originalSize: stats.size,
      compressedSize: compressedStats.size,
      compressed: true,
    };
  } catch (error) {
    console.error('❌ Erreur compression image:', error);
    throw error;
  }
};

/**
 * Compresser plusieurs images
 * @param {Array} filePaths - Tableau de chemins de fichiers
 * @returns {Promise<Array>} Tableau d'informations sur les fichiers compressés
 */
const compressMultipleImages = async (filePaths) => {
  const results = [];

  for (const filePath of filePaths) {
    try {
      const result = await compressImage(filePath);
      results.push(result);
    } catch (error) {
      console.error(`Erreur compression ${filePath}:`, error);
      results.push({
        path: filePath,
        error: error.message,
      });
    }
  }

  return results;
};

/**
 * Supprimer des fichiers
 * @param {Array} filePaths - Tableau de chemins de fichiers
 */
const deleteFiles = (filePaths) => {
  filePaths.forEach((filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Fichier supprimé: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error(`Erreur suppression ${filePath}:`, error);
    }
  });
};

module.exports = {
  compressImage,
  compressMultipleImages,
  deleteFiles,
};