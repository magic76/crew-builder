(() => {
  const originalValidate = window.validateGeneratedHtml;
  const originalRepair = window.buildRepairPrompt;

  const locate = (source, error) => {
    const message = String(error?.message || error || 'Unknown syntax error');
    const match = message.match(/(?:line|<anonymous>):?(\d+)(?::(\d+))?/i);
    if (!match) return { message, context: '' };
    const line = Math.max(1, Number(match[1]) || 1);
    const column = Math.max(1, Number(match[2]) || 1);
    const lines = String(source || '').split('\n');
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length, line + 2);
    const context = lines
      .slice(start, end)
      .map((value, index) => `${start + index + 1}: ${value}`)
      .join('\n')
      .slice(0, 1800);
    return { message, context, line, column };
  };

  if (typeof originalValidate === 'function') {
    window.validateGeneratedHtml = function(html) {
      const issues = originalValidate(html).filter(issue => !String(issue).startsWith('JavaScript syntax error:'));
      try {
        const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        [...doc.querySelectorAll('script:not([src])')].forEach((script, index) => {
          const source = script.textContent || '';
          try {
            new Function(source);
          } catch (error) {
            const detail = locate(source, error);
            let issue = `JavaScript syntax error in inline script #${index + 1}: ${detail.message}`;
            if (detail.line) issue += ` (line ${detail.line}${detail.column ? `, column ${detail.column}` : ''})`;
            if (detail.context) issue += `\nNearby code:\n${detail.context}`;
            issues.push(issue);
          }
        });
      } catch (_) {}
      return [...new Set(issues)].slice(0, 8);
    };
  }

  if (typeof originalRepair === 'function') {
    window.buildRepairPrompt = function(htmlOrText, issues) {
      return `${originalRepair(htmlOrText, issues)}\n\nREPAIR REQUIREMENTS:\n- For JavaScript syntax failures, use the reported inline script number and nearby code to repair the exact parse failure first.\n- Check brackets, quotes, template literals, object literals, optional chaining, and accidental prose inside JavaScript.\n- After the fix, mentally parse every inline <script> from beginning to end before returning the HTML.\n- Do not rewrite unrelated working behavior.`;
    };
  }

  if (typeof window.injectRuntimeBridge === 'function') {
    const baseInjectRuntimeBridge = window.injectRuntimeBridge;
    window.injectRuntimeBridge = function(html, appId) {
      const output = baseInjectRuntimeBridge(html, appId);
      const extension = `<script>(()=>{const locationRequest=()=>new Promise((resolve,reject)=>{const id='crew_location_'+Date.now()+'_'+Math.random().toString(36).slice(2);let done=false;const finish=()=>{done=true;removeEventListener('message',handler)};const handler=event=>{const message=event.data||{};if(!message.__crewForge||message.type!=='response'||message.id!==id)return;finish();if(message.error){const error=new Error(message.error);const match=String(message.error).match(/^([A-Z_]+):\\s*/);if(match)error.code=match[1];reject(error)}else resolve(message.value)};addEventListener('message',handler);parent.postMessage({__crewForge:true,type:'request',id,appId:${JSON.stringify(appId)},method:'location',payload:{}},'*');setTimeout(()=>{if(done)return;finish();const error=new Error('Location request timed out');error.code='LOCATION_TIMEOUT';reject(error)},16000)});crew.location={...(crew.location||{}),get:locationRequest};})();<\/script>`;
      return output.replace(/<\/head>/i, extension + '</head>');
    };
  }
})();