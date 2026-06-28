# Mingo — Feature Implementation Specs

A ranked, pasteable backlog of feature/UX work for Mingo. Each task below is a **standalone
implementation spec** designed to be pasted into a coding-assistant session one at a time.

> **How to use this:** Each task is self-contained *except* it assumes the **Shared Context** block.
> For best results, paste **Shared Context + the one task you want**. Tasks never reference each other,
> so you can cherry-pick freely.

Ranking method: **ROI = impact ÷ effort**, **Affect = how much of the product it touches**, with
dependency order breaking ties. Impact is 1–5; Effort is S (hours–1 day), M (days), L (1–2+ weeks).

---

## 📋 SHARED CONTEXT (paste this above any task)

```
PROJECT: "Mingo" — AI meeting-management app. Monorepo with npm workspaces:
- backend/  : Node + Express 5 + TypeScript + Mongoose (MongoDB). OpenAI for LLM (gpt-4o-mini)
              and Whisper. Entry: backend/src/server.ts -> index.ts. All routes under /api.
- frontend/ : React + Vite + TypeScript, react-router, plain CSS-per-component. Auth via JWT in
              localStorage; use fetchWithAuth() from frontend/src/lib/auth.ts for all API calls
              (it injects the Bearer token and auto-refreshes on 401).

KEY FILES:
- Live meeting screen:  frontend/src/pages/MeetingPage.tsx (+ .css)
- Dashboard:            frontend/src/pages/DashboardPage.tsx (+ .css)
- Meeting history:      frontend/src/pages/HistoryPage.tsx
- Tasks page:           frontend/src/pages/TasksPage.tsx
- Modals:               frontend/src/components/{StartMeetingModal,NewFutureMeetingModal,UploadMeetingModal}/
- Agent logic:          backend/src/services/LLM/mingoAgentService.ts
- Agent HTTP:           backend/src/controllers/mingoAgentController.ts + routes/mingoAgentRoute.ts
- LLM client:           backend/src/services/LLM/llmService.ts (OpenAI chat completions)
- Models:               backend/src/models/{meetings,tasks,users,transcript,mingoAgent}Model.ts

RELEVANT ENDPOINTS (all require Authorization: Bearer):
- GET    /api/meetings/:meetingId/mingoAgent                      -> chat history {messages:[{sender,content,timestamp}]}
- POST   /api/meetings/:meetingId/mingoAgent/generateReply        -> {reply, taskActionPerformed}
- GET    /api/meetings/:meetingId/mingoAgent/generateSummary      -> {summary}
- GET/PUT/DELETE /api/meetings/meetings/:id                       -> single meeting CRUD (note doubled "meetings/meetings")
- GET    /api/meetings/meetings/:userId/{upcoming,recent,this-month,last-month,average-duration}
- GET/POST       /api/meetings/:meetingId/tasks                   -> meeting's local tasks
- PUT/DELETE     /api/meetings/:meetingId/tasks/:taskId
- GET    /api/users/:userId/tasks?repo=owner/name                 -> merged local + live GitHub issues
- GET    /api/auth/github/repos  -> [{id, name, fullName, owner, private}]  (already used by UploadMeetingModal)

CONVENTIONS: meeting.gitHubRepoName may be a short name or "owner/name". Task status enum is
"To Do" | "In Progress" | "Done". Controllers extend baseController; services throw typed errors
with a .statusCode. Keep the existing code style (no new state libs unless the task says so).
```

---

## Ranked overview

