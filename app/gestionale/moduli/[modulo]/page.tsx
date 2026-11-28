import MedicalRegister from '@/components/MedicalRegister';
import BookingConflictPreview from '@/components/BookingConflictPreview';
import {Drawer} from '@/components/ui/Drawer';
import DeferredEditorButton from '@/components/DeferredEditorButton';
import {SecretariatNav} from '@/components/ui/Secretariat';
import {DataTable,FilterBar,SearchBar,Pagination} from '@/components/ui/DataTable';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {StatusBadge,PageHeader,ButtonLink,Alert} from '@/components/ui/Primitives';
import {moduleUi,cleanSearch,pageNumber,listHref as moduleListHref,entityLabel,singleSearchParams} from '@/lib/module-ui';
import {tutteLePagine} from '@/lib/pagine';
import {validLevel} from '@/lib/course-ui';
import {dateFilter,searchTerms,memberTabForModule,secretariatLinks,maskedFiscalCode,displayName} from '@/lib/secretariat';
import {romeDay,shiftDay,dayBounds} from '@/lib/calendar-tools';
import {statiCertificato,statoSingolo} from '@/lib/certificati';
import Cronologia from '@/components/Cronologia';
import EditForm from '@/components/EditForm';
import CancelEditButton from '@/components/CancelEditButton';
import Link from '@/components/ui/PrivateLink';
import {notFound,redirect} from 'next/navigation';
import {requireStaffForRender as requireStaff} from '@/lib/security';
import {modules,isModuleKey,type Module,type Field,type ModuleKey} from '@/lib/modules';
import {formatValue,datetimeForInput} from '@/lib/format';
import {formatRome,UUID_RE} from '@/lib/course-tools';
import {saveModuleRecord} from '@/app/module-actions';
import CodiceFiscaleAssist from '@/components/CodiceFiscaleAssist';
import RemoveRecord from '@/components/RemoveRecord';
import EligibleEnrollmentSelect from '@/components/EligibleEnrollmentSelect';
import CourseEnrollmentSelect from '@/components/CourseEnrollmentSelect';

type Row=Record<string,unknown> & {id:string};
const status:Record<string,string>={socio_non_iscrivibile:'Solo soci con adesione attiva e tessera attiva e valida per la stagione possono essere iscritti.',eliminato:'Elemento eliminato.',elimina_conferma:'Conferma l’eliminazione.',elimina_collegati:'Rimozione non consentita: sono presenti dati collegati oppure il record è protetto.',iscrizione_non_attiva:'Seleziona un allievo iscritto a un corso attivo della stagione attiva.',iscrizione_vincolata:'Non è possibile riassegnare una quota esistente a un’altra iscrizione.',salvato:'Modifiche salvate correttamente.',vincolo:'Operazione non consentita: controlla duplicati, date e collegamenti.',
 cf:'Codice fiscale non coerente, oppure luogo di nascita non identificato. Verifica i dati e il CF ufficiale.',omocodia:'Omocodia: conferma la verifica documentale e indica la motivazione.', dati:'Controlla i campi obbligatori e i formati.',database:'Impossibile salvare. Controlla i dati o contatta l’amministratore.',permessi:'Operazione non consentita.',
 corsia_duplicata:'Questa corsia è già associata alla stessa lezione. Controlla le prenotazioni esistenti.'};
