import bpy
import math
import os
import sys
from mathutils import Vector


if "--" not in sys.argv:
    raise RuntimeError("Expected: -- <output-directory> <action-name>")
args = sys.argv[sys.argv.index("--") + 1 :]
output_dir, action_name = args
os.makedirs(output_dir, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 640
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world.color = (0.018, 0.014, 0.01)

armature = bpy.data.objects["Armature"]
armature.animation_data_create().action = bpy.data.actions[action_name]
action = bpy.data.actions[action_name]

preview = bpy.data.collections.get("VFX_PREVIEW")
if preview:
    preview.hide_render = True

camera_data = bpy.data.cameras.new("QA_Camera")
camera = bpy.data.objects.new("QA_Camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 58

minimum = Vector((float("inf"),) * 3)
maximum = Vector((float("-inf"),) * 3)
for obj in (item for item in scene.objects if item.type == "MESH" and not item.name.startswith("VFX_Preview")):
    for corner in obj.bound_box:
        point = obj.matrix_world @ Vector(corner)
        minimum.x = min(minimum.x, point.x)
        minimum.y = min(minimum.y, point.y)
        minimum.z = min(minimum.z, point.z)
        maximum.x = max(maximum.x, point.x)
        maximum.y = max(maximum.y, point.y)
        maximum.z = max(maximum.z, point.z)
target = (minimum + maximum) * 0.5
radius = max(maximum - minimum)
camera_data.clip_start = max(radius * 0.005, 0.00001)
camera_data.clip_end = radius * 1000
camera.location = target + Vector((1.35, -3.8, 1.1)) * radius
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()

def add_area(name, location, energy, color, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


add_area("QA_Key", target + Vector((-2.5, -3.0, 4.0)) * radius, 0.000009, (1.0, 0.48, 0.18), radius * 3)
add_area("QA_Fill", target + Vector((3.0, -2.0, 2.0)) * radius, 0.0000065, (0.72, 0.82, 1.0), radius * 2)
add_area("QA_Rim", target + Vector((0.0, 3.0, 3.0)) * radius, 0.000008, (1.0, 0.25, 0.08), radius * 2)

start = math.floor(action.frame_range[0])
end = math.ceil(action.frame_range[1])
for label, frame in (("start", start), ("middle", (start + end) // 2), ("end", end)):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(output_dir, f"{action_name}-{label}.png")
    bpy.ops.render.render(write_still=True)

print(f"WARRIOR_PREVIEW={output_dir}|action={action_name}")
