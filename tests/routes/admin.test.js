jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/config/database');
const adminRoutes = require('../../src/routes/admin');
const { generateToken } = require('../../src/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const gestionnaire = { id: 2, matricule: 'G1', role: 'GESTIONNAIRE', statut: 'ACTIF', centre_id: 1 };
const etudiant = { id: 1, matricule: 'N1', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

// Réponses des 4 requêtes du rapport financier (paiements, totals, by_mode, by_centre)
const mockRapportFinancier = () => {
  db.query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ count_paiements: 0 }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
};

describe('GET /api/admin/reports/financial — sécurité des filtres', () => {
  test('403 pour un étudiant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app).get('/api/admin/reports/financial')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(403);
  });

  test('400 : une date d\'injection est rejetée par la validation ISO8601', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const injection = "2026-01-01'; DROP TABLE paiements;--";
    const res = await request(app)
      .get(`/api/admin/reports/financial?date_from=${encodeURIComponent(injection)}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(400);
  });

  test('des filtres valides partent en PARAMÈTRES SQL (jamais interpolés)', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    mockRapportFinancier();
    const res = await request(app)
      .get('/api/admin/reports/financial?date_from=2026-01-01&centre_id=5')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);

    const sqlCalls = db.query.mock.calls.slice(1);
    for (const [sql] of sqlCalls) {
      expect(String(sql)).not.toMatch(/2026-01-01/); // la valeur n'est jamais dans le texte SQL
    }
    const paiementsCall = sqlCalls[0];
    expect(paiementsCall[1]).toContain('2026-01-01');  // liée en paramètre
    expect(paiementsCall[1]).toContain('5');           // centre_id (query string)
  });

  test('un gestionnaire est cloisonné à son centre, pas celui demandé', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });
    mockRapportFinancier();
    const res = await request(app)
      .get('/api/admin/reports/financial?centre_id=99')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(200);
    const paiementsCall = db.query.mock.calls[1];
    expect(paiementsCall[1]).toContain(1);        // son centre imposé
    expect(paiementsCall[1]).not.toContain('99'); // pas celui demandé
  });
});

describe('GET /api/admin/dashboard/stats', () => {
  test('403 pour un étudiant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app).get('/api/admin/dashboard/stats')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(403);
  });

  test('un admin récupère les stats agrégées', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ total_etudiants: 10 }] })
      .mockResolvedValueOnce({ rows: [{ total_paiements: 3 }] })
      .mockResolvedValueOnce({ rows: [{ total_signalements: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, nom: 'C' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/admin/dashboard/stats')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.general.total_etudiants).toBe(10);
  });
});
