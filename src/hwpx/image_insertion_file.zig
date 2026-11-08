//! 새 그림·원본 본문 문단·manifest를 한 번의 ZIP 작성으로 결합합니다.
const std = @import("std");
const insertion = @import("../image/image_insertion.zig");
const package = @import("package.zig");
const document_xml = @import("document_xml.zig");
const xml_writer = @import("xml_source_writer.zig");
const zip_writer = @import("../zip/store_writer.zig");
const section_writer = @import("image_insertion_section.zig");
const xml_limit = 16 * 1024 * 1024;
const total_limit = 96 * 1024 * 1024;
const opf_uri = "http://www.idpf.org/2007/opf/";

const ManifestLocator = struct {
    source: []const u8,
    manifest_at: ?usize = null,
    fn tag(raw: *anyopaque, value: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, depth: usize) anyerror!void {
        const self: *ManifestLocator = @ptrCast(@alignCast(raw));
        if (depth == 2 and value.kind == .end and try @import("xml_attributes.zig").element(value, scope, opf_uri, "manifest")) {
            if (self.manifest_at != null) return error.AmbiguousContentManifest;
            self.manifest_at = @intFromPtr(value.raw.ptr) - @intFromPtr(self.source.ptr);
        }
    }
};

/// 전역 SHA는 이 파일 경계에서 한 번 검사합니다. 하위 생성기는 문서 바이트를 받지 않습니다.
pub fn prepare(a: std.mem.Allocator, input: []const u8, image: []const u8, request: insertion.Request) !insertion.Result {
    const validated = try insertion.validateInput(input, image, request);
    const size = validated.size;
    const media = validated.media;
    var document = try package.inspectDocument(a, input, .{});
    defer document.deinit(a);
    const security = @import("file_transform_security.zig");
    try security.validate(a, &document, xml_limit);
    var trees = try document.readXmlTrees(a, .{ .max_total_owned_xml_bytes = total_limit, .header = .{ .max_xml_bytes = xml_limit }, .section = .{ .max_xml_bytes = xml_limit } });
    defer trees.deinit(a);
    if (request.target.section >= trees.sections.len) return error.InvalidSectionIndex;
    var used: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer used.deinit(a);
    var counters: @import("section_text.zig").Report = .{};
    var paragraph: ?usize = null;
    for (trees.sections) |*tree| {
        try security.validateTree(tree);
        if (try section_writer.locate(a, tree, request, &counters)) |node| {
            if (paragraph != null) return error.SourceBindingMismatch;
            paragraph = node;
        }
        for (tree.elements, 0..) |_, index| {
            for ([_][]const u8{ "id", "instid" }) |field| {
                const raw = (try tree.attributeValue(a, index, "", field)) orelse continue;
                const text = try raw.toUtf8(a, 4096);
                defer a.free(text);
                const value = std.fmt.parseInt(u32, text, 10) catch continue;
                try used.put(a, value, {});
            }
        }
    }
    try security.validateTree(&trees.header);
    const selected = paragraph orelse return error.InvalidParagraphIndex;
    var instance_id: u32 = 1;
    while (used.contains(instance_id)) instance_id = std.math.add(u32, instance_id, 1) catch return error.PictureInstanceIdsExhausted;
    var names: std.StringHashMapUnmanaged(void) = .empty;
    defer names.deinit(a);
    for (document.archive.entries) |entry| try names.put(a, entry.name, {});
    for (document.manifest.items) |item| try names.put(a, item.id, {});
    var counter: usize = 0;
    var resource: []u8 = undefined;
    var path: []u8 = undefined;
    while (true) : (counter += 1) {
        resource = try std.fmt.allocPrint(a, "hwpjs-insertion-{d}", .{counter});
        path = std.fmt.allocPrint(a, "BinData/{s}.{s}", .{ resource, media.extension }) catch |err| {
            a.free(resource);
            return err;
        };
        if (!names.contains(resource) and !names.contains(path)) break;
        a.free(resource);
        a.free(path);
    }
    defer a.free(resource);
    errdefer a.free(path);
    const picture = try @import("image_insertion_xml.zig").create(a, size, .{ .object_id = instance_id, .instance_id = instance_id, .resource_id = resource }, 4096);
    defer a.free(picture);
    const tree = &trees.sections[request.target.section];
    const section = try section_writer.write(a, tree, selected, request, picture, xml_limit);
    defer a.free(section);
    const entry = document.archive.find(document.container.path) orelse return error.MissingContentManifest;
    const opf = try document.archive.decode(entry, xml_limit);
    defer a.free(opf);
    var gate: ManifestLocator = .{ .source = opf };
    _ = try document_xml.visitBytes(a, opf, xml_limit, .{}, .{ .context = &gate, .on_tag = ManifestLocator.tag });
    const at = gate.manifest_at orelse return error.MissingContentManifest;
    const item = try std.fmt.allocPrint(a, "<item xmlns=\"{s}\" id=\"{s}\" href=\"{s}\" media-type=\"{s}\" isEmbeded=\"1\"/>", .{ opf_uri, resource, path, media.mime });
    defer a.free(item);
    const manifest = try xml_writer.write(a, opf, &.{.{ .start = at, .end = at, .text = "", .serialized_xml = item }}, xml_limit);
    defer a.free(manifest);
    var sources: std.ArrayList(zip_writer.Source) = .empty;
    defer sources.deinit(a);
    var decoded: std.ArrayList([]u8) = .empty;
    defer {
        for (decoded.items) |bytes| a.free(bytes);
        decoded.deinit(a);
    }
    const section_path = document.manifest.items[tree.item_index].href;
    var total: usize = image.len;
    for (document.archive.entries) |old| {
        const bytes = if (std.mem.eql(u8, old.name, section_path)) section else if (std.mem.eql(u8, old.name, document.container.path)) manifest else bytes: {
            const value = try document.archive.decode(old, @min(stream_limit, total_limit -| total));
            decoded.append(a, value) catch |err| {
                a.free(value);
                return err;
            };
            break :bytes value;
        };
        if (bytes.len > total_limit -| total) return error.LimitExceeded;
        total += bytes.len;
        try sources.append(a, .{ .name = old.name, .bytes = bytes });
    }
    try sources.append(a, .{ .name = path, .bytes = image });
    const output = try zip_writer.write(a, sources.items, .{ .max_output_bytes = insertion.picture_input.max_document_bytes });
    errdefer a.free(output);
    var checked = try package.inspectDocument(a, output, .{});
    defer checked.deinit(a);
    const actual_entry = checked.archive.find(path) orelse return error.PictureInsertionVerificationFailed;
    const actual = try checked.archive.decode(actual_entry, insertion.picture_input.max_image_bytes);
    defer a.free(actual);
    if (!std.mem.eql(u8, actual, image)) return error.PictureInsertionVerificationFailed;
    var checked_tree = try checked.readSectionTree(a, request.target.section, .{});
    defer checked_tree.deinit(a);
    var inventory = try @import("picture_image_links.zig").inspectSections(a, checked.manifest, &.{checked_tree}, .{});
    defer inventory.deinit(a);
    var found: usize = 0;
    for (inventory.sites) |site| if (site.id) |id| {
        if (std.mem.eql(u8, id, resource) and site.target.state == .embedded) found += 1;
    };
    if (found != 1) return error.PictureInsertionVerificationFailed;
    return .{ .bytes = output, .resource_path = path, .instance_id = instance_id };
}

const stream_limit = 32 * 1024 * 1024;
