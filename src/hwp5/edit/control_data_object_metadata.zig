//! Observed object metadata schemas. Values are retained, never interpreted as text positions.
const Tree = @import("../body/tree.zig").Tree;
const parameters = @import("../parameters/parser.zig");
pub const Owner = enum { shape, table };

pub fn owner(tree: Tree, index: usize) !?Owner {
    if (index >= tree.nodes.len or tree.nodes[index].record.framing.tag != 87) return error.UnsupportedControlDataOwner;
    const parent = tree.nodes[index].parent orelse return error.UnsupportedControlDataOwner;
    if (parent >= index) return error.UnsupportedControlDataOwner;
    const node = tree.nodes[parent];
    if (node.record.framing.tag == @import("../body/shape_component.zig").tag) {
        _ = try @import("control_data_names.zig").ownerForTree(tree, index);
        return .shape;
    }
    if (node.record.framing.tag != 71) return null;
    const header = try @import("../body/control_header.zig").Header.parse(node.record.framing.payload);
    const rules = @import("../body/control_rules.zig");
    if (header.id == rules.drawing_id) {
        const child = (try @import("../body/owned_record.zig").find(tree, parent, @import("../body/shape_component.zig").tag)) orelse return error.UnsupportedControlDataOwner;
        const layout = try @import("../body/shape_validation.zig").componentLayout(tree, child);
        _ = try @import("../body/shape_component.zig").Component.parse(tree.nodes[child].record.framing.payload, layout);
        return .shape;
    }
    if (header.id == rules.table_id) {
        _ = (try @import("../body/owned_record.zig").find(tree, parent, 77)) orelse return error.UnsupportedControlDataOwner;
        return .table;
    }
    return null;
}

pub fn isShapeMetadata(doc: parameters.Document) bool {
    return doc.nodes.len > 1 and doc.nodes[1].item_id == 0x3003;
}

pub fn validate(doc: parameters.Document, kind: Owner) !void {
    if (doc.extra.len != 0 or doc.nodes.len < 2) return error.UnsupportedControlData;
    const root = doc.nodes[0];
    if (root.parent != null or root.value != .set or root.value.set.id != 0x021b or root.value.set.count != 1 or root.value.set.reserved != 0) return error.UnsupportedControlData;
    const nested = doc.nodes[1];
    const id: u16 = if (kind == .shape) 0x3003 else 0x0242;
    if (nested.parent != 0 or nested.item_id != id or nested.wire_type != 0x8000 or nested.value != .set or nested.value.set.id != id or nested.value.set.reserved != 0) return error.UnsupportedControlData;
    const count = nested.value.set.count;
    if (kind == .shape) {
        if (count != 1 or doc.nodes.len != 3) return error.UnsupportedControlData;
        const value = doc.nodes[2];
        if (value.parent != 1 or value.item_id != 0x7001 or value.wire_type != 9 or value.value != .integer) return error.UnsupportedControlData;
    } else {
        if ((count != 11 and count != 13) or doc.nodes.len != @as(usize, count) + 2) return error.UnsupportedControlData;
        var seen: u16 = 0;
        for (doc.nodes[2..]) |value| {
            const item = value.item_id orelse return error.UnsupportedControlData;
            if (item < 0x4000 or item - 0x4000 >= count) return error.UnsupportedControlData;
            const bit = @as(u16, 1) << @as(u4, @intCast(item - 0x4000));
            if (seen & bit != 0) return error.UnsupportedControlData;
            seen |= bit;
            const wire: u16 = if (count == 13 and item == 0x4008) 2 else 4;
            if (value.parent != 1 or value.wire_type != wire or value.value != .integer) return error.UnsupportedControlData;
        }
    }
}

