// Chief of Staff app engine: renders every section and handles all interaction.
// It runs inside the signed-in page (components/AppShell.tsx) and saves through the sync store.
export function startApp({store,email,onSignOut}){
const cleanups=[];let alive=true;
const on=(t,ev,fn,o)=>{t.addEventListener(ev,fn,o);cleanups.push(()=>t.removeEventListener(ev,fn,o))};
/* ---------- utilities ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>ymd(new Date());
const parseYmd=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)};
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL=['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmtDate=s=>{const d=parseYmd(s);return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]};
const relDay=s=>{const t=today();if(s===t)return'Today';if(s===addDays(t,1))return'Tomorrow';if(s===addDays(t,-1))return'Yesterday';return fmtDate(s)};
const fmtTime=t=>{if(!t)return'';let [h,m]=t.split(':').map(Number);const ap=h>=12?'pm':'am';h=h%12||12;return h+(m?':'+pad(m):'')+ap};
const money=n=>{const sym=S.settings.currency||'';const v=Math.abs(n);return (n<0?'−':'')+sym+v.toLocaleString(undefined,{minimumFractionDigits:v%1?2:0,maximumFractionDigits:2})};
const ICON={
  check:'<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>'
};
const NAV=[
  ['today','Today','<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>'],
  ['plan','Plan','<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M8 14l2 2 4-4"/></svg>'],
  ['habits','Habits','<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'],
  ['journal','Journal','<svg viewBox="0 0 24 24"><path d="M5 3.5h11a3 3 0 013 3v14H8a3 3 0 01-3-3z"/><path d="M5 17.5a3 3 0 013-3h11M9 8h6"/></svg>'],
  ['money','Money','<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19M6.5 15h3"/></svg>'],
  ['tools','Tools','<svg viewBox="0 0 24 24"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/></svg>']
];
const MOODS=[['Rough','M8 16.5c1.2-1.5 2.5-2 4-2s2.8.5 4 2'],['Low','M8.5 16c1-.8 2.2-1.2 3.5-1.2s2.5.4 3.5 1.2'],['Okay','M8.5 15.5h7'],['Good','M8.5 14.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5'],['Great','M8 14c1.2 1.6 2.5 2.4 4 2.4s2.8-.8 4-2.4']];
const moodSvg=i=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01" stroke-width="2.4"/><path d="'+MOODS[i][1]+'"/></svg>';
const OUT_CATS=['Food','Transport','Bills','Shopping','Family','Health','Work','Fun','Other'];
const IN_CATS=['Salary','Business','Gift','Other'];
const PROMPTS=['What went well today, and why?','What is taking up the most space in your head?','One thing you would do differently tomorrow.','Who made today better?','What did you learn today?','What are you looking forward to?','What drained your energy, and what restored it?','A decision you are weighing right now.'];

/* ---------- state & storage ---------- */
const KEYS=['tasks','habits','journal','money','notes','settings'];
const DEF={tasks:{items:[]},habits:{items:[],log:{}},journal:{entries:[]},money:{entries:[],budget:0},notes:{items:[]},settings:{name:'',currency:'₦',started:false}};
const S={};
KEYS.forEach(k=>{S[k]=Object.assign(clone(DEF[k]),store.cached(k)||{})});
let syncMode='syncing';
function setSync(m){syncMode=m;const el=$('#sync');if(!el)return;el.className='sync '+(m==='synced'?'cloud':m==='offline'?'':'connecting');el.querySelector('span').textContent=m==='synced'?'Synced':m==='offline'?'Offline':'Syncing'}
function save(k){store.save(k,S[k])}
store.onStatus(setSync);
store.onRemote((k,data)=>{S[k]=Object.assign(clone(DEF[k]),clone(data));softRender()});

/* ---------- view state ---------- */
let planFilter='today',moneyMonth=today().slice(0,7),toolTab='calc',noteQuery='',pendingRender=false;
function route(){const h=(location.hash||'').slice(1);return NAV.some(n=>n[0]===h)?h:'today'}
function isTyping(){const a=document.activeElement;return a&&$('#main').contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)}
function softRender(){if(isTyping()||$('.sheet.show')){pendingRender=true;return}render()}
on(document,'focusout',()=>setTimeout(()=>{if(pendingRender&&!isTyping()&&!$('.sheet.show')){pendingRender=false;render()}},50));

function render(){
  if(!alive||!$('#main'))return;
  const v=route();
  const d=new Date();
  const name=(S.settings.name||'').trim();
  const titles={today:greeting()+(name?', '+name:''),plan:'Plan',habits:'Habits',journal:'Journal',money:'Money',tools:'Tools'};
  $('#eyebrow').textContent=DOW[d.getDay()]+' · '+d.getDate()+' '+MONL[d.getMonth()]+' '+d.getFullYear();
  $('#title').textContent=titles[v];
  $('#nav').innerHTML=NAV.map(n=>'<a href="#'+n[0]+'" class="'+(n[0]===v?'on':'')+'"'+(n[0]===v?' aria-current="page"':'')+'>'+n[2]+'<span>'+n[1]+'</span></a>').join('');
  $('#main').innerHTML='<div class="view">'+VIEWS[v]()+'</div>';
  afterRender(v);
}
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening'}

