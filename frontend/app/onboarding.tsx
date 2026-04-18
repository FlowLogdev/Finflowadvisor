import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '../src/theme';
import { FinFlowLogo, ThemeToggle } from '../src/components/LogoHeader';

const { width } = Dimensions.get('window');

const STEPS = [
  {
    icon: 'wallet-outline' as const,
    title: 'Welcome to FinFlow',
    subtitle: 'Take control of your personal finances with smart budgeting and expense tracking.',
    color: '#2d5a3d',
  },
  {
    icon: 'pie-chart-outline' as const,
    title: 'The 50 / 30 / 20 Rule',
    subtitle: 'A proven budgeting framework to balance your spending and savings every month.',
    color: '#b8740a',
    cards: [
      { pct: '50%', label: 'Needs', desc: 'Housing, utilities, food, transport, insurance', color: '#2d5a3d' },
      { pct: '30%', label: 'Wants', desc: 'Dining out, shopping, entertainment, subscriptions', color: '#b8740a' },
      { pct: '20%', label: 'Savings', desc: 'Emergency fund, investments, debt repayment', color: '#1a4a8a' },
    ],
  },
  {
    icon: 'rocket-outline' as const,
    title: 'Ready to Start',
    subtitle: 'Set up your salary, add bills, track expenses, and watch your savings grow.',
    color: '#1a4a8a',
  },
];

export default function OnboardingScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const [step, setStep] = useState(0);

  const finish = async () => {
    await AsyncStorage.setItem('finflow_onboarding_complete', 'true');
    router.replace('/(tabs)/setup');
  };

  const skip = async () => {
    await AsyncStorage.setItem('finflow_onboarding_complete', 'true');
    router.replace('/(tabs)/setup');
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <ThemeToggle />
        <TouchableOpacity testID="onboarding-skip-btn" onPress={skip}>
          <Text style={[styles.skipText, { color: c.textMuted }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <FinFlowLogo size={80} />
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: current.color + '18' }]}>
            <Ionicons name={current.icon} size={48} color={current.color} />
          </View>
        )}

        <Text style={[styles.title, { color: c.textPrimary }]}>{current.title}</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>{current.subtitle}</Text>

        {current.cards && (
          <View style={styles.cardsWrap}>
            {current.cards.map((card) => (
              <View key={card.label} style={[styles.ruleCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.ruleHeader}>
                  <View style={[styles.colorDot, { backgroundColor: card.color }]} />
                  <Text style={[styles.rulePct, { color: card.color }]}>{card.pct}</Text>
                  <Text style={[styles.ruleLabel, { color: c.textPrimary }]}>{card.label}</Text>
                </View>
                <Text style={[styles.ruleDesc, { color: c.textMuted }]}>{card.desc}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Dots & Buttons */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i === step ? c.income : c.border }]}
            />
          ))}
        </View>

        {isLast ? (
          <TouchableOpacity testID="onboarding-start-btn" onPress={finish} style={[styles.mainBtn, { backgroundColor: c.income }]}>
            <Text style={styles.mainBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity testID="onboarding-next-btn" onPress={() => setStep(step + 1)} style={[styles.mainBtn, { backgroundColor: c.income }]}>
            <Text style={styles.mainBtnText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 8 },
  skipText: { fontFamily: 'DMSans_500Medium', fontSize: 15, padding: 8 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 24 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 28, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  cardsWrap: { width: '100%', gap: 12 },
  ruleCard: { borderRadius: 12, borderWidth: 0.5, padding: 16 },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  rulePct: { fontFamily: 'DMMono_500Medium', fontSize: 18, marginRight: 8 },
  ruleLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 16 },
  ruleDesc: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: 32, paddingBottom: 24, alignItems: 'center', gap: 20 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, gap: 8, width: '100%' },
  mainBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 17, color: '#fff' },
});
