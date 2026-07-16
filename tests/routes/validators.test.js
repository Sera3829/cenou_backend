const express = require('express');
const request = require('supertest');
const { registerValidation, loginValidation, validate } = require('../../src/validators/authValidator');

// Mini-application : seules les règles de validation sont testées,
// le contrôleur est remplacé par un écho.
const app = express();
app.use(express.json());
app.post('/register', registerValidation, validate, (req, res) => res.json({ ok: true }));
app.post('/login', loginValidation, validate, (req, res) => res.json({ ok: true }));

const inscriptionValide = {
  matricule: 'N123456789',
  nom: 'Kabore',
  prenom: 'Elie',
  email: 'elie@test.bf',
  mot_de_passe: 'Abcdef1',
  confirmation_mot_de_passe: 'Abcdef1',
};

describe('validation de l\'inscription', () => {
  test('accepte un dossier complet et valide', async () => {
    const res = await request(app).post('/register').send(inscriptionValide);
    expect(res.status).toBe(200);
  });

  test.each([
    ['matricule en minuscules', { matricule: 'abc123' }],
    ['matricule trop court', { matricule: 'N1' }],
    ['email invalide', { email: 'pas-un-email' }],
    ['mot de passe trop court', { mot_de_passe: 'Ab1', confirmation_mot_de_passe: 'Ab1' }],
    ['mot de passe sans majuscule', { mot_de_passe: 'abcdef1', confirmation_mot_de_passe: 'abcdef1' }],
    ['mot de passe sans chiffre', { mot_de_passe: 'Abcdefg', confirmation_mot_de_passe: 'Abcdefg' }],
    ['confirmation différente', { confirmation_mot_de_passe: 'Autre1x' }],
    ['téléphone invalide', { telephone: 'abc' }],
  ])('refuse : %s', async (_, surcharge) => {
    const res = await request(app).post('/register').send({ ...inscriptionValide, ...surcharge });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Erreur de validation');
  });
});

describe('validation de la connexion', () => {
  test('refuse un identifiant vide', async () => {
    const res = await request(app).post('/login').send({ identifiant: '', mot_de_passe: 'x' });
    expect(res.status).toBe(400);
  });

  test('accepte identifiant + mot de passe', async () => {
    const res = await request(app).post('/login').send({ identifiant: 'N123456789', mot_de_passe: 'x' });
    expect(res.status).toBe(200);
  });
});
