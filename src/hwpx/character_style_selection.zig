//! Shared numeric selection partition. Callers validate Unicode and ownership.
pub fn Pieces(comptime T: type) type {
    return struct { items: [3]T = undefined, len: usize = 0 };
}

pub fn split(comptime T: type, source: T, start: usize, end: usize, id: u32) Pieces(T) {
    var result: Pieces(T) = .{};
    const low = @max(source.start_unit, start);
    const high = @min(source.end_unit, end);
    if (low >= high) {
        result.items[0] = source;
        result.len = 1;
        return result;
    }
    if (source.start_unit < low) {
        result.items[result.len] = source;
        result.items[result.len].end_unit = low;
        result.len += 1;
    }
    result.items[result.len] = source;
    result.items[result.len].start_unit = low;
    result.items[result.len].end_unit = high;
    result.items[result.len].char_shape_id = id;
    result.len += 1;
    if (high < source.end_unit) {
        result.items[result.len] = source;
        result.items[result.len].start_unit = high;
        result.len += 1;
    }
    return result;
}

test "HWPX style selection partitions exhaustive boundaries without losing provenance" {
    const std = @import("std");
    const T = struct { start_unit: usize, end_unit: usize, char_shape_id: ?u32, provenance: usize };
    for (0..9) |length| for (0..12) |start| for (start..12) |end| {
        const source: T = .{ .start_unit = 2, .end_unit = 2 + length, .char_shape_id = null, .provenance = 99 };
        const pieces = split(T, source, start, end, 0);
        var cursor: usize = 2;
        for (pieces.items[0..pieces.len]) |piece| {
            try std.testing.expectEqual(cursor, piece.start_unit);
            try std.testing.expectEqual(@as(usize, 99), piece.provenance);
            for (piece.start_unit..piece.end_unit) |unit| try std.testing.expectEqual(@as(?u32, if (unit >= start and unit < end) 0 else null), piece.char_shape_id);
            cursor = piece.end_unit;
        }
        try std.testing.expectEqual(source.end_unit, cursor);
        if (length == 0) try std.testing.expectEqualDeep(source, pieces.items[0]);
    };
}
