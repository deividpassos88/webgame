"""Rest-rig guided, deterministic anatomy for the procedural warrior.

The module deliberately keeps the anatomy independent from skinning and export.
It samples the imported Mixamo rest bones, builds stable mesh components in a
dedicated collection, and leaves source assets and unrelated scene objects
untouched.  The script entry point is also used for the visual stage preview.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

try:  # Supports both ``import procedural_warrior.anatomy`` and --python anatomy.py.
    from .config import WarriorDimensions
    from .mesh import loft_mesh
except ImportError:  # pragma: no cover - exercised by Blender's script entry point.
    tools_directory = str(Path(__file__).resolve().parents[1])
    if tools_directory not in sys.path:
        sys.path.insert(0, tools_directory)
    from procedural_warrior.config import WarriorDimensions
    from procedural_warrior.mesh import loft_mesh


ANATOMY_COLLECTION_NAME = "ProceduralWarrior_Anatomy"
SOURCE_COLLECTION_NAME = "ProceduralWarrior_Source"
SOURCE_GLB_RELATIVE = Path("public") / "models" / "guerreiro" / "Guerreiro.glb"
CC0_HUMAN_SOURCE_COLLECTION_NAME = "ProceduralWarrior_CC0_Human_Source"
CC0_HUMAN_BLEND = Path(__file__).resolve().parent / "assets" / "blender_human_male_cc0.blend"
FACIAL_ASYMMETRY_METRES = 0.0007

_CORE_BONES = (
    "mixamorig:Hips",
    "mixamorig:Spine",
    "mixamorig:Spine1",
    "mixamorig:Spine2",
    "mixamorig:Neck",
    "mixamorig:Head",
    "mixamorig:LeftShoulder",
    "mixamorig:LeftArm",
    "mixamorig:LeftForeArm",
    "mixamorig:LeftHand",
    "mixamorig:RightShoulder",
    "mixamorig:RightArm",
    "mixamorig:RightForeArm",
    "mixamorig:RightHand",
    "mixamorig:LeftUpLeg",
    "mixamorig:LeftLeg",
    "mixamorig:LeftFoot",
    "mixamorig:RightUpLeg",
    "mixamorig:RightLeg",
    "mixamorig:RightFoot",
)
_FINGER_NAMES = ("Thumb", "Index", "Middle", "Ring", "Pinky")
_FINGER_BONES = tuple(
    f"mixamorig:{side}Hand{finger}{index}"
    for side in ("Left", "Right")
    for finger in _FINGER_NAMES
    for index in range(1, 5)
)
REQUIRED_BONES = _CORE_BONES + _FINGER_BONES


@dataclass(frozen=True)
class BoneLandmarks:
    """World-space rest-pose locations required by the anatomy builder."""

    hips: Vector
    spine: Vector
    spine1: Vector
    spine2: Vector
    neck: Vector
    head: Vector
    left_shoulder: Vector
    left_arm: Vector
    left_forearm: Vector
    left_hand: Vector
    right_shoulder: Vector
    right_arm: Vector
    right_forearm: Vector
    right_hand: Vector
    left_up_leg: Vector
    left_leg: Vector
    left_foot: Vector
    right_up_leg: Vector
    right_leg: Vector
    right_foot: Vector
    finger_chains: Mapping[str, tuple[Vector, ...]]
    positions: Mapping[str, Vector]

    def bone(self, name: str) -> Vector:
        """Return a copied world-space rest location for an exact source bone name."""

        return self.positions[name].copy()

    def finger_chain(self, side: str, finger: str) -> tuple[Vector, ...]:
        """Return one four-node finger chain in proximal-to-distal order."""

        return tuple(point.copy() for point in self.finger_chains[f"{side}{finger}"])


@dataclass(frozen=True)
class AnatomyParts:
    """References captured while assembling one anatomy stage."""

    body: bpy.types.Object
    eyes: bpy.types.Object
    hair: bpy.types.Object
    beard: bpy.types.Object
    objects: tuple[bpy.types.Object, ...]

    @property
    def height(self) -> float:
        """Measured skin height in metres, excluding hair and facial hair."""

        coordinates = [self.body.matrix_world @ vertex.co for vertex in self.body.data.vertices]
        if not coordinates:
            return 0.0
        return max(point.z for point in coordinates) - min(point.z for point in coordinates)


@dataclass
class _MeshBuilder:
    """Small deterministic mesh accumulator for closed organic components."""

    vertices: list[tuple[float, float, float]] = field(default_factory=list)
    faces: list[tuple[int, ...]] = field(default_factory=list)

    def _add_vertex(self, point: Vector) -> int:
        self.vertices.append((float(point.x), float(point.y), float(point.z)))
        return len(self.vertices) - 1

    def add_ellipsoid(
        self,
        center: Vector,
        radii: tuple[float, float, float],
        basis: tuple[Vector, Vector, Vector],
        *,
        segments: int = 24,
        rings: int = 13,
    ) -> None:
        """Append one manifold UV ellipsoid using a supplied right-handed basis."""

        lateral, forward, up = (_normalized(vector) for vector in basis)
        radius_x, radius_y, radius_z = (float(value) for value in radii)
        if min(radius_x, radius_y, radius_z) <= 0.0:
            raise ValueError("ellipsoid radii must be positive")
        if segments < 6 or rings < 4:
            raise ValueError("ellipsoid requires at least six segments and four rings")

        top = self._add_vertex(center + up * radius_z)
        ring_indices: list[list[int]] = []
        for ring_index in range(1, rings):
            phi = math.pi * ring_index / rings
            sin_phi = math.sin(phi)
            cos_phi = math.cos(phi)
            ring_indices.append(
                [
                    self._add_vertex(
                        center
                        + lateral * (radius_x * math.cos(math.tau * segment / segments) * sin_phi)
                        + forward * (radius_y * math.sin(math.tau * segment / segments) * sin_phi)
                        + up * (radius_z * cos_phi)
                    )
                    for segment in range(segments)
                ]
            )
        bottom = self._add_vertex(center - up * radius_z)

        first_ring = ring_indices[0]
        for segment in range(segments):
            following = (segment + 1) % segments
            self.faces.append((top, first_ring[segment], first_ring[following]))
        for ring_index in range(len(ring_indices) - 1):
            lower = ring_indices[ring_index]
            upper = ring_indices[ring_index + 1]
            for segment in range(segments):
                following = (segment + 1) % segments
                self.faces.append(
                    (lower[segment], lower[following], upper[following], upper[segment])
                )
        last_ring = ring_indices[-1]
        for segment in range(segments):
            following = (segment + 1) % segments
            self.faces.append((bottom, last_ring[following], last_ring[segment]))

    def add_tapered_tube(
        self,
        start: Vector,
        end: Vector,
        start_radius: float,
        end_radius: float,
        *,
        segments: int = 20,
    ) -> None:
        """Append a capped six-ring tube that reads as muscle rather than a capsule."""

        direction = end - start
        length = direction.length
        if length <= 1.0e-6:
            return
        lateral, forward, axis = _basis_from_axis(direction)
        profile = (
            (0.0, start_radius * 0.90),
            (0.10, start_radius),
            (0.34, start_radius * 1.02),
            (0.68, end_radius * 1.03),
            (0.90, end_radius),
            (1.0, end_radius * 0.90),
        )
        rings: list[list[int]] = []
        for fraction, radius in profile:
            center = start.lerp(end, fraction)
            rings.append(
                [
                    self._add_vertex(
                        center
                        + lateral * (radius * math.cos(math.tau * segment / segments))
                        + forward * (radius * math.sin(math.tau * segment / segments))
                    )
                    for segment in range(segments)
                ]
            )
        start_center = self._add_vertex(start)
        end_center = self._add_vertex(end)
        for ring_index in range(len(rings) - 1):
            lower = rings[ring_index]
            upper = rings[ring_index + 1]
            for segment in range(segments):
                following = (segment + 1) % segments
                self.faces.append(
                    (lower[segment], lower[following], upper[following], upper[segment])
                )
        for segment in range(segments):
            following = (segment + 1) % segments
            self.faces.append((start_center, rings[0][following], rings[0][segment]))
            self.faces.append((end_center, rings[-1][segment], rings[-1][following]))

    def add_loft(
        self,
        rings: Sequence[tuple[Vector, float, float]],
        basis: tuple[Vector, Vector, Vector],
        *,
        segments: int = 28,
    ) -> None:
        """Append a capped elliptical torso loft with deliberate transition rings."""

        if len(rings) < 2:
            raise ValueError("loft needs at least two rings")
        lateral, forward, _up = (_normalized(vector) for vector in basis)
        ring_indices: list[list[int]] = []
        for center, radius_x, radius_y in rings:
            if radius_x <= 0.0 or radius_y <= 0.0:
                raise ValueError("loft radii must be positive")
            ring_indices.append(
                [
                    self._add_vertex(
                        center
                        + lateral * (radius_x * math.cos(math.tau * segment / segments))
                        + forward * (radius_y * math.sin(math.tau * segment / segments))
                    )
                    for segment in range(segments)
                ]
            )
        for ring_index in range(len(ring_indices) - 1):
            lower = ring_indices[ring_index]
            upper = ring_indices[ring_index + 1]
            for segment in range(segments):
                following = (segment + 1) % segments
                self.faces.append(
                    (lower[segment], lower[following], upper[following], upper[segment])
                )
        self.faces.append(tuple(reversed(ring_indices[0])))
        self.faces.append(tuple(ring_indices[-1]))


def _normalized(vector: Vector) -> Vector:
    result = Vector(vector)
    if result.length <= 1.0e-7:
        raise ValueError("cannot create a basis from a zero-length vector")
    result.normalize()
    return result


def _basis_from_axis(axis: Vector) -> tuple[Vector, Vector, Vector]:
    """Return an orthonormal right-handed basis whose Z axis follows ``axis``."""

    up = _normalized(axis)
    reference = Vector((0.0, 0.0, 1.0)) if abs(up.z) < 0.90 else Vector((0.0, 1.0, 0.0))
    lateral = _normalized(reference.cross(up))
    forward = _normalized(up.cross(lateral))
    return lateral, forward, up


def _basis_for_axis(axis: Vector, preferred_lateral: Vector) -> tuple[Vector, Vector, Vector]:
    """Align a longitudinal hand/foot shape while retaining a meaningful width axis."""

    up = _normalized(axis)
    projected = preferred_lateral - up * preferred_lateral.dot(up)
    if projected.length <= 1.0e-7:
        return _basis_from_axis(up)
    lateral = _normalized(projected)
    forward = _normalized(up.cross(lateral))
    return lateral, forward, up


def _mean(points: Iterable[Vector]) -> Vector:
    values = tuple(points)
    if not values:
        raise ValueError("at least one point is required")
    return sum((Vector(point) for point in values), Vector()) / len(values)


def _world_position(armature: bpy.types.Object, bone_name: str) -> Vector:
    bone = armature.data.bones.get(bone_name)
    if bone is None:
        raise RuntimeError(f"missing required bone: {bone_name}")
    return (armature.matrix_world @ bone.head_local).copy()


def extract_landmarks(armature: bpy.types.Object) -> BoneLandmarks:
    """Extract all required source bones as rest-pose world-space vectors.

    A missing source bone is reported by its exact Mixamo name so callers can
    diagnose a malformed source asset without inspecting Blender internals.
    """

    if armature is None or getattr(armature, "type", None) != "ARMATURE":
        raise RuntimeError("extract_landmarks requires an armature object")
    bpy.context.view_layer.update()
    positions = {bone_name: _world_position(armature, bone_name) for bone_name in REQUIRED_BONES}
    fingers = {
        f"{side}{finger}": tuple(
            positions[f"mixamorig:{side}Hand{finger}{index}"].copy()
            for index in range(1, 5)
        )
        for side in ("Left", "Right")
        for finger in _FINGER_NAMES
    }
    return BoneLandmarks(
        hips=positions["mixamorig:Hips"].copy(),
        spine=positions["mixamorig:Spine"].copy(),
        spine1=positions["mixamorig:Spine1"].copy(),
        spine2=positions["mixamorig:Spine2"].copy(),
        neck=positions["mixamorig:Neck"].copy(),
        head=positions["mixamorig:Head"].copy(),
        left_shoulder=positions["mixamorig:LeftShoulder"].copy(),
        left_arm=positions["mixamorig:LeftArm"].copy(),
        left_forearm=positions["mixamorig:LeftForeArm"].copy(),
        left_hand=positions["mixamorig:LeftHand"].copy(),
        right_shoulder=positions["mixamorig:RightShoulder"].copy(),
        right_arm=positions["mixamorig:RightArm"].copy(),
        right_forearm=positions["mixamorig:RightForeArm"].copy(),
        right_hand=positions["mixamorig:RightHand"].copy(),
        left_up_leg=positions["mixamorig:LeftUpLeg"].copy(),
        left_leg=positions["mixamorig:LeftLeg"].copy(),
        left_foot=positions["mixamorig:LeftFoot"].copy(),
        right_up_leg=positions["mixamorig:RightUpLeg"].copy(),
        right_leg=positions["mixamorig:RightLeg"].copy(),
        right_foot=positions["mixamorig:RightFoot"].copy(),
        finger_chains=fingers,
        positions={name: point.copy() for name, point in positions.items()},
    )


@dataclass(frozen=True)
class _ScaledSpace:
    origin: Vector
    scale: float
    lateral: Vector
    forward: Vector
    up: Vector

    def point(self, source_point: Vector) -> Vector:
        return self.origin + (source_point - self.origin) * self.scale


def _anatomy_space(landmarks: BoneLandmarks, dimensions: WarriorDimensions) -> _ScaledSpace:
    lowest_foot = min(landmarks.left_foot.z, landmarks.right_foot.z)
    rig_span = landmarks.head.z - lowest_foot
    if rig_span <= 1.0e-5:
        raise RuntimeError("rest rig head is not above its feet")

    # The source's Head bone sits just below the cranial mass.  Reserve the
    # real foot sole and cranial extension so the skin mesh measures exactly
    # the requested adult height without modifying the imported armature.
    foot_depth = 0.055
    cranial_extension = 0.180
    target_height = float(dimensions.height)
    scale = (target_height - foot_depth - cranial_extension) / rig_span
    if scale <= 0.0:
        raise ValueError("WarriorDimensions.height is too small for the rest rig")

    origin = Vector((landmarks.hips.x, landmarks.hips.y, lowest_foot))
    up = Vector((0.0, 0.0, 1.0))
    lateral = _normalized(landmarks.left_shoulder - landmarks.right_shoulder)
    forward = _normalized(up.cross(lateral))
    return _ScaledSpace(origin, scale, lateral, forward, up)


def _target_collection(collection: bpy.types.Collection | None) -> bpy.types.Collection:
    if collection is not None:
        if not isinstance(collection, bpy.types.Collection):
            raise TypeError("collection must be a Blender Collection or None")
        return collection
    existing = bpy.data.collections.get(ANATOMY_COLLECTION_NAME)
    if existing is not None:
        return existing
    created = bpy.data.collections.new(ANATOMY_COLLECTION_NAME)
    bpy.context.scene.collection.children.link(created)
    return created


def _clear_previous_anatomy(collection: bpy.types.Collection) -> None:
    """Delete only objects explicitly stamped as an anatomy build in this collection."""

    for object_ in tuple(collection.objects):
        if object_.get("procedural_warrior_anatomy"):
            bpy.data.objects.remove(object_, do_unlink=True)
    _purge_anatomy_orphans()


def _purge_anatomy_orphans() -> None:
    """Remove orphan mesh datablocks created by a prior anatomy rerun only."""

    for mesh in tuple(bpy.data.meshes):
        if mesh.users == 0 and mesh.get("procedural_warrior_anatomy"):
            bpy.data.meshes.remove(mesh)


def _material(name: str, color: tuple[float, float, float, float], roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
    return material


def _configure_groom_material(
    material: bpy.types.Material,
    dark: tuple[float, float, float, float],
    light: tuple[float, float, float, float],
) -> None:
    """Add fine deterministic value/bump breakup to a grooming material."""

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is None:
        return
    for name in ("PW_Groom_Coordinates", "PW_Groom_Noise", "PW_Groom_Ramp", "PW_Groom_Bump"):
        existing = nodes.get(name)
        if existing is not None:
            nodes.remove(existing)
    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.name = "PW_Groom_Coordinates"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "PW_Groom_Noise"
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 145.0
    noise.inputs["Detail"].default_value = 3.2
    noise.inputs["Roughness"].default_value = 0.68
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "PW_Groom_Ramp"
    ramp.color_ramp.elements[0].position = 0.24
    ramp.color_ramp.elements[0].color = dark
    ramp.color_ramp.elements[1].position = 0.76
    ramp.color_ramp.elements[1].color = light
    bump = nodes.new("ShaderNodeBump")
    bump.name = "PW_Groom_Bump"
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.0013
    links.new(coordinates.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])


def _mesh_object(
    name: str,
    builder: _MeshBuilder,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    anatomy_part: str,
) -> bpy.types.Object:
    if not builder.vertices or not builder.faces:
        raise RuntimeError(f"{name}: builder produced no geometry")
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(builder.vertices, [], builder.faces)
    mesh.update(calc_edges=True)
    normal_mesh = bmesh.new()
    try:
        normal_mesh.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(normal_mesh, faces=list(normal_mesh.faces))
        normal_mesh.to_mesh(mesh)
    finally:
        normal_mesh.free()
    mesh.update(calc_edges=True)
    mesh.calc_loop_triangles()
    mesh["procedural_warrior_anatomy"] = True
    object_ = bpy.data.objects.new(name, mesh)
    collection.objects.link(object_)
    object_.data.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    object_["procedural_warrior_anatomy"] = True
    object_["anatomy_part"] = anatomy_part
    return object_


def _add_joint(
    builder: _MeshBuilder,
    center: Vector,
    lateral: Vector,
    forward: Vector,
    up: Vector,
    radius: float,
) -> None:
    builder.add_ellipsoid(
        center,
        (radius, radius * 0.92, radius * 0.94),
        (lateral, forward, up),
        segments=24,
        rings=12,
    )


def _add_arm(
    builder: _MeshBuilder,
    shoulder: Vector,
    upper: Vector,
    forearm: Vector,
    hand: Vector,
    space: _ScaledSpace,
) -> None:
    lateral, forward, up = space.lateral, space.forward, space.up
    builder.add_tapered_tube(shoulder, upper, 0.090, 0.082, segments=24)
    builder.add_tapered_tube(upper, forearm, 0.078, 0.060, segments=24)
    builder.add_tapered_tube(forearm, hand, 0.060, 0.044, segments=24)
    _add_joint(builder, shoulder, lateral, forward, up, 0.092)
    _add_joint(builder, forearm, lateral, forward, up, 0.061)
    _add_joint(builder, hand, lateral, forward, up, 0.043)


def _add_leg(
    builder: _MeshBuilder,
    hip: Vector,
    knee: Vector,
    ankle: Vector,
    foot: Vector,
    space: _ScaledSpace,
) -> None:
    lateral, forward, up = space.lateral, space.forward, space.up
    builder.add_tapered_tube(hip, knee, 0.116, 0.086, segments=26)
    builder.add_tapered_tube(knee, ankle, 0.078, 0.052, segments=24)
    _add_joint(builder, hip, lateral, forward, up, 0.108)
    _add_joint(builder, knee, lateral, forward, up, 0.082)
    _add_joint(builder, ankle, lateral, forward, up, 0.054)
    foot_center = foot + forward * 0.080 - up * 0.030
    builder.add_ellipsoid(
        foot_center,
        (0.082, 0.155, 0.055),
        (lateral, forward, up),
        segments=26,
        rings=12,
    )


def _add_palm(
    builder: _MeshBuilder,
    hand: Vector,
    fingers: tuple[Vector, ...],
    space: _ScaledSpace,
) -> None:
    direction = _normalized(_mean(fingers[:2]) - hand)
    basis = _basis_for_axis(direction, space.lateral)
    builder.add_ellipsoid(
        hand + direction * 0.047,
        (0.077, 0.036, 0.082),
        basis,
        segments=24,
        rings=12,
    )


def _face_layout(head: Vector, space: _ScaledSpace) -> dict[str, Vector]:
    lateral, forward, up = space.lateral, space.forward, space.up
    asymmetry = lateral * FACIAL_ASYMMETRY_METRES
    left_eye = head + up * 0.102 + forward * 0.104 + lateral * 0.045 - asymmetry
    right_eye = head + up * 0.102 + forward * 0.104 - lateral * 0.045 + asymmetry
    return {
        "cranium": head + up * 0.090,
        "jaw": head + up * 0.018 - forward * 0.003,
        "left_eye": left_eye,
        "right_eye": right_eye,
        "nose_tip": head + up * 0.058 + forward * 0.165 + asymmetry,
        "mouth": head + up * 0.020 + forward * 0.123 + asymmetry,
        "chin": head - up * 0.035 + forward * 0.086,
    }


def _add_face(builder: _MeshBuilder, head: Vector, neck: Vector, space: _ScaledSpace) -> dict[str, Vector]:
    lateral, forward, up = space.lateral, space.forward, space.up
    layout = _face_layout(head, space)
    basis = (lateral, forward, up)
    builder.add_tapered_tube(neck - up * 0.020, head + up * 0.030, 0.102, 0.110, segments=26)
    builder.add_ellipsoid(layout["cranium"], (0.132, 0.112, 0.098), basis, segments=30, rings=16)
    builder.add_ellipsoid(layout["jaw"], (0.105, 0.090, 0.068), basis, segments=28, rings=14)
    for side in (-1.0, 1.0):
        builder.add_ellipsoid(
            head + up * 0.062 + forward * 0.078 + lateral * (side * 0.079),
            (0.038, 0.022, 0.032),
            basis,
            segments=20,
            rings=10,
        )
        builder.add_ellipsoid(
            head + up * 0.057 + lateral * (side * 0.133),
            (0.018, 0.025, 0.043),
            basis,
            segments=18,
            rings=10,
        )

    for eye in (layout["left_eye"], layout["right_eye"]):
        builder.add_ellipsoid(
            eye + up * 0.019 + forward * 0.009,
            (0.032, 0.008, 0.007),
            basis,
            segments=22,
            rings=10,
        )
        builder.add_ellipsoid(
            eye - up * 0.018 + forward * 0.010,
            (0.030, 0.008, 0.006),
            basis,
            segments=22,
            rings=10,
        )

    brow_height = head + up * 0.137 + forward * 0.100
    builder.add_tapered_tube(
        brow_height + lateral * 0.014,
        brow_height + lateral * 0.091,
        0.010,
        0.008,
        segments=16,
    )
    builder.add_tapered_tube(
        brow_height - lateral * 0.014,
        brow_height - lateral * 0.091,
        0.010,
        0.008,
        segments=16,
    )
    builder.add_tapered_tube(
        head + up * 0.120 + forward * 0.104,
        layout["nose_tip"],
        0.013,
        0.021,
        segments=18,
    )
    builder.add_ellipsoid(layout["nose_tip"], (0.022, 0.025, 0.020), basis, segments=20, rings=10)
    for side in (-1.0, 1.0):
        builder.add_ellipsoid(
            layout["nose_tip"] + lateral * (side * 0.022) - up * 0.006,
            (0.009, 0.014, 0.008),
            basis,
            segments=16,
            rings=8,
        )
    builder.add_ellipsoid(
        layout["mouth"] + up * 0.008,
        (0.044, 0.007, 0.006),
        basis,
        segments=22,
        rings=8,
    )
    builder.add_ellipsoid(
        layout["mouth"] - up * 0.008,
        (0.040, 0.007, 0.006),
        basis,
        segments=22,
        rings=8,
    )
    builder.add_ellipsoid(layout["chin"], (0.052, 0.027, 0.041), basis, segments=22, rings=10)
    return layout


def _build_body(
    landmarks: BoneLandmarks,
    space: _ScaledSpace,
    source_body: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, Vector]]:
    transformed = {name: space.point(point) for name, point in landmarks.positions.items()}
    hips = space.point(landmarks.hips)
    spine = space.point(landmarks.spine)
    spine1 = space.point(landmarks.spine1)
    spine2 = space.point(landmarks.spine2)
    neck = space.point(landmarks.neck)
    head = space.point(landmarks.head)
    shoulder_center = _mean((space.point(landmarks.left_shoulder), space.point(landmarks.right_shoulder)))
    builder = _MeshBuilder()
    basis = (space.lateral, space.forward, space.up)
    builder.add_loft(
        (
            (hips - space.up * 0.070, 0.165, 0.112),
            (hips + space.up * 0.015, 0.192, 0.130),
            (spine, 0.183, 0.128),
            (spine1, 0.205, 0.142),
            (spine2, 0.252, 0.154),
            (shoulder_center - space.up * 0.020, 0.270, 0.148),
            (neck - space.up * 0.028, 0.110, 0.096),
        ),
        basis,
        segments=30,
    )
    _add_arm(
        builder,
        space.point(landmarks.left_shoulder),
        space.point(landmarks.left_arm),
        space.point(landmarks.left_forearm),
        space.point(landmarks.left_hand),
        space,
    )
    _add_arm(
        builder,
        space.point(landmarks.right_shoulder),
        space.point(landmarks.right_arm),
        space.point(landmarks.right_forearm),
        space.point(landmarks.right_hand),
        space,
    )
    _add_leg(
        builder,
        space.point(landmarks.left_up_leg),
        space.point(landmarks.left_leg),
        space.point(landmarks.left_foot),
        space.point(landmarks.left_foot),
        space,
    )
    _add_leg(
        builder,
        space.point(landmarks.right_up_leg),
        space.point(landmarks.right_leg),
        space.point(landmarks.right_foot),
        space.point(landmarks.right_foot),
        space,
    )
    for side, hand in (("Left", landmarks.left_hand), ("Right", landmarks.right_hand)):
        chain_starts = tuple(space.point(landmarks.finger_chain(side, finger)[0]) for finger in _FINGER_NAMES)
        _add_palm(builder, space.point(hand), chain_starts, space)
    face = _add_face(builder, head, neck, space)
    body = _mesh_object("Procedural_Body", builder, collection, material, "body")
    body["source_body_name"] = source_body.name
    body["rig_alignment_scale"] = space.scale
    body["facial_asymmetry_m"] = FACIAL_ASYMMETRY_METRES
    body["joint_transition_rings"] = "shoulders elbows hips knees ankles"
    return body, face


def _activate_only(object_: bpy.types.Object) -> None:
    """Put Blender in the unambiguous object-selection state needed by operators."""

    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    object_.select_set(True)
    bpy.context.view_layer.objects.active = object_


def _source_space(
    source_body: bpy.types.Object,
    landmarks: BoneLandmarks,
    dimensions: WarriorDimensions,
) -> _ScaledSpace:
    """Map source world coordinates onto the requested anthropometric height.

    The source GLB is already an adult, full-body topological reference.  This
    mapping deliberately retains its pose, palms, and face coordinates instead
    of reconstructing those features from capsules around the armature.
    """

    minimum_x, maximum_x, minimum_y, maximum_y, minimum_z, maximum_z = _bounds(source_body)
    source_height = maximum_z - minimum_z
    if source_height <= 1.0e-6:
        raise RuntimeError(f"{source_body.name}: source body has no measurable height")
    lateral = _normalized(landmarks.left_shoulder - landmarks.right_shoulder)
    up = Vector((0.0, 0.0, 1.0))
    # The authored GLB's facial side is -Y in its world-aligned rest pose.
    # Keeping this explicit lets camera, hair, beard, and eyeballs use the
    # real facial side instead of decorating the back of the skull.
    forward = -_normalized(up.cross(lateral))
    return _ScaledSpace(
        Vector(((minimum_x + maximum_x) * 0.5, (minimum_y + maximum_y) * 0.5, minimum_z)),
        float(dimensions.height) / source_height,
        lateral,
        forward,
        up,
    )


def _copy_source_surface(
    source_body: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Duplicate the source surface into the anatomy collection without a rig.

    The body mesh gets a single-user data block, baked world coordinates, and
    no inherited source material or Armature modifier.  The source object is
    never changed or shown in the final stage.
    """

    body = source_body.copy()
    body.name = "Procedural_Body"
    body.data = source_body.data.copy()
    body.data.name = "Procedural_Body_Mesh"
    for owner in tuple(body.users_collection):
        owner.objects.unlink(body)
    collection.objects.link(body)
    body.parent = None
    body.hide_render = False
    body.hide_set(False)
    for modifier in tuple(body.modifiers):
        body.modifiers.remove(modifier)
    # Baking avoids a remesh resolution that changes when an imported GLB has
    # a transform baked into the object rather than its mesh coordinates.
    body.data.transform(body.matrix_world)
    body.matrix_world = Matrix.Identity(4)
    # Preserve the authored texture slots and UV-backed facial/hair detail.
    # A plain replacement skin makes the GLB's intentional source seams read
    # as cracks and erases the reference character's grounded face.
    source_materials = tuple(source_body.data.materials)
    body.data.materials.clear()
    if source_materials:
        for source_material in source_materials:
            body.data.materials.append(source_material)
    else:
        body.data.materials.append(material)
    # The remesh deliberately is not skinned in Task 3, but retaining the
    # source group names documents the finger-chain correspondence for the
    # next rigging task and lets callers trace every hand region to Mixamo.
    existing_groups = {group.name for group in body.vertex_groups}
    for source_group in source_body.vertex_groups:
        if source_group.name not in existing_groups:
            body.vertex_groups.new(name=source_group.name)
            existing_groups.add(source_group.name)
    body.data["procedural_warrior_anatomy"] = True
    body["procedural_warrior_anatomy"] = True
    body["anatomy_part"] = "body"
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    return body


