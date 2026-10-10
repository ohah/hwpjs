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
        return openWithPolicy(a, input, .reject);
    }

    /// Read-only ViewText support never grants editor permission.
    pub fn openReadOnly(a: std.mem.Allocator, input: []const u8) !Source {
        return openWithPolicy(a, input, .observed_viewtext);
    }

    fn openWithPolicy(a: std.mem.Allocator, input: []const u8, policy: @import("feature_policy.zig").Distribution) !Source {
        var file = try openCfb(a, input);
        errdefer file.deinit();
        const header = try Header.parse(try file.readStream(a, "/FileHeader"));
        try @import("feature_policy.zig").requireSupported(&header, policy);
        const info = try stream.decodeWithPolicy(a, &header, try file.readStream(a, "/DocInfo"), max_stream, policy);
        defer a.free(info);
        const count = try sectionCount(info, header.version());
        if (count == 0 or count > max_sections) return error.InvalidSectionCount;
        const body_index = try file.findExact(if (header.has(.distribution)) "/ViewText" else "/BodyText") orelse return error.StreamNotFound;
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
    pub fn decodeDocInfo(self: *const Source, a: std.mem.Allocator, limit: usize) ![]u8 {
        return stream.decodeWithPolicy(a, &self.header, try self.file.readStream(a, "/DocInfo"), limit, if (self.header.has(.distribution)) .observed_viewtext else .reject);
    }

    /// Owned decoded bytes; caller frees them with `a`.
    pub fn decodeSection(self: *const Source, a: std.mem.Allocator, index: usize) ![]u8 {
        if (index >= self.section_count) return error.SectionCountMismatch;
        const path = try std.fmt.allocPrint(a, "/{s}/Section{d}", .{ if (self.header.has(.distribution)) "ViewText" else "BodyText", index });
        defer a.free(path);
        if (self.header.has(.distribution)) return @import("container/view_stream.zig").decodeWithPolicy(a, &self.header, try self.file.readStream(a, path), max_stream, max_stream, .observed_viewtext);
        return stream.decode(a, &self.header, try self.file.readStream(a, path), max_stream);
    }
};

test "HWP5 read only distribution source does not grant editing permission" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "distribution.hwp", "viewtext.hwp" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(max_input));
        defer a.free(bytes);
        try std.testing.expectError(error.UnsupportedDistribution, Source.open(a, bytes));
        var source = try Source.openReadOnly(a, bytes);
        defer source.deinit();
        try std.testing.expect(source.header.has(.distribution));
        for (0..source.section_count) |index| {
            const decoded = try source.decodeSection(a, index);
            defer a.free(decoded);
            var tree = try @import("body/tree.zig").Tree.parseTextPreview(a, decoded, source.header.version(), .{});
            defer tree.deinit(a);
            try std.testing.expect(tree.nodes.len > 0);
        }
    }
}

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
