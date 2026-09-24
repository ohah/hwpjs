const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const tree_mod = @import("xml_part_tree.zig");

const epub_uri = "http://www.idpf.org/2007/ops";
const whitespace = " \t\r\n";

pub const Mode = enum { all, selected };
pub const Policy = struct {
    mode: Mode = .all,
    /// Namespaces the caller can actually interpret; no built-in feature claim.
    supported_namespaces: []const []const u8 = &.{},
};

pub const State = struct { selected: bool = false };

pub fn validate(policy: Policy) !void {
    if (policy.supported_namespaces.len > 64) return error.LimitExceeded;
    for (policy.supported_namespaces) |uri| {
        if (uri.len == 0 or uri.len > 4096 or std.mem.indexOfAny(u8, uri, whitespace) != null) return error.InvalidSupportedNamespace;
    }
}

fn supported(required: []const u8, capabilities: []const []const u8) bool {
    // The published model rejects an empty attribute, but its token loop
    // accepts a nonempty whitespace-only value without consulting capabilities.
    if (required.len == 0) return false;
    var tokens = std.mem.tokenizeAny(u8, required, whitespace);
    while (tokens.next()) |uri| {
        var found = false;
        for (capabilities) |capability| {
            if (std.mem.eql(u8, uri, capability)) {
                found = true;
                break;
            }
        }
        if (!found) return false;
    }
    return true;
}

const TagSource = struct {
    tag: xml.tags.Tag,
    scope: *const xml.namespaces.State,

    fn get(self: @This(), a: std.mem.Allocator, uri: []const u8, max_bytes: usize) !?[]u8 {
        return attrs.attributeInNamespace(a, self.tag, self.scope, uri, "required-namespace", max_bytes);
    }
};

const TreeSource = struct {
    tree: *const tree_mod.Tree,
    index: usize,

    fn get(self: @This(), a: std.mem.Allocator, uri: []const u8, max_bytes: usize) !?[]u8 {
        const value = try self.tree.attributeValue(a, self.index, uri, "required-namespace") orelse return null;
        return try value.toUtf8(a, max_bytes);
    }
};

fn chooseSource(a: std.mem.Allocator, source: anytype, is_case: bool, max_attribute_bytes: usize, policy: Policy, state: *State) !bool {
    if (policy.mode == .all) return true;
    if (state.selected) return false;
    if (!is_case) {
        state.selected = true;
        return true;
    }
    const paragraph = try source.get(a, document_xml.paragraph_uri, max_attribute_bytes);
    defer if (paragraph) |value| a.free(value);
    if (paragraph) |value| {
        if (supported(value, policy.supported_namespaces)) {
            state.selected = true;
            return true;
        }
    }
    const epub = try source.get(a, epub_uri, max_attribute_bytes);
    defer if (epub) |value| a.free(value);
    const matched = if (epub) |value| supported(value, policy.supported_namespaces) else false;
    if (matched) state.selected = true;
    return matched;
}

/// First matching case wins; otherwise the first default wins. Raw scans
/// retain every branch and never call this a selected document view.
pub fn choose(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, is_case: bool, max_attribute_bytes: usize, policy: Policy, state: *State) !bool {
    return chooseSource(a, TagSource{ .tag = tag, .scope = scope }, is_case, max_attribute_bytes, policy, state);
}

/// The owned XML tree retains expanded names but not a persistent namespace
/// scope. Attribute lookup reconstructs that scope from the same XML source;
/// the token predicate and first-match state remain shared with stream scans.
pub fn chooseTree(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, is_case: bool, max_attribute_bytes: usize, policy: Policy, state: *State) !bool {
    return chooseSource(a, TreeSource{ .tree = tree, .index = index }, is_case, max_attribute_bytes, policy, state);
}
