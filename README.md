# NovIA

Plateforme SaaS auto-hebergee : widget de chat IA (capybara origami) que vos
clients ajoutent sur leur site via un snippet `<script>`, avec forfaits payants
(Base, Base+, Pro, Entreprise) et packs de tokens a l'unite, geres par les
clients eux-memes depuis leur dashboard.

## Stack

Node.js / Express / EJS, PostgreSQL, Stripe (abonnements + paiements
ponctuels), OpenAI (moteur du chat). Auto-hebergee via Docker derriere nginx
(novia.help -> 192.168.0.10).

## Mise en route (developpement local)

```bash
cp .env.example .env
# remplir DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY au minimum

npm install
docker compose up -d postgres   # ou une instance Postgres locale
npm run migrate                 # cree les tables + seed les forfaits/packs
npm run dev
```

L'app tourne sur http://localhost:3002 (le port 3000 est deja utilise par un
autre dashboard sur ce poste). `/register` cree un compte, `/dashboard` est
le tableau de bord.

## Configuration Stripe (obligatoire pour la facturation)

Etapes a faire manuellement dans le Dashboard Stripe (impossible de les faire
a votre place sans acces a votre compte) :

1. Creer 4 Produits avec un **Prix recurrent mensuel** : Base (9.99$),
   Base+ (12.99$), Pro (29.99$), Entreprise (49.99$).
2. Creer 3 Prix ponctuels pour les packs de tokens : Petit (2.99$),
   Moyen (5.99$), Grand (10.99$).
3. Copier chaque `price_id` (`price_...`) dans `.env` :
   `STRIPE_PRICE_BASE`, `STRIPE_PRICE_BASE_PLUS`, `STRIPE_PRICE_PRO`,
   `STRIPE_PRICE_ENTERPRISE`, `STRIPE_PRICE_PACK_SMALL`,
   `STRIPE_PRICE_PACK_MEDIUM`, `STRIPE_PRICE_PACK_LARGE`.
4. Relancer `npm run migrate` pour que ces `price_id` soient enregistres sur
   les forfaits/packs en base.
5. Renseigner `STRIPE_SECRET_KEY` et `STRIPE_PUBLISHABLE_KEY` (mode test
   d'abord).
6. Webhook : creer un endpoint Stripe pointant vers
   `https://novia.help/webhooks/stripe` ecoutant au minimum
   `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`, puis
   copier le secret de signature dans `STRIPE_WEBHOOK_SECRET`.
   En local, utiliser `stripe listen --forward-to localhost:3002/webhooks/stripe`.

## Configuration OpenAI

Renseigner `OPENAI_API_KEY` dans `.env` (jamais dans le code ni un message).
`OPENAI_MODEL` (defaut `gpt-4o-mini`) est modifiable.

## Le widget

Chaque client colle ce snippet sur son site (recupere depuis
`/dashboard/widget`) :

```html
<script src="https://novia.help/widget.js" data-client="CLIENT_KEY" async></script>
```

Le script affiche une bulle capybara flottante qui ouvre un iframe
(`/widget/frame/:clientKey`) servi depuis novia.help — les appels de chat se
font donc en same-origin, sans probleme CORS. Le logo/couleur du widget
depend du forfait du client (branding NovIA par defaut sur le forfait Base,
personnalisable a partir de Base+).

## Deploiement (Proxmox / Docker / nginx deja configures)

```bash
docker compose up -d --build
docker compose exec novia npm run migrate
```

nginx route deja `novia.help` vers `192.168.0.10`. Le conteneur ecoute sur le
port 3002 (3000 etant deja pris par un autre service sur ce serveur) —
verifier que le `proxy_pass` nginx pour novia.help pointe bien vers
`192.168.0.10:3002`.

## Perimetre de cette version

Fondations completes cote client : comptes, forfaits, facturation Stripe
(abonnement + autopay + packs de tokens), personnalisation du widget selon le
forfait, snippet d'integration, widget public avec comptage de tokens reel.
Pas encore de back-office admin separe (a construire dans une iteration
suivante).
