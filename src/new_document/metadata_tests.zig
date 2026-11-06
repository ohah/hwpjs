//! Source-only metadata contracts; run from a dedicated probe, never src/root.zig.
const std = @import("std");
const root = @import("root.zig");
const cfb = @import("../cfb/reader.zig");
const zip = @import("../zip/archive.zig");
const xml = @import("../xml/root.zig");
const hwp = @import("../hwp5/root.zig");
const package = @import("../hwpx/package.zig");
const a = std.testing.allocator;

fn le16(bytes: []const u8, at: usize) u16 {
    return std.mem.readInt(u16, bytes[at..][0..2], .little);
}

fn inspectHwp(bytes: []const u8) !void {
    var file = try cfb.File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    var streams: usize = 0;
    for (file.entries, 0..) |entry, index| {
        if (entry.kind == 0) continue;
        try std.testing.expectEqual(@as(u64, 0), entry.created);
        try std.testing.expectEqual(@as(u64, 0), entry.modified);
        try std.testing.expectEqual(@as(u32, 0), entry.state);
        try std.testing.expectEqualSlices(u8, &@as([16]u8, @splat(0)), &entry.clsid);
        if (entry.kind != 2) {
            const path = try file.rootRelativePath(index);
            try std.testing.expect(std.mem.eql(u8, path, "/") or std.mem.eql(u8, path, "/BodyText/"));
            continue;
        }
        streams += 1;
        const path = try file.rootRelativePath(index);
        var allowed = false;
        inline for (.{ "/FileHeader", "/DocInfo", "/BodyText/Section0" }) |expected| {
            if (std.mem.eql(u8, path, expected)) allowed = true;
        }
        try std.testing.expect(allowed);
    }
    try std.testing.expectEqual(@as(usize, 3), streams);
    // readStream returns File-owned content; only stream.decode allocates here.
    const header_bytes = try file.readStream(a, "/FileHeader");
    const section_bytes = try file.readStream(a, "/BodyText/Section0");
    const header = try hwp.Header.parse(header_bytes);
    try std.testing.expectEqual(@as(u32, 0x05000107), header.version().raw);
    const docinfo_bytes = try file.readStream(a, "/DocInfo");
    var docinfo_records = hwp.record.Iterator.init(docinfo_bytes, .{});
    var characters: usize = 0;
    var faces: usize = 0;
    var styles: usize = 0;
    while (try docinfo_records.next()) |record| {
        if (record.tag == 19) {
            const face = try @import("../hwp5/docinfo/face_name.zig").FaceName.parse(record.payload);
            try std.testing.expectEqualSlices(u8, &.{ 0x68, 0xd5, 0x08, 0xcd, 0x6c, 0xb8, 0x14, 0xbc, 0xd5, 0xd0 }, face.name_utf16);
            try std.testing.expect(face.substitute == null and face.type_info == null and face.default_utf16 == null);
            faces += 1;
        }
        if (record.tag == 26) {
            const style = try @import("../hwp5/docinfo/style.zig").Style.parse(record.payload);
            try std.testing.expectEqual(@as(i16, 1042), style.language_id);
            try std.testing.expectEqual(@as(u16, 0), style.para_shape_id);
            try std.testing.expectEqual(@as(u16, 0), style.char_shape_id);
            try std.testing.expectEqualSlices(u8, &.{ 0x14, 0xbc, 0xd5, 0xd0, 0x00, 0xae }, style.local_utf16);
            styles += 1;
        }
        if (record.tag != 21) continue;
        const shape = try @import("../hwp5/docinfo/char_shape.zig").CharShape.parse(record.payload, header.version());
        try std.testing.expectEqual(@as(i32, 1100), shape.size);
        for (shape.font_ids) |id| try std.testing.expectEqual(@as(u16, 0), id);
        characters += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), characters);
    try std.testing.expectEqual(@as(usize, 7), faces);
    try std.testing.expectEqual(@as(usize, 1), styles);
    const section = try hwp.stream.decode(a, &header, section_bytes, 1024 * 1024);
    defer a.free(section);
    var records = hwp.record.Iterator.init(section, .{});
    var pages: usize = 0;
    while (try records.next()) |record| {
        if (record.tag != 73) continue;
        const page = try @import("../hwp5/body/page_def.zig").Definition.parse(record.payload);
        try std.testing.expectEqual(@as(u32, 59528), page.width);
        try std.testing.expectEqual(@as(u32, 84189), page.height);
        try std.testing.expectEqual(@as(u32, 5669), page.left);
        try std.testing.expectEqual(@as(u32, 5669), page.right);
        try std.testing.expectEqual(@as(u32, 5669), page.top);
        try std.testing.expectEqual(@as(u32, 5669), page.bottom);
        try std.testing.expectEqual(@as(u32, 2835), page.header);
        try std.testing.expectEqual(@as(u32, 2835), page.footer);
        pages += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), pages);
    var report = try hwp.container_validation.inspect(a, bytes, .{ .document = .{
        .list_layout = .observed8,
        .zone_layout = .observed_row_first,
        .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty },
    } });
    defer report.deinit(a);
    try report.document.doc_info.resources.validateKnownCounts();
    const resources = report.document.doc_info.resources;
    try std.testing.expectEqual(@as(usize, 0), resources.bin_data_count);
    try std.testing.expectEqual(@as(usize, 7), resources.face_name_count);
    for (0..7) |language| try std.testing.expectEqual(@as(i32, 1), resources.fontCount(@fromBackingInt(@intCast(language))));
    inline for (.{ .char_shape, .para_shape, .style, .tab_def }) |kind| {
        try std.testing.expectEqual(@as(usize, 1), resources.count(kind));
    }
    inline for (.{ .border_fill, .numbering, .bullet }) |kind| {
        try std.testing.expectEqual(@as(usize, 0), resources.count(kind));
    }
    try report.document.doc_info.references.validateKnown();
    try std.testing.expect(report.document.doc_info.references.checked > 0);
    try std.testing.expectEqual(@as(usize, 1), report.document.sections.len);
    try std.testing.expectEqual(@as(usize, 0), report.uninspected_streams);
    try std.testing.expect(report.summary_information == null);
}

