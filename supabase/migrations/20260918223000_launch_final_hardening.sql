-- Final launch hardening for seller approval/store activation and notifications.

create or replace function app_private.store_slug_for_application(p_name text, p_user_id uuid)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base text;
begin
  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_name,'')), '[^a-z0-9]+', '-', 'g'));
  if v_base is null or v_base = '' then v_base := 'boutique'; end if;
  return left(v_base, 40) || '-' || substr(replace(p_user_id::text,'-',''),1,8);
end;
$$;

create or replace function app_private.guard_seller_application_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_admin boolean :=
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('admin','global_admin')
    )
    or app_private.has_staff_permission('sellers.review')
    or app_private.has_staff_permission('sellers.approve')
    or app_private.has_staff_permission('sellers.reject')
    or app_private.has_staff_permission('sellers.suspend')
    or app_private.staff_role() = 'SUPER_ADMIN';
begin
  if v_is_admin then return new; end if;

  if old.user_id is distinct from (select auth.uid())
     or new.user_id is distinct from old.user_id then
    raise exception 'SELLER_APPLICATION_FORBIDDEN';
  end if;

  if new.admin_note is distinct from old.admin_note
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'SELLER_REVIEW_FIELDS_FORBIDDEN';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status='draft' and new.status='pending')
      or (old.status in ('needs_information','rejected') and new.status in ('draft','pending'))
    ) then
      raise exception 'INVALID_SELLER_APPLICATION_TRANSITION';
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.promote_approved_seller_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_category_id uuid;
  v_slug text;
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then

    update public.profiles
       set seller_enabled = true,
           updated_at = now()
     where id = new.user_id;

    select s.id into v_store_id
    from public.stores s
    where s.owner_id = new.user_id
    order by s.created_at asc
    limit 1;

    if v_store_id is null then
      select c.id into v_category_id
      from public.categories c
      where c.is_active = true
        and exists (
          select 1
          from unnest(coalesce(new.activity_categories,'{}'::text[])) as requested(name)
          where lower(requested.name) = lower(c.name)
        )
      order by c.sort_order asc, c.created_at asc
      limit 1;

      v_slug := app_private.store_slug_for_application(new.business_name,new.user_id);

      insert into public.stores(
        owner_id,name,slug,description,city,phone,status,primary_category_id,
        website_url,instagram_url,tiktok_url,facebook_url,linkedin_url,whatsapp_business
      )
      values(
        new.user_id,btrim(new.business_name),v_slug,nullif(btrim(new.description),''),
        coalesce(nullif(btrim(new.city),''),'Lubumbashi'),nullif(btrim(new.phone),''),
        'active',v_category_id,nullif(btrim(new.website_url),''),
        nullif(btrim(new.instagram_url),''),nullif(btrim(new.tiktok_url),''),
        nullif(btrim(new.facebook_url),''),nullif(btrim(new.linkedin_url),''),
        nullif(btrim(new.whatsapp_business),'')
      )
      returning id into v_store_id;
    end if;

    if v_store_id is not null
       and nullif(btrim(new.business_address),'') is not null
       and nullif(btrim(new.phone),'') is not null then
      insert into public.store_pickup_points(
        store_id,contact_name,phone,address_line,city
      )
      values(
        v_store_id,
        coalesce(nullif(btrim(new.representative_name),''),btrim(new.business_name)),
        btrim(new.phone),btrim(new.business_address),
        coalesce(nullif(btrim(new.city),''),'Lubumbashi')
      )
      on conflict(store_id) do update set
        contact_name=coalesce(nullif(btrim(public.store_pickup_points.contact_name),''),excluded.contact_name),
        phone=coalesce(nullif(btrim(public.store_pickup_points.phone),''),excluded.phone),
        address_line=coalesce(nullif(btrim(public.store_pickup_points.address_line),''),excluded.address_line),
        city=coalesce(nullif(btrim(public.store_pickup_points.city),''),excluded.city),
        updated_at=now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.notify_seller_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_link text;
begin
  if new.status is not distinct from old.status then return new; end if;

  v_title := case new.status
    when 'approved' then 'Boutique One Market activée'
    when 'rejected' then 'Demande vendeur refusée'
    when 'needs_information' then 'Informations vendeur requises'
    when 'under_review' then 'Demande vendeur en cours d’examen'
    when 'suspended' then 'Accès vendeur suspendu'
    else 'Demande vendeur mise à jour'
  end;

  v_body := case new.status
    when 'approved' then 'Votre dossier vendeur a été approuvé. Votre espace boutique est actif. Ajoutez vos produits et vérifiez votre adresse de ramassage avant les premières commandes.'
    when 'needs_information' then coalesce(nullif(btrim(new.admin_note),''),'One Market a besoin d’informations supplémentaires pour poursuivre la vérification de votre activité.')
    when 'rejected' then coalesce(nullif(btrim(new.admin_note),''),'Votre demande vendeur n’a pas été approuvée.')
    when 'under_review' then 'Votre dossier vendeur est maintenant en cours d’examen par l’équipe One Market.'
    when 'suspended' then coalesce(nullif(btrim(new.admin_note),''),'Votre accès vendeur a été suspendu. Votre compte client reste accessible.')
    else 'Le statut de votre demande vendeur a été mis à jour.'
  end;

  v_link := case when new.status='approved' then '/seller' else '/account?seller=apply' end;

  if not exists (
    select 1 from public.notifications n
    where n.user_id=new.user_id
      and n.type='seller_application'
      and n.meta->>'application_id'=new.id::text
      and n.meta->>'status'=new.status
      and n.created_at > now()-interval '5 minutes'
  ) then
    insert into public.notifications(user_id,title,body,type,link,meta)
    values(
      new.user_id,v_title,v_body,'seller_application',v_link,
      jsonb_build_object('application_id',new.id,'status',new.status)
    );
  end if;

  return new;
