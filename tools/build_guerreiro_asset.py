import pathlib
import sys

import bmesh
import bpy
from mathutils import Vector


ACTION_FILES = {
    "Idle": "Idle.fbx",
    "Walking": "Walking.fbx",
    "Running": "Running.fbx",
    "Reaction": "Reaction.fbx",
    "AttackHorizontal": "Standing Melee Attack Horizontal.fbx",
    "JumpAttack": "Standing Melee Run Jump Attack.fbx",
    "Death": "Standing Death Forward 01.fbx",
}
EXPECTED_BONES = 65
IMPORT_SCALE = 180.0
DECIMATE_RATIO = 0.7
MERGE_DISTANCE = 0.0001
MAX_MERGE_REDUCTION = 0.02
EQUIPMENT_FILES = {
    "Equip_Capacete": "equipament/capacete/Meshy_AI_Doomhorn_Visage_0828150500_texture.fbx",
    "Equip_Peito": "equipament/Peito/Meshy_AI_Skullguard_Plate_Mail_0828145444_texture.fbx",
    "Equip_Luva": "equipament/luva/Meshy_AI_Doomforged_Skull_Gaun_0828150012_texture.fbx",
    "Equip_Calca": "equipament/calça/Meshy_AI_Dreadbone_Warplate_0828150224_texture.fbx",
    "Equip_Bota": "equipament/bota/Meshy_AI_Doomguard_Greaves_0828150134_texture.fbx",
}
EQUIPMENT_EXPORTS = {
    "Equip_Capacete": "capacete.glb",
    "Equip_Peito": "peito.glb",
    "Equip_Luva": "luva.glb",
    "Equip_Calca": "calca.glb",
    "Equip_Bota": "bota.glb",
}
FIT_BOXES = {
    "Equip_Capacete": ((-0.23, -0.23, 0.53), (0.23, 0.21, 1.03)),
    "Equip_Peito": ((-0.43, -0.24, -0.13), (0.43, 0.20, 0.76)),
    "Equip_Calca": ((-0.33, -0.21, -0.87), (0.33, 0.18, 0.18)),
    "Equip_Bota": ((-0.30, -0.24, -0.90), (0.30, 0.20, -0.22)),
}


def fail(message: str) -> None:
    print(f"GUERREIRO_BUILD_ERROR {message}")
    raise SystemExit(1)


def import_fbx(path: pathlib.Path, use_anim: bool = True):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(
        filepath=str(path),
        use_anim=use_anim,
        global_scale=IMPORT_SCALE,
    )
    return [obj for obj in bpy.context.scene.objects if obj not in before]


def import_equipment_fbx(path: pathlib.Path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(
        filepath=str(path),
        use_anim=False,
        global_scale=1.0,
    )
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
        if curve.data_path != 'pose.bones["mixamorig:Hips"].location':
            continue
        if curve.array_index not in {0, 2} or len(curve.keyframe_points) < 2:
            continue
        first = curve.keyframe_points[0].co.copy()
        last = curve.keyframe_points[-1].co.copy()
        duration = last.x - first.x
        if duration <= 0:
            continue

        def drift_at(frame: float) -> float:
            progress = (frame - first.x) / duration
            return first.y + (last.y - first.y) * progress

        for keyframe in curve.keyframe_points:
            keyframe.co.y -= drift_at(keyframe.co.x)
            keyframe.handle_left.y -= drift_at(keyframe.handle_left.x)
            keyframe.handle_right.y -= drift_at(keyframe.handle_right.x)


def remove_objects(objects) -> None:
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def add_nla_tracks(
    armature: bpy.types.Object, actions: dict[str, bpy.types.Action]
) -> None:
    animation_data = armature.animation_data_create()
    animation_data.action = None
    while animation_data.nla_tracks:
        animation_data.nla_tracks.remove(animation_data.nla_tracks[0])
    for name, action in actions.items():
        track = animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(action.frame_range[0]), action)
        strip.name = name


def mesh_local_bounds(mesh_object: bpy.types.Object):
    coordinates = [vertex.co for vertex in mesh_object.data.vertices]
    minimum = Vector(tuple(min(coordinate[index] for coordinate in coordinates) for index in range(3)))
    maximum = Vector(tuple(max(coordinate[index] for coordinate in coordinates) for index in range(3)))
    return minimum, maximum


