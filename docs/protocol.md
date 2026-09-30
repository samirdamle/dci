# The DCI protocol (v1)

DCI talks to your backend with one HTTP request and a stream of
[Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html) back. The
protocol is small on purpose: any language that can read JSON and write a streaming response can
implement it. `@samirdamle/dci-protocol` has the TypeScript types, validation, and an SSE encoder and
streaming decoder; `@samirdamle/dci-server` implements the server side for JavaScript runtimes.

- [Request](#request)
- [Response: the event stream](#response-the-event-stream)
- [SSE framing](#sse-framing)
- [Errors](#errors)
- [Client actions](#client-actions)
- [Custom events](#custom-events)
- [Versioning](#versioning)
- [Writing a backend in any language](#writing-a-backend-in-any-language)

## Request

The client sends `POST {endpoint}` with `Content-Type: application/json` and
`Accept: text/event-stream`, plus any headers you configured (for example `Authorization`).

```json
{
  "v": 1,
  "sessionId": "b5d0c1e2-…",
  "prompt": "Why is this overdue?",
  "action": "explain",
  "context": [
    {
      "id": "inv_123",
      "type": "invoice",
      "label": "Invoice #123",
      "data": { "amount": 420, "status": "overdue" },
      "ancestors": [{ "id": "invoices", "type": "table", "label": "Invoices" }],
      "source": "annotated"
    }
  ],
  "page": { "url": "https://app.example.com/billing", "title": "Billing" }
}
```

| Field       | Type               | Meaning                                                                   |
| ----------- | ------------------ | ------------------------------------------------------------------------- |
| `v`         | number             | Protocol major version (`1`)                                              |
| `sessionId` | string             | Conversation id. Keep memory per session on the backend                   |
| `prompt`    | string             | What the user typed, or the suggested action's prompt                     |
| `action`    | string, optional   | The suggested action's `id`, when the user clicked one                    |
| `context`   | `DciContextNode[]` | The selected nodes; only the ones added since the last message by default |
| `page`      | `{ url, title }`   | Where the user is                                                         |

Each context node:

| Field       | Type                          | Meaning                                                                                  |
| ----------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `id`        | string, optional              | From the annotation                                                                      |
| `type`      | string, optional              | From the annotation                                                                      |
| `label`     | string, optional              | From the annotation                                                                      |
| `data`      | object                        | The annotation minus `id`, `type`, `label`, `private` (`{}` for fallback nodes)          |
| `ancestors` | array, optional               | Annotated ancestors, root first: `{ id?, type?, label?, data? }`, or `{ private: true }` |
| `source`    | `"annotated"` \| `"fallback"` | Whether the element had an annotation                                                    |
| `fallback`  | object, only for fallback     | `{ tagName, text?, ariaLabel?, alt?, title?, href?, value?, path }`                      |

See the [annotation guide](annotations.md#what-gets-sent) for how these are built. Servers should
accept unknown extra fields: they may be added within a version.

## Response: the event stream

Answer with `200 OK`, `Content-Type: text/event-stream` and a stream of events, ending with
`done`:

| Event           | Data                                | Meaning                                                  |
| --------------- | ----------------------------------- | -------------------------------------------------------- |
| `text-delta`    | `{ "text": string }`                | The next piece of the answer (Markdown)                  |
| `tool-start`    | `{ "id", "name", "label"? }`        | A tool call started; `label` is shown ("Updating deal…") |
| `tool-end`      | `{ "id", "ok": boolean, "label"? }` | That tool call finished                                  |
| `client-action` | `{ "name", "args": object }`        | Ask the page to act ([below](#client-actions))           |
| `error`         | `{ "message", "code"? }`            | Something went wrong; shown with a Retry button          |
| `done`          | `{}`                                | The response is complete. Always send it last            |
| `x-…`           | any object                          | [Your own events](#custom-events)                        |

A typical stream:

```text
event: tool-start
data: {"id":"t1","name":"lookup_invoice","label":"Looking up invoice #123…"}

event: tool-end
data: {"id":"t1","ok":true}

event: text-delta
data: {"text":"Invoice #123 is overdue because "}

event: text-delta
data: {"text":"the payment terms were net 15."}

event: client-action
data: {"name":"highlight","args":{"ids":["inv_123"]}}

event: done
data: {}
```

## SSE framing

- Each event is `event: <type>` and `data: <json>` lines followed by a blank line. The event type
  is **not** repeated inside the JSON.
- Comment lines (starting with `:`) are ignored. Send `: ping` every ~15 seconds to keep proxies
  from closing idle connections.
- `\n`, `\r\n` and `\r` line endings are all accepted, and chunks may split anywhere (including
  inside a UTF-8 character). Multi-line `data:` fields are joined with `\n`, as in the SSE spec.
- Disable response buffering in proxies: `Cache-Control: no-cache, no-transform` and, for nginx,
  `X-Accel-Buffering: no`.
- If the stream ends without `done`, the client finishes the message anyway (and warns in
  development). When the user presses Stop, the client aborts the request; stop generating when
  the connection closes.

## Errors

- **Before streaming** (bad input, auth), answer with a normal HTTP error. The client shows
  `HTTP <status>: <body>` with code `http_<status>`. `@samirdamle/dci-server` answers 405 for non-`POST`,
  415 for non-JSON and 400 for invalid requests, with a JSON body `{ error, code, issues }`.
- **During streaming**, send an `error` event and then `done`. The chat shows the message and a
  Retry button.
- Standard codes: `unsupported_version`, `bad_request`, `network` (client side), `handler_error`
  (the handler threw). Backends may use their own codes too.

## Client actions

A `client-action` event asks the page to do something: highlight what the answer talks about,
change the selection, or apply a change the agent made (write-back).

```text
event: client-action
data: {"name":"updateOpportunity","args":{"id":"006Hs00000A1","patch":{"StageName":"Negotiation"}}}
```

The page registers handlers by name with `dci.onAction(name, handler)` (or `useDciAction` in
React). Built-ins, on by default:

| Name        | Args               | Effect                            |
| ----------- | ------------------ | --------------------------------- |
| `highlight` | `{ "ids": [...] }` | Flash the elements with those ids |
| `select`    | `{ "ids": [...] }` | Replace the selection with them   |
| `scrollTo`  | `{ "id": "…" }`    | Scroll that element into view     |

Unknown actions and failing handlers raise an `actionerror` event on the page; the stream carries
on. Client actions are requests, not commands: the page decides what to do, and your backend should
already have changed its own data before asking the page to show it.

## Custom events

Event types starting with `x-` are yours: progress bars, citations, suggested follow-ups. The
client passes them to `onCustomEvent` untouched and otherwise ignores them.

```text
event: x-citation
data: {"source":"Invoice policy","url":"https://example.com/policy"}
```

## Versioning

- `v` is the **major** version. Additive changes (new optional request fields, new event types,
  new optional event fields) happen within a version, so servers must accept unknown request
  fields and clients ignore unknown events.
- A server that doesn't speak the request's `v` answers with an `error` event with code
  `unsupported_version`, then `done`. `@samirdamle/dci-server` does this for you.

## Writing a backend in any language

The whole server side is: parse the JSON, call your model or agent, write SSE events, end with
`done`. With `@samirdamle/dci-server` in JavaScript that's `dciHandler` (see
[getting started](getting-started.md#3-a-minimal-backend-with-claude)). Here's the same backend in
Python with FastAPI and the Anthropic SDK:

```python
# pip install fastapi uvicorn anthropic
import json
from anthropic import AsyncAnthropic
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()
client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY
sessions: dict[str, list[dict]] = {}


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def describe(context: list[dict]) -> str:
    lines = []
    for node in context:
        path = " › ".join(a.get("label") or a.get("id") or "?" for a in node.get("ancestors", []))
        name = node.get("label") or node.get("id") or node.get("fallback", {}).get("text", "")
        lines.append(f"- {node.get('type', 'item')} {name!r} in {path or 'page'}: {json.dumps(node['data'])}")
    return "Selected on screen:\n" + "\n".join(lines)


@app.post("/api/dci")
async def dci(request: Request):
    req = await request.json()

    async def stream():
        if req.get("v") != 1:
            yield sse("error", {"message": "Unsupported protocol version", "code": "unsupported_version"})
            yield sse("done", {})
            return
        history = sessions.setdefault(req["sessionId"], [])
        history.append({"role": "user", "content": f"{describe(req['context'])}\n\n{req['prompt']}"})
        try:
            # The model call: send the conversation to Claude (or your own model or
            # agent) and stream each piece of its reply back as a text-delta event.
            async with client.messages.stream(
                model="claude-sonnet-5-5", max_tokens=4096, messages=history
            ) as response:
                async for text in response.text_stream:
                    yield sse("text-delta", {"text": text})
                message = await response.get_final_message()
            history.append({"role": "assistant", "content": message.content})
        except Exception as err:  # report in-protocol, then finish
            yield sse("error", {"message": str(err), "code": "handler_error"})
        yield sse("done", {})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
```

Run it with `uvicorn main:app --port 8787` and point DCI at it:
`createDci({ endpoint: 'http://localhost:8787/api/dci' })` (add CORS middleware if the page is on
another origin).

To check any backend by hand:

```sh
curl -N http://localhost:8787/api/dci \
  -H 'Content-Type: application/json' \
  -d '{"v":1,"sessionId":"s1","prompt":"Hi","context":[],"page":{"url":"/","title":"Test"}}'
```

In JavaScript, `@samirdamle/dci-protocol` gives you the pieces without any server framework:

```ts
import {
  createSSEDecoder,
  encodeEvent,
  validateRequest,
  type DciEvent,
} from '@samirdamle/dci-protocol';

// Server side: validate and encode.
const result = validateRequest(JSON.parse('{"v":1}'));
if (!result.ok) console.error(result.issues);
const frame: string = encodeEvent({ type: 'text-delta', text: 'Hello' });

// Client side: decode chunks as they arrive (they may split anywhere).
const decoder = createSSEDecoder();
const events: DciEvent[] = [...decoder.push(frame.slice(0, 10)), ...decoder.push(frame.slice(10))];
```
