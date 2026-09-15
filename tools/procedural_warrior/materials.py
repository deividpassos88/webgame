"""Deterministic procedural materials used by the procedural warrior.

The material library intentionally keeps its public surface small: callers use
the semantic role (``Skin``, ``Steel`` and so on), while this module owns the
node graph and the stable Blender datablock names.  Rebuilding a library is
safe: existing datablocks are cleared and rebuilt instead of accumulating
duplicate nodes on every run.
"""

from __future__ import annotations

import bpy


_MATERIAL_PREFIX = "PW_Warrior_Material_"


# RGB values are deliberately restrained, so the same assets remain readable
# under both the preview and game lighting setups.  Blender expects linear-ish
# values here; these are palette values rather than texture-map samples.
_PALETTE = {
    "Skin": ((0.38, 0.15, 0.095, 1.0), (0.22, 0.065, 0.035, 1.0), (0.54, 0.255, 0.16, 1.0)),
    "Eye": ((0.92, 0.96, 1.0, 1.0), (0.62, 0.70, 0.80, 1.0), (0.12, 0.18, 0.24, 1.0)),
    "Hair": ((0.025, 0.009, 0.004, 1.0), (0.075, 0.025, 0.008, 1.0), (0.15, 0.055, 0.014, 1.0)),
    "Cloth": ((0.035, 0.042, 0.050, 1.0), (0.022, 0.027, 0.033, 1.0), (0.052, 0.061, 0.070, 1.0)),
    "Leather": ((0.105, 0.028, 0.010, 1.0), (0.070, 0.016, 0.006, 1.0), (0.150, 0.045, 0.014, 1.0)),
    "Steel": ((0.225, 0.255, 0.285, 1.0), (0.165, 0.188, 0.210, 1.0), (0.300, 0.330, 0.360, 1.0)),
    "DarkMetal": ((0.055, 0.067, 0.080, 1.0), (0.032, 0.040, 0.049, 1.0), (0.082, 0.098, 0.115, 1.0)),
}

_PBR = {
    "Skin": (0.0, 0.48),
    "Eye": (0.0, 0.30),
    "Hair": (0.0, 0.56),
    "Cloth": (0.0, 0.76),
    "Leather": (0.0, 0.58),
    "Steel": (0.92, 0.24),
    "DarkMetal": (0.82, 0.34),
}

_BUMP_STRENGTH = {
    "Leather": 0.08,
    "Steel": 0.035,
}


def _new_or_reset_material(role: str) -> bpy.types.Material:
    """Return the stable datablock for *role* with a clean node tree."""

    name = f"{_MATERIAL_PREFIX}{role}"
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    material.node_tree.links.clear()
    material["procedural_warrior_material"] = role
    material["procedural_warrior_version"] = 1
    material["procedural_warrior_node_seed"] = f"warrior-{role.lower()}-v1"
    return material


def _build_material(role: str) -> bpy.types.Material:
    material = _new_or_reset_material(role)
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "PW_Material_Output"
    output.label = "Warrior Material Output"
    output.location = (620, 30)

    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.name = "Principled BSDF"
    principled.label = f"{role} — Principled PBR"
    principled.location = (320, 30)
    metallic, roughness = _PBR[role]
    # Keep the defaults exact; procedural links drive the effective variation
    # without losing the authored PBR contract inspected by the tests/tools.
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness

    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.name = "PW_Material_Coordinates"
    texcoord.location = (-920, 30)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "PW_Material_Noise"
    noise.label = "Fine procedural breakup"
    noise.location = (-700, 80)
    noise.inputs["Scale"].default_value = {
        "Skin": 5.0,
        "Eye": 7.0,
        "Hair": 18.0,
        "Cloth": 48.0,
        "Leather": 38.0,
        "Steel": 52.0,
        "DarkMetal": 44.0,
    }[role]
    noise.inputs["Detail"].default_value = 2.0
    noise.inputs["Roughness"].default_value = 0.48

    color_ramp = nodes.new("ShaderNodeValToRGB")
    color_ramp.name = "PW_Material_ColorRamp"
    color_ramp.label = "Procedural color variation"
    color_ramp.location = (-430, 130)
    color_ramp.color_ramp.elements.remove(color_ramp.color_ramp.elements[1])
    first = color_ramp.color_ramp.elements[0]
    first.position = 0.32
    first.color = _PALETTE[role][1]
    middle = color_ramp.color_ramp.elements.new(0.52)
    middle.color = _PALETTE[role][0]
    last = color_ramp.color_ramp.elements.new(0.72)
    last.color = _PALETTE[role][2]

    rough_ramp = nodes.new("ShaderNodeValToRGB")
    rough_ramp.name = "PW_Material_RoughnessRamp"
    rough_ramp.label = "Subtle roughness breakup"
    rough_ramp.location = (-180, -170)
    rough_ramp.color_ramp.elements[0].position = 0.25
    rough_ramp.color_ramp.elements[0].color = (max(0.0, roughness - 0.035),) * 3 + (1.0,)
    rough_ramp.color_ramp.elements[1].position = 0.78
    rough_ramp.color_ramp.elements[1].color = (min(1.0, roughness + 0.035),) * 3 + (1.0,)

    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], color_ramp.inputs["Fac"])
    links.new(noise.outputs["Fac"], rough_ramp.inputs["Fac"])
    links.new(color_ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(rough_ramp.outputs["Color"], principled.inputs["Roughness"])

    bump_strength = _BUMP_STRENGTH.get(role)
    if bump_strength is not None:
        bump = nodes.new("ShaderNodeBump")
        bump.name = "PW_Material_Bump"
        bump.label = f"Microdetail ({bump_strength:.3f})"
        bump.location = (80, -210)
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.0025 if role == "Leather" else 0.0012
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    # Viewport fallback is useful when a user switches away from rendered mode.
    material.diffuse_color = _PALETTE[role][0]
    return material


def create_material_library() -> dict[str, bpy.types.Material]:
    """Create (or deterministically rebuild) all warrior PBR role materials."""

    return {role: _build_material(role) for role in _PBR}
