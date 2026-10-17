const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const values = @import("xml_values.zig");

pub const margin_names = [_][]const u8{ "left", "right", "top", "bottom" };
/// Public model child names; the array order is descriptive, not a required XML order.
pub const cell_child_names = [_][]const u8{ "cellAddr", "cellSpan", "cellSz", "cellMargin", "subList" };

pub const BooleanCounts = struct {
    absent: usize = 0,
    false_value: usize = 0,
    true_value: usize = 0,
};

pub fn noteBoolean(a: std.mem.Allocator, raw: ?xml.attribute_value.Value, max_bytes: usize, counts: *BooleanCounts) !?bool {
    const present = raw orelse {
        counts.absent += 1;
        return null;
    };
    const value = try boolean(a, present, max_bytes);
    if (value) counts.true_value += 1 else counts.false_value += 1;
    return value;
}

pub fn childIs(tree: *const tree_mod.Tree, index: usize, local: []const u8) bool {
    return tree.elements[index].is(document_xml.paragraph_uri, local);
}

/// Exactly one direct child is usable. Missing and duplicate counts are kept
/// distinct instead of inventing defaults or selecting an arbitrary duplicate.
pub fn uniqueChild(tree: *const tree_mod.Tree, parent: usize, name: []const u8, missing: *usize, duplicate: *usize) ?usize {
    var found: ?usize = null;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        if (!childIs(tree, index, name)) continue;
        if (found != null) {
            duplicate.* += 1;
            return null;
        }
        found = index;
    }
    if (found == null) missing.* += 1;
    return found;
}

pub fn unsigned(a: std.mem.Allocator, raw: xml.attribute_value.Value, max_bytes: usize) !u32 {
    if (raw.borrowedNormalizedUtf8()) |bytes| {
        if (bytes.len > max_bytes) return error.LimitExceeded;
        return values.unsigned32(bytes);
    }
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return values.unsigned32(bytes);
}

pub fn margin(a: std.mem.Allocator, raw: xml.attribute_value.Value, max_bytes: usize) !i64 {
    if (raw.borrowedNormalizedUtf8()) |bytes| {
        if (bytes.len > max_bytes) return error.LimitExceeded;
        return values.signedOrUnsigned32(bytes);
    }
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return values.signedOrUnsigned32(bytes);
}

pub fn boolean(a: std.mem.Allocator, raw: xml.attribute_value.Value, max_bytes: usize) !bool {
    if (raw.borrowedNormalizedUtf8()) |bytes| {
        if (bytes.len > max_bytes) return error.LimitExceeded;
        return values.boolean(bytes);
    }
    const bytes = try raw.toUtf8(a, max_bytes);
    defer a.free(bytes);
    return values.boolean(bytes);
}

pub fn optionalUnsigned(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, name: []const u8, max_bytes: usize) !?u32 {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return null;
    return try unsigned(a, raw, max_bytes);
}

pub fn optionalUnsignedPair(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, names: [2][]const u8, max_bytes: usize) ![2]?u32 {
    var raw: [2]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &names, &raw);
    var result: [2]?u32 = .{ null, null };
    for (raw, 0..) |value, field| if (value) |present| {
        result[field] = try unsigned(a, present, max_bytes);
    };
    return result;
}

test "normalized attribute scalar fast path matches decoder values errors and byte limits" {
    const a = std.testing.allocator;
    const cases = [_][]const u8{
        "<x v='0'/>",          "<x v=' +42 '/>",      "<x v='-0'/>",
        "<x v='4294967295'/>", "<x v='4294967296'/>", "<x v='-2147483648'/>",
        "<x v='true'/>",       "<x v='false'/>",      "<x v=''/>",
        "<x v='1 2'/>",        "<x v='&#49;'/>",      "<x v='&#x9;1&#xA;'/>",
        "<x v='\r\n1\t'/>",
    };
    inline for (.{ xml.input.Encoding.utf8, .utf16le, .utf16be }) |encoding| {
        for (cases) |source| {
            const encoded = try a.alloc(u8, source.len * (if (encoding == .utf8) @as(usize, 1) else 2));
            defer a.free(encoded);
            for (source, 0..) |byte, i| {
                if (encoding == .utf8) encoded[i] = byte else std.mem.writeInt(u16, encoded[2 * i ..][0..2], byte, if (encoding == .utf16le) .little else .big);
            }
            var input = try xml.input.Input.init(encoded, encoding, .{});
            var tag = try xml.tags.parse(a, &input, .{});
            defer tag.deinit(a);
            const raw = tag.attributes[0].value;
            const decoded = try raw.toUtf8(a, 4096);
            defer a.free(decoded);
            if (raw.borrowedNormalizedUtf8()) |borrowed| {
                try std.testing.expectEqualStrings(decoded, borrowed);
                try std.testing.expectEqual(@intFromPtr(raw.text.raw.ptr), @intFromPtr(borrowed.ptr));
                var fail = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
                if (values.unsigned32(decoded)) |expected| try std.testing.expectEqual(expected, try unsigned(fail.allocator(), raw, 4096)) else |_| {}
                try std.testing.expectEqual(@as(usize, 0), fail.alloc_index);
            }
            for (0..12) |limit| {
                if (decoded.len > limit) {
                    try std.testing.expectError(error.LimitExceeded, unsigned(a, raw, limit));
                    try std.testing.expectError(error.LimitExceeded, margin(a, raw, limit));
                    try std.testing.expectError(error.LimitExceeded, boolean(a, raw, limit));
                    continue;
                }
                if (values.unsigned32(decoded)) |expected| try std.testing.expectEqual(expected, try unsigned(a, raw, limit)) else |err| try std.testing.expectError(err, unsigned(a, raw, limit));
                if (values.signedOrUnsigned32(decoded)) |expected| try std.testing.expectEqual(expected, try margin(a, raw, limit)) else |err| try std.testing.expectError(err, margin(a, raw, limit));
                if (values.boolean(decoded)) |expected| try std.testing.expectEqual(expected, try boolean(a, raw, limit)) else |err| try std.testing.expectError(err, boolean(a, raw, limit));
            }
        }
    }
}
