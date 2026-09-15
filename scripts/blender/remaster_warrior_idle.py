import bpy
import math
import os
import sys
from mathutils import Matrix


BONE_MAP = [
    ("CC_Base_Hip", "mixamorig:Hips"),
    ("CC_Base_Waist", "mixamorig:Spine"),
    ("CC_Base_Spine01", "mixamorig:Spine1"),
    ("CC_Base_Spine02", "mixamorig:Spine2"),
    ("CC_Base_NeckTwist02", "mixamorig:Neck"),
    ("CC_Base_Head", "mixamorig:Head"),
    ("CC_Base_L_Clavicle", "mixamorig:LeftShoulder"),
    ("CC_Base_L_Upperarm", "mixamorig:LeftArm"),
    ("CC_Base_L_Forearm", "mixamorig:LeftForeArm"),
    ("CC_Base_L_Hand", "mixamorig:LeftHand"),
    ("CC_Base_R_Clavicle", "mixamorig:RightShoulder"),
    ("CC_Base_R_Upperarm", "mixamorig:RightArm"),
    ("CC_Base_R_Forearm", "mixamorig:RightForeArm"),
    ("CC_Base_R_Hand", "mixamorig:RightHand"),
    ("CC_Base_L_Thigh", "mixamorig:LeftUpLeg"),
    ("CC_Base_L_Calf", "mixamorig:LeftLeg"),
    ("CC_Base_L_Foot", "mixamorig:LeftFoot"),
    ("CC_Base_L_ToeBase", "mixamorig:LeftToeBase"),
    ("CC_Base_R_Thigh", "mixamorig:RightUpLeg"),
    ("CC_Base_R_Calf", "mixamorig:RightLeg"),
    ("CC_Base_R_Foot", "mixamorig:RightFoot"),
    ("CC_Base_R_ToeBase", "mixamorig:RightToeBase"),
]

FINGER_MAP = {
    "Thumb": "Thumb",
    "Index": "Index",
    "Mid": "Middle",
    "Ring": "Ring",
}


def arguments():
    if "--" not in sys.argv:
        raise RuntimeError("Expected: -- <idle.fbx> <output.blend>")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise RuntimeError("Expected exactly two arguments: idle FBX and output blend")
    return values


def complete_bone_map():
    result = list(BONE_MAP)
    for side in ("L", "R"):
        target_side = "Left" if side == "L" else "Right"
        for source_finger, target_finger in FINGER_MAP.items():
            for segment in (1, 2, 3):
                result.append(
                    (
                        f"CC_Base_{side}_{source_finger}{segment}",
                        f"mixamorig:{target_side}Hand{target_finger}{segment}",
                    )
                )
    return result


def remove_existing_idle(target):
    idle = bpy.data.actions.get("idle_sword")
    if idle is None:
        return
    if target.animation_data and target.animation_data.action == idle:
        target.animation_data.action = None
    for track in target.animation_data.nla_tracks if target.animation_data else []:
        for strip in list(track.strips):
            if strip.action == idle:
                track.strips.remove(strip)
    bpy.data.actions.remove(idle)


def create_preview_collection(sword):
    old = bpy.data.collections.get("VFX_PREVIEW")
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    collection = bpy.data.collections.new("VFX_PREVIEW")
    bpy.context.scene.collection.children.link(collection)
    collection.hide_render = True
    collection["exclude_from_gltf"] = True

    material = bpy.data.materials.get("VFX_Preview_Fire") or bpy.data.materials.new("VFX_Preview_Fire")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (1.0, 0.12, 0.01, 1.0)
    emission.inputs["Strength"].default_value = 8.0
    links.new(emission.outputs["Emission"], output.inputs["Surface"])

    mesh = bpy.data.meshes.new("VFX_Preview_RibbonMesh")
    mesh.from_pydata(
        [(0, 0, 0), (0, 0.06, 0), (0, 1.55, 0), (0, 1.55, 0.12)],
        [],
        [(0, 1, 2, 3)],
    )
    ribbon = bpy.data.objects.new("VFX_Preview_Ribbon", mesh)
    ribbon.data.materials.append(material)
    collection.objects.link(ribbon)
    ribbon.parent = sword
    ribbon.hide_viewport = True


fbx_path, output_path = arguments()
target = bpy.data.objects.get("Armature")
if target is None or target.type != "ARMATURE":
    raise RuntimeError("Target Armature not found")
sword = bpy.data.objects.get("sword")
if sword is None or sword.parent != target or sword.parent_bone != "mixamorig:RightHand":
    raise RuntimeError("Expected sword parented to mixamorig:RightHand")

before_objects = set(bpy.data.objects)
before_actions = set(bpy.data.actions)
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=False)
imported_objects = [obj for obj in bpy.data.objects if obj not in before_objects]
source = next((obj for obj in imported_objects if obj.type == "ARMATURE"), None)
if source is None:
    raise RuntimeError("Idle FBX contains no armature")
source_action = source.animation_data.action if source.animation_data else None
if source_action is None:
    raise RuntimeError("Idle FBX contains no action")

mapping = [
    (source.pose.bones.get(source_name), target.pose.bones.get(target_name))
    for source_name, target_name in complete_bone_map()
]
mapping = [(source_bone, target_bone) for source_bone, target_bone in mapping if source_bone and target_bone]
if len(mapping) < 40:
    raise RuntimeError(f"Retarget mapping too small: {len(mapping)} bones")

remove_existing_idle(target)
idle = bpy.data.actions.new("idle_sword")
slot = idle.slots.new("OBJECT", target.name)
animation_data = target.animation_data_create()
animation_data.action = idle
animation_data.action_slot = slot

scene = bpy.context.scene
scene.render.fps = 30
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

idle.use_frame_range = True
idle.frame_start = start
idle.frame_end = end
idle.use_cyclic = True
idle.asset_mark()

for obj in imported_objects:
    bpy.data.objects.remove(obj, do_unlink=True)
for action in [action for action in bpy.data.actions if action not in before_actions and action != idle]:
    bpy.data.actions.remove(action)

create_preview_collection(sword)
animation_data.action = idle
scene.frame_start = start
scene.frame_end = end
scene.frame_set(start)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=output_path)
print(f"WARRIOR_IDLE_REMAPPED={output_path}|frames={start}-{end}|bones={len(mapping)}")
