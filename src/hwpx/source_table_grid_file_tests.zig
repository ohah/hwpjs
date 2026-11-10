const std = @import("std");
const file = @import("source_table_grid_file.zig");
const fixture = @import("test_package_fixture.zig");
const package = @import("package.zig");
const fields = @import("table_xml_fields.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10'><p:run><p:t>before</p:t>";
fn section(allocator: std.mem.Allocator) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(allocator);
    try bytes.appendSlice(allocator, prefix ++ "<p:tbl rowCnt='2' colCnt='2'><p:sz width='40' height='20' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>");
    for (0..2) |r| {
        try bytes.appendSlice(allocator, "<p:tr>");
        for (0..2) |c| {
            const cell = try std.fmt.allocPrint(allocator, "<p:tc><p:subList id=''><p:p id='{d}'><p:run><p:t>cell{d}&amp;😀</p:t></p:run></p:p></p:subList><p:cellAddr rowAddr='{d}' colAddr='{d}'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='20' height='10'/></p:tc>", .{ 20 + r * 2 + c, r * 2 + c, r, c });
            defer allocator.free(cell);
            try bytes.appendSlice(allocator, cell);
        }
        try bytes.appendSlice(allocator, "</p:tr>\n");
    }
    try bytes.appendSlice(allocator, "</p:tbl><p:t>after</p:t></p:run></p:p></s:sec>");
    return bytes.toOwnedSlice(allocator);
}
fn synthetic() ![]u8 {
    const source = try section(a);
    defer a.free(source);
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' secCnt='2'><h:resource id='5'/><p:p id='1'/></h:head>";
    const other = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='3'/></s:sec>";
    const hpf = try std.mem.replaceOwned(u8, a, fixture.structure_hpf, "</p:manifest>", "<p:item id='master' href='Contents/masterpage0.xml' media-type='application/xml'/></p:manifest>");
    defer a.free(hpf);
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/chapter-B.xml", .data = source },
        .{ .name = "Contents/chapter-A.xml", .data = other },
        .{ .name = "Contents/extra.xml", .data = "<misc/>" },
        .{ .name = "Contents/masterpage0.xml", .data = "<m:masterPage xmlns:m='http://www.hancom.co.kr/hwpml/2011/master-page' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='2'/></m:masterPage>" },
        .{ .name = "unlisted.xml", .data = "<extra xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='4'/></extra>" },
        .{ .name = "BinData/opaque.bin", .data = "opaque\x00\xff" },
    });
}
fn request(input: []const u8, command: file.Command, span: bool) !file.Request {
    var d = try package.inspectDocument(a, input, .{});
    defer d.deinit(a);
    var tree = try d.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    for (tree.elements, 0..) |e, i| if (fields.childIs(&tree, i, "tbl")) return .{ .section = 0, .target = if (span) .{ .span = .{ .start = e.start_tag.start, .end = e.end } } else .{ .element = i }, .expected_rows = 2, .expected_columns = 2, .command = command };
    return error.MissingTestTable;
}
fn preserved(input: []const u8, output: []const u8, target: []const u8) !void {
    var before = try package.inspectDocument(a, input, .{});
    defer before.deinit(a);
    var after = try package.inspectDocument(a, output, .{});
    defer after.deinit(a);
    try std.testing.expectEqual(before.archive.entries.len, after.archive.entries.len);
    for (before.archive.entries, after.archive.entries) |old, new| {
        try std.testing.expectEqualStrings(old.name, new.name);
        if (std.mem.eql(u8, old.name, target)) continue;
        try std.testing.expectEqualSlices(u8, input[old.local_offset..old.local_end], output[new.local_offset..new.local_end]);
        const oc = input[old.central_offset..old.central_end];
        const nc = output[new.central_offset..new.central_end];
        // Only the physical local-record offset may change in central metadata.
        try std.testing.expectEqualSlices(u8, oc[0..42], nc[0..42]);
        try std.testing.expectEqualSlices(u8, oc[46..], nc[46..]);
    }
}
fn four(input: []const u8, target: []const u8) !void {
    const snapshot = try a.dupe(u8, input);
    defer a.free(snapshot);
    var original_doc = try package.inspectDocument(a, input, .{});
    defer original_doc.deinit(a);
    var original_tree = try original_doc.readSectionTree(a, 0, .{});
    defer original_tree.deinit(a);
    var original_paragraphs: [4]usize = undefined;
    var original_count: usize = 0;
    var original_width: u32 = 0;
    var original_height: u32 = 0;
    for (original_tree.elements, 0..) |e, i| {
        if (fields.childIs(&original_tree, i, "cellSz")) {
            original_width = (try fields.optionalUnsigned(a, &original_tree, i, "width", 4096)).?;
            original_height = (try fields.optionalUnsigned(a, &original_tree, i, "height", 4096)).?;
        }
        if (fields.childIs(&original_tree, i, "p") and e.parent != null and fields.childIs(&original_tree, e.parent.?, "subList")) {
            original_paragraphs[original_count] = i;
            original_count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 4), original_count);
    const cases = [_]struct { command: file.Command, rows: u32, cols: u32 }{
        .{ .command = .{ .insert_row = 1 }, .rows = 3, .cols = 2 },
        .{ .command = .{ .insert_column = 0 }, .rows = 2, .cols = 3 },
        .{ .command = .{ .delete_row = 0 }, .rows = 1, .cols = 2 },
        .{ .command = .{ .delete_column = 1 }, .rows = 2, .cols = 1 },
    };
    for (cases, 0..) |case, ci| {
        const output = try file.transform(a, input, try request(input, case.command, ci % 2 == 0), .{});
        defer a.free(output);
        try preserved(input, output, target);
        var d = try package.inspectDocument(a, output, .{});
        defer d.deinit(a);
        var t = try d.readSectionTree(a, 0, .{});
        defer t.deinit(a);
        var ids: std.AutoHashMap(u32, void) = .init(a);
        defer ids.deinit();
        var addresses: usize = 0;
        var surviving: usize = 0;
        for (t.elements, 0..) |_, i| {
            if (fields.childIs(&t, i, "tbl")) {
                try std.testing.expectEqual(case.rows, (try fields.optionalUnsigned(a, &t, i, "rowCnt", 4096)).?);
                try std.testing.expectEqual(case.cols, (try fields.optionalUnsigned(a, &t, i, "colCnt", 4096)).?);
            }
            if (fields.childIs(&t, i, "sz")) {
                try std.testing.expectEqual(original_width * case.cols, (try fields.optionalUnsigned(a, &t, i, "width", 4096)).?);
                try std.testing.expectEqual(original_height * case.rows, (try fields.optionalUnsigned(a, &t, i, "height", 4096)).?);
            }
            if (fields.childIs(&t, i, "cellAddr")) {
                try std.testing.expectEqual(@as(u32, @intCast(addresses / case.cols)), (try fields.optionalUnsigned(a, &t, i, "rowAddr", 4096)).?);
                try std.testing.expectEqual(@as(u32, @intCast(addresses % case.cols)), (try fields.optionalUnsigned(a, &t, i, "colAddr", 4096)).?);
                addresses += 1;
            }
            if (fields.childIs(&t, i, "p")) {
                const id = (try fields.optionalUnsigned(a, &t, i, "id", 4096)).?;
                try std.testing.expect(!(try ids.getOrPut(id)).found_existing);
                if (t.elements[i].parent) |parent| if (fields.childIs(&t, parent, "subList")) {
                    var matched = false;
                    for (original_paragraphs, 0..) |oi, cell_index| {
                        const old_id = (try fields.optionalUnsigned(a, &original_tree, oi, "id", 4096)).?;
                        if (old_id != id) continue;
                        matched = true;
                        try std.testing.expect(ci < 2 or (ci == 2 and cell_index >= 2) or (ci == 3 and cell_index % 2 == 0));
                        try std.testing.expectEqualStrings(original_tree.sourceOf(oi), t.sourceOf(i));
                        surviving += 1;
                    }
                    if (!matched) try std.testing.expect(std.mem.indexOf(u8, t.sourceOf(i), "cell") == null);
                };
            }
        }
        try std.testing.expectEqual(@as(usize, case.rows * case.cols), addresses);
        try std.testing.expectEqual(@as(usize, if (ci < 2) 4 else 2), surviving);
    }
    try std.testing.expectEqualSlices(u8, snapshot, input);
}
test "HWPX source file grid synthetic four commands ZIP preservation and full-package IDs" {
    const input = try synthetic();
    defer a.free(input);
    try four(input, "Contents/chapter-B.xml");
    const out = try file.transform(a, input, try request(input, .{ .insert_row = 1 }, false), .{});
    defer a.free(out);
    var d = try package.inspectDocument(a, out, .{});
    defer d.deinit(a);
    var t = try d.readSectionTree(a, 0, .{});
    defer t.deinit(a);
    // Header=1, master=2, other section=3, unlisted XML=4. Resource ID=5
    // is a separate identity space; inserted paragraphs must be 5 and 6.
    var found: usize = 0;
    for (t.elements, 0..) |_, i| if (fields.childIs(&t, i, "p")) {
        const id = (try fields.optionalUnsigned(a, &t, i, "id", 4096)).?;
        if (id == 5 or id == 6) found += 1;
        try std.testing.expect(id > 4);
    };
    try std.testing.expectEqual(@as(usize, 2), found);
}
test "HWPX source file grid approved generated real file four commands save reopen" {
    const path = try std.process.Environ.getAlloc(std.testing.environ, a, "HWPJS_TEST_SOURCE_GRID_HWPX");
    defer a.free(path);
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    try four(input, "Contents/section0.xml");
}
test "HWPX source file grid rejects stale unsafe and bounded requests with immutable input" {
    const input = try synthetic();
    defer a.free(input);
    const snapshot = try a.dupe(u8, input);
    defer a.free(snapshot);
    var req = try request(input, .{ .insert_row = 1 }, false);
    req.section = 99;
    try std.testing.expectError(error.InvalidSectionIndex, file.transform(a, input, req, .{}));
    req.section = 0;
    req.expected_rows = 3;
    try std.testing.expectError(error.StaleSourceTableGrid, file.transform(a, input, req, .{}));
    req.expected_rows = 2;
    for ([_]file.Options{ .{ .max_input_bytes = 1 }, .{ .max_output_bytes = 1 }, .{ .max_total_xml_bytes = 1 }, .{ .max_parts = 1 }, .{ .max_nodes = 1 }, .{ .max_paragraphs = 1 }, .{ .max_total_payload_bytes = 1 } }) |options| try std.testing.expectError(error.LimitExceeded, file.transform(a, input, req, options));
    const xml_source = try section(a);
    defer a.free(xml_source);
    for ([_]struct { old: []const u8, new: []const u8, err: anyerror }{
        .{ .old = "rowSpan='1'", .new = "rowSpan='2'", .err = error.MergedSourceTable },
        .{ .old = "<p:tbl rowCnt", .new = "<p:tbl protect='1' rowCnt", .err = error.ProtectedSourceTable },
        .{ .old = "<p:tbl rowCnt", .new = "<p:tbl cellSpacing='1' rowCnt", .err = error.ProtectedSourceTable },
        .{ .old = "<p:run><p:t>cell", .new = "<p:run><p:linesegarray/><p:t>cell", .err = error.UnsupportedSourceTableStructure },
        .{ .old = "'ABSOLUTE'", .new = "'PERCENT'", .err = error.UnsupportedSourceTableGeometry },
        .{ .old = "<p:t>before", .new = "<sig:Signature xmlns:sig='http://www.w3.org/2000/09/xmldsig#'/><p:t>before", .err = error.SignedDocument },
    }) |case| {
        const bad_xml = try std.mem.replaceOwned(u8, a, xml_source, case.old, case.new);
        defer a.free(bad_xml);
        const bad = try fixture.syntheticStructureZip(a, fixture.structure_header, bad_xml);
        defer a.free(bad);
        const copy = try a.dupe(u8, bad);
        defer a.free(copy);
        try std.testing.expectError(case.err, file.transform(a, bad, try request(bad, .{ .insert_row = 1 }, false), .{}));
        try std.testing.expectEqualSlices(u8, copy, bad);
    }
    try std.testing.expectEqualSlices(u8, snapshot, input);
}
test "HWPX source file grid allocation failures release all unpublished candidates" {
    const input = try synthetic();
    defer a.free(input);
    for ([_]file.Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_row = 0 }, .{ .delete_column = 1 } }) |command| {
        const req = try request(input, command, false);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, bytes: []const u8, r: file.Request) !void {
                const output = try file.transform(allocator, bytes, r, .{});
                defer allocator.free(output);
            }
        }.run, .{ input, req });
    }
}

