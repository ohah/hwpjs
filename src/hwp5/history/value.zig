const Reader = @import("../../binary/reader.zig").Reader;
pub const Tag = enum(u8) {
    start = 0x10,
    end = 0x11,
    version = 0x20,
    date = 0x21,
    writer = 0x22,
    description = 0x23,
    diff_data = 0x30,
    last_doc_data = 0x31,
    _,
};
pub const Start = struct { flags: u16, option: u32, extra: []const u8 };
pub const StartLayout = enum { spec_flag_first, observed_option_first };
pub const Value = union(enum) {
    start: Start,
    end,
    version: struct { number: u32, extra: []const u8 },
    date_deferred: []const u8,
    text: []const u8,
    unknown: []const u8,
};
pub fn parse(tag: u8, bytes: []const u8, layout: StartLayout) !Value {
    var r: Reader = .{ .bytes = bytes };
    return switch (@as(Tag, @enumFromInt(tag))) {
        .start => blk: {
            var flags: u16 = undefined;
            var option: u32 = undefined;
            switch (layout) {
                .spec_flag_first => {
                    flags = try r.readInt(u16);
                    option = try r.readInt(u32);
                },
                .observed_option_first => {
                    option = try r.readInt(u32);
                    flags = try r.readInt(u16);
                },
            }
            break :blk .{ .start = .{ .flags = flags, .option = option, .extra = bytes[r.offset..] } };
        },
        .end => if (bytes.len == 0) .end else error.InvalidHistoryEndPayload,
        .version => .{ .version = .{ .number = try r.readInt(u32), .extra = bytes[r.offset..] } },
        // SYSTEMDATE is named but its wire layout is not defined in revision 1.3.
        .date => .{ .date_deferred = bytes },
        .writer, .description, .diff_data, .last_doc_data => if (bytes.len % 2 == 0) .{ .text = bytes } else error.InvalidHistoryTextSize,
        else => .{ .unknown = bytes },
    };
}
/// Only the five presence bits with numeric values explicitly specified by the PDF.
pub fn presenceBit(tag: u8) u16 {
    return switch (@as(Tag, @enumFromInt(tag))) {
        .version => 1,
        .date => 2,
        .writer => 4,
        .description => 8,
        .diff_data => 16,
        else => 0,
    };
}
