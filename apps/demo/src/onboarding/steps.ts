/** The keys a step's gesture uses, as labels (they follow the playground modifier). */
export interface TourKeys {
  mod: string;
  toggle: string;
}

export type TourStepId = 'select' | 'add' | 'same-type';

export interface TourStep {
  id: TourStepId;
  title: string;
  /** The gesture as key chips, e.g. `['Alt (⌥)', 'Click']`. */
  gesture: (keys: TourKeys) => string[];
  /** What to do, shown next to the gesture. */
  hint: string;
  /** The same step on a touch screen, done in Select mode. */
  touch: { gesture: string[]; hint: string };
  /** What just happened, once the step is done. */
  success: string;
  /** Done once `selected` of the `total` sample deals are selected. */
  isDone: (selected: number, total: number) => boolean;
  /** Clear the selection when the step starts, so the gesture is seen on its own. */
  resetOnEnter?: boolean;
}

/** Three gestures, each tried on the sample deals inside the tour (taps on touch screens). */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'select',
    title: 'Select something',
    gesture: ({ mod }) => [mod, 'Click'],
    hint: 'Hold the key and click any deal below.',
    touch: {
      gesture: ['Select', 'Tap'],
      hint: 'Tap Select under the deals, then tap one. Or long-press a deal.',
    },
    success: 'Selected. That deal is now the AI chat’s context.',
    isDone: (selected) => selected >= 1,
  },
  {
    id: 'add',
    title: 'Add more to the selection',
    gesture: ({ mod, toggle }) => [mod, toggle, 'Click'],
    hint: 'Hold both keys and click another deal to add it.',
    touch: {
      gesture: ['Tap another'],
      hint: 'In Select mode each tap adds a deal. Tap one again to remove it.',
    },
    success: 'Each deal gets a letter, so you can ask “Compare A and B”.',
    isDone: (selected) => selected >= 2,
  },
  {
    id: 'same-type',
    title: 'Select everything like it',
    gesture: ({ mod }) => [mod, 'Double-click'],
    hint: 'Hold the key and double-click any deal.',
    touch: { gesture: ['Double-tap'], hint: 'In Select mode, double-tap any deal.' },
    success: 'Every deal is selected in one go.',
    isDone: (selected, total) => total > 0 && selected >= total,
    resetOnEnter: true,
  },
];

/** A step's gesture chips and hint for this device. */
export function stepPrompt(step: TourStep, keys: TourKeys, touch: boolean) {
  return touch ? step.touch : { gesture: step.gesture(keys), hint: step.hint };
}
