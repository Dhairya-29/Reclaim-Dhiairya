# Reclaim

Less empty scrolling. More life worth remembering.

Reclaim has four tabs (Today, Discover, Companion, My Life) and a voice journal inside My Life that copies how Voicepal behaves. It's an installable, offline-first PWA: plain HTML, CSS and JS, with no build step and no dependencies.

```
index.html             page skeleton + splash
styles.css             design tokens (light/dark), components, transitions
data.js                moods, presets, journal topics, on-device questions/drafts/companion
ideas.json             13 topics, 7 moods and the building blocks for random ideas (shared with the backend)
app.js                 router (Android back gesture), views, recorder, storage, actions
sw.js                  offline cache
manifest.webmanifest   install metadata + home-screen shortcuts
check.js               `node check.js` checks the on-device logic and the catalogue
../backend/            FastAPI backend (see "Backend" below)
```

## How Voicepal was analysed

- **REA** (`capture_browser_scenario`) on voicepal.me: the network capture and accessibility tree show it's a Framer marketing site. The real product is a native iOS/Android app with no web client.
- I studied the product's behaviour from its App Store listing and screenshots (Recording, Streams, Follow up questions, Generate draft, Draft view) and from frames of the four demo videos on the site.
- No phone was connected over ADB, so I couldn't instrument the native Android app directly.

## Journal behaviours copied from Voicepal

| Voicepal | Reclaim |
|---|---|
| Thoughts organised into **streams** by topic | My Life → Journal: a list of streams (title, latest thought, relative date, counts) with search |
| Big record button starts a new stream | Floating mic button: record, then a new stream opens with the voice note in it |
| A new stream gets an auto title | The first words of the first thought become the title (tap the title to rename) |
| Stream timeline with type icons (pencil = typed, waveform = voice, speech bubbles = answered question) and a dashed line | Same |
| **Date chips** between days | Same (e.g. "Oct 18, 2026") |
| Long thoughts collapse to **6 lines** with "Read more" | Same, with "Show less" to collapse again |
| "▶ Play audio m:ss" on voice notes | Plays and pauses, shows time remaining, and resets when it ends |
| Composer: questions button, mic button, "Add thoughts..." field, draft button | Same. The draft button turns into a send arrow while you type |
| **Recording** screen: back, "Recording" title, 4 pill bars, mic + timer chip, compass / pause / ✓ | Same. The bars react to your voice level, live transcription appears under the bars, compass shows a guiding prompt, pause freezes the timer and bars, ✓ saves the note with its transcript |
| Back while recording | Asks "Discard this recording?" if you've recorded more than 5 seconds |
| **Follow up questions** (shadow reader): 3 cards, each with a question, context, a mic button and an Aa button | Questions are built from your stream's keywords. Mic answers by voice, Aa by typing. The answer is saved as a Q&A thought and you go back to the stream. Refresh gives new questions, and already-answered ones are never repeated |
| **Generate draft** bottom sheet: icon, presets, "Edit presets", "or", "something else..." | Same. Presets are tuned for a journal: Journal entry, Gratitude list, Letter to future me, Message to a friend, Bullet list, Memory to keep |
| "Generating first draft" screen with the preset icon | Same (bouncing icon, Cancel works) |
| Draft view: preset tag, title, body, then ✕ / ✎ / Save | ✕ discards, ✎ switches between editing and preview, Save stores the draft in the stream. Share button in the header |
| ••• menu on a stream | Rename, Drafts (n), Share as text, Delete stream (asks first, with Undo) |
| Edit presets | Add a custom preset (e.g. "Poem"), delete with Undo, restore defaults |

Tap any thought to Edit text, Copy, Save as memory or Delete (with Undo).

## Everything else (from your implementation plan)

- **Mood check-in on every open**: each time you open the app, or come back after 30+ minutes away, it asks how you feel. Tap a mood (Calm, Good, Tired, Restless, Anxious, Low, Lonely) or say it in your own words, and you get a short note plus three freshly made-up ideas from different topics, never repeating ones you did in the last 3 days. Today's card then follows that mood. You can always skip. If what you write mentions self-harm, you get call buttons for 112 and Tele MANAS 14416 instead of suggestions.
- **Today**: a time-of-day greeting with your name, mood chips you can change, **one** recommended idea with "why it fits" (capped at 3 a day), the activity in progress, a small next step ("Write one line about today" goes to your Journal), a memory from this day in a past year, and a closing line: "That is all for today."
- **Discover**: filters for time, energy, budget, place and interest. Ideas are **made up fresh every time**, never picked from a fixed list. The AI server invents them when it is connected; otherwise the on-device generator combines about 60 action templates with random details (places, people, foods, music, games, skills…), which gives hundreds of different ideas. It shows **3 at a time, for up to 3 rounds**, then says "That is plenty of ideas for now", so it never turns into an endless feed. Changing a filter starts again.
- **Activity flow**: Start → tick off steps → "I did it" or "Skip it" (with Undo). "I did it" asks for a short reflection and saves it as a memory.
- **Companion**: says it is an AI, not a person. It **remembers the conversation**: if you turn a suggestion down ("I can't go for a swim right now", "something else"), it offers a different one that fits your reason. It also **remembers across chats**: things you mention, like "I'm at work", "no money", "only 10 minutes", "too tired" or what you like and dislike, become notes that shape later ideas and replies. Situation notes fade after a few hours; likes and dislikes stay until you delete them under ••• → **What I remember**. It has quick-reply chips, a typing indicator, **Stop**, **Retry** if the server fails, an on-device fallback and an offline banner. If someone mentions self-harm, it shows crisis resources (India: 112, Tele MANAS 14416).
- **My Life**: Journal, Memories (add/edit/delete, date, tags), People (what to talk about, "Reached out", conversation starters), Projects (progress slider, update log), and a weekly reflection card that counts what you did with no streaks, plus guided weekly questions.
- **Settings**: name, interests, theme (System/Light/Dark), optional companion server URL with Test connection, Export/Import JSON, Clear memories, Delete conversations, Delete everything.
- **Privacy**: everything lives on the phone (localStorage, with audio in IndexedDB). There are no API keys in the app.

