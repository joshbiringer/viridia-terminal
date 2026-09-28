import { fmtPrice } from "@/lib/market-data/bars";
import type { Setup, SetupKind } from "./candidates";

/** What each setup means, in one sentence a newcomer can follow. */
export const SETUP_STORY: Record<SetupKind, string> = {
  wave3: "Wave 3 is under way. It is usually the longest and strongest wave, and the count is wrong only if price crosses the stop.",
  wave5: "Wave 5 is under way: the last leg of the trend, with the stop where the count breaks.",
  waveC: "Wave C is under way, the final leg of the correction.",
  pullback2: "Wave 2 is correcting wave 1. The setup waits for it to end where second waves most often do, then trades wave 3.",
  pullback4: "Wave 4 is correcting wave 3. The setup waits for it to end, then trades wave 5.",
  pullbackB: "Wave B is bouncing inside a zigzag. The setup waits for it to end, then trades wave C.",
  after_correction: "A correction looks complete, so the larger trend would normally resume.",
  after_impulse: "Five waves look complete, so a correction in the other direction would normally follow.",
};

export const entryText = (s: Pick<Setup, "entry">) =>
  s.entry.low === s.entry.high ? fmtPrice(s.entry.low) : `${fmtPrice(s.entry.low)}–${fmtPrice(s.entry.high)}`;

