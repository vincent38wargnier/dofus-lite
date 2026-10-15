#!/usr/bin/env python3
"""Exporte un clone politique (train_policy.py, arch policy-spatial-v1 ou policy-v1)
en model.onnx DANS son dossier, depuis policy.pt — consommé par policy_net.cjs
quand CLONE_ORT=1 (ONNX Runtime, ~ms par position au lieu de dizaines de ms).

  python3 scripts/rl/export_policy_onnx.py MODEL_DIR

Entrée  "obs"    f32 [N, obsDim]  (N dynamique)
Sortie  "logits" f32 [N, actionDim]
"""
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).parent))
import train_policy as tp  # noqa: E402

d = Path(sys.argv[1])
shapes = json.loads((d / "shapes.json").read_text())
tp.ACTION_DIM = shapes["actionDim"]
tp.REST = shapes["obsDim"] - tp.PLANE
spatial = shapes["arch"] == "policy-spatial-v1"
net = tp.SpatialPolicyNet(tp.ACTION_DIM) if spatial else tp.PolicyNet(tp.ACTION_DIM)
net.load_state_dict(torch.load(d / "policy.pt", map_location="cpu")["model"])
net.eval()
x = torch.zeros(1, shapes["obsDim"])
torch.onnx.export(net, x, str(d / "model.onnx"), input_names=["obs"], output_names=["logits"],
                  dynamic_axes={"obs": {0: "n"}, "logits": {0: "n"}}, opset_version=17, dynamo=False)
print(json.dumps({"exported": str(d / "model.onnx"), "arch": shapes["arch"], "bytes": (d / "model.onnx").stat().st_size}))
