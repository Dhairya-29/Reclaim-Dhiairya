// Self-check for the on-device journal/companion logic: `node check.js`
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/data.js', 'utf8') + ';this.X={followUps,localDraft,localReply,keywords,autoTitle,DEFAULT_PRESETS}', ctx);
const { followUps, localDraft, localReply, keywords, autoTitle, DEFAULT_PRESETS } = ctx.X;

const st = { title: 'Untitled stream', entries: [
  { text: 'I spent the evening cooking with my sister. It was really fun and I am grateful for her.' },
  { q: 'What surprised you about cooking?', text: 'How calm it made me feel.' }
] };

assert.ok(keywords(st.entries[0].text).includes('cooking'));
assert.strictEqual(autoTitle('hello there. second'), 'Hello there');

const qs = followUps(st);
assert.strictEqual(qs.length, 3);
assert.ok(!qs.some(q => q.q === 'What surprised you about cooking?'), 'already-answered question repeated');
assert.strictEqual(followUps({ entries: [] }).length, 3, 'empty stream still gets prompts');

for (const p of DEFAULT_PRESETS) { const d = localDraft(st, p); assert.ok(d.title && d.body, p.name); }
assert.ok(localDraft(st, DEFAULT_PRESETS[0]).body.includes('## What surprised you about cooking?'));
assert.ok(localDraft(st, null, 'poem').title.startsWith('Poem'));

// Shared building blocks (moods also read by the backend) load like the app does.
const cat = JSON.parse(fs.readFileSync(__dirname + '/ideas.json', 'utf8'));
vm.runInContext(`INTERESTS = ${JSON.stringify(cat.topics)}; MOODS = ${JSON.stringify(cat.moods)}; IDEA_PARTS = ${JSON.stringify({ pools: cat.pools, actions: cat.actions })};
  this.Y = { generateIdeas, learnFrom, remember, memoryFilters, detectMood, CRISIS };`, ctx);
const { generateIdeas, learnFrom, remember, memoryFilters, detectMood, CRISIS } = ctx.Y;

// Ideas are generated, valid, varied and honour filters.
const topicIds = new Set(cat.topics.map(t => t[0]));
assert.ok(cat.actions.length >= 50 && new Set(cat.actions.map(a => a.cat)).size === topicIds.size, 'every topic has actions');
const titles = new Set();
for (let i = 0; i < 300; i++) {
  const f = [{}, { time: 15 }, { setting: 'indoor', budget: 'free' }, { energy: 1 }, { interest: 'music' }][i % 5];
  for (const a of generateIdeas({ mood: ['tired', 'restless', undefined][i % 3], filters: f })) {
    titles.add(a.title);
    assert.ok(!/[{}]/.test([a.title, a.desc, a.why, ...a.steps].join(' ')), 'unfilled slot: ' + a.title);
    assert.ok(topicIds.has(a.cat) && a.dur >= 5 && a.dur % 5 === 0 && a.steps.length, a.title);
    if (f.time) assert.ok(a.dur <= f.time, a.title);
    if (f.setting) assert.ok(a.setting !== 'outdoor' && a.cost === 0, a.title);
    if (f.energy) assert.strictEqual(a.energy, 1);
    if (f.interest) assert.strictEqual(a.cat, 'music');
  }
}
assert.ok(titles.size > 300, `expected lots of different ideas, got ${titles.size}`);
const batch = generateIdeas({ n: 3 });
assert.strictEqual(new Set(batch.map(a => a.cat)).size, 3, 'a batch spans different topics');
assert.ok(generateIdeas({ n: 3, avoid: batch.map(a => a.title) }).every(a => !batch.some(b => b.title === a.title)), 'avoid list respected');
console.log('ideas ok:', titles.size, 'different titles in 300 batches');

// Memory: situations are learned and fade, tastes persist, newest wins.
const t0 = Date.parse('2026-10-26T10:00:00Z');
let notes = remember([], learnFrom("I'm at work and only have 10 minutes", t0), t0);
const same = (x, y, m) => assert.strictEqual(JSON.stringify(x), JSON.stringify(y), m); // objects from the vm sandbox
same(memoryFilters(notes, t0), { setting: 'indoor', time: 10 });
same(memoryFilters(notes, t0 + 7 * 36e5), {}, 'situations expire');
notes = remember(notes, learnFrom('I love old Bollywood songs.', t0), t0);
assert.ok(remember(notes, [], t0 + 99 * 36e5).some(n => n.text === 'Enjoys old Bollywood songs'), 'tastes stay');
assert.strictEqual(remember(notes, learnFrom('only have 30 minutes', t0), t0).filter(n => n.key === 'time').length, 1);

// The companion holds the conversation: turning down an outdoor idea gets an indoor one, never the same one.
const ideas = {}; let k = 0;
const companion = (history, memo = []) => ({ history, notes: memo, person: () => null, ideaById: id => ideas[id],
  suggest: o => { const [a] = generateIdeas({ ...o, n: 1 }); if (a) { a.id = 'g' + k++; ideas[a.id] = a; } return a; } });
const swim = { id: 'swim', title: 'Swim a few laps', setting: 'outdoor', dur: 45, cost: 1, energy: 3, cat: 'active', why: '' };
ideas.swim = swim;
const history = [{ role: 'user', content: 'I keep doomscrolling' }, { role: 'assistant', content: 'Try swimming?', actions: [{ a: 'activity', v: 'swim' }] }];
for (let i = 0; i < 20; i++) {
  const r = localReply("I can't actually go for a swim right now", companion(history));
  const next = ideas[r.actions[0].v];
  assert.ok(next && next.setting !== 'outdoor' && next.title !== swim.title, 'offers an indoor alternative');
  assert.ok(!/tell me more about right/i.test(r.content));
  assert.ok(r.learned.some(n => n.key === 'indoor'), 'remembers they cannot go out');
}
const later = localReply('give me an idea', companion([], remember([], learnFrom('I have no money', t0), Date.now())));
assert.strictEqual(ideas[later.actions[0].v].cost, 0, 'a later chat uses what was said before');
assert.ok(localReply('I want to kill myself', companion([])).content.includes('14416'), 'crisis reply must give helpline');
assert.ok(localReply('I keep doomscrolling reels', companion([])).actions.some(a => a.a === 'pause'));
console.log('companion memory ok');

// Moods drive detection (same keywords the API uses).
assert.strictEqual(detectMood('so drained, no energy'), 'tired');
assert.strictEqual(detectMood('feeling lonely and stressed'), 'lonely'); // priority: lonely beats anxious
assert.strictEqual(detectMood('bored, just scrolling reels'), 'restless');
assert.strictEqual(detectMood('mmm'), undefined);
for (const m of cat.moods) assert.ok(m.label && m.msg && m.cats && m.energy && new RegExp(m.words, 'i'), m.id);
assert.ok(CRISIS.test("I don't want to live") && !CRISIS.test('I want to live fully'));
console.log('moods ok');
