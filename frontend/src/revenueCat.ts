// RevenueCat integration for iOS + Android IAP.
// Web always returns `available: false` — the /premium screen falls back to Stripe on web.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

const PREMIUM_ENTITLEMENT = 'FinFlowAdvisors Pro';
const ANON_ID_KEY = 'finflow_rc_anon_id';

export type RcPackage = {
  identifier: string;
  productId: string;
  title: string;
  price: number;
  priceString: string;
  currencyCode: string;
  periodUnit: 'month' | 'year' | 'week' | 'day' | 'lifetime' | null;
};

export type RcSubscriptionState = {
  premium: boolean;
  expirationDate?: string;
  productIdentifier?: string;
  willRenew?: boolean;
  managementURL?: string;
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

async function getOrCreateAnonId(): Promise<string> {
  let id = await AsyncStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = 'anon_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

export async function initRevenueCat(userId: string | null): Promise<boolean> {
  if (!isRcAvailable()) return false;
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const rcUserId = userId || await getOrCreateAnonId();
    if (!initialized) {
      Purchases.configure({ apiKey: getPlatformKey(), appUserID: rcUserId });
      initialized = true;
    } else {
      await Purchases.logIn(rcUserId);
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
        : p.packageType === 'LIFETIME' ? 'lifetime'
        : null,
    }));
  } catch (e) {
    console.warn('getOfferings failed:', e);
    return [];
  }
}

export async function purchaseRcPackage(
  identifier: string
): Promise<{ success: boolean; premium: boolean; userCancelled?: boolean; error?: string }> {
  if (!isRcAvailable()) return { success: false, premium: false, error: 'IAP not available on this platform' };
  try {
    const Purchases = (await import('react-native-purchases')).default;
    const offerings = await Purchases.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find((p: any) => p.identifier === identifier);
    if (!pkg) return { success: false, premium: false, error: 'Package not found. Please check your connection and try again.' };
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
