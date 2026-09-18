create or replace function public.courier_set_availability(p_available boolean)
returns public.courier_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.courier_profiles%rowtype;
begin
  if not app_private.is_active_courier((select auth.uid())) then
    raise exception 'COURIER_FORBIDDEN';
  end if;

  update public.courier_profiles
  set is_available = p_available,
      updated_at = now()
  where user_id = (select auth.uid())
  returning * into v;

  if not found then raise exception 'COURIER_NOT_FOUND'; end if;
  return v;
end;
$$;

revoke all on function public.courier_set_availability(boolean) from public;
revoke execute on function public.courier_set_availability(boolean) from anon;
grant execute on function public.courier_set_availability(boolean) to authenticated;

comment on function public.courier_set_availability(boolean)
is 'Allows an active One Market courier to toggle personal availability from the mobile workspace.';
