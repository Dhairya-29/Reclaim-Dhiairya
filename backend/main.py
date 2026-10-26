"""Reclaim API: companion chat, journal drafts and mood check-ins for the Reclaim app.

Run:  uvicorn main:app --reload --port 8000
Env:  model choice       see providers.py (ANTHROPIC_API_KEY / GROQ_API_KEY / OLLAMA_BASE_URL)
      emotion model      see mood.py (optional)
      ALLOWED_ORIGINS    comma-separated CORS origins, default *
      CRISIS_COUNTRY     crisis resources to show, default India
      RECLAIM_DB         SQLite file for feedback, default ./reclaim.db
      LOG_LEVEL          default INFO
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mood import ACTIVITIES, MOODS, TOPICS, detect_mood, recommend
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

CHECKIN_SYSTEM = """Someone just opened Reclaim and told you how they feel. Write one or two short, warm sentences: gently reflect the feeling (without claiming certainty or diagnosing) and say the ideas below might fit. Do not list or name the ideas, do not give advice beyond that, plain text only."""

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


class CheckInIn(BaseModel):
    text: str = Field('', max_length=2000)
    mood: Optional[str] = Field(None, max_length=20)
    interests: list[str] = Field(default_factory=list, max_length=20)
    exclude_ids: list[str] = Field(default_factory=list, max_length=200)


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
    return {'status': 'ok', 'provider': p.name, 'model': p.model, 'activities': len(ACTIVITIES), 'topics': len(TOPICS), 'moods': len(MOODS)}


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

    candidates = recommend(body.context.interests, body.context.mood, limit=5)
    messages = [t.model_dump() for t in body.history] + [{'role': 'user', 'content': body.message}]
    while messages and messages[0]['role'] != 'user':  # the APIs need a user turn first
        messages.pop(0)
    try:
        text = await provider.complete(COMPANION_SYSTEM + '\n\n' + companion_context(body.context, candidates), messages, max_tokens=1024, effort='low')
    except NoModel:
        mood = (await detect_mood(body.message))['mood']
        pick = recommend(body.context.interests, mood, limit=1)[0]
        return ChatOut(reply=f"{MOODS[mood]['msg'].rstrip(':')}. Maybe: {pick['title']}. {pick['why']}", activity_id=pick['id'], provider=provider.name)
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
    return ChatOut(reply=safe(text), activity_id=aid, provider=provider.name)


@app.post('/v1/activities/recommend', dependencies=[Depends(rate_limit)])
async def check_in(body: CheckInIn):
    """Mood check-in: how they feel (tapped and/or in their words) -> detected mood, a short note, three ideas."""
    if CRISIS.search(body.text):
        return {'mood': 'low', 'emotions': [], 'uncertain': True, 'source': 'safety', 'message': safety_reply(), 'activities': [], 'safety_triggered': True}
    found = await detect_mood(body.text, body.mood)
    picks = recommend(body.interests, found['mood'], set(body.exclude_ids))
    message = MOODS[found['mood']]['msg']
    if body.text:
        try:
            said = f"They said: {body.text}\nBest guess at their mood: {found['mood']}{' (uncertain)' if found['uncertain'] else ''}"
            message = safe(await app.state.provider.complete(CHECKIN_SYSTEM, [{'role': 'user', 'content': said}], max_tokens=300, effort='low'))
        except (NoModel, Refused, ProviderError):
            pass  # the mood's own message is fine
    return {**found, 'message': message, 'activities': picks, 'safety_triggered': False}


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
