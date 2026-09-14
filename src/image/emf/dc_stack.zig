const std = @import("std");
const records = @import("records.zig");

pub const Action = union(enum) {
    save,
    restore: i32,
};

pub const State = struct {
    depth: usize = 0,

    pub fn consume(self: *State, record: records.Record) !?Action {
        const action = (try parse(record)) orelse return null;
        switch (action) {
            .save => self.depth = std.math.add(usize, self.depth, 1) catch return error.EmfDcStackOverflow,
            .restore => |saved_dc| {
                const distance: usize = @intCast(-@as(i64, saved_dc));
                if (distance > self.depth) return error.InvalidEmfRestoreDcDepth;
                self.depth -= distance;
            },
        }
        return action;
    }
};

pub fn parse(record: records.Record) !?Action {
    switch (record.kind) {
        .savedc => {
            if (record.size != 8 or record.bytes.len != 8) return error.InvalidEmfSaveDcRecordSize;
            return .save;
        },
        .restoredc => {
            if (record.size != 12 or record.bytes.len != 12) return error.InvalidEmfRestoreDcRecordSize;
            const saved_dc = std.mem.readInt(i32, record.bytes[8..12], .little);
            if (saved_dc >= 0) return error.InvalidEmfRestoreDcIndex;
            return .{ .restore = saved_dc };
        },
        else => return null,
    }
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn restoreFixture(saved_dc: i32) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(i32, bytes[8..12], saved_dc, .little);
    return bytes;
}

test "save and restore records preserve their distinct wire forms" {
    const save_bytes = [_]u8{0} ** 8;
    try std.testing.expectEqual(Action.save, (try parse(fixture(.savedc, &save_bytes))).?);
    for ([_]i32{ -1, -2, std.math.minInt(i32) }) |saved_dc| {
        const action = (try parse(fixture(.restoredc, &restoreFixture(saved_dc)))).?;
        try std.testing.expectEqual(saved_dc, action.restore);
    }
}

test "save and restore require exact record sizes" {
    const save_long = [_]u8{0} ** 12;
    try std.testing.expectError(error.InvalidEmfSaveDcRecordSize, parse(fixture(.savedc, &save_long)));
    const restore_short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfRestoreDcRecordSize, parse(fixture(.restoredc, &restore_short)));
    var declared_twelve = fixture(.restoredc, &restore_short);
    declared_twelve.size = 12;
    try std.testing.expectError(error.InvalidEmfRestoreDcRecordSize, parse(declared_twelve));
    const restore_long = [_]u8{0} ** 16;
    try std.testing.expectError(error.InvalidEmfRestoreDcRecordSize, parse(fixture(.restoredc, &restore_long)));
}

test "restore index must be negative" {
    for ([_]i32{ 0, 1, std.math.maxInt(i32) }) |saved_dc| {
        const bytes = restoreFixture(saved_dc);
        try std.testing.expectError(error.InvalidEmfRestoreDcIndex, parse(fixture(.restoredc, &bytes)));
    }
}

test "DC stack restores relative states and discards newer saves" {
    const save_bytes = [_]u8{0} ** 8;
    var state: State = .{};
    _ = try state.consume(fixture(.savedc, &save_bytes));
    _ = try state.consume(fixture(.savedc, &save_bytes));
    _ = try state.consume(fixture(.savedc, &save_bytes));
    try std.testing.expectEqual(@as(usize, 3), state.depth);

    _ = try state.consume(fixture(.restoredc, &restoreFixture(-2)));
    try std.testing.expectEqual(@as(usize, 1), state.depth);
    try std.testing.expectError(error.InvalidEmfRestoreDcDepth, state.consume(fixture(.restoredc, &restoreFixture(-2))));
    _ = try state.consume(fixture(.restoredc, &restoreFixture(-1)));
    try std.testing.expectEqual(@as(usize, 0), state.depth);
    try std.testing.expectError(error.InvalidEmfRestoreDcDepth, state.consume(fixture(.restoredc, &restoreFixture(std.math.minInt(i32)))));
}

test "DC stack does not claim unrelated records" {
    const bytes = [_]u8{0} ** 8;
    var state: State = .{};
    try std.testing.expect((try state.consume(fixture(.realizepalette, &bytes))) == null);
    try std.testing.expectEqual(@as(usize, 0), state.depth);
}
