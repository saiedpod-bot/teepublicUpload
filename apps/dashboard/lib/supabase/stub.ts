// Stub Supabase client used when NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are
// not configured (local dev without Supabase). Returns empty/no-op results.

const stubTerminal = Promise.resolve({ data: [] as unknown[], error: null });

const stubQueryBuilder: Record<string, (...args: unknown[]) => unknown> = {
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
  then: (resolve: (v: unknown) => unknown) => stubTerminal.then(resolve),
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