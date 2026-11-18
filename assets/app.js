const DATA = window.PRODUCT_DATA;
if(!DATA){ document.body.innerHTML='<p style="padding:24px">โหลดข้อมูลไม่ได้: ไม่พบไฟล์ data/products.js</p>'; throw new Error('missing data'); }
const G = DATA.g;                 // groups: {n,s,w,d,pr,k,m}
const P = DATA.p.map((r,i)=>({i,code:r[0],name:r[1],unit:r[2],price:r[3],stock:r[4],g:r[5],bc:r[6]}));
const byCode = new Map(P.map(p=>[p.code,p]));
const groupProds = G.map(()=>[]); P.forEach(p=>groupProds[p.g].push(p));

/* ---------- storage (best-effort) ---------- */
const store = {
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
};

/* ---------- text normalisation ---------- */
function norm(s){
  return String(s).toLowerCase()
    .replace(/[″“”]/g,'"').replace(/[’‘]/g,"'")
    .replace(/มิลลิเมตร|มิลลิ|มิล\.?|มม\.?|m\.m\.|\bmm\b/g,' มม ')
    .replace(/เซนติเมตร|เซน\.?|ซม\.?|\bcm\b/g,' ซม ')
    .replace(/นิ้ว/g,'"')
    .replace(/\*+/g,' ')
    .replace(/([0-9])([^\s0-9.\/"x×-])/g,'$1 $2')
    .replace(/([^\s0-9.\/])([0-9])/g,'$1 $2')
    .replace(/[×]/g,'x')
    .replace(/[(),\[\]#]/g,' ')
    .replace(/\s+/g,' ').trim();
}
const compact = s => s.replace(/\s+/g,'');
function bigrams(s){const out=new Set(); for(let i=0;i<s.length-1;i++) out.add(s.substr(i,2)); if(s.length===1) out.add(s); return out}
function trigrams(s){const o=new Set();if(s.length<3){o.add(s);return o}for(let i=0;i<s.length-2;i++)o.add(s.substr(i,3));return o}
function cover(q,p){if(!q.size)return 0;let n=0;for(const x of q)if(p.has(x))n++;return n/q.size}
function dice(a,b){ if(!a.size||!b.size) return 0; let n=0; for(const x of a) if(b.has(x)) n++; return 2*n/(a.size+b.size) }
function numbers(s){ return (s.match(/\d+(?:\.\d+)?(?:\/\d+)?/g)||[]) }
// 1 หุน = 1/8 นิ้ว ≈ 3.175 มม.
function expandNumbers(nq){
  const nums=new Set(numbers(nq));
  const reH=/(\d+(?:\.\d+)?)\s*หุน/g; let m;
  while((m=reH.exec(nq))){ const h=parseFloat(m[1]); nums.add(String(Math.round(h*3.175))); if(h===2)nums.add('6'); if(h===3)nums.add('9'); if(h===4){nums.add('12');nums.add('1/2')} if(h===6)nums.add('3/4'); if(h===8)nums.add('1') }
  const reM=/(\d+(?:\.\d+)?)\s*มม/g;
  while((m=reM.exec(nq))){ const mm=parseFloat(m[1]); const h=Math.round(mm/3.175); if(Math.abs(h*3.175-mm)<1.3) nums.add(h+'หุน') }
  return nums;
}

/* ---------- index ---------- */
G.forEach(g=>{
  g.terms = g.s.map(t=>{const n=norm(t);return {raw:t,c:compact(n),bg:bigrams(compact(n))}}).filter(t=>t.c.length>=2);
  g.info = norm(g.w+' '+g.d); g.infoC = compact(g.info); g.infoTg = trigrams(g.infoC);
  g.nameC = compact(norm(g.n));
});
P.forEach(p=>{
  p.n = norm(p.name); p.c = compact(p.n); p.bg = bigrams(p.c); p.tg = trigrams(p.c);
  p.nums = new Set(numbers(p.n));
  const hm = p.n.match(/(\d+(?:\.\d+)?)\s*หุน/g); if(hm) hm.forEach(x=>p.nums.add(x.replace(/\s/g,'')));
  p.codeL = p.code.toLowerCase();
});

/* ---------- search ---------- */
function search(raw){
  const nq = norm(raw), qc = compact(nq);
  if(qc.length===0) return null;
  const qbg = bigrams(qc); const qtg = trigrams(qc);
  const qnums = expandNumbers(nq);
  const tokens = nq.split(' ').filter(t=>t.length>=2 && !/^\d/.test(t) && !['มม','ซม','หุน'].includes(t));

  // 1) groups: synonym / description / fuzzy
  const gScore = new Float32Array(G.length); const gWhy = new Array(G.length);
  let residual = qc;
  G.forEach((g,gi)=>{
    let best=0, why='';
    for(const t of g.terms){
      let s=0;
      if(qc===t.c || (t.c.length>=4 && qc.includes(t.c)) || nq.split(' ').includes(t.c)) s = 12 + Math.min(t.c.length,12);
      else if(t.c.includes(qc) && qc.length>=2) s = 6 + qc.length*0.6;
      else { const d=dice(qbg,t.bg); if(d>=0.55) s = 14*d; if(qc.length>=4){ const cv=cover(qtg,trigrams(t.c)); if(cv>=0.7) s=Math.max(s,16*cv) } }
      if(s>best){best=s; why=t.raw}
    }
    let info=0;
    for(const tk of tokens){ if(tk.length>=3 && g.info.includes(tk)) info+=8 }
    if(qc.length>=4){ const cv=cover(trigrams(qc),g.infoTg); if(cv>=0.6) info=Math.max(info,12*cv) }
    if(info>0 && best<info){ why = why || 'ตรงกับคำอธิบาย/การใช้งาน' }
    gScore[gi] = best + info; gWhy[gi]=why;
  });
  // strip the strongest matched synonym from the query so the rest (e.g. size) ranks products
  let topG = -1, topS = 0; gScore.forEach((s,i)=>{if(s>topS){topS=s;topG=i}});
  if(topG>=0){ for(const t of G[topG].terms){ if(t.c.length>=3 && qc.includes(t.c)){ residual = qc.replace(t.c,''); break } } }
  const rbg = bigrams(residual);

  // 2) products
  const res=[];
  for(const p of P){
    let s=0;
    if(p.codeL===qc) s+=100; else if(qc.length>=3 && p.codeL.includes(qc)) s+=30;
    if(p.bc && qc.length>=5 && p.bc.includes(qc)) s+=60;
    if(p.c.includes(qc)) s+=25 + qc.length*0.3;
    let hit=0; for(const tk of tokens){ if(p.n.includes(tk)) {s+=6; hit++} }
    const d = dice(qbg,p.bg); s += d*18;
    if(qc.length>=4){ const cv=cover(qtg,p.tg); if(cv>=0.5) s += cv*16 }
    if(residual.length>=2 && residual!==qc){ if(p.c.includes(residual)) s+=10; s += dice(rbg,p.bg)*8 }
    if(qnums.size){ let nh=0; for(const n of qnums){ if(p.nums.has(n)) nh++ } s += nh*6 - (qnums.size-nh)*1.5 }
    s += gScore[p.g]*1.6;
    if(s>=9) res.push({p,s});
  }
  res.sort((a,b)=>b.s-a.s || (b.p.stock>0)-(a.p.stock>0));
  // group ranking = own score + best products inside
  const agg = new Map();
  res.slice(0,300).forEach(r=>{ agg.set(r.p.g, Math.max(agg.get(r.p.g)||0, r.s)) });
  G.forEach((g,i)=>{ if(gScore[i]>=8) agg.set(i, Math.max(agg.get(i)||0, gScore[i]*2)) });
  const groups=[...agg.entries()].sort((a,b)=>b[1]-a[1]).map(([gi,s])=>({gi,s,why:gWhy[gi]}));
  return {q:raw,res,groups,gScore};
}

/* ---------- UI helpers ---------- */
const $=s=>document.querySelector(s);
const fmt=n=>n.toLocaleString('th-TH',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('on'),1600)}
function tab(t){if(t!=='results'&&innerWidth<900){const a=document.querySelector('aside');setTimeout(()=>a.scrollIntoView({behavior:'smooth',block:'start'}),50)}document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id==='p-'+t))}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>tab(b.dataset.t));
const priceHtml=p=>p.price>0?`<span class="price">฿${fmt(p.price)}</span>`:`<span class="price zero">ไม่มีราคา</span>`;

/* ---------- cart ---------- */
let cart = store.get('cart',{});   // code -> qty
function cartAdd(code,q=1){ cart[code]=(cart[code]||0)+q; if(cart[code]<=0) delete cart[code]; store.set('cart',cart); renderCart(); }
function cartSet(code,q){ q=Math.max(0,Math.floor(+q||0)); if(q) cart[code]=q; else delete cart[code]; store.set('cart',cart); renderCart(); }
function cartTotal(){ let t=0,n=0; for(const [c,q] of Object.entries(cart)){const p=byCode.get(c); if(p){t+=p.price*q; n+=q}} return {t,n} }
function renderCart(){
  const {t,n}=cartTotal(); $('#badge').textContent=n; $('#hdrTotal').textContent=n?'฿'+fmt(t):'';
  const lines=Object.entries(cart).map(([c,q])=>({p:byCode.get(c),q})).filter(x=>x.p);
  const el=$('#p-cart');
  if(!lines.length){el.innerHTML='<p class="hint">ตะกร้ายังว่าง กด “+ ใส่ตะกร้า” ที่สินค้าเพื่อเพิ่ม</p>';return}
  el.innerHTML = lines.map(({p,q})=>`
    <div class="cartline" data-code="${esc(p.code)}">
      <div class="nm">${esc(p.name)}<div class="small">${esc(p.code)} · ${p.price>0?'฿'+fmt(p.price)+' / '+esc(p.unit||'หน่วย'):'ไม่มีราคา'}</div></div>
      <div class="ln">฿${fmt(p.price*q)}</div>
      <div class="ctl"><div class="qty"><button data-a="-">−</button><input value="${q}" inputmode="numeric"><button data-a="+">+</button></div><button class="rm" data-a="x">ลบ</button></div>
    </div>`).join('') + `
    <div class="total"><span>รวม ${n} ชิ้น</span><b>฿${fmt(t)}</b></div>
    ${lines.some(l=>!(l.p.price>0))?'<p class="small">* มีบางรายการที่ไม่มีราคาในระบบ ไม่ได้นับรวมในยอด</p>':''}
    <div class="row"><button class="btn primary" id="copyCart">คัดลอกรายการ</button><button class="btn" id="clearCart">ล้างตะกร้า</button></div>`;
  el.querySelectorAll('.cartline').forEach(row=>{
    const code=row.dataset.code;
    row.querySelector('[data-a="-"]').onclick=()=>cartAdd(code,-1);
    row.querySelector('[data-a="+"]').onclick=()=>cartAdd(code,1);
    row.querySelector('[data-a="x"]').onclick=()=>cartSet(code,0);
    row.querySelector('input').onchange=e=>cartSet(code,e.target.value);
  });
  $('#clearCart').onclick=()=>{cart={};store.set('cart',cart);renderCart()};
  $('#copyCart').onclick=async()=>{
    const txt=lines.map(({p,q})=>`${p.code}\t${p.name}\t${q} ${p.unit}\t฿${fmt(p.price*q)}`).join('\n')+`\nรวม\t\t\t฿${fmt(t)}`;
    try{await navigator.clipboard.writeText(txt);toast('คัดลอกแล้ว')}catch(e){toast('คัดลอกไม่ได้ในหน้านี้')}
  };
}
$('#cartBtn').onclick=()=>tab('cart');

/* ---------- popularity stats (kept in this browser) ---------- */
let stats = store.get('stats',{q:{},p:{}});
if(!stats.q) stats.q={}; if(!stats.p) stats.p={};
let lastRec=null;
function recordQuery(term){
  term=term.trim(); if(term.length<2) return;
  const now=Date.now();
  // typing "ไว" → "ไวเม" → "ไวเมท": keep only the final word
  if(lastRec && now-lastRec.t<15000 && lastRec.term!==term && (term.startsWith(lastRec.term)||lastRec.term.startsWith(term))){
    const o=stats.q[lastRec.term]; if(o){ o.n--; if(o.n<=0) delete stats.q[lastRec.term] }
  } else if(lastRec && lastRec.term===term && now-lastRec.t<5000) return;
  const e=stats.q[term]||(stats.q[term]={n:0,t:0}); e.n++; e.t=now; lastRec={term,t:now};
  store.set('stats',stats); renderChips();
}
function bumpProduct(code,w=1){
  const e=stats.p[code]||(stats.p[code]={n:0,t:0}); e.n+=w; e.t=Date.now();
  store.set('stats',stats);
}
function topTerms(k){ return Object.entries(stats.q).sort((a,b)=>b[1].n-a[1].n||b[1].t-a[1].t).slice(0,k) }
function topProducts(k){ return Object.entries(stats.p).filter(([c])=>byCode.has(c)).sort((a,b)=>b[1].n-a[1].n||b[1].t-a[1].t).slice(0,k).map(([c,e])=>({p:byCode.get(c),n:e.n})) }
function addToCart(code,q=1){ cartAdd(code,q); bumpProduct(code,2); toast('เพิ่มลงตะกร้าแล้ว') }
function clearStats(){ stats={q:{},p:{}}; lastRec=null; store.set('stats',stats); renderChips(); if(!$('#q').value.trim()){renderResults(null);buildGraph(null)} }
const EXAMPLES=['ไวเมท','DB12','เหล็ก 2 หุน','ทำโครงหลังคา','ลวดผูก','ไม้เต็ง','กล่องดำ 2"'];
function renderChips(){
  const box=$('#chips'); box.innerHTML='';
  const tops=topTerms(7).map(([term,e])=>({term,n:e.n}));
  const seen=new Set(tops.map(x=>x.term));
  const list=tops.concat(EXAMPLES.filter(x=>!seen.has(x)).map(term=>({term,n:0}))).slice(0,7);
  if(tops.length){ const l=document.createElement('span'); l.className='small'; l.style.alignSelf='center'; l.textContent='ค้นหาบ่อย:'; box.appendChild(l) }
  list.forEach(({term,n})=>{const b=document.createElement('button');b.className='chip'+(n?' hot':'');b.innerHTML=esc(term)+(n?` <span class="cnt">${n}</span>`:'');b.onclick=()=>{$('#q').value=term;run(true)};box.appendChild(b)});
}

/* ---------- images ---------- */
let imgLinks = store.get('imgLinks',{});        // code -> url
let imgTpl = store.get('imgTpl','');            // e.g. https://shop.com/img/{CODE}.jpg
let imgData = store.get('imgData',{});          // code -> dataURL (uploaded)
function imgUrlFor(p){ if(imgLinks[p.code]) return imgLinks[p.code]; if(imgTpl) return imgTpl.replace(/\{CODE\}/g,encodeURIComponent(p.code)).replace(/\{NAME\}/g,encodeURIComponent(p.name)).replace(/\{BARCODE\}/g,encodeURIComponent(p.bc)); return '' }
const isImg=u=>/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(u)||u.startsWith('data:image');

/* ---------- detail ---------- */
let selected=null;
function showDetail(p,internal){
  selected=p.code; if(!internal) bumpProduct(p.code,1);
  const g=G[p.g]; const url=imgUrlFor(p); const up=imgData[p.code];
  let media;
  if(up) media=`<img src="${up}" alt="">`;
  else if(url) media = isImg(url)?`<img src="${esc(url)}" alt="" onerror="this.outerHTML='<div class=empty>โหลดภาพไม่ได้จากลิงก์นี้</div>'">`:`<iframe src="${esc(url)}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  else media=`<div class="empty">ยังไม่มีภาพ — ใส่ลิงก์ภาพ/หน้าเว็บด้านล่าง หรืออัปโหลดไฟล์ภาพ</div>`;
  $('#p-detail').innerHTML=`<div class="detail">
    <div class="small">${esc(g.n)}</div>
    <h3>${esc(p.name)}</h3>
    <div class="bigprice">${p.price>0?'฿'+fmt(p.price):'<span class="price zero">ไม่มีราคา</span>'} <span class="small">/ ${esc(p.unit||'หน่วย')}</span></div>
    <dl class="kv"><dt>CODE</dt><dd>${esc(p.code)}</dd><dt>บาร์โค้ด</dt><dd>${esc(p.bc||'-')}</dd><dt>คงเหลือ</dt><dd>${fmt(p.stock)} ${esc(p.unit)}</dd></dl>
    <div class="row"><div class="qty"><button id="dm">−</button><input id="dq" value="1" inputmode="numeric"><button id="dp">+</button></div><button class="btn primary" id="dAdd">+ ใส่ตะกร้า</button></div>
    <div class="imgbox">${media}</div>
    <div class="row"><input type="url" id="imgUrl" placeholder="ลิงก์ภาพหรือหน้าเว็บสินค้า (แสดงผ่าน iframe)" value="${esc(imgLinks[p.code]||'')}"><button class="btn" id="imgSave">บันทึก</button></div>
    <div class="row"><label class="btn">อัปโหลดภาพ<input type="file" accept="image/*" id="imgFile" hidden></label>${url?`<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">เปิดลิงก์ ↗</a>`:''}${up?'<button class="btn" id="imgDel">ลบภาพที่อัปโหลด</button>':''}</div>
    <p class="small">ถ้าเปิดแอปในหน้า claude.ai เว็บภายนอกจะไม่แสดงใน iframe เพราะถูกบล็อก ให้กด “เปิดลิงก์” หรือเปิดไฟล์ HTML ของแอปในเบราว์เซอร์โดยตรง</p>
    ${g.m?`<div class="grpcard" style="margin-top:14px"><h4>${esc(g.n)}</h4>${g.d?`<p>${esc(g.d)}</p>`:''}${g.w?`<p><b>ใช้งาน:</b> ${esc(g.w)}</p>`:''}<p class="syn">คำพ้อง: ${esc(g.s.join(', '))}</p>
      ${g.pr.length?`<p style="margin-top:8px"><b>ซื้อคู่กัน</b></p><div class="pairs">${g.pr.map(j=>`<button data-g="${j}">${esc(G[j].n)}</button>`).join('')}</div>`:''}</div>`:''}
  </div>`;
  const dq=$('#dq');
  $('#dm').onclick=()=>dq.value=Math.max(1,(+dq.value||1)-1);
  $('#dp').onclick=()=>dq.value=(+dq.value||0)+1;
  $('#dAdd').onclick=()=>addToCart(p.code,Math.max(1,Math.floor(+dq.value||1)));
  $('#imgSave').onclick=()=>{const v=$('#imgUrl').value.trim(); if(v) imgLinks[p.code]=v; else delete imgLinks[p.code]; store.set('imgLinks',imgLinks); showDetail(p,true)};
  $('#imgFile').onchange=e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ const im=new Image(); im.onload=()=>{ const k=Math.min(1,600/Math.max(im.width,im.height)); const cv=document.createElement('canvas'); cv.width=im.width*k; cv.height=im.height*k; cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height); imgData[p.code]=cv.toDataURL('image/jpeg',.82); if(!store.set('imgData',imgData)) toast('ภาพแสดงได้ แต่บันทึกถาวรไม่ได้ (พื้นที่เต็ม)'); showDetail(p,true)}; im.src=r.result }; r.readAsDataURL(f)};
  const del=$('#imgDel'); if(del) del.onclick=()=>{delete imgData[p.code];store.set('imgData',imgData);showDetail(p,true)};
  $('#p-detail').querySelectorAll('.pairs button').forEach(b=>b.onclick=()=>focusGroup(+b.dataset.g));
  tab('detail');
  document.querySelectorAll('.item').forEach(x=>x.classList.toggle('sel',x.dataset.code===p.code));
  highlight(p.code);
}

/* ---------- results list ---------- */
function itemHtml(p,cnt){const c=cnt!=null?cnt:(stats.p[p.code]?stats.p[p.code].n:0);return `<div class="item" data-code="${esc(p.code)}"><div class="nm"><b>${esc(p.name)}</b><small>${esc(p.code)} · ${esc(G[p.g].n)} · คงเหลือ ${fmt(p.stock)}${c?` · <span class="pop">🔥 ${c}</span>`:''}</small></div>${priceHtml(p)}<button class="add" data-add="${esc(p.code)}">+</button></div>`}
function bindItems(root){
  root.querySelectorAll('.item').forEach(el=>el.onclick=e=>{ if(e.target.dataset.add){addToCart(e.target.dataset.add);return} showDetail(byCode.get(el.dataset.code)) });
}
function renderResults(r){
  const el=$('#p-results');
  if(!r){ const tp=topProducts(15), tt=topTerms(12);
    el.innerHTML=(tp.length?`<h4 class="sec">🔥 สินค้าที่ค้นหาบ่อย</h4>`+tp.map(x=>itemHtml(x.p,x.n)).join(''):'')+
      (tt.length?`<h4 class="sec">คำค้นบ่อย</h4><div class="chips">${tt.map(([term,e])=>`<button class="chip hot" data-term="${esc(term)}">${esc(term)} <span class="cnt">${e.n}</span></button>`).join('')}</div>`:'')+
      (tp.length||tt.length?`<p class="small" style="margin-top:12px">สถิตินับจากการค้นหา การเปิดดู และการใส่ตะกร้าในเบราว์เซอร์นี้ · <button class="rm" id="clrStats">ล้างสถิติ</button></p><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">`:'')+
      `<p class="hint">พิมพ์ค้นหาด้านบน หรือคลิกกลุ่มในกราฟ<br>ค้นได้ทั้งชื่อสินค้า คำพ้อง (เช่น ไวเมท, ข้ออ้อย, DB12), ขนาด (2 หุน = 6 มม.), CODE, บาร์โค้ด และการใช้งาน (เช่น เสริมพื้น)</p>`+
      `<p class="small">${fmt(P.length)} สินค้า · ${G.length} กลุ่ม · ${G.filter(g=>g.m).length} กลุ่มมีคำพ้อง/คำอธิบาย</p><p class="small">จัดทำโดย เฟย</p>`;
    el.querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>{$('#q').value=b.dataset.term;run(true)});
    const cs=$('#clrStats'); if(cs) cs.onclick=clearStats;
    bindItems(el); return }
  if(!r.res.length){ el.innerHTML=`<p class="hint">ไม่พบสินค้าที่ตรงกับ “${esc(r.q)}” ลองพิมพ์คำอื่นหรือสั้นลง</p>`; return }
  const top=r.groups[0]; const g=top?G[top.gi]:null;
  el.innerHTML = (g&&g.m&&r.gScore[top.gi]>=8?`<div class="grpcard"><h4>${esc(g.n)}</h4>${g.d?`<p>${esc(g.d)}</p>`:''}${top.why?`<p class="syn">ตรงกับ: ${esc(top.why)}</p>`:''}${g.pr.length?`<div class="pairs">${g.pr.map(j=>`<button data-g="${j}">ซื้อคู่: ${esc(G[j].n)}</button>`).join('')}</div>`:''}</div>`:'')+
    `<p class="small">พบ ${fmt(r.res.length)} รายการ${r.res.length>80?' (แสดง 80 อันดับแรก)':''}</p>`+
    r.res.slice(0,80).map(x=>itemHtml(x.p)).join('');
  el.querySelectorAll('.pairs button').forEach(b=>b.onclick=()=>focusGroup(+b.dataset.g));
  bindItems(el);
}
function focusGroup(gi){
  const g=G[gi]; $('#q').value=g.n; run();
}

