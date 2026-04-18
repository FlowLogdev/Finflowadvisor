import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../src/theme';
import { ThemeToggle } from '../../src/components/LogoHeader';
import {
  aiAdvisorChat, aiAdvisorHistory, aiAdvisorClearHistory,
} from '../../src/api';

type Msg = {
  _id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
};

const SUGGESTED_PROMPTS = [
  'How can I save $500 this month?',
  'Which of my expenses should I cut?',
  'Am I on track with my 50/30/20 budget?',
  'Plan a 6-month emergency fund for me',
  'How can I reduce my biggest bill?',
];

export default function AdvisorScreen() {
  const c = useThemeColors();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const data = await aiAdvisorHistory();
      const msgs = (data.messages || []) as Msg[];
      setMessages(msgs);
      // Use the latest session_id so conversation continues
      if (msgs.length > 0) {
        const last: any = msgs[msgs.length - 1];
        setSessionId(last.session_id);
      }
    } catch (e: any) {
      console.warn('history error', e?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [messages.length]);

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    Keyboard.dismiss();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const res = await aiAdvisorChat(msg, sessionId);
      setSessionId(res.session_id);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I hit an error: ${e?.message || 'Unknown'}. Please try again in a moment.` },
      ]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    Alert.alert(
      'Clear conversation?',
      'This will permanently delete all your chats with FinBot.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await aiAdvisorClearHistory();
              setMessages([]);
              setSessionId(undefined);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to clear history');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.center}><ActivityIndicator color={c.income} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBubble, { backgroundColor: c.income }]}>
            <Ionicons name="sparkles" size={18} color="#fff" />
          </View>
          <View>
            <Text style={[styles.title, { color: c.text }]}>FinBot</Text>
            <Text style={[styles.subtitle, { color: c.textMuted }]}>
              Your AI money coach
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearChat} style={styles.iconBtn} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={c.textMuted} />
            </TouchableOpacity>
          )}
          <ThemeToggle />
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        {/* Chat area */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyBubble, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={[styles.iconBubble, { backgroundColor: c.income, marginBottom: 12 }]}>
                  <Ionicons name="sparkles" size={20} color="#fff" />
                </View>
                <Text style={[styles.emptyTitle, { color: c.text }]}>
                  Hi! I'm FinBot 👋
                </Text>
                <Text style={[styles.emptyText, { color: c.textMuted }]}>
                  I've got a full picture of your bills, expenses, and budget. Ask me anything about saving money, cutting costs, or hitting your goals.
                </Text>
              </View>

              <Text style={[styles.promptsLabel, { color: c.textMuted }]}>Try asking:</Text>
              {SUGGESTED_PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.promptChip, { backgroundColor: c.card, borderColor: c.border }]}
                  onPress={() => sendMessage(p)}
                  disabled={sending}
                >
                  <Ionicons name="bulb-outline" size={16} color={c.income} />
                  <Text style={[styles.promptChipText, { color: c.text }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            messages.map((m, idx) => (
              <View
                key={m._id || `${m.role}-${idx}`}
                style={[
                  styles.msgRow,
                  m.role === 'user' ? styles.msgRowUser : styles.msgRowBot,
                ]}
              >
                {m.role === 'assistant' && (
                  <View style={[styles.avatar, { backgroundColor: c.income }]}>
                    <Ionicons name="sparkles" size={12} color="#fff" />
                  </View>
                )}
                <View
                  style={[
                    styles.bubble,
                    m.role === 'user'
                      ? { backgroundColor: c.income }
                      : { backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      { color: m.role === 'user' ? '#fff' : c.text },
                    ]}
                  >
                    {m.content}
                  </Text>
                </View>
              </View>
            ))
          )}

          {sending && (
            <View style={[styles.msgRow, styles.msgRowBot]}>
              <View style={[styles.avatar, { backgroundColor: c.income }]}>
                <Ionicons name="sparkles" size={12} color="#fff" />
              </View>
              <View style={[styles.bubble, { backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={c.income} />
                <Text style={[styles.bubbleText, { color: c.textMuted, marginLeft: 8, fontSize: 13 }]}>
                  FinBot is thinking…
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: c.bg, borderTopColor: c.border }]}>
          <View style={[styles.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask FinBot about your money..."
              placeholderTextColor={c.textMuted}
              style={[styles.input, { color: c.text }]}
              multiline
              maxLength={500}
              editable={!sending}
              onSubmitEditing={() => sendMessage(input)}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() && !sending ? c.income : c.border },
              ]}
              onPress={() => sendMessage(input)}
              disabled={!input.trim() || sending}
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBubble: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtn: { padding: 6 },
  title: { fontSize: 17, fontFamily: 'DMSans_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'DMSans_400Regular', marginTop: 1 },

  chatContent: { padding: 16, paddingBottom: 24, gap: 12 },

  emptyWrap: { alignItems: 'stretch', gap: 8, paddingTop: 12 },
  emptyBubble: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 20, alignItems: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontFamily: 'DMSans_700Bold', marginBottom: 6 },
  emptyText: { fontSize: 14, fontFamily: 'DMSans_400Regular', textAlign: 'center', lineHeight: 20 },
  promptsLabel: { fontSize: 12, fontFamily: 'DMSans_500Medium', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  promptChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  promptChipText: { fontSize: 14, fontFamily: 'DMSans_500Medium', flex: 1 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '100%' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowBot: { justifyContent: 'flex-start' },
  avatar: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 16,
  },
  bubbleText: { fontSize: 15, fontFamily: 'DMSans_400Regular', lineHeight: 21 },

  inputBar: {
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 8 : 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    minHeight: 44,
  },
  input: {
    flex: 1, fontSize: 15, fontFamily: 'DMSans_400Regular',
    paddingVertical: 8, maxHeight: 120,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
