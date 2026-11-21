import type {
  Hwp5ChartLiterals,
  Hwp5ChartLiteralEdit,
} from '../packages/core/src/commands/hwp5-chart-data.ts';
export function checkedHwp5PieLiteralEdits<T extends readonly Hwp5ChartLiteralEdit[]>(
  literals: Hwp5ChartLiterals,
  edits: T,
): T;
