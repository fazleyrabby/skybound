import bpy, bmesh, json, math
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

# Original design: a caped hero in the classic mould, adult heroic proportions
# (about eight heads tall), with its own emblem and colours.
SUIT = material("Suit", (0.016, 0.060, 0.240), 0.62, 0.05)
GOLD = material("Gold", (0.80, 0.52, 0.10), 0.32, 0.9)
ACCENT = material("Accent", (0.42, 0.030, 0.035), 0.55, 0.0)
SKIN = material("Skin", (0.56, 0.31, 0.21), 0.62, 0.0)
HAIR = material("Hair", (0.045, 0.028, 0.018), 0.48, 0.0)
EYE = material("Eye", (0.86, 0.86, 0.85), 0.3, 0.0)
IRIS = material("Iris", (0.05, 0.17, 0.30), 0.3, 0.0)
DARK = material("Dark", (0.012, 0.012, 0.016), 0.5, 0.1)
LIP = material("Lip", (0.40, 0.17, 0.14), 0.55, 0.0)
GLOW = material("Glow", (0.0, 0.45, 1.0), 0.3, 0.0, emit=1.8)

parts = []  # (object, bone name)
pivots = {}

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
    # Small parts do not need subdividing: it only costs triangles.
    kw.setdefault("subsurf", 1 if r >= 0.045 else 0)
    return finish(name, bm, mat, bone, loc, **kw)

def box(name, sx, sy, sz, mat, bone, loc, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    kw.setdefault("bevel", min(sx, sy, sz) * 0.22)
    kw.setdefault("subsurf", 1 if max(sx, sy, sz) >= 0.12 else 0)
    return finish(name, bm, mat, bone, loc, **kw)


def tube(name, rings, mat, bone, segments=12, subsurf=1, sculpt=(), keep=None, level=False):
    """Skin a tube through rings, cross-sections perpendicular to the path.

    A ring is (centre, half_width, front, back, squareness): `front` and `back`
    are the extents toward -Y and +Y, and squareness 2 is an ellipse, higher is
    boxier. `level` keeps every cross-section horizontal. `sculpt` is a list of (centre, radii, amount) bumps pushed out along
    the surface normal: that is where muscles come from. `keep` drops vertices.
    """
    bm = bmesh.new()
    loops = []
    pts = [Vector(r[0]) for r in rings]
    for i, ring in enumerate(rings):
        c, w, front = Vector(ring[0]), ring[1], ring[2]
        back = ring[3] if len(ring) > 3 else front
        n = ring[4] if len(ring) > 4 else 2.0
        t = Vector((0, 0, 1)) if level else (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = t.cross(Vector((0, 1, 0)))
        u = u.normalized() if u.length > 1e-4 else Vector((1, 0, 0))
        v = u.cross(t).normalized()
        loop = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            ca, sa = math.cos(a), math.sin(a)
            x = w * math.copysign(abs(ca) ** (2 / n), ca)
            y = (back if sa > 0 else front) * math.copysign(abs(sa) ** (2 / n), sa)
            loop.append(bm.verts.new(c + u * x + v * y))
        loops.append(loop)
    for a, b in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sculpt:
        bm.normal_update()
        for c, r, amount in sculpt:
            for vert in bm.verts:
                d2 = sum(((vert.co[i] - c[i]) / r[i]) ** 2 for i in range(3))
                if d2 < 9: vert.co += vert.normal * (amount * math.exp(-d2))
    if keep:
        bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not keep(vert.co)], context="VERTS")
    return finish(name, bm, mat, bone, (0, 0, 0), subsurf=subsurf)

