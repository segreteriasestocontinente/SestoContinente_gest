'use server';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/security';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const read=(form:FormData,key:string)=>String(form.get(key)??'').trim();
const profile='/area-personale/profilo';
function optional(form:FormData,key:string,max:number){
 const value=read(form,key);
 if(value.length>max)throw new Error('Campo troppo lungo.');
 return value||null;
}
function dateValue(form:FormData,key:string){
 const value=read(form,key);
 if(!value)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Data non valida.');
 const date=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Data non valida.');
 return value;
}
async function ownProfile(form:FormData){
 const {supabase,user}=await requireUser();
 const person=read(form,'persona_id');
 if(!uuid.test(person))return null;
 const {data:link,error}=await supabase.from('collegamenti_persone').select('persona_id').eq('utente_id',user.id).eq('persona_id',person).maybeSingle();
 if(error||!link)return null;
 return {supabase,user,person};
}
function refresh(person:string){
 revalidatePath(profile);revalidatePath('/area-personale');revalidatePath('/gestionale/soci/'+person);revalidatePath('/gestionale/soci');
}
export async function updateContact(form:FormData){
 const owned=await ownProfile(form);
 if(!owned)return {error:'Profilo non autorizzato.'};
 const {supabase,person}=owned;
 try{
  const email=optional(form,'email',254);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {error:'Email di contatto non valida.',field:'email'};
  const province=read(form,'provincia_residenza').toUpperCase();
  if(province&&!/^[A-Z]{2}$/.test(province))return {error:'Usa una sigla provinciale di due lettere.',field:'provincia_residenza'};
  const changes={telefono:optional(form,'telefono',30),indirizzo:optional(form,'indirizzo',250),cap:optional(form,'cap',10),comune:optional(form,'comune',100),provincia_residenza:province||null,stato_residenza:optional(form,'stato_residenza',15),email};
  const {error}=await supabase.from('persone').update(changes).eq('id',person).select('id').single();
  if(error)return {error:'Impossibile salvare i recapiti. Riprova.'};
 }catch{return {error:'Controlla lunghezza e formato dei recapiti.'};}
 refresh(person);
}
export async function updateEmergencyContact(form:FormData){
 const owned=await ownProfile(form);
 if(!owned)return {error:'Profilo non autorizzato.'};
 const {supabase,person}=owned;
 const name=read(form,'emergenza_nome'),phone=read(form,'emergenza_telefono');
 if(name.length<2||name.length>160)return {error:'Inserisci un nome valido.',field:'emergenza_nome'};
 if(!/^[+0-9() ./-]{5,32}$/.test(phone)||phone.replace(/\D/g,'').length<5)return {error:'Inserisci un numero di telefono valido.',field:'emergenza_telefono'};
 const {error}=await supabase.from('contatti_emergenza').upsert({persona_id:person,nominativo:name,telefono:phone},{onConflict:'persona_id'});
 if(error)return {error:'Impossibile salvare il contatto di emergenza.'};
 refresh(person);
}
export async function requestIdentityCorrection(form:FormData){
 const owned=await ownProfile(form);
 if(!owned)return {error:'Profilo non autorizzato.'};
 const {supabase,person,user}=owned;
 try{
  const nome=read(form,'nome'),cognome=read(form,'cognome'),data_nascita=dateValue(form,'data_nascita');
  if(!nome||!cognome||nome.length>100||cognome.length>100)return {error:'Inserisci nome e cognome validi.'};
  if(data_nascita&&data_nascita>new Date().toISOString().slice(0,10))return {error:'Data di nascita futura.',field:'data_nascita'};
  const provincia=read(form,'provincia_nascita').toUpperCase(),sesso=read(form,'sesso_cf'),cf=read(form,'codice_fiscale').toUpperCase();
  if(provincia&&!/^[A-Z]{2}$/.test(provincia))return {error:'Provincia non valida.',field:'provincia_nascita'};
  if(sesso&&!['M','F'].includes(sesso))return {error:'Valore non valido.',field:'sesso_cf'};
  if(cf&&!/^[A-Z0-9]{16}$/.test(cf))return {error:'Inserisci il codice fiscale ufficiale di 16 caratteri.',field:'codice_fiscale'};
  const changes={nome,cognome,data_nascita,luogo_nascita:optional(form,'luogo_nascita',150),provincia_nascita:provincia||null,stato_nascita:optional(form,'stato_nascita',100),sesso_cf:sesso||null,codice_fiscale:cf||null};
  const {data:pending,error:lookupError}=await supabase.from('rettifiche_anagrafiche').select('id,richiedente_id,revisione').eq('persona_id',person).eq('stato','in_attesa').maybeSingle();
  if(lookupError){if(process.env.QA_ISOLATED_ENV==='true')console.error('QA rettifica lookup',lookupError.code);return {error:'Impossibile verificare le rettifiche esistenti.'};}
  if(pending&&pending.richiedente_id!==user.id)return {error:'Una rettifica è già in attesa, presentata da un altro account collegato.'};
  if(pending&&Number(read(form,'revisione'))!==pending.revisione)return {error:'La richiesta è stata modificata. Ricarica il profilo.'};
  if(!pending&&read(form,'revisione'))return {error:'La richiesta non è più in attesa. Ricarica il profilo.'};
  const result=pending?await supabase.from('rettifiche_anagrafiche').update(changes).eq('id',pending.id).eq('persona_id',person).eq('revisione',pending.revisione).eq('stato','in_attesa').select('id').single():await supabase.from('rettifiche_anagrafiche').insert({persona_id:person,richiedente_id:user.id,...changes},{defaultToNull:false}).select('id').single();
  if(result.error){if(process.env.QA_ISOLATED_ENV==='true')console.error('QA rettifica write',result.error.code);return {error:result.error.code==='23505'?'È già presente una rettifica in attesa. Ricarica il profilo.':result.error.code==='42501'?'Il profilo non consente questa rettifica. Contatta la segreteria.':'Impossibile registrare la rettifica. Verifica i dati e riprova.'};}
 }catch{return {error:'Controlla i dati anagrafici.'};}
 refresh(person);
}
export async function saveExternalPatent(form:FormData){
 const owned=await ownProfile(form);
 if(!owned)return {error:'Profilo non autorizzato.'};
 const {supabase,person}=owned;
 const id=read(form,'brevetto_id');
 if(id&&!uuid.test(id))return {error:'Brevetto non valido.'};
 try{
  const titolo=read(form,'titolo'),ente=read(form,'ente');
  if(!titolo||titolo.length>200)return {error:'Indica il titolo del brevetto.',field:'titolo'};
  if(!ente||ente.length>120)return {error:'Indica la didattica o ente di rilascio.',field:'ente'};
  const ottenuto_il=dateValue(form,'ottenuto_il'),scade_il=dateValue(form,'scade_il');
  if(ottenuto_il&&ottenuto_il>new Date().toISOString().slice(0,10))return {error:'La data di conseguimento non può essere futura.',field:'ottenuto_il'};
  if(ottenuto_il&&scade_il&&scade_il<ottenuto_il)return {error:'La scadenza precede la data di conseguimento.',field:'scade_il'};
  const changes={titolo,ente,numero_brevetto:optional(form,'numero_brevetto',100),ottenuto_il,scade_il,centro_rilascio:optional(form,'centro_rilascio',200),istruttore_esterno:optional(form,'istruttore_esterno',160),note:optional(form,'note',1000),stato_verifica:'in_attesa'};
  const result=id?await supabase.from('brevetti_allievi').update(changes).eq('id',id).eq('persona_id',person).eq('origine','esterno').in('stato_verifica',['in_attesa','respinto']).select('id').single():await supabase.from('brevetti_allievi').insert({persona_id:person,origine:'esterno',...changes}).select('id').single();
  if(result.error)return {error:result.error.code==='23505'?'Un brevetto con lo stesso ente e numero è già registrato.':'Impossibile salvare il brevetto esterno. Verifica che non sia già stato approvato.'};
 }catch{return {error:'Controlla i dati del brevetto.'};}
 refresh(person);
}

