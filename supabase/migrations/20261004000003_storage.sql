-- ════════════════════════════════════════════════════════════════════════
-- NCUDA — document storage
--
-- Files live in a PRIVATE bucket. Access to an object is derived from its
-- metadata row in public.documents: the subquery below runs under the
-- user's own RLS on public.documents, so an object is readable only if its
-- document row is visible AND the user may download it.
--
-- Upload flow: the server inserts the public.documents row as the user
-- (RLS checks UPLOAD_DOCUMENT), then issues a signed upload URL for exactly
-- that storage_path. Download flow: the server re-checks access and returns
-- a short-lived signed URL. Each download is logged via public.log_event.
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

create policy "download permitted documents" on storage.objects for select to authenticated using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name and public.document_visible_to_me(d.id)
  )
);

create policy "upload registered documents" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents'
  and exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name
      and d.uploaded_by = public.current_member_id()
  )
);

-- No update or delete policies: stored files are immutable; documents are
-- soft-deleted through public.documents.deleted_at.
