jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));

jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: jest.fn(),
  uploadBuffer: jest.fn(),
  deleteImage: jest.fn(),
  cloudinary: {},
}));

const db = require('../../src/config/database');
const { uploadBuffer } = require('../../src/config/cloudinary');
const { creerSignalement, getSignalementPhoto } = require('../../src/controllers/signalementController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

const mockClient = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });

const attribution = { id: 2, numero_chambre: 'C-002', nom_centre: 'CENOU Bobo' };
const signalementCree = {
  id: 7, numero_suivi: '#123ABC', type_probleme: 'PLOMBERIE',
  description: 'Fuite au lavabo', statut: 'EN_ATTENTE', created_at: new Date().toISOString(),
};

describe('creerSignalement', () => {
  let client;
  beforeEach(() => {
    client = mockClient();
    db.getClient.mockResolvedValue(client);
  });

  test('crée un signalement SANS photo (régression : la requête restait sans réponse)', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [attribution] }) // attribution active
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [signalementCree] }) // INSERT
      .mockResolvedValue({ rows: [] }); // COMMIT
    const res = mockRes();
    await creerSignalement(
      { user: { id: 1 }, body: { type_probleme: 'PLOMBERIE', description: 'Fuite au lavabo' }, files: [] },
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        signalement: expect.objectContaining({ photos: [], numero_chambre: 'C-002' }),
      })
    );
  });

  test('uploade chaque photo vers Cloudinary et stocke les URLs', async () => {
    uploadBuffer
      .mockResolvedValueOnce('https://res.cloudinary.com/x/1.jpg')
      .mockResolvedValueOnce('https://res.cloudinary.com/x/2.jpg');
    client.query
      .mockResolvedValueOnce({ rows: [attribution] })
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [signalementCree] })
      .mockResolvedValue({ rows: [] });
    const res = mockRes();
    await creerSignalement(
      {
        user: { id: 1 },
        body: { type_probleme: 'PLOMBERIE', description: 'Fuite au lavabo' },
        files: [{ buffer: Buffer.from('a') }, { buffer: Buffer.from('b') }],
      },
      res
    );
    expect(uploadBuffer).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(201);
    const insertCall = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO signalements'));
    expect(insertCall[1][3]).toEqual([
      'https://res.cloudinary.com/x/1.jpg',
      'https://res.cloudinary.com/x/2.jpg',
    ]);
  });

  test('502 si toutes les photos jointes échouent à l\'upload (pas de signalement amputé)', async () => {
    uploadBuffer.mockRejectedValue(new Error('cloudinary down'));
    client.query.mockResolvedValueOnce({ rows: [attribution] });
    const res = mockRes();
    await creerSignalement(
      {
        user: { id: 1 },
        body: { type_probleme: 'PLOMBERIE', description: 'Fuite au lavabo' },
        files: [{ buffer: Buffer.from('a') }],
      },
      res
    );
    expect(res.status).toHaveBeenCalledWith(502);
    const sql = client.query.mock.calls.map((c) => String(c[0]));
    expect(sql.some((q) => q.includes('INSERT INTO signalements'))).toBe(false);
  });

  test('400 sans attribution active', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await creerSignalement(
      { user: { id: 1 }, body: { type_probleme: 'PLOMBERIE', description: 'Fuite au lavabo' }, files: [] },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('getSignalementPhoto', () => {
  test('redirige vers l\'URL Cloudinary', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ photos: ['https://res.cloudinary.com/x/1.jpg'] }] });
    const res = mockRes();
    await getSignalementPhoto({ user: { id: 1 }, params: { id: '7', photoIndex: '0' } }, res);
    expect(res.redirect).toHaveBeenCalledWith('https://res.cloudinary.com/x/1.jpg');
  });

  test('410 pour une ancienne photo stockée sur le disque local', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ photos: ['uploads/signalements/vieux.jpg'] }] });
    const res = mockRes();
    await getSignalementPhoto({ user: { id: 1 }, params: { id: '7', photoIndex: '0' } }, res);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  test('404 si l\'index de photo est hors limites', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ photos: ['https://res.cloudinary.com/x/1.jpg'] }] });
    const res = mockRes();
    await getSignalementPhoto({ user: { id: 1 }, params: { id: '7', photoIndex: '5' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('404 si le signalement appartient à un autre étudiant', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = mockRes();
    await getSignalementPhoto({ user: { id: 1 }, params: { id: '7', photoIndex: '0' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
