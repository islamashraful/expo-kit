import type { CloudSchema } from './schema';

/** App record → plain fields for the native side (dates as milliseconds, no `id`, no `undefined`). */
export function encodeFields(schema: CloudSchema, type: string, record: Record<string, unknown>): Record<string, unknown> {
  const fields = schema.types[type];
  if (!fields) throw new Error(`"${type}" isn't a record type in the schema.`);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || value === undefined) continue;
    result[key] = value instanceof Date ? value.getTime() : value;
  }
  return result;
}

/** Native fields → app record (milliseconds back to `Date`, empty optionals as `null`). */
export function decodeRecord(
  schema: CloudSchema,
  type: string,
  id: string,
  fields: Record<string, unknown>,
): Record<string, unknown> | null {
  const spec = schema.types[type];
  if (!spec) return null;
  const record: Record<string, unknown> = { id };
  for (const [name, field] of Object.entries(spec)) {
    const value = fields[name];
    if (value === undefined || value === null) {
      record[name] = null;
    } else if (field.kind === 'date' && typeof value === 'number') {
      record[name] = new Date(value);
    } else {
      record[name] = value;
    }
  }
  return record;
}
