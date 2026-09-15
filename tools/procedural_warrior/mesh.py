"""Deterministic ring/loft mesh generation and mesh hygiene helpers."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from typing import Any

import bmesh
import bpy
from mathutils import Vector


DEFAULT_MERGE_DISTANCE = 0.00005
_AREA_EPSILON = 1.0e-12


def ring_points(z: float, radius_x: float, radius_y: float, segments: int) -> list[Vector]:
    """Return one deterministic, counter-clockwise elliptical ring.

    The first point is on the positive X axis and all points share ``z``.  No
    Blender data is touched, which makes this helper deterministic and useful
    both in Blender scripts and in geometry tests.
    """

    if isinstance(segments, bool) or not isinstance(segments, int) or segments < 3:
        raise ValueError("segments must be an integer greater than or equal to 3")
    for value, label in ((z, "z"), (radius_x, "radius_x"), (radius_y, "radius_y")):
        if not math.isfinite(float(value)):
            raise ValueError(f"{label} must be finite")

    z_value = float(z)
    rx = float(radius_x)
    ry = float(radius_y)
    return [
        Vector(
            (
                rx * math.cos(math.tau * index / segments),
                ry * math.sin(math.tau * index / segments),
                z_value,
            )
        )
        for index in range(segments)
    ]


def _profile_rows(profile: Iterable[Sequence[float]]) -> tuple[tuple[float, float, float], ...]:
    """Normalize profile rows while preserving their deterministic order."""

    try:
        rows = tuple(profile)
    except TypeError as error:
        raise TypeError("profile must be an iterable of (z, radius_x, radius_y) rows") from error

    if len(rows) < 2:
        raise ValueError("profile must contain at least two rings")

    normalized: list[tuple[float, float, float]] = []
    for row_index, row in enumerate(rows):
        if isinstance(row, (str, bytes)):
            raise TypeError(f"profile row {row_index} must contain z, radius_x and radius_y")
        try:
            z, radius_x, radius_y = row
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"profile row {row_index} must contain exactly three values"
            ) from error
        values = (float(z), float(radius_x), float(radius_y))
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"profile row {row_index} must contain finite values")
        if values[1] <= 0.0 or values[2] <= 0.0:
            raise ValueError(f"profile row {row_index} radii must be greater than zero")
        if normalized and values[0] <= normalized[-1][0]:
            raise ValueError("profile z values must be strictly increasing")
        normalized.append(values)
    return tuple(normalized)


def _validate_radial_segments(radial_segments: int) -> int:
    if (
        isinstance(radial_segments, bool)
        or not isinstance(radial_segments, int)
        or radial_segments < 3
    ):
        raise ValueError("radial_segments must be an integer greater than or equal to 3")
    return radial_segments


def _target_collection(collection: bpy.types.Collection | None) -> bpy.types.Collection:
    """Resolve the explicit collection or Blender's current collection."""

    if collection is not None:
        if not isinstance(collection, bpy.types.Collection):
            raise TypeError("collection must be a Blender Collection or None")
        return collection

    current = bpy.context.collection
    if current is not None:
        return current

    view_layer = bpy.context.view_layer
    if view_layer is not None and view_layer.layer_collection is not None:
        return view_layer.layer_collection.collection
    return bpy.context.scene.collection


