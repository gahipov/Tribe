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

export function isNative() {
  return !!(window.Capacitor?.isNativePlatform?.());
}

export async function presentPaywall() {
  if (!isNative()) {
    // On web/localhost the native paywall can't run — signal caller to show fallback UI
    return { paywallResult: 'WEB_FALLBACK' };
  }
  const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui');
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
    return result;
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
