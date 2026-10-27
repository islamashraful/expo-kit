import { Host, List, ListItem, Text, TextInput } from '@expo/ui';
import {
  AppleAIError,
  createSession,
  generateText,
  useAppleAIAvailability,
  type AppleAISession,
} from '@expo-kit/apple-ai';
import { useEffect, useRef, useState } from 'react';

const INSTRUCTIONS = 'Answer in one or two short sentences.';

type Result = { text: string; ms: number } | { error: string };

export default function AppleAIScreen() {
  const availability = useAppleAIAvailability();
  const [prompt, setPrompt] = useState('Suggest a name for a coffee shop on the beach.');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState(0);
  const session = useRef<AppleAISession | null>(null);

  useEffect(() => () => session.current?.release(), []);

  async function run(ask: () => Promise<string>) {
    setBusy(true);
    const started = Date.now();
    try {
      setResult({ text: await ask(), ms: Date.now() - started });
    } catch (error) {
      setResult({ error: error instanceof AppleAIError ? `${error.code}: ${error.message}` : String(error) });
    } finally {
      setBusy(false);
    }
  }

  function askInConversation() {
    return run(async () => {
      session.current ??= createSession({ instructions: INSTRUCTIONS });
      const answer = await session.current.respond(prompt);
      setTurns((n) => n + 1);
      return answer;
    });
  }

  function newConversation() {
    session.current?.release();
    session.current = null;
    setTurns(0);
    setResult(null);
  }

  return (
    <Host style={{ flex: 1 }}>
      <List>
        <ListItem supportingText="Needs a development build on iOS 26 with Apple Intelligence on. The simulator uses the Mac's model. Checks again when the app comes back to the front.">
          <Text>On-device model (Foundation Models)</Text>
        </ListItem>
        <Row label="Available" value={availability.available ? 'Yes' : 'No'} />
        <Row label="Reason" value={availability.available ? '–' : availability.reason} />

        <ListItem supportingText={`Instructions: "${INSTRUCTIONS}"`}>
          <TextInput defaultValue={prompt} onChangeText={setPrompt} placeholder="Prompt" multiline />
        </ListItem>
        <ListItem supportingText="One prompt, no memory." onPress={busy ? undefined : () => run(() => generateText(prompt, { instructions: INSTRUCTIONS }))}>
          <Text>{busy ? 'Thinking…' : 'Generate'}</Text>
        </ListItem>
        <ListItem
          supportingText={turns ? `Remembers the last ${turns} question(s). Try "Make it shorter."` : 'Remembers earlier questions.'}
          onPress={busy ? undefined : askInConversation}
        >
          <Text>{busy ? 'Thinking…' : 'Ask in conversation'}</Text>
        </ListItem>
        <ListItem onPress={newConversation}>
          <Text>New conversation</Text>
        </ListItem>

        {result ? (
          <ListItem supportingText={'error' in result ? 'Error' : `${result.ms} ms`}>
            <Text>{'error' in result ? result.error : result.text}</Text>
          </ListItem>
        ) : null}
      </List>
    </Host>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <ListItem trailing={<Text>{value}</Text>}>
      <Text>{label}</Text>
    </ListItem>
  );
}
