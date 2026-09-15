import bpy


ACTION_NAME = "lobby_happy_idle"


def detach_action(action):
    detached_references = 0
    for obj in bpy.data.objects:
        animation_data = obj.animation_data
        if animation_data is None:
            continue
        if animation_data.action == action:
            animation_data.action = None
            detached_references += 1
        for track in list(animation_data.nla_tracks):
            for strip in list(track.strips):
                if strip.action == action:
                    track.strips.remove(strip)
                    detached_references += 1
            if not track.strips:
                animation_data.nla_tracks.remove(track)
    return detached_references


action = bpy.data.actions.get(ACTION_NAME)
existed = action is not None
detached_references = detach_action(action) if action is not None else 0
if action is not None:
    bpy.data.actions.remove(action)

if bpy.data.actions.get(ACTION_NAME) is not None:
    raise RuntimeError(f"Could not remove {ACTION_NAME}")

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(
    "LOBBY_HAPPY_IDLE_REMOVED="
    f"existed={existed}|detached={detached_references}|"
    f"actions={len(bpy.data.actions)}|file={bpy.data.filepath}"
)
