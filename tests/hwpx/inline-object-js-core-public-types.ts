import {
  INSERT_EQUATION_COMMAND,
  CREATE_CHART_COMMAND,
  type ChartCreateOptions,
  type EquationInsertOptions,
  type InsertEquationPayload,
  type CreateChartPayload,
  type HeadlessEditor,
} from '../../packages/core/src/index.ts';
function check(editor: HeadlessEditor, equation: InsertEquationPayload, chart: CreateChartPayload) {
  editor.dispatchCommand(INSERT_EQUATION_COMMAND, equation);
  editor.dispatchCommand(CREATE_CHART_COMMAND, chart);
  // @ts-expect-error Equation payload cannot satisfy chart command.
  editor.dispatchCommand(CREATE_CHART_COMMAND, equation);
}
// @ts-expect-error Geometry is explicit and required.
const missing: EquationInsertOptions = { script: 'x' };
const decimal: ChartCreateOptions = {
  width: 1,
  height: 1,
  categories: ['A'],
  // @ts-expect-error Public chart values are numeric.
  series: [{ name: 'S', values: ['3'] }],
};
void check;
void missing;
void decimal;
