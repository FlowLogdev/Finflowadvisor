import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../src/theme';
import {
  getBills, createBill, deleteBill, getSettings,
  createPlaidLinkToken, exchangePlaidPublicToken, syncPlaidTransactions,
  getPlaidStatus, disconnectPlaidItem, PlaidStatus,
} from '../../src/api';
import { getBillingMe } from '../../src/featuresApi';
import { Bill, BILL_CATEGORIES, BILL_CATEGORY_COLORS, Settings } from '../../src/types';
import { ThemeToggle } from '../../src/components/LogoHeader';

export default function BillsScreen() {
  const c = useThemeColors();
  const [bills, setBills] = useState<Bill[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(BILL_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [plaidStatus, setPlaidStatus] = useState<PlaidStatus | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidSyncing, setPlaidSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    try {
      const [b, s] = await Promise.all([getBills(), getSettings()]);
      setBills(b);
      setSettings(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // Non-critical: premium/Plaid status shouldn't block the bills list from loading.
    if (Platform.OS !== 'web') {
      getBillingMe().then((me) => setIsPremium(!!me.premium)).catch(() => {});
      getPlaidStatus().then(setPlaidStatus).catch(() => {});
    }
  };

  const connectBank = async () => {
    if (plaidBusy) return;
    setPlaidBusy(true);
    try {
      const { createPlaidLinkSession } = await import('react-native-plaid-link-sdk');
      const { link_token } = await createPlaidLinkToken();
      const session = await createPlaidLinkSession({
        token: link_token,
        onSuccess: async (success: any) => {
          setPlaidSyncing(true);
          try {
            await exchangePlaidPublicToken(success.publicToken, success.metadata?.institution?.name);
            await syncPlaidTransactions();
            await load();
          } catch (e: any) {
            Alert.alert('Import failed', e?.message?.slice(0, 160) || 'Could not import transactions.');
          } finally {
            setPlaidSyncing(false);
            setPlaidBusy(false);
          }
        },
        onExit: (exit: any) => {
          setPlaidBusy(false);
          if (exit?.error) {
            Alert.alert('Connection failed', exit.error.errorMessage || 'Please try again.');
          }
        },
        onEvent: () => {},
      });
      await session.open();
    } catch (e: any) {
      setPlaidBusy(false);
      Alert.alert('Connection failed', e?.message?.slice(0, 160) || 'Could not start bank connection.');
    }
  };

  const syncNow = async () => {
    if (plaidSyncing) return;
    setPlaidSyncing(true);
    try {
      await syncPlaidTransactions();
      await load();
    } catch (e: any) {
      Alert.alert('Sync failed', e?.message?.slice(0, 160) || 'Could not sync transactions.');
    } finally {
      setPlaidSyncing(false);
    }
  };

  const disconnectBank = (item_id: string) => {
    Alert.alert('Disconnect Bank', 'Are you sure? Previously imported bills and expenses will be kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          await disconnectPlaidItem(item_id);
          await load();
        },
      },
    ]);
  };

  const addBill = async () => {
    if (!name.trim() || !amount.trim()) return;
    setSubmitting(true);
    try {
      const dd = parseInt(dueDay, 10);
      const bill = await createBill({
        name: name.trim(), category,
        amount: parseFloat(amount),
        dueDay: dd >= 1 && dd <= 31 ? dd : null,
      });
      setBills([...bills, bill]);
      setName('');
      setAmount('');
      setDueDay('');
      setShowForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const removeBill = (id: string) => {
    Alert.alert('Delete Bill', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteBill(id);
          setBills(bills.filter((b) => b.id !== id));
        },
      },
    ]);
  };

  const totalBills = bills.reduce((s, b) => s + b.amount, 0);
  const salary = settings?.salary || 0;
  const remaining = salary - totalBills;
  const pctOfIncome = salary > 0 ? ((totalBills / salary) * 100).toFixed(1) : '0';
  const cur = settings?.currency || '$';

  // Check which bills are due soon (within 3 days)
  const today = new Date().getDate();
  const isDueSoon = (dueDay?: number | null) => {
    if (!dueDay) return false;
    const diff = dueDay - today;
    return diff >= 0 && diff <= 3;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.income} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[styles.title, { color: c.textPrimary }]}>Bills</Text>
              <Text style={[styles.subtitle, { color: c.textMuted }]}>Recurring monthly bills</Text>
            </View>
            <ThemeToggle />
          </View>

          {/* Summary */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.summaryRow}>
              <SummaryItem label="Total Bills" value={`${cur}${totalBills.toLocaleString()}`} color={c.expense} mutedColor={c.textMuted} />
              <SummaryItem label="Remaining" value={`${cur}${remaining.toLocaleString()}`} color={remaining >= 0 ? c.income : c.expense} mutedColor={c.textMuted} />
              <SummaryItem label="% of Income" value={`${pctOfIncome}%`} color={c.warning} mutedColor={c.textMuted} />
            </View>
          </View>

          {/* Connect Bank (Premium, US only) */}
          {isPremium && Platform.OS !== 'web' && (
            plaidStatus?.connected && plaidStatus.items[0] ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="business-outline" size={20} color={c.income} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: c.textPrimary }]}>
                      Connected: {plaidStatus.items[0].institution_name || 'Bank account'}
                    </Text>
                    <Text style={[styles.itemCategory, { color: c.textMuted }]}>
                      {plaidStatus.items[0].last_synced_at
                        ? `Synced ${timeAgo(plaidStatus.items[0].last_synced_at)}`
                        : 'Not synced yet'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    testID="sync-bank-btn"
                    onPress={syncNow}
                    disabled={plaidSyncing}
                    style={[styles.plaidActionBtn, { backgroundColor: c.income }]}
                  >
                    {plaidSyncing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.plaidActionBtnText}>Sync now</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="disconnect-bank-btn"
                    onPress={() => disconnectBank(plaidStatus.items[0].item_id)}
                    style={[styles.plaidActionBtn, { backgroundColor: c.surfaceSecondary, borderWidth: 0.5, borderColor: c.border }]}
                  >
                    <Text style={[styles.plaidActionBtnText, { color: c.expense }]}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                testID="connect-bank-btn"
                onPress={connectBank}
                disabled={plaidBusy}
                style={[styles.card, styles.plaidConnectCard, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <Ionicons name="business-outline" size={22} color={c.income} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: c.textPrimary }]}>Connect Bank Account</Text>
                  <Text style={[styles.itemCategory, { color: c.textMuted }]}>Auto-import bills & expenses (US only)</Text>
                </View>
                {plaidBusy ? <ActivityIndicator color={c.income} /> : <Ionicons name="chevron-forward" size={20} color={c.textMuted} />}
              </TouchableOpacity>
            )
          )}

          {/* Add Button */}
          <TouchableOpacity
            testID="toggle-add-bill-btn"
            onPress={() => setShowForm(!showForm)}
            style={[styles.addBtn, { backgroundColor: c.income }]}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
            <Text style={styles.addBtnText}>{showForm ? 'Cancel' : 'Add Bill'}</Text>
          </TouchableOpacity>

          {/* Add Form */}
          {showForm && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <TextInput
                testID="bill-name-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder="Bill name"
                placeholderTextColor={c.textMuted}
                value={name}
                onChangeText={setName}
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                {BILL_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    testID={`bill-cat-${cat}`}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.catPill,
                      {
                        backgroundColor: category === cat ? (BILL_CATEGORY_COLORS[cat] || c.income) : c.surfaceSecondary,
                        borderColor: category === cat ? (BILL_CATEGORY_COLORS[cat] || c.income) : c.border,
                      },
                    ]}
                  >
                    <Text style={[styles.catPillText, { color: category === cat ? '#fff' : c.textPrimary }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.rowInputs}>
                <TextInput
                  testID="bill-amount-input"
                  style={[styles.input, { flex: 1, backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                  placeholder={`Amount (${cur})`}
                  placeholderTextColor={c.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
                <TextInput
                  testID="bill-due-day-input"
                  style={[styles.input, { width: 100, backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                  placeholder="Due day"
                  placeholderTextColor={c.textMuted}
                  value={dueDay}
                  onChangeText={setDueDay}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <TouchableOpacity testID="submit-bill-btn" onPress={addBill} disabled={submitting} style={[styles.submitBtn, { backgroundColor: c.income }]}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Add Bill</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Bill List */}
          {bills.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="receipt-outline" size={40} color={c.textMuted} />
              <Text style={[styles.emptyText, { color: c.textMuted }]}>No bills yet. Add your first bill!</Text>
            </View>
          ) : (
            bills.map((bill) => {
              const dueSoon = isDueSoon(bill.dueDay);
              return (
                <View key={bill.id} style={[styles.itemCard, { backgroundColor: c.surface, borderColor: dueSoon ? c.warning : c.border, borderWidth: dueSoon ? 1.5 : 0.5 }]}>
                  <View style={[styles.colorDot, { backgroundColor: BILL_CATEGORY_COLORS[bill.category] || '#95A5A6' }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.itemName, { color: c.textPrimary }]}>{bill.name}</Text>
                      {dueSoon && (
                        <View style={[styles.dueBadge, { backgroundColor: c.warning + '22' }]}>
                          <Text style={[styles.dueBadgeText, { color: c.warning }]}>Due soon</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.itemCategory, { color: c.textMuted }]}>
                      {bill.category}{bill.dueDay ? ` · Due: ${bill.dueDay}${ordinal(bill.dueDay)}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmount, { color: c.expense }]}>{cur}{bill.amount.toLocaleString()}</Text>
                  <TouchableOpacity testID={`delete-bill-${bill.id}`} onPress={() => removeBill(bill.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={c.expense} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function SummaryItem({ label, value, color, mutedColor }: { label: string; value: string; color: string; mutedColor: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 32, lineHeight: 40, marginBottom: 4 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryLabel: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 4 },
  summaryValue: { fontFamily: 'DMMono_500Medium', fontSize: 18 },
  plaidConnectCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plaidActionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  plaidActionBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: '#fff' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginBottom: 16, gap: 8 },
  addBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },
  input: { borderRadius: 12, borderWidth: 0.5, padding: 14, fontSize: 16, fontFamily: 'DMSans_400Regular', marginBottom: 12 },
  fieldLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 8 },
  catScroll: { marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 0.5, marginRight: 8 },
  catPillText: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  rowInputs: { flexDirection: 'row', gap: 12 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },
  itemCard: { borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  itemName: { fontFamily: 'DMSans_500Medium', fontSize: 15 },
  itemCategory: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  itemAmount: { fontFamily: 'DMMono_500Medium', fontSize: 16, marginRight: 12 },
  deleteBtn: { padding: 8 },
  dueBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  dueBadgeText: { fontFamily: 'DMSans_500Medium', fontSize: 10 },
  emptyCard: { borderRadius: 12, borderWidth: 0.5, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 15, marginTop: 12, textAlign: 'center' },
});
