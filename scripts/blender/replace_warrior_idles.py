import bpy
import math
import os
import sys
from mathutils import Matrix


ACTION_NAMES = (
    "idle_sword",
    "lobby_dwarf_idle",
)


def arguments():
    if "--" not in sys.argv:
        raise RuntimeError(
            "Expected: -- <standing.fbx> <dwarf.fbx> <output.blend>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise RuntimeError("Expected two FBX files and one output blend")
    return values


def remove_action(target, name):
    action = bpy.data.actions.get(name)
    if action is None:
        return
    animation_data = target.animation_data
    if animation_data and animation_data.action == action:
        animation_data.action = None
    if animation_data:
        for track in list(animation_data.nla_tracks):
            for strip in list(track.strips):
                if strip.action == action:
                    track.strips.remove(strip)
            if not track.strips:
                animation_data.nla_tracks.remove(track)
    bpy.data.actions.remove(action)


def remove_imported_objects(imported_objects):
    imported_data = []
    for obj in imported_objects:
        if obj.data is not None:
            imported_data.append((obj.type, obj.data))
        bpy.data.objects.remove(obj, do_unlink=True)
    for object_type, data in imported_data:
        if data.users != 0:
            continue
        if object_type == "ARMATURE":
            bpy.data.armatures.remove(data)
        elif object_type == "MESH":
            bpy.data.meshes.remove(data)
        elif object_type == "EMPTY":
            continue


def retarget_action(target, source_path, action_name):
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=source_path, automatic_bone_orientation=False)
    imported_objects = [obj for obj in bpy.data.objects if obj not in before_objects]
    source = next((obj for obj in imported_objects if obj.type == "ARMATURE"), None)
    if source is None:
        raise RuntimeError(f"No armature in {source_path}")
    source_action = source.animation_data.action if source.animation_data else None
    if source_action is None:
        raise RuntimeError(f"No action in {source_path}")

    mapping = [
        (source.pose.bones.get(bone.name), target.pose.bones.get(bone.name))
        for bone in target.data.bones
    ]
    mapping = [(source_bone, target_bone) for source_bone, target_bone in mapping if source_bone and target_bone]
    if len(mapping) != len(target.data.bones):
        raise RuntimeError(
            f"{action_name}: expected {len(target.data.bones)} mapped bones, got {len(mapping)}"
        )

    remove_action(target, action_name)
    action = bpy.data.actions.new(action_name)
    action.use_fake_user = True
    action.asset_mark()
    slot = action.slots.new("OBJECT", target.name)
    animation_data = target.animation_data_create()
    animation_data.action = action
    animation_data.action_slot = slot

    scene = bpy.context.scene
    start = math.floor(source_action.frame_range[0])
    end = math.ceil(source_action.frame_range[1])
    source.animation_data.action = source_action
    target_world_rotation = target.matrix_world.to_quaternion()

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for pose_bone in target.pose.bones:
            pose_bone.rotation_mode = "QUATERNION"
            pose_bone.matrix_basis.identity()
        bpy.context.view_layer.update()

        for source_bone, target_bone in mapping:
            source_rest_world = (source.matrix_world @ source_bone.bone.matrix_local).to_quaternion()
            source_pose_world = (source.matrix_world @ source_bone.matrix).to_quaternion()
            source_delta_world = source_pose_world @ source_rest_world.inverted()
            target_rest_world = (target.matrix_world @ target_bone.bone.matrix_local).to_quaternion()
            desired_world = source_delta_world @ target_rest_world
            desired_armature_rotation = target_world_rotation.inverted() @ desired_world
            current = target_bone.matrix.copy()
            target_bone.matrix = Matrix.LocRotScale(
                current.translation,
                desired_armature_rotation,
                current.to_scale(),
            )
            bpy.context.view_layer.update()

        for pose_bone in target.pose.bones:
            pose_bone.keyframe_insert("location", frame=frame, group=pose_bone.name)
            pose_bone.keyframe_insert("rotation_quaternion", frame=frame, group=pose_bone.name)
            pose_bone.keyframe_insert("scale", frame=frame, group=pose_bone.name)

    action.use_frame_range = True
    action.frame_start = start
    action.frame_end = end
    action.use_cyclic = True

    remove_imported_objects(imported_objects)
    for imported_action in [candidate for candidate in bpy.data.actions if candidate not in before_actions and candidate != action]:
        bpy.data.actions.remove(imported_action)

    return {
        "name": action_name,
        "frames": [start, end],
        "mapped_bones": len(mapping),
        "source": source_path,
    }


standing_path, dwarf_path, output_path = arguments()
source_paths = (standing_path, dwarf_path)
for source_path in source_paths:
    if not os.path.isfile(source_path):
        raise RuntimeError(f"FBX not found: {source_path}")

target = bpy.data.objects.get("Armature")
if target is None or target.type != "ARMATURE":
    raise RuntimeError("Target Armature not found")
sword = bpy.data.objects.get("sword")
if sword is None or sword.parent != target or sword.parent_bone != "mixamorig:RightHand":
    raise RuntimeError("Expected sword parented to mixamorig:RightHand")

bpy.context.scene.render.fps = 30
reports = []
for action_name, source_path in zip(ACTION_NAMES, source_paths):
    reports.append(retarget_action(target, source_path, action_name))

animation_data = target.animation_data_create()
animation_data.action = bpy.data.actions["idle_sword"]
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = math.ceil(bpy.data.actions["idle_sword"].frame_range[1])
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=output_path)

result = {
    "file": output_path,
    "actions": reports,
    "action_count": len(bpy.data.actions),
    "objects": sorted(obj.name for obj in bpy.data.objects),
}
print("WARRIOR_IDLES_REPLACED=" + repr(result))
