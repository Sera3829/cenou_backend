jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/config/database');
const paiementRoutes = require('../../src/routes/paiements');
const { generateToken } = require('../../src/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api/paiements', paiementRoutes);

const etudiant = {
  id: 1, matricule: 'N123456789', nom: 'K', prenom: 'E',
  email: 'e@t.bf', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null,
};
const gestionnaire = { ...etudiant, id: 2, matricule: 'G000000001', role: 'GESTIONNAIRE', centre_id: 3 };
const gestionnaireSansCentre = { ...gestionnaire, id: 4, matricule: 'G000000002', centre_id: null };
const admin = { ...etudiant, id: 3, matricule: 'A000000001', role: 'ADMIN' };

const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

describe('routes /api/paiements — authentification et rôles', () => {
  test('401 sans token', async () => {
    const res = await request(app).get('/api/paiements');
    expect(res.status).toBe(401);
  });

  test('un étudiant voit ses paiements', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [etudiant] }) // lookup authMiddleware
      .mockResolvedValueOnce({ rows: [{ id: 5, montant: 9000, statut: 'CONFIRME' }] });
    const res = await request(app)
      .get('/api/paiements')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(200);
    expect(res.body.paiements).toHaveLength(1);
  });

  test('403 pour un ADMIN sur la route étudiante', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app)
      .get('/api/paiements')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(403);
  });

  test('403 pour un ETUDIANT sur la route admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app)
      .get('/api/paiements/admin/all')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(403);
  });

  test('le callback public reste fermé sans secret', async () => {
    const res = await request(app)
      .post('/api/paiements/callback')
      .send({ reference: 'CENOU-1-AAAAAAAA', statut: 'SUCCESS' });
    expect(res.status).toBe(401);
  });
});

describe('routes /api/paiements — cloisonnement par centre', () => {
  test('un gestionnaire ne reçoit que les paiements de son centre (filtre SQL c.id = $n)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [gestionnaire] }) // lookup auth
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT
      .mockResolvedValueOnce({ rows: [] }); // SELECT paginé
    const res = await request(app)
      .get('/api/paiements/admin/all')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(200);

    // La requête de liste doit contenir le filtre centre avec l'id du gestionnaire
    const calls = db.query.mock.calls.slice(1); // hors lookup auth
    const hasCentreFilter = calls.some(
      ([sql, params]) => /c\.id = \$\d/.test(String(sql)) && (params || []).includes(3)
    );
    expect(hasCentreFilter).toBe(true);
  });

  test('un gestionnaire NON rattaché à un centre ne voit rien (fail closed)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [gestionnaireSansCentre] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/paiements/admin/all')
      .set('Authorization', `Bearer ${tokenFor(gestionnaireSansCentre)}`);
    expect(res.status).toBe(200);

    const calls = db.query.mock.calls.slice(1);
    const hasFailClosedFilter = calls.some(([, params]) => (params || []).includes(-1));
    expect(hasFailClosedFilter).toBe(true);
  });

  test('un admin n\'est pas restreint par centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/paiements/admin/all')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);

    const calls = db.query.mock.calls.slice(1);
    const hasCentreFilter = calls.some(([sql]) => /c\.id = \$\d/.test(String(sql)));
    expect(hasCentreFilter).toBe(false);
  });
});
