import { Host, List, ListItem, Text } from '@expo/ui';
import { useRouter, type Href } from 'expo-router';

type PackageScreen = { name: string; description: string; href: Href };

/** One row per package. Add a row here when a new package gets a test screen. */
const PACKAGES: PackageScreen[] = [
  { name: '@islamashraful/core', description: 'useOnForeground, reportError', href: '/core' },
  {
    name: '@islamashraful/notifications',
    description: 'Permission, schedule, tap handling',
    href: '/notifications',
  },
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
