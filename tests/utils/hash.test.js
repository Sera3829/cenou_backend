const { hashPassword, comparePassword } = require('../../src/utils/hash');

describe('utils/hash', () => {
  test('hache puis valide un mot de passe', async () => {
    const hash = await hashPassword('MonMotDePasse1');
    expect(hash).not.toBe('MonMotDePasse1');
    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(comparePassword('MonMotDePasse1', hash)).resolves.toBe(true);
  });

  test('rejette un mauvais mot de passe', async () => {
    const hash = await hashPassword('MonMotDePasse1');
    await expect(comparePassword('AutreMotDePasse2', hash)).resolves.toBe(false);
  });

  test('deux hachages du même mot de passe sont différents (sel aléatoire)', async () => {
    const h1 = await hashPassword('MonMotDePasse1');
    const h2 = await hashPassword('MonMotDePasse1');
    expect(h1).not.toBe(h2);
  });
});
