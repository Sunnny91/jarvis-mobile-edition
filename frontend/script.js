// ===== 3. TOOLS (THE HANDS) — 5 TOOLS =====
async function handleTools(text){
  const t = text.toLowerCase();

  // 1. Time
  if(/\btime\b/.test(t) || t.includes('టైమ్') || t.includes('సమయం')){
    return 'The time is ' + new Date().toLocaleTimeString('en-IN') + ', Boss.';
  }

  // 2. Weather
  if(t.includes('weather') || t.includes('వాతావరణం')){
    if(!navigator.geolocation) return 'Location is not supported here, Boss.';
    return await new Promise(res => {
      navigator.geolocation.getCurrentPosition(async p => {
        try{
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current_weather=true`;
          const r = await fetch(url);
          const d = await r.json();
          res(`It is ${d.current_weather.temperature} degrees Celsius now, Boss.`);
        }catch(e){ res('Weather service error, Boss.'); }
      }, () => res('I need location permission for weather, Boss.'),
      { timeout: 10000 });
    });
  }

  // 3. Timer
  const m = t.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i);
  if((t.includes('timer') || t.includes('టైమర్')) && m){
    const amount = parseInt(m[1]);
    const unit = m[2].toLowerCase();
    const factor = /^(hours?|hrs?)/.test(unit) ? 3600000
                 : /^(seconds?|secs?)/.test(unit) ? 1000
                 : 60000;
    setTimeout(() => speak(`టైమర్ పూర్తైంది! ${amount} ${unit} అయ్యాయి.`), amount * factor);
    return `Timer set for ${amount} ${unit}.`;
  }

  // 4. Translate
  if(t.includes('translate')){
    const q = text.replace(/translate (this )?/i, '').trim() || 'hello';
    try{
      const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) + '&langpair=en|te');
      const d = await r.json();
      return 'In Telugu: ' + d.responseData.translatedText;
    }catch(e){ return 'Translate error, Boss.'; }
  }

  // 5. YouTube Play
  if(/\b(play|youtube)\b/.test(t)){
    const q = text.replace(/^\s*(play|youtube)\s+(search\s+)?/i, '').trim();
    if(q){
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q));
      return 'Searching YouTube for ' + q + ', Boss.';
    }
  }

  return null; // Tool match కాకపోతే Gemini Brain కి వెళ్తుంది
}
