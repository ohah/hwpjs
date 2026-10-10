//! 원문 셀 identity와 현재 크기만 소유하며 저장 payload는 보관하지 않습니다.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Edit = struct { section: usize, list_node: u32, width: u32, height: u32 };

pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, edit: Edit) !void {
    const bindings = try @import("table_display_bindings.zig").read(a, source, version, section.paragraphs);
    defer a.free(bindings);
    var original: ?@import("table_display_bindings.zig").Binding = null;
    for (bindings) |binding| if (binding.list_node == edit.list_node) {
        original = binding;
        break;
    };
    const selected = original orelse return error.InvalidCellDisplayOwner;
    var empty: [0]model.TableCellSize = .{};
    const current = section.table_cell_sizes orelse &empty;
    var position: ?usize = null;
    for (current, 0..) |value, index| if (value.source_list_node == edit.list_node) {
        position = index;
        break;
    };
    const reset = selected.width == edit.width and selected.height == edit.height;
    if (position) |index| {
        if (current[index].width == edit.width and current[index].height == edit.height) return;
        if (!reset) {
            current[index].width = edit.width;
            current[index].height = edit.height;
            return;
        }
        if (current.len == 1) {
            a.free(current);
            section.table_cell_sizes = null;
            return;
        }
        const next = try a.alloc(model.TableCellSize, current.len - 1);
        @memcpy(next[0..index], current[0..index]);
        @memcpy(next[index..], current[index + 1 ..]);
        a.free(current);
        section.table_cell_sizes = next;
        return;
    }
    if (reset) return;
    if (current.len >= 100_000) return error.LimitExceeded;
    const next = try a.alloc(model.TableCellSize, current.len + 1);
    @memcpy(next[0..current.len], current);
    next[current.len] = .{ .source_list_node = edit.list_node, .width = edit.width, .height = edit.height };
    if (section.table_cell_sizes) |owned| a.free(owned);
    section.table_cell_sizes = next;
}
