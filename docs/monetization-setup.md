# Trove monetization — manual setup steps

Everything in the codebase is wired; these are the one-time dashboard steps to
make purchases live. Until they're done, test tiers locally with
`EXPO_PUBLIC_FORCE_TIER=free|unlocked|cloud` in `.env.local`.

## Tier structure (source of truth: `constants/limits.ts`)

| | Free | Unlocked (₱200 once) | Cloud (₱150/mo · ₱1,200/yr) |
|---|---|---|---|
| Saves | 100 | Unlimited | Unlimited |
| Collections | 5 | Unlimited | Unlimited |
| Import | 50 items | Unlimited | Unlimited |
| Export | Unlimited (always) | Unlimited | Unlimited |
| AI actions/month | 25 | 300 | 1,000 |
| Multi-device sync + cloud media | — | — | Included |

## 1. Google Play Console

Requires the app uploaded to at least an internal testing track, and a
merchant account.

1. **Monetize → Products → In-app products**: create product id
   `trove_unlocked`, price ₱200.
2. **Monetize → Products → Subscriptions**: create subscription `trove_cloud`
   with two base plans:
   - `trove-cloud-monthly` — ₱150/month (product id `trove_cloud_monthly`)
   - `trove-cloud-yearly` — ₱1,200/year (product id `trove_cloud_yearly`)
3. **Setup → API access**: create/link a Google Cloud service account with
   "View financial data" permission, download the JSON key.

## 2. RevenueCat dashboard

1. Create a project, add an **Android (Play Store)** app with package
   `com.anonymous.trove` (update if the package id changes before release).
2. Upload the Play service-account JSON (step 1.3) for receipt validation.
3. **Entitlements**: create `unlocked` and `cloud`.
4. **Products**: import `trove_unlocked`, `trove_cloud_monthly`,
   `trove_cloud_yearly`. Attach:
   - `trove_unlocked` → entitlement `unlocked`
   - both `trove_cloud_*` → entitlements `cloud` **and** `unlocked`
     (Cloud includes everything in Unlocked)
5. **Offerings**: create a `default` offering containing all three packages.
6. Copy the **public Android SDK key** into `.env.local` (and the EAS/build
   env for release builds):

   ```
   EXPO_PUBLIC_REVENUECAT_ANDROID=goog_xxxxxxxx
   ```

7. **Integrations → Webhooks**: URL =
   `https://<project-ref>.supabase.co/functions/v1/rc-webhook`,
   Authorization header = the value of `RC_WEBHOOK_SECRET` (below).

## 3. Supabase

1. Run `supabase/limits.sql` once in the SQL Editor (creates `entitlements`,
   `ai_usage`, and the `increment_ai_usage` function).
2. Deploy the functions:

   ```
   supabase functions deploy ai-proxy --no-verify-jwt
   supabase functions deploy rc-webhook --no-verify-jwt
   ```

3. Set secrets:

   ```
   supabase secrets set RC_WEBHOOK_SECRET=<long random string>
   supabase secrets set RC_API_KEY=<RevenueCat secret API key, sk_...>
   ```

   (`OPENAI_API_KEY` is already set; `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 4. Testing purchases

- Purchases only work in a build installed from Play (internal testing track)
  with a license-tester Google account — not in a plain `expo run:android` dev
  build, and never in Expo Go.
- For everything except the actual purchase flow, use
  `EXPO_PUBLIC_FORCE_TIER` to simulate each tier.
- After changing native deps (`react-native-purchases` was added):
  `npx expo prebuild --no-install` then rebuild.

## Notes

- AI caps in `supabase/functions/ai-proxy/index.ts` (`CAPS`) must stay in sync
  with `AI_MONTHLY_CAP` in `constants/limits.ts`.
- The client counter in `lib/aiUsage.ts` is a soft gate; the ai-proxy meter is
  authoritative and fails open if the tables are missing.
- Export is intentionally never gated — it's the "your data is yours" promise.
