//! Selected top-level paragraph/run ownership, excluding nested object section declarations.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const children = @import("selected_display_children.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Owners = std.AutoHashMap(usize, usize);

pub fn collect(a: std.mem.Allocator, tree: *const Tree) !Owners {
    if (tree.part_kind != .section or tree.elements.len == 0 or !tree.elements[0].is(@import("document_xml.zig").section_uri, "sec")) return error.InvalidPartKind;
    var owners: Owners = .init(a);
    errdefer owners.deinit();
    const Paragraphs = struct {
        allocator: std.mem.Allocator,
        tree: *const Tree,
        owners: *Owners,
        pub fn accept(self: *@This(), paragraph: usize) !void {
            const Runs = struct {
                allocator: std.mem.Allocator,
                tree: *const Tree,
                owners: *Owners,
                paragraph: usize,
                pub fn accept(runs: *@This(), run: usize) !void {
                    const Definitions = struct {
                        owners: *Owners,
                        paragraph: usize,
                        pub fn accept(definitions: *@This(), node: usize) !void {
                            const entry = try definitions.owners.getOrPut(node);
                            if (entry.found_existing) return error.SourceBindingMismatch;
                            entry.value_ptr.* = definitions.paragraph;
                        }
                    };
                    var definitions = Definitions{ .owners = runs.owners, .paragraph = runs.paragraph };
                    try children.visit(runs.allocator, runs.tree, run, uri, "secPr", &definitions);
                }
            };
            var runs = Runs{ .allocator = self.allocator, .tree = self.tree, .owners = self.owners, .paragraph = paragraph };
            try children.visit(self.allocator, self.tree, paragraph, uri, "run", &runs);
        }
    };
    var paragraphs = Paragraphs{ .allocator = a, .tree = tree, .owners = &owners };
    try children.visit(a, tree, 0, uri, "p", &paragraphs);
    return owners;
}

test "HWPX section tab ownership excludes inactive nested foreign and detached definitions" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'>" ++
        "<p:p><p:run><p:secPr id='live'/><p:switch><p:case p:required-namespace='urn:unsupported'><p:secPr id='inactive'/></p:case>" ++
        "<p:default><p:secPr id='fallback'/></p:default></p:switch>" ++
        "<p:tbl><p:p><p:run><p:secPr id='nested'/></p:run></p:p></p:tbl></p:run></p:p>" ++
        "<p:switch><p:default><p:p><p:run><p:secPr id='body-switch'/></p:run></p:p></p:default></p:switch>" ++
        "<f:p><p:run><p:secPr id='foreign'/></p:run></f:p><p:secPr id='detached'/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            var owners = try collect(allocator, input);
            defer owners.deinit();
            try std.testing.expectEqual(@as(u32, 3), owners.count());
            for (input.elements, 0..) |element, node| {
                if (!element.is(uri, "secPr")) continue;
                const raw = (try input.attributeValue(allocator, node, "", "id")).?;
                const id = try raw.toUtf8(allocator, 4096);
                defer allocator.free(id);
                const active = std.mem.eql(u8, id, "live") or std.mem.eql(u8, id, "fallback") or std.mem.eql(u8, id, "body-switch");
                try std.testing.expectEqual(active, owners.contains(node));
                if (owners.get(node)) |paragraph| try std.testing.expect(input.elements[paragraph].is(uri, "p"));
            }
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
}
