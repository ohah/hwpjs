//! Immutable source marker/range analysis, never current text or permission.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const markers = @import("field_markers.zig");
const ranges = @import("field_text_ranges.zig");
const Binding = struct { source_ptr: usize, source_len: usize, elements_ptr: usize, elements_len: usize, has_fields: bool = false };

pub const Source = struct {
    report: markers.Report,
    fields: []const ranges.Range,
    bindings: []const Binding,
    pub fn deinit(self: *Source, a: std.mem.Allocator) void {
        a.free(self.bindings);
        a.free(self.fields);
        self.report.deinit();
        self.* = undefined;
    }
};
pub fn build(a: std.mem.Allocator, sections: anytype) !Source {
    return buildMode(a, sections, false);
}

/// Own raw diagnostics and known links once; this does not grant strict access.
pub fn buildForEditor(a: std.mem.Allocator, sections: anytype) !Source {
    return buildMode(a, sections, true);
}

fn buildMode(a: std.mem.Allocator, sections: anytype, known_only: bool) !Source {
    const inputs = try a.alloc(trees.Tree, sections.len);
    defer a.free(inputs);
    for (sections, inputs) |section, *input| input.* = section.tree;
    var report = try markers.inspect(a, inputs, .{});
    errdefer report.deinit();
    const fields = if (known_only) try ranges.buildKnown(a, inputs, &report) else try ranges.build(a, inputs, &report);
    errdefer a.free(fields);
    const bindings = try a.alloc(Binding, sections.len);
    for (inputs, bindings) |tree, *binding| binding.* = .{ .source_ptr = @intFromPtr(tree.source.ptr), .source_len = tree.source.len, .elements_ptr = @intFromPtr(tree.elements.ptr), .elements_len = tree.elements.len };
    for (report.markers) |marker| if (marker.kind == .begin) {
        bindings[marker.section_ordinal].has_fields = true;
    };
    return .{ .report = report, .fields = fields, .bindings = bindings };
}
pub const Lease = struct {
    source: Source,
    owned: bool,
    pub fn deinit(self: *Lease, a: std.mem.Allocator) void {
        if (self.owned) self.source.deinit(a);
        self.* = undefined;
    }
};
fn cachedLease(session: anytype) !?Lease {
    if (session.source_fields) |source| {
        if (session.sections.len != source.bindings.len) return error.SourceBindingMismatch;
        for (session.sections, source.bindings, 0..) |section, binding, index| {
            const tree = section.tree;
            if (tree.part_kind != .section or tree.section_ordinal != index or @intFromPtr(tree.source.ptr) != binding.source_ptr or tree.source.len != binding.source_len or @intFromPtr(tree.elements.ptr) != binding.elements_ptr or tree.elements.len != binding.elements_len) return error.SourceBindingMismatch;
        }
        return .{ .source = source, .owned = false };
    }
    return null;
}

pub fn lease(session: anytype) !Lease {
    if (try cachedLease(session)) |view| {
        if (view.source.report.unmatched_begins != 0) return error.InvalidFieldLinks;
        return view;
    }
    return .{ .source = try build(session.allocator, session.sections), .owned = true };
}

/// Exterior queries retain unresolved diagnostics; strict field APIs use lease.
pub fn leaseForExterior(session: anytype) !Lease {
    if (try cachedLease(session)) |view| return view;
    return .{ .source = try buildMode(session.allocator, session.sections, true), .owned = true };
}

/// Known source labels may be inspected only when unresolved starts are list scoped.
/// Per-label overlap protection remains mandatory; structural models stay strict.
pub fn leaseForLabels(session: anytype, section: usize) !Lease {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (session.sections[section].structure_values != null) return lease(session);
    var view = try leaseForExterior(session);
    errdefer view.deinit(session.allocator);
    for (view.source.report.markers) |marker| {
        if (marker.section_ordinal != section or marker.kind != .begin or marker.matched_marker_index != null) continue;
        const envelope = try @import("field_source_scope.zig").forBegin(&session.sections[section].tree, marker.element_index);
        if (envelope.owner == null) return error.InvalidFieldLinks;
    }
    return view;
}
pub fn hasFields(session: anytype, section: usize) !bool {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (session.source_fields != null) {
        var analysis = try leaseForExterior(session);
        defer analysis.deinit(session.allocator);
        return analysis.source.bindings[section].has_fields;
    }
    for (session.sections[section].tree.elements) |element| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return true;
    }
    return false;
}

