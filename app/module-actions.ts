'use server';
import {memberTabForModule} from '@/lib/secretariat';
import {courseDuplicate,removeCourseEdition} from '@/lib/course-errors';
import {todayRome} from '@/lib/area-soci';
import {paymentAmount,validPaymentDate} from '@/lib/payment-tools';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireStaff} from '@/lib/security';
import {modules,isModuleKey,type Field,type Module} from '@/lib/modules';
import {formatRome} from '@/lib/course-tools';
import {italianLocalToISO} from '@/lib/format';
import {identityFromForm,validaSalvataggioAnagrafica} from '@/lib/verifica-anagrafica';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(f:FormData,k:string)=>String(f.get(k)??'').trim();
const errorPath=(key:string,code:string)=>`/gestionale/moduli/${encodeURIComponent(key)}?msg=${code}`;
export async function saveModuleRecord(form:FormData) {
 const key=text(form,'modulo');
 if(!isModuleKey(key)) redirect('/gestionale?msg=permessi');
 if(key==='pagamenti') redirect('/gestionale/incassi');
 const module:Module=modules[key];
 const {supabase,user}=await requireStaff();
 if(module.adminOnly){
  const {data}=await supabase.from('ruoli_utente').select('ruolo').eq('utente_id',user.id).eq('ruolo','amministratore').maybeSingle();
  if(!data) redirect('/gestionale?msg=permessi');
 }
 const id=text(form,'id');
 if(id && (!uuid.test(id)||module.appendOnly)) redirect(errorPath(key,'permessi'));
 // Le modifiche a lezioni esistenti passano dall'editor atomico di orario e corsie.
 if(key==='calendario'&&id)redirect(`/gestionale/calendario-visivo/${id}`);
 if(key==='calendario'&&!id)return {error:'Usa il modulo guidato Nuova lezione dal calendario.',href:'/gestionale/calendario-visivo?nuovo=1'};
 const changes:Record<string,unknown>={};
 for(const field of module.fields) {
  const raw=text(form,field.name);
  if(!id&&!raw&&((key==='edizioni'&&field.name==='direttore_id')))return {field:field.name,error:'Seleziona '+field.label.toLowerCase()+'.'};
  if(field.type==='checkbox') {changes[field.name]=form.get(field.name)==='on';continue;}
  if(field.required&&!raw) return {error:'Controlla il campo '+field.label+'.',field:field.name};
  if(!raw){changes[field.name]=null;continue;}
  if(raw.length>8000) return {error:'Controlla il campo '+field.label+'.',field:field.name};
  if(field.options&&!field.options.includes(raw)) return {error:'Controlla il campo '+field.label+'.',field:field.name};
  if(field.type==='reference'&&!uuid.test(raw)) return {error:'Controlla il campo '+field.label+'.',field:field.name};
  if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return {error:'Controlla il campo '+field.label+'.',field:field.name};
  if(field.type==='days'){
   const values=raw.split(',').map(x=>x.trim());
   if(values.length<1||values.length>10||values.some(x=>!/^\d{1,3}$/.test(x)))return {error:'Controlla il campo '+field.label+'.',field:field.name};
   const days=[...new Set(values.map(Number))];
   if(days.some(x=>x>365))return {error:'Controlla il campo '+field.label+'.',field:field.name};
   changes[field.name]=days.sort((a,b)=>b-a);continue;
  }
  if(field.type==='number'){
   const num=Number(raw.replace(',','.'));
   if(!Number.isFinite(num)||(field.min!==undefined&&num<field.min)||(field.step==='1'&&!Number.isInteger(num)))
    return {error:'Controlla il campo '+field.label+'.',field:field.name};
   changes[field.name]=num;continue;
  }
  if(field.type==='date'&&!validPaymentDate(raw))return {error:'Controlla il campo '+field.label+'.',field:field.name};
  if(field.type==='datetime'){
   try{changes[field.name]=italianLocalToISO(raw);}catch{return {error:'Controlla il campo '+field.label+'.',field:field.name};}
   continue;
  }
  changes[field.name]=raw;
 }
 if(key==='brevetti'){
  if(!id&&!['interno','esterno'].includes(String(changes.origine??'')))return {error:'Seleziona l’origine del brevetto.',field:'origine'};
  if(!id&&changes.origine==='interno'&&!changes.edizione_id)return {error:'Seleziona l’edizione interna frequentata.',field:'edizione_id'};
  if(changes.origine==='esterno'){
   if(changes.edizione_id)return {error:'Un brevetto esterno non è collegato a un corso interno.',field:'edizione_id'};
   if(!changes.ente)return {error:'Indica la didattica esterna.',field:'ente'};
   if(!changes.stato_verifica)changes.stato_verifica='in_attesa';
  }else if(!id){changes.stato_verifica='verificato';changes.centro_rilascio=null;changes.istruttore_esterno=null;}
  else if(!changes.stato_verifica)changes.stato_verifica='verificato';
 }
 let equipmentBefore:{stato:string;ultima_revisione:string|null;prossima_revisione:string|null}|null=null;
 if(key==='attrezzature'){
  if(id){
   const before=await supabase.from('attrezzature').select('stato,ultima_revisione,prossima_revisione').eq('id',id).maybeSingle();
   if(before.error||!before.data)return {error:'Attrezzatura non disponibile.'};equipmentBefore=before.data;
   const {count,error}=await supabase.from('assegnazioni_attrezzature').select('id',{count:'exact',head:true}).eq('attrezzatura_id',id).is('restituita_il',null);
   if(error||count===null)return {error:'Prestiti non verificabili.'};
   if(count>0&&changes.stato==='disponibile'||count===0&&changes.stato==='assegnata')return {field:'stato',error:'Lo stato deve essere coerente con i prestiti aperti.'};
   const {count:reviews,error:reviewError}=await supabase.from('revisioni_attrezzature').select('id',{count:'exact',head:true}).eq('attrezzatura_id',id);
   if(reviewError||reviews===null)return {error:'Revisioni non verificabili.'};
   if(reviews>0){if(equipmentBefore.ultima_revisione!==changes.ultima_revisione||equipmentBefore.prossima_revisione!==changes.prossima_revisione)return {error:'Le date di revisione sono cambiate o dipendono dallo storico. Riapri la scheda.'};delete changes.ultima_revisione;delete changes.prossima_revisione;}
  }else if(changes.stato==='assegnata')return {error:'Registra una consegna per assegnare l’attrezzatura.'};
 }
 if(key==='revisioni'){
  const date=String(changes.data_intervento??''),next=String(changes.prossimo_intervento??'');
  if(!validPaymentDate(date)||date>todayRome()||next&&(!validPaymentDate(next)||next<date))return {field:'data_intervento',error:'Controlla data intervento e prossima revisione.'};
  if(id){
   if(!validPaymentDate(text(form,'data_attesa')))return {error:'Riapri la revisione prima di modificarla.'};
  }else{
   const request=text(form,'richiesta_id');
   if(!uuid.test(request))return {error:'Riapri il modulo per registrare la revisione.'};
   const {error}=await supabase.rpc('registra_revisione',{
    p_richiesta:request,p_attrezzatura:changes.attrezzatura_id,p_data:date,p_prossimo:changes.prossimo_intervento,
    p_tipo:changes.tipo,p_esito:changes.esito,p_costo:changes.costo,p_note:changes.note,
    p_distinta:form.get('conferma_simile')==='on',
   });
   if(error?.code==='P3503')return {field:'conferma_simile',error:'Esiste un intervento simile. Controlla lo storico e conferma solo se è distinto.'};
   if(error?.code==='P3502')return {error:'Questa richiesta risulta già registrata con dati diversi. Controlla lo storico prima di riprovare.'};
   if(error)return {error:'Revisione non confermata. Verifica i dati e riprova.'};
   revalidatePath('/gestionale','layout');
   redirect(errorPath(key,'salvato'));
  }
 }
 if(key==='consegne'){
  if(id)return {error:'Usa il pulsante Registra restituzione. I dati storici del prestito non sono riscrivibili da questo modulo.'};
  if(!changes.persona_id&&!changes.edizione_id)return {error:'Seleziona almeno una persona o un corso.'};
  if(changes.restituita_il||!validPaymentDate(String(changes.assegnata_il))||String(changes.assegnata_il)>todayRome())return {error:'Controlla la data della consegna. Registra la restituzione separatamente.'};
  const {data:item,error}=await supabase.from('attrezzature').select('stato').eq('id',String(changes.attrezzatura_id)).maybeSingle();
  if(error||!item||item.stato!=='disponibile')return {field:'attrezzatura_id',error:'Attrezzatura non disponibile per la consegna.'};
 }
 if(key==='contabilita'){
  const amount=paymentAmount(text(form,'importo'));
  if(amount===null||!validPaymentDate(text(form,'data_movimento')))return {error:'Controlla importo in centesimi e data.',field:'importo'};
  changes.importo=amount;
 }
 if(key==='anagrafiche') {
  for(const fld of ['provincia_nascita','provincia_residenza']) {
   const val=String(changes[fld]??'').toUpperCase();
   if(val&&!/^[A-Z]{2}$/.test(val))return {error:"Controlla i campi obbligatori e i formati."};
   changes[fld]=val||null;
  }
  for(const fld of ['stato_nascita','stato_residenza']){
   const val=String(changes[fld]??'');
   if(val.length>(fld==='stato_nascita'?100:15))return {error:"Controlla i campi obbligatori e i formati."};
   changes[fld]=val?val[0].toUpperCase()+val.slice(1).toLowerCase():null;
  }
  let previous:import('@/lib/verifica-anagrafica').Identity & {codice_catastale_nascita?:unknown;cf_omocodia_verificata?:unknown;cf_override_motivo?:unknown}|null=null;
  if(id){
   const {data,error}=await supabase.from('persone').select('nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,codice_catastale_nascita,cf_omocodia_verificata,cf_override_motivo').eq('id',id).single();
   if(error||!data)return {error:"Operazione non completata. Controlla i dati e riprova."};
   previous=data;
  }
  const check=await validaSalvataggioAnagrafica(identityFromForm(form),previous,form.get('cf_omocodia_verificata')==='on',text(form,'cf_override_motivo'));
  if(check.error)return {error:'Controlla il codice fiscale e i dati anagrafici.',field:'codice_fiscale'};
  changes.codice_catastale_nascita=check.code;
  changes.cf_omocodia_verificata=check.omocodia;
  changes.cf_override_motivo=check.reason;
  changes.codice_fiscale=String(changes.codice_fiscale??'').toUpperCase()||null;
 }
 if(key==='iscrizioni'&&!id&&changes.stato!=='iscritto')return {error:"Il socio non soddisfa i requisiti di iscrizione."};
 if(key==='istruttori'){
  const person=String(changes.persona_id??'');
  const {data:qualified}=await supabase.from('qualifiche_istruttori').select('id').eq('persona_id',person).limit(1);
  if(!qualified?.length)return {error:"Operazione non consentita: controlla duplicati, date e collegamenti."};
 }
 if(key==='adesioni'&&changes.verbale_cda_id){
  const {data:verbale}=await supabase.from('cda_verbali').select('id').eq('id',String(changes.verbale_cda_id)).eq('stato','approvato').in('tipo',['Approvazione Adesioni Soci','Misto']).maybeSingle();
  if(!verbale)return {error:"Operazione non consentita: controlla duplicati, date e collegamenti."};
 }
 if(key==='addebiti'&&id){
  // Non riassegnare un debito a un altro socio/corso (anche con pagamenti esistenti).
  const {data:existing,error}=await supabase.from('addebiti_corsi').select('iscrizione_id').eq('id',id).single();
  if(error||!existing||existing.iscrizione_id!==changes.iscrizione_id)return {error:"La quota non può essere riassegnata a un'altra iscrizione."};
 }
 if(key==='addebiti'&&!id){
  const {data:eligible,error}=await supabase.from('iscrizioni_corsi').select('id,edizione:edizioni_corsi!inner(stato,stagione:stagioni!inner(attiva))').eq('id',String(changes.iscrizione_id)).eq('stato','iscritto').eq('edizione.stato','attivo').eq('edizione.stagione.attiva',true).maybeSingle();
  if(error||!eligible)return {error:"Seleziona un allievo iscritto a un corso attivo della stagione attiva."};
 }
 if(key==='comunicazioni'&&!id) changes.autore_id=user.id;
 if(key==='corsie'&&id){
  const {data:previous,error:readError}=await supabase.from('corsie').select('piscina_id').eq('id',id).maybeSingle();
  if(readError||!previous)return {error:'Corsia non disponibile.'};
  if(previous.piscina_id!==changes.piscina_id)return {field:'piscina_id',error:'La corsia resta associata all’impianto originale per tutelare le relazioni storiche. Configura una nuova corsia nell’altra piscina.'};
 }
 if(key==='prenotazioni'){
  const start=Date.parse(String(changes.inizio)),end=Date.parse(String(changes.fine));
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return {field:'fine',error:'La fine deve essere successiva all’inizio.'};
  if(id){
   const {data:previous,error}=await supabase.from('prenotazioni_corsie').select('lezione_id,corsia_id,inizio,fine,stato').eq('id',id).maybeSingle();
   if(error||!previous)return {error:'Prenotazione non disponibile.'};
   if(previous.lezione_id!==changes.lezione_id||previous.corsia_id!==changes.corsia_id)return {error:'La prenotazione resta collegata alla lezione e alla corsia originali. Annullala e crea una nuova prenotazione se necessario.'};
  }
  const [lesson,lane]=await Promise.all([supabase.from('lezioni').select('piscina_id,inizio,fine,annullata_il').eq('id',String(changes.lezione_id)).maybeSingle(),supabase.from('corsie').select('piscina_id').eq('id',String(changes.corsia_id)).maybeSingle()]);
  if(lesson.error||lane.error||!lesson.data||!lane.data)return {error:'Lezione o corsia non disponibili.'};
  if(lesson.data.piscina_id!==lane.data.piscina_id||start<Date.parse(lesson.data.inizio)||end>Date.parse(lesson.data.fine))return {field:'corsia_id',error:'La corsia deve appartenere alla piscina della lezione e la prenotazione deve rientrare nel suo orario.'};
  if(changes.stato==='confermata'&&lesson.data.annullata_il)return {error:'Non puoi prenotare una lezione annullata.'};
 }
 let query;
 if(key==='iscrizioni'&&!id&&form.get('deroga_istruttore')==='on'&&text(form,'deroga_motivo').trim()){
  const motivo=text(form,'deroga_motivo').trim();
  if(motivo.length<5||motivo.length>500)return {field:'deroga_motivo',error:'Indica una motivazione di 5–500 caratteri.'};
  query=supabase.rpc('iscrivi_con_deroga',{p_edizione:changes.edizione_id,p_persona:changes.persona_id,p_motivo:motivo,p_note:changes.note});
 }else if(id){
  let update=supabase.from(module.table).update(changes).eq('id',id);
  if(key==='revisioni'){
   const expectedNext=text(form,'prossima_attesa');
   update=update.eq('attrezzatura_id',String(changes.attrezzatura_id)).eq('data_intervento',text(form,'data_attesa'));
   update=expectedNext?update.eq('prossimo_intervento',expectedNext):update.is('prossimo_intervento',null);
  }
  if(key==='contabilita')update=update.is('pagamento_id',null);
  if(key==='attrezzature'&&equipmentBefore){update=update.eq('stato',equipmentBefore.stato);for(const field of ['ultima_revisione','prossima_revisione'] as const){const value=equipmentBefore[field];update=value?update.eq(field,value):update.is(field,null);}}
  if(key==='certificati'){
   const expected=text(form,'documento_atteso');
   if(!expected&&changes.esito_verifica==='valido')return {error:'Carica il certificato prima di validarlo.',field:'esito_verifica'};
   update=expected?update.eq('documento_id',expected):update.is('documento_id',null);
  }
  query=update.select('id').single();
 }
 else query=supabase.from(module.table).insert(changes).select('id').single();
 const {error}=await query;
 if(error) {
  if(key==='revisioni'&&error.code==='P3504')return {field:'data_intervento',error:'La correzione cambierebbe una scadenza di origine incerta. Verifica le date nello storico.'};
  if(key==='revisioni'&&error.code==='PGRST116')return {error:'La revisione è cambiata. Riapri la scheda prima di riprovare.'};
  if(key==='edizioni'||key==='corsi'){const dup=await courseDuplicate(supabase,module.table,changes,error);if(dup)return dup;}
  if(error.code==='P3510')return {error:'Direttore e responsabile devono coincidere. Apri la scheda del corso e usa Allinea direttore e responsabile.',field:key==='edizioni'?'direttore_id':'persona_id'};
  if(error.code==='P3520')return {field:'persona_id',error:'La stessa persona non può essere allievo e istruttore nella stessa edizione.'};
  if(error.code==='P3521')return {field:'persona_id',error:'Per iscrivere un istruttore occorre una deroga. Per iscrizioni già esistenti, apri la scheda del corso.'};
  if(error.code==='P3421')return {error:'Il direttore non può essere allievo della stessa edizione.',field:key==='edizioni'?'direttore_id':'persona_id'};
  if(error.code==='P3422')return {error:'Controlla l’origine del brevetto e, per i brevetti interni, l’edizione frequentata con direttore assegnato.',field:'edizione_id'};
  if(key==='attrezzature')return {error:'Salvataggio non riuscito: verifica codice univoco e possibili modifiche concorrenti.'};
  if(key==='certificati')return {error:'Verifica documento, stato e date del certificato.',field:'esito_verifica'};
  // 23P01: violazione del vincolo PostgreSQL EXCLUDE sull'occupazione corsie.
  // Mostrare un'indicazione comprensibile senza esporre dettagli SQL.
  if(key==='prenotazioni'&&error.code==='23P01'){
   const corsiaId=String(changes.corsia_id??'');
   const {data:corsia}=await supabase.from('corsie').select('numero').eq('id',corsiaId).maybeSingle();
   const params=new URLSearchParams({msg:'corsia_occupata'});
   if(corsia?.numero!==undefined&&corsia.numero!==null)params.set('corsia',String(corsia.numero));
   if(typeof changes.inizio==='string')params.set('inizio',changes.inizio);
   if(typeof changes.fine==='string')params.set('fine',changes.fine);
   return {error:`Corsia${params.get('corsia')?' '+params.get('corsia'):''} già prenotata${params.get('inizio')&&params.get('fine')?' dalle '+formatRome(params.get('inizio')!)+' alle '+formatRome(params.get('fine')!):' nell’intervallo richiesto'}. Scegli un’altra corsia o modifica l’orario.`,field:'corsia_id'};
  }
  if(key==='prenotazioni'&&error.code==='23505')return {error:"Questa corsia è già associata alla lezione."};
  if(key==='iscrizioni'&&error.code==='P3413')return {error:"Il socio non soddisfa i requisiti di iscrizione."};
  if(key==='addebiti'&&error.code==='P3412')return {error:id?'La quota non può essere riassegnata.':'Seleziona un’iscrizione attiva.'};
  const constraint=['23505','23P01','23503','23514'].includes(error.code??'');
  return {error:constraint?'Controlla duplicati, date e collegamenti.':'Impossibile salvare le modifiche.'};
 }
 revalidatePath(`/gestionale/moduli/${key}`);
 revalidatePath('/gestionale');
 if(['piscine','corsie','prenotazioni'].includes(key)){
  revalidatePath('/gestionale/calendario-visivo','layout');
  const q=new URLSearchParams({msg:'salvato'});if(id)q.set('edit',id);
  for(const k of ['piscina','corsia_id','lezione']){const value=text(form,'return_'+k);if(uuid.test(value))q.set(k,value);}
  redirect('/gestionale/moduli/'+key+'?'+q.toString());
 }
 const returnPerson=text(form,'return_persona'),tab=memberTabForModule(key);
 if(tab&&uuid.test(returnPerson)&&changes.persona_id===returnPerson){revalidatePath('/gestionale/soci/'+returnPerson);redirect('/gestionale/soci/'+returnPerson+'?tab='+tab+'&msg=elemento_salvato');}
 if(key==='iscrizioni'&&id)redirect('/gestionale/corsi/'+changes.edizione_id+'?tab=allievi&msg=iscritto');
 redirect(id?errorPath(key,'salvato')+'&edit='+id:errorPath(key,'salvato'));
}