## Transitions

- A splash screen on launch.
- The app fades and scales slightly when you leave it and rises back when you return.
- Screens slide in and out (View Transitions API), tabs cross-fade, and the tab indicator stretches into place.
- Bottom sheets slide up and can be dragged down to close.
- Cards rise in one after another, buttons press in when tapped, the mic button pops in, and the My Life segment highlight slides between options.
- Haptic taps on Android.
- All motion turns off when "Reduce motion" is on.

## Journal topics

Tap **+** in the Journal, or pick a chip on an empty stream, to start from one of 10 topics: Gratitude, Relationships, Work & purpose, Body & health, Screen time, Dreams & goals, Memories, Feelings, Creativity and Money. Each topic has 5 guided questions, shown 3 at a time; refresh cycles through them and answered ones drop off. There are also more recording prompts, follow-up question templates and conversation starters.

## Extra features I added

1. **Mindful pause**: a 40-second guided breathing screen (in 4 / hold 2 / out 6, three times), then "Still want to scroll? Or maybe: …" with one short activity.
2. **Long-press shortcuts on the home-screen icon**: "Mindful pause" and "Record a thought".
3. **Native Android back gesture**: closes the top sheet, screen or recording. From another tab it returns to Today, and from Today it leaves the app.
4. **Undo** on every delete.
5. **"Save as memory"** from any journal thought.
6. **Journal search** across stream titles and the text of every thought.
7. **Weekly reflection** that opens as a guided stream.
8. **Conversation starters** for the People list, copied with one tap.
9. **Dark mode**, plus every launch starts calmly on Today.
10. **Backup and restore** as JSON.
11. **Works fully offline**. Updates load from the network when you're online.

## Not done / limits

- I built a PWA instead of a Kotlin/Compose app. This machine has no Gradle toolchain and no connected device, and a PWA can be previewed here and installed on the Pixel today. The data model and screens follow your plan, so a Compose port later is straightforward.
- Without a server, the "AI" runs on the device using rules. Deploy the backend (below) and paste its URL into Settings for real Claude replies and drafts.
- Live transcription uses Chrome's speech service. On Android it restarts after pauses (it may beep). If transcription isn't available, the audio is still saved and you can type the text later.
- Voice recordings aren't included in JSON exports.

## Backend

A FastAPI service in three files, each with a single job:

| File | What it does | How to swap it |
|---|---|---|
| `providers.py` | The text model | Set one variable: `ANTHROPIC_API_KEY` (Claude `claude-opus-5-5`), `GROQ_API_KEY` (Groq free tier, `openai/gpt-oss-120b`), or `OLLAMA_BASE_URL` (a local model through Ollama, default `qwen3.5:4b`). If several are set, that order wins. `RECLAIM_PROVIDER=claude\|groq\|ollama\|rules` forces one. Adding a provider means one class plus one line in `PROVIDERS` |
| `mood.py` | Mood detection | Uses mood keywords from `ideas.json`. For extra accuracy, `pip install -r requirements-ml.txt` adds the GoEmotions classifier (`EMOTION_MODEL`), which needs about 1.5 GB RAM, so not on Render's free plan |
| `main.py` | API routes, safety, prompts | `ALLOWED_ORIGINS`, `CRISIS_COUNTRY` (default India), `LOG_LEVEL` |

Moods live in `ideas.json` with their label, keywords, topic and energy weights, and fallback message. The app and the API read the same file, so you add or tune a mood by editing it.

