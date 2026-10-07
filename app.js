/* Cadence app — vanilla, fast, local-first */
(() => {
"use strict";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const LS_BASE = "cadence.v1";
const lsKey = () => (window.__cadenceUserId ? `${LS_BASE}.${window.__cadenceUserId}` : LS_BASE);
const THEME_KEY = "cadence.theme";

/* ---------- date utils ---------- */
const pad = n => String(n).padStart(2,"0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const [y,m,d]=iso.split("-").map(Number); const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+n); return toISO(dt); };
const diffDays = (a,b) => { const pa=a.split("-").map(Number), pb=b.split("-").map(Number); return Math.round((new Date(pb[0],pb[1]-1,pb[2]) - new Date(pa[0],pa[1]-1,pa[2]))/864e5); };
const fmtLong = iso => new Date(iso+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
function dueLabel(iso){
  if(!iso) return "No date";
  const t = todayISO(), d = diffDays(t, iso);
  if(d===0) return "Today";
  if(d===1) return "Tomorrow";
  if(d===-1) return "Yesterday";
  if(d<0) return `${Math.abs(d)}d overdue`;
  if(d<7) return new Date(iso+"T12:00:00").toLocaleDateString(undefined,{weekday:"short"});
  return new Date(iso+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3);
const esc = s => String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- seed ---------- */
const PROJECT_COLORS = ["#D14D1F","#5B7052","#3E63DD","#9A7B2E","#8E4EC6","#0E94A0","#E09307"];
function seed(){
  const t = todayISO();
  const p1 = {id:uid(), name:"Website Redesign", color:PROJECT_COLORS[0], createdAt:Date.now()};
  const p2 = {id:uid(), name:"Client Work", color:PROJECT_COLORS[2], createdAt:Date.now()};
  const p3 = {id:uid(), name:"Personal Ops", color:PROJECT_COLORS[1], createdAt:Date.now()};
  const mk = (o,i) => ({id:uid(), notes:"", priority:2, tags:[], subtasks:[], estimate:null, done:false, doneAt:null, createdAt:Date.now()-i*7e5, order:i, due:null, projectId:p1.id, ...o});
  const tasks = [
    mk({title:"Review homepage hero copy", projectId:p1.id, due:t, priority:1, estimate:25, notes:"Check line-length on mobile, confirm CTA verb.", subtasks:[{id:uid(),title:"Read v3 draft",done:true},{id:uid(),title:"Leave 3 line-edits",done:false}], order:0}),
    mk({title:"Export accessibility checklist", projectId:p1.id, due:t, priority:2, estimate:20, order:1}),
    mk({title:"Send invoice #241 to Meridian", projectId:p2.id, due:addDays(t,-1), priority:1, estimate:10, notes:"Overdue since yesterday — send before standup.", order:2}),
    mk({title:"Prepare sprint demo (5 slides max)", projectId:p2.id, due:addDays(t,1), priority:2, estimate:45, subtasks:[{id:uid(),title:"Pull metrics",done:true},{id:uid(),title:"Record 60s loom",done:false}], order:3}),
    mk({title:"Book dentist + renew passport", projectId:p3.id, due:addDays(t,2), priority:3, order:4}),
    mk({title:"Read 20 pages — design systems", projectId:p3.id, due:null, priority:4, estimate:30, order:5}),
    mk({title:"Morning pages + gym bag ready", projectId:p3.id, due:t, priority:3, done:true, doneAt:Date.now()-36e5, order:6}),
  ];
  return {projects:[p1,p2,p3], tasks, history:{[t]:1}, focusId:tasks[0].id, createdAt:Date.now()};
}

/* ---------- store (per-user when logged in via Supabase) ---------- */
function load(){
  // Migrate legacy shared data to the new per-user key on first login.
  try{
    const key = lsKey();
    let raw = localStorage.getItem(key);
    if(!raw && window.__cadenceUserId){
      const legacy = localStorage.getItem(LS_BASE);
      if(legacy){ localStorage.setItem(key, legacy); raw = legacy; }
    }
    if(!raw) return null; const d = JSON.parse(raw); if(!Array.isArray(d.tasks)||!Array.isArray(d.projects)) return null; return d; }
  catch{ return null; }
}
let db = load() || seed();
function save(){ db.history = db.history||{}; try{localStorage.setItem(lsKey(), JSON.stringify(db));}catch{} }
// Supabase auth (auth.js) notifies us on login/logout/recovery so each
// user gets isolated tasks on the same device.
window.addEventListener("cadence:auth", () => {
  try{
    db = load() || seed();
    state.view = "today"; state.projectId = null; state.query = ""; state.priority = "";
    if(typeof syncViews === "function") syncViews();
    render();
  }catch(e){ console.warn("auth reload failed", e); }
});

/* ---------- ui state ---------- */
const state = {
  view:"today", projectId:null, query:"", priority:"", hideDone:false, sort:"manual",
  drawerId:null, paletteIdx:0,
  timer:{ total:25*60, left:25*60, running:false, int:null }
};
const PNAME = id => (db.projects.find(p=>p.id===id)||{name:"No project",color:"#B9B2A5"}).name;
const PCOLOR = id => (db.projects.find(p=>p.id===id)||{color:"#B9B2A5"}).color;

/* ---------- smart input parsing ---------- */
function parseSmart(raw){
  let text = " " + raw + " ";
  let priority = null, due = null, projectName = null, estimate = null;
  const mP = text.match(/\s[pP]([1-4])\b/); if(mP){ priority = +mP[1]; text = text.replace(mP[0]," "); }
  const mE = text.match(/\s(\d+)\s?m(?:in)?\b/i) || text.match(/\s@(\d+)m\b/);
  if(mE){ estimate = Math.min(960, +mE[1]); text = text.replace(mE[0]," "); }
  const mH = text.match(/\s(\d+(?:\.\d+)?)h\b/i);
  if(mH && !estimate){ estimate = Math.min(960, Math.round(+mH[1]*60)); text = text.replace(mH[0]," "); }
  const t = todayISO();
  const weekday = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
  let m;
  if(/\stoday\b/i.test(text)){ due=t; text=text.replace(/\stoday\b/i," "); }
  else if(/\stomorrow\b/i.test(text)){ due=addDays(t,1); text=text.replace(/\stomorrow\b/i," "); }
  else if((m=text.match(/\s(next\s+week|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i))){
    const w = m[1].toLowerCase().replace("next ","").slice(0,3);
    if(w==="wee"){ due=addDays(t,7); }
    else { const target=weekday[w]; let delta=(target-new Date().getDay()+7)%7; if(delta===0) delta=7; due=addDays(t,delta); }
    text=text.replace(m[0]," ");
  }
  else if((m=text.match(/\s(\d{4}-\d{2}-\d{2})\b/))){ due=m[1]; text=text.replace(m[0]," "); }
  const mProj = text.match(/\s#([\p{L}\p{N}_-]+)/u);
  if(mProj){ projectName = mProj[1].replace(/_/g," "); text=text.replace(mProj[0]," "); }
  text = text.replace(/\s+/g," ").trim();
  return {title:text, priority, due, projectName, estimate};
}
function resolveProject(name, fallbackId){
  if(!name) return fallbackId || db.projects[0]?.id || null;
  const found = db.projects.find(p=>p.name.toLowerCase()===name.toLowerCase());
  if(found) return found.id;
  const partial = db.projects.find(p=>p.name.toLowerCase().startsWith(name.toLowerCase()));
  if(partial) return partial.id;
  const np = {id:uid(), name:name[0].toUpperCase()+name.slice(1), color:PROJECT_COLORS[db.projects.length%PROJECT_COLORS.length], createdAt:Date.now()};
  db.projects.push(np); return np.id;
}

/* ---------- filtering ---------- */
function visibleTasks(){
  const t = todayISO();
  let list = db.tasks.slice();
  if(state.view==="completed") list = list.filter(x=>x.done);
  else if(state.view==="today") list = list.filter(x=>!x.done && (x.due===t || (x.due && x.due<t)));
  else if(state.view==="upcoming"){ const end=addDays(t,7); list = list.filter(x=>!x.done && x.due && x.due>t && x.due<=end); }
  else if(state.view==="all") list = list.filter(x=>!x.done || !state.hideDone);
  if(state.projectId) list = list.filter(x=>x.projectId===state.projectId);
  if(state.priority) list = list.filter(x=>String(x.priority)===state.priority);
  if(state.view!=="completed" && state.hideDone) list = list.filter(x=>!x.done);
  if(state.query){ const q=state.query.toLowerCase(); list=list.filter(x=>(x.title+" "+(x.notes||"")+" "+PNAME(x.projectId)).toLowerCase().includes(q)); }
  if(state.sort==="due") list.sort((a,b)=>(a.due||"9999")<(b.due||"9999")?-1:1 || a.priority-b.priority);
  else if(state.sort==="priority") list.sort((a,b)=>a.priority-b.priority || (a.due||"9999").localeCompare(b.due||"9999"));
  else list.sort((a,b)=>(a.order??0)-(b.order??0));
  return list;
}
function groupTasks(list){
  const t = todayISO();
  if(state.view==="completed") return [{key:"done", title:"Completed", hint:`${list.length} tasks`, items:list}];
  if(state.view==="upcoming"){
    const map = {};
    list.forEach(x=>{(map[x.due]=map[x.due]||[]).push(x);});
    return Object.keys(map).sort().map(d=>({key:d, title:(d===addDays(t,1)?"Tomorrow — ":"")+fmtLong(d), hint:dueLabel(d), items:map[d]}));
  }
  if(state.view==="all" && !state.projectId){
    const map={}; list.forEach(x=>{const k=x.projectId||"none"; (map[k]=map[k]||[]).push(x);});
    return Object.keys(map).map(k=>({key:k, title:PNAME(k), hint:`${map[k].length} open`, color:PCOLOR(k), items:map[k]}));
  }
  const over=list.filter(x=>x.due&&x.due<t&&!x.done), tod=list.filter(x=>x.due===t&&!x.done),
        later=list.filter(x=>!x.due||(x.due>t)), done=list.filter(x=>x.done);
  const g=[];
  if(over.length) g.push({key:"over", title:"Overdue", hint:"clear these first", items:over});
  if(state.view==="today"){
    if(tod.length) g.push({key:"tod", title:"Today", hint:`${tod.length} tasks`, items:tod});
    if(later.filter(x=>!x.done).length) g.push({key:"later", title:"Also on deck", hint:"unscheduled", items:later.filter(x=>!x.done)});
    if(done.length && !state.hideDone) g.push({key:"done2", title:"Done today", hint:`${done.length}`, items:done});
    if(!g.length) g.push({key:"empty", title:"Today", hint:"", items:[]});
    return g;
  }
  return [{key:"all", title: state.projectId?PNAME(state.projectId):"All open tasks", hint:`${list.filter(x=>!x.done).length} open`, items:list}];
}

/* ---------- toast ---------- */
function toast(msg, action){
  const box = $("#toasts"); const el = document.createElement("div"); el.className="toast";
  el.innerHTML = `<span>${esc(msg)}</span>` + (action?`<button>${esc(action.label)}</button>`:"");
  if(action) el.querySelector("button").onclick = ()=>{action.fn(); el.remove();};
  box.appendChild(el); setTimeout(()=>{el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),320);}, action?5200:2800);
}

/* ---------- render ---------- */
const PCOL = {1:"var(--p1)",2:"var(--p2)",3:"var(--p3)",4:"var(--p4)"};
function render(){
  save();
  const t = todayISO();
  // header date / greeting
  const now = new Date(); const h = now.getHours();
  const greet = h<12?"Good morning":h<18?"Good afternoon":"Good evening";
  $("#today-iso").textContent = now.toLocaleDateString(undefined,{weekday:"long", month:"short", day:"numeric"});
  $("#workspace-sub").textContent = now.toLocaleDateString(undefined,{weekday:"long"}) + " flow";
  $("#greeting-eyebrow").textContent = `${greet} — let's make today legible`;
  const open = db.tasks.filter(x=>!x.done), over = open.filter(x=>x.due&&x.due<t);
  const todayOpen = open.filter(x=>x.due===t||(x.due&&x.due<t));
  const big = Math.min(3, todayOpen.length)||Math.min(3,open.length);
  $("#greeting-title").innerHTML = open.length===0 ? `All clear.<br/><em>enjoy the quiet.</em>` : `What deserves<br/><em>your attention</em> today?`;
  $("#hero-sub").textContent = `${open.length} open · ${over.length} overdue · keep it to ${big||3} big wins.`;
  // streak
  let streak=0; let d=t;
  const hist=db.history||{};
  if(!hist[d]) d=addDays(t,-1);
  while(hist[d]>0){streak++; d=addDays(d,-1);}
  $("#streak-line").textContent = `${streak}-day streak`;
  $("#avatar").textContent = "H";
  // counts
  $("#count-today").textContent = db.tasks.filter(x=>!x.done&&(x.due===t||(x.due&&x.due<t))).length;
  $("#count-upcoming").textContent = db.tasks.filter(x=>!x.done&&x.due&&x.due>t&&x.due<=addDays(t,7)).length;
  $("#count-all").textContent = open.length;
  $("#count-done").textContent = db.tasks.filter(x=>x.done).length;
  // day progress
  const doneToday = db.tasks.filter(x=>x.done && x.doneAt && toISO(new Date(x.doneAt))===t).length;
  const totalToday = doneToday + todayOpen.length;
  const pct = totalToday? Math.round(doneToday/totalToday*100):100;
  $("#day-progress-label").textContent = totalToday? `${doneToday} of ${totalToday} done` : "Nothing due — add one";
  $("#day-progress-pct").textContent = pct+"%";
  $("#day-progress-bar").style.width = pct+"%";
  renderProjects(); renderGroups(); renderFocus(); renderComposerDefaults();
}
function renderProjects(){
  const box = $("#projects"); box.innerHTML="";
  const openCount = pid => db.tasks.filter(x=>!x.done&&x.projectId===pid).length;
  db.projects.forEach(p=>{
    const b=document.createElement("div"); b.style.display="flex"; b.style.alignItems="center";
    b.innerHTML = `<button class="proj ${state.projectId===p.id?"is-active":""}" data-p="${p.id}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="proj-name">${esc(p.name)}</span>
      <span class="proj-count">${openCount(p.id)}</span></button>
      <button class="proj-x" title="Delete project" data-del="${p.id}">×</button>`;
    b.querySelector("[data-p]").onclick = ()=>{
      state.projectId = state.projectId===p.id?null:p.id;
      if(state.projectId) state.view="all";
      syncViews(); render(); closeSidebarMobile();
    };
    b.querySelector("[data-del]").onclick = (e)=>{
      e.stopPropagation();
      const n = db.tasks.filter(x=>x.projectId===p.id).length;
      if(!confirm(`Delete “${p.name}” and its ${n} task(s)?`)) return;
      db.tasks = db.tasks.filter(x=>x.projectId!==p.id);
      db.projects = db.projects.filter(x=>x.id!==p.id);
      if(state.projectId===p.id) state.projectId=null;
      render(); toast("Project deleted");
    };
    b.querySelector("[data-p]").ondblclick = ()=>{
      const name = prompt("Rename project", p.name); if(name&&name.trim()){p.name=name.trim().slice(0,40); render();}
    };
    box.appendChild(b);
  });
}
function taskRow(x){
  const t=todayISO();
  const isOver = x.due&&x.due<t&&!x.done;
  const isToday = x.due===t&&!x.done;
  const doneSubs = x.subtasks.filter(s=>s.done).length;
  const el=document.createElement("div");
  el.className="task"+(x.done?" done":""); el.draggable=true; el.dataset.id=x.id;
  el.setAttribute("tabindex","0");
  el.style.setProperty("--pc", PCOL[x.priority]||"var(--p4)");
  el.innerHTML=`
    <button class="check" aria-label="${x.done?"Mark not done":"Mark done"}">${x.done?'<svg viewBox="0 0 12 12"><path d="M2 6.4l2.6 2.6L10 3.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>':""}</button>
    <div class="t-main">
      <p class="t-title">${esc(x.title)||"<i style='color:var(--faint)'>Untitled</i>"}</p>
      <div class="t-meta">
        <span class="mp"><span class="mdot" style="background:${PCOLOR(x.projectId)}"></span>${esc(PNAME(x.projectId))}</span>
        ${x.priority<4?`<span class="pill p${x.priority}">P${x.priority}</span>`:""}
        ${isOver?`<span class="pill over">${esc(dueLabel(x.due))}</span>`:x.due?`<span class="pill ${isToday?"today":""}">${esc(dueLabel(x.due))} · ${esc(x.due.slice(5))}</span>`:`<span style="color:var(--faint)">No date</span>`}
        ${x.estimate?`<span>◷ ${x.estimate}m</span>`:""}
        ${x.subtasks.length?`<span>${doneSubs}/${x.subtasks.length} subtasks</span>`:""}
      </div>
      ${x.subtasks.length?`<div class="subbar"><span style="width:${Math.round(doneSubs/x.subtasks.length*100)}%"></span></div>`:""}
    </div>
    <div class="t-actions">
      <button class="mini-icon drag" title="Drag to reorder">⠿</button>
      <button class="mini-icon" data-act="focus" title="Pin as focus">◎</button>
      <button class="mini-icon" data-act="open" title="Details">⤢</button>
      <button class="mini-icon" data-act="del" title="Delete">×</button>
    </div>`;
  el.querySelector(".check").onclick = e=>{e.stopPropagation(); toggleDone(x.id);};
  el.onclick = e=>{
    const act = e.target.closest("[data-act]")?.dataset.act;
    if(act==="del"){e.stopPropagation(); delTask(x.id); return;}
    if(act==="focus"){e.stopPropagation(); db.focusId=x.id; save(); renderFocus(); toast("Pinned as focus"); return;}
    if(act==="open"){e.stopPropagation(); openDrawer(x.id); return;}
    openDrawer(x.id);
  };
  el.onkeydown = e=>{ if(e.key==="Enter"){openDrawer(x.id);} if(e.key===" "&&e.target===el){e.preventDefault(); toggleDone(x.id);} };
  el.ondragstart = e=>{e.dataTransfer.setData("text/plain",x.id); el.classList.add("dragging");};
  el.ondragend = ()=>el.classList.remove("dragging");
  el.ondragover = e=>e.preventDefault();
  el.ondrop = e=>{
    e.preventDefault();
    const fromId=e.dataTransfer.getData("text/plain"); if(!fromId||fromId===x.id) return;
    const list = visibleTasks(); const from=list.findIndex(v=>v.id===fromId), to=list.findIndex(v=>v.id===x.id);
    if(from<0||to<0) return;
    const [mv]=list.splice(from,1); list.splice(to,0,mv);
    list.forEach((v,i)=>{const r=db.tasks.find(d=>d.id===v.id); if(r) r.order=i;});
    state.sort="manual"; syncSort(); save(); renderGroups();
  };
  return el;
}
function renderGroups(){
  const box=$("#groups"); box.innerHTML="";
  const groups=groupTasks(visibleTasks());
  groups.forEach((g,gi)=>{
    const sec=document.createElement("section"); sec.className="group"; sec.style.animationDelay=(gi*40)+"ms";
    sec.innerHTML=`<div class="group-head"><h2>${g.color?`<span class="mdot" style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${g.color};margin-right:7px"></span>`:""}${esc(g.title)}</h2><span class="g-count">${g.items.length}</span><span class="g-hint">${esc(g.hint||"")}</span></div>`;
    const list=document.createElement("div"); list.className="task-list";
    if(!g.items.length){
      list.innerHTML=`<div class="empty"><span class="glyph">○</span><strong>${state.view==="today"?"Today is wide open":"Nothing here"}</strong><p>${state.view==="today"?"Add one small win below — future you says thanks.":"Try a different filter, or press N for a new task."}</p></div>`;
    } else g.items.forEach(x=>list.appendChild(taskRow(x)));
    sec.appendChild(list); box.appendChild(sec);
  });
}
function renderComposerDefaults(){
  const sel=$("#composer-project"); const cur=sel.value;
  sel.innerHTML=db.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  if([...sel.options].some(o=>o.value===cur)) sel.value=cur;
}

/* ---------- mutations ---------- */
function addTask(raw, opts={}){
  const title=(raw||"").trim();
  if(!title){ $("#composer-input").focus(); return null; }
  const parsed = parseSmart(title);
  if(!parsed.title){ toast("Give the task a name first"); return null; }
  const maxOrder = db.tasks.reduce((m,x)=>Math.max(m,x.order??0),0);
  const task = {
    id:uid(), title:parsed.title.slice(0,220), notes:"",
    projectId: resolveProject(parsed.projectName, opts.projectId||$("#composer-project").value||db.projects[0]?.id),
    due: parsed.due ?? (opts.due!==undefined?opts.due:($("#composer-date").value||null)),
    priority: parsed.priority ?? +(opts.priority||$("#composer-priority").value||2),
    tags:[], subtasks:[], estimate: parsed.estimate ?? null,
    done:false, doneAt:null, createdAt:Date.now(), order:maxOrder+1
  };
  // if smart-parsed project is new, toast it
  db.tasks.push(task);
  if(!db.focusId) db.focusId=task.id;
  $("#composer-input").value=""; $("#composer-date").value="";
  render();
  toast("Task added", {label:"Undo", fn:()=>{db.tasks=db.tasks.filter(x=>x.id!==task.id); render();}});
  return task;
}
function toggleDone(id){
  const x=db.tasks.find(v=>v.id===id); if(!x) return;
  x.done=!x.done; x.doneAt=x.done?Date.now():null;
  const t=todayISO(); db.history=db.history||{};
  if(x.done){ db.history[t]=(db.history[t]||0)+1; }
  render();
  if(x.done) toast("Done — nice.", {label:"Undo", fn:()=>{x.done=false; x.doneAt=null; render();}});
}
function delTask(id){
  const x=db.tasks.find(v=>v.id===id); if(!x) return;
  db.tasks=db.tasks.filter(v=>v.id!==id);
  if(db.focusId===id) db.focusId=db.tasks.find(v=>!v.done)?.id||null;
  if(state.drawerId===id) closeDrawer();
  render(); toast("Task deleted", {label:"Undo", fn:()=>{db.tasks.push(x); render();}});
}

/* ---------- focus timer ---------- */
function fmtClock(s){ return `${pad(Math.floor(s/60))}:${pad(s%60)}`; }
function renderFocus(){
  const f=db.tasks.find(x=>x.id===db.focusId&&!x.done) || db.tasks.find(x=>!x.done);
  const label=$("#focus-timer-label"), title=$("#focus-title"), btn=$("#focus-toggle"), pulse=$("#focus-pulse");
  label.textContent=fmtClock(state.timer.left);
  title.textContent=f?f.title:"Nothing pinned — pick one task to anchor the day.";
  btn.textContent=state.timer.running?"Pause":"Start";
  pulse.classList.toggle("on", state.timer.running);
  $("#focus-progress span").style.width = ((1-state.timer.left/state.timer.total)*100)+"%";
}
function tick(){
  if(state.timer.left>0){ state.timer.left--; }
  if(state.timer.left<=0){
    clearInterval(state.timer.int); state.timer.running=false;
    toast("Focus session complete — take a breath.");
    try{ new Notification("Cadence", {body:"Focus session complete."}); }catch{}
    state.timer.left=state.timer.total;
  }
  renderFocus();
}

/* ---------- drawer ---------- */
function openDrawer(id){
  state.drawerId=id; const x=db.tasks.find(v=>v.id===id); if(!x) return;
  $("#drawer").hidden=false;
  $("#d-title").value=x.title; $("#d-notes").value=x.notes||"";
  $("#d-project").innerHTML=db.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("#d-project").value=x.projectId||"";
  $("#d-date").value=x.due||""; $("#d-priority").value=String(x.priority); $("#d-est").value=x.estimate??"";
  $("#drawer-meta").textContent=`Created ${new Date(x.createdAt).toLocaleDateString()} · ${x.done?"Completed":"Open"}`;
  paintSubs(x);
  $("#d-title").focus(); $("#d-title").select();
}
function paintSubs(x){
  $("#sub-count").textContent = x.subtasks.length?`· ${x.subtasks.filter(s=>s.done).length}/${x.subtasks.length}`:"";
  const box=$("#d-subs"); box.innerHTML="";
  x.subtasks.forEach(s=>{
    const d=document.createElement("label"); d.className="sub"+(s.done?" done":"");
    d.innerHTML=`<input type="checkbox" ${s.done?"checked":""}/><span>${esc(s.title)}</span><button>×</button>`;
    d.querySelector("input").onchange=e=>{s.done=e.target.checked; persistDrawer(x);};
    d.querySelector("button").onclick=e=>{e.preventDefault(); x.subtasks=x.subtasks.filter(v=>v.id!==s.id); persistDrawer(x);};
    box.appendChild(d);
  });
}
function persistDrawer(x){
  x.title=$("#d-title").value.slice(0,220)||"Untitled";
  x.notes=$("#d-notes").value.slice(0,2000);
  x.projectId=$("#d-project").value||x.projectId;
  x.due=$("#d-date").value||null;
  x.priority=+$("#d-priority").value||2;
  const ev=$("#d-est").value; x.estimate=ev===""?null:Math.max(0,Math.min(960,+ev||0));
  paintSubs(x); render();
}
function closeDrawer(){ $("#drawer").hidden=true; state.drawerId=null; }

/* ---------- command palette ---------- */
function paletteItems(q){
  q=(q||"").toLowerCase().trim();
  const cmds=[
    {label:"New task", hint:"N", run:()=>$("#composer-input").focus()},
    {label:"New project", hint:"+", run:()=>newProject()},
    {label:"Go to Today", hint:"1", run:()=>setView("today")},
    {label:"Go to Next 7 days", hint:"2", run:()=>setView("upcoming")},
    {label:"Go to All tasks", hint:"3", run:()=>setView("all")},
    {label:"Toggle theme", hint:"T", run:()=>toggleTheme()},
    {label:"Clear completed", hint:"⌫", run:()=>clearDone()},
    {label:"Export JSON", hint:"⇪", run:()=>exportJSON()},
  ].filter(c=>!q||c.label.toLowerCase().includes(q));
  const tasks=db.tasks.filter(x=>!q||(x.title+" "+PNAME(x.projectId)).toLowerCase().includes(q)).slice(0,7)
    .map(x=>({label:x.title, hint:dueLabel(x.due), task:x, run:()=>openDrawer(x.id)}));
  return {cmds, tasks};
}
function paintPalette(){
  const q=$("#palette-input").value; const {cmds,tasks}=paletteItems(q);
  const box=$("#palette-list"); box.innerHTML="";
  const add=(item,sel)=>{const b=document.createElement("button"); b.className="p-item"+(sel?" sel":""); b.innerHTML=`<span>${esc(item.label)}</span><span class="k">${esc(item.hint||"")}</span>`; b.onclick=()=>{closePalette(); item.run();}; box.appendChild(b); b._run=item.run; return b;};
  if(cmds.length){box.insertAdjacentHTML("beforeend",`<div class="p-sep">Commands</div>`); cmds.forEach((c,i)=>add(c,i===0&&!tasks.length));}
  if(tasks.length){box.insertAdjacentHTML("beforeend",`<div class="p-sep">Tasks</div>`); tasks.forEach(t=>add(t));}
  if(!cmds.length&&!tasks.length) box.innerHTML=`<div class="empty"><strong>No matches</strong><p>Try a different word, or press Enter to create it as a task.</p></div>`;
  state.paletteIdx=0;
}
function openPalette(){ $("#palette").hidden=false; $("#palette-input").value=""; paintPalette(); setTimeout(()=>$("#palette-input").focus(),30); }
function closePalette(){ $("#palette").hidden=true; }

/* ---------- misc actions ---------- */
function newProject(){
  const name=prompt("Project name"); if(!name||!name.trim()) return;
  db.projects.push({id:uid(), name:name.trim().slice(0,40), color:PROJECT_COLORS[db.projects.length%PROJECT_COLORS.length], createdAt:Date.now()});
  render(); toast("Project created");
}
function clearDone(){
  const n=db.tasks.filter(x=>x.done).length; if(!n){toast("Nothing completed yet");return;}
  const gone=db.tasks.filter(x=>x.done); db.tasks=db.tasks.filter(x=>!x.done);
  render(); toast(`Cleared ${n} done`, {label:"Undo", fn:()=>{db.tasks.push(...gone); render();}});
}
function exportJSON(){
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`cadence-${todayISO()}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function toggleTheme(){
  const cur=document.documentElement.dataset.theme==="dark"?"light":"dark";
  document.documentElement.dataset.theme=cur; try{localStorage.setItem(THEME_KEY,cur);}catch{}
}
function setView(v){ state.view=v; state.projectId=null; syncViews(); render(); closeSidebarMobile(); }
function syncViews(){ $$("#views .view").forEach(b=>b.classList.toggle("is-active", b.dataset.view===state.view && !state.projectId)); }
function syncSort(){ $$("#sort-seg button").forEach(b=>b.classList.toggle("is-active", b.dataset.sort===state.sort)); }
function closeSidebarMobile(){ $("#sidebar").classList.remove("open"); $("#scrim").hidden=true; }

/* ---------- events ---------- */
function bind(){
  // views
  $("#views").addEventListener("click", e=>{const b=e.target.closest(".view"); if(b) setView(b.dataset.view);});
  $("#add-project").onclick=newProject;
  // composer
  $("#composer-go").onclick=()=>addTask($("#composer-input").value);
  $("#composer-check").onclick=()=>addTask($("#composer-input").value);
  $("#composer-input").addEventListener("keydown", e=>{if(e.key==="Enter") addTask(e.target.value);});
  $$(".chip").forEach(c=>c.onclick=()=>{
    const a=c.dataset.attr; const inp=$("#composer-input");
    if(a==="today"||a==="tomorrow"){ inp.value=(inp.value+" "+a).trim()+" "; }
    else if(a.startsWith("p")){ $("#composer-priority").value=a==="p1"?"1":a==="p2"?"2":"3"; inp.value=(inp.value+" "+a).trim()+" "; }
    inp.focus();
  });
  $("#composer-priority").onchange=e=>{ if(!$("#composer-project").value) return; };
  // search / filters
  $("#search").addEventListener("input", e=>{state.query=e.target.value.trim(); renderGroups();});
  $("#filter-priority").onchange=e=>{state.priority=e.target.value; renderGroups();};
  $("#hide-done").onchange=e=>{state.hideDone=e.target.checked; renderGroups();};
  $("#sort-seg").addEventListener("click", e=>{const b=e.target.closest("button"); if(!b) return; state.sort=b.dataset.sort; syncSort(); renderGroups();});
  // focus timer
  $("#focus-toggle").onclick=()=>{
    if(!("Notification" in window)){}
    if(state.timer.running){clearInterval(state.timer.int); state.timer.running=false;}
    else{
      if(state.timer.left<=0) state.timer.left=state.timer.total;
      state.timer.running=true; state.timer.int=setInterval(tick,1000);
    }
    renderFocus();
  };
  $("#focus-reset").onclick=()=>{clearInterval(state.timer.int); state.timer.running=false; state.timer.left=state.timer.total; renderFocus();};
  $("#focus-pick").onclick=openPalette;
  // drawer
  $("#drawer-close").onclick=()=>{const x=db.tasks.find(v=>v.id===state.drawerId); if(x) persistDrawer(x); closeDrawer();};
  ["d-title","d-notes","d-project","d-date","d-priority","d-est"].forEach(id=>{
    $("#"+id).addEventListener("change", ()=>{const x=db.tasks.find(v=>v.id===state.drawerId); if(x) persistDrawer(x);});
  });
  $("#d-sub-input").addEventListener("keydown", e=>{
    if(e.key!=="Enter") return; const v=e.target.value.trim(); if(!v) return;
    const x=db.tasks.find(vv=>vv.id===state.drawerId); if(!x) return;
    x.subtasks.push({id:uid(), title:v.slice(0,140), done:false}); e.target.value=""; persistDrawer(x);
  });
  $("#d-delete").onclick=()=>{if(state.drawerId) delTask(state.drawerId);};
  $("#d-duplicate").onclick=()=>{
    const x=db.tasks.find(v=>v.id===state.drawerId); if(!x) return;
    const c={...JSON.parse(JSON.stringify(x)), id:uid(), title:x.title+" (copy)", done:false, doneAt:null, order:(x.order??0)+0.5, createdAt:Date.now()};
    db.tasks.push(c); db.tasks.sort((a,b)=>(a.order??0)-(b.order??0)).forEach((v,i)=>v.order=i);
    render(); openDrawer(c.id);
  };
  $("#d-done").onclick=()=>{const x=db.tasks.find(v=>v.id===state.drawerId); if(x) persistDrawer(x); closeDrawer();};
  // footer
  $("#export-btn").onclick=exportJSON; $("#export-link").onclick=exportJSON;
  $("#clear-done").onclick=clearDone;
  $("#import-link").onclick=()=>$("#import-file").click();
  $("#import-file").onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{try{const d=JSON.parse(r.result); if(!Array.isArray(d.tasks)) throw 0; db=d; render(); toast("Imported");}catch{toast("Import failed — invalid file");}};
    r.readAsText(f); e.target.value="";
  };
  $("#reset-btn").onclick=()=>{if(confirm("Reset to demo data?")){db=seed(); state.view="today"; state.projectId=null; syncViews(); render(); toast("Fresh start");}};
  // theme
  $("#theme-toggle").onclick=toggleTheme; $("#theme-toggle-2").onclick=toggleTheme;
  // palette
  $("#open-palette").onclick=openPalette;
  $("#search").addEventListener("focus", ()=>{ /* inline filter stays; palette via ⌘K */ });
  $("#palette-input").addEventListener("input", paintPalette);
  $("#palette-input").addEventListener("keydown", e=>{
    const items=$$("#palette-list .p-item");
    if(e.key==="Escape") closePalette();
    if(e.key==="Enter"){
      if(items.length){ items[Math.min(state.paletteIdx,items.length-1)].click(); }
      else if(e.target.value.trim()){ closePalette(); addTask(e.target.value.trim()); }
    }
    if(e.key==="ArrowDown"){e.preventDefault(); state.paletteIdx=Math.min(state.paletteIdx+1,items.length-1); items.forEach((b,i)=>b.classList.toggle("sel",i===state.paletteIdx)); items[state.paletteIdx]?.scrollIntoView({block:"nearest"});}
    if(e.key==="ArrowUp"){e.preventDefault(); state.paletteIdx=Math.max(state.paletteIdx-1,0); items.forEach((b,i)=>b.classList.toggle("sel",i===state.paletteIdx));}
  });
  $("#palette").addEventListener("click", e=>{if(e.target.id==="palette") closePalette();});
  // sidebar mobile
  $("#open-sidebar").onclick=()=>{$("#sidebar").classList.add("open"); $("#scrim").hidden=false;};
  $("#close-sidebar").onclick=closeSidebarMobile;
  $("#scrim").onclick=closeSidebarMobile;
  // keyboard
  document.addEventListener("keydown", e=>{
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"");
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault(); $("#palette").hidden?openPalette():closePalette();}
    if(e.key==="Escape"){ if(!$("#palette").hidden) closePalette(); else if(!$("#drawer").hidden) $("#drawer-close").click(); else closeSidebarMobile(); }
    if(typing) return;
    if(e.key==="n"||e.key==="N"){e.preventDefault(); $("#composer-input").focus(); window.scrollTo({top:0,behavior:"smooth"});}
    if(e.key==="/"){e.preventDefault(); openPalette();}
    if(e.key.toLowerCase()==="t"&&!e.metaKey&&!e.ctrlKey){toggleTheme();}
    if(e.key==="1"&&!typing) setView("today");
    if(e.key==="2"&&!typing) setView("upcoming");
    if(e.key==="3"&&!typing) setView("all");
  });
  document.addEventListener("click", e=>{ if(!e.target.closest(".sidebar")&&!e.target.closest("#open-sidebar")){} });
}

/* ---------- init ---------- */
try{ const th=localStorage.getItem(THEME_KEY); if(th) document.documentElement.dataset.theme=th;
  else if(matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme="dark";
}catch{}
bind(); syncViews(); syncSort(); render();
try{ if("Notification" in window && Notification.permission==="default"){ /* ask lazily on first focus start */ } }catch{}
})();
