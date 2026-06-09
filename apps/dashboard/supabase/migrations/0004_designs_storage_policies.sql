-- 0004_designs_storage_policies.sql
-- Let signed-in users upload design images directly from the browser to the
-- public `designs` Storage bucket. We moved uploads off the Vercel API route
-- (which caps request bodies at ~4.5MB and returned HTTP 413 for larger PNGs)
-- to a direct browser -> Supabase upload, which needs these RLS policies on
-- storage.objects. Public READ is already granted by the bucket being public.
--
-- Run this in the Supabase dashboard -> SQL Editor (paste + Run).
-- (Requires the `designs` bucket to already exist.)

drop policy if exists "designs_objects_insert_authenticated" on storage.objects;
create policy "designs_objects_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'designs');

-- upsert (overwriting an existing file) performs an update, so allow that too.
drop policy if exists "designs_objects_update_authenticated" on storage.objects;
create policy "designs_objects_update_authenticated"
  on storage.objects for update to authenticated
  using (bucket_id = 'designs')
  with check (bucket_id = 'designs');
