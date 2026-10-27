// Curated catalogue + on-device (rule-based) companion, questions and drafts.
// Works offline; a server URL in Settings upgrades replies to a real model.

// Topics, moods and idea building blocks live in ideas.json (shared with the backend) and load at boot.
let INTERESTS = [];
let MOODS = [];
let IDEA_PARTS = { pools: {}, actions: [] };

// ---- Random ideas: an action template + random fillers ({place}, {person}, {ingredient}...), never a fixed list.
// filters: { time, energy, budget, setting, interest } like Discover's; avoid: titles not to repeat.
function generateIdeas({ mood, interests = [], filters = {}, n = 3, avoid = [] } = {}) {
  const m = MOODS.find(x => x.id === mood) || { cats: {}, energy: {} };
  const f = { time: 0, energy: 0, budget: 'any', setting: 'any', interest: 'any', ...filters };
  const pool = IDEA_PARTS.actions.filter(t => (!f.time || t.dur[0] <= f.time) && (!f.energy || t.e <= f.energy) &&
    (f.budget === 'any' || t.c <= (f.budget === 'free' ? 0 : 1)) &&
    (f.setting === 'any' || t.set === f.setting || t.set === 'either') && (f.interest === 'any' || t.cat === f.interest));
  const weight = t => Math.max(0.2, 1 + (interests.includes(t.cat) ? 2 : 0) + (m.cats[t.cat] || 0) + (m.energy[t.e] || 0));
  const seen = new Set(avoid.map(a => a.toLowerCase())), cats = new Set(), out = [];
  for (let tries = 0; out.length < n && pool.length && tries < 80; tries++) {
    const fresh = pool.filter(t => !cats.has(t.cat)); // one per topic first, for variety
    const from = fresh.length ? fresh : pool;
    let r = Math.random() * from.reduce((sum, t) => sum + weight(t), 0);
    const t = from.find(x => (r -= weight(x)) < 0) || from[0];
    const idea = fillIdea(t, f.time);
    if (seen.has(idea.title.toLowerCase())) continue;
    seen.add(idea.title.toLowerCase()); cats.add(t.cat); out.push(idea);
  }
  return out;
}
function fillIdea(t, maxTime) {
  const hi = maxTime ? Math.min(t.dur[1], maxTime) : t.dur[1];
  const dur = Math.min(hi, Math.max(t.dur[0], Math.round((t.dur[0] + Math.random() * (hi - t.dur[0])) / 5) * 5));
  const chosen = { min: String(dur) };
  const sub = str => str.replace(/\{(\w+)\}/g, (_, k) => (chosen[k] ??= pick(IDEA_PARTS.pools[k] || [k])));
  const sub2 = str => sub(str).replace(/\b([Aa]) (?=[aeiou])/g, '$1n '); // "a indie song" -> "an indie song"
  return { title: capital(sub2(t.t)), cat: t.cat, dur, cost: t.c, energy: t.e, setting: t.set, desc: sub2(t.d), why: sub2(t.w), steps: t.s.map(sub2) };
}

// Best guess at a mood from someone's own words, using each mood's keywords (same rules as the API).
function detectMood(text) {
  return [...MOODS].sort((a, b) => a.priority - b.priority).find(m => new RegExp(m.words, 'i').test(text))?.id;
}

// Voicepal-style draft presets, retuned for a life journal.
const DEFAULT_PRESETS = [
  { id: 'p1', name: 'Journal entry', icon: '📓', kind: 'journal' },
  { id: 'p2', name: 'Gratitude list', icon: '🌿', kind: 'gratitude' },
  { id: 'p3', name: 'Letter to future me', icon: '✉️', kind: 'letter' },
  { id: 'p4', name: 'Message to a friend', icon: '💬', kind: 'message' },
  { id: 'p5', name: 'Bullet list', icon: '•', kind: 'bullets' },
  { id: 'p6', name: 'Memory to keep', icon: '📷', kind: 'memory' }
];

