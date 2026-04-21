import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
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

const BENEFITS = [
  'Unlimited AI Advisor chats with FinBot',
  'Advanced Money Leaks detection',
  'PDF / CSV / Excel data exports',
  'Automatic monthly reports by email',
  'Premium stock watchlist (unlimited symbols)',
  'Priority support',
];

export default function PremiumScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [selected, setSelected] = useState<string>('yearly');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const [pkgs, me] = await Promise.all([getPackages(), getBillingMe().catch(() => ({ premium: false }))]);
        setPackages(pkgs.packages || []);
        setIsPremium(!!me.premium);
        setPremiumUntil((me as any).premium_until);
        if (pkgs.packages?.length) {
          const yearly = pkgs.packages.find((p) => p.id === 'yearly');
          setSelected((yearly || pkgs.packages[0]).id);
        }
      } catch (e: any) {
        Alert.alert('Error', 'Could not load pricing. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubscribe = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const origin =
        Platform.OS === 'web'
          ? window.location.origin
          : 'https://finflowadvisors.com';
      const res = await startCheckout(selected, origin);
      if (!res.url) throw new Error('No checkout URL');

      // Open Stripe-hosted checkout
      const result: any = await WebBrowser.openAuthSessionAsync(res.url, origin);
      // Regardless of result, poll for up to 20s to see if paid
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
      } else {
        Alert.alert('Not confirmed yet', 'If you completed the payment, your status will update shortly. Pull to refresh.');
      }
    } catch (e: any) {
      Alert.alert('Checkout error', e?.message?.slice(0, 160) || 'Could not start checkout');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.bg }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.income} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.bg }]} edges={['top']}>
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
                  Valid until {new Date(premiumUntil).toLocaleDateString()}
                </Text>
              )}
            </View>
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

        {!isPremium && (
          <>
            <View style={styles.plansWrap}>
              {packages.map((p) => {
                const isSel = selected === p.id;
                const isYear = p.id === 'yearly';
                const monthlyEq = p.id === 'yearly' ? (p.amount / 12).toFixed(2) : p.amount.toFixed(2);
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
                        <Text style={styles.savePillText}>SAVE 40%</Text>
                      </View>
                    )}
                    <Text style={[styles.planLabel, { color: c.textPrimary }]}>{p.label}</Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.priceAmt, { color: c.textPrimary }]}>
                        ${p.amount.toFixed(2)}
                      </Text>
                      <Text style={[styles.pricePeriod, { color: c.textMuted }]}>
                        /{p.days > 300 ? 'year' : 'month'}
                      </Text>
                    </View>
                    {p.id === 'yearly' && (
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
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-open-outline" size={18} color="#fff" />
                  <Text style={styles.ctaText}>Go Premium</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={[styles.fineprint, { color: c.textMuted }]}>
              Secure checkout by Stripe. Cancel anytime.
            </Text>
          </>
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
    flex: 1, borderRadius: 14,
    padding: 16, position: 'relative',
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

  sectionTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14, marginTop: 28, marginBottom: 10 },
  benefitsCard: { borderRadius: 12, borderWidth: 0.5, padding: 4 },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
  },
  benefitText: { fontFamily: 'DMSans_500Medium', fontSize: 13, flex: 1 },
});