test "HWPX source file grid rejects encryption metadata and signatures outside selected section" {
    const input = try synthetic();
    defer a.free(input);
    const req = try request(input, .{ .insert_row = 1 }, false);
    var d = try package.inspectDocument(a, input, .{});
    defer d.deinit(a);
    for ([_]struct { name: []const u8, bytes: []const u8, err: anyerror }{
        .{ .name = "META-INF/manifest.xml", .bytes = "<m:manifest xmlns:m='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'><m:file-entry full-path='Contents/chapter-A.xml'><m:encryption-data/></m:file-entry></m:manifest>", .err = error.EncryptedDocument },
        .{ .name = "META-INF/signatures.xml", .bytes = "<signatures/>", .err = error.UnsupportedPictureSecurityMetadata },
        .{ .name = "unlisted-signature.xml", .bytes = "<sig:Signature xmlns:sig='http://www.w3.org/2000/09/xmldsig#'/>", .err = error.SignedDocument },
    }) |case| {
        var sources: std.ArrayList(fixture.Source) = .empty;
        defer sources.deinit(a);
        defer for (sources.items[0 .. sources.items.len - 1]) |source| a.free(source.data);
        for (d.archive.entries) |entry| {
            const bytes = try d.archive.decode(entry, 100000);
            errdefer a.free(bytes);
            try sources.append(a, .{ .name = entry.name, .data = bytes });
        }
        try sources.append(a, .{ .name = case.name, .data = case.bytes });
        const bad = try fixture.storedZip(a, sources.items);
        defer a.free(bad);
        const snapshot = try a.dupe(u8, bad);
        defer a.free(snapshot);
        try std.testing.expectError(case.err, file.transform(a, bad, req, .{}));
        try std.testing.expectEqualSlices(u8, snapshot, bad);
    }
}

