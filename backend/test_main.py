"""`pytest` — runs without an API key (a fake provider stands in for Claude)."""
import os

os.environ['RECLAIM_PROVIDER'] = 'rules'
os.environ['RECLAIM_DB'] = os.path.join(os.path.dirname(__file__), 'test.db')

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


class FakeClaude:
    name = 'claude'

    def __init__(self, text):
        self.text, self.calls = text, []

    async def complete(self, system, messages, max_tokens=0, effort=''):
        self.calls.append((system, messages))
        return self.text


def test_health():
    r = client.get('/v1/health').json()
    assert r['status'] == 'ok' and r['activities'] >= 90 and r['topics'] >= 13


def test_rules_fallback_suggests_activity():
    r = client.post('/v1/chat', json={'message': 'I keep doomscrolling reels', 'context': {'mood': 'restless'}}).json()
    assert r['provider'] == 'rules' and r['activity_id'] in main.BY_ID


def test_crisis_is_deterministic():
    main.app.state.provider = FakeClaude('should not be used')
    r = client.post('/v1/chat', json={'message': 'I want to kill myself'}).json()
    assert r['provider'] == 'safety' and '14416' in r['reply']
    assert main.app.state.provider.calls == []


def test_activity_tag_parsed_and_validated():
    main.app.state.provider = FakeClaude('Try a walk.\n[[activity:a1]]')
    r = client.post('/v1/chat', json={'message': 'bored', 'history': [{'role': 'assistant', 'content': 'hi'}]}).json()
    assert r['reply'] == 'Try a walk.'
    assert r['activity_id'] in (None, 'a1')  # only kept if it was a candidate
    _, messages = main.app.state.provider.calls[0]
    assert messages[0]['role'] == 'user'  # leading assistant turn dropped
    main.app.state.provider = FakeClaude('Nice.\n[[activity:zzz]]')
    assert client.post('/v1/chat', json={'message': 'x'}).json()['activity_id'] is None


def test_draft_needs_model():
    main.app.state.provider = main.RuleProvider()
    assert client.post('/v1/chat', json={'mode': 'draft', 'message': 'Draft type: Poem\n\nhello'}).status_code == 503


def test_validation():
    assert client.post('/v1/chat', json={'message': ''}).status_code == 422
    assert client.post('/v1/chat/feedback', json={'conversation_id': 'a b', 'message_id': 'm', 'rating': 'up'}).status_code == 422


def test_recommend_filters():
    r = client.post('/v1/activities/recommend', json={'time': 15, 'budget': 'free', 'setting': 'indoor', 'limit': 5}).json()
    assert r['activities'] and all(a['dur'] <= 15 and a['cost'] == 0 and a['setting'] in ('indoor', 'either') for a in r['activities'])


def test_feedback_and_delete():
    assert client.post('/v1/chat/feedback', json={'conversation_id': 'c1', 'message_id': 'm1', 'rating': 'up'}).json()['ok']
    assert client.delete('/v1/conversations/c1').json()['deleted'] >= 1
    assert client.delete('/v1/conversations/c1').json()['deleted'] == 0
