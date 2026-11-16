"""Storyboard -> voice lines. Applies the brand pronunciation list, synthesises
each line, trims silence, normalises loudness, and writes a durations manifest."""
import asyncio, json, os, re, ssl, subprocess, sys, tempfile
import aiohttp, edge_tts

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sb = json.load(open(sys.argv[1]))
out_dir = os.path.join(root, "public", "vo", sb["id"])
os.makedirs(out_dir, exist_ok=True)
ca = os.path.expanduser("~/.ccr/ca-bundle.crt")
ctx = ssl.create_default_context(cafile=ca if os.path.exists(ca) else None)

def spoken(text):
    for k in sorted(sb["brand"]["pronunciation"], key=len, reverse=True):
        text = re.sub(re.escape(k), sb["brand"]["pronunciation"][k], text, flags=re.I)
    return text

async def synth(text, path):
    c = edge_tts.Communicate(text, sb["voice"], proxy=os.environ.get("HTTPS_PROXY"),
                             connector=aiohttp.TCPConnector(ssl=ctx))
    await c.save(path)

lines = [(b["id"], b.get("vo", b.get("caption"))) for b in sb["beats"]]
lines.append(("endCard", sb["endCard"].get("vo")))
durations = {}
for bid, text in lines:
    if not text:
        continue
    raw = tempfile.mktemp(suffix=".mp3")
    asyncio.run(synth(spoken(text), raw))
    wav = os.path.join(out_dir, bid + ".wav")
    trim = "silenceremove=start_periods=1:start_threshold=-50dB,areverse," * 2
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af",
                    trim + "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", wav], check=True)
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav],
                       capture_output=True, text=True, check=True).stdout.strip()
    durations[bid] = float(d)
    print(bid, d, "|", spoken(text))
json.dump(durations, open(os.path.join(root, "src", "generated", sb["id"] + ".durations.json"), "w"), indent=2)
