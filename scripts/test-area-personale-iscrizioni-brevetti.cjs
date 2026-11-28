// Database locale usa-e-getta. Mai utilizzare URL o credenziali di produzione.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
async function main(){
 const connectionString=process.env.MEMBER_QA_DATABASE_URL;
 if(process.env.MEMBER_QA_LOCAL_ONLY!=='1'||!connectionString||!['localhost','127.0.0.1'].includes(new URL(connectionString).hostname))throw Error('Database locale isolato obbligatorio');
 const clients=[];
 async function session(account){
  const c=new Client({connectionString});await c.connect();clients.push(c);
  if(account){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[account]);}
  return c;
 }
 async function scalar(c,sql,args=[]){return Object.values((await c.query(sql,args)).rows[0])[0];}
 try{
  const root=await session(),users=Array.from({length:5},()=>randomUUID()),people=users.map(()=>randomUUID());
  const [a,b,c,dir,staff]=people;
  for(let i=0;i<users.length;i++){
   await root.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[users[i],users[i]+'@example.invalid',{}]);
   await root.query('insert into public.persone(id,nome,cognome) values($1,$2,$3)',[people[i],'Persona','QA'+i]);
   await root.query("insert into public.collegamenti_persone values($1,$2,'titolare')",[users[i],people[i]]);
   await root.query('insert into public.ruoli_utente(utente_id,ruolo) values($1,$2)',[users[i],i===4?'segreteria':'socio']);
  }
  const [sa,sb,sc,sd,ss]=await Promise.all(users.map(session));
  const season=await scalar(root,"insert into public.stagioni(nome,dal,al,attiva) values($1,current_date-30,current_date+120,false) returning id",['QA '+randomUUID()]);
  const adhesionA=await scalar(root,"insert into public.adesioni(stagione_id,persona_id,stato) values($1,$2,'da_perfezionare') returning id",[season,a]);
  for(const person of [b,c,dir]){
   const ad=await scalar(root,"insert into public.adesioni(stagione_id,persona_id,stato) values($1,$2,'attiva') returning id",[season,person]);
   await root.query("insert into public.tesseramenti(adesione_id,ente,stato,scade_il) values($1,'QA','attiva',current_date+100)",[ad]);
  }
  const catalog=await scalar(ss,"insert into public.corsi(nome,tipo) values($1,'APNEA') returning id",['QA '+randomUUID()]);
  const edition=await scalar(ss,"insert into public.edizioni_corsi(corso_id,stagione_id,nome,inizio,fine,direttore_id,massimo_partecipanti) values($1,$2,$3,current_date,current_date+30,$4,1) returning id",[catalog,season,'QA '+randomUUID(),dir]);
  const request=await scalar(sa,'select public.richiedi_iscrizione_corso($1,$2)',[edition,a]);
  assert.equal(await scalar(sa,'select stato from public.iscrizioni_corsi where id=$1',[request]),'in_attesa');
  await assert.rejects(sa.query('select public.richiedi_iscrizione_corso($1,$2)',[edition,a]));
  await assert.rejects(sb.query('select public.richiedi_iscrizione_corso($1,$2)',[edition,a]));
  await assert.rejects(ss.query("update public.iscrizioni_corsi set stato='iscritto' where id=$1",[request]),{code:'P3413'});
  const enroll="insert into public.iscrizioni_corsi(edizione_id,persona_id,stato) values($1,$2,'iscritto')";
  await ss.query(enroll,[edition,b]);await ss.query(enroll,[edition,c]);
  assert.equal(await scalar(ss,"select count(*)::int from public.iscrizioni_corsi where edizione_id=$1 and stato='iscritto'",[edition]),2);
  await assert.rejects(ss.query(enroll,[edition,dir]),{code:'P3421'});
  await assert.rejects(ss.query(enroll,[edition,b]),{code:'23505'});
  // Delibera sintetica approvata nel database effimero: non disabilitare i vincoli.
  const verbale=randomUUID();
  await root.query("insert into public.cda_verbali(id,data_consiglio,oggetto,tipo,stato,percorso_docx,percorso_pdf,approvato_il,creato_da) values($1,current_date,'Delibera QA','Approvazione Adesioni Soci','approvato',$2,$3,now(),$4)",[verbale,verbale+'/bozza.docx',verbale+'/delibera.pdf',users[4]]);
  await root.query("update public.adesioni set stato='attiva',verbale_cda_id=$2 where id=$1",[adhesionA,verbale]);
  await root.query("insert into public.tesseramenti(adesione_id,ente,stato,scade_il) values($1,'QA','attiva',current_date+100)",[adhesionA]);
  await ss.query("update public.iscrizioni_corsi set stato='iscritto' where id=$1",[request]);
  assert.equal(await scalar(ss,"select count(*)::int from public.iscrizioni_corsi where edizione_id=$1 and stato='iscritto'",[edition]),3);
  assert.equal(await scalar(root,"select massimo_partecipanti from public.edizioni_corsi where id=$1",[edition]),1);
  console.log('OK richieste, conferma con tessera, nessun limite, no duplicati/direttore');
  await sa.query("insert into public.contatti_emergenza(persona_id,nominativo,telefono) values($1,'Contatto QA','+39 1234567')",[a]);
  await sa.query("update public.contatti_emergenza set telefono='12345678' where persona_id=$1",[a]);
  assert.equal(await scalar(ss,'select telefono from public.contatti_emergenza where persona_id=$1',[a]),'12345678');
  assert.equal(await scalar(sb,'select count(*)::int from public.contatti_emergenza where persona_id=$1',[a]),0);
  assert.equal((await sb.query("update public.contatti_emergenza set telefono='99999999' where persona_id=$1",[a])).rowCount,0);
  await sa.query("update public.persone set email='recapito@example.invalid',provincia_residenza='MO',comune='Modena' where id=$1",[a]);
  assert.equal(await scalar(ss,'select email from public.persone where id=$1',[a]),'recapito@example.invalid');
  await assert.rejects(sa.query("update public.persone set nome='Nome non autorizzato' where id=$1",[a]),{code:'42501'});
  assert.equal((await sb.query("update public.persone set email='altro@example.invalid' where id=$1",[a])).rowCount,0);
  console.log('OK contatti personali e di emergenza, segregazione e dati protetti');
  const correction=await scalar(sa,"insert into public.rettifiche_anagrafiche(persona_id,nome,cognome) values($1,'Nome corretto','QA0') returning id",[a]);
  assert.equal(await scalar(sb,'select count(*)::int from public.rettifiche_anagrafiche where id=$1',[correction]),0);
  await assert.rejects(sa.query("update public.rettifiche_anagrafiche set stato='applicata' where id=$1",[correction]),{code:'42501'});
  await assert.rejects(sa.query("select public.decidi_rettifica_anagrafica($1,1,'applicata',null,false,null)",[correction]),{code:'42501'});
  await sa.query("update public.rettifiche_anagrafiche set nome='Nome aggiornato' where id=$1",[correction]);
  await assert.rejects(ss.query("select public.decidi_rettifica_anagrafica($1,1,'applicata',null,false,null)",[correction]),{code:'40001'});
  await ss.query("select public.decidi_rettifica_anagrafica($1,2,'applicata',null,false,null)",[correction]);
  assert.equal(await scalar(sa,'select nome from public.persone where id=$1',[a]),'Nome aggiornato');
  assert.equal(await scalar(sa,'select stato from public.rettifiche_anagrafiche where id=$1',[correction]),'applicata');
  const rejected=await scalar(sa,"insert into public.rettifiche_anagrafiche(persona_id,nome,cognome) values($1,'Nome da verificare','QA0') returning id",[a]);
  await assert.rejects(ss.query("select public.decidi_rettifica_anagrafica($1,1,'respinta',null,false,null)",[rejected]),{code:'22023'});
  await ss.query("select public.decidi_rettifica_anagrafica($1,1,'respinta',null,false,null,'Verifica documento')",[rejected]);
  assert.equal(await scalar(sa,'select motivazione_esito from public.rettifiche_anagrafiche where id=$1',[rejected]),'Verifica documento');
  console.log('OK rettifica con verifica, controllo versione, motivazione rifiuto e permessi');
  const external=await scalar(sa,"insert into public.brevetti_allievi(persona_id,origine,stato_verifica,titolo,ente,numero_brevetto) values($1,'esterno','in_attesa','Open Water','PADI','QA123') returning id",[a]);
  assert.equal(await scalar(sb,'select count(*)::int from public.brevetti_allievi where id=$1',[external]),0);
  await assert.rejects(sa.query("update public.brevetti_allievi set stato_verifica='verificato' where id=$1",[external]),{code:'42501'});
  await assert.rejects(sa.query("insert into public.brevetti_allievi(persona_id,origine,stato_verifica,titolo,ente,numero_brevetto) values($1,'esterno','in_attesa','Open Water','PADI','qa123')",[a]),{code:'23505'});
  await sa.query("update public.brevetti_allievi set centro_rilascio='Centro QA' where id=$1",[external]);
  await ss.query("update public.brevetti_allievi set stato_verifica='verificato' where id=$1",[external]);
  assert.equal((await sa.query("update public.brevetti_allievi set titolo='Modifica non ammessa' where id=$1",[external])).rowCount,0);
  assert.equal(await scalar(ss,'select rilasciato_da_id from public.brevetti_allievi where id=$1',[external]),null);
  const internal=await scalar(ss,"insert into public.brevetti_allievi(persona_id,edizione_id,titolo) values($1,$2,'Apnea') returning id",[b,edition]);
  assert.equal(await scalar(ss,'select rilasciato_da_id from public.brevetti_allievi where id=$1',[internal]),dir);
  await assert.rejects(ss.query("update public.brevetti_allievi set origine='esterno' where id=$1",[internal]),{code:'P3422'});
  console.log('OK brevetti esterni, anti-duplicato, verifica staff, firma interna invariata');
 }finally{await Promise.all(clients.map(c=>c.end()));}
}
main().catch(e=>{console.error(e.message,e.code||'');process.exitCode=1;});
