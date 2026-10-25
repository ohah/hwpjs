const profiles = Object.freeze([
  Object.freeze({ version: 0x05000107, baseExtra: 0, prefix: "base73", layout: "absent_base73", opacity: false, instance: false }),
  Object.freeze({ version: 0x05000204, baseExtra: 1, prefix: "with_opacity74", layout: "absent_opacity74", opacity: true, instance: false }),
  Object.freeze({ version: 0x05000204, baseExtra: 5, prefix: "with_instance78", layout: "absent_instance78", opacity: true, instance: true }),
]);

const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
function selectedSourceMatches(profile, source) {
  return source?.extra_bytes === 0
    && (profile.opacity ? uint(source.border_opacity) && source.border_opacity <= 255 : source.border_opacity === null)
    && (profile.instance ? uint(source.instance_id) : source.instance_id === null);
}

export function hwp5PictureAbsentVersion(version) {
  return profiles.some(profile => profile.version === version);
}

// Recognize exact observed base-prefix remainders, or an already selected
// native prefix. Unknown suffixes never trigger a parser fallback.
export function hwp5PictureAbsentProfile(version, source) {
  return profiles.find(profile => profile.version === version && (selectedSourceMatches(profile, source)
    || source?.border_opacity === null && source.instance_id === null && source.extra_bytes === profile.baseExtra)) ?? null;
}

export function hwp5PictureAbsentSourceMatches(proof, source) {
  const profile = profiles.find(profile => profile.version === proof?.fileVersion && profile.layout === proof.layout);
  return Boolean(profile && selectedSourceMatches(profile, source));
}

const baseFields = ["component_node", "owner_node", "picture_node", "border_color", "border_width", "border_attributes",
  "points", "crop", "margins", "contrast", "brightness", "effect", "bin_data_id"];
export function hwp5PictureBaseMatches(base, selected) {
  return baseFields.every(field => JSON.stringify(base[field]) === JSON.stringify(selected[field]));
}
