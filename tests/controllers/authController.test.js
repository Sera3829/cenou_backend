jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const bcrypt = require('bcryptjs');
const db = require('../../src/config/database');
const { login, register } = require('../../src/controllers/authController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockClient = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });

let hashValide;
beforeAll(async () => {
  hashValide = await bcrypt.hash('BonMotDePasse1', 10);
});

describe('login', () => {
  const userRow = () => ({
    id: 1, matricule: 'N123456789', nom: 'Kabore', prenom: 'Elie',
    email: 'elie@test.bf', telephone: null, mot_de_passe: hashValide,
    role: 'ETUDIANT', statut: 'ACTIF', numero_chambre: 'C-002',
    nom_centre: 'CENOU Bobo', loyer_mensuel: 9000,
  });

  test('401 si l\'identifiant est inconnu', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await login({ headers: {}, body: { identifiant: 'inconnu', mot_de_passe: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('403 si le compte est suspendu', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...userRow(), statut: 'SUSPENDU' }] });
    const res = mockRes();
    await login({ headers: {}, body: { identifiant: 'N123456789', mot_de_passe: 'BonMotDePasse1' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('401 si le mot de passe est faux (même message que pour un identifiant inconnu)', async () => {
    db.query.mockResolvedValueOnce({ rows: [userRow()] });
    const res = mockRes();
    await login({ headers: {}, body: { identifiant: 'N123456789', mot_de_passe: 'Mauvais1' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Identifiant ou mot de passe incorrect') })
    );
  });

  test('403 pour un ADMIN qui tente de se connecter depuis le mobile', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...userRow(), role: 'ADMIN' }] });
    const res = mockRes();
    await login(
      { headers: { 'x-platform': 'mobile' }, body: { identifiant: 'N123456789', mot_de_passe: 'BonMotDePasse1' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('connexion réussie → token + profil, sans le hash du mot de passe', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [userRow()] })
      .mockResolvedValue({ rows: [] }); // UPDATE updated_at
    const res = mockRes();
    await login({ headers: {}, body: { identifiant: 'N123456789', mot_de_passe: 'BonMotDePasse1' } }, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({ matricule: 'N123456789' }),
      })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.user.mot_de_passe).toBeUndefined();
  });
});

describe('register', () => {
  test('409 si le matricule existe déjà', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    db.getClient.mockResolvedValue(client);
    const res = mockRes();
    await register(
      { body: { matricule: 'N123456789', nom: 'K', prenom: 'E', email: 'e@t.bf', mot_de_passe: 'Abcdef1' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(client.release).toHaveBeenCalled();
  });

  test('409 si deux inscriptions simultanées violent la contrainte UNIQUE (code 23505)', async () => {
    const client = mockClient();
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    err.constraint = 'utilisateurs_email_key';
    client.query
      .mockResolvedValueOnce({ rows: [] }) // matricule libre
      .mockResolvedValueOnce({ rows: [] }) // email libre
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(err) // INSERT en conflit
      .mockResolvedValue({ rows: [] }); // ROLLBACK
    db.getClient.mockResolvedValue(client);
    const res = mockRes();
    await register(
      { body: { matricule: 'N123456789', nom: 'K', prenom: 'E', email: 'e@t.bf', mot_de_passe: 'Abcdef1' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('email') })
    );
  });

  test('inscription réussie avec attribution automatique de chambre', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // matricule libre
      .mockResolvedValueOnce({ rows: [] }) // email libre
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 12, matricule: 'N123456789', nom: 'K', prenom: 'E', email: 'e@t.bf', telephone: null, role: 'ETUDIANT', statut: 'ACTIF' }],
      }) // INSERT utilisateur
      .mockResolvedValueOnce({ rows: [{ id: 40 }] }) // chambre disponible (FOR UPDATE SKIP LOCKED)
      .mockResolvedValueOnce({}) // INSERT attribution
      .mockResolvedValueOnce({}) // UPDATE logement OCCUPE
      .mockResolvedValueOnce({ rows: [{ numero_chambre: 'C-002', type_chambre: 'SIMPLE', loyer_mensuel: 9000, nom_centre: 'CENOU Bobo', ville: 'Bobo' }] })
      .mockResolvedValue({ rows: [] }); // COMMIT
    db.getClient.mockResolvedValue(client);
    const res = mockRes();
    await register(
      { body: { matricule: 'N123456789', nom: 'K', prenom: 'E', email: 'e@t.bf', mot_de_passe: 'Abcdef1' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({ numero_chambre: 'C-002' }),
      })
    );
    // La sélection de chambre doit verrouiller la ligne (anti double-attribution)
    const sql = client.query.mock.calls.map((c) => String(c[0]));
    expect(sql.some((q) => q.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
  });
});
