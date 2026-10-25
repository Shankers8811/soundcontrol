#!/usr/bin/env python3
import sys
sys.path.insert(0, r'C:\Users\shank\soundcontrol')
from src.protocol.devices import DEVICES

ids = [d['id'] for d in DEVICES]
print('Total devices:', len(DEVICES))
print('Device IDs:', ids)

for d in DEVICES:
    if d['id'] in ('life-p2-mini', 'a30i'):
        print(f'Found: {d["id"]} - {d["name"]} (SKU: {d["sku"]})')