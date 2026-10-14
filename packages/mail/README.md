# @expo-kit/mail

Contact email with device info. Part of expo-kit, small packages for Expo apps. Built for Expo SDK 57. Not made by Expo.

## Install

```sh
npx expo install @expo-kit/mail expo-mail-composer expo-application expo-device
```

## Usage

- `sendEmail({ to, subject?, body?, includeDeviceInfo? })`: opens an email with everything filled in. For a "Contact us" button.
  - Uses the in-app mail screen when the Mail app is set up, otherwise the phone's default mail app (e.g. Gmail).
  - Adds app version, device and OS version at the bottom, so support emails are easier to answer. Turn off with `includeDeviceInfo: false`.
  - Returns `'sent'`, `'saved'`, `'cancelled'`, `'opened'` (another mail app opened) or `'unavailable'` (no mail app; show the address instead).
- `getDeviceInfo()`: the same device text, e.g. for a "Copy debug info" button.

```tsx
import { sendEmail } from '@expo-kit/mail';

const result = await sendEmail({ to: 'hello@example.com', subject: 'About Kite' });
if (result === 'unavailable') showAddress('hello@example.com');
```

## License

MIT