// Rebuild only synthetic packages; appended inputs remain borrowed.
fn appendParts(input: []const u8, manifest_items: []const u8, extras: []const fixture.Source) ![]u8 {
    var d = try package.inspectDocument(a, input, .{});
    defer d.deinit(a);
    var sources: std.ArrayList(fixture.Source) = .empty;
    defer sources.deinit(a);
    var owned: std.ArrayList([]const u8) = .empty;
    defer {
        for (owned.items) |bytes| a.free(bytes);
        owned.deinit(a);
    }
    for (d.archive.entries) |entry| {
        const bytes = try d.archive.decode(entry, 1024 * 1024);
        defer a.free(bytes);
        const data = if (std.mem.eql(u8, entry.name, "Contents/content.hpf")) block: {
            const replacement = try std.mem.concat(a, u8, &.{ manifest_items, "</p:manifest>" });
            defer a.free(replacement);
            break :block try std.mem.replaceOwned(u8, a, bytes, "</p:manifest>", replacement);
        } else try a.dupe(u8, bytes);
        owned.append(a, data) catch |err| {
            a.free(data);
            return err;
        };
        try sources.append(a, .{ .name = entry.name, .data = data });
    }
    try sources.appendSlice(a, extras);
    return fixture.storedZip(a, sources.items);
}

