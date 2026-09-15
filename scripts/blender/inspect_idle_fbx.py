import bpy
import json
import sys


def argument_after_separator():
    if "--" not in sys.argv:
        raise RuntimeError("Pass the FBX path after --")
    return sys.argv[sys.argv.index("--") + 1]


bpy.ops.wm.read_factory_settings(use_empty=True)
fbx_path = argument_after_separator()
bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=False)

armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
payload = {
    "objects": [
        {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in bpy.context.scene.objects
    ],
    "armatures": [
        {
            "name": obj.name,
            "bones": [bone.name for bone in obj.data.bones],
            "action": obj.animation_data.action.name
            if obj.animation_data and obj.animation_data.action
            else None,
        }
        for obj in armatures
    ],
    "actions": [
        {
            "name": action.name,
            "frame_range": [float(action.frame_range[0]), float(action.frame_range[1])],
            "slots": [slot.identifier for slot in action.slots],
        }
        for action in bpy.data.actions
    ],
}
print("IDLE_FBX_AUDIT=" + json.dumps(payload, ensure_ascii=False))
