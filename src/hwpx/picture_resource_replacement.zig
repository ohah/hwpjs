//! 선택한 그림만 새 내장 리소스로 연결하는 메모리 기반 후보 생성기입니다.
//! 이미지 픽셀 디코딩이나 조판 변경은 하지 않습니다.
const std = @import("std");
const package = @import("package.zig");
const xml_writer = @import("xml_source_writer.zig");
const zip_writer = @import("../zip/store_writer.zig");
const binary = @import("binary_reference_links.zig");
const opf_uri = "http://www.idpf.org/2007/opf/";

pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_image_bytes: usize = 8 * 1024 * 1024,
    max_xml_bytes: usize = 16 * 1024 * 1024,
    max_entry_bytes: usize = 32 * 1024 * 1024,
    max_total_decoded_bytes: usize = 96 * 1024 * 1024,
    max_output_bytes: usize = 64 * 1024 * 1024,
};
pub const Result = struct {
    bytes: []u8,
    resource_id: []u8,
    resource_path: []u8,
    media_type: []const u8,
    pub fn deinit(self: *Result, a: std.mem.Allocator) void {
        a.free(self.bytes);
        a.free(self.resource_id);
        a.free(self.resource_path);
        self.* = undefined;
    }
};
pub const Media = @import("../image/picture_input.zig").Media;

pub fn inspectImage(bytes: []const u8, max_bytes: usize) !Media {
    return @import("../image/picture_input.zig").inspectImage(bytes, max_bytes);
}

fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: []const u8) !bool {
    const text = try raw.toUtf8(a, 4096);
    defer a.free(text);
    return std.mem.eql(u8, text, value);
}
fn serialize(a: std.mem.Allocator, quote: u8, value: []const u8) ![]u8 {
    // 새 ID는 고정 ASCII 접두사와 십진수만으로 생성됩니다.
    return std.fmt.allocPrint(a, "{c}{s}{c}", .{ quote, value, quote });
}

/// 입력은 빌린 읽기 전용 바이트입니다. 모든 검사·할당이 끝난 새 ZIP만 반환합니다.
/// 항상 새 리소스를 만들므로 다른 그림·브러시·미지 참조의 공유 여부를 추측하지 않습니다.
pub fn prepare(a: std.mem.Allocator, input: []const u8, section: usize, picture: usize, replacement: []const u8, options: Options) !Result {
    if (input.len > @min(options.max_input_bytes, 64 * 1024 * 1024)) return error.LimitExceeded;
    const media = try inspectImage(replacement, options.max_image_bytes);
    var document = try package.inspectDocument(a, input, .{ .zip = .{ .max_entry_bytes = options.max_entry_bytes } });
    defer document.deinit(a);
    // 서명 검증기는 없습니다. 알 수 없는 보안 메타데이터나 추가 root를 보존한 채 수정하지 않습니다.
    for (document.archive.entries) |entry| {
        if (entry.name.len >= 9 and std.ascii.eqlIgnoreCase(entry.name[0..9], "META-INF/") and
            !std.mem.eql(u8, entry.name, "META-INF/container.xml") and
            !std.mem.eql(u8, entry.name, "META-INF/manifest.xml") and
            !std.mem.eql(u8, entry.name, "META-INF/container.rdf")) return error.UnsupportedPictureSecurityMetadata;
        if (std.mem.eql(u8, entry.name, "META-INF/container.xml") or
            std.mem.eql(u8, entry.name, "META-INF/manifest.xml") or
            std.mem.eql(u8, entry.name, "META-INF/container.rdf") or
            std.mem.eql(u8, entry.name, document.container.path))
        {
            const bytes = try document.archive.decode(entry, options.max_xml_bytes);
            defer a.free(bytes);
            var gate: SecurityGate = .{ .allocator = a, .package_path = document.container.path };
            _ = try @import("document_xml.zig").visitBytes(a, bytes, options.max_xml_bytes, .{}, .{ .context = &gate, .on_tag = SecurityGate.onTag });
        }
    }
    var protection = try document.inspectProtection(a, .{});
    defer protection.deinit(a);
    if (protection.encrypted_paths.len != 0) return error.EncryptedDocument;
    var tree = try document.readSectionTree(a, section, .{ .tree = .{ .max_xml_bytes = options.max_xml_bytes } });
    defer tree.deinit(a);
    _ = try @import("picture_display_host.zig").sourceTemplate(&tree, picture);
    var selected: ?usize = null;
    var child = tree.elements[picture].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(@import("document_xml.zig").core_uri, "img")) continue;
        if (selected != null) return error.AmbiguousPictureImage;
        selected = node;
    }
    const image_node = selected orelse return error.MissingPictureImage;
    const raw_id = (try tree.attributeValue(a, image_node, "", "binaryItemIDRef")) orelse return error.MissingPictureImage;
    const old_id = try raw_id.toUtf8(a, 4096);
    defer a.free(old_id);
    var index = try binary.Index.init(a, document.manifest);
    defer index.deinit(a);
    const target = binary.resolve(&index, document.manifest, old_id);
    switch (target.state) {
        .embedded => {},
        .external => return error.ExternalPictureImage,
        else => return error.MissingPictureImage,
    }
    var names: std.StringHashMapUnmanaged(void) = .empty;
    defer names.deinit(a);
    for (document.archive.entries) |entry| try names.put(a, entry.name, {});
    var counter: usize = 0;
    var id: []u8 = undefined;
    var path: []u8 = undefined;
    while (true) : (counter += 1) {
        id = try std.fmt.allocPrint(a, "hwpjs-replacement-{d}", .{counter});
        path = std.fmt.allocPrint(a, "BinData/{s}.{s}", .{ id, media.extension }) catch |err| {
            a.free(id);
            return err;
        };
        if (!index.by_id.contains(id) and !names.contains(path)) break;
        a.free(id);
        a.free(path);
    }
    errdefer a.free(id);
    errdefer a.free(path);
    const tag = try @import("xml_bound_attributes_write.zig").write(a, &tree, image_node, &.{"binaryItemIDRef"}, []const u8, .{id}, equal, serialize, options.max_xml_bytes);
    defer a.free(tag);
    const span = tree.elements[image_node].start_tag;
    const section_xml = try xml_writer.write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .start_tag = tag }}, options.max_xml_bytes);
    defer a.free(section_xml);
    const opf_entry = document.archive.find(document.container.path) orelse return error.MissingContentManifest;
    const opf = try document.archive.decode(opf_entry, options.max_xml_bytes);
    defer a.free(opf);
    var locator: ManifestLocator = .{ .source = opf };
    _ = try @import("document_xml.zig").visitBytes(a, opf, options.max_xml_bytes, .{}, .{ .context = &locator, .on_tag = ManifestLocator.onTag });
    const at = locator.at orelse return error.MissingContentManifest;
    const item = try std.fmt.allocPrint(a, "<item xmlns=\"{s}\" id=\"{s}\" href=\"{s}\" media-type=\"{s}\" isEmbeded=\"1\"/>", .{ opf_uri, id, path, media.mime });
    defer a.free(item);
    const new_opf = try xml_writer.write(a, opf, &.{.{ .start = at, .end = at, .text = "", .serialized_xml = item }}, options.max_xml_bytes);
    defer a.free(new_opf);
    var sources: std.ArrayList(zip_writer.Source) = .empty;
    defer sources.deinit(a);
    var decoded: std.ArrayList([]u8) = .empty;
    defer {
        for (decoded.items) |bytes| a.free(bytes);
        decoded.deinit(a);
    }
    var total: usize = replacement.len;
    if (total > options.max_total_decoded_bytes) return error.LimitExceeded;
    const section_path = document.manifest.items[tree.item_index].href;
    for (document.archive.entries) |entry| {
        const bytes = if (std.mem.eql(u8, entry.name, section_path)) section_xml else if (std.mem.eql(u8, entry.name, document.container.path)) new_opf else blk: {
            const data = try document.archive.decode(entry, @min(options.max_entry_bytes, options.max_total_decoded_bytes -| total));
            decoded.append(a, data) catch |err| {
                a.free(data);
                return err;
            };
            break :blk data;
        };
        if (bytes.len > options.max_total_decoded_bytes -| total) return error.LimitExceeded;
        total += bytes.len;
        try sources.append(a, .{ .name = entry.name, .bytes = bytes });
    }
    try sources.append(a, .{ .name = path, .bytes = replacement });
    const output = try zip_writer.write(a, sources.items, .{ .max_output_bytes = @min(options.max_output_bytes, 64 * 1024 * 1024) });
    errdefer a.free(output);
    var checked = try package.inspectDocument(a, output, .{ .zip = .{ .max_entry_bytes = options.max_entry_bytes } });
    defer checked.deinit(a);
    if (checked.manifest.items.len != document.manifest.items.len + 1) return error.ReplacementManifestMismatch;
    return .{ .bytes = output, .resource_id = id, .resource_path = path, .media_type = media.mime };
}

