/** Default chat styles, adopted into the DCI shadow root. Theme via `--dci-*` tokens. */
export const CHAT_CSS = `
.chat {
  position: fixed; display: flex; flex-direction: column;
  background: var(--dci-bg); color: var(--dci-fg);
  border: 1px solid var(--dci-border); box-shadow: var(--dci-shadow);
  overflow: hidden;
}
.chat[hidden], .tab[hidden] { display: none; }
.chat[data-mode='popover'] {
  width: min(380px, calc(100vw - 16px)); max-height: min(560px, calc(100vh - 16px));
  border-radius: calc(var(--dci-radius) * 2);
}
.chat[data-mode='popover'][data-parked] { right: 16px; bottom: 16px; }
.chat[data-mode='popover'][data-anchor-hidden] { visibility: hidden; }
.chat[data-mode='panel'] {
  top: 0; bottom: 0; width: var(--dci-chat-width, 380px); max-width: 90vw;
}
.chat[data-mode='panel'][data-side='right'] { right: 0; border-width: 0 0 0 1px; }
.chat[data-mode='panel'][data-side='left'] { left: 0; border-width: 0 1px 0 0; }
.resize {
  position: absolute; top: 0; bottom: 0; width: 6px; cursor: ew-resize;
  background: transparent; border: 0; padding: 0;
}
.chat[data-side='right'] .resize { left: -3px; }
.chat[data-side='left'] .resize { right: -3px; }
.resize:hover, .resize:focus-visible { background: var(--dci-accent); }
.tab {
  position: fixed; top: 50%; padding: 10px 6px; writing-mode: vertical-rl;
  border: 1px solid var(--dci-border); background: var(--dci-bg); color: var(--dci-fg);
  box-shadow: var(--dci-shadow); font: inherit; cursor: pointer;
}
.tab[data-side='right'] { right: 0; border-radius: var(--dci-radius) 0 0 var(--dci-radius); }
.tab[data-side='left'] { left: 0; border-radius: 0 var(--dci-radius) var(--dci-radius) 0; }

button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { cursor: default; opacity: 0.55; }
:focus-visible { outline: 2px solid var(--dci-accent); outline-offset: 2px; }
.icon {
  border: 0; background: transparent; padding: 2px 6px; border-radius: var(--dci-radius);
  color: var(--dci-muted); line-height: 1;
}
.icon:hover { background: var(--dci-surface); color: var(--dci-fg); }

.head {
  display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--dci-border);
}
.chat[data-mode='popover'] .head { cursor: grab; }
.head h2 { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }

.crumbs { padding: 6px 12px 0; }
.crumbs ol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 0; padding: 0; list-style: none; }
.crumbs li { display: flex; align-items: center; gap: 2px; color: var(--dci-muted); }
.crumbs li + li::before { content: '›'; padding: 0 2px; }
.crumbs button {
  border: 0; background: transparent; padding: 1px 4px; border-radius: 4px;
  color: var(--dci-muted); max-width: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.crumbs button:hover { background: var(--dci-surface); color: var(--dci-fg); }
.crumbs [aria-current] { color: var(--dci-fg); font-weight: 600; }

.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; }
.chips:empty { display: none; }
.chip {
  display: inline-flex; align-items: center; max-width: 100%;
  border: 1px solid var(--dci-border); border-radius: 999px; background: var(--dci-surface);
}
.chip[data-fallback] { border-style: dashed; }
.chip > button { border: 0; background: transparent; padding: 2px 4px 2px 8px; border-radius: 999px; }
.chip .name { max-width: 20ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip small { color: var(--dci-muted); margin-left: 4px; }
.chip > button.x { padding: 2px 8px 2px 2px; color: var(--dci-muted); }
.chip > button.x:hover { color: var(--dci-fg); }
.more { border: 1px dashed var(--dci-border); border-radius: 999px; background: transparent; padding: 2px 8px; }
.hint, .notice, .limit { margin: 0; padding: 6px 12px 0; color: var(--dci-muted); font-size: 12px; }
.notice:empty, .limit:empty { display: none; }

.log {
  flex: 1; min-height: 60px; overflow-y: auto; padding: 8px 12px;
  display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain;
}
.log:empty { display: none; }
.chat[data-mode='panel'] .log:empty { display: flex; }
.msg { max-width: 100%; overflow-wrap: anywhere; }
.msg.user { align-self: flex-end; max-width: 85%; }
.msg.user .body {
  padding: 6px 10px; border-radius: 12px 12px 2px 12px;
  background: var(--dci-accent); color: var(--dci-on-accent); white-space: pre-wrap;
}
.msg .meta { color: var(--dci-muted); font-size: 11px; text-align: right; margin-top: 2px; }
.msg.assistant .body > :first-child { margin-top: 0; }
.msg.assistant .body > :last-child { margin-bottom: 0; }
.body p, .body ul, .body ol, .body blockquote, .body .code { margin: 0 0 8px; }
.body ul, .body ol { padding-left: 20px; }
.body h3, .body h4, .body h5, .body h6 { margin: 10px 0 6px; font-size: 13px; }
.body blockquote { padding-left: 8px; border-left: 3px solid var(--dci-border); color: var(--dci-muted); }
.body a { color: var(--dci-accent); }
.body code { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--dci-surface); padding: 0 3px; border-radius: 3px; }
.body hr { border: 0; border-top: 1px solid var(--dci-border); }
.code { position: relative; }
.code pre { margin: 0; padding: 8px; overflow-x: auto; background: var(--dci-surface); border-radius: var(--dci-radius); }
.code pre code { padding: 0; background: none; }
.copy {
  position: absolute; top: 4px; right: 4px; padding: 1px 6px; font-size: 11px;
  border: 1px solid var(--dci-border); border-radius: 4px; background: var(--dci-bg);
}
.typing::after { content: '…'; color: var(--dci-muted); animation: dci-blink 1s steps(2) infinite; }

.tools { margin: 0 0 6px; padding: 0; list-style: none; color: var(--dci-muted); font-size: 12px; }
details.tools summary { cursor: pointer; }
details.tools ul { margin: 4px 0 0; padding: 0; list-style: none; }
.tool { display: flex; align-items: center; gap: 6px; }
.tool .state { width: 12px; text-align: center; }
.tool[data-state='ok'] .state { color: var(--dci-success); }
.tool[data-state='failed'] .state { color: var(--dci-danger); }
.spinner {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid var(--dci-border); border-top-color: var(--dci-accent);
  animation: dci-spin 0.8s linear infinite;
}
.error {
  padding: 8px 10px; border: 1px solid var(--dci-danger); border-radius: var(--dci-radius);
  color: var(--dci-fg);
}
.error strong { color: var(--dci-danger); display: block; margin-bottom: 2px; }
.error button, .confirm button, .send {
  margin-top: 6px; padding: 4px 10px; border-radius: var(--dci-radius);
  border: 1px solid var(--dci-border); background: var(--dci-bg);
}
.stopped { color: var(--dci-muted); font-size: 12px; font-style: italic; }

.new {
  align-self: center; margin: -36px 0 8px; position: relative; padding: 2px 10px;
  border: 1px solid var(--dci-border); border-radius: 999px; background: var(--dci-bg);
  box-shadow: var(--dci-shadow);
}
.new[hidden] { display: none; }

.confirm { padding: 8px 12px; border-top: 1px solid var(--dci-border); }
.confirm:empty { display: none; }
.confirm p { margin: 0; }
.confirm label { display: inline-flex; gap: 4px; align-items: center; margin-right: 8px; color: var(--dci-muted); }
.confirm .primary { background: var(--dci-accent); color: var(--dci-on-accent); border-color: var(--dci-accent); }

.actions { position: relative; display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; }
.actions:empty { display: none; }
.actions button {
  padding: 3px 10px; border-radius: 999px; border: 1px solid var(--dci-border);
  background: var(--dci-bg); white-space: nowrap;
}
.actions button:hover:not(:disabled) { border-color: var(--dci-accent); }
.menu {
  position: absolute; right: 12px; bottom: 100%; z-index: 1; display: flex; flex-direction: column;
  gap: 2px; padding: 4px; border: 1px solid var(--dci-border); border-radius: var(--dci-radius);
  background: var(--dci-bg); box-shadow: var(--dci-shadow);
}
.menu[hidden] { display: none; }
.menu button { border-radius: 4px; border: 0; text-align: left; }

.input { display: flex; align-items: flex-end; gap: 6px; padding: 8px 12px 12px; }
.input textarea {
  flex: 1; resize: none; min-height: 34px; max-height: 160px; padding: 7px 10px;
  font: inherit; color: inherit; background: var(--dci-bg);
  border: 1px solid var(--dci-border); border-radius: var(--dci-radius);
}
.input textarea:focus-visible { outline-offset: 0; border-color: var(--dci-accent); }
.send {
  margin: 0; height: 34px; background: var(--dci-accent); color: var(--dci-on-accent);
  border-color: var(--dci-accent);
}
.send.stop { background: var(--dci-bg); color: var(--dci-fg); border-color: var(--dci-border); }
.sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@keyframes dci-spin { to { transform: rotate(360deg); } }
@keyframes dci-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .spinner, .typing::after { animation: none; }
  .log { scroll-behavior: auto; }
}
`;
