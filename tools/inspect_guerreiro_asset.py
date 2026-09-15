import pathlib
import sys

import bmesh
import bpy


EXPECTED_ACTIONS = {
    "Idle",
    "Walking",
    "Running",
    "Reaction",
    "AttackHorizontal",
    "JumpAttack",
    "Death",
}
EXPECTED_BONES = 65
EXPECTED_EQUIPMENT = {
    "Equip_Capacete",
    "Equip_Peito",
    "Equip_Luva",
    "Equip_Calca",
    "Equip_Bota",
}


def fail(message: str) -> None:
    print(f"GUERREIRO_ASSET_ERROR {message}")
    raise SystemExit(1)


def material_has_image(material: bpy.types.Material) -> bool:
    return bool(
        material
        and material.use_nodes
        and material.node_tree
        and any(node.type == "TEX_IMAGE" and node.image for node in material.node_tree.nodes)
    )


def mesh_is_skinned(mesh: bpy.types.Object, armature: bpy.types.Object) -> bool:
    return mesh.parent == armature or any(
        modifier.type == "ARMATURE" and modifier.object == armature
        for modifier in mesh.modifiers
    )


def loose_vertex_count(mesh: bpy.types.Object) -> int:
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    count = sum(
        1 for vertex in bm.verts if not vertex.link_edges and not vertex.link_faces
    )
    bm.free()
    return count


def load_asset(asset: pathlib.Path) -> None:
    if asset.suffix.lower() == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(asset))
    elif asset.suffix.lower() in {".glb", ".gltf"}:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(asset))
    else:
        fail(f"Unsupported asset extension: {asset.suffix}")


def main() -> None:
    if "--" not in sys.argv:
        fail("Usage: blender --background --python tools/inspect_guerreiro_asset.py -- <asset>")
    asset = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    if not asset.is_file():
        fail(f"Asset does not exist: {asset}")

    load_asset(asset)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    all_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    meshes = [
        obj
        for obj in all_meshes
        if not (
            obj.name.startswith("Icosphere")
            and obj.parent is None
            and not obj.data.materials
            and not obj.vertex_groups
        )
    ]
    if len(armatures) != 1:
        fail(f"Expected one armature, found {len(armatures)}")
    armature = armatures[0]
    if len(armature.data.bones) != EXPECTED_BONES:
        fail(f"Expected {EXPECTED_BONES} bones, found {len(armature.data.bones)}")
    if not meshes:
        fail("No meshes found")

    unskinned = [mesh.name for mesh in meshes if not mesh_is_skinned(mesh, armature)]
    if unskinned:
        fail(f"Unskinned meshes: {unskinned}")
    without_material = [mesh.name for mesh in meshes if not mesh.data.materials]
    if without_material:
        fail(f"Meshes without materials: {without_material}")
    without_images = [
        mesh.name
        for mesh in meshes
        if not any(material_has_image(material) for material in mesh.data.materials)
    ]
    if without_images:
        fail(f"Meshes without image textures: {without_images}")
    loose_vertices = sum(loose_vertex_count(mesh) for mesh in meshes)
    if loose_vertices:
        fail(f"Found {loose_vertices} loose vertices")
    invalid_meshes = []
    for mesh in meshes:
        mesh_copy = mesh.data.copy()
        is_invalid = mesh_copy.validate(clean_customdata=True)
        bpy.data.meshes.remove(mesh_copy)
        if is_invalid:
            invalid_meshes.append(mesh.name)
    if invalid_meshes:
        fail(f"Invalid meshes: {invalid_meshes}")
    excess_influences = sum(
        1
        for mesh in meshes
        for vertex in mesh.data.vertices
        if sum(1 for membership in vertex.groups if membership.weight > 0.000001) > 4
    )
    if excess_influences:
        fail(f"Found {excess_influences} vertices with more than four influences")

    is_full_asset = asset.suffix.lower() == ".blend" or asset.stem.lower() == "guerreiro"
    actions = {action.name for action in bpy.data.actions}
    mesh_names = {mesh.name for mesh in meshes}
    if is_full_asset:
        missing_actions = EXPECTED_ACTIONS - actions
        if missing_actions:
            fail(f"Missing actions: {sorted(missing_actions)}; found: {sorted(actions)}")
        unexpected_actions = actions - EXPECTED_ACTIONS
        if unexpected_actions:
            fail(f"Unexpected actions: {sorted(unexpected_actions)}")
        missing_equipment = EXPECTED_EQUIPMENT - mesh_names
        if missing_equipment:
            fail(
                f"Missing equipment: {sorted(missing_equipment)}; "
                f"found meshes: {sorted(mesh_names)}"
            )
        if "Guerreiro_Corpo" not in mesh_names:
            fail(f"Missing Guerreiro_Corpo; found meshes: {sorted(mesh_names)}")
        if len(meshes) != 6:
            fail(f"Expected six meshes in full asset, found {len(meshes)}")
    else:
        expected_name = {
            "capacete": "Equip_Capacete",
            "peito": "Equip_Peito",
            "luva": "Equip_Luva",
            "calca": "Equip_Calca",
            "bota": "Equip_Bota",
        }.get(asset.stem.lower())
        if expected_name is None:
            fail(f"Unknown individual equipment filename: {asset.name}")
        if mesh_names != {expected_name}:
            fail(f"Expected only {expected_name}, found meshes: {sorted(mesh_names)}")
        if actions:
            fail(f"Individual equipment must not contain animations: {sorted(actions)}")

    print(
        "GUERREIRO_ASSET_OK",
        f"file={asset}",
        f"size={asset.stat().st_size}",
        f"armature={armature.name}",
        f"bones={len(armature.data.bones)}",
        f"meshes={sorted(mesh_names)}",
        f"vertices={sum(len(mesh.data.vertices) for mesh in meshes)}",
        f"loose_vertices={loose_vertices}",
        f"actions={sorted(actions)}",
    )


if __name__ == "__main__":
    main()
