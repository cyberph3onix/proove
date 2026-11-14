import { DAY, HOUR, USDC, formatBps, formatDuration, formatUsdc } from "@proove/types/format";

/**
 * Allowed ranges for every governed setting. The real programs enforce these
 * in code, so even a captured DAO can't set a 0-second timeout or a 100% fee.
 */
export interface SettingRange {
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const dur = (v: number) => formatDuration(v);
const usd = (v: number) => formatUsdc(v);

export const SETTING_RANGES: Record<string, SettingRange> = {
  "ProtocolConfig.partialTimeout": { label: "Partial release delay", min: DAY, max: 14 * DAY, step: 12 * HOUR, format: dur },
  "ProtocolConfig.fullTimeout": { label: "Full release delay", min: DAY, max: 14 * DAY, step: 12 * HOUR, format: dur },
  "ProtocolConfig.partialBps": { label: "Partial release share", min: 0, max: 5000, step: 500, format: formatBps },
  "ProtocolConfig.feeBps": { label: "Protocol fee", min: 0, max: 200, step: 10, format: formatBps },
  "ProtocolConfig.minMilestone": { label: "Minimum milestone", min: 1 * USDC, max: 100 * USDC, step: 1 * USDC, format: usd },
  "ProtocolConfig.noDeliveryGrace": { label: "No-delivery grace period", min: DAY, max: 14 * DAY, step: DAY, format: dur },
  "DisputeConfig.evidenceWindow": { label: "Evidence window", min: 12 * HOUR, max: 7 * DAY, step: 12 * HOUR, format: dur },
  "DisputeConfig.aiWindow": { label: "AI window", min: 12 * HOUR, max: 7 * DAY, step: 12 * HOUR, format: dur },
  "DisputeConfig.arbitrationWindow": { label: "Arbitration window", min: 12 * HOUR, max: 7 * DAY, step: 12 * HOUR, format: dur },
  "DisputeConfig.appealWindow": { label: "Appeal window", min: 12 * HOUR, max: 7 * DAY, step: 12 * HOUR, format: dur },
  "DisputeConfig.bondBps": { label: "Dispute bond", min: 100, max: 2000, step: 100, format: formatBps },
  "DisputeConfig.feeBps": { label: "Arbitration fee", min: 100, max: 1000, step: 50, format: formatBps },
  "DisputeConfig.noShowSlashBps": { label: "No-show slash", min: 0, max: 5000, step: 500, format: formatBps },
  "DisputeConfig.arbitratorStake": { label: "Arbitrator stake", min: 50 * USDC, max: 10_000 * USDC, step: 50 * USDC, format: usd },
  "DisputeConfig.highValueThreshold": { label: "Two-arbitrator threshold", min: 50 * USDC, max: 10_000 * USDC, step: 50 * USDC, format: usd },
  "DisputeConfig.hardDeadline": { label: "Hard deadline", min: 14 * DAY, max: 30 * DAY, step: DAY, format: dur },
};
