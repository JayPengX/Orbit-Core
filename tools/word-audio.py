# Recordings for Quadra Rewards' words in Microsoft's neural voice (the one
# the level 4-6 clips use: en-US-JennyNeural), for every word that has none.
#   pip install edge-tts
#   python3 tools/word-audio.py ../Quadra-Rewards/public/data [voice]
# In the Claude Code container, edge-tts (aiohttp + certifi) needs the proxy's
# CA: append /root/.ccr/ca-bundle.crt to certifi.where()'s file first.
import asyncio, json, os, sys
import edge_tts

data = sys.argv[1]
voice = sys.argv[2] if len(sys.argv) > 2 else 'en-US-JennyNeural'
words = [r[0] for r in json.load(open(os.path.join(data, 'words.json')))]
out = os.path.join(data, 'audio')
todo = [w for w in words if not os.path.exists(os.path.join(out, f'{w}.mp3')) and '/' not in w]
print(len(todo), 'to record')

async def one(sem, w):
    async with sem:
        for attempt in range(3):
            try:
                path = os.path.join(out, f'{w}.mp3')
                await edge_tts.Communicate(w, voice).save(path + '.part')
                if os.path.getsize(path + '.part') > 1000:
                    os.replace(path + '.part', path)
                    return
            except Exception as e:
                await asyncio.sleep(1 + attempt * 2)
        print('failed', w)

async def main():
    sem = asyncio.Semaphore(8)
    await asyncio.gather(*(one(sem, w) for w in todo))

asyncio.run(main())
