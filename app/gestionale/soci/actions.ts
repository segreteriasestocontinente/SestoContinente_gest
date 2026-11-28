'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireStaff} from '@/lib/security';
import {identityFromForm,validaSalvataggioAnagrafica} from '@/lib/verifica-anagrafica';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const read=(form:FormData,key:string)=>String(form.get(key)??'').trim();
const memberUrl=(id:string,msg:string)=>`/gestionale/soci/${encodeURIComponent(id)}?msg=${encodeURIComponent(msg)}`;
function optional(value:string,max:number):string|null{
 if(value.length>max)throw new Error('Campo troppo lungo');
 return value||null;
}
function optionalDate(value:string):string|null{
 if(!value)return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Data non valida');
 const date=new Date(`${value}T12:00:00Z`);
 if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value||value>new Date().toISOString().slice(0,10))throw new Error('Data non valida');
 return value;
}
export async function updateMemberProfile(form:FormData){
 const {supabase}=await requireStaff();
 const id=read(form,'id');
 if(!uuid.test(id))redirect('/gestionale/soci');
 const {data:previous,error:previousError}=await supabase.from('persone').select('nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,codice_catastale_nascita,cf_omocodia_verificata,cf_override_motivo').eq('id',id).single();
 if(previousError||!previous)return {error:'Anagrafica non disponibile. Ricarica prima di modificare.'};
 const check=await validaSalvataggioAnagrafica(identityFromForm(form),previous,read(form,'cf_omocodia_verificata')==='on',read(form,'cf_override_motivo'));
 if(check.error)return {error:'Verifica codice fiscale e dati anagrafici.',field:'codice_fiscale'};
 let changes:Record<string,string|boolean|null>;
 try{
  const nome=read(form,'nome');const cognome=read(form,'cognome');
  if(!nome||!cognome||nome.length>100||cognome.length>100)throw new Error('Nome o cognome non valido');
  const cf=read(form,'codice_fiscale').toUpperCase();
  const province=(name:string)=>{const x=read(form,name).toUpperCase();if(x&&!/^[A-Z]{2}$/.test(x))throw new Error('Provincia non valida');return x||null;};
  const country=(name:string)=>{const x=read(form,name);if(x.length>(name==='stato_nascita'?100:15))throw new Error('Stato non valido');return x?x[0].toUpperCase()+x.slice(1).toLowerCase():null;};
  const email=read(form,'email');
  if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Email non valida');
  changes={nome,cognome,codice_fiscale:cf||null,email:email||null,
   data_nascita:optionalDate(read(form,'data_nascita')),
   luogo_nascita:optional(read(form,'luogo_nascita'),150),
   indirizzo:optional(read(form,'indirizzo'),250),
   cap:optional(read(form,'cap'),10),
   comune:optional(read(form,'comune'),100),
   provincia_nascita:province('provincia_nascita'),stato_nascita:country('stato_nascita'),
   provincia_residenza:province('provincia_residenza'),stato_residenza:country('stato_residenza'),
   sesso_cf:read(form,'sesso_cf')||null,codice_catastale_nascita:check.code,
   cf_omocodia_verificata:check.omocodia,cf_override_motivo:check.reason,
   telefono:optional(read(form,'telefono'),30)};
 }catch(err){return {error:err instanceof Error?err.message:'Controlla i dati inseriti.'};}
 const {error}=await supabase.from('persone').update(changes).eq('id',id).select('id').single();
 if(error)return {error:error.code==='23505'?'Codice fiscale già presente.':'Aggiornamento non riuscito.',field:'codice_fiscale'};
 revalidatePath('/gestionale/soci');
 revalidatePath(`/gestionale/soci/${id}`);
 redirect(memberUrl(id,'salvato'));
}
export async function createMemberAdhesion(form:FormData){
 const {supabase}=await requireStaff();
 const id=read(form,'id');const stagione=read(form,'stagione_id');
 if(!uuid.test(id)||!uuid.test(stagione))redirect('/gestionale/soci');
 // Non attribuisce automaticamente lo stato attivo: pagamento e tesseramento sono separati.
 const {error}=await supabase.from('adesioni').insert({persona_id:id,stagione_id:stagione,stato:'da_perfezionare'});
 if(error)return {error:error.code==='23505'?'Per questa stagione esiste già un’adesione.':'Adesione non registrata. Controlla i dati e riprova.'};
 revalidatePath('/gestionale/soci');
 revalidatePath(`/gestionale/soci/${id}`);
 redirect(memberUrl(id,'adesione_creata'));
}