test "HWPX source file grid manifest XML media exact paths and missing entries" {
    const input = try synthetic();
    defer a.free(input);
    const req = try request(input, .{ .insert_row = 1 }, false);
    const paragraph = "<extra xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='5'/></extra>";
    for ([_][]const u8{ "application/xml", "text/xml", "application/custom+xml" }) |media| {
        const item = try std.fmt.allocPrint(a, "<p:item id='custom' href='data.bin' media-type='{s}'/><p:item id='alias' href='data.bin' media-type='application/octet-stream'/>", .{media});
        defer a.free(item);
        const bytes = try appendParts(input, item, &.{ .{ .name = "data.bin", .data = paragraph }, .{ .name = "DATA.bin", .data = "not XML" } });
        defer a.free(bytes);
        const output = try file.transform(a, bytes, req, .{});
        defer a.free(output);
        try preserved(bytes, output, "Contents/chapter-B.xml");
        var d = try package.inspectDocument(a, output, .{});
        defer d.deinit(a);
        var tree = try d.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        var fresh: usize = 0;
        for (tree.elements, 0..) |_, i| if (fields.childIs(&tree, i, "p")) {
            const id = (try fields.optionalUnsigned(a, &tree, i, "id", 4096)).?;
            try std.testing.expect(id != 5);
            if (id == 6 or id == 7) fresh += 1;
        };
        try std.testing.expectEqual(@as(usize, 2), fresh);
    }
    // Media matching stays case-sensitive; suffix matching stays insensitive.
    const opaque_input = try appendParts(input, "<p:item id='opaque' href='raw.bin' media-type='Application/XML'/>", &.{.{ .name = "raw.bin", .data = "not XML" }});
    defer a.free(opaque_input);
    const output = try file.transform(a, opaque_input, req, .{});
    defer a.free(output);
    for ([_]struct { item: []const u8, extra: []const fixture.Source, err: anyerror }{
        .{ .item = "<p:item id='missing' href='missing.bin' media-type='application/xml'/>", .extra = &.{}, .err = error.MissingEmbeddedEntry },
        .{ .item = "<p:item id='missing' href='DATA.bin' media-type='application/xml'/>", .extra = &.{.{ .name = "data.bin", .data = paragraph }}, .err = error.MissingEmbeddedEntry },
        .{ .item = "<p:item id='external' href='external.bin' media-type='text/xml' isEmbeded='0'/>", .extra = &.{}, .err = error.ExternalSpineXml },
        .{ .item = "", .extra = &.{.{ .name = "unlisted.XML", .data = "not XML" }}, .err = error.TextOutsideXmlRoot },
    }) |case| {
        const bad = try appendParts(input, case.item, case.extra);
        defer a.free(bad);
        try std.testing.expectError(case.err, file.transform(a, bad, req, .{}));
    }
}

