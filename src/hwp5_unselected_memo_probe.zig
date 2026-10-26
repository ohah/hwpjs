const std = @import("std");
const source_policy = @import("hwp5/edit/source_policy.zig");
const Source = @import("hwp5/text_source.zig").Source;

test "unselected-memo propagates the first sixteen allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 2);
    defer a.free(bytes);
    const original = try a.dupe(u8, bytes);
    defer a.free(original);
    for (0..16) |index| {
        var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, @import("hwp5/edit/unselected_memo_retention.zig").validate(failure.allocator(), bytes, source.header.version()));
        var structure_failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, source_policy.validateUnselectedStructureSection(structure_failure.allocator(), bytes, source.header.version()));
        try std.testing.expectEqualSlices(u8, original, bytes);
    }
}

comptime {
    _ = @import("hwp5/edit/memo_structure_tests.zig");
    _ = @import("hwp5/edit/memo_flow_tests.zig");
}

test "unselected-memo rejects truncated actual memo field references" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 2);
    defer a.free(bytes);
    var records = @import("hwp5/record.zig").Iterator.init(bytes, .{});
    while (try records.next()) |record| {
        if (record.tag != 71 or record.payload.len < 13) continue;
        if (std.mem.readInt(u32, record.payload[0..4], .little) != @import("hwp5/body/control_rules.zig").id("%unk")) continue;
        try std.testing.expectEqual(@as(usize, 4), record.raw.len - record.payload.len);
        const shortened = try a.alloc(u8, bytes.len - 4);
        defer a.free(shortened);
        const tail = record.offset + record.raw.len - 4;
        @memcpy(shortened[0..tail], bytes[0..tail]);
        @memcpy(shortened[tail..], bytes[tail + 4 ..]);
        const header = std.mem.readInt(u32, shortened[record.offset..][0..4], .little);
        std.mem.writeInt(u32, shortened[record.offset..][0..4], (header & 0xfffff) | (@as(u32, @intCast(record.payload.len - 4)) << 20), .little);
        try std.testing.expectError(error.UnsupportedMemoFieldReference, source_policy.validateUnselectedTextSection(a, shortened, source.header.version()));
        try std.testing.expectError(error.UnsupportedMemoFieldReference, source_policy.validateUnselectedCharacterFormat(a, shortened, source.header.version()));
        try std.testing.expectError(error.UnsupportedMemoFieldReference, source_policy.validateUnselectedStructureSection(a, shortened, source.header.version()));
        return;
    }
    return error.MissingMemoFixtureField;
}

test "unselected-memo refuses memo-less formulas and unknown controls" {
    const a = std.testing.allocator;
    for ([_]u32{ @import("hwp5/body/control_rules.zig").id("%fmu"), @import("hwp5/body/control_rules.zig").id("zzzz") }) |id| {
        var bytes: [8]u8 = undefined;
        std.mem.writeInt(u32, bytes[0..4], 71 | (@as(u32, 4) << 20), .little);
        std.mem.writeInt(u32, bytes[4..8], id, .little);
        try std.testing.expectError(error.UnsupportedSectionControl, source_policy.validateUnselectedTextSection(a, &bytes, .{ .raw = 0x05000300 }));
        try std.testing.expectError(error.UnsupportedSectionControl, source_policy.validateUnselectedCharacterFormat(a, &bytes, .{ .raw = 0x05000300 }));
        if (id == @import("hwp5/body/control_rules.zig").id("zzzz")) try std.testing.expectError(error.UnsupportedSectionControl, source_policy.validateUnselectedStructureSection(a, &bytes, .{ .raw = 0x05000300 }));
    }
}

test "unselected-memo rejects a corrupted actual MEMO alias" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 2);
    defer a.free(bytes);
    var records = @import("hwp5/record.zig").Iterator.init(bytes, .{});
    var changed = false;
    while (try records.next()) |record| {
        if (record.tag != 71 or record.payload.len < 13) continue;
        const id = std.mem.readInt(u32, record.payload[0..4], .little);
        if (id != @import("hwp5/body/control_rules.zig").id("%unk")) continue;
        try std.testing.expectEqual(@as(u8, 'M'), record.payload[11]);
        const offset = record.offset + record.raw.len - record.payload.len + 11;
        bytes[offset] = 'X';
        changed = true;
        break;
    }
    try std.testing.expect(changed);
    try std.testing.expectError(error.UnsupportedSectionControl, source_policy.validateUnselectedTextSection(a, bytes, source.header.version()));
    try std.testing.expectError(error.UnsupportedSectionControl, source_policy.validateUnselectedCharacterFormat(a, bytes, source.header.version()));
    try std.testing.expectError(error.UnsupportedSectionControl, source_policy.validateUnselectedStructureSection(a, bytes, source.header.version()));
}

test "unselected-memo retains actual immutable memo section" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 2);
    defer a.free(bytes);
    try source_policy.validateUnselectedTextSection(a, bytes, source.header.version());
    try source_policy.validateUnselectedCharacterFormat(a, bytes, source.header.version());
    try source_policy.validateUnselectedStructureSection(a, bytes, source.header.version());
}

test "unselected-memo edits section zero while retaining other streams and history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(16_000_000));
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 16_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "구역보존😀" } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    var before = try Source.open(a, input);
    defer before.deinit();
    var after = try Source.open(a, saved.bytes);
    defer after.deinit();
    for ([_]usize{ 1, 2 }) |section| {
        const old = try before.decodeSection(a, section);
        defer a.free(old);
        const current = try after.decodeSection(a, section);
        defer a.free(current);
        try std.testing.expectEqualSlices(u8, old, current);
    }
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
