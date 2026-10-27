// Compile-time tests: `tsc --noEmit` fails if any of these types are wrong.
import { schema, type SchemaValue } from './schema';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function expectType<T extends true>(_: T) {}

const Contact = schema.object({
  name: schema.string(),
  age: schema.integer().describe('Age in years'),
  score: schema.number(),
  active: schema.boolean(),
  stage: schema.enum(['lead', 'customer']),
  email: schema.string().describe('Work email').optional(),
  phone: schema.string().optional().describe('Only if given'),
  tags: schema.array(schema.string(), { max: 3 }),
  address: schema.object({ city: schema.string(), zip: schema.string().optional() }).optional(),
});

expectType<
  Equal<
    SchemaValue<typeof Contact>,
    {
      name: string;
      age: number;
      score: number;
      active: boolean;
      stage: 'lead' | 'customer';
      tags: string[];
      email?: string;
      phone?: string;
      address?: { city: string; zip?: string };
    }
  >
>(true);

expectType<Equal<SchemaValue<ReturnType<typeof schema.enum<['positive', 'negative']>>>, 'positive' | 'negative'>>(true);
expectType<Equal<SchemaValue<ReturnType<typeof schema.array<ReturnType<typeof schema.integer>>>>, number[]>>(true);

// @ts-expect-error list items can't be optional
schema.array(schema.string().optional());

// @ts-expect-error an enum needs at least one choice
schema.enum([]);
