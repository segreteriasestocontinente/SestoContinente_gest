import EditForm from '@/components/EditForm';
import SceltaImmagini from '@/components/SceltaImmagini';
import {applicationLegalConfig} from '@/lib/application-config';
import {versioneImmagini,dataOra} from '@/lib/scelte';
import {consentStatus} from '@/lib/application-input';
import {PageHeader,Alert} from '@/components/ui/Primitives';
import {cambiaScelta} from './immagini';
import Link from 'next/link';
import {requireUser} from '@/lib/security';
import {updateContact,updateEmergencyContact,requestIdentityCorrection,saveExternalPatent,changeLoginEmail} from './actions';
type Patent={id:string;persona_id:string;titolo:string;ente:string|null;numero_brevetto:string|null;ottenuto_il:string|null;scade_il:string|null;origine:string|null;stato_verifica:string;centro_rilascio:string|null;istruttore_esterno:string|null;edizione_id:string|null;note:string|null};
const labels:Record<string,string>={in_attesa:'In attesa di verifica',verificato:'Verificato',respinto:'Da correggere',respinta:'Da correggere',applicata:'Modifica approvata'};
function PatentForm({person,record}:{person:string;record?:Patent}){
 return <EditForm action={saveExternalPatent} successHref="/area-personale/profilo?msg=brevetto_ok" className="stack"><input type="hidden" name="persona_id" value={person}/>{record&&<input type="hidden" name="brevetto_id" value={record.id}/>}
 <div className="form-grid"><label>Brevetto / livello<input name="titolo" required maxLength={200} defaultValue={record?.titolo??''} placeholder="Es. Open Water Diver"/></label>
 <label>Didattica / ente<input name="ente" required maxLength={120} defaultValue={record?.ente??''} placeholder="Es. PADI, SSI, FIPSAS"/></label>
 <label>Numero brevetto<input name="numero_brevetto" maxLength={100} defaultValue={record?.numero_brevetto??''}/></label>
 <label>Centro / scuola di rilascio<input name="centro_rilascio" maxLength={200} defaultValue={record?.centro_rilascio??''}/></label>
 <label>Istruttore esterno<input name="istruttore_esterno" maxLength={160} defaultValue={record?.istruttore_esterno??''}/></label>
 <label>Conseguito il<input type="date" name="ottenuto_il" defaultValue={record?.ottenuto_il??''}/></label>
 <label>Scadenza (se prevista)<input type="date" name="scade_il" defaultValue={record?.scade_il??''}/></label></div>
 <label>Note<textarea name="note" maxLength={1000} rows={2} defaultValue={record?.note??''}/></label>
 <button className="button">{record?'Salva e invia nuovamente':'Registra brevetto esterno'}</button></EditForm>;
}
export default async function MyProfile({searchParams}:{searchParams:Promise<{msg?:string}>}){
 const {supabase,user}=await requireUser();const {msg}=await searchParams;
 const {data:links,error:linkError}=await supabase.from('collegamenti_persone').select('persona_id').eq('utente_id',user.id);
 const legal=applicationLegalConfig(user.id),version=legal.testMode?'TEST-COLLAUDO-1':versioneImmagini;
 const {data:ultima,error:sceltaError}=await supabase.from('scelte_iscrizione').select('id,scelta,versione,registrata_il,origine').eq('utente_id',user.id).eq('tipo','immagini').order('id',{ascending:false}).limit(1).maybeSingle();
 const scelta=ultima?.versione===version?ultima:null;
 const previous=scelta?.scelta===false?await supabase.from('scelte_iscrizione').select('id',{head:true,count:'exact'}).eq('utente_id',user.id).eq('tipo','immagini').eq('versione',version).eq('scelta',true).lt('id',scelta.id):null;
 const ids=links?.map(x=>x.persona_id)??[];
 const [{data:people,error:peopleError},{data:contacts,error:contactsError},{data:corrections,error:correctionError},{data:patents,error:patentError}]=await Promise.all([
 ids.length?supabase.from('persone').select('id,nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,telefono,indirizzo,cap,comune,provincia_residenza,stato_residenza,email').in('id',ids):Promise.resolve({data:[],error:null}),
 ids.length?supabase.from('contatti_emergenza').select('persona_id,nominativo,telefono').in('persona_id',ids):Promise.resolve({data:[],error:null}),
 ids.length?supabase.from('rettifiche_anagrafiche').select('id,persona_id,richiedente_id,nome,cognome,data_nascita,luogo_nascita,provincia_nascita,stato_nascita,sesso_cf,codice_fiscale,stato,creata_il,motivazione_esito,revisione').in('persona_id',ids).order('creata_il',{ascending:false}):Promise.resolve({data:[],error:null}),
 ids.length?supabase.from('brevetti_allievi').select('id,persona_id,titolo,ente,numero_brevetto,ottenuto_il,scade_il,origine,stato_verifica,centro_rilascio,istruttore_esterno,edizione_id,note').in('persona_id',ids).order('ottenuto_il',{ascending:false}):Promise.resolve({data:[],error:null})
 ]);
 const messages:Record<string,string>={email_richiesta:'Richiesta di cambio email avviata. Segui i link di conferma ricevuti; fino al completamento usa il vecchio indirizzo.',email_verifica:'Verifica ricevuta. Controlla l’indirizzo di accesso mostrato qui e completa eventuali ulteriori conferme.',ok:'Recapiti salvati.',emergenza_ok:'Contatto di emergenza salvato.',rettifica_ok:'Rettifica anagrafica inviata alla segreteria.',brevetto_ok:'Brevetto esterno registrato. È in attesa di verifica.'};
 return <div className="container narrow"><Link className="back-link" href={ids.length?'/area-personale':'/richiesta/stato'}>{ids.length?'← Area personale':'← La mia domanda'}</Link>
 <PageHeader area="secretariat" icon="user" marine eyebrow="Profilo" title="Impostazioni personali" description="Gestisci i tuoi dati, la sicurezza, i contatti di emergenza e i brevetti."/>
 {msg&&messages[msg]&&<p role="status" className="notice success">{messages[msg]}</p>}
 {(linkError||peopleError)&&<p role="alert" className="notice error">Impossibile caricare il profilo. Riprova.</p>}
 <section className="sc-card"><h2>Account e sicurezza</h2><p>Email di accesso: <strong>{user.email??'—'}</strong></p><p className="muted">L’email di contatto è separata dall’indirizzo utilizzato per accedere.</p><Link className="button ghost" href="/nuova-password">Cambia password</Link><details><summary>Modifica email di accesso</summary><p className="muted">Per sicurezza devi confermare la password e seguire le istruzioni inviate via email. Il profilo e i ruoli non cambiano.</p>{user.new_email&&<p role="status">Cambio in attesa di conferma: {user.new_email}</p>}<EditForm action={changeLoginEmail} successHref="/area-personale/profilo?msg=email_richiesta" className="stack"><label>Nuova email<input type="email" name="nuova_email" autoComplete="email" required maxLength={254}/></label><label>Conferma nuova email<input type="email" name="conferma_email" required maxLength={254}/></label><label>Password attuale<input type="password" name="password_attuale" autoComplete="current-password" required/></label><button className="button">Richiedi cambio email</button></EditForm></details></section>
 <section className="sc-card"><h2>Consenso foto e video</h2>{legal.testMode&&<p className="notice warning">COLLAUDO — scelta simulata.</p>}{sceltaError?<p role="alert">Scelta non disponibile. Riprova prima di modificare il consenso.</p>:<><p role="status">{previous?.error?'Stato storico non verificabile':consentStatus(scelta?.scelta,(previous?.count??0)>0)}{scelta?.versione?' · '+scelta.versione:''} {dataOra(scelta?.registrata_il)}{scelta?.origine?' · Origine: '+scelta.origine:scelta?' · Origine non registrata':''}</p>{ultima&&!scelta&&<p className="tiny muted">La scelta precedente appartiene a un’altra versione: non è acquisita per quella corrente.</p>}<EditForm key={String(ultima?.id??'new')} action={cambiaScelta}><SceltaImmagini value={scelta?.scelta} test={legal.testMode} expectedId={ultima?String(ultima.id):null}/><button type="submit" className="button">Salva scelta</button></EditForm></>}</section>
 {people?.map(p=>{const pending=corrections?.find(c=>c.persona_id===p.id&&c.stato==='in_attesa'),latest=pending??corrections?.find(c=>c.persona_id===p.id);
 const identity=pending??(latest?.stato==='respinta'?latest:p);const emergency=contacts?.find(c=>c.persona_id===p.id);
 return <div key={p.id} className="stack"><h2>{p.cognome} {p.nome}</h2>
 <section className="sc-card"><h3>Anagrafica</h3><p className="muted">Puoi modificare tutti i dati anagrafici. Per proteggere il codice fiscale e i documenti associativi, le rettifiche sono verificate dalla segreteria.</p>
 {latest&&<p role="status" className="notice">{labels[latest.stato]??latest.stato}{latest.motivazione_esito?' · '+latest.motivazione_esito:''}</p>}
 {correctionError?<p role="alert">Impossibile caricare le rettifiche.</p>:pending&&pending.richiedente_id!==user.id?<p>Un altro account collegato ha già inviato una rettifica.</p>:<EditForm key={p.id+":"+(pending?.revisione??"nuova")+":"+(latest?.id??"nessuna")} action={requestIdentityCorrection} successHref="/area-personale/profilo?msg=rettifica_ok" className="stack" showValidationErrors><input type="hidden" name="persona_id" value={p.id}/>{pending&&<input type="hidden" name="revisione" value={pending.revisione}/>}<div className="form-grid">
 <label>Nome<input name="nome" required maxLength={100} defaultValue={identity.nome}/></label><label>Cognome<input name="cognome" required maxLength={100} defaultValue={identity.cognome}/></label>
 <label>Data di nascita<input type="date" name="data_nascita" defaultValue={identity.data_nascita??''}/></label><label>Comune / luogo di nascita<input name="luogo_nascita" maxLength={150} defaultValue={identity.luogo_nascita??''}/></label>
 <label>Provincia di nascita<input name="provincia_nascita" maxLength={2} defaultValue={identity.provincia_nascita??''}/></label><label>Stato di nascita<input name="stato_nascita" maxLength={100} defaultValue={identity.stato_nascita??''}/></label>
 <label>Sesso ai fini del CF<select name="sesso_cf" defaultValue={identity.sesso_cf??''}><option value="">Non indicato</option><option value="M">M</option><option value="F">F</option></select></label>
 <label>Codice fiscale<input name="codice_fiscale" maxLength={16} defaultValue={identity.codice_fiscale??''}/></label></div>
 <button className="button">{pending?'Aggiorna rettifica':'Richiedi modifica anagrafica'}</button></EditForm>}</section>
 <section className="sc-card"><h3>Residenza e recapiti</h3><EditForm action={updateContact} successHref="/area-personale/profilo?msg=ok" className="stack"><input type="hidden" name="persona_id" value={p.id}/>
 <div className="form-grid"><label>Telefono<input type="tel" name="telefono" maxLength={30} defaultValue={p.telefono??''}/></label><label>Email di contatto<input type="email" name="email" maxLength={254} defaultValue={p.email??''}/></label>
 <label>Indirizzo di residenza<input name="indirizzo" maxLength={250} defaultValue={p.indirizzo??''}/></label>
 <label>CAP<input name="cap" maxLength={10} defaultValue={p.cap??''}/></label><label>Comune<input name="comune" maxLength={100} defaultValue={p.comune??''}/></label>
 <label>Provincia<input name="provincia_residenza" maxLength={2} defaultValue={p.provincia_residenza??''}/></label><label>Stato di residenza<input name="stato_residenza" maxLength={15} defaultValue={p.stato_residenza??''}/></label></div>
 <button className="button">Salva recapiti</button></EditForm></section>
 <section className="sc-card"><h3>Contatto di emergenza</h3><p className="muted">Aggiorna la persona da contattare in caso di necessità. Il dato vale per tutti i corsi.</p>
 {contactsError?<p role="alert">Impossibile caricare il contatto. Riprova prima di modificarlo.</p>:<EditForm action={updateEmergencyContact} successHref="/area-personale/profilo?msg=emergenza_ok" className="stack"><input type="hidden" name="persona_id" value={p.id}/><div className="form-grid"><label>Nome e cognome<input name="emergenza_nome" required minLength={2} maxLength={160} defaultValue={emergency?.nominativo??''}/></label><label>Numero di telefono<input type="tel" name="emergenza_telefono" required minLength={5} maxLength={32} defaultValue={emergency?.telefono??''}/></label></div><button className="button">Salva contatto di emergenza</button></EditForm>}</section>
 <section className="sc-card"><h3>Brevetti conseguiti</h3><p className="muted">Consulta i brevetti interni e registra quelli conseguiti presso altri centri o didattiche. La segreteria verifica i brevetti esterni.</p>
 {patentError?<p role="alert">Impossibile caricare i brevetti.</p>:<>{(patents??[]).filter(b=>b.persona_id===p.id).map(b=><div className="timeline-item" key={b.id}><strong>{b.titolo} · {b.ente??'Ente non indicato'}</strong><p>{b.origine==='esterno'?'Esterno':b.edizione_id?'Interno':'Storico'} · {labels[b.stato_verifica]??b.stato_verifica}{b.numero_brevetto?' · '+b.numero_brevetto:''}{b.ottenuto_il?' · '+b.ottenuto_il:''}</p>{b.origine==='esterno'&&['in_attesa','respinto'].includes(b.stato_verifica)&&<details><summary>Modifica brevetto</summary><PatentForm person={p.id} record={b}/></details>}</div>)}
 <details><summary>Aggiungi brevetto esterno</summary><PatentForm person={p.id}/></details></>}</section></div>})}
 <section className="sc-card"><h2>Documenti personali</h2><div className="buttons"><Link className="button ghost" href="/area-personale/certificato">Certificato medico</Link><Link className="button ghost" href="/documenti">I miei documenti</Link></div></section>
 </div>;
}
