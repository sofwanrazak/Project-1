/**
 * Springs never overshoot here: a critically damped settle reads as precise. Bounce is reserved for
 * gestures that carry momentum, and nothing in this app does. Durations are short because these run
 * dozens of times a day (presses, toggles, tab changes).
 */
export const SETTLE = { duration: 240, dampingRatio: 1 } as const;
export const PRESS = { duration: 110, dampingRatio: 1 } as const;
