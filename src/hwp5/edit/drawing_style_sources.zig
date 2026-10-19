//! Scalar style inventory under an explicitly selected wire layout; not paint defaults.
const std = @import("std");
const Style = @import("../body/drawing_style.zig");
const Border = @import("../body/shape_border.zig").Border;
const Alpha = @import("../docinfo/fill_alpha.zig").Alpha;
const Shadow = @import("../body/shadow.zig").Shadow;
const Metadata = @import("../body/drawing_metadata.zig").Metadata;
const Fill = @import("../docinfo/fill.zig");
const Gradient = @import("drawing_gradient_source.zig").Gradient;
pub const Source = struct {
    component_node: usize,
    owner_node: usize,
    border: Border,
    fill_flags: u32,
    fill_known: bool,
    pattern: ?Fill.Pattern,
    gradient_colors: ?usize,
    gradient: ?Gradient,
    image: ?Fill.Image,
    additional_bytes: ?usize,
    alpha: ?Alpha,
    shadow: ?Shadow,
    metadata: ?Metadata,
    extra_bytes: usize,
};
pub fn deinit(a: std.mem.Allocator, rows: []Source) void {
    for (rows) |row| if (row.gradient) |gradient| gradient.deinit(a);
    a.free(rows);
}
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, options: @import("../body/drawing_style_validation.zig").Options) ![]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    var out: std.ArrayList(Source) = .empty;
    errdefer {
        for (out.items) |row| if (row.gradient) |gradient| gradient.deinit(a);
        out.deinit(a);
    }
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 76) continue;
        const owner = node.parent orelse return error.OrphanShapeComponent;
        const component = try @import("../body/shape_component.zig").Component.parse(node.record.framing.payload, try @import("../body/shape_validation.zig").componentLayout(tree, index));
        if (!@import("../body/drawing_style_validation.zig").supports(component.id)) continue;
        const parsed = try Style.Style.parseWithTail(component.extra, options.border, options.tail);
        var source: Source = .{
            .component_node = index,
            .owner_node = owner,
            .border = parsed.border,
            .fill_flags = parsed.fill.flags,
            .fill_known = parsed.fill.data == .known,
            .pattern = null,
            .gradient_colors = null,
            .gradient = null,
            .image = null,
            .additional_bytes = null,
            .alpha = null,
            .shadow = null,
            .metadata = null,
            .extra_bytes = 0,
        };
        errdefer if (source.gradient) |gradient| gradient.deinit(a);
        switch (parsed.fill.data) {
            .unknown => {},
            .known => |fill| {
                source.pattern = fill.pattern;
                source.gradient_colors = if (fill.gradient) |gradient| gradient.count() else null;
                source.gradient = if (fill.gradient) |gradient| try Gradient.copy(a, gradient, fill.blurCenter()) else null;
                source.image = fill.image;
                source.additional_bytes = fill.additional.len;
            },
        }
        switch (parsed.tail) {
            .unknown, .fill_only => |bytes| source.extra_bytes = bytes.len,
            .known => |tail| {
                source.alpha = tail.alpha;
                source.shadow = tail.shadow;
                source.metadata = tail.metadata;
                source.extra_bytes = tail.extra.len;
            },
        }
        try out.append(a, source);
    }
    return out.toOwnedSlice(a);
}
test "drawing style scalar inventory actual grouped layouts and allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "matrix", "shapecontainer-2", "textbox", "shaperect" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var document = try @import("../text_source.zig").Source.open(a, input);
        defer document.deinit();
        const raw = try document.decodeSection(a, 0);
        defer a.free(raw);
        const options: @import("../body/drawing_style_validation.zig").Options = .{ .tail = .alpha_shadow };
        const expected = try read(a, raw, document.header.version(), options);
        defer deinit(a, expected);
        try std.testing.expect(expected.len > 0);
        var tree = try @import("source_tree.zig").parse(a, raw, document.header.version(), .{});
        defer tree.deinit(a);
        for (expected) |item| {
            try std.testing.expect(item.owner_node < item.component_node);
            try std.testing.expect(item.fill_known);
            try std.testing.expect(item.shadow != null);
            // Fixed offsets do not reuse the style/component field readers.
            const payload = tree.nodes[item.component_node].record.framing.payload;
            const count_at: usize = if (tree.nodes[item.owner_node].record.value == .control_header) 50 else 46;
            const pairs = std.mem.readInt(u16, payload[count_at..][0..2], .little);
            const style_at = count_at + 2 + 48 + @as(usize, pairs) * 96;
            try std.testing.expectEqual(std.mem.readInt(u32, payload[style_at..][0..4], .little), item.border.color);
            try std.testing.expectEqual(std.mem.readInt(i32, payload[style_at + 4 ..][0..4], .little), item.border.width);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[style_at + 8 ..][0..4], .little), item.border.attributes.raw);
            try std.testing.expectEqual(payload[style_at + 12], item.border.outline);
            try std.testing.expectEqual(std.mem.readInt(u32, payload[style_at + 13 ..][0..4], .little), item.fill_flags);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, selected: @import("../body/drawing_style_validation.zig").Options, values: []const Source) !void {
                const actual = try read(allocator, bytes, version, selected);
                defer deinit(allocator, actual);
                try std.testing.expectEqualDeep(values, actual);
            }
        }.run, .{ raw, document.header.version(), options, expected });
        const older = try read(a, raw, document.header.version(), .{ .tail = .fill_only });
        defer deinit(a, older);
        for (older, expected) |old, current| {
            try std.testing.expectEqualDeep(old.border, current.border);
            try std.testing.expectEqual(null, old.shadow);
            try std.testing.expectEqual(null, old.alpha);
            try std.testing.expect(old.extra_bytes > current.extra_bytes);
        }
    }
}
