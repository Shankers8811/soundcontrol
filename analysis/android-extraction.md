# Android dump extraction

Run: 35107098978

```
### tool install
pip gdown exit: 0
gdown 6.3.0

--- jadx (optional, non-fatal)
api exit: 0
api body head: {
  "url": "https://api.github.com/repos/skylot/jadx/releases/352281002",
  "assets_url": "https://api.github.com/repos/skylot/jadx/releases/352281002/assets",
  "upload_url": "https://uploads.github.
jadx URL: 'https://github.com/skylot/jadx/releases/download/v1.5.6/jadx-1.5.6.zip'
curl exit: 0  size: 72646741
unzip exit: 0
/opt/tools/lib/jadx-1.5.6-all.jar
/opt/tools/jadx.zip
/opt/tools/bin/jadx
/opt/tools/bin/jadx.bat
/opt/tools/bin/jadx-gui.bat
/home/runner/work/_temp/b041d13f-14c7-45b9-8167-ede0e9c471c8.sh: line 23: /opt/tools/jadx/bin/jadx: No such file or directory
jadx available: no

--- androguard (fallback DEX analysis, non-fatal)
androguard 4.1.4
tools done

### download
warning: `--folder` is no longer required for folder URLs and will be removed in a future release
Retrieving folder contents
Retrieving folder contents completed
Building directory structure
Building directory structure completed
Downloading...
From (original): https://drive.google.com/uc?id=1Lg-pGZ5eKfMh5TpMRW4JmVb8Q5S0aCyv
From (redirected): https://drive.google.com/uc?id=1Lg-pGZ5eKfMh5TpMRW4JmVb8Q5S0aCyv&confirm=t&uuid=d453d0f2-e468-4826-9907-0c521b09f635
To: /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part1-of4.zip
Processing file 1Lg-pGZ5eKfMh5TpMRW4JmVb8Q5S0aCyv abacktools-Anker+soundcore_6.4.0-17_APKPure-part1-of4.zip
Processing file 1APpPo7rkgHV0yGgJimOcVPGUeYjIipiA abacktools-Anker+soundcore_6.4.0-17_APKPure-part2-of4.zip
Processing file 1aIVlsqXYbLKkv0PyDS09AY2aBbHcLjNY abacktools-Anker+soundcore_6.4.0-17_APKPure-part3-of4.zip
Processing file 1mSwBjHyoM0mqeUsvtW5w7VfAwcRAkSuy abacktools-Anker+soundcore_6.4.0-17_APKPure-part4-of4.zip
  0%|          | 0.00/82.7M [00:00<?, ?B/s]  5%|▌         | 4.19M/82.7M [00:00<00:02, 35.0MB/s] 10%|▉         | 7.86M/82.7M [00:00<00:03, 20.3MB/s] 13%|█▎        | 10.5M/82.7M [00:00<00:03, 19.8MB/s] 16%|█▌        | 13.1M/82.7M [00:00<00:03, 19.7MB/s] 18%|█▊        | 15.2M/82.7M [00:00<00:04, 15.1MB/s] 21%|██        | 17.3M/82.7M [00:00<00:04, 15.7MB/s] 23%|██▎       | 19.4M/82.7M [00:01<00:04, 13.4MB/s] 26%|██▌       | 21.5M/82.7M [00:01<00:04, 14.2MB/s] 29%|██▊       | 23.6M/82.7M [00:01<00:04, 14.7MB/s] 31%|███       | 25.7M/82.7M [00:01<00:03, 15.2MB/s] 34%|███▎      | 27.8M/82.7M [00:01<00:04, 13.1MB/s] 36%|███▌      | 29.9M/82.7M [00:01<00:03, 14.2MB/s] 38%|███▊      | 31.5M/82.7M [00:02<00:03, 13.5MB/s] 40%|███▉      | 33.0M/82.7M [00:02<00:03, 14.0MB/s] 42%|████▏     | 34.6M/82.7M [00:02<00:03, 14.3MB/s] 44%|████▎     | 36.2M/82.7M [00:02<00:03, 13.7MB/s] 46%|████▌     | 37.7M/82.7M [00:02<00:03, 14.2MB/s] 48%|████▊     | 39.3M/82.7M [00:02<00:02, 14.6MB/s] 49%|████▉     | 40.9M/82.7M [00:02<00:02, 14.0MB/s] 51%|█████▏    | 42.5M/82.7M [00:02<00:02, 14.3MB/s] 53%|█████▎    | 44.0M/82.7M [00:02<00:02, 14.2MB/s] 55%|█████▌    | 45.6M/82.7M [00:03<00:02, 12.7MB/s] 58%|█████▊    | 47.7M/82.7M [00:03<00:02, 14.4MB/s] 60%|█████▉    | 49.3M/82.7M [00:03<00:02, 13.9MB/s] 62%|██████▏   | 51.4M/82.7M [00:03<00:02, 15.5MB/s] 65%|██████▍   | 53.5M/82.7M [00:03<00:02, 12.7MB/s] 67%|██████▋   | 55.6M/82.7M [00:03<00:01, 14.2MB/s] 70%|██████▉   | 57.7M/82.7M [00:03<00:01, 12.6MB/s] 72%|███████▏  | 59.8M/82.7M [00:04<00:01, 14.2MB/s] 75%|███████▍  | 61.9M/82.7M [00:04<00:01, 15.4MB/s] 77%|███████▋  | 64.0M/82.7M [00:04<00:01, 15.2MB/s] 81%|████████  | 67.1M/82.7M [00:04<00:01, 14.7MB/s] 86%|████████▌ | 70.8M/82.7M [00:04<00:00, 19.3MB/s] 89%|████████▊ | 73.4M/82.7M [00:04<00:00, 16.7MB/s] 93%|█████████▎| 77.1M/82.7M [00:05<00:00, 14.6MB/s] 98%|█████████▊| 81.3M/82.7M [00:05<00:00, 19.0MB/s]100%|██████████| 82.7M/82.7M [00:05<00:00, 15.7MB/s]
Downloading...
From (original): https://drive.google.com/uc?id=1APpPo7rkgHV0yGgJimOcVPGUeYjIipiA
From (redirected): https://drive.google.com/uc?id=1APpPo7rkgHV0yGgJimOcVPGUeYjIipiA&confirm=t&uuid=7e688ce1-b6b5-41fa-b90e-3482ab45645b
To: /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part2-of4.zip
  0%|          | 0.00/49.2M [00:00<?, ?B/s] 11%|█         | 5.24M/49.2M [00:00<00:01, 30.9MB/s] 24%|██▍       | 12.1M/49.2M [00:00<00:00, 40.5MB/s] 33%|███▎      | 16.3M/49.2M [00:00<00:01, 19.9MB/s] 45%|████▍     | 22.0M/49.2M [00:01<00:01, 19.5MB/s] 60%|█████▉    | 29.4M/49.2M [00:01<00:00, 28.5MB/s] 68%|██████▊   | 33.6M/49.2M [00:01<00:00, 25.1MB/s] 81%|████████  | 39.8M/49.2M [00:01<00:00, 31.2MB/s] 89%|████████▉ | 44.0M/49.2M [00:01<00:00, 28.7MB/s]100%|██████████| 49.2M/49.2M [00:01<00:00, 29.1MB/s]
Downloading...
From (original): https://drive.google.com/uc?id=1aIVlsqXYbLKkv0PyDS09AY2aBbHcLjNY
From (redirected): https://drive.google.com/uc?id=1aIVlsqXYbLKkv0PyDS09AY2aBbHcLjNY&confirm=t&uuid=254c613f-d8f8-485f-8361-44723fd6ec84
To: /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part3-of4.zip
  0%|          | 0.00/61.8M [00:00<?, ?B/s]  3%|▎         | 1.57M/61.8M [00:00<00:04, 14.8MB/s]  8%|▊         | 4.72M/61.8M [00:00<00:03, 15.4MB/s] 13%|█▎        | 7.86M/61.8M [00:00<00:02, 20.7MB/s] 22%|██▏       | 13.6M/61.8M [00:00<00:02, 21.8MB/s] 26%|██▋       | 16.3M/61.8M [00:00<00:02, 22.4MB/s] 36%|███▋      | 22.5M/61.8M [00:01<00:01, 23.4MB/s] 48%|████▊     | 29.4M/61.8M [00:01<00:01, 31.0MB/s] 54%|█████▍    | 33.6M/61.8M [00:01<00:00, 28.3MB/s] 59%|█████▉    | 36.7M/61.8M [00:01<00:00, 28.1MB/s] 72%|███████▏  | 44.6M/61.8M [00:01<00:00, 32.0MB/s] 78%|███████▊  | 48.2M/61.8M [00:01<00:00, 31.3MB/s] 90%|████████▉ | 55.6M/61.8M [00:02<00:00, 29.2MB/s] 98%|█████████▊| 60.3M/61.8M [00:02<00:00, 32.0MB/s]100%|██████████| 61.8M/61.8M [00:02<00:00, 28.4MB/s]
Downloading...
From: https://drive.google.com/uc?id=1mSwBjHyoM0mqeUsvtW5w7VfAwcRAkSuy
To: /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part4-of4.zip
  0%|          | 0.00/8.10M [00:00<?, ?B/s] 52%|█████▏    | 4.19M/8.10M [00:00<00:00, 41.5MB/s]100%|██████████| 8.10M/8.10M [00:00<00:00, 64.7MB/s]
Download completed
gdown exit: 0

### downloaded listing
  82748991  /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part1-of4.zip
  49226545  /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part2-of4.zip
  61781630  /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part3-of4.zip
   8099344  /tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part4-of4.zip
total bytes: 201856510

### unpack
zip parts: 4
/tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part1-of4.zip -> standalone OK
/tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part2-of4.zip -> standalone OK
/tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part3-of4.zip -> standalone OK
/tmp/raw/Anker/abacktools-Anker+soundcore_6.4.0-17_APKPure-part4-of4.zip -> standalone OK
extracted abacktools-Anker+soundcore_6.4.0-17_APKPure-part1-of4.zip -> /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4 (exit 0)
extracted abacktools-Anker+soundcore_6.4.0-17_APKPure-part2-of4.zip -> /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part2-of4 (exit 0)
extracted abacktools-Anker+soundcore_6.4.0-17_APKPure-part3-of4.zip -> /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part3-of4 (exit 0)
extracted abacktools-Anker+soundcore_6.4.0-17_APKPure-part4-of4.zip -> /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part4-of4 (exit 0)

### nested archives
      5305  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_run_data.zip
  20315503  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/resource.zip

### dex / manifest / assets
    333852  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/classes.dex
/tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets
/tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/packages/fluttertoast/assets
/tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/packages/wakelock_web/assets
/tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/assets
asset files: 567

### package identity

### jadx decompile
jadx unavailable, skipping (strings/androguard fallback covers extraction)

### protocol extraction
--- DEX string inventory (works without decompilation)
dex strings: 2253
soundcore/anker refs: 2
8com.oceanwing.soundcore.application.SoundCoreApplication
com.oceanwing.soundcore

--- frame magic (08 EE / 09 FF) in decompiled sources
files with frame magic: 0

--- protocol-related class names

--- model SKUs referenced

--- model names referenced

--- copying protocol sources
copied: 0 files

--- asset config files
    207502  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3947_enviroment.json
     68220  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/timezone/time_zone_local.json
     37319  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_posture_left_right.json
     32886  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_posture_front_back.json
     18201  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/AssetManifest.json
     14134  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/assets/loading.json
     11417  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_spatial_audio_head_tracking.json
      9879  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/assets/aichat_voiceplay.json
      8691  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/assets/dialogue_voiceplay.json
      8655  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/rave_dj.json
      6639  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/progress_loading.json
      6590  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/com_play.json
      6590  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a6611_play.json
      6558  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a6611_playbar_play.json
      5568  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3388_datacollection_doubleclick.json
      5201  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/sport_fittest_tips.json
      5200  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/com_hearid_fittest.json
      4592  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3388_datacollection_tripleclick.json
      4351  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_spatial_audio_fixed.json
      3848  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/assets/textloading.json
      3288  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3949_control_device_r.json
      3287  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3947_control_device_r.json
      3286  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3949_control_device_l.json
      3285  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3947_control_device_l.json
      3209  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/breath1data.json
      2999  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3957_control_device_r.json
      2997  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3957_control_device_l.json
      2984  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_control_black_device_r.json
      2984  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_control_black_device_l.json
      2916  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3953_calibrate.json
      2846  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/flutter_assets/assets/hearid_tick.json
      2223  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3388_control_device_r.json
      2223  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3035_calibration.json
      2222  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3388_control_device_l.json
      1802  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3331_control_device_l.json
      1801  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3331_control_device_r.json
      1735  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/d1301_control_device_l.json
      1732  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/d1301_control_device_r.json
      1731  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3878_control_device_r.json
      1731  /tmp/x/abacktools-Ankersoundcore_6.4.0-17_APKPure-part1-of4/assets/lottie/a3874_control_device_r.json
copied assets: 25
interesting dex strings: 19
payload: 540K  files: 26
```