| # | Task | Wave | Impact | Effort |
|---|------|------|--------|--------|
| 1 | Remove the fabricated meeting summary | 1 | 4 | S |
| 2 | Real participant names (not ObjectIds) in summaries | 1 | 4 | S |
| 3 | Render markdown in Mingo chat messages | 1 | 4 | S |
| 4 | Confirm before "End Meeting" | 1 | 3 | S |
| 5 | Auto-scroll chat to the newest message | 1 | 3 | S |
| 6 | Trend deltas on dashboard stat cards | 1 | 3 | S |
| 7 | Make dashboard action cards keyboard-accessible | 1 | 3 | S |
| 8 | Multiline chat input (Enter sends, Shift+Enter newline) | 1 | 3 | S |
| 9 | Retry buttons + honest error propagation | 1 | 3 | S |
| 10 | Inline-edit the meeting title (or remove dead pencil) | 1 | 2 | S |
| 11 | Stream Mingo's replies (SSE) | 2 | 5 | M |
| 12 | Search & filter past meetings | 2 | 4 | M |
| 13 | Surface open action items from previous meetings | 2 | 4 | M |
| 14 | Parse due dates in chat task commands | 2 | 4 | M |
| 15 | Overdue-task warning in the meeting hero | 2 | 4 | M |
| 16 | Live elapsed-time clock + LIVE badge | 2 | 3 | S–M |
| 17 | Replace free-text repo entry with a repo dropdown | 2 | 4 | S–M |
| 18 | Export / share the meeting summary | 2 | 4 | M |
| 19 | Show local tasks even when no repo is linked | 2 | 3 | S–M |
| 20 | Mobile responsiveness | 3 | 4 | M–L |
| 21 | Clickable task mention cards in chat | 3 | 3 | M |
| 22 | Email assignees when a task is assigned | 3 | 3 | M |
| 23 | Modal focus-trap + Escape-to-close | 3 | 3 | M |
| 24 | First-run onboarding checklist | 3 | 3 | M |
| 25 | Replace scattered-localStorage session model | 3 | 4 | M–L |
| 26 | Pre-meeting brief from history | 4 | 4 | M–L |
| 27 | Real-time live transcription | 4 | 5 | L |
| 28 | Command palette (Cmd/Ctrl-K) | 4 | 3 | M–L |
| 29 | Recurring / linked meetings | 4 | 3 | L |

---

# 🌊 WAVE 1 — Quick wins

## TASK 1 — Remove the fabricated meeting summary
```
GOAL: Stop showing invented summary text. Today frontend/src/pages/MeetingPage.tsx has
buildMeetingNarrative() (~line 74) that fabricates "...focused on aligning the team around {repo}.
The discussion covered product direction, design follow-ups..." and uses it as the summary fallback.

DO:
1. Delete buildMeetingNarrative() and the `summaryNarrative` const (~line 351).
2. In handleEndMeeting(): initialize summaryText to '' (not the narrative). Rely on the existing
   summaryLoading / summaryError states. If the server summary call fails or returns empty, set
   summaryError to an honest message ("Summary couldn't be generated — try again.") and render a
   "Retry" button that re-calls /api/meetings/:id/mingoAgent/generateSummary.
3. In the summary modal body (~line 970), render: loading -> spinner; error -> error + Retry;
   else -> summaryText. Never fall back to a generated narrative.
4. In handleSendSummaryEmail(), send summaryText only; if empty, block send with a message instead
   of emailing fabricated text.

VERIFY: End a meeting with the LLM key unset/unreachable -> you see an honest "couldn't generate"
state with Retry, never invented sentences.
```

## TASK 2 — Use real participant names (not ObjectIds) in summaries
```
GOAL: Summaries/answers currently print raw Mongo ObjectIds for organizer/participants.
Fix backend/src/services/LLM/mingoAgentService.ts.

DO:
1. In getMeetingOrThrow() (~line 1655), add populates so names are available:
   .populate("participants", "fullname email username")
   .populate("organizerId", "fullname email")
   (keep the existing tasks populate and .lean()).
2. In formatMeetingSummary() (~line 1196), replace the raw Organizer ID / Participants lines with
   names: organizer -> meeting.organizerId.fullname; participants -> map to (p.fullname || p.username
   || p.email). Guard for when they're still plain ids/strings.
3. In generateSummary()'s prompt (~line 1888-1901), replace summarizeContextValue(meeting.participants)
   and organizerId with the resolved names.

VERIFY: Generate a summary for a meeting with 2+ participants -> the text references their names,
and no 24-character hex ids appear.
```

## TASK 3 — Render markdown in Mingo chat messages
```
GOAL: Mingo replies contain **bold**, bullets, and code but render as raw text. Add a markdown renderer.

DO (frontend workspace):
1. cd frontend && npm install react-markdown remark-gfm
2. In frontend/src/pages/MeetingPage.tsx, the message bubble (~line 715) renders {message.text}.
   For sender === 'mingo', render:
     <div className="meeting-message__bubble">
       <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
     </div>
   Keep user messages as plain text. (react-markdown does NOT render raw HTML by default — safe.)
3. Do the same in frontend/src/pages/DashboardPage.tsx history chat (~line 1097, {message.content}).
4. Add minimal CSS for .meeting-message__bubble p/ul/ol/li/code/strong (tight margins so bubbles
   don't get huge; code -> monospace with subtle background).

VERIFY: Ask Mingo something that returns a bulleted list -> bullets, bold, and inline code render.
```

