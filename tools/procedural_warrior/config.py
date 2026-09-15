"""Typed dimensions and build limits shared by procedural warrior builders."""

from dataclasses import dataclass


@dataclass(frozen=True)
class WarriorDimensions:
    """Canonical proportions for the procedural warrior in metres."""

    height: float = 1.85
    shoulder_width: float = 0.49
    chest_depth: float = 0.25
    waist_width: float = 0.34
    head_height: float = 0.235
    hand_length: float = 0.19


@dataclass(frozen=True)
class BuildLimits:
    """Quality and topology limits used by procedural construction."""

    max_influences: int = 4
    minimum_weight: float = 0.001
    merge_distance: float = 0.00005
    body_radial_segments: int = 24
