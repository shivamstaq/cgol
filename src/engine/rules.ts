import type { RuleSpec } from './protocol';

export interface RuleEntry {
  name: string;
  notation: string;
}

export const RULES: RuleEntry[] = [
  { name: 'Conway', notation: 'B3/S23' },
  { name: 'HighLife', notation: 'B36/S23' },
  { name: 'Day & Night', notation: 'B3678/S34678' },
  { name: 'Seeds', notation: 'B2/S' },
  { name: 'Diamoeba', notation: 'B35678/S5678' },
  { name: '34 Life', notation: 'B34/S34' },
  { name: 'Replicator', notation: 'B1357/S1357' },
  { name: 'Life without Death', notation: 'B3/S012345678' },
];

const NOTATION = /^\s*b([0-8]*)\s*\/\s*s([0-8]*)\s*$/i;

function toMask(digits: string): number {
  return digits.split('').reduce((total, digit) => total | (1 << Number(digit)), 0);
}

function toDigits(mask: number): string {
  return Array.from({ length: 9 }, (_, index) => index)
    .filter((index) => (mask >> index) & 1)
    .join('');
}

export function parseRule(notation: string): RuleSpec | null {
  const match = NOTATION.exec(notation);
  if (!match) return null;
  return { birth: toMask(match[1] ?? ''), survive: toMask(match[2] ?? '') };
}

export function toNotation(rule: RuleSpec): string {
  return `B${toDigits(rule.birth)}/S${toDigits(rule.survive)}`;
}