## TASK 4 — Confirm before "End Meeting"
```
GOAL: In frontend/src/pages/MeetingPage.tsx the "End Meeting" button (~line 650) calls
handleEndMeeting() immediately and clears the draft — one stray click ends the session.

DO:
1. Add state: const [showEndConfirm, setShowEndConfirm] = useState(false).
2. Change the End button onClick to setShowEndConfirm(true).
3. Render a small confirm modal (reuse the existing modal overlay classes) with text
   "End this meeting? Mingo will generate the summary and you can't reopen it." and two buttons:
   "Cancel" (setShowEndConfirm(false)) and "End meeting" (setShowEndConfirm(false); void handleEndMeeting()).
4. Close on Esc and on overlay click.

VERIFY: Clicking End shows the confirm; Cancel does nothing; End meeting proceeds as before.
```

## TASK 5 — Auto-scroll chat to the newest message
```
GOAL: New messages append below the fold in frontend/src/pages/MeetingPage.tsx.

DO:
1. Add: const bottomRef = useRef<HTMLDivElement>(null);
2. Inside the scrollable chat body (.meeting-chat-card__body, after the messages.map and the typing
   indicator, ~line 738) add: <div ref={bottomRef} />
3. Add an effect:
   useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); },
            [messages, isMingoTyping]);

VERIFY: Send several messages -> the view scrolls to the latest automatically; the typing indicator
is visible when Mingo is responding.
```

## TASK 6 — Trend deltas on dashboard stat cards
```
GOAL: The "Meetings this month" stat in frontend/src/pages/DashboardPage.tsx shows a bare number.
Add "↑/↓ N vs last month" using the EXISTING unused endpoint
GET /api/meetings/meetings/:userId/last-month (returns an array of meetings).

DO:
1. Add state: const [lastMonthCount, setLastMonthCount] = useState<number | null>(null).
2. In loadDashboardStats() (~line 423), add a 3rd parallel fetch to
   /api/meetings/meetings/${currentUser._id}/last-month, set lastMonthCount to its array length.
3. Under the "Meetings this month" stat number (~line 800), render a small delta line when both
   counts are known: const delta = meetingsThisMonth - lastMonthCount; show "↑{delta} vs last month"
   (green) / "↓" (muted) / "No change". Hide while either is null.

VERIFY: Dashboard shows a delta indicator under the monthly meeting count.
```

## TASK 7 — Make dashboard action cards keyboard-accessible
```
GOAL: In frontend/src/pages/DashboardPage.tsx the three action cards (~lines 702, 747, 768) are
<div onClick> — not focusable or Enter-activatable.

DO:
1. Convert the "Create New Meeting" and "Upload Meeting" cards to <button type="button"> keeping the
   existing className/onClick. In CSS reset button defaults (background:none; border:0;
   text-align:left; width:100%; cursor:pointer; font:inherit).
2. The "Start Live Meeting" card contains a NESTED button ("Go to Live Meeting", ~line 733), so it
   can't become a <button> (invalid nesting). Instead give that card: role="button", tabIndex={0},
   and onKeyDown firing the same handler on Enter/Space (when !hasActiveMeeting). When disabled, set
   tabIndex={-1} and aria-disabled.

VERIFY: Tab to each card; Enter/Space activates it; the disabled live card is skipped/inert.
```

## TASK 8 — Multiline chat input (Enter sends, Shift+Enter newline)
```
GOAL: In frontend/src/pages/MeetingPage.tsx the chat input (~line 742) is a single-line
<input type="text">, so newlines are impossible.

DO:
1. Replace it with a <textarea> bound to chatInput, rows=1, that auto-grows (on change, set
   style.height = 'auto' then scrollHeight, capped ~5 lines).
2. Add onKeyDown: if e.key === 'Enter' && !e.shiftKey -> e.preventDefault() and call the same submit
   path as the form (extract the send logic so both onSubmit and Enter call handleSend). Shift+Enter
   inserts a newline (default).
3. Keep the form's onSubmit + the send button working. Reset textarea height after send.

VERIFY: Enter sends; Shift+Enter adds a line; the box grows then scrolls.
```

