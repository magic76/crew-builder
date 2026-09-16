(() => {
  if (typeof window.injectRuntimeBridge !== 'function') return;
  const base = window.injectRuntimeBridge;
  window.injectRuntimeBridge = function(html, appId) {
    const output = base(html, appId);
    const id = JSON.stringify(appId);
    const script = `<script>(()=>{
      const request=(method,payload={})=>new Promise((resolve,reject)=>{const id='crew_cap_'+Date.now()+'_'+Math.random().toString(36).slice(2);const h=e=>{const m=e.data||{};if(m.__crewForge&&m.type==='response'&&m.id===id){removeEventListener('message',h);m.error?reject(new Error(m.error)):resolve(m.value)}};addEventListener('message',h);parent.postMessage({__crewForge:true,type:'request',id,appId:${id},method,payload},'*');setTimeout(()=>{removeEventListener('message',h);reject(new Error('Crew capability request timed out'))},8000)});
      const gyro=new Set();addEventListener('message',e=>{const m=e.data||{};if(m.__crewForge&&m.type==='native-sensor'&&m.sensor==='gyroscope')gyro.forEach(fn=>{try{fn(m.payload)}catch(_){}})});
      crew.sensor=crew.sensor||{};crew.sensor.gyroscope=fn=>{if(typeof fn==='function')gyro.add(fn);return()=>gyro.delete(fn)};
      crew.device={...(crew.device||{}),battery:()=>request('device.battery')};
      crew.tts={speak:(text,language='')=>request('tts.speak',{text:String(text||''),language:String(language||'')}),stop:()=>request('tts.stop')};
    })();<\/script>`;
    return output.replace(/<\/head>/i, script + '</head>');
  };
})();