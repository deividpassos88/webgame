"""Executable Blender tests for the procedural warrior geometry core.

Run with Blender 5.2:
    blender --background --python tools/test_procedural_warrior.py
"""

from __future__ import annotations

import pathlib
import sys

import bpy
from mathutils import Vector


ROOT = pathlib.Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from procedural_warrior.config import BuildLimits, WarriorDimensions  # noqa: E402
from procedural_warrior.anatomy import (  # noqa: E402
    AnatomyParts,
    BoneLandmarks,
    build_anatomy,
    build_stage,
    extract_landmarks,
)
from procedural_warrior.mesh import (  # noqa: E402
    assert_mesh_valid,
    clean_mesh,
    loft_mesh,
    ring_points,
)
from procedural_warrior.materials import create_material_library  # noqa: E402
from procedural_warrior.wardrobe import build_sword, build_wardrobe  # noqa: E402


PROFILE = [
    (0.00, 0.17, 0.13),
    (0.28, 0.22, 0.16),
    (0.62, 0.27, 0.19),
    (0.94, 0.20, 0.15),
]

SOURCE_GLB = ROOT / "public" / "models" / "guerreiro" / "Guerreiro.glb"


def _world_bounds(obj):
    coordinates = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return tuple(
        value
        for axis in range(3)
        for value in (
            min(point[axis] for point in coordinates),
            max(point[axis] for point in coordinates),
        )
    )


def _contains_point(bounds, point, tolerance=0.16):
    return all(
        bounds[axis * 2] - tolerance <= point[axis] <= bounds[axis * 2 + 1] + tolerance
        for axis in range(3)
    )


def _component_vertex_sets(obj):
    neighbors = {index: set() for index in range(len(obj.data.vertices))}
    for polygon in obj.data.polygons:
        indices = tuple(polygon.vertices)
        for index, vertex_index in enumerate(indices):
            neighbors[vertex_index].add(indices[(index + 1) % len(indices)])
            neighbors[vertex_index].add(indices[(index - 1) % len(indices)])

    components = []
    remaining = set(neighbors)
    while remaining:
        component = {remaining.pop()}
        frontier = list(component)
        while frontier:
            vertex_index = frontier.pop()
            for neighbor in neighbors[vertex_index] & remaining:
                remaining.remove(neighbor)
                frontier.append(neighbor)
                component.add(neighbor)
        components.append(component)
    return components


def _connected_components(obj):
    return len(_component_vertex_sets(obj))


def _anatomy_metrics(objects):
    meshes = [
        object_
        for object_ in objects
        if object_.type == "MESH" and object_.get("anatomy_part") != "stage_floor"
    ]
    return {
        "names": tuple(object_.name for object_ in meshes),
        "vertices": sum(len(object_.data.vertices) for object_ in meshes),
        "triangles": sum(len(object_.data.loop_triangles) for object_ in meshes),
        "body_vertices": len(next(object_ for object_ in meshes if object_.name == "Procedural_Body").data.vertices),
        "body_triangles": len(next(object_ for object_ in meshes if object_.name == "Procedural_Body").data.loop_triangles),
    }


def _import_source_rig():
    assert SOURCE_GLB.is_file(), f"missing source GLB: {SOURCE_GLB}"
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLB))
    imported = tuple(object_ for object_ in bpy.data.objects if object_ not in before)
    armature = next(object_ for object_ in imported if object_.type == "ARMATURE")
    source_body = max(
        (object_ for object_ in imported if object_.type == "MESH"),
        key=lambda object_: len(object_.data.vertices),
    )
    source_collection = bpy.data.collections.new("ProceduralWarrior_Source_Test")
    bpy.context.scene.collection.children.link(source_collection)
    for object_ in imported:
        source_collection.objects.link(object_)
    return armature, source_body


def _bounds(obj):
    coordinates = [tuple(vertex.co) for vertex in obj.data.vertices]
    return tuple(
        round(value, 12)
        for axis in range(3)
        for value in (min(point[axis] for point in coordinates), max(point[axis] for point in coordinates))
    )


