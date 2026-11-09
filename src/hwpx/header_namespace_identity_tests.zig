//! Parse-local namespace identity and owned URI interning; synthetic inputs only.
const std = @import("std");
const a = std.testing.allocator;
const xml = @import("../xml/root.zig");
const parts = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const State = xml.namespaces.State;
const View = @import("../xml/text.zig").View;

fn view(bytes: []const u8) View {
    return .{ .raw = bytes, .encoding = .utf8 };
}

// Callers retain bytes for the scope lifetime, including declaration prefixes.
fn enter(allocator: std.mem.Allocator, state: *State, bytes: []const u8) !usize {
    var input = try xml.input.Input.init(bytes, .utf8, .{ .max_bytes = bytes.len, .max_characters = bytes.len });
    var tag = try xml.tags.parse(allocator, &input, .{});
    defer tag.deinit(allocator);
    return state.enter(allocator, tag, .{});
}

fn binding(state: *const State, bytes: []const u8) !xml.namespaces.ExpandedElementBinding {
    const expanded = try state.expandElementBinding(view(bytes));
    const old = try state.expandElement(view(bytes));
    try std.testing.expectEqualDeep(old, expanded.name);
    return expanded;
}

test "namespace identity reserved empty xml and old expanded attribute semantics" {
    var state: State = .{};
    defer state.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), (try binding(&state, "plain")).binding_id);
    const reserved = try binding(&state, "xml:item");
    try std.testing.expectEqual(@as(usize, 1), reserved.binding_id);
    try std.testing.expectEqualStrings("http://www.w3.org/XML/1998/namespace", reserved.name.uri);
    const marker = try enter(a, &state, "<root xmlns='urn:default' xmlns:xml='http://www.w3.org/XML/1998/namespace'/>");
    const default = try binding(&state, "plain");
    try std.testing.expect(default.binding_id >= 2);
    try std.testing.expectEqualStrings("urn:default", default.name.uri);
    try std.testing.expectEqual(@as(usize, 1), (try binding(&state, "xml:item")).binding_id);
    try std.testing.expectEqualStrings("", (try state.expandAttribute(view("plain"))).uri);
    try std.testing.expectEqualStrings(reserved.name.uri, (try state.expandAttribute(view("xml:item"))).uri);
    const empty_marker = try enter(a, &state, "<plain xmlns=''/>");
    try std.testing.expectEqual(@as(usize, 0), (try binding(&state, "plain")).binding_id);
    state.leave(a, empty_marker);
    try std.testing.expectEqual(default.binding_id, (try binding(&state, "plain")).binding_id);
    state.leave(a, marker);
    try std.testing.expectEqual(@as(usize, 0), (try binding(&state, "plain")).binding_id);
    try std.testing.expectError(error.UnboundXmlPrefix, state.expandElementBinding(view("lost:item")));
    try std.testing.expectError(error.ReservedXmlNamespace, state.expandElementBinding(view("xmlns:item")));
}

test "namespace identity shadow restore siblings and same URI declarations never reuse IDs" {
    var state: State = .{};
    defer state.deinit(a);
    const root = try enter(a, &state, "<root xmlns:x='urn:A' xmlns:y='urn:A'/>");
    const outer = try binding(&state, "x:a");
    const alias = try binding(&state, "y:a");
    try std.testing.expect(outer.binding_id != alias.binding_id);
    try std.testing.expectEqualStrings(outer.name.uri, alias.name.uri);
    try std.testing.expectEqual(outer.binding_id, (try binding(&state, "x:b")).binding_id);
    const nested = try enter(a, &state, "<x:child xmlns:x='urn:B'/>");
    const inner = try binding(&state, "x:a");
    try std.testing.expect(inner.binding_id > alias.binding_id);
    try std.testing.expectEqualStrings("urn:B", inner.name.uri);
    state.leave(a, nested);
    try std.testing.expectEqual(outer.binding_id, (try binding(&state, "x:a")).binding_id);
    const sibling = try enter(a, &state, "<x:child xmlns:x='urn:A'/>");
    const repeated = try binding(&state, "x:a");
    try std.testing.expect(repeated.binding_id > inner.binding_id);
    try std.testing.expectEqualStrings("urn:A", repeated.name.uri);
    state.leave(a, sibling);
    state.leave(a, root);
    const later = try enter(a, &state, "<root xmlns:x='urn:C'/>");
    defer state.leave(a, later);
    try std.testing.expect((try binding(&state, "x:a")).binding_id > repeated.binding_id);
}