def fit_mesh_to_box(
    mesh_object: bpy.types.Object,
    target_minimum: tuple[float, float, float],
    target_maximum: tuple[float, float, float],
) -> None:
    source_minimum, source_maximum = mesh_local_bounds(mesh_object)
    source_size = source_maximum - source_minimum
    target_minimum_vector = Vector(target_minimum)
    target_size = Vector(target_maximum) - target_minimum_vector
    for vertex in mesh_object.data.vertices:
        normalized = Vector(
            tuple(
                (vertex.co[index] - source_minimum[index]) / source_size[index]
                for index in range(3)
            )
        )
        vertex.co = target_minimum_vector + Vector(
            tuple(normalized[index] * target_size[index] for index in range(3))
        )
    mesh_object.data.update()


def fit_gloves(mesh_object: bpy.types.Object) -> None:
    negative = [vertex for vertex in mesh_object.data.vertices if vertex.co.x < 0]
    positive = [vertex for vertex in mesh_object.data.vertices if vertex.co.x >= 0]
    if not negative or not positive:
        fail("Equip_Luva: could not separate the left and right gloves")

    for vertices, side in ((negative, -1), (positive, 1)):
        minimum = Vector(
            tuple(min(vertex.co[index] for vertex in vertices) for index in range(3))
        )
        maximum = Vector(
            tuple(max(vertex.co[index] for vertex in vertices) for index in range(3))
        )
        size = maximum - minimum
        for vertex in vertices:
            across = (vertex.co.x - minimum.x) / size.x
            depth = (vertex.co.y - minimum.y) / size.y
            length = (vertex.co.z - minimum.z) / size.z
            if side < 0:
                target_x = -0.82 + 0.44 * length
                target_z = 0.40 + 0.25 * across
            else:
                target_x = 0.82 - 0.44 * length
                target_z = 0.65 - 0.25 * across
            vertex.co = Vector((target_x, -0.15 + 0.30 * depth, target_z))
    mesh_object.data.update()


