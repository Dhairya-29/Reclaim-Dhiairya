"""Reclaim API: companion chat, journal drafts, mood check-ins and freshly generated ideas for the Reclaim app.

Run:  uvicorn main:app --reload --port 8000
Env:  model choice       see providers.py (ANTHROPIC_API_KEY / GROQ_API_KEY / OLLAMA_BASE_URL)
      emotion model      see mood.py (optional)
      ALLOWED_ORIGINS    comma-separated CORS origins, default *
      CRISIS_COUNTRY     crisis resources to show, default India
      RECLAIM_DB         SQLite file for feedback, default ./reclaim.db
      LOG_LEVEL          default INFO
"""
from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Annotated, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mood import MOODS, TOPICS, detect_mood
from providers import NoModel, Provider, ProviderError, Refused, make_provider

logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
DB_PATH = os.getenv('RECLAIM_DB', str(Path(__file__).parent / 'reclaim.db'))

# ---------------------------------------------------------------- safety
# A conservative phrase tripwire that runs before any model, not a clinical risk detector.
CRISIS = re.compile(r"\b(kill myself|suicid\w*|end my life|take my own life|want to die|don'?t want to live|do not want to live"
                    r"|better off dead|hurt myself|harm myself|self[- ]?harm|cut myself|plan to (kill|hurt|harm) myself)\b", re.I)
UNSAFE_REPLY = re.compile(r'\b(you should kill yourself|go kill yourself|stop taking your medication|ignore your doctor)\b', re.I)
SAFE_FALLBACK = "I'm here with you. Could you tell me a bit more about how you're feeling right now?"


def safety_reply() -> str:
    if os.getenv('CRISIS_COUNTRY', 'India').strip().lower() == 'india':
        where = ('If you might act on these thoughts, please call 112 now. You can also call Tele MANAS on 14416, '
                 'free and 24/7.')
    else:
        where = 'If you might act on these thoughts, please call your local emergency number or a crisis line now.'
    return (f"I'm really sorry you're going through this, and I'm glad you told me. I'm an AI, so I can't be there the way "
            f"a person can, but your safety matters. {where} If you can, be near someone you trust and tell them you're not okay.")


def safe(text: str) -> str:
    return SAFE_FALLBACK if UNSAFE_REPLY.search(text) else text


# ---------------------------------------------------------------- prompts
COMPANION_SYSTEM = """You are the companion inside Reclaim, an app that helps people swap empty scrolling for real life: activities, people, memories and growth.

How you talk:
- Warm, respectful, non-judgmental and brief: two to four short sentences, plain text, no headings or lists unless asked.
- You are an AI and never pretend to be human. If asked, say so plainly.
- Reflect what they seem to feel without claiming certainty about it. Sometimes listening and one gentle question beats advice.
- When it fits, offer one small, optional, concrete next step in the real world. Never promise it will work.
- Encourage human connection where it fits: reaching out to someone, a conversation starter, an invitation.
- Never guilt-trip, create urgency, or encourage depending on you. It is fine for them to close the app.
- Do not diagnose, prescribe or act as a therapist; for anything medical or serious, gently suggest a professional. Never describe ways to self-harm. If they may be in danger, urge them to contact emergency services (India: 112, Tele MANAS 14416) and someone they trust.
- Do not invent facts about them.

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

IDEAS_SYSTEM = """You invent small, real-world things for someone to do right now instead of scrolling.

- Fresh and specific, never generic: name a concrete object, kind of place, food, music genre, game or person to contact. Vary the topics.
- Safe, legal, kind and affordable. No screens except to contact a real person. Nothing medical.
- Respect every constraint you are given (time, energy, budget, place, and what they have told you before). Never repeat an idea from the avoid list.
- "message": if they said how they feel, one or two warm sentences that gently reflect it (no certainty, no diagnosis) and say the ideas might fit. Otherwise an empty string.

