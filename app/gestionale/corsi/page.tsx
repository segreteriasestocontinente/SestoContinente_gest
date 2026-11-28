import {singleSearchParams} from '@/lib/module-ui';
import {PageHeader,ButtonLink,StatusBadge,Alert,EmptyState} from '@/components/ui/Primitives';
import {DataTable,FilterBar,SearchBar,Pagination} from '@/components/ui/DataTable';
import {statusTone,searchTerms} from '@/lib/secretariat';
import {validDiscipline,validLevel,courseListView,courseDisciplineIcon} from '@/lib/course-ui';
import {tutteLePagine} from '@/lib/pagine';
import Link from 'next/link';
import {Icon} from '@/components/ui/Icon';
import {requireStaffForRender as requireStaff} from '@/lib/security';
import {courseName,COURSE_STATES} from '@/lib/course-tools';
import {formatValue} from '@/lib/format';
import {structuralRpc,readCoursesPage,markStructuralRpcUsed} from '@/lib/structural-qa';

type Edition={id:string;nome:string;corso_id:string;stagione_id:string;inizio:string;fine:string;stato:string;direttore_id:string|null;corsi:{nome:string;tipo:string;livello:number|null}|null};
const pageSize=25;
export default async function Courses({searchParams}:{searchParams:Promise<{q?:string;stato?:string;stagione?:string;p?:string;msg?:string;area?:string;disciplina?:string;livello?:string;ordine?:string;vista_corsi?:string}>}){
 const {supabase}=await requireStaff();const p=singleSearchParams(await searchParams);
 const iscrizioni=p.area==='iscrizioni';const base=iscrizioni?'/gestionale/moduli/iscrizioni':'/gestionale/corsi';
 const q=(p.q??'').normalize('NFC').replace(/[^\p{L}\p{N} .-]/gu,'').trim().slice(0,70);
 const stato=COURSE_STATES.find(x=>x===p.stato)??'';
 const disciplina=validDiscipline(p.disciplina),livello=validLevel(p.livello),ordine=['inizio','fine','nome_desc'].includes(p.ordine??'')?p.ordine:'nome';
 const view=courseListView(p.vista_corsi);
 const requested=Math.min(10000,Math.max(1,Number.parseInt(p.p??'1',10)||1));

 const candidate=readCoursesPage(await structuralRpc(supabase,'sc_perf_courses_page',{p_season:p.stagione??'',p_terms:searchTerms(q),p_status:stato,p_discipline:disciplina,p_level:livello,p_order:ordine??'nome',p_page:requested}));
 // PostgREST rejects out-of-range noninitial pages; retain its existing recovery/error semantics.
 const snapshot=requested>1&&candidate?.rows.length===0?null:candidate;
 const readLegacy=async()=>{
 const storicoCatalogoPromise=tutteLePagine((da,a)=>supabase.from('corsi').select('id,nome').eq('duplicato_storico',true).order('id').range(da,a));
 const storicheEdizioniPromise=tutteLePagine((da,a)=>supabase.from('edizioni_corsi').select('id,nome').eq('duplicato_storico',true).order('id').range(da,a));
 const {data:seasons,error:seasonError}=await tutteLePagine((da,a)=>supabase.from('stagioni').select('id,nome,attiva').order('dal',{ascending:false}).order('id').range(da,a));
 const stagione=(seasons??[]).some(s=>s.id===p.stagione)?p.stagione??'':'';
 let query=supabase.from('edizioni_corsi').select('id,nome,corso_id,stagione_id,inizio,fine,stato,direttore_id,corsi!inner(nome,tipo,livello)',{count:'exact'});
 if(stagione)query=query.eq('stagione_id',stagione);
 if(stato)query=query.eq('stato',stato);
 for(const term of searchTerms(q))query=query.ilike('nome','%'+term+'%');
 if(disciplina)query=query.eq('corsi.tipo',disciplina);
 if(livello!==null)query=query.eq('corsi.livello',livello);
 if(ordine==='inizio'||ordine==='fine')query=query.order(ordine,{ascending:false});else query=query.order('nome',{ascending:ordine!=='nome_desc'});
 const {data,error,count}=await query.order('id').range((requested-1)*pageSize,requested*pageSize-1);
 const rows=(data??[]) as unknown as Edition[];const ids=rows.map(x=>x.id);
 const directorIds=[...new Set(rows.map(e=>e.direttore_id).filter((x):x is string=>Boolean(x)))];
 const [{data:enrollments,error:enrollmentError},directors,{data:staff,error:staffError},storiciCatalogo,storicheEdizioni]=await Promise.all([
  ids.length?tutteLePagine((da,a)=>supabase.from('iscrizioni_corsi').select('edizione_id').in('edizione_id',ids).eq('stato','iscritto').order('id').range(da,a)):{data:[],error:null},
  directorIds.length?supabase.from('persone').select('id,nome,cognome').in('id',directorIds):{data:[],error:null},
  ids.length?tutteLePagine((da,a)=>supabase.from('gest_elenco_assegnazioni_istruttori').select('id,edizione_id,ruolo,sort_nome,sort_cognome').in('edizione_id',ids).order('sort_cognome').order('sort_nome').order('id').range(da,a)):{data:[],error:null},
  storicoCatalogoPromise,
  storicheEdizioniPromise
 ]);

 const counts=new Map<string,number>();for(const row of enrollments??[])counts.set(row.edizione_id,(counts.get(row.edizione_id)??0)+1);
  return {seasons,seasonError,stagione,error,count,rows,counts,enrollmentError,directors,staff,staffError,storiciCatalogo,storicheEdizioni};
 };
 if(snapshot)markStructuralRpcUsed('courses-page');
 const {seasons,seasonError,stagione,error,count,rows,counts,enrollmentError,directors,staff,staffError,storiciCatalogo,storicheEdizioni}=snapshot?{
  seasons:snapshot.seasons,seasonError:null,stagione:snapshot.chosen,error:null,count:snapshot.count,rows:snapshot.rows,
  counts:new Map(Object.entries(snapshot.counts)),enrollmentError:null,directors:{data:snapshot.directors,error:null},staff:snapshot.staff,staffError:null,
  storiciCatalogo:{data:snapshot.historicalCatalog,error:null},storicheEdizioni:{data:snapshot.historicalEditions,error:null}
 }:await readLegacy();
 const staffNames=(id:string,role:string)=>staffError?'Non disponibile':(staff??[]).filter(a=>a.edizione_id===id&&a.ruolo===role).map(a=>[a.sort_cognome,a.sort_nome].filter(Boolean).join(' ')).join(', ')||'Da assegnare';

 
 const pageHref=(page:number)=>base+'?'+new URLSearchParams({q,stato,stagione,disciplina,livello:livello===null?'':String(livello),ordine:ordine??'nome',vista_corsi:view,p:String(page)}).toString();
 const viewHref=(mode:typeof view)=>{const params=new URLSearchParams(pageHref(requested).split('?')[1]);params.set('vista_corsi',mode);return base+'?'+params.toString();};
 return <>
 <PageHeader area="teaching" icon="course" marine eyebrow="Corsi e didattica" title={iscrizioni?'Iscrizioni ai corsi':'Gestione corsi'} description={iscrizioni?'Seleziona prima l’edizione per consultare gli allievi.':'Consulta le edizioni, lo staff didattico e lo stato delle iscrizioni.'} actions={<><ButtonLink href="/gestionale/corsi/nuovo" icon="plus">Nuova edizione del corso</ButtonLink><ButtonLink href="/gestionale/moduli/corsi" variant="secondary">Catalogo corsi</ButtonLink></>}/>
 {(storiciCatalogo.error||storicheEdizioni.error)&&<Alert tone="warning">Verifica dei duplicati storici non disponibile.</Alert>}
 {Boolean(storiciCatalogo.data?.length||storicheEdizioni.data?.length)&&<details className="notice warning"><summary>Duplicati storici da verificare</summary><p>Le segnalazioni sono conservate. Un corso annullato può essere uno storico legittimo: confronta i dati prima di qualsiasi modifica.</p><ul>{storiciCatalogo.data?.map(c=><li key={c.id}><Link href={'/gestionale/moduli/corsi?edit='+c.id}>Catalogo · {c.nome}</Link></li>)}{storicheEdizioni.data?.map(e=><li key={e.id}><Link href={'/gestionale/corsi/'+e.id+'?tab=configurazione'}>Edizione · {e.nome}</Link></li>)}</ul></details>}
 {p.msg&&<Alert tone={p.msg==='eliminato'?'success':'warning'} announce>{p.msg==='eliminato'?'Edizione rimossa.':'Operazione non completata. Verifica dati e collegamenti.'}</Alert>}
 <FilterBar><SearchBar query={q} placeholder="Cerca nome edizione" resetHref={base}>
 <input type="hidden" name="vista_corsi" value={view}/>
 <label>Disciplina<select name="disciplina" defaultValue={disciplina}><option value="">Tutte</option><option value="ARA">ARA</option><option value="APNEA">Apnea</option><option value="NUOTO_LIBERO">Nuoto libero</option></select></label>
 <label>Livello ARA<select name="livello" defaultValue={livello??''}><option value="">Tutti</option>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
 <label>Stagione<select name="stagione" defaultValue={stagione}><option value="">Tutte</option>{seasons?.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
 <label>Stato<select name="stato" defaultValue={stato}><option value="">Tutti</option>{COURSE_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
 <label>Ordina per<select name="ordine" defaultValue={ordine}><option value="nome">Nome A–Z</option><option value="nome_desc">Nome Z–A</option><option value="inizio">Inizio più recente</option><option value="fine">Fine più recente</option></select></label>
 </SearchBar></FilterBar>
 <div className="sc-course-list-toolbar"><p role="status">{count===null?'Totale non disponibile':count+' edizioni'} · {view==='schede'?'Vista schede':'Vista tabella'}</p><nav className="sc-course-view-switch" aria-label="Vista corsi"><Link href={viewHref('schede')} aria-current={view==='schede'?'page':undefined}>Schede</Link><Link href={viewHref('tabella')} aria-current={view==='tabella'?'page':undefined}>Tabella</Link></nav></div>
 {error||seasonError?<Alert tone="danger" announce>Impossibile leggere le edizioni con i filtri richiesti.</Alert>:view==='schede'?<>{rows.length?<div className="sc-course-card-grid" aria-label="Edizioni dei corsi">{rows.map(e=>{const n=counts.get(e.id)??0,d=directors.data?.find(p=>p.id===e.direttore_id),href='/gestionale/corsi/'+e.id+(iscrizioni?'?tab=allievi':''),kind=e.corsi?.tipo==='ARA'?'ara':e.corsi?.tipo==='APNEA'?'apnea':e.corsi?.tipo==='NUOTO_LIBERO'?'nuoto':'unknown';return <article key={e.id} className={'sc-card sc-course-card sc-discipline-'+kind}><header><span className="sc-course-discipline"><Icon name={courseDisciplineIcon(e.corsi?.tipo)}/>{e.corsi?courseName(e.corsi.tipo,e.corsi.livello):'Disciplina non disponibile'}</span><StatusBadge tone={e.stato==='annullato'?'danger':statusTone(e.stato)}>{e.stato}</StatusBadge></header><h2><Link href={href}>{e.nome}</Link></h2><p className="sc-course-period"><Icon name="calendar"/>{formatValue(e.inizio)} – {formatValue(e.fine)}</p><p className="tiny muted">{seasons?.find(s=>s.id===e.stagione_id)?.nome??'Stagione non disponibile'}</p><div className="sc-course-enrollment"><strong>{enrollmentError?'—':n} iscritti</strong></div><dl className="sc-course-team"><dt>Direttore</dt><dd>{e.direttore_id?(d?d.cognome+' '+d.nome:'Non disponibile'):'Da assegnare'}</dd><dt>Responsabile</dt><dd>{staffNames(e.id,'responsabile')}</dd><dt>Aiuto-istruttori</dt><dd>{staffNames(e.id,'aiuto')}</dd></dl><div className="sc-course-card-actions"><ButtonLink href={href} icon="chevron-right">{iscrizioni?'Apri iscrizioni':'Apri corso'}</ButtonLink>{!iscrizioni&&<ButtonLink href={href+'?tab=allievi'} variant="secondary" icon="users">Iscrizioni</ButtonLink>}</div></article>;})}</div>:<EmptyState title="Nessuna edizione con questi filtri." description="Modifica o azzera i filtri per visualizzare altre edizioni."/>}</>:<DataTable label="Edizioni dei corsi" mobileCards><thead role="rowgroup"><tr role="row">{['Edizione','Disciplina','Stagione','Periodo','Direttore / staff','Iscritti','Stato','Azioni'].map(l=><th key={l} role="columnheader" scope="col">{l}</th>)}</tr></thead><tbody role="rowgroup">
 {rows.map(e=>{const n=counts.get(e.id)??0,d=directors.data?.find(p=>p.id===e.direttore_id),href='/gestionale/corsi/'+e.id+(iscrizioni?'?tab=allievi':'');return <tr key={e.id} role="row"><td role="cell" data-label="Edizione"><Link href={href}><strong>{e.nome}</strong></Link></td><td role="cell" data-label="Disciplina">{e.corsi?courseName(e.corsi.tipo,e.corsi.livello):'Catalogo non disponibile'}</td><td role="cell" data-label="Stagione">{seasons?.find(s=>s.id===e.stagione_id)?.nome??'Non disponibile'}</td><td role="cell" data-label="Periodo">{formatValue(e.inizio)} – {formatValue(e.fine)}</td><td role="cell" data-label="Direttore / staff"><div><strong>Direttore:</strong> {e.direttore_id?(d?d.cognome+' '+d.nome:'Non disponibile'):'Da assegnare'}</div><div><strong>Responsabile:</strong> {staffNames(e.id,'responsabile')}</div><div><strong>Aiuto-istruttori:</strong> {staffNames(e.id,'aiuto')}</div></td><td role="cell" data-label="Iscritti"><strong>{enrollmentError?'—':n} iscritti</strong></td><td role="cell" data-label="Stato"><StatusBadge tone={e.stato==='annullato'?'danger':statusTone(e.stato)}>{e.stato}</StatusBadge></td><td role="cell" data-label="Azioni"><ButtonLink href={href} variant="secondary">{iscrizioni?'Apri iscrizioni':'Apri corso'}</ButtonLink></td></tr>;})}
 {!rows.length&&<tr><td colSpan={8} className="empty-cell">Nessuna edizione con questi filtri.</td></tr>}</tbody></DataTable>}
 <Pagination page={requested} size={pageSize} count={error||seasonError?null:count} href={pageHref} label="edizioni"/>
 {(enrollmentError||directors.error||staffError)&&<Alert tone="warning">Alcuni nominativi o conteggi non sono disponibili.</Alert>}
 <p className="tiny muted">Il conteggio include solo le iscrizioni in stato «iscritto». Le edizioni annullate restano consultabili.</p>
 </>;
}
