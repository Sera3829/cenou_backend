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

const admin = {
  id: 3, matricule: 'A000000001', nom: 'A', prenom: 'D',
  email: 'a@t.bf', role: 'ADMIN', statut: 'ACTIF', centre_id: null,
};
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

const baseGestionnaire = {
  matricule: 'G00099', nom: 'DIALLO', prenom: 'Ali', email: 'ali@t.bf',
  role: 'GESTIONNAIRE', mot_de_passe: 'Abcdef1',
};

describe('POST /api/users/admin/create — centre du gestionnaire', () => {
  test('400 si on crée un GESTIONNAIRE sans centre', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [admin] }); // auth lookup

    const res = await request(app)
      .post('/api/users/admin/create')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send(baseGestionnaire);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/centre est obligatoire/i);
  });

  test('400 si le centre fourni n\'existe pas', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // matricule libre
      .mockResolvedValueOnce({ rows: [] }) // email libre
      .mockResolvedValueOnce({ rows: [] }); // centre introuvable
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [admin] });

    const res = await request(app)
      .post('/api/users/admin/create')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ ...baseGestionnaire, centre_id: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/centre introuvable/i);
  });

  test('crée un GESTIONNAIRE avec son centre_id persisté dans l\'INSERT', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] }) // centre 2 existe (vérif d'abord)
      .mockResolvedValueOnce({ rows: [] })          // matricule libre
      .mockResolvedValueOnce({ rows: [] })          // email libre
      .mockResolvedValueOnce({})                    // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 50, matricule: 'G00099', role: 'GESTIONNAIRE', centre_id: 2 }] }) // INSERT
      .mockResolvedValue({ rows: [] });             // COMMIT
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [admin] });

    const res = await request(app)
      .post('/api/users/admin/create')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ ...baseGestionnaire, centre_id: 2 });

    expect(res.status).toBe(201);
    const insert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO utilisateurs'));
    expect(String(insert[0])).toContain('centre_id');
    expect(insert[1]).toContain(2); // la valeur du centre part bien en paramètre
  });

  test('un ETUDIANT n\'a pas de centre_id sur sa ligne (dérivé du logement)', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // matricule libre
      .mockResolvedValueOnce({ rows: [] }) // email libre
      .mockResolvedValueOnce({})           // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 51, role: 'ETUDIANT', centre_id: null }] }) // INSERT utilisateur
      .mockResolvedValueOnce({})           // INSERT attribution
      .mockResolvedValueOnce({})           // UPDATE logement
      .mockResolvedValue({ rows: [] });    // COMMIT
    db.getClient.mockResolvedValue(client);
    db.query.mockResolvedValueOnce({ rows: [admin] });

    const res = await request(app)
      .post('/api/users/admin/create')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({
        matricule: 'N00099', nom: 'KABORE', prenom: 'Elie', email: 'e2@t.bf',
        role: 'ETUDIANT', mot_de_passe: 'Abcdef1',
        logement_id: 40, date_debut: '2026-01-15',
      });

    expect(res.status).toBe(201);
    const insert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO utilisateurs'));
    // centre_id est le dernier paramètre et vaut null pour un étudiant
    expect(insert[1][insert[1].length - 1]).toBeNull();
  });
});
