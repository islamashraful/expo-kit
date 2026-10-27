/** The wire format Swift reads (ios/SchemaCore.swift). */
export type SchemaSpec =
  | { kind: 'string' | 'number' | 'integer' | 'boolean'; description?: string }
  | { kind: 'enum'; choices: string[]; description?: string }
  | { kind: 'array'; items: SchemaSpec; minItems?: number; maxItems?: number; description?: string }
  | { kind: 'object'; properties: { name: string; schema: SchemaSpec; optional: boolean }[]; description?: string };

/** One part of a data shape. `T` is the TypeScript type of the value the model fills in. */
export type Schema<T = unknown, Optional extends boolean = boolean> = {
  readonly spec: SchemaSpec;
  readonly isOptional: Optional;
  /** Type only, never set. */
  readonly __value?: T;
};

type Builder<T> = Schema<T, false> & {
  /** Tells the model what to put here, e.g. "Work email, if there is one". Often improves the answer a lot. */
  describe(description: string): Builder<T>;
  /** The model may leave this property out. Only inside `schema.object`. */
  optional(): Schema<T, true> & { describe(description: string): Schema<T, true> };
};

function build<T>(spec: SchemaSpec): Builder<T> {
  return {
    spec,
    isOptional: false,
    describe: (description) => build<T>({ ...spec, description }),
    optional: () => optional<T>(spec),
  };
}

function optional<T>(spec: SchemaSpec): Schema<T, true> & { describe(description: string): Schema<T, true> } {
  return { spec, isOptional: true, describe: (description) => optional<T>({ ...spec, description }) };
}

/** The TypeScript type a schema describes, e.g. `SchemaValue<typeof Contact>`. */
export type SchemaValue<S> = S extends Schema<infer T, boolean> ? T : never;

type Properties = Record<string, Schema<unknown, boolean>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type ObjectValue<P extends Properties> = Simplify<
  { [K in keyof P as P[K] extends Schema<unknown, false> ? K : never]: SchemaValue<P[K]> } & {
    [K in keyof P as P[K] extends Schema<unknown, false> ? never : K]?: SchemaValue<P[K]>;
  }
>;

/**
 * Describes the data the model should return. Build it once, outside components:
 *
 * ```ts
 * const Contact = schema.object({
 *   name: schema.string(),
 *   email: schema.string().describe('Work email').optional(),
 *   stage: schema.enum(['lead', 'customer']),
 * });
 * ```
 */
export const schema = {
  string: () => build<string>({ kind: 'string' }),
  /** Any number, e.g. a price. */
  number: () => build<number>({ kind: 'number' }),
  /** Whole numbers only. */
  integer: () => build<number>({ kind: 'integer' }),
  boolean: () => build<boolean>({ kind: 'boolean' }),
  /** Exactly one of these strings. Also good for sorting text into categories. */
  enum: <const C extends readonly [string, ...string[]]>(choices: C) =>
    build<C[number]>({ kind: 'enum', choices: [...choices] }),
  /** A list. `min` and `max` limit how many items the model writes. */
  array: <S extends Schema<unknown, false>>(items: S, limits: { min?: number; max?: number } = {}) =>
    build<SchemaValue<S>[]>({ kind: 'array', items: items.spec, minItems: limits.min, maxItems: limits.max }),
  /** Named properties. Add `.optional()` to a property the model may leave out. */
  object: <P extends Properties>(properties: P) =>
    build<ObjectValue<P>>({
      kind: 'object',
      properties: Object.entries(properties).map(([name, property]) => ({
        name,
        schema: property.spec,
        optional: property.isOptional,
      })),
    }),
};
