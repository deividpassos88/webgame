"""Procedural warrior geometry primitives.

The package intentionally keeps the first geometry layer small and deterministic:
configuration lives in :mod:`config`, while ring lofting and mesh hygiene live in
:mod:`mesh`.
"""

from .config import BuildLimits, WarriorDimensions
from .anatomy import AnatomyParts, BoneLandmarks, build_anatomy, extract_landmarks
from .mesh import assert_mesh_valid, clean_mesh, loft_mesh, ring_points

__all__ = [
    "BuildLimits",
    "WarriorDimensions",
    "AnatomyParts",
    "BoneLandmarks",
    "build_anatomy",
    "extract_landmarks",
    "assert_mesh_valid",
    "clean_mesh",
    "loft_mesh",
    "ring_points",
]
