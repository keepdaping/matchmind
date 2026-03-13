# MatchMind ⚽

**AI-powered football predictions. Your edge before kickoff. Every single day.**

Built for East Africa — Uganda, Kenya, Nigeria — and the world.

---

## What this is

MatchMind is a full-stack Next.js web app where users get AI-generated football match predictions. The AI (Claude) analyzes team form, H2H stats, injuries, and more — then produces a structured prediction card with a confidence score.

**Tech stack:** Next.js 14 · Tailwind CSS · Supabase · Anthropic Claude API · Stripe · API-Football

---

## Project structure

```
matchmind/
├── app/
│   ├── page.js                        ← Landing page
│   ├── layout.js                      ← Root layout
│   ├── globals.css                    ← Global styles
│   ├── dashboard/page.js              ← Main app (prediction feed)
│   ├── login/page.js                  ← Login
│   ├── signup/page.js                 ← Sign up
│   ├── billing/page.js                ← Plans & token top-ups
│   ├── prediction/[id]/page.js        ← Full prediction detail
│   └── api/
│       ├── predict/route.js           ← Generate prediction via Claude
│       ├── matches/route.js           ← Fetch today's fixtures
│       ├── billing/checkout/route.js  ← Stripe checkout session
│       └── webhooks/stripe/route.js   ← Stripe payment webhooks
├── lib/
│   ├── supabase.js                    ← Supabase client
│   ├── claude.js                      ← Claude AI prediction engine
│   ├── football.js                    ← API-Football data fetcher
│   └── stripe.js                      ← Stripe helpers
├── supabase_schema.sql                ← Run this in Supabase first
├── .env.example                       ← Copy to .env.local and fill in keys
└── package.json
```

---

## Setup in 6 steps

### Step 1 — Install dependencies

```bash
cd matchmind
npm install
```

### Step 2 — Set up Supabase (free)

1. Go to [supabase.com](https://supabase.com) → New project
2. Go to **SQL Editor** → **New Query**
3. Paste the entire contents of `supabase_schema.sql` and click **Run**
4. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

### Step 3 — Get your API keys

**Anthropic Claude API:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key → `ANTHROPIC_API_KEY`

**API-Football (free — 100 requests/day):**
1. Go to [rapidapi.com](https://rapidapi.com/api-sports/api/api-football)
2. Subscribe to the free plan
3. Copy your RapidAPI key → `FOOTBALL_API_KEY`

**Stripe (free to set up):**
1. Go to [stripe.com](https://stripe.com) → Create account
2. Dashboard → **Developers → API keys**
3. Copy publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
4. Copy secret key → `STRIPE_SECRET_KEY`
5. Create products in Stripe dashboard:
   - **Pro Monthly** — $7/month recurring → copy Price ID → `STRIPE_PRO_PRICE_ID`
   - **Elite Monthly** — $18/month recurring → `STRIPE_ELITE_PRICE_ID`
   - **10 tokens** — $1 one-time → `STRIPE_TOKENS_10_PRICE_ID`
   - **50 tokens** — $4 one-time → `STRIPE_TOKENS_50_PRICE_ID`
   - **200 tokens** — $12 one-time → `STRIPE_TOKENS_200_PRICE_ID`

### Step 4 — Create your .env.local

```bash
cp .env.example .env.local
# Fill in all your keys
```

### Step 5 — Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### Step 6 — Set up Stripe webhook (for payments to actually work)

```bash
# Install Stripe CLI (https://stripe.com/docs/stripe-cli)
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook signing secret → STRIPE_WEBHOOK_SECRET
```

For production, add the webhook in your Stripe dashboard pointing to:
`https://your-domain.com/api/webhooks/stripe`

---

## Deploy to Vercel (free)

```bash
npm install -g vercel
vercel
# Follow prompts. Add all env variables in Vercel dashboard.
```

Or connect your GitHub repo in [vercel.com](https://vercel.com) for auto-deploy.

---

## How the prediction engine works

1. User clicks "Generate Prediction" on a match card
2. `POST /api/predict` is called with match data
3. Server checks user's token balance
4. If tokens available → calls Claude API with structured system prompt
5. Claude returns JSON: outcome, confidence, risk, reasons, key stat, watch out
6. Prediction saved to Supabase → returned to frontend
7. 1 token deducted from user balance
8. Next time someone unlocks the same match → cached prediction returned (no token cost, no API call)

---

## Monetization

| Plan    | Price   | Predictions  |
|---------|---------|--------------|
| Free    | $0      | 1/day        |
| Pro     | $7/mo   | Unlimited    |
| Elite   | $18/mo  | Unlimited + API |
| Tokens  | From $1 | 10–200 packs |

Your cost per prediction: ~$0.01 (Claude API + Football API)
Your revenue per token: $0.04–$0.12
**Gross margin: ~75–85%**

---

## Leagues supported at launch

- Premier League (England)
- La Liga (Spain)
- Serie A (Italy)
- Bundesliga (Germany)
- UEFA Champions League
- Uganda Premier League
- Kenya Premier League
- NPFL (Nigeria)
- AFCON Qualifiers
- CAF Champions League

---

## Responsible gambling notice

MatchMind is for informational and entertainment purposes only. Always gamble responsibly. Never bet more than you can afford to lose.

---

*Built by Odyk (Keepdaping) · @KeepdapingB · Powered by Anthropic Claude*
