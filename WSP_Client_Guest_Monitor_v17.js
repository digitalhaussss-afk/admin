/*
 * The Wedding Space — Client RSVP / Guest Management Monitor (v17)
 * Read-only widget. Mount inside the EXISTING authenticated Supabase client dashboard.
 * Example:
 *   const monitor = WSPGuestClientMonitor.mount({
 *     container: document.querySelector('#clientGuestMonitoring'),
 *     supabaseClient: supabaseClientUsedByYourClientPanel,
 *     orderId: activeOrder.order_id
 *   });
 *   // monitor.refresh() to load again, monitor.destroy() on logout/navigation.
 * IMPORTANT: does not replace an existing client portal / its login.
 */
(function (global) {
  'use strict';
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const css = `.wspgm-client{font:14px/1.55 Inter,system-ui,Arial,sans-serif;color:#302e51;background:white;border:1px solid #e7e5f4;border-radius:18px;padding:20px;box-shadow:0 8px 30px #34345a0b;min-width:0}.wspgm-client *{box-sizing:border-box}.wspgm-client h3{margin:0 0 4px;font-size:20px}.wspgm-client p{color:#85859b;font-size:12px}.wspgm-client .wspgm-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.wspgm-client button,.wspgm-client select,.wspgm-client input{font:inherit}.wspgm-client button{padding:9px 12px;background:#f0edff;border:1px solid #e0dcfc;border-radius:10px;color:#6152cf;font-weight:750;cursor:pointer}.wspgm-client .wspgm-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.wspgm-client select,.wspgm-client input{min-width:150px;flex:1;padding:10px;border:1px solid #e7e5f2;border-radius:10px;background:white}.wspgm-client .wspgm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:15px 0}.wspgm-client .wspgm-stat{border:1px solid #e9e5fc;background:#faf9ff;border-radius:12px;padding:13px}.wspgm-client .wspgm-stat b{display:block;color:#5951ce;font-size:24px}.wspgm-client .wspgm-stat span{font-size:11px;color:#8d8ca5}.wspgm-client .wspgm-scroll{overflow-x:auto}.wspgm-client table{border-collapse:collapse;width:100%;min-width:650px;font-size:12px}.wspgm-client td,.wspgm-client th{border-bottom:1px solid #eeeaf6;padding:12px;text-align:left;vertical-align:top}.wspgm-client th{background:#faf9ff;color:#8886a0}.wspgm-client .wspgm-pill{display:inline-block;background:#f0edff;color:#6653d6;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800}.wspgm-client .wspgm-pill.yes{background:#e6f8ec;color:#277a4c}.wspgm-client .wspgm-pill.no{background:#ffefec;color:#a6534f}.wspgm-client small{font-size:11px;color:#9896ae}.wspgm-client .wspgm-empty{padding:18px;background:#f8f7ff;color:#79759e;border-radius:12px;margin-top:15px}.wspgm-client .wspgm-error{padding:14px;color:#af4c51;background:#fff1f2;border-radius:12px}.wspgm-client .wspgm-note{font-size:11px;color:#9592a7;margin-top:15px}@media(max-width:650px){.wspgm-client{padding:13px}.wspgm-client .wspgm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wspgm-client .wspgm-stat b{font-size:21px}}`;
  function injectStyle() {
    if (document.querySelector('#wspgm-client-style')) return;
    const style = document.createElement('style'); style.id = 'wspgm-client-style'; style.textContent = css; document.head.appendChild(style);
  }
  function mount({container,supabaseClient,orderId}) {
    container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!container || !supabaseClient || !orderId) throw Error('container, supabaseClient, dan orderId wajib diisi.');
    injectStyle();
    let disposed=false,activeFormId='',forms=[],guests=[],responses=[],questions=[],busy=false;
    container.classList.add('wspgm-client');
    const base = () => `<div class="wspgm-head"><div><h3>Guest Management & RSVP</h3><p>Pantau daftar undangan dan jawaban tamu. Dikelola oleh tim The Wedding Space.</p></div><button type="button" data-wspgm="refresh">↻ Refresh</button></div><div id="wspgm-body" aria-live="polite"></div>`;
    const tableRows = (items,index) => items.map(g => {
      const r=index.get(g.id); const answer=r?.attendance==='attending'?'Hadir':r?.attendance==='not_attending'?'Tidak hadir':r?'Sudah menjawab':'Belum jawab';
      const cls=r?.attendance==='attending'?'yes':r?.attendance==='not_attending'?'no':'';
      const extra=Object.entries(r?.answers||{}).map(([key,value])=>{
        const question=questions.find(q=>String(q.id)===String(key));
        const answer=Array.isArray(value)?value.join(', '):typeof value==='object'?JSON.stringify(value):String(value??'');
        return `<div><small>${safe(question?.label||key)}:</small> ${safe(answer)}</div>`;
      }).join('');
      return `<tr data-wspgm-row data-search="${safe(g.guest_name.toLowerCase())}"><td><b>${safe(g.guest_name)}</b></td><td>${safe(g.max_attending||1)} orang</td><td><span class="wspgm-pill ${g.delivery_status==='sent'?'yes':''}">${g.delivery_status==='sent'?'Ditandai terkirim':'Belum dikirim'}</span></td><td><span class="wspgm-pill ${cls}">${safe(answer)}</span></td><td>${safe(r?.attendee_count??'—')}</td><td>${extra||'—'}</td><td>${safe(r?.message||'—')}</td></tr>`;
    }).join('');
    function render() {
      if(disposed)return;
      container.innerHTML=base();
      const region=container.querySelector('#wspgm-body');
      if(!forms.length){region.innerHTML='<div class="wspgm-empty">Belum ada RSVP yang aktif untuk pesanan ini.</div>';return}
      const form=forms.find(f=>String(f.id)===String(activeFormId))||forms[0];
      const index=new Map(responses.map(r=>[r.guest_id,r]));
      const replied=guests.filter(g=>index.has(g.id)).length;
      const sent=guests.filter(g=>g.delivery_status==='sent').length;
      const attending=responses.filter(r=>r.attendance==='attending').reduce((n,r)=>n+Number(r.attendee_count||0),0);
      const decline=responses.filter(r=>r.attendance==='not_attending').length;
      region.innerHTML=`${forms.length>1?`<div class="wspgm-toolbar"><select aria-label="Pilih form RSVP" id="wspgm-form">${forms.map(f=>`<option value="${safe(f.id)}" ${f.id===form.id?'selected':''}>${safe(f.title||'Form RSVP')}</option>`).join('')}</select></div>`:''}
      <div class="wspgm-grid"><div class="wspgm-stat"><b>${guests.length}</b><span>Total tamu</span></div><div class="wspgm-stat"><b>${sent}</b><span>Ditandai terkirim</span></div><div class="wspgm-stat"><b>${replied}</b><span>Sudah menjawab</span></div><div class="wspgm-stat"><b>${attending}</b><span>Jumlah hadir · ${decline} menolak</span></div></div>
      <div class="wspgm-toolbar"><input id="wspgm-filter" aria-label="Cari nama tamu" placeholder="Cari nama tamu…" type="search"></div>
      <div class="wspgm-scroll"><table><thead><tr><th>Nama tamu</th><th>Kuota</th><th>Pengiriman*</th><th>RSVP</th><th>Jumlah hadir</th><th>Jawaban tambahan</th><th>Pesan</th></tr></thead><tbody>${tableRows(guests,index)||'<tr><td colspan="7">Belum ada tamu yang didaftarkan oleh admin.</td></tr>'}</tbody></table></div>
      <p class="wspgm-note">*Pengiriman dicatat secara manual oleh admin. Data RSVP berasal dari Supabase dan hanya dapat dilihat oleh pemilik pesanan yang login.</p>`;
    }
    async function refresh(){
      if(disposed||busy)return;busy=true;
      container.innerHTML=base();container.querySelector('#wspgm-body').innerHTML='<p>Memuat data RSVP…</p>';
      try{
        const {data:{user},error:authError}=await supabaseClient.auth.getUser();
        if(authError)throw authError;if(!user)throw Error('Silakan login ke panel klien terlebih dahulu.');
        const f=await supabaseClient.from('wedding_rsvp_forms').select('id,title,guest_management_enabled').eq('order_id',orderId).eq('owner_user_id',user.id);
        if(f.error)throw f.error;
        forms=(f.data||[]).filter(x=>x.guest_management_enabled===true);
        if(!forms.some(x=>String(x.id)===String(activeFormId)))activeFormId=forms[0]?.id||'';
        guests=[];responses=[];questions=[];
        if(forms.length){
          const q=await supabaseClient.from('wedding_rsvp_questions').select('id,label').eq('form_id',activeFormId);
          if(!q.error)questions=q.data||[];
          const g=await supabaseClient.from('wedding_rsvp_guests').select('id,guest_name,max_attending,delivery_status').eq('form_id',activeFormId).order('created_at',{ascending:false});
          if(g.error)throw g.error;guests=g.data||[];
          if(guests.length){
            const buckets=[];for(let i=0;i<guests.length;i+=75)buckets.push(guests.slice(i,i+75).map(x=>x.id));
            const rr=await Promise.all(buckets.map(ids=>supabaseClient.from('wedding_rsvp_responses').select('guest_id,attendance,attendee_count,answers,message').in('guest_id',ids)));
            for(const r of rr){if(r.error)throw r.error;responses.push(...(r.data||[]))}
          }
        }
        render();
      } catch(error){if(!disposed){container.innerHTML=base();container.querySelector('#wspgm-body').innerHTML='<div class="wspgm-error">Gagal mengambil data RSVP. Periksa sesi klien, kebijakan RLS, dan koneksi Supabase. '+safe(error.message)+'</div>'}}
      finally{busy=false}
    }
    const onClick=event=>{if(event.target.closest('[data-wspgm="refresh"]'))refresh()};
    const onChange=event=>{if(event.target.id==='wspgm-form'){activeFormId=event.target.value;refresh()}};
    const onInput=event=>{if(event.target.id==='wspgm-filter'){const term=event.target.value.trim().toLowerCase();container.querySelectorAll('[data-wspgm-row]').forEach(row=>row.hidden=!row.dataset.search.includes(term))}};
    container.addEventListener('click',onClick);container.addEventListener('change',onChange);container.addEventListener('input',onInput);
    refresh();
    return {refresh,destroy(){disposed=true;container.removeEventListener('click',onClick);container.removeEventListener('change',onChange);container.removeEventListener('input',onInput);container.classList.remove('wspgm-client');container.innerHTML=''}};
  }
  global.WSPGuestClientMonitor={mount};
})(window);