## TASK 9 — Retry buttons + honest error propagation
```
GOAL: Load errors render as dead-end text; the agent controller swallows typed errors into a generic 500.

DO (backend):
1. In backend/src/controllers/mingoAgentController.ts, generateReply() and generateSummary() catch
   blocks: if (err instanceof MingoAgentError) return res.status(err.statusCode).json({error: err.message}).
   (Import/relax the type as needed.) This surfaces 404 "Meeting not found", 429, etc.

DO (frontend, frontend/src/pages/DashboardPage.tsx):
2. Next to each error message (upcomingError ~847, recentError ~941, tasksError ~900) add a small
   "Try again" button that re-invokes the matching loader (loadUpcomingMeetings / loadRecentMeetings /
   loadOpenTasks).
3. In frontend/src/pages/MeetingPage.tsx, taskUpdateError (~line 872) gets a "Retry" that re-runs the
   last toggle, and the chat catch (~line 410) shows the server's error text when present instead of
   the generic "Something went wrong."

VERIFY: Kill the backend mid-session -> errors show a working "Try again"; a 429 from OpenAI shows a
rate-limit message rather than a generic failure.
```

## TASK 10 — Inline-edit the meeting title (or remove the dead pencil)
```
GOAL: The "Edit meeting" pencil button in the live hero (frontend/src/pages/MeetingPage.tsx ~line 600)
has no onClick. Either wire it (preferred) or remove it.

DO (preferred — inline title edit):
1. Add state isEditingTitle + editableTitle (seed from meetingTitle).
2. Pencil onClick -> setIsEditingTitle(true). Render an <input> in place of the <h1> while editing,
   with Save/Cancel. Save -> PUT /api/meetings/meetings/${meetingId} with { title } via fetchWithAuth,
   then update meetingDetails state and exit edit mode. Cancel reverts.
3. Disable Save while empty or saving; surface errors inline.

ALT (if you don't want title editing): just delete the pencil <button> at ~line 600.

VERIFY: Click the pencil, rename the meeting, Save -> title persists across refresh.
```

---

# 🌊 WAVE 2 — Core spine

## TASK 11 — Stream Mingo's replies (SSE)
```
GOAL: Replies arrive all at once after a long wait. Stream tokens so text appears as it's generated.
The pre-processing (task detection, retrieval, persistence) in
backend/src/services/LLM/mingoAgentService.generateReply() must stay; only the FINAL LLM call streams.

BACKEND:
1. In llmService (backend/src/services/LLM/llmService.ts) add generateStream(options, onToken) that
   POSTs to https://api.openai.com/v1/chat/completions with stream:true, reads the response body as a
   stream, parses `data: {...}` SSE lines, and calls onToken(delta.choices[0].delta.content) per chunk.
   Return the full concatenated string.
2. In mingoAgentService add generateReplyStream(meetingId, message, userId, transcript, onToken):
   copy generateReply()'s body up to the final LLM call; for the final call use llmService.generateStream
   forwarding tokens via onToken; after completion, run the SAME persistence (append user+assistant
   messages, chat.save()) and return { reply, taskActionPerformed }.
3. Add route POST /api/meetings/:meetingId/mingoAgent/generateReply/stream (authenticate). Controller:
   set headers Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive;
   res.flushHeaders(); call generateReplyStream with onToken writing `data: ${JSON.stringify({token})}\n\n`;
   at the end write `data: ${JSON.stringify({done:true, taskActionPerformed})}\n\n` then res.end().
   On error write `data: ${JSON.stringify({error:true})}\n\n` and end.

FRONTEND (frontend/src/pages/MeetingPage.tsx handleSend):
4. POST to the new /stream endpoint, read response.body.getReader(), decode chunks, split on "\n\n",
   parse each `data:` payload. On first token push a new empty mingo message, then append tokens to it
   (update the last message's text). On {done} stop the typing indicator and refresh tasks if
   taskActionPerformed. If the stream errors or the endpoint 404s, fall back to the existing
   non-streaming /generateReply call.

VERIFY: Send a question -> tokens appear progressively; task commands still execute; chat history still
persists; falling back works if streaming fails.
```

## TASK 12 — Search & filter past meetings
```
GOAL: frontend/src/pages/HistoryPage.tsx lists the user's meetings but offers no search/filter.
(The page fetches all meetings via GET /api/meetings/meetings/:userId.)

DO (client-side filtering over the already-fetched array — no backend change needed):
1. Add state: searchText, fromDate, toDate.
2. Add a toolbar above the list: a text input (placeholder "Search title or repo") and two date inputs.
3. Derive a filtered list: match searchText (case-insensitive) against meeting.title and
   gitHubRepoName; keep meetings whose date is within [fromDate, toDate] when those are set.
4. Render the filtered list; show an empty state ("No meetings match your filters") when zero.
5. Debounce the text filter (~150ms) for smoothness.

VERIFY: Typing filters live by title/repo; date range narrows results; clearing restores the full list.
```

