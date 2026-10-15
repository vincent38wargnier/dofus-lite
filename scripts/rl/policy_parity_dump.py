#!/usr/bin/env python3
# Dump des logits COMPLETS (n × actionDim) du clone torch sur parity_obs.bin →
# parity_full.f32, pour la parité JS sur les 5251 actions (policy_net.cjs parity).
#   python3 scripts/rl/policy_parity_dump.py MODEL_DIR
import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent))
import train_policy as tp  # noqa: E402

d = Path(sys.argv[1])
shapes = json.loads((d / "shapes.json").read_text())
tp.ACTION_DIM = shapes["actionDim"]
tp.REST = shapes["obsDim"] - tp.PLANE
ck = torch.load(d / "policy.pt", map_location="cpu")
net = tp.SpatialPolicyNet(tp.ACTION_DIM) if shapes["arch"] == "policy-spatial-v1" else tp.PolicyNet(tp.ACTION_DIM)
net.load_state_dict(ck["model"])
net.eval()
obs = np.fromfile(d / "parity_obs.bin", dtype=np.float32).reshape(-1, shapes["obsDim"])
with torch.no_grad():
    logits = net(torch.from_numpy(obs)).numpy().astype(np.float32)
logits.tofile(d / "parity_full.f32")
print(json.dumps({"arch": shapes["arch"], "n": int(obs.shape[0]), "argmax": logits.argmax(1).tolist()}))
