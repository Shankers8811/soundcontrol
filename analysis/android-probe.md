# Android dump probe (v2)

Run: 35106426150

```
### runner network check
drive.google.com -> 302
drive.usercontent.google.com -> 404

### gdown version
gdown 6.3.0 at /opt/hostedtoolcache/Python/3.12.14/x64/lib/python3.12/site-packages

### folder page: extract file ids
folder html bytes: 334509
ids found: 10
1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L
6PSdkFYUx0suK1NZr2K0SmPPgaGe
ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra
AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8
EbMHvv4He0suK1NZr2K0RPEdyDqb
RQsiRZmWr0suK1NZr2K0W7ervatJ
Wk947wVTF0suK1NZr2K0SExP43hN
gU249iFkc0suK1NZr2K0PDkPf28y
hAi6ytsWq0suK1NZr2K0RuQ6URqY
sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC

### attempt 1: gdown --folder
gdown --folder exit: 2
usage: gdown [-h] [-V] [-O OUTPUT] [-q] [--proxy PROXY] [--speed SPEED]
             [--cookies FILE] [--cookies-from-browser BROWSER] [--no-cookies]
             [--no-check-certificate] [--continue] [--retries N] [--folder]
             [--json] [--format FORMAT] [--user-agent USER_AGENT]
             [--timeout SECONDS]
             url_or_id
gdown: error: unrecognized arguments: --remaining-ok
files after attempt 1:

### attempt 2: per-file id
--- id 1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L

but Gdown can't. Please check connections and permissions.
--- id 6PSdkFYUx0suK1NZr2K0SmPPgaGe
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=6PSdkFYUx0suK1NZr2K0SmPPgaGe

but Gdown can't. Please check connections and permissions.
--- id ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra

but Gdown can't. Please check connections and permissions.
--- id AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8

but Gdown can't. Please check connections and permissions.
--- id EbMHvv4He0suK1NZr2K0RPEdyDqb
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=EbMHvv4He0suK1NZr2K0RPEdyDqb

but Gdown can't. Please check connections and permissions.
--- id RQsiRZmWr0suK1NZr2K0W7ervatJ
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=RQsiRZmWr0suK1NZr2K0W7ervatJ

but Gdown can't. Please check connections and permissions.
--- id Wk947wVTF0suK1NZr2K0SExP43hN
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=Wk947wVTF0suK1NZr2K0SExP43hN

but Gdown can't. Please check connections and permissions.
--- id gU249iFkc0suK1NZr2K0PDkPf28y
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=gU249iFkc0suK1NZr2K0PDkPf28y

but Gdown can't. Please check connections and permissions.
--- id hAi6ytsWq0suK1NZr2K0RuQ6URqY
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=hAi6ytsWq0suK1NZr2K0RuQ6URqY

but Gdown can't. Please check connections and permissions.
--- id sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC
exit: 1

You may still be able to access the file from the browser:

	https://drive.google.com/uc?id=sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC

but Gdown can't. Please check connections and permissions.
files after attempt 2:

### attempt 3: raw usercontent endpoint
id=1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L http=500 size=0
id=6PSdkFYUx0suK1NZr2K0SmPPgaGe http=404 size=1652
id=ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra http=404 size=1652
id=AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8 http=404 size=1652
id=EbMHvv4He0suK1NZr2K0RPEdyDqb http=404 size=1652
id=RQsiRZmWr0suK1NZr2K0W7ervatJ http=404 size=1652
id=Wk947wVTF0suK1NZr2K0SExP43hN http=404 size=1652
id=gU249iFkc0suK1NZr2K0PDkPf28y http=404 size=1652
id=hAi6ytsWq0suK1NZr2K0RuQ6URqY http=404 size=1652
id=sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC http=404 size=1652
files after attempt 3:
      1652  /tmp/dump3/AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8.bin
      1652  /tmp/dump3/gU249iFkc0suK1NZr2K0PDkPf28y.bin
      1652  /tmp/dump3/Wk947wVTF0suK1NZr2K0SExP43hN.bin
         0  /tmp/dump3/1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L.bin
      1652  /tmp/dump3/6PSdkFYUx0suK1NZr2K0SmPPgaGe.bin
      1652  /tmp/dump3/sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC.bin
      1652  /tmp/dump3/RQsiRZmWr0suK1NZr2K0W7ervatJ.bin
      1652  /tmp/dump3/EbMHvv4He0suK1NZr2K0RPEdyDqb.bin
      1652  /tmp/dump3/hAi6ytsWq0suK1NZr2K0RuQ6URqY.bin
      1652  /tmp/dump3/ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra.bin

### final combined listing
         0  /tmp/dump3/1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L.bin
      1652  /tmp/dump3/6PSdkFYUx0suK1NZr2K0SmPPgaGe.bin
      1652  /tmp/dump3/ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra.bin
      1652  /tmp/dump3/AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8.bin
      1652  /tmp/dump3/EbMHvv4He0suK1NZr2K0RPEdyDqb.bin
      1652  /tmp/dump3/RQsiRZmWr0suK1NZr2K0W7ervatJ.bin
      1652  /tmp/dump3/Wk947wVTF0suK1NZr2K0SExP43hN.bin
      1652  /tmp/dump3/gU249iFkc0suK1NZr2K0PDkPf28y.bin
      1652  /tmp/dump3/hAi6ytsWq0suK1NZr2K0RuQ6URqY.bin
      1652  /tmp/dump3/sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC.bin

### archive inspection
=== /tmp/dump3/1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L.bin (0 bytes)
/tmp/dump3/1wdOXUZhINDk2UH-o8LA6-RisQRHjjv7L.bin: empty
  zip: not a standalone archive
=== /tmp/dump3/6PSdkFYUx0suK1NZr2K0SmPPgaGe.bin (1652 bytes)
/tmp/dump3/6PSdkFYUx0suK1NZr2K0SmPPgaGe.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra.bin (1652 bytes)
/tmp/dump3/ADFN-ctE59eT-rSy-2pEp4Pse8gorgLqrJFWhEBJ7qcBtzK1Snf_motB5IqUXBBy8taHegFRqTra.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8.bin (1652 bytes)
/tmp/dump3/AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/EbMHvv4He0suK1NZr2K0RPEdyDqb.bin (1652 bytes)
/tmp/dump3/EbMHvv4He0suK1NZr2K0RPEdyDqb.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/RQsiRZmWr0suK1NZr2K0W7ervatJ.bin (1652 bytes)
/tmp/dump3/RQsiRZmWr0suK1NZr2K0W7ervatJ.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/Wk947wVTF0suK1NZr2K0SExP43hN.bin (1652 bytes)
/tmp/dump3/Wk947wVTF0suK1NZr2K0SExP43hN.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/gU249iFkc0suK1NZr2K0PDkPf28y.bin (1652 bytes)
/tmp/dump3/gU249iFkc0suK1NZr2K0PDkPf28y.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/hAi6ytsWq0suK1NZr2K0RuQ6URqY.bin (1652 bytes)
/tmp/dump3/hAi6ytsWq0suK1NZr2K0RuQ6URqY.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
=== /tmp/dump3/sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC.bin (1652 bytes)
/tmp/dump3/sUy6oSGdZ0suK1NZr2K0YHRkZ8ZC.bin: HTML document, Unicode text, UTF-8 text, with very long lines (1648), with no line terminators
  zip: not a standalone archive
00000000: 3c68 746d 6c20 6c61 6e67 3d22 656e 2220  <html lang="en" 
00000010: 6469 723d 6c74 723e 3c6d 6574 6120 6368  dir=ltr><meta ch
00000020: 6172 7365 743d 7574 662d 383e 3c6d 6574  arset=utf-8><met
00000030: 6120 6e61 6d65 3d76 6965 7770 6f72 7420  a name=viewport 
00000040: 636f 6e74 656e 743d 2269 6e69 7469 616c  content="initial
```
