//! Observed section presentation settings, retained without value rewriting.
const parameters = @import("../parameters/parser.zig");
const fields = @import("control_data_presentation_fields.zig");

pub fn validate(doc: parameters.Document) !void {
    if (doc.extra.len != 0 or doc.nodes.len == 0) return error.UnsupportedControlData;
    const root = doc.nodes[0];
    if (root.parent != null or root.item_id != null or root.wire_type != null) return error.UnsupportedControlData;
    if (root.value != .set or root.value.set.id != 0x021b or root.value.set.count != 1 or root.value.set.reserved != 0) return error.UnsupportedControlData;
    var presentation: ?usize = null;
    var fill: ?usize = null;
    var layout: fields.Layout = undefined;
    for (doc.nodes, 0..) |node, index| {
        if (index == 0) continue;
        const parent = node.parent orelse return error.UnsupportedControlData;
        if (parent >= index) return error.UnsupportedControlData;
        if (parent == 0) {
            if (presentation != null or node.item_id != 0x0219 or node.wire_type != 0x8000 or node.value != .set or node.value.set.id != 0x0219 or node.value.set.reserved != 0) return error.UnsupportedControlData;
            layout = try fields.select(node.value.set.count);
            presentation = index;
            continue;
        }
        if (presentation != null and parent == presentation.?) {
            if (node.item_id == 0x0266) {
                if (fill != null or node.wire_type != 0x8000 or node.value != .set or node.value.set.id != 0x0266 or node.value.set.count != layout.fill_count or node.value.set.reserved != 0) return error.UnsupportedControlData;
                fill = index;
            } else {
                const kind = try fields.presentationKind(layout.profile, node.item_id orelse return error.UnsupportedControlData);
                if (node.wire_type != kind or node.value != .integer) return error.UnsupportedControlData;
            }
            continue;
        }
        if (fill != null and parent == fill.?) {
            const id = node.item_id orelse return error.UnsupportedControlData;
            const kind = try fields.fillKind(layout.profile, id);
            if (node.wire_type != kind) return error.UnsupportedControlData;
            if (kind == 0x8001) {
                if (node.value != .array or node.value.array.count != 10 or node.value.array.shared_id != 0) return error.UnsupportedControlData;
            } else if (kind == 0x8002) {
                if (node.value != .binary_id) return error.UnsupportedControlData;
            } else if (node.value != .integer) return error.UnsupportedControlData;
            if (layout.profile == .expanded_gradient) {
                if (id == 0x4001 and node.value.integer != 4) return error.UnsupportedControlData;
                if (kind == 6 and node.value.integer > 255) return error.UnsupportedControlData;
            }
            continue;
        }
        const array = doc.nodes[parent];
        if (array.value != .array or array.parent != fill or node.item_id != 0 or node.wire_type != 5 or node.value != .integer) return error.UnsupportedControlData;
    }
    if (presentation == null or fill == null) return error.UnsupportedControlData;
    // Sets cannot repeat an item ID; array shared IDs intentionally repeat.
    for (doc.nodes, 0..) |node, index| {
        if (node.value != .set and node.value != .array) continue;
        var count: usize = 0;
        for (doc.nodes[index + 1 ..], index + 1..) |child, child_index| {
            if (child.parent != index) continue;
            count += 1;
            if (node.value == .set) for (doc.nodes[child_index + 1 ..]) |other| {
                if (other.parent == index and other.item_id == child.item_id) return error.UnsupportedControlData;
            };
        }
        const expected_count = if (node.value == .set) node.value.set.count else node.value.array.count;
        if (count != expected_count) return error.UnsupportedControlData;
    }
}
