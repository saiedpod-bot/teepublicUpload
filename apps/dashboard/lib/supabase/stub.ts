// Stub Supabase client used when NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are
// not configured (local dev without Supabase). Returns empty/no-op results.

type StubResult = Promise<{ data: unknown[]; error: null }>;

interface StubQueryBuilder {
  select: (...args: unknown[]) => StubQueryBuilder;
  insert: (...args: unknown[]) => StubQueryBuilder;
  update: (...args: unknown[]) => StubQueryBuilder;
  delete: (...args: unknown[]) => StubQueryBuilder;
  eq: (...args: unknown[]) => StubQueryBuilder;
  neq: (...args: unknown[]) => StubQueryBuilder;
  gt: (...args: unknown[]) => StubQueryBuilder;
  gte: (...args: unknown[]) => StubQueryBuilder;
  lt: (...args: unknown[]) => StubQueryBuilder;
  lte: (...args: unknown[]) => StubQueryBuilder;
  like: (...args: unknown[]) => StubQueryBuilder;
  ilike: (...args: unknown[]) => StubQueryBuilder;
  is: (...args: unknown[]) => StubQueryBuilder;
  in: (...args: unknown[]) => StubQueryBuilder;
  contains: (...args: unknown[]) => StubQueryBuilder;
  containedBy: (...args: unknown[]) => StubQueryBuilder;
  range: (...args: unknown[]) => StubQueryBuilder;
  textSearch: (...args: unknown[]) => StubQueryBuilder;
  filter: (...args: unknown[]) => StubQueryBuilder;
  not: (...args: unknown[]) => StubQueryBuilder;
  or: (...args: unknown[]) => StubQueryBuilder;
  and: (...args: unknown[]) => StubQueryBuilder;
  order: (...args: unknown[]) => StubResult;
  limit: (...args: unknown[]) => StubResult;
  then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  single: () => Promise<{ data: null; error: Error }>;
}

const stubTerminal: StubResult = Promise.resolve({ data: [] as unknown[], error: null });

const stubQueryBuilder: StubQueryBuilder = {
  select: () => stubQueryBuilder,
  insert: () => stubQueryBuilder,
  update: () => stubQueryBuilder,
  delete: () => stubQueryBuilder,
  eq: () => stubQueryBuilder,
  neq: () => stubQueryBuilder,
  gt: () => stubQueryBuilder,
  gte: () => stubQueryBuilder,
  lt: () => stubQueryBuilder,
  lte: () => stubQueryBuilder,
  like: () => stubQueryBuilder,
  ilike: () => stubQueryBuilder,
  is: () => stubQueryBuilder,
  in: () => stubQueryBuilder,
  contains: () => stubQueryBuilder,
  containedBy: () => stubQueryBuilder,
  range: () => stubQueryBuilder,
  textSearch: () => stubQueryBuilder,
  filter: () => stubQueryBuilder,
  not: () => stubQueryBuilder,
  or: () => stubQueryBuilder,
  and: () => stubQueryBuilder,
  order: () => stubTerminal,
  limit: () => stubTerminal,
  then: (resolve) => stubTerminal.then(resolve),
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  single: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
};

export function createStubClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: new Error("Supabase not configured") }),
      signUp: () => Promise.resolve({ data: { user: null, session: null }, error: new Error("Supabase not configured") }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => stubQueryBuilder,
    channel: () => ({
      on: () => ({ subscribe: () => {} }),
      subscribe: () => {},
    }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
        download: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    rpc: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
  };
}