Reply with JSON only, no other text:
{"message": "...", "ideas": [{"title": "...", "topic": "...", "minutes": 15, "cost": 0, "energy": 1, "setting": "indoor", "description": "...", "why": "...", "steps": ["...", "..."]}]}
topic is one of: """ + ', '.join(TOPICS) + """. cost: 0 free, 1 low, 2 some. energy: 1 low, 2 some, 3 high. setting: indoor, outdoor or either. 2 to 4 short steps."""

def fits(idea: dict, f: 'Filters') -> bool:
    return ((not f.time or idea['dur'] <= f.time) and (not f.energy or idea['energy'] <= f.energy)
            and (f.budget == 'any' or idea['cost'] <= (0 if f.budget == 'free' else 1))
            and (f.setting == 'any' or idea['setting'] in (f.setting, 'either'))
            and (f.interest == 'any' or idea['cat'] == f.interest))


def parse_ideas(text: str, f: 'Filters', avoid: set[str], n: int) -> tuple[str, list[dict]]:
    """Model JSON -> (message, ideas in the app's shape). Anything malformed, off-filter or repeated is dropped."""
    try:
        data = json.loads(re.search(r'\{.*\}', text, re.S).group(0))
    except (AttributeError, ValueError):
        return '', []
    ideas = []
    for d in data.get('ideas', []) if isinstance(data.get('ideas'), list) else []:
        try:
            idea = {'title': str(d['title']).strip()[:80], 'cat': str(d.get('topic', '')), 'dur': max(5, min(int(d.get('minutes', 15)), 180)),
                    'cost': max(0, min(int(d.get('cost', 0)), 2)), 'energy': max(1, min(int(d.get('energy', 1)), 3)),
                    'setting': d.get('setting') if d.get('setting') in ('indoor', 'outdoor', 'either') else 'either',
                    'desc': str(d.get('description', '')).strip()[:240], 'why': str(d.get('why', '')).strip()[:240],
                    'steps': [str(x).strip()[:140] for x in d.get('steps', []) if str(x).strip()][:5]}
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
        blob = ' '.join([idea['title'], idea['desc'], idea['why'], *idea['steps']])
        if (not idea['title'] or idea['cat'] not in TOPICS or idea['title'].lower() in avoid or not fits(idea, f)
                or UNSAFE_REPLY.search(blob) or CRISIS.search(blob)):
            continue
        idea['steps'] = idea['steps'] or [idea['desc'] or idea['title']]
        ideas.append(idea)
        if len(ideas) == n:
            break
    message = data.get('message', '')
    return (safe(message.strip()) if isinstance(message, str) else ''), ideas


def ideas_request(found: dict, body: 'CheckInIn') -> str:
    f = body.filters
    want = [f'at most {f.time} minutes' if f.time else '', ['', 'low energy only', 'low or some energy', ''][f.energy],
            {'free': 'free only', 'low': 'free or low cost'}.get(f.budget, ''), {'indoor': 'indoors', 'outdoor': 'outdoors'}.get(f.setting, ''),
            f'topic: {f.interest}' if f.interest != 'any' else '']
    lines = [f'Give {body.n} ideas.',
             f"How they said they feel: {body.text}" if body.text else '',
             f"Their mood (best guess): {found['mood']}{' (uncertain)' if found['uncertain'] else ''}" if body.text or body.mood else '',
             'They enjoy: ' + ', '.join(TOPICS.get(i, i) for i in body.interests) if body.interests else '',
             'Constraints: ' + ', '.join(w for w in want if w) if any(want) else '',
             'What they told you in earlier chats: ' + '; '.join(body.notes) if body.notes else '',
             'Avoid these ideas: ' + '; '.join(body.avoid) if body.avoid else '']
    return '\n'.join(x for x in lines if x)


TAG = re.compile(r'\s*\[\[activity:([a-z0-9]+)\]\]\s*$', re.I)


def companion_context(ctx: 'ChatContext') -> str:
    lines = [f"- {a.id}: {a.title} ({a.dur} min, {a.setting}, {TOPICS.get(a.cat, a.cat)}). {a.why}" for a in ctx.ideas]
    about = []
    if ctx.name:
        about.append(f'Their name is {ctx.name}.')
    if ctx.interests:
        about.append('They enjoy: ' + ', '.join(TOPICS.get(i, i) for i in ctx.interests) + '.')
    if ctx.mood:
        about.append(f'Today they said they feel {ctx.mood}.')
    notes = 'What they have told you in earlier chats (use it, do not repeat it back):\n' + '\n'.join(f'- {n}' for n in ctx.notes) if ctx.notes else ''
    return '\n\n'.join(filter(None, [' '.join(about), notes, 'Candidate activities:\n' + '\n'.join(lines) if lines else '']))


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


Note = Annotated[str, Field(max_length=120)]  # one remembered note or idea title


class IdeaRef(BaseModel):
    id: str = Id
    title: str = Field(max_length=120)
    dur: int = Field(ge=1, le=600)
    cat: str = Field(max_length=30)
    setting: str = Field('either', max_length=10)
    why: str = Field('', max_length=300)


class ChatContext(BaseModel):
    name: str = Field('', max_length=60)
    interests: list[str] = Field(default_factory=list, max_length=20)
    mood: Optional[str] = Field(None, max_length=20)
    notes: list[Note] = Field(default_factory=list, max_length=20)  # things they told the companion before
    ideas: list[IdeaRef] = Field(default_factory=list, max_length=6)  # fresh candidates the app generated


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


class Filters(BaseModel):
    time: int = Field(0, ge=0, le=600)
    energy: int = Field(0, ge=0, le=3)
    budget: Literal['any', 'free', 'low'] = 'any'
    setting: Literal['any', 'indoor', 'outdoor'] = 'any'
    interest: str = Field('any', max_length=30)


class CheckInIn(BaseModel):
    text: str = Field('', max_length=2000)
    mood: Optional[str] = Field(None, max_length=20)
    interests: list[str] = Field(default_factory=list, max_length=20)
    filters: Filters = Field(default_factory=Filters)
    avoid: list[Note] = Field(default_factory=list, max_length=60)  # idea titles shown or done recently
    notes: list[Note] = Field(default_factory=list, max_length=20)
    n: int = Field(3, ge=1, le=6)


class FeedbackIn(BaseModel):
    conversation_id: str = Id
    message_id: str = Id
    rating: Literal['up', 'down']
    comment: str = Field('', max_length=1000)


# ---------------------------------------------------------------- app
app = FastAPI(title='Reclaim API', version='1.1.0')
app.state.provider = make_provider()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv('ALLOWED_ORIGINS', '*').split(',')],
    allow_methods=['GET', 'POST', 'DELETE'],
    allow_headers=['Content-Type'],
)


