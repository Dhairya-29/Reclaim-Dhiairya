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
    assert r['status'] == 'ok' and r['activities'] >= 90 and r['topics'] >= 13 and r['moods'] == 7


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


def test_tapped_mood_wins_and_picks_fit():
    r = client.post('/v1/activities/recommend', json={'mood': 'anxious', 'text': 'great day', 'interests': []}).json()
    assert r['mood'] == 'anxious' and r['source'] == 'user' and len(r['activities']) == 3
    cats = [a['cat'] for a in r['activities']]
    assert cats[0] == 'mindful' and 'selfcare' in cats  # the mood's topics lead; variety fills the rest
    assert r['message'] == mood.MOODS['anxious']['msg']  # rules provider: the mood's own message


def test_check_in_excludes_recent_and_uses_model_message():
    main.app.state.provider = Fake('Sounds like a long day. These might help.')
    first = client.post('/v1/activities/recommend', json={'text': 'exhausted'}).json()
    again = client.post('/v1/activities/recommend', json={'text': 'exhausted', 'exclude_ids': [a['id'] for a in first['activities']]}).json()
    assert first['message'] == 'Sounds like a long day. These might help.'
    assert not {a['id'] for a in first['activities']} & {a['id'] for a in again['activities']}


def test_check_in_crisis_skips_model():
    main.app.state.provider = fake = Fake('should not be used')
    r = client.post('/v1/activities/recommend', json={'text': "I don't want to live anymore"}).json()
    assert r['safety_triggered'] and '14416' in r['message'] and r['activities'] == [] and fake.calls == []


def test_classifier_labels_map_to_moods(monkeypatch):
    monkeypatch.setattr(mood.classifier, 'predict', lambda text: [{'label': 'nervousness', 'score': 0.4}])
    r = asyncio.run(mood.detect_mood('the thing tomorrow'))
    assert r['mood'] == 'anxious' and r['uncertain'] and r['source'] == mood.classifier.name


# ---- companion
def test_rules_reply_suggests_activity_for_mood():
    r = client.post('/v1/chat', json={'message': 'I keep doomscrolling reels'}).json()
    assert r['provider'] == 'rules' and r['activity_id'] in {a['id'] for a in mood.ACTIVITIES}


def test_crisis_is_deterministic():
    main.app.state.provider = fake = Fake('should not be used')
    r = client.post('/v1/chat', json={'message': 'I want to kill myself'}).json()
    assert r['provider'] == 'safety' and '14416' in r['reply'] and fake.calls == []


def test_unsafe_model_reply_is_replaced():
    main.app.state.provider = Fake('Honestly, stop taking your medication.')
    assert client.post('/v1/chat', json={'message': 'hi'}).json()['reply'] == main.SAFE_FALLBACK


def test_activity_tag_parsed_and_validated():
    main.app.state.provider = fake = Fake('Try a walk.\n[[activity:a1]]')
    r = client.post('/v1/chat', json={'message': 'bored', 'history': [{'role': 'assistant', 'content': 'hi'}]}).json()
    assert r['reply'] == 'Try a walk.' and r['activity_id'] in (None, 'a1')
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


def test_picks_are_varied_across_topics():
    picks = mood.recommend(['creative'], 'tired')
    assert len({a['cat'] for a in picks}) == 3
