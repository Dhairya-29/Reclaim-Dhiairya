"""Reclaim API: the companion, draft and recommendation backend for the Reclaim app.

Run:  uvicorn main:app --reload --port 8000
Env:  ANTHROPIC_API_KEY   use Claude (checked first)
      GROQ_API_KEY        use Groq (free tier) when no Anthropic key is set
                          with neither key: safe rule-based replies
      RECLAIM_PROVIDER    force claude | groq | rules
      RECLAIM_MODEL       Claude model, default claude-opus-5-5
      GROQ_MODEL          Groq model, default openai/gpt-oss-120b
      ALLOWED_ORIGINS     comma-separated CORS origins, default *
      ACTIVITIES_PATH     shared catalogue, default ../reclaim/activities.json
      RECLAIM_DB          SQLite file for feedback, default ./reclaim.db
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal, Optional, Protocol

import anthropic
import groq
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HERE = Path(__file__).parent
MODEL = os.getenv('RECLAIM_MODEL', 'claude-opus-5-5')
GROQ_MODEL = os.getenv('GROQ_MODEL', 'openai/gpt-oss-120b')
CATALOG = json.loads(Path(os.getenv('ACTIVITIES_PATH', HERE.parent / 'reclaim' / 'activities.json')).read_text(encoding='utf8'))
ACTIVITIES = CATALOG['activities']
BY_ID = {a['id']: a for a in ACTIVITIES}
TOPICS = dict(CATALOG['topics'])
DB_PATH = os.getenv('RECLAIM_DB', str(HERE / 'reclaim.db'))

CRISIS = re.compile(r"suicid|kill myself|end my life|self[- ]?harm|hurt myself|don'?t want to (live|be alive)", re.I)
CRISIS_REPLY = (
    "I am really glad you told me. I am an AI, so I cannot be there the way a person can, but you deserve support "
    "right now. If you might be in danger, please call 112 (India emergency) or your local emergency number. In India "
    "you can also call Tele MANAS on 14416, free and 24/7. Is there someone you trust you could message right now?"
)


# ---------------------------------------------------------------- recommendations
def recommend(interests: list[str], mood: Optional[str] = None, time_min: int = 0, energy: int = 0,
              budget: str = 'any', setting: str = 'any', exclude: set[str] = frozenset(), limit: int = 3) -> list[dict]:
    """Same rules as the app's Discover tab: hard filters, then score by interests and mood."""
    def fits(a):
        return ((not time_min or a['dur'] <= time_min) and (not energy or a['energy'] <= energy)
                and (budget == 'any' or a['cost'] <= (0 if budget == 'free' else 1))
                and (setting == 'any' or a['setting'] in (setting, 'either')) and a['id'] not in exclude)

    def score(a):
        s = 2 if a['cat'] in interests else 0
        if mood in ('tired', 'low'):
            s += 2 if a['energy'] == 1 else -1
        if mood == 'restless':
            s += {3: 3, 2: 1}.get(a['energy'], 0)
        if mood == 'lonely' and a['cat'] in ('social', 'community'):
            s += 3
        if mood in ('calm', 'good') and a['cat'] in ('outdoors', 'creative', 'social', 'explore'):
            s += 1
        return s

    return sorted(filter(fits, ACTIVITIES), key=score, reverse=True)[:limit]


# ---------------------------------------------------------------- providers
class Refused(Exception):
    """The model declined the request."""


class ProviderError(Exception):
    """The model service failed; `busy` means rate-limited (worth retrying soon)."""

    def __init__(self, kind: str, busy: bool = False):
        super().__init__(kind)
        self.busy = busy


class Provider(Protocol):
    name: str
    model: Optional[str]

    async def complete(self, system: str, messages: list[dict], max_tokens: int, effort: str) -> str: ...


class ClaudeProvider:
    name = 'claude'
    model = MODEL

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(timeout=40.0, max_retries=2)

    async def complete(self, system, messages, max_tokens=2048, effort='low'):
        try:
            r = await self.client.beta.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                output_config={'effort': effort},
                # If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
                betas=['server-side-fallback-2026-07-01'],
                fallbacks='default',
            )
        except anthropic.RateLimitError as e:
            raise ProviderError('RateLimitError', busy=True) from e
        except anthropic.APIError as e:
            raise ProviderError(type(e).__name__) from e
        if r.stop_reason == 'refusal':
            raise Refused()
        return ''.join(b.text for b in r.content if b.type == 'text').strip()


class GroqProvider:
    """Groq's free tier, running an open model. Same prompts as Claude."""
    name = 'groq'
    model = GROQ_MODEL

    def __init__(self):
        self.client = groq.AsyncGroq(timeout=40.0, max_retries=2)

    async def complete(self, system, messages, max_tokens=2048, effort='low'):
        kwargs = {'reasoning_effort': effort, 'reasoning_format': 'hidden'} if GROQ_MODEL.startswith('openai/gpt-oss') else {}
        try:
            r = await self.client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{'role': 'system', 'content': system}, *messages],
                max_completion_tokens=max_tokens,
                **kwargs,
            )
        except groq.RateLimitError as e:
            raise ProviderError('RateLimitError', busy=True) from e
        except groq.APIError as e:
            raise ProviderError(type(e).__name__) from e
        text = (r.choices[0].message.content or '').strip()
        if not text:
            raise ProviderError('EmptyReply')
        return text


