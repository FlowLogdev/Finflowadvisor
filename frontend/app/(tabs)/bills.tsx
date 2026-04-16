import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/theme';
import { getBills, createBill, deleteBill, getSettings } from '@/src/api';
import { Bill, BILL_CATEGORIES, BILL_CATEGORY_COLORS, Settings } from '@/src/types';

export default function BillsScreen() {
  const c = useThemeColors();
  const [bills, setBills] = useState<Bill[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(BILL_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
  };

  const addBill = async () => {
    if (!name.trim() || !amount.trim()) return;
    setSubmitting(true);
    try {
      const bill = await createBill({ name: name.trim(), category, amount: parseFloat(amount) });
      setBills([...bills, bill]);
      setName('');
      setAmount('');
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
          <Text style={[styles.title, { color: c.textPrimary }]}>Bills</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>Recurring monthly bills</Text>

          {/* Summary */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.summaryRow}>
              <SummaryItem label="Total Bills" value={`${cur}${totalBills.toLocaleString()}`} color={c.expense} mutedColor={c.textMuted} />
              <SummaryItem label="Remaining" value={`${cur}${remaining.toLocaleString()}`} color={remaining >= 0 ? c.income : c.expense} mutedColor={c.textMuted} />
              <SummaryItem label="% of Income" value={`${pctOfIncome}%`} color={c.warning} mutedColor={c.textMuted} />
            </View>
          </View>

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
              <TextInput
                testID="bill-amount-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder={`Amount (${cur})`}
                placeholderTextColor={c.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
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
            bills.map((bill) => (
              <View key={bill.id} style={[styles.itemCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={[styles.colorDot, { backgroundColor: BILL_CATEGORY_COLORS[bill.category] || '#95A5A6' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: c.textPrimary }]}>{bill.name}</Text>
                  <Text style={[styles.itemCategory, { color: c.textMuted }]}>{bill.category}</Text>
                </View>
                <Text style={[styles.itemAmount, { color: c.expense }]}>{cur}{bill.amount.toLocaleString()}</Text>
                <TouchableOpacity testID={`delete-bill-${bill.id}`} onPress={() => removeBill(bill.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color={c.expense} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginBottom: 16, gap: 8 },
  addBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },
  input: { borderRadius: 12, borderWidth: 0.5, padding: 14, fontSize: 16, fontFamily: 'DMSans_400Regular', marginBottom: 12 },
  fieldLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 8 },
  catScroll: { marginBottom: 12 },
  catPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 0.5, marginRight: 8 },
  catPillText: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#fff' },
  itemCard: { borderRadius: 12, borderWidth: 0.5, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  itemName: { fontFamily: 'DMSans_500Medium', fontSize: 15 },
  itemCategory: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  itemAmount: { fontFamily: 'DMMono_500Medium', fontSize: 16, marginRight: 12 },
  deleteBtn: { padding: 8 },
  emptyCard: { borderRadius: 12, borderWidth: 0.5, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 15, marginTop: 12, textAlign: 'center' },
});
