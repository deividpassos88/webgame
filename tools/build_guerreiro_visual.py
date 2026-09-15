import pathlib
import sys

import bpy
from mathutils import Vector


TOOLS_DIR = pathlib.Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from build_guerreiro_asset import (  # noqa: E402
    EQUIPMENT_FILES,
    current_action,
    import_equipment,
    import_equipment_fbx,
    imported_armature,
    select_active,
)


SOURCE_FILE = "Breathing Idle.fbx"
OUTPUT_BLEND = "Guerreiro-visual-final.blend"
OUTPUT_PREVIEW = "Guerreiro-visual-final.png"


def fail(message: str) -> None:
    print(f"GUERREIRO_VISUAL_BUILD_ERROR {message}")
    raise SystemExit(1)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def import_breathing_source(path: pathlib.Path) -> list[bpy.types.Object]:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, global_scale=1.0)
    return [obj for obj in bpy.context.scene.objects if obj not in before]


def bake_body_pose(body: bpy.types.Object, armature: bpy.types.Object) -> None:
    bpy.context.view_layer.update()
    select_active(body)
    for modifier in [modifier for modifier in body.modifiers if modifier.type == "ARMATURE"]:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    world_matrix = body.matrix_world.copy()
    body.parent = None
    body.matrix_world = world_matrix
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    while body.vertex_groups:
        body.vertex_groups.remove(body.vertex_groups[0])

    if armature.animation_data:
        armature.animation_data_clear()
    bpy.data.objects.remove(armature, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def shift_mesh_z(mesh: bpy.types.Object, amount: float) -> None:
    for vertex in mesh.data.vertices:
        vertex.co.z += amount
    mesh.data.update()


def fit_static_gloves(mesh: bpy.types.Object) -> None:
    negative = [vertex for vertex in mesh.data.vertices if vertex.co.x < 0]
    positive = [vertex for vertex in mesh.data.vertices if vertex.co.x >= 0]
    if not negative or not positive:
        fail("could not separate the two gloves")

    for vertices, side in ((negative, -1), (positive, 1)):
        minimum = Vector(tuple(min(vertex.co[index] for vertex in vertices) for index in range(3)))
        maximum = Vector(tuple(max(vertex.co[index] for vertex in vertices) for index in range(3)))
        size = maximum - minimum
        for vertex in vertices:
            across = (vertex.co.x - minimum.x) / size.x
            depth = (vertex.co.y - minimum.y) / size.y
            length = (vertex.co.z - minimum.z) / size.z
            if side < 0:
                target_x = -0.50 + 0.25 * across
            else:
                target_x = 0.25 + 0.25 * across
            vertex.co = Vector((target_x, -0.20 + 0.40 * depth, 0.72 + 0.50 * length))
    mesh.data.update()


def import_static_gloves(
    path: pathlib.Path, collection: bpy.types.Collection
) -> bpy.types.Object:
    imported = import_equipment_fbx(path)
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(meshes) != 1:
        fail(f"{path.name}: expected one glove mesh, found {[obj.name for obj in meshes]}")
    gloves = meshes[0]
    gloves.name = "Equip_Luva"
    gloves.data.name = "Equip_Luva"
    for source_collection in list(gloves.users_collection):
        source_collection.objects.unlink(gloves)
    collection.objects.link(gloves)
    for obj in imported:
        if obj != gloves:
            bpy.data.objects.remove(obj, do_unlink=True)
    gloves.location = (0.0, 0.0, 0.0)
    gloves.rotation_euler = (0.0, 0.0, 0.0)
    gloves.scale = (1.0, 1.0, 1.0)
    fit_static_gloves(gloves)
    return gloves


def render_final(path: pathlib.Path, meshes: list[bpy.types.Object]) -> None:
    bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[index] for point in bounds) for index in range(3)))
    maximum = Vector(tuple(max(point[index] for point in bounds) for index in range(3)))
    center = (minimum + maximum) * 0.5
    height = maximum.z - minimum.z

    temporary_objects: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_plane_add(size=18, location=(center.x, center.y, minimum.z - 0.015))
    floor = bpy.context.object
    temporary_objects.append(floor)
    floor_material = bpy.data.materials.new("VisualFinal_Floor")
    floor_material.diffuse_color = (0.012, 0.014, 0.02, 1.0)
    floor_material.metallic = 0.05
    floor_material.roughness = 0.68
    floor.data.materials.append(floor_material)

    camera_location = center + Vector((height * 0.62, -height * 1.75, height * 0.22))
    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    temporary_objects.append(camera)
    look_at(camera, (center.x, center.y, minimum.z + height * 0.52))
    camera.data.lens = 62
    bpy.context.scene.camera = camera

    light_specs = (
        ((-0.85, -1.15, 1.45), 1250, 4.0, (1.0, 0.72, 0.50)),
        ((1.10, -0.60, 0.85), 900, 3.0, (0.38, 0.58, 1.0)),
        ((0.20, 0.95, 1.05), 1450, 2.5, (1.0, 0.10, 0.035)),
        ((0.0, 0.0, 1.75), 850, 2.2, (1.0, 0.86, 0.68)),
    )
    for offset, energy, size, color in light_specs:
        location = center + Vector(tuple(component * height for component in offset))
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        temporary_objects.append(light)
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        look_at(light, (center.x, center.y, minimum.z + height * 0.52))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(path)
    scene.render.image_settings.color_depth = "8"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("VisualFinal_World")
    scene.world.color = (0.004, 0.005, 0.009)
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)

    for obj in temporary_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.materials.remove(floor_material)


