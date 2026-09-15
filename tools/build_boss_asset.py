import pathlib
import shutil
import sys

import bmesh
import bpy


ACTION_FILES = {
    "idle": "Boss parado.fbx",
    "walking": "Walking.fbx",
    "running": "Running.fbx",
    "attack_meteors": "atacando.fbx",
    "attack_dash": "atacando2.fbx",
    "death": "morrendo.fbx",
    "jump_circle": "pulando.fbx",
    "jump_rectangle": "pulando atacando.fbx",
}
MERGE_DISTANCE = 0.0001
MAX_VERTEX_REDUCTION = 0.02
SOFT_GLB_LIMIT = 3 * 1024 * 1024


def fail(message: str) -> None:
    print(f"BOSS_BUILD_ERROR {message}")
    raise SystemExit(1)


def action_curves(action: bpy.types.Action):
    if not action.is_action_layered:
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                curves.extend(channelbag.fcurves)
    return curves


def make_horizontal_motion_in_place(action: bpy.types.Action) -> None:
    for curve in action_curves(action):
        is_hips_location = (
            curve.data_path == 'pose.bones["mixamorig:Hips"].location'
        )
        is_object_location = curve.data_path == "location"
        if not (is_hips_location or is_object_location):
            continue
        if curve.array_index not in {0, 2} or not curve.keyframe_points:
            continue
        first_value = float(curve.keyframe_points[0].co[1])
        for keyframe in curve.keyframe_points:
            keyframe.co[1] -= first_value
            keyframe.handle_left[1] -= first_value
            keyframe.handle_right[1] -= first_value


def import_fbx(path: pathlib.Path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True)
    return [obj for obj in bpy.context.scene.objects if obj not in before]


def imported_armature(objects, filename: str) -> bpy.types.Object:
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        fail(f"{filename}: expected one armature, found {len(armatures)}")
    return armatures[0]


def current_action(armature: bpy.types.Object, filename: str) -> bpy.types.Action:
    animation_data = armature.animation_data
    action = animation_data.action if animation_data else None
    if action is None:
        fail(f"{filename}: imported armature has no Action")
    return action


def remove_objects(objects) -> None:
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def clean_mesh(mesh_object: bpy.types.Object) -> tuple[int, int]:
    mesh = mesh_object.data
    before = len(mesh.vertices)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=MERGE_DISTANCE)
    loose = [vertex for vertex in bm.verts if not vertex.link_edges and not vertex.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    after = len(mesh.vertices)
    if before > 0 and (before - after) / before > MAX_VERTEX_REDUCTION:
        fail(f"Mesh cleanup removed too many vertices: {before} -> {after}")
    return before, after


def add_nla_tracks(armature: bpy.types.Object, actions: dict[str, bpy.types.Action]) -> None:
    animation_data = armature.animation_data_create()
    animation_data.action = None
    while animation_data.nla_tracks:
        animation_data.nla_tracks.remove(animation_data.nla_tracks[0])
    for name, action in actions.items():
        track = animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(action.frame_range[0]), action)
        strip.name = name


def select_runtime_objects(armature: bpy.types.Object, meshes) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature


def export_glb(path: pathlib.Path, armature: bpy.types.Object, meshes, image_size: int) -> None:
    for image in bpy.data.images:
        if image.name in {"Render Result", "Viewer Node"} or not image.has_data:
            continue
        width, height = image.size
        if width > image_size or height > image_size:
            ratio = min(image_size / width, image_size / height)
            image.scale(max(1, round(width * ratio)), max(1, round(height * ratio)))
    select_runtime_objects(armature, meshes)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_image_format="WEBP",
        export_image_quality=75,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )


def main() -> None:
    if "--" not in sys.argv:
        fail("Usage: blender --background --python tools/build_boss_asset.py -- <source-dir>")
    source_dir = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    missing = [filename for filename in ACTION_FILES.values() if not (source_dir / filename).is_file()]
    if missing:
        fail(f"Missing FBX files: {missing}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    main_objects = import_fbx(source_dir / ACTION_FILES["idle"])
    armature = imported_armature(main_objects, ACTION_FILES["idle"])
    bone_names = tuple(bone.name for bone in armature.data.bones)
    if len(bone_names) != 81:
        fail(f"Main armature has {len(bone_names)} bones instead of 81")
    meshes = [
        obj
        for obj in main_objects
        if obj.type == "MESH"
        and (
            obj.parent == armature
            or any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in obj.modifiers)
        )
    ]
    if len(meshes) != 1:
        fail(f"Expected one skinned main mesh, found {[obj.name for obj in meshes]}")
    for obj in list(main_objects):
        if obj != armature and obj not in meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    actions: dict[str, bpy.types.Action] = {}
    idle_action = current_action(armature, ACTION_FILES["idle"])
    idle_action.name = "idle"
    idle_action.use_fake_user = True
    make_horizontal_motion_in_place(idle_action)
    actions["idle"] = idle_action

    for name, filename in ACTION_FILES.items():
        if name == "idle":
            continue
        imported = import_fbx(source_dir / filename)
        temporary_armature = imported_armature(imported, filename)
        imported_bones = tuple(bone.name for bone in temporary_armature.data.bones)
        if imported_bones != bone_names:
            fail(f"{filename}: bone names/order differ from the main rig")
        source_action = current_action(temporary_armature, filename)
        action = source_action.copy()
        action.name = name
        action.use_fake_user = True
        make_horizontal_motion_in_place(action)
        actions[name] = action
        remove_objects(imported)
        if source_action.users == 0:
            bpy.data.actions.remove(source_action)

    add_nla_tracks(armature, actions)
    cleanup_counts = [clean_mesh(mesh) for mesh in meshes]
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    blend_path = source_dir / "Boss-completo.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    glb_path = source_dir / "Boss.glb"
    export_glb(glb_path, armature, meshes, 1024)
    exported_size = glb_path.stat().st_size
    if exported_size > SOFT_GLB_LIMIT:
        backup = source_dir / "Boss-1024.glb"
        shutil.copy2(glb_path, backup)
        export_glb(glb_path, armature, meshes, 512)
        if glb_path.stat().st_size >= backup.stat().st_size:
            shutil.copy2(backup, glb_path)
        backup.unlink(missing_ok=True)

    print(
        "BOSS_BUILD_OK",
        f"blend={blend_path}",
        f"blend_size={blend_path.stat().st_size}",
        f"glb={glb_path}",
        f"glb_size={glb_path.stat().st_size}",
        f"mesh_cleanup={cleanup_counts}",
        f"actions={sorted(actions)}",
    )


if __name__ == "__main__":
    main()
