import { initAnalytics, useTrackScreens } from '@expo-kit/analytics';
import { showNotificationsInApp } from '@expo-kit/notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

showNotificationsInApp();
initAnalytics({
  apiKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  enableInDev: true,
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
      </Stack>
    </ThemeProvider>
  );
}
