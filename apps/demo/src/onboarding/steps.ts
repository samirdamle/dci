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
  /** What just happened, once the step is done. */
  success: string;
  /** Done once `selected` of the `total` sample deals are selected. */
  isDone: (selected: number, total: number) => boolean;
  /** Clear the selection when the step starts, so the gesture is seen on its own. */
  resetOnEnter?: boolean;
}

/** Three gestures, each tried on the sample deals inside the tour. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'select',
    title: 'Select something',
    gesture: ({ mod }) => [mod, 'Click'],
    hint: 'Hold the key and click any deal below.',
    success: 'Selected. The AI chat opened with that deal as its context.',
    isDone: (selected) => selected >= 1,
  },
  {
    id: 'add',
    title: 'Add more to the selection',
    gesture: ({ mod, toggle }) => [mod, toggle, 'Click'],
    hint: 'Hold both keys and click another deal to add it.',
    success: 'Each deal gets a letter, so you can ask “Compare A and B”.',
    isDone: (selected) => selected >= 2,
  },
  {
    id: 'same-type',
    title: 'Select everything like it',
    gesture: ({ mod }) => [mod, 'Double-click'],
    hint: 'Hold the key and double-click any deal.',
    success: 'Every deal is selected in one go.',
    isDone: (selected, total) => total > 0 && selected >= total,
    resetOnEnter: true,
  },
];
