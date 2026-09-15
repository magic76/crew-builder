(() => {
  const pendingGemini = new Map(); let geminiSeq = 0;
  window.__crewGeminiResolve = raw => { let p; try{p=typeof raw==='string'?JSON.parse(raw):raw}catch(_){return} const x=pendingGemini.get(p?.requestId); if(!x)return; pendingGemini.delete(p.requestId); p.error?x.reject(new Error(p.error)):x.resolve({text:p.text||'',model:p.model||''}); };
  window.CrewAI={available:()=>Boolean(window.CrewNative?.generateGemini),hasApiKey:()=>Boolean(window.CrewNative?.hasGeminiApiKey?.()),setApiKey:key=>window.CrewNative?.setGeminiApiKey?.(String(key||'').trim()),clearApiKey:()=>window.CrewNative?.clearGeminiApiKey?.(),generate:(prompt,model='auto')=>new Promise((resolve,reject)=>{if(!window.CrewNative?.generateGemini){reject(new Error('Gemini native bridge is unavailable.'));return}const requestId=`gemini_${Date.now()}_${++geminiSeq}`;pendingGemini.set(requestId,{resolve,reject});window.CrewNative.generateGemini(requestId,String(prompt||''),String(model||'auto'));setTimeout(()=>{if(pendingGemini.has(requestId)){pendingGemini.delete(requestId);reject(new Error('Gemini request timed out'))}},120000)})};

  window.__crewSensorEvent = raw => {
    let payload; try { payload = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    const frame = document.getElementById('preview');
    if (!frame?.contentWindow || !payload?.type) return;
    frame.contentWindow.postMessage({ __crewForge: true, type: 'native-sensor', sensor: payload.type, payload }, '*');
  };

  const original=window.handleRuntimeMessage;if(typeof original!=='function')return;window.removeEventListener('message',original);
  window.handleRuntimeMessage=async function(event){const msg=event.data||{},nativeBridge=window.CrewNative,isReq=msg.__crewForge&&msg.type==='request'&&msg.id&&msg.appId;if(!isReq||!nativeBridge)return original(event);const respond=(value,error=null)=>event.source?.postMessage({__crewForge:true,type:'response',id:msg.id,value,error},'*');try{const p=msg.payload||{};if(msg.method==='vibrate'){const pattern=p.pattern,d=Array.isArray(pattern)?Number(pattern.find(v=>Number(v)>0)||60):Number(pattern||60);nativeBridge.vibrate(Math.max(1,Math.min(2000,d)));respond(true);return}if(msg.method==='share'){nativeBridge.share(String(p.title||''),String(p.text||''),String(p.url||''));respond(true);return}if(msg.method==='location'){const raw=nativeBridge.getLastLocation?.();respond(raw?JSON.parse(raw):null);return}if(msg.method==='clipboard'){nativeBridge.copyToClipboard?.(String(p.text||''));respond(true);return}}catch(e){respond(null,e?.message||String(e));return}return original(event)};window.addEventListener('message',window.handleRuntimeMessage);
})();
