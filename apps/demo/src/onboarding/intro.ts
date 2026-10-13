import { MessageCircleQuestion, MousePointerClick, Sparkles, type LucideIcon } from 'lucide-react';

export interface IntroSection {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** The tour's first screen: what DCI is, the problem, and the fix. Two lines each. */
export const INTRO_SECTIONS: readonly IntroSection[] = [
  {
    icon: Sparkles,
    title: 'What is DCI?',
    body: 'Direct Contextual Intelligence lets you point at things in an app and chat with AI about exactly those things.',
  },
  {
    icon: MessageCircleQuestion,
    title: 'The problem',
    body: 'AI chats only know what you type. You describe “the third deal, the Acme one” and hope it guesses right.',
  },
  {
    icon: MousePointerClick,
    title: 'How DCI fixes it',
    body: 'Select the records you mean, right on the page. The AI gets their exact data, so every answer is about just those.',
  },
];