const XmlMetadata = struct {
    pages: usize = 0,
    characters: usize = 0,
    fonts: usize = 0,

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, _: usize) anyerror!void {
        if (tag.kind == .end) return;
        const self: *@This() = @ptrCast(@alignCast(raw));
        const name = try scope.expandElement(tag.name);
        if (name.local.equals("font", false) and std.mem.eql(u8, name.uri, "http://www.hancom.co.kr/hwpml/2011/head")) {
            var found = false;
            for (tag.attributes) |attribute| if (attribute.name.equals("face", false)) {
                const value = try attribute.value.toUtf8(a, 128);
                defer a.free(value);
                try std.testing.expectEqualStrings("함초롬바탕", value);
                found = true;
            };
            try std.testing.expect(found);
            self.fonts += 1;
        }
        if (name.local.equals("charPr", false) and std.mem.eql(u8, name.uri, "http://www.hancom.co.kr/hwpml/2011/head")) {
            var height: ?u32 = null;
            for (tag.attributes) |attribute| if (attribute.name.equals("height", false)) {
                const value = try attribute.value.toUtf8(a, 32);
                defer a.free(value);
                height = try std.fmt.parseInt(u32, value, 10);
            };
            try std.testing.expectEqual(@as(?u32, 1100), height);
            self.characters += 1;
        }
        inline for (.{ "author", "creator", "lastModifiedBy", "created", "modified", "date", "userData", "userdata" }) |forbidden| {
            try std.testing.expect(!name.local.equals(forbidden, false));
            for (tag.attributes) |attribute| {
                if (std.mem.startsWith(u8, attribute.name.raw, "xmlns")) continue;
                const attribute_name = try scope.expandAttribute(attribute.name);
                try std.testing.expect(!attribute_name.local.equals(forbidden, false));
            }
        }
        if (!name.local.equals("pagePr", false) or !std.mem.eql(u8, name.uri, "http://www.hancom.co.kr/hwpml/2011/paragraph")) return;
        var width: ?u32 = null;
        var height: ?u32 = null;
        for (tag.attributes) |attribute| {
            if (attribute.name.equals("width", false) or attribute.name.equals("height", false)) {
                const value = try attribute.value.toUtf8(a, 32);
                defer a.free(value);
                const number = try std.fmt.parseInt(u32, value, 10);
                if (attribute.name.equals("width", false)) width = number else height = number;
            }
        }
        try std.testing.expectEqual(@as(?u32, 59528), width);
        try std.testing.expectEqual(@as(?u32, 84189), height);
        self.pages += 1;
    }
};