test "namespace identity failed enter restores scope without recycling published IDs" {
    var state: State = .{};
    defer state.deinit(a);
    const root = try enter(a, &state, "<root xmlns:x='urn:A'/>");
    defer state.leave(a, root);
    const outer = (try binding(&state, "x:a")).binding_id;
    const before_failure = state.next_binding_id;
    try std.testing.expectError(error.UnboundXmlPrefix, enter(a, &state, "<x:bad xmlns:x='urn:B' missing:a='1'/>"));
    try std.testing.expectEqual(outer, (try binding(&state, "x:a")).binding_id);
    try std.testing.expect(state.next_binding_id > before_failure);
    const next = state.next_binding_id;
    const nested = try enter(a, &state, "<x:child xmlns:x='urn:C'/>");
    defer state.leave(a, nested);
    try std.testing.expectEqual(next, (try binding(&state, "x:a")).binding_id);
}

test "namespace identity counter overflow fails atomically and never wraps to reserved IDs" {
    var state: State = .{};
    defer state.deinit(a);
    state.next_binding_id = std.math.maxInt(usize) - 1;
    const marker = try enter(a, &state, "<x:a xmlns:x='urn:A'/>");
    try std.testing.expectEqual(@as(usize, std.math.maxInt(usize) - 1), (try binding(&state, "x:a")).binding_id);
    state.leave(a, marker);
    try std.testing.expectError(error.LimitExceeded, enter(a, &state, "<x:a xmlns:x='urn:B'/>"));
    try std.testing.expectEqual(std.math.maxInt(usize), state.next_binding_id);
    try std.testing.expectEqual(@as(usize, 0), state.bindings.items.len);
    try std.testing.expectEqual(@as(usize, 0), state.uri_bytes);
    try std.testing.expectError(error.UnboundXmlPrefix, state.expandElementBinding(view("x:a")));
    try std.testing.expectEqual(@as(usize, 0), (try binding(&state, "plain")).binding_id);
    try std.testing.expectEqual(@as(usize, 1), (try binding(&state, "xml:a")).binding_id);
}

test "namespace identity different bindings still collide as duplicate expanded attributes" {
    var state: State = .{};
    defer state.deinit(a);
    for ([_][]const u8{
        "<root xmlns:a='urn:same' xmlns:b='urn:same' a:key='1' b:key='2'/>",
        "<root xmlns:a='urn:same' xmlns:b='urn:same' u0='0' u1='1' u2='2' u3='3' u4='4' u5='5' u6='6' u7='7' a:key='1' b:key='2'/>",
    }) |bytes| {
        try std.testing.expectError(error.DuplicateXmlExpandedAttribute, enter(a, &state, bytes));
        try std.testing.expectEqual(@as(usize, 0), state.bindings.items.len);
    }
}

