(() => {
  const originalValidate = window.validateGeneratedHtml;
  const originalRepair = window.buildRepairPrompt;
  if (typeof originalValidate !== 'function') return;

  const locate = (source, error) => {
    const message = String(error?.message || error || 'Unknown syntax error');
    const match = message.match(/(?:line|<anonymous>):?(\d+)(?::(\d+))?/i);
    if (!match) return { message, context: '' };
    const line = Math.max(1, Number(match[1]) || 1);
    const column = Math.max(1, Number(match[2]) || 1);
    const lines = String(source || '').split('\n');
    const start = Math.max(0, line - 3);
    const end = Math.min(lines.length, line + 2);
    const context = lines.slice(start, end).map((value, i) => `${start + i + 1}: ${value}`).join('\n').slice(0, 1800);
    return { message, context, line, column };
  };

  window.validateGeneratedHtml = function(html) {
    const issues = originalValidate(html).filter(issue => !String(issue).startsWith('JavaScript syntax error:'));
    try {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      [...doc.querySelectorAll('script:not([src])')].forEach((script, index) => {
        const source = script.textContent || '';
        try { new Function(source); }
        catch (error) {
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

  if (typeof originalRepair === 'function') {
    window.buildRepairPrompt = function(htmlOrText, issues) {
      return `${originalRepair(htmlOrText, issues)}\n\nREPAIR REQUIREMENTS:\n- For JavaScript syntax failures, use the reported inline script number and nearby code to repair the exact parse failure first.\n- Check brackets, quotes, template literals, object literals, optional chaining, and accidental prose inside JavaScript.\n- After the fix, mentally parse every inline <script> from beginning to end before returning the HTML.\n- Do not rewrite unrelated working behavior.`;
    };
  }
})();