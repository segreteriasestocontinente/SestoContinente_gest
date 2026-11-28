-- Candidato di migrazione: esclusivamente per database isolato.
-- Nessuna eliminazione di righe; la colonna legacy della capienza è conservata.
drop trigger if exists verifica_capienza_trigger on public.iscrizioni_corsi;
drop trigger if exists controllo_riduzione_capienza on public.edizioni_corsi;

-- Una richiesta non è un'iscrizione confermata: il tesseramento valido è
-- necessario per la conferma, non per inoltrare una richiesta di stagione.
create or replace function public.valida_nuova_iscrizione_guidata()
returns trigger language plpgsql set search_path to '' as $$
declare v_stagione uuid; v_stato text;
begin
 if tg_op='UPDATE' and new.stato is not distinct from old.stato and new.persona_id is not distinct from old.persona_id and new.edizione_id is not distinct from old.edizione_id then return new; end if;
 if tg_op='UPDATE' then
  if new.persona_id is distinct from old.persona_id or new.edizione_id is distinct from old.edizione_id then
   raise exception 'Non è possibile riassegnare una iscrizione' using errcode='P3413';
  end if;
  if old.stato='concluso' and new.stato<>'concluso' then raise exception 'Iscrizione conclusa' using errcode='P3413'; end if;
 end if;
 if tg_op='INSERT' and (new.stato not in ('in_attesa','iscritto') or (new.stato='in_attesa' and public.is_staff() and not public.owns_person(new.persona_id))) then
  raise exception 'Stato iniziale non valido' using errcode='P3413';
 end if;
 if new.stato in ('in_attesa','iscritto') then
  select e.stagione_id,e.stato into v_stagione,v_stato from public.edizioni_corsi e where e.id=new.edizione_id;
  if not found or v_stato not in ('programmato','attivo') then raise exception 'Edizione non aperta' using errcode='P3413'; end if;
  if new.stato='iscritto' and not exists(select 1 from public.gest_soci_iscrivibili s where s.persona_id=new.persona_id and s.stagione_id=v_stagione) then
   raise exception 'Adesione attiva e tessera valida nella stagione obbligatorie' using errcode='P3413';
  end if;
  if new.stato='in_attesa' and not exists(select 1 from public.adesioni a where a.persona_id=new.persona_id and a.stagione_id=v_stagione and a.stato in ('attiva','da_perfezionare')) then
   raise exception 'Adesione associativa della stagione non presente' using errcode='P3413';
  end if;
 end if;
 return new;
end $$;

