const common = @import("affine_root_location.zig");
pub const Location = common.Location;
pub const locate = common.With(@import("normalized_power_level.zig").Root, @import("normalized_power_root_compare.zig")).locate;
pub const Wide = common.With(@import("normalized_power_level.zig").Wide.Root, @import("normalized_power_root_compare.zig").Wide);
