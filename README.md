# CENOU Backend — API de gestion des résidences universitaires

API REST du système **Cenou Room** (CENOU — Burkina Faso) : gestion des logements universitaires, des paiements de loyers, des signalements de problèmes et des annonces.

- **Production** : https://cenou-backend.onrender.com (déploiement automatique à chaque push sur `main`)
- **Frontend associé** : [cenou_frontend](https://github.com/Sera3829/cenou_frontend) (app mobile Flutter + dashboard web)

![Dashboard alimenté par cette API](https://raw.githubusercontent.com/Sera3829/cenou_frontend/main/screenshots/web/dashboard.png)
*Le dashboard et l'app mobile alimentés par cette API — [plus de captures ici](https://github.com/Sera3829/cenou_frontend#aperçu).*

## Stack technique

| Composant | Technologie |
|---|---|
| Serveur | Node.js + Express |
| Base de données | PostgreSQL (Neon serverless) |
| Authentification | JWT (`jsonwebtoken`) + bcrypt |
| Sessions & notifications push | Firebase (Firestore + Cloud Messaging) |
| Stockage d'images | Cloudinary |
| Génération de rapports | PDFKit + ExcelJS |
| Sécurité | helmet, express-rate-limit, CORS restreint, express-validator |

## Démarrage rapide

```bash
git clone https://github.com/Sera3829/cenou_backend.git
cd cenou_backend
npm install

# Configurer l'environnement
cp .env.example .env
# → remplir DATABASE_URL, JWT_SECRET (≥ 32 caractères), etc.

# Initialiser la base (nouvelle installation)
psql "$DATABASE_URL" -f database/database_init.sql
psql "$DATABASE_URL" -f database/migration_002_securite_centres.sql

npm run dev     # développement (nodemon)
npm start       # production
```

> ⚠️ Le serveur **refuse de démarrer** si `JWT_SECRET` est absent ou fait moins de 32 caractères.
> Générer un secret : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Variables d'environnement

Voir [`.env.example`](.env.example) pour la liste complète. Les essentielles :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (Neon) |
| `JWT_SECRET` | Signature des tokens (≥ 32 caractères, obligatoire) |
| `PAYMENT_CALLBACK_SECRET` | Secret exigé sur le callback de paiement (sans lui, le callback est désactivé) |
| `PAYMENT_SIMULATION` | `false` pour désactiver la simulation de paiement |
| `ALLOWED_ORIGINS` | Origines CORS supplémentaires (séparées par des virgules) |
| `FIREBASE_SERVICE_ACCOUNT` | JSON du service account Firebase (ou fichier local non commité) |
| `CLOUDINARY_*` | Credentials Cloudinary pour les photos de signalements |

## Rôles et cloisonnement

| Rôle | Accès |
|---|---|
| `ETUDIANT` | App mobile : ses paiements, signalements, annonces, profil |
| `GESTIONNAIRE` | Dashboard web, **limité aux données de son centre** (`utilisateurs.centre_id`) |
| `ADMIN` | Dashboard web, vue globale sur tous les centres |

Le cloisonnement est appliqué côté serveur (`getCentreScope()` dans `authMiddleware`) sur les paiements, utilisateurs, signalements, statistiques du dashboard et rapports. Un gestionnaire non rattaché à un centre ne voit **rien** (fail closed).

Rattacher un gestionnaire à son centre :

```sql
SELECT id, nom, ville FROM centres;
UPDATE utilisateurs SET centre_id = <ID_CENTRE> WHERE matricule = '<MATRICULE>';
```

## Paiements

Les paiements Orange Money / Moov Money sont actuellement **simulés** (intégration CinetPay prévue) :

- `POST /api/paiements/initier` — crée un paiement `EN_ATTENTE` (montant vérifié = loyer × nombre de mois)
- `POST /api/paiements/:id/simuler` — l'étudiant propriétaire confirme son paiement (désactivable via `PAYMENT_SIMULATION=false`)
- `POST /api/paiements/callback` — réservé à l'opérateur de paiement : exige le header `x-callback-secret` égal à `PAYMENT_CALLBACK_SECRET`, référence au format strict, idempotent. À remplacer par la vérification HMAC CinetPay lors du branchement.

## Aperçu des routes

| Préfixe | Contenu |
|---|---|
| `/api/auth` | register (auto-attribution de chambre), login, logout, me, refresh |
| `/api/users` | profil, changement de mot de passe + CRUD admin (soft-delete) |
| `/api/paiements` | historique, loyer, initiation, simulation, callback + admin (liste, stats, statut) |
| `/api/signalements` | création avec photos (5 max, 10 Mo), suivi + admin (liste, stats, équipes, affectation) |
| `/api/annonces` | annonces ciblées (tous / centre / rôle) |
| `/api/notifications` | notifications push (FCM) et in-app |
| `/api/rapports` | génération PDF / Excel |
| `/api/admin` | statistiques dashboard, graphiques, activité récente |
| `/api/centres`, `/api/logements` | référentiels |
| `/api/health` | healthcheck |

## Structure du projet

```
src/
├── config/         # database (pool + retry Neon), firebase, cloudinary
├── controllers/    # logique métier par domaine
├── middlewares/    # authenticateToken, authorizeRoles, getCentreScope, upload, erreurs
├── routes/         # définition des endpoints Express
└── utils/          # jwt, hash (bcrypt), validators, générateurs PDF/Excel
database/
├── database_init.sql                    # schéma complet (nouvelle installation)
└── migration_002_securite_centres.sql   # migration base existante (idempotente)
```

## Tests

```bash
npm test          # lance la suite Jest (61 tests)
npm run test:watch
```

Les tests s'exécutent **sans aucun service externe** : la base PostgreSQL est mockée et Firebase désactivé. Couverture ciblée sur les zones critiques :

- sécurité du callback de paiement (secret, format de référence, idempotence)
- authentification JWT et contrôle des rôles
- cloisonnement par centre des gestionnaires (y compris le fail closed)
- logique métier des paiements (montant = loyer × mois, bornes)
- inscription (unicité concurrente, verrouillage de chambre) et connexion
- règles de validation des entrées

## Notes d'exploitation

- **Neon** s'endort après 5 min d'inactivité : le serveur intègre un retry automatique des requêtes (cold start ~10-20 s) et un keepalive en journée (10h-18h UTC).
- Les erreurs détaillées (`details`) ne sont renvoyées au client qu'en développement (`NODE_ENV !== 'production'`).
- La suppression d'un utilisateur est un **soft-delete** (statut `INACTIF`) : l'historique financier est conservé et protégé par des contraintes `ON DELETE RESTRICT`.
