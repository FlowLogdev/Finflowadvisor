import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/theme';
import { getExpenses, createExpense, deleteExpense, getSettings } from '@/src/api';
import { Expense, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_COLORS, Settings } from '@/src/types';

export default function ExpensesScreen() {
  const c = useThemeColors();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    try {
      const [e, s] = await Promise.all([getExpenses(), getSettings()]);
      setExpenses(e);
      setSettings(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const addExpense = async () => {
    if (!name.trim() || !amount.trim()) return;
    setSubmitting(true);
    try {
      const exp = await createExpense({
        name: name.trim(), category,
        amount: parseFloat(amount), date,
      });
      setExpenses([...expenses, exp]);
      setName('');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const removeExpense = (id: string) => {
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteExpense(id);
          setExpenses(expenses.filter((e) => e.id !== id));
        },
      },
    ]);
  };

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = expenses.filter((e) => e.date.startsWith(monthKey));
  const thisMonthTotal = thisMonth.reduce((s, e) => s + e.amount, 0);
  const avgPerEntry = expenses.length > 0 ? totalExpenses / expenses.length : 0;
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
          <Text style={[styles.title, { color: c.textPrimary }]}>Expenses</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>Track daily spending</Text>

          {/* Summary */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Total</Text>
                <Text style={[styles.summaryValue, { color: c.expense }]}>{cur}{totalExpenses.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryLabel, { color: c.textMuted }]}>This Month</Text>
                <Text style={[styles.summaryValue, { color: c.expense }]}>{cur}{thisMonthTotal.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Average</Text>
                <Text style={[styles.summaryValue, { color: c.warning }]}>{cur}{avgPerEntry.toFixed(0)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryLabel, { color: c.textMuted }]}>Count</Text>
                <Text style={[styles.summaryValue, { color: c.textPrimary }]}>{expenses.length}</Text>
              </View>
            </View>
          </View>

          {/* Add Button */}
          <TouchableOpacity
            testID="toggle-add-expense-btn"
            onPress={() => setShowForm(!showForm)}
            style={[styles.addBtn, { backgroundColor: c.income }]}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#fff" />
            <Text style={styles.addBtnText}>{showForm ? 'Cancel' : 'Add Expense'}</Text>
          </TouchableOpacity>

          {/* Add Form */}
          {showForm && (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <TextInput
                testID="expense-name-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder="Description"
                placeholderTextColor={c.textMuted}
                value={name}
                onChangeText={setName}
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    testID={`expense-cat-${cat}`}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.catPill,
                      {
                        backgroundColor: category === cat ? (EXPENSE_CATEGORY_COLORS[cat] || c.income) : c.surfaceSecondary,
                        borderColor: category === cat ? (EXPENSE_CATEGORY_COLORS[cat] || c.income) : c.border,
                      },
                    ]}
                  >
                    <Text style={[styles.catPillText, { color: category === cat ? '#fff' : c.textPrimary }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                testID="expense-amount-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder={`Amount (${cur})`}
                placeholderTextColor={c.textMuted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
              <TextInput
                testID="expense-date-input"
                style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
                placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={c.textMuted}
                value={date}
                onChangeText={setDate}
              />
              <TouchableOpacity testID="submit-expense-btn" onPress={addExpense} disabled={submitting} style={[styles.submitBtn, { backgroundColor: c.income }]}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Add Expense</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Expense List */}
          {expenses.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="card-outline" size={40} color={c.textMuted} />
              <Text style={[styles.emptyText, { color: c.textMuted }]}>No expenses yet. Add your first expense!</Text>
            </View>
          ) : (
            [...expenses].reverse().map((exp) => (
              <View key={exp.id} style={[styles.itemCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={[styles.colorDot, { backgroundColor: EXPENSE_CATEGORY_COLORS[exp.category] || '#95A5A6' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: c.textPrimary }]}>{exp.name}</Text>
                  <Text style={[styles.itemMeta, { color: c.textMuted }]}>{exp.category} · {exp.date}</Text>
                </View>
                <Text style={[styles.itemAmount, { color: c.expense }]}>{cur}{exp.amount.toLocaleString()}</Text>
                <TouchableOpacity testID={`delete-expense-${exp.id}`} onPress={() => removeExpense(exp.id)} style={styles.deleteBtn}>
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

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 24, paddingBottom: 48 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 32, lineHeight: 40, marginBottom: 4 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  summaryCell: { width: '50%', paddingVertical: 8, alignItems: 'center' },
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
  itemMeta: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  itemAmount: { fontFamily: 'DMMono_500Medium', fontSize: 16, marginRight: 12 },
  deleteBtn: { padding: 8 },
  emptyCard: { borderRadius: 12, borderWidth: 0.5, padding: 32, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 15, marginTop: 12, textAlign: 'center' },
});
