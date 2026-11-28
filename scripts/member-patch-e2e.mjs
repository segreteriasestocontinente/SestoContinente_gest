// Solo browser e Supabase locale, dati fittizi. Non usa segreti o URL di produzione.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium,webkit,devices} from 'playwright';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const origin='http://127.0.0.1:3314',output='artifacts/member-patch-e2e';
if(process.env.MEMBER_QA_LOCAL_ONLY!=='1'||!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!anon||!service)throw Error('Solo Supabase locale con credenziali effimere');
await mkdir(output,{recursive:true});
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),password='LocalQA-'+randomUUID(),run=randomUUID().slice(0,8),report=[];
const check=(condition,label)=>{assert.ok(condition,label);report.push(label);console.log('PASS '+label);};
async function ok(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
async function account(role,suffix=role){
 const email='memberqa-'+run+'-'+suffix+'@example.invalid';
 const {user}=await ok(db.auth.admin.createUser({email,password,email_confirm:true}));
 await ok(db.from('ruoli_utente').insert({utente_id:user.id,ruolo:role}));
 return {id:user.id,email,role};
}
async function person(account,label,relation='titolare'){
 const id=randomUUID();await ok(db.from('persone').insert({id,nome:'Collaudo',cognome:label}));
 if(account)await ok(db.from('collegamenti_persone').insert({persona_id:id,utente_id:account.id,relazione:relation}));
 return {id,label};
}
async function session(a){const c=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});await ok(c.auth.signInWithPassword({email:a.email,password}));return c;}
const date=offset=>{const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const roleNames=['amministratore','segreteria','istruttore','socio','tutore','consigliere_cda'];
const accounts=await Promise.all(roleNames.map(role=>account(role)));
const [admin,staff,instructor,member,guardian,board]=accounts,other=await account('socio','other');
const people=await Promise.all(accounts.map(a=>person(a,'QA '+a.role,a.role==='tutore'?'tutore':'titolare')));
const [adminPerson,staffPerson,director,student,child,boardPerson]=people,unrelated=await person(other,'QA altro');
const season=(await ok(db.from('stagioni').insert({nome:'QA '+run,dal:date(-30),al:date(120),attiva:false}).select('id').single())).id;
const adhesion=(await ok(db.from('adesioni').insert({persona_id:student.id,stagione_id:season,stato:'da_perfezionare'}).select('id').single())).id;
for(const p of [child,unrelated,director]){
 const ad=(await ok(db.from('adesioni').insert({persona_id:p.id,stagione_id:season,stato:'attiva'}).select('id').single())).id;
 await ok(db.from('tesseramenti').insert({adesione_id:ad,ente:'QA',stato:'attiva',scade_il:date(100)}));
}
const catalog=(await ok(db.from('corsi').insert({nome:'QA Apnea '+run,tipo:'APNEA'}).select('id').single())).id;
const editionName='QA Corso '+run;
const edition=(await ok(db.from('edizioni_corsi').insert({corso_id:catalog,stagione_id:season,nome:editionName,inizio:date(0),fine:date(30),direttore_id:director.id,massimo_partecipanti:1,costo_corso:0}).select('id').single())).id;
const studentClient=await session(member),otherClient=await session(other);
// PostgREST reale, non solo SQL diretto: un socio separato prova la stessa payload del form.
const apiProbe=await otherClient.from('rettifiche_anagrafiche').insert({persona_id:unrelated.id,richiedente_id:other.id,nome:'Collaudo API',cognome:unrelated.label,data_nascita:null,luogo_nascita:null,provincia_nascita:null,stato_nascita:null,sesso_cf:null,codice_fiscale:null},{defaultToNull:false}).select('id').single();
if(apiProbe.error)throw Error('Rettifica PostgREST: '+apiProbe.error.code+' '+apiProbe.error.message);
check(Boolean(apiProbe.data?.id),'Rettifica PostgREST con JWT autentico');
const profile='/area-personale/profilo',courses='/area-personale/corsi',staffCourses='/gestionale/corsi/'+edition;
const browser=await chromium.launch(),mobile=await webkit.launch();
const contexts=[];
try{
 async function context(engine=browser,options={viewport:{width:1440,height:1000}}){
  const ctx=await engine.newContext(options);contexts.push(ctx);const p=await ctx.newPage();return {ctx,p};
 }
 async function login(p,a){
  await p.goto(origin+'/accedi');await p.locator('input[name=email]').first().fill(a.email);await p.locator('input[name=password]').fill(password);
  await p.getByRole('button',{name:'Accedi',exact:true}).click();
  await p.waitForURL(u=>!['/accedi','/smista'].includes(u.pathname),{timeout:30000});
 }
 async function openProfile(p){
  await p.goto(origin+profile);await p.getByRole('heading',{name:'Impostazioni personali',exact:true}).waitFor();
 }
 const rolePaths={amministratore:'/gestionale',segreteria:'/gestionale',istruttore:'/istruttore',socio:'/area-personale',tutore:'/area-personale',consigliere_cda:'/organi-sociali'};
 const rolePages=new Map();
 for(const a of accounts){
  const {p}=await context();await login(p,a);check(new URL(p.url()).pathname===rolePaths[a.role],a.role+' destinazione login corretta');
  await openProfile(p);check(await p.getByRole('heading',{name:'Contatto di emergenza',exact:true}).count()===1,a.role+' vede il profilo collegato');
  check(await p.getByRole('heading',{name:'QA '+a.role+' Collaudo',exact:true}).count()===1,a.role+' vede il nominativo collegato');
  if(!['amministratore','segreteria'].includes(a.role)){
   await p.goto(origin+staffCourses);check(new URL(p.url()).pathname!==staffCourses,a.role+' non accede al corso staff');
   await openProfile(p);
  }
  rolePages.set(a.role,p);
 }
 const p=rolePages.get('socio'),s=rolePages.get('segreteria'),ad=rolePages.get('amministratore');
 const errors=[];for(const x of [p,s,ad])x.on('pageerror',e=>errors.push(e.message));
 async function submitCorrection(value){
  const form=p.locator('form').filter({has:p.locator('input[name=nome]')});
  await form.locator('input[name=nome]').fill(value);
  await form.getByRole('button',{name:'Richiedi modifica anagrafica',exact:true}).click();
  const success=p.getByText('Rettifica anagrafica inviata alla segreteria.',{exact:true});
  const failure=form.getByRole('alert');
  try{await success.or(failure).first().waitFor({timeout:15000});assert.ok(await success.isVisible(),'Rettifica UI: '+(await failure.allTextContents()).join(' | '));}
  catch(err){await p.screenshot({path:output+'/rettifica-failure.png',fullPage:true});const probe=await studentClient.from('rettifiche_anagrafiche').select('id,stato,revisione').eq('persona_id',student.id);console.error('QA rettifica: URL',new URL(p.url()).pathname+new URL(p.url()).search,'RLS API',probe.error?.code??'OK','righe',probe.data?.length??0,'alert',await form.getByRole('alert').allTextContents(),'guard',await p.locator('dialog[open].sc-discard-dialog').count());throw err;}
 }
 const emergency=p.locator('section').filter({has:p.getByRole('heading',{name:'Contatto di emergenza',exact:true})});
 await emergency.locator('input[name=emergenza_nome]').fill('Contatto di prova');
 await emergency.locator('input[name=emergenza_telefono]').fill('+39 3331234567');
 await emergency.getByRole('button',{name:'Salva contatto di emergenza'}).click();
 await p.getByText('Contatto di emergenza salvato.',{exact:true}).waitFor();
 check((await ok(db.from('contatti_emergenza').select('nominativo').eq('persona_id',student.id).single())).nominativo==='Contatto di prova','Contatto emergenza persistito');
 await p.reload();await p.locator('input[name=emergenza_telefono]').waitFor();check(await p.locator('input[name=emergenza_telefono]').inputValue()==='+39 3331234567','Contatto emergenza ricaricato');
 check((await ok(otherClient.from('contatti_emergenza').select('persona_id').eq('persona_id',student.id))).length===0,'Contatto emergenza non visibile ad altro socio');
 const gp=rolePages.get('tutore');await gp.locator('input[name=emergenza_nome]').fill('Tutore QA');await gp.locator('input[name=emergenza_telefono]').fill('3331234568');await gp.getByRole('button',{name:'Salva contatto di emergenza'}).click();await gp.getByText('Contatto di emergenza salvato.',{exact:true}).waitFor();
 check((await ok(db.from('contatti_emergenza').select('nominativo').eq('persona_id',child.id).single())).nominativo==='Tutore QA','Tutore aggiorna persona rappresentata');
 await p.locator('input[name=telefono]').fill('3331234569');await p.locator('input[name=email]').fill('recapito@example.invalid');await p.getByRole('button',{name:'Salva recapiti'}).click();await p.getByText('Recapiti salvati.',{exact:true}).waitFor();
 check((await ok(db.from('persone').select('email').eq('id',student.id).single())).email==='recapito@example.invalid','Recapiti salvati');
 await p.locator('form').filter({has:p.locator('input[name=telefono]')}).getByRole('alert').count().then(n=>check(n===0,'Salvataggio recapiti senza falso errore'));
 await submitCorrection('Collaudo rettificato');
 check(await p.locator('dialog[open].sc-discard-dialog').count()===0,'Nessun falso avviso di modifiche non salvate dopo salvataggi consecutivi');
 check((await ok(db.from('persone').select('nome').eq('id',student.id).single())).nome==='Collaudo','Rettifica non modifica direttamente anagrafica');
 await s.goto(origin+'/gestionale/soci');await s.getByRole('heading',{name:/Rettifiche anagrafiche da verificare/}).waitFor();
 await s.getByRole('link',{name:'QA socio Collaudo rettificato',exact:true}).click();
 await s.getByRole('heading',{name:'Rettifica anagrafica in attesa'}).waitFor();
 const review=s.locator('form').filter({has:s.locator('select[name=esito]')});
 await review.locator('select[name=esito]').selectOption('respinta');
 await review.locator('textarea[name=motivazione_esito]').fill('Verificare il documento');
 await review.getByRole('button',{name:'Conferma esito'}).click();await s.getByText('Rettifica anagrafica elaborata.',{exact:true}).waitFor();
 await openProfile(p);await p.getByText(/Verificare il documento/).waitFor();
 await submitCorrection('Collaudo approvato');
 await s.goto(origin+'/gestionale/soci/'+student.id+'?tab=anagrafica');await s.getByRole('heading',{name:'Rettifica anagrafica in attesa'}).waitFor();
 await s.locator('select[name=esito]').selectOption('applicata');await s.getByRole('button',{name:'Conferma esito'}).click();await s.getByText('Rettifica anagrafica elaborata.',{exact:true}).waitFor();
 check((await ok(db.from('persone').select('nome').eq('id',student.id).single())).nome==='Collaudo approvato','Rettifica approvata e applicata da segreteria');
 await openProfile(p);await p.getByText('Aggiungi brevetto esterno',{exact:true}).click();
 await p.locator('input[name=titolo]').fill('Open Water Diver');await p.locator('input[name=ente]').fill('PADI');await p.locator('input[name=numero_brevetto]').fill('QA-'+run);await p.locator('input[name=centro_rilascio]').fill('Centro QA');
 await p.getByRole('button',{name:'Registra brevetto esterno'}).click();await p.getByText('Brevetto esterno registrato. È in attesa di verifica.',{exact:true}).waitFor();
 const patent=await ok(db.from('brevetti_allievi').select('id,stato_verifica,edizione_id,rilasciato_da_id').eq('persona_id',student.id).eq('origine','esterno').single());
 check(patent.stato_verifica==='in_attesa'&&!patent.edizione_id&&!patent.rilasciato_da_id,'Brevetto esterno senza corso o firma interna');
 await s.goto(origin+'/gestionale/moduli/brevetti?edit='+patent.id);await s.locator('select[name=stato_verifica]').selectOption('verificato');await s.getByRole('button',{name:'Salva modifiche',exact:true}).click();
 await s.waitForURL(u=>u.searchParams.get('msg')==='salvato'||!u.searchParams.has('edit'));
 check((await ok(db.from('brevetti_allievi').select('stato_verifica').eq('id',patent.id).single())).stato_verifica==='verificato','Verifica staff brevetto esterno');
 await openProfile(p);await p.getByText(/Open Water Diver/).waitFor();check(await p.getByText('Modifica brevetto',{exact:true}).count()===0,'Brevetto verificato non alterabile dal socio');
 await p.goto(origin+courses+'?tab=catalogo');await p.getByRole('heading',{name:'I miei corsi',exact:true}).waitFor();
 const courseCard=p.locator('article').filter({has:p.getByRole('heading',{name:editionName,exact:true})});await courseCard.waitFor();
 await courseCard.getByRole('button',{name:'Richiedi iscrizione',exact:true}).click();
 const courseDialog=p.getByRole('dialog');
 check(await courseDialog.locator('[name^=emergenza_]').count()===0,'Richiesta senza contatto emergenza');
 check(await courseDialog.locator('select[name=persona_id]').inputValue()===student.id,'Profilo unico preselezionato');
 await courseDialog.getByRole('button',{name:'Richiedi iscrizione',exact:true}).click();await p.getByText('Richiesta d’iscrizione registrata.',{exact:true}).or(p.getByText("Richiesta d'iscrizione registrata.",{exact:true})).waitFor();
 const req=await ok(db.from('iscrizioni_corsi').select('id,stato').eq('edizione_id',edition).eq('persona_id',student.id).single());
 check(req.stato==='in_attesa','Richiesta senza tessera in attesa');
 await p.goto(origin+courses+'?tab=catalogo');await courseCard.waitFor();check(await courseCard.getByRole('button',{name:'Richiedi iscrizione'}).count()===0,'Doppia richiesta disabilitata');
 await s.goto(origin+staffCourses+'?tab=allievi');await s.getByRole('heading',{name:editionName,exact:true}).waitFor();
 check(await s.locator('[name=massimo_partecipanti]').count()===0,'Capienza assente dalla scheda corso');
 const requestRow=s.getByRole('row').filter({hasText:'Collaudo approvato'});await requestRow.waitFor();await requestRow.getByRole('button',{name:'Cambia stato'}).click();check(await s.getByRole('dialog').locator('option[value=iscritto]').isDisabled(),'Conferma vietata senza tessera');
 const verbale=randomUUID();
 await ok(db.from('cda_verbali').insert({id:verbale,data_consiglio:date(0),oggetto:'QA delibera',tipo:'Approvazione Adesioni Soci',stato:'approvato',percorso_docx:verbale+'/bozza.docx',percorso_pdf:verbale+'/delibera.pdf',approvato_il:new Date().toISOString(),creato_da:staff.id}));
 await ok(db.from('adesioni').update({stato:'attiva',verbale_cda_id:verbale}).eq('id',adhesion));
 await ok(db.from('tesseramenti').insert({adesione_id:adhesion,ente:'QA',stato:'attiva',scade_il:date(100)}));
 await s.reload();await requestRow.getByRole('button',{name:'Cambia stato'}).click();await s.getByRole('dialog').locator('select[name=stato]').selectOption('iscritto');await s.getByRole('dialog').getByRole('button',{name:'Salva',exact:true}).click();
 await s.waitForURL(u=>u.searchParams.has('msg'));check((await ok(db.from('iscrizioni_corsi').select('stato').eq('id',req.id).single())).stato==='iscritto','Segreteria conferma dopo tesseramento');
 await ok(db.from('iscrizioni_corsi').insert({edizione_id:edition,persona_id:child.id,stato:'iscritto'}));
 check((await ok(db.from('iscrizioni_corsi').select('id').eq('edizione_id',edition).eq('stato','iscritto'))).length===2,'Superato precedente limite senza alterarlo');
 await ad.goto(origin+'/gestionale/corsi/nuovo');check(await ad.locator('[name=massimo_partecipanti]').count()===0,'Capienza assente da nuova edizione');
 // Cambio email: l'azione deve rifiutare password errata e non cambiare identificativo.
 await openProfile(p);await p.getByText('Modifica email di accesso',{exact:true}).click();
 const newEmail='memberqa-'+run+'-new@example.invalid';
 await p.locator('input[name=nuova_email]').fill(newEmail);await p.locator('input[name=conferma_email]').fill(newEmail);await p.locator('input[name=password_attuale]').fill('password-errata');
 await p.getByRole('button',{name:'Richiedi cambio email'}).click();await p.getByText('Password attuale non corretta o verifica non disponibile.',{exact:true}).waitFor();
 check((await ok(db.auth.admin.getUserById(member.id))).user.email===member.email,'Password errata non modifica login');
 await p.locator('input[name=password_attuale]').fill(password);await p.getByRole('button',{name:'Richiedi cambio email'}).click();
 await p.getByText(/Richiesta di cambio email avviata/).waitFor({timeout:30000});
 const pending=(await ok(db.auth.admin.getUserById(member.id))).user;
 check(pending.email===member.email,'Login invariato prima delle conferme');
 // Mailpit locale: prova che siano stati inviati due messaggi al vecchio e nuovo indirizzo.
 const mailApi='http://127.0.0.1:54324/api/v1';
 let mail=[];
 for(let i=0;i<30;i++){
  const resp=await fetch(mailApi+'/messages');if(resp.ok)mail=(await resp.json()).messages??[];
  if([member.email,newEmail].every(address=>mail.some(m=>m.To?.some(t=>t.Address===address))))break;
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 for(const address of [member.email,newEmail])check(mail.some(m=>m.To?.some(t=>t.Address===address)),'Conferma locale inviata a '+(address===member.email?'vecchia email':'nuova email'));
 async function confirmMail(address){
  const msg=mail.find(m=>m.To?.some(t=>t.Address===address));
  const result=await fetch(mailApi+'/message/'+encodeURIComponent(msg.ID));assert.ok(result.ok);
  const data=await result.json(),body=data.HTML??data.Text??'';
  const raw=body.match(/https?:\/\/[^"'<>\s]+\/auth\/v1\/verify\?[^"'<>\s]+/)?.[0];
  assert.ok(raw,'Link email locale non trovato');
  const target=new URL(raw.replaceAll('&amp;','&'));
  assert.ok(['localhost','127.0.0.1'].includes(target.hostname)&&target.port==='54321');
  await p.goto(target.toString(),{waitUntil:'domcontentloaded'});
 }
 await confirmMail(member.email);
 check((await ok(db.auth.admin.getUserById(member.id))).user.email===member.email,'Una sola conferma non modifica login');
 await confirmMail(newEmail);
 const updated=(await ok(db.auth.admin.getUserById(member.id))).user;
 check(updated.id===member.id&&updated.email===newEmail,'Doppia conferma modifica email, UUID invariato');
 check((await ok(db.from('ruoli_utente').select('ruolo').eq('utente_id',member.id))).some(x=>x.ruolo==='socio'),'Ruoli invariati dopo cambio email');
 check((await ok(db.from('collegamenti_persone').select('persona_id').eq('utente_id',member.id))).some(x=>x.persona_id===student.id),'Anagrafica invariata dopo cambio email');
 check(Boolean((await studentClient.auth.signInWithPassword({email:member.email,password})).error),'Vecchia email non accede dopo conferma');
 member.email=newEmail;const fresh=await context();await login(fresh.p,member);check(new URL(fresh.p.url()).pathname==='/area-personale','Nuovo login funzionante da sessione indipendente');await fresh.ctx.close();
 // Controllo responsivo di profilo, corsi e certificati su desktop/iPad/iPhone.
 for(const [name,engine,options] of [['desktop',browser,{viewport:{width:1440,height:1000}}],['ipad',mobile,devices['iPad (gen 7)']],['iphone',mobile,devices['iPhone 13']]]){
  for(const account of accounts){
  const {ctx,p:vp}=await context(engine,options);await login(vp,account);
  for(const [suffix,route,heading] of [['profilo',profile,'Impostazioni personali'],['corsi',courses,'I miei corsi']]){
   await vp.goto(origin+route);await vp.getByRole('heading',{name:heading,exact:true}).waitFor();
   const dimensions=await vp.evaluate(()=>({body:document.documentElement.scrollWidth,viewport:innerWidth}));
   check(dimensions.body<=dimensions.viewport+2,name+' '+account.role+' '+suffix+' senza overflow');
   await vp.screenshot({path:output+'/'+name+'-'+account.role+'-'+suffix+'.png',fullPage:true});
  }
  await ctx.close();
  }
 }
 check(errors.length===0,'Nessuna eccezione JavaScript nei flussi principali');
}finally{
 await writeFile(output+'/report.json',JSON.stringify({passed:report.length,checks:report},null,2));
 await Promise.all(contexts.map(ctx=>ctx.close().catch(()=>{})));
 await Promise.all([browser.close(),mobile.close()]);
}
