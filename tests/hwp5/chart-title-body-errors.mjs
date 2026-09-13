const incomplete=new Set(['IncompleteChartTitleBodyObservation','IncompleteAxisObservation','IncompleteChartSectionObservation']);
export const incompleteTitleBody=e=>e.constructor===Error&&incomplete.has(e.message);
