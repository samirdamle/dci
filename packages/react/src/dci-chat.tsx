import { useEffect, type ReactNode } from 'react';
import { useChat, type UseChatResult } from './hooks';
import { useDci } from './provider';

export interface DciChatProps {
  /** Render your own chat from the live chat state and actions. */
  render: (chat: UseChatResult) => ReactNode;
}

/**
 * Replace the built-in chat UI with your own React UI. While mounted it
 * switches the instance to headless (`chat.ui: false`); on unmount the
 * previous setting comes back.
 */
export function DciChat({ render }: DciChatProps) {
  const dci = useDci();
  const chat = useChat();
  useEffect(() => {
    if (!dci) return;
    const previous = dci.config.chat?.ui ?? true;
    dci.update({ chat: { ui: false } });
    return () => dci.update({ chat: { ui: previous } });
  }, [dci]);
  return <>{render(chat)}</>;
}
