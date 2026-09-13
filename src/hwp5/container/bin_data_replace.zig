const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const Header = @import("../file_header.zig").Header;
const BinData = @import("../docinfo/bin_data.zig").BinData;
const StorageLayout = @import("../docinfo/bin_data.zig").StorageLayout;
const Distribution = @import("../feature_policy.zig").Distribution;
const paths = @import("paths.zig");

pub const Options = struct {
    cfb: cfb.Options = .{},
    framing: @import("../record.zig").Options = .{},
    max_doc_info_bytes: usize = 256 * 1024 * 1024,
    max_edits: usize = 4096,
    max_encoded_bytes: usize = 256 * 1024 * 1024,
    max_total_encoded_bytes: usize = 256 * 1024 * 1024,
    max_output_bytes: usize = 256 * 1024 * 1024,
    distribution: Distribution = .reject,
};

pub const Edit = struct {
    ordinal: usize,
    decoded: []const u8,
};

/// Rebuilds an HWP CFB after replacing one embedded/storage BinData stream
/// with decoded bytes. FileHeader is read from this same CFB and determines the
/// existing item compression policy; DocInfo mutation is outside this API.
pub fn replaceDecoded(a: std.mem.Allocator, hwp: []const u8, item: BinData, storage_layout: StorageLayout, decoded: []const u8, options: Options) ![]u8 {
    var read_options = options.cfb;
    read_options.strict = true;
    var file = try cfb.File.open(a, hwp, read_options);
    defer file.deinit();
    const header_index = try paths.required(&file, "/FileHeader", 2);
    const header = try Header.parse(file.entries[header_index].content);

    return replaceOpened(a, &file, &header, item, storage_layout, decoded, options);
}

/// Resolves the one-based BinData ordinal from the actual DocInfo stream in
/// this HWP, then replaces only that record's exact physical stream.
pub fn replaceDecodedAt(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, decoded: []const u8, options: Options) ![]u8 {
    return replaceDecodedBatch(a, hwp, &.{.{ .ordinal = ordinal, .decoded = decoded }}, storage_layout, options);
}

/// Resolves and validates all strictly increasing DocInfo ordinals in one
/// traversal, prepares every stream, then rebuilds the outer CFB exactly once.
pub fn replaceDecodedBatch(a: std.mem.Allocator, hwp: []const u8, edits: []const Edit, storage_layout: StorageLayout, options: Options) ![]u8 {
    if (edits.len == 0) return error.EmptyBinDataEditSet;
    if (edits.len > options.max_edits) return error.LimitExceeded;
    const ordinals = try a.alloc(usize, edits.len);
    defer a.free(ordinals);
    for (edits, ordinals) |edit, *ordinal| ordinal.* = edit.ordinal;
    const items = try a.alloc(BinData, edits.len);
    defer a.free(items);

    var read_options = options.cfb;
    read_options.strict = true;
    var file = try cfb.File.open(a, hwp, read_options);
    defer file.deinit();
    const header_index = try paths.required(&file, "/FileHeader", 2);
    const header = try Header.parse(file.entries[header_index].content);
    const doc_info_index = try paths.required(&file, "/DocInfo", 2);
    const doc_info = try @import("../stream.zig").decodeWithPolicy(a, &header, file.entries[doc_info_index].content, options.max_doc_info_bytes, options.distribution);
    defer a.free(doc_info);
    const resources = try @import("../docinfo/resources.zig").inspectBinDataOrdinals(doc_info, header.version(), options.framing, ordinals, items);
    try resources.validateKnownCounts();

    const Prepared = struct { encoded: ?[]u8 = null, path: ?[]u8 = null };
    const prepared = try a.alloc(Prepared, edits.len);
    defer a.free(prepared);
    @memset(prepared, .{});
    defer for (prepared) |owned| {
        if (owned.path) |path| a.free(path);
        if (owned.encoded) |encoded| a.free(encoded);
    };
    const replacements = try a.alloc(cfb.stream_replace.Replacement, edits.len);
    defer a.free(replacements);
    var remaining_encoded = options.max_total_encoded_bytes;
    for (edits, items, prepared, replacements) |edit, item, *owned, *replacement| {
        owned.encoded = try @import("../bin_data_stream.zig").encodeWithPolicy(a, &header, item, edit.decoded, @min(options.max_encoded_bytes, remaining_encoded), options.distribution);
        remaining_encoded -= owned.encoded.?.len;
        const target = (try item.target(storage_layout)) orelse return error.UnsupportedBinDataType;
        owned.path = try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
        _ = try paths.required(&file, owned.path.?, 2);
        replacement.* = .{ .path = owned.path.?, .content = owned.encoded.? };
    }
    return cfb.stream_replace.rebuildManyExact(a, &file, replacements, .{ .limits = options.cfb, .max_output_bytes = options.max_output_bytes });
}

fn replaceOpened(a: std.mem.Allocator, file: *const cfb.File, header: *const Header, item: BinData, storage_layout: StorageLayout, decoded: []const u8, options: Options) ![]u8 {
    const encoded = try @import("../bin_data_stream.zig").encodeWithPolicy(a, header, item, decoded, options.max_encoded_bytes, options.distribution);
    defer a.free(encoded);
    const target = (try item.target(storage_layout)) orelse return error.UnsupportedBinDataType;
    const path = try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
    defer a.free(path);
    _ = try paths.required(file, path, 2);
    return cfb.stream_replace.rebuildExact(a, file, path, encoded, .{ .limits = options.cfb, .max_output_bytes = options.max_output_bytes });
}
