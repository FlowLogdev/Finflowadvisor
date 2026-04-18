import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { useThemeColors } from '@/src/theme';
import { ThemeToggle } from '@/src/components/LogoHeader';

const { width } = Dimensions.get('window');

const FEATURES = [
  { icon: 'pie-chart-outline', title: '50/30/20 Budget', desc: 'Smart budget split across needs, wants, and savings' },
  { icon: 'receipt-outline', title: 'Bill Tracking', desc: 'Track recurring bills with due date reminders' },
  { icon: 'card-outline', title: 'Expense Tracking', desc: 'Log daily expenses with categories and recurring templates' },
  { icon: 'analytics-outline', title: 'Rich Dashboard', desc: 'Charts, insights, and smart financial tips at a glance' },
  { icon: 'time-outline', title: 'Monthly History', desc: 'Review past months and export reports as PDF' },
  { icon: 'shield-checkmark-outline', title: 'Secure & Synced', desc: 'Your data syncs across mobile and web securely' },
];

export default function LandingScreen() {
  const c = useThemeColors();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Nav */}
        <View style={styles.nav}>
          <View style={styles.logoRow}>
            <Svg width={32} height={32} viewBox="0 0 100 100">
              <Rect x="4" y="4" width="92" height="92" rx="22" fill={c.income} />
              <Path d="M 28 72 C 38 55, 45 45, 55 38 C 62 33, 68 28, 72 24" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
              <Path d="M 62 21 L 74 24 L 70 36" stroke="#fff" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[styles.logoText, { color: c.textPrimary }]}>Fin<Text style={{ color: c.income }}>Flow</Text></Text>
          </View>
          <View style={styles.navRight}>
            <ThemeToggle />
            <TouchableOpacity testID="landing-login-btn" onPress={() => router.push('/login')}>
              <Text style={[styles.navLink, { color: c.income }]}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroBadge, { backgroundColor: c.income + '15' }]}>
            <Text style={[styles.heroBadgeText, { color: c.income }]}>finflowadvisors.com</Text>
          </View>
          <Text style={[styles.heroTitle, { color: c.textPrimary }]}>
            Take control of your{'\n'}
            <Text style={{ color: c.income }}>personal finances</Text>
          </Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>
            Budget smarter with the 50/30/20 rule. Track bills, expenses, and savings — all in one beautiful app for mobile and web.
          </Text>
          <View style={styles.heroBtns}>
            <TouchableOpacity testID="landing-signup-btn" onPress={() => router.push('/register')} style={[styles.primaryBtn, { backgroundColor: c.income }]}>
              <Text style={styles.primaryBtnText}>Get Started Free</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity testID="landing-login-btn-2" onPress={() => router.push('/login')} style={[styles.secondaryBtn, { borderColor: c.border }]}>
              <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: c.surface, borderColor: c.border }]}>
          <StatItem value="50%" label="Needs" color={c.income} />
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <StatItem value="30%" label="Wants" color={c.warning} />
          <View style={[styles.statDivider, { backgroundColor: c.border }]} />
          <StatItem value="20%" label="Savings" color={c.savings} />
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Everything you need</Text>
          <Text style={[styles.sectionSub, { color: c.textMuted }]}>Powerful features to manage your money</Text>
          <View style={styles.featGrid}>
            {FEATURES.map((f) => (
              <View key={f.title} style={[styles.featCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={[styles.featIcon, { backgroundColor: c.income + '12' }]}>
                  <Ionicons name={f.icon as any} size={24} color={c.income} />
                </View>
                <Text style={[styles.featTitle, { color: c.textPrimary }]}>{f.title}</Text>
                <Text style={[styles.featDesc, { color: c.textMuted }]}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA */}
        <View style={[styles.ctaSection, { backgroundColor: c.income }]}>
          <Text style={styles.ctaTitle}>Start your financial journey today</Text>
          <Text style={styles.ctaSub}>Free to use. No credit card required. Works on mobile and web.</Text>
          <TouchableOpacity testID="landing-cta-btn" onPress={() => router.push('/register')} style={styles.ctaBtn}>
            <Text style={[styles.ctaBtnText, { color: c.income }]}>Create Free Account</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.textMuted }]}>© 2026 FinFlow Advisors. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoText: { fontFamily: 'DMSans_700Bold', fontSize: 22 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navLink: { fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
  hero: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, alignItems: 'center' },
  heroBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 9999, marginBottom: 20 },
  heroBadgeText: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  heroTitle: { fontFamily: 'DMSans_700Bold', fontSize: 36, lineHeight: 44, textAlign: 'center', marginBottom: 16 },
  heroSub: { fontFamily: 'DMSans_400Regular', fontSize: 17, lineHeight: 26, textAlign: 'center', maxWidth: 500, marginBottom: 32 },
  heroBtns: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 28, borderRadius: 12, gap: 8 },
  primaryBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16, color: '#fff' },
  secondaryBtn: { paddingVertical: 16, paddingHorizontal: 28, borderRadius: 12, borderWidth: 1 },
  secondaryBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16 },
  statsRow: { flexDirection: 'row', marginHorizontal: 24, borderRadius: 12, borderWidth: 0.5, paddingVertical: 20, marginBottom: 48 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: 'DMMono_500Medium', fontSize: 28, marginBottom: 4 },
  statLabel: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  statDivider: { width: 0.5, alignSelf: 'stretch' },
  section: { paddingHorizontal: 24, marginBottom: 48 },
  sectionTitle: { fontFamily: 'DMSans_700Bold', fontSize: 26, textAlign: 'center', marginBottom: 8 },
  sectionSub: { fontFamily: 'DMSans_400Regular', fontSize: 16, textAlign: 'center', marginBottom: 32 },
  featGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  featCard: { width: Math.min((width - 60) / 2, 280), borderRadius: 12, borderWidth: 0.5, padding: 20 },
  featIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  featTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 16, marginBottom: 6 },
  featDesc: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18 },
  ctaSection: { marginHorizontal: 24, borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 48 },
  ctaTitle: { fontFamily: 'DMSans_700Bold', fontSize: 24, color: '#fff', textAlign: 'center', marginBottom: 12 },
  ctaSub: { fontFamily: 'DMSans_400Regular', fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 24 },
  ctaBtn: { backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  ctaBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16 },
  footer: { paddingVertical: 24, alignItems: 'center' },
  footerText: { fontFamily: 'DMSans_400Regular', fontSize: 13 },
});
