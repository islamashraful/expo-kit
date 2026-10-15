export type FieldKind =
  | 'string'
  | 'int'
  | 'double'
  | 'bool'
  | 'date'
  | 'stringList'
  | 'intList'
  | 'doubleList'
  | 'reference'
  | 'asset';

type ValueOfKind = {
  string: string;
  int: number;
  double: number;
  bool: boolean;
  date: Date;
  stringList: string[];
  intList: number[];
  doubleList: number[];
  /** The ID of the linked record. */
  reference: string;
  /** A local file path (`file://…` or an absolute path). */
  asset: string;
};

export type Field<K extends FieldKind = FieldKind, Optional extends boolean = boolean, Target extends string = string> = {
  readonly kind: K;
  readonly isOptional: Optional;
  /** For references: the record type it links to. */
  readonly target: K extends 'reference' ? Target : undefined;
};

/** A field that can also be left out or set to `null`. */
type Optionalizable<K extends FieldKind, Target extends string = string> = Field<K, false, Target> & {
  optional(): Field<K, true, Target>;
};

function make<K extends FieldKind, Target extends string = string>(
  kind: K,
  target?: Target,
): Optionalizable<K, Target> {
  const base = { kind, isOptional: false as const, target: (target ?? undefined) as never };
  return { ...base, optional: () => ({ ...base, isOptional: true as const }) } as unknown as Optionalizable<K, Target>;
}

/** Field kinds for `defineCloudSchema`. Add `.optional()` for a field that can be empty. */
export const field = {
  string: () => make('string'),
  /** Whole numbers. Stored as a 64-bit integer. */
  int: () => make('int'),
  double: () => make('double'),
  bool: () => make('bool'),
  date: () => make('date'),
  stringList: () => make('stringList'),
  intList: () => make('intList'),
  doubleList: () => make('doubleList'),
  /** A link to another record type in the same schema, by its ID. */
  reference: <Target extends string>(target: Target) => make('reference', target),
  /** A file stored in iCloud. The app passes and gets back a local file path. */
  asset: () => make('asset'),
};

type AnyField = Field<FieldKind, boolean, string>;
type FieldsShape = Record<string, AnyField>;
export type SchemaShape = Record<string, FieldsShape>;

/** Every reference must point to a record type in the same schema. */
type CheckReferences<S extends SchemaShape> = {
  [T in keyof S]: {
    [F in keyof S[T]]: S[T][F] extends Field<'reference', boolean, infer Target>
      ? Target extends keyof S
        ? S[T][F]
        : Field<'reference', boolean, Extract<keyof S, string>>
      : S[T][F];
  };
};

export type CloudSchema<S extends SchemaShape = SchemaShape> = {
  readonly types: S;
};

/** The names of the record types in a schema, e.g. `'Shift' | 'Venue'`. */
export type RecordTypeName<S extends CloudSchema> = Extract<keyof S['types'], string>;

type FieldValue<F> = F extends Field<infer K, boolean, string> ? ValueOfKind[K] : never;
type RequiredKeys<Fs> = { [K in keyof Fs]: Fs[K] extends Field<FieldKind, false, string> ? K : never }[keyof Fs];
type OptionalKeys<Fs> = { [K in keyof Fs]: Fs[K] extends Field<FieldKind, false, string> ? never : K }[keyof Fs];
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * The TypeScript type of one record, e.g. `CloudRecord<typeof schema, 'Shift'>`.
 * Every record has a string `id`. Optional fields can be left out or `null`.
 */
export type CloudRecord<S extends CloudSchema, T extends RecordTypeName<S>> = Simplify<
  { id: string } & { [K in RequiredKeys<S['types'][T]>]: FieldValue<S['types'][T][K]> } & {
    [K in OptionalKeys<S['types'][T]>]?: FieldValue<S['types'][T][K]> | null;
  }
>;

/** Names CloudKit or this package use for themselves. */
const RESERVED_FIELD_NAMES = new Set([
  'id',
  'recordName',
  'recordID',
  'recordType',
  'createdAt',
  'modifiedAt',
  'createdBy',
  'modifiedBy',
  'creationDate',
  'modificationDate',
  'creatorUserRecordID',
  'lastModifiedUserRecordID',
  'recordChangeTag',
  'ekModifiedAt',
]);
// CloudKit: starts with a letter, then letters, digits or underscores, at most 255 characters.
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,254}$/;

/**
 * Describes the app's data for iCloud. One entry per record type, one field kind per field.
 * Throws when a name isn't allowed in CloudKit or a reference points to an unknown type.
 *
 * Rule after release: only add fields and types. Never rename or remove one.
 */
export function defineCloudSchema<const S extends SchemaShape>(types: S & CheckReferences<S>): CloudSchema<S> {
  const typeNames = Object.keys(types);
  if (typeNames.length === 0) throw new Error('defineCloudSchema: add at least one record type.');

  for (const typeName of typeNames) {
    if (!NAME_PATTERN.test(typeName)) {
      throw new Error(`defineCloudSchema: "${typeName}" isn't a valid record type name (letters, digits, _; starts with a letter).`);
    }
    const fields = types[typeName] as FieldsShape;
    for (const [fieldName, spec] of Object.entries(fields)) {
      if (!NAME_PATTERN.test(fieldName)) {
        throw new Error(`defineCloudSchema: ${typeName}.${fieldName} isn't a valid field name (letters, digits, _; starts with a letter).`);
      }
      if (RESERVED_FIELD_NAMES.has(fieldName) || fieldName.startsWith('ek_')) {
        throw new Error(`defineCloudSchema: ${typeName}.${fieldName} is a reserved name. Pick another one.`);
      }
      if (spec.kind === 'reference' && !typeNames.includes(spec.target as string)) {
        throw new Error(`defineCloudSchema: ${typeName}.${fieldName} links to "${String(spec.target)}", which isn't in the schema.`);
      }
    }
  }
  return { types: types as S };
}

export type SchemaSpec = {
  types: { name: string; fields: { name: string; kind: FieldKind; optional: boolean; target: string | null }[] }[];
};

/** The plain description sent to the native side. */
export function toSchemaSpec(schema: CloudSchema): SchemaSpec {
  return {
    types: Object.entries(schema.types).map(([name, fields]) => ({
      name,
      fields: Object.entries(fields).map(([fieldName, spec]) => ({
        name: fieldName,
        kind: spec.kind,
        optional: spec.isOptional,
        target: spec.kind === 'reference' ? (spec.target as string) : null,
      })),
    })),
  };
}