def loft_mesh(
    name: str,
    profile: Iterable[Sequence[float]],
    radial_segments: int = 24,
    collection: bpy.types.Collection | None = None,
) -> bpy.types.Object:
    """Create a closed mesh by lofting elliptical rings through ``profile``.

    ``profile`` rows are ``(z, radius_x, radius_y)``.  Adjacent rings receive
    side quads, then a bottom and top cap are added.  The newly-created object
    is captured and returned directly, so a Blender name collision cannot cause
    callers to receive a different object.
    """

    if not isinstance(name, str) or not name:
        raise ValueError("name must be a non-empty string")
    segments = _validate_radial_segments(radial_segments)
    rows = _profile_rows(profile)

    vertices = [
        point
        for z, radius_x, radius_y in rows
        for point in ring_points(z, radius_x, radius_y, segments)
    ]
    faces: list[tuple[int, ...]] = []
    for ring_index in range(len(rows) - 1):
        lower = ring_index * segments
        upper = (ring_index + 1) * segments
        for point_index in range(segments):
            next_index = (point_index + 1) % segments
            faces.append(
                (
                    lower + point_index,
                    lower + next_index,
                    upper + next_index,
                    upper + point_index,
                )
            )

    # Ring points are counter-clockwise when viewed from above.  Reverse the
    # lower cap for a downward normal and retain the upper winding for +Z.
    faces.append(tuple(reversed(range(segments))))
    top_start = (len(rows) - 1) * segments
    faces.append(tuple(top_start + index for index in range(segments)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)

    # Capture the reference at creation time before linking; Blender may suffix
    # a duplicate name, but this object remains the one returned to the caller.
    obj = bpy.data.objects.new(name, mesh)
    _target_collection(collection).objects.link(obj)
    return obj


def _polygon_area(indices: Sequence[int], positions: Sequence[Vector]) -> float:
    """Compute a polygon's fan-triangulated area without mutating mesh data."""

    origin = positions[indices[0]]
    area = 0.0
    for index in range(1, len(indices) - 1):
        first = positions[indices[index]] - origin
        second = positions[indices[index + 1]] - origin
        area += 0.5 * first.cross(second).length
    return area


def _invalid_mesh_error(obj: Any, reason: str) -> RuntimeError:
    object_name = getattr(obj, "name", "<unnamed>")
    return RuntimeError(f"{object_name}: {reason}")


def assert_mesh_valid(obj: bpy.types.Object) -> None:
    """Raise ``RuntimeError`` when ``obj`` has invalid or loose geometry.

    Validation is read-only: unlike ``Mesh.validate()``, this function never
    repairs or rewrites the supplied mesh datablock.
    """

    if obj is None or getattr(obj, "type", None) != "MESH":
        raise _invalid_mesh_error(obj, "expected a mesh object")
    mesh = getattr(obj, "data", None)
    if mesh is None:
        raise _invalid_mesh_error(obj, "empty mesh")

    vertex_count = len(mesh.vertices)
    edge_count = len(mesh.edges)
    polygon_count = len(mesh.polygons)
    if vertex_count == 0 or edge_count == 0 or polygon_count == 0:
        raise _invalid_mesh_error(obj, "empty mesh")

    positions: list[Vector] = []
    for vertex_index, vertex in enumerate(mesh.vertices):
        coordinates = tuple(float(component) for component in vertex.co)
        if not all(math.isfinite(component) for component in coordinates):
            raise _invalid_mesh_error(obj, f"invalid vertex coordinates at index {vertex_index}")
        positions.append(Vector(coordinates))

    edge_uses = [0] * vertex_count
    edge_face_uses = [0] * edge_count
    edge_index_by_pair: dict[tuple[int, int], int] = {}
    for edge_index, edge in enumerate(mesh.edges):
        indices = tuple(int(index) for index in edge.vertices)
        if len(indices) != 2 or indices[0] == indices[1]:
            raise _invalid_mesh_error(obj, f"invalid edge at index {edge_index}")
        if any(index < 0 or index >= vertex_count for index in indices):
            raise _invalid_mesh_error(obj, f"edge {edge_index} references an invalid vertex")
        first, second = sorted(indices)
        pair = (first, second)
        if pair in edge_index_by_pair:
            raise _invalid_mesh_error(obj, f"duplicate edge at index {edge_index}")
        edge_index_by_pair[pair] = edge_index
        edge_uses[first] += 1
        edge_uses[second] += 1

    face_uses = [0] * vertex_count
    for polygon_index, polygon in enumerate(mesh.polygons):
        indices = tuple(int(index) for index in polygon.vertices)
        if len(indices) < 3 or len(set(indices)) < 3:
            raise _invalid_mesh_error(obj, f"invalid polygon at index {polygon_index}")
        if any(index < 0 or index >= vertex_count for index in indices):
            raise _invalid_mesh_error(obj, f"polygon {polygon_index} references an invalid vertex")

        for index in indices:
            face_uses[index] += 1
        for index, current in enumerate(indices):
            following = indices[(index + 1) % len(indices)]
            edge_pair = tuple(sorted((current, following)))
            edge_index = edge_index_by_pair.get(edge_pair)
            if edge_index is None:
                raise _invalid_mesh_error(
                    obj,
                    f"polygon {polygon_index} references a missing edge",
                )
            edge_face_uses[edge_index] += 1
        if _polygon_area(indices, positions) <= _AREA_EPSILON:
            raise _invalid_mesh_error(obj, f"zero-area polygon at index {polygon_index}")

    for edge_index, face_use in enumerate(edge_face_uses):
        if face_use == 0:
            raise _invalid_mesh_error(obj, f"loose edge at index {edge_index}")

    for vertex_index, (edge_use, face_use) in enumerate(zip(edge_uses, face_uses)):
        if edge_use == 0 or face_use == 0:
            raise _invalid_mesh_error(obj, f"loose vertex at index {vertex_index}")


def clean_mesh(
    obj: bpy.types.Object,
    merge_distance: float = DEFAULT_MERGE_DISTANCE,
) -> tuple[int, int]:
    """Weld and remove loose geometry, then flush and recalculate normals.

    The operation intentionally requires Object mode so the bmesh is sourced
    from the evaluated mesh datablock.  It returns ``(vertices_before,
    vertices_after)`` as a small audit trail for callers.
    """

    if obj is None or getattr(obj, "type", None) != "MESH":
        raise _invalid_mesh_error(obj, "expected a mesh object")
    if bpy.context.mode != "OBJECT":
        raise _invalid_mesh_error(obj, "clean_mesh requires Object mode")
    if not math.isfinite(float(merge_distance)) or merge_distance < 0.0:
        raise ValueError("merge_distance must be a finite non-negative number")

    mesh = obj.data
    before = len(mesh.vertices)
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        if bm.verts and merge_distance > 0.0:
            bmesh.ops.remove_doubles(
                bm,
                verts=list(bm.verts),
                dist=float(merge_distance),
            )

        loose_edges = [edge for edge in bm.edges if not edge.link_faces]
        if loose_edges:
            bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")

        loose_vertices = [
            vertex
            for vertex in bm.verts
            if not vertex.link_edges and not vertex.link_faces
        ]
        if loose_vertices:
            bmesh.ops.delete(bm, geom=loose_vertices, context="VERTS")

        if bm.faces:
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.normal_update()

        # Explicitly flush bmesh edits before freeing the temporary bmesh.
        bm.to_mesh(mesh)
    finally:
        bm.free()

    mesh.update(calc_edges=True)
    return before, len(mesh.vertices)
