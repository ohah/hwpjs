//! Stored automatic-number values and current anchor location, not sequence evaluation.
const std = @import("std");
pub const Source = struct {
    control_node: usize,
    paragraph: usize,
    source_unit: usize,
    current_unit: u32,
    attributes: u32,
    kind: u4,
    shape: u8,
    superscript: bool,
    number: u16,
    symbol: u16,
    prefix: u16,
    suffix: u16,
    extra_bytes: usize,
    extra_nonzero: bool,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph) ![]Source {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var out: std.ArrayList(Source) = .empty;
    errdefer out.deinit(a);
    for (links.items, 0..) |link, index| {
        if (link.header_id != @import("../body/control_rules.zig").id("atno")) continue;
        if (link.code != 18) return error.UnsupportedAutomaticNumberAnchor;
        const paragraph = owners.get(@intCast(link.paragraph_node)) orelse return error.MissingAutomaticNumberOwner;
        const value = try @import("../body/number_control.zig").Auto.parse(tree.nodes[link.control_node].record.value.control_header.properties);
        const unit = try @import("current_control_anchor.zig").position(links.items, index, paragraphs[paragraph]);
        var nonzero = false;
        for (value.extra) |byte| if (byte != 0) {
            nonzero = true;
            break;
        };
        try out.append(a, .{ .control_node = link.control_node, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = unit, .attributes = value.header.attributes, .kind = value.header.kind(), .shape = value.shape(), .superscript = value.superscript(), .number = value.header.number, .symbol = value.symbol, .prefix = value.prefix, .suffix = value.suffix, .extra_bytes = value.extra.len, .extra_nonzero = nonzero });
    }
    return out.toOwnedSlice(a);
}

test "HWP5 automatic number sources actual header anchor edit and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const original = try session.automaticNumberSources(a, 0);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 1), original.len);
    try std.testing.expectEqual(@as(usize, 22), original[0].control_node);
    try std.testing.expectEqual(@as(usize, 2), original[0].paragraph);
    try std.testing.expectEqual(@as(usize, 17), original[0].source_unit);
    try std.testing.expectEqual(@as(u32, 17), original[0].current_unit);
    try std.testing.expectEqual(@as(u16, 1), original[0].number);
    try std.testing.expectEqual(@as(u32, 0), original[0].attributes);
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "번호😀" } });
    const shifted = try session.automaticNumberSources(a, 0);
    defer a.free(shifted);
    try std.testing.expectEqual(original[0].source_unit, shifted[0].source_unit);
    try std.testing.expectEqual(@as(u32, 21), shifted[0].current_unit);
    try std.testing.expectError(error.InvalidSection, session.automaticNumberSources(a, 999));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, expected: []const Source) !void {
            const rows = try s.automaticNumberSources(allocator, 0);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(expected, rows);
        }
    }.run, .{ session, shifted });
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.automaticNumberSources(a, 0);
    defer a.free(restored);
    try std.testing.expectEqual(shifted.len, restored.len);
    var values = restored[0];
    try std.testing.expectEqual(@as(usize, 21), values.source_unit);
    try std.testing.expectEqual(@as(u32, 21), values.current_unit);
    values.control_node = shifted[0].control_node;
    values.source_unit = shifted[0].source_unit;
    try std.testing.expectEqualDeep(shifted[0], values);
}
