'use client';
import {useEffect,useRef,useState} from 'react';
import {canListCourseStudent,enrollmentEligibility} from '@/lib/course-ui';
type Candidate={id:string;name:string;membership:string|null;hasValidCard:boolean;eligible:boolean;alreadyEnrolled:boolean;isDirector:boolean;isInstructor?:boolean;assignedToEdition?:boolean;unavailable:boolean;emergencyLoaded:boolean;emergencyName?:string;emergencyPhone?:string};
export default function CourseStudentPicker({people}:{people:Candidate[]}){
 const root=useRef<HTMLDivElement>(null),[search,setSearch]=useState(''),[id,setId]=useState('');
 const [deroga,setDeroga]=useState(false),[motivo,setMotivo]=useState('');
 useEffect(()=>{const form=root.current?.closest('form');const reset=()=>{setSearch('');setId('');setDeroga(false);setMotivo('');};form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[]);
 const norm=(x:string)=>x.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('it');
 const visible=people.filter(p=>canListCourseStudent(p,deroga)&&(p.id===id||norm(search).split(/\s+/).every(t=>norm(p.name).includes(t))));
 const selected=visible.find(p=>p.id===id),reason=selected?enrollmentEligibility(selected):'';
 return <div ref={root} className="stack">
 <label className="check-label"><input type="checkbox" name="deroga_istruttore" checked={deroga} onChange={e=>{setDeroga(e.target.checked);setId('');setMotivo('');}}/>Consenti iscrizione di un istruttore in deroga</label>
 <label>Cerca persona<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome o cognome" data-dirty-ignore/></label>
 <label>Allievo<select name="persona_id" required value={id} onChange={e=>{setId(e.target.value);setMotivo('');}}><option value="">Seleziona persona…</option>{visible.map(p=><option key={p.id} value={p.id}>{p.name}{p.isInstructor?' · Istruttore (deroga)':''}{enrollmentEligibility(p)?' · Non iscrivibile':' · Iscrivibile'}</option>)}</select></label>
 {selected&&<div className="sc-card"><p>Adesione: <strong>{selected.membership?.replaceAll('_',' ')??'Non acquisita'}</strong></p><p>Tesseramento: <strong>{selected.unavailable?'Da verificare':selected.hasValidCard?'Attivo e valido':'Non valido o mancante'}</strong></p><p role="status" className={'notice '+(reason?'warning':'success')}>{reason||'Requisiti associativi attuali soddisfatti'}</p><p>Contatto di emergenza registrato: {selected.emergencyLoaded?(selected.emergencyName?[selected.emergencyName,selected.emergencyPhone].filter(Boolean).join(' · '):'Non acquisito'):'Consulta la scheda socio'}</p></div>}
 {selected?.isInstructor&&<label>Motivazione della deroga (obbligatoria)<textarea name="deroga_motivo" value={motivo} onChange={e=>setMotivo(e.target.value)} required minLength={5} maxLength={500} placeholder="Es. istruttore ARA che frequenta un corso APNEA"/></label>}
 <input type="hidden" name="stato" value="iscritto"/><button type="submit" className="button" disabled={!selected||Boolean(reason)||Boolean(selected?.isInstructor&&motivo.trim().length<5)}>Conferma iscrizione</button>
 </div>;
}
