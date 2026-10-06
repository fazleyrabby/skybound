import bpy, bmesh, math
from mathutils import Vector

SCENE = "SKYBOUND_Aether"
PREFIX = "AE_"

# --- fresh scene; only ever remove datablocks this script created (AE_ prefix) ---
old = bpy.data.scenes.get(SCENE)
if old:
    for ob in list(old.collection.all_objects):
        if ob.name.startswith(PREFIX):
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.scenes.remove(old)
for c in list(bpy.data.collections):
    if c.name.startswith(PREFIX):
        for ob in list(c.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(c)
for me in list(bpy.data.meshes):
    if me.name.startswith(PREFIX) and me.users == 0:
        bpy.data.meshes.remove(me)
scene = bpy.data.scenes.new(SCENE)
col = bpy.data.collections.new(PREFIX + "Hero")
scene.collection.children.link(col)

def material(name, color, rough, metal, emit=0.0):
    m = bpy.data.materials.get(PREFIX + name) or bpy.data.materials.new(PREFIX + name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return m

SUIT = material("Suit", (0.022, 0.032, 0.07), 0.55, 0.25)
ARMOR = material("Armor", (0.82, 0.86, 0.92), 0.32, 0.15)
GLOW = material("Glow", (0.0, 0.42, 1.0), 0.3, 0.0, emit=1.6)
DARK = material("Dark", (0.008, 0.01, 0.018), 0.25, 0.4)

parts = []  # (object, bone name)
pivots = {'torso': (0, 0, 1.0), 'head': (0, 0.006, 1.62)}

def finish(name, bm, mat, bone, loc, axis=None, scale=(1, 1, 1), subsurf=1, bevel=0.0):
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(PREFIX + name, me)
    col.objects.link(ob)
    ob.location = loc
    ob.scale = scale
    if axis is not None:  # point local +Z along `axis`
        ob.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_euler()
    if bevel:
        m = ob.modifiers.new("Bevel", "BEVEL"); m.width = bevel; m.segments = 2
    if subsurf:
        m = ob.modifiers.new("Subsurf", "SUBSURF"); m.levels = subsurf; m.render_levels = subsurf
    parts.append((ob, bone))
    return ob

def cone(name, r_bottom, r_top, depth, mat, bone, loc, segments=10, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r_bottom, radius2=r_top, depth=depth)
    return finish(name, bm, mat, bone, loc, **kw)

def sphere(name, r, mat, bone, loc, **kw):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=10, radius=r)
    kw.setdefault("subsurf", 1)
    return finish(name, bm, mat, bone, loc, **kw)

def box(name, sx, sy, sz, mat, bone, loc, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    kw.setdefault("bevel", min(sx, sy, sz) * 0.22)
    kw.setdefault("subsurf", 1)
    return finish(name, bm, mat, bone, loc, **kw)

def limb(name, a, b, r_a, r_b, mat, bone, **kw):
    """Tapered segment from point a (radius r_a) to point b (radius r_b)."""
    a, b = Vector(a), Vector(b)
    return cone(name, r_a, r_b, (b - a).length, mat, bone, (a + b) / 2, axis=b - a, **kw)


def loft(name, rings, mat, bone, segments=12, subsurf=1):
    """Skin a tube through rings of (centre, rx, ry). Cross-sections are perpendicular to the path."""
    bm = bmesh.new()
    loops = []
    pts = [Vector(r[0]) for r in rings]
    for i, (c, rx, ry) in enumerate(rings):
        c = Vector(c)
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = t.cross(Vector((0, 1, 0)))
        u = u.normalized() if u.length > 1e-4 else Vector((1, 0, 0))
        v = u.cross(t).normalized()
        loops.append([bm.verts.new(c + u * (math.cos(a) * rx) + v * (math.sin(a) * ry))
                      for a in (2 * math.pi * k / segments for k in range(segments))])
    for a, b in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, bone, (0, 0, 0), subsurf=subsurf)

def grow(rings, amount):
    return [(c, rx + amount, ry + amount) for c, rx, ry in rings]

# The hero faces -Y (Blender front view). +X is the hero's left.
F = -1

# ---------------- torso: one lofted body, armour shells over it ----------------
torso = [
    ((0, 0.005, 0.90), 0.070, 0.075),
    ((0, 0.005, 0.96), 0.150, 0.105),
    ((0, 0.005, 1.03), 0.168, 0.112),
    ((0, 0.000, 1.14), 0.128, 0.092),
    ((0, 0.000, 1.25), 0.150, 0.102),
    ((0, -0.005, 1.37), 0.198, 0.125),
    ((0, -0.005, 1.47), 0.215, 0.122),
    ((0, 0.000, 1.535), 0.150, 0.095),
    ((0, 0.005, 1.575), 0.060, 0.058),
]
loft("Body", torso, SUIT, "chest", segments=16)
loft("ChestArmor", [((0, -0.004, 1.305), 0.176, 0.112), ((0, -0.006, 1.37), 0.214, 0.142), ((0, -0.006, 1.47), 0.232, 0.138), ((0, 0.0, 1.538), 0.166, 0.110)], ARMOR, "chest", segments=16)
loft("Trunks", grow(torso[1:3], 0.012), ARMOR, "hips", segments=16)
loft("Belt", [((0, 0.003, 1.065), 0.158, 0.108), ((0, 0.002, 1.10), 0.146, 0.102)], DARK, "hips", segments=16, subsurf=1)
box("Buckle", 0.075, 0.03, 0.045, GLOW, "hips", (0, F * 0.108, 1.082), subsurf=0)
# abdominal plates
for i, z in enumerate((1.165, 1.225)):
    box("Ab%d" % i, 0.15 + i * 0.02, 0.03, 0.045, ARMOR, "spine", (0, F * (0.088 + i * 0.008), z), bevel=0.012)
# energy core: hex emitter in a dark socket
cone("CoreSocket", 0.075, 0.075, 0.03, DARK, "chest", (0, F * 0.143, 1.415), axis=(0, 1, 0), segments=6, subsurf=0, bevel=0.006)
cone("Core", 0.055, 0.055, 0.04, GLOW, "chest", (0, F * 0.148, 1.415), axis=(0, 1, 0), segments=6, subsurf=0, bevel=0.008)
for side in (1, -1):
    box("ChestLine%d" % side, 0.085, 0.012, 0.012, GLOW, "chest", (side * 0.125, F * 0.136, 1.447), subsurf=0, bevel=0.003, axis=(side * 0.25, 0, 1))
cone("Collar", 0.092, 0.074, 0.05, ARMOR, "chest", (0, 0.008, 1.56), segments=14, subsurf=1)

# flight pack
box("Pack", 0.20, 0.07, 0.24, ARMOR, "chest", (0, 0.135, 1.40), bevel=0.03)
for side, tag in ((1, "L"), (-1, "R")):
    loft("Pod." + tag, [((side * 0.09, 0.175, 1.27), 0.034, 0.034), ((side * 0.09, 0.175, 1.34), 0.046, 0.046),
                        ((side * 0.09, 0.172, 1.50), 0.040, 0.040), ((side * 0.09, 0.165, 1.56), 0.016, 0.016)], ARMOR, "chest", segments=10)
    cone("Nozzle." + tag, 0.028, 0.032, 0.03, GLOW, "chest", (side * 0.09, 0.175, 1.262), subsurf=0, segments=10)

# ---------------- head ----------------
loft("Neck", [((0, 0.008, 1.55), 0.056, 0.056), ((0, 0.006, 1.66), 0.052, 0.054)], SUIT, "neck", segments=10, subsurf=1)
sphere("Helmet", 0.132, ARMOR, "head", (0, 0.004, 1.758), scale=(0.93, 1.06, 1.10), subsurf=1)
sphere("Face", 0.118, DARK, "head", (0, F * 0.046, 1.752), scale=(0.80, 0.84, 0.50), subsurf=1)
sphere("Visor", 0.118, GLOW, "head", (0, F * 0.058, 1.756), scale=(0.76, 0.78, 0.24), subsurf=1)
box("Chin", 0.10, 0.07, 0.07, ARMOR, "head", (0, F * 0.082, 1.672), bevel=0.02)
box("Crest", 0.024, 0.24, 0.07, ARMOR, "head", (0, 0.03, 1.895), bevel=0.009, axis=(0, -0.32, 1))
for side, tag in ((1, "L"), (-1, "R")):
    cone("Ear." + tag, 0.040, 0.032, 0.03, ARMOR, "head", (side * 0.121, 0.016, 1.755), axis=(side, 0, 0), segments=10, subsurf=0, bevel=0.005)
    cone("EarGlow." + tag, 0.018, 0.018, 0.012, GLOW, "head", (side * 0.139, 0.016, 1.755), axis=(side, 0, 0), segments=10, subsurf=0)
    box("Fin." + tag, 0.014, 0.15, 0.045, ARMOR, "head", (side * 0.118, 0.085, 1.80), bevel=0.005, axis=(0, -0.5, 1))

# ---------------- arms (A-pose) ----------------
ARM_ANGLE = math.radians(13)
for side, tag in ((1, "L"), (-1, "R")):
    down = Vector((side * math.sin(ARM_ANGLE), 0, -math.cos(ARM_ANGLE)))
    out = Vector((side * math.cos(ARM_ANGLE), 0, math.sin(ARM_ANGLE)))
    shoulder = Vector((side * 0.255, 0, 1.475))
    elbow = shoulder + down * 0.31
    wrist = elbow + down * 0.27
    pivots['upper_arm.' + tag] = tuple(shoulder); pivots['forearm.' + tag] = tuple(elbow); pivots['hand.' + tag] = tuple(wrist)
    at = lambda base, d: base + down * d
    loft("UpperArm." + tag, [(at(shoulder, -0.03), 0.045, 0.050), (at(shoulder, 0.03), 0.064, 0.066), (at(shoulder, 0.13), 0.060, 0.064),
                             (at(shoulder, 0.25), 0.047, 0.050), (at(shoulder, 0.32), 0.040, 0.042)], SUIT, "upper_arm." + tag)
    sphere("Pauldron." + tag, 0.088, ARMOR, "upper_arm." + tag, shoulder + out * 0.02 + Vector((0, 0, 0.022)), scale=(1.15, 1.08, 0.86), subsurf=1)
    box("PauldronGlow." + tag, 0.012, 0.07, 0.014, GLOW, "upper_arm." + tag, shoulder + out * 0.118 + Vector((0, 0, 0.01)), subsurf=0, bevel=0.003)
    sphere("Elbow." + tag, 0.047, ARMOR, "forearm." + tag, elbow)
    loft("Forearm." + tag, [(at(elbow, -0.02), 0.038, 0.040), (at(elbow, 0.07), 0.052, 0.054), (at(elbow, 0.20), 0.043, 0.045), (at(elbow, 0.275), 0.034, 0.036)], SUIT, "forearm." + tag)
    loft("Gauntlet." + tag, [(at(elbow, 0.065), 0.050, 0.052), (at(elbow, 0.09), 0.066, 0.068), (at(elbow, 0.20), 0.056, 0.058), (at(elbow, 0.26), 0.046, 0.048)], ARMOR, "forearm." + tag, subsurf=1)
    box("ArmStrip." + tag, 0.012, 0.024, 0.12, GLOW, "forearm." + tag, at(elbow, 0.15) + out * 0.064, axis=-down, subsurf=0, bevel=0.003)
    sphere("Fist." + tag, 0.054, SUIT, "hand." + tag, at(wrist, 0.06), scale=(0.84, 1.10, 1.12))
    box("Knuckles." + tag, 0.04, 0.09, 0.05, ARMOR, "hand." + tag, at(wrist, 0.07) + out * 0.03, axis=-down, bevel=0.012)

# ---------------- legs ----------------
for side, tag in ((1, "L"), (-1, "R")):
    hip = Vector((side * 0.092, 0.005, 0.99))
    knee = Vector((side * 0.100, F * 0.012, 0.545))
    ankle = Vector((side * 0.104, 0.018, 0.12))
    pivots['thigh.' + tag] = tuple(hip); pivots['shin.' + tag] = tuple(knee); pivots['foot.' + tag] = tuple(ankle)
    mix = lambda a, b, t: a.lerp(b, t)
    loft("Thigh." + tag, [(mix(hip, knee, -0.06), 0.070, 0.075), (mix(hip, knee, 0.10), 0.094, 0.098), (mix(hip, knee, 0.45), 0.086, 0.092),
                          (mix(hip, knee, 0.85), 0.062, 0.066), (mix(hip, knee, 1.04), 0.052, 0.056)], SUIT, "thigh." + tag)
    box("ThighStrip." + tag, 0.012, 0.032, 0.20, GLOW, "thigh." + tag, mix(hip, knee, 0.45) + Vector((side * 0.088, 0, 0)), axis=hip - knee, subsurf=0, bevel=0.003)
    box("ThighPlate." + tag, 0.10, 0.03, 0.20, ARMOR, "thigh." + tag, mix(hip, knee, 0.42) + Vector((side * 0.008, F * 0.086, 0)), axis=hip - knee, bevel=0.014)
    sphere("Knee." + tag, 0.064, ARMOR, "shin." + tag, knee + Vector((0, F * 0.026, 0.005)), scale=(1, 0.9, 1.15))
    loft("Shin." + tag, [(mix(knee, ankle, -0.04), 0.052, 0.056), (mix(knee, ankle, 0.25), 0.066, 0.072), (mix(knee, ankle, 0.75), 0.048, 0.052), (mix(knee, ankle, 1.06), 0.042, 0.046)], SUIT, "shin." + tag)
    loft("Greave." + tag, [(mix(knee, ankle, 0.16), 0.060, 0.064), (mix(knee, ankle, 0.30), 0.080, 0.086), (mix(knee, ankle, 0.80), 0.062, 0.066), (mix(knee, ankle, 1.0), 0.058, 0.062)], ARMOR, "shin." + tag, subsurf=1)
    box("Boot." + tag, 0.112, 0.27, 0.12, ARMOR, "foot." + tag, (side * 0.104, F * 0.04, 0.062), bevel=0.032, subsurf=1)
    box("Toe." + tag, 0.10, 0.07, 0.05, DARK, "foot." + tag, (side * 0.104, F * 0.15, 0.04), bevel=0.014)
    box("Sole." + tag, 0.10, 0.25, 0.022, DARK, "foot." + tag, (side * 0.104, F * 0.04, 0.011), bevel=0.006, subsurf=0)
    cone("Thruster." + tag, 0.030, 0.034, 0.018, GLOW, "foot." + tag, (side * 0.104, 0.055, 0.002), segments=10, subsurf=0)

import json
for ob, bone in parts:
    ob["bone"] = {'hips': 'torso', 'spine': 'torso', 'chest': 'torso', 'neck': 'torso'}.get(bone, bone)
scene["pivots"] = json.dumps(pivots)

# ---------------- stage: camera, lights, backdrop colour ----------------
def look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()

cam_data = bpy.data.cameras.new(PREFIX + "Cam"); cam_data.lens = 70
cam = bpy.data.objects.new(PREFIX + "Cam", cam_data); scene.collection.objects.link(cam)
scene.camera = cam
for name, loc, energy in (("Key", (-2.5, -3.5, 3.5), 900), ("Fill", (3, -2.5, 1.5), 300), ("Rim", (0.5, 3.5, 3), 700)):
    ld = bpy.data.lights.new(PREFIX + name, "AREA"); ld.energy = energy; ld.size = 3
    lo = bpy.data.objects.new(PREFIX + name, ld); scene.collection.objects.link(lo)
    lo.location = loc; look_at(lo, (0, 0, 1.0))
world = bpy.data.worlds.get(PREFIX + "World") or bpy.data.worlds.new(PREFIX + "World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.22, 0.27, 0.36, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.world = world
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 700; scene.render.resolution_y = 900
scene.render.image_settings.file_format = "PNG"

tris = 0
deps = bpy.context.evaluated_depsgraph_get()
print("parts", len(parts))
