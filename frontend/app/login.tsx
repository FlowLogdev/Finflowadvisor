import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../src/theme';
import { useAuth } from '../src/auth';
import { FinFlowLogo } from '../src/components/LogoHeader';

export default function LoginScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please fill in all fields'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/setup');
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="login-back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={c.textPrimary} />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <FinFlowLogo size={64} />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>Log in to your FinFlow account</Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: c.expense + '15', borderColor: c.expense + '30' }]}>
              <Ionicons name="alert-circle" size={16} color={c.expense} />
              <Text style={[styles.errorText, { color: c.expense }]}>{error}</Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: c.textMuted }]}>Email</Text>
          <TextInput
            testID="login-email-input"
            style={[styles.input, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Text style={[styles.label, { color: c.textMuted }]}>Password</Text>
          <View style={styles.pwWrap}>
            <TextInput
              testID="login-password-input"
              style={[styles.input, styles.pwInput, { backgroundColor: c.surfaceSecondary, borderColor: c.border, color: c.textPrimary }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={c.textMuted}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(!showPw)} style={styles.pwToggle}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity testID="login-submit-btn" onPress={handleLogin} disabled={loading} style={[styles.submitBtn, { backgroundColor: c.income }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Log In</Text>}
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={[styles.switchText, { color: c.textMuted }]}>Don't have an account?</Text>
            <TouchableOpacity testID="goto-register-btn" onPress={() => router.replace('/register')}>
              <Text style={[styles.switchLink, { color: c.income }]}> Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  backBtn: { padding: 8, alignSelf: 'flex-start', marginBottom: 16 },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 28, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, textAlign: 'center', marginBottom: 32 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 0.5, marginBottom: 16 },
  errorText: { fontFamily: 'DMSans_400Regular', fontSize: 14, flex: 1 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, marginBottom: 8 },
  input: { borderRadius: 12, borderWidth: 0.5, padding: 16, fontSize: 16, fontFamily: 'DMSans_400Regular', marginBottom: 16 },
  pwWrap: { position: 'relative' },
  pwInput: { paddingRight: 48 },
  pwToggle: { position: 'absolute', right: 16, top: 16 },
  submitBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  submitText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16, color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'center' },
  switchText: { fontFamily: 'DMSans_400Regular', fontSize: 15 },
  switchLink: { fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
});
