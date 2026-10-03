"""Generates the metadata test images for the AI Content Detector evaluation.
Requires Pillow. Run from this folder: python3 make_fixtures.py, then node make-c2pa.mjs."""
from PIL import Image, PngImagePlugin
import json, os

os.makedirs("images", exist_ok=True)

def scene(w=480, h=320, seed=0):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = ((x * 3 + seed) % 256, (y * 2 + seed * 3) % 256, ((x + y) + seed * 7) % 256)
    return img

# Base image for C2PA signing (no metadata).
scene(seed=1).save("images/base.jpg", quality=88)
# Plain PNG with no metadata at all.
scene(seed=2).save("images/plain-no-metadata.png")

# Stable Diffusion (AUTOMATIC1111) PNG with generation parameters.
info = PngImagePlugin.PngInfo()
info.add_text("parameters", "portrait of a market woman in Monrovia, golden hour, 85mm photo\nNegative prompt: blurry, lowres\nSteps: 30, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1234567, Size: 480x320, Model hash: 31e35c80fc, Model: sd_xl_base_1.0")
scene(seed=3).save("images/sd-a1111-parameters.png", pnginfo=info)

# ComfyUI PNG with prompt/workflow JSON.
info = PngImagePlugin.PngInfo()
info.add_text("prompt", json.dumps({"3": {"class_type": "KSampler", "inputs": {"seed": 5, "steps": 20, "cfg": 8}}}))
info.add_text("workflow", json.dumps({"nodes": [{"id": 3, "type": "KSampler"}]}))
scene(seed=4).save("images/comfyui-workflow.png", pnginfo=info)

XMP = """<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"
 Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/{dst}" xmp:CreatorTool="{tool}"/>
</rdf:RDF></x:xmpmeta>"""
scene(seed=5).save("images/xmp-trained-algorithmic.jpg", quality=88, xmp=XMP.format(dst="trainedAlgorithmicMedia", tool="Example Image Service").encode())
scene(seed=6).save("images/xmp-composite-ai.jpg", quality=88, xmp=XMP.format(dst="compositeWithTrainedAlgorithmicMedia", tool="Example Photo Editor").encode())

def exif(tags):
    e = Image.Exif()
    for k, v in tags.items():
        e[k] = v
    return e

# EXIF Software names an AI tool.
scene(seed=7).save("images/exif-software-midjourney.jpg", quality=88, exif=exif({0x0131: "Midjourney"}))

# Camera photo: Make/Model plus capture settings and GPS (no AI metadata).
img = scene(seed=8)
e = Image.Exif()
e[0x010F] = "Canon"; e[0x0110] = "Canon EOS 250D"; e[0x0131] = "Firmware 1.0.0"
ifd = e.get_ifd(0x8769)
ifd[0x9003] = "2019:06:14 10:21:33"; ifd[0x829A] = (1, 250); ifd[0x829D] = (56, 10); ifd[0x8827] = 200
gps = e.get_ifd(0x8825)
gps[1] = "N"; gps[2] = (6.0, 18.0, 0.0); gps[3] = "W"; gps[4] = (10.0, 48.0, 0.0)
img.save("images/camera-exif-gps.jpg", quality=90, exif=e)

# Ambiguous word in a description must NOT be read as an AI tool (false-positive guard).
scene(seed=9).save("images/description-firefly-insect.jpg", quality=88, exif=exif({0x010E: "A firefly glowing at dusk near the runway"}))

# WebP with no metadata.
scene(seed=10).save("images/plain.webp", quality=85)
print("done")
