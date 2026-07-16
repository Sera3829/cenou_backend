jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/config/database');
const centreRoutes = require('../../src/routes/centreRoutes');
const logementRoutes = require('../../src/routes/logementRoutes');
const { generateToken } = require('../../src/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api/centres', centreRoutes);
app.use('/api/logements', logementRoutes);

const etudiant = { id: 1, matricule: 'N1', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null };
const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

describe('routes /api/centres', () => {
  test('401 sans token', async () => {
    expect((await request(app).get('/api/centres')).status).toBe(401);
  });

  test('liste des centres', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [etudiant] })
      .mockResolvedValueOnce({ rows: [{ id: 1, nom: 'CENOU Ouaga' }, { id: 2, nom: 'CENOU Bobo' }] });
    const res = await request(app).get('/api/centres').set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  test('404 centre inexistant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/centres/999').set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(404);
  });

  test('403 : un étudiant ne peut pas lister les étudiants d\'un centre', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app).get('/api/centres/1/etudiants').set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(403);
  });

  test('un admin liste les étudiants d\'un centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 1, matricule: 'N1' }] });
    const res = await request(app).get('/api/centres/1/etudiants').set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe('routes /api/logements', () => {
  test('liste filtrée par centre passe le filtre en paramètre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [etudiant] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] });
    const res = await request(app)
      .get('/api/logements?centre_id=2&statut=DISPONIBLE')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(200);
    const listeCall = db.query.mock.calls[1];
    expect(listeCall[1]).toContain(2);
    expect(listeCall[1]).toContain('DISPONIBLE');
  });

  test('404 logement inexistant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/logements/999').set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(404);
  });
});
