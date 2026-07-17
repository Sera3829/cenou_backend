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

const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const gestionnaire = { id: 2, matricule: 'G1', role: 'GESTIONNAIRE', statut: 'ACTIF', centre_id: 1 };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

describe('Gestion des centres — réservée ADMIN', () => {
  test('403 : un gestionnaire ne peut pas créer un centre', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });
    const res = await request(app).post('/api/centres')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`)
      .send({ nom: 'CENOU X', ville: 'Ouaga' });
    expect(res.status).toBe(403);
  });

  test('403 : un gestionnaire ne peut pas lister la vue admin des centres', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });
    const res = await request(app).get('/api/centres/admin/all')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(403);
  });

  test('400 : création refusée sans nom/ville', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/centres')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ ville: 'Ouaga' });
    expect(res.status).toBe(400);
  });

  test('un admin crée un centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 5, nom: 'CENOU X', ville: 'Ouaga' }] });
    const res = await request(app).post('/api/centres')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ nom: 'CENOU X', ville: 'Ouaga', capacite_totale: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.nom).toBe('CENOU X');
  });

  test('409 : suppression refusée si le centre a des résidents actifs', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                       // auth
      .mockResolvedValueOnce({ rows: [{ id: 5, nom: 'CENOU X' }] })   // parId
      .mockResolvedValueOnce({ rows: [{ n: 12 }] });                  // nbResidentsActifs
    const res = await request(app).delete('/api/centres/5')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/résident/i);
  });

  test('un admin supprime un centre vide', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 6, nom: 'Vide' }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 6 }] });
    const res = await request(app).delete('/api/centres/6')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
  });
});

describe('Gestion des chambres — réservée ADMIN', () => {
  test('409 : chambre en double dans un centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                    // auth
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })                // centre parId
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });              // numeroExisteDansCentre → existe
    const res = await request(app).post('/api/centres/5/logements')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ numero_chambre: 'A-101', type_chambre: 'SIMPLE', prix_mensuel: 9000 });
    expect(res.status).toBe(409);
  });

  test('un admin crée une chambre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })                // centre existe
      .mockResolvedValueOnce({ rows: [] })                         // numéro libre
      .mockResolvedValueOnce({ rows: [{ id: 40, numero_chambre: 'A-101', prix_mensuel: 9000 }] });
    const res = await request(app).post('/api/centres/5/logements')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ numero_chambre: 'A-101', type_chambre: 'SIMPLE', prix_mensuel: 9000 });
    expect(res.status).toBe(201);
    expect(res.body.data.numero_chambre).toBe('A-101');
  });

  test('409 : suppression d\'une chambre occupée refusée', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                                  // auth
      .mockResolvedValueOnce({ rows: [{ id: 40, centre_id: 5, statut: 'OCCUPE' }] }); // statutLogement
    const res = await request(app).delete('/api/logements/40')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(409);
  });

  test('403 : un gestionnaire ne peut pas supprimer une chambre', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });
    const res = await request(app).delete('/api/logements/40')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(403);
  });
});
