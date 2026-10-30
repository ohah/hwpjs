export interface TableInsertResources {
  readonly paragraph: number;
  readonly character: number;
  readonly style: number;
  readonly border_fill: number;
}
export interface InsertTableOptions {
  readonly rows: number;
  readonly columns: number;
  /** 기존 Native HWPUNIT 정수이며 CSS px가 아닙니다. */
  readonly width: number;
  readonly rowHeight: number;
  readonly resources: TableInsertResources;
}
const resourceKeys = ['paragraph', 'character', 'style', 'border_fill'] as const;
function dataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  const own = Reflect.ownKeys(value);
  return (
    own.length === keys.length &&
    own.every(
      (key) =>
        typeof key === 'string' &&
        keys.includes(key) &&
        'value' in Object.getOwnPropertyDescriptor(value, key)!,
    )
  );
}
const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function validateTableInsertOptions(
  options: unknown,
  observed: unknown,
): InsertTableOptions {
  if (!dataObject(options, ['rows', 'columns', 'width', 'rowHeight', 'resources']))
    throw Error('InvalidTableCreationOptions');
  const { rows, columns, width, rowHeight } = options;
  if (
    ![rows, columns, width, rowHeight].every(uint) ||
    (rows as number) === 0 ||
    (columns as number) === 0 ||
    (width as number) < (columns as number) ||
    (rowHeight as number) === 0 ||
    !Number.isSafeInteger((rows as number) * (columns as number)) ||
    (rows as number) * (columns as number) > 100000 ||
    (rows as number) * (rowHeight as number) > 0xffffffff
  )
    throw Error('InvalidTableCreationDimensions');
  if (!dataObject(options.resources, resourceKeys) || !dataObject(observed, resourceKeys))
    throw Error('InvalidTableCreationResources');
  for (const key of resourceKeys) {
    const value = options.resources[key],
      ids = observed[key];
    if (
      !uint(value) ||
      !Array.isArray(ids) ||
      !ids.every((id, index) => uint(id) && (index === 0 || ids[index - 1] < id)) ||
      !ids.includes(value)
    )
      throw Error('InvalidTableCreationResources');
  }
  return options as unknown as InsertTableOptions;
}
