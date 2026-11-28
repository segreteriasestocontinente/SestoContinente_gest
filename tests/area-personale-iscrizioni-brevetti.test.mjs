import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('contatti emergenza esclusivamente nel profilo e nella scheda socio',()=>{
 const profile=read('app/area-personale/profilo/page.tsx');
 assert.match(profile,/updateEmergencyContact/);
 assert.match(profile,/name="emergenza_nome"/);
 assert.match(profile,/name="emergenza_telefono"/);
 for(const path of ['app/area-personale/corsi/page.tsx','app/gestionale/corsi/[id]/page.tsx'])assert.doesNotMatch(read(path),/<Emergenza\/>|name="emergenza_/);
 assert.match(read('app/area-personale/actions.ts'),/rpc\('richiedi_iscrizione_corso'/);
 assert.match(read('app/area-personale/profilo/actions.ts'),/eq\('utente_id',user.id\)/);
});
test('capienza assente da UI, azioni e configurazioni dei corsi',()=>{
 for(const path of ['app/gestionale/corsi/nuovo/page.tsx','app/gestionale/corsi/page.tsx','app/gestionale/corsi/[id]/page.tsx','app/gestionale/corsi/actions.ts','lib/modules.ts','app/gestionale/moduli/[modulo]/page.tsx'])assert.doesNotMatch(read(path),/massimo_partecipanti|capienza/i);
 const sql=read('scripts/qa-area-personale-iscrizioni-brevetti.sql');
 assert.match(sql,/drop trigger if exists verifica_capienza_trigger/);
 assert.match(sql,/drop trigger if exists controllo_riduzione_capienza/);
 assert.doesNotMatch(sql,/drop column massimo_partecipanti/);
});
test('rettifiche e brevetti esterni non attribuiscono permessi amministrativi',()=>{
 const sql=read('scripts/qa-area-personale-iscrizioni-brevetti.sql');
 assert.match(sql,/rettifiche_anagrafiche enable row level security/);
 assert.match(sql,/r\.revisione is distinct from p_revisione/);
 assert.match(sql,/brevetti_esterni_propri_insert/);
 assert.match(sql,/stato_verifica='in_attesa'/);
 assert.match(sql,/new\.rilasciato_da_id:=null/);
 assert.match(read('app/area-personale/profilo/actions.ts'),/origine:'esterno'/);
 assert.match(read('app/gestionale/soci/actions.ts'),/await requireStaff\(\)/);
});
