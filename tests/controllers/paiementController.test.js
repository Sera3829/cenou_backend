jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

const db = require('../../src/config/database');
const {
  callbackPaiement,
  simulerConfirmation,
  initierPaiement,
} = require('../../src/controllers/paiementController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockClient = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });

const REF_VALIDE = 'CENOU-1777293315082-EA42CE09';

describe('callbackPaiement — sécurité', () => {
  let client;
  beforeEach(() => {
    client = mockClient();
    db.getClient.mockResolvedValue(client);
    process.env.PAYMENT_CALLBACK_SECRET = 'secret-callback-de-test';
  });

  test('503 si aucun secret n\'est configuré (fail closed)', async () => {
    delete process.env.PAYMENT_CALLBACK_SECRET;
    const req = { headers: {}, body: { reference: REF_VALIDE, statut: 'SUCCESS' } };
    const res = mockRes();
    await callbackPaiement(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    process.env.PAYMENT_CALLBACK_SECRET = 'secret-callback-de-test';
  });

  test('401 si le secret est absent ou incorrect', async () => {
    const res = mockRes();
    await callbackPaiement(
      { headers: { 'x-callback-secret': 'mauvais-secret' }, body: { reference: REF_VALIDE, statut: 'SUCCESS' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(401);

    const res2 = mockRes();
    await callbackPaiement({ headers: {}, body: { reference: REF_VALIDE, statut: 'SUCCESS' } }, res2);
    expect(res2.status).toHaveBeenCalledWith(401);
  });

  test('400 si la référence n\'a pas le format strict attendu', async () => {
    for (const reference of ['%', '', 'CENOU-abc-XYZ', "CENOU-1-EA42CE09' OR 1=1", null]) {
      const res = mockRes();
      await callbackPaiement(
        { headers: { 'x-callback-secret': 'secret-callback-de-test' }, body: { reference, statut: 'SUCCESS' } },
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('404 si aucun paiement ne correspond à la référence', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await callbackPaiement(
      { headers: { 'x-callback-secret': 'secret-callback-de-test' }, body: { reference: REF_VALIDE, statut: 'SUCCESS' } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('confirme un paiement EN_ATTENTE avec un callback valide', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 5, attribution_id: 2, montant: 9000, statut: 'EN_ATTENTE', utilisateur_id: 1 }] })
      .mockResolvedValue({ rows: [] });
    const res = mockRes();
    await callbackPaiement(
      { headers: { 'x-callback-secret': 'secret-callback-de-test' }, body: { reference: REF_VALIDE, statut: 'SUCCESS' } },
      res
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statut: 'CONFIRME' }));
    const sql = client.query.mock.calls.map((c) => c[0]);
    expect(sql).toContain('BEGIN');
    expect(sql).toContain('COMMIT');
  });

  test('idempotent : un paiement déjà CONFIRME n\'est pas retraité', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: 5, attribution_id: 2, montant: 9000, statut: 'CONFIRME', utilisateur_id: 1 }],
    });
    const res = mockRes();
    await callbackPaiement(
      { headers: { 'x-callback-secret': 'secret-callback-de-test' }, body: { reference: REF_VALIDE, statut: 'FAILED' } },
      res
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statut: 'CONFIRME' }));
    const sql = client.query.mock.calls.map((c) => c[0]);
    expect(sql).not.toContain('BEGIN');
  });
});

describe('simulerConfirmation', () => {
  let client;
  beforeEach(() => {
    client = mockClient();
    db.getClient.mockResolvedValue(client);
    delete process.env.PAYMENT_SIMULATION;
  });

  test('403 si la simulation est désactivée', async () => {
    process.env.PAYMENT_SIMULATION = 'false';
    const res = mockRes();
    await simulerConfirmation({ user: { id: 1 }, params: { id: '5' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    delete process.env.PAYMENT_SIMULATION;
  });

  test('404 si le paiement n\'appartient pas à l\'utilisateur', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await simulerConfirmation({ user: { id: 1 }, params: { id: '5' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 si le paiement n\'est pas EN_ATTENTE', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: 5, montant: 9000, statut: 'CONFIRME', utilisateur_id: 1 }] });
    const res = mockRes();
    await simulerConfirmation({ user: { id: 1 }, params: { id: '5' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('confirme le paiement du propriétaire', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 5, montant: 9000, statut: 'EN_ATTENTE', utilisateur_id: 1 }] })
      .mockResolvedValue({ rows: [] });
    const res = mockRes();
    await simulerConfirmation({ user: { id: 1 }, params: { id: '5' } }, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ paiement: expect.objectContaining({ statut: 'CONFIRME' }) })
    );
  });
});

describe('initierPaiement — validation des montants', () => {
  let client;
  beforeEach(() => {
    client = mockClient();
    db.getClient.mockResolvedValue(client);
  });

  const reqBase = (body) => ({ user: { id: 1 }, body });

  test('400 si le nombre de mois est hors bornes', async () => {
    for (const nombre_mois of [0, 25, -3]) {
      const res = mockRes();
      await initierPaiement(
        reqBase({ montant: 9000, mode_paiement: 'ORANGE_MONEY', numero_telephone: '70000000', nombre_mois }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  test('400 si aucune attribution active', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await initierPaiement(
      reqBase({ montant: 9000, mode_paiement: 'ORANGE_MONEY', numero_telephone: '70000000', nombre_mois: 1 }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('400 si le montant ne correspond pas à loyer × mois', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: 10, prix_mensuel: '9000.00', nom_centre: 'CENOU Bobo' }] });
    const res = mockRes();
    await initierPaiement(
      reqBase({ montant: 5000, mode_paiement: 'ORANGE_MONEY', numero_telephone: '70000000', nombre_mois: 1 }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ montant_attendu: 9000 }));
  });

  test('accepte un montant à décimales (comparaison en entiers, pas en flottants)', async () => {
    // 16666.67 × 3 = 50000.01 : l'égalité stricte en flottants refusait 50000
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 10, prix_mensuel: '16666.67', nom_centre: 'CENOU Bobo' }] })
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 99, reference_transaction: 'CENOU-1-AAAAAAAA' }] }) // INSERT paiement
      .mockResolvedValue({ rows: [] });
    const res = mockRes();
    await initierPaiement(
      reqBase({ montant: 50000, mode_paiement: 'ORANGE_MONEY', numero_telephone: '70000000', nombre_mois: 3 }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('crée un paiement EN_ATTENTE pour un montant exact', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 10, prix_mensuel: '9000.00', nom_centre: 'CENOU Bobo' }] })
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 99, reference_transaction: 'CENOU-1-AAAAAAAA' }] })
      .mockResolvedValue({ rows: [] });
    const res = mockRes();
    await initierPaiement(
      reqBase({ montant: 18000, mode_paiement: 'MOOV_MONEY', numero_telephone: '70000000', nombre_mois: 2 }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ paiement: expect.objectContaining({ statut: 'EN_ATTENTE', nombre_mois: 2 }) })
    );
  });
});