def _cc0_human_templates() -> tuple[bpy.types.Object, tuple[bpy.types.Object, bpy.types.Object]]:
    """Load the compact official Blender CC0 male source once per scene."""

    source_collection = bpy.data.collections.get(CC0_HUMAN_SOURCE_COLLECTION_NAME)
    if source_collection is None:
        if not CC0_HUMAN_BLEND.is_file():
            raise RuntimeError(f"missing CC0 human source: {CC0_HUMAN_BLEND}")
        with bpy.data.libraries.load(str(CC0_HUMAN_BLEND), link=False) as (available, loaded):
            if "PW_CC0_HumanMale" not in available.collections:
                raise RuntimeError(f"{CC0_HUMAN_BLEND}: missing PW_CC0_HumanMale collection")
            loaded.collections = ["PW_CC0_HumanMale"]
        source_collection = loaded.collections[0]
        source_collection.name = CC0_HUMAN_SOURCE_COLLECTION_NAME
        bpy.context.scene.collection.children.link(source_collection)
    source_collection.hide_render = True
    body = source_collection.objects.get("CC0_Male_Body")
    left_eye = source_collection.objects.get("CC0_Male_Eye_L")
    right_eye = source_collection.objects.get("CC0_Male_Eye_R")
    if body is None or left_eye is None or right_eye is None:
        raise RuntimeError(f"{CC0_HUMAN_BLEND}: incomplete male body/eye source")
    return body, (left_eye, right_eye)


