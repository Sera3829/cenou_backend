jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));
const os = require('os');
const path = require('path');
const fs = require('fs');

// Fichiers temporaires réels : res.download a besoin d'un fichier existant.
const tmp = (name) => {
  const p = path.join(os.tmpdir(), `cenou-test-${name}`);
  fs.writeFileSync(p, 'contenu de test');
  return p;
};

// Générateurs PDF/Excel mockés : renvoient un vrai fichier temporaire.
jest.mock('../../src/utils/pdfGenerator', () => ({
  generateFinancialReportPDF: jest.fn(),
  generateOccupationReportPDF: jest.fn(),
}));
jest.mock('../../src/utils/excelGenerator', () => ({
  generateFinancialReportExcel: jest.fn(),
  generateOccupationReportExcel: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const pdfGen = require('../../src/utils/pdfGenerator');
const xlsGen = require('../../src/utils/excelGenerator');

beforeAll(() => {
  pdfGen.generateFinancialReportPDF.mockResolvedValue({ filePath: tmp('f.pdf'), fileName: 'f.pdf' });
  pdfGen.generateOccupationReportPDF.mockResolvedValue({ filePath: tmp('o.pdf'), fileName: 'o.pdf' });
  xlsGen.generateFinancialReportExcel.mockResolvedValue({ filePath: tmp('f.xlsx'), fileName: 'f.xlsx' });
  xlsGen.generateOccupationReportExcel.mockResolvedValue({ filePath: tmp('o.xlsx'), fileName: 'o.xlsx' });
});
const db = require('../../src/config/database');
const rapportRepository = require('../../src/repositories/rapportRepository');
const rapportRoutes = require('../../src/routes/rapports');
const { generateToken } = require('../../src/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api/rapports', rapportRoutes);

const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const gestionnaire = { id: 2, matricule: 'G1', role: 'GESTIONNAIRE', statut: 'ACTIF', centre_id: 1 };
const etudiant = { id: 1, matricule: 'N1', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

describe('POST /api/rapports/financier', () => {
  test('403 pour un étudiant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app).post('/api/rapports/financier')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`)
      .send({ format: 'pdf' });
    expect(res.status).toBe(403);
  });

  test('400 si format invalide', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/rapports/financier')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ format: 'word' });
    expect(res.status).toBe(400);
  });

  test('un gestionnaire est cloisonné à son centre (repo appelé avec centre_id=1)', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] }); // auth
    const spy = jest.spyOn(rapportRepository, 'donneesFinancier').mockResolvedValue({
      statistiques: {}, par_mode_paiement: [], par_statut: [], par_mois: [], paiements: [],
    });
    jest.spyOn(rapportRepository, 'nomCentre').mockResolvedValue('CENOU Ouaga');

    const res = await request(app).post('/api/rapports/financier')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`)
      .send({ format: 'pdf', centre_id: 99 }); // demande 99, doit être forcé à 1

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ centre_id: 1 }));
    spy.mockRestore();
  });
});

describe('POST /api/rapports/occupation', () => {
  test('génère un rapport occupation Excel pour un admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    jest.spyOn(rapportRepository, 'donneesOccupation').mockResolvedValue({
      statistiques: {}, par_type_chambre: [], residents: [],
    });
    jest.spyOn(rapportRepository, 'nomCentre').mockResolvedValue('Tous les centres');

    const res = await request(app).post('/api/rapports/occupation')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ format: 'excel' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });
});
