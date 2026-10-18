// Curated catalogue + on-device (rule-based) companion, questions and drafts.
// Works offline; a server URL in Settings upgrades replies to a real model.

// Activities and topics live in activities.json (shared with the backend) and load at boot.
let ACTIVITIES = [];
let INTERESTS = [];

const MOODS = [
  ['calm', 'Calm'], ['good', 'Good'], ['tired', 'Tired'], ['restless', 'Restless'], ['low', 'Low'], ['lonely', 'Lonely']
];

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

// Companion: warm, honest, never claims to be human.
const CRISIS = /(suicid|kill myself|end my life|self[- ]?harm|hurt myself|don'?t want to (live|be alive))/i;
const INTENTS = [
  { id: 'scroll', re: /(scroll|doom|phone|instagram|reels|tiktok|youtube|shorts|feed|bored|nothing to do|wasting time)/i },
  { id: 'lonely', re: /(lonely|alone|isolated|no friends|miss (him|her|them|people)|nobody)/i },
  { id: 'anxious', re: /(anxious|anxiety|stress|overwhelm|panic|worried|nervous|too much)/i },
  { id: 'tired', re: /(tired|exhausted|drained|sleepy|no energy|burn(ed|t)? out)/i },
  { id: 'low', re: /(sad|down|low|depress|unhappy|cry|empty)/i },
  { id: 'starter', re: /(conversation starter|what (do|should) i say|talk to|reach out|text (him|her|them))/i },
  { id: 'idea', re: /(idea|suggest|what should i do|recommend|activity|something to do)/i },
  { id: 'thanks', re: /^(thanks|thank you|ty|cheers)/i },
  { id: 'hello', re: /^(hi|hey|hello|yo|good (morning|evening|afternoon))\b/i }
];

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

function localReply(text, ctx) {
  if (CRISIS.test(text)) {
    return { content: 'I am really glad you told me. I am an AI, so I cannot be there the way a person can — but you deserve support right now. If you might be in danger, please call 112 (India emergency) or your local emergency number. In India you can also call Tele MANAS on 14416, free and 24/7. Is there someone you trust you could message right now?', actions: [{ label: 'Open People', a: 'tab', v: 'life:people' }] };
  }
  const intent = (INTENTS.find(i => i.re.test(text)) || { id: 'default' }).id;
  const act = ctx.suggest(intent);
  const actBtn = act ? [{ label: `Try: ${act.title}`, a: 'activity', v: act.id }] : [];
  const person = ctx.person();
  switch (intent) {
    case 'scroll':
      return { content: `That pull to keep scrolling is real — apps are built for it, so it is not a willpower failure. Want to swap the next ${act ? act.dur : 15} minutes for something you will actually remember? ${act ? `“${act.title}” could fit: ${act.why.toLowerCase()}` : ''}`, actions: [...actBtn, { label: '40-second pause', a: 'pause' }] };
    case 'lonely':
      return { content: `Feeling lonely is hard, and it is more common than it looks from the outside. One small step: reach out to one person, even briefly.${person ? ` You noted ${person.name} as someone to reconnect with — maybe today?` : ''} You could open with: ${pick(STARTERS)}`, actions: [{ label: 'People to reconnect', a: 'tab', v: 'life:people' }, ...actBtn] };
    case 'anxious':
      return { content: 'That sounds like a lot to carry. Let us slow things down for a second: name 5 things you can see, 4 you can hear, 3 you can touch. Then, what is the one thing actually in your control in the next hour?', actions: [{ label: 'Breathe with me', a: 'pause' }, { label: 'Write it out', a: 'journal' }] };
    case 'tired':
      return { content: `Rest is not something you have to earn. If you want something gentle that is not a screen${act ? `, “${act.title}” takes ${act.dur} minutes and asks very little.` : ', try ten minutes of stretching or sitting outside.'}`, actions: actBtn };
    case 'low':
      return { content: 'I am sorry you are feeling low. You do not have to fix it right now. Sometimes it helps to say what is going on out loud — your Journal is private, and you can just talk. Want to try, or would you rather tell me more here?', actions: [{ label: 'Record a thought', a: 'record' }] };
    case 'starter':
      return { content: `Keep it light and specific. A few openers:\n\n${STARTERS.slice(0, 3).join('\n')}\n\nThe goal is not a perfect message — just a door they can walk through.`, actions: [{ label: 'People to reconnect', a: 'tab', v: 'life:people' }] };
    case 'idea':
      return { content: act ? `Here is one: “${act.title}” — ${act.desc} ${act.why}` : 'Discover has a few ideas picked for your time and energy.', actions: [...actBtn, { label: 'Open Discover', a: 'tab', v: 'discover' }] };
    case 'thanks':
      return { content: 'Any time. Go enjoy the next bit of your day. 🌿', actions: [] };
    case 'hello':
      return { content: 'Hi! What do you need right now — an idea, someone to think out loud with, or a little calm?', actions: [] };
    default: {
      const k = keywords(text, 1)[0];
      return { content: k ? `Tell me more about ${k}. What part of it matters most to you?` : 'I am listening. What would make the next hour feel worthwhile?', actions: [] };
    }
  }
}
