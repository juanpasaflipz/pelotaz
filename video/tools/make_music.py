import numpy as np, wave, sys
sr=44100; dur=19.5; n=int(sr*dur); t=np.arange(n)/sr
bpm=84; beat=60/bpm
def note(f): return 440*2**((f-69)/12)
# Fmaj7, Em7, Dm7, Cmaj7 (two beats... one bar each)
chords=[[53,57,60,64],[52,55,59,62],[50,53,57,60],[48,52,55,59]]
out=np.zeros(n)
bar=4*beat
for i in range(int(dur/bar)+1):
    ch=chords[i%4]; s=i*bar
    for k,m in enumerate(ch):
        for rep in (0,2.5*beat):
            st=int((s+rep)*sr); L=int(min(2.2*beat, dur-(s+rep))*sr)
            if L<=0 or st>=n: continue
            tt=np.arange(L)/sr; f=note(m)
            env=np.exp(-tt*1.6)*(1-np.exp(-tt*60))
            trem=1+0.15*np.sin(2*np.pi*4.5*tt)
            sig=(np.sin(2*np.pi*f*tt)+0.3*np.sin(2*np.pi*2*f*tt)+0.08*np.sin(2*np.pi*3*f*tt))*env*trem*0.09
            out[st:st+L]+=sig[:n-st]
    # bass
    st=int(s*sr); L=int(min(bar,dur-s)*sr)
    if L>0:
        tt=np.arange(L)/sr; f=note(ch[0]-12)
        out[st:st+L]+=np.sin(2*np.pi*f*tt)*np.exp(-tt*1.2)*0.22
# drums: kick on 1 and 3 (+ lazy "and of 3"), snare-ish on 2,4, hats 8ths
rng=np.random.default_rng(1)
nb=int(dur/beat)+1
for b in range(nb):
    s=b*beat
    def add(sig,at):
        st=int(at*sr)
        if st<n: out[st:st+len(sig)]+=sig[:n-st]
    if b%4 in (0,2):
        tt=np.arange(int(0.3*sr))/sr; f=50+60*np.exp(-tt*30)
        add(np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tt*9)*0.55,s)
    if b%4==2: 
        tt=np.arange(int(0.3*sr))/sr; f=50+60*np.exp(-tt*30)
        add(np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tt*9)*0.35,s+0.5*beat)
    if b%4 in (1,3):
        tt=np.arange(int(0.2*sr))/sr
        add(rng.normal(0,1,len(tt))*np.exp(-tt*22)*0.12+np.sin(2*np.pi*190*tt)*np.exp(-tt*25)*0.12,s)
    for h in (0,0.5):
        tt=np.arange(int(0.05*sr))/sr
        hn=rng.normal(0,1,len(tt)); hn=np.diff(np.concatenate([[0],hn]))
        add(hn*np.exp(-tt*80)*0.035,s+h*beat+ (0.03*beat if h else 0))
# vinyl crackle
out+=rng.normal(0,0.004,n)
cr=rng.random(n)<0.0004; out[cr]+=rng.normal(0,0.15,cr.sum())
# low-pass-ish smoothing
k=np.ones(4)/4; out=np.convolve(out,k,mode='same')
# fades
fi=int(0.5*sr); fo=int(1.5*sr)
out[:fi]*=np.linspace(0,1,fi); out[-fo:]*=np.linspace(1,0,fo)
out/=np.max(np.abs(out))*1.05
def save(p,x):
    x=(np.clip(x,-1,1)*32767).astype(np.int16)
    w=wave.open(p,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(x.tobytes()); w.close()
save(sys.argv[1]+'/music.wav',out)
# boing: pitch-bending sine with wobble
L=int(0.55*sr); tt=np.arange(L)/sr
f=180+260*np.exp(-tt*6)*(1+0.25*np.sin(2*np.pi*14*tt))
b=np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tt*5)*(1-np.exp(-tt*300))
save(sys.argv[1]+'/boing.wav',b*0.8)