test "source field analysis owned build survives every allocation failure and borrowed queries match fresh analysis" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE'/></p:ctrl><p:t>body</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(session.source_fields != null);
    try std.testing.expect(try hasFields(&session, 0));
    try std.testing.expectError(error.InvalidSectionIndex, hasFields(&session, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session) !void {
            var fresh = try build(allocator, original.sections);
            defer fresh.deinit(allocator);
            try std.testing.expectEqualSlices(ranges.Range, original.source_fields.?.fields, fresh.fields);
        }
    }.run, .{&session});
    const cached = try session.fieldLabels(0, 1);
    defer a.free(cached);
    var proxy = session;
    proxy.source_fields = null;
    try std.testing.expect(try hasFields(&proxy, 0));
    const fresh = try proxy.fieldLabels(0, 1);
    defer a.free(fresh);
    try std.testing.expectEqualSlices(@import("field_label_targets.zig").Target, cached, fresh);
    try std.testing.expect(try session.spliceFieldLabel(0, 1, cached[0].begin_element, 0, 0, "new😀"));
    const current = try session.fieldLabels(0, 1);
    defer a.free(current);
    try std.testing.expectEqual(cached[0].end + 5, current[0].end);
    var changed = session;
    changed.sections = try a.dupe(@import("editor_session.zig").Section, session.sections);
    defer a.free(changed.sections);
    changed.sections[0].tree.source = changed.sections[0].tree.source[0 .. changed.sections[0].tree.source.len - 1];
    try std.testing.expectError(error.SourceBindingMismatch, lease(&changed));
    try std.testing.expectError(error.SourceBindingMismatch, hasFields(&changed, 0));
    changed.sections[0].tree = session.sections[0].tree;
    changed.sections[0].tree.section_ordinal = 99;
    try std.testing.expectError(error.SourceBindingMismatch, lease(&changed));
}

test "source field analysis open owns failure cleanup and preserves malformed link refusal" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const editor = @import("editor_session.zig");
    const valid = try fixture.zipWithParagraphs(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE'/></p:ctrl><p:t>body</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p>");
    defer a.free(valid);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var session = try editor.open(allocator, input, .{});
            defer session.deinit();
            try std.testing.expect(session.source_fields != null);
        }
    }.run, .{valid});
    const invalid = try fixture.zipWithParagraphs(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE'/></p:ctrl><p:t>unclosed</p:t></p:run></p:p>");
    defer a.free(invalid);
    var session = try editor.open(a, invalid, .{});
    defer session.deinit();
    try std.testing.expect(session.source_fields != null);
    try std.testing.expectEqual(@as(usize, 1), session.source_fields.?.report.unmatched_begins);
    try std.testing.expectError(error.InvalidFieldLinks, session.fieldLabels(0, 1));
    try std.testing.expectError(error.InvalidFieldLinks, lease(&session));
    try std.testing.expectEqualSlices(u8, invalid, session.source);
    const plain = try fixture.zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>plain</p:t></p:run></p:p></s:sec>");
    defer a.free(plain);
    var plain_session = try editor.open(a, plain, .{});
    defer plain_session.deinit();
    try std.testing.expect(!try hasFields(&plain_session, 0));
    try std.testing.expect(try plain_session.canEdit(0, 1));
    var plain_proxy = plain_session;
    plain_proxy.source_fields = null;
    try std.testing.expect(!try hasFields(&plain_proxy, 0));
}

test "source field analysis exterior separates unresolved starts without guessing ends under OOM" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>before</p:t></p:run></p:p><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE'/></p:ctrl><p:t>unknown</p:t></p:run></p:p><p:p><p:run><p:t>after</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.canEdit(0, 1));
    try std.testing.expect(!try session.canEdit(0, 3));
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 3, 0, 0, "X"));
    try std.testing.expectError(error.InvalidFieldLinks, lease(&session));
    try std.testing.expect(session.source_fields != null);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            proxy.source_fields = null;
            var view = try leaseForExterior(&proxy);
            defer view.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), view.source.report.unmatched_begins);
            try std.testing.expectEqual(@as(usize, 0), view.source.fields.len);
            try std.testing.expect(try proxy.canEdit(0, 1));
            try std.testing.expect(!try proxy.canEdit(0, 3));
            try std.testing.expect(proxy.source_fields == null);
        }
    }.run, .{&session});
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    var borrowed = session;
    borrowed.allocator = failing.allocator();
    var view = try leaseForExterior(&borrowed);
    defer view.deinit(borrowed.allocator);
    try std.testing.expect(!view.owned);
    try std.testing.expect(!failing.has_induced_failure);
    try std.testing.expect(try hasFields(&borrowed, 0));
    try std.testing.expectError(error.InvalidFieldLinks, lease(&borrowed));
    var changed_sections = [_]@import("editor_session.zig").Section{session.sections[0]};
    var changed = session;
    changed.sections = &changed_sections;
    changed.sections[0].tree.source = changed.sections[0].tree.source[0 .. changed.sections[0].tree.source.len - 1];
    try std.testing.expectError(error.SourceBindingMismatch, leaseForExterior(&changed));
    try std.testing.expectError(error.SourceBindingMismatch, lease(&changed));
    try std.testing.expectError(error.SourceBindingMismatch, hasFields(&changed, 0));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var current = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer current.deinit();
            try std.testing.expect(current.source_fields != null);
            try std.testing.expectEqual(@as(usize, 1), current.source_fields.?.report.unmatched_begins);
        }
    }.run, .{input});
    try std.testing.expect(try session.splice(0, 1, 0, 0, "앞😀"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualStrings("앞😀before", reopened.sections[0].sites.items[0].text);
    try std.testing.expectEqualStrings("unknown", reopened.sections[0].sites.items[1].text);
    try std.testing.expectEqualStrings("after", reopened.sections[0].sites.items[2].text);
}