def _copy_cc0_human_body(
    source_body: bpy.types.Object,
    collection: bpy.types.Collection,
    dimensions: WarriorDimensions,
) -> bpy.types.Object:
    """Copy the connected official male body while retaining UVs and provenance."""

    template, _eyes = _cc0_human_templates()
    body = template.copy()
    body.name = "Procedural_Body"
    body.data = template.data.copy()
    body.data.name = "Procedural_Body_Mesh"
    for owner in tuple(body.users_collection):
        owner.objects.unlink(body)
    collection.objects.link(body)
    body.parent = None
    body.matrix_world = Matrix.Identity(4)
    body.hide_render = False
    body.hide_set(False)
    scale = float(dimensions.height) / 1.85
    for vertex in body.data.vertices:
        vertex.co *= scale
    body.data.update(calc_edges=True)
    body.data.calc_loop_triangles()
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    _restore_source_group_names(body, source_body)
    body.data["procedural_warrior_anatomy"] = True
    body["procedural_warrior_anatomy"] = True
    body["anatomy_part"] = "body"
    body["source_body_name"] = source_body.name
    body["source_asset_name"] = "Blender Foundation Human Base Meshes v1.4.1"
    body["source_asset_license"] = "CC0-1.0"
    body["source_asset_url"] = "https://www.blender.org/download/demo-files/"
    body["source_materials_preserved"] = True
    body["component_count_after_weld"] = len(_mesh_components(body.data))
    return body


