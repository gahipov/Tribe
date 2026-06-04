# RevenueCat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Paddle subscription checkout with RevenueCat + Apple IAP, making the app App Store compliant.

**Architecture:** RevenueCat SDK initializes at app startup, tied to the Supabase user ID. A `useRevenueCat` hook exposes premium status and purchase/restore actions. `AuthContext` sources `isPremium` from RevenueCat entitlements instead of `profile.is_premium`. `PremiumGate` triggers the native RevenueCat paywall UI. Customer Center is added to the Profile page.

**Tech Stack:** `@revenuecat/purchases-capacitor`, `@revenuecat/purchases-capacitor-ui`, React, Capacitor, Supabase

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/revenueCat.js` | Create | SDK init + `useRevenueCat` hook |
| `src/lib/AuthContext.jsx` | Modify | Source `isPremium` from RevenueCat, not Supabase |
| `src/App.jsx` | Modify | Initialize RevenueCat after auth resolves |
| `src/components/PremiumGate.jsx` | Modify | Replace Paddle checkout with RevenueCat paywall UI |
| `src/pages/Profile.jsx` | Modify | Add Customer Center + Restore Purchases button |
| `package.json` | Modify | Add RevenueCat packages |

---

## Task 1: Install RevenueCat packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui
```

Expected output: packages added to `node_modules` and `package.json`.

- [ ] **Step 2: Sync Capacitor**

```bash
npx cap sync ios
npx cap sync android
```

Expected: native projects updated with new plugin.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install revenuecat capacitor packages"
```

---

## Task 2: Create RevenueCat service

**Files:**
- Create: `src/lib/revenueCat.js`

- [ ] **Step 1: Create the file**

```js
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const API_KEY_IOS = import.meta.env.VITE_REVENUECAT_IOS_KEY;
const ENTITLEMENT_ID = 'pro';

export async function initRevenueCat(userId) {
  if (!API_KEY_IOS) {
    console.warn('RevenueCat: VITE_REVENUECAT_IOS_KEY not set');
    return;
  }
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: API_KEY_IOS, appUserID: userId });
  } catch (e) {
    console.error('RevenueCat init failed:', e);
  }
}

export async function getIsPremium() {
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function presentPaywall() {
  const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui');
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
    return result; // { paywallResult: 'PURCHASED' | 'RESTORED' | 'NOT_PRESENTED' | 'CANCELLED' | 'ERROR' }
  } catch (e) {
    console.error('Paywall failed:', e);
    return { paywallResult: 'ERROR' };
  }
}

export async function restorePurchases() {
  const { customerInfo } = await Purchases.restorePurchases();
  return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
}

export async function presentCustomerCenter() {
  const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui');
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.error('Customer center failed:', e);
  }
}
```

- [ ] **Step 2: Add env var**

Add to your `.env` file (and to Codemagic environment variables):

```
VITE_REVENUECAT_IOS_KEY=test_YBKRcvzGERwlVSodVgaxjvGxQXF
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/revenueCat.js .env
git commit -m "feat: add revenuecat service module"
```

---

## Task 3: Initialize RevenueCat in App.jsx

When the Supabase user is known, initialize RevenueCat with their user ID so purchase history is tied to the account.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update App.jsx**

Add the import at the top of `src/App.jsx`:

```js
import { initRevenueCat } from '@/lib/revenueCat';
```

Inside `AuthenticatedApp`, add a `useEffect` that fires when `user` becomes available. Add `user` to the destructure from `useAuth()`:

```jsx
const AuthenticatedApp = () => {
  const { isLoadingAuth, authChecked, isAuthenticated, onboardingDone, user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      initRevenueCat(user.id);
    }
  }, [user?.id]);

  // ... rest unchanged
};
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: initialize revenuecat on user auth"
```

---

## Task 4: Source isPremium from RevenueCat in AuthContext

Replace `isPremium = profile?.is_premium` with a live RevenueCat entitlement check. Keep Supabase `profile` for everything else.

**Files:**
- Modify: `src/lib/AuthContext.jsx`

- [ ] **Step 1: Update AuthContext.jsx**

Add import at top:

```js
import { getIsPremium } from '@/lib/revenueCat';
```

Add `isPremium` state and fetch it after profile loads. Replace the current line:

```js
// REMOVE this line:
const isPremium = !!(profile?.is_premium);
```

With state + effect:

```jsx
const [isPremium, setIsPremium] = useState(false);

// Add inside fetchProfile, after setProfile(data):
const premium = await getIsPremium();
setIsPremium(premium);
```

So `fetchProfile` becomes:

```js
const fetchProfile = async (userId) => {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (data) setProfile(data);
  const premium = await getIsPremium();
  setIsPremium(premium);
};
```

Also expose a `refreshPremium` helper so the paywall success handler can update state:

```js
const refreshPremium = async () => {
  const premium = await getIsPremium();
  setIsPremium(premium);
};
```

Add `refreshPremium` to the context value object.

- [ ] **Step 2: Commit**

```bash
git add src/lib/AuthContext.jsx
git commit -m "feat: source isPremium from revenuecat entitlements"
```

---

## Task 5: Replace Paddle paywall with RevenueCat paywall in PremiumGate

**Files:**
- Modify: `src/components/PremiumGate.jsx`

- [ ] **Step 1: Rewrite PremiumGate.jsx**

Replace the entire file content with:

```jsx
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { presentPaywall } from "@/lib/revenueCat";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

