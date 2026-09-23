const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\"><h:refList>";
const suffix = "</h:refList></h:head>";
const sparse = prefix ++
    "<h:charProperties><h:charPr id=\"3\"/></h:charProperties>" ++
    "<h:numberings><h:numbering id=\"7\"><h:paraHead charPrIDRef=\"4294967295\"/><h:paraHead charPrIDRef=\"3\"/><h:paraHead/></h:numbering><h:numbering id=\"2\"/></h:numberings>" ++
    "<h:bullets><h:bullet id=\"9\"><h:paraHead charPrIDRef=\"0\"/><h:paraHead charPrIDRef=\"&#51;\"/></h:bullet></h:bullets>" ++
    "<h:paraProperties><h:paraPr id=\"0\"><h:heading type=\"NUMBER\" idRef=\"7\"/></h:paraPr>" ++
    "<h:paraPr id=\"1\"><h:heading type=\"BULLET\" idRef=\"9\"/></h:paraPr>" ++
    "<h:paraPr id=\"2\"><h:heading type=\"NONE\" idRef=\"0\"/></h:paraPr>" ++
    "<h:paraPr id=\"3\"><h:heading type=\"OUTLINE\" idRef=\"0\"/></h:paraPr></h:paraProperties>" ++ suffix;

fn inspect(a: std.mem.Allocator, header: []const u8, options: package.ListReferenceOptions) !package.ListReferenceReport {
    const bytes = try fixture.syntheticStructureZip(a, header, fixture.structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectListReferences(a, options);
}

fn expectError(a: std.mem.Allocator, header: []const u8, options: package.ListReferenceOptions, expected: anyerror) !void {
    if (inspect(a, header, options)) |_| return error.TestExpectedError else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX list links use explicit typed IDs and distinguish maximum marker" {
    const r = try inspect(std.testing.allocator, sparse, .{});
    try std.testing.expectEqual(@as(usize, 4), r.paragraph_shapes);
    try std.testing.expectEqual(@as(usize, 4), r.headings);
    try std.testing.expectEqual(@as(usize, 1), r.heading_none);
    try std.testing.expectEqual(@as(usize, 1), r.heading_outline);
    try std.testing.expectEqual(@as(usize, 1), r.heading_number.resolved);
    try std.testing.expectEqual(@as(usize, 1), r.heading_bullet.resolved);
    try std.testing.expectEqual(@as(usize, 0), r.heading_number.missing_target);
    try std.testing.expectEqual(@as(usize, 0), r.heading_bullet.missing_target);
    try std.testing.expectEqual(@as(usize, 3), r.numbering_para_heads);
    try std.testing.expectEqual(@as(usize, 2), r.bullet_para_heads);
    try std.testing.expectEqual(@as(usize, 1), r.numbering_character_max_marker);
    try std.testing.expectEqual(@as(usize, 1), r.numbering_character.resolved);
    try std.testing.expectEqual(@as(usize, 1), r.numbering_character.absent);
    try std.testing.expectEqual(@as(usize, 1), r.bullet_character.resolved);
    try std.testing.expectEqual(@as(usize, 1), r.bullet_character.missing_target);
    try std.testing.expectEqual(@as(?u32, 0), r.bullet_character.first_unresolved_id);
}

test "HWPX explicit maximum character ID is not mistaken for an unbound marker" {
    const header = prefix ++
        "<h:charProperties><h:charPr id=\"4294967295\"/></h:charProperties>" ++
        "<h:numberings><h:numbering id=\"1\"><h:paraHead charPrIDRef=\"4294967295\"/></h:numbering></h:numberings>" ++ suffix;
    const r = try inspect(std.testing.allocator, header, .{});
    try std.testing.expectEqual(@as(usize, 1), r.numbering_character.resolved);
    try std.testing.expectEqual(@as(usize, 0), r.numbering_character_max_marker);
}

test "HWPX list links retain missing definitions, missing ID and duplicate heading" {
    const header = prefix ++
        "<h:bullets><h:bullet id=\"2\"/></h:bullets>" ++
        "<h:paraProperties><h:paraPr id=\"0\"><h:heading type=\"NUMBER\" idRef=\"0\"/><h:heading type=\"BULLET\" idRef=\"0\"/></h:paraPr>" ++
        "<h:paraPr id=\"1\"><h:heading type=\"NUMBER\"/></h:paraPr>" ++
        "<h:paraPr id=\"2\"/><h:paraPr id=\"3\"><h:heading idRef=\"4\"/></h:paraPr></h:paraProperties>" ++ suffix;
    const r = try inspect(std.testing.allocator, header, .{});
    try std.testing.expectEqual(@as(usize, 1), r.heading_number.absent_table);
    try std.testing.expectEqual(@as(?u32, 0), r.heading_number.first_unresolved_id);
    try std.testing.expect(r.heading_number.first_unresolved_item_index != null);
    try std.testing.expectEqual(@as(usize, 1), r.heading_number.absent);
    try std.testing.expectEqual(@as(usize, 1), r.heading_bullet.missing_target);
    try std.testing.expectEqual(@as(usize, 1), r.heading_type_absent);
    try std.testing.expectEqual(@as(usize, 1), r.unlinked_id_nonzero);
    try std.testing.expectEqual(@as(usize, 1), r.paragraphs_without_heading);
    try std.testing.expectEqual(@as(usize, 1), r.extra_headings);
}

test "HWPX list links reject namespace and ancestry spoofs" {
    const header = prefix ++
        "<h:charProperties><h:charPr id=\"2\"/></h:charProperties>" ++
        "<h:numberings><h:numbering id=\"3\"><x:paraHead xmlns:x=\"urn:wrong\" charPrIDRef=\"99\"/><h:wrapper><h:paraHead charPrIDRef=\"99\"/></h:wrapper><h:paraHead xmlns:x=\"urn:wrong\" x:charPrIDRef=\"99\"/></h:numbering></h:numberings>" ++
        "<h:paraProperties><h:paraPr id=\"0\"><x:heading xmlns:x=\"urn:wrong\" type=\"NUMBER\" idRef=\"99\"/><h:wrapper><h:heading type=\"NUMBER\" idRef=\"99\"/></h:wrapper><h:heading xmlns:x=\"urn:wrong\" type=\"NUMBER\" x:idRef=\"99\"/></h:paraPr></h:paraProperties>" ++
        "</h:refList><h:other><h:paraProperties><h:paraPr id=\"1\"><h:heading type=\"NUMBER\" idRef=\"99\"/></h:paraPr></h:paraProperties></h:other></h:head>";
    const r = try inspect(std.testing.allocator, header, .{});
    try std.testing.expectEqual(@as(usize, 1), r.headings);
    try std.testing.expectEqual(@as(usize, 1), r.numbering_para_heads);
    try std.testing.expectEqual(@as(usize, 1), r.heading_number.absent);
    try std.testing.expectEqual(@as(usize, 1), r.numbering_character.absent);
    try std.testing.expectEqual(@as(usize, 0), r.heading_number.missing_target);
}

test "HWPX list links reject invalid type and numeric values and honor bounds" {
    const a = std.testing.allocator;
    try expectError(a, prefix ++ "<h:paraProperties><h:paraPr id=\"0\"><h:heading type=\"OTHER\" idRef=\"0\"/></h:paraPr></h:paraProperties>" ++ suffix, .{}, error.InvalidHeadingType);
    try expectError(a, prefix ++ "<h:paraProperties><h:paraPr id=\"0\"><h:heading type=\"NUMBER\" idRef=\"4294967296\"/></h:paraPr></h:paraProperties>" ++ suffix, .{}, error.InvalidResourceReferenceId);
    try expectError(a, prefix ++ "<h:paraProperties><h:paraPr id=\"0\"><h:heading type=\"OUTLINE\" idRef=\"bad\"/></h:paraPr></h:paraProperties>" ++ suffix, .{}, error.InvalidResourceReferenceId);
    try expectError(a, prefix ++ "<h:numberings><h:numbering id=\"1\"><h:paraHead charPrIDRef=\"bad\"/></h:numbering></h:numberings>" ++ suffix, .{}, error.InvalidResourceReferenceId);
    _ = try inspect(a, sparse, .{ .references = .{ .max_xml_bytes = sparse.len } });
    try expectError(a, sparse, .{ .references = .{ .max_xml_bytes = sparse.len - 1 } }, error.LimitExceeded);
    try expectError(a, sparse, .{ .resources = .{ .max_xml_bytes = sparse.len - 1 } }, error.LimitExceeded);
    try expectError(a, sparse, .{ .references = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);
}

test "HWPX real list links retain outline and bullet variants and reject encryption" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "page", "lists-bullet" }, [_]bool{ true, false }) |name, expect_outline| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(2_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        const r = try document.inspectListReferences(a, .{});
        if (expect_outline) try std.testing.expect(r.heading_outline > 0) else try std.testing.expect(r.heading_bullet.resolved > 0);
        try std.testing.expectEqual(@as(usize, 0), r.heading_number.missing_target);
    }
    const encrypted = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(1_000_000));
    defer a.free(encrypted);
    var encrypted_document = try package.inspectDocument(a, encrypted, .{});
    defer encrypted_document.deinit(a);
    try std.testing.expectError(error.EncryptedDocument, encrypted_document.inspectListReferences(a, .{}));
}

test "HWPX list links cover every allocation failure and ReleaseFast cleanup" {
    const a = std.testing.allocator;
    const bytes = try fixture.syntheticStructureZip(a, sparse, fixture.structure_section);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            _ = try document.inspectListReferences(allocator, .{});
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    _ = try document.inspectListReferences(checked.allocator(), .{});
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
