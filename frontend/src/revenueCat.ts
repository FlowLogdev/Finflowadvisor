// RevenueCat integration for iOS + Android IAP ($9.99/mo, $69.99/yr).
// Web always returns `available: false` — the /premium screen falls back to Stripe on web.

import { Platform } from 'react-native';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_OHMXsxmLFatVOmxPUkRdzMHzWKq';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

// RevenueCat entitlement identifier (must exactly match the RevenueCat dashboard).
const PREMIUM_ENTITLEMENT = 'FinFlowAdvisors Pro';

export type RcPackage = {
  identifier: string;           // '$rc_monthly' | '$rc_annual'
  productId: string;            // 'finflow_premium_monthly' | 'finflow_premium_yearly'
  title: string;                // Display name from store
  price: number;                // Decimal price, e.g. 9.99
  priceString: string;          // Formatted e.g. "$9.99"
  currencyCode: string;         // "USD"
  periodUnit: 'month' | 'year' | 'week' | 'day' | null;
};

export type RcSubscriptionState = {
  premium: boolean;
  expirationDate?: string;
  productIdentifier?: string;
  willRenew?: boolean;
  managementURL?: string;       // Deep link to Apple/Google subscription mgmt
};

let initialized = false;

function getPlatformKey(): string {
  if (Platform.OS === 'ios') return IOS_KEY;
  if (Platform.OS === 'android') return ANDROID_KEY;
  return '';
}

export function isRcAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return !!getPlatformKey();
}

export async function initRevenueCat(userId: string): Promise<boolean> {
  if (!isRcAvailable()) return false;
  try {
    // Dynamic import so web bundles never load the native module
    const Purchases = (await import('react-native-purchases')).default;
    if (!initialized) {
      Purchases.configure({ apiKey: getPlatformKey(), appUserID: userId });
      initialized = true;
    } else {
      // User may have logged in as a different account — swap identity
      await Purchases.logIn(userId);
    }
    return true;
  } catch (e) {
    console.warn('RC init failed:', e);
    return false;
  }
}

export async function getRcOfferings(): Promise<RcPackage[]> {
  if (!isRcAvailable()) return [];
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings?.current?.availablePackages || [];
    return pkgs.map((p: any) => ({
      identifier: p.identifier,
      productId: p.product.identifier,
      title: p.product.title || p.identifier,
      price: p.product.price,
      priceString: p.product.priceString,
      currencyCode: p.product.currencyCode || 'USD',
      periodUnit:
        p.packageType === 'MONTHLY' ? 'month'
        : p.packageType === 'ANNUAL' ? 'year'
        : p.packageType === 'WEEKLY' ? 'week'
        : p.packageType === 'LIFETIME' ? null
        : null,
    }));
  } catch (e) {
    console.warn('getOfferings failed:', e);
    return [];
  }
}

export async function purchaseRcPackage(
  identifier: '$rc_monthly' | '$rc_annual'
): Promise<{ success: boolean; premium: boolean; userCancelled?: boolean; error?: string }> {
  if (!isRcAvailable()) return { success: false, premium: false, error: 'IAP not available on this platform' };
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find((p: any) => p.identifier === identifier);
    if (!pkg) return { success: false, premium: false, error: 'Package not found' };
    const result: any = await Purchases.purchasePackage(pkg);
    const isPremium = !!result?.customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
    return { success: true, premium: isPremium };
  } catch (e: any) {
    if (e?.userCancelled) {
      return { success: false, premium: false, userCancelled: true };
    }
    return { success: false, premium: false, error: e?.message?.slice(0, 200) || 'Purchase failed' };
  }
}

export async function restoreRcPurchases(): Promise<{ premium: boolean; error?: string }> {
  if (!isRcAvailable()) return { premium: false, error: 'Not available on this platform' };
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info: any = await Purchases.restorePurchases();
    const isPremium = !!info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
    return { premium: isPremium };
  } catch (e: any) {
    return { premium: false, error: e?.message?.slice(0, 200) || 'Restore failed' };
  }
}

export async function getRcSubscriptionState(): Promise<RcSubscriptionState | null> {
  if (!isRcAvailable()) return null;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const info: any = await Purchases.getCustomerInfo();
    const premiumEnt = info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
    if (!premiumEnt) {
      return { premium: false, managementURL: info?.managementURL };
    }
    return {
      premium: true,
      expirationDate: premiumEnt.expirationDate,
      productIdentifier: premiumEnt.productIdentifier,
      willRenew: premiumEnt.willRenew,
      managementURL: info?.managementURL,
    };
  } catch (e) {
    console.warn('getCustomerInfo failed:', e);
    return null;
  }
}
