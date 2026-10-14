import { reportError } from '@islamashraful/core';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as MailComposer from 'expo-mail-composer';
import { Linking } from 'react-native';

export type SendEmailOptions = {
  to: string;
  subject?: string;
  /** Text above the device info, e.g. a question for the user. */
  body?: string;
  /** Adds app version, device and OS version at the bottom. Default `true`. */
  includeDeviceInfo?: boolean;
};

/**
 * - `sent` / `saved` / `cancelled`: what the user did in the in-app mail screen.
 * - `opened`: another mail app (e.g. Gmail) was opened. What happens there is unknown.
 * - `unavailable`: no mail app at all. Show the address so the user can copy it.
 */
export type SendEmailResult = 'sent' | 'saved' | 'cancelled' | 'opened' | 'unavailable';

/**
 * Opens an email with the address, subject and device info filled in. For a
 * "Contact us" button. Uses the in-app mail screen when the Mail app is set up,
 * otherwise the phone's default mail app (e.g. Gmail).
 */
export async function sendEmail({
  to,
  subject,
  body,
  includeDeviceInfo = true,
}: SendEmailOptions): Promise<SendEmailResult> {
  const text = includeDeviceInfo ? `${body ?? ''}\n\n\n---\n${getDeviceInfo()}` : body;

  try {
    if (await MailComposer.isAvailableAsync()) {
      const { status } = await MailComposer.composeAsync({ recipients: [to], subject, body: text });
      if (status === 'sent' || status === 'saved' || status === 'cancelled') return status;
      // Android can't tell what the user did.
      return 'opened';
    }
  } catch (error) {
    reportError(error, { fn: 'sendEmail.compose' });
  }

  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : null,
    text ? `body=${encodeURIComponent(text)}` : null,
  ].filter(Boolean);
  const url = `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    // No mail app installed.
    return 'unavailable';
  }
}

/** App, device and OS lines, e.g. "Kite 1.2.0 (34)\niPhone 16 Pro, iOS 26.0". */
export function getDeviceInfo(): string {
  const app = [Application.applicationName, Application.nativeApplicationVersion].filter(Boolean).join(' ');
  const build = Application.nativeBuildVersion ? ` (${Application.nativeBuildVersion})` : '';
  const os = [Device.osName, Device.osVersion].filter(Boolean).join(' ');
  const device = [Device.modelName, os].filter(Boolean).join(', ');
  return [app + build, device].filter(Boolean).join('\n');
}