/* ---------- graph ---------- */
const svg=d3.select('#graph'); const root=svg.append('g');
const linkL=root.append('g'), nodeL=root.append('g');
const zoom=d3.zoom().scaleExtent([.2,4]).on('zoom',e=>root.attr('transform',e.transform));
svg.call(zoom).on('dblclick.zoom',null);
let sim=null, nodesSel=null, overviewMode='popular';
const tip=$('#tip');
function size(){const r=$('#graphPane').getBoundingClientRect();return {w:r.width,h:r.height}}
function shortName(s,n=22){return s.length>n?s.slice(0,n-1)+'…':s}

function buildGraph(r){
  const nodes=[],links=[]; const {w,h}=size();
  const tp=!r?topProducts(18):[];
  if(!r && tp.length && overviewMode==='popular'){
    nodes.push({id:'q',type:'query',label:'ค้นหาบ่อย',r:36,fx:w/2,fy:h/2});
    const gset=new Map(); tp.forEach(x=>{ if(!gset.has(x.p.g)) gset.set(x.p.g,0); gset.set(x.p.g,gset.get(x.p.g)+x.n) });
    const maxN=Math.max(...tp.map(x=>x.n));
    [...gset.entries()].forEach(([gi,n])=>{ nodes.push({id:'g'+gi,type:'group',gi,label:G[gi].n,r:11+Math.min(10,Math.sqrt(n)*2)}); links.push({source:'q',target:'g'+gi,type:'qg',w:1+Math.min(4,n/maxN*4)}) });
    tp.forEach(x=>{ nodes.push({id:'p'+x.p.code,type:'prod',p:x.p,cnt:x.n,label:shortName(x.p.name),r:6+Math.min(8,x.n/maxN*8)}); links.push({source:'g'+x.p.g,target:'p'+x.p.code,type:'gp'}) });
    $('#status').innerHTML='🔥 สินค้าที่ค้นหาบ่อย · <button class="rm" id="ovSwitch">ดูภาพรวมกลุ่ม</button>';
    $('#ovSwitch').onclick=()=>{overviewMode='groups';buildGraph(null)};
  } else if(!r){
    // overview: biggest groups + all groups with synonyms
    const pick=G.map((g,i)=>({g,i})).sort((a,b)=>(b.g.m-a.g.m)||(b.g.k-a.g.k)).slice(0,60);
    const ids=new Set(pick.map(x=>x.i));
    pick.forEach(({g,i})=>nodes.push({id:'g'+i,type:'group',gi:i,label:g.n,r:8+Math.sqrt(g.k)*1.1}));
    pick.forEach(({g,i})=>g.pr.forEach(j=>{ if(ids.has(j)) links.push({source:'g'+i,target:'g'+j,type:'pair'}) }));
    $('#status').innerHTML='ภาพรวม 60 กลุ่ม · คลิกกลุ่มเพื่อดูสินค้า'+(tp.length?' · <button class="rm" id="ovSwitch">ดูสินค้าค้นหาบ่อย</button>':'');
    if(tp.length) $('#ovSwitch').onclick=()=>{overviewMode='popular';buildGraph(null)};
  } else {
    nodes.push({id:'q',type:'query',label:r.q,r:Math.max(30,Math.min(56,shortName(r.q,12).length*5.2)),fx:w/2,fy:h/2});
    const gs=r.groups.slice(0,7); const shown=new Set(gs.map(x=>x.gi));
    gs.forEach((x,k)=>{
      const g=G[x.gi]; nodes.push({id:'g'+x.gi,type:'group',gi:x.gi,label:g.n,r:13+Math.min(10,Math.sqrt(g.k))});
      links.push({source:'q',target:'g'+x.gi,type:'qg',w:k===0?3:1.5});
      r.res.filter(y=>y.p.g===x.gi).slice(0,k===0?10:6).forEach(y=>{
        nodes.push({id:'p'+y.p.code,type:'prod',p:y.p,label:shortName(y.p.name),r:7});
        links.push({source:'g'+x.gi,target:'p'+y.p.code,type:'gp'});
      });
    });
    if(gs[0]) G[gs[0].gi].pr.forEach(j=>{ if(!shown.has(j)){ nodes.push({id:'g'+j,type:'pairg',gi:j,label:G[j].n,r:10}); shown.add(j) } links.push({source:'g'+gs[0].gi,target:'g'+j,type:'pair'}) });
    $('#status').textContent=`“${r.q}” · ${fmt(r.res.length)} สินค้า ใน ${r.groups.length} กลุ่ม`;
  }
  draw(nodes,links);
}
function draw(nodes,links){
  if(sim) sim.stop();
  const {w,h}=size();
  const l=linkL.selectAll('line').data(links).join('line')
    .attr('stroke',d=>d.type==='pair'?'var(--pair)':d.type==='qg'?'#9a9890':'#c9c7bf')
    .attr('stroke-width',d=>d.w||1.2).attr('stroke-dasharray',d=>d.type==='pair'?'4 4':null).attr('opacity',.85);
  const n=nodeL.selectAll('g.n').data(nodes,d=>d.id).join(enter=>{
    const g=enter.append('g').attr('class','n').style('cursor','pointer');
    g.append('circle'); g.append('text').attr('class','lbl'); g.append('text').attr('class','sub');
    return g;
  });
  n.select('circle').attr('r',d=>d.r)
    .attr('fill',d=>({query:'var(--q)',group:'var(--group)',prod:'var(--prod)',pairg:'#fff'})[d.type])
    .attr('stroke',d=>d.type==='pairg'?'var(--pair)':'#fff').attr('stroke-width',d=>d.type==='pairg'?2:1.5)
    .attr('stroke-dasharray',d=>d.type==='pairg'?'3 3':null);
  n.select('.lbl').text(d=>d.type==='query'?shortName(d.label,12):d.type==='prod'?d.label:shortName(d.label,26))
    .attr('x',d=>d.type==='query'?0:d.r+5).attr('y',d=>d.type==='query'?5:4)
    .attr('text-anchor',d=>d.type==='query'?'middle':'start')
    .attr('font-size',d=>d.type==='prod'?11:d.type==='query'?15:13)
    .attr('font-weight',d=>d.type==='prod'?400:600)
    .attr('fill',d=>d.type==='pairg'?'var(--pair)':d.type==='group'?'var(--group)':d.type==='query'?'#fff':'var(--ink)')
    .attr('paint-order','stroke').attr('stroke',d=>d.type==='query'?'none':'var(--bg)').attr('stroke-width',3);
  n.select('.sub').text(d=>d.type==='prod'?(d.p.price>0?'฿'+fmt(d.p.price):'—')+' · '+d.p.code+(d.cnt?' · 🔥'+d.cnt:''):'')
    .attr('x',d=>d.r+5).attr('y',17).attr('font-size',10.5).attr('fill','var(--accent)')
    .attr('paint-order','stroke').attr('stroke','var(--bg)').attr('stroke-width',3);
  n.on('click',(e,d)=>{ e.stopPropagation(); if(d.type==='prod') showDetail(d.p); else if(d.type==='group'||d.type==='pairg') groupClick(d.gi); })
   .on('mousemove',(e,d)=>{ const b=$('#graphPane').getBoundingClientRect();
      tip.innerHTML = d.type==='prod'?`<b>${esc(d.p.name)}</b><br>${esc(d.p.code)} · ${d.p.price>0?'฿'+fmt(d.p.price):'ไม่มีราคา'} / ${esc(d.p.unit)}<br><span class="small">คงเหลือ ${fmt(d.p.stock)}</span>`
        : d.type==='query'?'คำค้น' : `<b>${esc(G[d.gi].n)}</b><br><span class="small">${G[d.gi].k} สินค้า${d.type==='pairg'?' · ซื้อคู่กัน':''}${G[d.gi].d?'<br>'+esc(G[d.gi].d):''}</span>`;
      tip.style.display='block'; tip.style.left=Math.min(e.clientX-b.left+14,b.width-290)+'px'; tip.style.top=(e.clientY-b.top+14)+'px'; })
   .on('mouseleave',()=>tip.style.display='none')
   .call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.2).restart();d.fx=d.x;d.fy=d.y})
     .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0); if(d.type!=='query'){d.fx=null;d.fy=null}}));
  nodesSel=n;
  sim=d3.forceSimulation(nodes)
    .force('link',d3.forceLink(links).id(d=>d.id).distance(d=>d.type==='qg'?150:d.type==='pair'?140:95).strength(d=>d.type==='pair'?.15:.7))
    .force('charge',d3.forceManyBody().strength(d=>d.type==='prod'?-140:-420))
    .force('collide',d3.forceCollide().radius(d=>d.r+(d.type==='prod'?42:d.type==='query'?20:60)))
    .force('center',d3.forceCenter(w/2,h/2).strength(.05))
    .force('x',d3.forceX(w/2).strength(.03)).force('y',d3.forceY(h/2).strength(.05))
    .on('tick',()=>{ l.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y); n.attr('transform',d=>`translate(${d.x},${d.y})`) });
  sim.on('end',fit);
  setTimeout(fit,900);
  highlight(selected);
}
function highlight(code){ if(nodesSel) nodesSel.select('circle').attr('stroke',d=>d.type==='prod'&&d.p.code===code?'var(--accent)':d.type==='pairg'?'var(--pair)':'#fff').attr('stroke-width',d=>d.type==='prod'&&d.p.code===code?4:d.type==='pairg'?2:1.5) }
function fit(){
  const b=root.node().getBBox(); if(!b.width) return; const {w,h}=size();
  const k=Math.min(1.15,.85/Math.max(b.width/w,b.height/h));
  svg.transition().duration(500).call(zoom.transform,d3.zoomIdentity.translate(w/2-k*(b.x+b.width/2),h/2-k*(b.y+b.height/2)).scale(k));
}
$('#zin').onclick=()=>svg.transition().call(zoom.scaleBy,1.3);
$('#zout').onclick=()=>svg.transition().call(zoom.scaleBy,1/1.3);
$('#zfit').onclick=fit;

