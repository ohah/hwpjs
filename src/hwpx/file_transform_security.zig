//! 독립 파일 변환의 공통 암호화·서명·보안 메타데이터 거부 정책이다.
const std = @import("std");
const Document = @import("package.zig").Document;
const Tree = @import("xml_part_tree.zig").Tree;
const document_xml = @import("document_xml.zig");
const signature_uri = "http://www.w3.org/2000/09/xmldsig#";

const Gate = struct {
    allocator: std.mem.Allocator,
    package_path: []const u8,
    fn tag(raw: *anyopaque, value: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, _: usize) anyerror!void {
        const self: *Gate = @ptrCast(@alignCast(raw));
        const name = try scope.expandElement(value.name);
        if (std.mem.eql(u8, name.uri, signature_uri)) return error.SignedDocument;
        const attrs = @import("xml_attributes.zig");
        if (value.kind == .end or !try attrs.element(value, scope, "urn:oasis:names:tc:opendocument:xmlns:container", "rootfile")) return;
        const path = (try attrs.attribute(self.allocator, value, scope, "full-path", 4096)) orelse return error.MissingRootPath;
        defer self.allocator.free(path);
        const media = (try attrs.attribute(self.allocator, value, scope, "media-type", 4096)) orelse return error.MissingRootMediaType;
        defer self.allocator.free(media);
        if ((std.mem.eql(u8, path, self.package_path) and std.mem.eql(u8, media, "application/hwpml-package+xml")) or
            (std.mem.eql(u8, path, "Preview/PrvText.txt") and std.mem.eql(u8, media, "text/plain")) or
            (std.mem.eql(u8, path, "META-INF/container.rdf") and std.mem.eql(u8, media, "application/rdf+xml"))) return;
        return error.UnsupportedPicturePackageRoot;
    }
};

fn validateXml(a: std.mem.Allocator, document: *const Document, entry: @import("../zip/archive.zig").Entry, limit: usize) !void {
    const bytes = try document.archive.decode(entry, limit);
    defer a.free(bytes);
    var gate: Gate = .{ .allocator = a, .package_path = document.container.path };
    _ = try document_xml.visitBytes(a, bytes, limit, .{}, .{ .context = &gate, .on_tag = Gate.tag });
}

/// 기존 이미지 파일 변환의 보안 프로필을 한 곳으로 옮겼다.
/// section/header의 이미 파싱된 트리는 validateTree로 함께 검사한다.
pub fn validate(a: std.mem.Allocator, document: *const Document, limit: usize) !void {
    var protection = try document.inspectProtection(a, .{});
    defer protection.deinit(a);
    if (protection.encrypted_paths.len != 0) return error.EncryptedDocument;
    for (document.archive.entries) |entry| {
        if (entry.name.len < 9 or !std.ascii.eqlIgnoreCase(entry.name[0..9], "META-INF/")) continue;
        if (!std.mem.eql(u8, entry.name, "META-INF/container.xml") and !std.mem.eql(u8, entry.name, "META-INF/manifest.xml") and !std.mem.eql(u8, entry.name, "META-INF/container.rdf")) return error.UnsupportedPictureSecurityMetadata;
        try validateXml(a, document, entry, limit);
    }
    const entry = document.archive.find(document.container.path) orelse return error.MissingContentManifest;
    try validateXml(a, document, entry, limit);
}

pub fn validateTree(tree: *const Tree) !void {
    for (tree.elements) |element| if (std.mem.eql(u8, element.name.uri, signature_uri)) return error.SignedDocument;
}
