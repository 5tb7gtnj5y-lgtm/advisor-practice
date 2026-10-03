// Only Guidance Coach's server can sign requests for this endpoint.
const PUBLIC_KEY = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaYD+cUIbkA1CKVh7atD+csNZbVZPnuVLANvh6yox0afvgoyKQa7Rc55DaV2KUY2pCrqL1dyw8kpoo0tFbjwjyg==";
let keyPromise;
const json = (value, status = 200) => Response.json(value, {status, headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
export async function guidanceCoachAI(req, env) {
  if (req.method !== "POST") return json({error:"Method not allowed."},405);
  try {
    const time=req.headers.get("X-Coach-Time"), signature=req.headers.get("X-Coach-Signature");
    if(!time||!/^\d{10}$/.test(time)||Math.abs(Date.now()/1000-Number(time))>60||!signature||signature.length>200) return json({error:"Coach service authentication failed."},403);
    if(Number(req.headers.get("Content-Length")||0)>80000) return json({error:"Coach request too large."},413);
    const body=await req.text();
    if(body.length>80000) return json({error:"Coach request too large."},413);
    keyPromise ||= crypto.subtle.importKey("spki",Uint8Array.from(atob(PUBLIC_KEY),c=>c.charCodeAt(0)),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},await keyPromise,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(time+"\n"+body));
    if(!valid) return json({error:"Coach service authentication failed."},403);
    const data=JSON.parse(body);
    if(!Array.isArray(data.messages)||data.messages.length<2||data.messages.length>12||data.messages[0].role!=="system"||data.messages.some(m=>!["system","user","assistant"].includes(m?.role)||typeof m.content!=="string"||m.content.length>24000)||data.messages.slice(1).some(m=>m.role==="system")) return json({error:"Invalid coach request."},400);
    if(!env.AI) return json({error:"The AI coach is temporarily unavailable."},503);
    if(env.LIMITER&&!(await env.LIMITER.limit({key:"guidance-coach-service"})).success) return json({error:"The coach needs a short pause. Try again in a minute."},429);
    const result=await env.AI.run(env.AI_MODEL||"@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:data.messages,max_tokens:1100,temperature:0.15,response_format:{type:"json_object"}});
    const text=result?.response??result?.choices?.[0]?.message?.content;
    if(typeof text!=="string"||!text.trim())return json({error:"The AI returned an incomplete reply. Please try again."},502);
    return json({response:text});
  }catch(error){
    const detail=String(error?.message||"");
    if(/quota|neuron|daily|rate.limit|3036|limit exceeded/i.test(detail))return json({error:"The shared free AI allowance or rate limit has been reached. Your progress is saved; please try again later."},503);
    console.error("Guidance Coach AI service failed",{kind:error?.name||"unknown"});
    return json({error:"The AI coach could not reply. Your progress is saved; please try again."},503);
  }
}