## TASK 13 — Surface open action items from previous meetings
```
GOAL: When in a live meeting, show open tasks carried over from the user's prior meetings on the SAME
GitHub repo, so nothing falls through the cracks.

BACKEND:
1. Add GET /api/meetings/:meetingId/related-open-tasks (authenticate) in tasksController (or
   meetingsController). Logic: load the current meeting; find other meetings of req.user (organizer or
   participant) with the same gitHubRepoName and date < current meeting date; collect their tasks
   (populate meeting.tasks) where status !== "Done"; dedupe by (gitHubRepoName#gitHubIssueId) or _id;
   return [{ _id, title, status, dueDate, gitHubIssueId, gitHubRepoName, meetingTitle }].

FRONTEND (frontend/src/pages/MeetingPage.tsx):
2. On load, if a repo is set, fetch the endpoint and render a "Carried over from previous meetings"
   card in the right-side column (above Tasks), each row showing title + source meeting title + due.
   Hide the card when empty.

VERIFY: Create meeting A on repo X with an open task, then a later meeting B on repo X -> B shows A's
open task under "Carried over".
```

## TASK 14 — Parse due dates in chat task commands
```
GOAL: "Create a task to fix login, due next Friday" should set a due date. Extend the task-command
classifier in backend/src/services/LLM/mingoAgentService.ts.

DO:
1. In detectTaskAction() (~line 831): inject today's date into the system prompt
   ("Current date (ISO): " + new Date().toISOString()). Extend the "create" JSON shape to include an
   optional "dueDate" as an ISO 8601 date, instructing the model to resolve relative phrases
   ("next Friday", "in 3 days", "end of month") to an absolute ISO date, or omit if none.
2. Extend the TaskAction "create" type with dueDate?: string. Parse/validate it (new Date(...) not NaN).
3. In executeTaskAction() create branch (~line 1043): after creating the GitHub issue + local task,
   set the parsed dueDate on the local task record (tasksModel has a dueDate field). (GitHub issues have
   no native due date, so store it locally; optionally mention the due date in the issue body.)

VERIFY: In chat, "create a task X due next Friday" -> the resulting local task has dueDate set to the
correct upcoming Friday, and it shows in task lists with that due date.
```

## TASK 15 — Overdue-task warning in the meeting hero
```
GOAL: Warn when the meeting's repo has overdue tasks. In frontend/src/pages/MeetingPage.tsx tasks are
loaded in loadTasks() but `due` is a display string — keep the raw ISO too.

DO:
1. In loadTasks() mapping (~line 318), also store dueIso: task.dueDate (raw) on each task object
   (extend the Task type with dueIso?: string).
2. Compute: const overdue = tasks.filter(t => !t.done && t.dueIso && new Date(t.dueIso).getTime() < Date.now()).
3. In the hero (near .meeting-hero__meta), when overdue.length > 0 render a warning chip:
   "⚠ {n} overdue" with a distinct color. Optionally a tooltip listing titles.

VERIFY: A task with a past due date and status != Done makes the hero show "⚠ 1 overdue".
```

## TASK 16 — Live elapsed-time clock + LIVE badge
```
GOAL: The live meeting has no running timer. In frontend/src/pages/MeetingPage.tsx duration is only
computed at end (handleEndMeeting).

DO:
1. Determine startedAt = parsedDraft?.date ? new Date(parsedDraft.date) : new Date() (compute once).
2. Add elapsed state + an interval: useEffect(() => { const id = setInterval(() => setElapsed(
   Date.now() - startedAt.getTime()), 1000); return () => clearInterval(id); }, []).
3. Format as HH:MM:SS and render in the hero. When the meeting is live (not uploadedTranscript), show a
   pulsing red "● LIVE" badge next to it (CSS keyframe pulse).

VERIFY: The hero shows a ticking timer; the LIVE badge pulses for live (non-uploaded) meetings.
```

## TASK 17 — Replace free-text repo entry with a repo dropdown
```
GOAL: Meeting-creation screens should pick the GitHub repo from a dropdown, like UploadMeetingModal
already does, instead of typing it.

REFERENCE PATTERN (frontend/src/components/UploadMeetingModal/UploadMeetingModal.tsx):
- Loads repos: useEffect fetching '/api/auth/github/repos' -> [{id, name, fullName, owner, private}]
  into `repositories` state (~lines 123-141).
- Renders a <select> with <option value={repo.name}>{repo.fullName}</option> (~lines 600-612).

DO:
1. Open frontend/src/components/StartMeetingModal/StartMeetingModal.tsx and
   frontend/src/components/NewFutureMeetingModal/NewFutureMeetingModal.tsx. If either uses a free-text
   input for the repo, replace it with the same repo-loading effect + <select> pattern above. Keep the
   submitted value as repo.name (backend accepts short name). Handle the "no repos / not connected"
   error state like the upload modal's reposLoadError.

VERIFY: On both screens the repo is chosen from a dropdown of the user's repos; submitting creates the
meeting with the selected repo.
```

