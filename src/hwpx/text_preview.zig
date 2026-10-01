//! Bounded public transport of the existing selected section text events.
//! No new XML parser, mutable document model or rendering semantics.
const std = @import("std");
const package = @import("package.zig");
const max_bytes = 64 * 1024 * 1024;

pub fn encode(a: std.mem.Allocator, input: []const u8) ![]u8 {
    if (input.len > max_bytes) return error.LimitExceeded;
    var doc = try package.inspectDocument(a, input, .{});
    defer doc.deinit(a);
    var snapshot = try doc.readSectionTextSnapshot(a, .{ .scan = .{ .text = .{ .branch_policy = .{ .mode = .selected } } } });
    defer snapshot.deinit();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try append(a, &out, "HXT1");
    try word(a, &out, snapshot.report.sections);
    try word(a, &out, snapshot.report.paragraphs);
    try word(a, &out, snapshot.events.len);
    for (snapshot.events) |event| {
        const loc = event.location;
        if (loc.part_kind != .section) return error.SourceBindingMismatch;
        try word(a, &out, loc.section_ordinal);
        try word(a, &out, loc.item_index);
        try word(a, &out, loc.paragraph_ordinal);
        try word(a, &out, loc.run_ordinal);
        try word(a, &out, loc.text_ordinal);
        var kind: u32 = undefined;
        var inline_kind: u32 = std.math.maxInt(u32);
        const bytes: []const u8 = switch (event.value) {
            .paragraph_start => |b| blk: {
                kind = 0;
                break :blk b;
            },
            .paragraph_end => |b| blk: {
                kind = 1;
                break :blk b;
            },
            .run_start => |b| blk: {
                kind = 2;
                break :blk b;
            },
            .run_end => |b| blk: {
                kind = 3;
                break :blk b;
            },
            .text_start => |b| blk: {
                kind = 4;
                break :blk b;
            },
            .text_end => blk: {
                kind = 5;
                break :blk "";
            },
            .content => |b| blk: {
                kind = 6;
                break :blk b;
            },
            .inline_start => |b| blk: {
                kind = 7;
                inline_kind = @intFromEnum(b.kind);
                break :blk b.raw_tag;
            },
            .inline_end => |b| blk: {
                kind = 8;
                inline_kind = @intFromEnum(b.kind);
                break :blk b.raw_tag;
            },
            .inline_empty => |b| blk: {
                kind = 9;
                inline_kind = @intFromEnum(b.kind);
                break :blk b.raw_tag;
            },
        };
        try word(a, &out, kind);
        try word(a, &out, inline_kind);
        try word(a, &out, bytes.len);
        try append(a, &out, bytes);
    }
    return out.toOwnedSlice(a);
}

fn word(a: std.mem.Allocator, out: *std.ArrayList(u8), value: usize) !void {
    var bytes: [4]u8 = undefined;
    std.mem.writeInt(u32, &bytes, std.math.cast(u32, value) orelse return error.LimitExceeded, .little);
    try append(a, out, &bytes);
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    if (bytes.len > max_bytes -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}

test "HWPX public text transport releases every failed allocation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const output = try encode(allocator, bytes);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("HXT1", output[0..4]);
            try std.testing.expectEqual(@as(u32, 1), std.mem.readInt(u32, output[4..8], .little));
            try std.testing.expectEqual(@as(u32, 7), std.mem.readInt(u32, output[8..12], .little));
        }
    }.run, .{input});
}
