import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { processRecurring } from '@/src/api';
import { useThemeColors } from '@/src/theme';

export default function Index() {
  const c = useThemeColors();
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      const done = await AsyncStorage.getItem('finflow_onboarding_complete');
      setShowOnboarding(done !== 'true');
      // process recurring expenses on app start
      try { await processRecurring(); } catch (_) {}
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
        <ActivityIndicator size="large" color={c.income} />
      </View>
    );
  }

  if (showOnboarding) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/setup" />;
}
