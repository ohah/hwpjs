//! Layout declarations remain protected tokens, distinct from painted objects.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const rules = @import("../body/control_rules.zig");
pub const Kind = enum { section, column, header, footer };
pub const Anchor = struct { kind: Kind, control_node: usize, paragraph: usize, source_unit: usize, current_unit: u32 };

test "HWP5 structural anchors head foot move only in their current host and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const original = try session.structuralAnchors(a, 0);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 4), original.len);
    try std.testing.expectEqual(Kind.header, original[2].kind);
    try std.testing.expectEqual(Kind.footer, original[3].kind);
    const host = original[2].paragraph;
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = host, .start_unit = 0, .end_unit = 0, .utf8 = "선언😀" } });
    const shifted = try session.structuralAnchors(a, 0);
    defer a.free(shifted);
    for (original, shifted) |before, after| {
        try std.testing.expectEqual(before.source_unit, after.source_unit);
        try std.testing.expectEqual(before.current_unit + @as(u32, if (before.paragraph == host) 4 else 0), after.current_unit);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, expected: []const Anchor) !void {
            const rows = try s.structuralAnchors(allocator, 0);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(expected, rows);
        }
    }.run, .{ session, shifted });
}

pub fn read(a: std.mem.Allocator, raw: []const u8, version: Version, paragraphs: []const model.Paragraph) ![]Anchor {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var out: std.ArrayList(Anchor) = .empty;
    errdefer out.deinit(a);
    for (links.items, 0..) |link, index| {
        const kind: Kind = if (link.header_id == rules.section_id) .section else if (link.header_id == rules.column_id) .column else if (link.header_id == rules.id("head")) .header else if (link.header_id == rules.id("foot")) .footer else continue;
        const expected_code: u16 = if (kind == .header or kind == .footer) 16 else 2;
        if (link.code != expected_code) return error.UnsupportedStructuralAnchorControl;
        const paragraph = owners.get(@intCast(link.paragraph_node)) orelse return error.MissingCurrentStructuralAnchorOwner;
        const unit = try @import("current_control_anchor.zig").position(links.items, index, paragraphs[paragraph]);
        try out.append(a, .{ .kind = kind, .control_node = link.control_node, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = unit });
    }
    return out.toOwnedSlice(a);
}

test "HWP5 structural anchors follow real prefix edit and saved reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const Session = @import("style_preservation.zig").Session;
    const session = try Session.open(a, input);
    defer session.close();
    try std.testing.expectError(error.InvalidSection, session.structuralAnchors(a, 999));
    const original = try session.structuralAnchors(a, 0);
    defer a.free(original);
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "앞😀" } });
    const shifted = try session.structuralAnchors(a, 0);
    defer a.free(shifted);
    for (original, shifted) |before, after| {
        try std.testing.expectEqual(before.kind, after.kind);
        try std.testing.expectEqual(before.source_unit, after.source_unit);
        try std.testing.expectEqual(before.current_unit + 3, after.current_unit);
    }
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.structuralAnchors(a, 0);
    defer a.free(restored);
    try std.testing.expectEqual(shifted.len, restored.len);
    for (shifted, restored) |before, after| {
        try std.testing.expectEqual(before.kind, after.kind);
        try std.testing.expectEqual(before.current_unit, after.current_unit);
        try std.testing.expectEqual(after.source_unit, after.current_unit);
    }
}

test "HWP5 structural anchors actual table host and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const rows = try read(a, raw, source.header.version(), document.sections[0].paragraphs);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqual(Kind.section, rows[0].kind);
    try std.testing.expectEqual(Kind.column, rows[1].kind);
    try std.testing.expectEqual(@as(u32, 0), rows[0].current_unit);
    try std.testing.expectEqual(@as(u32, 8), rows[1].current_unit);
    for (rows) |row| {
        try std.testing.expectEqual(@as(usize, 0), row.paragraph);
        try std.testing.expectEqual(row.source_unit, row.current_unit);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: Version, p: []const model.Paragraph, expected: []const Anchor) !void {
            const actual = try read(allocator, bytes, version, p);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ raw, source.header.version(), document.sections[0].paragraphs, rows });
}
