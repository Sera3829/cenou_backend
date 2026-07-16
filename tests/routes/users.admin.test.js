jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/config/database');
const userRoutes = require('../../src/routes/users');
const { generateToken } = require('../../src/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);

const admin = { id: 3, matricule: 'A000000001', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const gestionnaire = { id: 2, matricule: 'G00001', role: 'GESTIONNAIRE', statut: 'ACTIF', centre_id: 1 };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

const mockClient = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });

describe('GET /api/users/admin/all — cloisonnement', () => {
  test('un gestionnaire ne liste que son centre (filtre c.id avec son centre_id)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [gestionnaire] })  // auth lookup
      .mockResolvedValueOnce({ rows: [] });             // idsFiltres
    const res = await request(app)
      .get('/api/users/admin/all')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);
    expect(res.status).toBe(200);
    const idsCall = db.query.mock.calls[1];
    expect(idsCall[1]).toContain(1);                    // centre_id du gestionnaire en paramètre
    expect(String(idsCall[0])).toMatch(/c\.id = \$/);   // JOIN centre appliqué
  });

  test('un admin liste sans filtre centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/users/admin/all')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(200);
    const idsCall = db.query.mock.calls[1];
    expect(String(idsCall[0])).not.toMatch(/c\.id = \$/);
  });
});

describe('DELETE /api/users/admin/:id — soft delete', () => {
  test('désactive (statut INACTIF) au lieu de DELETE, et libère les chambres', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 9, role: 'ETUDIANT', matricule: 'N9' }] }) // infosPourAdmin
      .mockResolvedValueOnce({})                                    // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 5, logement_id: 40 }] }) // attributionsActives
      .mockResolvedValueOnce({})                                    // terminerAttribution
      .mockResolvedValueOnce({})                                    // changerStatut logement DISPONIBLE
      .mockResolvedValueOnce({})                                    // desactiver
      .mockResolvedValue({ rows: [] });                             // COMMIT
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [admin] });

    const res = await request(app)
      .delete('/api/users/admin/9')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    const sql = client.query.mock.calls.map((c) => String(c[0])).join(' ');
    expect(sql).not.toMatch(/DELETE FROM utilisateurs/);       // jamais de suppression physique
    expect(sql).toMatch(/statut = 'INACTIF'/);                 // soft delete
  });

  test('403 : un gestionnaire ne peut pas supprimer un admin', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 3, role: 'ADMIN', matricule: 'A1' }] });
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });

    const res = await request(app)
      .delete('/api/users/admin/3')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/admin/:id/statut — garde-fous', () => {
  test('403 : un gestionnaire ne peut pas changer le statut d\'un admin', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [gestionnaire] })                        // auth
      .mockResolvedValueOnce({ rows: [{ id: 3, role: 'ADMIN', matricule: 'A1' }] }); // infosPourAdmin
    const res = await request(app)
      .put('/api/users/admin/3/statut')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`)
      .send({ statut: 'SUSPENDU' });
    expect(res.status).toBe(403);
  });

  test('met à jour le statut d\'un étudiant', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                                     // auth
      .mockResolvedValueOnce({ rows: [{ id: 9, role: 'ETUDIANT', matricule: 'N9' }] }) // infosPourAdmin
      .mockResolvedValueOnce({ rows: [{ id: 9, statut: 'SUSPENDU' }] });            // changerStatut
    const res = await request(app)
      .put('/api/users/admin/9/statut')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ statut: 'SUSPENDU' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.statut).toBe('SUSPENDU');
  });
});