function labelOf(record:Row,labels:readonly string[]){
 return (typeof record.calendar_label==='string'?record.calendar_label:labels.map(k=>String(record[k]??'')).join(' ')).trim().slice(0,160);
}
function EnrollmentInput({field,value,references,editing}:{field:Field;value?:unknown;references:Record<string,Row[]>;editing:boolean}){
 const rows=references.iscrizioni_corsi??[];
 if(editing){const selected=rows.find(r=>r.id===value);return <label>{field.label}<input type="hidden" name={field.name} value={String(value??'')}/><input readOnly value={selected?String(selected.etichetta):'Iscrizione storica (non disponibile)'}/><span className="hint">L’iscrizione è vincolata alla quota esistente.</span></label>;}
 return <CourseEnrollmentSelect name={field.name} options={rows.filter(r=>r.selezionabile===true).map(r=>({id:r.id,editionId:String(r.edizione_id),course:String(r.gruppo),person:String(r.allievo)}))}/>;
}
function FieldInput({field,value,references,scope}:{field:Field;value?:unknown;references:Record<string,Row[]>;scope:string}){
 const id=scope+'-'+field.name;
 const common={name:field.name,id,required:field.required??false,'aria-describedby':field.hint?id+'-hint':undefined};
 const display=Array.isArray(value)?value.join(', '):(typeof value==='string'||typeof value==='number'?String(value):'');
 if(field.type==='checkbox')return <div className="sc-field sc-field-check"><label htmlFor={id} className="check-label"><input {...common} type="checkbox" defaultChecked={value===true}/><span>{field.label} <span className="sc-required">{field.required?'(obbligatorio)':'(facoltativo)'}</span></span></label>{field.hint&&<span id={id+'-hint'} className="hint">{field.hint}</span>}</div>;
 return <div className="sc-field">
 <label htmlFor={id}>{field.label} {field.required&&<span aria-hidden="true" className="sc-required-star">*</span>} <span className="sc-required">{field.required?'(obbligatorio)':'(facoltativo)'}</span></label>
 {field.type==='textarea'?<textarea {...common} rows={3} defaultValue={display}/>
 :field.type==='select'?<select {...common} defaultValue={display}><option value="">Seleziona…</option>{display&&!field.options?.includes(display)&&<option value={display}>{display.replaceAll('_',' ')}</option>}{field.options?.map(o=><option key={o} value={o}>{o.replaceAll('_',' ')}</option>)}</select>
 :field.type==='reference'?<SearchableSelect {...common} label={field.label} value={display} options={(references[field.ref?.table??'']??[]).map(row=>({value:row.id,label:labelOf(row,field.ref?.labels??['id'])||'Denominazione non disponibile'}))}/>
 :<input {...common} type={field.type==='datetime'?'datetime-local':field.type==='number'?'number':field.type==='date'?'date':field.type==='email'?'email':'text'} min={field.min} step={field.step} defaultValue={field.type==='datetime'?datetimeForInput(value):display}/>}
 {field.hint&&<span id={id+'-hint'} className="hint">{field.hint}</span>}
 </div>;
}
function rowLabel(row:Row,refs:Record<string,Row[]>,module:Module){
 const direct=[row.sort_cognome,row.sort_nome,row.nome,row.titolo,row.codice,row.descrizione].filter(Boolean).join(' ').trim();
 if(direct)return direct.slice(0,140);
 for(const f of module.fields){if(!f.ref)continue;const ref=refs[f.ref.table]?.find(x=>x.id===row[f.name]);if(ref){const label=labelOf(ref,f.ref.labels);if(label)return label;}}
 return entityLabel(module.name);
}
function columnLabel(c:string,module:Module){
 return module.fields.find(f=>f.name===c)?.label??({documento_id:'Certificato',stato_certificato:'Stato',rilasciato_da_nome:'Rilasciato da',iscritta_il:'Data iscrizione',registrata_il:'Registrata il',pubblicata_il:'Pubblicata il'} as Record<string,string>)[c]??c.replaceAll('_',' ');
}
function tone(value:unknown):'success'|'warning'|'danger'|'info'|'neutral'{
 if(['attiva','attivo','valido','approvata','approvato','disponibile','confermata','iscritto','pagato','saldata','concluso'].includes(String(value)))return 'success';
 if(['in_attesa','da_perfezionare','da_emettere','in_manutenzione','in_scadenza'].includes(String(value)))return 'warning';
 if(['scaduto','scaduta','respinto','respinta','non_valido','fuori_servizio','mancante'].includes(String(value)))return 'danger';
 if(['programmato','assegnata','in_verifica'].includes(String(value)))return 'info';
 return 'neutral';
}
const sezioniEditor:Record<string,Record<string,string[]>>={
 anagrafiche:{'Dati personali':['nome','cognome','data_nascita','luogo_nascita','provincia_nascita','stato_nascita'],'Residenza e recapiti':['indirizzo','cap','comune','provincia_residenza','stato_residenza','email','telefono'],'Dati fiscali':['sesso_cf','codice_fiscale'],'Verifiche particolari':['cf_omocodia_verificata','cf_override_motivo']},
 edizioni:{'Corso e direzione':['corso_id','nome','direttore_id','programma_versione_id'],'Stagione e calendario':['stagione_id','inizio','fine','stato'],'Organizzazione':['costo_corso','note']},
 brevetti:{'Allievo e origine':['persona_id','origine','edizione_id'],'Dati del brevetto':['titolo','ente','numero_brevetto','ottenuto_il','scade_il','centro_rilascio','istruttore_esterno','stato_verifica','note']},
 certificati:{'Intestatario e periodo':['persona_id','rilasciato_il','scade_il'],'Verifica amministrativa':['esito_verifica','note_amministrative']},
};
function Editor({module,moduleKey,record,references,admin=false,personId='',editionId='',poolId='',laneId='',lessonId=''}:{module:Module;moduleKey:string;record?:Row;references:Record<string,Row[]>;admin?:boolean;personId?:string;editionId?:string;poolId?:string;laneId?:string;lessonId?:string}){
 const lockedVersion=moduleKey==='versioni'&&record&&['approvato','archiviato'].includes(String(record.stato));
 const sezioni=sezioniEditor[moduleKey];
 const gruppi=sezioni?Object.entries(sezioni).map(([titolo,nomi])=>({titolo,fields:module.fields.filter(f=>nomi.includes(f.name))})):[{titolo:'Dati della scheda',fields:module.fields}];
 const remaining=module.fields.filter(f=>!gruppi.some(g=>g.fields.includes(f)));if(remaining.length)gruppi.push({titolo:'Altri dati',fields:remaining});
 return <>{lockedVersion&&<div className="notice">Versione storica protetta: i contenuti non sono modificabili. {record?.stato==='approvato'?'Puoi archiviare la versione oppure crearne una nuova.':'La versione archiviata non può essere riattivata.'}</div>}<EditForm action={saveModuleRecord} className="module-form stack sc-secretariat-form">
 <p className="tiny muted sc-form-legend">* Campi obbligatori. Gli altri sono facoltativi.</p>

 <input type="hidden" name="modulo" value={moduleKey}/>
 {record&&<input type="hidden" name="id" value={record.id}/>} {poolId&&<input type="hidden" name="return_piscina" value={poolId}/>} {laneId&&<input type="hidden" name="return_corsia_id" value={laneId}/>} {lessonId&&<input type="hidden" name="return_lezione" value={lessonId}/>}{personId&&<input type="hidden" name="return_persona" value={personId}/>}{record&&moduleKey==='certificati'&&<input type="hidden" name="documento_atteso" value={String(record.documento_id??'')}/>}
 {gruppi.map(({titolo,fields})=>{const content=<fieldset><legend>{titolo}</legend><div className="form-grid">{moduleKey==='iscrizioni'&&!record&&<EligibleEnrollmentSelect editions={(references.edizioni_corsi??[]) as unknown as {id:string;nome:string;stagione_id:string;stato:string;direttore_id?:string|null}[]} initialPerson={personId} eligible={(references.gest_soci_iscrivibili??[]) as unknown as {persona_id:string;stagione_id:string;nome:string;cognome:string}[]}/>} {fields.filter(f=>!(moduleKey==='iscrizioni'&&!record&&['edizione_id','persona_id','stato'].includes(f.name))).map(f=>lockedVersion&&f.name!=='stato'?<div key={f.name} className="sc-field"><strong>{f.label}</strong><p className="sc-prewrap">{f.ref?labelOf(references[f.ref.table]?.find(r=>r.id===record?.[f.name])??({id:''} as Row),f.ref.labels)||'Non disponibile':formatValue(record?.[f.name])}</p><input type="hidden" name={f.name} value={String(record?.[f.name]??'')}/></div>:moduleKey==='addebiti'&&f.name==='iscrizione_id'?<EnrollmentInput key={f.name} field={f} value={record?.[f.name]} references={references} editing={!!record}/>:record&&moduleKey==='brevetti'&&f.name==='origine'?<label key={f.name}>Origine<input type="hidden" name="origine" value={String(record.origine??'')}/><input readOnly value={String(record.origine??'storico')}/></label>:record&&((['iscrizioni','brevetti'].includes(moduleKey)&&['persona_id','edizione_id'].includes(f.name))||(moduleKey==='prenotazioni'&&['lezione_id','corsia_id'].includes(f.name))||(moduleKey==='corsie'&&f.name==='piscina_id'))?<label key={f.name}>{f.label}<input type="hidden" name={f.name} value={String(record[f.name]??'')}/><input readOnly value={labelOf(references[f.ref?.table??'']?.find(r=>r.id===record[f.name])??({id:''} as Row),f.ref?.labels??['id'])||'Non acquisito'}/></label>:<FieldInput scope={moduleKey+'-'+(record?.id??'new')} key={`${record?.id??'new'}-${f.name}`} field={moduleKey==='iscrizioni'&&record&&f.name==='stato'?{...f,options:f.options?.filter(o=>o===record.stato||!['in_attesa','iscritto'].includes(o)||((references.edizioni_corsi??[]).some(e=>e.id===record.edizione_id&&['programmato','attivo'].includes(String(e.stato)))&&(references.gest_soci_iscrivibili??[]).some(e=>e.persona_id===record.persona_id&&e.stagione_id===(references.edizioni_corsi??[]).find(x=>x.id===record.edizione_id)?.stagione_id)))}:lockedVersion&&f.name==='stato'?{...f,options:record?.stato==='archiviato'?['archiviato']:['approvato','archiviato']}:f} value={record?.[f.name]??(moduleKey==='certificati'&&f.name==='esito_verifica'&&record?(record.idoneita_verificata?'valido':record.documento_id?'in_attesa':'non_valido'):undefined)??(!record&&f.name==='piscina_id'&&references.piscine?.some(r=>r.id===poolId)?poolId:undefined)??(!record&&f.name==='corsia_id'&&references.corsie?.some(r=>r.id===laneId)?laneId:undefined)??(!record&&f.name==='lezione_id'&&references.lezioni?.some(r=>r.id===lessonId)?lessonId:undefined)??(!record&&moduleKey==='brevetti'&&f.name==='origine'&&editionId?'interno':undefined)??(!record&&f.name==='edizione_id'&&references[f.ref?.table??'']?.some(r=>r.id===editionId)?editionId:undefined)??(!record&&f.name==='persona_id'&&references[f.ref?.table??'']?.some(r=>r.id===personId)?personId:undefined)??(!record&&moduleKey==='anagrafiche'&&['stato_nascita','stato_residenza'].includes(f.name)?'Italia':undefined)} references={references}/>)}</div></fieldset>;return moduleKey==='anagrafiche'&&titolo==='Verifiche particolari'&&!fields.some(f=>f.required)?<details key={titolo} className="sc-advanced-fields" open={Boolean(record?.cf_omocodia_verificata||record?.cf_override_motivo)||undefined}><summary>Verifiche particolari (omocodia)</summary>{content}</details>:<div key={titolo} className="sc-editor-section">{content}</div>;})}
 {moduleKey==='prenotazioni'&&<BookingConflictPreview/>}{moduleKey==='anagrafiche'&&<CodiceFiscaleAssist/>}<div className="form-actions"><button type="submit" className="button">{record?'Salva modifiche':'Salva '+entityLabel(moduleKey)}</button><CancelEditButton/></div>
 </EditForm>
 {record&&!module.appendOnly&&!lockedVersion&&<RemoveRecord moduleKey={moduleKey} id={record.id} label={rowLabel(record,references,module)}/>}
 {record&&moduleKey==='certificati'&&<Cronologia tipo="certificato" id={record.id}/>}
 {record&&admin&&<p><Link href={`/gestionale/amministrazione-dati/dipendenze/${module.table}/${record.id}`}>Consulta collegamenti della scheda</Link></p>}
</>;
}
function bookingConflictText(corsia?:string,inizio?:string,fine?:string):string{
 const numero=corsia&&/^\d{1,4}$/.test(corsia)?` ${corsia}`:'';
 const safeDate=(value?:string)=>value&&value.length<=35&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?formatRome(value):null;
 const dal=safeDate(inizio),al=safeDate(fine);
 const fascia=dal&&al?` dalle ${dal} alle ${al}`:' nell’intervallo richiesto';
 return `Corsia${numero} già prenotata${fascia}. Scegli un’altra corsia o modifica l’orario.`;
}
export default async function ModulePage({params,searchParams}:{params:Promise<{modulo:string}>;searchParams:Promise<{q?:string;msg?:string;p?:string;corsia?:string;inizio?:string;fine?:string;edit?:string;editor?:string;stato?:string;f?:string;v?:string;ordine?:string;dir?:string;filtro_modulo?:string;dal?:string;al?:string;persona?:string;nuovo?:string;pm?:string;stagione?:string;edizione?:string;livello?:string;piscina?:string;corsia_id?:string;lezione?:string;archivio?:string}>}){
 const {modulo}=await params;
 if(!isModuleKey(modulo))notFound();
 if(modulo==='pagamenti')redirect('/gestionale/incassi');
 const module:Module=modules[modulo];
 const {supabase,user}=await requireStaff();
 const {data:isAdministrator}=await supabase.rpc('is_admin');
 if(module.adminOnly){
  const {data}=await supabase.from('ruoli_utente').select('ruolo').eq('utente_id',user.id).eq('ruolo','amministratore').maybeSingle();
  if(!data)redirect('/gestionale?msg=permessi');
 }
 const {q='',msg='',p='1',corsia,inizio,fine,edit,stato,f,v,ordine,dir,filtro_modulo,dal:rawDal,al:rawAl,persona,nuovo,stagione:rawSeason}=singleSearchParams(await searchParams);
 const seasonId=rawSeason&&UUID_RE.test(rawSeason)&&module.fields.some(f=>f.name==='stagione_id')?rawSeason:'';
 const today=romeDay(new Date().toISOString()),dal=dateFilter(rawDal),al=dateFilter(rawAl);
 const personId=persona&&UUID_RE.test(persona)?persona:'';
 const personField=module.fields.some(f=>f.name==='persona_id');
 const editionId=(singleSearchParams(await searchParams)).edizione;
 const catalogLevel=modulo==='corsi'?validLevel((singleSearchParams(await searchParams)).livello):null;
 const scope=singleSearchParams(await searchParams);
 const listHref=(filters:Parameters<typeof moduleListHref>[0])=>moduleListHref(modulo==='certificati'&&scope.archivio==='1'?{...filters,archivio:'1'}:filters);
 const calendarModule=['corsie','prenotazioni','calendario'].includes(modulo);
 const teachingModule=['corsi','edizioni','programmi','versioni','istruttori','qualifiche','brevetti','presenze'].includes(modulo);
 const financeModule=['quote','addebiti','pagamenti','listino','contabilita'].includes(modulo);
 const scopedPool=calendarModule&&scope.piscina&&UUID_RE.test(scope.piscina)?scope.piscina:'';
 const scopedLane=modulo==='prenotazioni'&&scope.corsia_id&&UUID_RE.test(scope.corsia_id)?scope.corsia_id:'';
 const scopedLesson=modulo==='prenotazioni'&&scope.lezione&&UUID_RE.test(scope.lezione)?scope.lezione:'';
 const scopedEdition=editionId&&UUID_RE.test(editionId)&&module.fields.some(f=>f.name==='edizione_id')?editionId:'';
 const dateColumn=modulo==='attrezzature'?'prossima_revisione':['certificati','tesseramenti','brevetti'].includes(modulo)?'scade_il':null;
 const ui=moduleUi[modulo];
 const feedback=msg==='corsia_occupata'&&modulo==='prenotazioni'?bookingConflictText(corsia,inizio,fine):Object.hasOwn(status,msg)?status[msg]:undefined;
 const editId=edit&&UUID_RE.test(edit)?edit:null;
 const editorId=scope.editor&&UUID_RE.test(scope.editor)?scope.editor:null;
 const openEditorId=editId??editorId;
 // Limit this first pass to modules with simple reference labels and no dependent eligibility rules.
 const deferredReferences=['qualifiche','brevetti','certificati','quote'].includes(modulo);
 const fullReferenceOptions=!deferredReferences||nuovo==='1'||Boolean(openEditorId);
 if(modulo==='calendario'&&editId)redirect(`/gestionale/calendario-visivo/${editId}`);
 if(modulo==='calendario'&&nuovo==='1')redirect('/gestionale/calendario-visivo?nuovo=1'+(scopedPool?'&piscina='+scopedPool:'')+(scopedEdition?'&edizione='+scopedEdition:''));
 if(modulo==='certificati'&&scope.archivio!=='1'&&!openEditorId&&nuovo!=='1'&&!personId)return <MedicalRegister supabase={supabase} params={scope}/>;
 const page=editId?1:pageNumber(p);
 const perPage=30;
 const personViews=new Set(['adesioni', 'iscrizioni_corsi', 'assegnazioni_istruttori', 'qualifiche_istruttori', 'brevetti_allievi', 'certificati_medici', 'presenze', 'assegnazioni_attrezzature', 'quote_associative', 'saldi_quote', 'saldi_corsi', 'tesseramenti', 'addebiti_corsi']);
 const personSorted=personViews.has(module.table);
 const medical=modulo==='certificati';
 const missingQuery=medical&&!editId&&!dal&&!al&&(!stato||stato==='mancante')?supabase.from('allievi_senza_certificato').select('id,nome,cognome',{count:'exact'}):null;
 if(missingQuery&&personId)missingQuery.eq('id',personId);
 const medicalSearch=searchTerms(q)[0]??'';
 const missingFiltered=missingQuery&&medicalSearch?missingQuery.or(`cognome.ilike.%${medicalSearch}%,nome.ilike.%${medicalSearch}%`):missingQuery;
 if(missingFiltered)for(const term of searchTerms(q).slice(1))missingFiltered.or('cognome.ilike.%'+term+'%,nome.ilike.%'+term+'%');
 const missingPage=pageNumber((singleSearchParams(await searchParams)).pm);
 const missingPagePromise=missingFiltered?Promise.resolve(missingFiltered.order('cognome').order('nome').order('id').range((missingPage-1)*perPage,missingPage*perPage-1)):Promise.resolve(null);
 const missingCountQuery=medical&&!dal&&!al?supabase.from('allievi_senza_certificato').select('id',{head:true,count:'exact'}):null;
 if(missingCountQuery&&personId)missingCountQuery.eq('id',personId);
 if(missingCountQuery)for(const term of searchTerms(q))missingCountQuery.or('cognome.ilike.%'+term+'%,nome.ilike.%'+term+'%');
 const [senzaFile,missingTotal]=await Promise.all([missingPagePromise,missingCountQuery??Promise.resolve(null)]);
 const filtri=medical?await Promise.all(Object.entries(statiCertificato).map(async ([k,label])=>{let filterQuery=supabase.from('stato_certificati').select('id',{head:true,count:'exact'}).eq('stato_certificato',k==='in_scadenza'?'valido':k);if(k==='in_scadenza')filterQuery=filterQuery.gte('scade_il',today).lte('scade_il',shiftDay(today,30));if(k==='valido')filterQuery=filterQuery.gt('scade_il',shiftDay(today,30));if(personId)filterQuery=filterQuery.eq('persona_id',personId);if(dal)filterQuery=filterQuery.gte('scade_il',dal);if(al)filterQuery=filterQuery.lte('scade_il',al);for(const term of searchTerms(q))filterQuery=filterQuery.or('sort_cognome.ilike.%'+term+'%,sort_nome.ilike.%'+term+'%');const {count,error}=await filterQuery;return {k,label,n:error||(k==='mancante'&&missingTotal?.error)?'—':(count??0)+(k==='mancante'?(missingTotal?.count??0):0)};})):[];
 let query=supabase.from(medical?'stato_certificati':personSorted?`gest_elenco_${module.table}`:module.table).select(modulo==='prenotazioni'?'*,corsie!inner(piscina_id)':'*',{count:'exact'});
 if(!editId&&scopedPool)query=query.eq(modulo==='prenotazioni'?'corsie.piscina_id':'piscina_id',scopedPool);
 if(!editId&&scopedLane)query=query.eq('corsia_id',scopedLane);
 if(!editId&&scopedLesson)query=query.eq('lezione_id',scopedLesson);
 if(!editId&&modulo==='prenotazioni'&&dal)query=query.gt('fine',dayBounds(dal).from);
 if(!editId&&modulo==='prenotazioni'&&al)query=query.lt('inizio',dayBounds(al).to);
 if(!editId&&medical&&stato&&Object.hasOwn(statiCertificato,stato))query=query.eq('stato_certificato',stato==='in_scadenza'?'valido':stato);
 if(!editId&&medical&&stato==='in_scadenza')query=query.gte('scade_il',today).lte('scade_il',shiftDay(today,30));
 if(!editId&&medical&&stato==='valido')query=query.gt('scade_il',shiftDay(today,30));
 if(!editId&&dateColumn&&dal)query=query.gte(dateColumn,dal);
 if(!editId&&dateColumn&&al)query=query.lte(dateColumn,al);
 if(!editId&&personId&&personField)query=query.eq('persona_id',personId);
 if(!editId&&seasonId)query=query.eq('stagione_id',seasonId);
 if(!editId&&scopedEdition)query=query.eq('edizione_id',scopedEdition);
 if(!editId&&catalogLevel!==null)query=query.eq('livello',catalogLevel);
 let scopeError=modulo==='prenotazioni'&&Boolean(dal&&al&&dal>al);
 if(!editId&&personId&&modulo==='tesseramenti'){const ids=await tutteLePagine((da,a)=>supabase.from('adesioni').select('id').eq('persona_id',personId).order('id').range(da,a));scopeError=Boolean(ids.error);const keys=(ids.data??[]).map(x=>x.id);query=keys.length?query.in('adesione_id',keys):query.eq('id','00000000-0000-0000-0000-000000000000');}
 const selectableFilters=module.fields.filter(field=>field.type==='select'&&field.options?.length&&(!medical||field.name!=='esito_verifica'));
 const [filterName,filterValue]=filtro_modulo?.split(':',2)??[f??'',v??''];
 const selectedFilter=selectableFilters.find(field=>field.name===filterName&&field.options?.includes(filterValue));
 if(!editId&&selectedFilter&&filterValue)query=query.eq(selectedFilter.name,filterValue);
 const safeSearch=editId?'':cleanSearch(q);
 const textFields=personSorted||medical?['sort_cognome','sort_nome']:ui.fields;
 if(safeSearch&&textFields.length){const terms=personSorted||medical||modulo==='anagrafiche'?searchTerms(q):[safeSearch];for(const term of terms)query=query.or(textFields.map(field=>field+'.ilike.%'+term+'%').join(','));}
 if(editId)query=query.eq('id',editId);
 const primary=personSorted||medical?'sort_cognome':module.table==='persone'?'cognome':module.fields.find(f=>['nome','titolo','codice','tipo'].includes(f.name))?.name??module.order??'id';
 const sortable=module.fields.filter(field=>module.columns.includes(field.name)&&field.type!=='reference'&&field.type!=='textarea'&&field.type!=='days');
 const selectedSort=sortable.find(field=>field.name===ordine)?.name;
 query=query.order(selectedSort??primary,{ascending:dir!=='desc',nullsFirst:false});
 if((personSorted||medical||module.table==='persone')&&!selectedSort)query=query.order(personSorted||medical?'sort_nome':'nome',{ascending:dir!=='desc'});
 const result=await query.order('id',{ascending:true}).range((page-1)*perPage,page*perPage-1);
 const {error,count}=result;const data=result.data as unknown as Row[]|null;
 const refs=[...new Set([...module.fields.map(f=>f.ref?.table).filter((v):v is string=>Boolean(v)),...(modulo==='prenotazioni'?['piscine']:[])])];
 const references:Record<string,Row[]>={};
 let referenceError=false;
 let enrollmentLoadError=false;
 await Promise.all(refs.map(async table=>{
  if(modulo==='addebiti'&&table==='iscrizioni_corsi'){
   const columns='id,stato,edizione_id,edizione:edizioni_corsi!inner(id,nome,stato,stagione:stagioni!inner(nome,attiva)),persona:persone!inner(nome,cognome)';
   type Enroll={id:string;stato:string;edizione_id:string;edizione:{nome:string;stato:string;stagione:{nome:string;attiva:boolean}};persona:{nome:string;cognome:string}};
   const active:Enroll[]=[];
   // Pagina per non perdere le opzioni oltre il limite predefinito di PostgREST.
   for(let offset=0;;){
    const {data:entries,error:entriesError}=await supabase.from('iscrizioni_corsi').select(columns).eq('stato','iscritto').eq('edizione.stato','attivo').eq('edizione.stagione.attiva',true).order('id').range(offset,offset+499);
    if(entriesError){enrollmentLoadError=true;active.length=0;break;}
    const batch=(entries??[]) as unknown as Enroll[];
    active.push(...batch);if(batch.length<500)break;offset+=batch.length;
   }
   const existingIds=[...new Set((data??[]).map(row=>String(row.iscrizione_id??'')).filter(Boolean))];
   const activeIds=new Set(active.map(r=>r.id));
   const missing=existingIds.filter(id=>!activeIds.has(id));
   const historical=missing.length?await supabase.from('iscrizioni_corsi').select(columns).in('id',missing):{data:[],error:null};
   if(historical.error)enrollmentLoadError=true;
   const map=(r:Enroll,selectable:boolean):Row=>{
    const allievo=`${r.persona.cognome} ${r.persona.nome}`.trim(),gruppo=`${r.edizione.nome} · ${r.edizione.stagione.nome}`;
    return {id:r.id,edizione_id:r.edizione_id,gruppo,allievo,etichetta:`${gruppo} — ${allievo}${selectable?'':' (storico)'}`,selezionabile:selectable};
   };
   references[table]=[...active.map(r=>map(r,true)),...((historical.data??[]) as unknown as Enroll[]).map(r=>map(r,false))];return;
  }
  if(modulo==='tesseramenti'&&table==='adesioni'){
   const rows:Row[]=[];const currentIds=[...new Set((data??[]).map(r=>String(r.adesione_id??'')).filter(Boolean))];
   const columns='id,sort_cognome,sort_nome,stagione_id';
   const members:{id:string;sort_cognome:string|null;sort_nome:string|null;stagione_id:string}[]=[];
   const seasons:{id:string;nome:string}[]=[];
   await Promise.all([
    (async()=>{for(let offset=0;;offset+=500){const {data:batch,error}=await supabase.from('gest_elenco_adesioni').select(columns).order('sort_cognome').order('sort_nome').order('id').range(offset,offset+499);if(error){referenceError=true;break;}members.push(...(batch??[]));if((batch??[]).length<500)break;}})(),
    (async()=>{for(let offset=0;;offset+=500){const {data:batch,error}=await supabase.from('stagioni').select('id,nome').order('id').range(offset,offset+499);if(error){referenceError=true;break;}seasons.push(...(batch??[]));if((batch??[]).length<500)break;}})()
   ]);
   const memberIds=new Set(members.map(r=>r.id));
   const seasonNames=new Map(seasons.map(s=>[s.id,s.nome]));
   const missing=currentIds.filter(id=>!memberIds.has(id));
   const {data:extra,error:extraError}=missing.length?await supabase.from('gest_elenco_adesioni').select(columns).in('id',missing):{data:[],error:null};if(extraError)referenceError=true;
   for(const a of [...members,...(extra??[])])rows.push({id:a.id,etichetta:`${a.sort_cognome??''} ${a.sort_nome??''} · ${seasonNames.get(a.stagione_id)??'Stagione'}`});
   references[table]=rows.sort((a,b)=>String(a.etichetta).localeCompare(String(b.etichetta),'it'));return;
  }
  const ref=module.fields.find(f=>f.ref?.table===table)?.ref;
  const cols=[...new Set(['id',...(ref?.labels??[]),...(modulo==='prenotazioni'&&table==='corsie'?['numero','piscina_id','note']:[]),...(modulo==='prenotazioni'&&table==='lezioni'?['titolo','edizione_id','inizio','fine','piscina_id','annullata_il']:[]),...(modulo==='prenotazioni'&&table==='piscine'?['nome','orari_disponibili','limitazioni']:[]),...(modulo==='iscrizioni'&&table==='edizioni_corsi'?['stagione_id','stato','direttore_id']:[])])].join(',');
  if(!fullReferenceOptions&&table!=='stagioni'){
   // The list needs only visible row labels. Season options remain complete for filtering.
   const keys=module.fields.filter(field=>field.ref?.table===table).map(field=>field.name);
   const ids=[...new Set((data??[]).flatMap(row=>keys.map(key=>String(row[key]??''))).filter(id=>UUID_RE.test(id)))];
   const result=ids.length?await supabase.from(table).select(cols).in('id',ids):{data:[],error:null};
   if(result.error)referenceError=true;
   references[table]=(result.data??[]) as unknown as Row[];
   return;
  }
  const refOrder=ref?.labels?.[0]??(table==='piscine'?'nome':'id');
  const refQuery=()=>{
   let query=supabase.from(table).select(cols).order(refOrder,{ascending:true});
   if(table==='persone')query=query.order('nome',{ascending:true});
   return query.order('id');
  };
  let selected:Row[]=[];
  for(let offset=0;;offset+=500){const {data:batch,error:refError}=await refQuery().range(offset,offset+499);if(refError){referenceError=true;break;}selected.push(...((batch??[]) as unknown as Row[]));if((batch??[]).length<500)break;}
  const currentKeys=module.fields.filter(f=>f.ref?.table===table).map(f=>f.name);
  const selectedIds=new Set(selected.map(r=>r.id));
  const missingIds=[...new Set((data??[]).flatMap(row=>currentKeys.map(k=>String(row[k]??''))).filter(id=>id&&!selectedIds.has(id)))];
  if(missingIds.length){const {data:extra,error:extraError}=await supabase.from(table).select(cols).in('id',missingIds);if(extraError)referenceError=true;selected.push(...((extra??[]) as unknown as Row[]));}
  selected.sort((a,b)=>labelOf(a,ref?.labels??['id']).localeCompare(labelOf(b,ref?.labels??['id']),'it'));
  if(modulo==='istruttori'&&table==='persone'){
   const ids=new Set<string>();for(let offset=0;;offset+=500){const {data:batch,error}=await supabase.from('qualifiche_istruttori').select('persona_id').order('id').range(offset,offset+499);if(error){referenceError=true;break;}for(const entry of batch??[])ids.add(entry.persona_id);if((batch??[]).length<500)break;}
   selected=selected.filter(person=>ids.has(person.id));
  }
  if(modulo==='adesioni'&&table==='cda_verbali'){
   const ids=new Set<string>();for(let offset=0;;offset+=500){const {data:batch,error}=await supabase.from('cda_verbali').select('id').eq('stato','approvato').in('tipo',['Approvazione Adesioni Soci','Misto']).order('id').range(offset,offset+499);if(error){referenceError=true;break;}for(const entry of batch??[])ids.add(entry.id);if((batch??[]).length<500)break;}selected=selected.filter(row=>ids.has(row.id));
  }
  references[table]=selected;
 }));
 if(modulo==='iscrizioni'){
  const eligible:Row[]=[];
  for(let offset=0;;offset+=500){const {data:batch,error:loadError}=await supabase.from('gest_soci_iscrivibili').select('persona_id,stagione_id,nome,cognome').order('cognome').order('nome').order('persona_id').order('stagione_id').range(offset,offset+499);if(loadError){eligible.length=0;enrollmentLoadError=true;break;}eligible.push(...(batch??[]).map(r=>({...r,id:r.persona_id})));if((batch??[]).length<500)break;}
  const qualificati=new Set<string>();
  for(let offset=0;;offset+=500){const {data:batch,error:loadError}=await supabase.from('qualifiche_istruttori').select('persona_id').order('id').range(offset,offset+499);if(loadError){enrollmentLoadError=true;break;}for(const row of batch??[])qualificati.add(row.persona_id);if((batch??[]).length<500)break;}
  references.gest_soci_iscrivibili=eligible.map(row=>({...row,isInstructor:qualificati.has(String(row.persona_id))}));
  const available:Row[]=[];for(let offset=0;;offset+=500){const {data:batch,error:loadError}=await supabase.from('edizioni_corsi').select('id,nome,stagione_id,stato,direttore_id').in('stato',['programmato','attivo']).order('nome').order('id').range(offset,offset+499);if(loadError){available.length=0;enrollmentLoadError=true;break;}available.push(...((batch??[]) as Row[]));if((batch??[]).length<500)break;}
  const courseAssignments=new Map<string,string[]>(),courseEnrollments=new Map<string,string[]>();
  for(const [table,map] of [['assegnazioni_istruttori',courseAssignments],['iscrizioni_corsi',courseEnrollments]] as const){
   for(let offset=0;;offset+=500){const {data:batch,error:loadError}=await supabase.from(table).select('edizione_id,persona_id').order('id').range(offset,offset+499);if(loadError){enrollmentLoadError=true;break;}for(const row of batch??[]){const values=map.get(row.edizione_id)??[];values.push(row.persona_id);map.set(row.edizione_id,values);}if((batch??[]).length<500)break;}
  }
  if(enrollmentLoadError)references.gest_soci_iscrivibili=[];
  const existing=references.edizioni_corsi??[];references.edizioni_corsi=[...available.map(row=>({...row,assignedIds:courseAssignments.get(row.id)??[],enrolledIds:courseEnrollments.get(row.id)??[]})),...existing.filter(r=>!available.some(e=>e.id===r.id)&&!['programmato','attivo'].includes(String(r.stato)))];
 }
 if(modulo==='prenotazioni'){
  const pools=references.piscine??[];
  for(const lane of references.corsie??[])lane.calendar_label=(pools.find(p=>p.id===lane.piscina_id)?.nome??'Piscina non disponibile')+' · Corsia '+lane.numero;
  for(const lesson of references.lezioni??[])lesson.calendar_label=String(lesson.titolo)+' · '+formatRome(String(lesson.inizio))+(lesson.annullata_il?' · Annullata':'');
 }
 const rows=(data??[]) as unknown as Row[];
 const href=(page:number)=>listHref({q,p:String(page),stato,dal,al,persona:personId,stagione:seasonId,edizione:scopedEdition,piscina:scopedPool,corsia_id:scopedLane,lezione:scopedLesson,livello:catalogLevel===null?undefined:String(catalogLevel),vista:modulo==='iscrizioni'?'elenco':undefined,filtro_modulo:selectedFilter?selectedFilter.name+':'+filterValue:undefined,ordine,dir});
 const createHref=()=>{
  const params=new URLSearchParams(href(page).slice(1));
  params.set('nuovo','1');
  if(medical&&missingPage>1)params.set('pm',String(missingPage));
  return '?'+params.toString();
 };
 const editorHref=(id:string)=>{
  const params=new URLSearchParams(href(page).slice(1));
  params.set('editor',id);
  if(medical&&missingPage>1)params.set('pm',String(missingPage));
  return '?'+params.toString();
 };
 const referenceIndex=new Map(Object.entries(references).map(([table,entries])=>[table,new Map(entries.map(row=>[row.id,row]))]));
 const numeric=(c:string)=>module.fields.some(field=>field.name===c&&field.type==='number');
 const display=(row:Row,c:string)=>{
  if(medical&&c==='documento_id')return row[c]?<Link href={'/documenti/'+row[c]}>Apri certificato</Link>:<Link href={'/area-personale/certificato?persona='+row.persona_id}>Carica certificato</Link>;
  if(medical&&c==='stato_certificato'){const value=row[c]==='valido'&&String(row.scade_il)>=today&&String(row.scade_il)<=shiftDay(today,30)?'in_scadenza':String(row[c]);return <StatusBadge tone={tone(value)}>{statoSingolo(value)}</StatusBadge>;}
  const field=module.fields.find(field=>field.name===c);
  const reference=typeof row[c]==='string'?referenceIndex.get(field?.ref?.table??'')?.get(row[c] as string):undefined;
  if(reference&&modulo==='prenotazioni'&&c==='lezione_id')return <Link href={'/gestionale/calendario-visivo/'+reference.id}>{labelOf(reference,field?.ref?.labels??['id'])}</Link>;
  if(reference&&modulo==='prenotazioni'&&c==='corsia_id')return <Link href={'/gestionale/moduli/corsie?edit='+reference.id}>{labelOf(reference,field?.ref?.labels??['id'])}</Link>;
  if(reference&&modulo==='corsie'&&c==='piscina_id')return <Link href={'/gestionale/moduli/piscine?edit='+reference.id}>{labelOf(reference,field?.ref?.labels??['id'])}</Link>;
  if(reference)return c==='persona_id'?<Link href={'/gestionale/soci/'+reference.id}>{labelOf(reference,field?.ref?.labels??['id'])}</Link>:labelOf(reference,field?.ref?.labels??['id']);
  if(c==='persona_id'&&row.sort_cognome)return <Link href={'/gestionale/soci/'+row[c]}>{String(row.sort_cognome)+' '+String(row.sort_nome??'')}</Link>;
  if(c.endsWith('_id'))return row[c]?'Informazione collegata non disponibile':'—';
  if(c==='stato')return <StatusBadge tone={tone(row[c])}>{String(row[c]??'Non disponibile').replaceAll('_',' ')}</StatusBadge>;
  if(modulo==='tesseramenti'&&c==='scade_il'){const date=String(row[c]??'');return <div>{formatValue(row[c],c)}<div><StatusBadge tone={date===''?'neutral':date<today?'danger':date<=shiftDay(today,30)?'warning':'success'}>{date===''?'Non indicata':date<today?'Scaduta':date<=shiftDay(today,30)?'In scadenza':'Non scaduta'}</StatusBadge></div></div>;}
  return formatValue(row[c],c);
 };
 return <>
 <PageHeader eyebrow={secretariatLinks.some(l=>l.href==='/gestionale/moduli/'+modulo)?'Segreteria':calendarModule?'Impianti e calendario':teachingModule?'Corsi e didattica':financeModule?'Contabilità e incassi':'Gestionale'} area={secretariatLinks.some(l=>l.href==='/gestionale/moduli/'+modulo)?'secretariat':calendarModule?'pool':teachingModule?'teaching':financeModule?'finance':'system'} icon={calendarModule?'calendar':teachingModule?'course':financeModule?'wallet':'archive'} marine title={module.label} description={module.description} actions={!editId&&(modulo==='calendario'?<ButtonLink href={'/gestionale/calendario-visivo?nuovo=1'+(scopedPool?'&piscina='+scopedPool:'')+(scopedEdition?'&edizione='+scopedEdition:'')}>Nuova lezione</ButtonLink>:deferredReferences&&!fullReferenceOptions?<DeferredEditorButton primary href={createHref()} label={ui.create}/>:<Drawer primary title={ui.create} trigger={ui.create} initialOpen={nuovo==='1'&&!msg}><Editor module={module} moduleKey={modulo} references={references} personId={personId} editionId={scopedEdition} poolId={scopedPool} laneId={scopedLane} lessonId={scopedLesson}/></Drawer>)}/>
 {secretariatLinks.some(l=>l.href==='/gestionale/moduli/'+modulo)&&<SecretariatNav active={'/gestionale/moduli/'+modulo}/>}
 {personId&&memberTabForModule(modulo)&&<div className="sc-row-actions"><Link className="sc-button sc-button-secondary" href={'/gestionale/soci/'+personId+'?tab='+memberTabForModule(modulo)}>Torna alla scheda socio</Link><span className="muted">Elenco contestuale alla scheda selezionata</span></div>}
 {scopedEdition&&<p><Link href={'/gestionale/corsi/'+scopedEdition+'?tab='+(modulo==='brevetti'?'brevetti':'panoramica')}>Torna alla scheda del corso</Link> · Elenco per edizione selezionata</p>}
 {teachingModule&&!secretariatLinks.some(l=>l.href==='/gestionale/moduli/'+modulo)&&<nav className="sc-row-actions" aria-label="Archivi didattici"><ButtonLink variant="secondary" href="/gestionale/corsi">Edizioni dei corsi</ButtonLink><ButtonLink variant="secondary" href="/gestionale/programmi-didattici">Archivio moduli didattici</ButtonLink>{modulo!=='programmi'&&<ButtonLink variant="secondary" href="/gestionale/moduli/programmi">Programmi</ButtonLink>}{modulo!=='versioni'&&<ButtonLink variant="secondary" href="/gestionale/moduli/versioni">Versioni dei programmi</ButtonLink>}</nav>}
 {calendarModule&&<div className="sc-row-actions"><Link href={'/gestionale/calendario-visivo'+(scopedPool?'?piscina='+scopedPool:'')}>Torna al calendario</Link>{scopedPool&&<Link href={'/gestionale/moduli/piscine?edit='+scopedPool}>Scheda piscina</Link>}{scopedLesson&&<Link href={'/gestionale/calendario-visivo/'+scopedLesson}>Scheda lezione</Link>}</div>}
 {modulo==='prenotazioni'&&<Alert tone="info">Gli orari sono italiani. L’assenza di prenotazioni non certifica la disponibilità contrattuale; il database verifica piscina, intervallo, stato della lezione e sovrapposizioni.</Alert>}
 {scopeError&&<p role="alert" className="notice error">{modulo==='prenotazioni'?'Intervallo date non valido.':'Non è stato possibile leggere le adesioni collegate. Elenco non disponibile.'}</p>}
 {feedback&&<p className={'notice '+(['salvato','eliminato'].includes(msg)?'success':'warning')} role="status">{feedback}</p>}
 {enrollmentLoadError&&<p className="notice error">Impossibile caricare tutte le iscrizioni dei corsi. Riprova o verifica i permessi.</p>}
 {referenceError&&<p className="notice warning" role="alert">Alcuni elenchi di scelta non sono completi. Ricarica la pagina prima di modificare i collegamenti.</p>}
 {medical&&<p><Link className="button ghost" href="/gestionale/moduli/certificati">Torna al registro iscritti</Link></p>}
 {medical&&<nav className="buttons" aria-label="Filtri certificati"><Link className="button ghost" href={listHref({q,ordine,dir,persona:personId,dal,al})}>Tutti</Link>{filtri.map(item=><Link key={item.k} aria-current={stato===item.k?'page':undefined} className={stato===item.k?'button':'button ghost'} href={listHref({q,stato:item.k,ordine,dir,persona:personId,dal,al})}>{item.label} ({item.n})</Link>)}</nav>}
 {missingQuery&&<section className="panel"><h3>Allievi senza certificato registrato</h3>{senzaFile?.error?<p role="alert">Elenco non disponibile.</p>:<><p>{senzaFile?.count??0} allievi senza certificato con questi filtri</p><ul>{senzaFile?.data?.map(p=><li key={p.id}>{p.cognome} {p.nome} · Documento mancante · <Link href={'/area-personale/certificato?persona='+p.id}>Carica certificato</Link></li>)}</ul><Pagination page={missingPage} size={perPage} count={senzaFile?.count??null} label="allievi" href={pm=>listHref({q,stato,persona:personId,p:String(page),pm:String(pm),ordine,dir})}/></>}</section>}
 <FilterBar>
 <SearchBar query={q} placeholder={ui.search||'Filtri e ordinamento'} resetHref={'/gestionale/moduli/'+modulo} hideSearch={!ui.search}>
 {medical&&scope.archivio==='1'&&<input type="hidden" name="archivio" value="1"/>}{scopedEdition&&<input type="hidden" name="edizione" value={scopedEdition}/>} {modulo==='corsi'&&<label>Livello ARA<select name="livello" defaultValue={catalogLevel??''}><option value="">Tutti</option>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></label>} {modulo==='iscrizioni'&&<input type="hidden" name="vista" value="elenco"/>}{medical&&stato&&<input type="hidden" name="stato" value={stato}/>} {personId&&memberTabForModule(modulo)&&<input type="hidden" name="persona" value={personId}/>} {module.fields.some(f=>f.name==='stagione_id')&&<label>Stagione<select name="stagione" defaultValue={seasonId}><option value="">Tutte</option>{(references.stagioni??[]).map(s=><option key={s.id} value={s.id}>{String(s.nome??'Stagione')}</option>)}</select></label>}{dateColumn&&<><label>Scadenza dal<input type="date" name="dal" defaultValue={dal}/></label><label>Scadenza al<input type="date" name="al" defaultValue={al}/></label></>}
 {calendarModule&&<label>Piscina<select name="piscina" defaultValue={scopedPool}><option value="">Tutte</option>{(references.piscine??[]).map(r=><option key={r.id} value={r.id}>{String(r.nome)}</option>)}{scopedPool&&!references.piscine?.some(r=>r.id===scopedPool)&&<option value={scopedPool}>Piscina non disponibile</option>}</select></label>}
 {modulo==='prenotazioni'&&<><label>Corsia<select name="corsia_id" defaultValue={scopedLane}><option value="">Tutte</option>{(references.corsie??[]).map(r=><option key={r.id} value={r.id}>{String(r.calendar_label)}</option>)}</select></label><label>Lezione<select name="lezione" defaultValue={scopedLesson}><option value="">Tutte</option>{(references.lezioni??[]).map(r=><option key={r.id} value={r.id}>{String(r.calendar_label)}</option>)}</select></label><label>Dal<input name="dal" type="date" defaultValue={dal}/></label><label>Al<input name="al" type="date" defaultValue={al}/></label></>}
 {selectableFilters.length>0&&<label>Filtra per<select name="filtro_modulo" defaultValue={selectedFilter?selectedFilter.name+':'+filterValue:''}><option value="">Tutti</option>{selectableFilters.map(field=><optgroup key={field.name} label={field.label}>{field.options?.map(value=><option key={value} value={field.name+':'+value}>{value.replaceAll('_',' ')}</option>)}</optgroup>)}</select></label>}
 <label>Ordina per<select name="ordine" defaultValue={selectedSort??''}><option value="">Ordine predefinito</option>{sortable.map(field=><option key={field.name} value={field.name}>{field.label}</option>)}</select></label>
 <label>Direzione<select name="dir" defaultValue={dir==='desc'?'desc':'asc'}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
 </SearchBar>
 <a className="button ghost" href={'/gestionale/esporta/'+modulo}>Esporta archivio CSV</a>
 </FilterBar>
 {editId&&<p><Link href={href(1)}>Torna all’elenco completo</Link></p>}
 {error||scopeError?<div className="notice error" role="alert">Impossibile leggere i dati. Riprova o contatta l’amministratore.</div>:<DataTable label={module.label} mobileCards><thead role="rowgroup"><tr role="row">
 {module.columns.map(c=><th key={c} role="columnheader" scope="col" className={numeric(c)?'sc-number':undefined}>{columnLabel(c,module)}</th>)}
 {!module.appendOnly&&<th role="columnheader" scope="col">Azioni</th>}
 </tr></thead><tbody role="rowgroup">{rows.map(row=><tr key={row.id} role="row">
 {module.columns.map(c=><td key={c} role="cell" data-label={columnLabel(c,module)} className={numeric(c)?'sc-number':undefined}>{modulo==='anagrafiche'&&c==='codice_fiscale'?maskedFiscalCode(typeof row[c]==='string'?row[c]:null):modulo==='anagrafiche'&&['nome','cognome'].includes(c)?displayName(typeof row[c]==='string'?row[c]:null):display(row,c)}</td>)}
 {!module.appendOnly&&<td role="cell" data-label="Azioni"><div className="sc-row-actions">{modulo==='anagrafiche'&&<Link href={'/gestionale/soci/'+row.id}>Apri scheda</Link>}{modulo==='corsie'&&<Link href={'/gestionale/moduli/prenotazioni?corsia_id='+row.id+'&piscina='+row.piscina_id}>Prenotazioni corsia</Link>}{modulo==='calendario'?<Link href={'/gestionale/calendario-visivo/'+row.id}>Modifica lezione e corsie</Link>:openEditorId===row.id?<Drawer key={row.id+'-'+msg} title={'Modifica '+entityLabel(modulo)+' · '+rowLabel(row,references,module)} trigger={modulo==='versioni'&&['approvato','archiviato'].includes(String(row.stato))?'Consulta versione':'Modifica'} initialOpen={msg!=='salvato'&&openEditorId===row.id}><Editor module={module} moduleKey={modulo} record={row} references={references} admin={isAdministrator===true} personId={personId} poolId={scopedPool} laneId={scopedLane} lessonId={scopedLesson}/></Drawer>:<DeferredEditorButton href={editorHref(row.id)} label={modulo==='versioni'&&['approvato','archiviato'].includes(String(row.stato))?'Consulta versione':'Modifica'}/>}</div></td>}
 </tr>)}
 {!rows.length&&<tr><td colSpan={module.columns.length+(module.appendOnly?0:1)} className="empty-cell">Nessun risultato con questi filtri.</td></tr>}
 </tbody></DataTable>}
 {!editId&&<Pagination page={page} size={perPage} count={error||scopeError?null:count} href={href} label={medical?'certificati registrati':'risultati'}/>}
 </>;
}