## TASK 18 — Export / share the meeting summary
```
GOAL: The only way to share a summary is Gmail. Add Copy, Download (Markdown), and Print-to-PDF.
Targets: the summary modal in frontend/src/pages/MeetingPage.tsx (~line 928) and the history summary
modal in frontend/src/pages/DashboardPage.tsx (~line 989).

DO:
1. Build a markdown string from the summary: title, date, repo, participants, summary text,
   closed/open tasks (the data is already in component state).
2. Add buttons in the modal actions:
   - Copy: navigator.clipboard.writeText(markdown) + a "Copied!" toast/label.
   - Download .md: new Blob([markdown], {type:'text/markdown'}) -> object URL -> <a download>.
   - PDF: simplest is window.print() scoped to a print-styled container (add @media print CSS that
     hides everything except .meeting-summary-modal). (If you prefer a real file, use jsPDF instead.)
3. Keep the existing "Send by Email" button.

VERIFY: Copy puts the summary on the clipboard; Download saves a .md; Print produces a clean PDF of
just the summary.
```

## TASK 19 — Show local tasks even when no repo is linked
```
GOAL: In frontend/src/pages/MeetingPage.tsx, loadTasks() returns early when there's no repo:
`if (!userId || !repo) return;` — so repo-less meetings show an empty task panel.

DO:
1. Always fetch the meeting's local tasks via GET /api/meetings/${meetingId}/tasks.
2. If a repo IS set, also fetch GET /api/users/${userId}/tasks?repo=... and merge, deduping by
   (gitHubRepoName#gitHubIssueId) else _id (mirror mergeMeetingTasks in DashboardPage.tsx ~line 126).
3. Remove the `!repo` early-return; keep the `!meetingId` guard. Map both sources into the existing
   Task shape so toggling/rendering is unchanged.

VERIFY: A meeting created without a GitHub repo still lists and toggles its local tasks.
```

---

# 🌊 WAVE 3 — Reach & reliability

## TASK 20 — Mobile responsiveness
```
GOAL: Layouts break on narrow screens. Add responsive CSS (no JS/layout-logic changes).

DO — add @media (max-width: 768px) rules:
1. frontend/src/pages/MeetingPage.css: make .meeting-content single-column (the chat + side panel
   stack); cap chat height and let it scroll; full-width cards; shrink hero meta to wrap.
2. frontend/src/pages/DashboardPage.css: .dashboard-actions, .dashboard-stats, and .dashboard-bottom
   become 1 column; cards full width.
3. Modals: .start-meeting-grid and the summary modal column layouts stack vertically; modal width 92vw.
4. frontend/src/components/Header/Header.css: collapse nav into a wrap or simple menu at small widths.
Test at 375px and 414px.

VERIFY: At 375px the dashboard, live meeting, and modals are usable with no horizontal scroll or
clipped content.
```

## TASK 21 — Clickable task mention cards in chat
```
GOAL: When Mingo mentions an issue like "#12", render it as a clickable chip instead of plain text.
(Assumes markdown rendering is already in place; if not, this works on plain text too.)

DO (frontend/src/pages/MeetingPage.tsx):
1. The component already holds the loaded `tasks` array (each with gitHubIssueId, htmlUrl, title).
   Build a lookup: Map<issueNumber, task>.
2. For mingo messages, post-process the text: find /#(\d+)/ matches; for each that exists in the
   lookup, render a small inline chip <a className="task-chip" href={task.htmlUrl} target="_blank">
   #{n} {task.title}</a> (truncate title). Non-matching #n stays plain.
   (If using react-markdown, do this via a custom `text` renderer or a remark/rehype step; otherwise
   split the string into React nodes.)
3. Style .task-chip as a pill (subtle bg, no underline, hover state).

VERIFY: Ask Mingo about issues -> "#12" becomes a clickable pill linking to the GitHub issue.
```

