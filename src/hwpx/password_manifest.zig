//! Package paths/sizes joined with reusable ODF cryptographic parameters.
const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const detection = @import("encryption_manifest.zig");
const crypto = @import("encryption_parameters.zig");
const key = @import("password_key.zig");
pub const Options = struct { manifest: detection.Options = .{}, key_limits: key.Limits = .{}, max_plaintext_bytes: usize = 64 * 1024 * 1024 };
pub const Entry = struct {
    path: []u8,
    plaintext_size: usize,
    parameters: crypto.Parameters,
    fn deinit(self: *Entry, a: std.mem.Allocator) void {
        a.free(self.path);
        self.parameters.deinit(a);
    }
};
pub const Report = struct {
    entries: []Entry,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.entries) |*entry| entry.deinit(a);
        a.free(self.entries);
        self.* = undefined;
    }
};
const Context = struct {
    a: std.mem.Allocator,
    options: Options,
    entries: std.ArrayList(Entry) = .empty,
    path: ?[]u8 = null,
    size_text: ?[]u8 = null,
    size: usize = 0,
    draft: ?crypto.Draft = null,
    parameters: ?crypto.Parameters = null,
    fn clear(self: *Context) void {
        if (self.path) |path| self.a.free(path);
        if (self.size_text) |value| self.a.free(value);
        if (self.draft) |*draft| draft.deinit();
        if (self.parameters) |*parameters| parameters.deinit(self.a);
        self.path = null;
        self.size_text = null;
        self.draft = null;
        self.parameters = null;
    }
    fn deinit(self: *Context) void {
        self.clear();
        for (self.entries.items) |*entry| entry.deinit(self.a);
        self.entries.deinit(self.a);
    }
    fn finishEntry(self: *Context) !void {
        if (self.parameters) |parameters| {
            const path = self.path orelse return error.MissingEncryptionManifestPath;
            if (!zip.validPath(path) or path[path.len - 1] == '/') return error.InvalidEncryptionPath;
            for (self.entries.items) |entry| if (std.mem.eql(u8, entry.path, path)) return error.DuplicateEncryptionPath;
            if (self.entries.items.len >= self.options.manifest.max_encrypted_entries) return error.LimitExceeded;
            try self.entries.append(self.a, .{ .path = path, .plaintext_size = self.size, .parameters = parameters });
            self.path = null;
            self.parameters = null;
        }
        self.clear();
    }
    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        const uri = detection.manifest_uri;
        if (self.draft) |*draft| {
            try draft.accept(tag, scope, depth - 2);
            if (depth == 3 and tag.kind == .end) {
                self.parameters = try draft.finish();
                draft.deinit();
                self.draft = null;
            }
            return;
        }
        if (depth == 2 and try attrs.element(tag, scope, uri, "file-entry")) {
            if (tag.kind == .end) return self.finishEntry();
            self.path = (try attrs.attribute(self.a, tag, scope, "full-path", self.options.manifest.max_attribute_bytes)) orelse return error.MissingEncryptionManifestPath;
            self.size_text = try attrs.attribute(self.a, tag, scope, "size", self.options.manifest.max_attribute_bytes);
            if (tag.kind == .empty) try self.finishEntry();
        } else if (depth == 3 and tag.kind != .end and try attrs.element(tag, scope, uri, "encryption-data")) {
            const size = self.size_text orelse return error.MissingEncryptionSize;
            if (size.len == 0) return error.InvalidEncryptionSize;
            for (size) |digit| if (!std.ascii.isDigit(digit)) return error.InvalidEncryptionSize;
            self.size = std.fmt.parseInt(usize, size, 10) catch return error.InvalidEncryptionSize;
            if (self.size > self.options.max_plaintext_bytes) return error.LimitExceeded;
            self.draft = .{ .allocator = self.a, .limits = self.options.key_limits };
            try self.draft.?.accept(tag, scope, 1);
            if (tag.kind == .empty) self.parameters = try self.draft.?.finish();
        }
    }
};

pub fn readXml(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    // One authority for root, namespaces, orphan/duplicate encryption markers.
    var detected = try detection.readXml(a, bytes, options.manifest);
    defer detected.deinit(a);
    var context: Context = .{ .a = a, .options = options };
    defer context.deinit();
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = options.manifest.max_xml_bytes, .max_characters = options.manifest.max_xml_bytes } },
        .max_elements = 200_000,
        .max_events = 400_000,
        .max_depth = 64,
    }, .{ .context = &context, .on_tag = Context.onTag });
    if (context.entries.items.len != detected.encrypted_paths.len) return error.InvalidEncryptionManifest;
    return .{ .entries = try context.entries.toOwnedSlice(a) };
}

pub fn read(a: std.mem.Allocator, archive: zip.Archive, options: Options) !Report {
    const entry = archive.find("META-INF/manifest.xml") orelse return .{ .entries = try a.alloc(Entry, 0) };
    const bytes = try archive.decode(entry, options.manifest.max_xml_bytes);
    defer archive.allocator.free(bytes);
    var report = try readXml(a, bytes, options);
    errdefer report.deinit(a);
    for (report.entries) |encrypted| {
        if (archive.find(encrypted.path) == null) return error.MissingEncryptedEntry;
    }
    return report;
}

const test_entry = @import("test_password_fixture.zig").entry;
const prefix = @import("test_password_fixture.zig").prefix;
const suffix = @import("test_password_fixture.zig").suffix;
const test_manifest = @import("test_password_fixture.zig").manifest;

test "HWPX password manifest ownership exact paths sizes and all allocation failures" {
    const Probe = struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try readXml(a, test_manifest, .{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), report.entries.len);
            try std.testing.expectEqualStrings("Contents/section0.xml", report.entries[0].path);
            try std.testing.expectEqual(@as(usize, 5), report.entries[0].plaintext_size);
            try std.testing.expectEqual(@as(u32, 1024), report.entries[0].parameters.iterations);
        }
    };
    try Probe.run(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{});
    try std.testing.expectError(error.DuplicateEncryptionPath, readXml(std.testing.allocator, prefix ++ test_entry ++ test_entry ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, readXml(std.testing.allocator, test_manifest, .{ .max_plaintext_bytes = 4 }));
    try std.testing.expectError(error.LimitExceeded, readXml(std.testing.allocator, test_manifest, .{ .manifest = .{ .max_encrypted_entries = 0 } }));
    const Case = struct { from: []const u8, to: []const u8, expected: anyerror };
    for ([_]Case{
        .{ .from = " size=\"5\"", .to = "", .expected = error.MissingEncryptionSize },
        .{ .from = "size=\"5\"", .to = "size=\"-5\"", .expected = error.InvalidEncryptionSize },
        .{ .from = "size=\"5\"", .to = "size=\"18446744073709551616\"", .expected = error.InvalidEncryptionSize },
        .{ .from = "Contents/section0.xml", .to = "../section0.xml", .expected = error.InvalidEncryptionPath },
        .{ .from = "Contents/section0.xml", .to = "Contents/", .expected = error.InvalidEncryptionPath },
    }) |case| {
        const mutated = try std.mem.replaceOwned(u8, std.testing.allocator, test_manifest, case.from, case.to);
        defer std.testing.allocator.free(mutated);
        try std.testing.expectError(case.expected, readXml(std.testing.allocator, mutated, .{}));
    }
    var empty = try readXml(std.testing.allocator, prefix ++ "<m:file-entry full-path=\"/\"/>" ++ suffix, .{});
    defer empty.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 0), empty.entries.len);
}