def dense(rings, spacing):
    """Resample rings along their path with a Catmull-Rom spline, one every `spacing` metres.
    Sculpted bumps need more rings than it takes to describe the outline."""
    full = [(*r[0], r[1], r[2], r[3] if len(r) > 3 else r[2], r[4] if len(r) > 4 else 2.0) for r in rings]
    out = []
    for i in range(len(full) - 1):
        p0, p1, p2, p3 = full[max(i - 1, 0)], full[i], full[i + 1], full[min(i + 2, len(full) - 1)]
        steps = max(1, round((Vector(p2[:3]) - Vector(p1[:3])).length / spacing))
        for k in range(steps):
            t = k / steps
            v = [0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3)
                 for a, b, c, d in zip(p0, p1, p2, p3)]
            out.append((tuple(v[:3]), max(v[3], 0.004), max(v[4], 0.004), max(v[5], 0.004), max(v[6], 2.0)))
    last = full[-1]
    out.append((last[:3], last[3], last[4], last[5], last[6]))
    return out

def grow(rings, amount):
    return [(r[0], r[1] + amount, r[2] + amount, (r[3] if len(r) > 3 else r[2]) + amount, r[4] if len(r) > 4 else 2.0) for r in rings]

def both(c, r, amount):
    """A bump and its mirror image."""
    return [(c, r, amount), ((-c[0], c[1], c[2]), r, amount)]

