jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const express = require('express');
const request = require('supertest');
const db = require('../../src/config/database');
const centreRoutes = require('../../src/routes/centreRoutes');
const pavillonRoutes = require('../../src/routes/pavillonRoutes');
const { generateToken } = require('../../src/utils/jwt');
const pavillonService = require('../../src/services/pavillonService');

const app = express();
app.use(express.json());
app.use('/api/centres', centreRoutes);
app.use('/api/pavillons', pavillonRoutes);

const admin = { id: 3, matricule: 'A1', role: 'ADMIN', statut: 'ACTIF', centre_id: null };
const gestionnaire = { id: 2, matricule: 'G1', role: 'GESTIONNAIRE', statut: 'ACTIF', centre_id: 1 };
const tokenFor = (u) => generateToken({ userId: u.id, matricule: u.matricule, role: u.role });

// ── Génération de numéros (logique pure) ─────────────────────────────────
describe('génération des numéros de chambre', () => {
  test('préfixe + incrémentation + padding', () => {
    expect(pavillonService.genererNumeros({ prefixe: 'C-', debut: 1, nombre: 3, padding: 3 }))
      .toEqual(['C-001', 'C-002', 'C-003']);
  });
  test('sans padding', () => {
    expect(pavillonService.genererNumeros({ prefixe: 'CH', debut: 9, nombre: 3, padding: 0 }))
      .toEqual(['CH9', 'CH10', 'CH11']);
  });
  test('début personnalisé', () => {
    expect(pavillonService.genererNumeros({ prefixe: 'A-', debut: 100, nombre: 2, padding: 0 }))
      .toEqual(['A-100', 'A-101']);
  });
});

describe('Pavillons — réservé ADMIN', () => {
  test('403 : un gestionnaire ne peut pas créer un pavillon', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });
    const res = await request(app).post('/api/centres/1/pavillons')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`)
      .send({ nom: 'Pavillon A' });
    expect(res.status).toBe(403);
  });

  test('un admin crée un pavillon dans un centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                       // auth
      .mockResolvedValueOnce({ rows: [{ id: 1, nom: 'CENOU X' }] })   // centre existe
      .mockResolvedValueOnce({ rows: [] })                            // nom libre
      .mockResolvedValueOnce({ rows: [{ id: 7, nom: 'Pavillon A', capacite: 50 }] });
    const res = await request(app).post('/api/centres/1/pavillons')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ nom: 'Pavillon A', capacite: 50 });
    expect(res.status).toBe(201);
    expect(res.body.data.nom).toBe('Pavillon A');
  });

  test('409 : pavillon en double dans un centre', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })   // centre existe
      .mockResolvedValueOnce({ rows: [{ id: 9 }] });  // nom déjà pris
    const res = await request(app).post('/api/centres/1/pavillons')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ nom: 'Pavillon A' });
    expect(res.status).toBe(409);
  });

  test('409 : suppression refusée si le pavillon a des chambres occupées', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 7, centre_id: 1, nom: 'A' }] }) // parId
      .mockResolvedValueOnce({ rows: [{ n: 5 }] });                        // nbChambresOccupees
    const res = await request(app).delete('/api/pavillons/7')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(409);
  });
});

describe('Création de chambres en masse', () => {
  test('crée 3 chambres avec incrémentation et renvoie le décompte', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })                              // auth
      .mockResolvedValueOnce({ rows: [{ id: 7, centre_id: 1, nom: 'A' }] })  // pavillon parId
      .mockResolvedValueOnce({ rows: [                                       // INSERT ... RETURNING
        { id: 40, numero_chambre: 'C-001' },
        { id: 41, numero_chambre: 'C-002' },
        { id: 42, numero_chambre: 'C-003' },
      ] });
    const res = await request(app).post('/api/pavillons/7/logements/bulk')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ prefixe: 'C-', debut: 1, nombre: 3, padding: 3, type_chambre: 'SIMPLE', prix_mensuel: 9000 });
    expect(res.status).toBe(201);
    expect(res.body.data.crees).toBe(3);
    expect(res.body.data.demandes).toBe(3);
    // Les numéros générés doivent être passés en paramètres de l'INSERT
    const insertCall = db.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO logements'));
    expect(insertCall[1]).toContain('C-001');
    expect(insertCall[1]).toContain('C-003');
  });

  test('signale les doublons ignorés (ON CONFLICT)', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [admin] })
      .mockResolvedValueOnce({ rows: [{ id: 7, centre_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 40, numero_chambre: 'C-001' }] }); // 1 créée sur 3 demandées
    const res = await request(app).post('/api/pavillons/7/logements/bulk')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ prefixe: 'C-', debut: 1, nombre: 3, type_chambre: 'DOUBLE', prix_mensuel: 12000 });
    expect(res.status).toBe(201);
    expect(res.body.data.crees).toBe(1);
    expect(res.body.data.ignores).toBe(2);
  });

  test('400 : nombre hors bornes (0 ou > 1000)', async () => {
    db.query.mockResolvedValueOnce({ rows: [admin] });
    const res = await request(app).post('/api/pavillons/7/logements/bulk')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ nombre: 5000, type_chambre: 'SIMPLE', prix_mensuel: 9000 });
    expect(res.status).toBe(400);
  });

  test('403 : un gestionnaire ne peut pas créer de chambres en masse', async () => {
    db.query.mockResolvedValueOnce({ rows: [gestionnaire] });
    const res = await request(app).post('/api/pavillons/7/logements/bulk')
      .set('Authorization', `Bearer ${tokenFor(gestionnaire)}`)
      .send({ nombre: 10, type_chambre: 'SIMPLE', prix_mensuel: 9000 });
    expect(res.status).toBe(403);
  });
});
