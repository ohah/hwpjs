const std = @import("std");
const record = @import("emf_plus_record.zig");
const stack_index_record = @import("emf_plus_stack_index_record.zig");

pub const BeginContainerNoParams = struct {
    flags: u16,
    stack_index: u32,
};

pub fn parse(value: record.Record) !BeginContainerNoParams {
    const fields = stack_index_record.parse(value, .begin_container_no_params) catch |err| switch (err) {
        error.UnexpectedEmfPlusStackIndexRecordType => return error.NotEmfPlusBeginContainerNoParams,
        error.InvalidEmfPlusStackIndexRecordSize => return error.InvalidEmfPlusBeginContainerNoParamsSize,
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
            .kind = .begin_container_no_params,
            .flags = flags,
            .size = 16,
            .data_size = 4,
            .data = undefined,
            .bytes = &.{},
        },
        .data = data,
    };
}

test "EMF+ BeginContainerNoParams preserves ignored Flags and the full StackIndex domain" {
    for ([_]u32{ 0, 1, 0x01020304, std.math.maxInt(u32) }) |stack_index| {
        var fixture = makeRecord(0xffff, stack_index);
        fixture.value.data = &fixture.data;
        const parsed = try parse(fixture.value);
        try std.testing.expectEqual(@as(u16, 0xffff), parsed.flags);
        try std.testing.expectEqual(stack_index, parsed.stack_index);
    }
}

test "EMF+ BeginContainerNoParams parses the official 3.2.32.10 bytes" {
    const bytes = [_]u8{
        0x28, 0x40, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00,
        0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    };
    var iterator: record.Iterator = .{ .bytes = &bytes };
    const parsed = try parse((try iterator.next()).?);
    try std.testing.expectEqual(@as(u16, 0), parsed.flags);
    try std.testing.expectEqual(@as(u32, 1), parsed.stack_index);
    try std.testing.expect((try iterator.next()) == null);
}

test "EMF+ BeginContainerNoParams rejects type and every size axis" {
    var fixture = makeRecord(0, 0);
    fixture.value.data = &fixture.data;
    var wrong_type = fixture.value;
    wrong_type.kind = .begin_container;
    try std.testing.expectError(error.NotEmfPlusBeginContainerNoParams, parse(wrong_type));
    var wrong_size = fixture.value;
    wrong_size.size = 20;
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerNoParamsSize, parse(wrong_size));
    var wrong_data_size = fixture.value;
    wrong_data_size.data_size = 8;
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerNoParamsSize, parse(wrong_data_size));
    var wrong_slice = fixture.value;
    wrong_slice.data = fixture.data[0..3];
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerNoParamsSize, parse(wrong_slice));
}
