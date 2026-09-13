import {seriesPrefixOracle} from './chart-series-prefix-oracle.mjs';
import {observeSeriesLabelSection} from './chart-series-label-section-evidence.mjs';
// Selected first-Series assembly for corpus evidence. Do not use as general
// product routing until remaining array/Series ownership is established.
export function seriesLabelContext(b){
 const series=seriesPrefixOracle(b);
 return {series,...observeSeriesLabelSection(b,series.r,series.strings)};
}