def _copy_cc0_human_eyes(
    collection: bpy.types.Collection,
    materials: tuple[bpy.types.Material, bpy.types.Material, bpy.types.Material],
    dimensions: WarriorDimensions,
) -> bpy.types.Object:
    """Combine both official eyes into the two-component anatomy eye mesh."""

    _body, templates = _cc0_human_templates()
    builder = _MeshBuilder()
    body_scale = float(dimensions.height) / 1.85
    transformed_centers: list[Vector] = []
    for template in templates:
        points = [template.matrix_world @ vertex.co for vertex in template.data.vertices]
        minimum_x = min(point.x for point in points)
        maximum_x = max(point.x for point in points)
        center = _mean(points)
        transformed_centers.append(center * body_scale)
        eye_scale = (0.025 / max(maximum_x - minimum_x, 1.0e-6)) * body_scale
        socket_recess = Vector((0.0, 0.0025 * body_scale, 0.0))
        offset = len(builder.vertices)
        for point in points:
            transformed_center = center * body_scale
            transformed = transformed_center + (point - center) * eye_scale + socket_recess
            builder.vertices.append(tuple(float(value) for value in transformed))
        builder.faces.extend(
            tuple(offset + int(index) for index in polygon.vertices)
            for polygon in template.data.polygons
        )
    sclera, iris, pupil = materials
    eyes = _mesh_object("Procedural_Eyes", builder, collection, sclera, "eyes")
    eyes.data.materials.append(iris)
    eyes.data.materials.append(pupil)
    iris_radius = 0.0054 * body_scale
    pupil_radius = 0.00215 * body_scale
    for polygon in eyes.data.polygons:
        center = _mean(eyes.data.vertices[index].co for index in polygon.vertices)
        eye_center = min(transformed_centers, key=lambda point: abs(point.x - center.x))
        radial = math.hypot(center.x - eye_center.x, center.z - eye_center.z)
        if center.y < eye_center.y:
            if radial <= pupil_radius:
                polygon.material_index = 2
            elif radial <= iris_radius:
                polygon.material_index = 1
    eyes["paired"] = True
    eyes["width_m"] = 0.025 * body_scale
    eyes["socket_recess_m"] = 0.0025 * body_scale
    eyes["iris_radius_m"] = iris_radius
    eyes["source_asset_name"] = "Blender Foundation Human Base Meshes v1.4.1"
    eyes["source_asset_license"] = "CC0-1.0"
    return eyes


def _apply_dimension_warp(
    body: bpy.types.Object,
    space: _ScaledSpace,
    landmarks: BoneLandmarks,
    dimensions: WarriorDimensions,
) -> None:
    """Apply deterministic, anatomy-local measurements to the cloned surface.

    Height is mapped exactly by ``space``.  Shoulder/chest/waist/head/hand
    values affect the appropriate local regions instead of merely being stored
    as metadata; defaults preserve the authored source proportions.
    """

    mesh = body.data
    for vertex in mesh.vertices:
        vertex.co = space.point(vertex.co)

    bounds = _bounds(body)
    center_x = (bounds[0] + bounds[1]) * 0.5
    center_y = (bounds[2] + bounds[3]) * 0.5
    lowest_z = bounds[4]
    height = max(bounds[5] - lowest_z, 1.0e-6)
    shoulder_factor = float(dimensions.shoulder_width) / 0.49
    chest_factor = float(dimensions.chest_depth) / 0.25
    waist_factor = float(dimensions.waist_width) / 0.34
    head_factor = float(dimensions.head_height) / 0.235
    hand_factor = float(dimensions.hand_length) / 0.19
    transformed_neck = space.point(landmarks.neck)
    transformed_hands = (space.point(landmarks.left_hand), space.point(landmarks.right_hand))

    for vertex in mesh.vertices:
        point = vertex.co
        vertical = (point.z - lowest_z) / height
        torso = max(0.0, 1.0 - abs(point.x - center_x) / 0.34)
        shoulder = math.exp(-((vertical - 0.76) / 0.13) ** 2) * torso
        waist = math.exp(-((vertical - 0.50) / 0.11) ** 2) * torso
        chest = math.exp(-((vertical - 0.66) / 0.16) ** 2) * torso
        lateral_factor = 1.0 + (shoulder_factor - 1.0) * shoulder + (waist_factor - 1.0) * waist
        point.x = center_x + (point.x - center_x) * lateral_factor
        point.y = center_y + (point.y - center_y) * (1.0 + (chest_factor - 1.0) * chest)

        if point.z > transformed_neck.z:
            point.z = transformed_neck.z + (point.z - transformed_neck.z) * head_factor
        for hand in transformed_hands:
            offset = point - hand
            if offset.length < 0.175:
                point = hand + offset * hand_factor
        vertex.co = point

    mesh.update(calc_edges=True)


def _uniformly_scale_source_surface(body: bpy.types.Object, space: _ScaledSpace) -> None:
    """Scale the authored body uniformly to target height without reshaping it."""

    for vertex in body.data.vertices:
        vertex.co = space.point(vertex.co)
    body.data.update(calc_edges=True)


