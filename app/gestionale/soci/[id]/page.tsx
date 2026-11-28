import {Drawer} from '@/components/ui/Drawer';
import {PageHeader,StatusBadge,Alert,ButtonLink,MetricCard} from '@/components/ui/Primitives';
import {Pagination} from '@/components/ui/DataTable';
import {memberTab,memberTabs,statusTone,exactCount,displayName,isSecondaryMemberTab} from '@/lib/secretariat';
import {pageNumber,listHref,singleSearchParams} from '@/lib/module-ui';
import {tutteLePagine} from '@/lib/pagine';
import {romeDay,shiftDay} from '@/lib/calendar-tools';
import RemoveRecord from '@/components/RemoveRecord';
import CancelEditButton from '@/components/CancelEditButton';
import Cronologia from '@/components/Cronologia';
import EditForm from '@/components/EditForm';
import {statoSingolo} from '@/lib/certificati';
import {applicationLegalConfig} from '@/lib/application-config';
import {versioneImmagini,sceltaLabel,dataOra} from '@/lib/scelte';
import {consentStatus} from '@/lib/application-input';
import Link from 'next/link';
import {PersonAvatar} from '@/components/ui/Secretariat';
import {Icon} from '@/components/ui/Icon';
import {notFound} from 'next/navigation';
import {requireStaffForRender as requireStaff} from '@/lib/security';
import {formatValue} from '@/lib/format';
import CodiceFiscaleAssist from '@/components/CodiceFiscaleAssist';
import {updateMemberProfile,createMemberAdhesion,updateMemberEmergency,reviewIdentityCorrection} from '../actions';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Person={id:string;nome:string;cognome:string;data_nascita:string|null;luogo_nascita:string|null;codice_fiscale:string|null;indirizzo:string|null;cap:string|null;comune:string|null;email:string|null;telefono:string|null};
type Membership={id:string;stagione_id:string;stato:string;data_approvazione:string;note:string|null};
type Season={id:string;nome:string;attiva:boolean};
type Card={id:string;adesione_id:string;ente:string;numero_tessera:string|null;scade_il:string;stato:string};
type Payment={id:string;quota_id:string|null;addebito_corso_id:string|null;importo:number;data_pagamento:string;metodo:string};
type Balance={id:string;stagione_id:string;importo_dovuto:number;versato:number;residuo:number;stato:string};
type Enrollment={id:string;edizione_id:string;stato:string;iscritta_il:string};
type Edition={id:string;nome:string;corso_id:string;inizio:string;fine:string};
type Course={id:string;nome:string;tipo:string;livello:number|null};
type Cert={id:string;documento_id:string|null;stato_certificato:string;rilasciato_il:string;scade_il:string;idoneita_verificata:boolean};
type Patent={id:string;origine:string|null;stato_verifica:string;centro_rilascio:string|null;istruttore_esterno:string|null;edizione_id:string|null;rilasciato_da_nome:string|null;titolo:string;ente:string|null;numero_brevetto:string|null;ottenuto_il:string|null;scade_il:string|null};
type Qualification={id:string;titolo:string;ente:string|null;scade_il:string|null};
type Equipment={id:string;attrezzatura_id:string;assegnata_il:string;restituita_il:string|null};
type Document={id:string;nome:string;categoria:string;caricato_il:string};
type Guardian={minore_id:string;tutore_id:string;parentela:string};
const euro=(n:number|string|null|undefined)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n??0));
const statusLabel=(s:string)=>s.replaceAll('_',' ');
const statusMessage:Record<string,string>={emergenza_salvata:'Contatto di emergenza salvato.',rettifica_decisa:'Rettifica anagrafica elaborata.',elemento_salvato:'Modifiche salvate correttamente.',eliminato:'Elemento rimosso.',elimina_collegati:'Rimozione non consentita: il record è collegato ad altri dati o è protetto.',elimina_conferma:'Conferma la rimozione.',database:'Rimozione non riuscita. Controlla i permessi o contatta l’amministratore.',salvato:'Anagrafica aggiornata. La modifica è tracciata nel registro amministrativo.',
 adesione_creata:'Adesione registrata in stato «da perfezionare». Verificare separatamente quota e tesseramento.',
 cf:'Codice fiscale non coerente con i dati anagrafici, oppure comune/Stato di nascita non identificato. Verifica i dati e usa il CF ufficiale.', omocodia:'Omocodia: conferma la verifica documentale e indica la motivazione.', dati:'Alcuni dati non sono validi. Controlla la compilazione.',duplicato:'Esiste già un altro socio con questo codice fiscale.',
 adesione_esistente:'Per questa stagione esiste già un’adesione.',errore:'Operazione non riuscita. Controlla i dati e i permessi.'};
function dateState(value:string|null|undefined){
 if(!value)return {label:'Non indicata',kind:''};
 const target=new Date(`${value}T12:00:00Z`);
 const today=new Date();const now=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate(),12));
 const delta=Math.ceil((target.getTime()-now.getTime())/86400000);
 if(delta<0)return {label:'Scaduto',kind:'danger'};
 if(delta<=30)return {label:'In scadenza',kind:'warning'};
 return {label:'In corso di validità',kind:'success'};
}
function Section({id,title,href,children}:{id:string;title:string;href?:string;children:React.ReactNode}){
 return <section className="panel member-section" id={id}><div className="member-section-heading"><h2>{title}</h2>
 {href&&<Link href={href} className="member-mini-action">Apri gestione</Link>}</div>{children}</section>;
}
function None({children='Nessun elemento registrato.'}:{children?:React.ReactNode}){return <p className="muted tiny">{children}</p>;}

