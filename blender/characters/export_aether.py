"""Fuses the body parts built by build_aether.py into one continuous skin, adds what is worn on
it, binds the result to an armature and exports a GLB.

Run inside Blender after build_aether.py. Skin weights are computed here from
where each vertex sits along its limb, so joints bend smoothly without any
weight painting.
"""
import bpy, bmesh, json, math
from mathutils import Vector, Matrix

OUT = "/Users/rabbi/Desktop/Projects/SKYBOUND/public/assets/characters/aether.glb"
scene = bpy.data.scenes["SKYBOUND_Aether"]
layer = scene.view_layers[0]
win = bpy.context.window
previous = win.scene
win.scene = scene  # modifiers only evaluate, and edit mode only works, in the scene the window shows
layer.update()
deps = layer.depsgraph
deps.update()
P = {k: Vector(v) for k, v in json.loads(scene["pivots"]).items()}

# ---------------- skeleton ----------------
# name: (head, tail, parent)
BONES = {
    "torso": (Vector((0, 0, 0.96)), Vector((0, 0, 1.08)), None),
    "spine": (Vector((0, 0, 1.08)), Vector((0, 0, 1.29)), "torso"),
    "chest": (Vector((0, 0, 1.29)), Vector((0, 0, 1.56)), "spine"),
    "neck": (Vector((0, 0.016, 1.585)), Vector((0, 0.020, 1.685)), "chest"),
    "head": (Vector((0, 0.020, 1.685)), Vector((0, 0.020, 1.91)), "neck"),
}
for tag in ("L", "R"):
    shoulder, elbow, wrist = P["upper_arm." + tag], P["forearm." + tag], P["hand." + tag]
    down = (wrist - elbow).normalized()
    BONES["upper_arm." + tag] = (shoulder, elbow, "chest")
    BONES["forearm." + tag] = (elbow, wrist, "upper_arm." + tag)
    BONES["hand." + tag] = (wrist, wrist + down * 0.12, "forearm." + tag)
    hip, knee, ankle = P["thigh." + tag], P["shin." + tag], P["foot." + tag]
    BONES["thigh." + tag] = (hip, knee, "torso")
    BONES["shin." + tag] = (knee, ankle, "thigh." + tag)
    BONES["foot." + tag] = (ankle, Vector((ankle.x, -0.15, 0.03)), "shin." + tag)

def step(a, b, x):
    """Smooth 0..1 as x goes from a to b (a may be greater than b)."""
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def weights(skin, v):
    """Bone weights for a vertex at world position v, for a part skinned as `skin`."""
    if skin == "torso":
        up_spine = step(1.00, 1.14, v.z)
        up_chest = step(1.21, 1.36, v.z)
        up_neck = step(1.565, 1.625, v.z)
        up_head = step(1.660, 1.705, v.z)
        return {"torso": 1 - up_spine, "spine": up_spine * (1 - up_chest), "chest": up_chest * (1 - up_neck),
                "neck": up_chest * up_neck * (1 - up_head), "head": up_chest * up_neck * up_head}
    if skin.startswith("arm."):
        tag = skin[-1]
        shoulder, elbow, wrist = P["upper_arm." + tag], P["forearm." + tag], P["hand." + tag]
        d = (v - shoulder).dot((wrist - shoulder).normalized())
        upper_len = (elbow - shoulder).length
        total = upper_len + (wrist - elbow).length
        on_arm = step(-0.055, 0.045, d)
        on_fore = step(upper_len - 0.055, upper_len + 0.055, d)
        on_hand = step(total - 0.03, total + 0.03, d)
        return {"chest": 1 - on_arm, "upper_arm." + tag: on_arm * (1 - on_fore),
                "forearm." + tag: on_arm * on_fore * (1 - on_hand), "hand." + tag: on_arm * on_fore * on_hand}
    if skin.startswith("leg."):
        tag = skin[-1]
        hip, knee, ankle = P["thigh." + tag], P["shin." + tag], P["foot." + tag]
        on_thigh = step(hip.z + 0.05, hip.z - 0.06, v.z)
        on_shin = step(knee.z + 0.06, knee.z - 0.06, v.z)
        on_foot = step(ankle.z + 0.035, ankle.z - 0.025, v.z)
        return {"torso": 1 - on_thigh, "thigh." + tag: on_thigh * (1 - on_shin),
                "shin." + tag: on_thigh * on_shin * (1 - on_foot), "foot." + tag: on_thigh * on_shin * on_foot}
    return {skin: 1.0}