def plate(name, outline, depth, mat, bone, y, bevel=0.003):
    """A flat badge facing forward: `outline` is (x, z) points, counter-clockwise seen from the front."""
    bm = bmesh.new()
    front = [bm.verts.new((x, 0, z)) for x, z in outline]
    back = [bm.verts.new((x, depth, z)) for x, z in outline]
    count = len(outline)
    bm.faces.new(front); bm.faces.new(list(reversed(back)))
    for i in range(count):
        bm.faces.new((front[i], back[i], back[(i + 1) % count], front[(i + 1) % count]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, bone, (0, y, 0), subsurf=0, bevel=bevel)

# The hero faces -Y (Blender front view). +X is the hero's left.
# The second argument to each part ("bone") says how it is skinned: a bone name
# for a rigid part, or a chain ("torso", "arm.L", "leg.R") for a part that bends.
F = -1

# ---------------- torso: pelvis to collar, one surface ----------------
def T(z, w, front, back, n=2.3, y=0.0):
    return ((0, y, z), w, front, back, n)

torso = [
    T(0.845, 0.060, 0.062, 0.072, 2.0, 0.008), T(0.890, 0.150, 0.096, 0.106, 2.6, 0.008), T(0.950, 0.184, 0.104, 0.118, 2.5, 0.008), T(1.000, 0.176, 0.101, 0.114, 2.4, 0.006),
    T(1.050, 0.158, 0.098, 0.100, 2.3, 0.002), T(1.100, 0.143, 0.096, 0.091), T(1.150, 0.139, 0.097, 0.087, 2.3, -0.004), T(1.200, 0.146, 0.102, 0.090, 2.3, -0.006),
    T(1.260, 0.162, 0.110, 0.098, 2.3, -0.008), T(1.320, 0.181, 0.120, 0.108, 2.3, -0.010), T(1.380, 0.196, 0.132, 0.114, 2.4, -0.010), T(1.440, 0.204, 0.134, 0.118, 2.5, -0.008),
    T(1.500, 0.204, 0.118, 0.116, 2.6, -0.002), T(1.548, 0.178, 0.092, 0.104, 2.6, 0.004), T(1.588, 0.108, 0.068, 0.086, 2.2, 0.010), T(1.622, 0.070, 0.060, 0.068, 2.0, 0.014),
]
muscles = (
    both((0.094, -0.135, 1.432), (0.082, 0.07, 0.056), 0.024)        # pectorals
    + [((0, -0.135, 1.42), (0.015, 0.06, 0.09), -0.012)]              # sternum
    + [((0, -0.13, 1.365), (0.16, 0.06, 0.016), -0.010)]              # under the chest
    + both((0.038, -0.11, 1.305), (0.030, 0.05, 0.024), 0.010)        # abdominals, three rows
    + both((0.038, -0.11, 1.240), (0.030, 0.05, 0.024), 0.010)
    + both((0.038, -0.11, 1.175), (0.030, 0.05, 0.024), 0.009)
    + [((0, -0.11, 1.23), (0.009, 0.05, 0.13), -0.007)]               # linea alba
    + both((0.130, -0.06, 1.20), (0.03, 0.06, 0.07), 0.007)           # obliques
    + [((0, 0.11, 1.30), (0.018, 0.06, 0.22), -0.014)]                # spine
    + both((0.090, 0.11, 1.44), (0.06, 0.06, 0.07), 0.013)            # shoulder blades
    + both((0.165, 0.05, 1.33), (0.04, 0.07, 0.09), 0.012)            # lats
    + both((0.070, 0.08, 1.565), (0.06, 0.05, 0.035), 0.016)          # trapezius
    + both((0.080, 0.11, 0.955), (0.062, 0.06, 0.060), 0.018)         # glutes
)
tube("Body", dense(torso, 0.017), SUIT, "torso", segments=40, subsurf=0, sculpt=muscles, level=True)
tube("Collar", [((0, 0.014, 1.598), 0.076, 0.066, 0.074), ((0, 0.016, 1.622), 0.072, 0.064, 0.072), ((0, 0.018, 1.640), 0.067, 0.061, 0.069)], SUIT, "torso", segments=16, level=True)
tube("CollarTrim", [((0, 0.018, 1.634), 0.070, 0.063, 0.071), ((0, 0.018, 1.645), 0.069, 0.062, 0.070)], GOLD, "torso", segments=16, subsurf=0, level=True)

# Mantle: the cape's yoke, over the shoulders from the collarbone clasps and across the back.
tube("Mantle", dense(grow(torso[11:15], 0.017), 0.017), ACCENT, "torso", segments=40, subsurf=0, sculpt=muscles, keep=lambda co: co.y > -0.066 and co.z > 1.470, level=True)
for side in (1, -1):
    sphere("Clasp%d" % side, 0.024, GOLD, "chest", (side * 0.122, F * 0.094, 1.538), scale=(1.0, 0.45, 1.0), subsurf=0)

# Emblem: a lit diamond with two swept bars. Its own shape, nobody else's.
def diamond(w, h, z):
    return [(0, z - h), (w, z + 0.006), (0, z + h), (-w, z + 0.006)]
plate("EmblemFrame", diamond(0.050, 0.064, 1.408), 0.020, GOLD, "chest", F * 0.158)
plate("EmblemCore", diamond(0.034, 0.046, 1.408), 0.020, GLOW, "chest", F * 0.162)
for side in (1, -1):
    bar = [(side * 0.046, 1.402), (side * 0.132, 1.452), (side * 0.138, 1.472), (side * 0.040, 1.428)]
    plate("EmblemBar%d" % side, bar if side > 0 else list(reversed(bar)), 0.030, GOLD, "chest", F * 0.1665)

# Belt with a diamond buckle.
tube("Belt", [T(1.056, 0.159, 0.103, 0.105, 2.3, 0.002), T(1.076, 0.155, 0.103, 0.101, 2.3, 0.001), T(1.096, 0.150, 0.103, 0.097)], GOLD, "torso", segments=28, level=True)
plate("Buckle", diamond(0.030, 0.036, 1.075), 0.016, GOLD, "torso", F * 0.118)
plate("BuckleCore", diamond(0.016, 0.020, 1.075), 0.016, ACCENT, "torso", F * 0.121, bevel=0.002)

# ---------------- head ----------------
tube("Neck", [((0, 0.016, 1.560), 0.070, 0.060, 0.068), ((0, 0.018, 1.620), 0.063, 0.057, 0.066), ((0, 0.022, 1.705), 0.060, 0.056, 0.066)], SKIN, "torso", segments=14, level=True)
def H(z, y, w, front, back, n=2.3):
    return ((0, y, z), w, front, back, n)
skull = [
    H(1.662, -0.040, 0.020, 0.018, 0.030, 2.0), H(1.672, -0.030, 0.036, 0.046, 0.050, 2.4), H(1.690, -0.020, 0.047, 0.066, 0.070, 2.6),
    H(1.715, -0.010, 0.060, 0.078, 0.080, 2.5), H(1.745, 0.000, 0.068, 0.089, 0.092), H(1.775, 0.005, 0.073, 0.094, 0.098),
    H(1.805, 0.008, 0.076, 0.097, 0.102), H(1.835, 0.010, 0.077, 0.100, 0.104), H(1.865, 0.012, 0.074, 0.094, 0.102),
    H(1.888, 0.014, 0.062, 0.078, 0.088), H(1.902, 0.016, 0.040, 0.050, 0.058, 2.0), H(1.909, 0.016, 0.014, 0.018, 0.020, 2.0),
]
face = (
    [((0, -0.09, 1.824), (0.058, 0.03, 0.009), 0.007)]                # brow ridge
    + both((0.032, -0.085, 1.803), (0.018, 0.03, 0.010), -0.011)      # eye sockets
    + both((0.054, -0.065, 1.768), (0.020, 0.03, 0.018), 0.004)       # cheekbones
    + [((0, -0.088, 1.688), (0.022, 0.03, 0.014), 0.006)]             # chin
    + both((0.058, -0.02, 1.712), (0.016, 0.04, 0.018), 0.004)        # jaw corners
)
tube("Head", dense(skull, 0.010), SKIN, "head", segments=30, subsurf=0, sculpt=face, level=True)
tube("Nose", [((0, F * 0.084, 1.812), 0.009, 0.008), ((0, F * 0.094, 1.786), 0.010, 0.010), ((0, F * 0.103, 1.762), 0.014, 0.013),
              ((0, F * 0.094, 1.750), 0.013, 0.008)], SKIN, "head", segments=8)
for side, tag in ((1, "L"), (-1, "R")):
    sphere("Nostril." + tag, 0.0085, SKIN, "head", (side * 0.013, F * 0.090, 1.755), subsurf=0)
    sphere("EyeWhite." + tag, 0.0125, EYE, "head", (side * 0.032, F * 0.0725, 1.802), scale=(1.20, 0.8, 0.60), subsurf=0)
    sphere("Iris." + tag, 0.0060, IRIS, "head", (side * 0.032, F * 0.0805, 1.802), scale=(1.0, 0.4, 1.0), subsurf=0)
    sphere("Pupil." + tag, 0.0028, DARK, "head", (side * 0.032, F * 0.0822, 1.802), scale=(1.0, 0.4, 1.0), subsurf=0)
    box("Lash." + tag, 0.032, 0.010, 0.0035, DARK, "head", (side * 0.032, F * 0.0775, 1.8085), subsurf=0, bevel=0.0015, axis=(side * 0.05, 0, 1))
    # Level, low brows: calm and sure of himself.
    box("Eyebrow." + tag, 0.038, 0.012, 0.006, HAIR, "head", (side * 0.034, F * 0.0835, 1.8200), subsurf=0, bevel=0.003, axis=(side * -0.05, 0, 1))
    sphere("Ear." + tag, 0.027, SKIN, "head", (side * 0.078, 0.022, 1.790), scale=(0.34, 0.66, 1.12))
box("LipUpper", 0.040, 0.012, 0.0050, LIP, "head", (0, F * 0.0825, 1.7270), subsurf=0, bevel=0.0025)
box("LipLower", 0.032, 0.012, 0.0065, LIP, "head", (0, F * 0.0830, 1.7205), subsurf=0, bevel=0.003)
# Hair: short, swept back from a clean hairline, fuller on top.
hair = [
    H(1.706, 0.066, 0.050, 0.014, 0.046), H(1.740, 0.058, 0.074, 0.030, 0.050), H(1.775, 0.044, 0.082, 0.046, 0.068),
    H(1.810, 0.020, 0.084, 0.050, 0.098), H(1.845, 0.014, 0.084, 0.070, 0.110), H(1.878, 0.010, 0.082, 0.100, 0.110),
    H(1.900, 0.010, 0.074, 0.094, 0.100), H(1.920, 0.012, 0.050, 0.064, 0.070, 2.0), H(1.930, 0.012, 0.016, 0.022, 0.024, 2.0),
]
tube("Hair", dense(hair, 0.012), HAIR, "head", segments=30, subsurf=0,
     sculpt=[((0.014, -0.080, 1.905), (0.05, 0.04, 0.03), 0.020), ((-0.03, 0.0, 1.925), (0.05, 0.08, 0.02), 0.008), ((0.06, -0.06, 1.87), (0.02, 0.04, 0.03), -0.008)], level=True)
for side in (1, -1):
    box("Sideburn%d" % side, 0.008, 0.020, 0.036, HAIR, "head", (side * 0.0745, F * 0.012, 1.792), subsurf=0, bevel=0.003)

# ---------------- arms: one continuous sleeve each, so the elbow bends smoothly ----------------
ARM_ANGLE = math.radians(13)
for side, tag in ((1, "L"), (-1, "R")):
    down = Vector((side * math.sin(ARM_ANGLE), 0, -math.cos(ARM_ANGLE)))
    out = Vector((side * math.cos(ARM_ANGLE), 0, math.sin(ARM_ANGLE)))
    fwd = Vector((0, F, 0))
    shoulder = Vector((side * 0.226, 0.004, 1.528))
    elbow = shoulder + down * 0.300
    wrist = elbow + down * 0.268
    pivots['upper_arm.' + tag] = tuple(shoulder); pivots['forearm.' + tag] = tuple(elbow); pivots['hand.' + tag] = tuple(wrist)
    at = lambda d: shoulder + down * d
    arm = "arm." + tag
    sphere("Deltoid." + tag, 0.072, SUIT, arm, shoulder + out * 0.002 + Vector((0, 0, -0.030)), scale=(0.92, 1.04, 1.34))
    sleeve = [(at(-0.020), 0.056, 0.058, 0.058), (at(0.050), 0.064, 0.066, 0.066), (at(0.120), 0.062, 0.071, 0.066), (at(0.180), 0.059, 0.069, 0.064),
              (at(0.250), 0.049, 0.053, 0.054), (at(0.300), 0.045, 0.047, 0.050), (at(0.345), 0.053, 0.055, 0.052), (at(0.420), 0.049, 0.050, 0.047),
              (at(0.500), 0.037, 0.039, 0.038), (at(0.572), 0.027, 0.034, 0.034)]
    tube("Sleeve." + tag, sleeve, SUIT, arm, segments=14)
    tube("Glove." + tag, grow(sleeve[7:], 0.005), ACCENT, arm, segments=14)
    hand = "hand." + tag
    # A loosely closed hand: palm, four curled fingers and a thumb.
    box("Palm." + tag, 0.036, 0.098, 0.108, ACCENT, hand, at(0.622) - out * 0.002, axis=-down, bevel=0.012)
    def curl(angle):
        return down * math.cos(angle) - out * math.sin(angle)
    for i, (offset, length) in enumerate(((-0.036, 0.95), (-0.012, 1.05), (0.012, 1.0), (0.035, 0.84))):
        p0 = at(0.674) + Vector((0, offset, 0))  # index finger at the front
        p1 = p0 + curl(math.radians(35)) * 0.046 * length
        p2 = p1 + curl(math.radians(95)) * 0.027 * length
        p3 = p2 + curl(math.radians(150)) * 0.022 * length
        tube("Finger%d.%s" % (i, tag), [(p0, 0.0125, 0.0125), (p1, 0.0118, 0.0118), (p2, 0.0108, 0.0108), (p3, 0.0092, 0.0092)], ACCENT, hand, segments=6, subsurf=0)
    t0 = at(0.600) + fwd * 0.040
    t1 = t0 + (down * 0.75 + fwd * 0.45 - out * 0.3).normalized() * 0.040
    t2 = t1 + (down * 0.85 - out * 0.5).normalized() * 0.032
    tube("Thumb." + tag, [(t0, 0.014, 0.014), (t1, 0.012, 0.012), (t2, 0.0095, 0.0095)], ACCENT, hand, segments=6, subsurf=0)

# ---------------- legs: one continuous leg each ----------------
for side, tag in ((1, "L"), (-1, "R")):
    hip = Vector((side * 0.092, 0.004, 0.955))
    knee = Vector((side * 0.098, F * 0.012, 0.525))
    ankle = Vector((side * 0.100, 0.015, 0.095))
    pivots['thigh.' + tag] = tuple(hip); pivots['shin.' + tag] = tuple(knee); pivots['foot.' + tag] = tuple(ankle)
    def along(t):  # 0..1 down the thigh, 1..2 down the shin
        return hip.lerp(knee, t) if t <= 1 else knee.lerp(ankle, t - 1)
    leg = "leg." + tag
    rings = [(along(-0.06), 0.070, 0.078, 0.082), (along(0.08), 0.088, 0.097, 0.101), (along(0.30), 0.092, 0.104, 0.096), (along(0.55), 0.082, 0.096, 0.086),
             (along(0.80), 0.064, 0.072, 0.066), (along(1.00), 0.056, 0.062, 0.058), (along(1.12), 0.056, 0.056, 0.066), (along(1.30), 0.060, 0.054, 0.078),
             (along(1.55), 0.048, 0.046, 0.058), (along(1.80), 0.038, 0.040, 0.044), (along(2.02), 0.037, 0.041, 0.043)]
    tube("Leg." + tag, rings, SUIT, leg, segments=16,
         sculpt=[((side * 0.098, -0.07, 0.535), (0.035, 0.04, 0.040), 0.007)])  # kneecap
    tube("Boot." + tag, grow(rings[6:], 0.006), ACCENT, leg, segments=16)
    foot = "foot." + tag
    # Lofted heel to toe; a ring here is (centre, half width, extent up, extent down).
    def sole(dy, w, up, dn=0.028):
        return ((ankle.x, ankle.y + dy, 0.030), w, up, dn, 3.0)
    tube("Foot." + tag, [sole(0.066, 0.026, 0.040, 0.022), sole(0.054, 0.039, 0.080), sole(0.010, 0.045, 0.094), sole(-0.045, 0.045, 0.064),
                         sole(-0.100, 0.047, 0.042), sole(-0.150, 0.046, 0.031), sole(-0.185, 0.040, 0.025), sole(-0.204, 0.025, 0.016, 0.020)],
         ACCENT, foot, segments=14)

# The body itself is one skin: these parts are fused into a single surface on
# export, so there is no seam at the neck, shoulders, hips, wrists or ankles.
FUSED = ("Body", "Neck", "Head", "Nose", "Nostril", "Ear", "Deltoid", "Sleeve", "Glove", "Leg", "Boot", "Foot")
for ob, bone in parts:
    ob["skin"] = bone
    ob["fuse"] = ob.name[len(PREFIX):].split(".")[0] in FUSED
scene["pivots"] = json.dumps(pivots)

# ---------------- stage: camera, lights, backdrop colour ----------------
def look_at(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()

cam_data = bpy.data.cameras.new(PREFIX + "Cam"); cam_data.lens = 70
cam = bpy.data.objects.new(PREFIX + "Cam", cam_data); scene.collection.objects.link(cam)
scene.camera = cam
for name, loc, energy in (("Key", (-2.5, -3.5, 3.5), 420), ("Fill", (3, -2.5, 1.5), 90), ("Rim", (0.5, 3.5, 3), 380)):
    ld = bpy.data.lights.new(PREFIX + name, "AREA"); ld.energy = energy; ld.size = 3
    lo = bpy.data.objects.new(PREFIX + name, ld); scene.collection.objects.link(lo)
    lo.location = loc; look_at(lo, (0, 0, 1.0))
world = bpy.data.worlds.get(PREFIX + "World") or bpy.data.worlds.new(PREFIX + "World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.22, 0.27, 0.36, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
scene.world = world
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 700; scene.render.resolution_y = 900
scene.render.image_settings.file_format = "PNG"

tris = 0
deps = bpy.context.evaluated_depsgraph_get()
print("parts", len(parts))
