import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(path,dependencies={}){
 const js=ts.transpileModule(read(path),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};new Function('exports','require',js)(exports,id=>dependencies[id]??require(id));return exports;
}
const h=load('lib/course-ui.ts'),courseTools=load('lib/course-tools.ts'),pages=load('lib/pagine.ts');
const calendar=load('lib/calendar-tools.ts',{'./course-tools':courseTools});
const ed='12345678-1234-4234-8234-123456789abc',person='11111111-1111-4111-8111-111111111111',season='22222222-2222-4222-8222-222222222222',lesson='33333333-3333-4333-8333-333333333333';
function form(entries){const f=new FormData();for(const [k,v] of Object.entries(entries))f.set(k,v);return f;}
function actions(db){return load('app/gestionale/corsi/actions.ts',{'@/lib/course-ui':h,'@/lib/calendar-tools':calendar,'@/lib/course-tools':courseTools,'@/lib/pagine':pages,'@/lib/course-errors':{courseDuplicate:async()=>null},'@/lib/security':{requireStaff:async()=>({supabase:db})},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:href=>{throw Error('REDIRECT '+href);}}});}
function chain(data){const q={select:()=>q,eq:()=>q,is:()=>q,in:()=>q,order:()=>q,maybeSingle:async()=>({data,error:null}),limit:async()=>({data,error:null}),range:async()=>({data,error:null})};return q;}
test('Dieci viste URL e compatibilità dei collegamenti storici',()=>{
 assert.equal(h.courseTabs.length,10);
 assert.equal(h.courseTab(undefined,'iscritto'),'allievi');assert.equal(h.courseTab(undefined,'lezione_creata'),'lezioni');
 assert.equal(h.courseTab(undefined,undefined,lesson),'presenze');assert.equal(h.courseTab('brevetti','iscritto'),'brevetti');
 assert.equal(h.courseTab('__proto__'),'panoramica');assert.equal(h.legacyCourseTab('#composizione'),'lezioni');assert.equal(h.legacyCourseTab('#allievi'),'allievi');
 const s=read('app/gestionale/corsi/[id]/page.tsx');for(const [tab] of h.courseTabs)assert.match(s,new RegExp("tab==='"+tab+"'"));
 assert.match(s,/aria-current=\{tab===key\?'page':undefined\}/);assert.match(s,/<CourseLegacyAnchor\/>/);
 assert.match(h.courseViewHref(ed,'presenze','presenze_salvate',lesson),/tab=presenze&msg=presenze_salvate&lezione=/);
});
test('Filtri disciplina e livello con whitelist; paginazione conserva sezione e filtri',()=>{
 assert.equal(h.validDiscipline('ARA'),'ARA');assert.equal(h.validDiscipline('arbitrario'),'');
 assert.equal(h.validLevel('5'),5);assert.equal(h.validLevel('6'),null);
 const s=read('app/gestionale/corsi/page.tsx');assert.match(s,/corsi!inner/);assert.match(s,/eq\('corsi\.tipo',disciplina\)/);assert.match(s,/eq\('corsi\.livello',livello\)/);
 assert.match(s,/count:'exact'/);assert.match(s,/enrollmentError\?'—':n/);assert.match(s,/iscrizioni\?'\/gestionale\/moduli\/iscrizioni':'\/gestionale\/corsi'/);
 assert.match(s,/\?tab=allievi/);assert.match(s,/disciplina,livello:livello===null/);
});
test('Requisiti di iscrizione e contatto di emergenza: storico non confuso con ammissibilità',()=>{
 const base={isDirector:false,alreadyEnrolled:false,eligible:true,membership:'attiva',hasValidCard:true};
 assert.equal(h.enrollmentEligibility(base),'');
 assert.match(h.enrollmentEligibility({...base,isDirector:true}),/Direttore/);
 assert.match(h.enrollmentEligibility({...base,alreadyEnrolled:true}),/già registrata/);
 assert.match(h.enrollmentEligibility({...base,eligible:false,membership:null}),/Adesione assente/);
 assert.match(h.enrollmentEligibility({...base,eligible:false,hasValidCard:false}),/Tesseramento/);
 assert.match(h.enrollmentEligibility({...base,unavailable:true}),/non verificabili/);
 assert.equal(h.emergencyPair('',''),true);assert.equal(h.emergencyPair('Nome',''),false);
 assert.equal(h.emergencyPair('','123456'),false);assert.equal(h.emergencyPair('Nome','123456'),true);
});
test('Letture a blocchi: oltre 100 ID, oltre 500 righe, deduplica ed errore non parziale',async()=>{
 const ids=Array.from({length:105},(_,i)=>'id'+i);
 const calls=[];const out=await h.readCourseChunks([...ids,ids[0]],async(keys,from,to)=>{calls.push([keys.length,from,to]);return {data:keys.length===100&&from===0?Array.from({length:500},(_,i)=>i):[1,2],error:null};});
 assert.deepEqual(calls,[[100,0,499],[100,500,999],[5,0,499]]);assert.equal(out.data.length,504);
 const failed=await h.readCourseChunks(ids,async keys=>keys.length===100?{data:[1],error:null}:{data:null,error:'errore'});assert.equal(failed.data,null);assert.equal(failed.error,'errore');
});
test('Azioni: direttore e requisiti mancanti non invocano RPC; contatto separato dall’iscrizione',async()=>{
 let director=person,eligible=true,qualified=false,assigned=false,calls=[];
 const db={from:table=>table==='edizioni_corsi'?chain({stagione_id:season,stato:'attivo',direttore_id:director}):table==='gest_soci_iscrivibili'?chain(eligible?[{persona_id:person}]:[]):table==='qualifiche_istruttori'?chain(qualified?[{id:person}]:[]):table==='assegnazioni_istruttori'?chain(assigned?[{id:person}]:[]):(()=>{throw Error('Tabella mock non prevista: '+table)})(),rpc:async(...args)=>{calls.push(args);return {error:null};}};
 const a=actions(db),f=form({edizione_id:ed,persona_id:person,stato:'iscritto',emergenza_nome:'Nome'});
 assert.match((await a.addEnrollment(f)).error,/direttore/i);director=ed;
 eligible=false;
 assert.match((await a.addEnrollment(f)).error,/adesione/i);assert.equal(calls.length,0);
 eligible=true; // Il campo legacy eventualmente inviato deve essere ignorato.
 await assert.rejects(a.addEnrollment(f),/REDIRECT.*msg=iscritto/);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'iscrivi_con_contatto');assert.equal(calls[0][1].p_nome,'');assert.equal(calls[0][1].p_telefono,'');
 qualified=true;assert.match((await a.addEnrollment(f)).error,/deroga/i);assert.equal(calls.length,1);
 f.set('deroga_istruttore','on');f.set('deroga_motivo','Istruttore ARA in corso APNEA');assigned=true;
 assert.match((await a.addEnrollment(f)).error,/stessa edizione/i);assert.equal(calls.length,1);
 assigned=false;await assert.rejects(a.addEnrollment(f),/REDIRECT.*msg=iscritto/);
 assert.equal(calls.length,2);assert.equal(calls[1][0],'iscrivi_con_deroga');assert.equal(calls[1][1].p_motivo,'Istruttore ARA in corso APNEA');
});
test('Creazione lezione: orario italiano, tipo coerente, RPC atomica e messaggio conflitto',async()=>{
 const calls=[];let error=null;
 const a=actions({rpc:async(...args)=>{calls.push(args);return {data:lesson,error};}});
 const f=form({edizione_id:ed,titolo:'Teoria',inizio:'2026-11-26T10:00',fine:'2026-11-26T11:00',tipo_lezione:'teoria'});
 f.set('piscina_id',season);assert.match((await a.createLesson(f)).error,/piscina/);assert.equal(calls.length,0);
 f.delete('piscina_id');f.set('inizio','2026-10-25T02:30');assert.ok((await a.createLesson(f)).error);assert.equal(calls.length,0);
 f.set('inizio','2026-11-26T10:00');error={code:'23P01'};assert.match((await a.createLesson(f)).error,/Nessuna lezione creata/);
 error=null;await assert.rejects(a.createLesson(f),/tab=lezioni.*lezione=/);
 assert.equal(calls[1][0],'crea_lezione_guidata');assert.equal(calls[1][1].p_inizio,'2026-11-26T09:00:00.000Z');assert.deepEqual(calls[1][1].p_corsie,[]);
});
test('Presenze: salva solo i valori espliciti degli allievi ammessi, ritorna alla stessa lezione',async()=>{
 let written;
 const db={from:table=>table==='lezioni'?chain({id:lesson}):table==='iscrizioni_corsi'?chain([{persona_id:person},{persona_id:season}]):{upsert:async(rows,opts)=>{written={rows,opts};return {error:null};}}};
 const a=actions(db),f=form({edizione_id:ed,lezione_id:lesson,pagina:'2',['pres_'+person]:'si',['pres_'+season]:'',['pres_'+ed]:'no'});
 await assert.rejects(a.recordClassAttendance(f),/tab=presenze.*lezione=.*&p=2/);
 assert.deepEqual(written,{rows:[{lezione_id:lesson,persona_id:person,presente:true}],opts:{onConflict:'lezione_id,persona_id'}});
});
test('Vincoli SQL già presenti e versioni protette; stampe complete o errore',()=>{
 const sql=read('supabase/migrations/20261125223000_patch_0019.sql');
 assert.match(sql,/create unique index catalogo_identita/);assert.match(sql,/create unique index edizione_identita/);assert.match(sql,/create trigger direttore_edizione/);assert.match(sql,/create trigger direttore_allievo/);
 assert.match(sql,/select direttore_id into direttore.*for update/);assert.match(sql,/create function public\.firma_brevetto/);
 const m=read('app/gestionale/moduli/[modulo]/page.tsx');assert.match(m,/lockedVersion&&f.name!=='stato'/);assert.match(m,/!lockedVersion&&<RemoveRecord/);
 const f=read('app/gestionale/corsi/[id]/stampe/route.ts');assert.match(f,/tutteLePagine/);assert.match(f,/readCourseChunks/);assert.match(f,/Registro incompleto/);assert.match(f,/Cache-Control':'private, no-store'/);
 const l=read('components/LessonComposer.tsx');assert.match(l,/Sposta modulo in alto/);assert.match(l,/Sposta modulo in basso/);assert.match(l,/data-dirty-track/);
});

test('F4A: vista corsi validata, conteggio effettivo senza capienza e filtri conservati',()=>{
 assert.equal(h.courseListView(undefined),'schede');assert.equal(h.courseListView('tabella'),'tabella');assert.equal(h.courseListView('elenco'),'schede');
 assert.equal(h.courseCapacity(0,15),0);assert.equal(h.courseCapacity(5,15),33);assert.equal(h.courseCapacity(20,15),100);assert.equal(h.courseCapacity(null,15),null);assert.equal(h.courseCapacity(3,0),null);
 const s=read('app/gestionale/corsi/page.tsx');assert.match(s,/vista_corsi:view/);assert.match(s,/params\.set\('vista_corsi',mode\)/);assert.match(s,/name="vista_corsi" value=\{view\}/);assert.match(s,/enrollmentError\?'—':n/);assert.doesNotMatch(s,/massimo_partecipanti|courseCapacity|<progress/);assert.match(s,/aria-label="Vista corsi"/);
 const detail=read('app/gestionale/corsi/[id]/page.tsx');assert.match(detail,/Prossime lezioni/);assert.match(detail,/lessonError\?<Alert/);assert.match(detail,/Date.parse\(l.inizio\)>=Date.now\(\)/);
});

test('F4A: icone didattiche distinte e accesso diretto alle iscrizioni',()=>{
 assert.deepEqual(['ARA','APNEA','NUOTO_LIBERO','altro'].map(h.courseDisciplineIcon),['ara','apnea','nuoto','course']);
 const s=read('app/gestionale/corsi/page.tsx');assert.match(s,/courseDisciplineIcon\(e.corsi\?\.tipo\)/);assert.match(s,/href=\{href\+'\?tab=allievi'\}/);assert.match(s,/const pageHref=\(page:number\)=>base\+/);
});