def main() -> None:
    if "--" not in sys.argv:
        fail("usage: blender --background --python build_guerreiro_visual.py -- source-dir")
    source_dir = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    source_path = source_dir / SOURCE_FILE
    if not source_path.is_file():
        fail(f"missing source: {source_path}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    imported = import_breathing_source(source_path)
    armature = imported_armature(imported, SOURCE_FILE)
    body_meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(body_meshes) != 1:
        fail(f"expected one body mesh, found {[obj.name for obj in body_meshes]}")

    armature.name = "Guerreiro_Armature"
    armature.data.name = "Guerreiro_Armature"
    body = body_meshes[0]
    body.name = "Guerreiro_Corpo"
    body.data.name = "Guerreiro_Corpo"
    breathing_action = current_action(armature, SOURCE_FILE)
    breathing_action.name = "Breathing_Idle_Source"

    armature.data.pose_position = "POSE"
    armature.animation_data_create().action = breathing_action
    pose_frame = round((breathing_action.frame_range[0] + breathing_action.frame_range[1]) * 0.5)
    bpy.context.scene.frame_set(pose_frame)
    bpy.context.view_layer.update()
    bake_body_pose(body, armature)

    equipment_collection = bpy.data.collections.new("Equipamentos")
    bpy.context.scene.collection.children.link(equipment_collection)
    equipment_objects: list[bpy.types.Object] = []
    vertical_offsets = {
        "Equip_Capacete": 1.0,
        "Equip_Peito": 0.9,
        "Equip_Calca": 0.9,
        "Equip_Bota": 0.9,
    }
    for equipment_name, relative_path in EQUIPMENT_FILES.items():
        equipment_path = source_dir / relative_path
        if not equipment_path.is_file():
            fail(f"missing equipment: {equipment_path}")
        if equipment_name == "Equip_Luva":
            equipment = import_static_gloves(equipment_path, equipment_collection)
        else:
            equipment = import_equipment(equipment_path, equipment_name, equipment_collection)
            shift_mesh_z(equipment, vertical_offsets[equipment_name])
        equipment_objects.append(equipment)

    all_meshes = [body, *equipment_objects]
    preview_path = source_dir / OUTPUT_PREVIEW
    render_final(preview_path, all_meshes)

    bpy.ops.file.pack_all()
    blend_path = source_dir / OUTPUT_BLEND
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print(
        "GUERREIRO_VISUAL_BUILD_OK",
        f"source={source_path}",
        f"blend={blend_path}",
        f"preview={preview_path}",
        f"meshes={[mesh.name for mesh in all_meshes]}",
        f"pose_frame={pose_frame}",
    )


if __name__ == "__main__":
    main()
