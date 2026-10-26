//! Company 보존 편집의 전체 Section 연결 전제. 명령 실행/필드 편집 권한은 없다.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;

/// CTRL_HEADER를 해독한 불변 Tree를 빌린다. Company 소유 문단의 관측 08 종결은
/// 호출자의 retained_extended_field.read가 이미 정확한 프로파일로 검사했다.
pub fn validate(a: std.mem.Allocator, tree: Tree, company_owner: usize) !void {
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var instances: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer instances.deinit(a);
    for (links.items) |link| {
        if (link.code != 3) continue;
        const header = tree.nodes[link.control_node].record.value.control_header;
        const field = try @import("../body/field_start.zig").Properties.parse(header.properties);
        const entry = try instances.getOrPut(a, field.instance_id);
        if (entry.found_existing) return error.DuplicateFieldInstance;
    }
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .header or index == company_owner) continue;
        const children = try @import("../body/paragraph_children.zig").collect(tree, index);
        const text = children.text_node orelse continue;
        // 다른 문단에 고아 종결이나 문단 밖 필드 짝을 보존한 채 편집하지 않는다.
        // 기존 공통 scanner만 재사용하며 Company 종결 예외를 전역으로 넓히지 않는다.
        try @import("../body/field_span.zig").validateLocal(tree.nodes[text].record.value.text.raw);
    }
}
