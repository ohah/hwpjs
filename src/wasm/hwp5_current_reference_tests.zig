const std = @import("std");
const codec = @import("hwp5_current_reference.zig");
const a = std.testing.allocator;

fn roundTrip(allocator: std.mem.Allocator) !void {
    const references = [_]codec.Reference{
        .{ .source = .{ .section = 0, .host = .{ .original_node = 0 } } },
        .{ .source = .{ .section = 2, .host = .{ .generated_instance = 123 } } },
        .{ .created_cell = .{ .section = 3, .table = std.math.maxInt(u64), .row = 7, .column = 9 } },
    };
    for (references) |reference| {
        const wire = try codec.encode(allocator, reference, std.math.maxInt(u64));
        defer wire.deinit(allocator);
        const bytes = try std.json.Stringify.valueAlloc(allocator, wire, .{});
        defer allocator.free(bytes);
        const restored = try codec.decode(allocator, bytes, std.math.maxInt(u64));
        try std.testing.expectEqualDeep(reference, restored);
    }
}

test "current reference codec preserves full width IDs through every allocation failure" {
    try roundTrip(a);
    try std.testing.checkAllAllocationFailures(a, roundTrip, .{});
}

test "current reference codec rejects malformed identities and stale lifetimes" {
    const valid = "{\"epoch\":\"2\",\"kind\":\"original\",\"section\":0,\"id\":\"0\",\"row\":0,\"column\":0}";
    try std.testing.expectError(error.StaleCurrentReference, codec.decode(a, valid, 3));
    for ([_][]const u8{
        "{\"epoch\":\"02\",\"kind\":\"original\",\"section\":0,\"id\":\"0\",\"row\":0,\"column\":0}",
        "{\"epoch\":\"2\",\"kind\":\"generated\",\"section\":0,\"id\":\"0\",\"row\":0,\"column\":0}",
        "{\"epoch\":\"2\",\"kind\":\"original\",\"section\":0,\"id\":\"4294967296\",\"row\":0,\"column\":0}",
        "{\"epoch\":\"2\",\"kind\":\"cell\",\"section\":0,\"id\":\"18446744073709551616\",\"row\":0,\"column\":0}",
        "{\"epoch\":\"2\",\"kind\":\"original\",\"section\":0,\"id\":\"0\",\"row\":1,\"column\":0}",
        "{\"epoch\":\"2\",\"kind\":\"original\",\"section\":0,\"id\":\"0\",\"row\":0,\"column\":0,\"extra\":1}",
        "{\"epoch\":\"2\",\"epoch\":\"2\",\"kind\":\"original\",\"section\":0,\"id\":\"0\",\"row\":0,\"column\":0}",
    }) |bytes| try std.testing.expectError(error.InvalidCurrentReference, codec.decode(a, bytes, 2));
    for (0..valid.len) |length| try std.testing.expectError(error.InvalidCurrentReference, codec.decode(a, valid[0..length], 2));
}

fn sourceWindowOwned(allocator: std.mem.Allocator, session: *const @import("../hwp5/edit/style_preservation.zig").Session) !void {
    const bytes = try @import("hwp5_current_snapshot.zig").writeSources(allocator, session, 7, 0, 1, 3);
    defer allocator.free(bytes);
    const Window = struct { version: u32, total: usize, first: u32, references: []codec.Wire };
    const parsed = try std.json.parseFromSlice(Window, allocator, bytes, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(@as(u32, 1), parsed.value.first);
    try std.testing.expectEqual(@as(usize, 3), parsed.value.references.len);
    try std.testing.expectEqual(try session.paragraphCount(0), parsed.value.total);
    for (parsed.value.references, 1..) |wire, index| {
        try std.testing.expect(wire.kind != .cell);
        const encoded = try std.json.Stringify.valueAlloc(allocator, wire, .{});
        defer allocator.free(encoded);
        try std.testing.expectEqualDeep(try session.currentSourceParagraphReference(0, index), try codec.decode(allocator, encoded, 7));
    }
}

test "source reference window owns bounded metadata through every allocation failure" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try @import("../hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    try std.testing.checkAllAllocationFailures(a, sourceWindowOwned, .{session});
    const total = try session.paragraphCount(0);
    try std.testing.expectError(error.InvalidParagraph, session.currentSourceParagraphReference(0, total));
    try std.testing.expectError(error.InvalidSection, session.currentSourceParagraphReference(99, 0));
    try std.testing.expectError(error.InvalidCurrentWindow, @import("hwp5_current_snapshot.zig").writeSources(a, session, 7, 0, @intCast(total + 1), 0));
    try std.testing.expectError(error.LimitExceeded, @import("hwp5_current_snapshot.zig").writeSources(a, session, 7, 0, 0, 1025));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}
