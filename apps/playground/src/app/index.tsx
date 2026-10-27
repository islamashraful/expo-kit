import { Host, List, ListItem, Text } from '@expo/ui';
import { useRouter, type Href } from 'expo-router';

type PackageScreen = { name: string; description: string; href: Href };

/** One row per package. Add a row here when a new package gets a test screen. */
const PACKAGES: PackageScreen[] = [
  { name: '@expo-kit/core', description: 'useOnForeground, reportError', href: '/core' },
  {
    name: '@expo-kit/notifications',
    description: 'Permission, schedule, tap handling',
    href: '/notifications',
  },
  {
    name: '@expo-kit/app-update',
    description: 'App Store / EAS Update check, native sheet',
    href: '/app-update',
  },
  { name: '@expo-kit/rating', description: 'Review prompt with limits', href: '/rating' },
  { name: '@expo-kit/mail', description: 'Contact email with device info', href: '/mail' },
  { name: '@expo-kit/analytics', description: 'PostHog events and screen views', href: '/analytics' },
  { name: '@expo-kit/purchases', description: 'RevenueCat pro status, plans, paywall', href: '/purchases' },
  { name: '@expo-kit/cloudkit', description: 'Typed iCloud sync with CKSyncEngine', href: '/cloudkit' },
  { name: '@expo-kit/apple-ai', description: 'On-device model: availability, text, streaming', href: '/apple-ai' },
];

export default function HomeScreen() {
  const router = useRouter();
  return (
    <Host style={{ flex: 1 }}>
      <List>
        {PACKAGES.map((pkg) => (
          <ListItem key={pkg.name} supportingText={pkg.description} onPress={() => router.push(pkg.href)}>
            <Text>{pkg.name}</Text>
          </ListItem>
        ))}
      </List>
    </Host>
  );
}
