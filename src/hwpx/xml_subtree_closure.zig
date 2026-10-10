//! Standalone UTF-8 subtree markup with its original namespace environment.
const std = @import("std");
const xml = @import("../xml/root.zig");
const Tree = @import("xml_part_tree.zig").Tree;

fn utf8(a: std.mem.Allocator, raw: []const u8, encoding: @import("../xml/scalars.zig").Encoding, limit: usize) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var offset: usize = 0;
    while (try @import("../xml/scalars.zig").read(raw, offset, encoding)) |scalar| {
        var buffer: [4]u8 = undefined;
        const count = try std.unicode.utf8Encode(scalar.value, &buffer);
        if (count > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, buffer[0..count]);
        offset = scalar.end;
    }
    return output.toOwnedSlice(a);
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, index: usize, limit: usize) ![]u8 {
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    const node = tree.elements[index];
    const Context = struct {
        allocator: std.mem.Allocator,
        source: []const u8,
        start: usize,
        end: usize,
        limit: usize,
        output: ?[]u8 = null,
        fn append(self: *@This(), out: *std.ArrayList(u8), bytes: []const u8) !void {
            if (bytes.len > self.limit -| out.items.len) return error.LimitExceeded;
            try out.appendSlice(self.allocator, bytes);
        }
        fn declaration(self: *@This(), out: *std.ArrayList(u8), prefix: []const u8, uri: []const u8) !void {
            const encoded = try @import("../xml/attribute_writer.zig").encode(self.allocator, uri, self.limit);
            defer self.allocator.free(encoded);
            try self.append(out, " xmlns");
            if (prefix.len != 0) {
                try self.append(out, ":");
                try self.append(out, prefix);
            }
            try self.append(out, "=\"");
            try self.append(out, encoded);
            try self.append(out, "\"");
        }
        fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, _: usize) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (tag.kind == .end or @intFromPtr(tag.raw.ptr) - @intFromPtr(self.source.ptr) != self.start) return;
            if (self.output != null) return error.SourceBindingMismatch;
            const complete = try utf8(self.allocator, self.source[self.start..self.end], tag.name.encoding, self.limit);
            defer self.allocator.free(complete);
            const opening = try utf8(self.allocator, tag.raw, tag.name.encoding, self.limit);
            defer self.allocator.free(opening);
            const close = opening.len - (if (tag.kind == .empty) @as(usize, 2) else 1);
            var out: std.ArrayList(u8) = .empty;
            defer out.deinit(self.allocator);
            try self.append(&out, opening[0..close]);
            var bindings = scope.current.iterator();
            var has_default = false;
            while (bindings.next()) |entry| {
                const prefix = entry.key_ptr.*;
                if (prefix.len == 0) has_default = true;
                var declared = false;
                for (tag.attributes) |attribute| {
                    const name = try @import("../xml/qname.zig").parse(attribute.name);
                    if (name.prefix) |head| {
                        if (head.equals("xmlns", false) and std.mem.eql(u8, name.local.raw, prefix)) declared = true;
                    } else if (name.local.equals("xmlns", false) and prefix.len == 0) declared = true;
                }
                if (declared) continue;
                const decoded_prefix = try utf8(self.allocator, prefix, tag.name.encoding, self.limit);
                defer self.allocator.free(decoded_prefix);
                try self.declaration(&out, decoded_prefix, scope.bindings.items[entry.value_ptr.*].uri);
            }
            // Absence is a meaningful default binding when reparenting.
            if (!has_default) try self.declaration(&out, "", "");
            try self.append(&out, complete[close..]);
            self.output = try out.toOwnedSlice(self.allocator);
        }
    };
    var context: Context = .{ .allocator = a, .source = tree.source, .start = node.start_tag.start, .end = node.end, .limit = limit };
    errdefer if (context.output) |output| a.free(output);
    _ = try @import("document_xml.zig").visitBytes(a, tree.source, tree.source.len, .{ .max_attribute_bytes = tree.source.len }, .{ .context = &context, .on_tag = Context.onTag });
    return context.output orelse error.SourceBindingMismatch;
}