export async function deleteModuleRecord(form:FormData){
 const key=text(form,'modulo'),id=text(form,'id'),back=text(form,'back');
 const {supabase}=await requireStaff();
 const extra:Record<string,string>={richieste:'richieste',cda_componenti:'cda_componenti',cda_verbali:'cda_verbali',moduli_didattici:'moduli_didattici'};
 const mod:Module|undefined=isModuleKey(key)?modules[key]:undefined;
 const table=mod?.table??(Object.prototype.hasOwnProperty.call(extra,key)?extra[key]:undefined);
 if(!table||mod?.appendOnly||!uuid.test(id))redirect('/gestionale?msg=permessi');
 const path=back==='calendario'?'/gestionale/calendario-visivo':back==='soci'?'/gestionale/soci':back==='richieste'?'/gestionale/richieste':back==='organi'?'/organi-sociali':back==='cda_archivio'?'/organi-sociali/archivio':back==='didattica'?'/gestionale/programmi-didattici':back==='corsi'?'/gestionale/corsi':back==='incassi'?'/gestionale/incassi':back.startsWith('corso:')&&uuid.test(back.slice(6))?`/gestionale/corsi/${back.slice(6)}`:back.startsWith('socio:')&&uuid.test(back.slice(6))?`/gestionale/soci/${back.slice(6)}`:`/gestionale/moduli/${key}`;
 if(form.get('conferma')!=='on')redirect(`${path}?msg=elimina_conferma`);
 const {error}=key==='listino'?await supabase.from('listino_corsi').delete().eq('id',id).select('id').single():key==='edizioni'?await removeCourseEdition(supabase,id):await supabase.rpc('rimuovi_record_gestionale',{p_tabella:table,p_id:id});
 revalidatePath('/', 'layout');
 redirect(`${path}?msg=${error?(['23503','P3414','P0001'].includes(error.code)?'elimina_collegati':'database'):'eliminato'}`);
}
