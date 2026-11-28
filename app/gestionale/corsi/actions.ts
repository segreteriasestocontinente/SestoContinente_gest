'use server';
import {tutteLePagine} from '@/lib/pagine';
import {calendarFormContext,calendarHref} from '@/lib/calendar-tools';
import {courseViewHref} from '@/lib/course-ui';
import {courseDuplicate,findCourseDuplicate,removeCourseEdition} from '@/lib/course-errors';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireStaff} from '@/lib/security';
import {asRomeISO,lessonInterval,COURSE_STATES,ENROLLMENT_STATES,UUID_RE,dateValue,detailHref,textValue,uuidValue} from '@/lib/course-tools';

const fail='/gestionale/corsi/nuovo?msg=errore';
function refresh(id?:string){revalidatePath('/gestionale/corsi');revalidatePath('/gestionale');if(id)revalidatePath(`/gestionale/corsi/${id}`);}
function valueOf(form:FormData,name:string,max=200){return textValue(form,name,max);}

export async function createCatalogCourse(form:FormData){
 const {supabase}=await requireStaff();
 let tipo='',nome='',livello:number|null=null,descrizione:string|null=null;
 try{
  tipo=valueOf(form,'tipo',20);if(!['ARA','APNEA','NUOTO_LIBERO'].includes(tipo))throw Error();
  nome=valueOf(form,'nome',150);if(!nome)throw Error();
  livello=tipo==='ARA'?Number(valueOf(form,'livello',1)):null;
  if(tipo==='ARA'&&(livello===null||!Number.isInteger(livello)||livello<1||livello>5))throw Error();
  descrizione=valueOf(form,'descrizione',1000)||null;
 }catch{return {error:'Controlla i dati inseriti.'};}
 const existing=await findCourseDuplicate(supabase,'corsi',{tipo,nome,livello});if(existing)return existing;
 const {error}=await supabase.from('corsi').insert({tipo,nome,livello,descrizione});
 if(error)return await courseDuplicate(supabase,'corsi',{tipo,nome,livello},error)??{error:'Controlla disciplina, nome e livello.',field:'nome'};
 refresh();redirect('/gestionale/corsi/nuovo?msg=catalogo');
}

export async function createEdition(form:FormData){
 const {supabase}=await requireStaff();
 let corso_id='',stagione_id='',nome='',inizio='',fine='',costo_corso:number|null=null,note:string|null=null;
 try{
  corso_id=uuidValue(form,'corso_id');stagione_id=uuidValue(form,'stagione_id');
  nome=valueOf(form,'nome',160);if(!nome)throw Error();
  inizio=dateValue(form,'inizio');fine=dateValue(form,'fine');if(fine<inizio)return {field:'fine',error:'La fine deve essere successiva o uguale all’inizio.'};

  note=valueOf(form,'note',2000)||null;const raw=valueOf(form,'costo_corso',20);costo_corso=raw?Number(raw.replace(',','.')):null;if(costo_corso!==null&&(!Number.isFinite(costo_corso)||costo_corso<0||!/^\d+(?:[.,]\d{1,2})?$/.test(raw)))throw Error();
 }catch{return {error:'Controlla i dati inseriti.'};}
 const {data:season}=await supabase.from('stagioni').select('dal,al').eq('id',stagione_id).maybeSingle();
 if(!season||inizio<season.dal||fine>season.al)return {field:'inizio',error:'Le date devono rientrare nella stagione selezionata.'};
 const direttore_id=String(form.get('direttore_id')??'');if(!UUID_RE.test(direttore_id))return {field:'direttore_id',error:'Seleziona un direttore.'};
 const existing=await findCourseDuplicate(supabase,'edizioni_corsi',{corso_id,stagione_id,nome,inizio,fine});if(existing)return existing;
 const {data,error}=await supabase.from('edizioni_corsi').insert({direttore_id,corso_id,stagione_id,nome,inizio,fine,costo_corso,stato:'programmato',note}).select('id').single();
 if(error)return await courseDuplicate(supabase,'edizioni_corsi',{corso_id,stagione_id,nome,inizio,fine},error)??{error:'Verifica le informazioni dell’edizione.',field:'nome'};
 if(!data)return {error:'Creazione non riuscita.'};
 refresh(data.id);redirect(detailHref(data.id,'creato'));
}

