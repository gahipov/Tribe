import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const API_KEY_IOS = import.meta.env.VITE_REVENUECAT_IOS_KEY;
const ENTITLEMENT_ID = 'pro';
let _rcConfigured = false;

export async function initRevenueCat(userId) {
  if (!API_KEY_IOS) {
    console.warn('RevenueCat: VITE_REVENUECAT_IOS_KEY not set');
    return;
  }
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: API_KEY_IOS, appUserID: userId });
    _rcConfigured = true;
  } catch (e) {
    console.error('RevenueCat init failed:', e);
  }
}

export async function getIsPremium() {
  if (!_rcConfigured) return false;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export function isNative() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

export async function presentPaywall() {
  if (!isNative()) {
    return { paywallResult: 'WEB_FALLBACK' };
  }
  if (!_rcConfigured) {
    console.warn('RevenueCat: not configured yet');
    return { paywallResult: 'ERROR' };
  }
  try {
    const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui');
    // Use presentPaywall (not IfNeeded) — simpler, fewer native failure modes
    const result = await RevenueCatUI.presentPaywall();
    return result ?? { paywallResult: 'CANCELLED' };
  } catch (e) {
    console.error('Paywall failed:', e);
    return { paywallResult: 'ERROR' };
  }
}

export async function restorePurchases() {
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function presentCustomerCenter() {
  const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui');
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.error('Customer center failed:', e);
  }
}
