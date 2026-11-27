"""Weld and union collision solids on the same authored model-space frame."""

import json
import sys
from pathlib import Path

import bmesh
import bpy


def create_solid(name, source, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(source["points"], [], [face["corners"] for face in source["faces"]])
    if mesh.validate():
        raise ValueError(f"{name} contains invalid geometry")

    for material in materials:
        mesh.materials.append(material)
    for polygon, face in zip(mesh.polygons, source["faces"], strict=True):
        polygon.material_index = face["material"]

    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=0.0001)
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    if any(not edge.is_manifold for edge in topology.edges):
        raise ValueError(f"{name} is not closed")
    topology.to_mesh(mesh)
    topology.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def combine_collision(source, destination):
    doc = json.loads(source.read_text(encoding="utf-8"))
    materials = [bpy.data.materials.new(name) for name in doc["materials"]]
    stock = create_solid("Stock hull", doc["stock"], materials)
    blade = create_solid("Blade collision", doc["blade"], materials)

    bpy.context.view_layer.objects.active = stock
    stock.select_set(True)
    modifier = stock.modifiers.new(name="Hull and blade", type="BOOLEAN")
    modifier.operation = "UNION"
    modifier.solver = "EXACT"
    modifier.object = blade
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    topology = bmesh.new()
    topology.from_mesh(stock.data)
    # Model space is in centimeters. Tool rejects the tiny edges that the
    # Boolean solver can create along the intersection of otherwise valid hulls.
    bmesh.ops.dissolve_degenerate(topology, dist=0.12, edges=list(topology.edges))
    bmesh.ops.remove_doubles(topology, verts=list(topology.verts), dist=0.12)
    if any(not edge.is_manifold for edge in topology.edges):
        raise ValueError("The composed collider is not closed")
    # The blade grid contains planar strips and the union can leave pieces of
    # those strips at the mount. Remove their internal edges before selecting
    # diagonals for Tool. The bent box-plow strips produce small Boolean
    # variations. Merge those within 0.25 degrees, keeping material boundaries.
    bmesh.ops.dissolve_limit(
        topology, angle_limit=0.00436 if doc.get("mergeNearlyPlanar") is True else 0.00001,
        verts=list(topology.verts),
        edges=list(topology.edges), delimit={'MATERIAL'},
    )
    bmesh.ops.triangulate(topology, faces=list(topology.faces))
    topology.to_mesh(stock.data)
    topology.free()

    result = {
        "points": [list(vertex.co) for vertex in stock.data.vertices],
        "faces": [
            {"corners": list(polygon.vertices), "material": polygon.material_index}
            for polygon in stock.data.polygons
        ],
    }
    destination.write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    input_path, output_path = map(Path, sys.argv[sys.argv.index("--") + 1 :])
    combine_collision(input_path, output_path)
