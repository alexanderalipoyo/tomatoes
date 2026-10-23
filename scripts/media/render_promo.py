"""Render the Tomatoes product promo. Requires Pillow, NumPy and imageio-ffmpeg.
Run from the repository root with the bundled Python runtime.
"""
from pathlib import Path
import sys, math, json, subprocess, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.video-tools'))
import imageio_ffmpeg
W,H,FPS,DURATION = 1280,720,30,28
OUT=ROOT/'docs'/'media'
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
FONT=Path('C:/Windows/Fonts')
fonts={}
def font(size,bold=False):
    key=(size,bold)
    if key not in fonts: fonts[key]=ImageFont.truetype(str(FONT/('segoeuib.ttf' if bold else 'segoeui.ttf')),size)
    return fonts[key]
CREAM='#FFF8ED'; MUTED='#9CB3B4'; GREEN='#73B895'; RED='#EF6554'; DARK='#14262C'; INK='#273B42'
logo=Image.open(OUT/'tomatoes-mark.png').convert('RGBA')
raw=json.loads((ROOT/'examples'/'reports'/'results.json').read_text(encoding='utf-8-sig'))
stats=raw['stats']; total=stats['tests']; passed=stats['passes']; failed=stats['failures']; pending=stats['pending']; skipped=stats['skipped']
ranked=[]
for spec in raw['results']:
    tests=[]
    def visit(s):
        tests.extend(t for t in s.get('tests',[]) if not t.get('isHook'))
        for c in s.get('suites',[]): visit(c)
    visit(spec)
    failures=sum(t.get('state')=='failed' or t.get('fail',False) for t in tests)
    ranked.append((failures,spec.get('file','').replace('\\','/').split('/')[-1]))
ranked.sort(key=lambda item:(-item[0],item[1]))

def ease(v):
    v=max(0,min(1,v));return 1-(1-v)**3

def text(im,xy,value,size=24,color=CREAM,bold=False,anchor=None):
    ImageDraw.Draw(im).text(xy,value,font=font(size,bold),fill=color,anchor=anchor,spacing=5)

def tracked(im,x,y,value,size=12,color=GREEN,spacing=3):
    for c in value:
        text(im,(x,y),c,size,color,True);x+=ImageDraw.Draw(im).textlength(c,font=font(size,True))+spacing

def box(im,rect,fill,rad=18,outline=None,width=1):
    ImageDraw.Draw(im).rounded_rectangle(tuple(map(int,rect)),radius=rad,fill=fill,outline=outline,width=width)

def mark(im,x,y,size,alpha=1):
    asset=logo.resize((int(size),int(size)),Image.Resampling.LANCZOS)
    if alpha<1:asset.putalpha(asset.getchannel('A').point(lambda n:int(n*alpha)))
    im.alpha_composite(asset,(int(x),int(y)))

def check(im,x,y,color=GREEN,size=20):
    d=ImageDraw.Draw(im);d.line([(x,y+size*.5),(x+size*.35,y+size*.85),(x+size,y)],fill=color,width=max(2,int(size*.15)),joint='curve')

def pill(im,x,y,label,fill='#213A3E',color=GREEN,size=15):
    tw=ImageDraw.Draw(im).textlength(label,font=font(size,True))
    box(im,(x,y,x+tw+28,y+36),fill,18);text(im,(x+14,y+7),label,size,color,True)

# Static mesh background keeps motion focused on the content.
yy,xx=np.mgrid[0:H,0:W]
glow=np.exp(-((xx-1000)**2/(650**2)+(yy-300)**2/(600**2)))
coral=np.exp(-((xx-180)**2/(400**2)+(yy-700)**2/(300**2)))
base=np.zeros((H,W,3),dtype=np.float32)+np.array([15,30,36])
base+=glow[...,None]*np.array([9,24,21])+coral[...,None]*np.array([17,4,1])
bg=Image.fromarray(np.clip(base,0,255).astype('uint8')).convert('RGBA')

def background(t,scene):
    im=bg.copy();d=ImageDraw.Draw(im)
    for i in range(30):
        x=(i*173+25)%1280; y=(i*113+int(t*3))%720
        d.ellipse((x,y,x+2,y+2),fill='#2C4347')
    mark(im,54,35,38);text(im,(100,39),'tomatoes',25,CREAM,True)
    tracked(im,935,47,'TEST REPORTING',11,MUTED,2)
    d.line((58,95,1222,95),fill='#2B4146',width=1)
    tracked(im,60,677,'CLARITY IN EVERY RUN',10,MUTED,2)
    for i in range(6):
        x=1092+i*22
        box(im,(x,678,x+(15 if i==scene else 7),685),RED if i==scene else '#415659',3)
    return im

