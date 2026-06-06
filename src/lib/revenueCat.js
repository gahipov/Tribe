import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const API_KEY_IOS = import.meta.env.VITE_REVENUECAT_IOS_KEY || 'appl_cIMcvGlvbIfUImUWUmXCCSurSCf';
const API_KEY_ANDROID = import.meta.env.VITE_REVENUECAT_ANDROID_KEY || '';
const ENTITLEMENT_ID = 'Tribe Pro';
let _rcConfigured = false;

export async function initRevenueCat(userId) {
  try {
    const { Capacitor } = await import('@capacitor/core');
    const platform = Capacitor.getPlatform();
    const apiKey = platform === 'android' ? API_KEY_ANDROID : API_KEY_IOS;
    if (!apiKey) {
      console.warn(`RevenueCat: no API key for platform ${platform}`);
      return;
    }
    await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey, appUserID: userId });
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
    return { webFallback: true };
  }
  if (!_rcConfigured) {
    console.warn('RevenueCat: not configured yet');
    return { result: 'ERROR' };
  }
  try {
    // Pre-fetch offerings to ensure products are loaded before showing paywall
    const { offerings } = await Purchases.getOfferings();
    const offering = offerings?.current;
    const { RevenueCatUI } = await import('@revenuecat/purchases-capacitor-ui');
    const result = await RevenueCatUI.presentPaywall(offering ? { offering } : undefined);
    return result ?? { result: 'CANCELLED' };
  } catch (e) {
    console.error('Paywall failed:', e);
    return { result: 'ERROR' };
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
