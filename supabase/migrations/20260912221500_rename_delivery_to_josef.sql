-- Keep the existing delivery account and its related history while changing only
-- its public identity. The application accepts the previous username-bound hash,
-- so the existing PIN remains valid.
update public.family_users
set name = 'Josef',
    username = 'josef',
    initials = 'JO',
    role = 'delivery',
    active = true
where id = 2
  and role = 'delivery';
