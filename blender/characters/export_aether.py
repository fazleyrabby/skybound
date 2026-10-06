import bpy, bmesh, json
from mathutils import Vector, Matrix

scene = bpy.data.scenes["SKYBOUND_Aether"]
layer = scene.view_layers[0]
win = bpy.context.window
previous = win.scene
win.scene = scene  # modifiers only evaluate for the scene the window shows
layer.update()
deps = layer.depsgraph
deps.update()
pivots = {k: Vector(v) for k, v in json.loads(scene["pivots"]).items()}
PARENT = {"head": "torso", "upper_arm.L": "torso", "upper_arm.R": "torso", "thigh.L": "torso", "thigh.R": "torso",
          "forearm.L": "upper_arm.L", "forearm.R": "upper_arm.R", "hand.L": "forearm.L", "hand.R": "forearm.R",
          "shin.L": "thigh.L", "shin.R": "thigh.R", "foot.L": "shin.L", "foot.R": "shin.R"}
MATS = [bpy.data.materials["AE_" + n] for n in ("Suit", "Armor", "Glow", "Dark")]

# rebuild the export collection from scratch (only AE_ datablocks)
old = bpy.data.collections.get("AE_Export")
if old:
    for ob in list(old.objects): bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(old)
exp = bpy.data.collections.new("AE_Export"); scene.collection.children.link(exp)
hero = next(c for c in scene.collection.children if c.name.startswith("AE_Hero"))
for me in list(bpy.data.meshes):
    if me.name.startswith("AE_J_") and me.users == 0:
        bpy.data.meshes.remove(me)

root = bpy.data.objects.new("AE_Aether", None); exp.objects.link(root)
joints = {}
tris = 0
for bone, pivot in pivots.items():
    bm = bmesh.new()
    for ob in hero.objects:
        if ob.type != "MESH" or ob.get("bone") != bone: continue
        ev = ob.evaluated_get(deps)
        me = bpy.data.meshes.new_from_object(ev)
        me.transform(Matrix.Translation(-pivot) @ ob.matrix_world)
        slot = MATS.index(ob.data.materials[0])
        start = len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[start:]:
            f.material_index = slot; f.smooth = True
        bpy.data.meshes.remove(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("AE_J_" + bone)
    bm.to_mesh(mesh); tris += len(bm.faces); bm.free()
    for m in MATS: mesh.materials.append(m)
    ob = bpy.data.objects.new(bone, mesh); exp.objects.link(ob)
    joints[bone] = ob
for bone, ob in joints.items():
    parent = PARENT.get(bone)
    ob.parent = joints[parent] if parent else root
    ob.location = pivots[bone] - (pivots[parent] if parent else Vector((0, 0, 0)))
print("joints", len(joints), "triangles", tris)

try:
    with bpy.context.temp_override(window=win, scene=scene, view_layer=layer):
        bpy.ops.export_scene.gltf(filepath="/Users/rabbi/Desktop/Projects/SKYBOUND/public/assets/characters/aether.glb", export_format="GLB",
                                  collection="AE_Export", export_apply=True, export_yup=True, export_animations=False,
                                  export_cameras=False, export_lights=False)
finally:
    win.scene = previous
# keep the source alongside the project, without touching the user's open file
bpy.data.libraries.write("/Users/rabbi/Desktop/Projects/SKYBOUND/blender/characters/aether.blend", {scene}, fake_user=True)
print("exported")
