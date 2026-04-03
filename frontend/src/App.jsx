import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, FileText, Users, Bot, Play, ListOrdered, CheckSquare, Brain, Link, BarChart3, Shield, Clock, Key, AlertTriangle, BookOpen, RefreshCw, X, Check, Zap, Loader, Eye, Trash2, Database, Activity, Globe } from "lucide-react";

const API = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { headers: {"Content-Type":"application/json"}, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}
const LANE_COLORS = {"System / Infrastructure":"#6366f1","SEO Operations":"#10b981","Paid Acquisition and Conversion":"#f59e0b","Website Content, UX, and Design":"#3b82f6","Local Authority, Reviews, and GBP":"#8b5cf6","Innovation and Competitive Edge":"#ec4899","Social Publishing and Engagement":"#06b6d4","Reporting":"#84cc16"};
const RB = {owner:{bg:"#fef3c7",color:"#92400e",label:"Owner"},worker:{bg:"#dbeafe",color:"#1e40af",label:"Worker"},validator:{bg:"#d1fae5",color:"#065f46",label:"Validator"}};
const SC = {success:"#10b981",failed:"#ef4444",running:"#3b82f6",pending_approval:"#f59e0b",dry_run:"#8b5cf6",queued:"#6b7280",executed:"#10b981",cancelled:"#9ca3af",blocked_dependency:"#f97316",open:"#ef4444",investigating:"#f59e0b",resolved:"#10b981",dismissed:"#9ca3af",pending:"#f59e0b",approved:"#10b981",rejected:"#ef4444"};

function Badge({text,color,bg}){return <span style={{background:bg||"#f3f4f6",color:color||"#374151",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{text}</span>;}
function Dot({s}){return <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:SC[s]||"#9ca3af",flexShrink:0}}/>;}
function Card({children,style}){return <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:20,...style}}>{children}</div>;}
function Btn({children,onClick,color="#4f46e5",disabled,small,danger,secondary,style}){const bg=danger?"#ef4444":secondary?"#f9fafb":color;return <button onClick={onClick} disabled={disabled} style={{background:disabled?"#e5e7eb":bg,color:disabled?"#9ca3af":secondary?"#374151":"#fff",border:secondary?"1px solid #d1d5db":"none",borderRadius:6,padding:small?"4px 10px":"7px 14px",fontSize:small?12:13,fontWeight:600,cursor:disabled?"not-allowed":"pointer",display:"inline-flex",alignItems:"center",gap:5,...style}}>{children}</button>;}
function KpiCard({label,value,target,color="#4f46e5",sub}){return <Card style={{textAlign:"center",padding:"18px 12px"}}><div style={{fontSize:28,fontWeight:800,color}}>{value??"—"}</div>{target&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>Target: {target}</div>}<div style={{fontSize:12,color:"#6b7280",marginTop:4}}>{label}</div>{sub&&<div style={{fontSize:11,color:"#9ca3af"}}>{sub}</div>}</Card>;}
function Spin(){return <Loader size={16} style={{animation:"spin 1s linear infinite"}}/>;}
function Empty({icon:I,msg}){return <div style={{textAlign:"center",padding:"40px 20px",color:"#9ca3af"}}><I size={32} style={{marginBottom:10,opacity:0.5}}/><div style={{fontSize:14}}>{msg}</div></div>;}
function Json({data}){const[o,sO]=useState(false);return<div><Btn secondary small onClick={()=>sO(!o)} style={{marginTop:8}}><Eye size={12}/>{o?"Hide":"View"} Output</Btn>{o&&<pre style={{background:"#0f172a",color:"#e2e8f0",padding:16,borderRadius:8,fontSize:11,overflow:"auto",maxHeight:400,marginTop:8,direction:"ltr",textAlign:"left"}}>{JSON.stringify(data,null,2)}</pre>}</div>;}
function SH({title,sub,action}){return<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}><div><h2 style={{fontSize:20,fontWeight:700,color:"#111827",margin:0}}>{title}</h2>{sub&&<p style={{fontSize:13,color:"#6b7280",margin:"4px 0 0"}}>{sub}</p>}</div>{action}</div>;}

function Dashboard({clientId,clients}){
  const[stats,sS]=useState(null);const[bl,sBl]=useState([]);const[runs,sR]=useState([]);const[inc,sI]=useState([]);const[load,sL]=useState(false);
  const fetch_data=useCallback(async()=>{if(!clientId)return;sL(true);try{const[s,b,r,i]=await Promise.all([api(`/clients/${clientId}/stats`),api(`/clients/${clientId}/baselines`),api(`/clients/${clientId}/runs?limit=10`),api(`/clients/${clientId}/incidents?status=open`)]);sS(s);sBl(b);sR(r);sI(i);}catch(e){console.error(e);}sL(false);},[clientId]);
  useEffect(()=>{fetch_data();},[fetch_data]);
  if(!clientId)return<Empty icon={Users} msg="Select a client to view dashboard"/>;
  const client=clients.find(c=>c.id===clientId);
  const bm=Object.fromEntries(bl.map(b=>[b.metric_name,b]));
  return<div>
    <SH title={client?.name||"Dashboard"} sub={client?.domain} action={<Btn onClick={fetch_data} small secondary><RefreshCw size={12}/>Refresh</Btn>}/>
    {load?<div style={{textAlign:"center",padding:40}}><Spin/></div>:<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <KpiCard label="Google Reviews" value={bm.google_reviews_count?.metric_value} target={bm.google_reviews_count?.target_value} color="#f59e0b"/>
        <KpiCard label="LawReviews" value={bm.lawreviews_count?.metric_value||218} sub={`★ ${bm.lawreviews_rating?.metric_value||"5.0"}`} color="#10b981"/>
        <KpiCard label="Mobile PageSpeed" value={bm.mobile_pagespeed?.metric_value} target={bm.mobile_pagespeed?.target_value} color={(bm.mobile_pagespeed?.metric_value||0)>=80?"#10b981":"#ef4444"} sub="/100"/>
        <KpiCard label="Page 1 Keywords" value={bm.page1_keyword_count?.metric_value??0} target={bm.page1_keyword_count?.target_value} color="#6366f1"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <KpiCard label="Local 3-Pack" value={bm.local_3pack_present?.metric_value===1?"✓ Yes":"✗ No"} color={bm.local_3pack_present?.metric_value===1?"#10b981":"#ef4444"}/>
        <KpiCard label="Indexed Pages" value={bm.indexed_pages?.metric_value} target={bm.indexed_pages?.target_value} color="#3b82f6"/>
        <KpiCard label="Referring Domains" value={bm.referring_domains_count?.metric_value} target={bm.referring_domains_count?.target_value} color="#8b5cf6"/>
        <KpiCard label="Domain Authority" value={bm.domain_authority?.metric_value} target={bm.domain_authority?.target_value} color="#06b6d4"/>
      </div>
      {stats&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <Card style={{padding:"14px 16px"}}><div style={{fontSize:11,color:"#9ca3af"}}>7-Day Runs</div><div style={{fontSize:22,fontWeight:700}}>{stats.run_stats?.total_runs??0}</div></Card>
        <Card style={{padding:"14px 16px"}}><div style={{fontSize:11,color:"#9ca3af"}}>Success Rate</div><div style={{fontSize:22,fontWeight:700,color:"#10b981"}}>{stats.run_stats?.success_rate??0}%</div></Card>
        <Card style={{padding:"14px 16px"}}><div style={{fontSize:11,color:"#9ca3af"}}>Open Incidents</div><div style={{fontSize:22,fontWeight:700,color:inc.length>0?"#ef4444":"#10b981"}}>{inc.length}</div></Card>
        <Card style={{padding:"14px 16px"}}><div style={{fontSize:11,color:"#9ca3af"}}>Memory Items</div><div style={{fontSize:22,fontWeight:700,color:"#6366f1"}}>{stats.memory_count??0}</div></Card>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card><div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Recent Runs</div>
          {runs.slice(0,8).map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #f3f4f6"}}><Dot s={r.status}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.agent_templates?.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>{new Date(r.created_at).toLocaleString()}</div></div><Badge text={r.status} color={SC[r.status]} bg={SC[r.status]+"22"}/></div>)}
          {runs.length===0&&<div style={{fontSize:12,color:"#9ca3af",padding:"10px 0"}}>No runs yet</div>}
        </Card>
        <Card><div style={{fontSize:14,fontWeight:600,marginBottom:14}}>Open Incidents</div>
          {inc.slice(0,6).map(i=><div key={i.id} style={{padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}><div style={{display:"flex",gap:6}}><Badge text={i.severity} color={i.severity==="critical"?"#ef4444":"#f59e0b"} bg={i.severity==="critical"?"#fee2e2":"#fef3c7"}/><span style={{fontSize:12,fontWeight:600,flex:1}}>{i.title}</span></div></div>)}
          {inc.length===0&&<div style={{fontSize:12,color:"#10b981",padding:"10px 0"}}>✓ No open incidents</div>}
        </Card>
      </div>
    </>}
  </div>;
}

function AgentsView({clientId}){
  const[al,sAl]=useState({});const[sel,sSel]=useState(null);const[load,sL]=useState(false);
  useEffect(()=>{if(!clientId)return;sL(true);api(`/clients/${clientId}/agents`).then(sAl).catch(console.error).finally(()=>sL(false));},[clientId]);
  if(!clientId)return<Empty icon={Bot} msg="Select a client to view agents"/>;
  const lanes=Object.keys(al).sort();
  return<div>
    <SH title="Agents" sub={`${lanes.reduce((s,l)=>s+al[l].length,0)} agents across ${lanes.length} lanes`}/>
    {load?<div style={{textAlign:"center",padding:40}}><Spin/></div>:(
      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20}}>
        <div>{lanes.map(lane=><div key={lane} style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:LANE_COLORS[lane]||"#6b7280",marginBottom:6}}>{lane.toUpperCase()}</div>
          {al[lane].map(a=>{const r=RB[a.role_type]||{};return<div key={a.id} onClick={()=>sSel(sel?.id===a.id?null:a)} style={{padding:"10px 12px",borderRadius:8,cursor:"pointer",marginBottom:4,border:"1px solid",borderColor:sel?.id===a.id?(LANE_COLORS[lane]||"#6366f1"):"#e5e7eb",background:sel?.id===a.id?(LANE_COLORS[lane]+"11"):"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,fontWeight:600}}>{a.name}</span><Badge text={r.label} color={r.color} bg={r.bg}/></div>
            {a.assignment?.last_run_at&&<div style={{fontSize:10,color:"#9ca3af",marginTop:3}}>Last: {new Date(a.assignment.last_run_at).toLocaleDateString()}</div>}
          </div>;})}</div>)}
        </div>
        {sel?<Card>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><div><h3 style={{fontSize:18,fontWeight:700,margin:0}}>{sel.name}</h3><div style={{fontSize:12,color:"#6b7280",marginTop:4}}>{sel.lane} · {sel.slug}</div></div><div style={{display:"flex",gap:6}}><Badge text={RB[sel.role_type]?.label} color={RB[sel.role_type]?.color} bg={RB[sel.role_type]?.bg}/><Badge text={sel.action_mode_default} color="#374151" bg="#f3f4f6"/></div></div>
          <p style={{fontSize:13,color:"#4b5563",marginBottom:16,lineHeight:1.6}}>{sel.description}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>{[["Model",sel.model],["Cooldown",`${sel.cooldown_minutes}m`],["Max Tokens",sel.max_tokens]].map(([l,v])=><div key={l} style={{background:"#f9fafb",borderRadius:6,padding:"10px 12px"}}><div style={{fontSize:10,color:"#9ca3af"}}>{l}</div><div style={{fontSize:12,fontWeight:600}}>{v}</div></div>)}</div>
          {sel.do_rules?.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:600,color:"#065f46",marginBottom:6}}>DO Rules</div>{sel.do_rules.map((r,i)=><div key={i} style={{fontSize:12,padding:"3px 0"}}>✓ {r}</div>)}</div>}
          {sel.dont_rules?.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:600,color:"#991b1b",marginBottom:6}}>DON'T Rules</div>{sel.dont_rules.map((r,i)=><div key={i} style={{fontSize:12,padding:"3px 0"}}>✗ {r}</div>)}</div>}
          <div><div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Base Prompt</div><div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,padding:12,fontSize:11,color:"#475569",maxHeight:200,overflow:"auto",lineHeight:1.6,direction:"ltr",textAlign:"left",fontFamily:"monospace",whiteSpace:"pre-wrap"}}>{sel.base_prompt}</div></div>
        </Card>:<Card><Empty icon={Bot} msg="Click an agent to view details"/></Card>}
      </div>
    )}
  </div>;
}