## TASK 22 — Email assignees when a task is assigned
```
GOAL: Notify a person by email when they're assigned a task. Reuse the existing Gmail-send capability
in backend/src/controllers/meetingsController.ts (see sendMeetingSummaryEmail: it builds a base64url
raw message and POSTs to gmail.googleapis.com using the sender's googleAccessToken + gmail.send scope).

DO:
1. Extract a small sendGmail(sender, to, subject, body) helper from that method (or a new
   services/Email/gmailService.ts) so it's reusable.
2. Trigger it when a task is assigned to a REGISTERED user (has assigneeId -> look up their email):
   - In tasksController.update(): if the payload sets/changes assigneeId, after saving, send the
     assignee an email ("You've been assigned: {title}") from the acting user's Google account.
   - (Optional) In mingoAgentService.executeTaskAction 'assign' branch — note that path assigns a
     GitHub login which may not map to a Mingo user/email; only email if you can resolve an email.
3. Best-effort: wrap in try/catch and never fail the request if the email send fails.
LIMITATION to call out in code comments: requires the acting user to have connected Google with the
gmail.send scope; GitHub-login-only assignees without a matching user record can't be emailed.

VERIFY: Assign a task to a registered teammate -> they receive an assignment email; assignment still
succeeds if email can't be sent.
```

## TASK 23 — Modal focus-trap + Escape-to-close
```
GOAL: Modals don't trap focus or close on Esc, and behavior is inconsistent across the app.

DO:
1. Create frontend/src/hooks/useModal.ts: a hook useModal(onClose) that, on mount, records the
   previously focused element, focuses the modal container, adds a keydown listener (Escape -> onClose;
   Tab -> cycle focus within focusable children), and on unmount removes the listener and restores focus.
   Return a ref to attach to the modal container.
2. Apply it to: the summary modal in MeetingPage.tsx (~line 928), the history modal in
   DashboardPage.tsx (~line 989), and the StartMeeting/NewFutureMeeting/UploadMeeting modals. Add
   role="dialog" aria-modal="true" to each container.
3. Standardize overlay-click-to-close on all of them.

VERIFY: Esc closes any modal; Tab stays within it; focus returns to the trigger on close.
```

## TASK 24 — First-run onboarding checklist
```
GOAL: New users land on empty states with no guidance. Add a dismissible activation checklist on the
dashboard.

DO (frontend/src/pages/DashboardPage.tsx):
1. Determine completion of 3 steps:
   - GitHub connected: GET /api/user/:id and check for githubId (or reuse data you already load).
   - Google connected: same record, googleId present.
   - First meeting: any meetings exist (recent/upcoming/this-month already fetched).
2. Render a "Get started" card at the top listing the 3 steps with check/empty states; incomplete
   steps link to actions (GitHub/Google -> /settings; meeting -> open StartMeetingModal/UploadModal).
3. Hide the card when all complete OR when dismissed; persist dismissal in
   localStorage('onboardingDismissed').

VERIFY: A fresh account shows the checklist; connecting GitHub/Google and creating a meeting tick the
items; dismiss hides it permanently.
```

## TASK 25 — Replace scattered-localStorage session model
```
GOAL: Live-meeting state is spread across many localStorage keys (currentMeetingId,
currentMeetingDraft, lastSummaryMeetingId, uploadedTranscript, uploadedSuggestedTasks) read with long
fallback chains in MeetingPage.tsx, DashboardPage.tsx, and components/LiveMeetingDock. This causes
stuck/lost live-meeting bugs. Centralize it.

DO (frontend, refactor — keep behavior identical):
1. Create frontend/src/context/MeetingSessionContext.tsx exposing { activeMeetingId, draft,
   startSession(meeting), endSession(), updateDraft(partial) }. It owns ONE serialized object in
   localStorage ('mingoSession') and exposes typed getters; syncs across tabs via the 'storage' event.
2. Wrap the app (frontend/src/App.tsx) in the provider.
3. Replace direct localStorage reads/writes in MeetingPage.tsx, DashboardPage.tsx, LiveMeetingDock,
   and UploadMeetingModal with the context API. Migrate any legacy keys on first load.
OPTIONAL BACKEND: GET /api/meetings/:userId already exists; you can additionally derive the
"live" meeting from status:'live' to recover after a cache clear.

VERIFY: Start a meeting, refresh, switch tabs -> the live session is consistent everywhere; ending it
clears state in one place; no orphaned keys remain.
```

---

# 🌊 WAVE 4 — Big bets

