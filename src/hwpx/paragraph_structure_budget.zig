//! Document-wide current site/text budgets shared by topology transactions.
const editor = @import("editor_session.zig");

pub fn validate(sections: []const editor.Section, options: editor.Options) !void {
    var text_bytes: usize = 0;
    var sites: usize = 0;
    for (sections) |section| {
        text_bytes += try section.textBytes(options.max_text_bytes -| text_bytes);
        if (section.structure_values) |values| {
            for (values.paragraphs) |paragraph| try addSites(paragraph.sites.items.len, &sites, options.max_sites);
        } else try addSites(section.sites.items.len, &sites, options.max_sites);
    }
}

fn addSites(count: usize, total: *usize, limit: usize) !void {
    if (count > limit -| total.*) return error.LimitExceeded;
    total.* += count;
}
