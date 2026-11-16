import sys, glob, os, json
from PIL import Image, ImageOps
src, dst = sys.argv[1], sys.argv[2]
meta = {}
for f in sorted(glob.glob(os.path.join(src, '*.jpg'))):
    im = ImageOps.exif_transpose(Image.open(f)).convert('RGBA')
    name = os.path.splitext(os.path.basename(f))[0]
    open(os.path.join(dst, name + '.rgba'), 'wb').write(im.tobytes())
    meta[name] = {'width': im.width, 'height': im.height, 'path': f}
json.dump(meta, open(os.path.join(dst, 'meta.json'), 'w'), indent=1)
print(len(meta))