const RECORD_PROMPTS = [
  'What took up most of your attention today?',
  'What is one thing you want to remember about this week?',
  'Who did you think about today, and why?',
  'What would make tomorrow feel a little better?',
  'What is something you are curious about right now?',
  'When did you feel most like yourself recently?',
  'What did you notice today that you usually walk past?',
  'What is a small win you have not celebrated yet?',
  'What are you looking forward to?',
  'What would you do with a completely free Saturday?',
  'What conversation is still on your mind?',
  'What is something you changed your mind about?'
];

// Journal topic starters: pick one on a new stream to get guided questions.
const JOURNAL_TOPICS = [
  { id: 'gratitude', name: 'Gratitude', icon: '🌿', qs: [['What are three small things that went right today?', 'Tiny counts — a good cup of chai, a kind message.'], ['Who are you grateful for, and have you told them?', 'Gratitude grows when shared.'], ['What is something you take for granted that you would miss?', 'Imagine a week without it.'], ['What challenge are you secretly grateful for?', 'Hard things often teach the most.'], ['What made you smile recently?', 'Describe it in detail.']] },
  { id: 'relationships', name: 'Relationships', icon: '🤝', qs: [['Who do you feel most yourself around?', 'What is it about them?'], ['Which relationship needs a little more attention?', 'What is one small thing you could do?'], ['When did someone last really listen to you?', 'How did it feel?'], ['Is there a conversation you have been putting off?', 'What would you say if it went well?'], ['Who would you like to know better?', 'What would you ask them?']] },
  { id: 'purpose', name: 'Work & purpose', icon: '🧭', qs: [['What part of your work gives you energy?', 'And which part drains it?'], ['What would you do if money did not matter?', 'Be honest, not sensible.'], ['What are you learning right now?', 'At work or anywhere.'], ['What does a good day at work look like?', 'Describe it hour by hour.'], ['What would you like to be known for?', 'In five years, what do people say about you?']] },
  { id: 'health', name: 'Body & health', icon: '💚', qs: [['How is your body feeling right now?', 'Scan from head to toe.'], ['How have you been sleeping?', 'What helps, what gets in the way?'], ['What kind of movement do you actually enjoy?', 'Not what you think you should do.'], ['What is one habit you would like to change?', 'Why now?'], ['When do you feel most energetic?', 'What were you doing?']] },
  { id: 'phone', name: 'Screen time', icon: '📱', qs: [['When do you reach for your phone without thinking?', 'Times, places, feelings.'], ['How do you feel after a long scroll?', 'Honestly, in one word, then explain.'], ['What would you do with an extra hour a day?', 'Be specific.'], ['Which apps add to your life, and which take from it?', 'Sort them into two lists.'], ['What did you enjoy doing before smartphones?', 'Could you do it again this week?']] },
  { id: 'dreams', name: 'Dreams & goals', icon: '✨', qs: [['What do you want your life to look like in a year?', 'Describe an ordinary Tuesday.'], ['What is a dream you have quietly given up on?', 'Is it really gone?'], ['What is one thing you would try if you could not fail?', 'And what is the first tiny step?'], ['Who inspires you right now?', 'What about them?'], ['What would make this year feel worth it?', 'One thing is enough.']] },
  { id: 'memories', name: 'Memories', icon: '📷', qs: [['What is your favourite childhood memory?', 'Where were you? Who was there?'], ['What is a place that feels like home?', 'Describe the smell, the sounds.'], ['What is the best trip you have ever taken?', 'What made it special?'], ['Who taught you something important when you were young?', 'What was it?'], ['What is a memory that always makes you laugh?', 'Tell it like a story.']] },
  { id: 'feelings', name: 'Feelings', icon: '🌊', qs: [['What emotion has been visiting you most lately?', 'Where do you feel it in your body?'], ['What is weighing on you right now?', 'Put it down here for a moment.'], ['What would help you feel a little lighter?', 'Something small and doable.'], ['When did you last cry or laugh really hard?', 'What brought it on?'], ['What do you need more of right now?', 'Rest, company, space, fun?']] },
  { id: 'creativity', name: 'Creativity', icon: '🎨', qs: [['What did you love making as a kid?', 'Drawing, building, writing, cooking?'], ['What idea keeps coming back to you?', 'Maybe it wants to be made.'], ['What would you create if no one would ever see it?', 'Freedom changes everything.'], ['Who is a creator you admire?', 'What do they do differently?'], ['What is a small creative project you could finish this week?', 'Keep it tiny.']] },
  { id: 'money', name: 'Money', icon: '🪙', qs: [['What did you spend money on recently that made you happy?', 'And what did not?'], ['What does financial security mean to you?', 'A number, a feeling, a situation?'], ['What money habit did you learn growing up?', 'Do you want to keep it?'], ['What is one experience worth saving for?', 'Why that one?'], ['Where does your money quietly leak?', 'No judgement — just notice.']] }
];