def _conservative_source_weld(
    body: bpy.types.Object,
    distances: Sequence[float] = (0.000001, 0.00001, 0.0001),
) -> tuple[tuple[float, int, int], ...]:
    """Weld coincident source seam vertices while retaining authored shape/UVs.

    The imported GLB was exported as disconnected triangles/shards.  Blender's
    bmesh operation preserves the existing loop data, and the requested range
    is deliberately capped at 0.1 mm so it cannot blur facial or hand detail.
    """

    mesh = body.data
    measurements: list[tuple[float, int, int]] = []
    for distance in distances:
        if distance <= 0.0 or distance > 0.0001:
            raise ValueError("source weld distances must be in (0, 0.0001]")
        bm = bmesh.new()
        try:
            bm.from_mesh(mesh)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=distance)
            # Welding authored UV seams can collapse a triangle whose corners
            # occupied the same position but carried distinct loop data.  Drop
            # only those now-zero-area faces; retaining them makes Blender's
            # mesh validator reject the otherwise unchanged source surface.
            collapsed_faces = [face for face in bm.faces if face.calc_area() <= 1.0e-12]
            for face in collapsed_faces:
                bm.faces.remove(face)
            for edge in tuple(bm.edges):
                if not edge.link_faces:
                    bm.edges.remove(edge)
            for vertex in tuple(bm.verts):
                if not vertex.link_faces:
                    bm.verts.remove(vertex)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
        finally:
            bm.free()
        mesh.update(calc_edges=True)
        measurements.append((distance, len(mesh.vertices), len(_mesh_components(mesh))))
        if measurements[-1][2] == 1:
            break
    # ``Mesh`` coordinates are float32.  A triangle that is merely tiny in
    # BMesh's higher precision can become exactly collinear only after the
    # final ``to_mesh`` quantisation, so validate once more from that stored
    # representation without performing another weld afterwards.
    collapsed_indices = {
        polygon.index for polygon in mesh.polygons if polygon.area <= 1.0e-12
    }
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        collapsed_faces = [bm.faces[index] for index in sorted(collapsed_indices)]
        for face in collapsed_faces:
            bm.faces.remove(face)
        for edge in tuple(bm.edges):
            if not edge.link_faces:
                bm.edges.remove(edge)
        for vertex in tuple(bm.verts):
            if not vertex.link_faces:
                bm.verts.remove(vertex)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update(calc_edges=True)
    measurements[-1] = (
        measurements[-1][0],
        len(mesh.vertices),
        len(_mesh_components(mesh)),
    )
    mesh.calc_loop_triangles()
    body["weld_measurements"] = "; ".join(
        f"{distance:g}m:{vertices}v/{components}c"
        for distance, vertices, components in measurements
    )
    body["weld_max_distance_m"] = measurements[-1][0]
    return tuple(measurements)


def _component_stitch_candidates(
    mesh: bpy.types.Mesh,
    components: Sequence[set[int]],
) -> list[tuple[float, int, int, int, int]]:
    """Return nearest inter-component vertex pairs for a minimal seam graph."""

    component_by_vertex = {
        vertex_index: component_index
        for component_index, component in enumerate(components)
        for vertex_index in component
    }
    tree = KDTree(len(mesh.vertices))
    for vertex in mesh.vertices:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    shortest: dict[tuple[int, int], tuple[float, int, int]] = {}
    for vertex in mesh.vertices:
        component_index = component_by_vertex[vertex.index]
        for _coordinate, other_index, distance in tree.find_n(vertex.co, 32):
            other_component = component_by_vertex[other_index]
            if other_component == component_index:
                continue
            first, second = sorted((component_index, other_component))
            candidate = (float(distance), vertex.index, int(other_index))
            previous = shortest.get((first, second))
            if previous is None or candidate[0] < previous[0]:
                shortest[(first, second)] = candidate
            break
    return sorted(
        (distance, first, second, first_vertex, second_vertex)
        for (first, second), (distance, first_vertex, second_vertex) in shortest.items()
    )