def import_equipment(
    path: pathlib.Path,
    object_name: str,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    imported = import_equipment_fbx(path)
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(meshes) != 1:
        fail(f"{path.name}: expected one mesh, found {[obj.name for obj in meshes]}")
    equipment = meshes[0]
    equipment.name = object_name
    equipment.data.name = object_name
    for source_collection in list(equipment.users_collection):
        source_collection.objects.unlink(equipment)
    collection.objects.link(equipment)
    for obj in imported:
        if obj != equipment:
            bpy.data.objects.remove(obj, do_unlink=True)
    equipment.location = (0.0, 0.0, 0.0)
    equipment.rotation_euler = (0.0, 0.0, 0.0)
    equipment.scale = (1.0, 1.0, 1.0)
    if object_name == "Equip_Luva":
        fit_gloves(equipment)
    else:
        fit_mesh_to_box(equipment, *FIT_BOXES[object_name])
    return equipment


def select_active(mesh_object: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    mesh_object.select_set(True)
    bpy.context.view_layer.objects.active = mesh_object


def skin_equipment(
    equipment: bpy.types.Object,
    body: bpy.types.Object,
    armature: bpy.types.Object,
) -> None:
    select_active(equipment)
    for source_group in body.vertex_groups:
        equipment.vertex_groups.new(name=source_group.name)
    transfer = equipment.modifiers.new("TransferWeights", "DATA_TRANSFER")
    transfer.object = body
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    if not equipment.vertex_groups:
        fail(f"{equipment.name}: weight transfer created no vertex groups")
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.001)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_smooth(
        group_select_mode="ALL", factor=0.35, repeat=2, expand=0.0
    )
    bpy.ops.object.mode_set(mode="OBJECT")


def attach_armature(
    equipment: bpy.types.Object, armature: bpy.types.Object
) -> None:
    armature_modifier = equipment.modifiers.new("Guerreiro_Armature", "ARMATURE")
    armature_modifier.object = armature
    equipment.parent = armature
    equipment.matrix_parent_inverse = armature.matrix_world.inverted()


def optimize_equipment(equipment: bpy.types.Object) -> tuple[int, int, int]:
    select_active(equipment)
    before = len(equipment.data.vertices)
    decimate = equipment.modifiers.new("Decimate_0_7", "DECIMATE")
    decimate.ratio = DECIMATE_RATIO
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    after_decimate = len(equipment.data.vertices)

    bm = bmesh.new()
    bm.from_mesh(equipment.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=MERGE_DISTANCE)
    loose = [vertex for vertex in bm.verts if not vertex.link_edges and not vertex.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(equipment.data)
    bm.free()
    equipment.data.update()
    after_cleanup = len(equipment.data.vertices)
    if after_decimate and (after_decimate - after_cleanup) / after_decimate > MAX_MERGE_REDUCTION:
        fail(
            f"{equipment.name}: Merge by Distance removed too many vertices "
            f"({after_decimate} -> {after_cleanup})"
        )
    polygons_before_validation = len(equipment.data.polygons)
    equipment.data.validate(clean_customdata=True)
    polygons_after_validation = len(equipment.data.polygons)
    if (
        polygons_before_validation
        and (polygons_before_validation - polygons_after_validation)
        / polygons_before_validation
        > 0.01
    ):
        fail(
            f"{equipment.name}: mesh validation removed too many polygons "
            f"({polygons_before_validation} -> {polygons_after_validation})"
        )
    select_active(equipment)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.001)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    return before, after_decimate, after_cleanup


def replace_weights(
    equipment: bpy.types.Object,
    weights_for_vertex,
) -> None:
    vertex_indices = [vertex.index for vertex in equipment.data.vertices]
    for group in equipment.vertex_groups:
        group.remove(vertex_indices)
    for vertex in equipment.data.vertices:
        weights = weights_for_vertex(vertex.co)
        total = sum(weights.values())
        if total <= 0:
            fail(f"{equipment.name}: corrective weights produced an empty vertex")
        for group_name, weight in weights.items():
            group = equipment.vertex_groups.get(group_name)
            if group is None:
                fail(f"{equipment.name}: missing corrective group {group_name}")
            group.add([vertex.index], weight / total, "REPLACE")


def correct_equipment_weights(equipment: bpy.types.Object) -> None:
    if equipment.name == "Equip_Capacete":
        replace_weights(equipment, lambda _coordinate: {"mixamorig:Head": 1.0})
        return
    if equipment.name != "Equip_Peito":
        return

    def chest_weights(coordinate: Vector) -> dict[str, float]:
        if coordinate.z < 0.05:
            return {"mixamorig:Spine": 0.45, "mixamorig:Spine1": 0.55}
        shoulder_blend = max(0.0, min(1.0, (abs(coordinate.x) - 0.24) / 0.19))
        weights = {
            "mixamorig:Spine1": 0.25,
            "mixamorig:Spine2": 0.75 - shoulder_blend * 0.35,
        }
        if shoulder_blend:
            side = "Left" if coordinate.x > 0 else "Right"
            weights[f"mixamorig:{side}Shoulder"] = shoulder_blend * 0.22
            weights[f"mixamorig:{side}Arm"] = shoulder_blend * 0.13
        return weights

    replace_weights(equipment, chest_weights)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview(
    path: pathlib.Path,
    armature: bpy.types.Object,
    idle_action: bpy.types.Action,
) -> None:
    animation_data = armature.animation_data_create()
    for track in animation_data.nla_tracks:
        track.mute = True
    animation_data.action = idle_action
    bpy.context.scene.frame_set(int(idle_action.frame_range[0]))

    preview_objects = []
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0.0, 0.0, 0.0))
    floor = bpy.context.object
    floor.name = "PreviewFloor"
    preview_objects.append(floor)
    floor_material = bpy.data.materials.new("PreviewFloorMaterial")
    floor_material.diffuse_color = (0.035, 0.04, 0.055, 1.0)
    floor.data.materials.append(floor_material)

    bpy.ops.object.camera_add(location=(2.8, -4.8, 2.35))
    camera = bpy.context.object
    preview_objects.append(camera)
    look_at(camera, (0.0, 0.0, 0.95))
    camera.data.lens = 58
    bpy.context.scene.camera = camera

    for location, energy, size in (
        ((-3.0, -4.0, 5.0), 1500, 4.0),
        ((3.0, -2.0, 3.5), 1100, 3.0),
        ((0.0, 3.0, 4.0), 900, 3.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        preview_objects.append(light)
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0.0, 0.0, 0.9))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(path)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.015, 0.02, 0.03)
    bpy.ops.render.render(write_still=True)

    for obj in preview_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    animation_data.action = None
    for track in animation_data.nla_tracks:
        track.mute = False


def select_export_objects(armature: bpy.types.Object, meshes) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature


def export_glb(
    path: pathlib.Path,
    armature: bpy.types.Object,
    meshes,
    export_animations: bool,
) -> None:
    select_export_objects(armature, meshes)
    options = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_cameras": False,
        "export_lights": False,
        "export_skins": True,
        "export_def_bones": True,
        "export_image_format": "WEBP",
        "export_image_quality": 82,
        "export_draco_mesh_compression_enable": True,
        "export_draco_mesh_compression_level": 6,
        "export_animations": export_animations,
    }
    if export_animations:
        options.update(
            {
                "export_animation_mode": "NLA_TRACKS",
                "export_nla_strips": True,
                "export_force_sampling": True,
                "export_optimize_animation_size": True,
            }
        )
    bpy.ops.export_scene.gltf(**options)


