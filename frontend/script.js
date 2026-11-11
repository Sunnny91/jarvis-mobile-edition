// ===== 1. API KEY (asks on page open if not saved) =====
function getKey() {
  let key = localStorage.getItem('jarvis_key');
  if (!key) {
    key = prompt('Enter your Gemini API Key:');
    if (key) {
      key = key.trim();
      localStorage.setItem('jarvis_key', key);
    }
  }
  return key;
}
let API_KEY = getKey();

// ===== 2. MODELS (if one fails, the next is tried) =====
const MODELS = ["gemini-3.6-flash", "gemini-flash-latest"];

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');

// ===== 3. GEMINI BRAIN (auto-fallback) =====
async function callGemini(p) {
  if (!API_KEY) throw new Error('No API key. Reload the page and enter it.');
  let lastErr;
  for (const m of MODELS) {
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + m +
        ":generateContent?key=" + API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] })
        }
      );
      const data = await res.json();
      if (data.error) {
        const msg = data.error.message || '';
        // Wrong key: delete it so the page asks again next time
        if (/api key not valid|invalid api key/i.test(msg)) {
          localStorage.removeItem('jarvis_key');
          API_KEY = null;
          throw new Error('Invalid API key. Reload the page and enter it again.');
        }
        lastErr = new Error(msg);
        if (/high demand|temporar|quota|rate|unavailable|no longer available|deprecated|not found/i.test(msg)) continue;
        throw lastErr;
      }
      return data.candidates[0].content.parts[0].text;
    } catch (e) {
      lastErr = e;
      if (!API_KEY) break;
    }
  }
  throw lastErr;
}

async function askGemini(p) {
  add('J.A.R.V.I.S: Thinking...', 'ai');
  const bubble = chat.lastChild;
  try {
    const reply = await callGemini(p);
    bubble.innerText = 'J.A.R.V.I.S: ' + reply;
    chat.scrollTop = chat.scrollHeight;
    speak(reply);
  } catch (e) {
    bubble.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
  }
}

// ===== 4. SPEECH RECOGNITION =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = 'en-US'; // Telugu: 'te-IN'
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    add('YOU: ' + t, 'user');
    askGemini(t);
  };
  rec.onend = () => { micBtn.innerText = '🎙️'; };
  rec.onerror = () => { micBtn.innerText = '🎙️'; };
  micBtn.onclick = () => {
    try {
      rec.start();
      micBtn.innerText = 'LISTENING...';
    } catch (e) { /* already listening */ }
  };
} else {
  micBtn.onclick = () => alert('Voice input is not supported in this browser.');
}

// ===== 5. TEXT-TO-SPEECH =====
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function speak(t) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.rate = 1.05;
  u.pitch = 0.85;
  const v = voices.find(v => v.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// ===== 6. TEXT SEND =====
function sendText() {
  const t = input.value.trim();
  if (!t) return;
  add('YOU: ' + t, 'user');
  input.value = '';
  askGemini(t);
}
document.getElementById('send').onclick = sendText;
input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });

function add(t, w) {
  const d = document.createElement('div');
  d.className = 'msg ' + w;
  d.innerText = t;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}
