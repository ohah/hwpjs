//! Independent raw record oracle plus existing typed reader/history lifecycle.
//! No external fixture, opaque payload, clock, filesystem or font is read.
const std = @import("std");
const root = @import("root.zig");
const cfb = @import("../cfb/reader.zig");
const hwp = @import("../hwp5/root.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const History = @import("../hwp5/edit/editor_history.zig").History;
const a = std.testing.allocator;

fn int(comptime T: type, bytes: []const u8, at: usize) !T {
    if (at > bytes.len or @sizeOf(T) > bytes.len - at) return error.TruncatedOracleInput;
    return std.mem.readInt(T, bytes[at..][0..@sizeOf(T)], .little);
}

/// Deliberately does not call the production record/note/border decoder or
/// writer. Fixed small records must have no extended framing or trailing data.
fn rawOracle(bytes: []const u8, modern: bool) !void {
    var file = try cfb.File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const header = try file.readStream(a, "/FileHeader");
    try std.testing.expectEqual(@as(u32, if (modern) 0x05000300 else 0x05000107), try int(u32, header, 32));
    try std.testing.expectEqual(@as(u32, 0), try int(u32, header, 36));
    const body = try file.readStream(a, "/BodyText/Section0");
    const tags: []const u16 = if (modern) &.{ 66, 67, 68, 71, 73, 74, 74, 75, 71 } else &.{ 66, 67, 68, 71, 73, 71 };
    const levels: []const u16 = if (modern) &.{ 0, 1, 1, 1, 2, 2, 2, 2, 1 } else &.{ 0, 1, 1, 1, 2, 1 };
    var offset: usize = 0;
    var notes: usize = 0;
    for (tags, levels, 0..) |tag, level, index| {
        const frame = try int(u32, body, offset);
        offset += 4;
        try std.testing.expectEqual(tag, @as(u16, @intCast(frame & 1023)));
        try std.testing.expectEqual(level, @as(u16, @intCast((frame >> 10) & 1023)));
        const len: usize = frame >> 20;
        if (len == 4095 or offset > body.len or len > body.len - offset) return error.InvalidOracleRecord;
        const payload = body[offset..][0..len];
        offset += len;
        if (index == 1) {
            try std.testing.expectEqual(@as(usize, 34), len);
            // Two extended metadata controls, no literal text or literal FFFC.
            try std.testing.expectEqual(@as(u16, 2), try int(u16, payload, 0));
            try std.testing.expectEqual(@as(u32, 0x73656364), try int(u32, payload, 2));
            try std.testing.expectEqual(@as(u16, 2), try int(u16, payload, 14));
            try std.testing.expectEqual(@as(u16, 2), try int(u16, payload, 16));
            try std.testing.expectEqual(@as(u32, 0x636f6c64), try int(u32, payload, 18));
            try std.testing.expectEqual(@as(u16, 2), try int(u16, payload, 30));
            try std.testing.expectEqual(@as(u16, 13), try int(u16, payload, 32));
        }
        if (index == 3) {
            try std.testing.expectEqual(@as(usize, 30), len);
            try std.testing.expectEqual(@as(u32, 0x73656364), try int(u32, payload, 0));
        }
        if (tag == 74) {
            try std.testing.expectEqual(@as(usize, 28), len);
            // Table133 offsets for the explicit project observed28 layout.
            try std.testing.expectEqual(@as(u32, 0), try int(u32, payload, 0));
            for ([_]usize{ 4, 6, 8 }) |at| try std.testing.expectEqual(@as(u16, 0), try int(u16, payload, at));
            try std.testing.expectEqual(@as(u16, 1), try int(u16, payload, 10));
            try std.testing.expectEqual(@as(i32, 0), try int(i32, payload, 12));
            for ([_]usize{ 16, 18, 20 }) |at| try std.testing.expectEqual(@as(i16, 0), try int(i16, payload, at));
            try std.testing.expectEqual(@as(u8, 0), payload[22]); // solid, not none
            try std.testing.expectEqual(@as(u8, 0), payload[23]); // 0.1mm
            try std.testing.expectEqual(@as(u32, 0), try int(u32, payload, 24));
            notes += 1;
        }
        if (tag == 75) {
            try std.testing.expectEqual(@as(usize, 14), len);
            try std.testing.expectEqual(@as(u32, 0), try int(u32, payload, 0));
            for ([_]usize{ 4, 6, 8, 10 }) |at| try std.testing.expectEqual(@as(i16, 0), try int(i16, payload, at));
            try std.testing.expectEqual(@as(u16, 0), try int(u16, payload, 12));
        }
    }
    try std.testing.expectEqual(body.len, offset);
    try std.testing.expectEqual(@as(usize, if (modern) 2 else 0), notes);
}

fn typedOracle(bytes: []const u8, modern: bool) !void {
    var file = try cfb.File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const version = (try hwp.Header.parse(try file.readStream(a, "/FileHeader"))).version();
    var tree = try hwp.body_tree.Tree.parse(a, try file.readStream(a, "/BodyText/Section0"), version, .{});
    defer tree.deinit(a);
    const owner = try hwp.section_validation.definitionOwner(tree);
    const report = try hwp.section_validation.inspect(tree, version, 0, 0);
    try std.testing.expectEqual(@as(usize, 1), report.definitions);
    try std.testing.expectEqual(@as(usize, 1), report.pages);
    try std.testing.expectEqual(@as(usize, if (modern) 2 else 0), report.note_shapes);
    try std.testing.expectEqual(@as(usize, if (modern) 1 else 0), report.borders);
    var notes: usize = 0;
    for (tree.nodes) |node| switch (node.record.value) {
        .note_shape => |shape| {
            try std.testing.expectEqual(@as(?usize, owner), node.parent);
            try std.testing.expectEqual(hwp.body.note_shape.Layout.observed28, shape.layout);
            const kind: hwp.body.note_shape.attributes.Kind = if (notes == 0) .footnote else .endnote;
            const semantics = try shape.attributeSemantics(kind);
            try std.testing.expectEqual(@as(u8, 0), semantics.number_kind_raw);
            try std.testing.expectEqual(hwp.body.note_shape.attributes.Numbering.continue_previous, semantics.numbering);
            try std.testing.expectEqual(@as(u32, 0), semantics.uninterpreted_flags);
            switch (semantics.placement) {
                .footnote => |placement| try std.testing.expectEqual(hwp.body.note_shape.attributes.FootnotePlacement.each_column, placement),
                .endnote => |placement| try std.testing.expectEqual(hwp.body.note_shape.attributes.EndnotePlacement.document_end, placement),
            }
            notes += 1;
        },
        .page_border => |border| {
            try std.testing.expectEqual(@as(?usize, owner), node.parent);
            try std.testing.expectEqual(@as(u16, 0), border.border_fill_id);
        },
        else => {},
    };
}

test "new section children independent raw specification and typed physical owner oracles both profiles" {
    inline for (.{ root.Hwp5Profile.legacy_5_0_1_7, root.Hwp5Profile.modern_5_0_3_0 }) |profile| {
        const bytes = try root.hwp5WithProfile(a, profile);
        defer a.free(bytes);
        try rawOracle(bytes, profile == .modern_5_0_3_0);
        try typedOracle(bytes, profile == .modern_5_0_3_0);
    }
}

test "new section children stay exact across Session save reopen text history and legacy" {
    inline for (.{ root.Hwp5Profile.legacy_5_0_1_7, root.Hwp5Profile.modern_5_0_3_0 }) |profile| {
        const bytes = try root.hwp5WithProfile(a, profile);
        defer a.free(bytes);
        const session = try edit.Session.open(a, bytes);
        defer session.close();
        const unchanged = try session.save(a, .{});
        defer a.free(unchanged.bytes);
        try std.testing.expectEqualSlices(u8, bytes, unchanged.bytes);
        var history = try History.initV2(a, session, .{});
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "자체 합성 A😀" } }));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try typedOracle(saved.bytes, profile == .modern_5_0_3_0);
        var before = try cfb.File.open(a, bytes, .{});
        defer before.deinit();
        var after = try cfb.File.open(a, saved.bytes, .{});
        defer after.deinit();
        var old_records = hwp.record.Iterator.init(try before.readStream(a, "/BodyText/Section0"), .{});
        var new_records = hwp.record.Iterator.init(try after.readStream(a, "/BodyText/Section0"), .{});
        while (try old_records.next()) |record| {
            const current = (try new_records.next()) orelse return error.MissingSavedRecord;
            try std.testing.expectEqual(record.tag, current.tag);
            if (record.tag == 74 or record.tag == 75) {
                try std.testing.expectEqual(record.level, current.level);
                try std.testing.expectEqualSlices(u8, record.payload, current.payload);
            }
        }
        try std.testing.expect((try new_records.next()) == null);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        const text = try session.copyText(a, 0, 0);
        defer a.free(text);
        const reread = try reopened.copyText(a, 0, 0);
        defer a.free(reread);
        try std.testing.expectEqualSlices(u8, text, reread);
        try std.testing.expect(try history.undo(session));
        const undone = try session.save(a, .{});
        defer a.free(undone.bytes);
        try std.testing.expectEqualSlices(u8, bytes, undone.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    }
}

test "new section children constructor open save reopen allocation failures release all owned state" {
    inline for (.{ root.Hwp5Profile.legacy_5_0_1_7, root.Hwp5Profile.modern_5_0_3_0 }) |profile| {
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator) !void {
                const source = try root.hwp5WithProfile(allocator, profile);
                defer allocator.free(source);
                const session = try edit.Session.open(allocator, source);
                defer session.close();
                var history = try History.initV2(allocator, session, .{});
                defer history.deinit();
                _ = try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "A😀" } });
                const saved = try session.save(allocator, .{ .allow_stale_layout = true });
                defer allocator.free(saved.bytes);
                const reopened = try edit.Session.open(allocator, saved.bytes);
                defer reopened.close();
            }
        }.run, .{});
    }
}
