import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import { useAuth } from '../src/auth';
import { submitTicket } from '../src/featuresApi';

export default function SupportScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !description.trim()) {
      Alert.alert('Missing info', 'Name, email, and description are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await submitTicket({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        description: description.trim(),
      });
      setTicketNumber(res.ticket_number);
    } catch (e: any) {
      Alert.alert('Error', e?.message?.slice(0, 160) || 'Could not submit ticket');
    } finally {
      setBusy(false);
    }
  };

  if (ticketNumber) {
    return (
      <SafeAreaView style={[{ flex: 1 }, { backgroundColor: c.bg }]} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary, marginLeft: 8 }]}>Support</Text>
        </View>
        <View style={styles.successWrap}>
          <View style={[styles.successBubble, { backgroundColor: c.income }]}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={[styles.successTitle, { color: c.textPrimary }]}>Ticket submitted!</Text>
          <Text style={[styles.successTicket, { color: c.income }]}>#{ticketNumber}</Text>
          <Text style={[styles.successDesc, { color: c.textMuted }]}>
            We've sent a confirmation to {email}. Our team will reply within 24 hours.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: c.income }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
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
          <Text style={[styles.title, { color: c.textPrimary }]}>Contact Support</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>We typically reply within 24h</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field c={c} label="Your name" value={name} onChange={setName} placeholder="Jane Doe" />
          <Field c={c} label="Email" value={email} onChange={setEmail} placeholder="you@email.com" keyboard="email-address" />
          <Field c={c} label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+1 555 555 5555" keyboard="phone-pad" />
          <View style={{ marginBottom: 14 }}>
            <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>What's going on?</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              placeholder="Describe your issue or question…"
              placeholderTextColor={c.textMuted}
              style={[styles.textarea, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border }]}
              maxLength={2000}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: c.income, opacity: busy ? 0.7 : 1 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="paper-plane-outline" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>Submit ticket</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={[styles.footer, { color: c.textMuted }]}>
            Or email us directly at support@finflowadvisors.com
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ c, label, value, onChange, placeholder, keyboard }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.fieldLabel, { color: c.textPrimary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        keyboardType={keyboard || 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
        style={[styles.input, { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border }]}
      />
    </View>
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
  scroll: { padding: 16 },

  fieldLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 6 },
  input: {
    borderRadius: 10, borderWidth: 0.5,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'DMSans_500Medium', fontSize: 15,
  },
  textarea: {
    borderRadius: 10, borderWidth: 0.5,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'DMSans_400Regular', fontSize: 15,
    minHeight: 140, textAlignVertical: 'top',
  },

  primaryBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  footer: { fontFamily: 'DMSans_400Regular', fontSize: 12, textAlign: 'center', marginTop: 14 },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successBubble: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  successTitle: { fontFamily: 'DMSans_700Bold', fontSize: 20, marginBottom: 4 },
  successTicket: { fontFamily: 'DMSans_700Bold', fontSize: 28, marginBottom: 12 },
  successDesc: {
    fontFamily: 'DMSans_400Regular', fontSize: 14,
    textAlign: 'center', lineHeight: 20, marginBottom: 28,
  },
});
