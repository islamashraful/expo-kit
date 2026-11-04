/**
 * The Standard Schema interface (https://standardschema.dev), implemented by zod, valibot, arktype and others.
 * Written out here so the package depends on none of them.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> };

type InferOutput<S extends StandardSchemaV1> = NonNullable<S['~standard']['types']>['output'];

export type CollectionOptions = {
  /**
   * The shape version of the items, default `1`. Raise it when the item type changes and add a `migrate` step
   * for it. Items are saved with their version; older ones are migrated when read.
   */
  version?: number;
  /**
   * One function per version above 1: `migrate[n]` turns an item of version `n - 1` into version `n`.
   * e.g. `{ 2: (old) => ({ ...old, tags: [] }) }`.
   */
  migrate?: Record<number, (old: any) => unknown>;
};

/** A collection's description, made with `collection()` and passed to `defineStore()`. */
export type CollectionDefinition<T> = {
  readonly version: number;
  readonly migrate: Record<number, (old: any) => unknown>;
  readonly schema: StandardSchemaV1<unknown, T> | null;
  /** Type only, never set. */
  readonly __type?: T;
};

/**
 * Describes one collection of items.
 *
 * - `collection<Note>()`: typed in TypeScript only.
 * - `collection(NoteSchema)`: a zod/valibot/… schema; the type comes from it and items are checked when saved and read.
 */
export function collection<T>(options?: CollectionOptions): CollectionDefinition<T>;
export function collection<S extends StandardSchemaV1>(schema: S, options?: CollectionOptions): CollectionDefinition<InferOutput<S>>;
export function collection(
  schemaOrOptions?: StandardSchemaV1 | CollectionOptions,
  maybeOptions?: CollectionOptions,
): CollectionDefinition<unknown> {
  const schema = isSchema(schemaOrOptions) ? schemaOrOptions : null;
  const options = (isSchema(schemaOrOptions) ? maybeOptions : schemaOrOptions) ?? {};
  const version = options.version ?? 1;
  const migrate = options.migrate ?? {};
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`@expo-kit/swiftdata: version must be a whole number from 1, got ${version}`);
  }
  for (let step = 2; step <= version; step++) {
    if (typeof migrate[step] !== 'function') {
      throw new Error(`@expo-kit/swiftdata: version is ${version}, so migrate needs a step for ${step}`);
    }
  }
  return { version, migrate, schema };
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === 'object' && value !== null && '~standard' in value;
}

/** What's stored: the item with its version. */
type Envelope = { v: number; d: unknown };

export function encode(definition: CollectionDefinition<unknown>, value: unknown): string {
  const envelope: Envelope = { v: definition.version, d: value };
  return JSON.stringify(envelope);
}

export type Decoded<T> =
  | { ok: true; value: T }
  /** `newer`: saved by a newer app version, left as it is. `invalid`: broken JSON or failed the schema. */
  | { ok: false; reason: 'newer' | 'invalid'; message: string };

export async function decode<T>(definition: CollectionDefinition<T>, json: string): Promise<Decoded<T>> {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'invalid', message: 'not JSON' };
  }
  if (typeof envelope !== 'object' || envelope === null || !Number.isInteger(envelope.v) || !('d' in envelope)) {
    return { ok: false, reason: 'invalid', message: 'not an item' };
  }
  if (envelope.v > definition.version) {
    return { ok: false, reason: 'newer', message: `saved as version ${envelope.v}, this app knows ${definition.version}` };
  }
  let value = envelope.d;
  for (let step = envelope.v + 1; step <= definition.version; step++) {
    value = definition.migrate[step]!(value);
  }
  return check(definition, value);
}

/** Runs the schema, if any. */
export async function check<T>(definition: CollectionDefinition<T>, value: unknown): Promise<Decoded<T>> {
  if (!definition.schema) return { ok: true, value: value as T };
  const result = await definition.schema['~standard'].validate(value);
  if (result.issues) return { ok: false, reason: 'invalid', message: result.issues.map((issue) => issue.message).join('; ') };
  return { ok: true, value: result.value };
}
