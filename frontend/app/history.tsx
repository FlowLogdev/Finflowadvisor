import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import { getMonthlyHistory } from '../src/api';

interface MonthSummary {
  month: string; salary: number; currency: string;
  bills: number; expenses: number; expense_count: number; net: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
}

export default function HistoryScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [data, setData] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getMonthlyHistory()
        .then(setData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="history-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Monthly History</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.income} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={48} color={c.textMuted} />
          <Text style={[styles.emptyText, { color: c.textMuted }]}>No history yet. Start tracking expenses!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {data.map((m) => (
            <TouchableOpacity
              key={m.month}
              testID={`history-month-${m.month}`}
              onPress={() => router.push(`/month-detail?month=${m.month}`)}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.monthTitle, { color: c.textPrimary }]}>{formatMonth(m.month)}</Text>
                <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
              </View>
              <View style={styles.statsRow}>
                <Stat label="Income" value={`${m.currency}${m.salary.toLocaleString()}`} color={c.income} muted={c.textMuted} />
                <Stat label="Bills" value={`${m.currency}${m.bills.toLocaleString()}`} color={c.expense} muted={c.textMuted} />
                <Stat label="Expenses" value={`${m.currency}${m.expenses.toLocaleString()}`} color={c.warning} muted={c.textMuted} />
                <Stat label="Net" value={`${m.currency}${m.net.toLocaleString()}`} color={m.net >= 0 ? c.income : c.expense} muted={c.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, color, muted }: { label: string; value: string; color: string; muted: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 8 },
  headerTitle: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { padding: 24, paddingBottom: 48 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  monthTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 17 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  statLabel: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginBottom: 4 },
  statValue: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 15, textAlign: 'center' },
});
