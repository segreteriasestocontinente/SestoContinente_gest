import {tutteLePagine} from '@/lib/pagine';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {formatValue} from '@/lib/format';
import EditForm from '@/components/EditForm';
import Link from 'next/link';
import {PageHeader} from '@/components/ui/Primitives';
import {requireStaff} from '@/lib/security';
import {createCatalogCourse,createEdition} from '../actions';
import {courseName} from '@/lib/course-tools';
export default async function NewEdition({searchParams}:{searchParams:Promise<{msg?:string}>}){
 const {supabase}=await requireStaff();const {msg}=await searchParams;
 const {data:people,error:peopleError}=await tutteLePagine((da,a)=>supabase.from('persone').select('id,cognome,nome').order('cognome').order('nome').order('id').range(da,a));
 const [{data:catalog,error:catalogError},{data:seasons,error:seasonError},{data:prices}]=await Promise.all([
  tutteLePagine((da,a)=>supabase.from('corsi').select('id,nome,tipo,livello').order('tipo').order('livello').order('id').range(da,a)),
  tutteLePagine((da,a)=>supabase.from('stagioni').select('id,nome,dal,al,attiva').order('dal',{ascending:false}).order('id').range(da,a)),
  supabase.from('listino_corsi').select('importo').order('importo').limit(100)
 ]);
 return <><Link href="/gestionale/corsi" className="back-link">← Gestione corsi</Link>
 <PageHeader area="teaching" icon="course" marine eyebrow="Creazione guidata" title="Nuova edizione di corso" description="Seleziona un’attività del catalogo e crea l’edizione della stagione. La prima volta puoi aggiungere l’attività al catalogo qui sotto."/>
 {msg==='catalogo'&&<p className="notice success">Attività aggiunta al catalogo. Ora puoi creare l'edizione.</p>}
 {msg==='errore'&&<p className="notice warning">Non è stato possibile salvare. Verifica i dati e i duplicati.</p>}
 {msg==='stagione'&&<p className="notice warning">Le date dell'edizione devono rientrare nelle date della stagione selezionata.</p>}
 {(peopleError||catalogError||seasonError)&&<p role="alert" className="notice error">Non è stato possibile leggere gli elenchi necessari. Riprova prima di creare l’edizione.</p>}
 <div className="course-wizard-grid"><section className="panel"><h2>1. Configura l'edizione</h2>
 <EditForm action={createEdition} className="stack">
 <label>Attività del catalogo<select name="corso_id" required defaultValue=""><option value="">Seleziona attività...</option>{(catalog??[]).map(c=><option key={c.id} value={c.id}>{courseName(c.tipo,c.livello)} · {c.nome}</option>)}</select></label>
 <label>Stagione<select name="stagione_id" required defaultValue={(seasons??[]).find(s=>s.attiva)?.id??''}><option value="">Seleziona...</option>{(seasons??[]).map(s=><option key={s.id} value={s.id}>{s.nome} ({formatValue(s.dal)} – {formatValue(s.al)})</option>)}</select></label>
 <div className="sc-field"><label htmlFor="nuovo-direttore">Direttore del corso</label><SearchableSelect id="nuovo-direttore" name="direttore_id" label="Direttore" required options={(people??[]).map(p=>({value:p.id,label:p.cognome+" "+p.nome}))}/></div>
 <label>Nome edizione<input name="nome" maxLength={160} required placeholder="Es. ARA 1 – Martedì sera"/></label>
 <div className="form-grid"><label>Dal<input type="date" name="inizio" required/></label><label>Al<input type="date" name="fine" required/></label></div>
 <label>Costo del corso (€)<input name="costo_corso" list="listino-corso" type="number" step="0.01" min="0" required placeholder="Seleziona o inserisci un importo"/></label>
 <datalist id="listino-corso">{prices?.map(p=><option key={p.importo} value={p.importo}/>)}</datalist>
 <label>Note organizzative<textarea name="note" maxLength={2000} rows={3}/></label>
 <div className="notice">La nuova edizione viene creata in stato <strong>programmato</strong>. Nella scheda potrai aggiungere istruttori, partecipanti e lezioni.</div>
 <div className="form-actions"><button className="button" disabled={!catalog?.length||!seasons?.length||!people?.length}>Crea edizione</button><Link className="button ghost" href="/gestionale/corsi">Annulla / Torna indietro</Link></div>
 </EditForm></section>
 <aside className="panel"><h2>2. Nuova attività di catalogo</h2><p className="muted tiny">Da usare solo se ARA, apnea o nuoto libero non sono già presenti nel catalogo.</p>
 <EditForm action={createCatalogCourse} className="stack">
 <label>Nome dell'attività<input name="nome" maxLength={150} required placeholder="Es. ARA secondo livello"/></label>
 <label>Disciplina<select name="tipo" required><option value="ARA">ARA</option><option value="APNEA">Apnea</option><option value="NUOTO_LIBERO">Nuoto libero</option></select></label>
 <label>Livello ARA (solo per ARA)<select name="livello"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>
 <label>Descrizione<textarea name="descrizione" maxLength={1000} rows={3}/></label>
 <div className="form-actions"><button className="button ghost">Aggiungi al catalogo</button><Link className="button ghost" href="/gestionale/corsi">Annulla / Torna indietro</Link></div></EditForm>
 <p className="tiny muted">Le date e il livello vengono verificati anche sul server. Per creare una stagione, utilizza il modulo Stagioni.</p><Link href="/gestionale/moduli/stagioni">Gestisci stagioni</Link>
 </aside></div></>;
}
