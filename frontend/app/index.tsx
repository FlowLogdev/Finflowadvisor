import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useThemeColors } from '../src/theme';
import { useAuth } from '../src/auth';

export default function Index() {
  const c = useThemeColors();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
        <ActivityIndicator size="large" color={c.income} />
      </View>
    );
  }

  // Authenticated → go to dashboard tabs
  if (user) return <Redirect href="/(tabs)/setup" />;

  // Not authenticated → show landing page
  return <Redirect href="/landing" />;
}
