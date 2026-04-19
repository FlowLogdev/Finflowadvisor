import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity,
  Modal, TextInput, Alert, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme';
import { useI18n } from '../i18n';
import {
  getFxRates, getStockQuotes, getWatchlist, addToWatchlist, removeFromWatchlist,
  FxRate, StockQuote,
} from '../api';

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', BRL: '🇧🇷', EUR: '🇪🇺', GBP: '🇬🇧',
  JPY: '🇯🇵', CAD: '🇨🇦', AUD: '🇦🇺',
};

function fmtRate(n: number): string {
  if (n >= 100) return n.toFixed(2);
  if (n >= 10) return n.toFixed(3);
  return n.toFixed(4);
}

export function MarketsCard() {
  const c = useThemeColors();
  const { t } = useI18n();
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFxRates();
      setRates(data.rates);
    } catch (e) {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('dashboard.markets')}</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>{t('dashboard.marketsSubtitle')}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={refreshing} hitSlop={10}>
          <Ionicons
            name="refresh-outline"
            size={18}
            color={refreshing ? c.textMuted : c.income}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.income} style={{ marginVertical: 12 }} />
      ) : rates.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>—</Text>
      ) : (
        <View style={styles.ratesWrap}>
          {rates.map((r) => (
            <View key={`${r.base}-${r.quote}`} style={[styles.rateRow, { borderBottomColor: c.border }]}>
              <View style={styles.rateLeft}>
                <Text style={styles.flagPair}>{FLAGS[r.base] || '💱'} → {FLAGS[r.quote] || '💱'}</Text>
                <Text style={[styles.pair, { color: c.textPrimary }]}>
                  {r.base}/{r.quote}
                </Text>
              </View>
              <Text style={[styles.rateValue, { color: c.textPrimary }]}>{fmtRate(r.rate)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function WatchlistCard() {
  const c = useThemeColors();
  const { t } = useI18n();
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const wl = await getWatchlist();
      const symbols = wl.length
        ? wl.map((w) => w.symbol).join(',')
        : undefined;
      const data = await getStockQuotes(symbols);
      setQuotes(data.quotes);
    } catch (e) {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleAdd = async () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    setAdding(true);
    try {
      await addToWatchlist(sym);
      setNewSymbol('');
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message?.includes('Unknown') ? t('dashboard.unknownSymbol') + ': ' + sym : (e?.message || 'Failed'));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (sym: string) => {
    Alert.alert(
      sym,
      t('common.delete') + ' ' + sym + '?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFromWatchlist(sym);
              await load();
            } catch {}
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('dashboard.watchlist')}</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>{t('dashboard.watchlistSubtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} hitSlop={10}>
            <Ionicons
              name="refresh-outline"
              size={18}
              color={refreshing ? c.textMuted : c.income}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAdd(true)}
            hitSlop={10}
            style={[styles.addBtn, { backgroundColor: c.income }]}
          >
            <Ionicons name="add" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={c.income} style={{ marginVertical: 12 }} />
      ) : quotes.length === 0 ? (
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          {t('dashboard.noWatchlist')}
        </Text>
      ) : (
        <View style={styles.ratesWrap}>
          {quotes.map((q) => {
            const positive = (q.changePercent || 0) >= 0;
            return (
              <TouchableOpacity
                key={q.symbol}
                onLongPress={() => handleRemove(q.symbol)}
                delayLongPress={500}
                style={[styles.rateRow, { borderBottomColor: c.border }]}
              >
                <View style={styles.rateLeft}>
                  <Text style={[styles.stockSymbol, { color: c.textPrimary }]}>{q.symbol}</Text>
                  <Text style={[styles.stockPrev, { color: c.textMuted }]}>
                    ${q.prevClose?.toFixed(2) || '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.rateValue, { color: c.textPrimary }]}>
                    ${q.price?.toFixed(2) || '—'}
                  </Text>
                  <Text style={[
                    styles.stockChange,
                    { color: positive ? c.income : c.expense },
                  ]}>
                    {positive ? '▲' : '▼'} {Math.abs(q.changePercent || 0).toFixed(2)}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Add modal */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAdd(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalContent, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>
              {t('dashboard.addSymbol')}
            </Text>
            <TextInput
              value={newSymbol}
              onChangeText={(txt) => setNewSymbol(txt.toUpperCase())}
              placeholder="AAPL, TSLA, etc."
              placeholderTextColor={c.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.input,
                { color: c.textPrimary, backgroundColor: c.surfaceSecondary, borderColor: c.border },
              ]}
              maxLength={8}
              onSubmitEditing={handleAdd}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: c.surfaceSecondary }]}
                onPress={() => { setShowAdd(false); setNewSymbol(''); }}
                disabled={adding}
              >
                <Text style={[styles.modalBtnText, { color: c.textPrimary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: c.income }]}
                onPress={handleAdd}
                disabled={adding || !newSymbol.trim()}
              >
                {adding ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.add')}</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalHint, { color: c.textMuted }]}>
              {Platform.OS === 'web' ? 'Right-click to remove' : 'Long-press to remove'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 2 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  ratesWrap: {},
  rateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 0.5,
  },
  rateLeft: { flexDirection: 'column' },
  flagPair: { fontSize: 14 },
  pair: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginTop: 2 },
  rateValue: { fontFamily: 'DMMono_500Medium', fontSize: 15 },

  stockSymbol: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  stockPrev: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 2 },
  stockChange: { fontFamily: 'DMSans_500Medium', fontSize: 12, marginTop: 2 },

  addBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modalContent: {
    width: '100%', maxWidth: 360,
    borderRadius: 14, borderWidth: 0.5, padding: 20,
  },
  modalTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16, marginBottom: 12 },
  input: {
    borderWidth: 0.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontFamily: 'DMSans_500Medium', marginBottom: 14,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  modalHint: { fontFamily: 'DMSans_400Regular', fontSize: 11, textAlign: 'center', marginTop: 10 },
});
