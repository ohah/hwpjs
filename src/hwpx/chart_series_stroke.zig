//! Direct DrawingML series line visibility; no inferred colors or save state.
const Tree = @import("chart_tree.zig").Tree;
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
pub const Stroke = struct { node: usize, no_fill_node: ?usize = null };

pub fn read(tree: *const Tree, properties: usize) !?Stroke {
    var result: ?Stroke = null;
    var child = tree.elements[properties].first_child;
    while (child) |node| {
        const element = tree.elements[node];
        if (element.is(drawing, "ln")) {
            if (result != null) return error.DuplicateChartSeriesSetting;
            var stroke: Stroke = .{ .node = node };
            var fill_seen = false;
            var leaf = element.first_child;
            while (leaf) |index| {
                const candidate = tree.elements[index];
                if (candidate.is(drawing, "noFill") or candidate.is(drawing, "solidFill") or
                    candidate.is(drawing, "gradFill") or candidate.is(drawing, "pattFill"))
                {
                    if (fill_seen) return error.InvalidChartSeriesSetting;
                    fill_seen = true;
                    if (candidate.is(drawing, "noFill")) {
                        if (candidate.first_child != null) return error.InvalidChartSeriesSetting;
                        stroke.no_fill_node = index;
                    }
                }
                leaf = candidate.next_sibling;
            }
            result = stroke;
        }
        child = element.next_sibling;
    }
    return result;
}