export async function updateEdition(form:FormData){
 const {supabase}=await requireStaff();
 let id='',nome='',stato='',costo_corso:number|null=null,note:string|null=null;
 try{
  id=uuidValue(form,'edizione_id');nome=valueOf(form,'nome',160);if(!nome)return {field:'nome',error:'Inserisci il nome dell’edizione.'};

  stato=valueOf(form,'stato',20);if(!COURSE_STATES.some(s=>s===stato))throw Error();
  note=valueOf(form,'note',2000)||null;const raw=valueOf(form,'costo_corso',20);costo_corso=raw?Number(raw.replace(',','.')):null;if(costo_corso!==null&&(!Number.isFinite(costo_corso)||costo_corso<0||!/^\d+(?:[.,]\d{1,2})?$/.test(raw)))return {field:'costo_corso',error:'Indica un importo positivo o zero con al massimo due decimali.'};
 }catch{return {error:'Controlla i dati inseriti per questa edizione.'};}
 const direttore_id=String(form.get('direttore_id')??'');
 if(!UUID_RE.test(direttore_id))return {field:'direttore_id',error:'Seleziona un direttore valido per l’edizione.'};
 const {error}=await supabase.from('edizioni_corsi').update({direttore_id,nome,costo_corso,stato,note}).eq('id',id).select('id').single();
 if(error){if(error.code==='P3510')return {field:'direttore_id',error:'Il direttore deve coincidere con il responsabile già assegnato. Usa Allinea direttore e responsabile nella scheda istruttori.'};if(error.code==='P3419')return await courseDuplicate(supabase,'edizioni_corsi',{nome},error)??{field:'nome',error:'Questo corso esiste già'};if(error.code==='23505')return {field:'nome',error:'Questo corso esiste già'};return error.code==='P3421'?{field:'direttore_id',error:'La persona scelta è già allieva di questa edizione. Scegli un altro direttore.'}:{field:'nome',error:'Verifica i dati dell’edizione.'};}
 refresh(id);redirect(detailHref(id,'salvato'));
}

export async function addInstructor(form:FormData){
 const {supabase}=await requireStaff();
 let id='',persona_id='',ruolo='';
 try{id=uuidValue(form,'edizione_id');persona_id=uuidValue(form,'persona_id');ruolo=valueOf(form,'ruolo',15);if(!['responsabile','aiuto'].includes(ruolo))throw Error();}
 catch{return {error:'Seleziona un istruttore e un ruolo validi.'};}
 const {data:edition}=await supabase.from('edizioni_corsi').select('stato,direttore_id').eq('id',id).maybeSingle();
 if(!edition||edition.stato==='annullato'||edition.stato==='concluso')return {error:'Il corso non è operativo.'};
 if(ruolo==='responsabile'&&edition.direttore_id!==persona_id)return {field:'persona_id',error:'Il responsabile deve essere il direttore del corso. Modifica prima il direttore nella configurazione.'};
 const {data:qual}=await supabase.from('qualifiche_istruttori').select('id').eq('persona_id',persona_id).limit(1);
 if(!qual?.length)return {error:'L’istruttore non ha qualifiche registrate.'};
 const {error}=await supabase.from('assegnazioni_istruttori').insert({edizione_id:id,persona_id,ruolo});
 if(error)return {error:error.code==='P3520'?'La persona è già allieva di questa edizione.':error.code==='P3510'?'Il responsabile deve coincidere con il direttore. Ricarica la scheda.':'Assegnazione non riuscita: controlla incarichi e duplicati.'};
 refresh(id);redirect(detailHref(id,'istruttore'));
}

