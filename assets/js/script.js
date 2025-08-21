/* -----------------------------------------------------------
   Debt & Credit Tracker (Mobile-first static site)
   - SweetAlert2 for UX (toasts, confirms)
   - Chart.js dashboard
   - html2pdf print (with fallback to window.print)
   - Row delete inside statement + date filtering + footer toolbar
   ----------------------------------------------------------- */

// reduce console noise from html2canvas (used by html2pdf)
window.html2canvas = { logging: false };

if (!window.__DEBT_BOOK_APP_STATIC__) {
  window.__DEBT_BOOK_APP_STATIC__ = true;

  document.addEventListener('DOMContentLoaded', () => {
    /* ---------- helpers ---------- */
    const $ = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
    const esc = (s) => (s==null?'':String(s)).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m]));
    const fmt = (n) => Number(n||0).toLocaleString('da-DK',{style:'currency',currency:'DKK'});
    const todayISO = () => new Date().toISOString().slice(0,10);
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    const fileSafe = (s) => (s||'').replace(/[^\p{L}\p{N}\-_. ]/gu,'_');

    /* ---------- elements ---------- */
    const el = {
      theme: $('#theme-select'),
      exportJson: $('#export-json'),
      exportCsv: $('#export-csv'),
      importJson: $('#import-json'),
      printPerson: $('#print-person'),

      pName: $('#p-name'), pContact: $('#p-contact'), pNote: $('#p-note'),
      addPerson: $('#add-person'), pSearch: $('#p-search'), peopleList: $('#people-list'),
      currentWho: $('#current-person-label'),

      tType: $('#t-type'), tAmount: $('#t-amount'), tDate: $('#t-date'), tDue: $('#t-due'), tNote: $('#t-note'), addTx: $('#add-tx'),

      sumIn: $('#sum-in'), sumOut: $('#sum-out'), sumNet: $('#sum-net'),

      tabStatement: $('#tab-statement'), tabDashboard: $('#tab-dashboard'),

      a4: $('#a4-page'), head: $('#a4-header'), main: $('#a4-main'), foot: $('#a4-footer'),

      dlDash: $('#dl-dashboard'), dashWrap: $('#dashboard-wrap'),
      kpiPeople: $('#kpi-people'), kpiOwed: $('#kpi-owed'), kpiOwe: $('#kpi-owe'), kpiNet: $('#kpi-net'),
      chTop: $('#ch-top'), chMonthlyNet: $('#ch-monthly-net'), chByType: $('#ch-by-type'), chAging: $('#ch-aging'), chMonthlyCount: $('#ch-monthly-count')
    };

    /* ---------- SweetAlert helpers ---------- */
    const toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:1800, timerProgressBar:true });
    const ask = (opts) => Swal.fire({ icon:'question', showCancelButton:true, confirmButtonText:'Ja', cancelButtonText:'Annullér', ...opts });
    const wait = (title='Arbejder…') => Swal.fire({ title, allowOutsideClick:false, didOpen:()=>Swal.showLoading() });

    /* ---------- storage ---------- */
    const STORE_KEY = 'debt_book_static_v1';
    const THEME_KEY = 'debt_book_theme_v1';
    const UI_KEY    = 'debt_book_ui_v1';
    let model = load() || { people:[], tx:[], selectedId:null };
    let ui = loadUI() || { from:'', to:'' };

    function load(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)||''); } catch{ return null; } }
    function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(model)); }
    function loadUI(){ try{ return JSON.parse(localStorage.getItem(UI_KEY)||''); } catch{ return null; } }
    function saveUI(){ localStorage.setItem(UI_KEY, JSON.stringify(ui)); }

    // Theme boot
    (function bootTheme(){
      try{ const st=JSON.parse(localStorage.getItem(THEME_KEY)||'{}');
        if(st.theme){ document.documentElement.setAttribute('data-theme', st.theme); el.theme.value=st.theme; }
      }catch{}
    })();
    el.theme.addEventListener('change', ()=>{
      document.documentElement.setAttribute('data-theme', el.theme.value);
      localStorage.setItem(THEME_KEY, JSON.stringify({theme:el.theme.value}));
      toast.fire({icon:'success', title:'Tema skiftet'});
      renderDashboard(true);
    });

    /* ---------- init date ---------- */
    el.tDate.value = todayISO();

    /* ---------- model helpers ---------- */
    const personById = (id) => model.people.find(p=>p.id===id);
    const txForPerson = (id) => model.tx.filter(t=>t.pid===id).sort((a,b)=> (b.date||'').localeCompare(a.date||''));
    const balanceForPerson = (id) => txForPerson(id).reduce((s,t)=> s+(t.signed||0), 0);

    /* ---------- people ---------- */
    function addPerson(){
      const name=(el.pName.value||'').trim();
      if(!name){ Swal.fire({icon:'warning', title:'Angiv navn'}); return; }
      const p={ id:uid(), name, contact:(el.pContact.value||'').trim(), note:(el.pNote.value||'').trim(), created:todayISO() };
      model.people.push(p); model.selectedId=p.id;
      el.pName.value=''; el.pContact.value=''; el.pNote.value='';
      save(); renderPeople(); renderStatement(); renderSummary(); renderDashboard();
      toast.fire({icon:'success', title:'Person tilføjet'});
    }
    el.addPerson.addEventListener('click', addPerson);
    el.pSearch.addEventListener('input', renderPeople);

    function renderPeople(){
      const q=(el.pSearch.value||'').trim().toLowerCase();
      el.peopleList.innerHTML='';
      const frag=document.createDocumentFragment();
      model.people.slice().sort((a,b)=>a.name.localeCompare(b.name,'da'))
      .filter(p=>!q || p.name.toLowerCase().includes(q) || (p.contact||'').toLowerCase().includes(q))
      .forEach(p=>{
        const bal=balanceForPerson(p.id);
        const node=document.createElement('div');
        node.className='person '+(model.selectedId===p.id?'active ':'')+(bal>0?'positive':bal<0?'negative':'');
        node.innerHTML=`
          <div class="meta">
            <div class="name">${esc(p.name)}</div>
            <div class="contact">${esc(p.contact||'')}</div>
          </div>
          <div class="bal">${fmt(bal)}</div>`;
        node.addEventListener('click', ()=>{ model.selectedId=p.id; save(); renderPeople(); renderStatement(); });
        frag.appendChild(node);
      });
      el.peopleList.appendChild(frag);
      const cur=personById(model.selectedId); el.currentWho.textContent = cur?`Valgt: ${cur.name}`:'Vælg en person ovenfor';
    }

    /* ---------- transactions ---------- */
    function signedAmount(type, amount){
      const a=Math.abs(+amount||0);
      switch(type){
        case 'lent': return +a;
        case 'repay_to_me': return -a;
        case 'borrowed': return -a;
        case 'repay_by_me': return +a;
        default: return 0;
      }
    }
    function addTx(){
      const pid=model.selectedId; if(!pid){ Swal.fire({icon:'info', title:'Vælg person først'}); return; }
      const amount=+el.tAmount.value; if(!(amount>0)){ Swal.fire({icon:'warning', title:'Beløb skal være > 0'}); return; }
      const tx={ id:uid(), pid, type:el.tType.value, amount:+amount, signed:signedAmount(el.tType.value, amount),
        date: el.tDate.value || todayISO(), due: (el.tDue.value||''), note:(el.tNote.value||'').trim() };
      model.tx.push(tx); el.tAmount.value=''; el.tNote.value=''; el.tDue.value='';
      save(); renderPeople(); renderStatement(); renderSummary(); renderDashboard();
      toast.fire({icon:'success', title:'Transaktion tilføjet'});
    }
    el.addTx.addEventListener('click', addTx);

    function delTx(id){
      const idx=model.tx.findIndex(t=>t.id===id); if(idx<0) return;
      ask({title:'Slet transaktion?', text:'Denne handling kan ikke fortrydes.'}).then(r=>{
        if(r.isConfirmed){ model.tx.splice(idx,1); save(); renderPeople(); renderStatement(); renderSummary(); renderDashboard(); toast.fire({icon:'success', title:'Slettet'}); }
      });
    }

    /* ---------- date filter ---------- */
    function applyFilter(list){
      const from = ui.from ? new Date(ui.from) : null;
      const to   = ui.to   ? new Date(ui.to)   : null;
      return list.filter(t=>{
        const d = t.date ? new Date(t.date) : null;
        if(!d) return false;
        if(from && d < from) return false;
        if(to   && d > to)   return false;
        return true;
      });
    }

    /* ---------- summary ---------- */
    function renderSummary(){
      const net = model.tx.reduce((s,t)=>s+(t.signed||0),0);
      const pos = model.tx.filter(t=>t.signed>0).reduce((s,t)=>s+t.signed,0);
      const neg = model.tx.filter(t=>t.signed<0).reduce((s,t)=>s+t.signed,0);
      el.sumIn.textContent=fmt(pos);
      el.sumOut.textContent=fmt(Math.abs(neg));
      el.sumNet.textContent=fmt(net);
      el.sumNet.classList.toggle('good', net>=0);
      el.sumNet.classList.toggle('bad', net<0);
      $('#kpi-people').textContent=model.people.length;
      $('#kpi-owed').textContent=fmt(pos);
      $('#kpi-owe').textContent=fmt(Math.abs(neg));
      $('#kpi-net').textContent=fmt(net);
      $('#kpi-net').classList.toggle('good', net>=0);
      $('#kpi-net').classList.toggle('bad', net<0);
    }

    /* ---------- statement ---------- */
    function renderStatement(){
      const p=personById(model.selectedId);
      const all = p ? txForPerson(p.id) : [];

      el.head.innerHTML = p ? `
        <div class="title">
          <h1>${esc(p.name)}</h1>
          <span class="badge">Saldo: ${fmt(balanceForPerson(p.id))}</span>
        </div>
        <div class="contact">
          ${p.contact?`<span><i class="fa-solid fa-address-card"></i> ${esc(p.contact)}</span> · `:''}
          Oprettet: ${esc(p.created)}${(ui.from||ui.to)?` · <em>Filter: ${esc(ui.from||'…')} → ${esc(ui.to||'…')}</em>`:''}
        </div>
      ` : `<h1>Vælg en person</h1>`;

      if(!p){
        el.main.innerHTML='<p class="info-small">Når du vælger en person, vises en komplet kontoudskrift her.</p>';
        el.foot.innerHTML=''; return;
      }

      const ledger = (ui.from || ui.to) ? applyFilter(all) : all;

      const rows=ledger.map(t=>{
        const badge = t.type==='lent' ? 'Lånt til dem'
                   : t.type==='repay_to_me' ? 'Tilbagebetalt til mig'
                   : t.type==='borrowed' ? 'Jeg har lånt'
                   : 'Jeg har tilbagebetalt';
        const overdue = t.due && (t.type==='lent' || t.type==='borrowed') && (new Date(t.due) < new Date());
        return `<tr data-id="${t.id}" class="${overdue?'overdue':''}">
          <td>${esc(t.date||'')}</td>
          <td>${esc(t.due||'')}</td>
          <td><span class="tag">${badge}</span>${t.note?` — ${esc(t.note)}`:''}</td>
          <td class="num">${fmt(t.amount)}</td>
          <td class="num">${fmt(t.signed)}</td>
          <td class="act"><button class="row-del" data-del="${t.id}" title="Slet"><i class="fa-regular fa-trash-can"></i></button></td>
        </tr>`;
      }).join('');

      const bal=ledger.reduce((s,t)=>s+(t.signed||0),0);
      el.main.innerHTML = `
        <div class="stm-wrap" id="stmWrap">
          <table class="table" aria-label="Transaktioner">
            <thead>
              <tr><th>Dato</th><th>Forfald</th><th>Beskrivelse</th><th>Beløb</th><th>Signeret</th><th class="act">Slet</th></tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="6">Ingen transaktioner${(ui.from||ui.to)?' i valgte periode':''}.</td></tr>`}</tbody>
            <tfoot><tr><th colspan="4" class="num">Saldo ${ui.from||ui.to?'(filter)':''}</th><th class="num">${fmt(bal)}</th><th></th></tr></tfoot>
          </table>
        </div>`;

      // Per-row delete
      $$('#a4-main [data-del]').forEach(btn => btn.addEventListener('click', () => delTx(btn.dataset.del)));

      // Footer toolbar (filters + actions)
      el.foot.innerHTML = `
        <div class="stm-actions">
          <div class="group">
            <strong>Filter:</strong>
            <input id="flt-from" type="date" value="${esc(ui.from||'')}" />
            <span>→</span>
            <input id="flt-to" type="date" value="${esc(ui.to||'')}" />
            <button class="btn-outline btn-sm" id="flt-apply"><i class="fa-solid fa-filter"></i> Anvend</button>
            <button class="btn-outline btn-sm" id="flt-clear"><i class="fa-solid fa-eraser"></i> Ryd</button>
          </div>
          <div class="grow"></div>
          <div class="group">
            <button class="btn-outline" id="btn-person-info"><i class="fa-regular fa-id-badge"></i> Persondetaljer</button>
            <button class="btn-primary" id="btn-print-range"><i class="fa-solid fa-print"></i> Print transaktioner</button>
          </div>
        </div>`;

      // wire toolbar
      $('#flt-apply').addEventListener('click', ()=>{
        ui.from = $('#flt-from').value || '';
        ui.to   = $('#flt-to').value   || '';
        saveUI(); renderStatement();
      });
      $('#flt-clear').addEventListener('click', ()=>{
        ui.from=''; ui.to=''; saveUI(); renderStatement();
      });
      ['keyup','change'].forEach(ev=>{
        $('#flt-from').addEventListener(ev, e=>{ if(e.key==='Enter') $('#flt-apply').click(); });
        $('#flt-to').addEventListener(ev, e=>{ if(e.key==='Enter') $('#flt-apply').click(); });
      });

      $('#btn-person-info').addEventListener('click', ()=> showPersonInfo(p, all));
      $('#btn-print-range').addEventListener('click', ()=> printSelected(ledger));

      // If many rows, scroll to bottom (latest)
      if (ledger.length > 10) {
        const wrap = $('#stmWrap');
        if (wrap) wrap.scrollTop = wrap.scrollHeight;
      }
    }

    /* ---------- Person info (SweetAlert) ---------- */
    function showPersonInfo(p, allTx){
      const total = allTx.length;
      const pos = allTx.filter(t=>t.signed>0).reduce((s,t)=>s+t.signed,0);
      const neg = allTx.filter(t=>t.signed<0).reduce((s,t)=>s+t.signed,0);
      const html = `
        <div style="text-align:left">
          <div style="font-weight:800;font-size:1.1rem">${esc(p.name)}</div>
          <div style="color:#64748b;margin:.25rem 0 .5rem">${p.contact?esc(p.contact)+' · ':''}Oprettet: ${esc(p.created)}</div>
          <ul style="padding-left:1rem;margin:.25rem 0;line-height:1.5">
            <li><strong>Saldo:</strong> ${fmt(balanceForPerson(p.id))}</li>
            <li><strong>Transaktioner:</strong> ${total}</li>
            <li><strong>De skylder:</strong> ${fmt(pos)}</li>
            <li><strong>Jeg skylder:</strong> ${fmt(Math.abs(neg))}</li>
            ${p.note?`<li><strong>Note:</strong> ${esc(p.note)}</li>`:''}
          </ul>
        </div>`;
      Swal.fire({ title:'Persondetaljer', html, icon:'info', confirmButtonText:'OK' });
    }

    /* ---------- printing (respects current filter) ---------- */
    const printCSS = `
      @page{size:a4;margin:0}
      body{margin:0;font-family:Inter,Arial,sans-serif;color:#111}
      .wrap{width:210mm;min-height:297mm;padding:12mm;box-sizing:border-box}
      h1{margin:0 0 4mm;font-size:22pt}
      .meta{color:#666;margin:0 0 6mm}
      .badge{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #e0e0e0;background:#f7f9f9;font-weight:700;margin-left:6px}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:1px solid #e5e7eb;padding:6px 4px;text-align:left}
      th{color:#5F7C79}
      td.num,th.num{text-align:right;font-weight:700}
    `;

    function buildStatementHTML(p, ledger){
      const bal = ledger.reduce((s,t)=>s+(t.signed||0),0);
      const rows = ledger.map(t=>{
        const badge = t.type==='lent' ? 'Lånt til dem'
                   : t.type==='repay_to_me' ? 'Tilbage til mig'
                   : t.type==='borrowed' ? 'Jeg har lånt'
                   : 'Jeg har tilbagebetalt';
        return `<tr>
          <td>${esc(t.date||'')}</td>
          <td>${esc(t.due||'')}</td>
          <td><span style="border:1px solid #e5e7eb;padding:2px 6px;border-radius:8px;background:#f8fafc;font-weight:700">${badge}</span>${t.note?` — ${esc(t.note)}`:''}</td>
          <td class="num">${fmt(t.amount)}</td>
          <td class="num">${fmt(t.signed)}</td>
        </tr>`;
      }).join('');
      return `
        <div class="wrap">
          <h1>${esc(p.name)} <span class="badge">Saldo: ${fmt(bal)}</span></h1>
          <div class="meta">${p.contact?`${esc(p.contact)} · `:''}Oprettet: ${esc(p.created)}</div>
          <table>
            <thead><tr><th>Dato</th><th>Forfald</th><th>Beskrivelse</th><th>Beløb</th><th>Signeret</th></tr></thead>
            <tbody>${rows||`<tr><td colspan="5">Ingen transaktioner.</td></tr>`}</tbody>
            <tfoot><tr><th colspan="4" class="num">Saldo</th><th class="num">${fmt(bal)}</th></tr></tfoot>
          </table>
        </div>`;
    }

    async function printSelected(customLedger){
      const p=personById(model.selectedId);
      if(!p){ Swal.fire({icon:'info', title:'Vælg en person først'}); return; }
      const ledger = Array.isArray(customLedger) ? customLedger : txForPerson(p.id);
      if(!ledger.length){ Swal.fire({icon:'info', title:'Ingen transaktioner at printe'}); return; }

      const html = buildStatementHTML(p, ledger);
      const holder=document.createElement('div');
      holder.style.position='fixed'; holder.style.left='-99999px'; holder.style.top='0';
      holder.innerHTML=html;
      document.body.appendChild(holder);

      try{
        await wait('Genererer PDF …');
        const opt={
          margin:0,
          filename:`konto-${fileSafe(p.name||'person')}.pdf`,
          image:{type:'jpeg',quality:0.98},
          html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false},
          jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
          pagebreak:{mode:['avoid-all','css','legacy']}
        };
        await html2pdf().set(opt).from(holder.firstElementChild).save();
        Swal.close();
        toast.fire({icon:'success', title:'PDF gemt'});
      }catch(err){
        Swal.close();
        const w=window.open('','_blank');
        if(w){
          w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)}</title><style>${printCSS}</style></head><body>${html}</body></html>`);
          w.document.close(); w.focus(); w.print(); w.close();
        }else{
          Swal.fire({icon:'error', title:'Kunne ikke generere PDF', text: String(err||'')});
        }
      } finally {
        holder.remove();
      }
    }
    // Topbar print button respects current filter too
    el.printPerson.addEventListener('click', ()=>{
      const p=personById(model.selectedId); if(!p){ Swal.fire({icon:'info', title:'Vælg en person først'}); return; }
      const all = txForPerson(p.id);
      const ledger = (ui.from || ui.to) ? applyFilter(all) : all;
      printSelected(ledger);
    });

    /* ---------- dashboard (Chart.js) ---------- */
    const charts={ top:null, monthlyNet:null, byType:null, aging:null, monthlyCount:null };
    const cssVar = (name)=> getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const colorSet = ()=>({ accent:cssVar('--accent'), good:cssVar('--good'), bad:cssVar('--bad'), neutral:'#64748b' });

    const monthsBackLabels=(n=12)=>{ const arr=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ const t=new Date(d.getFullYear(), d.getMonth()-i, 1); arr.push(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`); } return arr; };
    const bucketMonth=(s)=> s ? `${new Date(s).getFullYear()}-${String(new Date(s).getMonth()+1).padStart(2,'0')}` : '';
    const computeMonthlySeries=()=>{ const labels=monthsBackLabels(12), net=labels.map(()=>0), count=labels.map(()=>0); model.tx.forEach(t=>{ const m=bucketMonth(t.date); const i=labels.indexOf(m); if(i>-1){ net[i]+=t.signed||0; count[i]+=1; }}); return {labels,net,count}; };
    const topBalances=(n=7)=>{ const a=model.people.map(p=>({name:p.name,bal:txForPerson(p.id).reduce((s,t)=>s+t.signed,0)})); a.sort((x,y)=>Math.abs(y.bal)-Math.abs(x.bal)); return a.slice(0,n); };
    const byType=()=>{ const types=['lent','repay_to_me','borrowed','repay_by_me']; const labels=['Lånt til dem','Tilbage til mig','Jeg har lånt','Jeg har tilbagebetalt']; const data=types.map(tp=>model.tx.filter(t=>t.type===tp).reduce((s,t)=>s+Math.abs(t.amount||0),0)); return {labels,data}; };
    const agingBuckets=()=>{ const now=new Date(); const b={'0–7':0,'8–30':0,'31–60':0,'60+':0}; model.tx.forEach(t=>{ if(!t.due) return; const due=new Date(t.due); if(due>=now) return; const days=Math.floor((now-due)/(1000*60*60*24)); const amt=Math.abs(t.signed||0); if(days<=7) b['0–7']+=amt; else if(days<=30) b['8–30']+=amt; else if(days<=60) b['31–60']+=amt; else b['60+']+=amt; }); const labels=Object.keys(b); const data=labels.map(k=>b[k]); return {labels,data}; };

    const makeOrUpdate=(key, ctx, cfg)=>{ if(charts[key]){ charts[key].data=cfg.data; charts[key].options=cfg.options||{}; charts[key].update(); } else charts[key]=new Chart(ctx,cfg); };

    function renderDashboard(force=false){
      const {accent,good,bad,neutral}=colorSet();
      const tops=topBalances(7);
      makeOrUpdate('top', el.chTop.getContext('2d'), { type:'bar',
        data:{ labels: tops.map(x=> x.name+(x.bal>=0?' (de skylder)':' (jeg skylder)')),
          datasets:[{ data: tops.map(x=>Math.abs(x.bal)), backgroundColor: tops.map(x=>x.bal>=0?good:bad) }]},
        options:{responsive:true, scales:{y:{beginAtZero:true}}, plugins:{legend:{display:false}}}
      });

      const ms=computeMonthlySeries();
      makeOrUpdate('monthlyNet', el.chMonthlyNet.getContext('2d'), { type:'line',
        data:{ labels: ms.labels, datasets:[{ label:'Netto', data: ms.net, borderColor:accent, backgroundColor:'transparent', tension:.25 }]},
        options:{responsive:true, scales:{y:{beginAtZero:true}}}
      });

      const bt=byType();
      makeOrUpdate('byType', el.chByType.getContext('2d'), { type:'doughnut',
        data:{ labels: bt.labels, datasets:[{ data: bt.data, backgroundColor:[good,bad,neutral,accent] }]},
        options:{responsive:true, plugins:{legend:{position:'bottom'}}}
      });

      const ag=agingBuckets();
      makeOrUpdate('aging', el.chAging.getContext('2d'), { type:'bar',
        data:{ labels: ag.labels, datasets:[{ data: ag.data, backgroundColor:bad }]},
        options:{responsive:true, scales:{y:{beginAtZero:true}}, plugins:{legend:{display:false}}}
      });

      makeOrUpdate('monthlyCount', el.chMonthlyCount.getContext('2d'), { type:'bar',
        data:{ labels: ms.labels, datasets:[{ label:'Antal transaktioner', data: ms.count, backgroundColor:neutral }]},
        options:{responsive:true, scales:{y:{beginAtZero:true,precision:0}}}
      });

      if(force) Object.values(charts).forEach(c=>c && c.update());
    }

    /* ---------- export/import ---------- */
    el.exportJson.addEventListener('click', ()=>{
      const blob=new Blob([JSON.stringify(model,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='debtbook.json'; a.click(); URL.revokeObjectURL(a.href);
      toast.fire({icon:'success', title:'JSON eksporteret'});
    });

    el.exportCsv.addEventListener('click', ()=>{
      const header=['person','contact','tx_date','due','type','amount','signed','note'];
      const lines=[header.join(',')];
      model.tx.forEach(t=>{
        const p=personById(t.pid)||{};
        const row=[`"${(p.name||'').replace(/"/g,'""')}"`,`"${(p.contact||'').replace(/"/g,'""')}"`,t.date||'',t.due||'',t.type,t.amount,t.signed,`"${(t.note||'').replace(/"/g,'""')}"`];
        lines.push(row.join(','));
      });
      const blob=new Blob([lines.join('\n')],{type:'text/csv'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='debtbook.csv'; a.click(); URL.revokeObjectURL(a.href);
      toast.fire({icon:'success', title:'CSV eksporteret'});
    });

    el.importJson.addEventListener('change', async (e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      try{
        const text=await f.text(); const data=JSON.parse(text);
        if(!data || !Array.isArray(data.people) || !Array.isArray(data.tx)) throw new Error('Ugyldigt format');
        const res=await ask({title:'Importér data?', text:'Eksisterende data overskrives.'}); if(!res.isConfirmed) return;
        model={ people:data.people, tx:data.tx, selectedId:data.selectedId||null }; save();
        renderPeople(); renderStatement(); renderSummary(); renderDashboard();
        Swal.fire({icon:'success', title:'Importerede data!', timer:1500, showConfirmButton:false});
      }catch(err){ Swal.fire({icon:'error', title:'Kunne ikke importere', text:err.message}); }
      finally{ e.target.value=''; }
    });

    /* ---------- tabs ---------- */
    document.querySelectorAll('.tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const dash = btn.dataset.tab==='dashboard';
        el.tabDashboard.hidden=!dash; el.tabStatement.hidden=dash;
        if(dash) renderDashboard();
      });
    });

    /* ---------- boot ---------- */
    renderPeople(); renderStatement(); renderSummary(); renderDashboard();
  });
}