def reveal(layer,t):
    a=ease(t/.65)
    if a>=1:return layer
    layer.putalpha(layer.getchannel('A').point(lambda n:int(n*a)))
    shifted=Image.new('RGBA',(W,H));shifted.alpha_composite(layer,(0,int((1-a)*22)))
    return shifted

def dashboard(im,x,y,w,h,p=1,mini=False):
    # A motion-design interpretation of the actual report dashboard.
    box(im,(x,y,x+w,y+h),'#F6F9F9',18)
    d=ImageDraw.Draw(im)
    if mini:
        box(im,(x+12,y+14,x+w-12,y+40),'#E8EEED',7)
        for i,color in enumerate(['#73B895','#EF6554','#DFBA6A']):box(im,(x+14+i*(w-35)/3,y+55,x+14+i*(w-35)/3+(w-50)/3,y+95),color,6)
        box(im,(x+14,y+110,x+w-14,y+h-18),'#FFFFFF',9)
        for i in range(3):
            d.line((x+26,y+130+i*24,x+w-28,y+130+i*24),fill='#DCE7E4',width=3)
        return
    text(im,(x+26,y+18),'Latest run',19,INK,True);pill(im,x+w-170,y+15,'Sample report','#E9EEED','#71858B',12)
    labels=[('TESTS',total),('PASSED',passed),('FAILED',failed),('PENDING',pending),('SKIPPED',skipped)]
    for i,(label,value) in enumerate(labels):
        cx=x+22+i*(w-44)/5;cw=(w-64)/5
        box(im,(cx,y+66,cx+cw,y+175),'#FFFFFF',10,outline='#E0E8E6')
        tracked(im,cx+16,y+81,label,10,'#7C8F94',1)
        text(im,(cx+16,y+106),f'{round(value*p):,}',33,RED if label=='FAILED' else '#248464' if label=='PASSED' else INK,True)
    text(im,(x+27,y+198),'Test outcomes',15,INK,True)
    tx=x+28;ty=y+239;tw=w-56
    for val,color in [(passed,'#57AD8B'),(failed,'#DC8190'),(pending,'#DFBA6A'),(skipped,'#96A7B7')]:
        seg=tw*val/total*p
        if seg>0:box(im,(tx,ty,tx+seg,ty+22),color,3)
        tx+=seg
    text(im,(x+28,y+280),f'{passed/total*100:.1f}% passed',22,'#248464',True)
    text(im,(x+w-290,y+286),'Every outcome. One view.',15,'#7C8F94')


