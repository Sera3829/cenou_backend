// Environnement de test : aucun service externe n'est contacté.
// La base PostgreSQL est mockée dans chaque suite (jest.mock de config/database),
// Firebase est désactivé via FIREBASE_ENABLED.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'secret-de-test-suffisamment-long-0123456789abcdef';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_jamais_utilise';
process.env.PAYMENT_CALLBACK_SECRET = 'secret-callback-de-test';
process.env.FIREBASE_ENABLED = 'false';
