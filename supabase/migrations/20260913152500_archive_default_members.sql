-- Retire the original demo members without deleting their historical carts.
delete from public.family_sessions
where user_id in (
  select id
  from public.family_users
  where role = 'member'
    and username in ('amina', 'papa', 'maman', 'yassine', 'sara', 'adam')
);

update public.family_users
set active = false
where role = 'member'
  and username in ('amina', 'papa', 'maman', 'yassine', 'sara', 'adam');

