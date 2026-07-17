import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import {
  getPackages, startCheckout, pollBillingStatus, getBillingMe,
  BillingPackage,
} from '../src/featuresApi';
import {
  isRcAvailable, initRevenueCat, getRcOfferings, purchaseRcPackage,
  restoreRcPurchases, getRcSubscriptionState, RcPackage, RcSubscriptionState,
} from '../src/revenueCat';
import { useAuth } from '../src/auth';

const BENEFITS = [
  'Unlimited AI Advisor chats with FinBot',
  'Advanced Money Leaks detection',
  'PDF / CSV / Excel data exports',
  'Automatic monthly reports by email',
  'Premium stock watchlist (unlimited symbols)',
  'Priority support',
];

type UnifiedPackage = {
  source: 'rc' | 'stripe';
  id: string;
  label: string;
  price: number;
  priceString: string;
  period: 'month' | 'year';
};

export default function PremiumScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();

  const [packages, setPackages] = useState<UnifiedPackage[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<string | undefined>();
  const [managementURL, setManagementURL] = useState<string | undefined>();
  const [useRc, setUseRc] = useState(false);

  useEffect(() => {
    (async () => {
      // On iOS/Android always try RevenueCat — works even without a logged-in user
      const rcOk = isRcAvailable()
        ? await initRevenueCat(user?.id || null)
        : false;
      setUseRc(rcOk);

      if (rcOk) {
        // iOS/Android path — use RevenueCat (Apple IAP / Google Play)
        try {
          const [rcPkgs, sub] = await Promise.all([
            getRcOfferings(),
            getRcSubscriptionState(),
          ]);
          const unified: UnifiedPackage[] = rcPkgs
            .filter((p) => p.periodUnit === 'month' || p.periodUnit === 'year')
            .map((p) => ({
              source: 'rc' as const,
              id: p.identifier,
              label: p.periodUnit === 'year' ? 'Premium Yearly' : 'Premium Monthly',
              price: p.price,
              priceString: p.priceString,
              period: p.periodUnit as 'month' | 'year',
            }));
          setPackages(unified);
          const yearly = unified.find((u) => u.period === 'year');
          setSelected((yearly || unified[0])?.id || '');
          if (sub?.premium) {
            setIsPremium(true);
            setPremiumUntil(sub.expirationDate);
            setManagementURL(sub.managementURL);
          } else if (unified.length === 0) {
            setLoadError('No subscription plans are available right now. If this app was just submitted to the App Store, in-app purchases may still be pending Apple review.');
          }
        } catch (e: any) {
          const msg = typeof e?.message === 'string' ? e.message : String(e);
          setLoadError(`Could not load in-app purchases from the App Store. ${msg}`);
        }
      } else if (Platform.OS === "web") {
        // Web-only path — use Stripe (never reached on iOS/Android when RC key is set)
        try {
          const [pkgs, me] = await Promise.all([
            getPackages(),
            getBillingMe().catch(() => ({ premium: false })),
          ]);
          const unified: UnifiedPackage[] = (pkgs.packages || []).map((p: BillingPackage) => ({
            source: 'stripe' as const,
            id: p.id,
            label: p.label,
            price: p.amount,
            priceString: `$${p.amount.toFixed(2)}`,
            period: p.days > 300 ? 'year' : 'month',
          }));
          setPackages(unified);
          const yearly = unified.find((u) => u.period === 'year');
          setSelected((yearly || unified[0])?.id || '');
          setIsPremium(!!me.premium);
          setPremiumUntil((me as any).premium_until);
        } catch (e: any) {
          Alert.alert('Error', 'Could not load pricing.');
        }
      } else if (isRcAvailable()) {
        // Native platform, but RevenueCat failed to initialize
        setLoadError('Could not connect to the App Store. Please check your internet connection and try again.');
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const handleSubscribe = async () => {
    if (busy || !selected) return;
    setBusy(true);
    try {
      if (useRc) {
        const res = await purchaseRcPackage(selected as any);
        if (res.userCancelled) {
          // silent
        } else if (res.premium) {
          Alert.alert('🎉 Premium activated', 'Welcome to FinFlow Premium!');
          const sub = await getRcSubscriptionState();
          if (sub) {
            setIsPremium(sub.premium);
            setPremiumUntil(sub.expirationDate);
            setManagementURL(sub.managementURL);
          }
        } else if (res.error) {
          Alert.alert('Purchase failed', res.error);
        }
      } else if (Platform.OS === "web") {
        // Web — Stripe
        const origin =
          Platform.OS === 'web' ? window.location.origin : 'https://finflowadvisors.com';
        const res = await startCheckout(selected, origin);
        if (!res.url) throw new Error('No checkout URL');
        await WebBrowser.openAuthSessionAsync(res.url, origin);
        let paid = false;
        for (let i = 0; i < 10; i++) {
          try {
            const s = await pollBillingStatus(res.session_id);
            if (s.paid || s.status === 'complete' || s.status === 'paid') { paid = true; break; }
          } catch {}
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (paid) {
          Alert.alert('🎉 Premium activated', 'Welcome to FinFlow Premium!');
          const me = await getBillingMe().catch(() => ({ premium: false }));
          setIsPremium(!!me.premium);
          setPremiumUntil((me as any).premium_until);
        } else if (Platform.OS === "web") {
          Alert.alert('Not confirmed yet', 'Your subscription should activate shortly.');
        }
      }
    } catch (e: any) {
      Alert.alert('Checkout error', e?.message?.slice(0, 160) || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      if (useRc) {
        const res = await restoreRcPurchases();
        if (res.premium) {
          setIsPremium(true);
          const sub = await getRcSubscriptionState();
          if (sub) {
            setPremiumUntil(sub.expirationDate);
            setManagementURL(sub.managementURL);
          }
          Alert.alert('Purchases restored', 'Your Premium access has been restored.');
        } else {
          Alert.alert(
            'No purchases found',
            res.error || 'No active subscription was found under your Apple ID.'
          );
        }
      } else if (Platform.OS === "web") {
        const me = await getBillingMe();
        setIsPremium(!!me.premium);
        setPremiumUntil(me.premium_until);
        Alert.alert(me.premium ? 'Premium active' : 'No subscription found', '');
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    if (useRc && managementURL) {
      Linking.openURL(managementURL);
    } else if (Platform.OS === "web") {
      router.push('/settings' as any);
    } else if (useRc) {
      Alert.alert(
        'Manage Subscription',
        Platform.OS === 'ios'
          ? 'Go to Settings → Apple ID → Subscriptions to manage your subscription.'
          : 'Go to Play Store → Subscriptions to manage your subscription.'
      );
    }
  };

  const openURL = (url: string) => Linking.openURL(url);

  if (loading) {
    return (
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.income} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>FinFlow Premium</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isPremium ? (
          <View style={[styles.premiumBadge, { backgroundColor: c.income }]}>
            <Ionicons name="checkmark-circle" size={28} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumBadgeTitle}>You're Premium ✨</Text>
              {premiumUntil && (
                <Text style={styles.premiumBadgeSub}>
                  Renews {new Date(premiumUntil).toLocaleDateString()}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.manageBtn} onPress={handleManage}>
              <Text style={styles.manageBtnText}>Manage</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.heroWrap}>
            <View style={[styles.sparkleBubble, { backgroundColor: c.income }]}>
              <Ionicons name="sparkles" size={26} color="#fff" />
            </View>
            <Text style={[styles.heroTitle, { color: c.textPrimary }]}>
              Unlock your financial superpower
            </Text>
            <Text style={[styles.heroSub, { color: c.textMuted }]}>
              Get AI coaching, smart alerts, exports, and monthly reports — for less than a coffee a month.
            </Text>
          </View>
        )}

        {!isPremium && loadError && (
          <View testID="paywall-load-error" style={{ backgroundColor: '#fdecea', borderColor: '#c84b1f', borderWidth: 1, borderRadius: 12, padding: 16, marginVertical: 16 }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', color: '#c84b1f', fontSize: 15, marginBottom: 6 }}>
              ⚠ Unable to load In-App Purchases
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', color: '#7a2f14', fontSize: 13, lineHeight: 18 }}>
              {loadError}
            </Text>
            <Text style={{ fontFamily: 'DMSans_400Regular', color: '#7a2f14', fontSize: 12, marginTop: 8, lineHeight: 16 }}>
              Expected product IDs:{'\n'}
              • com.finflowadvisors.premium.monthly{'\n'}
              • com.finflowadvisors.premium.yearly
            </Text>
          </View>
        )}

        {!isPremium && packages.length > 0 && (
          <>
            <View style={styles.plansWrap}>
              {packages.map((p) => {
                const isSel = selected === p.id;
                const isYear = p.period === 'year';
                const monthlyEq = isYear ? (p.price / 12).toFixed(2) : p.price.toFixed(2);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelected(p.id)}
                    style={[
                      styles.planCard,
                      {
                        backgroundColor: isSel ? c.income + '18' : c.surface,
                        borderColor: isSel ? c.income : c.border,
                        borderWidth: isSel ? 2 : 0.5,
                      },
                    ]}
                  >
                    {isYear && (
                      <View style={[styles.savePill, { backgroundColor: c.warning }]}>
                        <Text style={styles.savePillText}>SAVE 33%</Text>
                      </View>
                    )}
                    <Text style={[styles.planLabel, { color: c.textPrimary }]}>{p.label}</Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.priceAmt, { color: c.textPrimary }]}>{p.priceString}</Text>
                      <Text style={[styles.pricePeriod, { color: c.textMuted }]}>
                        /{p.period === 'year' ? 'year' : 'month'}
                      </Text>
                    </View>
                    {isYear && (
                      <Text style={[styles.planEq, { color: c.textMuted }]}>
                        Just ${monthlyEq}/month
                      </Text>
                    )}
                    {isSel && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={c.income}
                        style={styles.planCheck}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: c.income, opacity: busy ? 0.7 : 1 }]}
              onPress={handleSubscribe}
              disabled={busy || !selected}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-open-outline" size={18} color="#fff" />
                  <Text style={styles.ctaText}>Subscribe</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.fineprint, { color: c.textMuted }]}>
              {useRc
                ? 'Billed via your ' + (Platform.OS === 'ios' ? 'Apple ID' : 'Google account') + ' account. Cancel anytime.'
                : 'Secure checkout by Stripe. Cancel anytime.'}
            </Text>
          </>
        )}

        {/* Restore + Legal links — Apple REQUIRES these */}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={handleRestore} disabled={restoring}>
            <Text style={[styles.legalLink, { color: c.income }]}>
              {restoring ? 'Restoring…' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalSep, { color: c.textMuted }]}>·</Text>
          <TouchableOpacity onPress={() => openURL('https://finflowadvisors.com/terms')}>
            <Text style={[styles.legalLink, { color: c.income }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={[styles.legalSep, { color: c.textMuted }]}>·</Text>
          <TouchableOpacity onPress={() => openURL('https://finflowadvisors.com/privacy')}>
            <Text style={[styles.legalLink, { color: c.income }]}>Privacy</Text>
          </TouchableOpacity>
        </View>

        {useRc && (
          <Text style={[styles.iapNote, { color: c.textMuted }]}>
            Subscription auto-renews until canceled. Manage or cancel anytime in{' '}
            {Platform.OS === 'ios' ? 'Settings → Apple ID → Subscriptions' : 'Play Store → Subscriptions'}.
          </Text>
        )}

        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>What's included</Text>
        <View style={[styles.benefitsCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color={c.income} />
              <Text style={[styles.benefitText, { color: c.textPrimary }]}>{b}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 17 },
  scroll: { padding: 16 },

  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 14, marginBottom: 20,
  },
  premiumBadgeTitle: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  premiumBadgeSub: { color: '#fff', fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2, opacity: 0.9 },
  manageBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#fff', borderRadius: 8 },
  manageBtnText: { color: '#fff', fontFamily: 'DMSans_600SemiBold', fontSize: 12 },

  heroWrap: { alignItems: 'center', marginVertical: 12, marginBottom: 24 },
  sparkleBubble: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontFamily: 'DMSans_700Bold', fontSize: 22, textAlign: 'center' },
  heroSub: {
    fontFamily: 'DMSans_400Regular', fontSize: 14,
    textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 16,
  },

  plansWrap: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  planCard: {
    flex: 1, borderRadius: 14, padding: 16, position: 'relative',
  },
  savePill: {
    position: 'absolute', top: -9, right: 8,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  savePillText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 0.3 },
  planLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6, gap: 4 },
  priceAmt: { fontFamily: 'DMSans_700Bold', fontSize: 24 },
  pricePeriod: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
  planEq: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 4 },
  planCheck: { position: 'absolute', top: 10, right: 10 },

  ctaBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 12, marginTop: 4,
  },
  ctaText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  fineprint: { fontFamily: 'DMSans_400Regular', fontSize: 11, textAlign: 'center', marginTop: 8 },

  legalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 16, flexWrap: 'wrap',
  },
  legalLink: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
  legalSep: { fontFamily: 'DMSans_400Regular', fontSize: 12 },
  iapNote: {
    fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 14,
    textAlign: 'center', marginTop: 12, paddingHorizontal: 12,
  },

  sectionTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14, marginTop: 28, marginBottom: 10 },
  benefitsCard: { borderRadius: 12, borderWidth: 0.5, padding: 4 },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
  },
  benefitText: { fontFamily: 'DMSans_500Medium', fontSize: 13, flex: 1 },
});
