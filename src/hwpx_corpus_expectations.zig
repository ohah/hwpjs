// Test-only shard expectations from the independent Python ZIP/XML oracle.
// Keep shared census values here; the oracle remains an independent source.
pub const accepted = [_]usize{ 64, 68, 56, 49, 61, 59, 58, 61 };
pub const rejected_zip = [_]usize{ 1, 3, 0, 2, 0, 0, 0, 0 };
pub const encrypted = [_]usize{ 0, 0, 0, 0, 2, 0, 0, 0 };
pub const sections = [_]usize{ 75, 72, 72, 53, 64, 62, 63, 83 };
pub const paragraphs = [_]usize{ 28740, 20865, 20019, 11680, 44679, 24829, 23614, 40720 };
pub const begin_present = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
// OPF application/xml census from tools/hwpx-manifest-xml-oracle.py.
pub const manifest_xml_entries = [_]usize{ 213, 210, 200, 150, 183, 178, 178, 224 };
pub const manifest_xml_bytes = [_]usize{ 34_898_756, 26_622_158, 26_901_093, 15_149_032, 35_375_005, 31_716_373, 28_854_349, 47_023_837 };
pub const manifest_xml_elements = [_]usize{ 478_758, 357_297, 371_323, 215_713, 477_503, 431_955, 400_730, 651_235 };
pub const manifest_xml_settings = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
pub const manifest_xml_masterpages = [_]usize{ 14, 6, 19, 0, 0, 0, 3, 19 };
// settings.xml census and value sums from tools/hwpx-manifest-xml-oracle.py.
pub const settings_carets = [_]usize{ 60, 64, 53, 48, 58, 57, 54, 61 };
pub const settings_caret_pos_sum = [_]u64{ 1494, 1202, 982, 666, 1579, 681, 1365, 1147 };
pub const settings_config_sets = [_]usize{ 17, 12, 13, 11, 12, 13, 12, 14 };
pub const settings_config_items = [_]usize{ 134, 93, 102, 88, 94, 98, 96, 111 };
pub const settings_short_sum = [_]i64{ 3408, 2401, 2605, 2208, 2408, 2600, 2408, 2804 };
pub const settings_boolean_true = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
pub const settings_unsupported_types = [_]usize{ 0, 0, 0, 0, 0, 0, 0, 0 };
