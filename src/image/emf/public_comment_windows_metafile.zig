const std = @import("std");
const wmf_header = @import("../wmf/header.zig");
const wmf_records = @import("../wmf/records.zig");

pub const WindowsMetafile = struct {
    version: wmf_header.Version,
    checksum: u32,
    metafile_size: u32,
    metafile: []const u8,
    header: wmf_header.StandardHeader,
    records: wmf_records.Summary,
    version_matches_header: bool,
};

pub fn parse(body: []const u8) !WindowsMetafile {
    if (body.len < 16) return error.TruncatedEmfPublicWindowsMetafile;
    const version = std.enums.fromInt(wmf_header.Version, std.mem.readInt(u16, body[0..2], .little)) orelse
        return error.UnsupportedEmfPublicWmfVersion;
    if (std.mem.readInt(u16, body[2..4], .little) != 0) return error.InvalidEmfPublicWmfReserved;
    const checksum = std.mem.readInt(u32, body[4..8], .little);
    if (std.mem.readInt(u32, body[8..12], .little) != 0) return error.InvalidEmfPublicWmfFlags;
    const metafile_size = std.mem.readInt(u32, body[12..16], .little);
    if (metafile_size != body.len - 16) return error.InvalidEmfPublicWmfSize;
    const metafile = body[16..];
    const header = try wmf_header.parseStandard(metafile);
    const record_summary = try wmf_records.validate(metafile, header, .{});
    return .{
        .version = version,
        .checksum = checksum,
        .metafile_size = metafile_size,
        .metafile = metafile,
        .header = header,
        .records = record_summary,
        .version_matches_header = version == header.meta.version,
    };
}

fn standardFixture(bytes: []u8, outer_version: wmf_header.Version) void {
    std.mem.writeInt(u16, bytes[0..2], @intFromEnum(outer_version), .little);
    std.mem.writeInt(u32, bytes[4..8], 0x89abcdef, .little);
    std.mem.writeInt(u32, bytes[12..16], @intCast(bytes.len - 16), .little);
    const wmf = bytes[16..];
    std.mem.writeInt(u16, wmf[0..2], @intFromEnum(wmf_header.MetafileType.memory), .little);
    std.mem.writeInt(u16, wmf[2..4], 9, .little);
    std.mem.writeInt(u16, wmf[4..6], @intFromEnum(wmf_header.Version.version_300), .little);
    std.mem.writeInt(u32, wmf[6..10], @intCast(wmf.len / 2), .little);
    std.mem.writeInt(u32, wmf[12..16], 3, .little);
    std.mem.writeInt(u32, wmf[18..22], 3, .little);
}

test "WINDOWS_METAFILE preserves envelope fields and validates standard WMF framing" {
    var bytes = [_]u8{0} ** 40;
    standardFixture(&bytes, .version_100);
    const value = try parse(&bytes);
    try std.testing.expectEqual(wmf_header.Version.version_100, value.version);
    try std.testing.expectEqual(@as(u32, 0x89abcdef), value.checksum);
    try std.testing.expectEqual(@as(u32, 24), value.metafile_size);
    try std.testing.expectEqual(wmf_header.Version.version_300, value.header.meta.version);
    try std.testing.expect(!value.version_matches_header);
    try std.testing.expectEqual(@as(usize, 1), value.records.count);
}

test "WINDOWS_METAFILE rejects all prefix cuts reserved flags size and malformed WMF" {
    var bytes = [_]u8{0} ** 40;
    standardFixture(&bytes, .version_300);
    for (0..16) |cut| try std.testing.expectError(error.TruncatedEmfPublicWindowsMetafile, parse(bytes[0..cut]));
    for (16..40) |cut| try std.testing.expectError(error.InvalidEmfPublicWmfSize, parse(bytes[0..cut]));
    std.mem.writeInt(u16, bytes[0..2], 0x0200, .little);
    try std.testing.expectError(error.UnsupportedEmfPublicWmfVersion, parse(&bytes));
    std.mem.writeInt(u16, bytes[0..2], 0x0300, .little);
    std.mem.writeInt(u16, bytes[2..4], 1, .little);
    try std.testing.expectError(error.InvalidEmfPublicWmfReserved, parse(&bytes));
    std.mem.writeInt(u16, bytes[2..4], 0, .little);
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    try std.testing.expectError(error.InvalidEmfPublicWmfFlags, parse(&bytes));
    std.mem.writeInt(u32, bytes[8..12], 0, .little);
    std.mem.writeInt(u32, bytes[12..16], 23, .little);
    try std.testing.expectError(error.InvalidEmfPublicWmfSize, parse(&bytes));
    std.mem.writeInt(u32, bytes[12..16], 24, .little);
    bytes[16] = 3;
    try std.testing.expectError(error.UnsupportedWmfMetafileType, parse(&bytes));

    standardFixture(&bytes, .version_300);
    std.mem.writeInt(u16, bytes[18..20], 8, .little);
    try std.testing.expectError(error.InvalidWmfHeaderSize, parse(&bytes));
    standardFixture(&bytes, .version_300);
    std.mem.writeInt(u32, bytes[22..26], 11, .little);
    try std.testing.expectError(error.InvalidWmfSize, parse(&bytes));
    standardFixture(&bytes, .version_300);
    std.mem.writeInt(u32, bytes[28..32], 4, .little);
    try std.testing.expectError(error.InvalidWmfMaxRecord, parse(&bytes));
    standardFixture(&bytes, .version_300);
    std.mem.writeInt(u32, bytes[34..38], 2, .little);
    try std.testing.expectError(error.InvalidWmfRecordSize, parse(&bytes));
}
