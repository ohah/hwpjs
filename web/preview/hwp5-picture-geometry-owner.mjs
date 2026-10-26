import { projectHwp5GroupGeometry } from './hwp5-group-geometry-projection.mjs';
export function hwp5PictureGeometryOwner(content, item) {
  const roots = (content.hwp5Drawings ?? []).filter(
    (row) => row.section === item.section && row.componentNode === item.pictureNode,
  );
  if (roots.length === 1) {
    const root = roots[0];
    if (root.source.kind_id !== 0x24706963 || root.controlNode !== item.source.owner_node)
      throw new Error('Hwp5PictureGeometryOwnerMismatch');
    return {
      root,
      grouped: false,
      anchorNode: item.pictureNode,
      attributes: root.source.component_attributes,
      angle: root.source.rotation_angle,
    };
  }
  if (roots.length) throw new Error('AmbiguousHwp5PictureGeometryOwner');
  const groups = projectHwp5GroupGeometry(content);
  if (groups.state !== 'projected') throw new Error(groups.error);
  const bindings = groups.pictureBindings.filter(
    (row) => row.section === item.section && row.pictureNode === item.pictureNode,
  );
  if (bindings.length !== 1) throw new Error('MissingHwp5GroupedPictureBinding');
  const binding = bindings[0];
  if (binding.parentContainer !== item.source.owner_node)
    throw new Error('Hwp5PictureGeometryOwnerMismatch');
  if (binding.parentContainer !== binding.rootAnchor)
    throw new Error('UnsupportedNestedHwp5Picture');
  const anchors = content.hwp5Drawings.filter(
    (row) => row.section === item.section && row.componentNode === binding.rootAnchor,
  );
  if (anchors.length !== 1) throw new Error('MissingHwp5GroupRootAnchor');
  return {
    root: anchors[0],
    grouped: true,
    anchorNode: binding.rootAnchor,
    attributes: binding.component.attributes,
    angle: binding.component.rotation_angle,
  };
}
