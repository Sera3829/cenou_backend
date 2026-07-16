jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));
// La diffusion FCM est mockée : aucun appel Firebase réel.
jest.mock('../../src/services/notificationBroadcastService', () => ({
  diffuserAnnonce: jest.fn().mockResolvedValue({ success: true, sent: 0, failed: 0 }),
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/config/database');
const broadcast = require('../../src/services/notificationBroadcastService');
const annonceRoutes = require('../../src/routes/annonces');
const { generateToken } = require('../../src/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api/annonces', annonceRoutes);

const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const etudiant = { id: 1, matricule: 'N1', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

describe('POST /api/annonces/send', () => {
  test('403 pour un étudiant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`)
      .send({ titre: 'T', contenu: 'C', cible: 'TOUS' });
    expect(res.status).toBe(403);
  });

  test('400 si titre/contenu/cible manquant', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titre: 'T' });
    expect(res.status).toBe(400);
  });

  test('400 si cible CENTRE_SPECIFIQUE sans centre_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titre: 'T', contenu: 'Contenu', cible: 'CENTRE_SPECIFIQUE' });
    expect(res.status).toBe(400);
  });

  test('crée une annonce TOUS et déclenche la diffusion', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                                    // auth
      .mockResolvedValueOnce({ rows: [{ id: 7, titre: 'T', contenu: 'Contenu', cible: 'TOUS', statut: 'PUBLIE', created_by: 3 }] }) // creer
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })                      // idsTousEtudiants
      .mockResolvedValueOnce({})                                                    // assurerTable
      .mockResolvedValueOnce({})                                                    // enregistrerDestinataires
      .mockResolvedValueOnce({})                                                    // journaliserActivite
      .mockResolvedValueOnce({ rows: [{ id: 7, titre: 'T', total_destinataires: 2 }] }); // detailComplet
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titre: 'T', contenu: 'Contenu', cible: 'TOUS' });
    expect(res.status).toBe(200);
    expect(res.body.data.destinataires.count).toBe(2);
    // setImmediate : laisser la diffusion async se déclencher
    await new Promise((r) => setImmediate(r));
    expect(broadcast.diffuserAnnonce).toHaveBeenCalled();
  });
});

describe('GET /api/annonces/:id — accès étudiant', () => {
  test('403 si l\'étudiant n\'a pas accès à l\'annonce', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [etudiant] })                 // auth
      .mockResolvedValueOnce({ rows: [{ id: 9, cible: 'ETUDIANTS' }] }) // detailPourUtilisateur
      .mockResolvedValueOnce({ rows: [] });                        // etudiantAAcces → aucun
    const res = await request(app).get('/api/annonces/9')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(403);
  });

  test('404 si l\'annonce n\'existe pas', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [etudiant] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/annonces/999')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/annonces/admin/:id/statut', () => {
  test('400 statut invalide', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).put('/api/annonces/admin/7/statut')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ statut: 'NIMPORTEQUOI' });
    expect(res.status).toBe(400);
  });

  test('404 annonce inexistante', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [] }); // changerStatut → aucune ligne
    const res = await request(app).put('/api/annonces/admin/999/statut')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ statut: 'ARCHIVE' });
    expect(res.status).toBe(404);
  });
});