const STOP = new Set('about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just like me more most my myself no nor not now of off on once only or other our ours out over own really same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself going thing things think thought want get got make made feel felt spent keep plan today yesterday tomorrow maybe kind lot much still even well know dont didnt im ive its thats something someone every'.split(' '));

function sentencesOf(text) {
  return (text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 2);
}

function keywords(text, n = 4) {
  const freq = {};
  (text.toLowerCase().match(/[a-zÀ-ɏ']{4,}/g) || []).forEach(w => {
    w = w.replace(/'s$|'/g, '');
    if (!STOP.has(w) && !/(ed|ly|ing)$/.test(w) || /^(cooking|reading|writing|running|painting|walking|wedding|morning|evening|feeling|meeting|building|learning|singing|dancing|drawing|swimming|gardening)$/.test(w)) freq[w] = (freq[w] || 0) + 1 + w.length / 20;
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function autoTitle(text) {
  const s = sentencesOf(text)[0] || text || '';
  const words = s.replace(/[.!?,;:]+$/, '').split(' ').filter(Boolean);
  if (!words.length) return '';
  const t = words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// "Shadow reader": three follow-up questions grounded in the stream.
const Q_TEMPLATES = [
  k => [`What first got you thinking about ${k}?`, 'Go back to the moment it started — where were you, what happened?'],
  k => [`How do you honestly feel about ${k}?`, 'Name the feeling first, then explain it.'],
  k => [`What would a good next step with ${k} look like?`, 'Something small you could actually do this week.'],
  k => [`Who else would you want to talk to about ${k}?`, 'Sharing one thought is often how connection starts.'],
  k => [`What surprised you about ${k}?`, 'The unexpected parts are usually the ones worth keeping.'],
  k => [`If ${k} went really well, what would be different?`, 'Picture it a month from now.'],
  k => [`What are you avoiding saying about ${k}?`, 'You can keep this private. Just say it here.'],
  k => [`What would you tell a friend going through the same thing with ${k}?`, 'We are often kinder to others than to ourselves.'],
  k => [`What did ${k} teach you about yourself?`, 'Look for the lesson, not the verdict.'],
  k => [`How will you feel about ${k} a year from now?`, 'Zoom out. Does it get bigger or smaller?'],
  k => [`What is one thing about ${k} you are proud of?`, 'Credit yourself — even a little.']
];
const GENERIC_Q = [
  ['What is on your mind right now?', 'Start anywhere. You can tidy it up later.'],
  ['What was the best part of today?', 'Even a small moment counts.'],
  ['What drained your energy recently?', 'Noticing it is the first step to changing it.'],
  ['Who made your week better?', 'Maybe they would like to know.'],
  ['What do you want more of in your life?', 'Not what you should want — what you actually want.'],
  ['What did you do today that you did not have to?', 'Choices you make freely say a lot about you.'],
  ['When did you last lose track of time — in a good way?', 'That is a clue to what absorbs you.']
];

function followUps(stream, seed = 0) {
  const text = stream.entries.map(e => (e.q ? e.q + ' ' : '') + (e.text || '')).join(' ');
  const asked = new Set(stream.entries.filter(e => e.q).map(e => e.q));
  const keys = keywords(text, 6);
  const out = [];
  let i = seed;
  for (const k of keys) {
    if (out.length === 3) break;
    const [q, ctx] = Q_TEMPLATES[i++ % Q_TEMPLATES.length](k);
    if (!asked.has(q)) out.push({ q, ctx });
  }
  for (let j = seed; out.length < 3 && j < seed + GENERIC_Q.length; j++) {
    const [q, ctx] = GENERIC_Q[j % GENERIC_Q.length];
    if (!asked.has(q) && !out.some(o => o.q === q)) out.push({ q, ctx });
  }
  return out;
}

function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Turn a stream into a first draft. Returns { title, body } where body uses
// "## " headings and "- " bullets.
function localDraft(stream, preset, custom) {
  const entries = stream.entries.filter(e => (e.text || '').trim());
  const all = entries.map(e => e.text.trim()).join(' ');
  const free = entries.filter(e => !e.q).map(e => e.text.trim()).join(' ');
  const clean = t => sentencesOf(t).map(s => capital(s.replace(/\b(um+|uh+|like,|you know,)\s*/gi, '')));
  const sents = clean(all);
  const keys = keywords(all, 3);
  const topic = stream.title && !/^untitled/i.test(stream.title) ? stream.title : (autoTitle(all) || 'Today');
  const qa = entries.filter(e => e.q);
  const kind = custom ? 'custom' : preset.kind;
  // Journal entries put Q&A in their own sections, so keep answers out of the free text.
  const base = kind === 'journal' ? clean(free) : sents;
  const paras = [];
  for (let i = 0; i < base.length; i += 3) paras.push(base.slice(i, i + 3).join(' '));
  const positive = /(grateful|thank|love|enjoy|happy|glad|good|great|nice|kind|beautiful|fun|laugh|proud|calm|peace)/i;

  switch (kind) {
    case 'gratitude': {
      const good = sents.filter(s => positive.test(s));
      const list = (good.length ? good : sents).slice(0, 7);
      return { title: 'Things I am grateful for', body: list.map(s => '- ' + s).join('\n') || '- Taking a moment to write this.' };
    }
    case 'letter':
      return { title: 'Dear future me', body: `Dear future me,\n\nRight now I am thinking about ${keys.join(', ') || 'a lot of things'}.\n\n${paras.join('\n\n')}\n\nI hope you remember how this felt — and what you chose to do next.\n\nWith love,\nMe, ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` };
    case 'message':
      return { title: 'A note to send', body: `Hey! I was just thinking about ${keys[0] || 'you'} and wanted to share something.\n\n${sents.slice(0, 3).join(' ')}\n\nWould love to hear what you think — want to catch up this week?` };
    case 'bullets':
      return { title: topic, body: sents.map(s => '- ' + s.replace(/[.]$/, '')).join('\n') };
    case 'memory':
      return { title: topic, body: `${paras[0] || ''}\n\n## Why I want to remember this\n${sents.filter(s => positive.test(s)).slice(0, 2).join(' ') || sents.slice(-2).join(' ')}` };
    case 'custom':
      return { title: `${capital(custom)}: ${topic}`, body: paras.join('\n\n') };
    default: {
      let body = paras.slice(0, 2).join('\n\n');
      qa.forEach(e => { body += `\n\n## ${e.q}\n${capital(e.text.trim())}`; });
      if (paras.length > 2) body += `\n\n## More thoughts\n${paras.slice(2).join('\n\n')}`;
      return { title: topic, body: body.trim() };
    }
  }
}

// ---- Companion memory: things people say about their situation or tastes, kept across chats.
// Situations (can't go out, short on time...) fade after a few hours; likes and dislikes stay until deleted.
const HOURS = 36e5;
const LEARN = [
  { key: 'indoor', re: /\b((can'?t|cannot|unable to|not able to) (go|get|step) (out|outside)|(stuck|staying) (at|in) (home|the house|my room)|it'?s raining|at work|in (the )?office|at my desk|in class)\b/i, note: 'Can’t go out right now', say: 'you can’t go out right now', set: { setting: 'indoor' }, ttl: 6 * HOURS },
  { key: 'free', re: /\b((no|not much|short on|tight on|low on) (money|cash|budget)|broke|can'?t afford|no budget)\b/i, note: 'Short on money', say: 'you’re keeping it free', set: { budget: 'free' }, ttl: 72 * HOURS },
  { key: 'energy', re: /\b(too tired|no energy|exhausted|drained|worn out|so tired)\b/i, note: 'Low on energy', say: 'you’re low on energy', set: { energy: 1 }, ttl: 6 * HOURS },
  { key: 'quiet', re: /\b((can'?t|cannot) (make noise|be loud)|(everyone|people|family|baby) (is |are )?(asleep|sleeping)|late at night)\b/i, note: 'Needs something quiet', say: 'it needs to be quiet', set: { energy: 1 }, ttl: 6 * HOURS },
  { key: 'time', re: /\b(?:only|just) (?:have |got )?(\d{1,3}) ?(?:min|mins|minutes)\b/i, note: m => `Only has ${m[1]} minutes`, say: m => `you only have ${m[1]} minutes`, set: m => ({ time: Math.max(5, +m[1]) }), ttl: 3 * HOURS },
  { key: m => 'like:' + m[2].toLowerCase(), re: /\bi (love|like|enjoy|am into|'m into) ([a-z][a-z ]{2,30}?)(?:[.,!?]|$| and | but )/i, note: m => `Enjoys ${m[2].trim()}`, say: m => `you enjoy ${m[2].trim()}`, ttl: 0 },
  { key: m => 'dislike:' + m[2].toLowerCase(), re: /\bi (hate|don'?t like|do not like|dislike|can'?t stand) ([a-z][a-z ]{2,30}?)(?:[.,!?]|$| and | but )/i, note: m => `Doesn’t like ${m[2].trim()}`, say: m => `you don’t like ${m[2].trim()}`, ttl: 0 }
];
// Returns new or refreshed notes found in one message: [{ key, text, set, until }]
function learnFrom(text, now = Date.now()) {
  const out = [];
  for (const l of LEARN) {
    const m = text.match(l.re); if (!m) continue;
    const call = v => (typeof v === 'function' ? v(m) : v);
    out.push({ key: call(l.key), text: call(l.note), say: call(l.say), set: call(l.set) || null, until: l.ttl ? now + l.ttl : 0 });
  }
  return out;
}
// Merge notes into memory (newest wins per key), dropping expired ones; at most 20 kept.
function remember(notes, fresh, now = Date.now()) {
  const byKey = new Map(notes.filter(n => !n.until || n.until > now).map(n => [n.key, n]));
  for (const n of fresh) byKey.set(n.key, n);
  return [...byKey.values()].slice(-20);
}
// Filters implied by what someone has told us (e.g. "can't go out" -> indoor ideas only).
const memoryFilters = (notes, now = Date.now()) => Object.assign({}, ...notes.filter(n => n.set && (!n.until || n.until > now)).map(n => n.set));

// Companion: warm, honest, never claims to be human.
// Same tripwire as the API's: runs before anything else, not a clinical risk detector.
const CRISIS = /\b(kill myself|suicid\w*|end my life|take my own life|want to die|don'?t want to live|do not want to live|better off dead|hurt myself|harm myself|self[- ]?harm|cut myself|plan to (kill|hurt|harm) myself)\b/i;
const INTENTS = [
  // Short replies first: they answer the last message rather than start a topic.
  { id: 'no', re: /^\s*(no+|nope|nah|not really|nothing|never mind|nvm)\W*$/i },
  { id: 'yes', re: /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|go on|alright|why not)\W*$/i },
  { id: 'good', re: /^\s*(i'?m |i am |i feel |im )?(feeling )?(so |pretty |really )?(good|great|fine|happy|amazing|awesome|not bad|okay|chill|relaxed)\b/i },
  { id: 'hello', re: /^\s*(hi+|hey+|hello+|yo+|sup|hola|namaste|good (morning|evening|afternoon))\b/i },
  { id: 'thanks', re: /^\s*(thanks|thank you|ty|cheers|ok thanks|great,? thanks)/i },
  { id: 'scroll', re: /\b(scroll\w*|doom\w*|instagram|insta|reels|tiktok|youtube|shorts|feed|bored|boring|nothing to do|wasting time|on my phone)\b/i },
  { id: 'lonely', re: /\b(lonely|alone|isolated|no friends|miss (him|her|them|people|my \w+)|nobody)\b/i },
  { id: 'anxious', re: /\b(anxious|anxiety|stress\w*|overwhelm\w*|panic\w*|worried|nervous|too much)\b/i },
  { id: 'tired', re: /\b(tired|exhausted|drained|sleepy|no energy|burn(ed|t)? out)\b/i },
  { id: 'low', re: /\b(sad|down|low|depress\w*|unhappy|cry\w*|empty|hopeless)\b/i },
  { id: 'starter', re: /\b(conversation starter|what (do|should) i say|talk to|reach out|text (him|her|them))\b/i },
  { id: 'idea', re: /\b(idea|suggest\w*|what (should|can) i do|recommend\w*|activity|something to do|give me one)\b/i },
  { id: 'hobby', re: /\b(gaming|games?|playing|football|cricket|music|guitar|reading|books?|drawing|painting|coding|anime|movies?|gym|dance|dancing|cooking|chess)\b/i }
];
// Hobbies -> the closest idea topic; on-screen ones get an off-screen idea with a similar feel.
const HOBBY_TOPIC = { gaming: 'play', games: 'play', game: 'play', playing: 'play', chess: 'play', anime: 'creative', movies: 'creative', movie: 'creative', coding: 'learning',
  football: 'active', cricket: 'active', gym: 'active', dance: 'active', dancing: 'active', music: 'music', guitar: 'music', reading: 'learning', books: 'learning', book: 'learning',
  drawing: 'creative', painting: 'creative', cooking: 'cooking' };
const ON_SCREEN = new Set(['gaming', 'games', 'game', 'playing', 'anime', 'movies', 'movie', 'coding']);

const STARTERS = [
  '“I saw something today that reminded me of you — how have you been?”',
  '“What is one good thing that happened to you this week?”',
  '“Random question: what are you looking forward to right now?”',
  '“I realised we have not talked in ages. Free for a quick call this week?”',
  '“I just remembered that time we… do you remember it too?”',
  '“I am trying to spend less time on my phone. Want to grab chai instead of texting?”',
  '“What is something you have been really into lately?”',
  '“I could use your advice on something small — got five minutes?”'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Turning down the last suggestion ("I can't", "not now", "something else").
const REJECT = /\b(can'?t|cannot|won'?t|no thanks|nah|not (now|today|really|feeling it|for me)|don'?t (want|feel like)|something else|another one|different idea|not possible|no$)/i;
const FOLLOW_UP = {
  scroll: 'What usually happens right before you start scrolling: boredom, avoiding something, or just habit?',
  lonely: 'Who is someone you would actually like to hear from this week?',
  anxious: 'What is the one thing on your mind that feels biggest right now?',
  tired: 'Is it sleepy-tired or drained-tired? They need different kinds of rest.',
  low: 'Do you want to talk it through, or would something small and kind for yourself help more?',
  default: 'I am listening. What would make the next hour feel a little better?'
};

// ctx: { history: earlier messages in this chat, notes: remembered notes, suggest({ mood, filters, avoid }), person(), ideaById(id) }
function localReply(text, ctx) {
  const history = ctx.history || [];
  const r = composeReply(text, ctx, history);
  // Never say the exact same thing twice in a row.
  const prev = [...history].reverse().find(m => m.role === 'assistant')?.content;
  if (r.content === prev) {
    const a = ctx.suggest({ filters: memoryFilters(ctx.notes || []) });
    return { ...r, content: a ? `Let me try something different: how about “${a.title}”? ${a.dur} minutes. ${a.why}` : 'Tell me a little more, and I will try to be more useful.', actions: a ? [{ label: `Try: ${a.title}`, a: 'activity', v: a.id }] : [] };
  }
  return r;
}

function composeReply(text, ctx, history) {
  if (CRISIS.test(text)) {
    return { content: 'I am really glad you told me. I am an AI, so I cannot be there the way a person can — but you deserve support right now. If you might be in danger, please call 112 (India emergency) or your local emergency number. In India you can also call Tele MANAS on 14416, free and 24/7. Is there someone you trust you could message right now?', actions: [{ label: 'Open People', a: 'tab', v: 'life:people' }] };
  }
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  const lastIdeaId = lastAssistant?.actions?.find(a => a.a === 'activity')?.v;
  const lastIdea = lastIdeaId && ctx.ideaById(lastIdeaId);
  const shownTitles = history.flatMap(m => (m.actions || []).filter(a => a.a === 'activity').map(a => ctx.ideaById(a.v)?.title)).filter(Boolean);
  const learned = learnFrom(text);
  const hobby = text.match(INTENTS.find(i => i.id === 'hobby').re)?.[1]?.toLowerCase();
  if (hobby) learned.push({ key: 'like:' + hobby, text: `Enjoys ${hobby}`, say: `you enjoy ${hobby}`, set: null, until: 0 });
  const filters = memoryFilters([...(ctx.notes || []), ...learned]);
  const ownIntent = INTENTS.find(i => i.re.test(text))?.id;
  // A real sentence with no clear topic continues the previous message's topic; short replies never inherit one.
  const prevUser = [...history].reverse().find(m => m.role === 'user');
  const carried = !ownIntent && text.trim().split(/\s+/).length >= 4 && prevUser ? INTENTS.find(i => i.re.test(prevUser.content))?.id : undefined;
  const intent = ownIntent || carried || 'default';
  const moodFor = { scroll: 'restless', lonely: 'lonely', anxious: 'anxious', tired: 'tired', low: 'low', good: 'good' };
  const suggest = extra => ctx.suggest({ mood: moodFor[intent], filters: { ...filters, ...extra }, avoid: shownTitles });
  const btn = a => (a ? [{ label: `Try: ${a.title}`, a: 'activity', v: a.id }, { label: 'Something else', a: 'quickSay', v: 'Something else' }] : []);
  const heard = learned.filter(n => !n.key.startsWith('like:' + hobby)).map(n => n.say).join(' and ');
  const note = heard ? `I will keep in mind: ${heard}. ` : '';
  const said = new Set(history.filter(m => m.role === 'assistant').map(m => m.content));

  if (lastIdea && (REJECT.test(text) || ownIntent === 'no') && !['lonely', 'anxious', 'low'].includes(ownIntent)) {
    // "can't" about an outdoor idea usually means they can't go out right now.
    const extra = /can'?t|cannot|not possible/i.test(text) && lastIdea.setting === 'outdoor' && !filters.setting ? { setting: 'indoor' } : {};
    if (extra.setting) learned.push(learnFrom("can't go out")[0]);
    const a = suggest(extra);
    const why = heard ? `Got it: ${heard}. ` : extra.setting ? 'Fair enough, let us keep it indoors. ' : 'No problem. ';
    return { content: a ? `${why}How about “${a.title}” instead? ${a.dur} minutes. ${a.why}` : `${why}What would feel doable right now?`, actions: btn(a), learned };
  }
  if (lastIdea && ownIntent === 'yes') {
    return { content: `Great. Tap “Try” to start “${lastIdea.title}”, and come back and tell me how it went.`, actions: [{ label: `Try: ${lastIdea.title}`, a: 'activity', v: lastIdea.id }], learned };
  }
  const person = ctx.person();
  const a = ['scroll', 'tired', 'idea', 'good', 'yes'].includes(intent) || learned.length ? suggest(hobby && !ownIntent?.match(/scroll|tired|low|lonely|anxious/) ? { interest: HOBBY_TOPIC[hobby] } : {}) : null;
  switch (intent) {
    case 'scroll':
      return { content: `${note}That pull to keep scrolling is real — apps are built for it, so it is not a willpower failure. Want to swap the next ${a ? a.dur : 15} minutes for something you will actually remember? ${a ? `“${a.title}” could fit: ${a.why.toLowerCase()}` : ''}`, actions: [...btn(a).slice(0, 1), { label: '40-second pause', a: 'pause' }], learned };
    case 'lonely':
      return { content: `Feeling lonely is hard, and it is more common than it looks from the outside. One small step: reach out to one person, even briefly.${person ? ` You noted ${person.name} as someone to reconnect with — maybe today?` : ''} You could open with: ${pick(STARTERS)}`, actions: [{ label: 'People to reconnect', a: 'tab', v: 'life:people' }], learned };
    case 'anxious':
      return said.has(ANXIOUS_FIRST)
        ? { content: FOLLOW_UP.anxious, actions: [{ label: 'Breathe with me', a: 'pause' }], learned }
        : { content: ANXIOUS_FIRST, actions: [{ label: 'Breathe with me', a: 'pause' }, { label: 'Write it out', a: 'journal' }], learned };
    case 'tired':
      return { content: `${note}Rest is not something you have to earn. If you want something gentle that is not a screen${a ? `, “${a.title}” takes ${a.dur} minutes and asks very little.` : ', try ten minutes of stretching.'}`, actions: btn(a), learned };
    case 'low':
      return { content: 'I am sorry you are feeling low. You do not have to fix it right now. Sometimes it helps to say what is going on out loud — your Journal is private, and you can just talk. Want to try, or would you rather tell me more here?', actions: [{ label: 'Record a thought', a: 'record' }], learned };
    case 'starter':
      return { content: `Keep it light and specific. A few openers:\n\n${STARTERS.slice(0, 3).join('\n')}\n\nThe goal is not a perfect message — just a door they can walk through.`, actions: [{ label: 'People to reconnect', a: 'tab', v: 'life:people' }], learned };
    case 'good':
      return { content: `Love that. What is making it a good one?${a ? ` If you want to make the most of it: “${a.title}” (${a.dur} min).` : ''}`, actions: btn(a), learned };
    case 'no':
      return { content: 'That is okay, no pressure. Would a small idea for the next half hour help, or would you rather just chat?', actions: [{ label: 'Give me an idea', a: 'quickSay', v: 'Give me an idea' }, { label: 'Just chat', a: 'quickSay', v: 'I just want to chat' }], learned };
    case 'yes':
    case 'idea':
      return { content: a ? `${note}Here is one: “${a.title}”. ${a.desc} ${a.why}` : 'Discover can find a few ideas for your time and energy.', actions: [...btn(a), { label: 'Open Discover', a: 'tab', v: 'discover' }], learned };
    case 'hobby':
      return ON_SCREEN.has(hobby)
        ? { content: `Nice, what kind of ${hobby} are you into? Some of it leaves you feeling good, and some of it is just another feed.${a ? ` If you want something with a similar feel off-screen: “${a.title}” (${a.dur} min).` : ''}`, actions: btn(a), learned }
        : { content: `Oh nice, tell me more about the ${hobby}.${a ? ` Here is a fresh way into it: “${a.title}” (${a.dur} min). ${a.why}` : ''}`, actions: btn(a), learned };
    case 'thanks':
      return { content: 'Any time. Go enjoy the next bit of your day. 🌿', actions: [], learned };
    case 'hello':
      return { content: said.size ? 'Hey again! What is on your mind?' : 'Hi! What do you need right now: an idea, someone to think out loud with, or a little calm?', actions: [], learned };
    default:
      if (learned.length && a) return { content: `${note}Here is one that fits: “${a.title}” (${a.dur} min). ${a.why}`, actions: btn(a), learned };
      return { content: said.has(FOLLOW_UP.default) ? 'Tell me a bit more. What has today been like so far?' : FOLLOW_UP.default, actions: [], learned };
  }
}
const ANXIOUS_FIRST = 'That sounds like a lot to carry. Let us slow things down for a second: name 5 things you can see, 4 you can hear, 3 you can touch. Then, what is the one thing actually in your control in the next hour?';