def _stitch_remaining_source_shards(body: bpy.types.Object) -> tuple[int, float]:
    """Create invisible topological seam stitches without altering source shape.

    Each bridge is a sub-millimetre triangle spanning two neighboring export
    shards.  The bridge's third vertex is offset by at most 0.5 mm along the
    averaged surface normal, keeping it inside the already-overlapping seam
    region rather than adding visible geometry to the silhouette.
    """

    mesh = body.data
    components = _mesh_components(mesh)
    if len(components) == 1:
        return 0, 0.0
    candidates = _component_stitch_candidates(mesh, components)
    parent = list(range(len(components)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    chosen: list[tuple[float, int, int]] = []
    for distance, first, second, first_vertex, second_vertex in candidates:
        first_root, second_root = find(first), find(second)
        if first_root == second_root:
            continue
        parent[first_root] = second_root
        chosen.append((distance, first_vertex, second_vertex))
    roots = {find(index) for index in range(len(components))}
    if len(roots) != 1:
        raise RuntimeError("source shards could not form a complete conservative stitch graph")

    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        for distance, first_index, second_index in chosen:
            first = bm.verts[first_index]
            second = bm.verts[second_index]
            normal = first.normal + second.normal
            if normal.length <= 1.0e-7:
                normal = Vector((0.0, 0.0, 1.0))
            else:
                normal.normalize()
            offset = max(0.00005, min(distance * 0.35, 0.0005))
            midpoint = (first.co + second.co) * 0.5 - normal * offset
            bridge_vertex = bm.verts.new(midpoint)
            try:
                bm.faces.new((first, second, bridge_vertex))
            except ValueError:
                # A pre-existing identical face needs no extra stitch.
                bm.verts.remove(bridge_vertex)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update(calc_edges=True)
    mesh.calc_loop_triangles()
    remaining = len(_mesh_components(mesh))
    if remaining != 1:
        raise RuntimeError(f"source seam stitches left {remaining} body components")
    maximum_gap = max((distance for distance, _first, _second in chosen), default=0.0)
    body["topological_stitches"] = len(chosen)
    body["max_stitch_gap_m"] = maximum_gap
    body["post_stitch_components"] = remaining
    return len(chosen), maximum_gap


def _integrated_face_relief(
    face: Mapping[str, Vector],
    space: _ScaledSpace,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Create a few intersecting facial relief volumes for one voxel-fused skin.

    These are deliberately not final separate "face pieces": they are joined
    into the source skin and remeshed, yielding continuous brow, eyelid, nose,
    lip, and chin planes while the realistic source head supplies cheeks/ears.
    """

    builder = _MeshBuilder()
    lateral, forward, up = space.lateral, space.forward, space.up
    basis = (lateral, forward, up)
    for eye in (face["left_eye"], face["right_eye"]):
        builder.add_ellipsoid(
            eye + up * 0.018 - forward * 0.003,
            (0.020, 0.010, 0.006),
            basis,
            segments=20,
            rings=10,
        )
        builder.add_ellipsoid(
            eye - up * 0.016 - forward * 0.001,
            (0.018, 0.009, 0.005),
            basis,
            segments=20,
            rings=10,
        )
    brow = face["left_eye"] + up * 0.050 - forward * 0.010
    builder.add_tapered_tube(
        brow + lateral * 0.012,
        brow + lateral * 0.076,
        0.010,
        0.008,
        segments=16,
    )
    brow = face["right_eye"] + up * 0.050 - forward * 0.010
    builder.add_tapered_tube(
        brow - lateral * 0.012,
        brow - lateral * 0.076,
        0.010,
        0.008,
        segments=16,
    )
    nose_root = _mean((face["left_eye"], face["right_eye"])) + up * 0.006
    builder.add_tapered_tube(nose_root, face["nose_tip"], 0.015, 0.021, segments=20)
    builder.add_ellipsoid(face["nose_tip"], (0.022, 0.020, 0.019), basis, segments=20, rings=10)
    builder.add_ellipsoid(
        face["mouth"] + up * 0.008 - forward * 0.002,
        (0.043, 0.010, 0.005),
        basis,
        segments=22,
        rings=10,
    )
    builder.add_ellipsoid(
        face["mouth"] - up * 0.008 - forward * 0.001,
        (0.040, 0.009, 0.005),
        basis,
        segments=22,
        rings=10,
    )
    builder.add_ellipsoid(face["chin"], (0.050, 0.024, 0.036), basis, segments=22, rings=10)
    return _mesh_object("Procedural_IntegratedFaceRelief", builder, collection, material, "temporary")


def _join_into_body(body: bpy.types.Object, feature: bpy.types.Object) -> None:
    _activate_only(body)
    feature.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "Procedural_Body"
    body.data.name = "Procedural_Body_Mesh"


def _voxel_union_surface(body: bpy.types.Object, voxel_size: float = 0.014) -> None:
    """Fuse the source islands and integrated facial relief into one skin mesh."""

    _activate_only(body)
    modifier = body.modifiers.new("Procedural_ContinuousSkin", "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = voxel_size
    modifier.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    body.data.update(calc_edges=True)
    body.data.calc_loop_triangles()
    body["voxel_union"] = True
    body["voxel_size_m"] = voxel_size


def _mesh_components(mesh: bpy.types.Mesh) -> list[set[int]]:
    """Return vertex sets connected by mesh faces, without mutating the mesh."""

    neighbors = {index: set() for index in range(len(mesh.vertices))}
    for polygon in mesh.polygons:
        indices = tuple(int(index) for index in polygon.vertices)
        for index, vertex_index in enumerate(indices):
            neighbors[vertex_index].add(indices[(index + 1) % len(indices)])
            neighbors[vertex_index].add(indices[(index - 1) % len(indices)])
    components: list[set[int]] = []
    remaining = set(neighbors)
    while remaining:
        component = {remaining.pop()}
        frontier = list(component)
        while frontier:
            current = frontier.pop()
            adjacent = neighbors[current] & remaining
            remaining.difference_update(adjacent)
            frontier.extend(adjacent)
            component.update(adjacent)
        components.append(component)
    return components


def _retain_largest_voxel_surface(body: bpy.types.Object) -> tuple[int, int]:
    """Discard tiny post-voxel islands while preserving the full body surface.

    The GLB's source mesh has 1105 separate import shards (its largest raw
    shard has only 487 vertices), so selecting a raw "largest body" would
    destroy the body.  Voxel fusion first joins the anatomical shards; this
    function then removes only the residual tiny islands and records exactly
    what was discarded.
    """

    old_mesh = body.data
    components = _mesh_components(old_mesh)
    largest = max(components, key=len)
    discarded = [component for component in components if component is not largest]
    if not discarded:
        return 0, 0
    retained_index = {old_index: new_index for new_index, old_index in enumerate(sorted(largest))}
    vertices = [old_mesh.vertices[index].co.copy() for index in sorted(largest)]
    faces = [
        tuple(retained_index[int(index)] for index in polygon.vertices)
        for polygon in old_mesh.polygons
        if all(int(index) in retained_index for index in polygon.vertices)
    ]
    new_mesh = bpy.data.meshes.new("Procedural_Body_Mesh_Filtered")
    new_mesh.from_pydata(vertices, [], faces)
    new_mesh.update(calc_edges=True)
    for material in old_mesh.materials:
        new_mesh.materials.append(material)
    new_mesh["procedural_warrior_anatomy"] = True
    for polygon in new_mesh.polygons:
        polygon.use_smooth = True
    new_mesh.calc_loop_triangles()
    body.data = new_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    new_mesh.name = "Procedural_Body_Mesh"
    discarded_vertices = sum(len(component) for component in discarded)
    body["post_voxel_components"] = len(components)
    body["discarded_voxel_islands"] = len(discarded)
    body["discarded_voxel_vertices"] = discarded_vertices
    return len(discarded), discarded_vertices


def _restore_source_group_names(body: bpy.types.Object, source_body: bpy.types.Object) -> None:
    """Restore Mixamo region labels lost by Blender's voxel-remesh operator.

    Task 3 does not assign deformation weights; the labels are structural
    correspondence metadata for its connected finger surface and for later
    rigging work.  Recreating them after remesh avoids claiming that old
    weights still match the new voxel topology.
    """

    existing = {group.name for group in body.vertex_groups}
    for source_group in source_body.vertex_groups:
        if source_group.name not in existing:
            body.vertex_groups.new(name=source_group.name)
            existing.add(source_group.name)


def _assert_body_encloses_landmarks(
    body: bpy.types.Object,
    landmarks: BoneLandmarks,
    space: _ScaledSpace,
) -> None:
    """Guard that post-voxel cleanup did not discard head/hands/feet regions."""

    minimum_x, maximum_x, minimum_y, maximum_y, minimum_z, maximum_z = _bounds(body)
    tolerance = 0.18
    missing = []
    for name in ("mixamorig:Head", "mixamorig:LeftHand", "mixamorig:RightHand", "mixamorig:LeftFoot", "mixamorig:RightFoot"):
        point = space.point(landmarks.positions[name])
        if not (
            minimum_x - tolerance <= point.x <= maximum_x + tolerance
            and minimum_y - tolerance <= point.y <= maximum_y + tolerance
            and minimum_z - tolerance <= point.z <= maximum_z + tolerance
        ):
            missing.append(name)
    if missing:
        raise RuntimeError(f"post-voxel surface lost landmark regions: {', '.join(missing)}")


def _fit_body_height(body: bpy.types.Object, desired_height: float) -> None:
    bounds = _bounds(body)
    current_height = bounds[5] - bounds[4]
    if current_height <= 1.0e-6:
        raise RuntimeError("voxel body has no measurable height")
    factor = float(desired_height) / current_height
    floor = bounds[4]
    for vertex in body.data.vertices:
        vertex.co.z = floor + (vertex.co.z - floor) * factor
    body.data.update(calc_edges=True)
    body.data.calc_loop_triangles()


def _build_continuous_body(
    landmarks: BoneLandmarks,
    source_body: bpy.types.Object,
    dimensions: WarriorDimensions,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, Vector], _ScaledSpace]:
    """Build from the connected Blender Foundation CC0 realistic male body."""

    space = _source_space(source_body, landmarks, dimensions)
    body = _copy_cc0_human_body(source_body, collection, dimensions)
    transformed_head = space.point(landmarks.head)
    face = _face_layout(transformed_head, space)
    _assert_body_encloses_landmarks(body, landmarks, space)
    body["source_topology_vertices"] = len(body.data.vertices)
    body["facial_asymmetry_m"] = FACIAL_ASYMMETRY_METRES
    body["visible_surface_continuity"] = "single connected quad-derived CC0 surface"
    body["finger_regions"] = 10
    body["target_height_m"] = float(dimensions.height)
    body["shoulder_width_m"] = float(dimensions.shoulder_width)
    body["chest_depth_m"] = float(dimensions.chest_depth)
    body["waist_width_m"] = float(dimensions.waist_width)
    body["head_height_m"] = float(dimensions.head_height)
    body["hand_length_m"] = float(dimensions.hand_length)
    return body, face, space


def _build_fingers(
    landmarks: BoneLandmarks,
    space: _ScaledSpace,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> list[bpy.types.Object]:
    created: list[bpy.types.Object] = []
    radii = {
        "Thumb": (0.025, 0.021, 0.018),
        "Index": (0.021, 0.018, 0.015),
        "Middle": (0.022, 0.019, 0.016),
        "Ring": (0.020, 0.017, 0.014),
        "Pinky": (0.017, 0.014, 0.012),
    }
    finger_spread = {
        "Thumb": -0.033,
        "Index": -0.012,
        "Middle": 0.000,
        "Ring": 0.012,
        "Pinky": 0.024,
    }
    for side in ("Left", "Right"):
        for finger in _FINGER_NAMES:
            builder = _MeshBuilder()
            points = tuple(
                space.point(point) + space.forward * finger_spread[finger]
                for point in landmarks.finger_chain(side, finger)
            )
            for index in range(3):
                start, end = points[index], points[index + 1]
                direction = end - start
                if direction.length <= 1.0e-6:
                    continue
                gap = _normalized(direction) * 0.0012
                builder.add_tapered_tube(
                    start + gap,
                    end - gap,
                    radii[finger][index],
                    radii[finger][index] * 0.88,
                    segments=18,
                )
            object_ = _mesh_object(
                f"Procedural_Finger_{side}_{finger}",
                builder,
                collection,
                material,
                "finger",
            )
            object_["side"] = side
            object_["finger"] = finger
            object_["segments"] = 3
            created.append(object_)
    return created


def _build_eyes(
    face: Mapping[str, Vector],
    space: _ScaledSpace,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    builder = _MeshBuilder()
    basis = (space.lateral, space.forward, space.up)
    for eye in (face["left_eye"], face["right_eye"]):
        builder.add_ellipsoid(
            eye + space.forward * 0.015,
            (0.0125, 0.0105, 0.0115),
            basis,
            segments=20,
            rings=10,
        )
    eyes = _mesh_object("Procedural_Eyes", builder, collection, material, "eyes")
    eyes["paired"] = True
    eyes["width_m"] = 0.025
    return eyes


def _append_surface_patch(
    builder: _MeshBuilder,
    body: bpy.types.Object,
    polygons: Sequence[bpy.types.MeshPolygon],
    offset: float,
    *,
    texture_frequency: float = 0.0,
) -> None:
    """Append an offset copy of a connected body patch to ``builder``."""

    indices = sorted({int(index) for polygon in polygons for index in polygon.vertices})
    remap = {source: len(builder.vertices) + position for position, source in enumerate(indices)}
    for index in indices:
        vertex = body.data.vertices[index]
        ripple = 0.0
        if texture_frequency:
            ripple = math.sin((vertex.co.x * 1.7 + vertex.co.z) * texture_frequency) * 0.0012
        point = vertex.co + _normalized(vertex.normal) * (offset + ripple)
        builder.vertices.append(tuple(float(value) for value in point))
    builder.faces.extend(
        tuple(remap[int(index)] for index in polygon.vertices)
        for polygon in polygons
    )


def _project_builder_vertices_to_body(
    builder: _MeshBuilder,
    body: bpy.types.Object,
    first_index: int,
    offset: float,
) -> None:
    """Snap newly appended vertices to the connected body with a tiny air gap."""

    surface = BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in body.data.vertices],
        [tuple(int(index) for index in polygon.vertices) for polygon in body.data.polygons],
        all_triangles=False,
    )
    for index in range(first_index, len(builder.vertices)):
        original = Vector(builder.vertices[index])
        nearest, normal, _face_index, _distance = surface.find_nearest(original)
        if nearest is None or normal is None:
            raise RuntimeError("failed to project grooming surface onto the CC0 head")
        direction = Vector(normal)
        if direction.length <= 1.0e-7:
            direction = Vector((0.0, -1.0, 0.0))
        else:
            direction.normalize()
        # A pure closest-point snap can map adjacent parametric samples to the
        # exact same point at an eyelid/ear seam.  Retaining 3.5% of the smooth
        # source parameterization prevents zero-area quads while remaining
        # visually flush with the body.
        fitted = nearest.lerp(original, 0.035)
        builder.vertices[index] = tuple(fitted + direction * offset)


def _build_hair(
    body: bpy.types.Object,
    space: _ScaledSpace,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Build a smooth swept scalp shell with a compact tied-back silhouette."""

    builder = _MeshBuilder()
    scale = max(body.dimensions.z / 1.85, 1.0e-6)
    segments = 64
    rings = 20
    center = Vector((0.0, 0.004, 0.792)) * scale
    radii = Vector((0.109, 0.124, 0.144)) * scale
    shell_start = len(builder.vertices)
    top = len(builder.vertices)
    builder.vertices.append(tuple(center + Vector((0.0, 0.0, radii.z))))
    ring_indices: list[list[int]] = []
    for ring in range(1, rings + 1):
        fraction = ring / rings
        indices: list[int] = []
        for segment in range(segments):
            phi = math.tau * segment / segments
            front = max(0.0, -math.sin(phi))
            back = max(0.0, math.sin(phi))
            side = 1.0 - front - back
            # A high, swept front hairline transitions continuously to the
            # lower sideburn/back silhouette; no source-polygon stair steps.
            theta_end = 1.08 * front + 1.78 * side + 2.18 * back
            theta_end += 0.050 * front * abs(math.cos(phi))
            theta_end += 0.060 * front * (1.0 - abs(math.cos(phi)))
            theta = theta_end * fraction
            strand_ripple = 0.0012 * math.sin(phi * 11.0 + fraction * 7.0) * fraction
            point = center + Vector(
                (
                    (radii.x + strand_ripple) * math.sin(theta) * math.cos(phi),
                    (radii.y + strand_ripple) * math.sin(theta) * math.sin(phi),
                    radii.z * math.cos(theta),
                )
            )
            indices.append(len(builder.vertices))
            builder.vertices.append(tuple(point))
        ring_indices.append(indices)
    first = ring_indices[0]
    for segment in range(segments):
        following = (segment + 1) % segments
        builder.faces.append((top, first[segment], first[following]))
    for lower, upper in zip(ring_indices, ring_indices[1:]):
        for segment in range(segments):
            following = (segment + 1) % segments
            builder.faces.append((lower[segment], upper[segment], upper[following], lower[following]))
    _project_builder_vertices_to_body(builder, body, shell_start, 0.0042 * scale)

    lateral, back, up = Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)), Vector((0.0, 0.0, 1.0))
    basis = (lateral, back, up)
    bun = Vector((0.0, 0.151, 0.787)) * scale
    builder.add_ellipsoid(bun, (0.043 * scale, 0.040 * scale, 0.047 * scale), basis, segments=24, rings=13)
    builder.add_tapered_tube(
        Vector((0.0, 0.159, 0.767)) * scale,
        Vector((0.012, 0.188, 0.638)) * scale,
        0.020 * scale,
        0.007 * scale,
        segments=20,
    )
    eyebrow_basis = (Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)), Vector((0.0, 0.0, 1.0)))
    for side in (-1.0, 1.0):
        builder.add_ellipsoid(
            Vector((side * 0.044, -0.123, 0.829)) * scale,
            (0.028 * scale, 0.0026 * scale, 0.0038 * scale),
            eyebrow_basis,
            segments=20,
            rings=8,
        )
    hair = _mesh_object("Procedural_Hair", builder, collection, material, "hair")
    hair["style"] = "medium tied back"
    hair["surface_following"] = True
    hair["construction"] = "parametric smooth shell"
    hair["hairline"] = "smooth swept"
    hair["eyebrows"] = 2
    hair.hide_render = False
    return hair


