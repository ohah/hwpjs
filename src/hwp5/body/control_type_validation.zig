const Link = @import("control_links.zig").Link;
const rules = @import("control_rules.zig");
pub const Report = struct { checked: usize = 0, deferred: usize = 0 };
/// Pairing and type compatibility are separate from payload semantic validity.
pub fn inspect(links: []const Link) !Report {
    var report: Report = .{};
    for (links) |link| {
        if (rules.expectedCode(link.id)) |code| {
            if (link.code != code) return error.ControlCodeMismatch;
            report.checked += 1;
        } else report.deferred += 1;
    }
    return report;
}