function UpgradeModal({ open, onClose, feature }) {
  const { refreshPremium } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    onClose();
    const result = await presentPaywall();
    if (result.paywallResult === 'PURCHASED' || result.paywallResult === 'RESTORED') {
      await refreshPremium();
      toast.success("Welcome to Tribe Pro!");
    }
    setLoading(false);
  };

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/70" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[71] bg-card rounded-3xl border border-primary/30 p-6 max-w-sm mx-auto shadow-2xl shadow-primary/10">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground"><X className="h-4 w-4" /></button>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Tribe Pro</h2>
            <p className="text-sm text-muted-foreground mt-1">Unlock {feature} and all premium features</p>
          </div>
          <div className="w-full space-y-2 text-left">
            {["AI Photo Meal Logging","Custom Macro Goals","Body Measurements & Trends","Advanced Workout Analytics","Unlimited Custom Plans","Priority in Tribe Discovery"].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className={f === feature ? "text-primary font-medium" : "text-foreground"}>{f}</span>
              </div>
            ))}
          </div>
          <div className="w-full">
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? "Opening…" : "Upgrade to Tribe Pro"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">Cancel anytime · Managed by Apple</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PremiumGate({ children, feature = "this feature", locked }) {
  const [showModal, setShowModal] = useState(false);
  if (!locked) return children;
  return (
    <>
      <div className="relative">
        <div className="opacity-40 pointer-events-none select-none">{children}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/60 backdrop-blur-sm">
          <Sparkles className="h-6 w-6 text-primary" />
          <p className="font-heading font-semibold text-sm">Pro Feature</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-heading font-medium"
          >
            Unlock with Tribe Pro
          </button>
        </div>
      </div>
      <UpgradeModal open={showModal} onClose={() => setShowModal(false)} feature={feature} />
    </>
  );
}

export function ProBadge({ className }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-heading font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary", className)}>
      <Sparkles className="h-2.5 w-2.5" />PRO
    </span>
  );
}

export function useUpgradeModal(feature) {
  const [open, setOpen] = useState(false);
  const Modal = () => <UpgradeModal open={open} onClose={() => setOpen(false)} feature={feature} />;
  return { openUpgrade: () => setOpen(true), UpgradeModal: Modal };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PremiumGate.jsx
git commit -m "feat: replace paddle paywall with revenuecat native paywall"
```

---

## Task 6: Add Customer Center + Restore Purchases to Profile

**Files:**
- Modify: `src/pages/Profile.jsx`

- [ ] **Step 1: Add imports to Profile.jsx**

Add at top of file:

```js
import { presentCustomerCenter, restorePurchases } from "@/lib/revenueCat";
```

- [ ] **Step 2: Add restore handler**

Inside the `Profile` component, add:

```js
const { refreshPremium } = useAuth();

const handleRestore = async () => {
  const isNowPremium = await restorePurchases();
  await refreshPremium();
  if (isNowPremium) {
    toast.success("Purchases restored!");
  } else {
    toast.info("No active subscription found.");
  }
};
```

- [ ] **Step 3: Add buttons to Profile UI**

Find the profile settings section and add two buttons — place them near the logout button:

```jsx
{isPremium && (
  <button
    onClick={() => presentCustomerCenter()}
    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
  >
    <Sparkles className="h-5 w-5 text-primary" />
    <span className="text-sm font-medium">Manage Subscription</span>
  </button>
)}
<button
  onClick={handleRestore}
  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
>
  <span className="text-sm text-muted-foreground">Restore Purchases</span>
</button>
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Profile.jsx
git commit -m "feat: add customer center and restore purchases to profile"
```

---

## Task 7: Remove Paddle

**Files:**
- Modify: `index.html` (remove Paddle script tag if present)
- Modify: `.env` (remove Paddle vars — keep them in Codemagic for now in case rollback needed)

- [ ] **Step 1: Check for Paddle script in index.html**

```bash
grep -n "paddle" index.html
```

If found, remove the `<script src="https://cdn.paddle.com/...">` line.

- [ ] **Step 2: Uninstall Paddle (if it was an npm package)**

```bash
grep "paddle" package.json
```

If present, run `npm uninstall <paddle-package-name>`.

- [ ] **Step 3: Commit**

```bash
git add index.html package.json package-lock.json
git commit -m "chore: remove paddle integration"
```

---

## Task 8: Configure RevenueCat dashboard

These are dashboard steps — no code.

- [ ] **Step 1: Link App Store product**
  - RevenueCat dashboard → your project → Products → Add Product
  - Store: App Store, Product ID: `com.tribe.fitness.pro.monthly`

- [ ] **Step 2: Create entitlement**
  - Entitlements → New → identifier: `pro`, display name: `Tribe Pro`
  - Attach product `com.tribe.fitness.pro.monthly` to it

- [ ] **Step 3: Create offering**
  - Offerings → New → identifier: `default`, display name: `Default`
  - Add package: identifier `$rc_monthly`, attach `com.tribe.fitness.pro.monthly`

- [ ] **Step 4: Connect App Store**
  - RevenueCat → App Store Connect API → add your App Store Connect API key (required for sandbox testing)

---

## Task 9: Build and test on device

- [ ] **Step 1: Build**

```bash
npm run build && npx cap sync ios
```

- [ ] **Step 2: Open Xcode and run on device**

```bash
npx cap open ios
```

Run on a real device (StoreKit sandbox doesn't work in simulator for some flows).

- [ ] **Step 3: Create sandbox tester in App Store Connect**
  - App Store Connect → Users → Sandbox Testers → add a test Apple ID

- [ ] **Step 4: Test purchase flow**
  - Sign into device with sandbox Apple ID
  - Trigger upgrade from any locked feature
  - Complete purchase with sandbox credentials
  - Verify `isPremium` flips to `true` in the app

- [ ] **Step 5: Test restore**
  - Log out and back in
  - Tap "Restore Purchases" in Profile
  - Verify premium is restored

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: revenuecat integration complete"
```