class RuleProvider:
    """No model configured: short, safe, honest replies so the app stays useful."""
    name = 'rules'
    model = None

    async def complete(self, system, messages, max_tokens=0, effort=''):
        raise LookupError('no model configured')


def make_provider() -> Provider:
    forced = os.getenv('RECLAIM_PROVIDER')
    if forced:
        return {'claude': ClaudeProvider, 'groq': GroqProvider, 'rules': RuleProvider}[forced]()
    if os.getenv('ANTHROPIC_API_KEY') or os.getenv('ANTHROPIC_AUTH_TOKEN'):
        return ClaudeProvider()
    if os.getenv('GROQ_API_KEY'):
        return GroqProvider()
    return RuleProvider()


# ---------------------------------------------------------------- prompts
COMPANION_SYSTEM = """You are the companion inside Reclaim, an app that helps people swap empty scrolling for real life: activities, people, memories and growth.

How you talk:
- Warm, honest and brief: two to four short sentences, plain text, no markdown headings or lists unless asked.
- You are an AI and never pretend to be human. If asked, say so plainly.
- Help the person name what they actually need (rest, company, calm, novelty, movement, meaning) and offer one small, concrete next step in the real world.
- Encourage human connection where it fits: reaching out to someone, a conversation starter, an invitation.
- Never guilt-trip, never mention streaks or productivity scores, never create urgency. It is fine for them to close the app.
- You are not a therapist. For anything medical or serious, gently suggest a professional. If they mention self-harm or being in danger, give the crisis line (India: 112, Tele MANAS 14416) and encourage contacting someone they trust.

Suggesting activities:
- When an activity would genuinely help, you may suggest ONE from the candidates below, in your own words.
- If you suggest one, end your reply with its tag on its own line, exactly like: [[activity:a12]]
- Do not tag anything that is not in the candidate list. Most replies need no suggestion."""

DRAFT_SYSTEM = """You turn someone's journal thoughts (spoken or typed, sometimes answers to questions) into a first draft of the type they ask for.

- Keep their voice, vocabulary and details. Tidy filler words, but do not invent events, people or feelings.
- Never reframe something they dislike or struggle with as a positive. If a draft type (like a gratitude list) needs positives, use only what they actually expressed positively; leave the rest out.
- Write in the first person unless the draft type implies otherwise.
- Output format: the first line is a short title with no symbols, then a blank line, then the body.
- In the body use plain paragraphs; use "## " headings and "- " bullets only when they help.
- No preamble or closing remarks; output only the draft."""

TAG = re.compile(r'\s*\[\[activity:([a-z0-9]+)\]\]\s*$', re.I)


def companion_context(ctx: 'ChatContext', candidates: list[dict]) -> str:
    lines = [f"- {a['id']}: {a['title']} ({a['dur']} min, {TOPICS.get(a['cat'], a['cat'])}). {a['why']}" for a in candidates]
    about = []
    if ctx.name:
        about.append(f'Their name is {ctx.name}.')
    if ctx.interests:
        about.append('They enjoy: ' + ', '.join(TOPICS.get(i, i) for i in ctx.interests) + '.')
    if ctx.mood:
        about.append(f'Today they said they feel {ctx.mood}.')
    return '\n\n'.join(filter(None, [' '.join(about), 'Candidate activities:\n' + '\n'.join(lines)]))


def rule_reply(text: str, candidates: list[dict]) -> tuple[str, Optional[str]]:
    a = candidates[0] if candidates else None
    t = text.lower()
    if re.search(r'scroll|reels|phone|bored|doom', t) and a:
        return (f"That pull to keep scrolling is real, and it is not a willpower failure. Want to swap the next "
                f"{a['dur']} minutes for \"{a['title']}\"? {a['why']}", a['id'])
    if re.search(r'lonely|alone|miss', t):
        return ("Feeling lonely is hard, and more common than it looks. One small step: send a short message to "
                "someone you miss, something like \"I was just thinking about you, how have you been?\"", None)
    if re.search(r'stress|anxious|overwhelm|panic', t):
        return ("That sounds like a lot. Try naming 5 things you can see, 4 you can hear and 3 you can touch. "
                "Then, what is one thing in your control in the next hour?", None)
    return ("I am listening. What would make the next hour feel worthwhile for you?", None)


# ---------------------------------------------------------------- storage (feedback only; chats are not retained)
def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.execute('CREATE TABLE IF NOT EXISTS feedback (conversation_id TEXT, message_id TEXT, rating TEXT, comment TEXT, ts REAL)')
    return con


# ---------------------------------------------------------------- rate limiting
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request, per_minute: int = 30):
    # ponytail: in-memory, per-process; use Redis or the platform's limiter if you run several instances.
    ip = request.headers.get('x-forwarded-for', request.client.host if request.client else '?').split(',')[0].strip()
    now, q = time.monotonic(), _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= per_minute:
        raise HTTPException(429, 'Too many requests. Take a breath and try again in a minute.')
    q.append(now)