def scene_frame(index,local,t):
    im=background(t,index);layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
    p=ease(local/1.4)
    if index==0:
        tracked(layer,66,155,'MEET TOMATOES',13)
        text(layer,(60,202),'Big test runs.',66,CREAM,True)
        text(layer,(60,278),'Clearer answers.',66,CREAM,True)
        text(layer,(65,392),'Your Cypress reports,',24,MUTED)
        text(layer,(65,427),'with the clarity they deserve.',24,MUTED)
        pill(layer,65,508,'IMPORT  /  EXPLORE  /  UNDERSTAND',size=13)
        cx,cy=980,340
        for radius in [155,205]:
            d.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),outline='#385357',width=1)
        bob=math.sin(local*1.7)*9
        mark(layer,cx-120,cy-120+bob,240)
        for i,label in enumerate(['JSON','TESTS','INSIGHTS']):
            angle=local*.23+i*2.1
            px=cx+math.cos(angle)*205;py=cy+math.sin(angle)*170
            pill(layer,px-40,py-18,label,'#263F43',CREAM,12)
    elif index==1:
        tracked(layer,66,166,'FROM CYPRESS TO CLARITY',12)
        text(layer,(60,215),'One report.',62,CREAM,True)
        text(layer,(60,288),'A whole picture.',62,CREAM,True)
        text(layer,(65,392),'Cloud or local test runs.',23,MUTED)
        text(layer,(65,431),'Import your Mochawesome JSON.',23,MUTED)
        pill(layer,65,510,'VALIDATED BEFORE DISPLAY',size=13)
        x,y,w,h=728,172,470,405
        box(layer,(x,y,x+w,y+h),'#F7F9F8',20)
        tracked(layer,x+28,y+25,'IMPORT REPORT',12,'#71858B',2)
        box(layer,(x+154,y+82,x+316,y+222),'#EAF1EC',16)
        text(layer,(x+235,y+95),'{ }',50,'#2A8866',True,'ma')
        text(layer,(x+235,y+160),'index.json',18,INK,True,'ma')
        progress=min(1,local/2.4)
        box(layer,(x+34,y+276,x+w-34,y+284),'#E4ECE8',4)
        if progress:box(layer,(x+34,y+276,x+34+(w-68)*progress,y+284),'#399C77',4)
        stages=['Reading JSON','Checking report format','Aggregating results','Report ready']
        label=stages[min(3,int(local/0.8))]
        text(layer,(x+34,y+309),label,18,INK,True)
        if local>2.4:check(layer,x+w-70,y+314,'#2A8866',22)
        text(layer,(x+34,y+347),'Your results stay in your browser.',14,'#7B8C90')
    elif index==2:
        tracked(layer,66,142,'YOUR LATEST RUN, AT A GLANCE',12)
        text(layer,(60,181),'Every result has a place.',52,CREAM,True)
        dashboard(layer,62,276,1156,350,p)
        if local>2.6:
            pulse=int(110+60*math.sin(local*4))
            highlight=Image.new('RGBA',(W,H));hd=ImageDraw.Draw(highlight)
            cx=62+22+2*(1156-44)/5;cw=(1156-64)/5
            hd.rounded_rectangle((cx-4,338,cx+cw+4,455),radius=14,outline=(239,101,84,pulse),width=3)
            layer.alpha_composite(highlight)
    elif index==3:
        tracked(layer,66,168,'MAKE THE NEXT STEP OBVIOUS',12)
        text(layer,(60,219),'Find the story',59,CREAM,True)
        text(layer,(60,290),'behind a failure.',59,CREAM,True)
        text(layer,(65,398),'Spot hotspots. Inspect errors.',22,MUTED)
        text(layer,(65,436),'Compare your saved runs.',22,MUTED)
        pill(layer,65,515,'LESS SEARCHING. MORE UNDERSTANDING.',size=12)
        x,y,w,h=690,171,506,424
        box(layer,(x,y,x+w,y+h),'#F7F9F8',18)
        text(layer,(x+28,y+24),'Failure hotspots',23,INK,True)
        text(layer,(x+28,y+65),'Specs ranked by failed tests',15,'#7D8E92')
        for i,(count,name) in enumerate(ranked[:3]):
            ry=y+119+i*83
            text(layer,(x+29,ry),name,17,INK,True)
            text(layer,(x+w-28,ry),f'{round(count*p)} failed',16,'#BA5662',True,'ra')
            box(layer,(x+29,ry+35,x+w-29,ry+42),'#F3E9EC',4)
            width=(w-58)*count/max(1,ranked[0][0])*ease((local-.25*i)/1.6)
            if width:box(layer,(x+29,ry+35,x+29+width,ry+42),'#D5808E',4)
        text(layer,(x+29,y+373),'Insights grounded in your report.',16,'#71858B')
    elif index==4:
        tracked(layer,66,163,'TAKE CLARITY WITH YOU',12)
        text(layer,(60,217),'Built for',65,CREAM,True)
        text(layer,(60,294),'every screen.',65,CREAM,True)
        text(layer,(65,402),'Desktop. Tablet. Mobile.',24,MUTED)
        text(layer,(65,446),'The same run. A better view.',22,MUTED)
        pill(layer,65,523,'HISTORY  /  ANALYTICS  /  TEST DETAILS',size=12)
        bob=math.sin(local*1.4)*5
        x,y=661,206+bob
        box(layer,(x,y,x+490,y+330),'#344B50',24,outline='#52696D',width=2)
        dashboard(layer,x+16,y+16,458,296,mini=True)
        x,y=1041,332-bob
        box(layer,(x,y,x+154,y+281),'#14272E',25,outline='#647F80',width=2)
        dashboard(layer,x+9,y+12,136,256,mini=True)
        box(layer,(x+48,y+13,x+105,y+24),'#14272E',6)
    elif index==5:
        mark(layer,590,123,100)
        text(layer,(640,247),'tomatoes',65,CREAM,True,'ma')
        text(layer,(640,337),'Your next run. A clearer picture.',35,CREAM,True,'ma')
        text(layer,(640,402),'Cloud test reports generated by Cypress.',21,MUTED,False,'ma')
        d.line((460,472,820,472),fill='#486063',width=1)
        text(layer,(640,512),'Created by Alex Ali',32,CREAM,True,'ma')
        tracked(layer,497,576,'TEST REPORTING, REIMAGINED',11,GREEN,2)
    im.alpha_composite(reveal(layer,local))
    return im.convert('RGB')