def _reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def test_configuration_defaults():
    dimensions = WarriorDimensions()
    limits = BuildLimits()
    assert dimensions.height == 1.85
    assert dimensions.shoulder_width == 0.49
    assert dimensions.chest_depth == 0.25
    assert dimensions.waist_width == 0.34
    assert dimensions.head_height == 0.235
    assert dimensions.hand_length == 0.19
    assert limits.max_influences == 4
    assert limits.minimum_weight == 0.001
    assert limits.merge_distance == 0.00005
    assert limits.body_radial_segments == 24


def test_ring_points_are_deterministic():
    first = ring_points(0.28, 0.22, 0.16, 16)
    second = ring_points(0.28, 0.22, 0.16, 16)
    assert first == second
    assert all(isinstance(point, Vector) for point in first)
    assert all(abs(actual - expected) < 1.0e-7 for actual, expected in zip(first[0], (0.22, 0.0, 0.28)))


def test_four_rings_have_expected_topology_and_validity():
    _reset_scene()
    torso = loft_mesh("TestTorso", PROFILE, radial_segments=16)
    assert len(torso.data.vertices) == 64
    assert len(torso.data.polygons) == 50
    assert_mesh_valid(torso)


def test_repeated_generation_has_identical_counts_and_bounds():
    _reset_scene()
    first = loft_mesh("RepeatedTorso", PROFILE, radial_segments=16)
    first_snapshot = (len(first.data.vertices), len(first.data.polygons), _bounds(first))

    _reset_scene()
    second = loft_mesh("RepeatedTorso", PROFILE, radial_segments=16)
    second_snapshot = (len(second.data.vertices), len(second.data.polygons), _bounds(second))

    assert second_snapshot == first_snapshot


def test_explicit_collection_and_clean_mesh():
    _reset_scene()
    collection = bpy.data.collections.new("ProceduralWarrior_TestCollection")
    bpy.context.scene.collection.children.link(collection)
    torso = loft_mesh("CollectionTorso", PROFILE, radial_segments=16, collection=collection)
    assert collection.objects.get(torso.name) is torso

    mesh = torso.data
    before = len(mesh.vertices)
    mesh.vertices.add(1)
    mesh.vertices[-1].co = mesh.vertices[0].co
    clean_mesh(torso)
    assert len(mesh.vertices) < before + 1
    assert_mesh_valid(torso)


def test_empty_mesh_reports_object_name_without_mutating():
    _reset_scene()
    mesh = bpy.data.meshes.new("EmptyMesh")
    empty = bpy.data.objects.new("EmptyWarriorMesh", mesh)
    bpy.context.collection.objects.link(empty)
    before = (len(mesh.vertices), len(mesh.edges), len(mesh.polygons))
    try:
        assert_mesh_valid(empty)
    except RuntimeError as error:
        assert empty.name in str(error)
    else:
        raise AssertionError("empty mesh validation unexpectedly passed")
    assert (len(mesh.vertices), len(mesh.edges), len(mesh.polygons)) == before


def _square_with_loose_diagonal():
    mesh = bpy.data.meshes.new("LooseDiagonalMesh")
    mesh.from_pydata(
        [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (1.0, 1.0, 0.0), (0.0, 1.0, 0.0)],
        [(0, 1), (1, 2), (2, 3), (3, 0), (0, 2)],
        [(0, 1, 2, 3)],
    )
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new("LooseDiagonalObject", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def test_loose_edge_is_rejected_even_when_vertices_are_used():
    _reset_scene()
    obj = _square_with_loose_diagonal()
    before = (len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons))
    try:
        assert_mesh_valid(obj)
    except RuntimeError as error:
        assert "loose edge" in str(error)
    else:
        raise AssertionError("loose edge validation unexpectedly passed")
    assert (len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons)) == before


def test_clean_mesh_removes_loose_edges_and_pending_vertices():
    _reset_scene()
    obj = _square_with_loose_diagonal()
    clean_mesh(obj)
    assert len(obj.data.vertices) == 4
    assert len(obj.data.edges) == 4
    assert len(obj.data.polygons) == 1
    assert_mesh_valid(obj)


