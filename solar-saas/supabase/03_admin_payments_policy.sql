-- PROINVENTIVE Solar - 3/3 - let admins read every top-up row.
-- The existing "own payments" policy only exposes a user's own rows.

drop policy if exists "admin read payments" on public.payments;

create policy "admin read payments" on public.payments
  for select using (
    exists (
      select 1
        from public.profiles pr
       where pr.id = auth.uid()
         and pr.role = 'admin'::public.user_role
    )
  );
