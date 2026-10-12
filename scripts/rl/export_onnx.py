#!/usr/bin/env python3
"""Convertit un dossier de poids au format JS-export (weights.bin + shapes.json,
celui que charge bot_net.cjs) en model.onnx écrit DANS ce dossier — consommé
par bot_net_ort.cjs (ONNX Runtime). Politique seulement (logits), pas de tête
valeur. Marche sur n'importe quel checkpoint du pool PPO ou un export BC.

  python3 scripts/rl/export_onnx.py <weightsDir>

Entrée  "obs"    f32 [N, obsDim]  (N dynamique)
Sortie  "logits" f32 [N, actionDim]
"""
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


class SpatialPolicy(nn.Module):
    """SpatialNet de train_bc2.py, politique seule — mêmes noms de modules que
    shapes.json["layers"] pour charger weights.bin directement."""

    def __init__(self, shapes):
        super().__init__()
        p = shapes["planes"]
        self.n_planes, self.h, self.w = p["n"], p["h"], p["w"]
        self.cells = self.h * self.w
        self.plane_dim = self.n_planes * self.cells
        self.slots = shapes["spellSlots"]
        ch = shapes["ch"]
        by_name = {l["name"]: l["shape"] for l in shapes["layers"]}
        gdim = by_name["g2"][0]
        rest = shapes["obsDim"] - self.plane_dim
        assert by_name["g1"][1] == rest, f"g1 in {by_name['g1'][1]} != rest {rest}"
        self.conv1 = nn.Conv2d(self.n_planes, ch, 3, padding=1)
        self.conv2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.conv3 = nn.Conv2d(ch, ch, 3, padding=1)
        self.g1 = nn.Linear(rest, by_name["g1"][0])
        self.g2 = nn.Linear(by_name["g1"][0], gdim)
        self.fuse = nn.Conv2d(ch + gdim, by_name["fuse"][0], 1)
        self.move_head = nn.Conv2d(by_name["fuse"][0], 1, 1)
        self.cast_head = nn.Conv2d(by_name["fuse"][0], self.slots, 1)
        self.pass_head = nn.Linear(gdim + ch, 1)
        self.act = nn.GELU()

    def forward(self, x):
        b = x.shape[0]
        planes = x[:, : self.plane_dim].reshape(b, self.n_planes, self.h, self.w)
        rest = x[:, self.plane_dim:]
        t = self.act(self.conv1(planes))
        t = self.act(self.conv2(t))
        t = self.act(self.conv3(t))
        g = self.act(self.g2(self.act(self.g1(rest))))
        gmap = g.unsqueeze(-1).unsqueeze(-1).expand(-1, -1, self.h, self.w)
        f = self.act(self.fuse(torch.cat([t, gmap], dim=1)))
        move = self.move_head(f).reshape(b, self.cells)
        cast = self.cast_head(f).reshape(b, self.slots * self.cells)
        pooled = t.mean(dim=(2, 3))
        pas = self.pass_head(torch.cat([g, pooled], dim=1))
        return torch.cat([pas, move, cast], dim=1)


def load_js_export(model, model_dir, shapes):
    """Inverse de export_js (train_ppo.py): weights.bin → state_dict."""
    raw = np.fromfile(Path(model_dir) / "weights.bin", dtype=np.float32)
    off = 0
    sd = model.state_dict()
    for spec in shapes["layers"]:
        shape = spec["shape"]
        size = int(np.prod(shape))
        sd[f"{spec['name']}.weight"] = torch.from_numpy(raw[off:off + size].reshape(shape).copy())
        off += size
        sd[f"{spec['name']}.bias"] = torch.from_numpy(raw[off:off + shape[0]].copy())
        off += shape[0]
    assert off == raw.size, f"weights.bin inattendu: lu {off} floats, fichier {raw.size}"
    model.load_state_dict(sd)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    model_dir = Path(sys.argv[1])
    shapes = json.loads((model_dir / "shapes.json").read_text())
    assert shapes["arch"] == "spatial-v2", f"arch non supportée: {shapes['arch']}"

    torch.manual_seed(0)
    model = SpatialPolicy(shapes)
    load_js_export(model, model_dir, shapes)
    model.eval()

    out_path = model_dir / "model.onnx"
    dummy = torch.zeros(2, shapes["obsDim"], dtype=torch.float32)
    with torch.no_grad():
        ref = model(dummy)
    assert list(ref.shape) == [2, shapes["actionDim"]], f"sortie {list(ref.shape)}"

    kwargs = dict(
        input_names=["obs"], output_names=["logits"],
        dynamic_axes={"obs": {0: "N"}, "logits": {0: "N"}},
        opset_version=18,
    )
    try:  # exporteur TorchScript (si encore présent dans cette version de torch)
        torch.onnx.export(model, (dummy,), str(out_path), dynamo=False, **kwargs)
    except Exception as e:
        print(f"export dynamo=False indisponible ({type(e).__name__}), bascule sur dynamo=True", file=sys.stderr)
        prog = torch.onnx.export(model, (dummy,), dynamo=True, **kwargs)
        prog.save(str(out_path))

    import onnx
    m = onnx.load(str(out_path))
    onnx.checker.check_model(m)
    opset = next(o.version for o in m.opset_import if o.domain in ("", "ai.onnx"))
    assert opset >= 17, f"opset {opset} < 17"
    ins = [(i.name, [d.dim_param or d.dim_value for d in i.type.tensor_type.shape.dim]) for i in m.graph.input]
    outs = [(o.name, [d.dim_param or d.dim_value for d in o.type.tensor_type.shape.dim])
            for o in m.graph.output]
    print(json.dumps({"onnx": str(out_path), "opset": opset, "inputs": ins, "outputs": outs,
                      "sizeBytes": out_path.stat().st_size}))


if __name__ == "__main__":
    main()
