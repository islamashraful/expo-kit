// Compile-time tests: `tsc --noEmit` fails if any of these types are wrong.
import { defineCloudSchema, field, type CloudRecord, type RecordTypeName } from './schema';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(_: T) {}

const schema = defineCloudSchema({
  Venue: { name: field.string() },
  Shift: {
    date: field.date(),
    tips: field.double(),
    hours: field.int(),
    paid: field.bool(),
    note: field.string().optional(),
    tags: field.stringList(),
    venue: field.reference('Venue'),
    photo: field.asset().optional(),
  },
});

type Shift = CloudRecord<typeof schema, 'Shift'>;
type Venue = CloudRecord<typeof schema, 'Venue'>;

expectType<Equal<RecordTypeName<typeof schema>, 'Venue' | 'Shift'>>(true);
expectType<Equal<Venue, { id: string; name: string }>>(true);
expectType<
  Equal<
    Shift,
    {
      id: string;
      date: Date;
      tips: number;
      hours: number;
      paid: boolean;
      tags: string[];
      venue: string;
      note?: string | null;
      photo?: string | null;
    }
  >
>(true);

// Optional fields can be left out or null.
const ok: Shift = { id: '1', date: new Date(), tips: 1, hours: 2, paid: true, tags: [], venue: 'v1' };
const okNull: Shift = { ...ok, note: null, photo: null };

// @ts-expect-error a required field is missing
const missing: Shift = { id: '1', tips: 1, hours: 2, paid: true, tags: [], venue: 'v1' };
// @ts-expect-error wrong value type
const wrongType: Shift = { ...ok, tips: '12' };
// @ts-expect-error unknown record type
type Unknown = CloudRecord<typeof schema, 'Nope'>;

defineCloudSchema({
  // @ts-expect-error a reference to a type that isn't in the schema
  Shift: { venue: field.reference('Place') },
});

export { ok, okNull, missing, wrongType };
export type { Unknown };

// The sync API is typed by the schema too.
import type { CloudSync, ApplyHandlers } from './sync';
declare const sync: CloudSync<typeof schema>;
sync.save('Venue', { id: 'v1', name: 'Bar' });
sync.save('Shift', ok);
// @ts-expect-error a field of another type
sync.save('Venue', { id: 'v1', tips: 1 });
// @ts-expect-error unknown record type
sync.save('Place', { id: 'p' });
// @ts-expect-error wrong value type
sync.save('Venue', { id: 'v1', name: 2 });

const handlers: ApplyHandlers<typeof schema> = {
  Venue: { save: (venues) => void venues.map((v) => v.name.toUpperCase()), delete: (ids) => void ids },
  Shift: { save: (shifts) => void shifts.map((s) => s.date.getTime()), delete: () => {} },
};
// @ts-expect-error every record type needs a handler
const missingHandler: ApplyHandlers<typeof schema> = { Venue: handlers.Venue };
export { handlers, missingHandler };
