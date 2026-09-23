const std = @import("std");
const zip = @import("../zip/archive.zig");
const container = @import("container_manifest.zig");
const content_manifest = @import("content_manifest.zig");
const version_xml = @import("version_xml.zig");
const encryption_manifest = @import("encryption_manifest.zig");
const document_structure = @import("document_structure.zig");

pub const Archive = zip.Archive;
pub const Options = zip.Options;
pub const mime = "application/hwp+zip";
pub const Version = version_xml.Version;
pub const VersionOptions = struct { max_xml_bytes: usize = 1024 * 1024, max_attribute_bytes: usize = 4096 };
pub const ProtectionOptions = encryption_manifest.Options;
pub const ProtectionReport = encryption_manifest.Report;
pub const StructureOptions = document_structure.Options;
pub const StructureReport = document_structure.Report;
pub const DocumentOptions = struct {
    // The archive index also contains large BinData/section entries. Their
    // declared sizes are bounded here; this call only decodes the two small
    // package XML members under the separate limits below.
    zip: zip.Options = .{ .max_entry_bytes = 512 * 1024 * 1024 },
    max_container_xml_bytes: usize = 1024 * 1024,
    max_total_xml_bytes: usize = 2 * 1024 * 1024,
    manifest: content_manifest.Options = .{},
};

pub const Document = struct {
    archive: Archive,
    container: container.Root,
    manifest: content_manifest.Manifest,
    decoded_xml_bytes: usize,

    /// Separately validates version.xml; package relationship inspection does
    /// not imply a compatible or even parseable document version.
    pub fn inspectVersion(self: *const Document, a: std.mem.Allocator, options: VersionOptions) !Version {
        return version_xml.read(a, self.archive, options.max_xml_bytes, options.max_attribute_bytes);
    }

    /// Reports ODF manifest encryption metadata without decrypting any entry.
    pub fn inspectProtection(self: *const Document, a: std.mem.Allocator, options: ProtectionOptions) !ProtectionReport {
        return encryption_manifest.read(a, self.archive, options);
    }

    /// Reads bounded header/spine XML and preserves section ordering and
    /// count disagreement; encrypted entries are explicitly unsupported.
    pub fn inspectStructure(self: *const Document, a: std.mem.Allocator, options: StructureOptions) !StructureReport {
        return document_structure.inspect(a, self.archive, self.manifest, options);
    }

    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        self.manifest.deinit(a);
        self.container.deinit(a);
        self.archive.deinit();
        self.* = undefined;
    }
};

/// Owns only the entry index. The input archive bytes must outlive this view.
pub fn open(allocator: std.mem.Allocator, bytes: []const u8, options: Options) !Archive {
    var archive = try zip.open(allocator, bytes, options);
    errdefer archive.deinit();
    const mime_entry = archive.find("mimetype") orelse return error.MissingMimeType;
    const content = try archive.decode(mime_entry, mime.len);
    defer allocator.free(content);
    if (!std.mem.eql(u8, content, mime)) return error.InvalidMimeType;
    return archive;
}

/// Validates the OCF package root, OPF item references, and ZIP presence of
/// embedded resources. Section XML semantics remain a later document layer.
pub fn inspectDocument(a: std.mem.Allocator, bytes: []const u8, options: DocumentOptions) !Document {
    var archive = try open(a, bytes, options.zip);
    errdefer archive.deinit();
    var root = try container.read(a, archive, @min(options.max_container_xml_bytes, options.max_total_xml_bytes), options.manifest.max_attribute_bytes);
    errdefer root.deinit(a);
    var manifest_options = options.manifest;
    manifest_options.max_xml_bytes = @min(manifest_options.max_xml_bytes, options.max_total_xml_bytes - root.xml_bytes);
    var manifest = try content_manifest.read(a, archive, root.path, manifest_options);
    errdefer manifest.deinit(a);
    return .{ .archive = archive, .container = root, .manifest = manifest, .decoded_xml_bytes = root.xml_bytes + manifest.xml_bytes };
}
