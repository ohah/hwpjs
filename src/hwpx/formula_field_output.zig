//! One-field source output assembly. Never mutates current sites or source.
const std = @import("std");

pub const Prepared = struct {
    begin: usize,
    result: @import("formula_result_sites.zig").Prepared,
    parameters: @import("formula_parameter_changes.zig").Prepared,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.parameters.deinit(a);
        self.result.deinit(a);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, parameters: *const @import("parameter_lists.zig").Report, range: @import("field_text_ranges.zig").Range, begin: usize, display: []const u8) !Prepared {
    if (begin >= tree.elements.len or tree.elements[begin].end != range.content_start) return error.SourceBindingMismatch;
    var result = try @import("formula_result_sites.zig").prepare(a, tree, sites, range, display);
    errdefer result.deinit(a);
    const parameter_changes = try @import("formula_parameter_changes.zig").prepare(a, tree, parameters, begin, result.items[0].text);
    return .{ .begin = begin, .result = result, .parameters = parameter_changes };
}

pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, parameters: *const @import("parameter_lists.zig").Report, range: @import("field_text_ranges.zig").Range, begin: usize, display: []const u8, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    var prepared = try prepare(a, tree, sites, parameters, range, begin, display);
    defer prepared.deinit(a);
    return writeMany(a, tree, sites, &.{prepared}, options, max_bytes);
}

pub fn writeMany(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, prepared: []const Prepared, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    return writeManyWithDirty(a, tree, sites, prepared, options, &.{}, max_bytes);
}

pub fn writeManyWithDirty(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, prepared: []const Prepared, options: @import("text_sites.zig").Options, existing_dirty: []const @import("text_sites_save.zig").FieldDirty, max_bytes: usize) ![]u8 {
    // Shallow temporary view: unchanged strings borrow current sites; changed
    // strings borrow Prepared. This array alone is owned here.
    const items = try a.dupe(@import("text_sites.zig").Site, sites.items);
    defer a.free(items);
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    var dirty: std.ArrayList(@import("text_sites_save.zig").FieldDirty) = .empty;
    defer dirty.deinit(a);
    try dirty.appendSlice(a, existing_dirty);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (prepared) |field| {
        for (field.result.items) |replacement| {
            if (replacement.site_index >= items.len) return error.InvalidTextSites;
            if ((try seen.getOrPut(a, replacement.site_index)).found_existing) return error.AmbiguousFormulaResultSite;
            items[replacement.site_index].text = replacement.text;
        }
        try changes.appendSlice(a, &field.parameters.changes);
        var existing: ?usize = null;
        for (dirty.items, 0..) |value, index| if (value.element_index == field.begin) {
            existing = index;
        };
        if (existing) |index| dirty.items[index].dirty = true else try dirty.append(a, .{ .element_index = field.begin, .dirty = true });
    }
    const temporary: @import("text_sites.zig").Sites = .{ .items = items };
    return @import("text_sites_save.zig").writeWithChanges(a, tree, &temporary, options, dirty.items, changes.items, max_bytes);
}

test "HWPX formula field output synchronizes result and parameters without partial state on allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'><p:parameters><p:stringParam name='Command'>=SUM(A1:A2)??%g,;;9</p:stringParam><p:stringParam name='Formula'>=SUM(A1:A2)</p:stringParam><p:stringParam name='LastResult'>9</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>9</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var params = try @import("parameter_lists.zig").inspect(a, &trees, .{});
    defer params.deinit();
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const begin = markers.markers[ranges[0].begin_marker].element_index;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *@import("xml_part_tree.zig").Tree, s: *@import("text_sites.zig").Sites, p: *@import("parameter_lists.zig").Report, r: @import("field_text_ranges.zig").Range, b: usize, original: []const u8) !void {
            defer {
                std.testing.expectEqualStrings("9", s.items[0].text) catch @panic("partial text mutation");
                std.testing.expectEqualStrings(original, t.source) catch @panic("source mutation");
            }
            const output = try write(allocator, t, s, p, r, b, "42", .{}, 4096);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>42</p:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, ",;;42</p:stringParam>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "name='LastResult'>42</p:stringParam>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "dirty=\"1\"") != null);
        }
    }.run, .{ &tree, &sites, &params, ranges[0], begin, source });
    var duplicated = try prepare(a, &tree, &sites, &params, ranges[0], begin, "42");
    defer duplicated.deinit(a);
    try std.testing.expectError(error.AmbiguousFormulaResultSite, writeMany(a, &tree, &sites, &.{ duplicated, duplicated }, .{}, 4096));
}
