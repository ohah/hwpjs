const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const bin_replace = @import("bin_data_replace.zig");
const ole_replace = @import("../ole/stream_replace.zig");
const StorageLayout = @import("../docinfo/bin_data.zig").StorageLayout;
const paths = @import("paths.zig");

pub const Command = struct {
    ordinal: usize,
    layout: @import("../ole/envelope.zig").Layout,
    replacements: []const cfb.stream_replace.Replacement,
};

pub const Options = struct {
    bin_data: bin_replace.Options = .{},
    ole: ole_replace.Options = .{},
    max_decoded_bin_data_bytes: usize = 256 * 1024 * 1024,
    max_total_decoded_bin_data_bytes: usize = 256 * 1024 * 1024,
    max_total_edited_ole_bytes: usize = 256 * 1024 * 1024,
};

/// Applies inner OLE stream commands to selected BinData records and commits
/// every resulting BinData stream through one outer CFB batch rebuild.
pub fn apply(a: std.mem.Allocator, hwp: []const u8, commands: []const Command, storage_layout: StorageLayout, options: Options) ![]u8 {
    if (commands.len == 0) return error.EmptyOleEditSet;
    if (commands.len > options.bin_data.max_edits) return error.LimitExceeded;
    const ordinals = try a.alloc(usize, commands.len);
    defer a.free(ordinals);
    for (commands, ordinals) |command, *ordinal| ordinal.* = command.ordinal;

    var read_options = options.bin_data.cfb;
    read_options.strict = true;
    var file = try cfb.File.open(a, hwp, read_options);
    defer file.deinit();
    const header_index = try paths.required(&file, "/FileHeader", 2);
    const header = try @import("../file_header.zig").Header.parse(file.entries[header_index].content);
    const doc_info_index = try paths.required(&file, "/DocInfo", 2);
    const doc_info = try @import("../stream.zig").decodeWithPolicy(a, &header, file.entries[doc_info_index].content, options.bin_data.max_doc_info_bytes, options.bin_data.distribution);
    defer a.free(doc_info);
    const items = try a.alloc(@import("../docinfo/bin_data.zig").BinData, commands.len);
    defer a.free(items);
    const resources = try @import("../docinfo/resources.zig").inspectBinDataOrdinals(doc_info, header.version(), options.bin_data.framing, ordinals, items);
    try resources.validateKnownCounts();

    const edited = try a.alloc(?[]u8, commands.len);
    defer a.free(edited);
    @memset(edited, null);
    defer for (edited) |bytes| if (bytes) |owned| a.free(owned);
    const outer_edits = try a.alloc(bin_replace.Edit, commands.len);
    defer a.free(outer_edits);
    var remaining_decoded = options.max_total_decoded_bin_data_bytes;
    var remaining_edited = options.max_total_edited_ole_bytes;
    for (commands, items, edited, outer_edits) |command, item, *result, *outer_edit| {
        const target = (try item.target(storage_layout)) orelse return error.UnsupportedBinDataType;
        const path = try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
        const stream_index = paths.required(&file, path, 2) catch |err| {
            a.free(path);
            return err;
        };
        a.free(path);
        const decoded = try @import("../bin_data_stream.zig").decodeWithPolicy(a, &header, item, file.entries[stream_index].content, @min(options.max_decoded_bin_data_bytes, remaining_decoded), options.bin_data.distribution);
        remaining_decoded -= decoded.len;
        var ole_options = options.ole;
        ole_options.max_output_bytes = @min(ole_options.max_output_bytes, remaining_edited);
        result.* = ole_replace.replaceManyExact(a, decoded, command.layout, command.replacements, ole_options) catch |err| {
            a.free(decoded);
            return err;
        };
        a.free(decoded);
        remaining_edited -= result.*.?.len;
        outer_edit.* = .{ .ordinal = command.ordinal, .decoded = result.*.? };
    }
    return bin_replace.replaceDecodedBatch(a, hwp, outer_edits, storage_layout, options.bin_data);
}
