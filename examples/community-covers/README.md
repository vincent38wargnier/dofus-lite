# World cover illustrations

Fourteen landscape PNGs used by the explicitly labelled community demonstration. Each world has its own illustration. Original game packages remain optional downloads.

The final prompts and filenames are in [prompts.json](./prompts.json). Generation used the built-in `image_gen` tool. All selected originals were copied into this directory; no site dependency points to the image tool's private output directory.

Apply the covers and separate simulated activity to an already seeded local community:

```bash
npm run demo:decorate
```

They are copied into the server's persistent `DATA_DIR/covers` store and served through each world's cover endpoint. The public build does not include these themed images.