def _build_beard(
    body: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Build a smooth, close-trimmed jaw patch below the lower lip."""

    builder = _MeshBuilder()
    scale = max(body.dimensions.z / 1.85, 1.0e-6)
    columns = 24
    rows = 14
    beard_start = len(builder.vertices)
    grid: list[list[int]] = []
    for row in range(rows):
        v = row / (rows - 1)
        z = (0.704 * (1.0 - v) + 0.650 * v) * scale
        half_width = (0.063 * (1.0 - 0.10 * v)) * scale
        indices: list[int] = []
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            x = half_width * u
            profile_y = (-0.124 + 0.050 * v + 0.022 * abs(u) ** 1.7) * scale
            texture = 0.00075 * scale * math.sin(column * 1.9 + row * 1.4)
            point = Vector((x, profile_y - 0.0022 * scale - texture, z))
            indices.append(len(builder.vertices))
            builder.vertices.append(tuple(point))
        grid.append(indices)
    for upper, lower in zip(grid, grid[1:]):
        for column in range(columns - 1):
            builder.faces.append((upper[column], upper[column + 1], lower[column + 1], lower[column]))
    _project_builder_vertices_to_body(builder, body, beard_start, 0.0090 * scale)
    # Closest-point fitting follows the facial depth but can inherit tiny Z
    # steps from the source topology.  Restore each authored row height so the
    # beard's lower silhouette remains deliberately smooth.
    for row_index, indices in enumerate(grid):
        v = row_index / (rows - 1)
        authored_z = (0.704 * (1.0 - v) + 0.650 * v) * scale
        for column_index, index in enumerate(indices):
            point = Vector(builder.vertices[index])
            point.z = authored_z
            u = -1.0 + 2.0 * column_index / (columns - 1)
            point.y -= 0.012 * scale * (1.0 - u * u)
            builder.vertices[index] = tuple(point)
    beard = _mesh_object("Procedural_Beard", builder, collection, material, "beard")
    beard["style"] = "short jaw beard"
    beard["surface_following"] = True
    beard.hide_render = False
    return beard


def build_anatomy(
    armature: bpy.types.Object,
    source_body: bpy.types.Object,
    dimensions: WarriorDimensions = WarriorDimensions(),
    collection: bpy.types.Collection | None = None,
) -> AnatomyParts:
    """Build deterministic anatomy aligned proportionally to an imported rest rig.

    Only objects stamped by an earlier anatomy generation inside ``collection``
    are replaced.  The source armature/body are read-only inputs; no skinning,
    rig weights, animation, clothing, or export data is created here.
    """

    if source_body is None or getattr(source_body, "type", None) != "MESH":
        raise RuntimeError("build_anatomy requires a source body mesh")
    if not isinstance(dimensions, WarriorDimensions):
        raise TypeError("dimensions must be a WarriorDimensions instance")
    target = _target_collection(collection)
    landmarks = extract_landmarks(armature)
    _clear_previous_anatomy(target)
    skin = _material("PW_Anatomy_Skin", (0.220, 0.055, 0.025, 1.0), 0.68)
    eye_sclera = _material("PW_Anatomy_EyeSclera", (0.34, 0.27, 0.23, 1.0), 0.28)
    eye_iris = _material("PW_Anatomy_EyeIris", (0.030, 0.010, 0.003, 1.0), 0.30)
    eye_pupil = _material("PW_Anatomy_EyePupil", (0.002, 0.003, 0.005, 1.0), 0.16)
    hair_material = _material("PW_Anatomy_Hair", (0.028, 0.010, 0.0035, 1.0), 0.48)
    beard_material = _material("PW_Anatomy_Beard", (0.022, 0.007, 0.0025, 1.0), 0.60)
    _configure_groom_material(
        hair_material,
        (0.010, 0.0025, 0.0008, 1.0),
        (0.055, 0.016, 0.004, 1.0),
    )
    _configure_groom_material(
        beard_material,
        (0.006, 0.0015, 0.0005, 1.0),
        (0.036, 0.009, 0.002, 1.0),
    )

    body, face, space = _build_continuous_body(
        landmarks,
        source_body,
        dimensions,
        target,
        skin,
    )
    eyes = _copy_cc0_human_eyes(target, (eye_sclera, eye_iris, eye_pupil), dimensions)
    hair = _build_hair(body, space, target, hair_material)
    beard = _build_beard(body, target, beard_material)
    eyes.hide_render = False
    for surface in (hair, beard):
        surface.hide_render = False
        surface["source_guided_proxy"] = False
    created = (body, eyes, hair, beard)
    _purge_anatomy_orphans()
    bpy.context.view_layer.update()
    return AnatomyParts(body=body, eyes=eyes, hair=hair, beard=beard, objects=created)


def _find_source_armature() -> bpy.types.Object | None:
    for object_ in bpy.data.objects:
        if object_.type == "ARMATURE" and all(object_.data.bones.get(name) for name in _CORE_BONES):
            return object_
    return None


def _import_source_asset() -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Collection]:
    """Find or import the source GLB into a dedicated collection without touching probes."""

    armature = _find_source_armature()
    if armature is not None:
        bodies = [object_ for object_ in bpy.data.objects if object_.type == "MESH" and object_.parent == armature]
        if not bodies:
            raise RuntimeError(f"{armature.name}: source armature has no child mesh")
        source_collection = next(iter(armature.users_collection), bpy.context.scene.collection)
        return armature, max(bodies, key=lambda object_: len(object_.data.vertices)), source_collection

    source_path = Path(__file__).resolve().parents[2] / SOURCE_GLB_RELATIVE
    if not source_path.is_file():
        raise RuntimeError(f"missing source GLB: {source_path}")
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    source_collection = bpy.data.collections.get(SOURCE_COLLECTION_NAME)
    if source_collection is None:
        source_collection = bpy.data.collections.new(SOURCE_COLLECTION_NAME)
        bpy.context.scene.collection.children.link(source_collection)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    imported = tuple(object_ for object_ in bpy.data.objects if object_ not in before)
    for object_ in imported:
        source_collection.objects.link(object_)
        for owner in tuple(object_.users_collection):
            if owner != source_collection:
                owner.objects.unlink(object_)
        object_.hide_render = True
    armature = next((object_ for object_ in imported if object_.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError(f"{source_path}: import produced no armature")
    source_body = max(
        (object_ for object_ in imported if object_.type == "MESH"),
        key=lambda object_: len(object_.data.vertices),
    )
    armature.data.pose_position = "REST"
    return armature, source_body, source_collection


def _stage_light(
    name: str,
    collection: bpy.types.Collection,
    location: Vector,
    target: Vector,
    energy: float,
    color: tuple[float, float, float],
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = 2.0
    object_ = bpy.data.objects.new(name, data)
    collection.objects.link(object_)
    object_.location = location
    object_.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
    object_["procedural_warrior_anatomy"] = True
    object_["anatomy_part"] = "stage_light"
    return object_


def _stage_camera(collection: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.cameras.new("Procedural_Stage_Camera")
    data.lens = 54.0
    camera = bpy.data.objects.new("Procedural_Stage_Camera", data)
    collection.objects.link(camera)
    camera["procedural_warrior_anatomy"] = True
    camera["anatomy_part"] = "stage_camera"
    return camera


def _set_camera(camera: bpy.types.Object, location: Vector, target: Vector) -> None:
    camera.location = location
    camera.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()


def _render_to(scene: bpy.types.Scene, camera: bpy.types.Object, path: Path, location: Vector, target: Vector) -> None:
    _set_camera(camera, location, target)
    scene.camera = camera
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def _contact_sheet(paths: Sequence[Path], output: Path, cell_width: int, cell_height: int) -> None:
    """Assemble Blender-rendered PNG panels without an external image dependency."""

    loaded = [bpy.data.images.load(str(path), check_existing=False) for path in paths]
    canvas_width = cell_width * len(loaded)
    canvas = [0.17, 0.17, 0.17, 1.0] * (canvas_width * cell_height)
    try:
        for panel, image in enumerate(loaded):
            image.scale(cell_width, cell_height)
            pixels = list(image.pixels[:])
            for row in range(cell_height):
                source_start = row * cell_width * 4
                source_end = source_start + cell_width * 4
                target_start = (row * canvas_width + panel * cell_width) * 4
                canvas[target_start : target_start + cell_width * 4] = pixels[source_start:source_end]
        sheet = bpy.data.images.new("ProceduralWarrior_ContactSheet", canvas_width, cell_height, alpha=True)
        try:
            sheet.pixels.foreach_set(canvas)
            sheet.filepath_raw = str(output)
            sheet.file_format = "PNG"
            sheet.save()
        finally:
            bpy.data.images.remove(sheet)
    finally:
        for image in loaded:
            bpy.data.images.remove(image)
        for path in paths:
            if path.exists():
                path.unlink()


def _add_stage_floor(collection: bpy.types.Collection, height: float) -> bpy.types.Object:
    builder = _MeshBuilder(
        vertices=[(-3.2, -3.2, height), (3.2, -3.2, height), (3.2, 3.2, height), (-3.2, 3.2, height)],
        faces=[(0, 1, 2, 3)],
    )
    material = _material("PW_Anatomy_Floor", (0.125, 0.125, 0.125, 1.0), 0.78)
    return _mesh_object("Procedural_Stage_Floor", builder, collection, material, "stage_floor")


def _ensure_task2_probe() -> tuple[bpy.types.Collection, bpy.types.Object]:
    """Keep Task 2's named probe available in every clean anatomy stage.

    The probe is intentionally outside the anatomy collection: rerunning Task
    3 cleans only its own stamped objects, while this tiny deterministic loft
    demonstrates that the stage preserves prior task structure.
    """

    collection = bpy.data.collections.get("ProceduralWarrior_Task2")
    if collection is None:
        collection = bpy.data.collections.new("ProceduralWarrior_Task2")
        bpy.context.scene.collection.children.link(collection)
    probe = collection.objects.get("TestTorso_MCP")
    if probe is None:
        probe = loft_mesh(
            "TestTorso_MCP",
            ((-0.20, 0.14, 0.09), (-0.02, 0.20, 0.12), (0.18, 0.16, 0.10)),
            radial_segments=16,
            collection=collection,
        )
        probe.location = (2.15, -1.85, 0.20)
        probe.hide_render = True
        probe["task2_probe"] = True
    return collection, probe


def _ensure_preserved_default_objects() -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    """Keep the seed scene's Cube/Camera/Light contract even after clean tests."""

    cube = bpy.data.objects.get("Cube")
    if cube is None:
        mesh = bpy.data.meshes.new("Cube")
        mesh.from_pydata(
            [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
            [],
            [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)],
        )
        mesh.update(calc_edges=True)
        cube = bpy.data.objects.new("Cube", mesh)
        bpy.context.scene.collection.objects.link(cube)
        cube.hide_render = True
    camera = bpy.data.objects.get("Camera")
    if camera is None:
        camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
        bpy.context.scene.collection.objects.link(camera)
        camera.hide_render = True
    light = bpy.data.objects.get("Light")
    if light is None:
        light = bpy.data.objects.new("Light", bpy.data.lights.new("Light", "POINT"))
        bpy.context.scene.collection.objects.link(light)
        light.hide_render = True
    return cube, camera, light


def _part_metrics(parts: AnatomyParts) -> dict[str, object]:
    meshes = [object_ for object_ in parts.objects if object_.type == "MESH"]
    for object_ in meshes:
        object_.data.calc_loop_triangles()
    return {
        "objects": tuple(object_.name for object_ in parts.objects),
        "vertices": sum(len(object_.data.vertices) for object_ in meshes),
        "triangles": sum(len(object_.data.loop_triangles) for object_ in meshes),
        "body_vertices": len(parts.body.data.vertices),
        "body_triangles": len(parts.body.data.loop_triangles),
        "height": parts.height,
    }


def build_stage(output_root: Path | None = None, *, render: bool = True) -> dict[str, object]:
    """Build the anatomy stage in the current scene and render both required PNGs."""

    output_root = output_root or Path(__file__).resolve().parents[2]
    artifacts = output_root / "artifacts" / "procedural-warrior"
    artifacts.mkdir(parents=True, exist_ok=True)
    _ensure_preserved_default_objects()
    armature, source_body, source_collection = _import_source_asset()
    collection = _target_collection(None)
    task2_collection, task2_probe = _ensure_task2_probe()
    parts = build_anatomy(armature, source_body, collection=collection)
    stage_landmarks = extract_landmarks(armature)
    space = _source_space(source_body, stage_landmarks, WarriorDimensions())
    body_bounds = _bounds(parts.body)
    center = Vector(
        (
            (body_bounds[0] + body_bounds[1]) * 0.5,
            (body_bounds[2] + body_bounds[3]) * 0.5,
            (body_bounds[4] + body_bounds[5]) * 0.5,
        )
    )
    floor = _add_stage_floor(collection, body_bounds[4] - 0.002)
    camera = _stage_camera(collection)
    _stage_light(
        "Procedural_Stage_Key",
        collection,
        center + space.forward * 2.3 + space.lateral * 1.6 + space.up * 2.2,
        center + space.up * 0.10,
        760.0,
        (1.0, 0.69, 0.50),
    )
    _stage_light(
        "Procedural_Stage_Fill",
        collection,
        center + space.forward * 1.6 - space.lateral * 2.2 + space.up * 1.0,
        center,
        310.0,
        (0.44, 0.62, 1.0),
    )
    _stage_light(
        "Procedural_Stage_Rim",
        collection,
        center - space.forward * 2.4 + space.lateral * 0.6 + space.up * 2.5,
        center + space.up * 0.25,
        720.0,
        (1.0, 0.34, 0.16),
    )

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_percentage = 100
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.render.film_transparent = False
    if scene.world is None:
        world = bpy.data.worlds.get("ProceduralWarrior_StageWorld")
        if world is None:
            world = bpy.data.worlds.new("ProceduralWarrior_StageWorld")
        scene.world = world
    scene.world.color = (0.17, 0.17, 0.17)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    source_collection.hide_render = True
    preserved = {
        object_: object_.hide_render
        for object_ in bpy.data.objects
        if object_ not in collection.objects[:] and object_ not in source_collection.objects[:]
    }
    for object_ in preserved:
        object_.hide_render = True
    try:
        if render:
            panorama_paths = tuple(artifacts / f".anatomy-view-{index}.png" for index in range(3))
            distance = max(parts.height * 2.45, 3.6)
            target = center + space.up * 0.06
            _render_to(scene, camera, panorama_paths[0], target + space.forward * distance, target)
            diagonal = _normalized(space.forward * 0.72 + space.lateral * 0.70)
            _render_to(scene, camera, panorama_paths[1], target + diagonal * distance, target)
            _render_to(scene, camera, panorama_paths[2], target + space.lateral * distance, target)
            stage_png = artifacts / "anatomy-stage.png"
            _contact_sheet(panorama_paths, stage_png, 560, 700)

            scene.render.resolution_x = 480
            scene.render.resolution_y = 560
            close_paths = tuple(artifacts / f".anatomy-close-{index}.png" for index in range(3))
            head = space.point(stage_landmarks.head)
            _render_to(
                scene,
                camera,
                close_paths[0],
                head + space.up * 0.050 + space.forward * 0.78,
                head + space.up * 0.050 + space.forward * 0.038,
            )
            hand_targets = tuple(
                _mean(
                    space.point(stage_landmarks.finger_chain(side, finger)[2])
                    for finger in _FINGER_NAMES
                )
                for side in ("Left", "Right")
            )
            for index, hand_target in enumerate(hand_targets, start=1):
                _render_to(
                    scene,
                    camera,
                    close_paths[index],
                    hand_target + space.forward * 0.58 + space.up * 0.055,
                    hand_target + space.forward * 0.002,
                )
            face_hands_png = artifacts / "anatomy-face-hands.png"
            _contact_sheet(close_paths, face_hands_png, 480, 560)
    finally:
        for object_, visibility in preserved.items():
            object_.hide_render = visibility

    _purge_anatomy_orphans()
    metrics = _part_metrics(parts)
    scene["procedural_warrior_anatomy_metrics"] = {
        "vertices": int(metrics["vertices"]),
        "triangles": int(metrics["triangles"]),
        "body_vertices": int(metrics["body_vertices"]),
        "body_triangles": int(metrics["body_triangles"]),
        "height": float(metrics["height"]),
    }
    scene["procedural_warrior_anatomy_close_panels"] = 3
    bpy.ops.wm.save_as_mainfile(filepath=str(artifacts / "anatomy-stage.blend"))
    return {
        "collection": collection.name,
        "source_collection": source_collection.name,
        "task2_collection": task2_collection.name,
        "task2_probe": task2_probe.name,
        "objects": list(metrics["objects"]),
        "vertices": metrics["vertices"],
        "triangles": metrics["triangles"],
        "height": metrics["height"],
        "body_bounds": body_bounds,
        "stage_png": str(artifacts / "anatomy-stage.png"),
        "face_hands_png": str(artifacts / "anatomy-face-hands.png"),
        "blend": str(artifacts / "anatomy-stage.blend"),
        "floor": floor.name,
        "close_panel_count": 3,
    }


def _bounds(object_: bpy.types.Object) -> tuple[float, float, float, float, float, float]:
    coordinates = [object_.matrix_world @ vertex.co for vertex in object_.data.vertices]
    return (
        min(point.x for point in coordinates),
        max(point.x for point in coordinates),
        min(point.y for point in coordinates),
        max(point.y for point in coordinates),
        min(point.z for point in coordinates),
        max(point.z for point in coordinates),
    )


if __name__ == "__main__":  # pragma: no cover - Blender CLI/MCP stage entry point.
    summary = build_stage()
    print("PROCEDURAL_WARRIOR_ANATOMY_STAGE", summary)
