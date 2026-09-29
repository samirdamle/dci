/** Every piece of text the default chat UI shows. Override any key for i18n. */
export interface ChatStrings {
  title: string;
  placeholder: string;
  send: string;
  stop: string;
  retry: string;
  close: string;
  collapse: string;
  expand: string;
  resize: string;
  removeContext: (label: string) => string;
  moreContext: (count: number) => string;
  lessContext: string;
  unannotated: string;
  breadcrumb: string;
  limitReached: (shown: number, total: number) => string;
  actions: string;
  moreActions: string;
  confirmSend: string;
  confirm: string;
  cancel: string;
  dontAskAgain: string;
  cancelled: string;
  stopped: string;
  newMessages: string;
  steps: (count: number) => string;
  copy: string;
  copied: string;
  messages: string;
  you: string;
  assistant: string;
  errorTitle: string;
  emptyContext: string;
}

export const DEFAULT_STRINGS: ChatStrings = {
  title: 'Ask about this',
  placeholder: 'Ask about the selection…',
  send: 'Send',
  stop: 'Stop',
  retry: 'Retry',
  close: 'Close chat',
  collapse: 'Collapse chat',
  expand: 'Open chat',
  resize: 'Resize chat',
  removeContext: (label) => `Remove ${label}`,
  moreContext: (count) => `+${count} more`,
  lessContext: 'Show less',
  unannotated: 'unannotated',
  breadcrumb: 'Selection path',
  limitReached: (shown, total) => `Showing ${shown} of ${total}. Selection limit reached.`,
  actions: 'Suggested actions',
  moreActions: 'More actions',
  confirmSend: 'Send this context to the assistant?',
  confirm: 'Send',
  cancel: 'Cancel',
  dontAskAgain: "Don't ask again",
  cancelled: 'Message not sent.',
  stopped: 'Stopped.',
  newMessages: '↓ New',
  steps: (count) => (count === 1 ? '1 step' : `${count} steps`),
  copy: 'Copy',
  copied: 'Copied',
  messages: 'Conversation',
  you: 'You',
  assistant: 'Assistant',
  errorTitle: 'Something went wrong',
  emptyContext: 'Alt+Click anything on the page to add it as context.',
};

export const resolveStrings = (overrides: Partial<ChatStrings> = {}): ChatStrings => ({
  ...DEFAULT_STRINGS,
  ...overrides,
});
