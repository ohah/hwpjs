const std = @import("std");
const record = @import("emf_plus_record.zig");
const stack_index_record = @import("emf_plus_stack_index_record.zig");

pub const Restore = struct {
    flags: u16,
    stack_index: u32,
};

pub fn parse(value: record.Record) !Restore {
    const fields = stack_index_record.parse(value, .restore) catch |err| switch (err) {
        error.UnexpectedEmfPlusStackIndexRecordType => return error.NotEmfPlusRestore,
        error.InvalidEmfPlusStackIndexRecordSize => return error.InvalidEmfPlusRestoreSize,
    };
    return .{
        .flags = fields.flags,
        .stack_index = fields.stack_index,
    };
}

fn makeRecord(flags: u16, stack_index: u32) struct { value: record.Record, data: [4]u8 } {
    var data: [4]u8 = undefined;
    std.mem.writeInt(u32, &data, stack_index, .little);
    return .{
        .value = .{
            .offset = 0,
            .kind = .restore,
            .flags = flags,
            .size = 16,
            .data_size = 4,
            .data = undefined,
            .bytes = &.{},
        },
        .data = data,
    };
}

fn parseFixture(flags: u16, stack_index: u32) !Restore {
    var fixture = makeRecord(flags, stack_index);
    fixture.value.data = &fixture.data;
    return parse(fixture.value);
}

test "EMF+ Restore preserves ignored Flags and the full little-endian StackIndex domain" {
    for ([_]u32{ 0, 1, 0x01020304, std.math.maxInt(u32) }) |stack_index| {
        const parsed = try parseFixture(0xffff, stack_index);
        try std.testing.expectEqual(@as(u16, 0xffff), parsed.flags);
        try std.testing.expectEqual(stack_index, parsed.stack_index);
    }
    try std.testing.expectEqual(@as(u32, 0), (try parseFixture(0, 0)).stack_index);
}

test "EMF+ Restore rejects type and every size axis" {
    var fixture = makeRecord(0, 0);
    fixture.value.data = &fixture.data;
    var wrong_size = fixture.value;
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusRestoreSize, parse(wrong_size));
    var wrong_data_size = fixture.value;
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusRestoreSize, parse(wrong_data_size));
    var wrong_slice = fixture.value;
    wrong_slice.data = fixture.data[0..3];
    try std.testing.expectError(error.InvalidEmfPlusRestoreSize, parse(wrong_slice));
    var wrong_type = fixture.value;
    wrong_type.kind = .save;
    try std.testing.expectError(error.NotEmfPlusRestore, parse(wrong_type));
}
