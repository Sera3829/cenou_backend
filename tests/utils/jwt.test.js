const { generateToken, verifyToken, decodeToken } = require('../../src/utils/jwt');

describe('utils/jwt', () => {
  const payload = { userId: 42, matricule: 'N123456789', role: 'ETUDIANT' };

  test('génère puis vérifie un token', () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe(42);
    expect(decoded.matricule).toBe('N123456789');
    expect(decoded.role).toBe('ETUDIANT');
  });

  test('rejette un token falsifié', () => {
    const token = generateToken(payload);
    const falsifie = token.slice(0, -4) + 'AAAA';
    expect(() => verifyToken(falsifie)).toThrow('Token invalide ou expiré');
  });

  test('rejette un token signé avec un autre secret', () => {
    const jwt = require('jsonwebtoken');
    const etranger = jwt.sign(payload, 'un-autre-secret-completement-different');
    expect(() => verifyToken(etranger)).toThrow('Token invalide ou expiré');
  });

  test('decodeToken lit le payload sans vérifier la signature', () => {
    const token = generateToken(payload);
    expect(decodeToken(token).userId).toBe(42);
  });
});
