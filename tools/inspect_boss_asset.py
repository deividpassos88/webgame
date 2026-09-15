import pathlib
import sys

import bmesh
import bpy


EXPECTED_ACTIONS = {
    "idle",
    "walking",
    "running",
    "attack_meteors",
    "attack_dash",
    "death",
    "jump_circle",
    "jump_rectangle",
}


def fail(message: str) -> None:
    print(f"BOSS_ASSET_ERROR {message}")
    raise SystemExit(1)


def action_frame_range(action: bpy.types.Action) -> tuple[float, float]:
    start, end = action.frame_range
    return float(start), float(end)


def main() -> None:
    if "--" not in sys.argv:
        fail("Usage: blender --background --python tools/inspect_boss_asset.py -- <asset>")
    asset = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    if not asset.is_file():
        fail(f"Asset does not exist: {asset}")

    if asset.suffix.lower() == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(asset))
    elif asset.suffix.lower() in {".glb", ".gltf"}:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(asset))
    else:
        fail(f"Unsupported asset extension: {asset.suffix}")

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    all_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1:
        fail(f"Expected one armature, found {len(armatures)}")
    if len(armatures[0].data.bones) != 81:
        fail(f"Expected 81 bones, found {len(armatures[0].data.bones)}")
    meshes = [
        obj
        for obj in all_meshes
        if obj.parent == armatures[0]
        or any(
            modifier.type == "ARMATURE" and modifier.object == armatures[0]
            for modifier in obj.modifiers
        )
    ]
    if len(meshes) != 1:
        fail(f"Expected one skinned runtime mesh, found {[obj.name for obj in meshes]}")

    actions = {action.name: action for action in bpy.data.actions}
    missing = EXPECTED_ACTIONS - set(actions)
    if missing:
        fail(f"Missing actions: {sorted(missing)}; found: {sorted(actions)}")
    empty = [
        name
        for name in EXPECTED_ACTIONS
        if action_frame_range(actions[name])[1] <= action_frame_range(actions[name])[0]
    ]
    if empty:
        fail(f"Actions without duration: {sorted(empty)}")

    loose_vertices = 0
    for mesh in meshes:
        bm = bmesh.new()
        bm.from_mesh(mesh.data)
        loose_vertices += sum(
            1 for vertex in bm.verts if not vertex.link_edges and not vertex.link_faces
        )
        bm.free()
    if loose_vertices:
        fail(f"Found {loose_vertices} loose vertices")
    print(
        "BOSS_ASSET_OK",
        f"file={asset.name}",
        f"size={asset.stat().st_size}",
        f"armature={armatures[0].name}",
        "bones=81",
        f"meshes={len(meshes)}",
        f"vertices={sum(len(mesh.data.vertices) for mesh in meshes)}",
        f"loose_vertices={loose_vertices}",
        "actions=" + repr(
            sorted(
                (name, tuple(round(value, 3) for value in action_frame_range(actions[name])))
                for name in EXPECTED_ACTIONS
            )
        ),
    )


if __name__ == "__main__":
    main()
