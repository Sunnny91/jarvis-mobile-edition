// ===== 1. API KEY & MODELS =====
let API_KEY = localStorage.getItem('jarvis_key');
function askForKey() {
  const k = prompt('Enter your Gemini API Key:');
  if (k) { API_KEY = k.trim(); localStorage.setItem('jarvis_key', API_KEY); }
}
if (!API_KEY) askForKey();

const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
const RETRYABLE = /high demand|temporar|quota|rate|unavailable|deprecated|not found|overloaded/i;
const MAX_MEMORY = 100; // messages kept in storage
const CONTEXT_MSGS = 12; // messages sent to the model

// ===== 2. MEMORY =====
let MEMORY = [];
try { MEMORY = JSON.parse(localStorage.getItem('jarvis_memory') || '[]'); } catch (e) { MEMORY = []; }

function saveMemory() {
  if (MEMORY.length > MAX_MEMORY) MEMORY = MEMORY.slice(-MAX_MEMORY);
  try { localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY)); } catch (e) {}
  updateStatus();
}

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');

function add(text, who) {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.innerText = text;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d; // so callers can update this exact bubble
}

MEMORY.forEach(m =>
  add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));

// ===== 3. GEMINI CALLS =====
async function requestGemini(contents) {
  if (!API_KEY) { askForKey(); if (!API_KEY) throw new Error('No API key set.'); }
  let lastErr;
  for (const m of MODELS) {
    let data;
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
          body: JSON.stringify({ contents })
        });
      data = await res.json();
    } catch (netErr) {
      lastErr = new Error('Network error. Check your connection.');
      continue; // try next model
    }

    if (data.error) {
      lastErr = new Error(data.error.message);
      if (/api key/i.test(data.error.message)) {
        localStorage.removeItem('jarvis_key'); API_KEY = null;
        throw new Error('Invalid API key. Reload and enter it again.');
      }
      if (RETRYABLE.test(data.error.message)) continue; // try next model
      throw lastErr; // real error: stop here
    }

    const cand = data.candidates && data.candidates[0];
    const part = cand && cand.content && cand.content.parts && cand.content.parts[0];
    if (part && part.text) return part.text;

    lastErr = new Error(
      (data.promptFeedback && data.promptFeedback.blockReason)
        ? 'Request blocked: ' + data.promptFeedback.blockReason
        : 'Empty response from model.');
  }
  throw lastErr || new Error('All models failed.');
}

async function askGemini(p) {
  const bubble = add('J.A.R.V.I.S: Thinking...', 'ai');
  const contents = MEMORY.slice(-CONTEXT_MSGS).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: p }] });
  try {
    const reply = await requestGemini(contents);
    MEMORY.push({ role: 'user', text: p });
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();
    bubble.innerText = 'J.A.R.V.I.S: ' + reply;
    speak(reply);
  } catch (e) {
    bubble.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
  }
}

// ===== 4. VISION =====
if (camBtn && imgInput) {
  camBtn.onclick = () => imgInput.click();
  imgInput.onchange = () => {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const q = input.value.trim() || 'What do you see? Describe briefly.';
      add('YOU: [IMAGE] ' + q, 'user');
      input.value = '';
      askVision(base64, file.type, q);
    };
    reader.readAsDataURL(file);
    imgInput.value = ''; // allow picking the same file again
  };
}

async function askVision(base64, mime, q) {
  const bubble = add('J.A.R.V.I.S: Analyzing image...', 'ai');
  try {
    const reply = await requestGemini([
      { role: 'user', parts: [{ text: q }, { inline_data: { mime_type: mime, data: base64 } }] }
    ]);
    // Remember the exchange as text so follow-up questions work
    MEMORY.push({ role: 'user', text: '[Image] ' + q });
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();
    bubble.innerText = 'J.A.R.V.I.S: ' + reply;
    speak(reply);
  } catch (e) {
    bubble.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
  }
}

// ===== 5. VOICE =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let listening = false;
if (SR && micBtn) {
  const rec = new SR();
  rec.lang = 'en-US';
  rec.onresult = e => {
    const t = e.results[0][0].transcript;
    add('YOU: ' + t, 'user');
    askGemini(t);
  };
  rec.onerror = e => add('SYSTEM: Voice error - ' + e.error, 'ai');
  rec.onend = () => { listening = false; micBtn.innerText = '🎙️'; };
  micBtn.onclick = () => {
    if (listening) { rec.stop(); return; }
    try { rec.start(); listening = true; micBtn.innerText = 'LISTENING...'; } catch (e) {}
  };
}

let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function speak(text) {
  const clean = text.replace(/[*_`#>]/g, '').trim(); // don't read markdown symbols aloud
  if (!clean) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = 1.05;
  u.pitch = 0.85;
  const voice = voices.find(x => x.lang.startsWith('en'));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

// ===== 6. INPUT & CONTROLS =====
function sendText() {
  const t = input.value.trim();
  if (!t) return;
  add('YOU: ' + t, 'user');
  input.value = '';
  askGemini(t);
}
sendBtn.onclick = sendText;
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });

if (clearBtn) {
  clearBtn.onclick = () => {
    if (!confirm('Erase all saved memory?')) return;
    MEMORY = [];
    saveMemory();
    chat.innerHTML = '';
    add('SYSTEM: Memory cleared.', 'ai');
  };
}

// ===== 7. LIVE STATUS PANEL =====
function setStatus(id, ok, onText, offText) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = ok ? 'on' : 'off';
  el.textContent = '● ' + (ok ? onText : offText);
}
function updateStatus() {
  setStatus('st-net', navigator.onLine, 'ONLINE', 'OFFLINE');
  setStatus('st-ai', !!API_KEY, 'OPERATIONAL', 'NO API KEY');
  setStatus('st-voice', !!SR, 'READY', 'UNSUPPORTED');
  setStatus('st-mem', true, 'ACTIVE (' + MEMORY.length + ')', 'INACTIVE');
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);
updateStatus();
