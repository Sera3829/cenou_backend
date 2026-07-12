jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const db = require('../../src/config/database');
const { authenticateToken, authorizeRoles, getCentreScope } = require('../../src/middlewares/authMiddleware');
const { generateToken } = require('../../src/utils/jwt');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const userActif = {
  id: 1, matricule: 'N123456789', nom: 'Kabore', prenom: 'Elie',
  email: 'elie@test.bf', role: 'ETUDIANT', statut: 'ACTIF', centre_id: null,
};

describe('authenticateToken', () => {
  test('401 si le header Authorization est absent', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 si le token est invalide', async () => {
    const req = { headers: { authorization: 'Bearer nimporte.quoi.dutout' } };
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 si l\'utilisateur n\'existe plus en base', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const token = generateToken({ userId: 999, role: 'ETUDIANT' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('403 si le compte est désactivé', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...userActif, statut: 'INACTIF' }] });
    const token = generateToken({ userId: 1, role: 'ETUDIANT' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('token valide + compte actif → req.user rempli et next() appelé', async () => {
    db.query.mockResolvedValueOnce({ rows: [userActif] });
    const token = generateToken({ userId: 1, role: 'ETUDIANT' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    await authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.matricule).toBe('N123456789');
  });
});

describe('authorizeRoles', () => {
  test('403 si le rôle n\'est pas autorisé', () => {
    const req = { user: { role: 'ETUDIANT' } };
    const res = mockRes();
    const next = jest.fn();
    authorizeRoles('ADMIN', 'GESTIONNAIRE')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('laisse passer un rôle autorisé', () => {
    const req = { user: { role: 'GESTIONNAIRE' } };
    const res = mockRes();
    const next = jest.fn();
    authorizeRoles('ADMIN', 'GESTIONNAIRE')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('401 si aucun utilisateur authentifié', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    authorizeRoles('ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getCentreScope (cloisonnement par centre)', () => {
  test('ADMIN → null (aucune restriction)', () => {
    expect(getCentreScope({ user: { role: 'ADMIN', centre_id: 3 } })).toBeNull();
  });

  test('GESTIONNAIRE rattaché → id de son centre', () => {
    expect(getCentreScope({ user: { role: 'GESTIONNAIRE', centre_id: 7, matricule: 'G1' } })).toBe(7);
  });

  test('GESTIONNAIRE sans centre → -1 (fail closed, ne voit rien)', () => {
    expect(getCentreScope({ user: { role: 'GESTIONNAIRE', centre_id: null, matricule: 'G2' } })).toBe(-1);
  });

  test('ETUDIANT → null (le cloisonnement se fait par utilisateur_id)', () => {
    expect(getCentreScope({ user: { role: 'ETUDIANT', centre_id: null } })).toBeNull();
  });
});
