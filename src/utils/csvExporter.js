/**
 * Génération CSV simple pour les rapports admin.
 */
const toCsv = (headers, rows) =>
  [headers, ...rows].map((row) => row.join(',')).join('\n');

const rapportFinancierCsv = (data) =>
  toCsv(
    ['ID', 'Matricule', 'Nom', 'Prénom', 'Montant', 'Date Paiement', 'Mode', 'Statut', 'Chambre', 'Centre'],
    data.paiements.map((p) => [
      p.id, p.matricule, p.nom, p.prenom, p.montant,
      p.date_paiement, p.mode_paiement, p.statut, p.numero_chambre, p.centre_nom,
    ])
  );

const rapportUtilisateursCsv = (data) =>
  toCsv(
    ['ID', 'Matricule', 'Nom', 'Prénom', 'Email', 'Téléphone', 'Rôle', 'Statut', 'Centre', 'Chambre', 'Date Inscription'],
    data.users.map((u) => [
      u.id, u.matricule, u.nom, u.prenom, u.email, u.telephone,
      u.role, u.statut, u.centre_nom || 'N/A', u.numero_chambre || 'N/A', u.created_at,
    ])
  );

module.exports = { rapportFinancierCsv, rapportUtilisateursCsv };
