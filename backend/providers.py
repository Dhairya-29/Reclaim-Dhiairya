"""Pluggable text models. Each provider has `name`, `model` and `async complete(system, messages, max_tokens, effort) -> str`.

Pick one with env vars (first match wins):
  RECLAIM_PROVIDER=claude|groq|ollama|rules   force a provider
  ANTHROPIC_API_KEY                           Claude   (RECLAIM_MODEL, default claude-opus-5-5)
  GROQ_API_KEY                                Groq     (GROQ_MODEL, default openai/gpt-oss-120b)
  OLLAMA_BASE_URL                             Ollama   (OLLAMA_MODEL, default qwen3.5:4b), e.g. http://127.0.0.1:11434
  (none)                                      rules: the API still works with safe, fixed replies

To add a provider: write a class with the same shape and add it to PROVIDERS.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Optional, Protocol

import anthropic
import groq
import httpx

log = logging.getLogger('reclaim.providers')


class Refused(Exception):
    """The model declined the request."""


class ProviderError(Exception):
    """The model service failed; `busy` means rate-limited (worth retrying soon)."""

    def __init__(self, kind: str, busy: bool = False):
        super().__init__(kind)
        self.busy = busy


class NoModel(Exception):
    """No model is configured; callers fall back to fixed replies."""


class Provider(Protocol):
    name: str
    model: Optional[str]

    async def complete(self, system: str, messages: list[dict], max_tokens: int = 2048, effort: str = 'low') -> str: ...


class ClaudeProvider:
    name = 'claude'

    def __init__(self):
        self.model = os.getenv('RECLAIM_MODEL', 'claude-opus-5-5')
        self.client = anthropic.AsyncAnthropic(timeout=40.0, max_retries=2)

    async def complete(self, system, messages, max_tokens=2048, effort='low'):
        try:
            r = await self.client.beta.messages.create(
                model=self.model,
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
    """Groq's free tier, running an open model."""
    name = 'groq'

    def __init__(self):
        self.model = os.getenv('GROQ_MODEL', 'openai/gpt-oss-120b')
        self.client = groq.AsyncGroq(timeout=40.0, max_retries=2)

    async def complete(self, system, messages, max_tokens=2048, effort='low'):
        kwargs = {'reasoning_effort': effort, 'reasoning_format': 'hidden'} if self.model.startswith('openai/gpt-oss') else {}
        try:
            r = await self.client.chat.completions.create(
                model=self.model,
                messages=[{'role': 'system', 'content': system}, *messages],
                max_completion_tokens=max_tokens,
                **kwargs,
            )
        except groq.RateLimitError as e:
            raise ProviderError('RateLimitError', busy=True) from e
        except groq.APIError as e:
            raise ProviderError(type(e).__name__) from e
        return _require(r.choices[0].message.content)


THINK = re.compile(r'<think>.*?</think>', re.S)


class OllamaProvider:
    """A local model through Ollama (free, private, runs on your own machine)."""
    name = 'ollama'

    def __init__(self):
        self.url = os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').rstrip('/')
        self.model = os.getenv('OLLAMA_MODEL', 'qwen3.5:4b')
        self.client = httpx.AsyncClient(timeout=90.0)  # local models can be slow on CPU

    async def complete(self, system, messages, max_tokens=2048, effort='low'):
        body = {'model': self.model, 'stream': False, 'options': {'num_predict': max_tokens},
                'messages': [{'role': 'system', 'content': system}, *messages]}
        try:
            r = await self.client.post(f'{self.url}/api/chat', json=body)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise ProviderError(type(e).__name__) from e
        return _require(THINK.sub('', r.json().get('message', {}).get('content', '')))


class RuleProvider:
    name = 'rules'
    model = None

    async def complete(self, system, messages, max_tokens=0, effort=''):
        raise NoModel()


def _require(text: Optional[str]) -> str:
    text = (text or '').strip()
    if not text:
        raise ProviderError('EmptyReply')
    return text


PROVIDERS = {'claude': ClaudeProvider, 'groq': GroqProvider, 'ollama': OllamaProvider, 'rules': RuleProvider}


def make_provider() -> Provider:
    name = os.getenv('RECLAIM_PROVIDER') or (
        'claude' if os.getenv('ANTHROPIC_API_KEY') or os.getenv('ANTHROPIC_AUTH_TOKEN')
        else 'groq' if os.getenv('GROQ_API_KEY')
        else 'ollama' if os.getenv('OLLAMA_BASE_URL')
        else 'rules')
    provider = PROVIDERS[name]()
    log.info('Using provider %s (%s)', provider.name, provider.model)
    return provider
