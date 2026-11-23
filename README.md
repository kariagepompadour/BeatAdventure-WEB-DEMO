# BeatAdventure

A music-synced adventure demo for the M5Stack Cardputer ADV (240 x 135). A companion to KeySpeaker WEB DEMO: it reuses the same idea
(the sound's level and beats drive the screen, an autopilot plays) with an adventure-run look: a jungle runner, vine swings, river
swims, balloon flights, pirate ships.

**Live demo / ブラウザで遊ぶ: https://kariagepompadour.github.io/BeatAdventure-WEB-DEMO/**

[日本語](#日本語)

## Status

Web prototype only (`web/`). Run it with any static server, e.g. `cd web && python3 -m http.server 8765`, then open
`http://127.0.0.1:8765/`. Press **Test song**, **MIC START** or **START** (tab audio). The page shares KeySpeaker WEB DEMO's device frame, controls and English/Japanese switch.

The page includes a titled adventure poster and a bilingual instruction card (poster 1024 x 1536, card 832 x 2000, the same proportions as KeySpeaker WEB DEMO).
Layout: at **1280 px and wider** the poster is on the left, the game in the centre and the instruction card on the right, all visible at once (the centre column narrows to 700 px at 1280 px so the side images stay readable); from 1200 to 1279 px only the poster sits beside the game and the card moves below it; on phones the poster is above the game and the card below. The four SVGs in `web/assets/` can also be opened at full size.
**Stop screen** freezes the current frame and game time; press **Resume screen** to continue. **Disconnect audio** only releases the audio source.
At the landslide, the first climbing grips stay in the original side view, then the camera cuts behind the hero for the long ascent.

- Beats are detected from the low band; obstacles are placed on a beat and reach the hero a whole number of beats later,
  so the jump lands on the beat.
- Scenes so far: **disembark** (the opening: climb the liner's left ladder, walk across the bridge roof, descend the right ladder, and cross a gangway over the deep blue sea to the beach), jungle run, river swim, **wall** (a landslide blocks the forest path; he stops at its vertical face, climbs more than a screen height until the forest floor falls out of view, shields his head from three diving condors, and continues to the vine ravine), **cave** (a field with a ceiling: the torch light grows with the music, a drip falls on every beat, stalactites drop and he jumps them, a low roof makes him duck; the roof rises with louder sound and each ceiling column scrolls left), the treasury, underground waterway, water jet, sky fall, pyramid exterior, and camp. The stage buttons open each scene directly.
- The signature of the studio, built as in KeySpeaker (6 px wide blocks, 3 px tall, a column every step): **mountains of blocks** that follow the volume (a new column every 267 ms, each as tall as the loudness against the recent average, and they scroll away without springing back), an **equalizer of blocks** standing on the river (30 bars, bass left, treble right, each with a hanging peak mark), Forest2 climbs and descends before the ravine while the later Forest has level ground for the mask pedestal and hidden shaft (in graphic-equalizer colours: green, yellow, orange, red; a second hazier range sits behind), and the equalizer throws a few drops off its tips on every beat. The cave floor and roof are blocks.
- **Crocodiles** are drawn from straight above, like a map (long body, splayed paddling legs, a swishing tail); when the mouth opens the head turns to a side view so the gape reads. A **wide pond** (two crocodiles) is crossed on a **vine** that hangs from the canopy: he jumps up to it, swings across and lets go on the far side.
- **Two kinds of land run:** the journey opens aboard the white passenger liner, where the hero climbs the left ladder to the bridge roof, walks across it, descends the right ladder, and follows the gangway to shore; white-to-aqua sound blocks move over deep blue water, with gulls flying behind the ship. The same liner departs across the horizon as the hero runs along the **beach**, slowly shrinking until it disappears. A monkey on a beach palm throws a coconut; when the ship disappears at the horizon, the hero enters sloped Forest2 without beach palms or monkeys. A landslide blocks the Forest2 path; he runs to the irregular rubble wall, climbs over it, then reaches a blue-sky ravine where he crosses in about fifteen seconds on three widely swaying vines, then boards a small boat on a brook, rides it over a waterfall, splashes into the basin, and swims into the river, where crocodiles, piranhas and swimming snakes share the water. He returns to level Forest, where the golden mask pedestal and the shaft sit flush with the ground before the tunnel. The forest trunks reach the screen top; fixed-height leaf columns scroll in front of them with three-pixel graphic-EQ bands from deep green to lime, each height chosen before it enters the screen. On the beach, sea turtles and driftwood replace forest ponds, crocodiles, bears and tigers. Later visits alternate between open country and the dense dark forest.
- **Journey and treasure:** the illustrated expedition map is temporarily hidden while its route is revised. Now and then an Aztec altar with a **golden feathered mask** stands in the jungle road: he stops, freezes, reaches for it and lifts it overhead while the music celebrates; no score counter is shown. Once the mask is taken, three **Aztec temple guardians** (feathered headdresses, round shields, spears) chase him for about ten seconds, leaping what he has cleared, gaining in loud parts, and giving up at last.
- **The underground journey:** in the forest a **golden mask** rests on a movable Aztec pedestal. He takes the mask, notices the loose stone, **pushes the pedestal aside**, and only then reveals the hidden shaft: he falls in, and lands in the old **brick tunnel** (CAVE). There he wanders: runs the brighter tunnel beneath a brown rock roof and above a flame-colored equalizer (drips, rocks, stalactites, low roofs, bats; sloping floors; scorpions, cobras, arrow traps, a **huge boulder** he hides from in a niche, and in the deep level the guardians come, but he leaps into a **mine cart** on rails and races away from them, faster in loud music), drops down a **hole** to a deeper tunnel, climbs a **ladder** and pulls himself over the lip, and at last comes to a **golden doorway**: he walks into the light and arrives in **the Treasury** (CAVERN, below). From the Treasury he can miss a jump and splash directly into the **stone-lined waterway** below, swim crawl past a small water snake, then ride a bursting water source up through the building and disappear above the screen. He falls back through the sky and lands on the outer wall of a pyramid, runs downhill past three bouncing rocks, then continues to the next stage. No map screen for these moves. (The brick tunnel also still has a way out by a long ladder up a shaft of daylight, seen from the side or from behind, used when a run is cut short.)
- **The Pitfall II cavern:** the brick tunnel leads to a black **cavern** with orange ledges and a **waterway** below, joined by **ladders** through holes in the top ledge: he jumps the gaps (a short jump at the bottom floor can miss and drop him into the waterway), climbs up, runs, and at last walks off into the waterway. The walls carry **murals** (an Aztec sun stone, a feathered warrior, colorful KariPomu, Robo and Nazousa portraits adapted from the supplied artwork, an Egyptian eye with hieroglyphs; the sun and the eye glow on the beat). On the next ledge a **golden mask** rests on a pedestal; collecting it reveals five rows of colorful equalizer bars across the cavern backdrop. The cavern is the **guardians' home and a treasure store**: a crowd of temple guardians live on the ledges, with braziers, clay jars, woven mats, hanging banners, stacked crates and chests full of gold; **piles of gold bars** lie on the ledges and are picked up on the run. Three guardians chase and jab with spears until a **rope** hangs over a wide gap: he grabs it and swings across, leaving them behind. It has its own cast (guardians and bats); the scorpions, cobras, arrow traps and the boulder belong to the brick tunnel. The water below is a short **underground waterway** beneath the treasury floor. A water snake swims locally, the green plant-like equalizer sways, and a powerful water source at the far end launches him upward through the building. The treasury keeps its dark walls without the outdoor sunset tint.
- Critters: a **monkey** climbs a beach palm and throws coconuts ahead of him (they land and he jumps them), and a **bat** zigzags overhead in the jungle and the cave.
- Jumping, he holds his hat with one hand; a wide pond (two crocodiles) needs a long jump of twice the distance, with a diver's flailing pose.
- Quiet music darkens the jungle and nothing comes (suspense); loud parts brighten it and bring more obstacles.
- Camp begins only after more than a minute of music-free slow travel. The explorer sleeps beneath streams of digits, Latin letters and half-width katakana until sound returns, then wakes and resumes the same scene and position; DAY +1. Music does not send him to camp on a schedule. With no sound, he keeps walking slowly until that threshold. Normal courses take around 90 seconds, and even slow passages finish within about three minutes. The **Dusk** and **Exhaust** buttons preview those visual states.
- Keys: Space / Up jump or swim up, Down swim down; the hero otherwise plays by itself.

## Tests

`node test/beat.test.js` feeds synthetic onset signals (steady kicks, off-beat hats, missing kicks, noise, a 10 fps hidden tab) to the beat tracker and checks the detected tempo (half or double time is accepted), the beat offset and jitter; it prints `ok`/`FAIL` per case and exits with code 1 on a failure. It needs only Node.js.

## Similar tools by the same author

- [KeySpeaker WEB DEMO](https://github.com/kariagepompadour/KeySpeaker-WEB-DEMO): the sibling series work; a sound visualizer for the Cardputer ADV.
- [Cardputer-ADV-KeySpeaker](https://github.com/kariagepompadour/Cardputer-ADV-KeySpeaker): the KeySpeaker firmware.
- [SOUND-TERRARIUM-Web](https://github.com/kariagepompadour/SOUND-TERRARIUM-Web): another sound-reactive Cardputer ADV web demo.

## License

MIT License. Copyright (c) 2026 Kariage POMPADOUR Entertainment Corporation. See `LICENSE`.

## Next

Vine swing, rolling boulder, crystals in the cave, diving, balloon and pirate-ship scenes; port to the Cardputer ADV firmware.

## 日本語

Cardputer ADV (240 x 135) 用の、音楽同期の冒険デモです。KeySpeaker WEB DEMO と同じシリーズの別作品として、「音量と拍で画面が動き、自動操縦が遊ぶ」という考え方を
使い、見た目をジャングル走り、ツル渡り、川の遊泳、気球、海賊船などの冒険活劇にします。

ポスター（1024×1536）とインストラクションカード（832×2000）は KeySpeaker WEB DEMO と同じ縦横比です。画面幅 **1280px 以上**では左にポスター、中央にゲーム、右にカードが同時に表示されます（1280px では中央列を700pxまで狭めて左右の画像を読みやすくしています）。1200〜1279px ではポスターのみ左に、カードはゲームの下に、スマートフォンではポスターが上、カードが下に並びます。

関連ツール: [KeySpeaker WEB DEMO](https://github.com/kariagepompadour/KeySpeaker-WEB-DEMO)、[Cardputer-ADV-KeySpeaker](https://github.com/kariagepompadour/Cardputer-ADV-KeySpeaker)、[SOUND-TERRARIUM-Web](https://github.com/kariagepompadour/SOUND-TERRARIUM-Web)。ライセンスは MIT（Copyright (c) 2026 Kariage POMPADOUR Entertainment Corporation）です。ビート検出のテストは `node test/beat.test.js` で実行できます。

ブラウザですぐ遊べます: https://kariagepompadour.github.io/BeatAdventure-WEB-DEMO/

現在は Web 試作(`web/`)のみです。`cd web && python3 -m http.server 8765` で起動し、`http://127.0.0.1:8765/` を開いて
**テスト曲**・**MIC START**・**START**（タブ音声）のどれかを押してください。ページ右上で日本語と英語を切り替えられます。音が止まって1分を超えるとキャンプに入り、音楽が戻ると元のシーンと位置から再開します。

The web controls include direct buttons for Disembark, Beach, Forest2, Wall, Vine ravine, Boat & falls, River, Forest, Tunnel, Treasury, Waterway, Water jet, Sky fall, Pyramid, and Camp, plus a Fullscreen button (Escape exits fullscreen).