BOUNDS=[0,4,8,14,20,24,28]
def frame(t):
    index=next((i for i in range(6) if BOUNDS[i]<=t<BOUNDS[i+1]),5)
    local=t-BOUNDS[index]
    im=scene_frame(index,local,t)
    # Brief dissolves keep the sequence continuous while preserving reading time.
    if index>0 and local<.30:
        old=scene_frame(index-1,BOUNDS[index]-BOUNDS[index-1]-.01,t)
        im=Image.blend(old,im,ease(local/.30))
    if t<.25:im=Image.blend(Image.new('RGB',(W,H),'#0F1E24'),im,ease(t/.25))
    if t>DURATION-.6:im=Image.blend(im,Image.new('RGB',(W,H),'#0F1E24'),((t-(DURATION-.6))/.6)*.2)
    return im

def soundtrack(path):
    rate=48000;length=DURATION*rate
    music=np.zeros(length,dtype=np.float64)
    def note(start,freq,dur,gain):
        offset=int(start*rate);n=min(int(dur*rate),length-offset)
        if n<=0:return
        time=np.arange(n)/rate
        envelope=(1-np.exp(-time*26))*np.exp(-time/1.1)
        sound=np.sin(2*np.pi*freq*time)+.17*np.sin(4*np.pi*freq*time)+.06*np.sin(6*np.pi*freq*time)
        music[offset:offset+n]+=sound*envelope*gain
    chords=[[146.83,220,261.63,329.63],[130.81,196,246.94,293.66],[110,164.81,220,261.63],[98,146.83,196,246.94]]
    for beat in range(DURATION*2):
        start=beat*.5;chord=chords[(beat//8)%4]
        note(start,chord[[0,2,1,3,2,1,3,2][beat%8]]*2,2,.055)
        if beat%4==0:
            note(start,chord[0]/2,2,.08)
        if beat%2==0:
            n=int(.2*rate);time=np.arange(n)/rate;offset=int(start*rate)
            music[offset:offset+n]+=.018*np.sin(2*np.pi*(55*time+4*(1-np.exp(-time*18))))*np.exp(-time*20)
    time=np.arange(length)/rate
    music*=np.minimum(time/.8,1)*np.minimum((DURATION-time)/1.2,1)
    right=music*.92+np.concatenate([np.zeros(int(rate*.12)),music[:-int(rate*.12)]])*.08
    audio=np.stack([music,right],axis=1)
    audio=(np.clip(audio,-.9,.9)*32767).astype('<i2')
    with wave.open(str(path),'wb') as wav:wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(audio.tobytes())

if __name__=='__main__':
    OUT.mkdir(exist_ok=True)
    poster=frame(10.8);poster.save(OUT/'tomatoes-promo-poster.png')
    samples=[2.5,6.7,11,17,22.5,26]
    sheet=Image.new('RGB',(960,810),'#0F1E24')
    for i,t in enumerate(samples):sheet.paste(frame(t).resize((480,270),Image.Resampling.LANCZOS),((i%2)*480,(i//2)*270))
    sheet.save(OUT/'tomatoes-promo-storyboard.png')
    if '--preview' in sys.argv:
        print('Preview generated',flush=True);sys.exit(0)
    with tempfile.TemporaryDirectory(dir=ROOT/'.video-tools') as temporary:
        temporary=Path(temporary);silent=temporary/'silent.mp4';audio=temporary/'soundtrack.wav'
        command=[FFMPEG,'-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(silent)]
        encoder=subprocess.Popen(command,stdin=subprocess.PIPE)
        try:
            for i in range(DURATION*FPS):
                encoder.stdin.write(frame(i/FPS).tobytes())
                if i%(FPS*2)==0:print(f'Rendering {i/(DURATION*FPS)*100:.0f}%',flush=True)
            encoder.stdin.close()
            if encoder.wait()!=0:raise RuntimeError('Video encoding failed')
        except BaseException:
            encoder.kill();encoder.wait();raise
        soundtrack(audio)
        subprocess.run([FFMPEG,'-y','-loglevel','error','-i',str(silent),'-i',str(audio),'-c:v','copy','-c:a','aac','-b:a','160k','-t',str(DURATION),'-movflags','+faststart',str(OUT/'tomatoes-promo.mp4')],check=True)
    print(f'Created {OUT / "tomatoes-promo.mp4"}',flush=True)
