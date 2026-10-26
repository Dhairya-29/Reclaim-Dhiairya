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

const c = { suggest: () => ({ id: 'a1', title: 'Walk', dur: 20, why: 'Fresh air.', desc: '' }), person: () => null };
assert.ok(localReply('I want to kill myself', c).content.includes('14416'), 'crisis reply must give helpline');
assert.ok(localReply('I keep doomscrolling reels', c).actions.some(a => a.a === 'pause'));
console.log('ok');

// Shared catalogue (also read by the backend) is well-formed.
const cat = JSON.parse(fs.readFileSync(__dirname + '/activities.json', 'utf8'));
const topicIds = new Set(cat.topics.map(t => t[0]));
assert.ok(cat.activities.length >= 90 && topicIds.size >= 13);
for (const a of cat.activities) assert.ok(topicIds.has(a.cat) && a.steps.length && a.dur > 0, a.id);
assert.strictEqual(new Set(cat.activities.map(a => a.id)).size, cat.activities.length);
console.log('catalogue ok');

// Moods come from the shared catalogue and drive detection (same keywords the API uses).
vm.runInContext('MOODS = ' + JSON.stringify(cat.moods) + ';this.detectMood = detectMood; this.CRISIS = CRISIS', ctx);
assert.strictEqual(ctx.detectMood('so drained, no energy'), 'tired');
assert.strictEqual(ctx.detectMood('feeling lonely and stressed'), 'lonely'); // priority: lonely beats anxious
assert.strictEqual(ctx.detectMood('bored, just scrolling reels'), 'restless');
assert.strictEqual(ctx.detectMood('mmm'), undefined);
for (const m of cat.moods) assert.ok(m.label && m.msg && m.cats && m.energy && new RegExp(m.words, 'i'), m.id);
assert.ok(ctx.CRISIS.test("I don't want to live") && !ctx.CRISIS.test('I want to live fully'));
console.log('moods ok');
