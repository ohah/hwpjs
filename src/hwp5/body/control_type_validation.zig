const Link = @import("control_links.zig").Link;
const rules = @import("control_rules.zig");
pub const Report = struct { checked: usize = 0, deferred: usize = 0, observed: usize = 0 };
/// Pairing and type compatibility are separate from payload semantic validity.
pub fn inspect(links: []const Link) !Report {
    var report: Report = .{};
    for (links) |link| {
        switch (rules.classifyCode(link.id, link.code)) {
            .specified => report.checked += 1,
            .observed_hidden_comment => report.observed += 1,
            .unknown => report.deferred += 1,
            .invalid => return error.ControlCodeMismatch,
        }
    }
    return report;
}
