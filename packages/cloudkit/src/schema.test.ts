import { describe, expect, test } from 'bun:test';

import { defineCloudSchema, field, toSchemaSpec } from './schema';

describe('defineCloudSchema', () => {
  test('builds the native spec', () => {
    const schema = defineCloudSchema({
      Venue: { name: field.string() },
      Shift: { note: field.string().optional(), venue: field.reference('Venue') },
    });
    expect(toSchemaSpec(schema)).toEqual({
      types: [
        { name: 'Venue', fields: [{ name: 'name', kind: 'string', optional: false, target: null }] },
        {
          name: 'Shift',
          fields: [
            { name: 'note', kind: 'string', optional: true, target: null },
            { name: 'venue', kind: 'reference', optional: false, target: 'Venue' },
          ],
        },
      ],
    });
  });

  test('.optional() returns a new field and keeps the original required', () => {
    const required = field.int();
    const optional = required.optional();
    expect(required.isOptional).toBe(false);
    expect(optional.isOptional).toBe(true);
    expect(optional.kind).toBe('int');
  });

  test('rejects names CloudKit does not allow', () => {
    expect(() => defineCloudSchema({ '1Shift': { a: field.int() } })).toThrow('valid record type name');
    expect(() => defineCloudSchema({ Shift: { 'my-field': field.int() } })).toThrow('valid field name');
    expect(() => defineCloudSchema({ Shift: { id: field.string() } })).toThrow('reserved name');
    expect(() => defineCloudSchema({ Shift: { ek_photo_ext: field.string() } })).toThrow('reserved name');
    expect(() => defineCloudSchema({})).toThrow('at least one record type');
  });

  test('rejects a reference to an unknown type', () => {
    // @ts-expect-error checked at compile time too
    expect(() => defineCloudSchema({ Shift: { venue: field.reference('Place') } })).toThrow('isn\'t in the schema');
  });
});
