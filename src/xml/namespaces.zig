const std = @import("std");
const qname = @import("qname.zig");
const uris = @import("namespace_uri.zig");
const Tag = @import("tags.zig").Tag;
const View = @import("text.zig").View;
pub const Options = struct { max_bindings: usize = 65536, max_uri_bytes: usize = 16 * 1024 * 1024 };
const Binding = struct { prefix: []const u8, uri: []u8, previous: ?usize };
const Expanded = struct { uri: []const u8, local: []const u8 };
const ExpandedContext = struct {
    pub fn hash(_: @This(), key: Expanded) u64 {
        return std.hash.Wyhash.hash(std.hash.Wyhash.hash(0, key.uri), key.local);
    }
    pub fn eql(_: @This(), left: Expanded, right: Expanded) bool {
        return std.mem.eql(u8, left.uri, right.uri) and std.mem.eql(u8, left.local, right.local);
    }
};
/// Document-local scope. Prefix/local bytes borrow a single strict input encoding.
/// URI bytes are owned normalized UTF-8. Enter is atomic on failure.
pub const State = struct {
    bindings: std.ArrayList(Binding) = .empty,
    current: std.StringHashMapUnmanaged(usize) = .empty,
    uri_bytes: usize = 0,
    pub fn deinit(self: *State, a: std.mem.Allocator) void {
        self.leave(a, 0);
        self.bindings.deinit(a);
        self.current.deinit(a);
        self.* = undefined;
    }
    pub fn leave(self: *State, a: std.mem.Allocator, marker: usize) void {
        while (self.bindings.items.len > marker) {
            const binding = self.bindings.pop().?;
            if (binding.previous) |previous| self.current.getPtr(binding.prefix).?.* = previous else _ = self.current.remove(binding.prefix);
            self.uri_bytes -= binding.uri.len;
            a.free(binding.uri);
        }
    }
    fn bind(self: *State, a: std.mem.Allocator, prefix: View, value: @import("attribute_value.zig").Value, options: Options) !void {
        if (self.bindings.items.len >= options.max_bindings or self.uri_bytes > options.max_uri_bytes) return error.LimitExceeded;
        const uri = try uris.normalize(a, value, options.max_uri_bytes - self.uri_bytes);
        errdefer a.free(uri);
        try uris.validate(prefix, uri);
        try self.bindings.ensureUnusedCapacity(a, 1);
        try self.current.ensureUnusedCapacity(a, 1);
        const previous = self.current.get(prefix.raw);
        self.current.putAssumeCapacity(prefix.raw, self.bindings.items.len);
        self.bindings.appendAssumeCapacity(.{ .prefix = prefix.raw, .uri = uri, .previous = previous });
        self.uri_bytes += uri.len;
    }
    fn resolve(self: *const State, name: qname.QName, attribute: bool) !Expanded {
        if (name.prefix) |prefix| {
            if (prefix.equals("xmlns", false)) return error.ReservedXmlNamespace;
            if (prefix.equals("xml", false)) return .{ .uri = uris.xml, .local = name.local.raw };
            const index = self.current.get(prefix.raw) orelse return error.UnboundXmlPrefix;
            return .{ .uri = self.bindings.items[index].uri, .local = name.local.raw };
        }
        const uri = if (!attribute) blk: {
            const index = self.current.get("") orelse break :blk "";
            break :blk self.bindings.items[index].uri;
        } else "";
        return .{ .uri = uri, .local = name.local.raw };
    }
    pub fn enter(self: *State, a: std.mem.Allocator, tag: Tag, options: Options) !usize {
        const marker = self.bindings.items.len;
        errdefer self.leave(a, marker);
        // Declarations apply to the whole start tag, regardless of attribute order.
        for (tag.attributes) |attribute| {
            const name = try qname.parse(attribute.name);
            if (declaration(name)) |prefix| try self.bind(a, prefix, attribute.value, options);
        }
        _ = try self.resolve(try qname.parse(tag.name), false);
        var seen: std.HashMapUnmanaged(Expanded, void, ExpandedContext, 80) = .empty;
        defer seen.deinit(a);
        for (tag.attributes) |attribute| {
            const name = try qname.parse(attribute.name);
            if (declaration(name) != null) continue;
            const expanded = try self.resolve(name, true);
            if ((try seen.getOrPut(a, expanded)).found_existing) return error.DuplicateXmlExpandedAttribute;
        }
        return marker;
    }
};
fn declaration(name: qname.QName) ?View {
    if (name.prefix) |prefix| {
        return if (prefix.equals("xmlns", false)) name.local else null;
    }
    return if (name.local.equals("xmlns", false)) .{ .raw = "", .encoding = name.local.encoding } else null;
}
