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
const annonceRepository = require('../../src/repositories/annonceRepository');
const annonceRoutes = require('../../src/routes/annonces');
const { generateToken } = require('../../src/utils/jwt');

// La garde de contrainte (DDL best-effort) ne doit pas toucher la base en test.
jest.spyOn(annonceRepository, 'assurerContrainteCible').mockResolvedValue(undefined);

const app = express();
app.use(express.json());
app.use('/api/annonces', annonceRoutes);

const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const etudiant = { id: 1, matricule: 'N1', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null };
const gestionnaire = { id: 4, matricule: 'G1', role: 'GESTIONNAIRE', statut: 'ACTIF', centre_id: 1 };
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

describe('Messagerie interne (staff)', () => {
  test('400 si GESTIONNAIRES_CENTRE sans centre_id', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titre: 'Réunion', contenu: 'Contenu', cible: 'GESTIONNAIRES_CENTRE' });
    expect(res.status).toBe(400);
  });

  test('400 si UTILISATEURS sans user_ids', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titre: 'Direct', contenu: 'Contenu', cible: 'UTILISATEURS' });
    expect(res.status).toBe(400);
  });

  test('note générale au staff : l\'auteur est exclu des destinataires', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                                          // auth
      .mockResolvedValueOnce({ rows: [{ id: 8, titre: 'Info', cible: 'GESTIONNAIRES', statut: 'PUBLIE', created_by: 3 }] }) // creer
      .mockResolvedValueOnce({ rows: [{ id: 3 }, { id: 4 }, { id: 5 }] })                 // idsGestionnaires (inclut l'auteur 3)
      .mockResolvedValueOnce({})                                                          // assurerTable
      .mockResolvedValueOnce({})                                                          // enregistrerDestinataires
      .mockResolvedValueOnce({})                                                          // journaliserActivite
      .mockResolvedValueOnce({ rows: [{ id: 8, titre: 'Info', total_destinataires: 2 }] }); // detailComplet
    const res = await request(app).post('/api/annonces/send')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titre: 'Info', contenu: 'Contenu général', cible: 'GESTIONNAIRES' });
    expect(res.status).toBe(200);
    // 3 membres staff dont l'auteur → 2 destinataires réels
    expect(res.body.data.destinataires.count).toBe(2);
  });

  test('GET /inbox : 403 pour un étudiant', async () => {
    db.query.mockResolvedValueOnce({ rows: [etudiant] });
    const res = await request(app).get('/api/annonces/inbox')
      .set('Authorization', `Bearer ${tokenFor(etudiant)}`);
    expect(res.status).toBe(403);
  });

  test('GET /inbox : messages + compteur non lus pour un gestionnaire', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [gestionnaire] })                    // auth
      .mockResolvedValueOnce({})                                          // assurerTable
      .mockResolvedValueOnce({ rows: [{ id: 8, titre: 'Info', lu: false }] }) // listePourStaff
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });                 // compteNonLues
    const res = await request(app).get('/api/annonces/inbox')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.unread_count).toBe(1);
  });

  test('PUT /:id/lu : marque lu et renvoie le compteur à jour', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [gestionnaire] })   // auth
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })      // marquerLue (UPDATE)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // compteNonLues
    const res = await request(app).put('/api/annonces/8/lu')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(0);
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
