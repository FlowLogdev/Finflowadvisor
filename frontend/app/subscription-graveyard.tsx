import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import {
  getSubscriptionGraveyard, toggleSubscriptionUnused,
  GraveyardResponse, GraveSub,
} from '../src/api';

const fmt = (n: number, sym: string) => {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2);
  return `${sym}${s}`;
};

export default function SubscriptionGraveyardScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [data, setData] = useState<GraveyardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getSubscriptionGraveyard();
      setData(d);
    } catch (e: any) {
      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not load subscriptions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleToggle = async (sub: GraveSub) => {
    setTogglingId(sub.id);
    try {
      await toggleSubscriptionUnused(sub.id);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not update');
    } finally {
      setTogglingId(null);
    }
  };

  const sym = data?.currency || '$';
  const active = (data?.subscriptions || []).filter((s) => !s.is_buried);
  const buried = (data?.subscriptions || []).filter((s) => s.is_buried);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Subscription Graveyard 🪦</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            Bury the ones you never use
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.income} />}
      >
        {loading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={c.income} />
          </View>
        ) : !data ? (
          <Text style={[styles.muted, { color: c.textMuted, textAlign: 'center', padding: 40 }]}>
            Pull to retry
          </Text>
        ) : (
          <>
            {/* Summary hero */}
            <View style={[styles.heroCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.heroRow}>
                <View style={styles.heroCell}>
                  <Text style={[styles.heroLabel, { color: c.textMuted }]}>Monthly total</Text>
                  <Text style={[styles.heroValue, { color: c.textPrimary }]}>
                    {fmt(data.total_monthly, sym)}
                  </Text>
                </View>
                <View style={styles.heroDiv} />
                <View style={styles.heroCell}>
                  <Text style={[styles.heroLabel, { color: c.textMuted }]}>Annual total</Text>
                  <Text style={[styles.heroValue, { color: c.textPrimary }]}>
                    {fmt(data.total_annual, sym)}
                  </Text>
                </View>
              </View>

              {data.total_waste_monthly > 0 ? (
                <View style={[styles.wasteBox, { backgroundColor: c.expense + '18', borderColor: c.expense }]}>
                  <Ionicons name="warning-outline" size={18} color={c.expense} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.wasteTitle, { color: c.expense }]}>
                      Wasting {fmt(data.total_waste_monthly, sym)}/mo
                    </Text>
                    <Text style={[styles.wasteDetail, { color: c.textPrimary }]}>
                      That's <Text style={{ fontFamily: 'DMSans_700Bold' }}>{fmt(data.total_waste_annual, sym)}</Text> a year on unused subscriptions
                    </Text>
                  </View>
                </View>
              ) : (data.subscriptions.length > 0 ? (
                <View style={[styles.wasteBox, { backgroundColor: c.income + '18', borderColor: c.income }]}>
                  <Ionicons name="checkmark-circle" size={18} color={c.income} />
                  <Text style={[styles.wasteTitle, { color: c.income, marginLeft: 8 }]}>
                    No wasted subscriptions 🎉
                  </Text>
                </View>
              ) : null)}
            </View>

            {data.subscriptions.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>👻</Text>
                <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
                  No subscriptions found
                </Text>
                <Text style={[styles.emptyDesc, { color: c.textMuted }]}>
                  Add bills under the "Subscriptions" category or mark expenses as recurring
                  to track them here.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: c.income, marginTop: 16 }]}
                  onPress={() => router.push('/(tabs)/bills' as any)}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Add a subscription</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Active subscriptions */}
                {active.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: c.textMuted }]}>
                      Active ({active.length})
                    </Text>
                    {active.map((s) => (
                      <SubRow
                        key={s.id}
                        sub={s}
                        sym={sym}
                        c={c}
                        toggling={togglingId === s.id}
                        onToggle={() => handleToggle(s)}
                      />
                    ))}
                  </>
                )}

                {/* Buried subscriptions */}
                {buried.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 16 }]}>
                      Buried 🪦 ({buried.length})
                    </Text>
                    {buried.map((s) => (
                      <SubRow
                        key={s.id}
                        sub={s}
                        sym={sym}
                        c={c}
                        toggling={togglingId === s.id}
                        onToggle={() => handleToggle(s)}
                      />
                    ))}
                  </>
                )}

                <Text style={[styles.footerNote, { color: c.textMuted }]}>
                  Based on {data.months_active} {data.months_active === 1 ? 'month' : 'months'} of
                  tracking. Burying a subscription doesn't delete it — it just flags it as wasted
                  spend so you remember to cancel it.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SubRow({ sub, sym, c, toggling, onToggle }: {
  sub: GraveSub; sym: string; c: any; toggling: boolean; onToggle: () => void;
}) {
  const buried = sub.is_buried;
  return (
    <View style={[
      styles.subCard,
      {
        backgroundColor: c.surface,
        borderColor: buried ? c.expense + '66' : c.border,
        opacity: buried ? 0.75 : 1,
      },
    ]}>
      <View style={styles.subRow}>
        <View style={[styles.subIcon, { backgroundColor: (buried ? c.expense : c.income) + '22' }]}>
          <Ionicons
            name={buried ? 'skull-outline' : (sub.type === 'bill' ? 'card-outline' : 'refresh-circle-outline')}
            size={18}
            color={buried ? c.expense : c.income}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[
            styles.subName,
            { color: c.textPrimary, textDecorationLine: buried ? 'line-through' : 'none' },
          ]}>
            {sub.name}
          </Text>
          <Text style={[styles.subMeta, { color: c.textMuted }]}>
            {sub.category} · {fmt(sub.cumulative_cost, sym)} spent total
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.subAmount, { color: buried ? c.expense : c.textPrimary }]}>
            {fmt(sub.monthly_cost, sym)}
          </Text>
          <Text style={[styles.subPeriod, { color: c.textMuted }]}>per month</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.toggleBtn,
          { borderColor: buried ? c.income : c.expense },
        ]}
        onPress={onToggle}
        disabled={toggling}
      >
        {toggling ? (
          <ActivityIndicator size="small" color={buried ? c.income : c.expense} />
        ) : (
          <>
            <Ionicons
              name={buried ? 'refresh-outline' : 'skull-outline'}
              size={14}
              color={buried ? c.income : c.expense}
            />
            <Text style={[styles.toggleBtnText, { color: buried ? c.income : c.expense }]}>
              {buried ? 'Unbury (still using it)' : 'Bury (not using it)'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 60 },
  muted: { fontFamily: 'DMSans_400Regular', fontSize: 13 },

  // Hero
  heroCard: { borderRadius: 14, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroCell: { flex: 1, alignItems: 'center' },
  heroDiv: { width: 1, height: 36, backgroundColor: 'rgba(128,128,128,0.2)' },
  heroLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  heroValue: { fontFamily: 'DMSans_700Bold', fontSize: 22 },

  wasteBox: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 0.5, padding: 12, marginTop: 14,
  },
  wasteTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  wasteDetail: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2, lineHeight: 16 },

  // Empty
  emptyBox: {
    borderRadius: 14, borderWidth: 0.5, padding: 24,
    alignItems: 'center', marginTop: 20,
  },
  emptyTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginBottom: 6 },
  emptyDesc: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 14 },

  // Section
  sectionLabel: {
    fontFamily: 'DMSans_500Medium', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },

  // Subscription card
  subCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  subName: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  subMeta: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 2 },
  subAmount: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  subPeriod: { fontFamily: 'DMSans_400Regular', fontSize: 10 },

  toggleBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginTop: 10,
  },
  toggleBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 12 },

  footerNote: { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 16, marginTop: 14, textAlign: 'center' },
});