-- Modifica diretta dei recapiti personali, non dei dati fiscali o dei ruoli.
create or replace function public.guard_fascia_recapiti_personali()
returns trigger language plpgsql set search_path to '' as $$
begin
 if current_user='authenticated' and not public.is_staff() then
  if not public.owns_person(old.id) or
     (to_jsonb(new)-array['telefono','indirizzo','cap','comune','provincia_residenza','stato_residenza','email']) is distinct from
     (to_jsonb(old)-array['telefono','indirizzo','cap','comune','provincia_residenza','stato_residenza','email']) then
   raise exception 'Modifica anagrafica riservata alla verifica della segreteria' using errcode='42501';
  end if;
  if length(coalesce(new.telefono,''))>30 or length(coalesce(new.indirizzo,''))>250
     or length(coalesce(new.cap,''))>10 or length(coalesce(new.comune,''))>100
     or length(coalesce(new.email,''))>254
     or (new.email is not null and new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     or (new.provincia_residenza is not null and new.provincia_residenza !~ '^[A-Z]{2}$')
     or length(coalesce(new.stato_residenza,''))>15 then
   raise exception 'Recapiti non validi' using errcode='22023';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_fascia_recapiti_personali on public.persone;
create trigger guard_fascia_recapiti_personali before update on public.persone for each row execute function public.guard_fascia_recapiti_personali();
drop policy if exists persone_recapiti_propri on public.persone;
create policy persone_recapiti_propri on public.persone for update to authenticated
 using (public.owns_person(id)) with check (public.owns_person(id));

-- Rettifiche anagrafiche: l'utente propone, la segreteria verifica il CF
-- con il validatore esistente e applica in una transazione.
create table public.rettifiche_anagrafiche (
 id uuid primary key default gen_random_uuid(),
 persona_id uuid not null references public.persone(id) on delete cascade,
 richiedente_id uuid not null default auth.uid(),
 nome text not null check(length(btrim(nome)) between 1 and 100),
 cognome text not null check(length(btrim(cognome)) between 1 and 100),
 data_nascita date check(data_nascita is null or data_nascita>='1900-01-01'),
 luogo_nascita text check(length(luogo_nascita)<=150),
 provincia_nascita text check(provincia_nascita is null or provincia_nascita ~ '^[A-Z]{2}$'),
 stato_nascita text check(length(stato_nascita)<=100),
 sesso_cf text check(sesso_cf is null or sesso_cf in ('M','F')),
 codice_fiscale text check(codice_fiscale is null or length(codice_fiscale)<=16),
 base_dati jsonb not null,
 stato text not null default 'in_attesa' check(stato in ('in_attesa','applicata','respinta')),
 revisione integer not null default 1 check(revisione>0),
 creata_il timestamptz not null default now(),
 decisa_il timestamptz,
 decisa_da uuid,
 motivazione_esito text check(length(motivazione_esito)<=500),
 check((stato='in_attesa' and decisa_il is null and decisa_da is null and motivazione_esito is null) or (stato in ('applicata','respinta') and decisa_il is not null and decisa_da is not null and (stato<>'respinta' or length(btrim(coalesce(motivazione_esito,'')))>=3)))
);
create unique index rettifiche_anagrafiche_una_aperta on public.rettifiche_anagrafiche(persona_id) where stato='in_attesa';
create index rettifiche_anagrafiche_persona on public.rettifiche_anagrafiche(persona_id,creata_il desc);
alter table public.rettifiche_anagrafiche enable row level security;
revoke all on public.rettifiche_anagrafiche from public,anon,authenticated;
grant select,insert,update on public.rettifiche_anagrafiche to authenticated;
create policy rettifiche_read on public.rettifiche_anagrafiche for select to authenticated
 using (public.is_staff() or public.owns_person(persona_id));
create policy rettifiche_insert on public.rettifiche_anagrafiche for insert to authenticated
 with check (public.owns_person(persona_id) and richiedente_id=auth.uid() and stato='in_attesa' and decisa_il is null and decisa_da is null and motivazione_esito is null);
create policy rettifiche_self_update on public.rettifiche_anagrafiche for update to authenticated
 using (public.owns_person(persona_id) and richiedente_id=auth.uid() and stato='in_attesa')
 with check (public.owns_person(persona_id) and richiedente_id=auth.uid() and stato='in_attesa' and decisa_il is null and decisa_da is null and motivazione_esito is null);
create policy rettifiche_staff_update on public.rettifiche_anagrafiche for update to authenticated
 using (public.is_staff()) with check (public.is_staff());
create policy rettifiche_account_abilitato on public.rettifiche_anagrafiche as restrictive for all to authenticated
 using (public.account_corrente_abilitato()) with check (public.account_corrente_abilitato());

create or replace function public.prepara_rettifica_anagrafica()
returns trigger language plpgsql set search_path to '' as $$
begin
 if new.data_nascita is not null and new.data_nascita>(now() at time zone 'Europe/Rome')::date then raise exception 'Data di nascita futura' using errcode='22023'; end if;
 if tg_op='INSERT' then
  select jsonb_build_array(p.nome,p.cognome,p.data_nascita,p.luogo_nascita,p.provincia_nascita,p.stato_nascita,p.sesso_cf,p.codice_fiscale,p.codice_catastale_nascita,p.cf_omocodia_verificata,p.cf_override_motivo)
  into new.base_dati from public.persone p where p.id=new.persona_id;
  if not found then raise exception 'Profilo non disponibile' using errcode='42501'; end if;
  new.creata_il:=now(); new.revisione:=1;
 else
  if (new.id,new.persona_id,new.richiedente_id,new.creata_il,new.base_dati) is distinct from (old.id,old.persona_id,old.richiedente_id,old.creata_il,old.base_dati) then
   raise exception 'Identità della rettifica non modificabile' using errcode='42501';
  end if;
  if old.stato<>'in_attesa' then raise exception 'Rettifica già decisa' using errcode='22023'; end if;
  new.revisione:=old.revisione+1;
 end if;
 return new;
end $$;
create trigger prepara_rettifica_anagrafica before insert or update on public.rettifiche_anagrafiche for each row execute function public.prepara_rettifica_anagrafica();

create or replace function public.decidi_rettifica_anagrafica(p_id uuid,p_revisione integer,p_esito text,p_codice_catastale text,p_omocodia boolean,p_motivo text,p_motivazione_esito text default null)
returns void language plpgsql security invoker set search_path to '' as $$
declare r public.rettifiche_anagrafiche%rowtype; attuale jsonb;
begin
 if not public.is_staff() or not public.account_corrente_abilitato() then raise exception 'Non autorizzato' using errcode='42501'; end if;
 if p_esito not in ('applicata','respinta') or p_esito is null then raise exception 'Esito non valido' using errcode='22023'; end if;
 select * into r from public.rettifiche_anagrafiche where id=p_id and stato='in_attesa' for update;
 if not found then raise exception 'Rettifica non disponibile' using errcode='22023'; end if;
 if r.revisione is distinct from p_revisione then raise exception 'Rettifica modificata nel frattempo' using errcode='40001'; end if;
 if length(coalesce(p_motivazione_esito,''))>500 or (p_esito='respinta' and length(btrim(coalesce(p_motivazione_esito,'')))<3) then raise exception 'Motivazione esito non valida' using errcode='22023'; end if;
 if p_esito='applicata' then
  select jsonb_build_array(p.nome,p.cognome,p.data_nascita,p.luogo_nascita,p.provincia_nascita,p.stato_nascita,p.sesso_cf,p.codice_fiscale,p.codice_catastale_nascita,p.cf_omocodia_verificata,p.cf_override_motivo)
  into attuale from public.persone p where p.id=r.persona_id for update;
  if not found or attuale is distinct from r.base_dati then raise exception 'Anagrafica modificata nel frattempo: richiedi una nuova rettifica' using errcode='40001'; end if;
  if p_codice_catastale is not null and p_codice_catastale !~ '^[A-Z][0-9]{3}$' then raise exception 'Codice catastale non valido' using errcode='22023'; end if;
  if coalesce(p_omocodia,false) and length(btrim(coalesce(p_motivo,''))) not between 8 and 500 then raise exception 'Verifica documentale necessaria' using errcode='22023'; end if;
  update public.persone set nome=r.nome,cognome=r.cognome,data_nascita=r.data_nascita,luogo_nascita=r.luogo_nascita,
   provincia_nascita=r.provincia_nascita,stato_nascita=r.stato_nascita,sesso_cf=r.sesso_cf,codice_fiscale=r.codice_fiscale,
   codice_catastale_nascita=p_codice_catastale,cf_omocodia_verificata=coalesce(p_omocodia,false),cf_override_motivo=case when p_omocodia then p_motivo else null end
  where id=r.persona_id;
 end if;
 update public.rettifiche_anagrafiche set stato=p_esito,decisa_il=now(),decisa_da=auth.uid(),motivazione_esito=nullif(btrim(coalesce(p_motivazione_esito,'')),'') where id=p_id;
end $$;
revoke all on function public.decidi_rettifica_anagrafica(uuid,integer,text,text,boolean,text,text) from public,anon;
grant execute on function public.decidi_rettifica_anagrafica(uuid,integer,text,text,boolean,text,text) to authenticated;

-- Brevetti esterni: l'origine è esplicita, distinta dalla firma interna.
-- I record storici conservano la provenienza preesistente (origine NULL).
alter table public.brevetti_allievi add column origine text check(origine in ('interno','esterno'));
alter table public.brevetti_allievi add column stato_verifica text not null default 'verificato' check(stato_verifica in ('in_attesa','verificato','respinto'));
alter table public.brevetti_allievi add column centro_rilascio text check(length(centro_rilascio)<=200);
alter table public.brevetti_allievi add column istruttore_esterno text check(length(istruttore_esterno)<=160);
alter table public.brevetti_allievi add constraint brevetto_esterno_coerenza check(origine is distinct from 'esterno' or
 (edizione_id is null and rilasciato_da_id is null and rilasciato_da_nome is null and ente is not null and length(btrim(ente)) between 1 and 120 and length(btrim(titolo)) between 1 and 200 and length(coalesce(numero_brevetto,''))<=100 and length(coalesce(note,''))<=1000 and (scade_il is null or ottenuto_il is null or scade_il>=ottenuto_il)));
create unique index brevetto_esterno_numero_unico on public.brevetti_allievi(persona_id,lower(btrim(ente)),lower(btrim(numero_brevetto))) where origine='esterno' and nullif(btrim(numero_brevetto),'') is not null;

create or replace function public.firma_brevetto()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
 if tg_op='UPDATE' then
  if (new.id,new.edizione_id,new.persona_id,new.origine) is distinct from (old.id,old.edizione_id,old.persona_id,old.origine) then
   raise exception 'Intestatario, edizione e origine del brevetto non modificabili' using errcode='P3422';
  end if;
  if old.origine='esterno' then
   new.rilasciato_da_id:=null; new.rilasciato_da_nome:=null;
   if auth.uid() is not null and not public.is_staff() and (old.stato_verifica not in ('in_attesa','respinto') or new.stato_verifica<>'in_attesa') then
    raise exception 'La verifica è riservata alla segreteria' using errcode='42501';
   end if;
  else
   new.rilasciato_da_nome:=old.rilasciato_da_nome; new.rilasciato_da_id:=old.rilasciato_da_id;
   new.stato_verifica:=old.stato_verifica;
   new.centro_rilascio:=old.centro_rilascio; new.istruttore_esterno:=old.istruttore_esterno;
  end if;
  return new;
 end if;
 if new.origine='esterno' then
  if new.edizione_id is not null then raise exception 'Un brevetto esterno non è collegato a un corso interno' using errcode='P3422'; end if;
  if auth.uid() is not null and not public.is_staff() and new.stato_verifica<>'in_attesa' then raise exception 'La verifica è riservata alla segreteria' using errcode='42501'; end if;
  new.rilasciato_da_id:=null; new.rilasciato_da_nome:=null;
 else
  new.origine:='interno'; new.stato_verifica:='verificato';
  new.centro_rilascio:=null; new.istruttore_esterno:=null;
  select p.id,concat_ws(' ',p.nome,p.cognome) into new.rilasciato_da_id,new.rilasciato_da_nome
  from public.edizioni_corsi e join public.persone p on p.id=e.direttore_id where e.id=new.edizione_id for share of e,p;
  if not found or not exists(select 1 from public.iscrizioni_corsi where edizione_id=new.edizione_id and persona_id=new.persona_id and stato in ('iscritto','concluso')) then
   raise exception 'Seleziona un corso con direttore frequentato dall’allievo' using errcode='P3422';
  end if;
 end if;
 return new;
end $$;
create policy brevetti_esterni_propri_insert on public.brevetti_allievi for insert to authenticated
 with check (public.owns_person(persona_id) and origine='esterno' and stato_verifica='in_attesa' and edizione_id is null and rilasciato_da_id is null and rilasciato_da_nome is null);
create policy brevetti_esterni_propri_update on public.brevetti_allievi for update to authenticated
 using (public.owns_person(persona_id) and origine='esterno' and stato_verifica in ('in_attesa','respinto'))
 with check (public.owns_person(persona_id) and origine='esterno' and stato_verifica='in_attesa' and edizione_id is null and rilasciato_da_id is null and rilasciato_da_nome is null);

create or replace view public.gest_elenco_brevetti_allievi with (security_invoker=true) as
 select t.id,t.persona_id,t.titolo,t.ente,t.numero_brevetto,t.ottenuto_il,t.scade_il,t.note,
  p.cognome as sort_cognome,p.nome as sort_nome,t.edizione_id,t.rilasciato_da_nome,
  t.origine,t.stato_verifica,t.centro_rilascio,t.istruttore_esterno
 from public.brevetti_allievi t left join public.persone p on p.id=t.persona_id;
