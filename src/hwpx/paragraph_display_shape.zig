//! Borrowed paragraph display fields; no editing state or invented defaults.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const xml = @import("../xml/root.zig");
const fields = @import("table_xml_fields.zig");
const head = @import("document_xml.zig").head_uri;
const core = "http://www.hancom.co.kr/hwpml/2011/core";
const Value = xml.attribute_value.Value;
const child = @import("paragraph_display_children.zig").child;

pub const Measure = struct { value: ?i64 = null, unit: ?Value = null };
pub const Shape = struct {
    id: u32,
    tab_pr_id: ?u32 = null,
    break_settings: ?@import("paragraph_break_settings.zig").Values = null,
    horizontal: ?Value = null,
    spacing_type: ?Value = null,
    spacing: ?Measure = null,
    margins: [5]?Measure = @as([5]?Measure, @splat(null)),
};
pub const margin_names = [_][]const u8{ "intent", "left", "right", "prev", "next" };

fn measure(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize) !Measure {
    const raw = try tree.attributeValue(a, index, "", "value");
    return .{
        .value = if (raw) |present| try fields.margin(a, present, 4096) else null,
        .unit = try tree.attributeValue(a, index, "", "unit"),
    };
}

/// Raw attribute values borrow the tree input and must not outlive it.
pub fn read(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize) !Shape {
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    if (!tree.elements[index].is(head, "paraPr")) return error.InvalidParagraphDisplayElement;
    const raw_id = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingParagraphShapeReference;
    var result: Shape = .{ .id = try fields.unsigned(a, raw_id, 4096) };
    if (try tree.attributeValue(a, index, "", "tabPrIDRef")) |raw| result.tab_pr_id = try fields.unsigned(a, raw, 4096);
    if (try child(a, tree, index, head, "align")) |alignment_node| result.horizontal = try tree.attributeValue(a, alignment_node, "", "horizontal");
    if (try child(a, tree, index, head, "lineSpacing")) |spacing| {
        result.spacing_type = try tree.attributeValue(a, spacing, "", "type");
        result.spacing = try measure(a, tree, spacing);
    }
    if (try child(a, tree, index, head, "margin")) |margin| {
        for (margin_names, 0..) |name, field| {
            if (try child(a, tree, margin, core, name)) |node| result.margins[field] = try measure(a, tree, node);
        }
    }
    result.break_settings = try @import("paragraph_break_settings.zig").read(a, tree, index);
    return result;
}

test "HWPX paragraph display tab reference preserves absent zero sparse and cloned identity" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:future'>" ++
        "<h:paraPr id='0'/><h:paraPr id='1' tabPrIDRef='&#48;'/><h:paraPr id='2' tabPrIDRef='300'/>" ++
        "<h:paraPr id='3' f:tabPrIDRef='9'/></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const tree_mod.Tree) !void {
            const expected = [_]?u32{ null, 0, 300, null };
            for (expected, 1..) |id, node| {
                const raw = try read(allocator, input, node);
                try std.testing.expectEqual(id, raw.tab_pr_id);
                var owned = try @import("paragraph_display_owned.zig").clone(allocator, raw);
                defer owned.deinit(allocator);
                try std.testing.expectEqual(id, owned.tab_pr_id);
            }
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
}

test "HWPX paragraph display reads fixture signed margins and borrowed alignment" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var found = false;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(head, "paraPr")) continue;
        const shape = try read(a, &tree, index);
        if (shape.id != 16) continue;
        found = true;
        const alignment = try shape.horizontal.?.toUtf8(a, 4096);
        defer a.free(alignment);
        try std.testing.expectEqualStrings("RIGHT", alignment);
        try std.testing.expectEqual(@as(?i64, -2000), shape.margins[0].?.value);
        try std.testing.expectEqual(@as(?i64, 160), shape.spacing.?.value);
        const unit = try shape.margins[0].?.unit.?.toUtf8(a, 4096);
        defer a.free(unit);
        try std.testing.expectEqualStrings("HWPUNIT", unit);
    }
    try std.testing.expect(found);
}
