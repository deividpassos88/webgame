import bpy
import os
import sys


if "--" not in sys.argv:
    raise RuntimeError("Expected: -- <output.glb>")
output_path = os.path.abspath(sys.argv[sys.argv.index("--") + 1])

required = {
    "Armature",
    "personagem",
    "sword",
}
missing = sorted(required.difference(bpy.data.objects.keys()))
if missing:
    raise RuntimeError(f"Missing export objects: {missing}")

bpy.ops.object.select_all(action="DESELECT")
for name in required:
    bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects["Armature"]

os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_force_sampling=True,
    export_frame_range=True,
    export_anim_slide_to_zero=True,
    export_skins=True,
    export_morph=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_extras=True,
    export_yup=True,
    export_apply=False,
)

print(f"WARRIOR_GLB={output_path}|bytes={os.path.getsize(output_path)}")