/* ---------- task helpers ---------- */
function parseQuick(raw){
  let s=' '+raw+' ',date='',time='',pri='normal';
  const t=today();
  if(/\s!+\s/.test(s)||/\s!\S/.test(s)){pri='high';s=s.replace(/\s!+(?=\s|$)/g,' ').replace(/\s!(?=\S)/g,' ')}
  const rx=(re,fn)=>{const m=s.match(re);if(m){fn(m);s=s.replace(re,' ')}};
  rx(/\s(today|tonight)(?=\s)/i,()=>date=t);
  rx(/\s(tomorrow|tmr|tmrw)(?=\s)/i,()=>date=addDays(t,1));
  rx(/\s(next week)(?=\s)/i,()=>date=addDays(t,7));
  rx(/\s(?:on\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?(?=\s)/i,m=>{
    const idx=['sun','mon','tue','wed','thu','fri','sat'].indexOf(m[1].toLowerCase().slice(0,3));
    const cur=new Date().getDay();let diff=(idx-cur+7)%7;date=addDays(t,diff)});
  rx(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i,m=>{let h=+m[1]%12;if(m[3].toLowerCase()==='pm')h+=12;time=pad(h)+':'+(m[2]||'00')});
  if(!time)rx(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/,m=>{time=pad(+m[1])+':'+m[2]});
  if(time&&!date)date=t;
  return{title:s.replace(/\s+/g,' ').trim(),date,time,pri};
}
function addTask(o){const it={id:newId(),title:o.title,date:o.date||'',time:o.time||'',pri:o.pri||'normal',area:o.area||'',notes:o.notes||'',done:false,doneAt:0,created:Date.now()};S.tasks.items.push(it);save('tasks');return it}
const byTime=(a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'99').localeCompare(b.time||'99')||(a.pri==='high'?-1:0)-(b.pri==='high'?-1:0)||a.created-b.created;
function taskRow(it,showDate){
  const meta=[];
  if(showDate&&it.date)meta.push('<span>'+esc(relDay(it.date))+(it.time?' · '+fmtTime(it.time):'')+'</span>');
  else if(it.time&&!showDate)0;
  if(it.pri==='high')meta.push('<span class="chip hi">Priority</span>');
  if(it.area)meta.push('<span class="chip">'+esc(it.area)+'</span>');
  if(it.notes)meta.push('<span>Has notes</span>');
  return '<div class="item'+(it.done?' done':'')+(it.pri==='high'?' hi':'')+'">'+
    '<button class="check'+(it.done?' on':'')+'" data-act="toggleTask" data-id="'+it.id+'" aria-label="'+(it.done?'Mark not done':'Mark done')+'">'+ICON.check+'</button>'+
    (!showDate?'<span class="time">'+(it.time?fmtTime(it.time):'')+'</span>':'')+
    '<button class="body" data-act="editTask" data-id="'+it.id+'"><div class="t">'+esc(it.title)+'</div>'+(meta.length?'<div class="m">'+meta.join('')+'</div>':'')+'</button></div>';
}
function quickAdd(id){
  return '<div class="row"><input class="field" id="'+id+'" placeholder="Add a task, e.g. Call Ada tomorrow 3pm !" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="quickAdd" data-for="'+id+'">Add</button></div><div class="preview" id="'+id+'-pv"></div>';
}
function previewHtml(raw){
  if(!raw.trim())return '<span class="small muted">Words like today, Friday, 3pm and ! (priority) are picked up.</span>';
  const p=parseQuick(raw),c=[];
  c.push('<span class="chip acc">'+(p.date?esc(relDay(p.date)):'Anytime')+'</span>');
  if(p.time)c.push('<span class="chip acc">'+fmtTime(p.time)+'</span>');
  if(p.pri==='high')c.push('<span class="chip hi">Priority</span>');
  return c.join('');
}

/* ---------- habit helpers ---------- */
const isDone=(hid,d)=>(S.habits.log[d]||[]).includes(hid);
function toggleHabit(hid,d){const a=S.habits.log[d]||[];const i=a.indexOf(hid);if(i>=0)a.splice(i,1);else a.push(hid);if(a.length)S.habits.log[d]=a;else delete S.habits.log[d];save('habits')}
function streak(hid){let d=today(),n=0;if(!isDone(hid,d))d=addDays(d,-1);while(isDone(hid,d)){n++;d=addDays(d,-1)}return n}

/* ---------- money helpers ---------- */
function monthEntries(m){return S.money.entries.filter(e=>e.date.slice(0,7)===m)}
function monthTotals(m){let out=0,inc=0;const cats={};monthEntries(m).forEach(e=>{if(e.type==='in')inc+=e.amt;else{out+=e.amt;cats[e.cat]=(cats[e.cat]||0)+e.amt}});return{out,inc,cats}}

/* ---------- views ---------- */
const VIEWS={};
VIEWS.today=function(){
  const t=today();
  const open=S.tasks.items.filter(i=>!i.done);
  const overdue=open.filter(i=>i.date&&i.date<t).sort(byTime);
  const dueToday=S.tasks.items.filter(i=>i.date===t).sort((a,b)=>(a.done-b.done)||byTime(a,b));
  const leftToday=dueToday.filter(i=>!i.done).length;
  const hs=S.habits.items,hd=hs.filter(h=>isDone(h.id,t)).length;
  const mt=monthTotals(t.slice(0,7)),bud=S.money.budget||0;
  const pct=bud?Math.min(100,mt.out/bud*100):0;
  const empty=!S.tasks.items.length&&!hs.length&&!S.journal.entries.length&&!S.money.entries.length&&!S.notes.items.length;
  let h='';
  if(empty&&!S.settings.started){
    h+='<section class="card welcome"><h2>Your personal assistant</h2><p>Tasks, habits, a journal, your money and quick tools, all in one place. Load a few example items to see how it fits together, or start with a clean slate.</p><div class="btns"><button class="btn primary" data-act="seed">Show me with examples</button><button class="btn" data-act="startFresh">Start empty</button></div></section>';
  }
  h+='<div class="stats">'+
    '<a class="stat" href="#plan" style="text-decoration:none;color:inherit"><b>'+leftToday+'</b><span>'+(leftToday===1?'task left today':'tasks left today')+'</span>'+(overdue.length?'<span style="color:var(--bad)">'+overdue.length+' overdue</span>':'')+'</a>'+
    '<a class="stat" href="#habits" style="text-decoration:none;color:inherit"><b>'+hd+'<span style="font-size:15px;color:var(--muted)">/'+hs.length+'</span></b><span>habits done</span></a>'+
    '<a class="stat" href="#money" style="text-decoration:none;color:inherit"><b style="font-size:18px;padding-top:6px">'+money(mt.out)+'</b><span>spent in '+MON[new Date().getMonth()]+'</span>'+(bud?'<div class="meter'+(mt.out>bud?' over':'')+'"><i style="width:'+pct+'%"></i></div>':'')+'</a>'+
  '</div>';
  h+='<section class="card"><div class="sec-h"><h2>Agenda</h2><a class="link" href="#plan">All tasks</a></div>'+quickAdd('qaToday')+'<div class="list" style="margin-top:8px">';
  if(overdue.length){h+='<div class="group-h bad">Overdue</div>'+overdue.map(i=>taskRow(i,true)).join('')}
  if(dueToday.length){if(overdue.length)h+='<div class="group-h">Today</div>';h+=dueToday.map(i=>taskRow(i,false)).join('')}
  if(!overdue.length&&!dueToday.length)h+='<div class="empty"><b>Nothing scheduled for today.</b>Add a task above, or pick something from your Anytime list.</div>';
  h+='</div></section>';
  h+='<section class="card"><div class="sec-h"><h2>Habits</h2><a class="link" href="#habits">Edit</a></div>';
  h+=hs.length?'<div class="hchips">'+hs.map(x=>'<button class="hchip'+(isDone(x.id,t)?' on':'')+'" data-act="habitToday" data-id="'+x.id+'"><i></i>'+esc(x.name)+'</button>').join('')+'</div>':'<div class="empty"><b>No habits yet.</b>Add the routines you want to keep in Habits.</div>';
  h+='</section>';
  const je=S.journal.entries.find(e=>e.date===t);
  h+='<section class="card"><div class="sec-h"><h2>Journal</h2><a class="link" href="#journal">'+(je?'Continue':'Write')+'</a></div>'+
    (je&&je.text?'<div class="excerpt">'+esc(je.text)+'</div>':'<p class="prompt" style="margin:0">'+esc(PROMPTS[new Date().getDate()%PROMPTS.length])+'</p>')+'</section>';
  return h;
};
VIEWS.plan=function(){
  const t=today();
  const f=planFilter;
  let h='<section class="card">'+quickAdd('qaPlan')+'<div style="margin-top:10px"><button class="link" data-act="newTask">More options</button></div></section>';
  h+='<div class="seg" role="tablist">'+[['today','Today'],['upcoming','Upcoming'],['anytime','Anytime'],['done','Done']].map(x=>'<button role="tab" class="'+(f===x[0]?'on':'')+'" data-act="planFilter" data-v="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
  h+='<section class="card"><div class="list">';
  const open=S.tasks.items.filter(i=>!i.done);
  if(f==='today'){
    const od=open.filter(i=>i.date&&i.date<t).sort(byTime),td=S.tasks.items.filter(i=>i.date===t).sort((a,b)=>(a.done-b.done)||byTime(a,b));
    if(od.length)h+='<div class="group-h bad">Overdue</div>'+od.map(i=>taskRow(i,true)).join('');
    if(td.length)h+='<div class="group-h">'+esc(fmtDate(t))+'</div>'+td.map(i=>taskRow(i,false)).join('');
    if(!od.length&&!td.length)h+='<div class="empty"><b>A clear day.</b>Tasks dated today show up here.</div>';
  }else if(f==='upcoming'){
    const up=open.filter(i=>i.date>t).sort(byTime);let last='';
    up.forEach(i=>{if(i.date!==last){h+='<div class="group-h">'+esc(relDay(i.date))+'</div>';last=i.date}h+=taskRow(i,false)});
    if(!up.length)h+='<div class="empty"><b>Nothing coming up.</b>Give a task a future date and it lands here.</div>';
  }else if(f==='anytime'){
    const any=open.filter(i=>!i.date).sort((a,b)=>(a.pri==='high'?-1:0)-(b.pri==='high'?-1:0)||a.created-b.created);
    h+=any.length?any.map(i=>taskRow(i,true)).join(''):'<div class="empty"><b>No undated tasks.</b>Ideas and someday items without a date collect here.</div>';
  }else{
    const dn=S.tasks.items.filter(i=>i.done).sort((a,b)=>b.doneAt-a.doneAt).slice(0,60);
    h+=dn.length?dn.map(i=>taskRow(i,true)).join(''):'<div class="empty"><b>Nothing finished yet.</b>Completed tasks are kept here.</div>';
  }
  h+='</div>';
  if(f==='done'&&S.tasks.items.some(i=>i.done))h+='<div style="margin-top:12px"><button class="btn danger" data-act="clearDone">Clear completed</button></div>';
  h+='</section>';
  return h;
};
VIEWS.habits=function(){
  const t=today(),days=[];for(let i=6;i>=0;i--)days.push(addDays(t,-i));
  let h='<section class="card"><div class="row"><input class="field" id="habitInput" placeholder="New habit, e.g. Read 20 pages" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="addHabit">Add</button></div></section>';
  h+='<section class="card"><div class="sec-h"><h2>Last 7 days</h2><span class="small muted">Tap a square to log</span></div>';
  if(!S.habits.items.length){h+='<div class="empty"><b>No habits yet.</b>Start with one small routine you want to repeat daily.</div></section>';return h}
  h+='<div class="hgrid"><span></span>'+days.map(d=>'<span class="dh'+(d===t?' today':'')+'">'+DOW[parseYmd(d).getDay()].slice(0,2)+'<br>'+parseYmd(d).getDate()+'</span>').join('');
  S.habits.items.forEach(x=>{
    const s=streak(x.id);
    h+='<button class="hname" data-act="editHabit" data-id="'+x.id+'"><span class="t">'+esc(x.name)+'</span><span class="s'+(s>=3?' hot':'')+'">'+(s?s+'-day streak':'No streak yet')+'</span></button>';
    h+=days.map(d=>'<button class="dot'+(isDone(x.id,d)?' on':'')+(d===t?' today':'')+'" data-act="habitDay" data-id="'+x.id+'" data-d="'+d+'" aria-label="'+esc(x.name)+' on '+fmtDate(d)+'"></button>').join('');
  });
  h+='</div></section>';
  // 30-day rate
  const d30=[];for(let i=29;i>=0;i--)d30.push(addDays(t,-i));
  h+='<section class="card"><div class="sec-h"><h2>30-day consistency</h2></div>';
  S.habits.items.forEach(x=>{const n=d30.filter(d=>isDone(x.id,d)).length;const p=Math.round(n/30*100);
    h+='<div class="cat-row"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(x.name)+'</span><div class="cat-bar"><i style="width:'+p+'%;background:var(--good)"></i></div><span class="num small">'+n+'/30</span></div>'});
  h+='</section>';
  return h;
};
VIEWS.journal=function(){
  const t=today();const je=S.journal.entries.find(e=>e.date===t)||{mood:0,text:''};
  let h='<section class="card"><div class="sec-h"><h2>'+esc(fmtDate(t))+'</h2><span class="small muted" id="jsaved"></span></div>'+
    '<p class="prompt">'+esc(PROMPTS[new Date().getDate()%PROMPTS.length])+'</p>'+
    '<div class="moods" role="radiogroup" aria-label="Mood">'+MOODS.map((m,i)=>'<button class="mood'+(je.mood===i+1?' on':'')+'" role="radio" aria-checked="'+(je.mood===i+1)+'" data-act="mood" data-v="'+(i+1)+'">'+moodSvg(i)+m[0]+'</button>').join('')+'</div>'+
    '<textarea class="field" id="jtext" style="margin-top:12px;min-height:180px" placeholder="Write freely. It saves as you type.">'+esc(je.text)+'</textarea></section>';
  const past=S.journal.entries.filter(e=>e.date!==t&&(e.text||e.mood)).sort((a,b)=>b.date.localeCompare(a.date));
  h+='<section class="card"><div class="sec-h"><h2>Past entries</h2><span class="small muted num">'+past.length+'</span></div><div class="list">';
  h+=past.length?past.map(e=>'<div class="item jentry"><button class="body" data-act="openEntry" data-id="'+e.id+'"><div class="t">'+esc(relDay(e.date))+(e.mood?' <span class="chip" style="margin-left:6px">'+MOODS[e.mood-1][0]+'</span>':'')+'</div><div class="excerpt">'+esc(e.text||'')+'</div></button></div>').join(''):'<div class="empty"><b>Your entries will collect here.</b>One a day is plenty.</div>';
  h+='</div></section>';
  return h;
};
VIEWS.money=function(){
  const m=moneyMonth,[yy,mm]=m.split('-').map(Number);
  const tot=monthTotals(m),bud=S.money.budget||0,left=bud-tot.out;
  let h='<div class="sec-h" style="margin:0"><div class="mnav"><button class="icon-btn" data-act="mPrev" aria-label="Previous month">'+ICON.left+'</button><button class="icon-btn" data-act="mNext" aria-label="Next month">'+ICON.right+'</button></div><h2>'+MONL[mm-1]+' '+yy+'</h2></div>';
  h+='<section class="card"><h3>Spent</h3><div class="big" style="margin:6px 0 10px">'+money(tot.out)+'</div>';
  if(bud){const p=Math.min(100,tot.out/bud*100);h+='<div class="meter'+(left<0?' over':'')+'" style="height:8px"><i style="width:'+p+'%"></i></div><div class="kv"><span class="muted">Budget '+money(bud)+'</span><span class="num" style="color:'+(left<0?'var(--bad)':'var(--good)')+'">'+(left<0?money(-left)+' over':money(left)+' left')+'</span></div>'}
  h+='<div class="kv"><span class="muted">Income</span><span class="num" style="color:var(--good)">'+money(tot.inc)+'</span></div>'+
    '<div class="kv"><span class="muted">Net</span><span class="num">'+money(tot.inc-tot.out)+'</span></div>'+
    '<button class="link" data-act="setBudget">'+(bud?'Change monthly budget':'Set a monthly budget')+'</button></section>';
  const cats=Object.entries(tot.cats).sort((a,b)=>b[1]-a[1]);
  if(cats.length){const mx=cats[0][1];h+='<section class="card"><div class="sec-h"><h2>Where it went</h2></div>'+cats.map(([c,v])=>'<div class="cat-row"><span>'+esc(c)+'</span><div class="cat-bar"><i style="width:'+(v/mx*100)+'%"></i></div><span class="amt">'+money(v)+'</span></div>').join('')+'</section>'}
  h+='<section class="card"><div class="sec-h"><h2>Add an entry</h2></div>'+
    '<div class="seg" style="margin-bottom:10px"><button class="'+(moneyType==='out'?'on':'')+'" data-act="mType" data-v="out">Expense</button><button class="'+(moneyType==='in'?'on':'')+'" data-act="mType" data-v="in">Income</button></div>'+
    '<div class="grid2"><label class="lbl">Amount<input class="field num" id="mAmt" inputmode="decimal" placeholder="0" autocomplete="off"></label>'+
    '<label class="lbl">Category<select class="field" id="mCat">'+(moneyType==='out'?OUT_CATS:IN_CATS).map(c=>'<option>'+c+'</option>').join('')+'</select></label></div>'+
    '<div class="grid2" style="margin-top:10px"><label class="lbl">Note<input class="field" id="mNote" placeholder="Optional" autocomplete="off"></label><label class="lbl">Date<input class="field" type="date" id="mDate" value="'+(m===today().slice(0,7)?today():m+'-01')+'"></label></div>'+
    '<button class="btn primary" style="margin-top:12px;width:100%" data-act="addMoney">Add '+(moneyType==='out'?'expense':'income')+'</button></section>';
  const es=monthEntries(m).sort((a,b)=>b.date.localeCompare(a.date)||b.ts-a.ts);
  h+='<section class="card"><div class="sec-h"><h2>Transactions</h2><span class="small muted num">'+es.length+'</span></div><div class="list">';
  let last='';
  es.forEach(e=>{if(e.date!==last){h+='<div class="group-h">'+esc(relDay(e.date))+'</div>';last=e.date}
    h+='<div class="item"><button class="body" data-act="editMoney" data-id="'+e.id+'" style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><span style="min-width:0"><span class="t">'+esc(e.note||e.cat)+'</span>'+(e.note?'<span class="m"><span>'+esc(e.cat)+'</span></span>':'')+'</span><span class="amt'+(e.type==='in'?' in':'')+'">'+(e.type==='in'?'+':'')+money(e.amt)+'</span></button></div>'});
  if(!es.length)h+='<div class="empty"><b>No entries this month.</b>Log spending as it happens and the totals build themselves.</div>';
  h+='</div></section>';
  return h;
};
let moneyType='out';
let calc={v:'0',prev:null,op:null,fresh:true,ex:''};
VIEWS.tools=function(){
  let h='<div class="seg">'+[['calc','Calculator'],['notes','Notes'],['settings','Settings']].map(x=>'<button class="'+(toolTab===x[0]?'on':'')+'" data-act="toolTab" data-v="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
  if(toolTab==='calc'){
    const K=[['AC','fn'],['⌫','fn'],['%','fn'],['÷','op'],['7'],['8'],['9'],['×','op'],['4'],['5'],['6'],['−','op'],['1'],['2'],['3'],['+','op'],['±','fn'],['0'],['.'],['=','eq']];
    h+='<section class="card"><div class="calc-disp"><div class="ex" id="calcEx">'+esc(calc.ex)+'</div><div class="v" id="calcV">'+esc(fmtCalc(calc.v))+'</div></div><div class="keys">'+K.map(k=>'<button class="key '+(k[1]||'')+'" data-act="calc" data-k="'+k[0]+'">'+k[0]+'</button>').join('')+'</div></section>';
    h+='<section class="card"><div class="sec-h"><h2>Split a bill</h2></div><div class="grid2"><label class="lbl">Bill total<input class="field num qt" id="sAmt" inputmode="decimal" placeholder="0"></label><label class="lbl">People<input class="field num qt" id="sPpl" inputmode="numeric" value="2"></label></div><label class="lbl" style="margin-top:10px">Tip or service %<input class="field num qt" id="sTip" inputmode="decimal" value="10"></label><div class="res"><span class="muted">Each person pays</span><b id="sRes">—</b></div><div class="res" style="border:0;padding-top:4px"><span class="muted">Total with tip</span><b id="sTot">—</b></div></section>';
    h+='<section class="card"><div class="sec-h"><h2>Add VAT</h2></div><div class="grid2"><label class="lbl">Amount before tax<input class="field num qt" id="vAmt" inputmode="decimal" placeholder="0"></label><label class="lbl">Rate %<input class="field num qt" id="vRate" inputmode="decimal" value="7.5"></label></div><div class="res"><span class="muted">VAT</span><b id="vRes">—</b></div><div class="res" style="border:0;padding-top:4px"><span class="muted">Total</span><b id="vTot">—</b></div></section>';
    h+='<section class="card"><div class="sec-h"><h2>Percent change</h2></div><div class="grid2"><label class="lbl">From<input class="field num qt" id="pFrom" inputmode="decimal" placeholder="0"></label><label class="lbl">To<input class="field num qt" id="pTo" inputmode="decimal" placeholder="0"></label></div><div class="res"><span class="muted">Change</span><b id="pRes">—</b></div></section>';
  }else if(toolTab==='notes'){
    const q=noteQuery.toLowerCase();
    const ns=S.notes.items.filter(n=>!q||(n.title+' '+n.body).toLowerCase().includes(q)).sort((a,b)=>(b.pinned-a.pinned)||b.ts-a.ts);
    h+='<section class="card"><div class="row"><input class="field" id="noteSearch" placeholder="Search notes" value="'+esc(noteQuery)+'" autocomplete="off" type="search"><button class="btn primary" data-act="newNote">New</button></div></section>';
    h+='<section class="card"><div class="list" id="noteList">'+notesList(ns)+'</div></section>';
  }else{
    h+='<section class="card"><div class="sec-h"><h2>About you</h2></div><div class="grid2"><label class="lbl">Your first name<input class="field" id="setName" value="'+esc(S.settings.name)+'" placeholder="For the greeting" autocomplete="given-name"></label><label class="lbl">Currency symbol<input class="field" id="setCur" value="'+esc(S.settings.currency)+'" maxlength="4"></label></div></section>';
    h+='<section class="card"><div class="sec-h"><h2>Account</h2></div><p class="small muted" style="margin:0 0 12px">Signed in as <b style="color:var(--ink)">'+esc(email)+'</b>. Everything syncs to your account, so it appears on every device you sign in on. A copy stays on this device so the app also works offline.</p><button class="btn" data-act="signOut">Sign out</button></section>';
    h+='<section class="card"><div class="sec-h"><h2>Backups</h2></div><p class="small muted" style="margin:0 0 12px">Save a copy of everything as a file, or restore one. You can also import a backup from the offline version of this app.</p>'+
      '<div class="btns"><button class="btn" data-act="export">Export backup</button><label class="btn" for="importFile" style="cursor:pointer">Import backup</label><input type="file" id="importFile" accept=".json,application/json" hidden></div>'+
      '<textarea class="field" id="exportBox" hidden readonly style="margin-top:12px;font-family:var(--f-mono);font-size:12px"></textarea></section>';
    h+='<section class="card"><div class="sec-h"><h2>Install on iPhone</h2></div><p class="small muted" style="margin:0">Open this site in Safari, tap the Share button, then <b style="color:var(--ink)">Add to Home Screen</b>. It gets its own icon and opens like an app.</p></section>';
    h+='<section class="card"><div class="sec-h"><h2>Start over</h2></div><p class="small muted" style="margin:0 0 12px">Deletes every task, habit, journal entry, transaction and note.</p><button class="btn danger" data-act="wipe">Erase all data</button></section>';
  }
  return h;
};
function notesList(ns){
  if(!ns.length)return '<div class="empty"><b>'+(noteQuery?'No matching notes.':'No notes yet.')+'</b>'+(noteQuery?'Try a different word.':'Keep reference info here: account numbers you look up often, gate codes, gift ideas, meeting notes.')+'</div>';
  return ns.map(n=>'<div class="item"><button class="body" data-act="openNote" data-id="'+n.id+'"><div class="t" style="font-weight:500">'+(n.pinned?'<span class="chip acc" style="margin-right:6px">Pinned</span>':'')+esc(n.title||'Untitled')+'</div><div class="excerpt">'+esc(n.body)+'</div><div class="m"><span>'+esc(fmtDate(ymd(new Date(n.ts))))+'</span></div></button></div>').join('');
}

/* ---------- calculator ---------- */
function fmtCalc(v){if(v==='Error')return v;if(/e/.test(v))return v;const [a,b]=v.split('.');const neg=a.startsWith('-');const n=(neg?a.slice(1):a).replace(/\B(?=(\d{3})+(?!\d))/g,',');return (neg?'−':'')+n+(b!==undefined?'.'+b:'')}
function compute(a,b,op){a=+a;b=+b;let r=op==='+'?a+b:op==='−'?a-b:op==='×'?a*b:b===0?NaN:a/b;if(!isFinite(r))return'Error';return String(+r.toPrecision(12))}
function calcKey(k){
  const c=calc;
  if(c.v==='Error'&&k!=='AC'){c.v='0';c.fresh=true}
  if(/^\d$/.test(k)){if(c.fresh){c.v=k;c.fresh=false}else if(c.v.replace(/[-.]/g,'').length<15)c.v=c.v==='0'?k:c.v+k}
  else if(k==='.'){if(c.fresh){c.v='0.';c.fresh=false}else if(!c.v.includes('.'))c.v+='.'}
  else if(k==='AC'){calc={v:'0',prev:null,op:null,fresh:true,ex:''};return}
  else if(k==='⌫'){if(!c.fresh){c.v=c.v.length>1&&!(c.v.length===2&&c.v[0]==='-')?c.v.slice(0,-1):'0'}}
  else if(k==='±'){if(c.v!=='0')c.v=c.v.startsWith('-')?c.v.slice(1):'-'+c.v}
  else if(k==='%'){c.v=c.prev!=null&&(c.op==='+'||c.op==='−')?String(+c.prev*+c.v/100):String(+c.v/100);c.fresh=true}
  else if(['+','−','×','÷'].includes(k)){
    if(c.op&&!c.fresh){c.v=compute(c.prev,c.v,c.op)}
    c.prev=c.v;c.op=k;c.fresh=true;c.ex=fmtCalc(c.v)+' '+k;
  }else if(k==='='){
    if(c.op){const r=compute(c.prev,c.v,c.op);c.ex=fmtCalc(c.prev)+' '+c.op+' '+fmtCalc(c.v)+' =';c.v=r;c.prev=null;c.op=null;c.fresh=true}
  }
}
function quickTools(){
  const n=id=>{const el=document.getElementById(id);return el?parseFloat(el.value.replace(/,/g,'')):NaN};
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
  const a=n('sAmt'),p=n('sPpl'),tp=n('sTip');
  if(a>0&&p>0){const tot=a*(1+(isNaN(tp)?0:tp)/100);set('sRes',money(Math.ceil(tot/p*100)/100));set('sTot',money(tot))}else{set('sRes','—');set('sTot','—')}
  const va=n('vAmt'),vr=n('vRate');
  if(va>0&&!isNaN(vr)){const v=va*vr/100;set('vRes',money(v));set('vTot',money(va+v))}else{set('vRes','—');set('vTot','—')}
  const f=n('pFrom'),to=n('pTo');
  if(f&&!isNaN(to)){const c=(to-f)/Math.abs(f)*100;set('pRes',(c>0?'+':'')+c.toFixed(1)+'%')}else set('pRes','—');
}

/* ---------- sheet ---------- */
let sheetClose=null;
function openSheet(html,onMount,onClose){
  closeSheet(true);
  const root=$('#sheetRoot');
  root.innerHTML='<div class="scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="wrap"><div class="grab"></div>'+html+'</div></div>';
  requestAnimationFrame(()=>{root.querySelector('.scrim').classList.add('show');root.querySelector('.sheet').classList.add('show')});
  sheetClose=onClose||null;
  if(onMount)onMount(root.querySelector('.sheet'));
}
function closeSheet(silent){
  const root=$('#sheetRoot');if(!root.firstChild)return;
  if(sheetClose&&!silent)sheetClose();sheetClose=null;
  const sc=root.querySelector('.scrim'),sh=root.querySelector('.sheet');
  if(silent){root.innerHTML='';return}
  sc.classList.remove('show');sh.classList.remove('show');
  setTimeout(()=>{root.innerHTML='';if(pendingRender){pendingRender=false}render()},200);
}
function armDelete(btn,fn){if(btn.classList.contains('armed')){fn()}else{btn.classList.add('armed');btn.textContent='Tap again to delete';setTimeout(()=>{if(btn.isConnected){btn.classList.remove('armed');btn.textContent='Delete'}},3500)}}

function taskSheet(it){
  const isNew=!it;
  it=it||{title:'',date:'',time:'',pri:'normal',area:'',notes:''};
  openSheet('<h2>'+(isNew?'New task':'Edit task')+'</h2>'+
    '<input class="field" id="tTitle" placeholder="What needs doing?" value="'+esc(it.title)+'">'+
    '<div class="grid2"><label class="lbl">Date<input class="field" type="date" id="tDate" value="'+esc(it.date)+'"></label><label class="lbl">Time<input class="field" type="time" id="tTime" value="'+esc(it.time)+'"></label></div>'+
    '<div class="grid2"><label class="lbl">Priority<select class="field" id="tPri"><option value="normal"'+(it.pri!=='high'?' selected':'')+'>Normal</option><option value="high"'+(it.pri==='high'?' selected':'')+'>Priority</option></select></label><label class="lbl">Area<select class="field" id="tArea">'+['','Work','Personal','Home','Family','Health','Finance'].map(a=>'<option value="'+a+'"'+(it.area===a?' selected':'')+'>'+(a||'None')+'</option>').join('')+'</select></label></div>'+
    '<label class="lbl">Notes<textarea class="field" id="tNotes" style="min-height:90px" placeholder="Details, links, phone numbers">'+esc(it.notes)+'</textarea></label>'+
    '<div class="btns"><button class="btn primary" data-act="saveTask" data-id="'+(it.id||'')+'" style="flex:1">'+(isNew?'Add task':'Save')+'</button>'+(isNew?'':'<button class="btn danger" data-act="delTask" data-id="'+it.id+'">Delete</button>')+'</div>',
    s=>{if(isNew)s.querySelector('#tTitle').focus()});
}

/* ---------- events ---------- */
on(document,'click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,id=b.dataset.id;
  const T=()=>S.tasks.items.find(x=>x.id===id);
  switch(a){
    case 'closeSheet':closeSheet();break;
    case 'toggleTask':{const it=T();if(!it)break;it.done=!it.done;it.doneAt=it.done?Date.now():0;save('tasks');render();if(it.done)toast('Done: '+it.title);break}
    case 'editTask':taskSheet(T());break;
    case 'newTask':taskSheet(null);break;
    case 'saveTask':{
      const title=$('#tTitle').value.trim();if(!title){$('#tTitle').focus();break}
      const v={title,date:$('#tDate').value,time:$('#tTime').value,pri:$('#tPri').value,area:$('#tArea').value,notes:$('#tNotes').value};
      if(id){Object.assign(T(),v);save('tasks')}else addTask(v);
      closeSheet();break}
    case 'delTask':armDelete(b,()=>{S.tasks.items=S.tasks.items.filter(x=>x.id!==id);save('tasks');closeSheet();toast('Task deleted')});break;
    case 'quickAdd':doQuickAdd(b.dataset.for);break;
    case 'planFilter':planFilter=b.dataset.v;render();break;
    case 'clearDone':armDeleteLabel(b,'Tap again to clear',()=>{S.tasks.items=S.tasks.items.filter(x=>!x.done);save('tasks');render()});break;
    case 'habitToday':toggleHabit(id,today());render();break;
    case 'habitDay':toggleHabit(id,b.dataset.d);render();break;
    case 'addHabit':{const el=$('#habitInput'),n=el.value.trim();if(!n){el.focus();break}S.habits.items.push({id:newId(),name:n});save('habits');render();break}
    case 'editHabit':{const h=S.habits.items.find(x=>x.id===id);if(!h)break;
      openSheet('<h2>Edit habit</h2><input class="field" id="hName" value="'+esc(h.name)+'"><div class="btns"><button class="btn primary" style="flex:1" data-act="saveHabit" data-id="'+id+'">Save</button><button class="btn danger" data-act="delHabit" data-id="'+id+'">Delete</button></div><p class="small muted" style="margin:0">Current streak: '+streak(id)+' days.</p>');break}
    case 'saveHabit':{const h=S.habits.items.find(x=>x.id===id),n=$('#hName').value.trim();if(h&&n){h.name=n;save('habits')}closeSheet();break}
    case 'delHabit':armDelete(b,()=>{S.habits.items=S.habits.items.filter(x=>x.id!==id);Object.keys(S.habits.log).forEach(d=>{S.habits.log[d]=S.habits.log[d].filter(x=>x!==id);if(!S.habits.log[d].length)delete S.habits.log[d]});save('habits');closeSheet()});break;
    case 'mood':{const e=journalToday();e.mood=+b.dataset.v===e.mood?0:+b.dataset.v;e.ts=Date.now();save('journal');
      document.querySelectorAll('.mood').forEach(m=>{const on=+m.dataset.v===e.mood;m.classList.toggle('on',on);m.setAttribute('aria-checked',on)});flashSaved();break}
    case 'openEntry':{const en=S.journal.entries.find(x=>x.id===id);if(!en)break;
      openSheet('<h2>'+esc(fmtDate(en.date))+'</h2>'+(en.mood?'<div><span class="chip acc">'+MOODS[en.mood-1][0]+'</span></div>':'')+'<textarea class="field" id="eText" style="min-height:240px">'+esc(en.text)+'</textarea><div class="btns"><button class="btn primary" style="flex:1" data-act="saveEntry" data-id="'+id+'">Save</button><button class="btn danger" data-act="delEntry" data-id="'+id+'">Delete</button></div>');break}
    case 'saveEntry':{const en=S.journal.entries.find(x=>x.id===id);if(en){en.text=$('#eText').value;en.ts=Date.now();save('journal')}closeSheet();break}
    case 'delEntry':armDelete(b,()=>{S.journal.entries=S.journal.entries.filter(x=>x.id!==id);save('journal');closeSheet()});break;
    case 'mPrev':case 'mNext':{let [y,m]=moneyMonth.split('-').map(Number);m+=a==='mPrev'?-1:1;if(m<1){m=12;y--}if(m>12){m=1;y++}moneyMonth=y+'-'+pad(m);render();break}
    case 'mType':moneyType=b.dataset.v;render();break;
    case 'addMoney':{const amt=parseFloat($('#mAmt').value.replace(/,/g,''));if(!(amt>0)){$('#mAmt').focus();toast('Enter an amount above zero.');break}
      const date=$('#mDate').value||today();
      S.money.entries.push({id:newId(),type:moneyType,amt,cat:$('#mCat').value,note:$('#mNote').value.trim(),date,ts:Date.now()});save('money');
      moneyMonth=date.slice(0,7);render();toast((moneyType==='out'?'Expense':'Income')+' added: '+money(amt));break}
    case 'editMoney':{const en=S.money.entries.find(x=>x.id===id);if(!en)break;
      openSheet('<h2>'+(en.type==='in'?'Income':'Expense')+'</h2><div class="grid2"><label class="lbl">Amount<input class="field num" id="eAmt" inputmode="decimal" value="'+en.amt+'"></label><label class="lbl">Category<select class="field" id="eCat">'+(en.type==='in'?IN_CATS:OUT_CATS).map(c=>'<option'+(c===en.cat?' selected':'')+'>'+c+'</option>').join('')+'</select></label></div><div class="grid2"><label class="lbl">Note<input class="field" id="eNote" value="'+esc(en.note)+'"></label><label class="lbl">Date<input class="field" type="date" id="eDate" value="'+en.date+'"></label></div><div class="btns"><button class="btn primary" style="flex:1" data-act="saveMoney" data-id="'+id+'">Save</button><button class="btn danger" data-act="delMoney" data-id="'+id+'">Delete</button></div>');break}
    case 'saveMoney':{const en=S.money.entries.find(x=>x.id===id),amt=parseFloat($('#eAmt').value.replace(/,/g,''));if(en&&amt>0){en.amt=amt;en.cat=$('#eCat').value;en.note=$('#eNote').value.trim();en.date=$('#eDate').value||en.date;save('money')}closeSheet();break}
    case 'delMoney':armDelete(b,()=>{S.money.entries=S.money.entries.filter(x=>x.id!==id);save('money');closeSheet()});break;
    case 'setBudget':openSheet('<h2>Monthly budget</h2><p class="small muted" style="margin:0">How much you plan to spend each month. Leave empty to turn it off.</p><input class="field num" id="bAmt" inputmode="decimal" value="'+(S.money.budget||'')+'" placeholder="0"><button class="btn primary" data-act="saveBudget">Save budget</button>',s=>s.querySelector('#bAmt').focus());break;
    case 'saveBudget':{const v=parseFloat($('#bAmt').value.replace(/,/g,''));S.money.budget=v>0?v:0;save('money');closeSheet();break}
    case 'toolTab':toolTab=b.dataset.v;render();break;
    case 'calc':calcKey(b.dataset.k);$('#calcV').textContent=fmtCalc(calc.v);$('#calcEx').textContent=calc.ex;break;
    case 'newNote':noteSheet(null);break;
    case 'openNote':noteSheet(S.notes.items.find(x=>x.id===id));break;
    case 'saveNote':{const t=$('#nTitle').value.trim(),bd=$('#nBody').value,pin=$('#nPin').checked;if(!t&&!bd.trim()){closeSheet();break}
      if(id){const n=S.notes.items.find(x=>x.id===id);Object.assign(n,{title:t,body:bd,pinned:pin,ts:Date.now()})}else S.notes.items.push({id:newId(),title:t,body:bd,pinned:pin,ts:Date.now()});
      save('notes');closeSheet();break}
    case 'copyNote':{const txt=$('#nBody').value;navigator.clipboard&&navigator.clipboard.writeText(txt).then(()=>toast('Copied'),()=>{$('#nBody').select();toast('Selected. Use Copy from the menu.')});break}
    case 'delNote':armDelete(b,()=>{S.notes.items=S.notes.items.filter(x=>x.id!==id);save('notes');closeSheet()});break;
    case 'export':doExport();break;
    case 'wipe':armDeleteLabel(b,'Tap again to erase everything',()=>{KEYS.forEach(k=>{const keep=k==='settings'?{name:S.settings.name,currency:S.settings.currency,started:true}:null;S[k]=Object.assign(clone(DEF[k]),keep||{});save(k)});toast('All data erased');render()});break;
    case 'seed':seed();break;
    case 'signOut':b.disabled=true;b.textContent='Signing out…';onSignOut();break;
    case 'startFresh':S.settings.started=true;save('settings');render();break;
  }
});
function armDeleteLabel(btn,label,fn){if(btn.classList.contains('armed'))fn();else{const old=btn.textContent;btn.classList.add('armed');btn.textContent=label;setTimeout(()=>{if(btn.isConnected){btn.classList.remove('armed');btn.textContent=old}},3500)}}
function noteSheet(n){
  const isNew=!n;n=n||{title:'',body:'',pinned:false};
  openSheet('<h2>'+(isNew?'New note':'Note')+'</h2><input class="field" id="nTitle" placeholder="Title" value="'+esc(n.title)+'"><textarea class="field" id="nBody" style="min-height:220px" placeholder="Write anything you want to keep handy">'+esc(n.body)+'</textarea><label class="row small" style="gap:8px"><input type="checkbox" id="nPin"'+(n.pinned?' checked':'')+'> Pin to top</label><div class="btns"><button class="btn primary" style="flex:1" data-act="saveNote" data-id="'+(n.id||'')+'">Save</button>'+(isNew?'':'<button class="btn" data-act="copyNote">Copy</button><button class="btn danger" data-act="delNote" data-id="'+n.id+'">Delete</button>')+'</div>',s=>{if(isNew)s.querySelector('#nTitle').focus()});
}
function journalToday(){const t=today();let e=S.journal.entries.find(x=>x.date===t);if(!e){e={id:newId(),date:t,mood:0,text:'',ts:Date.now()};S.journal.entries.push(e)}return e}
let savedT;function flashSaved(){const el=$('#jsaved');if(el){el.textContent='Saved';clearTimeout(savedT);savedT=setTimeout(()=>{if(el.isConnected)el.textContent=''},1500)}}
function doQuickAdd(fid){const el=document.getElementById(fid);if(!el)return;const raw=el.value.trim();if(!raw){el.focus();return}
  const p=parseQuick(raw);if(!p.title){toast('Add a few words describing the task.');return}
  addTask({title:p.title,date:p.date,time:p.time,pri:p.pri});el.value='';el.blur();render();toast('Added'+(p.date?' for '+relDay(p.date).toLowerCase():''));}

on(document,'keydown',e=>{
  if(e.key==='Escape'&&$('.sheet.show'))closeSheet();
  if(e.key!=='Enter'||e.isComposing)return;
  const id=e.target.id;
  if(id==='qaToday'||id==='qaPlan'){e.preventDefault();doQuickAdd(id)}
  else if(id==='habitInput'){e.preventDefault();$('[data-act=addHabit]').click()}
  else if(id==='mAmt'||id==='mNote'){e.preventDefault();$('[data-act=addMoney]').click()}
});
let jTimer;
on(document,'input',e=>{
  const id=e.target.id;
  if(id==='qaToday'||id==='qaPlan'){const pv=document.getElementById(id+'-pv');if(pv)pv.innerHTML=previewHtml(e.target.value)}
  else if(id==='jtext'){const en=journalToday();en.text=e.target.value;en.ts=Date.now();clearTimeout(jTimer);jTimer=setTimeout(()=>{save('journal');flashSaved()},500)}
  else if(e.target.classList.contains('qt'))quickTools();
  else if(id==='noteSearch'){noteQuery=e.target.value;const q=noteQuery.toLowerCase();$('#noteList').innerHTML=notesList(S.notes.items.filter(n=>!q||(n.title+' '+n.body).toLowerCase().includes(q)).sort((a,b)=>(b.pinned-a.pinned)||b.ts-a.ts))}
  else if(id==='setName'){S.settings.name=e.target.value.slice(0,40);save('settings')}
  else if(id==='setCur'){S.settings.currency=e.target.value.slice(0,4);save('settings')}
});
on(document,'change',async e=>{
  if(e.target.id!=='importFile')return;
  const f=e.target.files&&e.target.files[0];if(!f)return;
  try{const data=JSON.parse(await f.text());if(!data||data.app!=='chief-of-staff')throw 0;
    KEYS.forEach(k=>{if(data[k]){S[k]=Object.assign(clone(DEF[k]),data[k]);save(k)}});toast('Backup restored');render();
  }catch(err){toast('That file is not a Chief of Staff backup.')}
});
async function doExport(){
  const data=JSON.stringify(Object.assign({app:'chief-of-staff',exported:new Date().toISOString()},S),null,1);
  const name='chief-of-staff-backup-'+today()+'.json';
  try{const file=new File([data],name,{type:'application/json'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return}
    const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);toast('Backup saved to Downloads');return}
  catch(e){if(e&&e.name==='AbortError')return}
  const box=$('#exportBox');if(box){box.hidden=false;box.value=data;box.select();toast('Copy this text and keep it somewhere safe.')}
}
on(window,'hashchange',()=>{closeSheet(true);render();window.scrollTo(0,0)});
on(window,'scroll',()=>$('#top').classList.toggle('scrolled',scrollY>4),{passive:true});
let toastT;function toast(m){const el=$('#toast');el.textContent=m;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2200)}

function afterRender(v){
  ['qaToday','qaPlan'].forEach(id=>{const pv=document.getElementById(id+'-pv');if(pv)pv.innerHTML=previewHtml('')});
  if(v==='tools'&&toolTab==='calc')quickTools();
}

/* ---------- examples ---------- */
function seed(){
  const t=today();
  [['Review Q4 budget draft',t,'09:30','high','Work'],['Call the bank about card renewal',t,'11:00','normal','Finance'],['Gym session',t,'18:00','normal','Health'],['Send proposal to client',addDays(t,1),'10:00','high','Work'],['Book dentist appointment','','','normal','Health'],['Plan weekend with family',addDays(t,2),'','normal','Family'],['Pay electricity bill',addDays(t,-1),'','high','Finance']]
    .forEach(([title,date,time,pri,area])=>addTask({title:title+' (example)',date,time,pri,area}));
  const hs=[['Drink 2L water (example)'],['Read 20 minutes (example)'],['Pray / meditate (example)']].map(x=>({id:newId(),name:x[0]}));
  S.habits.items.push(...hs);
  for(let i=1;i<=6;i++){const d=addDays(t,-i);S.habits.log[d]=hs.filter((h,j)=>(i+j)%3!==0).map(h=>h.id)}
  S.journal.entries.push({id:newId(),date:addDays(t,-1),mood:4,text:'(Example) Productive day. Finished the report early and had time for a walk in the evening.',ts:Date.now()});
  const m=t.slice(0,7);
  [['out',4500,'Food','Lunch (example)'],['out',12000,'Transport','Fuel (example)'],['out',25000,'Bills','Internet (example)'],['in',350000,'Salary','Monthly pay (example)']].forEach(([type,amt,cat,note],i)=>S.money.entries.push({id:newId(),type,amt,cat,note,date:addDays(t,-i)>=m+'-01'?addDays(t,-i):t,ts:Date.now()-i}));
  if(!S.money.budget)S.money.budget=200000;
  S.notes.items.push({id:newId(),title:'Example: Useful numbers',body:'Office front desk: ...\nMechanic: ...\nWi-Fi password: ...',pinned:true,ts:Date.now()});
  S.settings.started=true;
  KEYS.forEach(save);render();toast('Examples loaded. Delete them any time.');
}

render();
store.start();
return ()=>{alive=false;cleanups.forEach(f=>f());clearTimeout(toastT);const r=$('#sheetRoot');if(r)r.innerHTML='';};
}
