import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import { adminListTickets, adminReplyTicket, adminCloseTicket, AdminTicket } from '../src/featuresApi';

const STATUS_COLORS: Record<string, string> = {
  open: '#c84b1f',
  replied: '#b8740a',
  closed: '#6b7280',
};

export default function AdminTicketsScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [detailOpen, setDetailOpen] = useState<AdminTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminListTickets(filter || undefined);
      setTickets(res.tickets || []);
    } catch (e: any) {
      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not load tickets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const sendReply = async () => {
    if (!detailOpen || !replyText.trim()) return;
    setReplying(true);
    try {
      await adminReplyTicket(detailOpen.ticket_number, replyText.trim());
      Alert.alert('Reply sent', `Email dispatched to ${detailOpen.email}`);
      setReplyText('');
      setDetailOpen(null);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not send reply');
    } finally {
      setReplying(false);
    }
  };

  const closeTicket = async () => {
    if (!detailOpen) return;
    Alert.alert('Close ticket?', `Mark #${detailOpen.ticket_number} as closed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminCloseTicket(detailOpen.ticket_number);
            setDetailOpen(null);
            await load();
          } catch (e: any) {
            Alert.alert('Error', e?.message?.slice(0, 160) || 'Failed');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.bg }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Support Tickets</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>Admin · {tickets.length} total</Text>
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {['', 'open', 'replied', 'closed'].map((f) => (
          <TouchableOpacity
            key={f || 'all'}
            onPress={() => setFilter(f)}
            style={[
              styles.filterPill,
              { backgroundColor: filter === f ? c.income : c.surface, borderColor: c.border },
            ]}
          >
            <Text style={[styles.filterText, { color: filter === f ? '#fff' : c.textPrimary }]}>
              {f || 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.income} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Ionicons name="checkmark-circle-outline" size={48} color={c.textMuted} />
          <Text style={[{ color: c.textMuted, marginTop: 12, fontFamily: 'DMSans_500Medium' }]}>
            No tickets{filter ? ` with status "${filter}"` : ''}
          </Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          {tickets.map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setDetailOpen(t)}
              style={[styles.ticketCard, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.ticketHeader}>
                <Text style={[styles.ticketNum, { color: c.income }]}>#{t.ticket_number}</Text>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[t.status] + '22', borderColor: STATUS_COLORS[t.status] }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[t.status] }]}>{t.status}</Text>
                </View>
              </View>
              <Text style={[styles.ticketName, { color: c.textPrimary }]}>{t.name}</Text>
              <Text style={[styles.ticketEmail, { color: c.textMuted }]}>{t.email}</Text>
              <Text style={[styles.ticketDesc, { color: c.textPrimary }]} numberOfLines={2}>
                {t.description}
              </Text>
              <Text style={[styles.ticketDate, { color: c.textMuted }]}>
                {new Date(t.created_at).toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal visible={!!detailOpen} animationType="slide" onRequestClose={() => setDetailOpen(null)}>
        <SafeAreaView style={[{ flex: 1, backgroundColor: c.bg }]} edges={['top']}>
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={() => setDetailOpen(null)} hitSlop={10}>
              <Ionicons name="close" size={24} color={c.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: c.textPrimary, marginLeft: 8, flex: 1 }]}>
              #{detailOpen?.ticket_number}
            </Text>
            {detailOpen?.status !== 'closed' && (
              <TouchableOpacity onPress={closeTicket} hitSlop={10}>
                <Text style={[styles.closeText, { color: c.expense }]}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={[styles.label, { color: c.textMuted }]}>From</Text>
            <Text style={[styles.detailValue, { color: c.textPrimary }]}>
              {detailOpen?.name} · {detailOpen?.email}
            </Text>
            {detailOpen?.phone && (
              <Text style={[styles.detailValue, { color: c.textMuted, marginTop: 2 }]}>{detailOpen.phone}</Text>
            )}

            <Text style={[styles.label, { color: c.textMuted, marginTop: 16 }]}>Description</Text>
            <Text style={[styles.descBlock, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border }]}>
              {detailOpen?.description}
            </Text>

            {detailOpen?.replies && detailOpen.replies.length > 0 && (
              <>
                <Text style={[styles.label, { color: c.textMuted, marginTop: 16 }]}>Replies</Text>
                {detailOpen.replies.map((r, i) => (
                  <View key={i} style={[styles.replyBlock, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Text style={[styles.replyBy, { color: c.income }]}>{r.by}</Text>
                    <Text style={[styles.replyMsg, { color: c.textPrimary }]}>{r.message}</Text>
                    <Text style={[styles.replyAt, { color: c.textMuted }]}>
                      {new Date(r.at).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </>
            )}

            {detailOpen?.status !== 'closed' && (
              <>
                <Text style={[styles.label, { color: c.textMuted, marginTop: 16 }]}>Reply</Text>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  numberOfLines={5}
                  placeholder="Write your reply — will be emailed to the customer"
                  placeholderTextColor={c.textMuted}
                  style={[styles.replyInput, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border }]}
                />
                <TouchableOpacity
                  style={[styles.replyBtn, { backgroundColor: c.income, opacity: replying || !replyText.trim() ? 0.6 : 1 }]}
                  disabled={replying || !replyText.trim()}
                  onPress={sendReply}
                >
                  {replying ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                      <Text style={styles.replyBtnText}>Send reply</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 1 },
  closeText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 18, borderWidth: 0.5,
  },
  filterText: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, textTransform: 'capitalize' },

  ticketCard: {
    borderRadius: 12, borderWidth: 0.5, padding: 14, marginBottom: 10,
  },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  ticketNum: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, borderWidth: 1,
  },
  statusText: { fontFamily: 'DMSans_700Bold', fontSize: 10, textTransform: 'uppercase' },
  ticketName: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  ticketEmail: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 1 },
  ticketDesc: { fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 6, lineHeight: 18 },
  ticketDate: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 6 },

  label: { fontFamily: 'DMSans_500Medium', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  detailValue: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  descBlock: {
    borderRadius: 10, borderWidth: 0.5,
    padding: 12, fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20,
  },
  replyBlock: {
    borderRadius: 10, borderWidth: 0.5, padding: 12, marginTop: 8,
  },
  replyBy: { fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
  replyMsg: { fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 4, lineHeight: 20 },
  replyAt: { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 4 },
  replyInput: {
    borderRadius: 10, borderWidth: 0.5, padding: 12,
    fontFamily: 'DMSans_400Regular', fontSize: 14,
    minHeight: 110, textAlignVertical: 'top',
  },
  replyBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 10, marginTop: 10, marginBottom: 30,
  },
  replyBtnText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 14 },
});