# ---------------------------------------------------------------- API models
Id = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')


class Turn(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=4000)


class ChatContext(BaseModel):
    name: str = Field('', max_length=60)
    interests: list[str] = Field(default_factory=list, max_length=20)
    mood: Optional[str] = Field(None, max_length=20)


class ChatIn(BaseModel):
    mode: Literal['companion', 'draft'] = 'companion'
    conversation_id: Optional[str] = Field(None, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')
    message: str = Field(min_length=1, max_length=20000)
    history: list[Turn] = Field(default_factory=list, max_length=24)
    context: ChatContext = Field(default_factory=ChatContext)


class ChatOut(BaseModel):
    reply: str
    activity_id: Optional[str] = None
    provider: str


class RecommendIn(BaseModel):
    interests: list[str] = Field(default_factory=list, max_length=20)
    mood: Optional[str] = None
    time: int = Field(0, ge=0, le=600)
    energy: int = Field(0, ge=0, le=3)
    budget: Literal['any', 'free', 'low'] = 'any'
    setting: Literal['any', 'indoor', 'outdoor'] = 'any'
    exclude_ids: list[str] = Field(default_factory=list, max_length=200)
    limit: int = Field(3, ge=1, le=10)


class FeedbackIn(BaseModel):
    conversation_id: str = Id
    message_id: str = Id
    rating: Literal['up', 'down']
    comment: str = Field('', max_length=1000)


# ---------------------------------------------------------------- app
app = FastAPI(title='Reclaim API', version='1.0.0')
app.state.provider = make_provider()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv('ALLOWED_ORIGINS', '*').split(',')],
    allow_methods=['GET', 'POST', 'DELETE'],
    allow_headers=['Content-Type'],
)


@app.get('/v1/health')
def health():
    return {'status': 'ok', 'provider': app.state.provider.name, 'model': app.state.provider.model,
            'activities': len(ACTIVITIES), 'topics': len(TOPICS)}


@app.post('/v1/chat', response_model=ChatOut, dependencies=[Depends(rate_limit)])
async def chat(body: ChatIn):
    provider: Provider = app.state.provider

    if body.mode == 'draft':
        try:
            text = await provider.complete(DRAFT_SYSTEM, [{'role': 'user', 'content': body.message}], max_tokens=4000, effort='medium')
        except LookupError:
            raise HTTPException(503, 'No model configured; the app drafts on-device instead.')
        except Refused:
            raise HTTPException(422, 'The model declined to draft this.')
        except ProviderError as e:
            raise HTTPException(503 if e.busy else 502, f'Model unavailable: {e}')
        return ChatOut(reply=text, provider=provider.name)

    if CRISIS.search(body.message):  # deterministic, never left to the model
        return ChatOut(reply=CRISIS_REPLY, provider='safety')

    candidates = recommend(body.context.interests, body.context.mood, limit=5)
    messages = [t.model_dump() for t in body.history] + [{'role': 'user', 'content': body.message}]
    while messages and messages[0]['role'] != 'user':  # the API needs a user turn first
        messages.pop(0)
    try:
        text = await provider.complete(COMPANION_SYSTEM + '\n\n' + companion_context(body.context, candidates), messages, max_tokens=1024, effort='low')
    except LookupError:
        reply, aid = rule_reply(body.message, candidates)
        return ChatOut(reply=reply, activity_id=aid, provider=provider.name)
    except Refused:
        return ChatOut(reply="I can't help with that one, but I'm happy to talk about how you're doing or find something good to do.", provider=provider.name)
    except ProviderError as e:
        if e.busy:
            raise HTTPException(503, 'The companion is busy. Try again in a moment.')
        raise HTTPException(502, f'Model unavailable: {e}')

    aid = None
    m = TAG.search(text)
    if m:
        text = text[:m.start()].rstrip()
        aid = m.group(1) if m.group(1) in {a['id'] for a in candidates} else None
    return ChatOut(reply=text, activity_id=aid, provider=provider.name)


@app.post('/v1/chat/feedback', dependencies=[Depends(rate_limit)])
def feedback(body: FeedbackIn):
    with db() as con:
        con.execute('INSERT INTO feedback VALUES (?, ?, ?, ?, ?)', (body.conversation_id, body.message_id, body.rating, body.comment, time.time()))
    return {'ok': True}


@app.post('/v1/activities/recommend')
def recommend_activities(body: RecommendIn):
    picks = recommend(body.interests, body.mood, body.time, body.energy, body.budget, body.setting, set(body.exclude_ids), body.limit)
    return {'activities': picks}


@app.delete('/v1/conversations/{conversation_id}')
def delete_conversation(conversation_id: str):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', conversation_id):
        raise HTTPException(422, 'Invalid conversation id')
    with db() as con:
        n = con.execute('DELETE FROM feedback WHERE conversation_id = ?', (conversation_id,)).rowcount
    # Chat text is never stored server-side, so feedback is the only retained data.
    return {'deleted': n}