def main() -> None:
    if "--" not in sys.argv:
        fail("Usage: blender --background --python tools/build_guerreiro_asset.py -- <source-dir>")
    source_dir = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    missing = [filename for filename in ACTION_FILES.values() if not (source_dir / filename).is_file()]
    if missing:
        fail(f"Missing FBX files: {missing}")

    idle_path = source_dir / ACTION_FILES["Idle"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    imported = import_fbx(idle_path)
    armature = imported_armature(imported, idle_path.name)
    if len(armature.data.bones) != EXPECTED_BONES:
        fail(
            f"Main armature has {len(armature.data.bones)} bones "
            f"instead of {EXPECTED_BONES}"
        )
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(meshes) != 1:
        fail(f"Expected one body mesh, found {[obj.name for obj in meshes]}")

    armature.name = "Guerreiro_Armature"
    armature.data.name = "Guerreiro_Armature"
    body = meshes[0]
    body.name = "Guerreiro_Corpo"
    body.data.name = "Guerreiro_Corpo"
    select_active(body)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.001)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    bone_names = tuple(bone.name for bone in armature.data.bones)
    idle_action = current_action(armature, idle_path.name)
    idle_action.name = "Idle"
    idle_action.use_fake_user = True
    make_horizontal_motion_in_place(idle_action)
    actions = {"Idle": idle_action}

    for action_name, filename in ACTION_FILES.items():
        if action_name == "Idle":
            continue
        action_path = source_dir / filename
        temporary_objects = import_fbx(action_path)
        temporary_armature = imported_armature(temporary_objects, filename)
        imported_bones = tuple(bone.name for bone in temporary_armature.data.bones)
        if imported_bones != bone_names:
            fail(f"{filename}: bone names/order differ from the main rig")
        source_action = current_action(temporary_armature, filename)
        action = source_action.copy()
        action.name = action_name
        action.use_fake_user = True
        make_horizontal_motion_in_place(action)
        actions[action_name] = action
        remove_objects(temporary_objects)
        bpy.data.actions.remove(source_action)

    add_nla_tracks(armature, actions)

    equipment_collection = bpy.data.collections.new("Equipamentos")
    bpy.context.scene.collection.children.link(equipment_collection)
    armature.data.pose_position = "REST"
    equipment_objects = []
    optimization = {}
    for equipment_name, relative_path in EQUIPMENT_FILES.items():
        equipment_path = source_dir / relative_path
        if not equipment_path.is_file():
            fail(f"Missing equipment FBX: {equipment_path}")
        equipment = import_equipment(
            equipment_path, equipment_name, equipment_collection
        )
        skin_equipment(equipment, body, armature)
        optimization[equipment_name] = optimize_equipment(equipment)
        correct_equipment_weights(equipment)
        attach_armature(equipment, armature)
        equipment_objects.append(equipment)
    armature.data.pose_position = "POSE"

    render_preview(source_dir / "preview-guerreiro.png", armature, actions["Idle"])

    bpy.ops.file.pack_all()
    blend_path = source_dir / "Guerreiro-completo.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    output_dir = pathlib.Path(__file__).resolve().parents[1] / "public" / "models" / "guerreiro"
    output_dir.mkdir(parents=True, exist_ok=True)
    full_glb_path = output_dir / "Guerreiro.glb"
    export_glb(full_glb_path, armature, [body, *equipment_objects], True)
    equipment_glbs = {}
    for equipment in equipment_objects:
        equipment_path = output_dir / EQUIPMENT_EXPORTS[equipment.name]
        export_glb(equipment_path, armature, [equipment], False)
        equipment_glbs[equipment.name] = (
            str(equipment_path),
            equipment_path.stat().st_size,
        )
    print(
        "GUERREIRO_BUILD_OK",
        f"blend={blend_path}",
        f"blend_size={blend_path.stat().st_size}",
        f"glb={full_glb_path}",
        f"glb_size={full_glb_path.stat().st_size}",
        f"actions={sorted(actions)}",
        f"equipment={sorted(obj.name for obj in equipment_objects)}",
        f"equipment_glbs={equipment_glbs}",
        f"optimization={optimization}",
    )


if __name__ == "__main__":
    main()