test "object control metadata accepts exact observed shape and table schemas and rejects mutations" {
    const std = @import("std");
    const a = std.testing.allocator;
    const Case = struct { hex: []const u8, kind: Owner };
    for ([_]Case{
        .{ .hex = "1b0201000000033000800330010000000170090001000000", .kind = .shape },
        .{ .hex = "1b02010000004202008042020d00000000400400f20e0000014004001804000002400400ba6e0000034004001b21000004400400c402000005400400000000000640040002000000074004000900000008400200000000000940040088e800000a400400dc4801000b400400380200000c40040001000000", .kind = .table },
    }) |case| {
        var buffer: [120]u8 = undefined;
        const bytes = try std.fmt.hexToBytes(&buffer, case.hex);
        var doc = try parameters.Document.parse(a, bytes, .{ .header_layout = .observed6, .null_layout = .observed_empty });
        defer doc.deinit(a);
        try validate(doc, case.kind);
        if (case.kind == .table) {
            std.mem.reverse(parameters.Node, doc.nodes[2..]);
            try validate(doc, .table);
            std.mem.reverse(parameters.Node, doc.nodes[2..]);
        }
        for (0..bytes.len) |length| {
            var truncated = parameters.Document.parse(a, bytes[0..length], .{ .header_layout = .observed6, .null_layout = .observed_empty }) catch continue;
            defer truncated.deinit(a);
            try std.testing.expectError(error.UnsupportedControlData, validate(truncated, case.kind));
        }
        try std.testing.expectError(error.UnsupportedControlData, validate(doc, if (case.kind == .shape) .table else .shape));
        const item = doc.nodes[2].item_id;
        doc.nodes[2].item_id = 0xffff;
        try std.testing.expectError(error.UnsupportedControlData, validate(doc, case.kind));
        doc.nodes[2].item_id = item;
        const parent = doc.nodes[2].parent;
        doc.nodes[2].parent = 0;
        try std.testing.expectError(error.UnsupportedControlData, validate(doc, case.kind));
        doc.nodes[2].parent = parent;
        const wire = doc.nodes[2].wire_type;
        doc.nodes[2].wire_type = 1;
        try std.testing.expectError(error.UnsupportedControlData, validate(doc, case.kind));
        doc.nodes[2].wire_type = wire;
        doc.extra = &.{0};
        try std.testing.expectError(error.UnsupportedControlData, validate(doc, case.kind));
        doc.extra = &.{};
        if (case.kind == .table) {
            var short: [104]u8 = undefined;
            @memcpy(&short, bytes[0..104]);
            std.mem.writeInt(u16, short[12..14], 11, .little);
            std.mem.writeInt(u16, short[82..84], 4, .little);
            var eleven = try parameters.Document.parse(a, &short, .{ .header_layout = .observed6, .null_layout = .observed_empty });
            defer eleven.deinit(a);
            try validate(eleven, .table);
            std.mem.reverse(parameters.Node, eleven.nodes[2..]);
            try validate(eleven, .table);
            std.mem.reverse(parameters.Node, eleven.nodes[2..]);
            eleven.nodes[1].value.set.count = 12;
            try std.testing.expectError(error.UnsupportedControlData, validate(eleven, .table));
            eleven.nodes[1].value.set.count = 11;
            eleven.nodes[3].item_id = eleven.nodes[2].item_id;
            try std.testing.expectError(error.UnsupportedControlData, validate(eleven, .table));
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, payload: []const u8, kind: Owner) !void {
                var value = try parameters.Document.parse(allocator, payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
                defer value.deinit(allocator);
                try validate(value, kind);
            }
        }.run, .{ bytes, case.kind });
    }
}

test "actual object metadata requires its direct header component and rejects self ownership" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/143E433F503322BD33.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    for ([_]usize{ 26, 28 }) |index| {
        try std.testing.expectEqual(@as(?Owner, .shape), try owner(tree, index));
        const parent = tree.nodes[index].parent;
        tree.nodes[index].parent = index;
        try std.testing.expectError(error.UnsupportedControlDataOwner, owner(tree, index));
        tree.nodes[index].parent = parent;
    }
    const component_tag = tree.nodes[27].record.framing.tag;
    tree.nodes[27].record.framing.tag = 77;
    try std.testing.expectError(error.UnsupportedControlDataOwner, owner(tree, 26));
    tree.nodes[27].record.framing.tag = component_tag;
    const header_parent = tree.nodes[26].parent;
    tree.nodes[26].parent = 0;
    try std.testing.expectEqual(@as(?Owner, null), try owner(tree, 26));
    try std.testing.expectError(error.UnsupportedControlDataOwner, @import("control_data_policy.zig").validateRetainedNode(a, tree, 26));
    tree.nodes[26].parent = header_parent;
}
