import bpy
import json
import math
import re


REQUIRED_ACTIONS = {
    "ataque_basico",
    "ataque_giratorio",
    "ataque_giratorio_2",
    "caiu",
    "caminhando",
    "correndo",
    "corte_duplo",
    "idle_sword",
    "lobby_dwarf_idle",
    "morte",
    "pulo_atacando",
    "recebe_dano",
    "triplo_ataque",
}


def action_data_paths(action):
    paths = set()
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                for curve in bag.fcurves:
                    paths.add(curve.data_path)
    return paths


def keyed_pose_bones(action):
    names = set()
    for path in action_data_paths(action):
        match = re.match(r'pose\.bones\["(.+?)"\]', path)
        if match:
            names.add(match.group(1))
    return names


def finite_pose(armature):
    for bone in armature.pose.bones:
        for row in bone.matrix:
            if any(not math.isfinite(value) for value in row):
                return False
    return True


def near_horizontal(vector, degrees=4.0):
    if vector.length < 1e-6:
        return False
    return abs(vector.y) / vector.length <= math.sin(math.radians(degrees))


def is_t_pose_frame(armature):
    names = (
        "mixamorig:LeftArm",
        "mixamorig:LeftForeArm",
        "mixamorig:RightArm",
        "mixamorig:RightForeArm",
    )
    if any(name not in armature.pose.bones for name in names):
        return False
    left_arm, left_forearm, right_arm, right_forearm = (
        armature.pose.bones[name] for name in names
    )
    vectors = [
        left_arm.tail - left_arm.head,
        left_forearm.tail - left_forearm.head,
        right_arm.tail - right_arm.head,
        right_forearm.tail - right_forearm.head,
    ]
    if not all(near_horizontal(vector) for vector in vectors):
        return False
    outward = vectors[0].x > 0 and vectors[1].x > 0 and vectors[2].x < 0 and vectors[3].x < 0
    hands_level = abs(left_forearm.tail.y - right_forearm.tail.y) < 0.035
    mirrored_reach = abs(abs(left_forearm.tail.x) - abs(right_forearm.tail.x)) < 0.05
    return outward and hands_level and mirrored_reach


armature = bpy.data.objects.get("Armature")
if armature is None or armature.type != "ARMATURE":
    raise RuntimeError("Armature object not found")

scene = bpy.context.scene
animation_data = armature.animation_data_create()
original_action = animation_data.action
original_frame = scene.frame_current
reports = []

for action in sorted(bpy.data.actions, key=lambda item: item.name):
    animation_data.action = action
    start = math.floor(action.frame_range[0])
    end = math.ceil(action.frame_range[1])
    invalid_frames = []
    t_pose_frames = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        if not finite_pose(armature):
            invalid_frames.append(frame)
        if is_t_pose_frame(armature):
            t_pose_frames.append(frame)
    reports.append(
        {
            "name": action.name,
            "frame_range": [start, end],
            "keyed_pose_bones": len(keyed_pose_bones(action)),
            "invalid_frames": invalid_frames,
            "t_pose_candidates": t_pose_frames,
        }
    )

animation_data.action = original_action
scene.frame_set(original_frame)
bpy.context.view_layer.update()

names = [report["name"] for report in reports]
payload = {
    "file": bpy.data.filepath,
    "action_count": len(reports),
    "missing_actions": sorted(REQUIRED_ACTIONS.difference(names)),
    "duplicate_names": sorted({name for name in names if names.count(name) > 1}),
    "actions": reports,
}
print("WARRIOR_ACTION_AUDIT=" + json.dumps(payload, ensure_ascii=False))
