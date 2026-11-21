//! Reuse the existing owned BinData checkpoint/save ledger without an OLE carrier.
const std = @import("std");
const store = @import("../chart/created_resources.zig");
pub const Prepared = struct {
    values: store.Values,
    ordinal: u16,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.values.deinit(a);
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, file: *const @import("../../cfb/reader.zig").File, previous: store.Values, docinfo: []const u8, version: @import("../version.zig").Version, request: @import("image_create_request.zig").Request, limit: usize) !Prepared {
    try @import("image_create_request.zig").validate(request);
    const media = try @import("../../image/picture_input.zig").inspectImage(request.image, 8 * 1024 * 1024);
    if (previous.docinfo) |bytes| if (!std.mem.eql(u8, bytes, docinfo)) return error.SourceBindingMismatch;
    if (previous.entries.len >= 128) return error.LimitExceeded;
    var names: std.ArrayList([]const u8) = .empty;
    defer names.deinit(a);
    if (try file.findExact("/BinData")) |parent| for (file.entries) |entry| {
        if (entry.kind != 0 and entry.parent == parent) try names.append(a, entry.name);
    };
    for (previous.entries) |entry| {
        if (!std.mem.startsWith(u8, entry.path, "/BinData/")) return error.InvalidPictureResourcePath;
        try names.append(a, entry.path[9..]);
    }
    var info = try @import("../chart/create_single_docinfo.zig").prepareEmbedding(a, docinfo, version, names.items, media.extension, limit);
    defer info.deinit(a);
    var ext: [6]u8 = undefined;
    for (media.extension, 0..) |value, i| std.mem.writeInt(u16, ext[i * 2 ..][0..2], value, .little);
    const path = try @import("../container/paths.zig").binary(a, info.ids.physical, ext[0 .. media.extension.len * 2]);
    defer a.free(path);
    var entries: std.ArrayList(store.Entry) = .empty;
    defer entries.deinit(a);
    try entries.appendSlice(a, previous.entries);
    try entries.append(a, .{ .ordinal = info.ids.ordinal, .physical = info.ids.physical, .path = path, .bytes = @constCast(request.image) });
    const view: store.Values = .{ .docinfo = info.bytes, .entries = entries.items };
    return .{ .values = try view.clone(a, limit), .ordinal = info.ids.ordinal };
}
