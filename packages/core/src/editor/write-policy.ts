/** Host-requested write admission; Native target permissions remain authoritative. */
export class EditorWritePolicy {
  private editable = false;
  publish(editable: boolean, commit: () => void): void {
    const previous = this.editable;
    this.editable = editable;
    try {
      commit();
    } catch (error) {
      this.editable = previous;
      throw error;
    }
  }
  assertWritable(): void {
    if (!this.editable) throw Error('ReadOnlyDocument');
  }
  observe(content: unknown, editable = this.editable): unknown {
    if (editable || !content || typeof content !== 'object' || Array.isArray(content))
      return content;
    const observed = content as Record<string, unknown>;
    return {
      ...observed,
      readOnly: true,
      ...(Array.isArray(observed.paragraphs)
        ? {
            paragraphs: observed.paragraphs.map((row) =>
              row && typeof row === 'object' ? { ...row, editable: false } : row,
            ),
          }
        : {}),
    };
  }
  capabilities(value: unknown, editable = this.editable): unknown {
    return editable
      ? value
      : {
          ...(value && typeof value === 'object' ? value : {}),
          readOnly: true,
          historyAvailable: false,
        };
  }
}