end;
$$;

create or replace function app_private.notify_store_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
begin
  if new.owner_id is null or new.status is not distinct from old.status then return new; end if;

  v_title := case new.status
    when 'active' then 'Boutique activée'
    when 'suspended' then 'Boutique suspendue'
    when 'refused' then 'Boutique refusée'
    else 'Statut de boutique mis à jour'
  end;

  v_body := case new.status
    when 'active' then 'Votre boutique '||new.name||' est active sur One Market.'
    when 'suspended' then 'Votre boutique '||new.name||' a été suspendue. Consultez votre espace vendeur ou contactez One Market.'
    when 'refused' then 'Votre boutique '||new.name||' n’a pas été activée.'
    else 'Le statut de votre boutique '||new.name||' a été mis à jour.'
  end;

  insert into public.notifications(user_id,title,body,type,link,meta)
  values(
    new.owner_id,v_title,v_body,'store','/seller',
    jsonb_build_object('store_id',new.id,'status',new.status)
  );

  return new;
end;
$$;

drop trigger if exists stores_notify_status_change on public.stores;
create trigger stores_notify_status_change
after update of status on public.stores
for each row
when (old.status is distinct from new.status)
execute function app_private.notify_store_status_change();

create or replace function public.erp_review_seller_application(
  p_application_id uuid,
  p_action text,
  p_note text default null
)
returns public.seller_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.seller_applications%rowtype;
  v_before jsonb;
  v_perm text;
begin
  v_perm := case p_action
    when 'approve' then 'sellers.approve'
    when 'reject' then 'sellers.reject'
    when 'needs_information' then 'sellers.review'
    when 'under_review' then 'sellers.review'
    when 'suspend' then 'sellers.suspend'
    else 'sellers.review'
  end;

  if not app_private.has_staff_permission(v_perm) then raise exception 'ERP_FORBIDDEN'; end if;

  select * into v_app
  from public.seller_applications
  where id=p_application_id
  for update;
  if not found then raise exception 'SELLER_APPLICATION_NOT_FOUND'; end if;

  v_before := to_jsonb(v_app);

  if p_action='approve' then
    update public.seller_applications
       set status='approved',admin_note=nullif(btrim(p_note),''),
           reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
     where id=p_application_id returning * into v_app;

  elsif p_action='reject' then
    if nullif(btrim(p_note),'') is null then raise exception 'REASON_REQUIRED'; end if;
    update public.seller_applications
       set status='rejected',admin_note=btrim(p_note),reviewed_at=now(),
           reviewed_by=(select auth.uid()),updated_at=now()
     where id=p_application_id returning * into v_app;
    update public.profiles set seller_enabled=false,updated_at=now()
     where id=v_app.user_id
       and not exists(select 1 from public.stores s where s.owner_id=v_app.user_id);

  elsif p_action='needs_information' then
    if nullif(btrim(p_note),'') is null then raise exception 'REASON_REQUIRED'; end if;
    update public.seller_applications
       set status='needs_information',admin_note=btrim(p_note),reviewed_at=now(),
           reviewed_by=(select auth.uid()),updated_at=now()
     where id=p_application_id returning * into v_app;

  elsif p_action='under_review' then
    update public.seller_applications
       set status='under_review',admin_note=nullif(btrim(p_note),''),
           reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
     where id=p_application_id returning * into v_app;

  elsif p_action='suspend' then
    if nullif(btrim(p_note),'') is null then raise exception 'REASON_REQUIRED'; end if;
    update public.seller_applications
       set status='suspended',admin_note=btrim(p_note),reviewed_at=now(),
           reviewed_by=(select auth.uid()),updated_at=now()
     where id=p_application_id returning * into v_app;
    update public.profiles set seller_enabled=false,updated_at=now() where id=v_app.user_id;
    update public.stores set status='suspended',updated_at=now()
     where owner_id=v_app.user_id and status<>'suspended';
  else
    raise exception 'INVALID_ACTION';
  end if;

  perform app_private.write_audit(
    'seller_application.'||p_action,'seller_application',p_application_id::text,
    v_before,to_jsonb(v_app),jsonb_build_object('note',p_note)
  );

  return v_app;
end;
$$;
