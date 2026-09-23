const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");

const manifest_uri = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";

pub const Options = struct {
    max_xml_bytes: usize = 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_encrypted_entries: usize = 65_535,
};

pub const Report = struct {
    manifest_present: bool,
    xml_bytes: usize,
    encrypted_paths: [][]u8,

    pub fn hasEncryptedPath(self: Report, path: []const u8) bool {
        for (self.encrypted_paths) |entry| {
            if (std.mem.eql(u8, entry, path)) return true;
        }
        return false;
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.encrypted_paths) |entry| a.free(entry);
        a.free(self.encrypted_paths);
        self.* = undefined;
    }
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    encrypted: std.ArrayList([]u8) = .empty,
    current_path: ?[]u8 = null,
    current_encrypted: bool = false,

    fn deinit(self: *Context) void {
        if (self.current_path) |path| self.allocator.free(path);
        for (self.encrypted.items) |path| self.allocator.free(path);
        self.encrypted.deinit(self.allocator);
    }

    fn finishEntry(self: *Context) !void {
        const path = self.current_path orelse return;
        if (self.current_encrypted) {
            if (self.encrypted.items.len == self.options.max_encrypted_entries) return error.LimitExceeded;
            try self.encrypted.append(self.allocator, path);
        } else self.allocator.free(path);
        self.current_path = null;
        self.current_encrypted = false;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 2 and try attrs.element(tag, scope, manifest_uri, "file-entry")) try self.finishEntry();
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, manifest_uri, "manifest")) return error.InvalidEncryptionManifestRoot;
            return;
        }
        if (depth == 2 and try attrs.element(tag, scope, manifest_uri, "file-entry")) {
            const path = (try attrs.attribute(self.allocator, tag, scope, "full-path", self.options.max_attribute_bytes)) orelse return error.MissingEncryptionManifestPath;
            if (path.len == 0) {
                self.allocator.free(path);
                return error.MissingEncryptionManifestPath;
            }
            self.current_path = path;
            self.current_encrypted = false;
            if (tag.kind == .empty) try self.finishEntry();
            return;
        }
        if (try attrs.element(tag, scope, manifest_uri, "encryption-data")) {
            if (depth != 3 or self.current_path == null) return error.OrphanEncryptionData;
            if (self.current_encrypted) return error.DuplicateEncryptionData;
            self.current_encrypted = true;
        }
    }
};

pub fn read(a: std.mem.Allocator, archive: zip.Archive, options: Options) !Report {
    const entry = archive.find("META-INF/manifest.xml") orelse return .{
        .manifest_present = false,
        .xml_bytes = 0,
        .encrypted_paths = try a.alloc([]u8, 0),
    };
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer a.free(bytes);
    var context: Context = .{ .allocator = a, .options = options };
    defer context.deinit();
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = options.max_xml_bytes, .max_characters = options.max_xml_bytes } },
        .max_elements = 200_000,
        .max_events = 400_000,
        .max_depth = 64,
    }, .{ .context = &context, .on_tag = Context.onTag });
    return .{
        .manifest_present = true,
        .xml_bytes = bytes.len,
        .encrypted_paths = try context.encrypted.toOwnedSlice(a),
    };
}