export async function removeInstructor(form:FormData){
 const {supabase}=await requireStaff();let id='',assignment='';
 try{id=uuidValue(form,'edizione_id');assignment=uuidValue(form,'assegnazione_id');}catch{redirect('/gestionale/corsi?msg=dati');}
 if(form.get('conferma')!=='on')redirect(detailHref(id,'elimina_conferma'));
 const {data:row}=await supabase.from('assegnazioni_istruttori').select('ruolo').eq('id',assignment).eq('edizione_id',id).maybeSingle();
 if(!row)redirect(detailHref(id,'vincolo'));
 // Prima di togliere il responsabile di un'edizione attiva, bisogna concludere/sospendere la gestione del corso.
 if(row.ruolo==='responsabile')redirect(detailHref(id,'responsabile'));
 const {error}=await supabase.rpc('rimuovi_record_gestionale',{p_tabella:'assegnazioni_istruttori',p_id:assignment});
 if(error)redirect(detailHref(id,'vincolo'));
 refresh(id);redirect(detailHref(id,'istruttore'));
}

export async function replaceResponsible(form:FormData){
 const {supabase}=await requireStaff();let id='',person='';
 try{id=uuidValue(form,'edizione_id');person=uuidValue(form,'persona_id');}catch{return {error:'Seleziona un direttore e responsabile valido.'};}
 const expected=String(form.get('responsabile_atteso')??''),director=String(form.get('direttore_atteso')??'');
 if(!UUID_RE.test(expected)||!form.has('direttore_atteso')||(director&&!UUID_RE.test(director)))return {error:'Scheda non aggiornata. Ricarica prima di modificare gli incarichi.'};
 if(form.get('conferma_allineamento')!=='on')return {error:'Conferma esplicitamente la modifica dei due incarichi.'};
 const {error}=await supabase.rpc('allinea_direttore_responsabile',{p_edizione:id,p_persona:person,p_direttore_atteso:director||null,p_responsabile_atteso:expected});
 if(error)return {error:error.code==='P3511'?'Il direttore o il responsabile è cambiato, oppure il corso non è più operativo. Ricarica la scheda.':error.code==='P3421'?'La persona scelta è già allieva di questa edizione.':error.code==='P3512'?'Verifica le qualifiche e gli incarichi di aiuto già assegnati.':'Allineamento non riuscito. Nessuna modifica parziale è stata salvata.'};
 refresh(id);redirect(detailHref(id,'istruttore'));
}

export async function addEnrollment(form:FormData){
 const {supabase}=await requireStaff();let id='',person='',stato='';
 try{id=uuidValue(form,'edizione_id');person=uuidValue(form,'persona_id');stato=valueOf(form,'stato',20);if(stato!=='iscritto')throw Error();}
 catch{return {error:'Seleziona un allievo valido.'};}
 const {data:edition}=await supabase.from('edizioni_corsi').select('stagione_id,stato,direttore_id').eq('id',id).maybeSingle();
 if(!edition||!['programmato','attivo'].includes(edition.stato))return {error:'Il corso non è operativo.'};
 if(edition.direttore_id===person)return {field:'persona_id',error:'Il direttore non può essere allievo di questa edizione.'};
 // Solo soci con adesione e tessera valide possono essere iscritti.
 if(stato==='iscritto'){
  const {data:member}=await supabase.from('gest_soci_iscrivibili').select('persona_id').eq('persona_id',person).eq('stagione_id',edition.stagione_id).limit(1);
  if(!member?.length)return {field:'persona_id',error:'Servono adesione attiva e tessera valida nella stessa stagione.'};
 }
 const [qualifica,incarico]=await Promise.all([
  supabase.from('qualifiche_istruttori').select('id').eq('persona_id',person).limit(1),
  supabase.from('assegnazioni_istruttori').select('id').eq('edizione_id',id).eq('persona_id',person).limit(1)
 ]);
 if(qualifica.error||incarico.error)return {error:'Impossibile verificare qualifiche e incarichi. Ricarica la scheda.'};
 if(incarico.data?.length)return {field:'persona_id',error:'Un istruttore assegnato non può essere allievo nella stessa edizione.'};
 const instructor=Boolean(qualifica.data?.length);
 const motivo=String(form.get('deroga_motivo')??'').trim();
 if(instructor&&(form.get('deroga_istruttore')!=='on'||motivo.length<5||motivo.length>500))return {field:'deroga_motivo',error:'Per iscrivere un istruttore autorizza esplicitamente la deroga e indica la motivazione (5–500 caratteri).'};
 const {error}=instructor?await supabase.rpc('iscrivi_con_deroga',{p_edizione:id,p_persona:person,p_motivo:motivo,p_nome:'',p_telefono:''}):await supabase.rpc('iscrivi_con_contatto',{p_edizione:id,p_persona:person,p_nome:'',p_telefono:'',p_richiesta:false});
 if(error)return {error:error.code==='P3520'?'Un istruttore assegnato non può essere allievo nella stessa edizione.':error.code==='P3521'?'Serve una deroga istruttore autorizzata.':error.code==='P3421'?'Il direttore non può essere allievo.':error.code==='23505'?'Iscrizione già presente.':error.code==='P3413'?'Requisiti associativi non più soddisfatti.':'Iscrizione non riuscita: verifica i requisiti e aggiorna la scheda.'};
 refresh(id);redirect(detailHref(id,'iscritto'));
}

