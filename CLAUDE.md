# NovIA

Plateforme SaaS auto-hébergée : widget de chat IA (capybara origami) que les
clients ajoutent à leur site via un snippet `<script>`, avec forfaits payants
et packs de tokens, gérés par les clients eux-mêmes depuis leur dashboard.
Voir `README.md` pour l'architecture et la mise en route détaillées.

## Langue

Communiquer en français avec l'utilisateur. Le code, les commits et les
textes de l'interface (FR/EN via `backend/i18n/translations.js`) suivent
cette convention.

## Déploiement — contraintes importantes

- Le vrai serveur tourne sur un **CT Proxmox** (`192.168.0.10`), pas sur cette
  machine Windows. **Aucun accès SSH** n'est disponible depuis cette session
  vers ce CT — toute étape de déploiement doit être donnée à l'utilisateur
  sous forme de commandes exactes à copier-coller, jamais exécutée directement.
- Port de l'app : **3002** (le 3000 est déjà pris par un autre service sur ce
  serveur). `APP_BASE_URL` doit être `https://novia.help` en production — ne
  jamais laisser `localhost` dans le `.env` du CT, sinon le snippet remis aux
  clients ne fonctionne pas chez eux.
- `docker-compose.yml` charge tout `.env` via `env_file:` (ne pas revenir à
  une liste figée de variables `environment:`, ça a déjà causé un bug où une
  nouvelle variable ajoutée au `.env` n'atteignait jamais le conteneur).
- Après un `git push`, le flux normal est : l'utilisateur fait `git pull` sur
  le CT, `docker compose up -d --build`, et `docker compose exec novia npm run
  migrate` uniquement si le schéma a changé.

## Développement local

- Pas de Postgres local fiable sur cette machine (Docker Desktop y est
  instable/cassé) — tester en local se limite à `node --check` sur les
  fichiers modifiés et démarrer le serveur pour vérifier les routes qui ne
  dépendent pas de la base (pages d'authentification, fichiers statiques,
  404). Les routes qui touchent la DB échoueront proprement en local (erreur
  `ECONNREFUSED` loguée, serveur qui continue de tourner) — c'est attendu.
- Toujours nettoyer après un test local : tuer le process node de test et
  supprimer le `.env` de test avant de committer, pour ne jamais committer de
  secrets ni laisser un process orphelin sur le port 3002.

## Workflow attendu

Construire par petites étapes livrables : une fonctionnalité → test local →
commit (message clair, en français) → push → donner les commandes exactes
pour le CT. Ne pas empiler plusieurs fonctionnalités sans rien montrer entre
les deux. Toujours signaler clairement un bug ou une mauvaise config repérée
en cours de route (ex. mauvais `APP_BASE_URL`), même hors du sujet demandé.

## Repères dans le code

- `backend/config/plans.js` : définition des forfaits et packs de tokens
  (source de vérité, seedée en base par `backend/db/migrate.js`).
- `backend/config/demoAssistant.js` + le plan `demo` : compte de
  démonstration interne (`client_key = novia-demo`) affiché sur les pages
  login/register, exclu de la liste des forfaits payants.
- `backend/i18n/` : dictionnaire de traduction FR/EN + middleware qui expose
  `t()` et `lang` à toutes les vues via `res.locals`.
- `backend/services/urlImportService.js` : import sécurisé d'une page web
  (garde-fou anti-SSRF, extrait aussi les liens de navigation same-origin
  pour que l'IA puisse recommander une page précise).
- `public/widget.js` : script embarquable sur les sites clients — ne jamais y
  ajouter de dépendance à `public/css/style.css` ou à quoi que ce soit propre
  au dashboard NovIA, il doit rester autonome sur un site tiers.
