import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useThemeColors } from '../src/theme';
import { useAuth } from '../src/auth';

export default function Index() {
  const c = useThemeColors();
  const { user, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
        <ActivityIndicator size="large" color={c.income} />
      </View>
    );
  }

  if (user || isGuest) return <Redirect href="/(tabs)/dashboard" />;

  return <Redirect href="/landing" />;
}