BOOT_TOP = P["shin.L"].lerp(P["foot.L"], 0.12).z
GLOVE_FROM = 0.418
SKIN_ABOVE = 1.626

def arm_of(v):
    """Which arm a point of the fused body belongs to, with its distance down the arm; or None."""
    for tag in ("L", "R"):
        shoulder, wrist = P["upper_arm." + tag], P["hand." + tag]
        axis = (wrist - shoulder).normalized()
        d = (v - shoulder).dot(axis)
        if d > -0.075 and (v - shoulder - axis * d).length < 0.088: return tag, d
    return None

def body_weights(v):
    """Weights for the fused body: the same blends as the separate parts, chosen by where the point is."""
    arm = arm_of(v)
    if arm: return weights("arm." + arm[0], v)
    if v.z < P["thigh.L"].z + 0.05:
        left = step(-0.03, 0.03, v.x)  # the two legs share the pelvis smoothly
        out = {}
        for tag, share in (("L", left), ("R", 1 - left)):
            if share <= 0: continue
            for bone, weight in weights("leg." + tag, v).items():
                out[bone] = out.get(bone, 0) + weight * share
        return out
    return weights("torso", v)

def body_material(v):
    arm = arm_of(v)
    if arm: return "AE_Accent" if arm[1] > GLOVE_FROM else "AE_Suit"
    if v.z < BOOT_TOP: return "AE_Accent"
    return "AE_Skin" if v.z > SKIN_ABOVE else "AE_Suit"

# ---------------- clean up the previous export (only AE_ datablocks) ----------------
old = bpy.data.collections.get("AE_Export")
if old:
    for ob in list(old.objects): bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(old)
for block in (bpy.data.meshes, bpy.data.armatures):
    for item in list(block):
        if item.name.startswith("AE_X_") and item.users == 0: block.remove(item)
exp = bpy.data.collections.new("AE_Export"); scene.collection.children.link(exp)
hero = next(c for c in scene.collection.children if c.name.startswith("AE_Hero"))

# ---------------- one mesh, with a weight layer ----------------
materials = []
bm = bmesh.new()
deform = bm.verts.layers.deform.verify()
names = list(BONES)
def slot_of(material):
    if material not in materials: materials.append(material)
    return materials.index(material)

# The body: every fused part welded into one watertight surface, smoothed, then thinned.
BODY_TRIANGLES = 15000
fused = bmesh.new()
for ob in hero.objects:
    if ob.type != "MESH" or not ob.get("fuse"): continue
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
    me.transform(ob.matrix_world)
    fused.from_mesh(me)
    bpy.data.meshes.remove(me)