// OPF를 header/section 트리로 위장하지 않고 공통 XML 방문자로 삽입 위치를 찾습니다.
const ManifestLocator = struct {
    source: []const u8,
    at: ?usize = null,
    fn onTag(raw: *anyopaque, tag: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, depth: usize) anyerror!void {
        const self: *ManifestLocator = @ptrCast(@alignCast(raw));
        if (depth != 2 or tag.kind != .end or !try @import("xml_attributes.zig").element(tag, scope, opf_uri, "manifest")) return;
        if (self.at != null) return error.AmbiguousContentManifest;
        self.at = @intFromPtr(tag.raw.ptr) - @intFromPtr(self.source.ptr);
    }
};

// 알려진 일반 rootfile은 허용하되 추가 서명 root·XMLDSig·미지원 META-INF는 거부합니다.
// 서명 진위 검증이나 모든 사설 서명 형식의 완전 탐지는 제공하지 않습니다.
const SecurityGate = struct {
    allocator: std.mem.Allocator,
    package_path: []const u8,
    fn onTag(raw: *anyopaque, tag: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, _: usize) anyerror!void {
        if (tag.kind == .end) return;
        const self: *SecurityGate = @ptrCast(@alignCast(raw));
        const attrs = @import("xml_attributes.zig");
        const name = try scope.expandElement(tag.name);
        if (std.mem.eql(u8, name.uri, "http://www.w3.org/2000/09/xmldsig#")) return error.SignedDocument;
        if (!try attrs.element(tag, scope, "urn:oasis:names:tc:opendocument:xmlns:container", "rootfile")) return;
        const path = (try attrs.attribute(self.allocator, tag, scope, "full-path", 4096)) orelse return error.MissingRootPath;
        defer self.allocator.free(path);
        const media = (try attrs.attribute(self.allocator, tag, scope, "media-type", 4096)) orelse return error.MissingRootMediaType;
        defer self.allocator.free(media);
        if ((std.mem.eql(u8, path, self.package_path) and std.mem.eql(u8, media, "application/hwpml-package+xml")) or
            (std.mem.eql(u8, path, "Preview/PrvText.txt") and std.mem.eql(u8, media, "text/plain")) or
            (std.mem.eql(u8, path, "META-INF/container.rdf") and std.mem.eql(u8, media, "application/rdf+xml"))) return;
        return error.UnsupportedPicturePackageRoot;
    }
};