export async function authorizeInstructorEnrollment(form:FormData){
 const {supabase}=await requireStaff();
 let id='',iscrizione='',motivo='';
 try{id=uuidValue(form,'edizione_id');iscrizione=uuidValue(form,'iscrizione_id');motivo=valueOf(form,'deroga_motivo',500).trim();}catch{return {error:'Iscrizione o motivazione non valida.'};}
 if(form.get('deroga_istruttore')!=='on'||motivo.length<5)return {field:'deroga_motivo',error:'Conferma la deroga e indica la motivazione.'};
 const {error}=await supabase.rpc('autorizza_deroga_iscrizione',{p_edizione:id,p_iscrizione:iscrizione,p_motivo:motivo});
 if(error)return {error:error.code==='P3520'?'L’incarico nella stessa edizione non ammette deroghe.':'Deroga non registrata: verifica qualifica, stato e autorizzazioni.'};
 refresh(id);redirect(courseViewHref(id,'allievi','deroga_autorizzata'));
}

export async function updateEnrollment(form:FormData){
 const {supabase}=await requireStaff();let id='',iscrizione='',stato='';
 try{id=uuidValue(form,'edizione_id');iscrizione=uuidValue(form,'iscrizione_id');stato=valueOf(form,'stato',20);if(!ENROLLMENT_STATES.some(s=>s===stato))throw Error();}
 catch{return {error:'Stato di iscrizione non valido.'};}
 const [{data:edition},{data:row}]=await Promise.all([
  supabase.from('edizioni_corsi').select('stagione_id,stato').eq('id',id).maybeSingle(),
  supabase.from('iscrizioni_corsi').select('persona_id,stato').eq('edizione_id',id).eq('id',iscrizione).maybeSingle()
 ]);
 if(!edition||!row)return {error:'Iscrizione non disponibile.'};
 const expected=String(form.get('stato_atteso')??'');
 if(!ENROLLMENT_STATES.some(s=>s===expected)||row.stato!==expected)return {error:'Lo stato dell’iscrizione è cambiato. Ricarica la scheda prima di salvare.'};
 if(['in_attesa','iscritto'].includes(stato)&&stato!==row.stato){
  if(!['programmato','attivo'].includes(edition.stato))return {error:'Lo stato attuale del corso o dell’iscrizione non consente questa modifica.'};
  const {data:member}=await supabase.from('gest_soci_iscrivibili').select('persona_id').eq('persona_id',row.persona_id).eq('stagione_id',edition.stagione_id).limit(1);
  if(!member?.length)return {error:'Requisiti associativi non soddisfatti.'};
 }
 if(row.stato==='concluso'&&stato!=='concluso')return {error:'L’iscrizione conclusa non può essere riaperta.'};
 const {error}=await supabase.from('iscrizioni_corsi').update({stato}).eq('id',iscrizione).eq('edizione_id',id).eq('stato',expected).select('id').single();
 if(error)return {error:error.code==='P3520'?'La persona è assegnata come istruttore in questa edizione.':error.code==='P3521'?'Serve autorizzare la deroga istruttore prima di riattivare o approvare l’iscrizione.':error.code==='P3421'?'Il direttore non può essere allievo.':error.code==='P3413'?'Requisiti associativi non soddisfatti.':'Stato non aggiornato: controlla vincoli e modifiche concorrenti.'};
 refresh(id);redirect(detailHref(id,'iscritto'));
}