export default async function MemberDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{msg?:string;tab?:string;p?:string;p2?:string;modifica?:string}>}){
 const {id}=await params;
 const {msg,tab:rawTab,p,p2,modifica}=singleSearchParams(await searchParams);
 const tab=memberTab(rawTab??(msg==='salvato'?'anagrafica':msg==='adesione_creata'?'adesioni':undefined));
 const page=pageNumber(p),secondPage=pageNumber(p2),size=30;
 const overview=tab==='panoramica';
 const skip={data:[],error:null,count:null};
 const range=(key:string,secondary=false)=>{const current=tab===key?(secondary?secondPage:page):1;return [(current-1)*size,current*size-1] as const;};
 if(!uuid.test(id))notFound();
 const {supabase}=await requireStaff();
 const [{data:isAdmin},{data:personData,error:personError}]=await Promise.all([
  supabase.rpc('is_admin'),
  supabase.from('persone')
  .select('id,nome,cognome,data_nascita,luogo_nascita,codice_fiscale,indirizzo,cap,comune,email,telefono,provincia_nascita,stato_nascita,provincia_residenza,stato_residenza,sesso_cf,codice_catastale_nascita,cf_omocodia_verificata,cf_override_motivo').eq('id',id).maybeSingle()
 ]);
 if(personError)return <Alert tone="danger" announce>Impossibile leggere l’anagrafica. Riprova.</Alert>;
 if(!personData)notFound();
 const {data:accountLinks}=isAdmin===true&&['anagrafica','adesioni','famiglia'].includes(tab)?await supabase.from('collegamenti_persone').select('utente_id,relazione').eq('persona_id',id):{data:[]};
 const person=personData as unknown as (Person&{provincia_nascita:string|null;stato_nascita:string|null;provincia_residenza:string|null;stato_residenza:string|null;sesso_cf:string|null;codice_catastale_nascita:string|null;cf_omocodia_verificata:boolean;cf_override_motivo:string|null});
 const [seasonsResult,allMemberships,membershipResult,balanceResult,paymentResult,enrollmentResult,certResult,patentResult,qualificationResult,assignmentResult,documentResult,guardianResult,wardResult,equipmentResult,courseBalancesResult]=await Promise.all([
  supabase.from('stagioni').select('id,nome,attiva').order('dal',{ascending:false}),
  tutteLePagine((da,a)=>supabase.from('adesioni').select('id,stagione_id,stato,data_approvazione,note,verbale_cda_id').eq('persona_id',id).order('data_approvazione',{ascending:false}).order('id').range(da,a)),
  (tab==='adesioni')?supabase.from('adesioni').select('id,stagione_id,stato,data_approvazione,note,verbale_cda_id',{count:'exact'}).eq('persona_id',id).order('data_approvazione',{ascending:false}).order('id').range(...range('adesioni')):Promise.resolve(skip),
  (overview||tab==='pagamenti')?tutteLePagine((da,a)=>supabase.from('saldi_quote').select('id,stagione_id,importo_dovuto,versato,residuo,stato').eq('persona_id',id).order('id').range(da,a)):Promise.resolve(skip),
  (tab==='pagamenti')?supabase.from('pagamenti').select('id,quota_id,addebito_corso_id,importo,data_pagamento,metodo',{count:'exact'}).eq('persona_id',id).order('data_pagamento',{ascending:false}).order('id').range(...range('pagamenti')):Promise.resolve(skip),
  (overview||tab==='corsi')?supabase.from('iscrizioni_corsi').select('id,edizione_id,stato,iscritta_il',{count:'exact'}).eq('persona_id',id).order('iscritta_il',{ascending:false}).order('id').range(...range('corsi')):Promise.resolve(skip),
  (overview||tab==='certificati')?supabase.from('stato_certificati').select('id,rilasciato_il,scade_il,idoneita_verificata,documento_id,stato_certificato',{count:'exact'}).eq('persona_id',id).order('creato_il',{ascending:false}).order('id').range(...range('certificati')):Promise.resolve(skip),
  (overview||tab==='brevetti')?supabase.from('brevetti_allievi').select('id,titolo,ente,numero_brevetto,ottenuto_il,scade_il,rilasciato_da_nome,origine,stato_verifica,centro_rilascio,istruttore_esterno,edizione_id',{count:'exact'}).eq('persona_id',id).order('ottenuto_il',{ascending:false}).order('id').range(...range('brevetti')):Promise.resolve(skip),
  (tab==='istruttore')?supabase.from('qualifiche_istruttori').select('id,titolo,ente,scade_il',{count:'exact'}).eq('persona_id',id).order('id').range(...range('istruttore')):Promise.resolve(skip),
  (tab==='istruttore')?supabase.from('assegnazioni_istruttori').select('id,edizione_id,ruolo',{count:'exact'}).eq('persona_id',id).order('id').range(...range('istruttore',true)):Promise.resolve(skip),
  (overview||tab==='documenti')?supabase.from('documenti').select('id,nome,categoria,caricato_il',{count:'exact'}).eq('persona_id',id).order('caricato_il',{ascending:false}).order('id').range(...range('documenti')):Promise.resolve(skip),
  (tab==='famiglia')?supabase.from('relazioni_tutori').select('minore_id,tutore_id,parentela',{count:'exact'}).eq('minore_id',id).order('tutore_id').range(...range('famiglia')):Promise.resolve(skip),
  (tab==='famiglia')?supabase.from('relazioni_tutori').select('minore_id,tutore_id,parentela',{count:'exact'}).eq('tutore_id',id).order('minore_id').range(...range('famiglia',true)):Promise.resolve(skip),
  (tab==='attrezzature')?supabase.from('assegnazioni_attrezzature').select('id,attrezzatura_id,assegnata_il,restituita_il',{count:'exact'}).eq('persona_id',id).order('assegnata_il',{ascending:false}).order('id').range(...range('attrezzature')):Promise.resolve(skip),
  (overview||tab==='pagamenti')?tutteLePagine((da,a)=>supabase.from('saldi_corsi').select('id,edizione_id,stagione_id,importo_dovuto,versato,residuo,stato').eq('persona_id',id).order('id').range(da,a)):Promise.resolve(skip),
 ]);
 const seasonsData=seasonsResult.data,membershipsData=membershipResult.data,memberError=membershipResult.error||allMemberships.error||seasonsResult.error,balancesData=balanceResult.data,balanceError=balanceResult.error,paymentsData=paymentResult.data,enrollmentsData=enrollmentResult.data,certsData=certResult.data,patentsData=patentResult.data,qualificationsData=qualificationResult.data,assignmentsData=assignmentResult.data,documentsData=documentResult.data,guardianData=guardianResult.data,wardData=wardResult.data,equipmentData=equipmentResult.data;
 const seasons=(seasonsData??[]) as unknown as Season[];
 const memberships=(membershipsData??[]) as unknown as (Membership&{verbale_cda_id:string|null})[];
 const vIds=[...new Set(memberships.map(m=>m.verbale_cda_id).filter((v):v is string=>Boolean(v)))];
 const boardPromise=vIds.length?Promise.resolve(supabase.from('cda_verbali').select('id,data_consiglio').in('id',vIds)):Promise.resolve({data:[],error:null});
 const balances=(balancesData??[]) as unknown as Balance[];
 const payments=(paymentsData??[]) as unknown as Payment[];
 const enrollments=(enrollmentsData??[]) as unknown as Enrollment[];
 const certs=(certsData??[]) as unknown as Cert[];
 const patents=(patentsData??[]) as unknown as Patent[];
 const qualifications=(qualificationsData??[]) as unknown as Qualification[];
 const assignments=(assignmentsData??[]) as unknown as {id:string;edizione_id:string;ruolo:string}[];
 const documents=(documentsData??[]) as unknown as Document[];
 const guardians=(guardianData??[]) as unknown as Guardian[];
 const wards=(wardData??[]) as unknown as Guardian[];
 const equipment=(equipmentData??[]) as unknown as Equipment[];
 const editionIds=[...new Set([...enrollments.map(x=>x.edizione_id),...assignments.map(x=>x.edizione_id)])];
 const [{data:editionsData,error:editionsError},cardResult,{data:equipmentNamesData,error:equipmentNamesError},{data:boardMinutes,error:boardError}]=await Promise.all([
  
  editionIds.length?supabase.from('edizioni_corsi').select('id,nome,corso_id,inizio,fine').in('id',editionIds):Promise.resolve({data:[],error:null}),
  (overview||tab==='tesseramenti')?supabase.from('tesseramenti').select('id,adesione_id,ente,numero_tessera,scade_il,stato,adesioni!inner(persona_id,stagione_id)',{count:'exact'}).eq('adesioni.persona_id',id).order('scade_il',{ascending:false}).order('id').range(...range('tesseramenti')):Promise.resolve(skip),
  equipment.length?supabase.from('attrezzature').select('id,codice,categoria').in('id',equipment.map(x=>x.attrezzatura_id)):Promise.resolve({data:[],error:null}),
  boardPromise,
 ]);
 const cardsData=cardResult.data;
 const editions=(editionsData??[]) as unknown as Edition[];
 const cards=(cardsData??[]) as unknown as Card[];
 const courseIds=[...new Set(editions.map(x=>x.corso_id))];
 const {data:coursesData,error:coursesError}=courseIds.length?await supabase.from('corsi').select('id,nome,tipo,livello').in('id',courseIds):{data:[],error:null};
 const courses=(coursesData??[]) as unknown as Course[];
 const guardianIds=[...new Set([...guardians.map(g=>g.tutore_id),...wards.map(g=>g.minore_id)])];
 const {data:familyData,error:familyError}=guardianIds.length?await supabase.from('persone').select('id,nome,cognome').in('id',guardianIds):{data:[],error:null};
 const family=(familyData??[]) as unknown as {id:string;nome:string;cognome:string}[];
 const seasonName=(key:string)=>seasons.find(s=>s.id===key)?.nome??'Stagione non trovata';
 const editionName=(key:string)=>{
  const ed=editions.find(e=>e.id===key);
  const course=courses.find(c=>c.id===ed?.corso_id);
  return ed?`${ed.nome}${course?` · ${course.tipo}${course.livello?` ${course.livello}`:''}`:''}`:'Edizione non disponibile';
 };
 const equipmentNames=(equipmentNamesData??[]) as unknown as {id:string;codice:string;categoria:string}[];
 const allMembershipRows=(allMemberships.data??[]) as unknown as Membership[];
 const newSeasons=memberError?[]:seasons.filter(s=>!allMembershipRows.some(m=>m.stagione_id===s.id));
 const active=allMembershipRows.find(m=>seasons.find(s=>s.id===m.stagione_id)?.attiva);
 const currentSeason=seasons.find(s=>s.attiva);
 const currentCard=overview&&!memberError&&active?await supabase.from('tesseramenti').select('id,ente,scade_il,stato').eq('adesione_id',active.id).order('scade_il',{ascending:false,nullsFirst:false}).order('id').limit(1).maybeSingle():{data:null,error:null};
 const {data:corrections,error:correctionError}=tab==='anagrafica'?await supabase.from('rettifiche_anagrafiche').select('id,nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,creata_il,revisione').eq('persona_id',id).eq('stato','in_attesa'):{data:[],error:null};
 const {data:emergenza,error:emergencyError}=tab==='anagrafica'?await supabase.from('contatti_emergenza').select('nominativo,telefono').eq('persona_id',id).maybeSingle():{data:null,error:null};
 const {data:domanda,error:applicationError}=tab==='adesioni'?await supabase.from('richieste').select('id,utente_id,flag_privacy,versione_privacy,data_accettazione,immagini_scelta,immagini_versione,immagini_il,flag_immagini,versione_statuto,flag_statuto').eq('persona_id',id).order('modificato_il',{ascending:false}).limit(1).maybeSingle():{data:null,error:null};
 const titolare=tab==='adesioni'?(domanda?.utente_id??accountLinks?.find(a=>a.relazione==='titolare')?.utente_id):undefined;
 const {data:ultimaScelta,error:consentError}=titolare?await supabase.from('scelte_iscrizione').select('id,scelta,versione,registrata_il,origine').eq('utente_id',titolare).eq('tipo','immagini').order('id',{ascending:false}).limit(1).maybeSingle():{data:null,error:null};
 const consenso=ultimaScelta&&titolare&&ultimaScelta.versione===(applicationLegalConfig(titolare).testMode?'TEST-COLLAUDO-1':versioneImmagini)?ultimaScelta:null;
 const previousConsent=consenso?.scelta===false&&titolare?await supabase.from('scelte_iscrizione').select('id',{head:true,count:'exact'}).eq('utente_id',titolare).eq('tipo','immagini').eq('versione',consenso.versione).eq('scelta',true).lt('id',consenso.id):null;
 const newestCert=certs[0];
 const today=romeDay(new Date().toISOString());
 const certLabel=(c:Cert)=>c.stato_certificato==='valido'&&c.scade_il>=today&&c.scade_il<=shiftDay(today,30)?'in_scadenza':c.stato_certificato;
 const courseBalances=courseBalancesResult.data??[];
 const debt=balanceError?null:balances.reduce((sum,q)=>sum+Number(q.residuo),0);
 const courseDebt=courseBalancesResult.error?null:courseBalances.reduce((sum,q)=>sum+Number(q.residuo),0);
 const partialErrors=Boolean(currentCard.error||memberError||balanceError||paymentResult.error||enrollmentResult.error||certResult.error||patentResult.error||qualificationResult.error||assignmentResult.error||documentResult.error||guardianResult.error||wardResult.error||equipmentResult.error||cardResult.error||courseBalancesResult.error||emergencyError||applicationError||consentError||boardError||editionsError||coursesError||equipmentNamesError||familyError);
 const pageLink=(next:number,secondary=false)=>listHref({tab,p:String(secondary?page:next),p2:String(secondary?next:secondPage)});
 const pager=(result:{count:number|null;error:unknown},label:string,secondary=false)=><Pagination page={secondary?secondPage:page} size={size} count={result.error?null:result.count} href={p=>pageLink(p,secondary)} label={label}/>;
 const sectionError=(error:unknown)=>error?<Alert tone="danger" announce>Informazioni non disponibili. Riprova prima di eseguire operazioni.</Alert>:null;
 return <>
 <header className="sc-member-hero sc-page-header-marine sc-area-secretariat">
 <PersonAvatar nome={person.nome} cognome={person.cognome} large/>
 <div className="sc-member-identity"><p className="eyebrow">Segreteria · Scheda unificata</p><h1>{displayName(person.cognome)} {displayName(person.nome)}</h1><p>{currentSeason?.nome??'Stagione attiva non disponibile'}</p><p>{person.email??person.telefono??'Recapiti non acquisiti'}</p><StatusBadge tone={memberError?'neutral':statusTone(active?.stato??'')}>{memberError?'Stato non disponibile':active?statusLabel(active.stato):'Nessuna adesione nella stagione attiva'}</StatusBadge></div>
 <div className="sc-member-hero-actions"><ButtonLink href={`/comunicazioni/soci/${id}`} variant="secondary" icon="document">Scrivi al socio</ButtonLink><ButtonLink href={'/gestionale/incassi?persona='+id+'&stato=residuo'} variant="secondary" icon="wallet">Registra pagamento</ButtonLink><ButtonLink href="?tab=anagrafica&modifica=1" icon="user">Modifica anagrafica</ButtonLink></div>
 </header>
 {msg&&Object.hasOwn(statusMessage,msg)&&<p role="status" className={`notice ${['salvato','adesione_creata','elemento_salvato','emergenza_salvata','rettifica_decisa'].includes(msg)?'success':'warning'}`}>{statusMessage[msg]}</p>}
 {partialErrors&&<Alert tone="warning">Una o più sezioni non sono disponibili. Non interpretare dati mancanti come assenza di registrazioni.</Alert>}
 <nav className="sc-member-tabbar" aria-label="Sezioni della scheda socio">
 <div className="sc-member-primary-tabs">{memberTabs.filter(([key])=>!isSecondaryMemberTab(key)).map(([key,label])=><Link key={key} href={listHref({tab:key})} aria-current={tab===key?'page':undefined}>{label}</Link>)}</div>
 <details key={tab} open={isSecondaryMemberTab(tab)||undefined} className="sc-member-more"><summary>Altro{isSecondaryMemberTab(tab)?' · '+memberTabs.find(([key])=>key===tab)?.[1]:''}<Icon name="chevron-down"/></summary><div>{memberTabs.filter(([key])=>isSecondaryMemberTab(key)).map(([key,label])=><Link key={key} href={listHref({tab:key})} aria-current={tab===key?'page':undefined}>{label}</Link>)}</div></details>
 </nav>
 {tab==='panoramica'&&<section className="sc-secretariat-section sc-member-overview"><h2>Panoramica socio</h2><p className="muted">Stato associativo, attività e scadenze registrate.</p><div className="sc-metrics">
 <Link className="sc-metric-link" href="?tab=adesioni"><MetricCard label="Adesione nella stagione attiva" area="secretariat" icon="users" value={memberError?'—':active?statusLabel(active.stato):'Non presente'}/></Link>
 <Link className="sc-metric-link" href="?tab=tesseramenti"><MetricCard label="Tesseramento della stagione attiva" area="pool" icon="document" value={memberError||currentCard.error||!currentSeason?'—':currentCard.data?statusLabel(currentCard.data.stato):'Non presente'} note={currentCard.data?'Scadenza più recente: '+formatValue(currentCard.data.scade_il):'Registrati nello storico: '+exactCount(cardResult)}/></Link>
 <Link className="sc-metric-link" href="?tab=certificati"><MetricCard label="Certificato più recente" area="certificate" icon="certificate" value={certResult.error?'—':newestCert?statoSingolo(certLabel(newestCert)):'Non presente'} note={certResult.error||!newestCert?undefined:'Scadenza: '+formatValue(newestCert.scade_il)}/></Link>
 <Link className="sc-metric-link" href="?tab=brevetti"><MetricCard label="Brevetti registrati" area="teaching" icon="course" value={exactCount(patentResult)}/></Link>
 </div><div className="sc-member-overview-grid">
 <section className="sc-card"><h2>Situazione economica</h2><div className="sc-metrics"><Link className="sc-metric-link" href="?tab=pagamenti"><MetricCard label="Residuo quote associative" area="finance" icon="wallet" value={debt===null?'—':euro(debt)} note="Tutte le stagioni"/></Link><Link className="sc-metric-link" href="?tab=pagamenti"><MetricCard label="Residuo quote corsi" area="finance" icon="wallet" value={courseDebt===null?'—':euro(courseDebt)}/></Link></div><ButtonLink href="?tab=pagamenti" variant="secondary">Vai ai pagamenti</ButtonLink></section>
 <section className="sc-card"><h2>Corsi e attività</h2><p><strong>{exactCount(enrollmentResult)}</strong> iscrizioni nello storico</p>{enrollmentResult.error||editionsError||coursesError?<Alert tone="warning">Elenco non disponibile.</Alert>:enrollments.length?enrollments.slice(0,3).map(e=><div className="sc-member-preview" key={e.id}><Icon name="course"/><span>{editionName(e.edizione_id)}</span><StatusBadge tone={statusTone(e.stato)}>{statusLabel(e.stato)}</StatusBadge></div>):<None>Nessuna iscrizione registrata.</None>}<ButtonLink href="?tab=corsi" variant="secondary">Tutti i corsi</ButtonLink></section>
 <section className="sc-card"><h2>Documenti recenti</h2>{documentResult.error?<Alert tone="warning">Elenco non disponibile.</Alert>:documents.length?documents.slice(0,3).map(d=><div className="sc-member-preview" key={d.id}><Icon name="document"/><span>{d.nome}<small>{formatValue(d.caricato_il)}</small></span><Link href={'/documenti/'+d.id} prefetch={false}>Apri</Link></div>):<None>Nessun documento collegato.</None>}<ButtonLink href="?tab=documenti" variant="secondary">Tutti i documenti</ButtonLink></section>
 <section className="sc-card"><h2>Azioni rapide</h2><div className="sc-quick-actions"><ButtonLink href="?tab=anagrafica" variant="secondary">Modifica anagrafica</ButtonLink><ButtonLink href={'/gestionale/incassi?persona='+id+'&stato=residuo'}>Registra pagamento</ButtonLink><ButtonLink href={'/gestionale/moduli/certificati?persona='+id+'&nuovo=1'} variant="secondary">Registra certificato</ButtonLink><ButtonLink href={'/gestionale/moduli/iscrizioni?persona='+id+'&nuovo=1'} variant="secondary">Iscrivi a un corso</ButtonLink><ButtonLink href="?tab=cronologia" variant="secondary">Cronologia</ButtonLink></div></section>
 </div></section>}
 <div className="member-sections sc-secretariat-section">
   {tab==='anagrafica'&&<Section id="anagrafica" title="Anagrafica e recapiti">
    {correctionError&&<p role="alert">Impossibile caricare le richieste di rettifica.</p>}
    {(corrections??[]).map(r=><div className="panel" key={r.id}><h3>Rettifica anagrafica in attesa</h3><p>Verifica i dati proposti con la documentazione e confrontali con l’anagrafica attuale.</p><div className="detail-grid"><div>Nome e cognome: <strong>{r.nome} {r.cognome}</strong></div><div>Data di nascita: {formatValue(r.data_nascita)}</div><div>Luogo: {[r.luogo_nascita,r.provincia_nascita,r.stato_nascita].filter(Boolean).join(' · ')||'—'}</div><div>Sesso CF: {r.sesso_cf??'—'}</div><div>Codice fiscale: {r.codice_fiscale??'—'}</div></div>
    <EditForm action={reviewIdentityCorrection} successHref={'/gestionale/soci/'+id+'?msg=rettifica_decisa&tab=anagrafica'} className="stack"><input type="hidden" name="id" value={id}/><input type="hidden" name="rettifica_id" value={r.id}/><input type="hidden" name="revisione" value={r.revisione}/><label>Esito<select name="esito" required defaultValue=""><option value="">Seleziona</option><option value="applicata">Approva e applica</option><option value="respinta">Respingi</option></select></label><label className="check-label"><input type="checkbox" name="cf_omocodia_verificata"/>Omocodia verificata con documentazione</label><label>Motivazione verifica documentale (se necessaria)<input name="cf_override_motivo" maxLength={500}/></label><label>Motivazione per il socio (obbligatoria in caso di rifiuto)<textarea name="motivazione_esito" maxLength={500} rows={2}/></label><button className="button">Conferma esito</button></EditForm></div>)}

    <div className="detail-grid">
     <div><span className="k">Data e luogo di nascita</span><strong>{formatValue(person.data_nascita)} · {person.luogo_nascita??'—'}</strong></div>
     <div><span className="k">Codice fiscale</span><strong>{person.codice_fiscale??'—'}</strong></div>
     <div><span className="k">Indirizzo di residenza</span><strong>{[person.indirizzo,person.cap,person.comune].filter(Boolean).join(' · ')||'—'}</strong></div>
     <div><span className="k">Recapiti</span><strong>{person.email??'—'} · {person.telefono??'—'}</strong></div>
    </div>
    <h3>Contatto di emergenza</h3><p>{emergencyError?'Non disponibile':emergenza?emergenza.nominativo+' · '+emergenza.telefono:'Non acquisito'}</p>{!emergencyError&&<details><summary>Modifica contatto di emergenza</summary><EditForm action={updateMemberEmergency} successHref={'/gestionale/soci/'+id+'?msg=emergenza_salvata&tab=anagrafica'} className="stack"><input type="hidden" name="id" value={id}/><div className="form-grid"><label>Nome e cognome<input name="emergenza_nome" required maxLength={160} defaultValue={emergenza?.nominativo??''}/></label><label>Telefono<input name="emergenza_telefono" type="tel" required maxLength={32} defaultValue={emergenza?.telefono??''}/></label></div><button className="button">Salva contatto di emergenza</button></EditForm></details>}<Drawer title={'Modifica anagrafica · '+person.cognome+' '+person.nome} trigger="Modifica anagrafica e recapiti" primary initialOpen={modifica==='1'&&!msg}>
     <EditForm action={updateMemberProfile} className="stack sc-secretariat-form"><input type="hidden" name="id" value={person.id}/>
      <p className="tiny muted sc-form-legend">* Campi obbligatori. Gli altri sono facoltativi.</p>
      <fieldset><legend>Dati personali</legend><div className="form-grid">
       <label>Nome <span aria-hidden="true" className="sc-required-star">*</span><input name="nome" required maxLength={100} defaultValue={person.nome}/></label>
       <label>Cognome <span aria-hidden="true" className="sc-required-star">*</span><input name="cognome" required maxLength={100} defaultValue={person.cognome}/></label>
       <label>Data di nascita<input name="data_nascita" type="date" defaultValue={person.data_nascita??''}/></label>
       <label>Comune di nascita (o città estera)<input name="luogo_nascita" maxLength={150} defaultValue={person.luogo_nascita??''}/></label>
       <label>Provincia nascita<input name="provincia_nascita" maxLength={2} defaultValue={person.provincia_nascita??''}/></label>
       <label>Stato di nascita<input name="stato_nascita" maxLength={100} defaultValue={person.stato_nascita??''}/></label>
      </div></fieldset>
      <fieldset><legend>Residenza e recapiti</legend><div className="form-grid">
       <label>Indirizzo di residenza<input name="indirizzo" maxLength={250} defaultValue={person.indirizzo??''}/></label>
       <label>CAP<input name="cap" maxLength={100} defaultValue={person.cap??''}/></label>
       <label>Comune di residenza<input name="comune" maxLength={100} defaultValue={person.comune??''}/></label>
       <label>Provincia residenza<input name="provincia_residenza" maxLength={2} defaultValue={person.provincia_residenza??''}/></label>
       <label>Stato residenza<input name="stato_residenza" maxLength={15} defaultValue={person.stato_residenza??''}/></label>
       <label>Telefono<input name="telefono" maxLength={100} defaultValue={person.telefono??''}/></label>
       <label>Email di contatto<input name="email" type="email" maxLength={254} defaultValue={person.email??''}/></label>
      </div></fieldset>
      <fieldset><legend>Dati fiscali</legend><div className="form-grid">
       <label>Codice fiscale<input name="codice_fiscale" maxLength={100} defaultValue={person.codice_fiscale??''}/></label>
       <label>Sesso per CF<select name="sesso_cf" defaultValue={person.sesso_cf??''}><option value="">Non indicato</option><option value="M">M</option><option value="F">F</option></select></label>
      </div></fieldset>
      <details className="sc-advanced-fields" open={Boolean(person.cf_omocodia_verificata||person.cf_override_motivo)||undefined}><summary>Verifiche particolari (omocodia)</summary><div className="form-grid">
       <label className="check-label"><input type="checkbox" name="cf_omocodia_verificata" defaultChecked={person.cf_omocodia_verificata}/><span>Omocodia verificata con documentazione</span></label>
       <label>Motivazione verifica documentale CF<input name="cf_override_motivo" maxLength={500} defaultValue={person.cf_override_motivo??''} placeholder="Es. omocodia attestata da tessera sanitaria"/></label>
      </div></details><CodiceFiscaleAssist/><div className="form-actions"><button type="submit" className="button">Salva modifiche</button><CancelEditButton/></div>
      <p className="tiny muted">Le rettifiche vengono registrate nel registro operazioni, senza copiare i dati anagrafici nel log.</p>
     </EditForm><RemoveRecord moduleKey="anagrafiche" id={person.id} back="soci" label={person.cognome+' '+person.nome}/>{isAdmin===true&&Boolean(accountLinks?.length)&&<div className="stack"><p className="muted tiny">Per rimuovere l’account insieme ai dati esclusivi collegati, usa la cancellazione completa. I profili condivisi sono conservati.</p>{accountLinks?.map(a=><Link key={a.utente_id} href={`/gestionale/utenti/${a.utente_id}/elimina`} className="button danger">Elimina account e dati ({a.relazione})</Link>)}</div>}</Drawer>
   </Section>}
   {tab==='adesioni'&&<Section id="adesioni" title="Adesioni e dichiarazioni" href={'/gestionale/moduli/adesioni?persona='+id}>
 {sectionError(memberError||applicationError||consentError||boardError)}<div className="sc-card"><h3>Dichiarazioni della domanda</h3>{domanda?<><p>Statuto: {domanda.flag_statuto?domanda.versione_statuto:'Non acquisito'}</p><p>Informativa: {domanda.flag_privacy?domanda.versione_privacy:'Non acquisito'} {dataOra(domanda.data_accettazione)}</p><p>Foto e video nella domanda: {sceltaLabel(domanda.immagini_scelta)} {domanda.immagini_versione} {dataOra(domanda.immagini_il)}</p><Link href={'/gestionale/richieste/'+domanda.id}>Apri domanda originale</Link></>:<p>{applicationError?'Domanda non disponibile':'Nessuna domanda collegata'}</p>}<h3>Foto e video · scelta dell’account</h3><p>{consentError||previousConsent?.error?'Scelta non disponibile':consentStatus(consenso?.scelta,(previousConsent?.count??0)>0)} {consenso?.versione} {dataOra(consenso?.registrata_il)}{consenso?.origine?' · Origine: '+consenso.origine:consenso?' · Origine non registrata':''}</p>{ultimaScelta&&!consenso&&<p className="tiny muted">La scelta più recente appartiene a un’altra versione: non è un consenso corrente.</p>}<p className="tiny muted">La scelta dell’account non certifica un consenso individuale per ogni persona o minore collegato.</p></div>
    {memberError?null:memberships.length?<div className="table-panel"><table><thead><tr><th>Stagione</th><th>Stato</th><th>Data</th><th>Delibera CdA</th><th>Azioni</th></tr></thead><tbody>
     {memberships.map(m=><tr key={m.id}><td>{seasonName(m.stagione_id)}</td><td><span className="status">{statusLabel(m.stato)}</span></td>
      <td>{formatValue(m.data_approvazione)}</td><td>{m.verbale_cda_id?<Link href={`/organi-sociali/documento/${m.verbale_cda_id}?tipo=pdf`}>{formatValue(boardMinutes?.find(x=>x.id===m.verbale_cda_id)?.data_consiglio??null)}</Link>:'In attesa di delibera'}</td><td><Link href={`/gestionale/moduli/${"adesioni"}?edit=${m.id}&persona=${id}`}>Modifica</Link></td></tr>)}
    </tbody></table></div>:<None>Non risultano adesioni per questa persona.</None>}
    {pager(membershipResult,"adesioni")}
    {newSeasons.length>0&&<Drawer title="Registra adesione per una nuova stagione" trigger="Registra adesione" primary>
     <EditForm action={createMemberAdhesion} className="stack"><input type="hidden" name="id" value={id}/>
      <label>Stagione<select name="stagione_id" required defaultValue=""><option value="">Seleziona stagione</option>
       {newSeasons.map(s=><option key={s.id} value={s.id}>{s.nome}{s.attiva?' · attiva':''}</option>)}</select></label>
      <p className="tiny muted">La nuova adesione sarà «da perfezionare». Non verranno creati pagamenti o tesseramenti automatici.</p>
      <button className="button" type="submit">Registra adesione</button>
     </EditForm></Drawer>}
   </Section>}
   {tab==='tesseramenti'&&<Section id="tesseramenti" title="Tesseramenti" href={'/gestionale/moduli/tesseramenti?persona='+id}>{sectionError(cardResult.error||memberError)}{cards.length?<div className="table-panel"><table><thead><tr><th>Stagione</th><th>Ente</th><th>Numero tessera</th><th>Scadenza</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>{cards.map(c=><tr key={c.id}><td>{seasonName(allMembershipRows.find(m=>m.id===c.adesione_id)?.stagione_id??'')}</td><td>{c.ente}</td><td>{c.numero_tessera??'Non acquisito'}</td><td>{formatValue(c.scade_il)}<div><StatusBadge tone={c.scade_il<today?'danger':c.scade_il<=shiftDay(today,30)?'warning':'success'}>{c.scade_il<today?'Scaduta':c.scade_il<=shiftDay(today,30)?'In scadenza':'Non scaduta'}</StatusBadge></div></td><td><StatusBadge tone={statusTone(c.stato)}>{statusLabel(c.stato)}</StatusBadge></td><td><Link href={'/gestionale/moduli/tesseramenti?edit='+c.id+'&persona='+id}>Modifica tessera</Link></td></tr>)}</tbody></table></div>:!cardResult.error&&<None>Nessun tesseramento registrato.</None>}{pager(cardResult,"tesseramenti")}</Section>}
   {tab==='corsi'&&<Section id="corsi" title="Corsi e iscrizioni" href={'/gestionale/moduli/iscrizioni?persona='+id}>{sectionError(enrollmentResult.error||editionsError||coursesError)}<ButtonLink href={'/gestionale/moduli/iscrizioni?persona='+id+'&nuovo=1'}>Iscrivi a un corso</ButtonLink>
    {enrollmentResult.error?null:enrollments.length?<div className="table-panel"><table><thead><tr><th>Corso</th><th>Periodo</th><th>Iscrizione</th><th>Azioni</th></tr></thead><tbody>
     {enrollments.map(e=>{const ed=editions.find(x=>x.id===e.edizione_id);return <tr key={e.id}><td>{editionName(e.edizione_id)}</td>
      <td>{ed?`${formatValue(ed.inizio)} – ${formatValue(ed.fine)}`:'—'}</td><td>{statusLabel(e.stato)}</td><td><Link href={`/gestionale/moduli/${"iscrizioni"}?edit=${e.id}&persona=${id}`}>Modifica</Link></td></tr>;})}
    </tbody></table></div>:<None>Nessuna iscrizione a corsi registrata.</None>}
   {pager(enrollmentResult,"iscrizioni")}</Section>}
   {tab==='pagamenti'&&<Section id="pagamenti" title="Quote associative e versamenti" href={`/gestionale/incassi?persona=${id}`}>{sectionError(balanceError||courseBalancesResult.error||paymentResult.error)}<div className="sc-row-actions"><ButtonLink href={'/gestionale/incassi?persona='+id+'&stato=residuo'}>Registra pagamento quota</ButtonLink><ButtonLink href={'/gestionale/incassi?persona='+id+'&tab=corso&stato=residuo'} variant="secondary">Registra pagamento corso</ButtonLink></div>
    {balanceError?null:balances.length?<div className="table-panel"><table><thead><tr><th>Stagione</th><th>Dovuto</th><th>Versato</th><th>Residuo</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>
     {balances.map(b=><tr key={b.id}><td>{seasonName(b.stagione_id)}</td><td>{euro(b.importo_dovuto)}</td>
      <td>{euro(b.versato)}</td><td><strong>{euro(b.residuo)}</strong></td><td>{statusLabel(b.stato)}</td><td><Link href={`/gestionale/moduli/${"quote"}?edit=${b.id}&persona=${id}`}>Modifica</Link></td></tr>)}
    </tbody></table></div>:<None>Nessuna quota associativa registrata.</None>}
    <h3>Quote corsi</h3>{courseBalances.length?<div className="table-panel"><table><thead><tr><th>Stagione</th><th>Dovuto</th><th>Versato</th><th>Residuo</th><th>Azioni</th></tr></thead><tbody>{courseBalances.map(b=><tr key={b.id}><td>{seasonName(b.stagione_id)}</td><td>{euro(b.importo_dovuto)}</td><td>{euro(b.versato)}</td><td>{euro(b.residuo)}</td><td><Link href={'/gestionale/moduli/addebiti?edit='+b.id+'&persona='+id}>Apri quota corso</Link></td></tr>)}</tbody></table></div>:!courseBalancesResult.error&&<None>Nessuna quota corso registrata.</None>}<h3>Versamenti</h3>{paymentResult.error?null:payments.length?<div className="table-panel"><table><thead><tr><th>Data</th><th>Tipologia</th><th>Importo</th><th>Metodo</th></tr></thead><tbody>
     {payments.map(p=><tr key={p.id}><td>{formatValue(p.data_pagamento)}</td><td>{p.quota_id?'Quota associativa':'Iscrizione corso'}</td>
      <td>{euro(p.importo)}</td><td>{p.metodo}</td></tr>)}
    </tbody></table></div>:<None>Nessun versamento registrato.</None>}
    <p className="tiny muted">Le quote e gli importi dei corsi sono separati. I versamenti registrati non si modificano direttamente.</p>
   {pager(paymentResult,"versamenti")}</Section>}
   {tab==='certificati'&&<Section id="certificati" title="Certificati medici — verifica amministrativa" href={'/gestionale/moduli/certificati?persona='+id}>{sectionError(certResult.error)}<ButtonLink href={'/area-personale/certificato?persona='+id}>Carica certificato</ButtonLink>
    <p className="tiny muted">Sono mostrate solo data di rilascio, scadenza e verifica amministrativa. Non inserire diagnosi o dati clinici.</p>
    {certResult.error?null:certs.length?<div className="table-panel"><table><thead><tr><th>Rilasciato</th><th>Scadenza</th><th>Stato</th><th>Documento</th><th>Azioni</th></tr></thead><tbody>
     {certs.map(c=><tr key={c.id}><td>{formatValue(c.rilasciato_il)}</td><td>{formatValue(c.scade_il)}</td>
      <td><StatusBadge tone={statusTone(certLabel(c))}>{statoSingolo(certLabel(c))}</StatusBadge></td>
      <td>{c.documento_id?<Link href={'/documenti/'+c.documento_id}>Apri certificato</Link>:<Link href={'/area-personale/certificato?persona='+id}>Carica certificato</Link>}</td><td><Link href={`/gestionale/moduli/${"certificati"}?edit=${c.id}&persona=${id}`}>Modifica</Link></td></tr>)}
    </tbody></table></div>:<None>Documento mancante · <Link href={'/area-personale/certificato?persona='+id}>Carica certificato</Link></None>}
   {pager(certResult,"certificati")}</Section>}
   {tab==='brevetti'&&<Section id="brevetti" title="Brevetti conseguiti" href={'/gestionale/moduli/brevetti?persona='+id}>{sectionError(patentResult.error)}<ButtonLink href={'/gestionale/moduli/brevetti?persona='+id+'&nuovo=1'}>Registra brevetto</ButtonLink>
    {patentResult.error?null:patents.length?<div className="table-panel"><table><thead><tr><th>Brevetto</th><th>Rilasciato da</th><th>Ente</th><th>Origine e verifica</th><th>Conseguito</th><th>Scadenza</th><th>Azioni</th></tr></thead><tbody>
     {patents.map(p=><tr key={p.id}><td>{p.titolo}</td><td>{p.origine==='esterno'?[p.istruttore_esterno,p.centro_rilascio].filter(Boolean).join(' · ')||'Centro esterno':p.rilasciato_da_nome??'Non acquisito'}</td><td>{p.ente??'—'}</td><td>{p.origine==='esterno'?'Esterno':p.edizione_id?'Interno':'Storico'} · {String(p.stato_verifica??'verificato').replaceAll('_',' ')}</td><td>{formatValue(p.ottenuto_il)}</td><td>{formatValue(p.scade_il)}</td><td><Link href={`/gestionale/moduli/${"brevetti"}?edit=${p.id}&persona=${id}`}>Modifica</Link></td></tr>)}
    </tbody></table></div>:<None>Nessun brevetto registrato.</None>}
   {pager(patentResult,"brevetti")}</Section>}
   {tab==='documenti'&&<Section id="documenti" title="Documenti collegati" href={'/documenti?persona='+id}>{sectionError(documentResult.error)}
    {documentResult.error?null:documents.length?<ul className="member-docs">{documents.map(d=><li key={d.id}><Link href={`/documenti/${d.id}`}>{d.nome}</Link>
     <span className="muted tiny">{d.categoria} · {formatValue(d.caricato_il)}</span></li>)}</ul>:<None>Non risultano documenti collegati direttamente a questa anagrafica.</None>}
    <p className="tiny muted">Alcuni documenti caricati dall’account possono non essere ancora associati all'anagrafica: verifica nell'archivio.</p>
   {pager(documentResult,"documenti")}</Section>}
   {tab==='istruttore'&&<Section id="istruttore" title="Qualifiche e attività da istruttore" href={'/gestionale/moduli/qualifiche?persona='+id}>{sectionError(qualificationResult.error||assignmentResult.error||editionsError||coursesError)}<h3>Qualifiche</h3>
    {qualifications.map(q=><div className="info-row" key={q.id}><span>{q.titolo}{q.ente?` · ${q.ente}`:''}</span><strong>{q.scade_il?`Scade ${formatValue(q.scade_il)}`:'Nessuna scadenza'}</strong><Link href={`/gestionale/moduli/${"qualifiche"}?edit=${q.id}&persona=${id}`}>Modifica</Link></div>)}
    {pager(qualificationResult,"qualifiche")}<h3>Assegnazioni ai corsi</h3>{assignments.map(a=><div className="info-row" key={a.id}><span>{editionName(a.edizione_id)}</span><strong>{statusLabel(a.ruolo)}</strong><Link href={`/gestionale/moduli/${"istruttori"}?edit=${a.id}&persona=${id}`}>Modifica</Link></div>)}
    {!qualificationResult.error&&!assignmentResult.error&&qualifications.length===0&&assignments.length===0&&<None>Nessuna qualifica o assegnazione da istruttore.</None>}
   {pager(assignmentResult,"assegnazioni",true)}</Section>}
   {tab==='attrezzature'&&<Section id="attrezzature" title="Prestiti e consegne attrezzature" href={'/gestionale/moduli/consegne?persona='+id}>{sectionError(equipmentResult.error||equipmentNamesError)}
    {equipmentResult.error?null:equipment.length?<div className="table-panel"><table><thead><tr><th>Attrezzatura</th><th>Consegnata</th><th>Restituzione</th><th>Azioni</th></tr></thead><tbody>
     {equipment.map(e=><tr key={e.id}><td>{equipmentNames.find(x=>x.id===e.attrezzatura_id)?.codice??'Attrezzatura non trovata'}</td>
      <td>{formatValue(e.assegnata_il)}</td><td>{formatValue(e.restituita_il)}</td><td><Link href={`/gestionale/moduli/${"consegne"}?edit=${e.id}&persona=${id}`}>Modifica</Link></td></tr>)}
    </tbody></table></div>:<None>Nessun prestito di attrezzatura registrato.</None>}
   {pager(equipmentResult,"consegne")}</Section>}
   {tab==='famiglia'&&<Section id="famiglia" title="Genitori, tutori e minori collegati">{sectionError(guardianResult.error||wardResult.error||familyError)}
    {[...guardians.map(g=>({id:g.tutore_id,label:'Tutore',parentela:g.parentela})),...wards.map(g=>({id:g.minore_id,label:'Minore',parentela:g.parentela}))]
     .sort((a,b)=>{const n=(id:string)=>{const p=family.find(x=>x.id===id);return `${p?.cognome??''} ${p?.nome??''}`;};return n(a.id).localeCompare(n(b.id),'it');}).map((f,i)=>{const related=family.find(x=>x.id===f.id);return <div className="info-row" key={`${f.id}-${i}`}>
      <span>{f.label} · {f.parentela}</span><strong>{related?<Link href={`/gestionale/soci/${f.id}`}>{related.cognome} {related.nome}</Link>:'Persona collegata non trovata'}</strong>
     </div>;})}
    {!guardianResult.error&&!wardResult.error&&guardians.length===0&&wards.length===0&&<None>Nessuna relazione familiare registrata.</None>}
   {pager(guardianResult,"tutori")}{pager(wardResult,"minori",true)}{isAdmin===true&&<><h3>Account collegati</h3>{accountLinks?.map(a=><p key={a.utente_id}><Link href={'/gestionale/utenti/'+a.utente_id}>Apri account · {a.relazione}</Link></p>)}</>}</Section>}
  </div>
  {tab==='cronologia'&&<Cronologia tipo="socio" id={id} expanded/>}
 </>;
}
