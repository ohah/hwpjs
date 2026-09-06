const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Header = @import("../file_header.zig").Header;
const paths = @import("paths.zig");
pub const Report = struct { items: usize = 0, decoded: usize = 0, decoded_bytes: usize = 0, external_links: usize = 0, unsupported_types: usize = 0 };
pub fn inspect(a: std.mem.Allocator, file: *const File, header: *const Header, doc: []const u8, options: @import("../record.zig").Options, used: []bool, remaining: *usize) !Report {
    var it = try @import("../docinfo/reader.zig").Iterator.init(doc, header.version(), options);
    var report: Report = .{};
    while (try it.next()) |record| {
        if (record.value != .bin_data) continue;
        report.items += 1;
        const item = record.value.bin_data;
        const path = switch (item.data) {
            .link => {
                report.external_links += 1;
                continue;
            },
            .unknown => {
                report.unsupported_types += 1;
                continue;
            },
            .embedding => |e| try paths.binary(a, e.id, e.extension_utf16),
            .storage => |id| try paths.binary(a, id, &.{}),
        };
        defer a.free(path);
        const index = try paths.required(file, path, 2);
        const bytes = try @import("../bin_data_stream.zig").decode(a, header, item, file.entries[index].content, remaining.*);
        defer a.free(bytes);
        remaining.* -= bytes.len;
        report.decoded += 1;
        report.decoded_bytes += bytes.len;
        used[index] = true;
    }
    return report;
}