test "HWPX source file grid aggregate limits include untouched parts and output growth" {
    const input = try synthetic();
    defer a.free(input);
    const insert = try request(input, .{ .insert_row = 1 }, false);
    const remove = try request(input, .{ .delete_row = 0 }, false);
    var d = try package.inspectDocument(a, input, .{});
    defer d.deinit(a);
    var payload: usize = 0;
    var xml_bytes: usize = 0;
    for (d.archive.entries) |entry| {
        const bytes = try d.archive.decode(entry, 1024 * 1024);
        defer a.free(bytes);
        payload += bytes.len;
        if (std.mem.endsWith(u8, entry.name, ".xml") or std.mem.endsWith(u8, entry.name, ".hpf")) xml_bytes += bytes.len;
    }
    const exact: file.Options = .{ .max_total_payload_bytes = payload, .max_total_xml_bytes = xml_bytes, .max_paragraphs = 11 };
    const smaller = try file.transform(a, input, remove, exact);
    defer a.free(smaller);
    // Input fits exactly, but a newly inserted row exceeds the reopened budget.
    try std.testing.expectError(error.LimitExceeded, file.transform(a, input, insert, exact));
    for ([_]file.Options{ .{ .max_total_payload_bytes = payload - 1 }, .{ .max_total_xml_bytes = xml_bytes - 1 }, .{ .max_paragraphs = 8 } }) |options| {
        try std.testing.expectError(error.LimitExceeded, file.transform(a, input, remove, options));
    }
    // The input passes; failure happens only after allocating and reopening the
    // unpublished output. Sweep that rejection path as well as successful saves.
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, req: file.Request, limit: usize) !void {
            const out = file.transform(allocator, bytes, req, .{ .max_total_xml_bytes = limit }) catch |err| switch (err) {
                error.LimitExceeded => return,
                else => return err,
            };
            defer allocator.free(out);
            return error.ExpectedOutputLimit;
        }
    }.run, .{ input, insert, xml_bytes });
    // Independently isolate each output budget (rather than whichever fails first).
    for ([_]file.Options{ .{ .max_total_payload_bytes = payload }, .{ .max_total_xml_bytes = xml_bytes }, .{ .max_paragraphs = 10 } }) |options| {
        try std.testing.expectError(error.LimitExceeded, file.transform(a, input, insert, options));
    }
}

test "HWPX source file grid large opaque manifest classification" {
    const input = try synthetic();
    defer a.free(input);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const temp = arena.allocator();
    var items: std.ArrayList(u8) = .empty;
    var extras: std.ArrayList(fixture.Source) = .empty;
    for (0..512) |i| {
        const name = try std.fmt.allocPrint(temp, "BinData/part{d}.bin", .{i});
        const item = try std.fmt.allocPrint(temp, "<p:item id='part{d}' href='{s}' media-type='application/octet-stream'/>", .{ i, name });
        try items.appendSlice(temp, item);
        try extras.append(temp, .{ .name = name, .data = "opaque" });
    }
    const bytes = try appendParts(input, items.items, extras.items);
    defer a.free(bytes);
    const output = try file.transform(a, bytes, try request(bytes, .{ .delete_column = 1 }, false), .{});
    defer a.free(output);
    try preserved(bytes, output, "Contents/chapter-B.xml");
}
