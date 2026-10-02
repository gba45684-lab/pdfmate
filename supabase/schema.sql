create table if not exists public.documents (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, size_bytes bigint not null default 0, storage_path text, created_at timestamptz not null default now());
alter table public.documents enable row level security;
create policy "documents_owner_select" on public.documents for select using (auth.uid()=user_id);
create policy "documents_owner_insert" on public.documents for insert with check (auth.uid()=user_id);
create policy "documents_owner_update" on public.documents for update using (auth.uid()=user_id);
create policy "documents_owner_delete" on public.documents for delete using (auth.uid()=user_id);

-- Storage: create a private bucket named "documents" in Supabase Storage, then apply owner policies:
create policy "document_objects_owner" on storage.objects for all using (bucket_id='documents' and auth.uid()::text=(storage.foldername(name))[1]) with check (bucket_id='documents' and auth.uid()::text=(storage.foldername(name))[1]);
