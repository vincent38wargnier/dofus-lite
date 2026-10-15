#!/usr/bin/env python3
"""Exporte un réseau de VALEUR (train_value.py / train_afterstate.py, arch value-v1)
en model.onnx DANS son dossier, depuis value.pt — consommé par value_net.cjs
(loadValueOrt: binding ONNX Runtime synchrone, lots de N positions).

  python3 scripts/rl/export_value_onnx.py MODEL_DIR

Entrée  "obs" f32 [N, obsDim]  (N dynamique)
Sortie  "v"   f32 [N]          (tanh, ∈ [-1, 1], joueur AU TRAIT de l'obs)
"""
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
import train_value as tv  # noqa: E402

d = Path(sys.argv[1])
shapes = json.loads((d / "shapes.json").read_text())
assert shapes["arch"] == "value-v1", shapes["arch"]
tv.REST = shapes["obsDim"] - tv.PLANE
net = tv.ValueNet(ch=shapes["ch"], gdim=shapes["gdim"])
net.load_state_dict(torch.load(d / "value.pt", map_location="cpu")["model"])
net.eval()
x = torch.zeros(2, shapes["obsDim"])
torch.onnx.export(net, x, str(d / "model.onnx"), input_names=["obs"], output_names=["v"],
                  dynamic_axes={"obs": {0: "n"}, "v": {0: "n"}}, opset_version=17, dynamo=False)
print(json.dumps({"exported": str(d / "model.onnx"), "arch": shapes["arch"], "bytes": (d / "model.onnx").stat().st_size}))