function RunsView({clientId}){
  const[agents,sA]=useState({});const[runs,sR]=useState([]);const[selAgent,sSA]=useState("");const[selLane,sSL]=useState("");const[running,sRun]=useState(false);const[result,sRes]=useState(null);const[dry,sDry]=useState(false);const[selRun,sSR]=useState(null);
  const lanes=Object.keys(agents).sort();
  useEffect(()=>{if(!clientId)return;Promise.all([api(`/clients/${clientId}/agents`),api(`/clients/${clientId}/runs`)]).then(([a,r])=>{sA(a);sR(r);}).catch(console.error);},[clientId]);
  const exec=async(mode)=>{
    sRun(true);sRes(null);
    try{
      let res;
      if(mode==="single"){if(!selAgent){alert("Select agent");sRun(false);return;}res=await api("/runs/execute",{method:"POST",body:{clientId,agentTemplateId:selAgent,isDryRun:dry}});}
      else if(mode==="lane"){if(!selLane){alert("Select lane");sRun(false);return;}res=await api("/runs/run-lane",{method:"POST",body:{clientId,laneName:selLane}});}
      else res=await api("/runs/run-all",{method:"POST",body:{clientId}});
      sRes(res);sR(await api(`/clients/${clientId}/runs`));
    }catch(e){sRes({error:e.message});}
    sRun(false);
  };
  if(!clientId)return<Empty icon={Play} msg="Select a client to run agents"/>;
  return<div>
    <SH title="Run Control" sub="Execute agents individually, by lane, or all at once"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
      <Card>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Run Single Agent</div>
        <select value={selAgent} onChange={e=>sSA(e.target.value)} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"7px 10px",fontSize:13,marginBottom:10}}>
          <option value="">Select agent...</option>
          {lanes.map(lane=><optgroup key={lane} label={lane}>{agents[lane].map(a=><option key={a.id} value={a.id}>{a.name} [{a.role_type}]</option>)}</optgroup>)}
        </select>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",marginBottom:10}}><input type="checkbox" checked={dry} onChange={e=>sDry(e.target.checked)}/>Dry Run (preview only)</label>
        <Btn onClick={()=>exec("single")} disabled={running||!selAgent}>{running?<Spin/>:<Play size={13}/>}{dry?"Dry Run":"Run Agent"}</Btn>
      </Card>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <Card>
          <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Run Lane</div>
          <select value={selLane} onChange={e=>sSL(e.target.value)} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"7px 10px",fontSize:13,marginBottom:10}}><option value="">Select lane...</option>{lanes.map(l=><option key={l} value={l}>{l} ({agents[l].length})</option>)}</select>
          <Btn onClick={()=>exec("lane")} disabled={running||!selLane} color="#059669">{running?<Spin/>:<Zap size={13}/>}Run Lane</Btn>
        </Card>
        <Card>
          <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>Run All Agents</div>
          <div style={{fontSize:12,color:"#6b7280",marginBottom:10}}>Queues all enabled agents in order</div>
          <Btn onClick={()=>exec("all")} disabled={running} color="#7c3aed">{running?<Spin/>:<Activity size={13}/>}Run All</Btn>
        </Card>
      </div>
    </div>
    {result&&<Card style={{marginBottom:20,borderColor:result.error?"#fca5a5":"#86efac",background:result.error?"#fef2f2":"#f0fdf4"}}>
      <div style={{fontSize:13,fontWeight:600,color:result.error?"#991b1b":"#065f46"}}>{result.error?`Error: ${result.error}`:result.queued?`✓ Queued ${result.queued} agents`:"✓ Run complete"}</div>
      {result.output&&<Json data={result.output}/>}
    </Card>}
    <Card>
      <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Recent Runs</div>
      {runs.map(r=><div key={r.id} onClick={()=>sSR(selRun?.id===r.id?null:r)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:selRun?.id===r.id?"#f5f3ff":"#fff",borderRadius:6,cursor:"pointer",border:selRun?.id===r.id?"1px solid #7c3aed":"1px solid transparent"}}>
        <Dot s={r.status}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.agent_templates?.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>{new Date(r.created_at).toLocaleString()} · {r.tokens_used?`${r.tokens_used} tok`:""}</div></div>
        <Badge text={r.status} color={SC[r.status]} bg={SC[r.status]+"22"}/>
      </div>)}
      {runs.length===0&&<Empty icon={Play} msg="No runs yet"/>}
    </Card>
    {selRun&&<Card style={{marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><div style={{fontSize:14,fontWeight:700}}>Run: {selRun.agent_templates?.name}</div><Btn secondary small onClick={()=>sSR(null)}><X size={12}/></Btn></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>{[["Status",selRun.status],["Tokens",selRun.tokens_used],["Duration",selRun.duration_ms?`${selRun.duration_ms}ms`:"—"],["Changed",selRun.changed_anything?"Yes":"No"]].map(([l,v])=><div key={l} style={{background:"#f9fafb",borderRadius:6,padding:"8px 10px"}}><div style={{fontSize:10,color:"#9ca3af"}}>{l}</div><div style={{fontSize:12,fontWeight:600}}>{v??"—"}</div></div>)}</div>
      {selRun.error&&<div style={{background:"#fee2e2",color:"#991b1b",padding:10,borderRadius:6,fontSize:12,marginBottom:12}}>{selRun.error}</div>}
      {selRun.output&&<Json data={selRun.output}/>}
    </Card>}
  </div>;
}

function QueueView({clientId}){
  const[queue,sQ]=useState([]);const[loading,sL]=useState(false);const[proc,sP]=useState(false);
  const load=async()=>{if(!clientId)return;sL(true);try{sQ(await api(`/queue?clientId=${clientId}`));}catch(e){console.error(e);}sL(false);};
  useEffect(()=>{load();},[clientId]);
  if(!clientId)return<Empty icon={ListOrdered} msg="Select a client to view queue"/>;
  const byS=queue.reduce((a,q)=>{a[q.status]=(a[q.status]||0)+1;return a;},{});
  return<div>
    <SH title="Run Queue" sub={`${queue.length} items`} action={<div style={{display:"flex",gap:8}}><Btn onClick={load} small secondary><RefreshCw size={12}/></Btn><Btn onClick={async()=>{sP(true);await api("/queue/process",{method:"POST"});await load();sP(false);}} disabled={proc} small>{proc?<Spin/>:<Zap size={12}/>}Process</Btn></div>}/>
    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>{Object.entries(byS).map(([s,c])=><div key={s} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:6,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}><Dot s={s}/><span style={{fontSize:12,fontWeight:600}}>{s} ({c})</span></div>)}</div>
    <Card>{loading?<div style={{textAlign:"center",padding:30}}><Spin/></div>:queue.length===0?<Empty icon={ListOrdered} msg="Queue is empty"/>:queue.map(item=><div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid #f3f4f6"}}>
      <Dot s={item.status}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{item.agent_templates?.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>{new Date(item.created_at).toLocaleString()} · by {item.queued_by}</div>{item.error&&<div style={{fontSize:11,color:"#ef4444"}}>{item.error}</div>}</div>
      <Badge text={item.status} color={SC[item.status]} bg={SC[item.status]+"22"}/>
      {item.status==="queued"&&<Btn danger small onClick={async()=>{await api(`/queue/${item.id}`,{method:"DELETE"});await load();}}><X size={11}/></Btn>}
    </div>)}</Card>
  </div>;
}

function ApprovalsView({clientId}){
  const[app,sA]=useState([]);const[load,sL]=useState(false);
  const fetch_a=async()=>{if(!clientId)return;sL(true);try{sA(await api(`/clients/${clientId}/approvals`));}catch(e){console.error(e);}sL(false);};
  useEffect(()=>{fetch_a();},[clientId]);
  if(!clientId)return<Empty icon={CheckSquare} msg="Select a client to view approvals"/>;
  const pending=app.filter(a=>a.status==="pending");const resolved=app.filter(a=>a.status!=="pending");
  return<div>
    <SH title="Approvals" sub={`${pending.length} pending`} action={<Btn small secondary onClick={fetch_a}><RefreshCw size={12}/></Btn>}/>
    {load?<div style={{textAlign:"center",padding:30}}><Spin/></div>:<>
      {pending.map(a=><Card key={a.id} style={{marginBottom:12,borderColor:"#fde68a"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div><div style={{fontSize:14,fontWeight:700}}>{a.agent_templates?.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>{new Date(a.created_at).toLocaleString()}</div></div><Badge text="pending" color="#92400e" bg="#fef3c7"/></div>
        <div style={{fontSize:13,color:"#374151",marginBottom:12}}>{a.what_needs_approval}</div>
        {a.proposed_action&&<div style={{background:"#f9fafb",borderRadius:6,padding:10,fontSize:12,color:"#4b5563",marginBottom:12}}>{a.proposed_action}</div>}
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={async()=>{await api(`/approvals/${a.id}/approve`,{method:"POST",body:{approvedBy:"admin"}});await fetch_a();}} color="#059669"><Check size={13}/>Approve & Resume</Btn>
          <Btn danger onClick={async()=>{const r=prompt("Reason:");if(!r)return;await api(`/approvals/${a.id}/reject`,{method:"POST",body:{reason:r}});await fetch_a();}}><X size={13}/>Reject</Btn>
        </div>
      </Card>)}
      <Card><div style={{fontSize:14,fontWeight:600,marginBottom:14}}>History</div>
        {resolved.slice(0,20).map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}><Dot s={a.status}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{a.agent_templates?.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>{a.what_needs_approval?.slice(0,80)}</div></div><Badge text={a.status} color={SC[a.status]} bg={SC[a.status]+"22"}/></div>)}
        {resolved.length===0&&<div style={{fontSize:12,color:"#9ca3af"}}>No history</div>}
      </Card>
    </>}
  </div>;
}

function MemoryView({clientId}){
  const[mem,sM]=useState([]);const[filter,sF]=useState({scope:"",stale:""});const[adding,sAdd]=useState(false);const[ni,sNi]=useState({scope:"general",type:"fact",content:"",tags:""});
  const scopes=["general","seo","reviews","performance","content","competitors","technical_debt","ads","social","backlinks","strategy","local_seo"];
  const load=async()=>{if(!clientId)return;let url=`/clients/${clientId}/memory?`;if(filter.scope)url+=`scope=${filter.scope}&`;if(filter.stale)url+=`stale=${filter.stale}&`;try{sM(await api(url));}catch(e){console.error(e);}};
  useEffect(()=>{load();},[clientId,filter.scope,filter.stale]);
  if(!clientId)return<Empty icon={Brain} msg="Select a client to view memory"/>;
  return<div>
    <SH title="Memory" sub={`${mem.length} items`} action={<Btn small onClick={()=>sAdd(!adding)}>{adding?"Cancel":"+ Add"}</Btn>}/>
    {adding&&<Card style={{marginBottom:20,borderColor:"#c7d2fe"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <select value={ni.scope} onChange={e=>sNi({...ni,scope:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13}}>{scopes.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <select value={ni.type} onChange={e=>sNi({...ni,type:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13}}>{["fact","goal","constraint","preference","status","insight","warning","achievement"].map(t=><option key={t} value={t}>{t}</option>)}</select>
      </div>
      <textarea value={ni.content} onChange={e=>sNi({...ni,content:e.target.value})} placeholder="Memory content..." rows={3} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"8px 10px",fontSize:13,resize:"vertical",marginBottom:10,fontFamily:"inherit"}}/>
      <input value={ni.tags} onChange={e=>sNi({...ni,tags:e.target.value})} placeholder="Tags (comma separated)" style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13,marginBottom:10}}/>
      <Btn onClick={async()=>{if(!ni.content)return;await api(`/clients/${clientId}/memory`,{method:"POST",body:{...ni,tags:ni.tags.split(",").map(t=>t.trim()).filter(Boolean)}});sAdd(false);sNi({scope:"general",type:"fact",content:"",tags:""});await load();}}><Check size={13}/>Add</Btn>
    </Card>}
    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <select value={filter.scope} onChange={e=>sF({...filter,scope:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:12}}><option value="">All scopes</option>{scopes.map(s=><option key={s} value={s}>{s}</option>)}</select>
      <select value={filter.stale} onChange={e=>sF({...filter,stale:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:12}}><option value="">All</option><option value="false">Active</option><option value="true">Stale</option></select>
    </div>
    <div style={{display:"grid",gap:8}}>
      {mem.map(item=><Card key={item.id} style={{padding:"12px 16px",opacity:item.is_stale?0.6:1,borderColor:item.is_stale?"#fca5a5":"#e5e7eb"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <div style={{display:"flex",gap:6}}><Badge text={item.scope} color="#4f46e5" bg="#eef2ff"/><Badge text={item.type} color="#374151" bg="#f3f4f6"/>{item.is_stale&&<Badge text="stale" color="#991b1b" bg="#fee2e2"/>}<span style={{fontSize:10,color:"#9ca3af"}}>×{item.times_used}</span></div>
          <div style={{display:"flex",gap:4}}>
            <Btn secondary small onClick={async()=>{await api(`/memory/${item.id}`,{method:"PATCH",body:{is_stale:!item.is_stale}});await load();}} style={{fontSize:11}}>{item.is_stale?"Restore":"Stale"}</Btn>
            <Btn danger small onClick={async()=>{if(!confirm("Delete?"))return;await api(`/memory/${item.id}`,{method:"DELETE"});await load();}}><Trash2 size={11}/></Btn>
          </div>
        </div>
        <div style={{fontSize:13,color:"#1f2937",lineHeight:1.6,direction:"rtl",textAlign:"right"}}>{item.content}</div>
        {item.tags?.length>0&&<div style={{marginTop:6,display:"flex",gap:4,flexWrap:"wrap"}}>{item.tags.map(t=><span key={t} style={{fontSize:10,background:"#f3f4f6",padding:"2px 6px",borderRadius:4,color:"#6b7280"}}>{t}</span>)}</div>}
      </Card>)}
      {mem.length===0&&<Empty icon={Brain} msg="No memory items yet"/>}
    </div>
  </div>;
}

function SeoView({clientId}){
  const[tab,sTab]=useState("keywords");const[data,sData]=useState({keywords:[],backlinks:[],referringDomains:[],linkGap:[],recommendations:[],syncLog:[]});const[load,sL]=useState(false);const[syncing,sSyn]=useState(false);const[sheetUrl,sSU]=useState("");const[syncType,sST]=useState("backlinks");const[genRecs,sGR]=useState(false);
  const tabs=["keywords","backlinks","referring-domains","link-gap","recommendations","sheets-sync"];
  const fetch_all=async()=>{if(!clientId)return;sL(true);try{const[kw,bl,rd,lg,rec,log]=await Promise.all([api(`/clients/${clientId}/keywords`),api(`/clients/${clientId}/backlinks`),api(`/clients/${clientId}/referring-domains`),api(`/clients/${clientId}/link-gap`),api(`/clients/${clientId}/link-recommendations`),api(`/clients/${clientId}/sync-log`)]);sData({keywords:kw,backlinks:bl,referringDomains:rd,linkGap:lg,recommendations:rec,syncLog:log});}catch(e){console.error(e);}sL(false);};
  useEffect(()=>{fetch_all();},[clientId]);
  if(!clientId)return<Empty icon={Link} msg="Select a client to view SEO data"/>;
  const ts=(t)=>({padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t?"#4f46e5":"#f3f4f6",color:tab===t?"#fff":"#374151",border:"none"});
  const TH=({children})=><th style={{padding:"8px 10px",textAlign:"left",fontWeight:600,color:"#374151",borderBottom:"1px solid #e5e7eb",background:"#f9fafb"}}>{children}</th>;
  const TD=({children,style})=><td style={{padding:"8px 10px",...style}}>{children}</td>;
  return<div>
    <SH title="SEO & Link Intelligence" sub="Rankings, backlinks, gaps, AI recommendations" action={<Btn small secondary onClick={fetch_all}><RefreshCw size={12}/></Btn>}/>
    <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{tabs.map(t=><button key={t} style={ts(t)} onClick={()=>sTab(t)}>{t.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</button>)}</div>
    {load?<div style={{textAlign:"center",padding:40}}><Spin/></div>:<>
      {tab==="keywords"&&<Card><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><TH>Keyword</TH><TH>Position</TH><TH>Volume</TH><TH>Difficulty</TH><TH>Cluster</TH></tr></thead><tbody>
        {data.keywords.map(kw=><tr key={kw.id} style={{borderBottom:"1px solid #f3f4f6"}}><TD style={{fontWeight:600,direction:"rtl"}}>{kw.keyword}</TD><TD>{kw.current_position?<Badge text={`#${kw.current_position}`} color={kw.current_position<=10?"#065f46":"#92400e"} bg={kw.current_position<=10?"#d1fae5":"#fef3c7"}/>:<span style={{color:"#9ca3af"}}>—</span>}</TD><TD>{kw.volume?.toLocaleString()||"—"}</TD><TD><div style={{height:4,background:"#e5e7eb",borderRadius:2,width:60}}><div style={{height:4,borderRadius:2,background:kw.difficulty>60?"#ef4444":kw.difficulty>40?"#f59e0b":"#10b981",width:`${kw.difficulty||0}%`}}/></div></TD><TD style={{fontSize:11,direction:"rtl"}}>{kw.cluster||"—"}</TD></tr>)}
      </tbody></table></div></Card>}
      {tab==="backlinks"&&<Card><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><TH>Source Domain</TH><TH>DA</TH><TH>Anchor</TH><TH>Type</TH></tr></thead><tbody>
        {data.backlinks.map(b=><tr key={b.id} style={{borderBottom:"1px solid #f3f4f6"}}><TD style={{fontWeight:600}}>{b.source_domain}</TD><TD><Badge text={Math.round(b.domain_authority)} color={b.domain_authority>=50?"#065f46":"#374151"} bg={b.domain_authority>=50?"#d1fae5":"#f3f4f6"}/></TD><TD style={{color:"#6b7280"}}>{b.anchor_text||"—"}</TD><TD><Badge text={b.is_dofollow?"dofollow":"nofollow"} color={b.is_dofollow?"#065f46":"#6b7280"} bg={b.is_dofollow?"#d1fae5":"#f3f4f6"}/></TD></tr>)}
      </tbody></table>{data.backlinks.length===0&&<Empty icon={Link} msg="No backlinks — import from Google Sheets"/>}</div></Card>}
      {tab==="referring-domains"&&<Card><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><TH>Domain</TH><TH>DA</TH><TH>Links</TH></tr></thead><tbody>
        {data.referringDomains.map(d=><tr key={d.id} style={{borderBottom:"1px solid #f3f4f6"}}><TD style={{fontWeight:600}}>{d.domain}</TD><TD><Badge text={Math.round(d.domain_authority)} color="#374151" bg="#f3f4f6"/></TD><TD>{d.backlink_count}</TD></tr>)}
      </tbody></table>{data.referringDomains.length===0&&<Empty icon={Globe} msg="No referring domains"/>}</Card>}
      {tab==="link-gap"&&<Card><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><TH>Domain</TH><TH>DA</TH><TH>Competitor</TH><TH>Status</TH></tr></thead><tbody>
        {data.linkGap.map(g=><tr key={g.id} style={{borderBottom:"1px solid #f3f4f6"}}><TD style={{fontWeight:600}}>{g.domain}</TD><TD><Badge text={Math.round(g.domain_authority)} color="#374151" bg="#f3f4f6"/></TD><TD style={{color:"#6b7280"}}>{g.competitor_domain}</TD><TD><Badge text={g.status} color="#374151" bg="#f3f4f6"/></TD></tr>)}
      </tbody></table>{data.linkGap.length===0&&<Empty icon={Link} msg="No gap data — import from Sheets"/>}</Card>}
      {tab==="recommendations"&&<div>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><Btn onClick={async()=>{sGR(true);try{await api(`/clients/${clientId}/link-recommendations/generate`,{method:"POST"});await fetch_all();}catch(e){alert(e.message);}sGR(false);}} disabled={genRecs} color="#7c3aed">{genRecs?<Spin/>:<Zap size={13}/>}Generate AI Recommendations</Btn></div>
        {data.recommendations.map(r=><Card key={r.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontSize:14,fontWeight:700}}>#{r.priority} {r.domain}</div><div style={{display:"flex",gap:6}}><Badge text={`DA ${Math.round(r.domain_authority)}`} color="#374151" bg="#f3f4f6"/><Badge text={r.estimated_impact} color={r.estimated_impact==="high"?"#065f46":"#92400e"} bg={r.estimated_impact==="high"?"#d1fae5":"#fef3c7"}/></div></div><div style={{fontSize:12,color:"#374151",marginBottom:6}}><strong>Why:</strong> {r.why_it_matters}</div><div style={{fontSize:12,color:"#374151"}}><strong>Strategy:</strong> {r.outreach_strategy}</div></Card>)}
        {data.recommendations.length===0&&<Empty icon={Zap} msg="No recommendations — click Generate"/>}
      </div>}
      {tab==="sheets-sync"&&<div>
        <Card style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Import from Google Sheets</div>
          <select value={syncType} onChange={e=>sST(e.target.value)} style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"7px 10px",fontSize:13,marginBottom:10}}><option value="backlinks">Backlinks</option><option value="referring_domains">Referring Domains</option><option value="competitor_link_gap">Competitor Link Gap</option><option value="keyword_rankings">Keyword Rankings</option><option value="competitors">Competitors</option></select>
          <input value={sheetUrl} onChange={e=>sSU(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"7px 10px",fontSize:13,marginBottom:10}}/>
          <Btn onClick={async()=>{if(!sheetUrl){alert("Enter URL");return;}sSyn(true);try{await api(`/clients/${clientId}/sync-sheets`,{method:"POST",body:{sheetUrl,syncType}});await fetch_all();sSU("");}catch(e){alert(e.message);}sSyn(false);}} disabled={syncing}>{syncing?<Spin/>:<Database size={13}/>}Import</Btn>
        </Card>
        <Card><div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Sync History</div>
          {data.syncLog.map(log=><div key={log.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #f3f4f6"}}><Dot s={log.status}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{log.sync_type} — {log.rows_imported} imported</div><div style={{fontSize:11,color:"#9ca3af"}}>{new Date(log.created_at).toLocaleString()}</div>{log.error&&<div style={{fontSize:11,color:"#ef4444"}}>{log.error}</div>}</div><Badge text={log.status} color={SC[log.status]} bg={SC[log.status]+"22"}/></div>)}
          {data.syncLog.length===0&&<div style={{fontSize:12,color:"#9ca3af"}}>No history</div>}
        </Card>
      </div>}
    </>}
  </div>;
}

function ReportsView({clientId,clients}){
  const[reports,sR]=useState([]);const[gen,sGen]=useState(false);const[period,sP]=useState({start:"",end:"",type:"monthly"});const[prevId,sPrev]=useState(null);
  const client=clients.find(c=>c.id===clientId);
  useEffect(()=>{if(!clientId)return;api(`/clients/${clientId}/reports`).then(sR).catch(console.error);},[clientId]);
  if(!clientId)return<Empty icon={BarChart3} msg="Select a client to view reports"/>;
  return<div>
    <SH title="Reports" sub={`${reports.length} reports for ${client?.name}`}/>
    <Card style={{marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Generate New Report</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4}}>Type</label><select value={period.type} onChange={e=>sP({...period,type:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13}}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></div>
        <div><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4}}>Start</label><input type="date" value={period.start} onChange={e=>sP({...period,start:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13}}/></div>
        <div><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4}}>End</label><input type="date" value={period.end} onChange={e=>sP({...period,end:e.target.value})} style={{border:"1px solid #d1d5db",borderRadius:6,padding:"6px 10px",fontSize:13}}/></div>
        <Btn onClick={async()=>{if(!period.start||!period.end){alert("Set dates");return;}sGen(true);try{await api(`/clients/${clientId}/reports/generate`,{method:"POST",body:{periodStart:period.start,periodEnd:period.end,periodType:period.type}});sR(await api(`/clients/${clientId}/reports`));}catch(e){alert(e.message);}sGen(false);}} disabled={gen}>{gen?<Spin/>:<BarChart3 size={13}/>}{gen?"Generating...":"Generate"}</Btn>
      </div>
    </Card>
    {prevId&&<Card style={{marginBottom:20}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div style={{fontSize:14,fontWeight:700}}>Preview</div><Btn secondary small onClick={()=>sPrev(null)}><X size={12}/></Btn></div><iframe src={`${API}/reports/${prevId}/html`} style={{width:"100%",height:600,border:"1px solid #e5e7eb",borderRadius:6}} title="Report"/></Card>}
    <Card>{reports.map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:"1px solid #f3f4f6"}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{r.title}</div><div style={{fontSize:11,color:"#9ca3af"}}>{new Date(r.created_at).toLocaleString()}</div></div><Badge text={r.status} color={SC[r.status]||"#374151"} bg={(SC[r.status]||"#374151")+"22"}/><Btn secondary small onClick={()=>sPrev(r.id)}><Eye size={12}/></Btn></div>)}
      {reports.length===0&&<Empty icon={BarChart3} msg="No reports yet"/>}
    </Card>
  </div>;
}

function VerificationView({clientId}){
  const[result,sR]=useState(null);const[load,sL]=useState(false);
  const run=async()=>{if(!clientId)return;sL(true);try{sR(await api(`/clients/${clientId}/verification`));}catch(e){console.error(e);}sL(false);};
  useEffect(()=>{run();},[clientId]);
  if(!clientId)return<Empty icon={Shield} msg="Select a client to run verification"/>;
  return<div>
    <SH title="System Verification" sub="10 real-time health checks" action={<Btn onClick={run} disabled={load}>{load?<Spin/>:<RefreshCw size={13}/>}Run Checks</Btn>}/>
    {load?<div style={{textAlign:"center",padding:40}}><Spin/></div>:result&&<>
      <div style={{marginBottom:20,display:"flex",gap:16,alignItems:"center"}}>
        <div style={{fontSize:48,fontWeight:800,color:result.health_score>=80?"#10b981":result.health_score>=60?"#f59e0b":"#ef4444"}}>{result.health_score}%</div>
        <div><div style={{fontSize:16,fontWeight:700}}>{result.all_passed?"✓ All checks passed":`${result.pass_count}/${result.total_checks} passed`}</div><div style={{fontSize:13,color:"#6b7280"}}>System health score</div></div>
      </div>
      <div style={{display:"grid",gap:10}}>
        {result.checks.map(c=><Card key={c.id} style={{borderColor:c.pass?"#86efac":"#fca5a5",background:c.pass?"#f0fdf4":"#fef2f2",padding:"14px 18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:c.pass?"#10b981":"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{c.pass?<Check size={14} color="#fff"/>:<X size={14} color="#fff"/>}</div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:c.pass?"#065f46":"#991b1b"}}>{c.label}</div><div style={{fontSize:12,color:"#6b7280",marginTop:2}}>{c.detail}</div></div>
          </div>
        </Card>)}
      </div>
    </>}
  </div>;
}

function CredentialsView({clientId}){
  const[creds,sC]=useState([]);const[ref,sRef]=useState(false);
  const load=async()=>{if(!clientId)return;sC(await api(`/clients/${clientId}/credentials`));};
  useEffect(()=>{load();},[clientId]);
  if(!clientId)return<Empty icon={Key} msg="Select a client to view credentials"/>;
  return<div>
    <SH title="Credentials" sub="Service connection health" action={<Btn onClick={async()=>{sRef(true);try{await api(`/clients/${clientId}/credentials/refresh`,{method:"POST"});await load();}catch(e){alert(e.message);}sRef(false);}} disabled={ref} small>{ref?<Spin/>:<RefreshCw size={12}/>}Check All</Btn>}/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
      {creds.map(c=><Card key={c.id} style={{borderColor:c.is_connected?"#86efac":"#fca5a5"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontSize:13,fontWeight:700}}>{c.label||c.service}</div><Badge text={c.is_connected?"Connected":"Disconnected"} color={c.is_connected?"#065f46":"#991b1b"} bg={c.is_connected?"#d1fae5":"#fee2e2"}/></div>
        <div style={{height:6,background:"#e5e7eb",borderRadius:3,marginBottom:8}}><div style={{height:6,borderRadius:3,background:c.health_score>=75?"#10b981":c.health_score>=50?"#f59e0b":"#ef4444",width:`${c.health_score||0}%`}}/></div>
        <div style={{fontSize:11,color:"#6b7280"}}>Health: {c.health_score}%</div>
        {c.error&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>{c.error}</div>}
      </Card>)}
    </div>
  </div>;
}

function IncidentsView({clientId}){
  const[inc,sI]=useState([]);const[f,sF]=useState("open");
  const load=async()=>{if(!clientId)return;let url=`/clients/${clientId}/incidents`;if(f&&f!=="all")url+=`?status=${f}`;sI(await api(url));};
  useEffect(()=>{load();},[clientId,f]);
  if(!clientId)return<Empty icon={AlertTriangle} msg="Select a client to view incidents"/>;
  const sc={critical:"#ef4444",high:"#f59e0b",medium:"#3b82f6",low:"#9ca3af"};
  const sb={critical:"#fee2e2",high:"#fef3c7",medium:"#dbeafe",low:"#f3f4f6"};
  return<div>
    <SH title="Incidents" sub={`${inc.length} ${f} incidents`} action={<div style={{display:"flex",gap:6}}>{["open","investigating","resolved","all"].map(s=><Btn key={s} small onClick={()=>sF(s)} color={f===s?"#4f46e5":"#6b7280"} secondary={f!==s}>{s}</Btn>)}</div>}/>
    {inc.map(i=><Card key={i.id} style={{marginBottom:10,borderRight:`4px solid ${sc[i.severity]||"#9ca3af"}`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div><Badge text={i.severity} color={sc[i.severity]} bg={sb[i.severity]}/><span style={{fontSize:14,fontWeight:700,marginRight:8}}> {i.title}</span></div><Badge text={i.status} color={SC[i.status]} bg={SC[i.status]+"22"}/></div>
      {i.description&&<div style={{fontSize:12,color:"#4b5563",marginBottom:10,lineHeight:1.5}}>{i.description}</div>}
      <div style={{display:"flex",gap:6}}>
        {i.status==="open"&&<Btn small secondary onClick={async()=>{await api(`/incidents/${i.id}`,{method:"PATCH",body:{status:"investigating"}});await load();}}>Investigate</Btn>}
        {i.status!=="resolved"&&<Btn small color="#059669" onClick={async()=>{await api(`/incidents/${i.id}`,{method:"PATCH",body:{status:"resolved",resolved_by:"admin",resolved_at:new Date().toISOString()}});await load();}}>Resolve</Btn>}
        {i.status!=="dismissed"&&<Btn small secondary onClick={async()=>{await api(`/incidents/${i.id}`,{method:"PATCH",body:{status:"dismissed"}});await load();}}>Dismiss</Btn>}
      </div>
    </Card>)}
    {inc.length===0&&<Card><Empty icon={AlertTriangle} msg={`No ${f} incidents`}/></Card>}
  </div>;
}

function AuditView({clientId}){
  const[audit,sA]=useState([]);const[search,sS]=useState("");
  useEffect(()=>{if(!clientId)return;api(`/clients/${clientId}/audit`).then(sA).catch(console.error);},[clientId]);
  const filtered=audit.filter(a=>!search||a.action.includes(search)||a.agent_slug?.includes(search));
  if(!clientId)return<Empty icon={BookOpen} msg="Select a client to view audit trail"/>;
  return<div>
    <SH title="Audit Trail" sub={`${audit.length} entries`}/>
    <input value={search} onChange={e=>sS(e.target.value)} placeholder="Filter by action or agent..." style={{width:"100%",border:"1px solid #d1d5db",borderRadius:6,padding:"7px 12px",fontSize:13,marginBottom:16}}/>
    <Card>{filtered.slice(0,100).map(e=><div key={e.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:"1px solid #f3f4f6"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",marginTop:5,flexShrink:0}}/>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{e.action} <span style={{color:"#9ca3af",fontSize:11}}>by {e.agent_slug||e.actor}</span></div>{e.details&&Object.keys(e.details).length>0&&<div style={{fontSize:11,color:"#6b7280",marginTop:2}}>{Object.entries(e.details).slice(0,4).map(([k,v])=>`${k}: ${v}`).join(" · ")}</div>}</div>
      <div style={{fontSize:11,color:"#9ca3af",flexShrink:0}}>{new Date(e.created_at).toLocaleString()}</div>
    </div>)}{filtered.length===0&&<Empty icon={BookOpen} msg="No entries"/>}</Card>
  </div>;
}

function SchedulesView({clientId}){
  const[sch,sSch]=useState([]);
  useEffect(()=>{if(!clientId)return;api(`/clients/${clientId}/schedules`).then(sSch).catch(console.error);},[clientId]);
  if(!clientId)return<Empty icon={Clock} msg="Select a client to view schedules"/>;
  return<div>
    <SH title="Agent Schedules" sub="Automated cron-based execution"/>
    <Card>{sch.map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid #f3f4f6"}}>
      <input type="checkbox" checked={s.enabled} onChange={async e=>{await api(`/schedules/${s.id}`,{method:"PATCH",body:{enabled:e.target.checked}});sSch(await api(`/clients/${clientId}/schedules`));}} style={{width:16,height:16,cursor:"pointer"}}/>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{s.agent_templates?.name}</div><div style={{fontSize:12,color:"#6b7280"}}>{s.cron_expression} · {s.agent_templates?.lane}</div>{s.last_run_at&&<div style={{fontSize:11,color:"#9ca3af"}}>Last: {new Date(s.last_run_at).toLocaleString()} · Runs: {s.run_count}</div>}</div>
      <Badge text={s.enabled?"Active":"Paused"} color={s.enabled?"#065f46":"#6b7280"} bg={s.enabled?"#d1fae5":"#f3f4f6"}/>
    </div>)}{sch.length===0&&<Empty icon={Clock} msg="No schedules configured"/>}</Card>
  </div>;
}


// ============================================================
// AI GROWTH OS — ADDITIONAL FRONTEND VIEWS
// Onboarding wizard, connectors, prompt overrides,
// link intelligence, SEO action plans, locations, run steps
// Append to App.jsx
// ============================================================

function OnboardingView({ clientId, clients, onClientCreated }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    name: '', domain: '', businessType: 'law firm', industry: 'legal services',
    subIndustry: '', language: 'he', rtlRequired: true, brandVoice: '',
    geographies: [], targetAudiences: [], forbiddenAudiences: [], profitableTopics: [],
    complianceRestrictions: '', gscPropertyUrl: '', googleAdsCid: '', websiteUrl: '',
    reportRecipients: [], keywords: [], competitors: [],
    allowedAccounts: [], forbiddenAccounts: [], sourceOfTruth: 'Google Drive',
    preRunDocument: 'CLAUDE.md', specialPolicies: [], approvalRequiredFor: [],
    reviewsVoice: 'office', defaultReportLanguage: 'he',
    defaultReportTypes: ['weekly_progress'], reportSchedule: 'weekly', timezone: 'Asia/Jerusalem'
  });

  const steps = [
    'Basic Identity', 'Targeting', 'Connectors & Data',
    'SEO Foundation', 'Operational Policies', 'Reports & Schedule'
  ];

  const update = (field, value) => setData(prev => ({ ...prev, [field]: value }));

  const addArrayItem = (field, value) => {
    if (!value.trim()) return;
    setData(prev => ({ ...prev, [field]: [...(prev[field] || []), value.trim()] }));
  };

  const removeArrayItem = (field, index) => {
    setData(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const result = await api('/onboarding', { method: 'POST', body: data });
      alert(`✓ Client created! ${result.summary.agents_assigned} agents assigned, ${result.summary.keywords_imported} keywords imported.`);
      if (onClientCreated) onClientCreated(result.clientId);
    } catch (e) { alert(`Error: ${e.message}`); }
    setSaving(false);
  };

  const fieldStyle = { width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 };
  const labelStyle = { fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 600 };

  return <div style={{ maxWidth: 700, margin: '0 auto' }}>
    <SH title="New Client Onboarding" sub="Step-by-step setup — all data becomes AI runtime input" />

    {/* Step progress */}
    <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
      {steps.map((s, i) => <div key={i} style={{ flex: 1, padding: '6px 4px', borderRadius: 6, background: step === i+1 ? '#6366f1' : step > i+1 ? '#10b981' : '#f3f4f6', color: step >= i+1 ? '#fff' : '#9ca3af', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{i+1}. {s}</div>)}
    </div>

    <Card>
      {step === 1 && <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Step 1: Basic Identity</div>
        <label style={labelStyle}>Client Name *</label>
        <input value={data.name} onChange={e => update('name', e.target.value)} style={fieldStyle} placeholder="e.g. Yaniv Gil Law Firm" />
        <label style={labelStyle}>Website URL *</label>
        <input value={data.websiteUrl} onChange={e => update('websiteUrl', e.target.value)} style={fieldStyle} placeholder="https://example.co.il" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Business Type</label>
            <select value={data.businessType} onChange={e => update('businessType', e.target.value)} style={fieldStyle}>
              {['law firm','medical clinic','real estate','e-commerce','saas','restaurant','professional services','other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label style={labelStyle}>Industry</label>
            <input value={data.industry} onChange={e => update('industry', e.target.value)} style={fieldStyle} placeholder="legal services" /></div>
        </div>
        <label style={labelStyle}>Sub-Industry</label>
        <input value={data.subIndustry} onChange={e => update('subIndustry', e.target.value)} style={fieldStyle} placeholder="family law / divorce / inheritance" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Primary Language</label>
            <select value={data.language} onChange={e => update('language', e.target.value)} style={fieldStyle}>
              <option value="he">Hebrew (עברית)</option><option value="en">English</option><option value="ar">Arabic (عربي)</option>
            </select></div>
          <div><label style={labelStyle}>RTL Layout Required</label>
            <select value={data.rtlRequired ? 'yes' : 'no'} onChange={e => update('rtlRequired', e.target.value === 'yes')} style={fieldStyle}>
              <option value="yes">Yes — Right-to-Left</option><option value="no">No — Left-to-Right</option>
            </select></div>
        </div>
        <label style={labelStyle}>Brand Voice</label>
        <textarea value={data.brandVoice} onChange={e => update('brandVoice', e.target.value)} rows={2} style={fieldStyle} placeholder="premium, formal, authoritative, empathetic" />
      </div>}

      {step === 2 && <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Step 2: Targeting</div>
        {[
          ['geographies', 'Target Geographies', 'e.g. Tel Aviv, Gush Dan, Israel'],
          ['targetAudiences', 'Target Audiences', 'e.g. adults going through divorce in Tel Aviv'],
          ['forbiddenAudiences', 'Forbidden Audiences', 'e.g. competing lawyers, students'],
          ['profitableTopics', 'Profitable Services/Topics', 'e.g. high-net-worth divorce, inheritance disputes']
        ].map(([field, label, placeholder]) => <div key={field} style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{label}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input id={`input-${field}`} style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} placeholder={placeholder} onKeyDown={e => { if (e.key === 'Enter') { addArrayItem(field, e.target.value); e.target.value = ''; }}} />
            <Btn small secondary onClick={() => { const el = document.getElementById(`input-${field}`); addArrayItem(field, el.value); el.value = ''; }}>Add</Btn>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(data[field] || []).map((item, i) => <span key={i} style={{ background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              {item} <span style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => removeArrayItem(field, i)}>×</span>
            </span>)}
          </div>
        </div>)}
        <label style={labelStyle}>Compliance Restrictions</label>
        <textarea value={data.complianceRestrictions} onChange={e => update('complianceRestrictions', e.target.value)} rows={2} style={fieldStyle} placeholder="Israeli Bar Association advertising rules, no guaranteed outcomes..." />
      </div>}

      {step === 3 && <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Step 3: Connectors & Data Sources</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Configure your data sources. These become available in the Connectors tab and are used by agents at runtime.</div>
        {[
          ['gscPropertyUrl', 'Google Search Console Property URL', 'https://yanivgil.co.il/'],
          ['googleAdsCid', 'Google Ads Customer ID', '123-456-7890'],
          ['websiteUrl', 'Website URL (required)', 'https://yanivgil.co.il'],
        ].map(([field, label, placeholder]) => <div key={field}>
          <label style={labelStyle}>{label}</label>
          <input value={data[field]} onChange={e => update(field, e.target.value)} style={fieldStyle} placeholder={placeholder} />
        </div>)}
        <label style={labelStyle}>Report Recipients (email)</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input id="input-recipients" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} placeholder="elad.d.keren@gmail.com" onKeyDown={e => { if (e.key === 'Enter') { addArrayItem('reportRecipients', e.target.value); e.target.value = ''; }}} />
          <Btn small secondary onClick={() => { const el = document.getElementById('input-recipients'); addArrayItem('reportRecipients', el.value); el.value = ''; }}>Add</Btn>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {data.reportRecipients.map((email, i) => <span key={i} style={{ background: '#f0fdf4', color: '#065f46', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{email} <span style={{ cursor: 'pointer' }} onClick={() => removeArrayItem('reportRecipients', i)}>×</span></span>)}
        </div>
        <div style={{ background: '#fef3c7', borderRadius: 6, padding: 12, fontSize: 12, color: '#92400e' }}>
          ⚠ Google Sheets staging, GitHub, and Vercel connections are configured in the Connectors tab after client creation.
        </div>
      </div>}

      {step === 4 && <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Step 4: SEO Foundation</div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Add Keywords (press Enter after each)</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input id="kw-input" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} placeholder="עורך דין גירושין תל אביב" onKeyDown={e => { if (e.key === 'Enter') { const val = e.target.value.trim(); if (val) { setData(prev => ({ ...prev, keywords: [...prev.keywords, { keyword: val }] })); e.target.value = ''; }}}} />
            <Btn small secondary onClick={() => { const el = document.getElementById('kw-input'); if (el.value.trim()) { setData(prev => ({ ...prev, keywords: [...prev.keywords, { keyword: el.value.trim() }] })); el.value = ''; }}}>Add</Btn>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {data.keywords.map((kw, i) => <span key={i} style={{ background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 4, fontSize: 12, direction: 'rtl' }}>{kw.keyword} <span style={{ cursor: 'pointer' }} onClick={() => setData(prev => ({ ...prev, keywords: prev.keywords.filter((_, j) => j !== i) }))}>×</span></span>)}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Add Competitors (domain)</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input id="comp-input" style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} placeholder="competitor-law.co.il" onKeyDown={e => { if (e.key === 'Enter') { const val = e.target.value.trim(); if (val) { setData(prev => ({ ...prev, competitors: [...prev.competitors, { domain: val }] })); e.target.value = ''; }}}} />
            <Btn small secondary onClick={() => { const el = document.getElementById('comp-input'); if (el.value.trim()) { setData(prev => ({ ...prev, competitors: [...prev.competitors, { domain: el.value.trim() }] })); el.value = ''; }}}>Add</Btn>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {data.competitors.map((c, i) => <span key={i} style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{c.domain} <span style={{ cursor: 'pointer' }} onClick={() => setData(prev => ({ ...prev, competitors: prev.competitors.filter((_, j) => j !== i) }))}>×</span></span>)}
          </div>
        </div>
      </div>}

      {step === 5 && <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Step 5: Operational Policies</div>
        {[
          ['allowedAccounts', 'Allowed Accounts (email)', 'elad.d.keren@gmail.com'],
          ['forbiddenAccounts', 'Forbidden Accounts (email)', 'elad@netop.cloud'],
        ].map(([field, label, placeholder]) => <div key={field} style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{label}</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input id={`input-${field}`} style={{ ...fieldStyle, marginBottom: 0, flex: 1 }} placeholder={placeholder} onKeyDown={e => { if (e.key === 'Enter') { addArrayItem(field, e.target.value); e.target.value = ''; }}} />
            <Btn small secondary onClick={() => { const el = document.getElementById(`input-${field}`); addArrayItem(field, el.value); el.value = ''; }}>Add</Btn>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(data[field] || []).map((item, i) => <span key={i} style={{ background: field === 'forbiddenAccounts' ? '#fee2e2' : '#f0fdf4', color: field === 'forbiddenAccounts' ? '#991b1b' : '#065f46', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{item} <span style={{ cursor: 'pointer' }} onClick={() => removeArrayItem(field, i)}>×</span></span>)}
          </div>
        </div>)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Source of Truth</label>
            <select value={data.sourceOfTruth} onChange={e => update('sourceOfTruth', e.target.value)} style={fieldStyle}>
              <option value="Google Drive">Google Drive</option><option value="Notion">Notion</option><option value="Manual">Manual</option>
            </select></div>
          <div><label style={labelStyle}>Reviews Voice</label>
            <select value={data.reviewsVoice} onChange={e => update('reviewsVoice', e.target.value)} style={fieldStyle}>
              <option value="office">Office/Plural (אנחנו)</option><option value="personal">Personal (אני)</option>
            </select></div>
        </div>
        <label style={labelStyle}>Pre-Run Document Name</label>
        <input value={data.preRunDocument} onChange={e => update('preRunDocument', e.target.value)} style={fieldStyle} placeholder="CLAUDE.md" />
      </div>}

      {step === 6 && <div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Step 6: Reports & Schedule</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Default Report Language</label>
            <select value={data.defaultReportLanguage} onChange={e => update('defaultReportLanguage', e.target.value)} style={fieldStyle}>
              <option value="he">Hebrew (עברית)</option><option value="en">English</option>
            </select></div>
          <div><label style={labelStyle}>Report Schedule</label>
            <select value={data.reportSchedule} onChange={e => update('reportSchedule', e.target.value)} style={fieldStyle}>
              <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="daily">Daily</option>
            </select></div>
        </div>
        <label style={labelStyle}>Default Report Types</label>
        {['weekly_progress','monthly_progress','weekly_seo','weekly_paid_ads','weekly_growth'].map(type => <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={data.defaultReportTypes.includes(type)} onChange={e => {
            if (e.target.checked) setData(prev => ({ ...prev, defaultReportTypes: [...prev.defaultReportTypes, type] }));
            else setData(prev => ({ ...prev, defaultReportTypes: prev.defaultReportTypes.filter(t => t !== type) }));
          }} />
          {type.replace(/_/g, ' ')}
        </label>)}
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>Ready to create client</div>
          <div style={{ fontSize: 12, color: '#374151' }}>
            <div>✓ Name: {data.name || '(not set)'}</div>
            <div>✓ Language: {data.language} {data.rtlRequired ? '(RTL)' : ''}</div>
            <div>✓ Keywords to import: {data.keywords.length}</div>
            <div>✓ Competitors: {data.competitors.length}</div>
            <div>✓ All 23 agents will be assigned automatically</div>
          </div>
        </div>
      </div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        {step > 1 ? <Btn secondary onClick={() => setStep(s => s - 1)}>← Back</Btn> : <div />}
        {step < 6 ? <Btn onClick={() => setStep(s => s + 1)} disabled={step === 1 && !data.name}>Next →</Btn>
          : <Btn onClick={submit} disabled={saving || !data.name}>{saving ? <Spin /> : <Check size={13} />}{saving ? 'Creating...' : 'Create Client'}</Btn>}
      </div>
    </Card>
  </div>;
}

function ConnectorsView({ clientId }) {
  const [connectors, setConnectors] = useState([]); const [syncing, setSyncing] = useState({});
  const load = async () => { if (!clientId) return; const { data } = await api(`/clients/${clientId}/connectors`).catch(() => ({ data: [] })); setConnectors(data || []); };
  useEffect(() => { load(); }, [clientId]);
  const sync = async (type) => { setSyncing(p => ({ ...p, [type]: true })); try { await api(`/clients/${clientId}/connectors/${type}/sync`, { method: 'POST' }); await load(); } catch (e) { alert(e.message); } setSyncing(p => ({ ...p, [type]: false })); };
  const toggle = async (id, val) => { await api(`/connectors/${id}`, { method: 'PATCH', body: { sync_enabled: val } }); await load(); };
  if (!clientId) return <Empty icon={Globe} msg="Select a client to view connectors" />;
  const icons = { google_search_console: '🔍', google_ads: '💰', google_analytics: '📊', google_business_profile: '📍', meta_business: '📱', google_sheets: '📋', github: '🐙', vercel: '▲', website: '🌐', email_smtp: '✉️' };
  return <div>
    <SH title="Connectors & Data Sources" sub="Per-client service connections. All data flows through these connectors into agent runtime." action={<Btn small secondary onClick={load}><RefreshCw size={12} /></Btn>} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
      {connectors.map(c => <Card key={c.id} style={{ borderColor: c.is_active && c.last_sync_status === 'success' ? '#86efac' : c.last_sync_status === 'failed' ? '#fca5a5' : '#e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{icons[c.connector_type] || '🔌'} {c.label || c.connector_type}</div>
          <Badge text={c.last_sync_status || 'not synced'} color={c.last_sync_status === 'success' ? '#065f46' : c.last_sync_status === 'failed' ? '#991b1b' : '#6b7280'} bg={c.last_sync_status === 'success' ? '#d1fae5' : c.last_sync_status === 'failed' ? '#fee2e2' : '#f3f4f6'} />
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{c.last_synced_at ? `Last sync: ${new Date(c.last_synced_at).toLocaleString()}` : 'Never synced'}</div>
        {c.last_sync_error && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{c.last_sync_error}</div>}
        {c.connector_type === 'google_sheets' && c.is_active && <Btn small color="#059669" onClick={() => sync(c.connector_type)} disabled={syncing[c.connector_type]} style={{ marginTop: 4 }}>{syncing[c.connector_type] ? <Spin /> : <Database size={11} />} Sync Now</Btn>}
      </Card>)}
    </div>
  </div>;
}

function PromptOverridesView({ clientId }) {
  const [overrides, setOverrides] = useState([]); const [agents, setAgents] = useState([]); const [sel, setSel] = useState(null); const [diff, setDiff] = useState(null); const [editing, setEditing] = useState(false); const [newText, setNewText] = useState('');
  const load = async () => {
    if (!clientId) return;
    const [ov, ag] = await Promise.all([api(`/clients/${clientId}/prompt-overrides`), api('/agents')]);
    setOverrides(ov); setAgents(ag);
  };
  useEffect(() => { load(); }, [clientId]);
  const loadDiff = async (agentId) => { try { const d = await api(`/clients/${clientId}/agents/${agentId}/prompt-diff`); setDiff(d); setNewText(d.client_override?.prompt_text || d.base_prompt || ''); } catch (e) { console.error(e); } };
  const save = async (agentId) => { await api(`/clients/${clientId}/prompt-overrides`, { method: 'POST', body: { agentTemplateId: agentId, promptText: newText, notes: 'Manual override' } }); await load(); await loadDiff(agentId); setEditing(false); };
  if (!clientId) return <Empty icon={FileText} msg="Select a client to manage prompt overrides" />;
  return <div>
    <SH title="Prompt Overrides" sub="Client-specific prompt overrides take priority over base prompts and prompt versions" />
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 10 }}>SELECT AGENT TO OVERRIDE</div>
        {agents.map(a => <div key={a.id} onClick={() => { setSel(a); loadDiff(a.id); setEditing(false); }} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, border: '1px solid', borderColor: sel?.id === a.id ? '#6366f1' : '#e5e7eb', background: sel?.id === a.id ? '#eef2ff' : '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>{a.lane}</div>
          {overrides.find(o => o.agent_template_id === a.id) && <Badge text="Override Active" color="#4f46e5" bg="#eef2ff" />}
        </div>)}
      </div>
      {sel && diff ? <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{sel.name}</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>Active source: <strong>{diff.active_source}</strong></div>
        {!editing ? <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {diff.client_override ? '✓ Client Override Active' : 'Base Prompt (no override)'}
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 250, overflow: 'auto', direction: 'ltr', textAlign: 'left' }}>
              {diff.client_override?.prompt_text || diff.base_prompt || '(empty)'}
            </div>
          </div>
          <Btn onClick={() => setEditing(true)}>{diff.client_override ? 'Edit Override' : 'Create Override'}</Btn>
          {diff.client_override && <Btn secondary small style={{ marginLeft: 8 }} onClick={async () => { await api(`/prompt-overrides/${diff.client_override.id}`, { method: 'PATCH', body: { is_active: false } }); await load(); await loadDiff(sel.id); }}>Deactivate</Btn>}
        </> : <>
          <textarea value={newText} onChange={e => setNewText(e.target.value)} rows={12} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', direction: 'ltr', textAlign: 'left', resize: 'vertical', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => save(sel.id)} color="#059669"><Check size={13} /> Save Override</Btn>
            <Btn secondary onClick={() => setEditing(false)}>Cancel</Btn>
          </div>
        </>}
      </Card> : <Card><Empty icon={FileText} msg="Select an agent to view or create a prompt override" /></Card>}
    </div>
  </div>;
}

function LinkIntelligenceView({ clientId }) {
  const [tab, setTab] = useState('opportunities'); const [data, setData] = useState({ opportunities: [], missing: [], gap: [] }); const [generating, setGen] = useState(false);
  const tabs = ['opportunities', 'missing-domains', 'link-gap'];
  const load = async () => {
    if (!clientId) return;
    try {
      const [opp, miss, gap] = await Promise.all([api(`/clients/${clientId}/link-opportunities`), api(`/clients/${clientId}/missing-domains`), api(`/clients/${clientId}/link-gap`)]);
      setData({ opportunities: opp, missing: miss, gap });
    } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, [clientId]);
  const gen = async () => { setGen(true); try { await api(`/clients/${clientId}/link-intelligence/generate`, { method: 'POST' }); await load(); } catch (e) { alert(e.message); } setGen(false); };
  if (!clientId) return <Empty icon={Link} msg="Select a client to view link intelligence" />;
  const ts = (t) => ({ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t ? '#4f46e5' : '#f3f4f6', color: tab === t ? '#fff' : '#374151', border: 'none' });
  return <div>
    <SH title="Link Intelligence" sub="Competitor gap, missing domains, AI-powered link acquisition strategy" action={<Btn onClick={gen} disabled={generating} color="#7c3aed" small>{generating ? <Spin /> : <Zap size={12} />} Generate AI Analysis</Btn>} />
    <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>{tabs.map(t => <button key={t} style={ts(t)} onClick={() => setTab(t)}>{t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</button>)}</div>
    {tab === 'opportunities' && <div>
      {data.opportunities.map(o => <Card key={o.id} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{o.domain}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge text={`DA ${Math.round(o.domain_authority)}`} color="#374151" bg="#f3f4f6" />
            <Badge text={o.expected_impact} color={o.expected_impact === 'high' ? '#065f46' : '#92400e'} bg={o.expected_impact === 'high' ? '#d1fae5' : '#fef3c7'} />
            <Badge text={o.effort} color="#374151" bg="#f3f4f6" />
          </div>
        </div>
        {o.competitor_that_has_it && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>Competitor: {o.competitor_that_has_it}</div>}
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}><strong>Why:</strong> {o.why_it_matters}</div>
        <div style={{ fontSize: 12, color: '#374151' }}><strong>Strategy:</strong> {o.outreach_strategy}</div>
      </Card>)}
      {data.opportunities.length === 0 && <Empty icon={Link} msg="No link opportunities yet — click Generate AI Analysis" />}
    </div>}
    {tab === 'missing-domains' && <Card>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ background: '#f9fafb' }}>
          {['Domain', 'DA', 'Competitors That Have It', 'Category', 'Priority', 'Status'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {data.missing.map(d => <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.domain}</td>
            <td style={{ padding: '8px 10px' }}><Badge text={Math.round(d.domain_authority)} color="#374151" bg="#f3f4f6" /></td>
            <td style={{ padding: '8px 10px', fontSize: 11, color: '#6b7280' }}>{d.competitors_that_have_it?.join(', ')}</td>
            <td style={{ padding: '8px 10px', fontSize: 11 }}>{d.category || '—'}</td>
            <td style={{ padding: '8px 10px' }}><Badge text={Math.round(d.priority_score)} color="#374151" bg="#f3f4f6" /></td>
            <td style={{ padding: '8px 10px' }}><Badge text={d.status} color="#374151" bg="#f3f4f6" /></td>
          </tr>)}
        </tbody>
      </table>
      {data.missing.length === 0 && <Empty icon={Link} msg="No missing domains — import from Google Sheets" />}
    </Card>}
    {tab === 'link-gap' && <Card>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ background: '#f9fafb' }}>
          {['Domain', 'DA', 'Competitor', 'Status'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {data.gap.map(g => <tr key={g.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{g.domain}</td>
            <td style={{ padding: '8px 10px' }}><Badge text={Math.round(g.domain_authority)} color="#374151" bg="#f3f4f6" /></td>
            <td style={{ padding: '8px 10px', color: '#6b7280' }}>{g.competitor_domain}</td>
            <td style={{ padding: '8px 10px' }}><Badge text={g.status} color="#374151" bg="#f3f4f6" /></td>
          </tr>)}
        </tbody>
      </table>
      {data.gap.length === 0 && <Empty icon={Link} msg="No gap data — import competitor link gap from Sheets" />}
    </Card>}
  </div>;
}

function SeoActionPlansView({ clientId }) {
  const [plans, setPlans] = useState([]); const [gen, setGen] = useState(false); const [filter, setFilter] = useState('open');
  const load = async () => { if (!clientId) return; try { const d = await api(`/clients/${clientId}/seo-action-plans?status=${filter}`); setPlans(d); } catch (e) { console.error(e); } };
  useEffect(() => { load(); }, [clientId, filter]);
  const generate = async () => { setGen(true); try { await api(`/clients/${clientId}/seo-action-plans/generate`, { method: 'POST' }); await load(); } catch (e) { alert(e.message); } setGen(false); };
  const update = async (id, patch) => { await api(`/seo-action-plans/${id}`, { method: 'PATCH', body: patch }); await load(); };
  if (!clientId) return <Empty icon={Activity} msg="Select a client to view SEO action plans" />;
  const effortColor = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
  const impactColor = { low: '#9ca3af', medium: '#f59e0b', high: '#10b981' };
  return <div>
    <SH title="SEO Action Plans" sub="AI-generated, prioritized SEO task list" action={<div style={{ display: 'flex', gap: 8 }}>{['open','in_progress','done'].map(s => <Btn key={s} small onClick={() => setFilter(s)} color={filter === s ? '#4f46e5' : '#6b7280'} secondary={filter !== s}>{s}</Btn>)}<Btn onClick={generate} disabled={gen} small color="#7c3aed">{gen ? <Spin /> : <Zap size={12} />} Generate</Btn></div>} />
    {plans.map(p => <Card key={p.id} style={{ marginBottom: 10, borderRight: `4px solid ${impactColor[p.expected_impact] || '#9ca3af'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, direction: 'rtl', textAlign: 'right' }}>{p.title}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.action_type?.replace(/_/g, ' ')} · {p.owner_lane}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 10 }}>
          <Badge text={p.effort} color={effortColor[p.effort]} bg={effortColor[p.effort] + '22'} />
          <Badge text={`Impact: ${p.expected_impact}`} color={impactColor[p.expected_impact]} bg={impactColor[p.expected_impact] + '22'} />
        </div>
      </div>
      {p.description && <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, direction: 'rtl', textAlign: 'right', lineHeight: 1.5 }}>{p.description}</div>}
      {p.target_keyword && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, direction: 'rtl' }}>מילת מפתח: {p.target_keyword}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        {p.status === 'open' && <Btn small secondary onClick={() => update(p.id, { status: 'in_progress' })}>Start</Btn>}
        {p.status === 'in_progress' && <Btn small color="#059669" onClick={() => update(p.id, { status: 'done', completed_at: new Date().toISOString() })}>Mark Done</Btn>}
        {p.status !== 'dismissed' && <Btn small secondary onClick={() => update(p.id, { status: 'dismissed' })}>Dismiss</Btn>}
      </div>
    </Card>)}
    {plans.length === 0 && <Empty icon={Activity} msg={`No ${filter} action plans — click Generate`} />}
  </div>;
}

// ── SETUP LINKS (Magic Link Admin) ───────────────────────────
function SetupLinksView({clientId, clients}) {
  const [links, setLinks] = useState([]); const [loading, setLoading] = useState(false); const [creating, setCreating] = useState(false);
  const [connDefs, setConnDefs] = useState([]); const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState(''); const [msgHe, setMsgHe] = useState(''); const [email, setEmail] = useState(''); const [notify, setNotify] = useState('');
  const load = async () => { setLoading(true); try { const d = clientId ? await api(`/clients/${clientId}/setup-links`) : await api('/setup-links'); setLinks(d); } catch(e){} setLoading(false); };
  const loadDefs = async () => { try { const d = await api('/connector-definitions'); setConnDefs(d); setSelected(d.map(c=>c.slug)); } catch(e){} };
  useEffect(() => { load(); loadDefs(); }, [clientId]);
  const create = async () => { if (!clientId) { alert('Select a client first'); return; } setCreating(true); try {
    const result = await api(`/clients/${clientId}/setup-links`, { method: 'POST', body: { requestedConnectors: selected, customMessage: msg || undefined, customMessageHe: msgHe || undefined, clientEmail: email || undefined, notifyEmail: notify || undefined, language: 'he' } });
    alert(`Magic link created!\n\n${result.setup_url}\n\nExpires: ${new Date(result.expires_at).toLocaleDateString()}`);
    navigator.clipboard?.writeText(result.setup_url); load();
  } catch(e) { alert(e.message); } setCreating(false); };
  const revoke = async (id) => { if (!confirm('Revoke this link?')) return; try { await api(`/setup-links/${id}`, { method: 'DELETE' }); load(); } catch(e) { alert(e.message); } };
  const regen = async (id) => { try { const r = await api(`/setup-links/${id}/regenerate`, { method: 'POST' }); alert(`New link:\n${r.setup_url}`); navigator.clipboard?.writeText(r.setup_url); load(); } catch(e) { alert(e.message); } };
  const toggleConn = (slug) => setSelected(s => s.includes(slug) ? s.filter(x=>x!==slug) : [...s, slug]);
  const client = clients?.find(c=>c.id===clientId);
  return <div>
    <SH title="Setup Links" sub="Create magic links for client onboarding. Client opens the link, connects their tools, and agents start working." action={<Btn small secondary onClick={load}><RefreshCw size={12}/></Btn>}/>
    <Card style={{marginBottom:20}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Create New Setup Link {client ? `for ${client.name}` : ''}</div>
      {!clientId ? <div style={{color:'#9ca3af',fontSize:13}}>Select a client from the dropdown first</div> : <>
        <div style={{fontSize:12,fontWeight:600,color:'#6b7280',marginBottom:8}}>Connectors to request:</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
          {connDefs.map(c => <button key={c.slug} onClick={()=>toggleConn(c.slug)} style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${selected.includes(c.slug)?'#6366f1':'#e5e7eb'}`,background:selected.includes(c.slug)?'#eef2ff':'#fff',fontSize:11,fontWeight:600,cursor:'pointer',color:selected.includes(c.slug)?'#4f46e5':'#6b7280'}}>{c.icon} {c.name}</button>)}
          <button key="git_repo" onClick={()=>toggleConn('git_repo')} style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${selected.includes('git_repo')?'#6366f1':'#e5e7eb'}`,background:selected.includes('git_repo')?'#eef2ff':'#fff',fontSize:11,fontWeight:600,cursor:'pointer',color:selected.includes('git_repo')?'#4f46e5':'#6b7280'}}>📁 Git Repository</button>
          <button key="cms_access" onClick={()=>toggleConn('cms_access')} style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${selected.includes('cms_access')?'#6366f1':'#e5e7eb'}`,background:selected.includes('cms_access')?'#eef2ff':'#fff',fontSize:11,fontWeight:600,cursor:'pointer',color:selected.includes('cms_access')?'#4f46e5':'#6b7280'}}>🖥 CMS Access</button>
          <button key="server_access" onClick={()=>toggleConn('server_access')} style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${selected.includes('server_access')?'#6366f1':'#e5e7eb'}`,background:selected.includes('server_access')?'#eef2ff':'#fff',fontSize:11,fontWeight:600,cursor:'pointer',color:selected.includes('server_access')?'#4f46e5':'#6b7280'}}>🔒 Server Access</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div><div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:4}}>Client Email</div><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="client@example.com" style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #e5e7eb',fontSize:12}}/></div>
          <div><div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:4}}>Notify Email (admin)</div><input value={notify} onChange={e=>setNotify(e.target.value)} placeholder="you@elad.digital" style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #e5e7eb',fontSize:12}}/></div>
        </div>
        <div style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:4}}>Custom Message (Hebrew)</div><textarea value={msgHe} onChange={e=>setMsgHe(e.target.value)} rows={2} placeholder="הודעה אישית ללקוח..." style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #e5e7eb',fontSize:12,direction:'rtl'}}/></div>
        <Btn onClick={create} disabled={creating||selected.length===0}>{creating?<Spin/>:<Zap size={13}/>}Create Magic Link</Btn>
      </>}
    </Card>
    {loading ? <div style={{textAlign:'center',padding:30}}><Spin/></div> : links.map(l => <Card key={l.id} style={{marginBottom:10,borderColor:l.status==='completed'?'#86efac':l.status==='in_progress'?'#93c5fd':l.status==='expired'||l.status==='cancelled'?'#fca5a5':'#e5e7eb'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:14,fontWeight:700}}>{l.client_name || l.clients?.name || 'Client'}</div>
          <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>Created {new Date(l.created_at).toLocaleDateString()} · Expires {new Date(l.expires_at).toLocaleDateString()}</div>
          <div style={{display:'flex',gap:4,marginTop:6,flexWrap:'wrap'}}>{(l.requested_connectors||[]).map(s=><span key={s} style={{background:'#f3f4f6',padding:'2px 6px',borderRadius:4,fontSize:10}}>{s}</span>)}</div>
          {l.completed_connectors?.length > 0 && <div style={{fontSize:11,color:'#10b981',marginTop:4}}>Completed: {l.completed_connectors.join(', ')}</div>}
        </div>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <Badge text={l.status} color={SC[l.status==='in_progress'?'running':l.status]||'#6b7280'} bg={(SC[l.status==='in_progress'?'running':l.status]||'#6b7280')+'22'}/>
        </div>
      </div>
      <div style={{display:'flex',gap:6,marginTop:10}}>
        {l.status !== 'cancelled' && l.status !== 'completed' && <Btn small secondary onClick={()=>{navigator.clipboard?.writeText(`${window.location.origin}/onboarding/${l.token}`);alert('Link copied!')}}>Copy Link</Btn>}
        {l.status !== 'cancelled' && l.status !== 'completed' && <Btn small secondary onClick={()=>revoke(l.id)}>Revoke</Btn>}
        {(l.status === 'expired' || l.status === 'cancelled') && <Btn small secondary onClick={()=>regen(l.id)}>Regenerate</Btn>}
      </div>
    </Card>)}
    {links.length===0 && !loading && <Empty icon={Zap} msg="No setup links yet — create one above"/>}
  </div>;
}

// ── WEBSITE ACCESS (Admin) ────────────────────────────────────
function WebsiteAccessView({clientId}) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false);
  const load = async () => { if (!clientId) return; setLoading(true); try { const d = await api(`/clients/${clientId}/website`); setData(d); } catch(e) { setData(null); } setLoading(false); };
  useEffect(() => { load(); }, [clientId]);
  if (!clientId) return <Empty icon={Globe} msg="Select a client to view website access"/>;
  if (loading) return <div style={{textAlign:'center',padding:40}}><Spin/></div>;
  if (!data || !data.website) return <div>
    <SH title="Website Access" sub="No website configured for this client yet."/>
    <Card><div style={{textAlign:'center',padding:20,color:'#9ca3af'}}>
      <Globe size={32} style={{marginBottom:10,opacity:0.5}}/>
      <div style={{fontSize:14}}>Send a setup link to the client to configure website access, or open the <a href="/website-access.html" target="_blank" style={{color:'#6366f1'}}>Website Access Manager</a> to configure manually.</div>
    </div></Card>
  </div>;
  const w = data.website; const ap = data.access_profile; const g = data.git; const cm = data.cms; const srv = data.server; const pol = data.policy;
  return <div>
    <SH title="Website Access" sub={`${w.primary_domain} · ${w.website_platform_type || 'unknown'}`} action={<Btn small secondary onClick={load}><RefreshCw size={12}/></Btn>}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
      <KpiCard label="Access Level" value={ap?.current_access_level?.replace('_',' ')||'read only'} color="#6366f1"/>
      <KpiCard label="Git" value={g?.connection_status||'none'} color={g?.connection_status==='connected'?'#10b981':'#9ca3af'}/>
      <KpiCard label="CMS" value={cm?.connection_status||'none'} color={cm?.connection_status==='connected'?'#10b981':'#9ca3af'}/>
      <KpiCard label="Server" value={srv?.connection_status||'none'} color={srv?.connection_status==='connected'?'#10b981':'#9ca3af'}/>
    </div>
    {g && <Card style={{marginBottom:10}}><div style={{fontSize:13,fontWeight:700,marginBottom:6}}>📁 Git: {g.provider} — {g.repo_owner}/{g.repo_name}</div><div style={{fontSize:12,color:'#6b7280'}}>Branch: {g.production_branch} · Mode: {g.access_mode} · Status: <span style={{color:g.connection_status==='connected'?'#10b981':'#ef4444'}}>{g.connection_status}</span></div></Card>}
    {cm && <Card style={{marginBottom:10}}><div style={{fontSize:13,fontWeight:700,marginBottom:6}}>🖥 CMS: {cm.cms_type}</div><div style={{fontSize:12,color:'#6b7280'}}>Admin: {cm.admin_url||'—'} · API: {cm.api_enabled?'enabled':'disabled'} · Status: <span style={{color:cm.connection_status==='connected'?'#10b981':'#ef4444'}}>{cm.connection_status}</span></div></Card>}
    {srv && <Card style={{marginBottom:10}}><div style={{fontSize:13,fontWeight:700,marginBottom:6}}>🔒 Server: {srv.access_type}</div><div style={{fontSize:12,color:'#6b7280'}}>Host: {srv.host}:{srv.port} · Root: {srv.site_root_path||'—'} · Status: <span style={{color:srv.connection_status==='connected'?'#10b981':'#ef4444'}}>{srv.connection_status}</span></div></Card>}
    {pol && <Card><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Safety Policy</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:12}}>
      {[['Analysis',pol.allow_analysis],['Content Edits',pol.allow_content_edits],['Code Changes',pol.allow_code_changes],['Direct Publish',pol.allow_direct_production_changes],['Require PR',pol.require_pr],['Staging First',pol.require_staging_first],['Manual Approval',pol.require_manual_approval_before_publish],['Auto Safe Changes',pol.allow_autonomous_safe_changes]].map(([k,v])=><div key={k} style={{padding:'4px 8px',background:v?'#f0fdf4':'#fef2f2',borderRadius:4,color:v?'#065f46':'#991b1b'}}>{v?'✓':'✗'} {k}</div>)}
    </div></Card>}
    {data.validations?.length > 0 && <Card style={{marginTop:12}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Recent Validations</div>{data.validations.slice(0,5).map((v,i)=><div key={i} style={{fontSize:12,padding:'4px 0',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between'}}><span><Dot s={v.status==='passed'?'success':v.status==='failed'?'failed':'pending'}/> {v.validation_type}</span><span style={{color:'#9ca3af'}}>{new Date(v.created_at).toLocaleString()}</span></div>)}</Card>}
  </div>;
}

const NAV=[{id:"dashboard",label:"Dashboard",icon:LayoutDashboard},{id:"agents",label:"Agents",icon:Bot},{id:"runs",label:"Runs",icon:Play},{id:"queue",label:"Queue",icon:ListOrdered},{id:"approvals",label:"Approvals",icon:CheckSquare},{id:"memory",label:"Memory",icon:Brain},{id:"seo",label:"SEO & Links",icon:Link},{id:"reports",label:"Reports",icon:BarChart3},{id:"verification",label:"Verification",icon:Shield},{id:"credentials",label:"Credentials",icon:Key},{id:"incidents",label:"Incidents",icon:AlertTriangle},{id:"audit",label:"Audit Trail",icon:BookOpen},{id:"schedules",label:"Schedules",icon:Clock},{id:"setup-links",label:"Setup Links",icon:Zap},{id:"website-access",label:"Website Access",icon:Globe},{id:"onboarding",label:"New Client",icon:Users},{id:"connectors",label:"Connectors",icon:Globe},{id:"prompt-overrides",label:"Prompt Overrides",icon:FileText},{id:"link-intelligence",label:"Link Intelligence",icon:Link},{id:"seo-actions",label:"SEO Actions",icon:Activity}];

export default function App(){
  const[view,sV]=useState("dashboard");const[clients,sC]=useState([]);const[clientId,sCid]=useState("");const[loading,sL]=useState(true);
  const loadClients=useCallback(()=>api("/clients").then(c=>{sC(c);if(c.length>0&&!c.find(x=>x.id===clientId)){sCid(c[0].id);}return c;}).catch(()=>[]),[]);
  useEffect(()=>{loadClients().finally(()=>sL(false));},[]);
  const deleteClient=async()=>{if(!clientId)return;const client=clients.find(c=>c.id===clientId);if(!confirm(`Delete "${client?.name||clientId}" and ALL related data? This cannot be undone.`))return;try{await api(`/clients/${clientId}`,{method:'DELETE'});const updated=await loadClients();if(updated.length>0)sCid(updated[0].id);else sCid("");}catch(e){alert(`Error: ${e.message}`);}};
  return<div style={{display:"flex",height:"100vh",background:"#f8f9fa",fontFamily:"'DM Sans','Segoe UI',sans-serif",overflow:"hidden"}}>
    <style>{"* { box-sizing: border-box; margin: 0; padding: 0; } @keyframes spin { to { transform: rotate(360deg); } } body { margin: 0; }"}</style>
    <div style={{width:220,background:"#0f0f1a",display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"20px 16px 12px"}}><div style={{fontSize:13,fontWeight:800,color:"#6366f1",letterSpacing:1}}>AI GROWTH OS</div><div style={{fontSize:10,color:"#4b5563",marginTop:2}}>by Elad Digital</div></div>
      <div style={{padding:"8px 12px 4px"}}><div style={{display:"flex",gap:4,alignItems:"center"}}><select value={clientId} onChange={e=>sCid(e.target.value)} style={{flex:1,background:"#1a1a2e",border:"1px solid #2d2d5a",borderRadius:6,padding:"6px 8px",fontSize:11,color:"#e2e8f0",cursor:"pointer"}}><option value="">Select client...</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{clientId&&<button onClick={deleteClient} title="Delete client" style={{background:"#7f1d1d",border:"none",borderRadius:6,padding:"6px",cursor:"pointer",display:"flex",alignItems:"center"}}><Trash2 size={12} color="#fca5a5"/></button>}</div></div>
      <nav style={{flex:1,overflow:"auto",padding:"8px"}}>{NAV.map(({id,label,icon:I})=><button key={id} onClick={()=>sV(id)} style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:7,border:"none",cursor:"pointer",marginBottom:2,background:view===id?"#6366f1":"transparent",color:view===id?"#fff":"#94a3b8",fontSize:12,fontWeight:view===id?600:400,textAlign:"left"}}><I size={14}/>{label}</button>)}</nav>
    </div>
    <div style={{flex:1,overflow:"auto",padding:28}}>
      {loading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}><Loader size={24} style={{animation:"spin 1s linear infinite"}}/></div>:<>
        {view==="dashboard"&&<Dashboard clientId={clientId} clients={clients}/>}
        {view==="agents"&&<AgentsView clientId={clientId}/>}
        {view==="runs"&&<RunsView clientId={clientId}/>}
        {view==="queue"&&<QueueView clientId={clientId}/>}
        {view==="approvals"&&<ApprovalsView clientId={clientId}/>}
        {view==="memory"&&<MemoryView clientId={clientId}/>}
        {view==="seo"&&<SeoView clientId={clientId}/>}
        {view==="reports"&&<ReportsView clientId={clientId} clients={clients}/>}
        {view==="verification"&&<VerificationView clientId={clientId}/>}
        {view==="credentials"&&<CredentialsView clientId={clientId}/>}
        {view==="incidents"&&<IncidentsView clientId={clientId}/>}
        {view==="audit"&&<AuditView clientId={clientId}/>}
        {view==="schedules"&&<SchedulesView clientId={clientId}/>}
        {view==="onboarding"&&<OnboardingView clientId={clientId} clients={clients} onClientCreated={id=>{sCid(id);loadClients();sV("dashboard");}}/>}
        {view==="setup-links"&&<SetupLinksView clientId={clientId} clients={clients}/>}
        {view==="website-access"&&<WebsiteAccessView clientId={clientId}/>}
        {view==="connectors"&&<ConnectorsView clientId={clientId}/>}
        {view==="prompt-overrides"&&<PromptOverridesView clientId={clientId}/>}
        {view==="link-intelligence"&&<LinkIntelligenceView clientId={clientId}/>}
        {view==="seo-actions"&&<SeoActionPlansView clientId={clientId}/>}
      </>}
    </div>
  </div>;
}
