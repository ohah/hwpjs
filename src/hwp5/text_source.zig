//! Shared bounded HWP5 file-to-decoded-Section boundary for text consumers.
const std = @import("std");
const Cfb = @import("../cfb/reader.zig").File;
const observed_repairs = @import("../cfb/observed_repairs.zig");
const Header = @import("file_header.zig").Header;
const docinfo = @import("docinfo/reader.zig");
const stream = @import("stream.zig");

const max_input = 64 * 1024 * 1024;
const max_stream = 32 * 1024 * 1024;
const max_sections = 1024;

pub const Source = struct {
    file: Cfb,
    header: Header,
    section_count: u16,

    pub fn open(a: std.mem.Allocator, input: []const u8) !Source {
        var file = try openCfb(a, input);
        errdefer file.deinit();
        const header = try Header.parse(try file.readStream(a, "/FileHeader"));
        try @import("feature_policy.zig").requireSupported(&header, .reject);
        const info = try stream.decode(a, &header, try file.readStream(a, "/DocInfo"), max_stream);
        defer a.free(info);
        const count = try sectionCount(info, header.version());
        if (count == 0 or count > max_sections) return error.InvalidSectionCount;
        const body_index = try file.findExact("/BodyText") orelse return error.StreamNotFound;
        if (file.entries[body_index].kind != 1) return error.NotAStorage;
        var found: usize = 0;
        for (file.entries) |entry| {
            if (entry.parent != body_index or entry.kind != 2) continue;
            const index = (try @import("container/numbered_stream.zig").index(u16, "Section", entry.name)) orelse return error.UnexpectedBodyStream;
            if (index >= count) return error.SectionCountMismatch;
            found += 1;
        }
        if (found != count) return error.SectionCountMismatch;
        return .{ .file = file, .header = header, .section_count = count };
    }

    pub fn deinit(self: *Source) void {
        self.file.deinit();
        self.* = undefined;
    }

    /// Owned decoded bytes; caller frees them with `a`.
    pub fn decodeSection(self: *const Source, a: std.mem.Allocator, index: usize) ![]u8 {
        if (index >= self.section_count) return error.SectionCountMismatch;
        const path = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{index});
        defer a.free(path);
        return stream.decode(a, &self.header, try self.file.readStream(a, path), max_stream);
    }
};

fn openCfb(a: std.mem.Allocator, input: []const u8) !Cfb {
    const limits: @import("../cfb/reader.zig").Options = .{ .strict = true, .max_input_bytes = max_input, .max_stream_bytes = max_stream, .max_total_stream_bytes = max_input };
    return Cfb.open(a, input, limits) catch |strict_err| switch (strict_err) {
        error.InvalidRoot, error.InvalidFat, error.InvalidUnusedEntry, error.UnclaimedMiniSector => {
            const repaired = observed_repairs.open(a, input, limits) catch |repair_err| switch (repair_err) {
                error.OutOfMemory, error.LimitExceeded => return repair_err,
                else => return strict_err,
            };
            return repaired.file;
        },
        else => return strict_err,
    };
}

fn sectionCount(bytes: []const u8, version: @import("version.zig").Version) !u16 {
    try version.requireSupported();
    var it = @import("record.zig").Iterator.init(bytes, .{});
    var count: ?u16 = null;
    while (try it.next()) |record| {
        if (record.tag != @intFromEnum(docinfo.Tag.document_properties)) continue;
        if (count != null) return error.DuplicateDocumentProperties;
        if (record.level != 0) return error.InvalidDocInfoLevel;
        const len = record.payload.len;
        if (len != docinfo.Properties.base_len and len < docinfo.Properties.full_len) return error.InvalidDocumentPropertiesLength;
        count = std.mem.readInt(u16, record.payload[0..2], .little);
    }
    return count orelse error.MissingDocumentProperties;
}
