const std = @import("std");
const t = std.testing;
const enhanced = @import("enhanced_metafile.zig");
const sequence = @import("enhanced_metafile_sequence.zig");

fn chunks() [2]enhanced.Chunk {
    return .{
        .{ .version = 0x00010000, .checksum = 0xfffc, .record_count = 2, .current_size = 2, .remaining_bytes = 2, .total_size = 4, .data = &.{ 1, 0 } },
        .{ .version = 0x00010000, .checksum = 0xfffc, .record_count = 2, .current_size = 2, .remaining_bytes = 0, .total_size = 4, .data = &.{ 2, 0 } },
    };
}

test "WMF enhanced metafile sequence validates and owns reassembled bytes" {
    const values = chunks();
    const summary = try sequence.validate(&values, 4);
    try t.expectEqual(@as(usize, 2), summary.records);
    try t.expectEqual(@as(usize, 4), summary.bytes);
    const bytes = try sequence.assemble(t.allocator, &values, 4);
    defer t.allocator.free(bytes);
    try t.expectEqualSlices(u8, &.{ 1, 0, 2, 0 }, bytes);
    try t.expectEqual(@as(u16, 0xfffc), try sequence.calculateChecksum(bytes));
}

test "WMF enhanced metafile checksum carries a WORD across odd chunk boundaries" {
    const values = [_]enhanced.Chunk{
        .{ .version = 0x00010000, .checksum = 0xfffc, .record_count = 2, .current_size = 1, .remaining_bytes = 3, .total_size = 4, .data = &.{1} },
        .{ .version = 0x00010000, .checksum = 0xfffc, .record_count = 2, .current_size = 3, .remaining_bytes = 0, .total_size = 4, .data = &.{ 0, 2, 0 } },
    };
    _ = try sequence.validate(&values, 4);
}

test "WMF enhanced metafile sequence rejects count metadata and order drift" {
    var values = chunks();
    try t.expectError(error.InvalidWmfEnhancedMetafileSequenceCount, sequence.validate(values[0..1], 4));
    values = chunks();
    values[1].record_count = 3;
    try t.expectError(error.InconsistentWmfEnhancedMetafileSequence, sequence.validate(&values, 4));
    values = chunks();
    values[0].remaining_bytes = 0;
    try t.expectError(error.InvalidWmfEnhancedMetafileSequenceRemainingBytes, sequence.validate(&values, 4));
    values = chunks();
    const swapped = [_]enhanced.Chunk{ values[1], values[0] };
    try t.expectError(error.InvalidWmfEnhancedMetafileSequenceRemainingBytes, sequence.validate(&swapped, 4));
}

test "WMF enhanced metafile sequence count is independent from byte completeness" {
    const value = [_]enhanced.Chunk{.{ .version = 0x00010000, .checksum = 0xfffe, .record_count = 2, .current_size = 2, .remaining_bytes = 0, .total_size = 2, .data = &.{ 1, 0 } }};
    try t.expectError(error.InvalidWmfEnhancedMetafileSequenceCount, sequence.validate(&value, 2));
}

test "WMF enhanced metafile sequence rejects size checksum and limits" {
    var values = chunks();
    try t.expectError(error.LimitExceeded, sequence.validate(&values, 3));
    values[1].data = &.{ 2, 1 };
    try t.expectError(error.InvalidWmfEnhancedMetafileChecksum, sequence.validate(&values, 4));
    values = chunks();
    values[1].current_size = 1;
    try t.expectError(error.InvalidWmfEnhancedMetafileSequenceSize, sequence.validate(&values, 4));
    try t.expectError(error.InvalidWmfEnhancedMetafileWordSize, sequence.calculateChecksum(&.{1}));
}

fn successful(a: std.mem.Allocator) !void {
    const values = chunks();
    const bytes = try sequence.assemble(a, &values, 4);
    defer a.free(bytes);
    try t.expectEqualSlices(u8, &.{ 1, 0, 2, 0 }, bytes);
}

test "WMF enhanced metafile reassembly cleans up every allocation failure" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
}