export async function updateMemberEmergency(form:FormData){
 const {supabase}=await requireStaff();
 const id=read(form,'id'),nominativo=read(form,'emergenza_nome'),telefono=read(form,'emergenza_telefono');
 if(!uuid.test(id))return {error:'Profilo non valido.'};
 if(nominativo.length<2||nominativo.length>160)return {error:'Nome non valido.',field:'emergenza_nome'};
 if(!/^[+0-9() ./-]{5,32}$/.test(telefono)||telefono.replace(/\D/g,'').length<5)return {error:'Numero non valido.',field:'emergenza_telefono'};
 const {error}=await supabase.from('contatti_emergenza').upsert({persona_id:id,nominativo,telefono},{onConflict:'persona_id'});
 if(error)return {error:'Impossibile salvare il contatto.'};
 revalidatePath('/area-personale/profilo');revalidatePath('/gestionale/soci/'+id);

}
export async function reviewIdentityCorrection(form:FormData){
 const {supabase}=await requireStaff();
 const person=read(form,'id'),request=read(form,'rettifica_id'),esito=read(form,'esito'),revisione=Number(read(form,'revisione'));
 if(!uuid.test(person)||!uuid.test(request)||!['applicata','respinta'].includes(esito)||!Number.isSafeInteger(revisione)||revisione<1)return {error:'Rettifica non valida.'};
 const motivazione=read(form,'motivazione_esito');
 if(motivazione.length>500||(esito==='respinta'&&motivazione.length<3))return {error:'Indica il motivo del rifiuto (da 3 a 500 caratteri).',field:'motivazione_esito'};
 const {data:proposal,error}=await supabase.from('rettifiche_anagrafiche').select('nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,revisione').eq('id',request).eq('persona_id',person).eq('stato','in_attesa').maybeSingle();
 if(error||!proposal||proposal.revisione!==revisione)return {error:'La rettifica è cambiata. Ricarica la scheda prima di decidere.'};
 let check:{code:string|null;omocodia:boolean;reason:string|null}={code:null,omocodia:false,reason:null};
 if(esito==='applicata'){
  const {data:previous,error:previousError}=await supabase.from('persone').select('nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,codice_catastale_nascita,cf_omocodia_verificata,cf_override_motivo').eq('id',person).single();
  if(previousError||!previous)return {error:'Impossibile verificare il profilo.'};
  if(previous.codice_fiscale&&!proposal.codice_fiscale)return {error:'Non rimuovere un codice fiscale già registrato. Richiedi una rettifica completa.'};
  const verified=await validaSalvataggioAnagrafica(proposal,previous,form.get('cf_omocodia_verificata')==='on',read(form,'cf_override_motivo'));
  if(verified.error)return {error:'Verifica il codice fiscale e la documentazione prima dell’approvazione.'};
  check=verified;
 }
 const result=await supabase.rpc('decidi_rettifica_anagrafica',{p_id:request,p_revisione:revisione,p_esito:esito,p_codice_catastale:check.code,p_omocodia:check.omocodia,p_motivo:check.reason,p_motivazione_esito:motivazione||null});
 if(result.error)return {error:result.error.code==='40001'?'Il profilo è cambiato dopo la richiesta. Respingi e chiedi una nuova rettifica.':'Impossibile completare la rettifica. Verifica eventuali duplicati.'};
 revalidatePath('/area-personale/profilo');revalidatePath('/gestionale/soci');revalidatePath('/gestionale/soci/'+person);

}
