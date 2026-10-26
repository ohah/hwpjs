//! Explicit experimental new CFB bytes; never a default editor save operation.
const std = @import("std");
const decoded = @import("document_version_draft.zig");
const replacement = @import("../../cfb/stream_replace.zig");
pub const Options = struct {
    draft: decoded.Options,
    allow_unverified_copy: bool = false,
    max_file_bytes: usize = 64 * 1024 * 1024,
};
pub const Result = struct {
    bytes: []u8,
    opaque_section_bytes: usize,
    verification: enum { structural_only } = .structural_only,
    complete_document: bool = false,
    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn prepareExperimental(a: std.mem.Allocator, input: []const u8, options: Options) !Result {
    if (!options.allow_unverified_copy) return error.ExperimentalVersionCopyNotSelected;
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    // Do not preserve signatures/history/security claims across a new version.
    const Flag = @import("../file_header.zig").Flag;
    const allowed = (@as(u32, 1) << @backingInt(Flag.compressed)) | (@as(u32, 1) << @backingInt(Flag.xml_template));
    if (source.header.flags() & ~allowed != 0) return error.UnsupportedVersionCopyFeatures;
    var draft = try decoded.prepare(a, input, options.draft);
    defer draft.deinit(a);
    var header = source.header;
    std.mem.writeInt(u32, header.raw[32..36], draft.docinfo.target_version.raw, .little);
    var replacements: std.ArrayList(replacement.Replacement) = .empty;
    defer replacements.deinit(a);
    var owned: std.ArrayList([]u8) = .empty;
    defer {
        for (owned.items) |bytes| a.free(bytes);
        owned.deinit(a);
    }
    var paths: std.ArrayList([]u8) = .empty;
    defer {
        for (paths.items) |path| a.free(path);
        paths.deinit(a);
    }
    try replacements.append(a, .{ .path = "/FileHeader", .content = &header.raw });
    try appendEncoded(a, &replacements, &owned, "/DocInfo", draft.docinfo.bytes, header.has(.compressed), options.max_file_bytes);
    for (draft.body.sections, 0..) |bytes, index| {
        const path = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{index});
        paths.append(a, path) catch |err| {
            a.free(path);
            return err;
        };
        try appendEncoded(a, &replacements, &owned, path, bytes, header.has(.compressed), options.max_file_bytes);
    }
    const output = try replacement.rebuildManyExact(a, &source.file, replacements.items, .{ .max_output_bytes = options.max_file_bytes });
    errdefer a.free(output);
    var reopened = try @import("../text_source.zig").Source.open(a, output);
    defer reopened.deinit();
    if (reopened.header.version().raw != draft.docinfo.target_version.raw or reopened.section_count != draft.body.sections.len) return error.SourceBindingMismatch;
    const info = try reopened.decodeDocInfo(a, options.draft.max_output_bytes);
    defer a.free(info);
    if (!std.mem.eql(u8, info, draft.docinfo.bytes)) return error.SourceBindingMismatch;
    for (draft.body.sections, 0..) |expected, index| {
        const actual = try reopened.decodeSection(a, index);
        defer a.free(actual);
        if (!std.mem.eql(u8, expected, actual)) return error.SourceBindingMismatch;
    }
    return .{ .bytes = output, .opaque_section_bytes = draft.opaque_section_bytes };
}

fn appendEncoded(a: std.mem.Allocator, replacements: *std.ArrayList(replacement.Replacement), owned: *std.ArrayList([]u8), path: []const u8, bytes: []const u8, compressed: bool, limit: usize) !void {
    const encoded = if (compressed) try @import("../../compression/raw_deflate.zig").encodeStored(a, bytes, limit) else try a.dupe(u8, bytes);
    owned.append(a, encoded) catch |err| {
        a.free(encoded);
        return err;
    };
    try replacements.append(a, .{ .path = path, .content = encoded });
}
