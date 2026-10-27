import { capture, initAnalytics, useTrackScreens } from '@expo-kit/analytics';
import { showNotificationsInApp } from '@expo-kit/notifications';
import { initPurchases } from '@expo-kit/purchases';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

showNotificationsInApp();
initAnalytics({
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  enableInDev: true,
});
initPurchases({
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  entitlement: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'premium',
  onEvent: capture,
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useTrackScreens();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'expo-kit', headerLargeTitle: true }} />
        <Stack.Screen name="core" options={{ title: 'core' }} />
        <Stack.Screen name="notifications" options={{ title: 'notifications' }} />
        <Stack.Screen name="app-update" options={{ title: 'app-update' }} />
        <Stack.Screen name="rating" options={{ title: 'rating' }} />
        <Stack.Screen name="mail" options={{ title: 'mail' }} />
        <Stack.Screen name="analytics" options={{ title: 'analytics' }} />
        <Stack.Screen name="purchases" options={{ title: 'purchases' }} />
        <Stack.Screen name="paywall" options={{ title: 'paywall', presentation: 'formSheet' }} />
        <Stack.Screen name="pro-only" options={{ title: 'pro only' }} />
        <Stack.Screen name="cloudkit" options={{ title: 'cloudkit' }} />
        <Stack.Screen name="apple-ai" options={{ title: 'apple-ai' }} />
      </Stack>
    </ThemeProvider>
  );
}