function groupClick(gi){
  // show the group's products directly (sorted by stock) without changing ranking rules
  const g=G[gi]; const prods=groupProds[gi].slice().sort((a,b)=>(b.stock>0)-(a.stock>0)||b.stock-a.stock);
  const r={q:g.n,res:prods.map(p=>({p,s:1})),groups:[{gi,s:1,why:''}],gScore:Object.assign(new Float32Array(G.length),{[gi]:10})};
  $('#q').value=g.n; $('#clear').style.display='block';
  renderResults(r); buildGraph(r); tab('results');
}

/* ---------- wiring ---------- */
let last=null;
let recT;
function run(now){
  const v=$('#q').value; $('#clear').style.display=v?'block':'none';
  const r=search(v); last=r; renderResults(r); buildGraph(r); tab('results');
  clearTimeout(recT);
  if(r && r.res.length){ if(now) recordQuery(v); else recT=setTimeout(()=>recordQuery(v),1500) }
}
let deb; $('#q').addEventListener('input',()=>{clearTimeout(deb);deb=setTimeout(run,220)});
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(deb);run(true)}});
$('#clear').onclick=()=>{$('#q').value='';run();$('#q').focus()};
renderChips();
window.addEventListener('resize',()=>{clearTimeout(window._rz);window._rz=setTimeout(()=>buildGraph(last),200)});
renderCart(); renderResults(null); buildGraph(null);

/* ---------- installable app (PWA) ---------- */
(function(){
  if('serviceWorker' in navigator && window.isSecureContext && location.protocol!=='file:'){
    navigator.serviceWorker.register('sw.js').catch(e=>console.warn('SW',e));
  }
  const btn=document.getElementById('installBtn'); let deferred=null;
  const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferred=e; if(!standalone) btn.hidden=false; });
  window.addEventListener('appinstalled',()=>{ btn.hidden=true; deferred=null; toast('ติดตั้งแอปแล้ว'); });
  btn.onclick=async()=>{
    if(deferred){ deferred.prompt(); const r=await deferred.userChoice; deferred=null; if(r.outcome==='accepted') btn.hidden=true; }
    else toast('กดเมนู ⋮ ของ Chrome แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”');
  };
  // iPhone/iPad Safari has no install prompt: show the button with instructions
  if(!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)){ btn.hidden=false; btn.onclick=()=>toast('กดปุ่มแชร์ ⬆ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”'); }
})();
