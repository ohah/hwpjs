const component = @import("shape_component.zig");
const style = @import("drawing_style.zig");
const rules = @import("control_rules.zig");
pub const Options = struct {
    border: @import("shape_border.zig").Layout = .observed13,
    tail: style.TailLayout,
};
pub const Report = struct {
    supported: usize = 0,
    unsupported: usize = 0,
    unselected: usize = 0,
    parsed: usize = 0,
    unknown: usize = 0,
    extra_bytes: usize = 0,
    pub fn add(self: *Report, p: component.Component, options: ?Options) !void {
        const supported = switch (p.id) {
            rules.id("$lin"), rules.id("$rec"), rules.id("$ell"), rules.id("$arc"), rules.id("$pol"), rules.id("$cur") => true,
            else => false,
        };
        if (!supported) {
            self.unsupported += 1;
            return;
        }
        const selected = options orelse {
            self.supported += 1;
            self.unselected += 1;
            return;
        };
        const parsed = try style.Style.parseWithTail(p.extra, selected.border, selected.tail);
        self.supported += 1;
        switch (parsed.tail) {
            .unknown => |raw| {
                self.unknown += 1;
                self.extra_bytes += raw.len;
            },
            .fill_only => |raw| {
                self.parsed += 1;
                self.extra_bytes += raw.len;
            },
            .known => |known| {
                self.parsed += 1;
                self.extra_bytes += known.extra.len;
            },
        }
    }
};
