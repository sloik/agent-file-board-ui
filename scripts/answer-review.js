/* Read-only typed answer comparisons; no writer or action bindings. */
function reviewValue(field,value){
 if(value===null||value===undefined)return t("review_empty");
 if(typeof value==='boolean')return t(value?"review_yes":"review_no");
 if(Array.isArray(value))return value.length?value.map(id=>field.options?.find(o=>o.id===id)?.label||id).join(', '):t("review_empty");
 if(field.options)return field.options.find(o=>o.id===value)?.label||String(value);
 return String(value);
}
function answerReview(m){
 if(!m.bodyLoaded||m.metadataError||!m.answer||![2,3].includes(m.answer.version))return '';
 const source=B.messageIndex.get(m.dkey+'|'+m.replyTo);
 if(!source||source.metadataError||source.quarantined||!source.question)return '';
 const q=source.question,a=m.answer;
 try{messageMetadata(m.h,source.h);BoardFormContract.answer(a,q);}catch{return '';}
 const initial=BoardFormContract.values(q,BoardFormContract.initial(q));
 let html=`<details open class="answer-review" data-review-path="${esc(m.path)}"><summary>${esc(t("review_title"))}</summary><p class="hint">${esc(t("review_note"))} <code>${esc(source.file)}</code></p>`;
 for(const f of q.fields){const v=a.values[f.id];html+=`<section class="answer-review-field"><h4>${esc(f.label)}</h4>`;
  if(q.version===3&&!BoardFormContract.active(f,a.values)){html+=`<p>${esc(t("review_hidden"))}</p></section>`;continue;}
  if(f.type!=='editable-table'){html+=`<dl class="answer-review-values"><dt>${esc(t("review_initial"))}</dt><dd>${esc(reviewValue(f,initial[f.id]))}</dd><dt>${esc(t("review_submitted"))}</dt><dd>${esc(reviewValue(f,v))}</dd></dl></section>`;continue;}
  const original=new Map(f.rows.map(r=>[r.id,r.values])),removed=new Set(v.removed||[]),added=new Map((v.added||[]).map(r=>[r.id,r.values])),patch=new Map(v.changes.map(c=>[c.row+'|'+c.column,c.value]));
  const order=v.order||f.rows.map(r=>r.id),rows=[...order,...f.rows.filter(r=>removed.has(r.id)).map(r=>r.id)];
  html+=`<div class="review-table-scroll" role="region" tabindex="0" aria-label="${esc(f.label)}"><table><thead><tr><th scope="col">${esc(t("form_row"))}</th><th scope="col">${esc(t("review_change"))}</th>${f.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
  for(const id of rows){const isAdded=added.has(id),isRemoved=removed.has(id),changed=f.columns.some(c=>patch.has(id+'|'+c.id));
   const kind=isAdded?'added':isRemoved?'removed':changed?'changed':'unchanged';
   html+=`<tr class="review-${kind}" data-review-row="${esc(id)}"><th scope="row">${esc(id)}</th><td>${esc(t({added:"review_added",removed:"review_removed",changed:"review_changed",unchanged:"review_unchanged"}[kind]))}</td>`;
   for(const c of f.columns){const before=original.get(id)?.[c.id],after=isAdded?added.get(id)[c.id]:patch.has(id+'|'+c.id)?patch.get(id+'|'+c.id):before;
    html+='<td>'+(isAdded?`<ins>${esc(reviewValue(c,after))}</ins>`:isRemoved?`<del>${esc(reviewValue(c,before))}</del>`:patch.has(id+'|'+c.id)?`<span class="review-before">${esc(t("review_initial"))}: <del>${esc(reviewValue(c,before))}</del></span><span class="review-after">${esc(t("review_submitted"))}: <ins>${esc(reviewValue(c,after))}</ins></span>`:esc(reviewValue(c,before)))+'</td>';
   }html+='</tr>';
  }
  html+=`</tbody></table></div><p class="review-order">${esc(t("review_order"))}: ${esc(order.join(' → ')||t("review_empty"))}</p></section>`;
 }
 return html+'</details>';
}
function preserveReviewState(next){const old=new Map([...$('#feed').querySelectorAll('[data-review-path]')].map(el=>[el.dataset.reviewPath,el.open]));for(const el of next.querySelectorAll('[data-review-path]'))if(old.has(el.dataset.reviewPath))el.open=old.get(el.dataset.reviewPath);}
