import { showNotificationsInApp } from '@islamashraful/notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

showNotificationsInApp();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'expo-kit', headerLargeTitle: true }} />
        <Stack.Screen name="core" options={{ title: 'core' }} />
        <Stack.Screen name="notifications" options={{ title: 'notifications' }} />
        <Stack.Screen name="app-update" options={{ title: 'app-update' }} />
        <Stack.Screen name="rating" options={{ title: 'rating' }} />
        <Stack.Screen name="mail" options={{ title: 'mail' }} />
      </Stack>
    </ThemeProvider>
  );
}