def test_profile_rejects_adjacent_equal_or_descending_z():
    _reset_scene()
    for profile in (
        [(0.0, 0.17, 0.13), (0.0, 0.22, 0.16)],
        [(0.28, 0.17, 0.13), (0.12, 0.22, 0.16)],
    ):
        try:
            loft_mesh("InvalidProfile", profile, radial_segments=16)
        except ValueError as error:
            assert "z" in str(error).lower()
        else:
            raise AssertionError("non-increasing profile unexpectedly passed")


def test_name_collision_returns_both_created_references():
    _reset_scene()
    first = loft_mesh("CollisionTorso", PROFILE, radial_segments=16)
    second = loft_mesh("CollisionTorso", PROFILE, radial_segments=16)
    assert first is not second
    assert first.name != second.name
    assert bpy.data.objects.get(first.name) is first
    assert bpy.data.objects.get(second.name) is second


def test_missing_collection_uses_current_collection():
    _reset_scene()
    current = bpy.context.collection
    assert current is not None
    torso = loft_mesh("CurrentCollectionTorso", PROFILE, radial_segments=16)
    assert current.objects.get(torso.name) is torso


def test_extract_landmarks_reports_the_exact_missing_bone_name():
    _reset_scene()
    armature, _source_body = _import_source_rig()
    head_bone = armature.data.bones["mixamorig:Head"]
    original_name = head_bone.name
    head_bone.name = "RemovedHeadForTest"
    try:
        try:
            extract_landmarks(armature)
        except RuntimeError as error:
            assert "mixamorig:Head" in str(error)
        else:
            raise AssertionError("missing required head bone unexpectedly passed")
    finally:
        head_bone.name = original_name


def test_build_anatomy_exposes_typed_required_parts_in_requested_collection():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)

    parts = build_anatomy(armature, source_body, collection=collection)

    assert isinstance(parts, AnatomyParts)
    assert isinstance(extract_landmarks(armature), BoneLandmarks)
    assert parts.body.name == "Procedural_Body"
    assert parts.eyes.name == "Procedural_Eyes"
    assert parts.hair.name == "Procedural_Hair"
    assert parts.beard.name == "Procedural_Beard"
    assert parts.body is not parts.eyes
    assert all(object_ in collection.objects[:] for object_ in parts.objects)
    assert all(object_.get("anatomy_part") for object_ in parts.objects)


def test_body_height_and_bounds_follow_the_rest_armature():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    landmarks = extract_landmarks(armature)
    parts = build_anatomy(armature, source_body, collection=collection)

    assert 1.80 <= parts.height <= 1.90
    body_bounds = _world_bounds(parts.body)
    for landmark in (
        landmarks.head,
        landmarks.left_hand,
        landmarks.right_hand,
        landmarks.left_foot,
        landmarks.right_foot,
    ):
        assert _contains_point(body_bounds, landmark, tolerance=0.18)


def test_anatomy_uses_connected_official_cc0_body_with_paired_eyes():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    parts = build_anatomy(armature, source_body, collection=collection)

    mesh_parts = [object_ for object_ in parts.objects if object_.type == "MESH"]
    assert mesh_parts
    for object_ in mesh_parts:
        assert_mesh_valid(object_)
    assert _connected_components(parts.eyes) == 2
    body_components = _connected_components(parts.body)
    assert body_components == 1
    assert parts.body["component_count_after_weld"] == 1
    assert 10_000 <= len(parts.body.data.vertices) <= 11_000
    assert parts.body.data.uv_layers.get("UVMap") is not None
    assert parts.body["source_materials_preserved"] is True
    assert parts.body["source_asset_name"] == "Blender Foundation Human Base Meshes v1.4.1"
    assert parts.body["source_asset_license"] == "CC0-1.0"
    for side in ("Left", "Right"):
        for finger in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
            assert parts.body.vertex_groups.get(f"mixamorig:{side}Hand{finger}1") is not None


def test_eyes_use_human_twenty_five_millimetre_width():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    parts = build_anatomy(armature, source_body, collection=collection)

    widths = []
    for component in _component_vertex_sets(parts.eyes):
        points = [parts.eyes.matrix_world @ parts.eyes.data.vertices[index].co for index in component]
        widths.append(max(point.x for point in points) - min(point.x for point in points))
    assert len(widths) == 2
    assert all(0.024 <= width <= 0.026 for width in widths)


