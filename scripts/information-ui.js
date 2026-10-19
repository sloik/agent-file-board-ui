/* Host-owned information cards. Source descriptions are inert author claims. */
function informationContext(m){return B?.informationContexts?.get(m?.path)||{information:{}};}
function informationSignature(m){return JSON.stringify(informationContext(m));}
function informationPlaceholder(m){
 if(!m.bodyLoaded||!m.h.INFORMATION)return '';
 const text=(en,pl)=>S.lang==='pl'?pl:en;
 const wrap=body=>`<section class="board-information board-form" data-information-path="${esc(m.path)}">${body}</section>`;
 const row=(label,value)=>`<p><strong>${esc(label)}</strong> ${esc(value)}</p>`;
 const json=value=>`<pre class="information-value">${esc(JSON.stringify(value,null,2))}</pre>`;
 const provenance=p=>{if(!p)return '';const methods={command:text('Command','Polecenie'),file:text('File','Plik'),user:text('User statement','Wypowiedź użytkownika'),calculation:text('Calculation','Obliczenie'),other:text('Other','Inne')};return `<details class="information-provenance"><summary>${esc(text('Source details — author claim','Szczegóły źródła — deklaracja autora'))}</summary>${row(text('Method:','Metoda:'),methods[p.method]||p.method)}${row(text('Description:','Opis:'),p.description)}${p.collectedAt?row(text('Collected at:','Zebrano:'),p.collectedAt):''}${p.evidence?row(text('Reported evidence:','Zgłoszone dowody:'),p.evidence):''}<p>${esc(text('Source descriptions are not executed or independently verified.','Opisy źródeł nie są wykonywane ani niezależnie weryfikowane.'))}</p></details>`;};
 const reading=(label,r)=>`<div class="information-reading">${row(label,'')}${Object.hasOwn(r,'data')?json(r.data):`<p>${esc(text('No reading available.','Brak odczytu.'))}</p>`}${row(text('Observed at:','Zaobserwowano:'),r.observedAt||text('Unknown','Nie wiadomo'))}${provenance(r.provenance)}</div>`;
 try{
  ExtensionContract.parse(m.h.INFORMATION,16384);
  if(m.informationError)return wrap(`<p class="information-status" role="status">${esc(text('Information unavailable: ','Informacje niedostępne: ')+m.informationError)}</p>`);
  if(m.metadataError)return wrap(`<p>${esc(text('Information metadata is invalid. Readable message remains above.','Metadane informacji są nieprawidłowe. Czytelna wiadomość pozostaje powyżej.'))}</p>`);
  const entries=Object.entries(informationContext(m).information);
  if(!entries.length)return '';
  const failures={missing:text('Latest reading unavailable in this board copy.','Najnowszy odczyt niedostępny w tej kopii tablicy.'),incomplete:text('Latest reading unavailable: revision history is incomplete.','Najnowszy odczyt niedostępny: historia rewizji jest niepełna.'),conflict:text('Conflicting updates — latest reading unresolved.','Sprzeczne aktualizacje — nie ustalono najnowszego odczytu.'),corrupt:text('Latest reading cannot be verified.','Nie można zweryfikować najnowszego odczytu.'),limit:text('Latest reading unavailable: state limit exceeded.','Najnowszy odczyt niedostępny: przekroczono limit stanu.')};
  return wrap(entries.map(([id,item])=>{
   const latest=item.latest,presentation=item.presentation||'both',recorded=reading(text('Recorded with this message','Zapisano z tą wiadomością'),item.recorded);
   let html=`<section class="information-item" data-information-id="${esc(id)}"><h3>${esc(item.label||id)}</h3>${m.author?row(text('Reported by:','Zgłoszone przez:'),m.author):''}`;
   if(item.recorded.verification==='unavailable')html+=`<p class="information-status" role="status">${esc(text('Recorded snapshot correspondence cannot be verified in this board copy.','Nie można zweryfikować zgodności zapisanego stanu w tej kopii tablicy.'))}</p>`;
   if(item.recorded.verification==='invalid')html+=`<p class="information-status" role="status">${esc(text('Recorded snapshot does not match its referenced revision.','Zapisany stan nie odpowiada wskazanej rewizji.'))}</p>`;
   if(presentation==='latest'&&latest)html+=`<details class="information-recorded"><summary>${esc(text('Recorded snapshot','Zapisany stan'))}</summary>${recorded}</details>`;else html+=recorded;
   if(latest&&presentation!=='recorded'){
    if(latest.status!=='resolved')html+=`<p class="information-status" role="status">${esc(failures[latest.status]||text('Current reading unknown.','Bieżący odczyt nieznany.'))}</p>`;
    else{
     html+=reading(text('Latest known reading','Ostatni znany odczyt'),latest);
     const freshness={fresh:text('Within its freshness period.','W okresie świeżości.'),stale:text('Stale reading.','Nieaktualny odczyt.'),unknown:text('Freshness unknown.','Świeżość nieznana.'),future:text('Clock mismatch — freshness unknown.','Niezgodność zegara — świeżość nieznana.')};
     html+=`<p class="information-status" role="status">${esc(freshness[latest.freshness]||freshness.unknown)}</p>`;
     const a=latest.availability;
     if(a){const states={available:text('Source reported available','Źródło zgłosiło dostępność'),disconnected:text('Source reported disconnected','Źródło zgłosiło rozłączenie'),unknown:text('Source availability unknown','Dostępność źródła nieznana')};html+=row(states[a.state]||states.unknown,a.reportedAt||'');if(a.reason)html+=row(text('Reported reason:','Zgłoszony powód:'),a.reason);}
    }
   }
   return html+'</section>';
  }).join(''));
 }catch{return wrap(`<p>${esc(text('Information metadata is invalid. Readable message remains above.','Metadane informacji są nieprawidłowe. Czytelna wiadomość pozostaje powyżej.'))}</p>`);}
}
