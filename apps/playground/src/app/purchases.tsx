import { Host, List, ListItem, Text } from '@expo/ui';
import {
  isPurchasesEnabled,
  manageSubscription,
  setProOverride,
  usePro,
} from '@expo-kit/purchases';
import { useProRoute } from '@expo-kit/purchases/router';
import { useRouter } from 'expo-router';

export default function PurchasesScreen() {
  const router = useRouter();
  const pro = usePro();
  const openPro = useProRoute();

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Set EXPO_PUBLIC_REVENUECAT_IOS_KEY (a test_ key works in Expo Go, appl_ needs a dev build) and EXPO_PUBLIC_REVENUECAT_ENTITLEMENT in apps/playground/.env.local, then restart Metro.">
          <Text>RevenueCat</Text>
        </ListItem>
        <ListItem trailing={<Text>{isPurchasesEnabled() ? 'On' : 'Off (no key)'}</Text>}>
          <Text>Status</Text>
        </ListItem>

        <ListItem trailing={<Text>{pro.ready ? 'Yes' : 'Waiting…'}</Text>}>
          <Text>Ready</Text>
        </ListItem>
        <ListItem trailing={<Text>{pro.isPro ? 'Pro' : 'Free'}</Text>}>
          <Text>isPro</Text>
        </ListItem>
        <ListItem trailing={<Text>{pro.plan ?? '–'}</Text>}>
          <Text>Plan</Text>
        </ListItem>
        <ListItem trailing={<Text>{pro.productId ?? '–'}</Text>}>
          <Text>Product</Text>
        </ListItem>
        <ListItem trailing={<Text>{pro.isTrial ? 'Yes' : 'No'}</Text>}>
          <Text>In trial</Text>
        </ListItem>
        <ListItem trailing={<Text>{pro.willRenew ? 'Yes' : 'No'}</Text>}>
          <Text>Renews</Text>
        </ListItem>
        <ListItem trailing={<Text>{pro.expiresAt?.toLocaleDateString() ?? '–'}</Text>}>
          <Text>Ends</Text>
        </ListItem>

        <ListItem onPress={() => router.push('/paywall')}>
          <Text>Open paywall</Text>
        </ListItem>
        <ListItem
          supportingText="Pro users go straight there. Free users get the paywall, which continues there after a restore."
          onPress={() => openPro('/pro-only')}
        >
          <Text>Open a pro-only screen</Text>
        </ListItem>
        <ListItem onPress={() => void manageSubscription()}>
          <Text>Manage subscription</Text>
        </ListItem>

        <ListItem supportingText="Development only. Forces pro on or off without buying.">
          <Text>setProOverride</Text>
        </ListItem>
        <ListItem onPress={() => setProOverride(true)}>
          <Text>Force pro</Text>
        </ListItem>
        <ListItem onPress={() => setProOverride(false)}>
          <Text>Force free</Text>
        </ListItem>
        <ListItem onPress={() => setProOverride(null)}>
          <Text>Use real status</Text>
        </ListItem>
      </List>
    </Host>
  );
}
