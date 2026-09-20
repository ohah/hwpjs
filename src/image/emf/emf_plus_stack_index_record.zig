const std = @import("std");
const record = @import("emf_plus_record.zig");
const record_type = @import("emf_plus_record_type.zig");

pub const Fields = struct {
    flags: u16,
    stack_index: u32,
};

pub fn parse(value: record.Record, expected: record_type.RecordType) !Fields {
    if (value.kind != expected) return error.UnexpectedEmfPlusStackIndexRecordType;
    if (value.size != 16 or value.data_size != 4 or value.data.len != 4)
        return error.InvalidEmfPlusStackIndexRecordSize;
    return .{
        .flags = value.flags,
        .stack_index = std.mem.readInt(u32, value.data[0..4], .little),
    };
}