export async function createLesson(form:FormData){
 const {supabase}=await requireStaff();let id='',titolo='',inizio='',fine='',piscina_id:string|null=null,corsie:string[]=[],esercizi:string|null=null,materiale:string|null=null;
 
 try{
  id=uuidValue(form,'edizione_id');titolo=valueOf(form,'titolo',160);if(!titolo)throw Error();
  ({inizio,fine}=lessonInterval(form));
  const p=valueOf(form,'piscina_id',40);piscina_id=p?(UUID_RE.test(p)?p:(()=>{throw Error();})()):null;
  corsie=form.getAll('corsie_id').map(v=>String(v)).filter(Boolean);
  if(corsie.length>20||new Set(corsie).size!==corsie.length||corsie.some(v=>!UUID_RE.test(v))||(corsie.length>0&&!piscina_id))throw Error();
  esercizi=valueOf(form,'esercizi',2000)||null;materiale=valueOf(form,'materiale',1000)||null;
 }catch{return {error:'Controlla titolo, date, orari italiani, piscina e corsie.'};}
 const kind=String(form.get('tipo_lezione')??'');
 if(kind&&!['teoria','piscina'].includes(kind)||kind==='teoria'&&(piscina_id!==null||corsie.length>0)||kind==='piscina'&&!piscina_id)return {field:'piscina_id',error:'Seleziona una piscina solo per la lezione in piscina.'};
 // La funzione SQL inserisce lezione e corsie in un'unica transazione; qualsiasi conflitto annulla tutto.
 const {data:lessonId,error}=await supabase.rpc('crea_lezione_guidata',{
  p_edizione:id,p_titolo:titolo,p_inizio:inizio,p_fine:fine,p_piscina:piscina_id,
  p_corsie:corsie,p_esercizi:esercizi,p_materiale:materiale
 });
 if(error)return {error:['40P01','40001'].includes(error.code??'')?'Conflitto temporaneo tra operazioni simultanee. Nessuna lezione creata: ricarica e riprova.':error.code==='23P01'?'Una corsia è già prenotata nell’intervallo richiesto. Nessuna lezione creata.':'Lezione non salvata. Controlla periodo del corso, orari, piscina e conflitti.'};
 refresh(id);revalidatePath('/gestionale/calendario-visivo');const created=typeof lessonId==='string'&&UUID_RE.test(lessonId)?lessonId:undefined;
 if(form.get('origine')==='calendario')redirect(calendarHref(calendarFormContext(form),{msg:'lezione_creata',lezione:created}));
 redirect(courseViewHref(id,'lezioni','lezione_creata',created));
}

export async function recordClassAttendance(form:FormData){
 const {supabase}=await requireStaff();let id='',lesson_id='';
 try{id=uuidValue(form,'edizione_id');lesson_id=uuidValue(form,'lezione_id');}catch{return {error:'Lezione non valida.'};}
 const {data:lesson}=await supabase.from('lezioni').select('id').eq('id',lesson_id).eq('edizione_id',id).is('annullata_il',null).maybeSingle();
 if(!lesson)return {error:'Registro non disponibile o troppi allievi. Ricarica prima di modificare.'};
 const {data:learners,error:listError}=await tutteLePagine((da,a)=>supabase.from('iscrizioni_corsi').select('persona_id').eq('edizione_id',id).in('stato',['iscritto','concluso']).order('id').range(da,a));
 if(listError||!learners)return {error:'Elenco allievi non disponibile. Riprova.'};
 const rows:{lezione_id:string;persona_id:string;presente:boolean}[]=[];
 for(const p of learners){
  const value=String(form.get(`pres_${p.persona_id}`)??'');
  if(value==='si'||value==='no')rows.push({lezione_id:lesson_id,persona_id:p.persona_id,presente:value==='si'});
 }
 if(!rows.length)return {error:'Seleziona almeno una presenza o assenza prima di salvare.'};
 if(rows.length>500)return {error:'Salva al massimo 500 presenze per operazione.'};
 if(rows.length){const {error}=await supabase.from('presenze').upsert(rows,{onConflict:'lezione_id,persona_id'});if(error)return {error:'Presenze non salvate. Verifica gli allievi e riprova.'};}
 refresh(id);redirect(courseViewHref(id,'presenze','presenze_salvate',lesson_id)+'&p='+Math.max(1,Math.min(100000,Number.parseInt(String(form.get('pagina')??'1'),10)||1)));
}

