import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
src,dst=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGB'); S=3
im=im.resize((im.width*S,im.height*S),Image.LANCZOS)
m=Image.new('L',im.size,255)          # 255=keep
tmp=im.copy()
for p in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]:
    ImageDraw.floodfill(tmp,p,(255,0,255),thresh=34)
bgm=Image.eval(Image.merge('RGB',tmp.split()).convert('RGB').split()[1],lambda g:255 if g==0 else 0)  # magenta has G=0
# pixels that were flooded -> background
mask=ImageChops.invert(bgm)
mask=mask.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2.2))   # erode white fringe, soften edge
im=im.convert('RGBA'); im.putalpha(mask)
bb=im.getbbox(); im=im.crop(bb)
k=360/max(im.size); im=im.resize((round(im.width*k),round(im.height*k)),Image.LANCZOS)
im.save(dst); print(im.size)
