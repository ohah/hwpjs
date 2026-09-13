const incomplete=new Set(['IncompleteListPrefixObservation','IncompleteChartTailObservation','IncompleteWindowObservation']);
export const incompleteChartTail=e=>e.constructor===Error&&incomplete.has(e.message);
