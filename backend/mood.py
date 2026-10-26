"""Mood detection, driven by the moods in the shared reclaim/ideas.json (ideas themselves are generated, not listed).

Detection order: the mood the user tapped -> mood keywords in their words -> the optional
GoEmotions classifier -> "calm" (marked uncertain). Moods and their keywords live in ideas.json,
so the app and the API always agree.

Optional classifier (CPU, ~1.5 GB RAM; too big for Render's free plan):
  pip install -r requirements-ml.txt
  EMOTION_MODEL                default SamLowe/roberta-base-go_emotions
  EMOTION_CLASSIFIER_ENABLED   set to false to skip it even when installed
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Optional

log = logging.getLogger('reclaim.mood')

CATALOG = json.loads(Path(os.getenv('IDEAS_PATH', Path(__file__).parent.parent / 'reclaim' / 'ideas.json')).read_text(encoding='utf8'))
TOPICS = dict(CATALOG['topics'])
MOODS = {m['id']: m for m in CATALOG['moods']}
_BY_PRIORITY = [(m['id'], re.compile(m['words'], re.I)) for m in sorted(CATALOG['moods'], key=lambda m: m['priority'])]

# GoEmotions labels -> app moods (it has no "tired" or "lonely"; keywords cover those).
GO_EMOTIONS = {
    **dict.fromkeys(['admiration', 'amusement', 'approval', 'caring', 'curiosity', 'desire', 'excitement',
                     'gratitude', 'joy', 'love', 'optimism', 'pride', 'relief'], 'good'),
    **dict.fromkeys(['neutral', 'realization'], 'calm'),
    **dict.fromkeys(['sadness', 'grief', 'disappointment', 'remorse', 'embarrassment'], 'low'),
    **dict.fromkeys(['fear', 'nervousness', 'confusion'], 'anxious'),
    **dict.fromkeys(['anger', 'annoyance', 'disgust', 'disapproval'], 'restless'),
}


class EmotionClassifier:
    """Lazy-loads a GoEmotions text classifier on first use; returns [] if it is unavailable."""

    def __init__(self):
        self.name = os.getenv('EMOTION_MODEL', 'SamLowe/roberta-base-go_emotions')
        self._pipe = None
        self._off = os.getenv('EMOTION_CLASSIFIER_ENABLED', 'true').lower() not in {'1', 'true', 'yes', 'on'}

    def _load(self):
        try:
            from transformers import pipeline
            self._pipe = pipeline('text-classification', model=self.name, top_k=None, function_to_apply='sigmoid', device=-1)
            log.info('Loaded emotion model %s', self.name)
        except Exception:
            log.info('Emotion classifier not available; using mood keywords only', exc_info=log.isEnabledFor(logging.DEBUG))
            self._off = True

    def predict(self, text: str) -> list[dict]:
        if self._off:
            return []
        if self._pipe is None:
            self._load()
            if self._off:
                return []
        try:
            raw = self._pipe(text[:2000])
            raw = raw[0] if raw and isinstance(raw[0], list) else raw  # output shape varies by version
        except Exception:
            log.exception('Emotion prediction failed')
            return []
        # Multi-label and not calibrated, so keep only reasonably confident labels.
        labels = sorted(({'label': r['label'], 'score': round(float(r['score']), 3)} for r in raw), key=lambda x: -x['score'])
        return [x for x in labels if x['score'] >= 0.35][:3]


classifier = EmotionClassifier()


async def detect_mood(text: str = '', chosen: Optional[str] = None) -> dict:
    """Return {mood, emotions, uncertain, source}. Never a diagnosis, just a best guess to pick activities."""
    emotions = await asyncio.to_thread(classifier.predict, text) if text else []
    if chosen in MOODS:
        return {'mood': chosen, 'emotions': emotions, 'uncertain': False, 'source': 'user'}
    # ponytail: keyword match ignores negation ("not tired"); the classifier, when installed, catches more.
    for mood, words in _BY_PRIORITY:
        if words.search(text):
            return {'mood': mood, 'emotions': emotions, 'uncertain': False, 'source': 'keywords'}
    for e in emotions:
        if e['label'] in GO_EMOTIONS:
            return {'mood': GO_EMOTIONS[e['label']], 'emotions': emotions, 'uncertain': e['score'] < 0.45, 'source': classifier.name}
    return {'mood': 'calm', 'emotions': emotions, 'uncertain': True, 'source': 'default'}