export async function setCourseProgram(form:FormData){
 const {supabase}=await requireStaff();let id='',version:string|null=null;
 try{id=uuidValue(form,'edizione_id');const raw=valueOf(form,'programma_versione_id',40);version=raw?(UUID_RE.test(raw)?raw:(()=>{throw Error();})()):null;}
 catch{return {error:'Versione non valida.'};}
 if(version){
  const {data:edition}=await supabase.from('edizioni_corsi').select('corso_id').eq('id',id).maybeSingle();
  const {data:catalog}=edition?await supabase.from('corsi').select('tipo').eq('id',edition.corso_id).maybeSingle():{data:null};
  const {data:ver}=await supabase.from('versioni_programmi').select('programma_id,stato').eq('id',version).maybeSingle();
  const {data:program}=ver?await supabase.from('programmi_didattici').select('tipo').eq('id',ver.programma_id).maybeSingle():{data:null};
  if(!catalog||!ver||ver.stato!=='approvato'||!program||catalog.tipo!==program.tipo)return {error:'Scegli una versione approvata della stessa disciplina.'};
 }
 const {error}=await supabase.from('edizioni_corsi').update({programma_versione_id:version}).eq('id',id).select('id').single();
 if(error)return {error:'Scegli una versione approvata della stessa disciplina.'};
 refresh(id);redirect(detailHref(id,'programma_salvato'));
}

// MOD-22: sostituzione atomica dell'ordine dei moduli di una sola lezione.
export async function saveLessonModules(form:FormData){
 const {supabase}=await requireStaff();
 let edizione='',lezione='';
 try{edizione=uuidValue(form,'edizione_id');lezione=uuidValue(form,'lezione_id');}catch{return {error:'Lezione non valida.'};}
 const {data:lesson}=await supabase.from('lezioni').select('id').eq('id',lezione).eq('edizione_id',edizione).is('annullata_il',null).maybeSingle();
 if(!lesson)return {error:'Lezione non disponibile.'};
 const ids=form.getAll('modulo_id').map(String);
 if(ids.length>50||ids.some(x=>!UUID_RE.test(x))||new Set(ids).size!==ids.length)return {error:'Composizione non salvata. Controlla i moduli.'};
 const {error}=await supabase.rpc('imposta_moduli_lezione',{p_lezione:lezione,p_moduli:ids});
 if(error)return {error:'Composizione non salvata. Controlla i moduli.'};
 revalidatePath(`/gestionale/corsi/${edizione}`);revalidatePath('/gestionale/calendario-visivo');
 if(form.get('origine')==='calendario')redirect(calendarHref(calendarFormContext(form),{msg:'moduli_salvati',lezione}));
 redirect(courseViewHref(edizione,'lezioni','moduli_salvati',lezione));
}

// Delete only the selected edition: database foreign keys prevent removing linked history.
export async function deleteEdition(form:FormData){
 const {supabase}=await requireStaff();let id='';
 try{id=uuidValue(form,'edizione_id');}catch{redirect('/gestionale/corsi?msg=dati');}
 if(form.get('conferma')!=='on')redirect(detailHref(id,'elimina_conferma'));
 const {error}=await removeCourseEdition(supabase,id);
 if(error)redirect(detailHref(id,['23503','P3414'].includes(error.code)?'elimina_collegati':'elimina_errore'));
 refresh(id);revalidatePath('/gestionale/moduli/edizioni');revalidatePath('/gestionale/moduli/addebiti');
 redirect('/gestionale/corsi?msg=eliminato');
}
