'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/security';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function askForCourse(form:FormData){
 const {supabase}=await requireUser();
 const p_persona=String(form.get('persona_id')??'');
 const p_edizione=String(form.get('edizione_id')??'');
 if(!uuid.test(p_persona)||!uuid.test(p_edizione))return {error:'Seleziona un profilo e un corso validi.'};
 const {error}=await supabase.rpc('richiedi_iscrizione_corso',{p_persona,p_edizione});
 if(error)return {error:error.code==='P3521'?'Gli istruttori possono iscriversi come allievi solo con una deroga autorizzata dalla segreteria.':error.code==='P3520'?'Non puoi essere allievo e istruttore nella stessa edizione.':error.code==='P3421'?'Il direttore non può essere allievo.':error.code==='23505'?'Iscrizione già presente.':error.message.includes('già presente')?'Richiesta già presente.':error.code==='P3413'?'Il corso non è aperto o manca l’adesione della stagione.':'Richiesta non inviata. Verifica adesione e disponibilità del corso.'};
 revalidatePath('/area-personale/corsi');revalidatePath('/gestionale/corsi');revalidatePath('/gestionale/corsi/'+p_edizione);
}
export async function markNotification(form:FormData){
 const {supabase,user}=await requireUser();
 const p_id=String(form.get('id')??'');
 if(!uuid.test(p_id))redirect('/area-personale?tab=notifiche&msg=notifica_errore');
 await supabase.rpc('segna_notifica_letta',{p_id});
 // La RPC restituisce void anche se l'identificativo non appartiene all'account.
 // Confermare l'esito con una lettura sotto RLS, non dalla sola assenza di errori.
 const {data:notification,error:readError}=await supabase.from('notifiche').select('letta_il').eq('id',p_id).eq('utente_id',user.id).maybeSingle();
 revalidatePath('/area-personale');redirect('/area-personale?tab=notifiche&msg='+(readError||!notification?.letta_il?'notifica_errore':'letta'));
}