@app.get('/v1/health')
def health():
    p = app.state.provider
    return {'status': 'ok', 'provider': p.name, 'model': p.model, 'topics': len(TOPICS), 'moods': len(MOODS),
            'ideas': 'generated by the model' if p.name != 'rules' else 'generated in the app'}


@app.post('/v1/chat', response_model=ChatOut, dependencies=[Depends(rate_limit)])
async def chat(body: ChatIn):
    provider: Provider = app.state.provider

    if body.mode == 'draft':
        try:
            text = await provider.complete(DRAFT_SYSTEM, [{'role': 'user', 'content': body.message}], max_tokens=4000, effort='medium')
        except NoModel:
            raise HTTPException(503, 'No model configured; the app drafts on-device instead.')
        except Refused:
            raise HTTPException(422, 'The model declined to draft this.')
        except ProviderError as e:
            raise HTTPException(503 if e.busy else 502, f'Model unavailable: {e}')
        return ChatOut(reply=safe(text), provider=provider.name)

    if CRISIS.search(body.message):  # deterministic, never left to the model
        return ChatOut(reply=safety_reply(), provider='safety')

    messages = [t.model_dump() for t in body.history] + [{'role': 'user', 'content': body.message}]
    while messages and messages[0]['role'] != 'user':  # the APIs need a user turn first
        messages.pop(0)
    try:
        text = await provider.complete(COMPANION_SYSTEM + '\n\n' + companion_context(body.context), messages, max_tokens=1024, effort='low')
    except NoModel:
        msg = MOODS[(await detect_mood(body.message))['mood']]['msg'].rstrip(':')
        pick = body.context.ideas[0] if body.context.ideas else None
        return ChatOut(reply=f'{msg}. Maybe: {pick.title}. {pick.why}' if pick else f'{msg}.', activity_id=pick.id if pick else None, provider=provider.name)
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
        aid = m.group(1) if m.group(1) in {a.id for a in body.context.ideas} else None
    return ChatOut(reply=safe(text), activity_id=aid, provider=provider.name)


@app.post('/v1/activities/recommend', dependencies=[Depends(rate_limit)])
async def check_in(body: CheckInIn):
    """Fresh ideas, made up by the model for this person and moment. Also the mood check-in when `text`/`mood` is given.

    Returns activities: [] when no model is configured or the model's answer is unusable; the app then generates them itself.
    """
    if CRISIS.search(body.text):
        return {'mood': 'low', 'emotions': [], 'uncertain': True, 'source': 'safety', 'message': safety_reply(), 'activities': [], 'safety_triggered': True}
    found = await detect_mood(body.text, body.mood)
    message, ideas = '', []
    try:
        reply = await app.state.provider.complete(IDEAS_SYSTEM, [{'role': 'user', 'content': ideas_request(found, body)}], max_tokens=1800, effort='low')
        message, ideas = parse_ideas(reply, body.filters, {a.lower() for a in body.avoid}, body.n)
    except (NoModel, Refused, ProviderError):
        pass
    return {**found, 'message': message or MOODS[found['mood']]['msg'], 'activities': ideas, 'safety_triggered': False}


@app.post('/v1/chat/feedback', dependencies=[Depends(rate_limit)])
def feedback(body: FeedbackIn):
    with db() as con:
        con.execute('INSERT INTO feedback VALUES (?, ?, ?, ?, ?)', (body.conversation_id, body.message_id, body.rating, body.comment, time.time()))
    return {'ok': True}


@app.delete('/v1/conversations/{conversation_id}')
def delete_conversation(conversation_id: str):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', conversation_id):
        raise HTTPException(422, 'Invalid conversation id')
    with db() as con:
        n = con.execute('DELETE FROM feedback WHERE conversation_id = ?', (conversation_id,)).rowcount
    # Chat text is never stored server-side, so feedback is the only retained data.
    return {'deleted': n}
