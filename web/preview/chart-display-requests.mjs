const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function createChartDisplayRequests(post, timeoutMs = 30000) {
  if (typeof post !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error('InvalidChartDisplayRequests');
  let sequence = 0,
    revision;
  const pending = new Map();
  const reset = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('ChartDocumentChanged'));
    }
    pending.clear();
  };
  return {
    revision(value) {
      if (value !== revision) {
        reset();
        revision = value;
      }
    },
    read(section, wrapper) {
      if (!uint(section) || !uint(wrapper))
        return Promise.reject(new Error('InvalidChartDisplayKey'));
      const requestId = ++sequence,
        origin = `chart-display:${requestId}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(origin);
          reject(new Error('ChartDisplayTimeout'));
        }, timeoutMs);
        pending.set(origin, { resolve, reject, timer, section, wrapper, requestId, revision });
        try {
          post({ kind: 'chart-display', origin, requestId, section, wrapper });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(origin);
          reject(error);
        }
      });
    },
    message(message) {
      if (typeof message.origin !== 'string' || !message.origin.startsWith('chart-display:'))
        return false;
      const request = pending.get(message.origin);
      if (!request) return true;
      pending.delete(message.origin);
      clearTimeout(request.timer);
      if (
        message.kind !== 'chart-display' ||
        message.requestId !== request.requestId ||
        message.section !== request.section ||
        message.wrapper !== request.wrapper ||
        message.historyRevision !== request.revision
      )
        request.reject(new Error('StaleChartDisplayReply'));
      else if (message.error) request.reject(new Error(message.error));
      else if (
        message.chart?.kind !== 'chart_display' ||
        message.chart.pair?.section_ordinal !== request.section ||
        message.chart.pair?.wrapper_node !== request.wrapper
      )
        request.reject(new Error('InvalidChartDisplayReply'));
      else request.resolve(message.chart);
      return true;
    },
    reset,
  };
}