| Endpoint | What it does |
|---|---|
| `POST /v1/chat` with `mode: "companion"` | Companion reply. It receives the whole conversation so far, your remembered notes, and three fresh ideas the app generated within your limits. If the model suggests one, the reply returns its id and the app shows a "Try: …" button |
| `POST /v1/chat` with `mode: "draft"` | Turns a stream into a draft of the chosen type, keeping the writer's voice |
| `POST /v1/chat/feedback` | 👍/👎 on a companion reply (the buttons appear when a server is connected) |
| `POST /v1/activities/recommend` | Fresh ideas and mood check-in: `{mood?, text?, interests, filters, notes, avoid, n}`. The model invents the ideas, and every one is checked: valid topic, timings clamped to sensible ranges, your filters respected, no repeats, unsafe wording dropped. Returns the detected mood, a short note and the ideas. With no model, or if the answer is unusable, it returns an empty list and the app generates them itself. The app waits at most 8 seconds before generating on the device |
| `DELETE /v1/conversations/{id}` | Deletes everything stored for that conversation |
| `GET /v1/health` | Status, provider, model, catalogue size. "Test connection" in Settings uses it |

How it behaves:
- **Safety first:** messages and check-ins that mention self-harm get a fixed crisis reply (112, Tele MANAS 14416) before any model is called. Model replies are also screened for a few harmful phrases (like "stop taking your medication") and replaced if one appears.
- **Without any model** it still works: the app generates ideas on the device, check-ins and the companion use mood-based replies, and drafts return 503 so the app drafts on the device instead.
- **Refusals:** if Claude's safety filter declines a request, the server's built-in fallback retries it on another model. If that also declines, the person gets a gentle reply instead of an error.
- **Privacy:** no chat text is stored on the server. Only 👍/👎 feedback goes into SQLite, and deleting a conversation removes it.
- **Protection:** input validation (message lengths, IDs, history size), a limit of 30 requests per minute per IP, and CORS restricted to your app's address through `ALLOWED_ORIGINS`.
- **API key:** the key lives only on the server, as the `ANTHROPIC_API_KEY` environment variable. It is never in the app.

### Run it on your PC

```bash
cd "C:/Dhairya Personal/App/backend" && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
```

```bash
cd "C:/Dhairya Personal/App/backend" && GROQ_API_KEY=your-key .venv/Scripts/uvicorn main:app --port 8000
```

Then in the app, open **My Life → ⚙ → Companion server**, enter `http://localhost:8000` and tap **Test connection**. Run the tests with `.venv/Scripts/python -m pytest` (no key needed).

### Put it online (so your Pixel can use it)

On **Render** (free plan) or any Python host:

1. Push the whole `App` folder (both `reclaim/` and `backend/`) to a GitHub repository.
2. On render.com, create a **New → Web Service** from that repository with these settings:
   - Build command: `pip install -r backend/requirements.txt`
   - Start command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Environment variables: `GROQ_API_KEY` (or `ANTHROPIC_API_KEY`) = your key, and `ALLOWED_ORIGINS` = your app's address (e.g. `https://reclaimyourself.netlify.app`)
3. When it's live, paste the `https://….onrender.com` address into the app's Settings and tap **Test connection**.

The app must be on HTTPS to call an HTTPS backend, so pair this with Option A below.

---

## Install on your Google Pixel 8a

The microphone and installing the app both need a **secure address** (HTTPS or `localhost`). Pick one of these options.

### Option A: Put it online for free (recommended, permanent)

1. On your PC, go to **https://app.netlify.com/drop** and sign in with a free account.
2. Drag the whole `reclaim` folder onto the page. After a few seconds you get a link like `https://something.netlify.app`.
3. On the Pixel, open that link in **Chrome**.
4. Tap **⋮ → Add to home screen → Install** (or tap the "Install app" banner).
5. Open **Reclaim** from your home screen. It runs full-screen with no browser bar.
6. The first time you tap the mic, choose **Allow** for microphone.
7. Long-press the icon for the **Mindful pause** and **Record a thought** shortcuts.

To update later, drag the folder onto the same Netlify site again. The phone picks up the new version the next time it opens the app online.

If you'd rather use GitHub Pages, push the `reclaim` folder to a repository, then turn on Settings → Pages → *Deploy from branch: main / root*.

### Option B: Install straight from this PC over USB (no hosting)

1. On the Pixel, go to **Settings → About phone** and tap **Build number** 7 times. Then go to **Settings → System → Developer options** and turn on **USB debugging**.
2. Plug the phone into the PC and tap **Allow** on the "Allow USB debugging?" prompt.
3. On the PC, start the app:
   ```bash
   cd "C:/Dhairya Personal/App/reclaim" && python -m http.server 5173
   ```
4. In another terminal, forward the port to the phone:
   ```bash
   "$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" reverse tcp:5173 tcp:5173
   ```
5. On the Pixel, open Chrome and go to **http://localhost:5173**, then tap **⋮ → Add to home screen → Install**.

Once it has loaded, it keeps working offline even after you unplug.

### Option C: A real APK (Play-Store style)

1. Do Option A first so you have an HTTPS link.
2. Go to **https://www.pwabuilder.com**, paste the link, then choose **Package for stores → Android → Generate**.
3. Download the zip and copy the `.apk` to the Pixel.
4. Open the `.apk` and allow **Install unknown apps** for your file manager when asked.
