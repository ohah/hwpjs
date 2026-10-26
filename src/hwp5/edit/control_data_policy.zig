//! One parsed CTRL_DATA, with exact owner/schema/resource validation.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
const names = @import("control_data_names.zig");
pub const Kind = enum { bookmark_name, shape_name, click_field_name, bookmark_field_name, presentation, shape_metadata, table_metadata, table_name, shape_empty_set, shape_mirrored_strings };

pub fn validateNode(a: std.mem.Allocator, tree: Tree, index: usize, bin_data_count: usize) !Kind {
    return inspectNode(a, tree, index, bin_data_count);
}

/// Text edits retain all resource IDs. Resource resolution belongs to the
/// document boundary; this entry checks ownership and schema only.
pub fn validateRetainedNode(a: std.mem.Allocator, tree: Tree, index: usize) !Kind {
    return inspectNode(a, tree, index, null);
}

fn inspectNode(a: std.mem.Allocator, tree: Tree, index: usize, bin_data_count: ?usize) !Kind {
    if (index >= tree.nodes.len or tree.nodes[index].record.framing.tag != 87) return error.UnsupportedControlDataOwner;
    const parent_index = tree.nodes[index].parent orelse return error.UnsupportedControlDataOwner;
    if (parent_index >= index) return error.UnsupportedControlDataOwner;
    const parent = tree.nodes[parent_index].record;
    var section = false;
    if (parent.framing.tag == @backingInt(@import("../body/reader.zig").Tag.control_header)) {
        const header = try @import("../body/control_header.zig").Header.parse(parent.framing.payload);
        section = header.id == @import("../body/control_rules.zig").id("secd");
    }
    // Determine the owner before allocating ParameterSet nodes.
    const metadata = @import("control_data_object_metadata.zig");
    const object_owner = if (section) null else try metadata.owner(tree, index);
    const owner: ?names.Owner = if (section or object_owner != null) null else try names.ownerForTree(tree, index);
    var doc = try @import("../parameters/parser.zig").Document.parse(a, tree.nodes[index].record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
    defer doc.deinit(a);
    if (section) {
        try @import("control_data_presentation.zig").validate(doc);
        if (bin_data_count) |count| _ = try @import("../parameters/references.zig").validateInContext(doc, count, .section_control);
        return .presentation;
    }
    if (object_owner) |kind| {
        if (kind == .table and doc.nodes.len == 2 and doc.nodes[1].value == .string) {
            _ = try names.name(doc, .table);
            return .table_name;
        }
        if (kind == .table or metadata.isShapeMetadata(doc)) {
            try metadata.validate(doc, kind);
            return if (kind == .table) .table_metadata else .shape_metadata;
        }
        if (@import("control_data_shape_envelope.zig").classify(doc)) |envelope| return switch (envelope) {
            .empty_set => .shape_empty_set,
            .mirrored_strings => .shape_mirrored_strings,
        };
        _ = try names.name(doc, .shape);
        return .shape_name;
    }
    _ = try names.name(doc, owner.?);
    return switch (owner.?) {
        .bookmark => .bookmark_name,
        .shape => .shape_name,
        .click_field => .click_field_name,
        .bookmark_field => .bookmark_field_name,
        .table => .table_name,
    };
}

test "actual aift table names retain exact schema and direct table ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    var named: usize = 0;
    var metadata: usize = 0;
    for (0..source.section_count) |section| {
        const raw = try source.decodeSection(a, section);
        defer a.free(raw);
        var tree = try Tree.parseTextPreview(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        for (tree.nodes, 0..) |node, index| {
            if (node.record.framing.tag != 87) continue;
            const kind = try validateRetainedNode(a, tree, index);
            if (kind == .table_metadata) metadata += 1;
            if (kind != .table_name) continue;
            named += 1;
            const parent = tree.nodes[index].parent;
            tree.nodes[index].parent = null;
            try std.testing.expectError(error.UnsupportedControlDataOwner, validateRetainedNode(a, tree, index));
            tree.nodes[index].parent = parent;
            var doc = try @import("../parameters/parser.zig").Document.parse(a, node.record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
            defer doc.deinit(a);
            _ = try names.name(doc, .table);
            doc.nodes[1].item_id = 0x4001;
            try std.testing.expectError(error.UnsupportedControlData, names.name(doc, .table));
            doc.nodes[1].item_id = 0x4000;
            doc.extra = &.{0};
            try std.testing.expectError(error.UnsupportedControlData, names.name(doc, .table));
        }
    }
    try std.testing.expectEqual(@as(usize, 7), named);
    try std.testing.expectEqual(@as(usize, 3), metadata);
}
