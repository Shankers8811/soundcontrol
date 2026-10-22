#!/usr/bin/env python3
"""WinRT RFCOMM discovery — contract tests.

Covers ``rfcomm_services()`` in ``soundcore_bridge.py``. Everything here is
faked: no Bluetooth hardware, no Windows, and no ``winrt`` package. The point
is the *contract* the desktop app can rely on —

  • discovery never raises; absence is reported as ``available: False`` + reason
  • the optional winrt import degrades instead of breaking the bridge
  • GUIDs are normalized the same way in every environment
  • an unknown/unpaired address is a reason, not an exception

Run: npm run test:bridge:winrt   (kept out of `npm test`: it needs python3,
which `test:bridge` already uses, but CI runners differ by image)
"""

import json
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import soundcore_bridge as B  # noqa: E402

passed = 0
failures = []


def check(label, condition, detail=""):
    global passed
    if condition:
        passed += 1
        print(f"  ok  {label}")
    else:
        failures.append(f"{label}{' — ' + detail if detail else ''}")
        print(f"FAIL  {label}{' — ' + detail if detail else ''}")


class _FakeService:
    def __init__(self, service_id, connection_service_name=""):
        self.service_id = service_id
        self.connection_service_name = connection_service_name


class _FakeResult:
    def __init__(self, services):
        self.services = services


class _FakeDevice:
    def __init__(self, known, services):
        self._known = known
        self._services = services

    async def get_rfcomm_services_async(self):
        return _FakeResult(self._services)

    @classmethod
    async def from_bluetooth_address_async(cls, address):
        return cls._pending

    _pending = None


class _FakeBluetooth:
    BluetoothDevice = _FakeDevice


def _install_fake_winrt(services, known=True):
    """Patch the module-level WinRT importer with a deterministic double."""
    device = _FakeDevice(known, services) if known else None
    _FakeDevice._pending = device
    B._winrt_modules = lambda: ((_FakeBluetooth, types.SimpleNamespace()), None)


def _restore():
    B._winrt_modules = _ORIGINAL_IMPORTER


_ORIGINAL_IMPORTER = B._winrt_modules
_ORIGINAL_SYS = B.sys

# ---------------------------------------------------------------- validation
print("\nvalidation")
report = B.rfcomm_services("not-a-mac")
check("invalid address is reported, not raised", report["available"] is False and report["services"] == [])
check("invalid address explains the format", "expected 12 hex digits" in (report["reason"] or ""))
check("report is JSON-serializable", json.dumps(report) is not None)

# ------------------------------------------------------- optional dependency
print("\noptional dependency")
_restore()
B.sys = types.SimpleNamespace(platform="linux")
report = B.rfcomm_services("AA:BB:CC:DD:EE:FF")
check("non-Windows host is unavailable", report["available"] is False)
check("non-Windows reason names the platform", "Windows-only" in (report["reason"] or ""), report["reason"])

B.sys = types.SimpleNamespace(platform="win32")
report = B.rfcomm_services("AA:BB:CC:DD:EE:FF")
check("missing winrt packages are unavailable", report["available"] is False)
check("missing-package reason names the install", "winrt" in (report["reason"] or ""), report["reason"])
B.sys = _ORIGINAL_SYS

# ------------------------------------------------------------ service output
print("\nservice output")
_install_fake_winrt([
    _FakeService("{0CF12D31-FAC3-4553-BD80-D6832E7B3958}", "0cf12d31-fac3-4553-bd80-d6832e7b3958"),
    _FakeService("00001101-0000-1000-8000-00805F9B34FB", ""),
])
report = B.rfcomm_services("AA:BB:CC:DD:EE:FF")
check("services are available", report["available"] is True)
check("no reason when available", report["reason"] is None)
check("both services are returned", len(report["services"]) == 2)
check("GUIDs are brace-stripped and uppercase", report["services"][0]["uuid"] == "0CF12D31-FAC3-4553-BD80-D6832E7B3958", report["services"][0]["uuid"])
check("connection service name is preserved", report["services"][0]["name"] == "0cf12d31-fac3-4553-bd80-d6832e7b3958")
check("service rows are JSON-serializable", json.dumps(report["services"]) is not None)

_install_fake_winrt([])
report = B.rfcomm_services("AA:BB:CC:DD:EE:FF")
check("empty service list is still a success", report["available"] is True and report["services"] == [])

_install_fake_winrt([], known=False)
report = B.rfcomm_services("AA:BB:CC:DD:EE:FF")
check("unknown device is unavailable", report["available"] is False)
check("unknown device suggests pairing", "pair it first" in (report["reason"] or ""), report["reason"])

# ------------------------------------------------------------------ helpers
print("\nhelpers")
check("guid text strips braces", B._guid_text("{ABC}") == "ABC")
check("guid text uppercases", B._guid_text("abc-def") == "ABC-DEF")

_restore()
rm = B.__dict__.get("_winrt_modules")
check("importer was restored for other suites", callable(rm))

print(f"\n{passed} passed, {len(failures)} failed")
if failures:
    print("\nFailures:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
