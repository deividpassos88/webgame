import pathlib
import sys

import bpy


EXPECTED_MESHES = {
    "Guerreiro_Corpo",
    "Equip_Capacete",
    "Equip_Peito",
    "Equip_Luva",
    "Equip_Calca",
    "Equip_Bota",
}


def fail(message: str) -> None:
    print(f"GUERREIRO_VISUAL_VALIDATION_ERROR {message}")
    raise SystemExit(1)


def main() -> None:
    if "--" not in sys.argv or len(sys.argv) < sys.argv.index("--") + 3:
        fail("usage: blender --background --python validator.py -- blend preview")

    arguments = sys.argv[sys.argv.index("--") + 1 :]
    blend_path = pathlib.Path(arguments[0]).resolve()
    preview_path = pathlib.Path(arguments[1]).resolve()
    if not blend_path.is_file():
        fail(f"missing blend: {blend_path}")
    if not preview_path.is_file() or preview_path.stat().st_size < 100_000:
        fail(f"missing or incomplete preview: {preview_path}")

    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    mesh_names = {obj.name for obj in bpy.data.objects if obj.type == "MESH"}
    if mesh_names != EXPECTED_MESHES:
        fail(f"unexpected meshes: {sorted(mesh_names)}")
    if any(obj.type == "ARMATURE" for obj in bpy.data.objects):
        fail("static visual must not contain an armature")
    if bpy.data.actions:
        fail(f"static visual contains actions: {[action.name for action in bpy.data.actions]}")

    for mesh_name in EXPECTED_MESHES:
        mesh = bpy.data.objects[mesh_name]
        if not mesh.data.materials:
            fail(f"{mesh_name} has no material")
        if len(mesh.data.vertices) == 0 or len(mesh.data.polygons) == 0:
            fail(f"{mesh_name} has no renderable geometry")

    print(
        "GUERREIRO_VISUAL_VALIDATION_OK",
        f"blend={blend_path}",
        f"preview={preview_path}",
        f"meshes={sorted(mesh_names)}",
        f"materials={len(bpy.data.materials)}",
        f"images={len(bpy.data.images)}",
    )


if __name__ == "__main__":
    main()