## TASK 26 — Pre-meeting brief from history
```
GOAL: On entering a live meeting, show a brief generated from past meetings sharing the repo/attendees:
"Last time you discussed X; 3 tasks still open."

BACKEND (backend/src/services/LLM/mingoAgentService.ts):
1. Add generateBrief(meetingId, userId): reuse findRelevantMeetings()/loadTaskFactsForMeeting() to
   gather the most relevant prior meetings (same repo or shared participants, date < current) and their
   OPEN task facts. Build a concise prompt ("Summarize what to know before this meeting: prior topics,
   decisions, and still-open action items. Be brief, grounded, no fabrication.") and call the LLM with
   the existing timeout + fallback handling. Return { brief, openTaskCount, relatedMeetingTitles }.
2. Add GET /api/meetings/:meetingId/brief (authenticate) -> the controller calls it.

FRONTEND (frontend/src/pages/MeetingPage.tsx):
3. On load, fetch the brief and render a dismissible "Before this meeting" card at the top of the chat
   column (loading/empty/error states). Don't block the rest of the page on it.

VERIFY: A second meeting on the same repo shows a brief referencing the earlier meeting and its open
tasks; no invented facts.
```

## TASK 27 — Real-time live transcription
```
GOAL: Transcribe a live mic feed so the transcript builds as people speak (today it's MP3-upload only,
via OpenAI Whisper in backend/src/services/Transcript/transcribeMP3Service.ts).

PHASED PLAN (do Phase 1 first; it ships value with low risk):
PHASE 1 — chunked near-real-time (reuse Whisper):
1. Frontend: in the live meeting, use MediaRecorder to capture mic audio in ~10–15s chunks
   (audio/webm). On each chunk, POST it to a new backend endpoint.
2. Backend: add POST /api/transcript/stream-chunk (authenticate, multer memory) that sends the chunk to
   OpenAI Whisper (same auth/pattern as requestTranscription) and returns the partial text; append it
   to the meeting's transcript doc. Frontend appends returned text to a live transcript panel.

PHASE 2 — true streaming (lower latency):
3. Add a WebSocket server (ws) on the backend; stream raw audio frames to a streaming STT provider
   (Deepgram live or OpenAI Realtime) and push interim+final transcripts back over the socket.
4. Frontend renders interim (grey) vs final (solid) text; persist finals to the transcript doc.

CONCERNS to handle: mic permission UX, browser codec support, cost/rate limits, and writing partials
without clobbering the stored transcript (append-only with ordering).

VERIFY (Phase 1): Speak during a live meeting -> transcript text appears within ~15s and is saved to
the meeting's transcript.
```

## TASK 28 — Command palette (Cmd/Ctrl-K)
```
GOAL: A global palette to jump to any meeting/task and to ask Mingo from anywhere.

DO (frontend):
1. Add a global keydown listener (in App.tsx or a top-level provider) for (e.metaKey||e.ctrlKey) &&
   e.key === 'k' -> toggle a CommandPalette overlay (build custom, or use the `cmdk` library).
2. On open, fetch the user's meetings (GET /api/meetings/meetings/:userId) and tasks
   (GET /api/users/:userId/tasks); show a fuzzy-filtered combined list. Selecting a meeting navigates
   to it; selecting a task opens its GitHub URL or the owning meeting.
3. Add an "Ask Mingo" row: if there's an active meeting, route the typed query to that meeting's
   generateReply; otherwise prompt the user to open a meeting first.
4. Full keyboard nav (arrows, Enter, Esc) and focus trap.

VERIFY: Cmd/Ctrl-K opens the palette anywhere; typing filters meetings/tasks; Enter navigates; Esc closes.
```

## TASK 29 — Recurring / linked meetings
```
GOAL: Link meetings into a series (e.g., weekly standup) so Mingo can track follow-ups across sessions.

DO:
BACKEND (backend/src/models/meetingsModel.ts):
1. Add fields: seriesId (ObjectId, optional, indexed) and recurrence ({ frequency: "weekly"|"none",
   interval?: number } or a simple enum).
2. In meetingsController.create(): if recurrence is requested, generate a seriesId and either
   pre-create the next N occurrences or store the rule so future meetings inherit seriesId.
3. Add GET /api/meetings/:meetingId/series -> returns the chronological meetings sharing seriesId
   (with their open-task counts), for follow-up tracking.
4. (Optional) In mingoAgentService, when a meeting has a seriesId, prefer same-series meetings in
   findRelevantMeetings scoring so the assistant naturally references prior occurrences.

FRONTEND:
5. Add a "Repeat weekly" option in NewFutureMeetingModal; show a "Series" view (list of occurrences +
   carried-over open tasks) on the meeting/history screens.

VERIFY: Creating a weekly meeting produces linked occurrences sharing a seriesId; the series view lists
them and their open tasks; Mingo references prior occurrences in the same series.
```
