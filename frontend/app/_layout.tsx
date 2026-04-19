import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ThemeProvider, useTheme } from '../src/theme';
import { AuthProvider } from '../src/auth';
import { I18nProvider } from '../src/i18n';

SplashScreen.preventAutoHideAsync();

function InnerLayout() {
  const { isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="landing" options={{ gestureEnabled: false }} />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ presentation: 'modal' }} />
        <Stack.Screen name="month-detail" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f6f2' }}>
        <ActivityIndicator size="large" color="#2d5a3d" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <InnerLayout />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
