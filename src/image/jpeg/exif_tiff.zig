const std = @import("std");
const tiff = @import("../tiff/structure.zig");
const markers = @import("markers.zig");

pub const Options = struct {
    max_fields: usize = 512,
};

pub const Report = struct {
    byte_order: tiff.ByteOrder,
    fields: usize,
    orientation: ?u8 = null,
    /// Presence only: the pointed-to IFDs and thumbnail are not validated.
    nested_ifds_deferred: bool = false,
    thumbnail_deferred: bool = false,
};

pub fn isExifMarker(marker: markers.Marker) bool {
    return marker.code == 0xe1 and std.mem.startsWith(u8, marker.payload, "Exif\x00\x00");
}

/// Observes only the first marker after SOI; later APP1 markers do not
/// silently replace the primary Exif metadata selection.
pub fn inspectFirst(bytes: []const u8, marker_options: markers.Options, options: Options) !?Report {
    var it = try markers.Iterator.init(bytes, marker_options);
    const soi = (try it.next()) orelse return error.MissingJpegSoi;
    if (soi.code != 0xd8) return error.MissingJpegSoi;
    const first = (try it.next()) orelse return null;
    if (!isExifMarker(first)) return null;
    return try inspect(first.payload, options);
}

/// Reads only the primary-image Orientation tag from a bounded Exif APP1
/// IFD0. Unrelated field values, pointer targets and tag order remain opaque.
/// This is deliberately not an Exif or TIFF document-validity check.
pub fn inspect(payload: []const u8, options: Options) !Report {
    if (!std.mem.startsWith(u8, payload, "Exif\x00\x00")) return error.InvalidExifIdentifier;
    const bytes = payload[6..];
    if (bytes.len < 8) return error.TruncatedTiffHeader;
    const order: tiff.ByteOrder = if (std.mem.eql(u8, bytes[0..2], "II")) .little else if (std.mem.eql(u8, bytes[0..2], "MM")) .big else return error.InvalidTiffByteOrder;
    if (tiff.u16At(bytes[2..4], order) != 42) return error.UnsupportedTiffVersion;
    const offset = tiff.u32At(bytes[4..8], order);
    if (offset < 8 or offset % 2 != 0 or offset > bytes.len or bytes.len - offset < 2) return error.InvalidTiffIfdOffset;
    const count = tiff.u16At(bytes[offset..][0..2], order);
    if (count > options.max_fields) return error.LimitExceeded;
    const directory_bytes = @as(usize, count) * 12 + 6;
    if (directory_bytes > bytes.len - offset) return error.TruncatedTiffIfd;
    var report: Report = .{ .byte_order = order, .fields = count };
    for (0..count) |index| {
        const entry = bytes[@as(usize, offset) + 2 + index * 12 ..][0..12];
        const tag = tiff.u16At(entry[0..2], order);
        if (tag == 274) {
            if (report.orientation != null) return error.DuplicateExifOrientation;
            if (tiff.u16At(entry[2..4], order) != 3 or tiff.u32At(entry[4..8], order) != 1) return error.InvalidExifOrientation;
            const value = tiff.u16At(entry[8..10], order);
            if (value < 1 or value > 8) return error.InvalidExifOrientation;
            report.orientation = @intCast(value);
        } else if (tag == 0x8769 or tag == 0x8825) {
            report.nested_ifds_deferred = true;
        }
    }
    const next_offset = tiff.u32At(bytes[@as(usize, offset) + directory_bytes - 4 ..][0..4], order);
    report.thumbnail_deferred = next_offset != 0;
    return report;
}
