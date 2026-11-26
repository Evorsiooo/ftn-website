// The listener's volume slider. Ears hear loudness on a log scale, so a slider that sets the gain
// straight (as it used to) is all in its first tenth: Adrien needed ~10% for normal loudness. The
// slider is a cubic taper instead (the usual audio-fader curve): halfway is a gain of 0.125, about
// -18 dB, and the top is still full volume. Only the slider's position goes through this; the
// stored and played value stays the gain, so a volume someone already set sounds the same.

const POWER = 3;

/** Slider position (0 to 1) for a gain (0 to 1). */
export const sliderFromGain = (gain: number) => Math.pow(Math.min(1, Math.max(0, gain)), 1 / POWER);

/** Gain (0 to 1) for a slider position (0 to 1). */
export const gainFromSlider = (pos: number) => Math.pow(Math.min(1, Math.max(0, pos)), POWER);

/** A first listen: the slider halfway. */
export const DEFAULT_GAIN = gainFromSlider(0.5);

/** The slider as a whole percent (what the range input shows). */
export const sliderPercent = (gain: number) => Math.round(sliderFromGain(gain) * 100);

/** The gain for a slider percent from a range input. */
export const gainFromPercent = (percent: number) => gainFromSlider(percent / 100);