def test_cc0_eyes_render_with_sclera_iris_and_pupil_materials():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    eyes = build_anatomy(armature, source_body, collection=collection).eyes

    assert eyes.hide_render is False
    assert [material.name for material in eyes.data.materials] == [
        "PW_Anatomy_EyeSclera",
        "PW_Anatomy_EyeIris",
        "PW_Anatomy_EyePupil",
    ]
    assert {polygon.material_index for polygon in eyes.data.polygons} == {0, 1, 2}
    assert eyes["socket_recess_m"] >= 0.002
    assert eyes["iris_radius_m"] < 0.006


def test_hair_and_beard_follow_the_cc0_head_surface_and_render():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    parts = build_anatomy(armature, source_body, collection=collection)

    assert parts.hair.hide_render is False
    assert parts.beard.hide_render is False
    assert parts.hair["surface_following"] is True
    assert parts.beard["surface_following"] is True
    assert parts.hair["construction"] == "parametric smooth shell"
    assert parts.hair["hairline"] == "smooth swept"
    assert parts.hair["eyebrows"] == 2
    assert parts.beard["style"] == "short jaw beard"
    assert 300 <= len(parts.hair.data.vertices) <= 3_000
    assert 80 <= len(parts.beard.data.vertices) <= 1_500
    assert _connected_components(parts.hair) <= 6
    assert _connected_components(parts.beard) == 1
    assert_mesh_valid(parts.hair)
    assert_mesh_valid(parts.beard)


def test_rerun_purges_orphaned_procedural_mesh_datablocks():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    build_anatomy(armature, source_body, collection=collection)
    build_anatomy(armature, source_body, collection=collection)

    orphans = [
        mesh
        for mesh in bpy.data.meshes
        if mesh.users == 0 and mesh.name.startswith("Procedural_")
    ]
    assert not orphans


def test_stage_recreates_task2_probe_when_generating_clean_stage():
    _reset_scene()
    stage_root = pathlib.Path(bpy.app.tempdir) / "procedural-warrior-task3-stage-test"
    summary = build_stage(stage_root, render=False)

    task2 = bpy.data.collections.get("ProceduralWarrior_Task2")
    assert task2 is not None
    probe = task2.objects.get("TestTorso_MCP")
    assert probe is not None
    assert_mesh_valid(probe)
    assert {"Cube", "Camera", "Light"} <= {object_.name for object_ in bpy.data.objects}
    assert summary["close_panel_count"] == 3


def test_saved_artifact_metrics_match_current_deterministic_build():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)
    current = _anatomy_metrics(build_anatomy(armature, source_body, collection=collection).objects)

    stage_path = ROOT / "artifacts" / "procedural-warrior" / "anatomy-stage.blend"
    assert stage_path.is_file(), f"missing stage artifact: {stage_path}"
    bpy.ops.wm.open_mainfile(filepath=str(stage_path))
    staged_collection = bpy.data.collections["ProceduralWarrior_Anatomy"]
    staged = _anatomy_metrics(staged_collection.objects)
    assert staged == current


def test_anatomy_rebuild_is_deterministic_and_replaces_only_its_collection():
    _reset_scene()
    armature, source_body = _import_source_rig()
    collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(collection)

    first = build_anatomy(armature, source_body, collection=collection)
    first_snapshot = [
        (object_.name, len(object_.data.vertices), len(object_.data.polygons), _world_bounds(object_))
        for object_ in first.objects
        if object_.type == "MESH"
    ]
    source_objects_before = tuple(sorted(object_.name for object_ in source_body.users_collection[0].objects))

    second = build_anatomy(armature, source_body, collection=collection)
    second_snapshot = [
        (object_.name, len(object_.data.vertices), len(object_.data.polygons), _world_bounds(object_))
        for object_ in second.objects
        if object_.type == "MESH"
    ]
    source_objects_after = tuple(sorted(object_.name for object_ in source_body.users_collection[0].objects))

    assert first_snapshot == second_snapshot
    assert source_objects_after == source_objects_before
    triangles = sum(len(object_.data.loop_triangles) for object_ in second.objects if object_.type == "MESH")
    assert 20_000 <= triangles <= 90_000