fn wrap(allocator: std.mem.Allocator, kind: parts.PartKind, body: []const u8) ![]u8 {
    return std.mem.concat(allocator, u8, if (kind == .header)
        &.{ "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'>", body, "</h:head>" }
    else
        &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'>", body, "</s:sec>" });
}

fn parse(allocator: std.mem.Allocator, bytes: []const u8, kind: parts.PartKind) !parts.Tree {
    return parts.parse(allocator, bytes, kind, if (kind == .header) null else 0, 3, .{});
}

test "namespace identity header and section canonicalize redeclarations without stale URI aliases" {
    const body = "<x:a xmlns:x='urn:A'><x:inner xmlns:x='urn:B'/><x:restored/></x:a>" ++
        "<x:b xmlns:x='urn:B'/><x:c xmlns:x='urn:&#65;'/><plain xmlns=''/><xml:node/>";
    for ([_]parts.PartKind{ .header, .section }) |kind| {
        const bytes = try wrap(a, kind, body);
        defer a.free(bytes);
        var tree = try parse(a, bytes, kind);
        defer tree.deinit(a);
        try std.testing.expectEqual(@as(usize, 8), tree.elements.len);
        try std.testing.expect(tree.elements[1].is("urn:A", "a"));
        try std.testing.expect(tree.elements[2].is("urn:B", "inner"));
        try std.testing.expect(tree.elements[3].is("urn:A", "restored"));
        try std.testing.expect(tree.elements[4].is("urn:B", "b"));
        try std.testing.expect(tree.elements[5].is("urn:A", "c"));
        try std.testing.expect(tree.elements[6].is("", "plain"));
        try std.testing.expect(tree.elements[7].is("http://www.w3.org/XML/1998/namespace", "node"));
        try std.testing.expect(tree.elements[1].name.uri.ptr == tree.elements[3].name.uri.ptr);
        try std.testing.expect(tree.elements[1].name.uri.ptr == tree.elements[5].name.uri.ptr);
        try std.testing.expect(tree.elements[2].name.uri.ptr == tree.elements[4].name.uri.ptr);
        try std.testing.expectEqual(@as(usize, 5), tree.uris.len);
        try std.testing.expectEqual(@as(?usize, 1), tree.elements[3].parent);
        try std.testing.expectEqualStrings("<x:restored/>", tree.sourceOf(3));
    }
}

fn churnBody(allocator: std.mem.Allocator, count: usize) ![]u8 {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(allocator);
    for (0..count) |index| {
        const node = try std.fmt.allocPrint(allocator, "<x:n xmlns:x='urn:{d}'/><x:s xmlns:x='urn:shared'/>", .{index});
        defer allocator.free(node);
        try bytes.appendSlice(allocator, node);
    }
    return bytes.toOwnedSlice(allocator);
}

test "namespace identity sibling churn preserves every URI and shares canonical repeated URI" {
    const body = try churnBody(a, 256);
    defer a.free(body);
    for ([_]parts.PartKind{ .header, .section }) |kind| {
        const bytes = try wrap(a, kind, body);
        defer a.free(bytes);
        var tree = try parse(a, bytes, kind);
        defer tree.deinit(a);
        try std.testing.expectEqual(@as(usize, 513), tree.elements.len);
        try std.testing.expectEqual(@as(usize, 258), tree.uris.len);
        for (0..256) |index| {
            const expected = try std.fmt.allocPrint(a, "urn:{d}", .{index});
            defer a.free(expected);
            try std.testing.expect(tree.elements[1 + index * 2].is(expected, "n"));
            try std.testing.expect(tree.elements[2 + index * 2].is("urn:shared", "s"));
            try std.testing.expect(tree.elements[2].name.uri.ptr == tree.elements[2 + index * 2].name.uri.ptr);
        }
    }
}

test "namespace identity long URI repeated elements retain owned canonical URI in fused header" {
    const uri = try a.alloc(u8, 4000);
    defer a.free(uri);
    @memset(uri, 'a');
    @memcpy(uri[0..4], "urn:");
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    try bytes.appendSlice(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:perf='");
    try bytes.appendSlice(a, uri);
    try bytes.appendSlice(a, "' version='1.5' secCnt='1'>");
    for (0..1000) |_| try bytes.appendSlice(a, "<perf:extension/>");
    try bytes.appendSlice(a, "</h:head>");
    var captured = try parts.parseInspectedHeader(a, bytes.items, 0, .{});
    defer captured.report.deinit(a);
    defer captured.tree.deinit(a);
    @memset(bytes.items, '!');
    try std.testing.expectEqual(@as(usize, 1001), captured.report.elements);
    try std.testing.expectEqualStrings("1.5", captured.report.header_version.?);
    try std.testing.expectEqual(@as(usize, 2), captured.tree.uris.len);
    for (captured.tree.elements[1..]) |element| {
        try std.testing.expect(element.is(uri, "extension"));
        try std.testing.expect(element.name.uri.ptr == captured.tree.elements[1].name.uri.ptr);
    }
    try std.testing.expectEqualStrings("<perf:extension/>", captured.tree.sourceOf(1));
}

fn stateAllocationProbe(allocator: std.mem.Allocator) !void {
    var state: State = .{};
    defer state.deinit(allocator);
    const root = try enter(allocator, &state, "<root xmlns:x='urn:A'/>");
    const original = (try state.expandElementBinding(view("x:a"))).binding_id;
    const nested = try enter(allocator, &state, "<x:child xmlns:x='urn:B' xmlns:y='urn:A'/>");
    try std.testing.expect((try state.expandElementBinding(view("x:a"))).binding_id != original);
    state.leave(allocator, nested);
    try std.testing.expectEqual(original, (try state.expandElementBinding(view("x:a"))).binding_id);
    state.leave(allocator, root);
}

fn treeAllocationProbe(allocator: std.mem.Allocator, bytes: []const u8, kind: parts.PartKind) !void {
    var tree = try parse(allocator, bytes, kind);
    defer tree.deinit(allocator);
    try std.testing.expect(tree.elements.len > 1);
    if (kind == .header) {
        var captured = try parts.parseInspectedHeader(allocator, bytes, 3, .{});
        defer captured.tree.deinit(allocator);
        defer captured.report.deinit(allocator);
        try std.testing.expectEqualDeep(tree.elements, captured.tree.elements);
        try std.testing.expectEqualDeep(tree.xml_report, captured.tree.xml_report);
    }
}

fn lateFailureProbe(allocator: std.mem.Allocator, bytes: []const u8) !void {
    if (parts.parseInspectedHeader(allocator, bytes, 0, .{})) |result| {
        var captured = result;
        defer captured.report.deinit(allocator);
        defer captured.tree.deinit(allocator);
        return error.ExpectedLateXmlFailure;
    } else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expect(err == error.XmlElementNameMismatch);
    }
}

test "namespace identity every allocation failure cleans scope binding map and owned URI pool" {
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), stateAllocationProbe, .{});
    const body = try churnBody(a, 16);
    defer a.free(body);
    for ([_]parts.PartKind{ .header, .section }) |kind| {
        const bytes = try wrap(a, kind, body);
        defer a.free(bytes);
        try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), treeAllocationProbe, .{ bytes, kind });
    }
    const bad = try std.mem.concat(a, u8, &.{ "<h:head xmlns:h='", document_xml.head_uri, "' version='1.5'>", body, "</wrong>" });
    defer a.free(bad);
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), lateFailureProbe, .{bad});
}
