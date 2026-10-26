"""`python -m pytest`: runs offline, no API keys needed (fake providers stand in for real models)."""
import asyncio
import os

os.environ['RECLAIM_PROVIDER'] = 'rules'
os.environ['EMOTION_CLASSIFIER_ENABLED'] = 'false'
os.environ['RECLAIM_DB'] = os.path.join(os.path.dirname(__file__), 'test.db')

import groq  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import mood  # noqa: E402
import providers  # noqa: E402

client = TestClient(main.app)


class Fake:
    name, model = 'fake', 'fake'

    def __init__(self, text='', error=None):
        self.text, self.error, self.calls = text, error, []

    async def complete(self, system, messages, max_tokens=0, effort=''):
        self.calls.append((system, messages))
        if self.error:
            raise self.error
        return self.text


@pytest.fixture(autouse=True)
def rules_provider():
    main.app.state.provider = providers.RuleProvider()


def test_health():
    r = client.get('/v1/health').json()
    assert r['status'] == 'ok' and r['topics'] >= 13 and r['moods'] == 7 and r['ideas'] == 'generated in the app'


# ---- mood check-in
@pytest.mark.parametrize('text, expected', [
    ('so drained after work, no energy', 'tired'),
    ('feeling a bit lonely tonight', 'lonely'),
    ('stressed and overwhelmed about exams', 'anxious'),
    ('bored, just scrolling reels', 'restless'),
    ('had a great day!', 'good'),
    ('mmm', 'calm'),
])
def test_detect_mood_keywords(text, expected):
    assert asyncio.run(mood.detect_mood(text))['mood'] == expected


IDEA = {'title': 'Sketch your chai cup in one line', 'topic': 'creative', 'minutes': 10, 'cost': 0, 'energy': 1,
        'setting': 'indoor', 'description': 'One pen line.', 'why': 'You look closely.', 'steps': ['Grab a pen', 'Draw']}


def model_json(*ideas, message='Sounds like a long day.'):
    import json
    return 'Sure! ' + json.dumps({'message': message, 'ideas': list(ideas)})


def test_without_model_app_generates_ideas():
    r = client.post('/v1/activities/recommend', json={'mood': 'anxious', 'text': 'great day'}).json()
    assert r['mood'] == 'anxious' and r['source'] == 'user'  # the tapped mood wins over words
    assert r['activities'] == [] and r['message'] == mood.MOODS['anxious']['msg']


def test_model_ideas_are_parsed_and_sent_constraints():
    main.app.state.provider = fake = Fake(model_json(IDEA, {**IDEA, 'title': 'Cook rajma', 'topic': 'cooking', 'minutes': 50}))
    r = client.post('/v1/activities/recommend', json={'text': 'exhausted', 'filters': {'time': 20, 'setting': 'indoor'},
                                                       'notes': ['Can’t go out right now'], 'avoid': ['Read a chapter'], 'n': 3}).json()
    assert r['message'] == 'Sounds like a long day.' and r['mood'] == 'tired'
    assert [a['title'] for a in r['activities']] == ['Sketch your chai cup in one line']  # 50-minute idea broke the 20-minute filter
    assert r['activities'][0] == {'title': 'Sketch your chai cup in one line', 'cat': 'creative', 'dur': 10, 'cost': 0, 'energy': 1,
                                  'setting': 'indoor', 'desc': 'One pen line.', 'why': 'You look closely.', 'steps': ['Grab a pen', 'Draw']}
    prompt = fake.calls[0][1][0]['content']
    assert 'at most 20 minutes' in prompt and 'indoors' in prompt and 'Can’t go out right now' in prompt and 'Read a chapter' in prompt


@pytest.mark.parametrize('bad', [
    {**IDEA, 'topic': 'skydiving'},                      # unknown topic
    {**IDEA, 'title': 'read a chapter'},                 # in the avoid list (any case)
    {**IDEA, 'description': 'Then stop taking your medication.'},
    {k: v for k, v in IDEA.items() if k != 'title'},     # missing title
])
def test_bad_model_ideas_are_dropped(bad):
    f = main.Filters()
    assert main.parse_ideas(model_json(bad), f, {'read a chapter'}, 3)[1] == []


def test_model_values_are_clamped_and_garbage_ignored():
    _, ideas = main.parse_ideas(model_json({**IDEA, 'minutes': 999, 'cost': 9, 'energy': -2, 'setting': 'space', 'steps': []}), main.Filters(), set(), 3)
    assert ideas[0]['dur'] == 180 and ideas[0]['cost'] == 2 and ideas[0]['energy'] == 1 and ideas[0]['setting'] == 'either' and ideas[0]['steps']
    assert main.parse_ideas('no json here', main.Filters(), set(), 3) == ('', [])


def test_check_in_crisis_skips_model():
    main.app.state.provider = fake = Fake('should not be used')
    r = client.post('/v1/activities/recommend', json={'text': "I don't want to live anymore"}).json()
    assert r['safety_triggered'] and '14416' in r['message'] and r['activities'] == [] and fake.calls == []


def test_classifier_labels_map_to_moods(monkeypatch):
    monkeypatch.setattr(mood.classifier, 'predict', lambda text: [{'label': 'nervousness', 'score': 0.4}])
    r = asyncio.run(mood.detect_mood('the thing tomorrow'))
    assert r['mood'] == 'anxious' and r['uncertain'] and r['source'] == mood.classifier.name


# ---- companion
CANDIDATE = {'id': 'g1', 'title': 'Stretch for 10 minutes', 'dur': 10, 'cat': 'active', 'setting': 'indoor', 'why': 'Undo the phone posture.'}


