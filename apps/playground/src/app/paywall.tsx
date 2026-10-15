import { Host, List, ListItem, Text } from '@expo/ui';
import { pricePer, savingsPercent, usePaywall } from '@expo-kit/purchases';
import { usePaywallRoute } from '@expo-kit/purchases/router';
import { useRouter } from 'expo-router';
import { useState } from 'react';

// A plain test paywall. Real apps draw their own design around usePaywall().
export default function PaywallScreen() {
  const router = useRouter();
  const { redirect, close } = usePaywallRoute();
  const paywall = usePaywall({ defaultPlan: 'annual', source: redirect ?? 'direct' });
  const [result, setResult] = useState('–');

  const buy = async () => {
    const r = await paywall.buy();
    if (!r) return;
    setResult(r.status);
    if (r.status === 'success') close();
  };

  const restore = async () => {
    const r = await paywall.restore();
    if (!r) return;
    setResult(r.status);
    if (r.status === 'restored') close();
  };

  const savings = savingsPercent(paywall.plans?.annual ?? null, paywall.plans?.monthly ?? null);

  return (
    <Host style={{ flex: 1 }}>
      <List>
        {paywall.loading ? (
          <ListItem>
            <Text>Loading plans…</Text>
          </ListItem>
        ) : paywall.available.length === 0 ? (
          <ListItem supportingText="Loading failed, or no plans in RevenueCat's current offering." onPress={paywall.reload}>
            <Text>No plans. Tap to try again</Text>
          </ListItem>
        ) : (
          paywall.available.map((plan) => {
            const perMonth = plan.key === 'monthly' ? null : pricePer(plan, 'month');
            const details = [
              plan.trial?.label,
              perMonth && `${perMonth}/month`,
              plan.key === 'annual' && savings && `save ${savings}%`,
            ].filter(Boolean);
            return (
              <ListItem
                key={plan.key}
                supportingText={details.join(' · ') || undefined}
                trailing={<Text>{paywall.selected?.key === plan.key ? '✓' : ''}</Text>}
                onPress={() => paywall.select(plan.key)}
              >
                <Text>{`${plan.key} – ${plan.price}`}</Text>
              </ListItem>
            );
          })
        )}

        <ListItem onPress={buy}>
          <Text>{paywall.purchasing ? 'Processing…' : `Buy ${paywall.selected?.key ?? ''}`}</Text>
        </ListItem>
        <ListItem onPress={restore}>
          <Text>{paywall.restoring ? 'Restoring…' : 'Restore purchases'}</Text>
        </ListItem>
        <ListItem trailing={<Text>{result}</Text>}>
          <Text>Last result</Text>
        </ListItem>
        <ListItem trailing={<Text>{redirect ?? '–'}</Text>}>
          <Text>Redirect after</Text>
        </ListItem>
        <ListItem onPress={() => router.back()}>
          <Text>Close</Text>
        </ListItem>
      </List>
    </Host>
  );
}
