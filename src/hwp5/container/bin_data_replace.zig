const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const Header = @import("../file_header.zig").Header;
const BinData = @import("../docinfo/bin_data.zig").BinData;
const StorageLayout = @import("../docinfo/bin_data.zig").StorageLayout;
const Distribution = @import("../feature_policy.zig").Distribution;
const paths = @import("paths.zig");

pub const Options = struct {
    cfb: cfb.Options = .{},
    max_encoded_bytes: usize = 256 * 1024 * 1024,
    max_output_bytes: usize = 256 * 1024 * 1024,
    distribution: Distribution = .reject,
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

    const encoded = try @import("../bin_data_stream.zig").encodeWithPolicy(a, &header, item, decoded, options.max_encoded_bytes, options.distribution);
    defer a.free(encoded);
    const target = (try item.target(storage_layout)) orelse return error.UnsupportedBinDataType;
    const path = try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
    defer a.free(path);
    _ = try paths.required(&file, path, 2);
    return cfb.stream_replace.rebuildExact(a, &file, path, encoded, .{ .limits = options.cfb, .max_output_bytes = options.max_output_bytes });
}
