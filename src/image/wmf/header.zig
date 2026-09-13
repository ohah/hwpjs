const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;

pub const SizeLayout = enum { specified, observed_payload_words };
pub const MetafileType = enum(u16) { memory = 1, disk = 2 };
pub const Version = enum(u16) { version_100 = 0x0100, version_300 = 0x0300 };
pub const BoundingBox = struct { left: i16, top: i16, right: i16, bottom: i16 };
pub const Placeable = struct {
    handle: u16,
    bounds: BoundingBox,
    inch: u16,
    checksum: u16,
};
pub const Meta = struct {
    metafile_type: MetafileType,
    version: Version,
    size_words: u32,
    number_of_objects: u16,
    max_record_words: u32,
    number_of_members: u16,
};
pub const Header = struct { placeable: Placeable, meta: Meta, records_offset: usize };

/// Parses the 22-byte placeable extension and following 18-byte META_HEADER.
/// The caller explicitly selects the documented whole-metafile Size rule or
/// the observed Hancom payload-only rule; no length fallback is attempted.
pub fn parse(bytes: []const u8, size_layout: SizeLayout) !Header {
    var reader: Reader = .{ .bytes = bytes };
    const placeable_bytes = try reader.take(22);
    if (std.mem.readInt(u32, placeable_bytes[0..4], .little) != 0x9ac6cdd7)
        return error.InvalidWmfPlaceableKey;
    if (std.mem.readInt(u32, placeable_bytes[16..20], .little) != 0)
        return error.InvalidWmfPlaceableReserved;
    var checksum: u16 = 0;
    for (0..10) |i| checksum ^= std.mem.readInt(u16, placeable_bytes[i * 2 ..][0..2], .little);
    const stored_checksum = std.mem.readInt(u16, placeable_bytes[20..22], .little);
    if (checksum != stored_checksum) return error.InvalidWmfPlaceableChecksum;

    const metafile_type = std.enums.fromInt(MetafileType, try reader.readInt(u16)) orelse return error.UnsupportedWmfMetafileType;
    if (try reader.readInt(u16) != 9) return error.InvalidWmfHeaderSize;
    const version = std.enums.fromInt(Version, try reader.readInt(u16)) orelse return error.UnsupportedWmfVersion;
    const size_words = try reader.readInt(u32);
    const number_of_objects = try reader.readInt(u16);
    const max_record_words = try reader.readInt(u32);
    const number_of_members = try reader.readInt(u16);

    const standard_bytes = bytes.len - 22;
    if (standard_bytes % 2 != 0) return error.InvalidWmfSize;
    const expected_words = switch (size_layout) {
        .specified => standard_bytes / 2,
        .observed_payload_words => (standard_bytes - 18) / 2,
    };
    if (expected_words > std.math.maxInt(u32) or size_words != expected_words)
        return error.InvalidWmfSize;
    if (metafile_type == .disk and std.mem.readInt(u16, placeable_bytes[4..6], .little) != 0)
        return error.InvalidWmfPlaceableHandle;

    return .{
        .placeable = .{
            .handle = std.mem.readInt(u16, placeable_bytes[4..6], .little),
            .bounds = .{
                .left = std.mem.readInt(i16, placeable_bytes[6..8], .little),
                .top = std.mem.readInt(i16, placeable_bytes[8..10], .little),
                .right = std.mem.readInt(i16, placeable_bytes[10..12], .little),
                .bottom = std.mem.readInt(i16, placeable_bytes[12..14], .little),
            },
            .inch = std.mem.readInt(u16, placeable_bytes[14..16], .little),
            .checksum = stored_checksum,
        },
        .meta = .{
            .metafile_type = metafile_type,
            .version = version,
            .size_words = size_words,
            .number_of_objects = number_of_objects,
            .max_record_words = max_record_words,
            .number_of_members = number_of_members,
        },
        .records_offset = reader.offset,
    };
}
