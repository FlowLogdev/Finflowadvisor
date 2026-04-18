import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useThemeColors } from '../src/theme';
import { getMonthlyDetail } from '../src/api';
import { BILL_CATEGORY_COLORS, EXPENSE_CATEGORY_COLORS } from '../src/types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatMonth(m: string) {
  const [y, mo] = m.split('-');
  return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
}

interface Detail {
  month: string; salary: number; currency: string;
  total_bills: number; total_expenses: number; net: number;
  expenses: any[]; bills: any[];
  expenses_by_category: { name: string; amount: number }[];
  bills_by_category: { name: string; amount: number }[];
}

export default function MonthDetailScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { month } = useLocalSearchParams<{ month: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (month) {
      getMonthlyDetail(month)
        .then(setData)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [month]);

  const exportPDF = async () => {
    if (!data) return;
    const html = buildReportHTML(data);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e) {
      console.error('Export failed', e);
    }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.income} />
      </SafeAreaView>
    );
  }

  const cur = data.currency;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="month-detail-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>{formatMonth(data.month)}</Text>
        <TouchableOpacity testID="export-pdf-btn" onPress={exportPDF} style={styles.backBtn}>
          <Ionicons name="share-outline" size={22} color={c.income} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Summary</Text>
          <Row label="Income" value={`${cur}${data.salary.toLocaleString()}`} color={c.income} c={c} />
          <Row label="Bills" value={`-${cur}${data.total_bills.toLocaleString()}`} color={c.expense} c={c} />
          <Row label="Expenses" value={`-${cur}${data.total_expenses.toLocaleString()}`} color={c.warning} c={c} />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Row label="Net" value={`${cur}${data.net.toLocaleString()}`} color={data.net >= 0 ? c.income : c.expense} c={c} bold />
        </View>

        {/* Bills */}
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Bills ({data.bills.length})</Text>
        {data.bills.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.textMuted }]}>No bills recorded</Text>
        ) : (
          data.bills.map((b: any, i: number) => (
            <View key={i} style={[styles.itemCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.dot, { backgroundColor: BILL_CATEGORY_COLORS[b.category] || '#95A5A6' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: c.textPrimary }]}>{b.name}</Text>
                <Text style={[styles.itemCat, { color: c.textMuted }]}>{b.category}</Text>
              </View>
              <Text style={[styles.itemAmt, { color: c.expense }]}>{cur}{b.amount.toLocaleString()}</Text>
            </View>
          ))
        )}

        {/* Expenses */}
        <Text style={[styles.sectionTitle, { color: c.textPrimary, marginTop: 16 }]}>Expenses ({data.expenses.length})</Text>
        {data.expenses.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.textMuted }]}>No expenses this month</Text>
        ) : (
          data.expenses.map((e: any, i: number) => (
            <View key={i} style={[styles.itemCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={[styles.dot, { backgroundColor: EXPENSE_CATEGORY_COLORS[e.category] || '#95A5A6' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: c.textPrimary }]}>{e.name}</Text>
                <Text style={[styles.itemCat, { color: c.textMuted }]}>{e.category} · {e.date}</Text>
              </View>
              <Text style={[styles.itemAmt, { color: c.warning }]}>{cur}{e.amount.toLocaleString()}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, color, c, bold }: {
  label: string; value: string; color: string; c: any; bold?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[bold ? styles.summaryBoldLabel : styles.summaryLabel, { color: c.textPrimary }]}>{label}</Text>
      <Text style={[bold ? styles.summaryBoldValue : styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function buildReportHTML(d: Detail): string {
  const cur = d.currency;
  const billRows = d.bills.map((b: any) => `<tr><td>${b.name}</td><td>${b.category}</td><td style="text-align:right">${cur}${b.amount.toLocaleString()}</td></tr>`).join('');
  const expRows = d.expenses.map((e: any) => `<tr><td>${e.name}</td><td>${e.category}</td><td>${e.date}</td><td style="text-align:right">${cur}${e.amount.toLocaleString()}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui;padding:32px;color:#1a1a18}
    h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin-top:24px}
    .summary{display:flex;gap:16px;margin:16px 0}
    .box{flex:1;padding:12px;border-radius:8px;background:#f7f6f2;text-align:center}
    .box .val{font-size:20px;font-weight:700;font-family:monospace}
    .box .lbl{font-size:11px;color:#6b6b63;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;font-size:13px}
    th{background:#f7f6f2;font-weight:600}
    .green{color:#2d5a3d}.red{color:#c84b1f}.amber{color:#b8740a}
  </style></head><body>
    <h1>FinFlow Report</h1><p style="color:#6b6b63">${formatMonth(d.month)}</p>
    <div class="summary">
      <div class="box"><div class="val green">${cur}${d.salary.toLocaleString()}</div><div class="lbl">Income</div></div>
      <div class="box"><div class="val red">${cur}${d.total_bills.toLocaleString()}</div><div class="lbl">Bills</div></div>
      <div class="box"><div class="val amber">${cur}${d.total_expenses.toLocaleString()}</div><div class="lbl">Expenses</div></div>
      <div class="box"><div class="val ${d.net >= 0 ? 'green' : 'red'}">${cur}${d.net.toLocaleString()}</div><div class="lbl">Net</div></div>
    </div>
    <h2>Bills</h2><table><tr><th>Name</th><th>Category</th><th style="text-align:right">Amount</th></tr>${billRows}</table>
    <h2>Expenses</h2><table><tr><th>Name</th><th>Category</th><th>Date</th><th style="text-align:right">Amount</th></tr>${expRows}</table>
  </body></html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { padding: 8 },
  headerTitle: { fontFamily: 'DMSans_700Bold', fontSize: 20 },
  scroll: { padding: 24, paddingBottom: 48 },
  card: { borderRadius: 12, borderWidth: 0.5, padding: 16, marginBottom: 16 },
  sectionTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 17, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontFamily: 'DMSans_400Regular', fontSize: 15 },
  summaryValue: { fontFamily: 'DMMono_400Regular', fontSize: 15 },
  summaryBoldLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 16 },
  summaryBoldValue: { fontFamily: 'DMMono_500Medium', fontSize: 17 },
  divider: { height: 0.5, marginVertical: 8 },
  itemCard: { borderRadius: 12, borderWidth: 0.5, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  itemName: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  itemCat: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  itemAmt: { fontFamily: 'DMMono_500Medium', fontSize: 14 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 14, marginBottom: 16 },
});