def test_material_library_has_required_pbr_roles_and_principled_values():
    _reset_scene()
    materials = create_material_library()

    assert set(materials) == {"Skin", "Eye", "Hair", "Cloth", "Leather", "Steel", "DarkMetal"}
    expected = {
        "Skin": (0.0, 0.48),
        "Leather": (0.0, 0.58),
        "Cloth": (0.0, 0.76),
        "Steel": (0.92, 0.24),
        "DarkMetal": (0.82, 0.34),
    }
    for role, (metallic, roughness) in expected.items():
        material = materials[role]
        principled = material.node_tree.nodes.get("Principled BSDF")
        assert principled is not None
        assert abs(principled.inputs["Metallic"].default_value - metallic) < 1.0e-6
        assert abs(principled.inputs["Roughness"].default_value - roughness) < 1.0e-6
        assert material["procedural_warrior_material"] == role


def test_wardrobe_and_sword_expose_required_named_rig_contract():
    _reset_scene()
    armature, source_body = _import_source_rig()
    anatomy_collection = bpy.data.collections.new("ProceduralWarrior_Anatomy")
    bpy.context.scene.collection.children.link(anatomy_collection)
    parts = build_anatomy(armature, source_body, collection=anatomy_collection)
    materials = create_material_library()

    wardrobe = build_wardrobe(parts, materials)
    sword = build_sword(materials)
    required = {
        "Leather_Jacket", "Trousers", "Boots", "Gloves", "Breastplate",
        "Pauldrons", "Bracers", "Greaves", "Belt", "Scabbard",
    }
    names = {object_.name for object_ in wardrobe.objects}
    assert required <= names
    for object_ in wardrobe.objects:
        assert object_.get("rig_mode") in {"deform", "unskinned"} or object_["rig_mode"].startswith("rigid:")
        if object_.type == "MESH":
            assert_mesh_valid(object_)

    assert sword.name == "Procedural_Sword"
    assert sword["rig_mode"] == "rigid:mixamorig:RightHand"
    assert 1.25 <= max(sword.dimensions) <= 1.45
    grip = next((child for child in sword.children if child.name == "SwordGrip"), None)
    assert grip is not None
    assert grip.parent is sword


def main():
    tests = [
        test_configuration_defaults,
        test_ring_points_are_deterministic,
        test_four_rings_have_expected_topology_and_validity,
        test_repeated_generation_has_identical_counts_and_bounds,
        test_explicit_collection_and_clean_mesh,
        test_empty_mesh_reports_object_name_without_mutating,
        test_loose_edge_is_rejected_even_when_vertices_are_used,
        test_clean_mesh_removes_loose_edges_and_pending_vertices,
        test_profile_rejects_adjacent_equal_or_descending_z,
        test_name_collision_returns_both_created_references,
        test_missing_collection_uses_current_collection,
        test_extract_landmarks_reports_the_exact_missing_bone_name,
        test_build_anatomy_exposes_typed_required_parts_in_requested_collection,
        test_body_height_and_bounds_follow_the_rest_armature,
        test_anatomy_uses_connected_official_cc0_body_with_paired_eyes,
        test_eyes_use_human_twenty_five_millimetre_width,
        test_cc0_eyes_render_with_sclera_iris_and_pupil_materials,
        test_hair_and_beard_follow_the_cc0_head_surface_and_render,
        test_rerun_purges_orphaned_procedural_mesh_datablocks,
        test_stage_recreates_task2_probe_when_generating_clean_stage,
        test_anatomy_rebuild_is_deterministic_and_replaces_only_its_collection,
        test_saved_artifact_metrics_match_current_deterministic_build,
        test_material_library_has_required_pbr_roles_and_principled_values,
        test_wardrobe_and_sword_expose_required_named_rig_contract,
    ]
    for test in tests:
        test()
    print("PROCEDURAL_WARRIOR_TEST_OK")


if __name__ == "__main__":
    main()
