import {PageHeader,ButtonLink,StatusBadge,Alert,EmptyState} from '@/components/ui/Primitives';
import {Drawer} from '@/components/ui/Drawer';
import {Pagination,DataTable} from '@/components/ui/DataTable';
import EditForm from '@/components/EditForm';
import {pageNumber,singleSearchParams} from '@/lib/module-ui';
import {statusTone} from '@/lib/secretariat';
import {readCourseChunks} from '@/lib/course-ui';
import Link from 'next/link';
import {requireUser} from '@/lib/security';
import {formatValue} from '@/lib/format';
import {tutteLePagine} from '@/lib/pagine';
import {askForCourse} from '../actions';
export default async function MyCourses({searchParams}:{searchParams:Promise<{msg?:string;tab?:string;p?:string}>}){
 const {supabase,user}=await requireUser();
 const {msg,tab:rawTab,p}=singleSearchParams(await searchParams);const tabs=['iscrizioni','catalogo','lezioni','materiali','presenze'] as const;const tab=tabs.find(t=>t===rawTab)??(msg==='inviata'?'iscrizioni':'iscrizioni'),page=pageNumber(p),size=20;const href=(n:number)=>'?tab='+tab+'&p='+n;
 const [{data:links,error:linkError},{data:editions,error:editionError},{data:courses}]=await Promise.all([
 tutteLePagine((da,a)=>supabase.from('collegamenti_persone').select('persona_id').eq('utente_id',user.id).order('persona_id').range(da,a)),
 tutteLePagine((da,a)=>supabase.from('edizioni_corsi').select('id,nome,inizio,fine,stato,corso_id,stagione_id,direttore_id').order('inizio',{ascending:false}).order('id').range(da,a)),
 tutteLePagine((da,a)=>supabase.from('corsi').select('id,nome,tipo,livello').order('id').range(da,a))
 ]);
 const ids=links?.map(l=>l.persona_id)??[];
 const {data:enrollments,error:enrollmentError}=await readCourseChunks(ids,(group,da,a)=>supabase.from('iscrizioni_corsi').select('id,persona_id,edizione_id,stato').in('persona_id',group).order('id').range(da,a));
 const myEnrollments=enrollments?.filter(i=>['iscritto','concluso'].includes(i.stato));
 const myCourseIds=[...new Set((myEnrollments??[]).map(x=>x.edizione_id))];
 const {data:didacticFiles,error:filesError}=await readCourseChunks(myCourseIds,(group,da,a)=>supabase.from('documenti').select('id,nome,edizione_id').in('edizione_id',group).eq('ambito','didattica').eq('visibilita','soci').order('id').range(da,a));
 const [{data:people,error:peopleError},{data:lessons,error:lessonError}]=await Promise.all([
 readCourseChunks(ids,(group,da,a)=>supabase.from('persone').select('id,nome,cognome').in('id',group).order('cognome').order('nome').order('id').range(da,a)),
 readCourseChunks(myCourseIds,(group,da,a)=>supabase.from('lezioni').select('id,edizione_id,titolo,inizio,fine').in('edizione_id',group).is('annullata_il',null).order('inizio').order('id').range(da,a)),
 ]);
 const {data:eligible,error:eligibilityError}=await readCourseChunks(ids,(group,da,a)=>supabase.from('adesioni').select('persona_id,stagione_id').in('persona_id',group).in('stato',['attiva','da_perfezionare']).order('persona_id').order('stagione_id').range(da,a));
 const qualifica=await readCourseChunks(ids,(group,da,a)=>supabase.from('qualifiche_istruttori').select('persona_id').in('persona_id',group).order('id').range(da,a));
 const qualified=new Set((qualifica.data??[]).map(q=>q.persona_id));
 const fullName=(id:string)=>{const p=people?.find(x=>x.id===id);return `${p?.cognome??''} ${p?.nome??''}`;};
 const eligibleFor=(season:string,edition:string)=>linkError||editionError||peopleError||enrollmentError||eligibilityError||qualifica.error?[]:people?.filter(p=>!qualified.has(p.id)&&p.id!==editions?.find(e=>e.id===edition)?.direttore_id&&eligible?.some(x=>x.persona_id===p.id&&x.stagione_id===season)&&!enrollments?.some(i=>i.persona_id===p.id&&i.edizione_id===edition))??[];
 const upcoming=(lessons??[]).filter(l=>Date.parse(l.fine)>=Date.now()).sort((a,b)=>a.inizio.localeCompare(b.inizio));
 const presence=tab==='presenze'?await readCourseChunks(ids,(group,da,a)=>supabase.from('presenze').select('id,lezione_id,persona_id,presente').in('persona_id',group).order('id').range(da,a)):{data:[],error:null};
 const visiblePresence=(presence.data??[]).filter(p=>(lessons??[]).some(l=>l.id===p.lezione_id&&myEnrollments?.some(e=>e.persona_id===p.persona_id&&e.edizione_id===l.edizione_id)));
 const catalog=(editions??[]).filter(e=>['programmato','attivo'].includes(e.stato));
 return <><PageHeader area="teaching" icon="course" marine eyebrow="Attività" title="I miei corsi" description="Invia la richiesta per la stagione della tua adesione. La segreteria verifica il tesseramento prima della conferma."/>
 <nav className="sc-secretariat-tabs sc-personal-tabs" aria-label="Sezioni corsi">{[['iscrizioni','Iscrizioni'],['catalogo','Richiedi iscrizione'],['lezioni','Prossime lezioni'],['materiali','Materiali'],['presenze','Le mie presenze']].map(([key,label])=><Link key={key} href={'?tab='+key} aria-current={tab===key?'page':undefined}>{label}</Link>)}</nav>
 {msg==='direttore'&&<p role="alert">Il direttore non può essere allievo dello stesso corso.</p>}{msg==='duplicata'&&<p role="alert">Risulti già iscritto a questa edizione.</p>}{msg==='inviata'&&<div className="notice success">Richiesta d'iscrizione registrata.</div>}{msg==='errore'&&<div className="notice warning">Iscrizione non inviata: verifica adesione della stagione e che il corso non sia già richiesto.</div>}
 {(linkError||editionError||peopleError||enrollmentError||eligibilityError||qualifica.error||lessonError)&&<p className="notice error" role="alert">Alcuni dati dei corsi non sono disponibili. Riprova: le iscrizioni non verificabili sono temporaneamente disabilitate.</p>}
 {tab==='iscrizioni'&&<section className="sc-card"><h2>Iscrizioni attuali e storiche</h2><DataTable label="Le mie iscrizioni" mobileCards><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Persona</th><th role="columnheader" scope="col">Corso</th><th role="columnheader" scope="col">Stato</th></tr></thead><tbody role="rowgroup">
 {enrollments?.sort((a,b)=>fullName(a.persona_id).localeCompare(fullName(b.persona_id),'it')).slice((page-1)*size,page*size).map(i=><tr key={i.id} role="row"><td role="cell" data-label="Persona">{fullName(i.persona_id)}</td><td role="cell" data-label="Corso">{editions?.find(e=>e.id===i.edizione_id)?.nome??'Corso non disponibile'}</td><td role="cell" data-label="Stato"><StatusBadge tone={statusTone(i.stato)}>{i.stato==='in_attesa'?'In attesa di approvazione':i.stato.replaceAll('_',' ')}</StatusBadge></td></tr>)}
 {!enrollmentError&&!linkError&&!enrollments?.length&&<tr><td colSpan={3}>Non risultano iscrizioni.</td></tr>}
 </tbody></DataTable><Pagination page={page} size={size} count={enrollmentError?null:enrollments?.length??0} href={href} label="iscrizioni"/></section>}
 {tab==='catalogo'&&<section className="sc-card"><h2>Richiedi iscrizione a un corso</h2>{qualified.size>0&&<Alert tone="warning">I profili con qualifica di istruttore richiedono una deroga motivata dalla segreteria per partecipare come allievi.</Alert>}<div className="sc-personal-grid">
 {catalog.slice((page-1)*size,page*size).map(e=><article className="panel" key={e.id}><h3>{e.nome}</h3>
 <p className="muted">{courses?.find(c=>c.id===e.corso_id)?.tipo} · {formatValue(e.inizio)} – {formatValue(e.fine)}</p>
 {eligibleFor(e.stagione_id,e.id).length>0&&<Drawer title={'Richiedi iscrizione · '+e.nome} trigger="Richiedi iscrizione"><EditForm action={askForCourse} successHref="/area-personale/corsi?tab=iscrizioni&msg=inviata" className="stack"><input type="hidden" name="edizione_id" value={e.id}/><label>Iscrivi persona<select name="persona_id" required defaultValue={eligibleFor(e.stagione_id,e.id).length===1?eligibleFor(e.stagione_id,e.id)[0].id:''}><option value="">Seleziona</option>{eligibleFor(e.stagione_id,e.id).map(p=><option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}</select></label><button className="button" disabled={!eligibleFor(e.stagione_id,e.id).length}>Richiedi iscrizione</button></EditForm></Drawer>}{!eligibleFor(e.stagione_id,e.id).length&&<p className="tiny muted">Nessun profilo disponibile: controlla l’adesione della stagione o richieste già presenti.</p>}</article>)}
 </div><Pagination page={page} size={size} count={editionError?null:catalog.length} href={href} label="corsi"/></section>}
 {tab==='materiali'&&<section className="sc-card"><h2>Materiali didattici scaricabili</h2>{(didacticFiles??[]).slice((page-1)*size,page*size).map(doc=><p key={doc.id}><Link href={`/documenti/${doc.id}`} prefetch={false}>{doc.nome}</Link> · {editions?.find(e=>e.id===doc.edizione_id)?.nome??'Corso iscritto'}</p>)}{filesError?<Alert tone="warning">Materiali non disponibili.</Alert>:!didacticFiles?.length&&<p className="muted">Nessun materiale didattico pubblicato per i tuoi corsi.</p>}<Pagination page={page} size={size} count={filesError?null:didacticFiles?.length??0} href={href} label="documenti"/></section>}
 {tab==='lezioni'&&<section className="sc-card"><h2>Prossime lezioni</h2>{upcoming.slice((page-1)*size,page*size).map(l=><p key={l.id}><strong>{editions?.find(e=>e.id===l.edizione_id)?.nome??'Corso'}</strong> · {formatValue(l.inizio)} · {l.titolo}</p>)}{!lessonError&&!enrollmentError&&!linkError&&!upcoming.length&&<p className="muted">Nessuna lezione visibile.</p>}<Pagination page={page} size={size} count={lessonError?null:upcoming.length} href={href} label="lezioni"/></section>}
 {tab==='presenze'&&<section className="sc-card"><h2>Le mie presenze</h2>{presence.error||lessonError||enrollmentError?<Alert tone="warning">Presenze non verificabili.</Alert>:!visiblePresence.length?<p>Nessuna presenza registrata.</p>:visiblePresence.slice((page-1)*size,page*size).map(p=>{const lesson=lessons?.find(l=>l.id===p.lezione_id);return <article className="timeline-item" key={p.id}><strong>{fullName(p.persona_id)}</strong><p>{lesson?.titolo} · {formatValue(lesson?.inizio)}</p><StatusBadge tone={p.presente===true?'success':p.presente===false?'warning':'neutral'}>{p.presente===true?'Presente':p.presente===false?'Assente':'Non registrata'}</StatusBadge></article>;})}<Pagination page={page} size={size} count={presence.error?null:visiblePresence.length} href={href} label="presenze"/></section>}
 </>;
}