raw = bpy.data.meshes.new("AE_X_Raw"); fused.to_mesh(raw); fused.free()
shell = bpy.data.objects.new("AE_X_Shell", raw); exp.objects.link(shell)
remesh = shell.modifiers.new("Remesh", "REMESH"); remesh.mode = "VOXEL"; remesh.voxel_size = 0.0065
smooth = shell.modifiers.new("Smooth", "SMOOTH"); smooth.factor = 0.5; smooth.iterations = 5
layer.update(); deps.update()
dense_tris = sum(len(p.vertices) - 2 for p in shell.evaluated_get(deps).data.polygons)
thin = shell.modifiers.new("Decimate", "DECIMATE"); thin.ratio = min(1.0, BODY_TRIANGLES / dense_tris)
layer.update(); deps.update()
me = bpy.data.meshes.new_from_object(shell.evaluated_get(deps))
bpy.data.objects.remove(shell, do_unlink=True); bpy.data.meshes.remove(raw)
bm.from_mesh(me); bpy.data.meshes.remove(me)
# Cut clean edges where the gloves, boots and collar begin, so colour changes on a line.
def cut(point, normal, where):
    geom = [f for f in bm.faces if where(f.calc_center_median())]
    geom += list({e for f in geom for e in f.edges}) + list({v for f in geom for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=point, plane_no=normal, dist=0.0002)
cut(Vector((0, 0, SKIN_ABOVE)), Vector((0, 0, 1)), lambda c: abs(c.z - SKIN_ABOVE) < 0.03 and abs(c.x) < 0.1)
cut(Vector((0, 0, BOOT_TOP)), Vector((0, 0, 1)), lambda c: abs(c.z - BOOT_TOP) < 0.03)
for tag in ("L", "R"):
    axis = (P["hand." + tag] - P["upper_arm." + tag]).normalized()
    cut(P["upper_arm." + tag] + axis * GLOVE_FROM, axis,
        lambda c, tag=tag: (arm_of(c) or ("", 9))[0] == tag and abs(arm_of(c)[1] - GLOVE_FROM) < 0.03)
bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
for vert in bm.verts:
    for bone, weight in body_weights(vert.co).items():
        if weight > 0.002: vert[deform][names.index(bone)] = weight
for face in bm.faces:
    face.material_index = slot_of(bpy.data.materials[body_material(face.calc_center_median())]); face.smooth = True
print("body", dense_tris, "->", sum(len(f.verts) - 2 for f in bm.faces))
body_verts = set(bm.verts)

# Everything worn on the body or set into the face stays its own piece.
for ob in hero.objects:
    if ob.type != "MESH" or ob.get("fuse"): continue
    skin = ob["skin"]
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
    me.transform(ob.matrix_world)
    slot = slot_of(ob.data.materials[0])
    first_vert, first_face = len(bm.verts), len(bm.faces)
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    for vert in bm.verts[first_vert:]:
        for bone, weight in weights(skin, vert.co).items():
            if weight > 0.002: vert[deform][names.index(bone)] = weight
    for face in bm.faces[first_face:]:
        face.material_index = slot; face.smooth = True
    bpy.data.meshes.remove(me)
# Bake soft shading into the body's vertex colours: creases (between muscles, under the
# chest and jaw) go darker. It reads as form under any light, and costs nothing at run time.
bm.normal_update()
shade = {}
for vert in bm.verts:
    if not vert.link_edges or vert not in body_verts: continue
    hollow = sum(vert.normal.dot(edge.other_vert(vert).co - vert.co) for edge in vert.link_edges)
    reach = sum(edge.calc_length() for edge in vert.link_edges)
    shade[vert] = min(1.0, max(0.45, 1.0 - 2.2 * max(0.0, hollow / reach if reach else 0.0)))
for _ in range(2):  # soften
    shade = {vert: 0.5 * value + 0.5 * sum(shade.get(e.other_vert(vert), 1.0) for e in vert.link_edges) / len(vert.link_edges)
             for vert, value in shade.items()}
colour = bm.loops.layers.color.new("Shade")
for face in bm.faces:
    for loop in face.loops:
        value = shade.get(loop.vert, 1.0)
        loop[colour] = (value, value, value, 1.0)
bmesh.ops.triangulate(bm, faces=bm.faces)
mesh = bpy.data.meshes.new("AE_X_Body")
bm.to_mesh(mesh)
triangles = len(bm.faces)
bm.free()
for material in materials: mesh.materials.append(material)
mesh.color_attributes.active_color_name = "Shade"
mesh.color_attributes.render_color_index = mesh.color_attributes.find("Shade")
body = bpy.data.objects.new("Aether", mesh); exp.objects.link(body)
for name in names: body.vertex_groups.new(name=name)

# ---------------- armature (needs edit mode, hence the context override) ----------------
arm_data = bpy.data.armatures.new("AE_X_Rig")
rig = bpy.data.objects.new("AetherRig", arm_data); exp.objects.link(rig)
layer.objects.active = rig
with bpy.context.temp_override(window=win, scene=scene, view_layer=layer, active_object=rig, object=rig, selected_objects=[rig]):
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        bone = arm_data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.roll = 0
    for name, (head, tail, parent) in BONES.items():
        if parent: arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
body.parent = rig
modifier = body.modifiers.new("Armature", "ARMATURE"); modifier.object = rig
print("bones", len(arm_data.bones), "triangles", triangles, "materials", len(materials))

try:
    with bpy.context.temp_override(window=win, scene=scene, view_layer=layer):
        bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", collection="AE_Export", export_apply=False,
                                  export_yup=True, export_animations=False, export_skins=True,
                                  export_cameras=False, export_lights=False, export_vertex_color="ACTIVE",
                                  export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True)
finally:
    win.scene = previous
bpy.data.libraries.write("/Users/rabbi/Desktop/Projects/SKYBOUND/blender/characters/aether.blend", {scene}, fake_user=True)
print("exported")
