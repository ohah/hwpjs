//! SOURCE CONTRACT, authored before execution. Base HEAD:
//! 65e370697994638b091a97687abf1e3c0e1d419d. Native executions: 0.
//! Sources: ECMA-376 Part 1 (2016), 21.2; official Part 4 transitional
//! OfficeOpenXML-XMLSchema-Transitional.zip/dml-chart.xsd (CT_*Chart/Ser).
//! https://ecma-international.org/publications-and-standards/standards/ecma-376/
//! https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.charts
//! No third-party implementation/algorithm is an input to this extension.
//!
//! Proposed JS/UI contract: old {target,size,data} stays byte-identical.
//! Optional chart is a non-null object with required kind (the exact OOXML
//! chart_plot_kind enum spelling). Irrelevant, null, unknown or missing required
//! options fail closed. Bar kinds require bar_direction + grouping; line/area
//! kinds require grouping; scatter requires scatter_style; radar radar_style;
//! ofPie of_pie_type; stock stock_layout. Surface kinds require wireframe.
//! Other kinds take kind alone. No UI/SDK admission or rendering claim.
//!
//! data.categories + series[{name,values}] remain required; scatter/bubble
//! require categories=[] and per-series x_values; values are Y. Bubble also
//! requires bubble_sizes. All numeric inputs are finite numeric STRINGS.
//! No inferred X, size or OHLC data. Stock series require stock_role in exact
//! HLC/OHLC order. Surface uses the explicit rectangular series-values matrix
//! (rows=series, columns=categories), at least 2x2. All other auxiliary fields
//! are forbidden. Product limits and stock/pie semantics are admission policy,
//! not schema requirements. Existing OLE/OPF/host/history pipeline is reused.
//! Post-grant gates: actual ZIP creation/reopen of every kind, point roles and
//! lexical values, independent official XSD oracle + wrong-output negatives,
//! legacy byte equality, strict wire negatives and allocator failure sweeps.
pub const wire_version: u32 = 1;
const Kind = @import("chart_plot_kind.zig").Kind;
pub const Grouping = enum { standard, clustered, stacked, percentStacked };
pub const Direction = enum { col, bar };
pub const ScatterStyle = enum { none, line, lineMarker, marker, smooth, smoothMarker };
pub const RadarStyle = enum { standard, marker, filled };
pub const OfPieType = enum { pie, bar };
pub const StockLayout = enum { highLowClose, openHighLowClose };
pub const StockRole = enum { open, high, low, close };
pub const Profile = struct {
    kind: Kind,
    bar_direction: ?Direction = null,
    grouping: ?Grouping = null,
    scatter_style: ?ScatterStyle = null,
    radar_style: ?RadarStyle = null,
    of_pie_type: ?OfPieType = null,
    stock_layout: ?StockLayout = null,
    wireframe: ?bool = null,
};
pub fn isBar(k: Kind) bool {
    return k == .barChart or k == .bar3DChart;
}
pub fn isGrouped(k: Kind) bool {
    return isBar(k) or k == .lineChart or k == .line3DChart or k == .areaChart or k == .area3DChart;
}
pub fn isXY(k: Kind) bool {
    return k == .scatterChart or k == .bubbleChart;
}
pub fn isSurface(k: Kind) bool {
    return k == .surfaceChart or k == .surface3DChart;
}
pub fn isPie(k: Kind) bool {
    return k == .pieChart or k == .pie3DChart or k == .doughnutChart or k == .ofPieChart;
}
pub fn is3D(k: Kind) bool {
    return k == .bar3DChart or k == .line3DChart or k == .area3DChart or k == .pie3DChart or k == .surface3DChart;
}
pub fn hasDepth(k: Kind) bool {
    return (is3D(k) and !isPie(k)) or isSurface(k);
}
pub fn validate(p: Profile) !void {
    if ((p.bar_direction != null) != isBar(p.kind) or
        (p.grouping != null) != isGrouped(p.kind) or
        (p.scatter_style != null) != (p.kind == .scatterChart) or
        (p.radar_style != null) != (p.kind == .radarChart) or
        (p.of_pie_type != null) != (p.kind == .ofPieChart) or
        (p.stock_layout != null) != (p.kind == .stockChart) or
        (p.wireframe != null) != isSurface(p.kind)) return error.InvalidChartCreateProfile;
    if (p.grouping == .clustered and !isBar(p.kind)) return error.InvalidChartCreateProfile;
}
