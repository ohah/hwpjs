const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Header = @import("../file_header.zig").Header;
const paths = @import("paths.zig");
pub const Report = struct { items: usize = 0, decoded: usize = 0, decoded_bytes: usize = 0, external_links: usize = 0, unsupported_types: usize = 0 };
pub fn inspect(a: std.mem.Allocator, file: *const File, header: *const Header, doc: []const u8, options: @import("../record.zig").Options, storage_layout: @import("../docinfo/bin_data.zig").StorageLayout, used: []bool, remaining: *usize) !Report {
    return inspectWithImages(a, file, header, doc, options, storage_layout, used, remaining, null);
}
pub fn inspectWithImages(a: std.mem.Allocator, file: *const File, header: *const Header, doc: []const u8, options: @import("../record.zig").Options, storage_layout: @import("../docinfo/bin_data.zig").StorageLayout, used: []bool, remaining: *usize, images: ?*@import("images.zig").Budget) !Report {
    return inspectWithPolicy(a, file, header, doc, options, storage_layout, used, remaining, images, .reject);
}
pub fn inspectWithPolicy(a: std.mem.Allocator, file: *const File, header: *const Header, doc: []const u8, options: @import("../record.zig").Options, storage_layout: @import("../docinfo/bin_data.zig").StorageLayout, used: []bool, remaining: *usize, images: ?*@import("images.zig").Budget, policy: @import("../feature_policy.zig").Distribution) !Report {
    return inspectSelected(a, file, header, doc, options, storage_layout, used, remaining, images, policy, null);
}
pub fn inspectSelected(a: std.mem.Allocator, file: *const File, header: *const Header, doc: []const u8, options: @import("../record.zig").Options, storage_layout: @import("../docinfo/bin_data.zig").StorageLayout, used: []bool, remaining: *usize, images: ?*@import("images.zig").Budget, policy: @import("../feature_policy.zig").Distribution, ole: ?*@import("ole_binaries.zig").Budget) !Report {
    var it = try @import("../docinfo/reader.zig").Iterator.init(doc, header.version(), options);
    var report: Report = .{};
    while (try it.next()) |record| {
        if (record.value != .bin_data) continue;
        report.items += 1;
        const item = record.value.bin_data;
        var extension: ?[]const u8 = null;
        const path = switch (item.data) {
            .link => {
                report.external_links += 1;
                continue;
            },
            .unknown => {
                report.unsupported_types += 1;
                continue;
            },
            .embedding, .storage => blk: {
                const target = (try item.target(storage_layout)).?;
                extension = target.extension_utf16;
                break :blk try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
            },
        };
        defer a.free(path);
        const index = try paths.required(file, path, 2);
        const bytes = try @import("../bin_data_stream.zig").decodeWithPolicy(a, header, item, file.entries[index].content, remaining.*, policy);
        defer a.free(bytes);
        if (images) |budget| try budget.consume(a, bytes, extension);
        if (ole) |budget| try budget.consume(a, bytes, item.data == .storage, extension);
        remaining.* -= bytes.len;
        report.decoded += 1;
        report.decoded_bytes += bytes.len;
        used[index] = true;
    }
    return report;
}
