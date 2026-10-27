//! One bounded locator for the declared count; preserves every other byte.
const std = @import("std");
const docinfo = @import("reader.zig");
pub const Site = struct { value: u16, payload_offset: usize };

pub fn locate(bytes: []const u8, version: @import("../version.zig").Version) !Site {
    try version.requireSupported();
    var records = @import("../record.zig").Iterator.init(bytes, .{});
    var result: ?Site = null;
    while (try records.next()) |record| {
        if (record.tag != @backingInt(docinfo.Tag.document_properties)) continue;
        if (result != null) return error.DuplicateDocumentProperties;
        if (record.level != 0) return error.InvalidDocInfoLevel;
        const len = record.payload.len;
        if (len != docinfo.Properties.base_len and len < docinfo.Properties.full_len) return error.InvalidDocumentPropertiesLength;
        result = .{
            .value = std.mem.readInt(u16, record.payload[0..2], .little),
            .payload_offset = record.offset + record.raw.len - record.payload.len,
        };
    }
    return result orelse error.MissingDocumentProperties;
}
