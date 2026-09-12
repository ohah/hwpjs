const Tree = @import("tree.zig").Tree;
const video = @import("video_data.zig");

pub const Report = struct {
    records: usize = 0,
    parsed: usize = 0,
    unselected: usize = 0,
    unselected_bytes: usize = 0,
    local: usize = 0,
    web: usize = 0,
    pending_owners: usize = 0,
    pending_references: usize = 0,
    extra_bytes: usize = 0,
};

/// Table 123 payload inspection only. No inferred owner ID, reference indexing,
/// or common-object prefix. Null preserves records without claiming validation.
pub fn inspect(tree: Tree, layout: ?video.WebLayout) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.framing.tag != video.tag) continue;
        report.records += 1;
        report.pending_owners += 1;
        const bytes = node.record.framing.payload;
        if (layout) |selected| {
            const parsed = try video.Video.parse(bytes, selected);
            report.parsed += 1;
            report.extra_bytes += parsed.extra.len;
            switch (parsed.data) {
                .local => {
                    report.local += 1;
                    report.pending_references += 2;
                },
                .web => {
                    report.web += 1;
                    report.pending_references += 1;
                },
            }
        } else {
            report.unselected += 1;
            report.unselected_bytes += bytes.len;
        }
    }
    return report;
}
