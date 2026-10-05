-- PDFMate schema. Safe to re-run (idempotent). Apply in the Supabase SQL editor or via the CLI.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  storage_path text check (storage_path is null or (char_length(storage_path) <= 500 and storage_path like user_id::text || '/%')),
  created_at timestamptz not null default now()
);
create index if not exists documents_user_created_idx on public.documents (user_id, created_at desc);

alter table public.documents enable row level security;

drop policy if exists "documents_owner_select" on public.documents;
drop policy if exists "documents_owner_insert" on public.documents;
drop policy if exists "documents_owner_update" on public.documents;
drop policy if exists "documents_owner_delete" on public.documents;
create policy "documents_owner_select" on public.documents for select using (auth.uid() = user_id);
create policy "documents_owner_insert" on public.documents for insert with check (auth.uid() = user_id);
create policy "documents_owner_update" on public.documents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents_owner_delete" on public.documents for delete using (auth.uid() = user_id);

-- Private storage bucket (50 MiB per object, PDFs only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "document_objects_owner" on storage.objects;
create policy "document_objects_owner" on storage.objects for all
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