export async function changeLoginEmail(form:FormData){
 const {supabase,user}=await requireUser();
 const email=read(form,'nuova_email').toLowerCase(),confirm=read(form,'conferma_email').toLowerCase();
 const password=String(form.get('password_attuale')??'');
 if(!user.email||!user.email_confirmed_at)return {error:'Conferma prima l’indirizzo email attuale.'};
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email===user.email.toLowerCase())return {error:'Inserisci un nuovo indirizzo email valido.',field:'nuova_email'};
 if(email!==confirm)return {error:'Gli indirizzi non coincidono.',field:'conferma_email'};
 if(!password||password.length>1024)return {error:'Inserisci la password attuale.',field:'password_attuale'};
 const origin=process.env.NEXT_PUBLIC_SITE_URL;
 if(!origin)return {error:'Cambio email temporaneamente non disponibile.'};
 let target:string;
 try{const parsed=new URL(origin);if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname)))throw Error();target=new URL('/auth/callback?next=%2Farea-personale%2Fprofilo%3Fmsg%3Demail_verifica',parsed.origin).toString();}catch{return {error:'Cambio email temporaneamente non disponibile.'};}
 const {data:verified,error:authError}=await supabase.auth.signInWithPassword({email:user.email,password});
 if(authError||verified.user?.id!==user.id)return {error:'Password attuale non corretta o verifica non disponibile.',field:'password_attuale'};
 const {error}=await supabase.auth.updateUser({email},{emailRedirectTo:target});
 if(error)return {error:'Non è stato possibile avviare il cambio email. Controlla l’indirizzo o riprova più tardi.'};
 revalidatePath(profile);
}