fn inspectHwpx(bytes: []const u8) !void {
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var metadata: XmlMetadata = .{};
    try std.testing.expectEqual(@as(usize, 7), archive.entries.len);
    for (archive.entries) |entry| {
        var allowed = false;
        inline for (.{ "mimetype", "version.xml", "META-INF/container.xml", "Contents/content.hpf", "Contents/header.xml", "Contents/section0.xml", "settings.xml" }) |expected| {
            if (std.mem.eql(u8, entry.name, expected)) allowed = true;
        }
        try std.testing.expect(allowed);
        // Neither DOS timestamp nor extended metadata may capture host data.
        try std.testing.expectEqual(@as(u16, 0), le16(bytes, entry.local_offset + 10));
        try std.testing.expectEqual(@as(u16, 0), le16(bytes, entry.central_offset + 12));
        try std.testing.expectEqual(@as(u16, 0x0021), le16(bytes, entry.local_offset + 12));
        try std.testing.expectEqual(@as(u16, 0x0021), le16(bytes, entry.central_offset + 14));
        const local_name_len = le16(bytes, entry.local_offset + 26);
        try std.testing.expectEqual(@as(u16, 0), le16(bytes, entry.local_offset + 28));
        try std.testing.expectEqual(@as(u16, 0), le16(bytes, entry.central_offset + 30));
        try std.testing.expectEqual(@as(u16, 0), le16(bytes, entry.central_offset + 32));
        try std.testing.expectEqual(entry.name.len, local_name_len);
        const decoded = try archive.decode(entry, 1024 * 1024);
        defer a.free(decoded);
        if (std.mem.endsWith(u8, entry.name, ".xml") or std.mem.endsWith(u8, entry.name, ".hpf")) {
            _ = try xml.document.visit(a, decoded, .{ .validate_namespaces = true }, .{ .context = &metadata, .on_tag = XmlMetadata.onTag });
        }
    }
    try std.testing.expectEqual(@as(usize, 1), metadata.pages);
    try std.testing.expectEqual(@as(usize, 1), metadata.characters);
    try std.testing.expectEqual(@as(usize, 7), metadata.fonts);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const refs = try document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), refs.sections);
    try std.testing.expectEqual(@as(usize, 1), refs.paragraphs);
    for (refs.references) |counts| {
        try std.testing.expect(counts.present > 0);
        try std.testing.expectEqual(counts.present, counts.resolved);
        try std.testing.expect(counts.allPresentResolved());
    }
    const header_refs = try document.inspectHeaderReferences(a, .{});
    for (header_refs.references) |counts| try std.testing.expect(counts.allPresentResolved());
    var font_refs = try document.inspectFontReferences(a, .{});
    defer font_refs.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), font_refs.references.font_ref_elements);
    for (font_refs.references.references) |counts| {
        try std.testing.expectEqual(@as(usize, 1), counts.present);
        try std.testing.expectEqual(@as(usize, 1), counts.resolved);
        try std.testing.expect(counts.allPresentResolved());
    }
    const lists = try document.inspectListReferences(a, .{});
    try std.testing.expect(lists.heading_number.allPresentResolved());
    try std.testing.expect(lists.heading_bullet.allPresentResolved());
    try std.testing.expect(lists.numbering_character.allPresentResolved());
    try std.testing.expect(lists.bullet_character.allPresentResolved());
}

test "new document metadata deterministic distinct owned buffers survive peer mutation and free" {
    inline for (.{ root.hwp5, root.hwpx }) |create| {
        const first = try create(a);
        defer a.free(first);
        try std.testing.expect(first.len > 0);
        {
            const second = try create(a);
            defer a.free(second);
            try std.testing.expect(@intFromPtr(first.ptr) != @intFromPtr(second.ptr));
            try std.testing.expectEqualSlices(u8, first, second);
            second[0] ^= 0xff;
            try std.testing.expect(first[0] != second[0]);
        }
        const third = try create(a);
        defer a.free(third);
        try std.testing.expectEqualSlices(u8, first, third);
    }
}

test "new document metadata HWP5 independent CFB rebuild preserves A4 resources and privacy" {
    const bytes = try root.hwp5(a);
    defer a.free(bytes);
    try inspectHwp(bytes);
    var file = try cfb.File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const nodes = try file.toNodes(a);
    defer a.free(nodes);
    const saved = try cfb.writer.write(a, nodes, .{});
    defer a.free(saved);
    try inspectHwp(saved);
}

test "new document metadata HWPX independent ZIP reopen preserves A4 references and privacy" {
    const bytes = try root.hwpx(a);
    defer a.free(bytes);
    try inspectHwpx(bytes);
    const saved = try @import("../zip/replace_writer.zig").write(a, bytes, &.{}, .{});
    defer a.free(saved);
    try std.testing.expect(@intFromPtr(bytes.ptr) != @intFromPtr(saved.ptr));
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try inspectHwpx(saved);
    // Exercise the writer's changed-payload branch, then restore original XML.
    var original = try zip.open(a, bytes, .{});
    defer original.deinit();
    var section_index: ?usize = null;
    for (original.entries, 0..) |entry, index| {
        if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) section_index = index;
    }
    const index = section_index orelse return error.MissingSection;
    const section = try original.decode(original.entries[index], 1024 * 1024);
    defer a.free(section);
    const changed = try @import("../zip/replace_writer.zig").write(a, bytes, &.{.{ .entry_index = index, .bytes = "<changed/>" }}, .{});
    defer a.free(changed);
    var changed_archive = try zip.open(a, changed, .{});
    defer changed_archive.deinit();
    const changed_section = try changed_archive.decode(changed_archive.find("Contents/section0.xml") orelse return error.MissingSection, 1024);
    defer a.free(changed_section);
    try std.testing.expectEqualSlices(u8, "<changed/>", changed_section);
    const restored = try @import("../zip/replace_writer.zig").write(a, changed, &.{.{ .entry_index = index, .bytes = section }}, .{});
    defer a.free(restored);
    try inspectHwpx(restored);
}