def test_rules_reply_uses_the_apps_ideas():
    r = client.post('/v1/chat', json={'message': 'I keep doomscrolling reels', 'context': {'ideas': [CANDIDATE]}}).json()
    assert r['provider'] == 'rules' and r['activity_id'] == 'g1' and 'Stretch' in r['reply']


def test_chat_sees_notes_and_candidates():
    main.app.state.provider = fake = Fake('Stay in and stretch.\n[[activity:g1]]')
    r = client.post('/v1/chat', json={'message': 'something else', 'history': [{'role': 'user', 'content': 'I keep doomscrolling'}, {'role': 'assistant', 'content': 'Try a swim?'}],
                                      'context': {'notes': ['Can’t go out right now'], 'ideas': [CANDIDATE]}}).json()
    system, messages = fake.calls[0]
    assert 'Can’t go out right now' in system and 'g1: Stretch for 10 minutes' in system
    assert [m['content'] for m in messages] == ['I keep doomscrolling', 'Try a swim?', 'something else']  # whole session is sent
    assert r['activity_id'] == 'g1' and r['reply'] == 'Stay in and stretch.'


def test_crisis_is_deterministic():
    main.app.state.provider = fake = Fake('should not be used')
    r = client.post('/v1/chat', json={'message': 'I want to kill myself'}).json()
    assert r['provider'] == 'safety' and '14416' in r['reply'] and fake.calls == []


def test_unsafe_model_reply_is_replaced():
    main.app.state.provider = Fake('Honestly, stop taking your medication.')
    assert client.post('/v1/chat', json={'message': 'hi'}).json()['reply'] == main.SAFE_FALLBACK


def test_activity_tag_parsed_and_validated():
    main.app.state.provider = fake = Fake('Try a walk.\n[[activity:g1]]')
    r = client.post('/v1/chat', json={'message': 'bored', 'history': [{'role': 'assistant', 'content': 'hi'}], 'context': {'ideas': [CANDIDATE]}}).json()
    assert r['reply'] == 'Try a walk.' and r['activity_id'] == 'g1'
    assert fake.calls[0][1][0]['role'] == 'user'  # leading assistant turn dropped
    main.app.state.provider = Fake('Nice.\n[[activity:zzz]]')
    assert client.post('/v1/chat', json={'message': 'x'}).json()['activity_id'] is None


def test_busy_provider_returns_503():
    main.app.state.provider = Fake(error=providers.ProviderError('RateLimitError', busy=True))
    assert client.post('/v1/chat', json={'message': 'hi'}).status_code == 503


def test_draft_needs_model():
    assert client.post('/v1/chat', json={'mode': 'draft', 'message': 'Draft type: Poem\n\nhello'}).status_code == 503


def test_validation():
    assert client.post('/v1/chat', json={'message': ''}).status_code == 422
    assert client.post('/v1/chat/feedback', json={'conversation_id': 'a b', 'message_id': 'm', 'rating': 'up'}).status_code == 422


def test_feedback_and_delete():
    assert client.post('/v1/chat/feedback', json={'conversation_id': 'c1', 'message_id': 'm1', 'rating': 'up'}).json()['ok']
    assert client.delete('/v1/conversations/c1').json()['deleted'] >= 1
    assert client.delete('/v1/conversations/c1').json()['deleted'] == 0


# ---- providers
def test_provider_selection(monkeypatch):
    for k in ('RECLAIM_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'GROQ_API_KEY', 'OLLAMA_BASE_URL'):
        monkeypatch.delenv(k, raising=False)
    assert providers.make_provider().name == 'rules'
    monkeypatch.setenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
    assert providers.make_provider().name == 'ollama'
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
    assert providers.make_provider().name == 'groq'
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')
    assert providers.make_provider().name == 'claude'
    monkeypatch.setenv('RECLAIM_PROVIDER', 'ollama')
    assert providers.make_provider().name == 'ollama'  # forcing beats keys


def test_groq_request_and_errors(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'gsk_test')
    p, seen = providers.GroqProvider(), {}

    class Resp:
        choices = [type('C', (), {'message': type('M', (), {'content': 'Hello there.'})()})()]

    async def ok(**kw):
        seen.update(kw)
        return Resp()

    async def limited(**kw):
        raise groq.RateLimitError('slow down', response=httpx.Response(429, request=httpx.Request('POST', 'https://x')), body=None)

    monkeypatch.setattr(p.client.chat.completions, 'create', ok)
    assert asyncio.run(p.complete('SYS', [{'role': 'user', 'content': 'hi'}])) == 'Hello there.'
    assert seen['messages'][0] == {'role': 'system', 'content': 'SYS'} and seen['reasoning_format'] == 'hidden'
    monkeypatch.setattr(p.client.chat.completions, 'create', limited)
    with pytest.raises(providers.ProviderError) as e:
        asyncio.run(p.complete('SYS', []))
    assert e.value.busy


def test_ollama_request_strips_thinking_and_maps_errors():
    p, seen = providers.OllamaProvider(), {}

    def handler(request):
        seen['url'], seen['body'] = str(request.url), __import__('json').loads(request.content)
        return httpx.Response(200, json={'message': {'content': '<think>hmm</think> Hi! '}})

    p.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert asyncio.run(p.complete('SYS', [{'role': 'user', 'content': 'hi'}], max_tokens=50)) == 'Hi!'
    assert seen['url'].endswith('/api/chat') and seen['body']['messages'][0]['role'] == 'system' and not seen['body']['stream']
    p.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(providers.ProviderError):
        asyncio.run(p.complete('SYS', []))


def test_long_notes_are_rejected():
    assert client.post('/v1/activities/recommend', json={'notes': ['x' * 500]}).status_code == 422
