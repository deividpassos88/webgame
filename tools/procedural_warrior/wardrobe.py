"""Deterministic fitted wardrobe, medium armor and longsword geometry."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence

import bmesh
import bpy
from mathutils import Vector

from .anatomy import AnatomyParts, _MeshBuilder


WARDROBE_COLLECTION_NAME = "ProceduralWarrior_Wardrobe"


@dataclass(frozen=True)
class WardrobeParts:
    jacket: bpy.types.Object
    trousers: bpy.types.Object
    boots: bpy.types.Object
    gloves: bpy.types.Object
    breastplate: bpy.types.Object
    pauldrons: bpy.types.Object
    bracers: bpy.types.Object
    greaves: bpy.types.Object
    belt: bpy.types.Object
    scabbard: bpy.types.Object
    objects: tuple[bpy.types.Object, ...]


def _collection(collection: bpy.types.Collection | None = None) -> bpy.types.Collection:
    if collection is not None:
        return collection
    existing = bpy.data.collections.get(WARDROBE_COLLECTION_NAME)
    if existing is not None:
        return existing
    created = bpy.data.collections.new(WARDROBE_COLLECTION_NAME)
    bpy.context.scene.collection.children.link(created)
    return created


def _clear_generated(collection: bpy.types.Collection, *, include_sword: bool = False) -> None:
    for object_ in tuple(collection.objects):
        if not object_.get("procedural_warrior_wardrobe"):
            continue
        if not include_sword and object_.get("wardrobe_part") == "sword":
            continue
        bpy.data.objects.remove(object_, do_unlink=True)
    for mesh in tuple(bpy.data.meshes):
        if mesh.users == 0 and mesh.get("procedural_warrior_wardrobe"):
            bpy.data.meshes.remove(mesh)


def _mesh_object(
    name: str,
    vertices: Sequence[Sequence[float]],
    faces: Sequence[Sequence[int]],
    collection: bpy.types.Collection,
    materials: Sequence[bpy.types.Material],
    rig_mode: str,
    part: str,
    material_ranges: Sequence[tuple[int, int]] = (),
) -> bpy.types.Object:
    if not vertices or not faces:
        raise RuntimeError(f"{name}: generated empty geometry")
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update(calc_edges=True)
    mesh.calc_loop_triangles()
    mesh["procedural_warrior_wardrobe"] = True
    object_ = bpy.data.objects.new(name, mesh)
    collection.objects.link(object_)
    for material in materials:
        mesh.materials.append(material)
    for material_index, (start, end) in enumerate(material_ranges):
        for polygon_index in range(start, min(end, len(mesh.polygons))):
            mesh.polygons[polygon_index].material_index = material_index
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    object_["procedural_warrior_wardrobe"] = True
    object_["wardrobe_part"] = part
    object_["rig_mode"] = rig_mode
    return object_


def _builder_object(
    name: str,
    builder: _MeshBuilder,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    rig_mode: str,
    part: str,
) -> bpy.types.Object:
    return _mesh_object(name, builder.vertices, builder.faces, collection, (material,), rig_mode, part)


def _surface_piece(
    name: str,
    body: bpy.types.Object,
    predicate: Callable[[Vector], bool],
    offset: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    polygons = [polygon for polygon in body.data.polygons if predicate(polygon.center)]
    if not polygons:
        raise RuntimeError(f"{name}: fitted surface selection is empty")
    source_indices = sorted({int(index) for polygon in polygons for index in polygon.vertices})
    remap = {source: target for target, source in enumerate(source_indices)}
    vertices = []
    for source in source_indices:
        vertex = body.data.vertices[source]
        normal = vertex.normal.normalized() if vertex.normal.length else Vector((0.0, -1.0, 0.0))
        vertices.append(tuple(vertex.co + normal * offset))
    faces = [tuple(remap[int(index)] for index in polygon.vertices) for polygon in polygons]
    object_ = _mesh_object(name, vertices, faces, collection, (material,), "deform", name)
    object_["fitted_from"] = body.name
    object_["surface_offset_m"] = offset
    solidify = object_.modifiers.new("PW_Garment_Thickness", "SOLIDIFY")
    solidify.thickness = min(offset * 0.35, 0.0035)
    solidify.offset = 0.0
    solidify.use_rim = True
    return object_


def _curved_panel(
    name: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    rig_mode: str,
) -> bpy.types.Object:
    rows = (
        (0.125, 0.105, -0.128),
        (0.190, 0.175, -0.145),
        (0.315, 0.228, -0.160),
        (0.445, 0.245, -0.168),
        (0.560, 0.178, -0.150),
    )
    segments = 24
    vertices: list[tuple[float, float, float]] = []
    rings: list[list[int]] = []
    for z, half_width, depth in rows:
        ring = []
        for segment in range(segments):
            u = -1.0 + 2.0 * segment / (segments - 1)
            x = half_width * u
            y = depth + 0.043 * (u * u)
            ring.append(len(vertices))
            vertices.append((x, y, z))
        rings.append(ring)
    faces = []
    for lower, upper in zip(rings, rings[1:]):
        for segment in range(segments - 1):
            faces.append((lower[segment], lower[segment + 1], upper[segment + 1], upper[segment]))
    object_ = _mesh_object(name, vertices, faces, collection, (material,), rig_mode, name)
    solidify = object_.modifiers.new("PW_Armor_Thickness", "SOLIDIFY")
    solidify.thickness = 0.006
    solidify.offset = 0.0
    bevel = object_.modifiers.new("PW_Armor_Bevel", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 3
    return object_


def _add_ellipsoid_cap(
    builder: _MeshBuilder,
    center: Vector,
    radii: tuple[float, float, float],
    *,
    segments: int = 32,
    rings: int = 9,
) -> None:
    """Append an open upper ellipsoid shell suitable for a pauldron."""

    rx, ry, rz = radii
    top = len(builder.vertices)
    builder.vertices.append(tuple(center + Vector((0.0, 0.0, rz))))
    ring_indices: list[list[int]] = []
    for ring in range(1, rings + 1):
        theta = (math.pi * 0.5) * ring / rings
        indices = []
        for segment in range(segments):
            phi = math.tau * segment / segments
            point = center + Vector((rx * math.sin(theta) * math.cos(phi), ry * math.sin(theta) * math.sin(phi), rz * math.cos(theta)))
            indices.append(len(builder.vertices))
            builder.vertices.append(tuple(point))
        ring_indices.append(indices)
    for segment in range(segments):
        following = (segment + 1) % segments
        builder.faces.append((top, ring_indices[0][segment], ring_indices[0][following]))
    for upper, lower in zip(ring_indices, ring_indices[1:]):
        for segment in range(segments):
            following = (segment + 1) % segments
            builder.faces.append((upper[segment], lower[segment], lower[following], upper[following]))


def _add_shin_panel(builder: _MeshBuilder, center_x: float) -> None:
    rows = ((-0.660, 0.042, -0.066), (-0.545, 0.064, -0.082), (-0.390, 0.073, -0.078))
    columns = 14
    grid = []
    for z, half_width, depth in rows:
        row = []
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            row.append(len(builder.vertices))
            builder.vertices.append((center_x + half_width * u, depth + 0.020 * u * u, z))
        grid.append(row)
    for lower, upper in zip(grid, grid[1:]):
        for column in range(columns - 1):
            builder.faces.append((lower[column], lower[column + 1], upper[column + 1], upper[column]))


def _add_torus(
    builder: _MeshBuilder,
    center: Vector,
    major_x: float,
    major_y: float,
    minor: float,
    major_segments: int = 48,
    minor_segments: int = 10,
) -> None:
    rings = []
    for major_index in range(major_segments):
        angle = math.tau * major_index / major_segments
        ring = []
        for minor_index in range(minor_segments):
            radial = math.tau * minor_index / minor_segments
            point = center + Vector(
                (
                    (major_x + minor * math.cos(radial)) * math.cos(angle),
                    (major_y + minor * math.cos(radial)) * math.sin(angle),
                    minor * math.sin(radial),
                )
            )
            ring.append(len(builder.vertices))
            builder.vertices.append(tuple(point))
        rings.append(ring)
    for index, current in enumerate(rings):
        following = rings[(index + 1) % len(rings)]
        for segment in range(minor_segments):
            next_segment = (segment + 1) % minor_segments
            builder.faces.append((current[segment], following[segment], following[next_segment], current[next_segment]))


def build_wardrobe(
    anatomy: AnatomyParts,
    materials: Mapping[str, bpy.types.Material],
    collection: bpy.types.Collection | None = None,
) -> WardrobeParts:
    """Create fitted leather/cloth layers and medium armor around ``anatomy``."""

    required_materials = {"Cloth", "Leather", "Steel", "DarkMetal"}
    missing = required_materials - set(materials)
    if missing:
        raise RuntimeError(f"missing wardrobe materials: {sorted(missing)}")
    target = _collection(collection)
    _clear_generated(target)
    body = anatomy.body

    jacket = _surface_piece(
        "Leather_Jacket", body,
        lambda p: 0.08 <= p.z <= 0.59 and abs(p.x) <= 0.30,
        0.010, target, materials["Leather"],
    )
    trousers = _surface_piece(
        "Trousers", body,
        lambda p: -0.59 <= p.z <= 0.10 and abs(p.x) <= 0.245,
        0.008, target, materials["Cloth"],
    )
    boots = _surface_piece(
        "Boots", body,
        lambda p: p.z <= -0.53,
        0.011, target, materials["Leather"],
    )
    gloves = _surface_piece(
        "Gloves", body,
        lambda p: abs(p.x) >= 0.745,
        0.006, target, materials["Leather"],
    )

    breastplate = _curved_panel(
        "Breastplate", target, materials["Steel"], "rigid:mixamorig:Spine2"
    )

    pauldrons_builder = _MeshBuilder()
    basis = (Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)), Vector((0.0, 0.0, 1.0)))
    _add_ellipsoid_cap(pauldrons_builder, Vector((-0.286, 0.0, 0.505)), (0.145, 0.113, 0.125), segments=32, rings=9)
    _add_ellipsoid_cap(pauldrons_builder, Vector((0.292, 0.0, 0.508)), (0.124, 0.103, 0.108), segments=30, rings=8)
    pauldrons = _builder_object("Pauldrons", pauldrons_builder, target, materials["DarkMetal"], "deform", "Pauldrons")
    pauldrons["asymmetrical"] = True
    pauldron_thickness = pauldrons.modifiers.new("PW_Pauldron_Thickness", "SOLIDIFY")
    pauldron_thickness.thickness = 0.005
    pauldron_thickness.offset = 0.0
    pauldron_bevel = pauldrons.modifiers.new("PW_Pauldron_Bevel", "BEVEL")
    pauldron_bevel.width = 0.0025
    pauldron_bevel.segments = 2

    bracers_builder = _MeshBuilder()
    bracers_builder.add_tapered_tube(Vector((-0.710, 0.0, 0.455)), Vector((-0.535, 0.0, 0.455)), 0.044, 0.058, segments=24)
    bracers_builder.add_tapered_tube(Vector((0.535, 0.0, 0.455)), Vector((0.710, 0.0, 0.455)), 0.058, 0.044, segments=24)
    bracers = _builder_object("Bracers", bracers_builder, target, materials["DarkMetal"], "deform", "Bracers")

    greaves_builder = _MeshBuilder()
    _add_shin_panel(greaves_builder, -0.105)
    _add_shin_panel(greaves_builder, 0.105)
    greaves = _builder_object("Greaves", greaves_builder, target, materials["Steel"], "deform", "Greaves")
    greave_thickness = greaves.modifiers.new("PW_Greave_Thickness", "SOLIDIFY")
    greave_thickness.thickness = 0.005
    greave_thickness.offset = 0.0
    greave_bevel = greaves.modifiers.new("PW_Greave_Bevel", "BEVEL")
    greave_bevel.width = 0.0025
    greave_bevel.segments = 2

    belt_builder = _MeshBuilder()
    _add_torus(belt_builder, Vector((0.0, 0.0, 0.065)), 0.190, 0.128, 0.018)
    belt = _builder_object("Belt", belt_builder, target, materials["Leather"], "rigid:mixamorig:Hips", "Belt")

    scabbard_builder = _MeshBuilder()
    scabbard_builder.add_tapered_tube(Vector((0.220, 0.105, 0.015)), Vector((0.270, 0.120, -0.630)), 0.038, 0.029, segments=24)
    scabbard = _builder_object("Scabbard", scabbard_builder, target, materials["Leather"], "rigid:mixamorig:Hips", "Scabbard")
    scabbard["attack_arc_clearance"] = True

    objects = (jacket, trousers, boots, gloves, breastplate, pauldrons, bracers, greaves, belt, scabbard)
    return WardrobeParts(jacket, trousers, boots, gloves, breastplate, pauldrons, bracers, greaves, belt, scabbard, objects)


def _add_box(
    builder: _MeshBuilder,
    minimum: tuple[float, float, float],
    maximum: tuple[float, float, float],
) -> tuple[int, int]:
    start_face = len(builder.faces)
    x0, y0, z0 = minimum
    x1, y1, z1 = maximum
    start = len(builder.vertices)
    builder.vertices.extend(
        (
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        )
    )
    builder.faces.extend(
        (
            (start + 0, start + 3, start + 2, start + 1),
            (start + 4, start + 5, start + 6, start + 7),
            (start + 0, start + 1, start + 5, start + 4),
            (start + 1, start + 2, start + 6, start + 5),
            (start + 2, start + 3, start + 7, start + 6),
            (start + 3, start + 0, start + 4, start + 7),
        )
    )
    return start_face, len(builder.faces)


def _add_tapered_blade(builder: _MeshBuilder) -> tuple[int, int]:
    """Append a double-edged blade prism with a narrow, valid tip."""

    start_face = len(builder.faces)
    start = len(builder.vertices)
    half_thickness = 0.0075
    builder.vertices.extend(
        (
            (-0.031, -half_thickness, 0.110), (0.031, -half_thickness, 0.110),
            (0.024, -half_thickness, 1.045), (0.0, -half_thickness, 1.130),
            (-0.024, -half_thickness, 1.045),
            (-0.031, half_thickness, 0.110), (0.031, half_thickness, 0.110),
            (0.024, half_thickness, 1.045), (0.0, half_thickness, 1.130),
            (-0.024, half_thickness, 1.045),
        )
    )
    builder.faces.extend(
        (
            (start + 0, start + 1, start + 2, start + 3, start + 4),
            (start + 5, start + 9, start + 8, start + 7, start + 6),
            (start + 0, start + 5, start + 6, start + 1),
            (start + 1, start + 6, start + 7, start + 2),
            (start + 2, start + 7, start + 8, start + 3),
            (start + 3, start + 8, start + 9, start + 4),
            (start + 4, start + 9, start + 5, start + 0),
        )
    )
    return start_face, len(builder.faces)


def build_sword(
    materials: Mapping[str, bpy.types.Material],
    collection: bpy.types.Collection | None = None,
) -> bpy.types.Object:
    """Build a 1.33 m longsword with its origin at the grip center."""

    required = {"Steel", "DarkMetal", "Leather"}
    missing = required - set(materials)
    if missing:
        raise RuntimeError(f"missing sword materials: {sorted(missing)}")
    target = _collection(collection)
    for object_ in tuple(target.objects):
        if object_.get("wardrobe_part") == "sword":
            bpy.data.objects.remove(object_, do_unlink=True)

    builder = _MeshBuilder()
    blade_range = _add_tapered_blade(builder)
    guard_range = _add_box(builder, (-0.102, -0.013, 0.092), (0.102, 0.013, 0.120))
    grip_start = len(builder.faces)
    builder.add_tapered_tube(Vector((0.0, 0.0, -0.110)), Vector((0.0, 0.0, 0.110)), 0.017, 0.015, segments=20)
    grip_range = (grip_start, len(builder.faces))
    pommel_range = _add_box(builder, (-0.027, -0.023, -0.200), (0.027, 0.023, -0.110))
    fuller_range = _add_box(builder, (-0.006, -0.0092, 0.180), (0.006, -0.0077, 1.075))
    sword = _mesh_object(
        "Procedural_Sword",
        builder.vertices,
        builder.faces,
        target,
        (materials["Steel"], materials["DarkMetal"], materials["Leather"]),
        "rigid:mixamorig:RightHand",
        "sword",
    )
    for polygon_index in range(guard_range[0], guard_range[1]):
        sword.data.polygons[polygon_index].material_index = 1
    for polygon_index in range(grip_range[0], grip_range[1]):
        sword.data.polygons[polygon_index].material_index = 2
    for polygon_index in range(pommel_range[0], pommel_range[1]):
        sword.data.polygons[polygon_index].material_index = 1
    for polygon_index in range(fuller_range[0], fuller_range[1]):
        sword.data.polygons[polygon_index].material_index = 1
    bevel = sword.modifiers.new("PW_Sword_Edge_Bevel", "BEVEL")
    bevel.width = 0.0025
    bevel.segments = 2
    sword["blade_length_m"] = 1.02
    sword["hilt_length_m"] = 0.22
    sword["guard_width_m"] = 0.204
    sword["pommel_length_m"] = 0.09
    sword["fuller"] = True

    grip = bpy.data.objects.new("SwordGrip", None)
    target.objects.link(grip)
    grip.parent = sword
    grip.location = Vector((0.0, 0.0, 0.0))
    grip["procedural_warrior_wardrobe"] = True
    grip["wardrobe_part"] = "sword_grip"
    grip["rig_mode"] = "unskinned"
    return sword


def build_wardrobe_stage(output_root: Path | None = None, *, render: bool = True) -> dict[str, object]:
    """Build, render and save the material/wardrobe acceptance stage via bpy."""

    from . import anatomy as anatomy_module
    from .materials import create_material_library

    output_root = output_root or Path(__file__).resolve().parents[2]
    artifacts = output_root / "artifacts" / "procedural-warrior"
    artifacts.mkdir(parents=True, exist_ok=True)
    anatomy_module.build_stage(output_root, render=False)
    anatomy_collection = bpy.data.collections[anatomy_module.ANATOMY_COLLECTION_NAME]
    body = anatomy_collection.objects["Procedural_Body"]
    eyes = anatomy_collection.objects["Procedural_Eyes"]
    hair = anatomy_collection.objects["Procedural_Hair"]
    beard = anatomy_collection.objects["Procedural_Beard"]
    anatomy = AnatomyParts(body=body, eyes=eyes, hair=hair, beard=beard, objects=(body, eyes, hair, beard))

    materials = create_material_library()
    body.data.materials.clear()
    body.data.materials.append(materials["Skin"])
    for groom in (hair, beard):
        groom.data.materials.clear()
        groom.data.materials.append(materials["Hair"])
    wardrobe = build_wardrobe(anatomy, materials)
    sword = build_sword(materials)
    sword.location = Vector((0.815, -0.015, 0.455))

    scene = bpy.context.scene
    camera = anatomy_collection.objects["Procedural_Stage_Camera"]
    bounds = anatomy_module._bounds(body)
    center = Vector(((bounds[0] + bounds[1]) * 0.5, (bounds[2] + bounds[3]) * 0.5, (bounds[4] + bounds[5]) * 0.5))
    target = center + Vector((0.0, 0.0, 0.06))
    distance = 5.20
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    if render:
        views = tuple(artifacts / f".wardrobe-view-{index}.png" for index in range(3))
        anatomy_module._render_to(scene, camera, views[0], target + Vector((0.0, -distance, 0.0)), target)
        anatomy_module._render_to(scene, camera, views[1], target + Vector((distance * 0.70, -distance * 0.72, 0.0)), target)
        anatomy_module._render_to(scene, camera, views[2], target + Vector((distance, 0.0, 0.0)), target)
        anatomy_module._contact_sheet(views, artifacts / "wardrobe-stage.png", 560, 700)

    mesh_objects = tuple(object_ for object_ in (*wardrobe.objects, sword) if object_.type == "MESH")
    triangles = 0
    for object_ in mesh_objects:
        object_.data.calc_loop_triangles()
        triangles += len(object_.data.loop_triangles)
    scene["procedural_warrior_wardrobe_metrics"] = {
        "objects": len(mesh_objects),
        "triangles": triangles,
        "sword_length": max(sword.dimensions),
    }
    bpy.ops.wm.save_as_mainfile(filepath=str(artifacts / "wardrobe-stage.blend"))
    return {
        "objects": [object_.name for object_ in wardrobe.objects],
        "sword": sword.name,
        "sword_length": max(sword.dimensions),
        "triangles": triangles,
        "stage_png": str(artifacts / "wardrobe-stage.png"),
        "blend": str(artifacts / "wardrobe-stage.blend"),
    }


__all__ = [
    "WARDROBE_COLLECTION_NAME",
    "WardrobeParts",
    "build_wardrobe",
    "build_sword",
    "build_wardrobe_stage",
]
